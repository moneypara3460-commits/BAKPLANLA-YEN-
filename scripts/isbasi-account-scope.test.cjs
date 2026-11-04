const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const {
  DATA_OWNER_KEY,
  createScopeBoundSave,
  scopeKey,
  switchLocalDataScope,
} = require('../localDataScope');

const apiUrl = pathToFileURL(path.join(__dirname, '..', 'isbasiApi.js'));
const apiPromise = import(apiUrl);
const ISBASI_KEY = 'BAKPLANLA_ISBASI_PROGRESS';
const ISBASI_PENDING_KEY = 'BAKPLANLA_ISBASI_PENDING_FINISH';
const ISBASI_SERVER_CACHE_KEY = 'BAKPLANLA_ISBASI_SERVER_CACHE';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const serialStorage = (seed = {}) => {
  const values = new Map(Object.entries(seed));
  let queue = Promise.resolve();
  let beforeSet = null;
  let failSetKey = null;
  const enqueue = (work) => {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };
  return {
    values,
    setBeforeHook(hook) { beforeSet = hook; },
    failNextSet(key) { failSetKey = key; },
    getItem(key) { return enqueue(() => values.has(key) ? values.get(key) : null); },
    setItem(key, value) {
      return enqueue(async () => {
        if (beforeSet) await beforeSet(key, value);
        if (failSetKey === key) {
          failSetKey = null;
          throw new Error('synthetic storage interruption');
        }
        values.set(key, String(value));
      });
    },
    removeItem(key) { return enqueue(() => values.delete(key)); },
  };
};

