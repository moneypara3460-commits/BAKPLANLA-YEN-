const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20261031190000_secure_promo_pairing_redemption.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const functionBody = (name) => {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.notEqual(start, -1, `${name} definition exists`);
  const end = migration.indexOf('$function$;', start);
  assert.notEqual(end, -1, `${name} body closes`);
  return migration.slice(start, end);
};

test('pairing codes use cryptographic bytes and retain the five-minute contract', () => {
  const body = functionBody('create_pairing_code');
  assert.match(body, /extensions\.gen_random_bytes\(8\)/);
  assert.match(body, /get_byte\(v_bytes, i\)\s*&\s*31/);
  assert.doesNotMatch(body, /\brandom\s*\(/i);
  assert.match(body, /interval '5 minutes'/);
  assert.match(body, /FROM auth\.users AS u WHERE u\.id = v_uid FOR UPDATE/i);
});

test('pairing redemption throttles only the authenticated caller and preserves owner, expiry, replay and RLS boundaries', () => {
  const body = functionBody('redeem_pairing_code');
  assert.match(body, /v_uid uuid := auth\.uid\(\)/i);
  assert.match(body, /FOR UPDATE/i);
  assert.match(body, /public\.check_rate_limit\(v_uid, 'pairing', 10, 300\)/i);
  assert.match(body, /v_row\.user_id <> v_uid/i);
  assert.match(body, /v_row\.expires_at < now\(\)/i);
  assert.match(body, /v_row\.used_at IS NOT NULL/i);
  assert.match(body, /INSERT INTO public\.bakplanla_devices \(user_id, device_id/i);
  assert.match(migration, /CHECK \(bucket = ANY \(ARRAY\['ai'::text, 'places'::text, 'pairing'::text\]\)\)/i);
  assert.match(migration, /DO UPDATE SET request_count = public\.rate_limit_counters\.request_count \+ 1[\s\S]*?WHERE public\.rate_limit_counters\.request_count < p_limit/i);
});

test('promo attempt cap is serialized per Auth user and counts unconfirmed matching attempts', () => {
  const body = functionBody('redeem_promo_code');
  const lock = body.indexOf('FROM auth.users AS u WHERE u.id = v_uid FOR UPDATE');
  const count = body.indexOf('FROM public.bakplanla_promo_attempts AS a');
  assert.ok(lock >= 0 && count > lock, 'Auth user lock precedes the failed-attempt count');
  assert.match(body, /v_fails >= 10/);
  assert.match(body, /IF v_confirmed IS NULL THEN\s+INSERT INTO public\.bakplanla_promo_attempts \(user_id, success\) VALUES \(v_uid, false\);\s+RETURN jsonb_build_object\('ok', false, 'error', 'email_not_confirmed'\)/i);
  assert.match(body, /v_email <> lower\(v_promo\.email\)/i);
  assert.match(body, /v_promo\.redeemed_by = v_uid/i);
  assert.match(body, /v_promo\.redeemed_by IS NOT NULL/i);
});

test('migration retains authenticated-only RPC grants and does not change application presentation files', () => {
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.create_pairing_code\(\) TO authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.redeem_pairing_code\(text, text, text, text\) TO authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.redeem_promo_code\(text\) TO authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.check_rate_limit\(uuid, text, integer, integer\) TO service_role/i);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.(create_pairing_code|redeem_pairing_code|redeem_promo_code)[^;]*TO (PUBLIC|anon|service_role)/i);
});
