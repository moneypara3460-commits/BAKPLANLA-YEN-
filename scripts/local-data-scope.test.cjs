const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DATA_OWNER_KEY,
  PENDING_SWITCH_KEY,
  accountDeletionKeyFor,
  analyzeAndAddReceiptForCurrentScope,
  deleteLocalAccountScope,
  removeLocalDataScope,
  scopeKey,
  switchLocalDataScope,
} = require('../localDataScope');

const fakeStorage = (seed = {}) => {
  const values = new Map(Object.entries(seed));
  return {
    values,
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) { values.set(key, String(value)); },
    async removeItem(key) { values.delete(key); },
  };
};

test('switching accounts hides prior data and restores it on return', async () => {
  const storage = fakeStorage({
    PLAN_TASKS: JSON.stringify([{ id: 'guest-task' }]),
    PLAN_DOCUMENTS: JSON.stringify([{ id: 'guest-doc', uri: 'file://guest-document.jpg' }]),
  });

  await switchLocalDataScope(storage, 'account-a');
  assert.equal(JSON.parse(storage.values.get(DATA_OWNER_KEY)), 'account-a');
  assert.equal(storage.values.get('PLAN_TASKS'), undefined);
  await storage.setItem('PLAN_TASKS', JSON.stringify([{ id: 'account-a-task' }]));

  await switchLocalDataScope(storage, 'account-b');
  assert.equal(storage.values.get('PLAN_TASKS'), undefined);
  await storage.setItem('PLAN_TASKS', JSON.stringify([{ id: 'account-b-task' }]));

  await switchLocalDataScope(storage, 'account-a');
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_TASKS')), [{ id: 'account-a-task' }]);
  assert.equal(storage.values.get('PLAN_DOCUMENTS'), undefined);
  assert.deepEqual(JSON.parse(JSON.parse(storage.values.get(scopeKey('guest'))).PLAN_TASKS), [{ id: 'guest-task' }]);
  await switchLocalDataScope(storage, null);
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_DOCUMENTS')), [{ id: 'guest-doc', uri: 'file://guest-document.jpg' }]);
});

test('queued shopping-list persistence is captured by A before switching to B and recovers on return', async () => {
  const values = new Map([
    [DATA_OWNER_KEY, JSON.stringify('account-a')],
    ['PLAN_SHOPPING_LIST_V1', JSON.stringify({ items: [{ id: 'a-before' }], version: 2 })],
    ['PLAN_SHOPPING_PLAN_V1', JSON.stringify({ shopDate: '2026-11-04', items: [{ name: 'a-before' }] })],
  ]);
  let releaseWrite;
  let writeStarted;
  let holdFirstWrite = true;
  const started = new Promise((resolve) => { writeStarted = resolve; });
  let tail = Promise.resolve();
  const enqueue = (operation) => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
  const storage = {
    values,
    getItem(key) { return enqueue(() => values.has(key) ? values.get(key) : null); },
    setItem(key, value) {
      return enqueue(async () => {
        if (holdFirstWrite && key === 'PLAN_SHOPPING_LIST_V1' && String(value).includes('a-after')) {
          holdFirstWrite = false;
          writeStarted();
          await new Promise((resolve) => { releaseWrite = resolve; });
        }
        values.set(key, String(value));
      });
    },
    removeItem(key) { return enqueue(() => values.delete(key)); },
  };

  const pendingAWrite = storage.setItem('PLAN_SHOPPING_LIST_V1', JSON.stringify({ items: [{ id: 'a-after' }], version: 2 }));
  await started;
  const switchingToB = switchLocalDataScope(storage, 'account-b');
  releaseWrite();
  await Promise.all([pendingAWrite, switchingToB]);
  assert.deepEqual(JSON.parse(JSON.parse(values.get(scopeKey('account-a'))).PLAN_SHOPPING_LIST_V1).items, [{ id: 'a-after' }]);
  assert.equal(values.has('PLAN_SHOPPING_LIST_V1'), false);

  await storage.setItem('PLAN_SHOPPING_LIST_V1', JSON.stringify({ items: [{ id: 'b-item' }], version: 2 }));
  await storage.setItem('PLAN_SHOPPING_PLAN_V1', JSON.stringify({ shopDate: '2026-11-05', items: [{ name: 'b-item' }] }));
  await switchLocalDataScope(storage, 'account-a');
  assert.deepEqual(JSON.parse(values.get('PLAN_SHOPPING_LIST_V1')).items, [{ id: 'a-after' }]);
  assert.deepEqual(JSON.parse(values.get('PLAN_SHOPPING_PLAN_V1')).items, [{ name: 'a-before' }]);
  assert.deepEqual(JSON.parse(JSON.parse(values.get(scopeKey('account-b'))).PLAN_SHOPPING_LIST_V1).items, [{ id: 'b-item' }]);
});