const readJson = (storage, key) => JSON.parse(storage.values.get(key));
const makeScopedSave = (storage, expectedGeneration, getGeneration) => createScopeBoundSave(
  expectedGeneration,
  (expected) => expected === getGeneration(),
  async (key, value) => {
    try {
      await storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
);
const makeUnscopedSave = (storage) => async (key, value) => {
  try { await storage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
};

const accountData = (prefix) => ({
  [ISBASI_KEY]: JSON.stringify({ owner: prefix, progress: 4 }),
  [ISBASI_PENDING_KEY]: JSON.stringify({ shiftId: `${prefix}-pending`, log: [], endT: 1, savedAt: 1 }),
  [ISBASI_SERVER_CACHE_KEY]: JSON.stringify({ owner: prefix, progress: 5 }),
});

const seedStorage = () => serialStorage({
  [DATA_OWNER_KEY]: JSON.stringify('account-a'),
  ...accountData('account-a'),
  [scopeKey('account-b')]: JSON.stringify(accountData('account-b')),
});

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('timed out waiting for deterministic deferred operation');
};

test('control reproduces the old unscoped cleanup and cache writes overwriting B after A server completion', async () => {
  const { finishWithDurablePending } = await apiPromise;
  const storage = seedStorage();
  const pendingA = { shiftId: 'shift-a-control', log: [], endT: 1, savedAt: 9 };
  const serverResponse = deferred();
  const save = makeUnscopedSave(storage);
  const finishing = finishWithDurablePending(pendingA, {
    persist: (value) => save(ISBASI_PENDING_KEY, value),
    submit: async () => serverResponse.promise,
    clear: () => save(ISBASI_PENDING_KEY, null),
  });
  await waitFor(() => storage.values.has(ISBASI_PENDING_KEY) && readJson(storage, ISBASI_PENDING_KEY).shiftId === pendingA.shiftId);
  await switchLocalDataScope(storage, 'account-b');
  assert.equal(readJson(storage, ISBASI_PENDING_KEY).shiftId, 'account-b-pending');

  serverResponse.resolve({ ok: true, data: { progress: { owner: 'account-a' } } });
  assert.equal((await finishing).ok, true);
  assert.equal(await save(ISBASI_SERVER_CACHE_KEY, { owner: 'account-a' }), true);
  assert.equal(readJson(storage, ISBASI_PENDING_KEY), null, 'the stale A cleanup erased B pending state');
  assert.equal(readJson(storage, ISBASI_SERVER_CACHE_KEY).owner, 'account-a', 'the stale A cache replaced B progress');
});

test('A pending write already in the storage queue is archived to A; late completion cannot clear or cache into B and A can recover on return', async () => {
  const { finishWithDurablePending, ISBASI_PENDING_KEY: apiPendingKey, ISBASI_SERVER_CACHE_KEY: apiCacheKey } = await apiPromise;
  assert.equal(apiPendingKey, ISBASI_PENDING_KEY);
  assert.equal(apiCacheKey, ISBASI_SERVER_CACHE_KEY);
  const storage = seedStorage();
  let generation = 1;
  const persistStarted = deferred();
  const releasePersist = deferred();
  storage.setBeforeHook(async (key, value) => {
    if (key === ISBASI_PENDING_KEY && JSON.parse(value).shiftId === 'shift-a') {
      storage.setBeforeHook(null);
      persistStarted.resolve();
      await releasePersist.promise;
    }
  });

  const pendingA = { shiftId: 'shift-a', log: [[250, 1, 'milk']], endT: 900, savedAt: 10 };
  const serverResponse = deferred();
  let submitStarted = false;
  let submitCount = 0;
  const saveA = makeScopedSave(storage, 1, () => generation);
  const finishingA = finishWithDurablePending(pendingA, {
    persist: (value) => saveA(ISBASI_PENDING_KEY, value),
    submit: async () => { submitStarted = true; submitCount += 1; return serverResponse.promise; },
    clear: () => saveA(ISBASI_PENDING_KEY, null),
  });

  await persistStarted.promise;
  generation = 2;
  let switched = false;
  const switchingToB = switchLocalDataScope(storage, 'account-b').then((result) => { switched = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(switched, false, 'scope switch waits behind the in-flight A write in the storage queue');

  releasePersist.resolve();
  await waitFor(() => submitStarted);
  await switchingToB;
  assert.equal(JSON.parse(storage.values.get(DATA_OWNER_KEY)), 'account-b');
  assert.equal(readJson(storage, ISBASI_PENDING_KEY).shiftId, 'account-b-pending');
  assert.equal(readJson(storage, ISBASI_SERVER_CACHE_KEY).owner, 'account-b');
  assert.equal(readJson(storage, scopeKey('account-a'))[ISBASI_PENDING_KEY], JSON.stringify(pendingA));

  serverResponse.resolve({ ok: true, kind: undefined, data: { progress: { owner: 'account-a' } } });
  const completedA = await finishingA;
  assert.equal(completedA.ok, true);
  assert.equal(await saveA(ISBASI_SERVER_CACHE_KEY, { owner: 'stale-account-a-result' }), false);
  assert.equal(readJson(storage, ISBASI_PENDING_KEY).shiftId, 'account-b-pending', 'A completion did not clear B pending data');
  assert.equal(readJson(storage, ISBASI_SERVER_CACHE_KEY).owner, 'account-b', 'A completion did not replace B cache');

  generation = 3;
  await switchLocalDataScope(storage, 'account-a');
  assert.equal(readJson(storage, ISBASI_PENDING_KEY).shiftId, 'shift-a');
  assert.equal(readJson(storage, ISBASI_KEY).owner, 'account-a');
  const saveReturnedA = makeScopedSave(storage, 3, () => generation);
  let replayCount = 0;
  const recovered = await finishWithDurablePending(pendingA, {
    persist: (value) => saveReturnedA(ISBASI_PENDING_KEY, value),
    submit: async (shiftId) => {
      replayCount += 1;
      assert.equal(shiftId, 'shift-a');
      return { ok: true, data: { progress: { owner: 'account-a', replayed: true } } };
    },
    clear: () => saveReturnedA(ISBASI_PENDING_KEY, null),
  });
  assert.equal(recovered.ok, true);
  assert.equal(replayCount, 1);
  assert.equal(readJson(storage, ISBASI_PENDING_KEY), null);
  assert.equal(await saveReturnedA(ISBASI_SERVER_CACHE_KEY, { owner: 'account-a', progress: 8 }), true);
  await switchLocalDataScope(storage, 'account-b');
  assert.equal(readJson(storage, ISBASI_PENDING_KEY).shiftId, 'account-b-pending');
  assert.equal(readJson(storage, ISBASI_SERVER_CACHE_KEY).owner, 'account-b');
});

test('an interrupted A to B scope switch recovers its journal without letting A cleanup overwrite B', async () => {
  const { finishWithDurablePending, ISBASI_PENDING_KEY: apiPendingKey } = await apiPromise;
  assert.equal(apiPendingKey, ISBASI_PENDING_KEY);
  const storage = seedStorage();
  let generation = 1;
  const pendingA = { shiftId: 'shift-a-interrupted', log: [[300, 1]], endT: 700, savedAt: 11 };
  const serverResponse = deferred();
  const saveA = makeScopedSave(storage, 1, () => generation);
  const finishingA = finishWithDurablePending(pendingA, {
    persist: (value) => saveA(ISBASI_PENDING_KEY, value),
    submit: async () => serverResponse.promise,
    clear: () => saveA(ISBASI_PENDING_KEY, null),
  });
  await waitFor(() => storage.values.has(ISBASI_PENDING_KEY) && readJson(storage, ISBASI_PENDING_KEY).shiftId === pendingA.shiftId);

  generation = 2;
  storage.failNextSet(DATA_OWNER_KEY);
  await assert.rejects(switchLocalDataScope(storage, 'account-b'), /synthetic storage interruption/);
  assert.ok(storage.values.has('PLAN_DATA_OWNER_SWITCH_PENDING'));

  await switchLocalDataScope(storage, 'account-b');
  assert.equal(JSON.parse(storage.values.get(DATA_OWNER_KEY)), 'account-b');
  assert.equal(readJson(storage, ISBASI_PENDING_KEY).shiftId, 'account-b-pending');
  assert.equal(readJson(storage, ISBASI_SERVER_CACHE_KEY).owner, 'account-b');
  serverResponse.resolve({ ok: true, data: { progress: { owner: 'account-a' } } });
  assert.equal((await finishingA).ok, true);
  assert.equal(await saveA(ISBASI_PENDING_KEY, null), false);
  assert.equal(await saveA(ISBASI_SERVER_CACHE_KEY, { owner: 'stale-account-a-result' }), false);
  assert.equal(readJson(storage, ISBASI_PENDING_KEY).shiftId, 'account-b-pending');
  assert.equal(readJson(storage, ISBASI_SERVER_CACHE_KEY).owner, 'account-b');

  generation = 3;
  await switchLocalDataScope(storage, 'account-a');
  assert.equal(readJson(storage, ISBASI_PENDING_KEY).shiftId, pendingA.shiftId);
  assert.equal(readJson(storage, ISBASI_KEY).owner, 'account-a');
});

test('the mounted İş Başı lifecycle binds pending, cache and local-progress writes to its captured scope generation', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const screen = fs.readFileSync(path.join(__dirname, '..', 'IsBasiScreen.js'), 'utf8');
  assert.match(screen, /dataScopeGeneration, isCurrentDataScope/);
  assert.match(screen, /createScopeBoundSave\(dataScopeGeneration, isCurrentDataScope, saveValue\)/);
  assert.match(screen, /persist: \(value\) => saveScopedValue\(ISBASI_PENDING_KEY, value\)/);
  assert.match(screen, /clear: \(\) => saveScopedValue\(ISBASI_PENDING_KEY, null\)/);
  assert.match(screen, /saveScopedValue\(ISBASI_SERVER_CACHE_KEY/);
  assert.match(screen, /saveScopedValue\(ISBASI_KEY, applied\.progress\)/);
  assert.match(screen, /if \(!isCurrentDataScope\(dataScopeGeneration\)\) return;/);
  assert.doesNotMatch(screen, /saveValue\(ISBASI_(?:KEY|SERVER_CACHE_KEY|PENDING_KEY)/);
});
