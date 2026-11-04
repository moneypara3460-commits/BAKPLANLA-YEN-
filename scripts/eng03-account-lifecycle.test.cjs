const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const localScope = require('../localDataScope');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const storageWith = (seed) => {
  const values = new Map(Object.entries(seed));
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, String(value)); },
    async removeItem(key) { values.delete(key); },
  };
};
const readRestore = async () => require('../restoreDataTransaction');
const keys = ['PLAN_TASKS', 'PLAN_DOCUMENTS', 'PLAN_TODAY_PREFERENCES'];
const valuesFor = (prefix) => ({
  PLAN_TASKS: JSON.stringify([{ id: `${prefix}-task` }]),
  PLAN_DOCUMENTS: JSON.stringify([{ id: `${prefix}-doc` }]),
  PLAN_TODAY_PREFERENCES: JSON.stringify({ location: prefix }),
});

test('restore transaction holds the active owner scope until writes finish before A to B activation', async () => {
  const { commitRestoreData } = await readRestore();
  let generation = 1;
  const storage = storageWith({
    [localScope.DATA_OWNER_KEY]: JSON.stringify('account-a'),
    ...valuesFor('A-before'),
    [localScope.scopeKey('account-b')]: JSON.stringify(valuesFor('B')),
  });
  const current = Object.fromEntries(keys.map((key) => [key, JSON.parse(storage.values.get(key))]));
  const next = {
    PLAN_TASKS: [{ id: 'A-restored' }],
    PLAN_DOCUMENTS: [{ id: 'A-restored-doc' }],
    PLAN_TODAY_PREFERENCES: { location: 'A restored' },
  };
  const writeStarted = deferred();
  const allowWrite = deferred();
  let blocked = false;
  const write = async (key, value) => {
    if (key === 'PLAN_TASKS' && value[0]?.id === 'A-restored' && !blocked) {
      blocked = true;
      writeStarted.resolve();
      await allowWrite.promise;
    }
    await storage.setItem(key, JSON.stringify(value));
    return true;
  };
  const restore = commitRestoreData({
    runScopeBoundOperation: localScope.runScopeBoundOperation,
    expectedGeneration: 1,
    isCurrent: (expected) => expected === generation,
    write,
    snapshotEntry: { key: 'PLAN_PRE_RESTORE:account-a', value: current },
    current,
    next,
  });
  await writeStarted.promise;
  generation = 2;
  const switchToB = localScope.switchLocalDataScope(storage, 'account-b');
  await flush();
  assert.equal(JSON.parse(storage.values.get(localScope.DATA_OWNER_KEY)), 'account-a');
  allowWrite.resolve();
  const committed = await restore;
  await switchToB;
  assert.equal(committed.executed, true);
  assert.equal(committed.result.ok, true);
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_TASKS')), [{ id: 'B-task' }]);
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_DOCUMENTS')), [{ id: 'B-doc' }]);
  const archivedA = JSON.parse(storage.values.get(localScope.scopeKey('account-a')));
  assert.deepEqual(JSON.parse(archivedA.PLAN_TASKS), [{ id: 'A-restored' }]);
  assert.deepEqual(JSON.parse(archivedA.PLAN_DOCUMENTS), [{ id: 'A-restored-doc' }]);
});

test('restore confirmation that resolves after account switch performs no writes', async () => {
  const { commitRestoreData } = await readRestore();
  let generation = 1;
  let writes = 0;
  const blocker = deferred();
  const blockingOperation = localScope.runLocalDataOperation(() => blocker.promise);
  const restore = commitRestoreData({
    runScopeBoundOperation: localScope.runScopeBoundOperation,
    expectedGeneration: 1,
    isCurrent: (expected) => expected === generation,
    write: async () => { writes += 1; return true; },
    snapshotEntry: { key: 'snapshot', value: {} },
    current: {},
    next: { PLAN_TASKS: [] },
  });
  generation = 2;
  blocker.resolve();
  await blockingOperation;
  const result = await restore;
  assert.deepEqual(result, { executed: false, stale: true });
  assert.equal(writes, 0);
});