test('PUSULA answers remain inside the guest or account owner scope', async () => {
  const storage = fakeStorage({ PLAN_COMPASS_RESULT: JSON.stringify({ answers: { q1: 5 } }) });
  await switchLocalDataScope(storage, 'account-a');
  assert.equal(storage.values.get('PLAN_COMPASS_RESULT'), undefined);
  await storage.setItem('PLAN_COMPASS_RESULT', JSON.stringify({ answers: { q1: 2 } }));
  await switchLocalDataScope(storage, 'account-b');
  assert.equal(storage.values.get('PLAN_COMPASS_RESULT'), undefined);
  await storage.setItem('PLAN_COMPASS_RESULT', JSON.stringify({ answers: { q1: 4 } }));
  await switchLocalDataScope(storage, 'account-a');
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_COMPASS_RESULT')), { answers: { q1: 2 } });
  await switchLocalDataScope(storage, null);
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_COMPASS_RESULT')), { answers: { q1: 5 } });
});

test('an interrupted switch is completed before data is returned', async () => {
  const storage = fakeStorage({
    [DATA_OWNER_KEY]: JSON.stringify('account-a'),
    'PLAN_TASKS': JSON.stringify([{ id: 'account-a-task' }]),
  });
  const originalSetItem = storage.setItem.bind(storage);
  let writesBeforeFailure = 2;
  storage.setItem = async (key, value) => {
    if (writesBeforeFailure-- === 0) throw new Error('simulated interruption');
    return originalSetItem(key, value);
  };

  await assert.rejects(switchLocalDataScope(storage, 'account-b'), /simulated interruption/);
  assert.ok(storage.values.has(PENDING_SWITCH_KEY));

  storage.setItem = originalSetItem;
  const result = await switchLocalDataScope(storage, 'account-b');
  assert.equal(result.owner, 'account-b');
  assert.equal(JSON.parse(storage.values.get(DATA_OWNER_KEY)), 'account-b');
  assert.ok(!storage.values.has(PENDING_SWITCH_KEY));
  assert.equal(storage.values.get('PLAN_TASKS'), undefined);
  assert.deepEqual(JSON.parse(JSON.parse(storage.values.get(scopeKey('account-a'))).PLAN_TASKS), [{ id: 'account-a-task' }]);
});

test('corrupt account archives fail closed and can be removed only by the named owner', async () => {
  const storage = fakeStorage({
    [DATA_OWNER_KEY]: JSON.stringify('account-a'),
    [scopeKey('account-b')]: '{corrupt',
    PLAN_TASKS: JSON.stringify([{ id: 'account-a-task' }]),
  });
  await assert.rejects(switchLocalDataScope(storage, 'account-b'), /local_data_snapshot_corrupt/);
  assert.equal(storage.values.get('PLAN_TASKS'), JSON.stringify([{ id: 'account-a-task' }]));
  await removeLocalDataScope(storage, 'account-b');
  assert.equal(storage.values.has(scopeKey('account-b')), false);
});

test('account deletion clears only the active owner and preserves unrelated guest data', async () => {
  const storage = fakeStorage({
    [DATA_OWNER_KEY]: JSON.stringify('account-a'),
    PLAN_TASKS: JSON.stringify([{ id: 'account-a-task' }]),
    PLAN_DOCUMENTS: JSON.stringify([{ id: 'a-doc', uri: 'file://account-a.png' }]),
    PLAN_THEME: 'dark',
    [scopeKey('guest')]: JSON.stringify({ PLAN_TASKS: JSON.stringify([{ id: 'guest-task' }]) }),
    [scopeKey('account-b')]: JSON.stringify({ PLAN_TASKS: JSON.stringify([{ id: 'account-b-task' }]) }),
  });
  const removedImages = [];
  assert.equal(await deleteLocalAccountScope(storage, 'account-a', async (uri) => removedImages.push(uri), ['PLAN_BACKUP_META:account-a']), true);
  assert.deepEqual(removedImages, ['file://account-a.png']);
  assert.equal(storage.values.has(DATA_OWNER_KEY), false);
  assert.equal(storage.values.has(scopeKey('account-a')), false);
  assert.equal(storage.values.get('PLAN_THEME'), 'dark');
  assert.deepEqual(JSON.parse(storage.values.get(scopeKey('guest'))).PLAN_TASKS, JSON.stringify([{ id: 'guest-task' }]));
  assert.deepEqual(JSON.parse(storage.values.get(scopeKey('account-b'))).PLAN_TASKS, JSON.stringify([{ id: 'account-b-task' }]));
});

test('failed local file cleanup keeps an owner-scoped recovery snapshot and succeeds on retry', async () => {
  const storage = fakeStorage({
    [DATA_OWNER_KEY]: JSON.stringify('account-a'),
    PLAN_TASKS: JSON.stringify([{ id: 'account-a-task' }]),
    PLAN_DOCUMENTS: JSON.stringify([{ id: 'a-doc', uri: 'file://account-a.png' }]),
  });
  let fail = true;
  const removeImage = async () => { if (fail) return false; };
  assert.equal(await deleteLocalAccountScope(storage, 'account-a', removeImage), false);
  assert.equal(storage.values.has(scopeKey('account-a')), true);
  const preserved = JSON.parse(storage.values.get(scopeKey('account-a')));
  assert.deepEqual(JSON.parse(preserved.PLAN_TASKS), [{ id: 'account-a-task' }]);
  fail = false;
  assert.equal(await deleteLocalAccountScope(storage, 'account-a', removeImage), true);
  assert.equal(storage.values.has(scopeKey('account-a')), false);
});

