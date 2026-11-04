const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261104100000_kvkk_operator_rights_tooling.sql'), 'utf8');
const restrictedMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20261104110000_privacy_operator_restricted_exports.sql'), 'utf8');
const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
const handler = fs.readFileSync(path.join(root, 'supabase/functions/privacy-operator/index.ts'), 'utf8');
const edgeHandler = fs.readFileSync(path.join(root, 'supabase/functions/privacy-operator/privacyOperatorHandler.mjs'), 'utf8');
const cli = fs.readFileSync(path.join(root, 'scripts/privacy-operator.cjs'), 'utf8');

test('operator data and case tables are private, forced-RLS and inaccessible directly', () => {
  for (const table of ['privacy_operator_members','privacy_rights_cases','privacy_rights_case_events','privacy_disposal_operations']) {
    assert.match(migration, new RegExp(`CREATE TABLE app_private\\.${table}\\b`));
    assert.match(migration, new RegExp(`ALTER TABLE app_private\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`ALTER TABLE app_private\\.${table} FORCE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /REVOKE ALL ON app_private\.privacy_operator_members[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)\s+ON\s+app_private\.privacy_(?:operator|rights|disposal)/i);
  assert.match(config, /\[functions\.privacy-operator\][\s\S]*?verify_jwt = true/);
  assert.match(edgeHandler, /admin\.auth\.getUser\(token\)/);
  assert.match(edgeHandler, /privacy_operator_case_subject/);
  assert.match(cli, /getSupabaseConfig\(\{ url: values\.EXPO_PUBLIC_SUPABASE_URL, publishableKey: values\.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY \}\)/);
});

test('case references, action scopes, verified identity references and close disposition are constrained', () => {
  assert.match(migration, /case_reference text NOT NULL UNIQUE CHECK \(case_reference ~ '\^\[A-Z0-9\]/);
  assert.match(migration, /identity_check_method text NOT NULL CHECK/);
  assert.match(migration, /identity_evidence_reference text NOT NULL CHECK \(identity_evidence_reference ~ '\^\(VERIFY\|REQ\|AUTH\)-/);
  assert.match(migration, /request_authority_reference IS NULL/);
  assert.match(migration, /privacy_operator_case_open/);
  assert.match(migration, /privacy_operator_case_subject/);
  const caseSubject = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.privacy_operator_case_subject'), migration.indexOf('CREATE OR REPLACE FUNCTION public.privacy_operator_case_event'));
  assert.match(caseSubject, /c\.id=p_case AND c\.opened_by=p_operator/);
  assert.match(migration, /closure_status text/);
  assert.match(migration, /subject_user_id=NULL,[\s\S]*closure_status=p_resolution/);
  const openCase = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.privacy_operator_case_open'), migration.indexOf('CREATE OR REPLACE FUNCTION public.privacy_operator_case_subject'));
  assert.ok(openCase.indexOf("m.operator_user_id=p_operator AND m.active") < openCase.indexOf('auth.users u WHERE u.id=p_subject'));
});

test('disposal audit is separate from 72-hour receipt and has at least three-year retention', () => {
  assert.match(migration, /CREATE TABLE app_private\.privacy_disposal_operations/);
  assert.match(migration, /retain_until timestamptz NOT NULL DEFAULT \(now\(\) \+ interval '3 years'\)/);
  assert.match(migration, /CHECK \(retain_until >= occurred_at \+ interval '3 years'\)/);
  assert.match(migration, /UNIQUE \(case_reference, action\)/);
  assert.match(migration, /-- not FK-linked to a case or Auth user[\s\S]*CREATE TABLE app_private\.privacy_disposal_operations/);
  assert.match(migration, /privacy_operator_record_disposal/);
  assert.match(migration, /WHEN 'disposal_dry_run' THEN 'record_disposal'/);
  assert.match(migration, /p_action NOT IN \([^)]*'disposal_dry_run'[^)]*\)/);
  assert.match(migration, /ON CONFLICT \(case_reference,action\) DO NOTHING/);
  assert.match(migration, /account_deletion_receipts/);
  assert.match(migration, /72 hours/);
});

test('destructive correction is allowlisted, optimistic and requires preview+confirmation', () => {
  assert.match(migration, /privacy_operator_correct_candidate/);
  assert.match(migration, /display_name=CASE WHEN p_change_display_name/);
  assert.match(migration, /city=CASE WHEN p_change_city/);
  assert.match(migration, /v_row\.updated_at IS DISTINCT FROM p_expected_updated_at/);
  assert.match(migration, /correction_already_satisfied/);
  assert.doesNotMatch(migration, /EXECUTE\s+format\([^;]*UPDATE/i);
});

test('account deletion clears known author/actor identity references without broadening user-table access', () => {
  assert.match(migration, /DELETE FROM public\.bk_reviews WHERE author_id=p_user/);
  assert.match(migration, /DELETE FROM public\.bk_reports WHERE reporter_id=p_user/);
  assert.match(migration, /DELETE FROM public\.bk_audit WHERE actor_id=p_user/);
  assert.match(migration, /UPDATE public\.bk_attendance SET updated_by=NULL WHERE updated_by=p_user/);
  assert.match(migration, /UPDATE public\.bk_shifts SET created_by=NULL WHERE created_by=p_user/);
  assert.match(migration, /INSERT INTO public\.bakplanla_deletion_log/);
  assert.match(migration, /interval '3 years'/);
});

test('restricted rights sources are exposed only through bounded, case-authorized service-role RPCs', () => {
  const exportPage = restrictedMigration.slice(restrictedMigration.indexOf('CREATE OR REPLACE FUNCTION public.privacy_operator_export_page'), restrictedMigration.indexOf('ALTER FUNCTION public.privacy_operator_private_inventory'));
  assert.match(exportPage, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(exportPage, /c.id=p_case AND c.opened_by=p_operator AND c.status='open' AND m.active AND 'export'=ANY\(c.requested_actions\)/);
  assert.match(exportPage, /p_offset < 0 OR p_offset > 2000/);
  assert.match(exportPage, /p_offset\+p_limit>2000/);
  assert.match(exportPage, /p_limit < 1 OR p_limit > 8/);
  assert.match(exportPage, /WHEN 'backups' THEN/);
  assert.match(exportPage, /WHEN 'shoppingPlans' THEN/);
  assert.doesNotMatch(exportPage, /WHEN 'pushBindings' THEN[^\n]*token,/);
  assert.doesNotMatch(exportPage, /WHEN 'pairings' THEN[^\n]*code_hash,/);
  assert.match(restrictedMigration, /REVOKE ALL ON FUNCTION public\.privacy_operator_export_page\([^;]+FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(restrictedMigration, /GRANT EXECUTE ON FUNCTION public\.privacy_operator_export_page\([^;]+TO service_role/);
  assert.match(restrictedMigration, /'backup_payloads',[\s\S]*'shopping_plans'/);
  assert.doesNotMatch(restrictedMigration, /GRANT\s+SELECT\s+ON\s+public\.(?:bakplanla_backups|bakplanla_push_tokens|bakplanla_shopping_plans)/i);
});
