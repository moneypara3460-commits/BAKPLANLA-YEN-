const assert = require('node:assert/strict');
const test = require('node:test');
const localScope = require('../localDataScope');

const backupUrl = new URL('../backup.js', `file://${__dirname.replace(/\\/g, '/')}/`);
const backupStoreUrl = new URL('../backupStoreSupabase.js', `file://${__dirname.replace(/\\/g, '/')}/`);
const imagesUrl = new URL('../cloudImages.js', `file://${__dirname.replace(/\\/g, '/')}/`);
const lifecycleUrl = new URL('../documentImageLifecycle.js', `file://${__dirname.replace(/\\/g, '/')}/`);

function localStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    values,
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) { values.set(key, String(value)); },
    async removeItem(key) { values.delete(key); },
  };
}

class BackupCloud {
  constructor() {
    this.rows = new Map();
    this.objects = new Map();
    this.nextTimestamp = Date.parse('2026-11-01T12:00:00.000Z');
    this.writesEnabled = true;
    this.afterWrite = null;
    this.signedPaths = [];
  }

  client(uid) {
    const cloud = this;
    return {
      rpc(name) {
        assert.equal(name, 'bakplanla_cloud_backup_writes_allowed');
        return Promise.resolve({ data: cloud.writesEnabled, error: null });
      },
      from(table) {
        assert.equal(table, 'bakplanla_backups');
        const query = {
          action: 'select', body: null, filters: {}, columns: '*', returning: false,
          select(columns) { this.columns = columns || '*'; this.returning = this.action !== 'select'; return this; },
          eq(key, value) { this.filters[key] = value; return this; },
          update(body) { this.action = 'update'; this.body = body; return this; },
          insert(body) { this.action = 'insert'; this.body = body; return this; },
          delete() { this.action = 'delete'; return this; },
          async maybeSingle() { return this.execute(true); },
          async single() { return this.execute(false); },
          async execute(single) {
            if (this.action === 'insert') {
              if (this.body.user_id !== uid) return { data: null, error: { code: '42501', status: 403, message: 'row-level security' } };
              if (!cloud.writesEnabled) return { data: null, error: { code: 'PZ001', message: 'cloud_backup_writes_disabled' } };
              if (cloud.rows.has(uid)) return { data: null, error: { code: '23505', message: 'duplicate' } };
              const row = { ...this.body, updated_at: new Date(cloud.nextTimestamp++).toISOString() };
              cloud.rows.set(uid, row);
              if (cloud.afterWrite) await cloud.afterWrite(row);
              return { data: project(row, this.columns), error: null };
            }
            const owner = this.filters.user_id;
            const row = owner === uid ? cloud.rows.get(owner) : null;
            if (this.action === 'select') return { data: row ? project(row, this.columns) : null, error: null };
            if (!row || Object.entries(this.filters).some(([key, value]) => row[key] !== value)) {
              return { data: this.action === 'delete' || this.returning ? [] : null, error: null };
            }
            if (this.action === 'update') {
              if (!cloud.writesEnabled) return { data: null, error: { code: 'PZ001', message: 'cloud_backup_writes_disabled' } };
              Object.assign(row, this.body, { updated_at: new Date(cloud.nextTimestamp++).toISOString() });
              if (cloud.afterWrite) await cloud.afterWrite(row);
              return { data: this.returning ? [project(row, this.columns)] : null, error: null };
            }
            if (this.action === 'delete') {
              cloud.rows.delete(owner);
              return { data: this.returning ? [{ user_id: owner }] : null, error: null };
            }
            return { data: null, error: null };
          },
          then(resolve, reject) { return this.execute(false).then(resolve, reject); },
        };
        return query;
      },
      storage: {
        from(bucket) {
          assert.equal(bucket, 'bakplanla-documents');
          return {
            async list(folder) {
              if (folder !== uid) return { data: null, error: { status: 403, message: 'row-level security' } };
              return { data: [...cloud.objects.keys()].filter((path) => path.startsWith(`${uid}/`)).map((path) => ({ name: path.slice(uid.length + 1) })), error: null };
            },
            async upload(path, bytes, options = {}) {
              if (cloud.uploadHook) return cloud.uploadHook(path, bytes, options);
              if (!path.startsWith(`${uid}/`)) return { data: null, error: { status: 403, message: 'row-level security' } };
              if (!cloud.writesEnabled) return { data: null, error: { status: 403, message: 'row-level security' } };
              if (options.upsert === false && cloud.objects.has(path)) return { data: null, error: { status: 409, message: 'already exists' } };
              cloud.objects.set(path, new Uint8Array(bytes));
              return { data: { path }, error: null };
            },
            async createSignedUrl(path) {
              if (!path.startsWith(`${uid}/`) || !cloud.objects.has(path)) return { data: null, error: { status: 403, message: 'row-level security' } };
              cloud.signedPaths.push(path);
              return { data: { signedUrl: `https://fake.invalid/${encodeURIComponent(path)}` }, error: null };
            },
            async remove(paths) {
              if (paths.some((path) => !path.startsWith(`${uid}/`))) return { data: null, error: { status: 403, message: 'row-level security' } };
              for (const path of paths) cloud.objects.delete(path);
              return { data: paths.map((path) => ({ name: path.split('/').pop() })), error: null };
            },
          };
        },
      },
    };
  }
}

function project(row, columns) {
  if (columns === '*') return { ...row };
  return Object.fromEntries(columns.split(',').map((key) => key.trim()).filter((key) => key in row).map((key) => [key, row[key]]));
}

