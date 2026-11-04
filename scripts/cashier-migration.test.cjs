const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const contract = read('supabase/migrations/20261030160000_secure_cashier_redemption.sql');
const cutover = read('supabase/migrations/20261030170000_revoke_legacy_cashier_rpc.sql');
const cashier = read('cashier/cashier.js');
const server = read('scripts/serve-cashier.cjs');
const config = read('cashier/config.example.js');
const secureFunction = contract.split('CREATE OR REPLACE FUNCTION public.partner_redeem_code_secure')[1]?.split('ALTER FUNCTION')[0] || '';

test('cashier assignment is owner-provisioned and readable only by its Auth user', () => {
  assert.match(contract, /bakplanla_partner_cashiers[\s\S]*?REFERENCES auth\.users\(id\)/);
  assert.match(contract, /ENABLE ROW LEVEL SECURITY/);
  assert.match(contract, /FOR SELECT TO authenticated[\s\S]*?USING \(user_id = \(SELECT auth\.uid\(\)\)\)/);
  assert.match(contract, /REVOKE ALL PRIVILEGES ON TABLE public\.bakplanla_partner_cashiers FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(contract, /GRANT SELECT ON TABLE public\.bakplanla_partner_cashiers TO authenticated/);
  assert.doesNotMatch(contract, /GRANT (?:INSERT|UPDATE|DELETE|ALL)[^;]*bakplanla_partner_cashiers[^;]*TO (?:anon|authenticated)/i);
});

test('cashier RPC derives and verifies caller identity, assignment and confirmed email', () => {
  assert.match(secureFunction, /v_uid uuid := auth\.uid\(\)/);
  assert.match(secureFunction, /email_confirmed_at IS NOT NULL/);
  assert.match(secureFunction, /cashier\.user_id = v_uid/);
  assert.match(secureFunction, /cashier\.active/);
  assert.match(secureFunction, /SET search_path = ''/);
  assert.doesNotMatch(secureFunction, /p_user|p_cashier|p_uid/i);
  assert.match(contract, /GRANT EXECUTE ON FUNCTION public\.partner_redeem_code_secure\(text, text, text\) TO authenticated/);
  assert.match(contract, /REVOKE ALL ON FUNCTION public\.partner_redeem_code_secure\(text, text, text\) FROM PUBLIC, anon, authenticated, service_role/);
});

test('PIN and code limits are row-serialized per Auth identity and have bounded windows', () => {
  assert.match(contract, /PRIMARY KEY \(partner_id, cashier_id, kind\)/);
  assert.match(contract, /ENABLE ROW LEVEL SECURITY;\s*REVOKE ALL PRIVILEGES ON TABLE public\.bakplanla_partner_cashier_attempts FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(secureFunction, /kind = 'pin'[\s\S]*?FOR UPDATE/);
  assert.match(secureFunction, /failed_count >= 10/);
  assert.match(secureFunction, /failed_count >= 60/);
  assert.match(secureFunction, /interval '15 minutes'/);
  assert.match(secureFunction, /clock_timestamp\(\)/);
});

test('redemption reuses the existing code row, locks it, checks Istanbul bounds and updates once', () => {
  assert.match(secureFunction, /public\.bakplanla_partner_codes AS c[\s\S]*?FOR UPDATE/);
  assert.match(secureFunction, /v_istanbul_now := v_now AT TIME ZONE 'Europe\/Istanbul'/);
  assert.match(secureFunction, /v_now >= v_row\.expires_at/);
  assert.match(secureFunction, /v_istanbul_now::time >= v_p\.window_end/);
  assert.match(secureFunction, /WHERE c\.id = v_row\.id AND c\.redeemed_at IS NULL[\s\S]*?RETURNING c\.\*/);
  assert.match(secureFunction, /'used'/);
});

test('legacy anonymous RPC is revoked only by the ordered cutover migration', () => {
  assert.match(contract, /CREATE OR REPLACE FUNCTION public\.partner_redeem_code_secure/);
  assert.doesNotMatch(contract, /REVOKE ALL ON FUNCTION public\.partner_redeem_code\(text, text, text\)/);
  assert.match(cutover, /REVOKE ALL ON FUNCTION public\.partner_redeem_code\(text, text, text\)\s+FROM PUBLIC, anon, authenticated, service_role/);
});

test('DEV cashier uses the secure RPC and local server/config are scoped to DEV', () => {
  assert.match(cashier, /partner_cashier_businesses/);
  assert.match(cashier, /partner_redeem_code_secure/);
  assert.match(cashier, /const DEV_REF = 'tlizbrhmwaesfjmtxcgh'/);
  assert.match(cashier, /url\.hostname === `\$\{DEV_REF\}\.supabase\.co`/);
  assert.match(cashier, /claims\.role === 'anon' && claims\.ref === DEV_REF/);
  assert.match(cashier, /signInPanel\.hidden = true/);
  assert.match(server, /listen\(port, '127\.0\.0\.1'/);
  assert.match(server, /const routes = new Map/);
  assert.match(config, /https:\/\/tlizbrhmwaesfjmtxcgh\.supabase\.co/);
  assert.match(config, /publishableKey: ''/);
  assert.doesNotMatch(config, /sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}/);
});