test('a rejected queued local operation does not deadlock the following owner switch', async () => {
  await assert.rejects(localScope.runLocalDataOperation(async () => { throw new Error('fixture failure'); }), /fixture failure/);
  const storage = storageWith({
    [localScope.DATA_OWNER_KEY]: JSON.stringify('account-a'),
    ...valuesFor('A'),
    [localScope.scopeKey('account-b')]: JSON.stringify(valuesFor('B')),
  });
  const switched = await localScope.switchLocalDataScope(storage, 'account-b');
  assert.equal(switched.owner, 'account-b');
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_TASKS')), [{ id: 'B-task' }]);
});

test('a delayed permission result cannot commit an older account activation after B is active', async () => {
  let currentGeneration = 1;
  let activeScope = 'previous';
  let activeGeneration = 0;
  let session = 'previous';
  let permission = 'undetermined';
  const finishActivation = async (scope, generation, permissionResult) => {
    const resolvedPermission = await permissionResult;
    if (generation !== currentGeneration) return false;
    permission = resolvedPermission;
    activeScope = scope;
    activeGeneration = generation;
    session = scope;
    return true;
  };

  const delayedPermissionA = deferred();
  const activateA = finishActivation('account-a', 1, delayedPermissionA.promise);
  currentGeneration = 2;
  assert.equal(await finishActivation('account-b', 2, Promise.resolve('granted')), true);
  delayedPermissionA.resolve('denied');
  assert.equal(await activateA, false);
  assert.deepEqual({ activeScope, activeGeneration, session, permission }, {
    activeScope: 'account-b', activeGeneration: 2, session: 'account-b', permission: 'granted',
  });
  assert.match(appSource, /const permissionState = await getPermissionState\(\);\s*if \(!mounted \|\| generation !== dataScopeGenerationRef\.current\) return;\s*setNotifPermission\(permissionState\);/);
});

test('owner cleanup and A to B switching serialize around pending image deletion', async () => {
  let startedResolve;
  const imageStarted = new Promise((resolve) => { startedResolve = resolve; });
  const allowImageDelete = deferred();
  const storage = storageWith({
    [localScope.DATA_OWNER_KEY]: JSON.stringify('account-a'),
    PLAN_TASKS: JSON.stringify([{ id: 'A-task' }]),
    PLAN_DOCUMENTS: JSON.stringify([{ id: 'A-doc', uri: 'file://A-image' }]),
    [localScope.scopeKey('account-b')]: JSON.stringify({ PLAN_TASKS: JSON.stringify([{ id: 'B-task' }]) }),
  });
  const cleanup = localScope.deleteLocalAccountScope(storage, 'account-a', async () => {
    startedResolve();
    await allowImageDelete.promise;
  });
  await imageStarted;
  const switchToB = localScope.switchLocalDataScope(storage, 'account-b');
  await flush();
  assert.equal(JSON.parse(storage.values.get(localScope.DATA_OWNER_KEY)), 'account-a');
  allowImageDelete.resolve();
  assert.equal(await cleanup, true);
  await switchToB;
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_TASKS')), [{ id: 'B-task' }]);
});

test('failed restore data write rolls every changed key back before the scope queue releases', async () => {
  const { commitRestoreData } = await readRestore();
  let generation = 1;
  const storage = new Map(keys.map((key) => [key, JSON.stringify({ old: key })]));
  let failedDocuments = false;
  const write = async (key, value) => {
    if (key === 'PLAN_DOCUMENTS' && !failedDocuments && value[0]?.id === 'new-doc') {
      failedDocuments = true;
      return false;
    }
    storage.set(key, JSON.stringify(value));
    return true;
  };
  const current = Object.fromEntries(keys.map((key) => [key, { old: key }]));
  const result = await commitRestoreData({
    runScopeBoundOperation: localScope.runScopeBoundOperation,
    expectedGeneration: 1,
    isCurrent: (expected) => expected === generation,
    write,
    current,
    next: { PLAN_TASKS: [{ id: 'new-task' }], PLAN_DOCUMENTS: [{ id: 'new-doc' }], PLAN_TODAY_PREFERENCES: {} },
  });
  assert.equal(result.executed, true);
  assert.deepEqual(result.result, { ok: false, stage: 'data', rollbackOk: true });
  for (const key of keys) assert.deepEqual(JSON.parse(storage.get(key)), current[key]);
});

