const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('K02 migration defaults to closed and exposes only an authenticated read-only status RPC', () => {
  const sql = read('supabase/migrations/20261104140000_k02_default_deny_cloud_content_backups.sql');
  assert.match(sql, /allow_content_backups boolean NOT NULL DEFAULT false/);
  assert.match(sql, /INSERT INTO app_private\.bakplanla_cloud_content_backup_policy \(singleton, allow_content_backups\)\s+VALUES \(true, false\)\s+ON CONFLICT \(singleton\) DO UPDATE\s+SET allow_content_backups = false/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE app_private\.bakplanla_cloud_content_backup_policy\s+FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /auth\.uid\(\) IS NOT NULL AND app_private\.bakplanla_cloud_content_backup_enabled\(\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.bakplanla_cloud_backup_writes_allowed\(\)\s+FROM PUBLIC, anon, service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.bakplanla_cloud_backup_writes_allowed\(\) TO authenticated/);
  assert.doesNotMatch(sql, /UPDATE app_private\.bakplanla_cloud_content_backup_policy\s+SET allow_content_backups\s*=\s*true/i);
});

test('K02 blocks PostgREST bypasses with both restrictive RLS gates and a table trigger', () => {
  const sql = read('supabase/migrations/20261104140000_k02_default_deny_cloud_content_backups.sql');
  assert.match(sql, /CREATE TRIGGER bakplanla_backups_require_content_policy\s+BEFORE INSERT OR UPDATE ON public\.bakplanla_backups/);
  assert.match(sql, /ERRCODE = 'PZ001'/);
  assert.match(sql, /CREATE POLICY "bakplanla_backup_write_policy_gate" ON public\.bakplanla_backups\s+AS RESTRICTIVE FOR INSERT TO authenticated/);
  assert.match(sql, /CREATE POLICY "bakplanla_backup_update_policy_gate" ON public\.bakplanla_backups\s+AS RESTRICTIVE FOR UPDATE TO authenticated/);
  assert.doesNotMatch(sql, /DROP POLICY IF EXISTS "backup_(select|delete)_own"/);
  assert.doesNotMatch(sql, /DROP POLICY IF EXISTS "backup_(insert|update)_own"/);
});

test('K02 blocks direct Storage insert/update without restricting existing reads, restore, or deletion', () => {
  const sql = read('supabase/migrations/20261104140000_k02_default_deny_cloud_content_backups.sql');
  assert.match(sql, /CREATE POLICY "bakplanla_docs_insert_policy_gate" ON storage\.objects\s+AS RESTRICTIVE FOR INSERT TO authenticated[\s\S]*bucket_id <> 'bakplanla-documents'[\s\S]*bakplanla_cloud_backup_writes_allowed/);
  assert.match(sql, /CREATE POLICY "bakplanla_docs_update_policy_gate" ON storage\.objects\s+AS RESTRICTIVE FOR UPDATE TO authenticated[\s\S]*bucket_id <> 'bakplanla-documents'[\s\S]*bakplanla_cloud_backup_writes_allowed/);
  assert.doesNotMatch(sql, /DROP POLICY IF EXISTS "bakplanla_docs_(select|delete)_own"/);
  assert.doesNotMatch(sql, /CREATE POLICY .*FOR (SELECT|DELETE)/);
});

test('K02 fences privileged Storage finalization and signed uploads without changing reads or deletes', () => {
  const sql = read('supabase/migrations/20261104140000_k02_default_deny_cloud_content_backups.sql');
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.bakplanla_require_cloud_image_backup_policy()');
  const end = sql.indexOf('-- Retain the existing permissive owner policies.', start);
  const guard = sql.slice(start, end);
  assert.match(guard, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(guard, /NEW\.bucket_id = 'bakplanla-documents'\s+OR \(TG_OP = 'UPDATE' AND OLD\.bucket_id = 'bakplanla-documents'\)/);
  assert.match(guard, /IF NOT app_private\.bakplanla_cloud_content_backup_enabled\(\) THEN/);
  assert.match(guard, /ERRCODE = 'PZ001'/);
  assert.match(guard, /OWNER TO postgres/);
  assert.match(guard, /FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(guard, /CREATE TRIGGER bakplanla_documents_require_content_policy\s+BEFORE INSERT OR UPDATE ON storage\.objects\s+FOR EACH ROW EXECUTE FUNCTION public\.bakplanla_require_cloud_image_backup_policy\(\)/);
  assert.doesNotMatch(guard, /current_user|session_user|auth\.role|DISABLE TRIGGER|BEFORE DELETE/);
});

test('application checks policy before any backup metadata or image operation and presents localized unavailable feedback', () => {
  const app = read('App.js');
  const start = app.indexOf('const runBackup = async () =>');
  const end = app.indexOf('const runRestore = async () =>', start);
  assert.ok(start >= 0 && end > start);
  const workflow = app.slice(start, end);
  assert.ok(workflow.indexOf('checkCloudBackupWritePolicy(backupStore)') < workflow.indexOf('fetchBackupMeta(backupStore, uid)'));
  assert.ok(workflow.indexOf('checkCloudBackupWritePolicy(backupStore)') < workflow.indexOf('uploadDocumentImages({'));
  assert.match(app, /case 'unavailable': return tx\(/);
  assert.match(app, /Bulut yedekleme şu anda kullanılamıyor/);
  assert.match(app, /Cloud backup is currently unavailable/);
  assert.match(app, /Cloud-Backups sind derzeit nicht verfügbar/);
});

test('backup persistence adapter uses the server decision and the domain fails closed on absent permission', () => {
  const store = read('backupStoreSupabase.js');
  const domain = read('backup.js');
  assert.match(store, /canWriteContentBackup:[\s\S]*rpc\('bakplanla_cloud_backup_writes_allowed'\)/);
  assert.match(domain, /typeof store\.canWriteContentBackup !== 'function'[\s\S]*reason: 'unavailable'/);
  assert.match(domain, /res\.data === true/);
  assert.match(domain, /const policy = await checkCloudBackupWritePolicy\(store\)/);
});
