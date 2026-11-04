const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
const start = app.indexOf("const AI_CONSENT_VERSION = '2026-11-v1';");
const end = app.indexOf('/* Belge görsellerinin bulut yedeği', start);
assert.ok(start >= 0 && end > start, 'locate the production consent flow in App.js');
const consentSource = `${app.slice(start, end)}\nmodule.exports = { askAiConsent, ensureAiConsent, withdrawAiConsent, setConsentLanguage: (language) => { aiConsentLang = language; } };`;

function harness({ switchAfterMutation, purposeActive = false, failRpc = null }) {
  let activeUser = 'account-a';
  let prompt;
  let resolvePrompt;
  const promptShown = new Promise((resolve) => { resolvePrompt = resolve; });
  const localWrites = [];
  const metadataWrites = [];
  const rpcCalls = [];
  const supabase = {
    auth: {
      async getSession() { return { data: { session: { user: { id: activeUser } } } }; },
      async updateUser(attributes) {
        metadataWrites.push({ activeUser, attributes });
        return { data: {}, error: null };
      },
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args, sessionUser: activeUser });
      if (name === 'ai_provider_authorization_active') {
        assert.equal(args.p_user, 'account-a');
        return { data: purposeActive, error: null };
      }
      if (name === 'ai_consent_is_active') return { data: false, error: null };
      if (name === 'grant_ai_consent' || name === 'withdraw_ai_consent' || name === 'withdraw_ai_provider_authorization') {
        assert.equal(args.p_expected_user, 'account-a');
        if (name !== 'grant_ai_consent' && activeUser !== 'account-a') {
          return { data: { ok: false, error: 'identity_mismatch' }, error: null };
        }
        if (name === failRpc) return { data: null, error: { message: 'synthetic RPC failure' } };
        if (switchAfterMutation) activeUser = 'account-b';
        return { data: { ok: true }, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  const context = {
    module: { exports: {} },
    supabase,
    AsyncStorage: {
      async setItem(key, value) { localWrites.push({ action: 'set', key, value }); },
      async removeItem(key) { localWrites.push({ action: 'remove', key }); },
    },
    Platform: { OS: 'ios' },
    Alert: { alert(title, message, buttons) { prompt = { title, message, buttons }; resolvePrompt(prompt); } },
    toArabic: (value) => value,
    openLegal() {},
    LEGAL_URLS: { kvkk: 'https://example.invalid/privacy' },
    console,
  };
  vm.runInNewContext(consentSource, context, { filename: 'App.js#ai-consent' });
  return {
    ensureAiConsent: context.module.exports.ensureAiConsent,
    askAiConsent: context.module.exports.askAiConsent,
    withdrawAiConsent: context.module.exports.withdrawAiConsent,
    async showConsent(language) {
      context.module.exports.setConsentLanguage(language);
      const pending = context.module.exports.askAiConsent();
      const shown = await promptShown;
      shown.buttons[1].onPress();
      await pending;
      return shown;
    },
    promptShown,
    activeUser: () => activeUser,
    localWrites,
    metadataWrites,
    rpcCalls,
  };
}

test('AI notice copy describes provider data controls accurately in supported literal languages', async () => {
  const expectations = [
    ['tr', /varsayılan olarak modellerini eğitmek için kullanılmadığını/i, /varsayılan olarak 30 güne kadar saklanabilir/i, /veri kontrolleri doğrulanmamıştır/i],
    ['en', /not used to train its models by default/i, /up to 30 days by default/i, /data controls .* have not been verified/i],
    ['de', /standardmäßig nicht zum Training seiner Modelle verwendet/i, /standardmäßig bis zu 30 Tage gespeichert/i, /Datenkontrollen .* nicht verifiziert/i],
    ['ar', /not used to train its models by default/i, /up to 30 days by default/i, /data controls .* have not been verified/i],
  ];
  for (const [language, ...patterns] of expectations) {
    const flow = harness({ switchAfterMutation: false });
    const prompt = await flow.showConsent(language);
    for (const pattern of patterns) assert.match(prompt.message, pattern, `${language} should include ${pattern}`);
    assert.doesNotMatch(prompt.message, /does not keep it permanently|kalıcı olarak saklamaz|speichert sie nicht dauerhaft/i);
    assert.match(prompt.message, /I agree|İzin veriyorum|Ich stimme zu/);
    assert.match(prompt.message, /does not establish that an international transfer is legally permitted|Bu seçim tek başına yurt dışı aktarımının hukuken uygun olduğunu göstermez|Diese Auswahl allein belegt nicht, dass eine internationale Übermittlung rechtlich zulässig ist/);
    assert.doesNotMatch(prompt.message, /give explicit consent to this transfer abroad|yurt dışı aktarıma .* açık rıza vermiş olursun|willigst du ausdrücklich in die Übermittlung ins Ausland ein/i);
  }
});

test('late consent grant after A to B writes only A local marker and never Auth metadata', async () => {
  const flow = harness({ switchAfterMutation: true, purposeActive: true });
  const pending = flow.ensureAiConsent();
  const prompt = await flow.promptShown;
  prompt.buttons[2].onPress();

  assert.equal(await pending, 'allowed', 'the completed server grant remains bound to A');
  assert.equal(flow.activeUser(), 'account-b');
  assert.deepEqual(flow.localWrites.map(({ action, key }) => [action, key]), [['set', 'BAKPLANLA_AI_CONSENT:account-a']]);
  assert.deepEqual(flow.metadataWrites, [], 'consent is never mirrored into mutable Auth metadata');
});

test('same-account consent grant keeps the server grant and local marker without Auth metadata', async () => {
  const flow = harness({ switchAfterMutation: false, purposeActive: true });
  const pending = flow.ensureAiConsent();
  (await flow.promptShown).buttons[2].onPress();

  assert.equal(await pending, 'allowed');
  assert.deepEqual(flow.localWrites.map(({ action, key }) => [action, key]), [['set', 'BAKPLANLA_AI_CONSENT:account-a']]);
  assert.deepEqual(flow.metadataWrites, []);
});

test('late consent withdrawal after A to B removes only A local marker and never Auth metadata', async () => {
  const flow = harness({ switchAfterMutation: true });
  assert.equal(await flow.withdrawAiConsent(), false, 'purpose revocation completed for A; the subsequent RPC correctly refused the new session');

  assert.equal(flow.activeUser(), 'account-b');
  assert.deepEqual(flow.localWrites, [], 'a mixed-session withdrawal does not mutate either account local marker');
  assert.deepEqual(flow.rpcCalls.map(({ name, sessionUser }) => [name, sessionUser]), [
    ['withdraw_ai_provider_authorization', 'account-a'],
    ['withdraw_ai_consent', 'account-b'],
  ]);
  assert.deepEqual(flow.metadataWrites, [], 'withdrawal is never mirrored into mutable Auth metadata');
});

test('same-account consent withdrawal removes the local marker without writing Auth metadata', async () => {
  const flow = harness({ switchAfterMutation: false, purposeActive: true });
  assert.equal(await flow.withdrawAiConsent(), true);

  assert.deepEqual(flow.localWrites.map(({ action, key }) => [action, key]), [['remove', 'BAKPLANLA_AI_CONSENT:account-a']]);
  assert.deepEqual(flow.metadataWrites, []);
});

test('withdrawal RPC failures retain the local marker while the successful server revocation remains scope-bound', async () => {
  for (const failedRpc of ['withdraw_ai_provider_authorization', 'withdraw_ai_consent']) {
    const flow = harness({ switchAfterMutation: false, purposeActive: true, failRpc: failedRpc });
    assert.equal(await flow.withdrawAiConsent(), false, `${failedRpc} failure must not report successful withdrawal`);
    assert.deepEqual(flow.localWrites, [], `${failedRpc} failure must retain the local marker`);
    assert.deepEqual(flow.metadataWrites, []);
  }
});

test('closed purpose policy never prompts for or records the historical combined consent', async () => {
  const flow = harness({ switchAfterMutation: false, purposeActive: false });
  assert.equal(await flow.ensureAiConsent(), 'unavailable');
  assert.deepEqual(flow.rpcCalls.map(({ name }) => name), ['ai_provider_authorization_active']);
  assert.deepEqual(flow.localWrites, []);
  assert.deepEqual(flow.metadataWrites, []);
});
