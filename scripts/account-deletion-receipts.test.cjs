const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appSource = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const {
  createDeletionReceiptStore,
  credentialFromRandomBytes,
  getOrCreateDeletionReceipt,
} = require('../accountDeletionReceipts');

test('generates a 256-bit opaque hex credential from secure random bytes', () => {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);
  const credential = credentialFromRandomBytes(bytes);
  assert.equal(credential.length, 64);
  assert.match(credential, /^[0-9a-f]{64}$/);
  assert.throws(() => credentialFromRandomBytes(new Uint8Array(31)), /secure_random_unavailable/);
});

test('persists native receipt only in SecureStore and reuses it after restart', async () => {
  const calls = [];
  const values = new Map();
  const store = createDeletionReceiptStore({
    platform: 'android',
    asyncStorage: { getItem: async () => { throw new Error('must not fallback'); } },
    secureStore: {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => { calls.push('secure-set'); values.set(key, value); },
      deleteItemAsync: async (key) => { calls.push('secure-delete'); values.delete(key); },
    },
  });
  const credential = 'ab'.repeat(32);
  const first = await getOrCreateDeletionReceipt({ owner: 'user-a', store, generate: async () => credential });
  const reused = await getOrCreateDeletionReceipt({ owner: 'user-a', store, generate: async () => { throw new Error('should reuse'); } });
  assert.equal(first, credential);
  assert.equal(reused, credential);
  assert.deepEqual(calls, ['secure-set']);
});

test('native SecureStore failure fails closed without AsyncStorage fallback', async () => {
  let fallbackCalled = false;
  const store = createDeletionReceiptStore({
    platform: 'ios',
    asyncStorage: { getItem: async () => { fallbackCalled = true; return null; }, setItem: async () => { fallbackCalled = true; } },
    secureStore: {
      getItemAsync: async () => null,
      setItemAsync: async () => { throw new Error('secure store unavailable'); },
    },
  });
  await assert.rejects(() => getOrCreateDeletionReceipt({ owner: 'user-a', store, generate: async () => 'cd'.repeat(32) }), /secure store unavailable/);
  assert.equal(fallbackCalled, false);
});

test('web persists through its established session store and rejects malformed receipts', async () => {
  const values = new Map();
  const store = createDeletionReceiptStore({
    platform: 'web',
    asyncStorage: {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value),
      removeItem: async (key) => values.delete(key),
    },
    secureStore: { getItemAsync: async () => { throw new Error('web must not use native secure store'); } },
  });
  await store.set('user-a', 'ef'.repeat(32));
  assert.equal(await store.get('user-a'), 'ef'.repeat(32));
  await assert.rejects(() => store.set('user-a', 'bad'), /invalid_deletion_receipt/);
});

test('credential is durably stored before getOrCreate resolves to the request caller', async () => {
  const order = [];
  const store = {
    get: async () => null,
    set: async (_owner, value) => { order.push(['persist', value]); },
  };
  const credential = '01'.repeat(32);
  const result = await getOrCreateDeletionReceipt({ owner: 'user-a', store, generate: async () => credential });
  order.push(['request-ready', result]);
  assert.deepEqual(order, [['persist', credential], ['request-ready', credential]]);
});

test('app persists receipt and records pending state before sending the destructive request', () => {
  const deletionFlow = appSource.slice(appSource.indexOf('const deleteAccount = async () =>'), appSource.indexOf('/* ---------- bağlam ---------- */'));
  const persisted = deletionFlow.indexOf('getOrCreateDeletionReceipt');
  const pending = deletionFlow.indexOf("state: 'pending'");
  const request = deletionFlow.indexOf('fetch(`${SUPABASE_URL}/functions/v1/delete-account`');
  assert.ok(persisted >= 0 && pending > persisted && request > pending);
  assert.match(deletionFlow, /body: JSON\.stringify\(\{ operationCredential \}\)/);
  assert.doesNotMatch(deletionFlow, /console\.(log|error)\([^\n]*operationCredential/);
});

test('status lookup sends the credential in a POST body without an Auth JWT header', () => {
  const statusHelper = appSource.slice(appSource.indexOf('const getDeletionReceiptStatus'), appSource.indexOf('// Destek ve KVKK'));
  assert.match(statusHelper, /method: 'POST'/);
  assert.match(statusHelper, /body: JSON\.stringify\(\{ action: 'status', operationCredential \}\)/);
  assert.match(statusHelper, /apikey: SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(statusHelper, /Authorization|Bearer/);
});

test('startup retains local data for unresolved receipts and cleans only after completed status', () => {
  const activation = appSource.slice(appSource.indexOf('const activateSession = async'), appSource.indexOf('if (activeDataScopeRef.current === nextScope)'));
  assert.match(activation, /if \(remoteStatus\.state !== 'completed'\) continue/);
  assert.ok(activation.indexOf("remoteStatus.state !== 'completed'") < activation.indexOf("state = 'remote_complete'"));
  assert.ok(activation.indexOf("state = 'remote_complete'") < activation.indexOf('deleteLocalAccountScope('));
  assert.match(activation, /if \(recovered\)/);
});
