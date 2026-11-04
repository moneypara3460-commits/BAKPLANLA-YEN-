const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const transformModules = require('@babel/plugin-transform-modules-commonjs');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const migrationDirectory = path.join(root, 'supabase/migrations');
const writeFencing = fs.readFileSync(path.join(migrationDirectory, '20261103170000_fence_shopping_plan_client_writes.sql'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261101120000_shopping_reminder_account_transition_safety.sql'), 'utf8');
const workerGrants = fs.readFileSync(path.join(root, 'supabase/migrations/20261101130000_shopping_reminder_worker_privileges.sql'), 'utf8');
const planGrants = fs.readFileSync(path.join(root, 'supabase/migrations/20261101140000_shopping_plan_client_write_grants.sql'), 'utf8');
const transferGuard = fs.readFileSync(path.join(root, 'supabase/migrations/20261101150000_push_token_owner_transfer_guard.sql'), 'utf8');
const baseline = fs.readFileSync(path.join(root, 'supabase/migrations/20261029190000_initial_catalog_baseline.sql'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'supabase/functions/shopping-reminder/index.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');

const originalJsLoader = require.extensions['.js'];
require.extensions['.js'] = (module, filename) => {
  if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
    return originalJsLoader(module, filename);
  }
  const source = fs.readFileSync(filename, 'utf8');
  const { code } = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename,
    plugins: [transformModules],
  });
  return module._compile(code, filename);
};
const shoppingPlan = require('../shoppingPlan.js');
const pushTokenRegistration = require('../pushTokenRegistration.js');
const { receiptFingerprint } = require('../receipts.js');
const localDataScope = require('../localDataScope.js');
require.extensions['.js'] = originalJsLoader;