test('failed restore rollback retains the recovery snapshot and does not claim prior data was preserved', async () => {
  const { commitRestoreData, restoreFailureReason } = await readRestore();
  const storage = new Map(keys.map((key) => [key, JSON.stringify({ old: key })]));
  let failedNewDocuments = false;
  const write = async (key, value) => {
    if (key === 'PLAN_DOCUMENTS' && !failedNewDocuments && value[0]?.id === 'new-doc') {
      failedNewDocuments = true;
      return false;
    }
    if (key === 'PLAN_TASKS' && value?.old === 'PLAN_TASKS') return false;
    storage.set(key, JSON.stringify(value));
    return true;
  };
  const current = Object.fromEntries(keys.map((key) => [key, { old: key }]));
  const snapshot = { PLAN_TASKS: [{ old: 'PLAN_TASKS' }], PLAN_DOCUMENTS: [{ old: 'PLAN_DOCUMENTS' }] };
  const result = await commitRestoreData({
    runScopeBoundOperation: localScope.runScopeBoundOperation,
    expectedGeneration: 1,
    isCurrent: () => true,
    write,
    snapshotEntry: { key: 'PLAN_PRE_RESTORE:account-a', value: snapshot },
    current,
    next: { PLAN_TASKS: [{ id: 'new-task' }], PLAN_DOCUMENTS: [{ id: 'new-doc' }], PLAN_TODAY_PREFERENCES: {} },
  });
  assert.deepEqual(result.result, { ok: false, stage: 'data', rollbackOk: false });
  assert.deepEqual(JSON.parse(storage.get('PLAN_PRE_RESTORE:account-a')), snapshot);
  assert.equal(restoreFailureReason(result.result), 'other');
  assert.match(appSource, /backupErrorText\(tx, restoreFailureReason\(transaction\.result\)\)/);
});