test('remote-complete deletion snapshot is not re-archived when switching to guest', async () => {
  const storage = fakeStorage({
    [DATA_OWNER_KEY]: JSON.stringify('account-a'),
    PLAN_TASKS: JSON.stringify([{ id: 'partially-cleared' }]),
    [scopeKey('account-a')]: JSON.stringify({ PLAN_TASKS: JSON.stringify([{ id: 'complete-recovery-copy' }]) }),
    [accountDeletionKeyFor('account-a')]: JSON.stringify({ owner: 'account-a', state: 'remote_complete' }),
  });
  await switchLocalDataScope(storage, null);
  assert.deepEqual(JSON.parse(storage.values.get(scopeKey('account-a'))).PLAN_TASKS, JSON.stringify([{ id: 'complete-recovery-copy' }]));
  assert.equal(storage.values.get('PLAN_TASKS'), undefined);
});

test('startup scope switch preserves active deletion images and unrelated guest/account data', async () => {
  const storage = fakeStorage({
    [DATA_OWNER_KEY]: JSON.stringify('account-a'),
    PLAN_TASKS: JSON.stringify([{ id: 'account-a-active' }]),
    PLAN_DOCUMENTS: JSON.stringify([{ id: 'a-doc', uri: 'file://account-a-active.png' }]),
    [scopeKey('account-a')]: JSON.stringify({ PLAN_DOCUMENTS: JSON.stringify([{ id: 'a-doc-old', uri: 'file://account-a-old.png' }]) }),
    [scopeKey('guest')]: JSON.stringify({ PLAN_TASKS: JSON.stringify([{ id: 'guest-task' }]) }),
    [scopeKey('account-b')]: JSON.stringify({ PLAN_TASKS: JSON.stringify([{ id: 'account-b-task' }]) }),
    [accountDeletionKeyFor('account-a')]: JSON.stringify({ owner: 'account-a', state: 'remote_complete' }),
  });

  await switchLocalDataScope(storage, 'account-b');
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_TASKS')), [{ id: 'account-b-task' }]);
  assert.deepEqual(JSON.parse(storage.values.get(scopeKey('guest'))).PLAN_TASKS, JSON.stringify([{ id: 'guest-task' }]));
  const removedImages = [];
  assert.equal(await deleteLocalAccountScope(storage, 'account-a', async (uri) => removedImages.push(uri)), true);
  assert.deepEqual(removedImages, ['file://account-a-active.png', 'file://account-a-old.png']);
  assert.equal(storage.values.has(scopeKey('account-a')), false);
  assert.deepEqual(JSON.parse(storage.values.get(scopeKey('guest'))).PLAN_TASKS, JSON.stringify([{ id: 'guest-task' }]));
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_TASKS')), [{ id: 'account-b-task' }]);
});

test('a receipt response from a prior account scope is discarded before it reaches the next account', async () => {
  let generation = 1;
  let resolveAnalysis;
  let persistCalls = 0;
  let addCalls = 0;
  const resultPromise = analyzeAndAddReceiptForCurrentScope({
    expectedGeneration: generation,
    isCurrent: (expected) => expected === generation,
    analyzeReceipt: () => new Promise((resolve) => { resolveAnalysis = resolve; }),
    sourceUri: 'file://synthetic-receipt.jpg',
    persistImage: async () => { persistCalls += 1; return 'file://stored-receipt.jpg'; },
    removeImage: async () => {},
    addDocument: () => { addCalls += 1; return { id: 'unexpected' }; },
  });

  generation = 2; // Account switch occurs while the DEV AI receipt request is pending.
  resolveAnalysis({ items: [{ name: 'synthetic item' }] });
  const result = await resultPromise;
  assert.deepEqual(result, { stale: true });
  assert.equal(persistCalls, 0);
  assert.equal(addCalls, 0);
});

test('a receipt image copied during a scope switch is removed instead of attached to the new account', async () => {
  let generation = 1;
  let resolveCopy;
  const removed = [];
  let addCalls = 0;
  const resultPromise = analyzeAndAddReceiptForCurrentScope({
    expectedGeneration: generation,
    isCurrent: (expected) => expected === generation,
    analyzeReceipt: async () => ({ items: [{ name: 'synthetic item' }] }),
    sourceUri: 'file://synthetic-receipt.jpg',
    persistImage: () => new Promise((resolve) => { resolveCopy = resolve; }),
    removeImage: async (uri) => removed.push(uri),
    addDocument: () => { addCalls += 1; return { id: 'unexpected' }; },
  });

  await Promise.resolve();
  generation = 2;
  resolveCopy('file://stored-receipt.jpg');
  assert.deepEqual(await resultPromise, { stale: true });
  assert.deepEqual(removed, ['file://stored-receipt.jpg']);
  assert.equal(addCalls, 0);
});
