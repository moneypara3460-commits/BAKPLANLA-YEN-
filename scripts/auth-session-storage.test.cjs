const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthSessionStorage } = require('../authSessionStorage');

const fakeStore = () => {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
    async getItemAsync(key) { return values.has(key) ? values.get(key) : null; },
    async setItemAsync(key, value) { values.set(key, value); },
    async deleteItemAsync(key) { values.delete(key); },
  };
};

test('native session storage round-trips chunks and removes stale chunks on replacement', async () => {
  const secureStore = fakeStore();
  const storage = createAuthSessionStorage({ platform: 'android', asyncStorage: fakeStore(), secureStore });
  const session = 'synthetic-session-data-'.repeat(300);

  await storage.setItem('auth-token', session);
  assert.equal(secureStore.values.get('auth-token.n'), '4');
  assert.equal(await storage.getItem('auth-token'), session);

  await storage.setItem('auth-token', 'short-session');
  assert.equal(secureStore.values.get('auth-token.n'), '1');
  assert.equal(secureStore.values.has('auth-token.1'), false);
  assert.equal(await storage.getItem('auth-token'), 'short-session');
});

test('native session restoration fails closed when a chunk is missing or storage throws', async () => {
  const secureStore = fakeStore();
  const storage = createAuthSessionStorage({ platform: 'ios', asyncStorage: fakeStore(), secureStore });
  await storage.setItem('auth-token', 'synthetic-session-data-'.repeat(100));
  secureStore.values.delete('auth-token.1');
  assert.equal(await storage.getItem('auth-token'), null);

  const unavailable = createAuthSessionStorage({
    platform: 'ios',
    asyncStorage: fakeStore(),
    secureStore: { async getItemAsync() { throw new Error('synthetic secure-store failure'); } },
  });
  assert.equal(await unavailable.getItem('auth-token'), null);
});

test('native session restoration rejects malformed or excessive chunk counts without looping', async () => {
  const secureStore = fakeStore();
  const storage = createAuthSessionStorage({ platform: 'android', asyncStorage: fakeStore(), secureStore });
  for (const count of ['NaN', '-1', '1.5', '999999999']) {
    secureStore.values.set('auth-token.n', count);
    assert.equal(await storage.getItem('auth-token'), null);
  }
});

test('rejecting an oversized replacement removes the previously persisted session', async () => {
  const secureStore = fakeStore();
  const storage = createAuthSessionStorage({ platform: 'android', asyncStorage: fakeStore(), secureStore });
  await storage.setItem('auth-token', 'synthetic-session-A');

  await storage.setItem('auth-token', 'x'.repeat((1800 * 256) + 1));

  assert.equal(await storage.getItem('auth-token'), null);
  assert.equal(secureStore.values.size, 0);
});

test('native session cleanup bounds corrupt metadata and removes the maximum previously stored chunk set', async () => {
  const secureStore = fakeStore();
  const storage = createAuthSessionStorage({ platform: 'android', asyncStorage: fakeStore(), secureStore });
  secureStore.values.set('auth-token.n', 'not-a-count');
  secureStore.values.set('auth-token.0', 'synthetic-stale-session');
  secureStore.values.set('auth-token.255', 'synthetic-stale-session-tail');
  await storage.removeItem('auth-token');
  assert.equal(secureStore.values.size, 0);
});

test('native secure-storage write failure never falls back to AsyncStorage', async () => {
  const asyncStorage = fakeStore();
  const storage = createAuthSessionStorage({
    platform: 'android',
    asyncStorage,
    secureStore: { async getItemAsync() { return null; }, async setItemAsync() { throw new Error('synthetic secure-store failure'); } },
  });
  await storage.setItem('auth-token', 'synthetic-session');
  assert.equal(asyncStorage.values.size, 0);
});

test('web session storage delegates to AsyncStorage', async () => {
  const asyncStorage = fakeStore();
  const secureStore = fakeStore();
  const storage = createAuthSessionStorage({ platform: 'web', asyncStorage, secureStore });
  await storage.setItem('auth-token', 'synthetic-web-session');
  assert.equal(await storage.getItem('auth-token'), 'synthetic-web-session');
  await storage.removeItem('auth-token');
  assert.equal(await storage.getItem('auth-token'), null);
  assert.equal(secureStore.values.size, 0);
});
