const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const app = read('App.js');
const functionSources = [
  'supabase/functions/isletme-basvuru/index.ts',
  'supabase/functions/isletme-karar/index.ts',
  'supabase/functions/isbasi/index.ts',
  'supabase/functions/shopping-reminder/index.ts',
  'supabase/functions/smart-endpoint/index.ts',
  'supabase/functions/delete-account/index.ts',
].map(read).join('\n');

test('client error logging never emits raw native, storage, or user-content exceptions', () => {
  const consoleCalls = [...app.matchAll(/console\.(?:log|error|warn)\(([^\n]*)/g)].map((match) => match[1]);
  assert.ok(consoleCalls.length > 0);
  for (const call of consoleCalls) {
    if (call.includes('error?.kind')) {
      assert.doesNotMatch(call, /(?:message|stack|body|response|cause)/i);
      continue;
    }
    assert.doesNotMatch(call, /(?:error|listError|exception|stack)\s*(?:\?|\.|,|\))/i);
    assert.doesNotMatch(call, /String\s*\(/i);
  }
  assert.match(app, /console\.log\('PLAN init failed'\)/);
  assert.match(app, /console\.log\('Gallery operation failed'\)/);
  assert.match(app, /console\.log\('Camera operation failed'\)/);
  assert.match(app, /console\.log\('Shopping list save failed'\)/);

  const helperStart = app.indexOf('const SAFE_SMART_ERROR_KINDS');
  const helperEnd = app.indexOf('/*', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const loggerEnd = app.lastIndexOf('};', helperEnd);
  assert.ok(loggerEnd > helperStart);
  const loggerSource = `${app.slice(helperStart, loggerEnd + 2)}\nlogSmartError;`;
  const writes = [];
  const logSmartError = vm.runInNewContext(loggerSource, { console: { log: (...values) => writes.push(values) }, Set, Number });
  const credential = 'synthetic-secret-credential-never-log';
  const userText = 'synthetic private document content never-log';
  logSmartError('AI operation failed', { kind: credential, status: userText, message: `${credential} ${userText}` });
  assert.deepEqual(writes, [['AI operation failed', 'unknown', '']]);
  assert.equal(JSON.stringify(writes).includes(credential), false);
  assert.equal(JSON.stringify(writes).includes(userText), false);
});

test('Edge Function failure logs use fixed events instead of database, SMTP, provider or plan payload errors', () => {
  const consoleCalls = [...functionSources.matchAll(/console\.(?:log|error|warn)\(([^\n]*)/g)].map((match) => match[1]);
  assert.ok(consoleCalls.length > 0);
  for (const call of consoleCalls) {
    assert.doesNotMatch(call, /(?:error|claimError|result\.error|upErr|details)\.(?:message|stack)/i);
    assert.doesNotMatch(call, /String\s*\(\s*(?:error|e)\s*\)/i);
    assert.doesNotMatch(call, /console\.(?:log|error|warn)\([^\n]*(?:plan\.items|msg\.body|geocodeNotes)/i);
  }
  assert.match(functionSources, /business_request_notification_failed/);
  assert.match(functionSources, /isbasi_request_failed/);
  assert.match(functionSources, /shopping_reminder_plan_processing_failed/);
  assert.match(functionSources, /places_provider_unavailable/);
  assert.match(functionSources, /smart_endpoint_unexpected_error/);
  assert.match(functionSources, /delete_account_incomplete/);
  assert.doesNotMatch(functionSources, /delete-account incomplete:\s*",\s*result\.stage/);
});
