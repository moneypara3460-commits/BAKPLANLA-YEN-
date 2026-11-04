const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261030180000_durable_account_deletion_receipts.sql'), 'utf8');

test('receipt metadata is outside public and has no Auth cascade relationship', () => {
  assert.match(migration, /CREATE SCHEMA IF NOT EXISTS app_private/);
  assert.match(migration, /CREATE TABLE app_private\.account_deletion_receipts/);
  assert.match(migration, /ALTER TABLE app_private\.account_deletion_receipts ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE app_private\.account_deletion_receipts FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE app_private\.account_deletion_receipts FROM PUBLIC, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /REFERENCES\s+auth\./i);
  assert.match(migration, /credential_hash text PRIMARY KEY CHECK \(credential_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
});

test('receipt lifetime is bounded to 72 hours and expired rows have a scheduled purge', () => {
  assert.match(migration, /expires_at timestamptz NOT NULL DEFAULT \(now\(\) \+ interval '72 hours'\)/);
  assert.match(migration, /CHECK \(expires_at <= created_at \+ interval '72 hours'\)/);
  assert.match(migration, /DELETE FROM app_private\.account_deletion_receipts WHERE expires_at <= now\(\)/);
  assert.match(migration, /cron\.schedule\([\s\S]*'\*\/5 \* \* \* \*'[\s\S]*bakplanla_deletion_receipt_purge_expired/);
});

test('only service_role can execute receipt status/mutation RPCs; purge is postgres-only', () => {
  for (const [name, signature] of [
    ['begin', 'text, uuid'], ['mark', 'text, uuid, text, text'], ['get', 'text'],
  ]) {
    const fn = `public.bakplanla_deletion_receipt_${name}(${signature})`;
    assert.ok(migration.includes(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC, anon, authenticated, service_role;`));
    assert.ok(migration.includes(`GRANT EXECUTE ON FUNCTION ${fn} TO service_role;`));
  }
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.bakplanla_deletion_receipt_purge_expired\(\) TO postgres/);
  assert.doesNotMatch(migration, /GRANT SELECT[^;]*account_deletion_receipts/i);
  assert.equal((migration.match(/SECURITY DEFINER\s+SET search_path = pg_catalog, app_private/g) || []).length, 4);
  assert.equal((migration.match(/OWNER TO postgres;/g) || []).length, 6); // Schema, table, and four fixed function owners.
});
