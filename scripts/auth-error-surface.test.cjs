const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../App'), 'utf8');
const start = source.indexOf('const runAuthRequest = async (request) =>');
const end = source.indexOf('const dataScopeGenerationRef = useRef(0);', start);
assert.notEqual(start, -1, 'Auth handlers must remain discoverable for this guard test');
assert.notEqual(end, -1, 'Auth handlers must have a bounded source section');
const authHandlers = source.slice(start, end);

test('Supabase Auth provider error text is not shown directly or logged by auth handlers', () => {
  assert.doesNotMatch(authHandlers, /setAuthMessage\(\s*error\.message\s*\)/);
  assert.doesNotMatch(authHandlers, /setAuthMessage\(\s*msg\s*\)/);
  assert.doesNotMatch(authHandlers, /\?\s*error\.message/);
  assert.doesNotMatch(authHandlers, /console\.(?:log|error)\([^\n]*error\.message/);
});

test('a rejected sign-in request releases the busy state and shows only the existing generic error', async () => {
  const loading = [];
  const messages = [];
  const context = {
    authEmail: 'synthetic@example.test',
    authPassword: 'synthetic-password',
    setAuthLoading: (value) => loading.push(value),
    setAuthMessage: (value) => messages.push(value),
    setVerifyEmail() {},
    setResendNote() {},
    tx: (_tr, en) => en,
    supabase: { auth: { signInWithPassword: async () => { throw new Error('synthetic network failure'); } } },
  };

  await vm.runInNewContext(`${authHandlers}\nhandleSignIn()`, context);

  assert.deepEqual(loading, [true, false]);
  assert.equal(messages.at(-1), 'Could not sign in. Check your connection and try again.');
  assert.doesNotMatch(messages.join(' '), /synthetic network failure/);
});

test('a rejected resend request clears its busy state and uses the existing safe fallback', async () => {
  const busy = [];
  const notes = [];
  const context = {
    authEmail: 'synthetic@example.test',
    verifyEmail: 'synthetic@example.test',
    resendBusy: false,
    resendAtRef: { current: 0 },
    setResendBusy: (value) => busy.push(value),
    setResendNote: (value) => notes.push(value),
    supabase: { auth: { resend: async () => { throw new Error('synthetic network failure'); } } },
  };

  await vm.runInNewContext(`${authHandlers}\nhandleResendVerification()`, context);

  assert.deepEqual(busy, [true, false]);
  assert.equal(notes.at(-1), 'E-posta gönderilemedi. Biraz sonra tekrar dene.');
  assert.doesNotMatch(notes.join(' '), /synthetic network failure/);
});