test('shopping list waits for B scope readiness while A remains active, then reads and saves only B data', async () => {
  let generation = 1;
  let activeGeneration = 1;
  const storage = storageWith({
    [localScope.DATA_OWNER_KEY]: JSON.stringify('account-a'),
    PLAN_SHOPPING_LIST_V1: JSON.stringify({ items: [{ name: 'A item' }] }),
    [localScope.scopeKey('account-b')]: JSON.stringify({ PLAN_SHOPPING_LIST_V1: JSON.stringify({ items: [{ name: 'B item' }] }) }),
  });
  const blocker = deferred();
  const holdQueue = localScope.runLocalDataOperation(() => blocker.promise);
  generation = 2;
  const switchToB = localScope.switchLocalDataScope(storage, 'account-b');
  const isReady = (expected) => localScope.isScopeGenerationReady(expected, generation, activeGeneration);
  assert.equal(JSON.parse(storage.values.get(localScope.DATA_OWNER_KEY)), 'account-a');
  assert.equal(isReady(2), false);

  // The screen's ready gate must prevent a B render from reading A's active key.
  let bReadStarted = false;
  let loaded = [];
  if (isReady(2)) {
    bReadStarted = true;
    const result = await localScope.readScopeBoundValue(2, isReady, () => storage.getItem('PLAN_SHOPPING_LIST_V1'));
    if (!result.stale) loaded = JSON.parse(result.value)?.items || [];
  }
  assert.equal(bReadStarted, false);
  const saveB = localScope.createScopeBoundSave(2, isReady, (key, value) => storage.setItem(key, value));
  const pendingSaveA = saveB('PLAN_SHOPPING_LIST_V1', JSON.stringify({ items: [{ name: 'A item' }] }));

  blocker.resolve();
  await holdQueue;
  await switchToB;
  assert.equal(await pendingSaveA, false);
  activeGeneration = 2;
  assert.equal(isReady(2), true);
  const result = await localScope.readScopeBoundValue(2, isReady, () => storage.getItem('PLAN_SHOPPING_LIST_V1'));
  if (!result.stale) loaded = JSON.parse(result.value)?.items || [];
  assert.deepEqual(loaded, [{ name: 'B item' }]);
  await saveB('PLAN_SHOPPING_LIST_V1', JSON.stringify({ items: loaded }));
  assert.deepEqual(JSON.parse(storage.values.get('PLAN_SHOPPING_LIST_V1')), { items: [{ name: 'B item' }] });
  assert.match(appSource, /dataScopeReady: isReadyDataScope\(dataScopeGenerationRef\.current\)/);
  assert.match(appSource, /if \(!dataScopeReady\) \{\s*return \(\) => \{ active = false; \};\s*\}/);
  assert.match(appSource, /const saveList = createScopeBoundSave\(dataScopeGeneration, isCurrentDataScope/);
});

test('an in-flight A reminder schedule is drained by transition cleanup before B can schedule', async () => {
  let generation = 1;
  const scheduled = deferred();
  const events = [];
  const scheduleA = localScope.runScopeBoundOperation(1, (expected) => expected === generation, async () => {
    events.push('A schedule started');
    await scheduled.promise;
    events.push('A schedule completed');
  });
  await flush();
  generation = 2;
  const cleanupA = localScope.runLocalDataOperation(async () => { events.push('transition cancel'); });
  scheduled.resolve();
  await Promise.all([scheduleA, cleanupA]);
  const scheduleB = await localScope.runScopeBoundOperation(2, (expected) => expected === generation, async () => { events.push('B schedule'); });
  assert.deepEqual(events, ['A schedule started', 'A schedule completed', 'transition cancel', 'B schedule']);
  assert.equal(scheduleB.executed, true);
});

test('App wires restore, undo, shopping-plan, list and opportunity effects through owner-generation guards', () => {
  const restoreStart = appSource.indexOf('const runRestore = async');
  const undoStart = appSource.indexOf('const undoRestore = async', restoreStart);
  const restoreSource = appSource.slice(restoreStart, undoStart);
  assert.ok(restoreStart >= 0 && undoStart > restoreStart);
  assert.ok(restoreSource.indexOf('if (!valid.ok)') >= 0);
  assert.ok(restoreSource.indexOf('if (!valid.ok)') < restoreSource.indexOf('commitRestoreData('));
  assert.match(appSource, /commitRestoreData\(\{[\s\S]*?runScopeBoundOperation[\s\S]*?isCurrent: isCurrentRestore/);
  assert.match(appSource, /commitRestoreData\(\{[\s\S]*?runScopeBoundOperation[\s\S]*?isCurrent: isCurrentUndo/);
  assert.match(appSource, /const resetData = async \(\) => \{[\s\S]*?const targetUserId = userIdRef\.current;[\s\S]*?if \(!isCurrentReset\(\)\) return;/);
  assert.match(appSource, /const deleteLocalData = async \(uid, expectedGeneration\) => \{[\s\S]*?runScopeBoundOperation\(expectedGeneration/);
  assert.match(appSource, /saveShoppingPlan\(\{ shopDate, items, expectedGeneration: dataScopeGeneration \}\)/);
  assert.match(appSource, /refreshShoppingPlanItems\(items, dataScopeGeneration\)/);
  assert.match(appSource, /callSmartJson\(\{ mode: 'receipt', image \}, \(\) => isCurrentDataScope\(requestScopeGeneration\)\)/);
  assert.match(appSource, /requestOpportunities=\{\(analyzedDocuments, isCurrent\) => callSmartJson\([\s\S]*?, isCurrent\)\}/);
  assert.match(appSource, /requestPlaces=\{\(params, isCurrent\) => callSmartJson\(\{ mode: 'places', \.\.\.params \}, isCurrent\)\}/);
  assert.match(appSource, /await runLocalDataOperation\(async \(\) => \{[\s\S]*?syncTaskReminders\(\{ tasks: \[\], prefs: DEFAULT_NOTIF_PREFS, lang \}\);[\s\S]*?cancelShoppingReminder\(\)/);
});
