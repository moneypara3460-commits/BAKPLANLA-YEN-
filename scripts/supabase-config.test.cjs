const test = require('node:test');
const assert = require('node:assert/strict');
const { getSupabaseConfig } = require('../supabaseConfig');

const encodeJwtPart = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const legacyKey = (role = 'anon', { header = { alg: 'HS256', typ: 'JWT' }, signature = Buffer.alloc(32, 7).toString('base64url'), payload = {} } = {}) =>
  `${encodeJwtPart(header)}.${encodeJwtPart({ iss: 'supabase', role, ...payload })}.${signature}`;

test('requires an explicit URL and publishable key', () => {
  assert.throws(() => getSupabaseConfig(), /EXPO_PUBLIC_SUPABASE_URL/);
  assert.throws(() => getSupabaseConfig({ url: 'https://dev.supabase.co' }), /PUBLISHABLE_KEY/);
});

test('refuses the client production project', () => {
  assert.throws(
    () => getSupabaseConfig({
      url: 'https://bukbteqgzkytedhrmdgq.supabase.co',
      publishableKey: 'sb_publishable_dev_example',
    }),
    /production Supabase project is blocked/,
  );
});

test('rejects Supabase secret keys with surrounding whitespace without echoing the value', () => {
  const secretKey = '  sb_secret_synthetic_value  ';
  assert.throws(
    () => getSupabaseConfig({
      url: 'https://tlizbrhmwaesfjmtxcgh.supabase.co',
      publishableKey: secretKey,
    }),
    (error) => /publishable key or a legacy anon key/.test(error.message) && !error.message.includes(secretKey.trim()),
  );
});

test('accepts and trims a supported publishable key for the hosted DEV project', () => {
  assert.deepEqual(
    getSupabaseConfig({
      url: 'https://tlizbrhmwaesfjmtxcgh.supabase.co',
      publishableKey: ' sb_publishable_dev_example ',
    }),
    {
      url: 'https://tlizbrhmwaesfjmtxcgh.supabase.co',
      publishableKey: 'sb_publishable_dev_example',
    },
  );
});

test('accepts a structurally valid legacy anon JWT for local development', () => {
  const anonKey = legacyKey();
  assert.deepEqual(
    getSupabaseConfig({ url: 'http://127.0.0.1:54321', publishableKey: anonKey }),
    { url: 'http://127.0.0.1:54321', publishableKey: anonKey },
  );
});

test('rejects legacy JWTs with privileged or unsupported roles', () => {
  for (const role of ['service_role', 'supabase_admin', 'authenticated', 'admin']) {
    assert.throws(
      () => getSupabaseConfig({ url: 'https://tlizbrhmwaesfjmtxcgh.supabase.co', publishableKey: legacyKey(role) }),
      /publishable key or a legacy anon key/,
    );
  }
});

test('rejects malformed legacy JWTs and unsupported key formats', () => {
  const anonKey = legacyKey();
  const [header, payload, signature] = anonKey.split('.');
  const malformed = [
    'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.x',
    `${header}.${payload}.x`,
    `${encodeJwtPart({ alg: 'none' })}.${payload}.${signature}`,
    `${header}.${Buffer.from('{bad json').toString('base64url')}.${signature}`,
    'local-anon-key',
    'sb_publishable_',
    `sb_publishable_${'x'.repeat(8193)}`,
  ];
  for (const publishableKey of malformed) {
    assert.throws(
      () => getSupabaseConfig({ url: 'https://tlizbrhmwaesfjmtxcgh.supabase.co', publishableKey }),
      /publishable key or a legacy anon key/,
    );
  }
});

test('rejects empty, whitespace-only and non-string keys safely', () => {
  for (const publishableKey of ['', '   ', null, 42, {}]) {
    assert.throws(
      () => getSupabaseConfig({ url: 'https://tlizbrhmwaesfjmtxcgh.supabase.co', publishableKey }),
      /PUBLISHABLE_KEY/,
    );
  }
});

test('refuses hosted Supabase projects that do not match the verified DEV ref', () => {
  assert.throws(
    () => getSupabaseConfig({ url: 'https://other-project.supabase.co', publishableKey: 'sb_publishable_synthetic' }),
    /does not match the verified DEV project/,
  );
  assert.throws(
    () => getSupabaseConfig({
      url: 'https://other-project.supabase.co',
      publishableKey: 'sb_publishable_synthetic',
      expectedProjectRef: 'tlizbrhmwaesfjmtxcgh',
    }),
    /does not match the verified DEV project/,
  );
});

test('accepts HTTP only for supported local development hosts', () => {
  assert.equal(
    getSupabaseConfig({ url: 'http://127.0.0.1:54321', publishableKey: legacyKey() }).url,
    'http://127.0.0.1:54321',
  );
  assert.throws(
    () => getSupabaseConfig({ url: 'http://tlizbrhmwaesfjmtxcgh.supabase.co', publishableKey: 'sb_publishable_synthetic' }),
    /Use HTTPS/,
  );
});

test('rejects arbitrary remote hosts and embedded URL data', () => {
  assert.throws(
    () => getSupabaseConfig({ url: 'https://example.com', publishableKey: 'sb_publishable_synthetic' }),
    /isolated Supabase project URL/,
  );
  assert.throws(
    () => getSupabaseConfig({ url: 'https://user:pass@dev.supabase.co', publishableKey: 'sb_publishable_synthetic' }),
    /must not contain credentials/,
  );
  assert.throws(
    () => getSupabaseConfig({ url: 'https://dev.supabase.co/path', publishableKey: 'sb_publishable_synthetic' }),
    /must not include a path/,
  );
});