function alternateBackupStore(actorId) {
  const rows = new Map();
  let timestamp = Date.parse('2026-11-02T10:00:00.000Z');
  const error = (kind, code) => ({ data: null, error: { kind, code } });
  const denied = () => error('auth', 'owner_scope_denied');
  const owned = (uid) => uid === actorId;
  return {
    async canWriteContentBackup() { return { data: true, error: null }; },
    async fetchBackup(uid) {
      return { data: owned(uid) ? rows.get(uid) || null : null, error: null };
    },
    async fetchBackupMeta(uid) {
      if (!owned(uid)) return { data: null, error: null };
      const row = rows.get(uid);
      return { data: row ? project(row, 'updated_at, task_count, document_count, schema_version') : null, error: null };
    },
    async insertBackup(uid, body) {
      if (!owned(uid)) return denied();
      if (rows.has(uid)) return error('conflict', 'duplicate_owner_backup');
      const row = { ...body, user_id: uid, updated_at: new Date(timestamp++).toISOString() };
      rows.set(uid, row);
      return { data: { updated_at: row.updated_at }, error: null };
    },
    async updateBackupIfUnchanged(uid, expectedUpdatedAt, body) {
      if (!owned(uid)) return denied();
      const row = rows.get(uid);
      if (!row || row.updated_at !== expectedUpdatedAt) return { data: [], error: null };
      Object.assign(row, body, { updated_at: new Date(timestamp++).toISOString() });
      return { data: [{ updated_at: row.updated_at }], error: null };
    },
    async verifyBackup(uid) {
      const row = owned(uid) ? rows.get(uid) : null;
      return { data: row ? project(row, 'payload, checksum') : null, error: null };
    },
    async deleteBackup(uid) {
      if (!owned(uid)) return denied();
      const existed = rows.delete(uid);
      return { data: existed ? [{ user_id: uid }] : [], error: null };
    },
    async fetchBackupOwner(uid) {
      const row = owned(uid) ? rows.get(uid) : null;
      return { data: row ? { user_id: uid } : null, error: null };
    },
  };
}

async function modules() {
  const [backup, backupStore, images, lifecycle] = await Promise.all([
    import(backupUrl.href), import(backupStoreUrl.href), import(imagesUrl.href), import(lifecycleUrl.href),
  ]);
  return { backup, backupStore, images, lifecycle };
}

