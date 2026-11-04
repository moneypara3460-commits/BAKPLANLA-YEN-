const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const moduleUrl = require('node:url').pathToFileURL(path.join(root, 'supabase/functions/_shared/provider-processing.mjs')).href;
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('every provider path is denied by default and requires an exact server-side true flag', async () => {
  const { providerProcessingEnabled, PROCESSING_FLAGS } = await import(moduleUrl);
  const expected = {
    ai: 'AI_PROVIDER_PROCESSING_ENABLED',
    aiSensitiveContent: 'AI_SENSITIVE_DATA_PROCESSING_ENABLED',
    places: 'PLACES_PROVIDER_PROCESSING_ENABLED',
    businessEmail: 'BUSINESS_EMAIL_PROCESSING_ENABLED',
    shoppingReminderWorker: 'SHOPPING_REMINDER_WORKER_ENABLED',
  };
  assert.deepEqual({ ...PROCESSING_FLAGS }, expected);

  for (const [provider, flag] of Object.entries(expected)) {
    for (const value of [undefined, null, '', 'false', 'TRUE', '1', true]) {
      assert.equal(providerProcessingEnabled(provider, (name) => name === flag ? value : undefined), false,
        `${provider} must remain disabled for ${String(value)}`);
    }
    assert.equal(providerProcessingEnabled(provider, (name) => name === flag ? 'true' : undefined), true);
  }
  assert.equal(providerProcessingEnabled('unknown', () => 'true'), false);
  assert.equal(providerProcessingEnabled('ai', null), false);
  assert.equal(providerProcessingEnabled('ai', () => { throw new Error('unavailable config'); }), false);
});

test('smart-endpoint checks provider authorization before rate, trial, quota and external dispatch', () => {
  const endpoint = source('supabase/functions/smart-endpoint/index.ts');
  const handler = endpoint.slice(endpoint.indexOf('async function handleRequest'));
  const gate = handler.indexOf('providerProcessingEnabled(processor');
  const sensitiveGate = handler.indexOf('providerProcessingEnabled("aiSensitiveContent"');
  assert.ok(gate >= 0);
  assert.ok(sensitiveGate > gate, 'AI sensitive-content policy is checked after the general egress switch');
  for (const next of [
    'checkSharedRateLimit(',
    'handlePlaces(body)',
    'reserveFeatureTrial(',
    'reserveAiQuota(',
  ]) {
    assert.ok(handler.indexOf(next) > gate, `${next} must remain downstream of the provider gate`);
  }

  const provider = endpoint.slice(endpoint.indexOf('async function openaiForRequest'));
  assert.ok(provider.indexOf('providerProcessingEnabled("ai"') >= 0);
  assert.ok(provider.indexOf('providerProcessingEnabled("aiSensitiveContent"') >= 0);
  assert.ok(provider.indexOf('providerProcessingEnabled("aiSensitiveContent"') < provider.indexOf('runReservedAiProvider('),
    'the actual OpenAI invocation boundary must check both egress and sensitive-content gates');
});

test('business mail paths require the explicit mail gate in addition to a password', () => {
  const submit = source('supabase/functions/isletme-basvuru/index.ts');
  const mailCondition = submit.indexOf('if (password && businessEmailEnabled)');
  const send = submit.indexOf('await client.send(', mailCondition);
  assert.ok(mailCondition >= 0 && send > mailCondition);

  const decision = source('supabase/functions/isletme-karar/index.ts');
  assert.match(decision, /mailConfigured:\s*Boolean\(password\)\s*&&\s*providerProcessingEnabled\("businessEmail"/);
});

test('a closed business-email flag never claims the decision or invokes SMTP', async () => {
  const { providerProcessingEnabled } = await import(moduleUrl);
  const { deliverCurrentDecision } = await import(pathToFileURL(path.join(root, 'supabase/functions/isletme-karar/decisionMailWorkflow.mjs')).href);
  const now = Date.parse('2026-11-03T12:00:00Z');
  const events = [];
  const result = await deliverCurrentDecision({
    id: 'synthetic-request',
    now: () => now,
    mailConfigured: providerProcessingEnabled('businessEmail', () => undefined),
    repository: {
      async readDecision(id) {
        events.push(['read', id]);
        return { row: { id, status: 'approved', reviewed_at: new Date(now).toISOString(), decision_mailed_status: null }, error: null };
      },
      async claimDecision(id) { events.push(['claim', id]); return [{ id }]; },
      async releaseClaim(id) { events.push(['release', id]); },
      async recordSent() { events.push(['sent']); },
    },
    async sendMail() { events.push(['smtp']); },
  });
  assert.equal(result.type, 'error');
  assert.equal(result.code, 'no_mail_config');
  assert.deepEqual(events.map(([name]) => name), ['read']);
});

test('shopping-reminder cannot claim or send plans until its worker switch is exactly enabled', () => {
  const worker = source('supabase/functions/shopping-reminder/index.ts');
  const gate = worker.indexOf('providerProcessingEnabled("shoppingReminderWorker"');
  const claim = worker.indexOf('admin.rpc("bakplanla_claim_due_shopping_plans"');
  const send = worker.indexOf('fetch(EXPO_PUSH_URL');
  assert.ok(gate >= 0 && gate < claim && claim < send);
  assert.match(worker.slice(gate, claim), /return json\([\s\S]*?provider_processing_disabled[\s\S]*?503\)/);
});
