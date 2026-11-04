const test = require('node:test');
const assert = require('node:assert/strict');

test('accepts only the exact configured internal Bearer token', async () => {
  const { hasValidInternalBearer } = await import('../supabase/functions/_shared/internal-auth.mjs');
  const token = 'A'.repeat(43);

  assert.equal(hasValidInternalBearer(`Bearer ${token}`, token), true);
  assert.equal(hasValidInternalBearer(null, token), false);
  assert.equal(hasValidInternalBearer('Bearer short', 'short'), false);
  assert.equal(hasValidInternalBearer(`Bearer ${token}`, ''), false);
  assert.equal(hasValidInternalBearer('Bearer wrong-token', token), false);
  assert.equal(hasValidInternalBearer(`bearer ${token}`, token), false);
  assert.equal(hasValidInternalBearer(`Bearer ${token} `, token), false);
  assert.equal(hasValidInternalBearer(`Bearer ${token} forged`, token), false);
});

test('rejects an invalid caller before parsing a forged decision ID or invoking privileged work', async () => {
  const { withInternalAuthorization } = await import('../supabase/functions/_shared/internal-auth.mjs');
  const token = 'A'.repeat(43);
  const request = new Request('https://dev.invalid/functions/v1/isletme-karar', {
    method: 'POST',
    headers: { authorization: 'Bearer invalid' },
    body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001' }),
  });
  let privilegedCalls = 0;

  const response = await withInternalAuthorization(request, token, async () => {
    privilegedCalls += 1;
    return new Response('unexpected');
  });

  assert.equal(response.status, 401);
  assert.equal(request.bodyUsed, false);
  assert.equal(privilegedCalls, 0);
});

test('rejects a non-POST request without invoking privileged work', async () => {
  const { withInternalAuthorization } = await import('../supabase/functions/_shared/internal-auth.mjs');
  let privilegedCalls = 0;
  const request = new Request('https://dev.invalid/functions/v1/isletme-karar', { method: 'GET' });

  const response = await withInternalAuthorization(request, 'A'.repeat(43), async () => {
    privilegedCalls += 1;
    return new Response('unexpected');
  });

  assert.equal(response.status, 405);
  assert.equal(privilegedCalls, 0);
});

test('dispatches the request only with the configured token', async () => {
  const { withInternalAuthorization } = await import('../supabase/functions/_shared/internal-auth.mjs');
  const token = 'A'.repeat(43);
  const request = new Request('https://dev.invalid/functions/v1/isletme-karar', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001' }),
  });
  let privilegedCalls = 0;

  const response = await withInternalAuthorization(request, token, async (authorizedRequest) => {
    privilegedCalls += 1;
    assert.deepEqual(await authorizedRequest.json(), { id: '00000000-0000-0000-0000-000000000001' });
    return new Response('authorized');
  });

  assert.equal(response.status, 200);
  assert.equal(privilegedCalls, 1);
});