test('backup upload, checksum verification, owner image path and restore merge compose through real modules', async () => {
  const { backup, backupStore: backupStoreModule, images } = await modules();
  const cloud = new BackupCloud();
  const supabase = cloud.client('account-a');
  const backupStore = backupStoreModule.createSupabaseBackupStore(supabase);
  const storage = localStorage();
  await localScope.switchLocalDataScope(storage, 'account-a');
  const localTasks = [
    { id: 'task-a', title: 'Account A task', dueDate: '2026-11-02', completed: false },
    { id: 'task-b', title: 'Planning', dueDate: '2026-11-02', completed: false },
  ];
  const localDocuments = [{ id: 'doc-a', title: 'Passport', updatedAt: '2026-10-30T00:00:00.000Z', uri: 'file://account-a/passport.png' }];
  const preferences = { location: 'Ankara', budget: 1000, peopleCount: 2 };
  await storage.setItem('PLAN_TASKS', JSON.stringify(localTasks));
  await storage.setItem('PLAN_DOCUMENTS', JSON.stringify(localDocuments));

  const imageResult = await images.uploadDocumentImages({
    supabase,
    fs: { async readBase64(uri) { assert.equal(uri, localDocuments[0].uri); return 'AQID'; }, async sha256() { return 'a'.repeat(64); } },
    createUploadId: () => 'upload-1',
    uid: 'account-a', documents: localDocuments,
  });
  assert.deepEqual({ uploaded: imageResult.uploaded, failed: imageResult.failed }, { uploaded: 1, failed: 0 });
  const payload = backup.buildPayload({ tasks: localTasks, documents: localDocuments, todayPreferences: preferences, imagePaths: imageResult.paths });
  assert.equal(payload.documents[0].uri, undefined);
  assert.equal(payload.documents[0].hadImage, true);
  assert.match(payload.documents[0].imagePath, /^account-a\//);

  const saved = await backup.uploadBackup(backupStore, 'account-a', payload, null, 'synthetic-version');
  assert.equal(saved.ok, true);
  const fetched = await backup.fetchBackup(backupStore, 'account-a');
  assert.equal(fetched.ok, true);
  const valid = backup.validateBackupRow(fetched.row);
  assert.equal(valid.ok, true);
  assert.equal(backup.checksumOf(valid.payload), fetched.row.checksum);
  const metadata = await backup.fetchBackupMeta(backupStore, 'account-a');
  assert.equal(metadata.ok, true);
  assert.equal(metadata.meta.schema_version, 1);
  const updated = await backup.uploadBackup(backupStore, 'account-a', payload, metadata.meta.updated_at, 'synthetic-version-2');
  assert.equal(updated.ok, true);

  const restoreCurrent = {
    tasks: [
      { id: 'task-a', title: 'Locally edited task', dueDate: '2026-11-02', completed: false },
      { id: 'local-planning', title: ' planning ', dueDate: '2026-11-02', completed: false },
    ],
    documents: [{ id: 'doc-a', title: 'Older local passport', updatedAt: '2026-10-29T00:00:00.000Z', uri: 'file://account-a/local-passport.png' }],
    todayPreferences: { location: '', budget: 0, peopleCount: 1 },
  };
  await storage.setItem('PLAN_TASKS', JSON.stringify(restoreCurrent.tasks));
  await storage.setItem('PLAN_DOCUMENTS', JSON.stringify(restoreCurrent.documents));
  await storage.setItem('PLAN_TODAY_PREFERENCES', JSON.stringify(restoreCurrent.todayPreferences));
  const merge = backup.planRestore(restoreCurrent, valid.payload, { location: '', budget: 0, peopleCount: 1 });
  assert.deepEqual(merge.tasks.map((task) => task.id), ['task-a', 'local-planning']);
  assert.equal(merge.tasks[0].title, 'Locally edited task');
  assert.equal(merge.documents.find((doc) => doc.id === 'doc-a').uri, 'file://account-a/local-passport.png');
  assert.deepEqual(merge.todayPreferences, preferences);
  assert.deepEqual(merge.summary, { addedTasks: 0, skippedTasks: 2, addedDocs: 0, updatedDocs: 1, skippedDocs: 0, prefsRestored: true });
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_TASKS')), restoreCurrent.tasks);
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_DOCUMENTS')), restoreCurrent.documents);
});

test('conflicting and cross-owner backup writes cannot replace the current owner row', async () => {
  const { backup, backupStore: backupStoreModule } = await modules();
  const cloud = new BackupCloud();
  const a = cloud.client('account-a');
  const b = cloud.client('account-b');
  const storeA = backupStoreModule.createSupabaseBackupStore(a);
  const storeB = backupStoreModule.createSupabaseBackupStore(b);
  const originalPayload = { tasks: [{ id: 'a', title: 'Account A' }], documents: [], todayPreferences: {} };
  const created = await backup.uploadBackup(storeA, 'account-a', originalPayload, null, 'v1');
  assert.equal(created.ok, true);
  const original = structuredClone(cloud.rows.get('account-a'));

  const conflict = await backup.uploadBackup(storeA, 'account-a', { ...originalPayload, tasks: [{ id: 'new', title: 'Should not overwrite' }] }, 'stale-server-time', 'v2');
  assert.deepEqual(conflict, { ok: false, reason: 'conflict' });
  assert.deepEqual(cloud.rows.get('account-a'), original);

  const hiddenFromB = await backup.fetchBackup(storeB, 'account-a');
  assert.deepEqual(hiddenFromB, { ok: true, row: null });
  const crossOwnerWrite = await backup.uploadBackup(storeB, 'account-a', originalPayload, null, 'v2');
  assert.equal(crossOwnerWrite.ok, false);
  assert.equal(crossOwnerWrite.reason, 'auth');
  assert.deepEqual(cloud.rows.get('account-a'), original);
  assert.deepEqual(await backup.deleteBackup(storeA, 'account-a'), { ok: true, deleted: 1 });
  assert.equal(cloud.rows.has('account-a'), false);
});

test('checksum failure is detected by the row validator; App restore mutation is outside this test boundary', async () => {
  const { backup, backupStore: backupStoreModule } = await modules();
  const cloud = new BackupCloud();
  const supabase = cloud.client('account-a');
  const backupStore = backupStoreModule.createSupabaseBackupStore(supabase);
  const storage = localStorage();
  await localScope.switchLocalDataScope(storage, 'account-a');
  const local = { tasks: [{ id: 'keep', title: 'Keep local' }], documents: [], todayPreferences: { location: 'Izmir' } };
  await storage.setItem('PLAN_TASKS', JSON.stringify(local.tasks));
  await storage.setItem('PLAN_DOCUMENTS', JSON.stringify(local.documents));
  await storage.setItem('PLAN_TODAY_PREFERENCES', JSON.stringify(local.todayPreferences));
  const payload = { tasks: [{ id: 'remote', title: 'Remote' }], documents: [], todayPreferences: {} };
  assert.equal((await backup.uploadBackup(backupStore, 'account-a', payload, null, 'v1')).ok, true);
  cloud.rows.get('account-a').payload.tasks.push({ id: 'tampered', title: 'Bad checksum' });

  const fetched = await backup.fetchBackup(backupStore, 'account-a');
  assert.equal(fetched.ok, true);
  assert.deepEqual(backup.validateBackupRow(fetched.row), { ok: false, reason: 'checksum' });
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_TASKS')), local.tasks);
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_TODAY_PREFERENCES')), local.todayPreferences);
});

test('image restore follows owner-scoped image paths and local-data snapshots survive account transitions', async () => {
  const { images } = await modules();
  const cloud = new BackupCloud();
  const ownerClient = cloud.client('account-a');
  cloud.objects.set('account-a/doc-a.png', new Uint8Array([1, 2, 3]));
  const downloads = new Map();
  const fs = {
    docDir: 'file://documents/',
    async downloadTo(url, destination) {
      const path = decodeURIComponent(new URL(url).pathname.slice(1));
      downloads.set(destination, cloud.objects.get(path));
      return true;
    },
  };
  const accountADoc = { id: 'doc-a', uri: null, imagePath: 'account-a/doc-a.png' };
  const restored = await images.restoreDocumentImages({ supabase: ownerClient, fs, uid: 'account-a', documents: [accountADoc] });
  assert.equal(restored.downloaded, 1);
  assert.equal(typeof restored.documents[0].uri, 'string');
  assert.deepEqual([...downloads.values()][0], new Uint8Array([1, 2, 3]));

  const before = cloud.signedPaths.length;
  const accountBAttempt = await images.restoreDocumentImages({
    supabase: cloud.client('account-b'), fs, uid: 'account-b',
    documents: [{ ...accountADoc, uri: null }],
  });
  assert.equal(accountBAttempt.downloaded, 0);
  assert.equal(accountBAttempt.failed, 0);
  assert.equal(cloud.signedPaths.length, before);

  const local = localStorage();
  await localScope.switchLocalDataScope(local, 'account-a');
  await local.setItem('PLAN_TASKS', JSON.stringify([{ id: 'restored-a', title: 'A data' }]));
  await local.setItem('PLAN_DOCUMENTS', JSON.stringify(restored.documents));
  await localScope.switchLocalDataScope(local, 'account-b');
  assert.equal(local.values.get('PLAN_TASKS'), undefined);
  await local.setItem('PLAN_TASKS', JSON.stringify([{ id: 'only-b', title: 'B data' }]));
  await localScope.switchLocalDataScope(local, 'account-a');
  assert.deepEqual(JSON.parse(local.values.get('PLAN_TASKS')), [{ id: 'restored-a', title: 'A data' }]);
  assert.deepEqual(JSON.parse(local.values.get('PLAN_DOCUMENTS'))[0].uri, restored.documents[0].uri);
});

test('write-then-read checksum verification reports corruption instead of successful backup', async () => {
  const { backup, backupStore: backupStoreModule } = await modules();
  const cloud = new BackupCloud();
  const supabase = cloud.client('account-c');
  const backupStore = backupStoreModule.createSupabaseBackupStore(supabase);
  cloud.afterWrite = async (row) => { row.payload.tasks[0].title = 'corrupted after write'; };
  const result = await backup.uploadBackup(backupStore, 'account-c', {
    tasks: [{ id: 'task-c', title: 'Original' }], documents: [], todayPreferences: {},
  }, null, 'v1');
  assert.deepEqual(result, { ok: false, reason: 'verify' });
});

test('closed server policy blocks direct PostgREST and Storage writes but preserves historical read, restore, and deletion', async () => {
  const { backup, backupStore: backupStoreModule, images } = await modules();
  const cloud = new BackupCloud();
  const supabase = cloud.client('account-a');
  const store = backupStoreModule.createSupabaseBackupStore(supabase);
  const priorPayload = { tasks: [{ id: 'old', title: 'Keep existing' }], documents: [], todayPreferences: {} };
  assert.equal((await backup.uploadBackup(store, 'account-a', priorPayload, null, 'v1')).ok, true);
  const priorRow = structuredClone(cloud.rows.get('account-a'));
  cloud.objects.set('account-a/old-image.jpg', new Uint8Array([1, 2, 3]));
  cloud.writesEnabled = false;

  assert.deepEqual(await backup.checkCloudBackupWritePolicy(store), { ok: false, reason: 'unavailable' });
  const denied = await backup.uploadBackup(store, 'account-a', { ...priorPayload, tasks: [{ id: 'new', title: 'Must not replace' }] }, priorRow.updated_at, 'v2');
  assert.deepEqual(denied, { ok: false, reason: 'unavailable' });
  assert.deepEqual(cloud.rows.get('account-a'), priorRow);

  const rawInsert = await store.insertBackup('account-a', {
    payload: { tasks: [], documents: [], todayPreferences: {} }, checksum: 'blocked', schema_version: 1,
    task_count: 0, document_count: 0, app_version: 'raw-postgrest',
  });
  assert.equal(rawInsert.error.code, 'PZ001', 'direct adapter writes still hit the server-enforced trigger');
  assert.deepEqual(cloud.rows.get('account-a'), priorRow);
  const rawUpdate = await store.updateBackupIfUnchanged('account-a', priorRow.updated_at, {
    payload: { tasks: [], documents: [], todayPreferences: {} }, checksum: 'blocked-update',
    schema_version: 1, task_count: 0, document_count: 0, app_version: 'raw-postgrest-update',
  });
  assert.equal(rawUpdate.error.code, 'PZ001', 'direct PostgREST UPDATE cannot bypass the gate');
  assert.deepEqual(cloud.rows.get('account-a'), priorRow);

  const rawStorageWrite = await supabase.storage.from('bakplanla-documents').upload('account-a/new.jpg', new Uint8Array([9]), { upsert: false });
  assert.equal(rawStorageWrite.error.status, 403, 'direct Storage uploads remain blocked by policy');
  const rawStorageUpdate = await supabase.storage.from('bakplanla-documents').upload('account-a/old-image.jpg', new Uint8Array([9]), { upsert: true });
  assert.equal(rawStorageUpdate.error.status, 403, 'direct Storage upserts remain blocked by policy');
  assert.deepEqual([...cloud.objects.get('account-a/old-image.jpg')], [1, 2, 3]);

  const historical = await backup.fetchBackup(store, 'account-a');
  assert.equal(historical.ok, true);
  assert.equal(backup.validateBackupRow(historical.row).ok, true);
  const restoredImage = await images.restoreDocumentImages({
    supabase, uid: 'account-a', documents: [{ id: 'old-image', uri: null, imagePath: 'account-a/old-image.jpg' }],
    fs: { docDir: 'file://restore/', async downloadTo() { return true; } },
  });
  assert.equal(restoredImage.downloaded, 1);
  const deleted = await backup.deleteBackup(store, 'account-a', priorRow.updated_at);
  assert.equal(deleted.ok, true, 'historical deletion remains available while new writes are disabled');
  const imageCleanup = await images.removeCloudImagePaths({ supabase, uid: 'account-a', paths: ['account-a/old-image.jpg'] });
  assert.equal(imageCleanup.ok, true);
  assert.equal(cloud.objects.has('account-a/old-image.jpg'), false);
});

test('a policy closure between image staging and backup commit preserves the old row and leaves recovery journaled', async () => {
  const { backup, backupStore: backupStoreModule, lifecycle } = await modules();
  const cloud = new BackupCloud();
  const store = backupStoreModule.createSupabaseBackupStore(cloud.client('account-a'));
  const originalPayload = { tasks: [{ id: 'prior', title: 'Existing backup' }], documents: [], todayPreferences: {} };
  assert.equal((await backup.uploadBackup(store, 'account-a', originalPayload, null, 'v1')).ok, true);
  const original = structuredClone(cloud.rows.get('account-a'));
  cloud.objects.set('account-a/new.jpg', new Uint8Array([9, 8, 7]));
  const journal = [];
  const preflight = await backup.checkCloudBackupWritePolicy(store);
  assert.equal(preflight.ok, true);

  const result = await lifecycle.reconcileCloudImageCommit({
    uid: 'account-a', previousPaths: [], pendingPaths: [], stagedPaths: ['account-a/new.jpg'], currentPaths: ['account-a/new.jpg'],
    async persistJournal(paths) { journal.splice(0, journal.length, ...paths); return true; },
    async commitBackup() {
      cloud.writesEnabled = false;
      const write = await backup.uploadBackup(store, 'account-a', { ...originalPayload, tasks: [{ id: 'new', title: 'Incomplete replacement' }] }, original.updated_at, 'v2');
      return write.ok ? { ok: true } : { ok: false, reason: write.reason };
    },
    async removePaths() { assert.fail('Do not delete old or staged content after a blocked commit'); },
  });
  assert.equal(result.committed, false);
  assert.equal(result.reason, 'unavailable');
  assert.deepEqual(cloud.rows.get('account-a'), original);
  assert.deepEqual([...cloud.objects.get('account-a/new.jpg')], [9, 8, 7], 'failed cleanup data stays retained, not silently discarded');
  assert.deepEqual(journal, ['account-a/new.jpg'], 'staged image remains recoverable/cleanable after a blocked commit');
  const cleanup = await (await modules()).images.removeCloudImagePaths({
    supabase: cloud.client('account-a'), uid: 'account-a', paths: journal,
  });
  assert.equal(cleanup.ok, true, 'the existing delete/cleanup route remains usable while uploads are denied');
  assert.equal(cloud.objects.has('account-a/new.jpg'), false);
});

test('concurrent owners cannot publish or overwrite any cloud snapshot while the global gate is closed', async () => {
  const { backup, backupStore: backupStoreModule } = await modules();
  const cloud = new BackupCloud();
  const storeA = backupStoreModule.createSupabaseBackupStore(cloud.client('account-a'));
  const storeB = backupStoreModule.createSupabaseBackupStore(cloud.client('account-b'));
  const payloadA = { tasks: [{ id: 'a', title: 'A private task' }], documents: [], todayPreferences: {} };
  const payloadB = { tasks: [{ id: 'b', title: 'B private task' }], documents: [], todayPreferences: {} };
  await Promise.all([
    backup.uploadBackup(storeA, 'account-a', payloadA, null, 'v1'),
    backup.uploadBackup(storeB, 'account-b', payloadB, null, 'v1'),
  ]);
  const originalA = structuredClone(cloud.rows.get('account-a'));
  const originalB = structuredClone(cloud.rows.get('account-b'));
  cloud.writesEnabled = false;
  const [updatedA, updatedB] = await Promise.all([
    backup.uploadBackup(storeA, 'account-a', { ...payloadA, tasks: [{ id: 'a2', title: 'A update' }] }, originalA.updated_at, 'v2'),
    backup.uploadBackup(storeB, 'account-b', { ...payloadB, tasks: [{ id: 'b2', title: 'B update' }] }, originalB.updated_at, 'v2'),
  ]);
  assert.deepEqual(updatedA, { ok: false, reason: 'unavailable' });
  assert.deepEqual(updatedB, { ok: false, reason: 'unavailable' });
  assert.deepEqual(cloud.rows.get('account-a'), originalA);
  assert.deepEqual(cloud.rows.get('account-b'), originalB);
});

test('missing or failing write-policy status RPC fails closed', async () => {
  const { backup } = await modules();
  assert.equal(backup.classifyError({ code: 'PZ001', message: 'cloud_backup_writes_disabled' }), 'unavailable');
  assert.deepEqual(await backup.checkCloudBackupWritePolicy({}), { ok: false, reason: 'unavailable' });
  assert.deepEqual(await backup.checkCloudBackupWritePolicy({
    async canWriteContentBackup() { return { data: null, error: { kind: 'auth', code: '42501' } }; },
  }), { ok: false, reason: 'auth', code: '42501' });
});

test('backup workflow runs unchanged against an alternative owner-scoped store implementation', async () => {
  const { backup } = await modules();
  const store = alternateBackupStore('account-a');
  const original = { tasks: [{ id: 'task-a', title: 'Türkçe plan' }], documents: [], todayPreferences: { category: 'park' } };
  const created = await backup.uploadBackup(store, 'account-a', original, null, 'v1');
  assert.equal(created.ok, true);

  const fetched = await backup.fetchBackup(store, 'account-a');
  assert.equal(fetched.ok, true);
  assert.deepEqual(backup.validateBackupRow(fetched.row), { ok: true, payload: original });

  const meta = await backup.fetchBackupMeta(store, 'account-a');
  const changed = { ...original, tasks: [{ id: 'task-b', title: 'Başka bir plan' }] };
  const updated = await backup.uploadBackup(store, 'account-a', changed, meta.meta.updated_at, 'v2');
  assert.equal(updated.ok, true);
  const stale = await backup.uploadBackup(store, 'account-a', original, meta.meta.updated_at, 'v3');
  assert.deepEqual(stale, { ok: false, reason: 'conflict' });

  assert.deepEqual(await backup.fetchBackup(store, 'account-b'), { ok: true, row: null });
  assert.equal((await backup.uploadBackup(store, 'account-b', original, null, 'v1')).reason, 'auth');
  assert.deepEqual(await backup.deleteBackup(store, 'account-a'), { ok: true, deleted: 1 });
  assert.deepEqual(await backup.fetchBackup(store, 'account-a'), { ok: true, row: null });
});

test('backup domain workflow contains no direct Supabase/PostgREST query builder dependency', async () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../backup.js'), 'utf8');
  assert.doesNotMatch(source, /supabase\.(from|rpc|storage|auth)|\.from\(BACKUP_TABLE\)/);
  const app = fs.readFileSync(require('node:path').join(__dirname, '../App.js'), 'utf8');
  assert.match(app, /const backupStore = createSupabaseBackupStore\(supabase\)/);
  assert.match(app, /fetchBackup\(backupStore, uid\)/);
  assert.match(app, /uploadBackup\(backupStore, uid/);
});

test('image upload does not reuse a path when bytes changed behind the same local URI', async () => {
  const { images } = await modules();
  const cloud = new BackupCloud();
  const supabase = cloud.client('account-a');
  const oldPath = 'account-a/doc-a-passport-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-old.jpg';
  cloud.objects.set(oldPath, new Uint8Array([1, 2, 3]));
  let bytes = 'BAUG';
  let digest = 'b'.repeat(64);
  let listed = false;
  const storage = supabase.storage.from('bakplanla-documents');
  const originalList = storage.list;
  storage.list = async (...args) => { listed = true; return originalList(...args); };
  const result = await images.uploadDocumentImages({
    supabase,
    uid: 'account-a',
    documents: [{ id: 'doc-a', uri: 'file://account-a/passport.jpg' }],
    existingPaths: { 'doc-a': oldPath },
    createUploadId: () => 'new-upload',
    fs: {
      async readBase64() { return bytes; },
      async sha256() { return digest; },
    },
  });
  assert.equal(listed, false, 'reuse decision must not depend on a Storage listing');
  assert.equal(result.uploaded, 1);
  assert.equal(result.reused, 0);
  assert.notEqual(result.paths['doc-a'], oldPath);
  assert.deepEqual([...cloud.objects.get(oldPath)], [1, 2, 3], 'previous backup image remains until the backup commit');
  assert.deepEqual([...cloud.objects.get(result.paths['doc-a'])], [4, 5, 6]);

  bytes = 'AQID';
  digest = 'a'.repeat(64);
  const unchanged = await images.uploadDocumentImages({
    supabase, uid: 'account-a', documents: [{ id: 'doc-a', uri: 'file://account-a/passport.jpg' }],
    existingPaths: { 'doc-a': result.paths['doc-a'] }, createUploadId: () => 'unused',
    fs: { async readBase64() { return 'BAUG'; }, async sha256() { return 'b'.repeat(64); } },
  });
  assert.equal(unchanged.reused, 1);
  assert.equal(unchanged.paths['doc-a'], result.paths['doc-a']);
});

test('image backup commit journals staged paths, waits for durable backup, and retries exact failed cleanup', async () => {
  const { lifecycle } = await modules();
  const journal = [];
  const removed = [];
  let cleanupFails = true;
  const common = {
    uid: 'account-a',
    previousPaths: ['account-a/old.jpg'],
    pendingPaths: ['account-a/interrupted.jpg'],
    stagedPaths: ['account-a/current.jpg'],
    currentPaths: ['account-a/current.jpg'],
    async persistJournal(paths) { journal.splice(0, journal.length, ...paths); return true; },
    async commitBackup() { return { ok: true }; },
    async removePaths(paths) {
      removed.push(...paths);
      return cleanupFails ? { ok: false, removed: 0 } : { ok: true, removed: paths.length };
    },
  };
  const first = await lifecycle.reconcileCloudImageCommit(common);
  assert.equal(first.committed, true);
  assert.equal(first.cleanup, 'pending');
  assert.deepEqual(removed.sort(), ['account-a/interrupted.jpg', 'account-a/old.jpg']);
  assert.deepEqual(journal.sort(), ['account-a/interrupted.jpg', 'account-a/old.jpg']);

  cleanupFails = false;
  const retry = await lifecycle.reconcileCloudImageCommit({
    ...common, previousPaths: [], pendingPaths: journal, stagedPaths: [],
  });
  assert.equal(retry.cleanup, 'complete');
  assert.deepEqual(journal, []);
});

test('image cleanup never runs before backup commit and rejects cross-owner paths', async () => {
  const { lifecycle } = await modules();
  const removed = [];
  const denied = await lifecycle.reconcileCloudImageCommit({
    uid: 'account-a', previousPaths: ['account-b/private.jpg'], pendingPaths: [], stagedPaths: [], currentPaths: [],
    async persistJournal() { return true; }, async commitBackup() { return { ok: true }; },
    async removePaths(paths) { removed.push(...paths); return { ok: true }; },
  });
  assert.equal(denied.committed, false);
  assert.equal(denied.reason, 'invalid_path');
  assert.deepEqual(removed, []);

  const failedCommit = await lifecycle.reconcileCloudImageCommit({
    uid: 'account-a', previousPaths: ['account-a/old.jpg'], pendingPaths: [], stagedPaths: [], currentPaths: [],
    async persistJournal() { return true; }, async commitBackup() { return { ok: false, reason: 'conflict' }; },
    async removePaths(paths) { removed.push(...paths); return { ok: true }; },
  });
  assert.equal(failedCommit.committed, false);
  assert.deepEqual(removed, []);
});

test('image cleanup is deferred when owner scope changes after durable backup commit', async () => {
  const { lifecycle } = await modules();
  const removed = [];
  let journal;
  const result = await lifecycle.reconcileCloudImageCommit({
    uid: 'account-a', previousPaths: ['account-a/old.jpg'], pendingPaths: [], stagedPaths: [], currentPaths: [],
    async persistJournal(paths) { journal = paths; return true; }, async commitBackup() { return { ok: true }; },
    async removePaths(paths) { removed.push(...paths); return { ok: true }; }, isCurrent: () => false,
  });
  assert.equal(result.committed, true);
  assert.equal(result.cleanup, 'deferred');
  assert.deepEqual(removed, []);
  assert.deepEqual(journal, ['account-a/old.jpg']);
});

test('allocated image paths are durably journaled before an interrupted upload', async () => {
  const { images } = await modules();
  const cloud = new BackupCloud();
  let storageUploadCalls = 0;
  const supabase = cloud.client('account-a');
  const journal = [];
  cloud.uploadHook = async () => {
    storageUploadCalls += 1;
    assert.equal(journal.length, storageUploadCalls, 'each path must be journaled before its Storage request begins');
    if (storageUploadCalls === 2) throw new Error('simulated timeout after request dispatch');
    return { data: { path: journal[storageUploadCalls - 1] }, error: null };
  };
  const result = await images.uploadDocumentImages({
    supabase, uid: 'account-a', documents: [
      { id: 'doc-a', uri: 'file://account-a/doc.jpg' }, { id: 'doc-b', uri: 'file://account-a/doc-b.jpg' },
    ],
    createUploadId: () => `attempt-${storageUploadCalls + 1}`,
    async onPathAllocated(path) { journal.push(path); return true; },
    fs: { async readBase64() { return 'AQID'; }, async sha256() { return 'c'.repeat(64); } },
  });
  assert.equal(storageUploadCalls, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.uploaded, 1);
  assert.equal(result.orphanCandidates.length, 1);
  assert.equal(journal.length, 2, 'earlier staged object must remain journaled while later upload is interrupted');
});

test('document image cleanup journals are separated by owner and a staged peer upload is untouched', async () => {
  const { images } = await modules();
  const storage = localStorage();
  await localScope.switchLocalDataScope(storage, 'account-a');
  const keyA = 'PLAN_BACKUP_IMAGE_CLEANUP:account-a';
  const keyB = 'PLAN_BACKUP_IMAGE_CLEANUP:account-b';
  await storage.setItem(keyA, JSON.stringify(['account-a/old.jpg']));
  await localScope.switchLocalDataScope(storage, 'account-b');
  await storage.setItem(keyB, JSON.stringify([]));
  assert.deepEqual(JSON.parse(storage.values.get(keyA)), ['account-a/old.jpg']);

  const cloud = new BackupCloud();
  cloud.objects.set('account-a/old.jpg', new Uint8Array([1]));
  cloud.objects.set('account-a/peer-staged.jpg', new Uint8Array([2]));
  const removal = await images.removeCloudImagePaths({ supabase: cloud.client('account-a'), uid: 'account-a', paths: ['account-a/old.jpg'] });
  assert.deepEqual(removal, { ok: true, removed: 1 });
  assert.equal(cloud.objects.has('account-a/old.jpg'), false);
  assert.equal(cloud.objects.has('account-a/peer-staged.jpg'), true);
  const denied = await images.removeCloudImagePaths({ supabase: cloud.client('account-a'), uid: 'account-a', paths: ['account-b/private.jpg'] });
  assert.equal(denied.ok, false);
  assert.equal(cloud.objects.has('account-a/peer-staged.jpg'), true);
});

test('backup CAS conflict retains the previous image; successful retry removes only its superseded path', async () => {
  const { backup, backupStore: backupStoreModule, images, lifecycle } = await modules();
  const cloud = new BackupCloud();
  const supabase = cloud.client('account-a');
  const store = backupStoreModule.createSupabaseBackupStore(supabase);
  const oldPath = 'account-a/doc-a-old.jpg';
  const newPath = 'account-a/doc-a-new.jpg';
  const oldPayload = { tasks: [], documents: [{ id: 'doc-a', imagePath: oldPath }], todayPreferences: {} };
  assert.equal((await backup.uploadBackup(store, 'account-a', oldPayload, null, 'v1')).ok, true);
  cloud.objects.set(oldPath, new Uint8Array([1]));
  cloud.objects.set(newPath, new Uint8Array([2]));
  const oldTimestamp = cloud.rows.get('account-a').updated_at;

  const concurrentPayload = { ...oldPayload, tasks: [{ id: 'peer', title: 'Concurrent device' }] };
  assert.equal((await backup.uploadBackup(store, 'account-a', concurrentPayload, oldTimestamp, 'peer')).ok, true);
  const conflicted = await lifecycle.reconcileCloudImageCommit({
    uid: 'account-a', previousPaths: [oldPath], pendingPaths: [], stagedPaths: [newPath],
    currentPaths: [newPath], async persistJournal() { return true; },
    commitBackup: () => backup.uploadBackup(store, 'account-a', {
      tasks: [], documents: [{ id: 'doc-a', imagePath: newPath }], todayPreferences: {},
    }, oldTimestamp, 'stale-device'),
    removePaths: (paths) => images.removeCloudImagePaths({ supabase, uid: 'account-a', paths }),
  });
  assert.equal(conflicted.committed, false);
  assert.equal(conflicted.reason, 'conflict');
  assert.equal(cloud.objects.has(oldPath), true);

  const currentTimestamp = cloud.rows.get('account-a').updated_at;
  const retry = await lifecycle.reconcileCloudImageCommit({
    uid: 'account-a', previousPaths: [oldPath], pendingPaths: [oldPath, newPath], stagedPaths: [],
    currentPaths: [newPath], async persistJournal() { return true; },
    commitBackup: async () => ({ ok: true, ...(await backup.uploadBackup(store, 'account-a', {
      tasks: [], documents: [{ id: 'doc-a', imagePath: newPath }], todayPreferences: {},
    }, currentTimestamp, 'retry')) }),
    removePaths: (paths) => images.removeCloudImagePaths({ supabase, uid: 'account-a', paths }),
  });
  assert.equal(retry.committed, true);
  assert.equal(retry.cleanup, 'complete');
  assert.equal(cloud.objects.has(oldPath), false);
  assert.equal(cloud.objects.has(newPath), true);
  const latest = await backup.fetchBackup(store, 'account-a');
  assert.equal(backup.validateBackupRow(latest.row).payload.documents[0].imagePath, newPath);
  const restored = await images.restoreDocumentImages({
    supabase, uid: 'account-a', documents: [{ id: 'doc-a', uri: null, imagePath: newPath }],
    fs: { docDir: 'file://restore/', async downloadTo() { return true; } },
  });
  assert.equal(restored.downloaded, 1);
  assert.equal(restored.documents[0].imagePath, newPath);
  assert.match(restored.documents[0].uri, /doc-a/);
});

test('explicit cloud-backup deletion keeps image paths journaled until Storage cleanup succeeds', async () => {
  const { lifecycle } = await modules();
  let journal = [];
  let remoteExists = true;
  let cleanupFails = true;
  const args = {
    uid: 'account-a', previousPaths: ['account-a/current.jpg'], pendingPaths: ['account-a/staged.jpg'],
    async persistJournal(paths) { journal = [...paths]; return true; },
    async deleteBackup() {
      assert.deepEqual(journal.sort(), ['account-a/current.jpg', 'account-a/staged.jpg']);
      const deleted = remoteExists ? 1 : 0;
      remoteExists = false;
      return { ok: true, deleted };
    },
    async removePaths(paths) {
      assert.equal(remoteExists, false, 'remote backup must be durably deleted before image removal');
      return cleanupFails ? { ok: false, reason: 'network' } : { ok: true, removed: paths.length };
    },
  };
  const first = await lifecycle.deleteCloudImageBackup(args);
  assert.equal(first.deleted, true);
  assert.equal(first.cleanup, 'pending');
  assert.equal(remoteExists, false);
  assert.deepEqual(journal.sort(), ['account-a/current.jpg', 'account-a/staged.jpg']);

  cleanupFails = false;
  const retry = await lifecycle.deleteCloudImageBackup({ ...args, previousPaths: [], pendingPaths: journal });
  assert.equal(retry.deleted, true);
  assert.equal(retry.cleanup, 'complete');
  assert.deepEqual(journal, []);
});

test('explicit backup deletion does not start after the owner scope changes during journal persistence', async () => {
  const { lifecycle } = await modules();
  let deleted = false;
  let journal = [];
  const result = await lifecycle.deleteCloudImageBackup({
    uid: 'account-a', previousPaths: ['account-a/image.jpg'], pendingPaths: [], isCurrent: () => false,
    async persistJournal(paths) { journal = [...paths]; return true; },
    async deleteBackup() { deleted = true; return { ok: true }; },
    async removePaths() { assert.fail('storage cleanup must not run'); },
  });
  assert.equal(result.deleted, false);
  assert.equal(result.reason, 'stale');
  assert.equal(deleted, false);
  assert.deepEqual(journal, ['account-a/image.jpg']);
});

test('conditional backup deletion cannot remove a newer row committed by another device', async () => {
  const { backup, backupStore: backupStoreModule } = await modules();
  const cloud = new BackupCloud();
  const store = backupStoreModule.createSupabaseBackupStore(cloud.client('account-a'));
  const initial = { tasks: [], documents: [], todayPreferences: {} };
  assert.equal((await backup.uploadBackup(store, 'account-a', initial, null, 'v1')).ok, true);
  const staleTimestamp = cloud.rows.get('account-a').updated_at;
  assert.equal((await backup.uploadBackup(store, 'account-a', { ...initial, tasks: [{ id: 'newer', title: 'Peer' }] }, staleTimestamp, 'peer')).ok, true);
  const latestRow = structuredClone(cloud.rows.get('account-a'));

  const staleDelete = await backup.deleteBackup(store, 'account-a', staleTimestamp);
  assert.deepEqual(staleDelete, { ok: false, reason: 'conflict' });
  assert.deepEqual(cloud.rows.get('account-a'), latestRow);

  const latestDelete = await backup.deleteBackup(store, 'account-a', latestRow.updated_at);
  assert.deepEqual(latestDelete, { ok: true, deleted: 1 });
  assert.equal(cloud.rows.has('account-a'), false);
});

test('App backup preflight treats a concurrent remote-row disappearance as a conflict', async () => {
  const fs = require('node:fs');
  const app = fs.readFileSync(require('node:path').join(__dirname, '../App.js'), 'utf8');
  assert.match(app, /!previous\.ok\s*\|\|\s*!previous\.row\s*\|\|\s*previous\.row\.updated_at !== cloud\.updated_at/);
  assert.match(app, /deleteBackup\(backupStore, uid, meta\.meta \? meta\.meta\.updated_at : null\)/);
});

test('malformed image cleanup journals are rejected before any cleanup candidate is returned', async () => {
  const { images } = await modules();
  assert.deepEqual(images.parseImageCleanupJournal('account-a', null), { ok: true, paths: [] });
  assert.deepEqual(images.parseImageCleanupJournal('account-a', '{broken'), { ok: false, reason: 'json' });
  assert.deepEqual(images.parseImageCleanupJournal('account-a', JSON.stringify({ path: 'account-a/photo.jpg' })), { ok: false, reason: 'format' });
  assert.deepEqual(images.parseImageCleanupJournal('account-a', JSON.stringify(['account-b/private.jpg'])), { ok: false, reason: 'owner' });
  assert.deepEqual(images.parseImageCleanupJournal('account-a', JSON.stringify(['account-a/private.txt'])), { ok: false, reason: 'owner' });
  assert.deepEqual(images.parseImageCleanupJournal('account-a', JSON.stringify(['account-a/photo.jpg', 'account-a/photo.jpg'])), { ok: true, paths: ['account-a/photo.jpg'] });
});

test('device-local data deletion preserves the owner image-cleanup retry journal', async () => {
  const { images, lifecycle } = await modules();
  const fs = require('node:fs');
  const app = fs.readFileSync(require('node:path').join(__dirname, '../App.js'), 'utf8');
  assert.match(app, /localDataResetStorageKeys\(uid,/);
  assert.match(app, /localResetKeys\.map\(removeStorageKey\)/);

  const storage = localStorage({
    'PLAN_TASKS': '[]',
    'PLAN_BACKUP_META:account-a': '{}',
    'PLAN_BACKUP_IMAGE_CLEANUP:account-a': JSON.stringify(['account-a/pending.jpg']),
  });
  const journalKey = images.imageCleanupKey('account-a');
  const keys = lifecycle.localDataResetStorageKeys('account-a', [
    'PLAN_TASKS', 'PLAN_BACKUP_META:account-a', journalKey,
  ]);
  await Promise.all(keys.map((key) => storage.removeItem(key)));
  assert.equal(storage.values.has('PLAN_TASKS'), false);
  assert.equal(storage.values.has('PLAN_BACKUP_META:account-a'), false);
  assert.deepEqual(JSON.parse(storage.values.get(journalKey)), ['account-a/pending.jpg']);
});
