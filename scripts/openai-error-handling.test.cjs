const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const handlingUrl = pathToFileURL(path.join(__dirname, '../supabase/functions/smart-endpoint/openaiErrorHandling.mjs')).href;

test('all four OpenAI non-OK modes preserve client errors and log only bounded metadata', async () => {
  const { openAiNonOkResponse } = await import(handlingUrl);
  const credential = 'synthetic-provider-key-never-log-this';
  const userContent = 'synthetic private document or prompt never-log-this';
  const cases = [
    ['chat', 'PLAN AI şu anda yanıt veremiyor.'],
    ['opportunities', 'Fırsat Motoru şu anda yanıt veremiyor.'],
    ['receipt', 'Fiş okunamadı.'],
    ['documentAnalysis', 'Belge analiz edilemedi.'],
  ];

  for (const [operation, errorMessage] of cases) {
    const logEntries = [];
    const providerResponse = new Response(JSON.stringify({
      error: `${credential}; echoed content: ${userContent}`,
    }), { status: 429 });
    const result = openAiNonOkResponse({
      response: providerResponse,
      operation,
      errorMessage,
      jsonResponse: (body, status) => new Response(JSON.stringify(body), { status }),
      logger: { error: (...args) => logEntries.push(args) },
    });

    assert.equal(result.status, 502);
    assert.deepEqual(await result.json(), { error: errorMessage });
    assert.equal(providerResponse.bodyUsed, false, `${operation} must not read provider response body`);
    assert.deepEqual(logEntries, [[
      'openai_provider_error',
      { operation, status: 429 },
    ]]);
    const serializedLogs = JSON.stringify(logEntries);
    assert.equal(serializedLogs.includes(credential), false);
    assert.equal(serializedLogs.includes(userContent), false);
  }
});

test('provider error metadata rejects arbitrary operation text and malformed status values', async () => {
  const { openAiNonOkResponse } = await import(handlingUrl);
  const logEntries = [];
  const response = { ok: false, status: 700, text: () => { throw new Error('body must not be read'); } };
  openAiNonOkResponse({
    response,
    operation: 'synthetic credential and user input',
    errorMessage: 'safe client error',
    jsonResponse: () => new Response('{}', { status: 502 }),
    logger: { error: (...args) => logEntries.push(args) },
  });
  assert.deepEqual(logEntries, [[
    'openai_provider_error',
    { operation: 'unknown', status: 0 },
  ]]);
});