test('App imports the shopping-plan contract used by plan persistence and display', () => {
  const match = app.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/shoppingPlan['"]/);
  assert.ok(match, 'App.js must import its shopping-plan contract');
  const imported = new Set(match[1].split(',').map((value) => value.trim()).filter(Boolean));
  for (const name of [
    'SHOPPING_PLAN_KEY', 'buildPlan', 'planItemsFromList', 'homeDistrict',
    'buildReminderText', 'reservePlanWriteRevision', 'savePlanToServer', 'deletePlanFromServer',
    'formatShopDate', 'formatRemindAt', 'lastStoreSummary', 'restoreLocalShoppingReminder', 'istanbulTodayISO',
  ]) assert.ok(imported.has(name), `missing shoppingPlan import: ${name}`);
});

test('local shopping reminder restoration skips ineligible plans and cancels a stale schedule', async () => {
  assert.equal(typeof shoppingPlan.restoreLocalShoppingReminder, 'function');
  const base = {
    plan: { delivery: 'local', shopDate: '2026-11-08', remindAt: '2026-11-07T16:00:00.000Z', items: [{ name: 'Milk', last_price: null, quantity: 1 }] },
    permission: 'granted',
    supported: true,
  };
  let scheduled = 0;
  let cancelled = 0;
  const adapters = {
    isCurrent: () => true,
    schedule: async (payload) => { scheduled += 1; assert.match(payload.body, /Milk/); return { ok: true }; },
    cancel: async () => { cancelled += 1; },
  };
  assert.deepEqual(await shoppingPlan.restoreLocalShoppingReminder({ ...base, plan: { ...base.plan, delivery: 'push' }, ...adapters }), { ok: false, reason: 'delivery' });
  assert.deepEqual(await shoppingPlan.restoreLocalShoppingReminder({ ...base, permission: 'denied', ...adapters }), { ok: false, reason: 'permission' });
  assert.deepEqual(await shoppingPlan.restoreLocalShoppingReminder({ ...base, supported: false, ...adapters }), { ok: false, reason: 'unsupported' });
  assert.equal(scheduled, 0);

  let current = true;
  const staleResult = await shoppingPlan.restoreLocalShoppingReminder({
    ...base,
    isCurrent: () => current,
    schedule: async () => { current = false; return { ok: true }; },
    cancel: async () => { cancelled += 1; },
  });
  assert.deepEqual(staleResult, { ok: false, reason: 'stale' });
  assert.equal(cancelled, 1);
});

test('App reconciles a delayed successful plan write to its owner snapshot after A-to-B switch', async () => {
  const start = app.indexOf('const saveShoppingPlan = async');
  const end = app.indexOf('// Liste değişince aktif planın ürünleri güncellenir', start);
  assert.ok(start >= 0 && end > start);
  const source = `${app.slice(start, end)}\nsaveShoppingPlan;`;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => ({ unref() {} });
  try {
    const values = new Map([
      [localDataScope.DATA_OWNER_KEY, JSON.stringify('account-a')],
      ['PLAN_SHOPPING_LIST_V1', JSON.stringify([{ id: 'a-milk', name: 'Milk' }])],
    ]);
    const storage = {
      async getItem(key) { return values.has(key) ? values.get(key) : null; },
      async setItem(key, value) { values.set(key, String(value)); },
      async removeItem(key) { values.delete(key); },
    };
    let resolveUpsert;
    let revision = 0;
    const supabase = { rpc: (name) => name === 'bakplanla_reserve_shopping_plan_revision'
      ? Promise.resolve({ data: ++revision, error: null })
      : new Promise((resolve) => { resolveUpsert = resolve; }) };
    let currentGeneration = 1;
    let activeGeneration = 1;
    let activeUserId = 'account-a';
    const revisions = new Map();
    const activeDataScopeRef = { current: 'account-a' };
    const setCalls = [];
    const context = {
      buildPlan: shoppingPlan.buildPlan,
      planItemsFromList: shoppingPlan.planItemsFromList,
      homeDistrict: shoppingPlan.homeDistrict,
      buildReminderText: shoppingPlan.buildReminderText,
      reservePlanWriteRevision: shoppingPlan.reservePlanWriteRevision,
      savePlanToServer: shoppingPlan.savePlanToServer,
      SHOPPING_PLAN_KEY: shoppingPlan.SHOPPING_PLAN_KEY,
      notificationsSupported: true,
      Date,
      JSON,
      setShoppingPlanState: (value) => setCalls.push(value),
      userIdRef: { get current() { return activeUserId; } },
      activeDataScopeRef,
      shoppingPlanMutationRevisionRef: { current: revisions },
      documents: [],
      readShoppingItems: async () => [{ id: 'a-milk', name: 'Milk' }],
      registerPushTokenForUser: async () => ({ ok: true }),
      supabase,
      isReadyDataScope: (generation) => localDataScope.isScopeGenerationReady(generation, currentGeneration, activeGeneration),
      runScopeBoundOperation: localDataScope.runScopeBoundOperation,
      createScopeBoundSave: localDataScope.createScopeBoundSave,
      writeOwnerScopedValue: localDataScope.writeOwnerScopedValue,
      AsyncStorage: storage,
    };
    const saveShoppingPlan = vm.runInNewContext(source, context, { timeout: 1000 });
    const shopDate = shoppingPlan.addDays(shoppingPlan.istanbulTodayISO(), 4);
    const pendingSave = saveShoppingPlan({ shopDate, remindAt: shoppingPlan.defaultRemindAt(shopDate), items: [{ id: 'a-milk', name: 'Milk' }], expectedGeneration: 1 });
    while (!resolveUpsert) await new Promise((resolve) => setImmediate(resolve));

    currentGeneration = 2;
    activeUserId = 'account-b';
    activeDataScopeRef.current = 'account-b';
    await localDataScope.switchLocalDataScope(storage, 'account-b');
    activeGeneration = 2;
    await storage.setItem('PLAN_SHOPPING_LIST_V1', JSON.stringify([{ id: 'b-bread', name: 'Bread' }]));
    resolveUpsert({ data: true, error: null });
    const saveResult = await pendingSave;
    assert.equal(saveResult.ok, false);
    assert.equal(saveResult.reason, 'stale');
    assert.equal(setCalls.length, 0, 'stale completion must not update current React state');

    currentGeneration = 3;
    activeUserId = 'account-a';
    activeDataScopeRef.current = 'account-a';
    await localDataScope.switchLocalDataScope(storage, 'account-a');
    activeGeneration = 3;
    const ownerPlan = JSON.parse(await storage.getItem(shoppingPlan.SHOPPING_PLAN_KEY));
    assert.equal(ownerPlan.shopDate, shopDate);
    assert.equal(ownerPlan.delivery, 'push');
    assert.equal(ownerPlan.serverOk, true);
    assert.deepEqual(ownerPlan.items.map((item) => item.name), ['Milk']);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

test('an older A save cannot replace a newer plan after A-to-B-to-A recovery', async () => {
  const start = app.indexOf('const saveShoppingPlan = async');
  const end = app.indexOf('// Liste değişince aktif planın ürünleri güncellenir', start);
  const source = `${app.slice(start, end)}\nsaveShoppingPlan;`;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => ({ unref() {} });
  try {
    const values = new Map([
      [localDataScope.DATA_OWNER_KEY, JSON.stringify('account-a')],
      ['PLAN_SHOPPING_LIST_V1', JSON.stringify([{ id: 'a-item', name: 'Item' }])],
    ]);
    const storage = {
      async getItem(key) { return values.has(key) ? values.get(key) : null; },
      async setItem(key, value) { values.set(key, String(value)); },
      async removeItem(key) { values.delete(key); },
    };
    const pendingUpserts = [];
    let reservedRevision = 0;
    let remotePlan = null;
    const supabase = { rpc: (name, args) => {
      if (name === 'bakplanla_reserve_shopping_plan_revision') return Promise.resolve({ data: ++reservedRevision, error: null });
      if (name === 'bakplanla_save_shopping_plan') return new Promise((resolve) => {
        pendingUpserts.push(() => {
          if (args.p_revision !== reservedRevision) return resolve({ data: false, error: null });
          remotePlan = args;
          return resolve({ data: true, error: null });
        });
      });
      throw new Error(`unexpected RPC ${name}`);
    } };
    let currentGeneration = 1;
    let activeGeneration = 1;
    let activeUserId = 'account-a';
    const activeDataScopeRef = { current: 'account-a' };
    const revisions = new Map();
    const setCalls = [];
    const context = {
      buildPlan: shoppingPlan.buildPlan,
      planItemsFromList: shoppingPlan.planItemsFromList,
      homeDistrict: shoppingPlan.homeDistrict,
      buildReminderText: shoppingPlan.buildReminderText,
      reservePlanWriteRevision: shoppingPlan.reservePlanWriteRevision,
      savePlanToServer: shoppingPlan.savePlanToServer,
      SHOPPING_PLAN_KEY: shoppingPlan.SHOPPING_PLAN_KEY,
      notificationsSupported: true,
      Date, JSON,
      setShoppingPlanState: (value) => setCalls.push(value),
      userIdRef: { get current() { return activeUserId; } },
      activeDataScopeRef,
      shoppingPlanMutationRevisionRef: { current: revisions },
      documents: [],
      readShoppingItems: async () => [{ id: 'a-item', name: 'Item' }],
      registerPushTokenForUser: async () => ({ ok: true }),
      cancelShoppingReminder: async () => ({ ok: true }),
      supabase,
      isReadyDataScope: (generation) => localDataScope.isScopeGenerationReady(generation, currentGeneration, activeGeneration),
      runScopeBoundOperation: localDataScope.runScopeBoundOperation,
      createScopeBoundSave: localDataScope.createScopeBoundSave,
      writeOwnerScopedValue: localDataScope.writeOwnerScopedValue,
      AsyncStorage: storage,
    };
    const saveShoppingPlan = vm.runInNewContext(source, context, { timeout: 1000 });
    const today = shoppingPlan.istanbulTodayISO();
    const firstDate = shoppingPlan.addDays(today, 4);
    const firstSave = saveShoppingPlan({ shopDate: firstDate, remindAt: shoppingPlan.defaultRemindAt(firstDate), items: [{ name: 'Item' }], expectedGeneration: 1 });
    while (pendingUpserts.length < 1) await new Promise((resolve) => setImmediate(resolve));

    currentGeneration = 2;
    activeUserId = 'account-b';
    activeDataScopeRef.current = 'account-b';
    await localDataScope.switchLocalDataScope(storage, 'account-b');
    activeGeneration = 2;
    currentGeneration = 3;
    activeUserId = 'account-a';
    activeDataScopeRef.current = 'account-a';
    await localDataScope.switchLocalDataScope(storage, 'account-a');
    activeGeneration = 3;
    const secondDate = shoppingPlan.addDays(today, 5);
    const secondSave = saveShoppingPlan({ shopDate: secondDate, remindAt: shoppingPlan.defaultRemindAt(secondDate), items: [{ name: 'Item' }], expectedGeneration: 3 });
    while (pendingUpserts.length < 2) await new Promise((resolve) => setImmediate(resolve));

    pendingUpserts[1]();
    assert.equal((await secondSave).ok, true);
    pendingUpserts[0]();
    const staleResult = await firstSave;
    assert.equal(staleResult.ok, false);
    assert.equal(staleResult.reason, 'stale');
    assert.equal(JSON.parse(await storage.getItem(shoppingPlan.SHOPPING_PLAN_KEY)).shopDate, secondDate);
    assert.equal(remotePlan.p_shop_date, secondDate);
    assert.equal(setCalls.length, 1, 'only the latest owner mutation may update React state');
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

test('a local-only plan completing a permission await after sign-in remains with the guest owner', async () => {
  const start = app.indexOf('const saveShoppingPlan = async');
  const end = app.indexOf('// Liste değişince aktif planın ürünleri güncellenir', start);
  const source = `${app.slice(start, end)}\nsaveShoppingPlan;`;
  const values = new Map([
    [localDataScope.DATA_OWNER_KEY, JSON.stringify('guest')],
    ['PLAN_SHOPPING_LIST_V1', JSON.stringify([{ id: 'guest-item', name: 'Guest item' }])],
  ]);
  const storage = {
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) { values.set(key, String(value)); },
    async removeItem(key) { values.delete(key); },
  };
  let resolvePermission;
  let permissionRequested = false;
  let currentGeneration = 1;
  let activeGeneration = 1;
  const activeDataScopeRef = { current: 'guest' };
  const context = {
    buildPlan: shoppingPlan.buildPlan,
    planItemsFromList: shoppingPlan.planItemsFromList,
    homeDistrict: shoppingPlan.homeDistrict,
    buildReminderText: shoppingPlan.buildReminderText,
    SHOPPING_PLAN_KEY: shoppingPlan.SHOPPING_PLAN_KEY,
    notificationsSupported: true,
    Date, JSON,
    setShoppingPlanState() { assert.fail('stale guest completion must not update the signed-in UI'); },
    userIdRef: { current: null },
    activeDataScopeRef,
    shoppingPlanMutationRevisionRef: { current: new Map() },
    documents: [],
    registerPushTokenForUser: async () => ({ ok: false }),
    getPermissionState: () => { permissionRequested = true; return new Promise((resolve) => { resolvePermission = resolve; }); },
    requestPermission: async () => 'granted',
    scheduleShoppingReminder: async () => ({ ok: true }),
    cancelShoppingReminder: async () => {},
    supabase: {},
    isReadyDataScope: (generation) => localDataScope.isScopeGenerationReady(generation, currentGeneration, activeGeneration),
    runScopeBoundOperation: localDataScope.runScopeBoundOperation,
    createScopeBoundSave: localDataScope.createScopeBoundSave,
    writeOwnerScopedValue: localDataScope.writeOwnerScopedValue,
    AsyncStorage: storage,
  };
  const saveShoppingPlan = vm.runInNewContext(source, context, { timeout: 1000 });
  const shopDate = shoppingPlan.addDays(shoppingPlan.istanbulTodayISO(), 4);
  const pending = saveShoppingPlan({ shopDate, remindAt: shoppingPlan.defaultRemindAt(shopDate), items: [{ name: 'Guest item' }], expectedGeneration: 1 });
  while (!permissionRequested) await new Promise((resolve) => setImmediate(resolve));

  currentGeneration = 2;
  activeDataScopeRef.current = 'account-b';
  await localDataScope.switchLocalDataScope(storage, 'account-b');
  activeGeneration = 2;
  resolvePermission('granted');
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale');

  currentGeneration = 3;
  activeDataScopeRef.current = 'guest';
  await localDataScope.switchLocalDataScope(storage, 'guest');
  activeGeneration = 3;
  const guestPlan = JSON.parse(await storage.getItem(shoppingPlan.SHOPPING_PLAN_KEY));
  assert.equal(guestPlan.shopDate, shopDate);
  assert.equal(guestPlan.delivery, 'local');
  assert.equal(await storage.getItem(shoppingPlan.SHOPPING_PLAN_KEY), JSON.stringify(guestPlan));
});

test('a plan survives account switching while authenticated push-token registration is pending', async () => {
  const start = app.indexOf('const saveShoppingPlan = async');
  const end = app.indexOf('// Liste değişince aktif planın ürünleri güncellenir', start);
  const source = `${app.slice(start, end)}\nsaveShoppingPlan;`;
  const values = new Map([
    [localDataScope.DATA_OWNER_KEY, JSON.stringify('account-a')],
    ['PLAN_SHOPPING_LIST_V1', JSON.stringify([{ id: 'a-item', name: 'Item A' }])],
  ]);
  const storage = {
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) { values.set(key, String(value)); },
    async removeItem(key) { values.delete(key); },
  };
  let resolveRegistration;
  let registrationStarted = false;
  let currentGeneration = 1;
  let activeGeneration = 1;
  const activeDataScopeRef = { current: 'account-a' };
  const context = {
    buildPlan: shoppingPlan.buildPlan,
    planItemsFromList: shoppingPlan.planItemsFromList,
    homeDistrict: shoppingPlan.homeDistrict,
    buildReminderText: shoppingPlan.buildReminderText,
    reservePlanWriteRevision: shoppingPlan.reservePlanWriteRevision,
    savePlanToServer: shoppingPlan.savePlanToServer,
    SHOPPING_PLAN_KEY: shoppingPlan.SHOPPING_PLAN_KEY,
    notificationsSupported: true,
    Date, JSON,
    setShoppingPlanState() { assert.fail('stale completion must not update the new account UI'); },
    userIdRef: { current: 'account-a' },
    activeDataScopeRef,
    shoppingPlanMutationRevisionRef: { current: new Map() },
    documents: [],
    registerPushTokenForUser: async () => {
      registrationStarted = true;
      return new Promise((resolve) => { resolveRegistration = resolve; });
    },
    supabase: { rpc(name) {
      assert.equal(name, 'bakplanla_reserve_shopping_plan_revision');
      return Promise.resolve({ data: 1, error: null });
    } },
    isReadyDataScope: (generation) => localDataScope.isScopeGenerationReady(generation, currentGeneration, activeGeneration),
    runScopeBoundOperation: localDataScope.runScopeBoundOperation,
    createScopeBoundSave: localDataScope.createScopeBoundSave,
    writeOwnerScopedValue: localDataScope.writeOwnerScopedValue,
    AsyncStorage: storage,
  };
  const saveShoppingPlan = vm.runInNewContext(source, context, { timeout: 1000 });
  const shopDate = shoppingPlan.addDays(shoppingPlan.istanbulTodayISO(), 4);
  const pending = saveShoppingPlan({ shopDate, remindAt: shoppingPlan.defaultRemindAt(shopDate), items: [{ name: 'Item A' }], expectedGeneration: 1 });
  while (!registrationStarted) await new Promise((resolve) => setImmediate(resolve));

  currentGeneration = 2;
  activeDataScopeRef.current = 'account-b';
  await localDataScope.switchLocalDataScope(storage, 'account-b');
  activeGeneration = 2;
  resolveRegistration({ ok: true });
  const result = await pending;
  assert.equal(result.reason, 'stale');

  currentGeneration = 3;
  activeDataScopeRef.current = 'account-a';
  await localDataScope.switchLocalDataScope(storage, 'account-a');
  activeGeneration = 3;
  const ownerPlan = JSON.parse(await storage.getItem(shoppingPlan.SHOPPING_PLAN_KEY));
  assert.equal(ownerPlan.shopDate, shopDate);
  assert.equal(ownerPlan.delivery, 'local');
  assert.deepEqual(ownerPlan.items.map((item) => item.name), ['Item A']);
});

test('push registration uses the authenticated account-bound RPC and preserves failures', async () => {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => ({ unref() {} });
  try {
    const calls = [];
    const supabase = {
      rpc: async (...args) => { calls.push(args); return { data: true, error: null }; },
    };
    assert.deepEqual(await shoppingPlan.savePushToken(supabase, 'account-b', 'ExpoPushToken[abcdefghijklm]', 'android'), { ok: true });
    assert.deepEqual(calls, [[
      'bakplanla_register_push_token',
      { p_token: 'ExpoPushToken[abcdefghijklm]', p_platform: 'android' },
    ]]);
    assert.deepEqual(await shoppingPlan.savePushToken(supabase, null, 'token', 'android'), { ok: false, reason: 'auth' });
    assert.deepEqual(await shoppingPlan.savePushToken({ rpc: async () => ({ data: null, error: new Error('denied') }) }, 'account-b', 'token', 'android'), { ok: false, reason: 'server' });
    assert.deepEqual(await shoppingPlan.savePushToken({ rpc: async () => { throw new Error('offline'); } }, 'account-b', 'token', 'android'), { ok: false, reason: 'network' });
    const removeCalls = [];
    const deletion = Promise.resolve({ error: null });
    const query = {
      delete() { removeCalls.push(['delete']); return this; },
      eq(field, value) { removeCalls.push([field, value]); return this; },
      then(resolve, reject) { return deletion.then(resolve, reject); },
    };
    assert.deepEqual(await shoppingPlan.deletePushToken({ from: (table) => { removeCalls.push(['from', table]); return query; } }, 'account-a', 'ExpoPushToken[abcdefghijklm]'), { ok: true });
    assert.deepEqual(removeCalls, [['from', 'bakplanla_push_tokens'], ['delete'], ['user_id', 'account-a'], ['token', 'ExpoPushToken[abcdefghijklm]']]);

    const lookupCalls = [];
    const lookupQuery = {
      select(column) { lookupCalls.push(['select', column]); return this; },
      eq(field, value) { lookupCalls.push(['eq', field, value]); return this; },
      limit(value) { lookupCalls.push(['limit', value]); return Promise.resolve({ data: [{ user_id: 'account-a' }], error: null }); },
    };
    assert.deepEqual(await shoppingPlan.hasPushTokenRegistration({ from: (table) => { lookupCalls.push(['from', table]); return lookupQuery; } }, 'account-a'), { ok: true, hasToken: true });
    assert.deepEqual(lookupCalls, [['from', 'bakplanla_push_tokens'], ['select', 'user_id'], ['eq', 'user_id', 'account-a'], ['limit', 1]]);
    assert.deepEqual(await shoppingPlan.hasPushTokenRegistration({ from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }, 'account-a'), { ok: true, hasToken: false });
    assert.deepEqual(await shoppingPlan.hasPushTokenRegistration({ from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: null, error: new Error('denied') }) }) }) }) }, 'account-a'), { ok: false, reason: 'server' });
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

