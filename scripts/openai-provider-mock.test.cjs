const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const guardUrl = pathToFileURL(path.join(__dirname, '../supabase/functions/smart-endpoint/aiCostGuard.mjs')).href;
const providerUrl = pathToFileURL(path.join(__dirname, '../supabase/functions/smart-endpoint/openaiProvider.mjs')).href;
const endpointPath = path.join(__dirname, '../supabase/functions/smart-endpoint/index.ts');

test('reserved provider path sends one deterministic fake request and preserves the Responses contract', async () => {
  const { runReservedAiProvider } = await import(guardUrl);
  const { requestOpenAiResponses } = await import(providerUrl);
  const reservation = { providerStarted: false, featureTrialReserved: true, aiQuotaReserved: true };
  let observed;
  const fakeFetch = async (url, init) => {
    observed = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ id: 'resp_fake_1', output: [{ content: [{ type: 'output_text', text: 'synthetic result' }] }] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  const result = await runReservedAiProvider(reservation, () => requestOpenAiResponses({
    baseUrl: 'http://private-mock.invalid/v1/',
    apiKey: 'fake-openai-key-not-valid',
    model: 'synthetic-model',
    content: [{ type: 'input_text', text: 'synthetic prompt' }],
    timeoutMs: 500,
    maxOutputTokens: 24,
    fetchImpl: fakeFetch,
  }));
  assert.equal(reservation.providerStarted, true);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).output[0].content[0].text, 'synthetic result');
  assert.equal(observed.url, 'http://private-mock.invalid/v1/responses');
  assert.equal(observed.init.method, 'POST');
  assert.equal(observed.init.headers.Authorization, 'Bearer fake-openai-key-not-valid');
  assert.equal(observed.body.model, 'synthetic-model');
  assert.equal(observed.body.store, false);
  assert.equal(observed.body.max_output_tokens, 24);
  assert.equal(observed.body.input[0].content[0].text, 'synthetic prompt');
});

test('output token limit is bounded by default and configuration cannot disable or exceed the app cap', async () => {
  const { boundedOutputTokenLimit, DEFAULT_OUTPUT_TOKEN_LIMIT, MAX_OUTPUT_TOKEN_LIMIT, requestOpenAiResponses } = await import(providerUrl);
  assert.equal(DEFAULT_OUTPUT_TOKEN_LIMIT, 6144);
  assert.equal(MAX_OUTPUT_TOKEN_LIMIT, 8192);
  assert.equal(boundedOutputTokenLimit(undefined), DEFAULT_OUTPUT_TOKEN_LIMIT);
  assert.equal(boundedOutputTokenLimit(0), DEFAULT_OUTPUT_TOKEN_LIMIT);
  assert.equal(boundedOutputTokenLimit(-1), DEFAULT_OUTPUT_TOKEN_LIMIT);
  assert.equal(boundedOutputTokenLimit(2048), 2048);
  assert.equal(boundedOutputTokenLimit(100000), MAX_OUTPUT_TOKEN_LIMIT);

  let observedBody;
  await requestOpenAiResponses({
    baseUrl: 'http://private-mock.invalid/v1', apiKey: 'fake-openai-key-not-valid',
    model: 'synthetic-model', content: [{ type: 'input_text', text: 'bounded contract' }], timeoutMs: 500,
    fetchImpl: async (_url, init) => {
      observedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ output: [] }), { status: 200 });
    },
  });
  assert.equal(observedBody.max_output_tokens, DEFAULT_OUTPUT_TOKEN_LIMIT);
  assert.equal(observedBody.store, false);
  assert.equal(observedBody.input[0].content[0].text, 'bounded contract');
});

test('timeout after provider start is ambiguous and never refunds either reservation', async () => {
  const { runReservedAiProvider, shouldRefundPreProviderReservations } = await import(guardUrl);
  const { requestOpenAiResponses } = await import(providerUrl);
  const reservation = { providerStarted: false, featureTrialReserved: true, aiQuotaReserved: true };
  let mockCalls = 0;
  const hangingMockFetch = (_url, { signal }) => {
    mockCalls += 1;
    return new Promise((_, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  await assert.rejects(runReservedAiProvider(reservation, () => requestOpenAiResponses({
    baseUrl: 'http://private-mock.invalid/v1',
    apiKey: 'fake-openai-key-not-valid',
    model: 'synthetic-model',
    content: [],
    timeoutMs: 10,
    fetchImpl: hangingMockFetch,
  })), (error) => error?.name === 'TimeoutError');
  assert.equal(mockCalls, 1);
  assert.equal(reservation.providerStarted, true);
  assert.equal(shouldRefundPreProviderReservations(502, reservation), false);
});

test('trial and quota gates precede the provider; pre-provider failures remain refundable', async () => {
  const { reserveFeatureTrial, reserveAiQuota, runReservedAiProvider, shouldRefundPreProviderReservations } = await import(guardUrl);
  const sequence = [];
  let providerCalls = 0;
  const trial = await reserveFeatureTrial(async () => {
    sequence.push('trial');
    return { allowed: true, pro: false };
  }, 'synthetic-user', 'documentAnalysis');
  const reservation = { providerStarted: false, featureTrialReserved: trial.state === 'trial', aiQuotaReserved: false };
  const quota = await reserveAiQuota(async () => {
    sequence.push('quota');
    return { ok: true, day_used: 1 };
  }, 'synthetic-user');
  reservation.aiQuotaReserved = quota.state === 'reserved';
  await runReservedAiProvider(reservation, async () => {
    sequence.push('provider');
    providerCalls += 1;
    return new Response('{}', { status: 200 });
  });
  assert.deepEqual(sequence, ['trial', 'quota', 'provider']);
  assert.equal(providerCalls, 1);
  assert.equal(shouldRefundPreProviderReservations(200, reservation), false);

  const trialOnlyReservation = { providerStarted: false, featureTrialReserved: true, aiQuotaReserved: false };
  const failedQuota = await reserveAiQuota(async () => ({ ok: false, error: 'daily' }), 'synthetic-user');
  assert.equal(failedQuota.state, 'limited');
  assert.equal(providerCalls, 1);
  assert.equal(shouldRefundPreProviderReservations(429, trialOnlyReservation), true);
});

test('smart-endpoint routes provider calls through the tested request builder', () => {
  const source = fs.readFileSync(endpointPath, 'utf8');
  assert.match(source, /import \{[^}]*requestOpenAiResponses[^}]*\} from "\.\/openaiProvider\.mjs"/);
  assert.match(source, /return requestOpenAiResponses\(\{[\s\S]*?apiKey: openaiKey[\s\S]*?timeoutMs: envInt\("OPENAI_TIMEOUT_MS", 90_000\)/);
  assert.match(source, /maxOutputTokens: boundedOutputTokenLimit\(envInt\("OPENAI_MAX_OUTPUT_TOKENS", DEFAULT_OUTPUT_TOKEN_LIMIT\)\)/);
  assert.equal((source.match(/openaiResponses\(/g) || []).length, 1);
});
