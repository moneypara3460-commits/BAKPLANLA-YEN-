const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261104100000_kvkk_operator_rights_tooling.sql'), 'utf8');
const receiptMigration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261030180000_durable_account_deletion_receipts.sql'), 'utf8');

test('deletion keeps 72-hour recovery receipt separate from three-year disposal record', () => {
  const disposal = migration.slice(migration.indexOf('CREATE TABLE app_private.privacy_disposal_operations'), migration.indexOf('ALTER TABLE app_private.privacy_operator_members'));
  assert.match(receiptMigration, /expires_at timestamptz NOT NULL DEFAULT \(now\(\) \+ interval '72 hours'\)/);
  assert.match(disposal, /retain_until timestamptz NOT NULL DEFAULT \(now\(\) \+ interval '3 years'\)/);
  assert.doesNotMatch(disposal, /REFERENCES\s+(?:auth\.users|app_private\.account_deletion_receipts)/i);
  assert.match(migration, /privacy_operator_verify_erasure\(p_operator uuid,p_case uuid\)/);
  assert.match(migration, /active_72_hour_receipts/);
  assert.match(migration, /IF v_receipt_count>0 THEN v_residuals:=v_residuals\|\|jsonb_build_array\('active_deletion_reconciliation_receipts'\)/);
  assert.match(migration, /privacy_operator_record_disposal\(p_operator uuid,p_case uuid\)/);
});

test('disposal audit cannot be written until DEV erasure verification succeeds and is retry-safe', () => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.privacy_operator_record_disposal');
  const end = migration.indexOf('CREATE OR REPLACE FUNCTION public.privacy_operator_retention_inventory', start);
  const fn = migration.slice(start, end);
  assert.match(fn, /privacy_operator_verify_erasure\(p_operator,p_case\)/);
  assert.match(fn, /v_check->>'state' IS DISTINCT FROM 'verified'/);
  assert.match(fn, /ON CONFLICT \(case_reference,action\) DO NOTHING/);
  assert.match(fn, /retain_until/);
});

test('account erasure covers schema-confirmed actor references and retains only scoped shared records', () => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.bakplanla_delete_user_data');
  const end = migration.indexOf('ALTER FUNCTION public.privacy_operator_case_open', start);
  const fn = migration.slice(start, end);
  for (const statement of [
    'DELETE FROM public.bk_reviews WHERE author_id=p_user',
    'DELETE FROM public.bk_reports WHERE reporter_id=p_user',
    'DELETE FROM public.bk_audit WHERE actor_id=p_user',
    'UPDATE public.bk_attendance SET updated_by=NULL WHERE updated_by=p_user',
    'UPDATE public.bk_shifts SET created_by=NULL WHERE created_by=p_user',
  ]) assert.ok(fn.includes(statement), `missing deletion behavior: ${statement}`);
  assert.match(fn, /bakplanla__delete_where/);
  assert.match(fn, /bakplanla_deletion_log/);
  assert.match(fn, /interval '3 years'/);
});