test('registration RPC binds identity, serializes the token, and blocks direct client writes', () => {
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.bakplanla_register_push_token/i);
  assert.match(transferGuard, /SECURITY DEFINER[\s\S]*?auth\.uid\(\)/i);
  assert.match(transferGuard, /pg_advisory_xact_lock\(hashtextextended\(p_token, 0\)\)/);
  assert.match(transferGuard, /GRANT EXECUTE ON FUNCTION public\.bakplanla_register_push_token\(text, text\) TO authenticated/i);
  assert.match(migration, /REVOKE INSERT, UPDATE ON TABLE public\.bakplanla_push_tokens FROM authenticated/i);
  assert.match(transferGuard, /p_token !~ '\^\(Expo\|Exponent\)PushToken\\\[/);
  assert.match(transferGuard, /SELECT min\(user_id::text\)::uuid, count\(DISTINCT user_id\)/i);
  assert.match(transferGuard, /IF v_owner IS NOT NULL AND v_owner <> v_uid THEN\s+RAISE EXCEPTION/i);
  assert.doesNotMatch(transferGuard, /DELETE FROM public\.bakplanla_push_tokens/i);
});

test('shopping-plan writes use identity-bound revision RPCs while worker grants stay separate', () => {
  const sql = planGrants.replace(/^--.*$/gm, '');
  assert.match(writeFencing, /REVOKE INSERT \(user_id, shop_date, remind_at, district, city, items, delivery, updated_at\)[\s\S]*?FROM authenticated/i);
  assert.match(writeFencing, /REVOKE UPDATE \(user_id, shop_date, remind_at, district, city, items, delivery, updated_at\)[\s\S]*?FROM authenticated/i);
  assert.match(writeFencing, /REVOKE DELETE ON TABLE public\.bakplanla_shopping_plans FROM authenticated/i);
  for (const signature of [
    'bakplanla_reserve_shopping_plan_revision(uuid)',
    'bakplanla_save_shopping_plan(uuid, bigint, date, timestamptz, text, text, jsonb, text)',
    'bakplanla_cancel_shopping_plan(uuid)',
  ]) assert.ok(writeFencing.includes(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated`), signature);
  assert.match(writeFencing, /p_expected_user IS DISTINCT FROM v_user/);
  assert.match(writeFencing, /FOR UPDATE/);
  assert.match(writeFencing, /IF v_current_revision IS DISTINCT FROM p_revision THEN\s+RETURN false/);
  assert.match(writeFencing, /Increment before deletion in the same transaction/);
  assert.doesNotMatch(sql, /status|attempts|sent_at|last_message/i);
  assert.match(workerGrants, /GRANT SELECT \(user_id, status, updated_at\)[\s\S]*?GRANT UPDATE \(status, last_message, sent_at\)/);
  assert.match(workerGrants, /GRANT SELECT \(user_id, token\)[\s\S]*?GRANT DELETE ON TABLE public\.bakplanla_push_tokens TO service_role/);
});

test('worker completion is fenced to its exact claimed plan version', () => {
  const finish = worker.slice(worker.indexOf('const finish = async'), worker.indexOf('    try {', worker.indexOf('const finish = async')));
  assert.match(finish, /\.eq\("user_id", plan\.user_id\)/);
  assert.match(finish, /\.eq\("status", "sending"\)/);
  assert.match(finish, /\.eq\("updated_at", plan\.updated_at\)/);
  assert.match(baseline, /for update skip locked/i);
  assert.match(baseline, /status = 'sending' and updated_at < now\(\) - interval '30 minutes'/i);
  assert.match(worker, /AbortSignal\.timeout\(10_000\)/);
  assert.match(worker, /plan\.attempts >= MAX_ATTEMPTS/);
  assert.match(worker, /finish\(plan\.attempts >= MAX_ATTEMPTS \? "failed" : "scheduled"/);
});

test('one-plan-per-user claim contract is protected against fan-out and duplicate claims', async () => {
  assert.match(baseline, /ADD CONSTRAINT "bakplanla_shopping_plans_pkey" PRIMARY KEY \(user_id\)/i);
  const laterMigrationSql = fs.readdirSync(migrationDirectory)
    .filter((name) => name.endsWith('.sql') && name > '20261029190000_initial_catalog_baseline.sql')
    .map((name) => fs.readFileSync(path.join(migrationDirectory, name), 'utf8'))
    .join('\n');
  assert.doesNotMatch(laterMigrationSql, /ALTER\s+TABLE\b[^;]*\bbakplanla_shopping_plans\b[^;]*\bDROP\s+CONSTRAINT\b[^;]*\bbakplanla_shopping_plans_pkey\b/is);

  const claimRpc = baseline.slice(
    baseline.indexOf('CREATE OR REPLACE FUNCTION public.bakplanla_claim_due_shopping_plans'),
    baseline.indexOf('$function$;', baseline.indexOf('CREATE OR REPLACE FUNCTION public.bakplanla_claim_due_shopping_plans')),
  );
  assert.match(claimRpc, /set status = case when attempts >= 3 then 'failed' else 'scheduled' end\s+where status = 'sending' and updated_at < now\(\) - interval '30 minutes'/i);
  assert.match(claimRpc, /where status = 'scheduled' and remind_at < now\(\) - interval '2 days'/i);
  assert.match(claimRpc, /where q\.status = 'scheduled' and q\.remind_at <= now\(\)/i);
  assert.match(claimRpc, /for update skip locked/i);
  assert.match(claimRpc, /where p\.user_id in\s*\(\s*select q\.user_id/i);

  // Model the persisted primary-key invariant and two claimers contending for its single row.
  const plansByOwner = new Map();
  const insertPlan = (plan) => {
    if (plansByOwner.has(plan.user_id)) return false;
    plansByOwner.set(plan.user_id, plan);
    return true;
  };
  const row = { user_id: 'synthetic-a', status: 'scheduled', attempts: 0, remind_at: 1, updated_at: 'created' };
  assert.equal(insertPlan(row), true);
  assert.equal(insertPlan({ ...row, remind_at: 2 }), false);

  let locked = false;
  const claim = async () => {
    if (locked || row.status !== 'scheduled' || row.remind_at > 10) return null;
    locked = true;
    await Promise.resolve();
    row.status = 'sending';
    row.attempts += 1;
    row.updated_at = `claim-${row.attempts}`;
    const result = { ...row };
    locked = false;
    return result;
  };
  const [first, second] = await Promise.all([claim(), claim()]);
  assert.ok(first);
  assert.equal(second, null);
  assert.equal(row.attempts, 1);
  assert.equal(plansByOwner.size, 1);
});

test('completion fence rejects user edits and stale workers after recovery/reclaim', () => {
  const start = worker.indexOf('const finish = async');
  const finish = worker.slice(start, worker.indexOf('    try {', start));
  for (const predicate of [
    /\.eq\("user_id", plan\.user_id\)/,
    /\.eq\("status", "sending"\)/,
    /\.eq\("updated_at", plan\.updated_at\)/,
  ]) assert.match(finish, predicate);

  const matchesFinishFence = (current, claim) => current.user_id === claim.user_id
    && current.status === 'sending'
    && current.updated_at === claim.updated_at;
  const originalClaim = { user_id: 'synthetic-a', status: 'sending', attempts: 1, updated_at: 'claim-1' };
  assert.equal(matchesFinishFence(originalClaim, originalClaim), true);

  const afterUserEdit = { ...originalClaim, status: 'scheduled', attempts: 0, updated_at: 'edit-2' };
  assert.equal(matchesFinishFence(afterUserEdit, originalClaim), false);

  const afterStaleRecoveryAndReclaim = { ...originalClaim, attempts: 2, updated_at: 'claim-3' };
  assert.equal(matchesFinishFence(afterStaleRecoveryAndReclaim, originalClaim), false);
  assert.equal(matchesFinishFence(afterStaleRecoveryAndReclaim, afterStaleRecoveryAndReclaim), true);
});

test('worker uses the tested Expo ticket decision boundary and owner-scoped token cleanup', async () => {
  const { decideExpoPushResponse } = await import('../supabase/functions/shopping-reminder/expoPushDecision.mjs');
  assert.match(worker, /decideExpoPushResponse\(res, list\.length, plan\.attempts, MAX_ATTEMPTS\)/);
  assert.match(worker, /\.eq\("user_id", plan\.user_id\)\.eq\("token", list\[index\]\)/);

  const response = (ok, status, data, jsonError = null) => ({
    ok,
    status,
    async json() {
      if (jsonError) throw jsonError;
      return data;
    },
  });

  assert.deepEqual(await decideExpoPushResponse(response(true, 200, { data: [{ status: 'ok' }, { status: 'ok' }] }), 2, 1, 3), {
    status: 'sent', invalidTokenIndexes: [], outcome: 'accepted_or_permanently_invalid',
  });
  assert.deepEqual(await decideExpoPushResponse(response(true, 200, { data: [
    { status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } },
  ] }), 2, 1, 3), {
    status: 'sent', invalidTokenIndexes: [1], outcome: 'accepted_or_permanently_invalid',
  });
  assert.deepEqual(await decideExpoPushResponse(response(true, 200, { data: [
    { status: 'ok' }, { status: 'error', details: { error: 'MessageRateExceeded' } },
  ] }), 2, 1, 3), {
    status: 'scheduled', invalidTokenIndexes: [], outcome: 'partial_or_rejected',
  });
  assert.deepEqual(await decideExpoPushResponse(response(true, 200, { data: [
    { status: 'ok' }, { status: 'error', details: { error: 'MessageRateExceeded' } },
  ] }), 2, 3, 3), {
    status: 'failed', invalidTokenIndexes: [], outcome: 'partial_or_rejected',
  });
});

test('worker treats incomplete, malformed, and HTTP-error ticket responses as ambiguous/retryable', async () => {
  const { decideExpoPushResponse } = await import('../supabase/functions/shopping-reminder/expoPushDecision.mjs');
  const makeResponse = (ok, status, json) => ({ ok, status, json });

  assert.deepEqual(await decideExpoPushResponse(makeResponse(true, 200, async () => ({ data: [{ status: 'ok' }] })), 2, 1, 3), {
    status: 'scheduled', invalidTokenIndexes: [], outcome: 'ambiguous',
  });
  assert.deepEqual(await decideExpoPushResponse(makeResponse(true, 200, async () => { throw new Error('body unavailable'); }), 1, 1, 3), {
    status: 'scheduled', invalidTokenIndexes: [], outcome: 'ambiguous',
  });
  assert.deepEqual(await decideExpoPushResponse(makeResponse(true, 200, async () => ({ data: { status: 'ok' } })), 1, 1, 3), {
    status: 'scheduled', invalidTokenIndexes: [], outcome: 'ambiguous',
  });
  assert.deepEqual(await decideExpoPushResponse(makeResponse(false, 503, async () => ({ data: [{ status: 'ok' }] })), 1, 3, 3), {
    status: 'failed', invalidTokenIndexes: [], outcome: 'ambiguous',
  });
});

test('failed remote plan cancellation retains the active plan and local reminder', () => {
  const cancel = app.slice(app.indexOf('const cancelShoppingPlan = async'), app.indexOf('/* ---------- tüm veriyi sil ----------'));
  assert.match(cancel, /const deleted = await deletePlanFromServer\(supabase, operationUserId\)/);
  assert.match(cancel, /if \(!deleted\.ok\)[\s\S]*?return false;[\s\S]*?runScopeBoundOperation\(expectedGeneration[\s\S]*?cancelShoppingReminder\(\)[\s\S]*?setShoppingPlanState/);
});

test('shopping list and plan snapshots recover A to B to A without mixing owners', async () => {
  const values = new Map([
    ['PLAN_DATA_OWNER', JSON.stringify('account-a')],
    ['PLAN_SHOPPING_LIST_V1', JSON.stringify({ items: [{ id: 'a-item' }], version: 2 })],
    ['PLAN_SHOPPING_PLAN_V1', JSON.stringify({ shopDate: '2026-11-04', items: [{ name: 'a-item' }] })],
  ]);
  const storage = {
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) { values.set(key, String(value)); },
    async removeItem(key) { values.delete(key); },
  };

  await localDataScope.switchLocalDataScope(storage, 'account-b');
  await storage.setItem('PLAN_SHOPPING_LIST_V1', JSON.stringify({ items: [{ id: 'b-item' }], version: 2 }));
  await storage.setItem('PLAN_SHOPPING_PLAN_V1', JSON.stringify({ shopDate: '2026-11-05', items: [{ name: 'b-item' }] }));
  await localDataScope.switchLocalDataScope(storage, 'account-a');

  assert.deepEqual(JSON.parse(values.get('PLAN_SHOPPING_LIST_V1')).items, [{ id: 'a-item' }]);
  assert.deepEqual(JSON.parse(values.get('PLAN_SHOPPING_PLAN_V1')).items, [{ name: 'a-item' }]);
  const bSnapshot = JSON.parse(values.get(localDataScope.scopeKey('account-b')));
  assert.deepEqual(JSON.parse(bSnapshot.PLAN_SHOPPING_LIST_V1).items, [{ id: 'b-item' }]);
  assert.deepEqual(JSON.parse(bSnapshot.PLAN_SHOPPING_PLAN_V1).items, [{ name: 'b-item' }]);
});

test('late owner writes update only a retained snapshot and never recreate a deleted scope', async () => {
  const values = new Map([
    [localDataScope.DATA_OWNER_KEY, JSON.stringify('account-a')],
    ['PLAN_SHOPPING_LIST_V1', JSON.stringify([{ id: 'a-item' }])],
  ]);
  const storage = {
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) { values.set(key, String(value)); },
    async removeItem(key) { values.delete(key); },
  };
  await localDataScope.switchLocalDataScope(storage, 'account-b');
  await storage.setItem('PLAN_SHOPPING_LIST_V1', JSON.stringify([{ id: 'b-item' }]));

  const saved = await localDataScope.writeOwnerScopedValue(storage, 'account-a', 'PLAN_SHOPPING_PLAN_V1', JSON.stringify({ shopDate: '2026-11-08' }));
  assert.equal(saved, true);
  assert.equal(await storage.getItem('PLAN_SHOPPING_PLAN_V1'), null);
  assert.deepEqual(JSON.parse(values.get('PLAN_SHOPPING_LIST_V1')), [{ id: 'b-item' }]);
  assert.deepEqual(JSON.parse(values.get(localDataScope.scopeKey('account-a'))).PLAN_SHOPPING_PLAN_V1, JSON.stringify({ shopDate: '2026-11-08' }));

  await storage.removeItem(localDataScope.scopeKey('account-a'));
  assert.equal(await localDataScope.writeOwnerScopedValue(storage, 'account-a', 'PLAN_SHOPPING_PLAN_V1', 'late'), false);
  assert.equal(values.has(localDataScope.scopeKey('account-a')), false);
});

test('session activation restores a saved local reminder only after its scope is ready', () => {
  const activate = app.slice(app.indexOf('const activateSession = async'), app.indexOf('const { data: authListener', app.indexOf('const activateSession = async')));
  const ready = activate.indexOf('activeDataScopeGenerationRef.current = generation;');
  const restore = activate.indexOf('restoreLocalShoppingReminder(');
  assert.ok(ready >= 0 && restore > ready);
  assert.match(activate.slice(restore - 120, restore), /runScopeBoundOperation\(generation, isReadyDataScope/);
  assert.match(activate.slice(restore, restore + 350), /permission: permissionState[\s\S]*?supported: notificationsSupported[\s\S]*?schedule: scheduleShoppingReminder[\s\S]*?cancel: cancelShoppingReminder/);
});

test('a delayed plan save and cancellation remain addressed to the initiating account', async () => {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => ({ unref() {} });
  try {
    const values = new Map([
      ['PLAN_DATA_OWNER', JSON.stringify('account-a')],
      ['PLAN_SHOPPING_LIST_V1', JSON.stringify({ items: [{ id: 'a-item' }] })],
    ]);
    const storage = {
      async getItem(key) { return values.has(key) ? values.get(key) : null; },
      async setItem(key, value) { values.set(key, String(value)); },
      async removeItem(key) { values.delete(key); },
    };
    let resolveSave;
    let resolveDelete;
    const calls = [];
    const supabase = { rpc(name, args) {
      calls.push([name, args]);
      if (name === 'bakplanla_save_shopping_plan') return new Promise((resolve) => { resolveSave = resolve; });
      if (name === 'bakplanla_cancel_shopping_plan') return new Promise((resolve) => { resolveDelete = resolve; });
      return Promise.resolve({ data: 7, error: null });
    } };
    const savePromise = shoppingPlan.savePlanToServer(supabase, 'account-a', {
      plan: { shopDate: '2026-11-04', remindAt: '2026-11-03T16:00:00.000Z' },
      items: [{ name: 'a-item', quantity: 1 }], district: null, city: null, delivery: 'push', revision: 7,
    });
    await localDataScope.switchLocalDataScope(storage, 'account-b');
    await storage.setItem('PLAN_SHOPPING_LIST_V1', JSON.stringify({ items: [{ id: 'b-item' }] }));
    resolveSave({ data: true, error: null });
    assert.deepEqual(await savePromise, { ok: true });
    assert.equal(calls[0][0], 'bakplanla_save_shopping_plan');
    assert.equal(calls[0][1].p_expected_user, 'account-a');
    assert.equal(calls[0][1].p_revision, 7);

    const deletePromise = shoppingPlan.deletePlanFromServer(supabase, 'account-a');
    await localDataScope.switchLocalDataScope(storage, 'account-a');
    resolveDelete({ data: true, error: null });
    assert.deepEqual(await deletePromise, { ok: true });
    assert.deepEqual(calls.filter((call) => call[0] === 'bakplanla_cancel_shopping_plan'), [[
      'bakplanla_cancel_shopping_plan', { p_expected_user: 'account-a' },
    ]]);
    assert.deepEqual(JSON.parse(values.get('PLAN_SHOPPING_LIST_V1')).items, [{ id: 'a-item' }]);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

test('revision reservation and stale server responses are explicit and fail safely', async () => {
  assert.deepEqual(await shoppingPlan.reservePlanWriteRevision(null, 'account-a'), { ok: false, reason: 'auth' });
  assert.deepEqual(await shoppingPlan.reservePlanWriteRevision({ rpc: async () => ({ data: '12', error: null }) }, 'account-a'), { ok: true, revision: 12 });
  assert.deepEqual(await shoppingPlan.reservePlanWriteRevision({ rpc: async () => ({ data: 0, error: null }) }, 'account-a'), { ok: false, reason: 'server' });
  assert.deepEqual(await shoppingPlan.savePlanToServer({ rpc() { assert.fail('invalid revision must not call the server'); } }, 'account-a', {
    plan: { shopDate: '2026-11-04', remindAt: '2026-11-03T16:00:00.000Z' }, items: [], delivery: 'local', revision: null,
  }), { ok: false, reason: 'revision' });
  const calls = [];
  const stale = await shoppingPlan.savePlanToServer({ rpc: async (...args) => { calls.push(args); return { data: false, error: null }; } }, 'account-a', {
    plan: { shopDate: '2026-11-04', remindAt: '2026-11-03T16:00:00.000Z' }, items: [], delivery: 'local', revision: 11,
  });
  assert.deepEqual(stale, { ok: false, reason: 'stale' });
  assert.equal(calls[0][0], 'bakplanla_save_shopping_plan');
  assert.equal(calls[0][1].p_expected_user, 'account-a');
  assert.equal(calls[0][1].p_revision, 11);
});

test('server cancellation fences an already-dispatched older save from resurrecting the plan', async () => {
  let latestRevision = 0;
  let remotePlan = { shop_date: '2026-11-04' };
  let resolveDelayedSave;
  const supabase = { rpc(name, args) {
    if (name === 'bakplanla_reserve_shopping_plan_revision') return Promise.resolve({ data: ++latestRevision, error: null });
    if (name === 'bakplanla_save_shopping_plan') return new Promise((resolve) => { resolveDelayedSave = () => resolve({ data: args.p_revision === latestRevision, error: null }); });
    if (name === 'bakplanla_cancel_shopping_plan') {
      latestRevision += 1;
      remotePlan = null;
      return Promise.resolve({ data: true, error: null });
    }
    throw new Error(`unexpected RPC ${name}`);
  } };

  const oldRevision = await shoppingPlan.reservePlanWriteRevision(supabase, 'account-a');
  const delayedSave = shoppingPlan.savePlanToServer(supabase, 'account-a', {
    plan: { shopDate: '2026-11-04', remindAt: '2026-11-03T16:00:00.000Z' },
    items: [], district: null, city: null, delivery: 'local', revision: oldRevision.revision,
  });
  assert.deepEqual(await shoppingPlan.deletePlanFromServer(supabase, 'account-a'), { ok: true });
  resolveDelayedSave();
  assert.deepEqual(await delayedSave, { ok: false, reason: 'stale' });
  assert.equal(remotePlan, null);
});

test('duplicate receipt identity removes the newly copied orphan image', async () => {
  let generation = 4;
  const receipt = { store: { type: 'market', chain: 'Test Market', district: 'Kadıköy' }, date: '2026-11-01', time: '12:30', total: 125.5, items: [{ name: 'Milk' }] };
  const savedFingerprints = new Set([receiptFingerprint(receipt)]);
  const removedImages = [];
  const result = await localDataScope.analyzeAndAddReceiptForCurrentScope({
    expectedGeneration: generation,
    isCurrent: (expected) => expected === generation,
    analyzeReceipt: async () => receipt,
    sourceUri: 'file://new-receipt.png',
    persistImage: async () => 'file://stored-duplicate.png',
    removeImage: async (uri) => { removedImages.push(uri); },
    addDocument: (value) => savedFingerprints.has(receiptFingerprint(value)) ? { duplicate: true, id: 'existing-receipt' } : { duplicate: false, id: 'new-receipt' },
  });
  assert.equal(result.duplicate, true);
  assert.equal(result.id, 'existing-receipt');
  assert.deepEqual(removedImages, ['file://stored-duplicate.png']);
});

test('local reminder fallback text uses the active plan items and excludes checked items', () => {
  const source = [
    { id: 'open', name: 'Milk', quantity: 2, unit: 'lt', checked: false, lastPrice: 25, lastStore: 'Test Market' },
    { id: 'done', name: 'Bread', checked: true },
  ];
  const planItems = shoppingPlan.planItemsFromList(source);
  assert.deepEqual(planItems.map((item) => item.name), ['Milk']);
  assert.match(shoppingPlan.buildReminderText(planItems, '2026-11-03', '2026-11-02T16:00:00.000Z').body, /Milk/);
  assert.doesNotMatch(shoppingPlan.buildReminderText(planItems, '2026-11-03', '2026-11-02T16:00:00.000Z').body, /Bread/);
});

test('token rebinding runs after an already-granted account session without requesting permission', () => {
  assert.match(app, /if \(!userId \|\| !pushProjectId \|\| notifPermission !== 'granted'\)/);
  assert.match(app, /getToken: \(\) => getPushTokenSafe\(pushProjectId\)/);
  assert.match(app, /PUSH_TOKEN_STORAGE_KEY = 'PLAN_EXPO_PUSH_TOKEN_V1'/);
  assert.match(app, /SecureStore\.setItemAsync\(PUSH_TOKEN_STORAGE_KEY, token\)/);
  assert.match(app, /loadStoredToken: loadStoredPushToken[\s\S]*?removeStoredToken: removeStoredPushToken/);
  assert.match(app, /pushRegistrationQueueRef\.current\.sessionChanged\(userId\)/);
  assert.match(app, /prepareSignOut\(currentUid,\s*\{[\s\S]*?supabase\.auth\.signOut\(\)/);
  assert.match(app, /requireToken: shoppingPlan\?\.delivery === 'push'/);
  assert.doesNotMatch(app, /requestPermissionsAsync\(\)[\s\S]{0,200}savePushToken/);
});

test('sign-out drains a delayed token lookup and prevents stale-account registration', async () => {
  let resolveFirstLookup;
  let lookupCount = 0;
  const events = [];
  let activeUid = 'account-a';
  const token = 'ExpoPushToken[abcdefghijklm]';
  const queue = pushTokenRegistration.createPushTokenRegistrationQueue({
    getCurrentUid: () => activeUid,
    getToken: () => {
      lookupCount += 1;
      events.push(`lookup-${lookupCount}`);
      if (lookupCount === 1) return new Promise((resolve) => { resolveFirstLookup = resolve; });
      return Promise.resolve(token);
    },
    loadStoredToken: async () => null,
    storeToken: async () => true,
    removeStoredToken: async () => {},
    saveToken: async () => { events.push('register'); return { ok: true }; },
    removeToken: async (uid, value) => { events.push(`remove:${uid}:${value}`); return { ok: true }; },
  });

  const registration = queue.register('account-a');
  while (!resolveFirstLookup) await new Promise((resolve) => setImmediate(resolve));
  const signOut = queue.prepareSignOut('account-a');
  resolveFirstLookup(token);
  const [registrationResult, cleanupResult] = await Promise.all([registration, signOut]);

  assert.deepEqual(registrationResult, { ok: false, reason: 'auth' });
  assert.deepEqual(cleanupResult, { ok: true });
  assert.deepEqual(events, ['lookup-1', 'lookup-2', `remove:account-a:${token}`]);
  activeUid = null;
  queue.sessionChanged(activeUid);
});

test('stored installation token is removed after restart even if notification permission was revoked', async () => {
  const token = 'ExpoPushToken[abcdefghijklm]';
  let storedToken = null;
  let owner = null;
  let activeUid = 'account-a';
  const firstSession = pushTokenRegistration.createPushTokenRegistrationQueue({
    getCurrentUid: () => activeUid,
    getToken: async () => token,
    loadStoredToken: async () => storedToken,
    storeToken: async (value) => { storedToken = value; return true; },
    removeStoredToken: async () => { storedToken = null; },
    saveToken: async (uid) => { owner = uid; return { ok: true }; },
    removeToken: async (uid, value) => { if (owner === uid && value === token) owner = null; return { ok: true }; },
  });
  assert.deepEqual(await firstSession.register('account-a'), { ok: true });
  assert.equal(owner, 'account-a');
  firstSession.sessionChanged(null);

  activeUid = 'account-a';
  const afterRestart = pushTokenRegistration.createPushTokenRegistrationQueue({
    getCurrentUid: () => activeUid,
    getToken: async () => null,
    loadStoredToken: async () => storedToken,
    storeToken: async (value) => { storedToken = value; return true; },
    removeStoredToken: async () => { storedToken = null; },
    saveToken: async (uid) => { owner = uid; return { ok: true }; },
    removeToken: async (uid, value) => { if (owner === uid && value === token) owner = null; return { ok: true }; },
  });
  assert.deepEqual(await afterRestart.prepareSignOut('account-a'), { ok: true });
  assert.equal(owner, null);
  assert.equal(storedToken, null);

  activeUid = 'account-b';
  afterRestart.sessionChanged(activeUid);
  const reenabled = pushTokenRegistration.createPushTokenRegistrationQueue({
    getCurrentUid: () => activeUid,
    getToken: async () => token,
    loadStoredToken: async () => storedToken,
    storeToken: async (value) => { storedToken = value; return true; },
    removeStoredToken: async () => { storedToken = null; },
    saveToken: async (uid) => { owner = uid; return { ok: true }; },
    removeToken: async (uid, value) => { if (owner === uid && value === token) owner = null; return { ok: true }; },
  });
  assert.deepEqual(await reenabled.register('account-b'), { ok: true });
  assert.equal(owner, 'account-b');

  const missingLegacyToken = pushTokenRegistration.createPushTokenRegistrationQueue({
    getCurrentUid: () => activeUid,
    getToken: async () => null,
    loadStoredToken: async () => null,
    storeToken: async () => true,
    removeStoredToken: async () => {},
    saveToken: async () => ({ ok: true }),
    removeToken: async () => ({ ok: true }),
  });
  assert.deepEqual(await missingLegacyToken.prepareSignOut('account-b', { requireToken: true }), { ok: false, reason: 'token' });
});

test('legacy remote token without local token is not silently left bound on sign-out', async () => {
  let activeUid = 'legacy-account';
  let remoteBinding = true;
  let checkAvailable = true;
  const removed = [];
  const queue = pushTokenRegistration.createPushTokenRegistrationQueue({
    getCurrentUid: () => activeUid,
    getToken: async () => null,
    loadStoredToken: async () => null,
    storeToken: async () => true,
    removeStoredToken: async () => {},
    hasRegisteredToken: async () => checkAvailable ? ({ ok: true, hasToken: remoteBinding }) : ({ ok: false, reason: 'network' }),
    saveToken: async () => ({ ok: true }),
    removeToken: async (uid, token) => { removed.push([uid, token]); return { ok: true }; },
  });

  assert.deepEqual(await queue.prepareSignOut('legacy-account'), { ok: false, reason: 'registered-token' });
  assert.deepEqual(removed, []);
  assert.deepEqual(await queue.prepareSignOut('legacy-account', { allowUnresolved: true }), { ok: true, unresolved: true });
  assert.deepEqual(removed, []);

  checkAvailable = false;
  assert.deepEqual(await queue.prepareSignOut('legacy-account'), { ok: false, reason: 'registration-check' });
  assert.deepEqual(await queue.prepareSignOut('legacy-account', { allowUnresolved: true }), { ok: true, unresolved: true });

  checkAvailable = true;
  remoteBinding = false;
  assert.deepEqual(await queue.prepareSignOut('legacy-account'), { ok: true });
  activeUid = null;
  queue.sessionChanged(activeUid);
});

test('account transition during legacy binding lookup cancels the stale sign-out decision', async () => {
  let resolveBinding;
  let activeUid = 'account-a';
  const removed = [];
  const queue = pushTokenRegistration.createPushTokenRegistrationQueue({
    getCurrentUid: () => activeUid,
    getToken: async () => null,
    loadStoredToken: async () => null,
    storeToken: async () => true,
    removeStoredToken: async () => {},
    hasRegisteredToken: () => new Promise((resolve) => { resolveBinding = resolve; }),
    saveToken: async () => ({ ok: true }),
    removeToken: async (uid, token) => { removed.push([uid, token]); return { ok: true }; },
  });

  const signOut = queue.prepareSignOut('account-a');
  while (!resolveBinding) await new Promise((resolve) => setImmediate(resolve));
  activeUid = 'account-b';
  queue.sessionChanged(activeUid);
  resolveBinding({ ok: true, hasToken: true });
  assert.deepEqual(await signOut, { ok: false, reason: 'auth' });
  assert.deepEqual(removed, []);
});
