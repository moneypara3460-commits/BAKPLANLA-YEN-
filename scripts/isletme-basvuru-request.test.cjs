const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const handlerSource = fs.readFileSync(path.join(root, 'supabase/functions/isletme-basvuru/index.ts'), 'utf8');

test('rejects missing and invalid bearer credentials before database RPC work', async () => {
  const { readAuthorizedJsonObject } = await import('../supabase/functions/_shared/business-request-input.mjs');
  let authCalls = 0;
  const missing = new Request('https://dev.invalid/functions/v1/isletme-basvuru', {
    method: 'POST', body: '{"businessName":"synthetic"}',
  });
  const missingResult = await readAuthorizedJsonObject(missing, async () => { authCalls += 1; });
  assert.equal(missingResult.status, 401);
  assert.equal(authCalls, 0);
  assert.equal(missing.bodyUsed, false);

  const invalid = new Request('https://dev.invalid/functions/v1/isletme-basvuru', {
    method: 'POST', headers: { authorization: 'Bearer invalid' }, body: '{"businessName":"synthetic"}',
  });
  const invalidResult = await readAuthorizedJsonObject(invalid, async () => {
    authCalls += 1;
    return { data: { user: null }, error: { status: 401 } };
  });
  assert.equal(invalidResult.status, 401);
  assert.equal(authCalls, 1);
  assert.doesNotMatch(JSON.stringify(invalidResult), /invalid|synthetic/i);
});

test('validates JSON syntax and requires a non-null object before auth or RPC work', async () => {
  const { readAuthorizedJsonObject } = await import('../supabase/functions/_shared/business-request-input.mjs');
  let authCalls = 0;
  const getUser = async () => { authCalls += 1; return { data: { user: { id: 'synthetic-user' } } }; };
  for (const body of ['{', 'null', 'true', '42', '"scalar"', '[]']) {
    const request = new Request('https://dev.invalid/functions/v1/isletme-basvuru', {
      method: 'POST', headers: { authorization: 'Bearer synthetic' }, body,
    });
    const result = await readAuthorizedJsonObject(request, getUser);
    assert.equal(result.status, 400, `body ${body} should be rejected`);
  }
  assert.equal(authCalls, 0);
});

test('enforces the body limit using UTF-8 bytes and cancels oversized streams', async () => {
  const { readJsonObject } = await import('../supabase/functions/_shared/business-request-input.mjs');
  const declaredOversize = new Request('https://dev.invalid/functions/v1/isletme-basvuru', {
    method: 'POST', headers: { 'content-length': '8001' }, body: '{}',
  });
  const declaredResult = await readJsonObject(declaredOversize);
  assert.equal(declaredResult.status, 413);
  assert.equal(declaredOversize.bodyUsed, false);

  const encoded = new TextEncoder().encode(JSON.stringify({ value: 'ş'.repeat(4100) }));
  assert.ok(encoded.byteLength > 8000);
  let cancelled = false;
  const streamed = new Request('https://dev.invalid/functions/v1/isletme-basvuru', {
    method: 'POST',
    body: new ReadableStream({
      start(controller) { controller.enqueue(encoded); },
      cancel() { cancelled = true; },
    }),
    duplex: 'half',
  });
  const streamedResult = await readJsonObject(streamed);
  assert.equal(streamedResult.status, 413);
  assert.equal(cancelled, true);
});

test('returns a safe service error when Auth cannot be reached', async () => {
  const { readAuthorizedJsonObject } = await import('../supabase/functions/_shared/business-request-input.mjs');
  const request = new Request('https://dev.invalid/functions/v1/isletme-basvuru', {
    method: 'POST', headers: { authorization: 'Bearer synthetic' }, body: '{}',
  });
  const result = await readAuthorizedJsonObject(request, async () => { throw new Error('private transport detail'); });
  assert.equal(result.status, 503);
  assert.doesNotMatch(JSON.stringify(result), /private transport detail/);

  const authClientError = new Request('https://dev.invalid/functions/v1/isletme-basvuru', {
    method: 'POST', headers: { authorization: 'Bearer synthetic' }, body: '{}',
  });
  const invalidJwt = await readAuthorizedJsonObject(authClientError, async () => ({
    data: { user: null }, error: { status: 400 },
  }));
  assert.equal(invalidJwt.status, 401);
});

test('the handler short-circuits auth or input failures before business RPC and email delivery', () => {
  const validation = handlerSource.indexOf('readAuthorizedJsonObject(req');
  const failureReturn = handlerSource.indexOf('if (!requestInput.ok)', validation);
  const rpc = handlerSource.indexOf('.rpc("business_request_submit"', failureReturn);
  const mail = handlerSource.indexOf('await client.send(', rpc);
  assert.ok(validation >= 0 && failureReturn > validation && rpc > failureReturn && mail > rpc);
});
