const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20261031200000_server_authoritative_ai_consent.sql');
const reconsentMigrationPath = path.join(root, 'supabase/migrations/20261104150000_ai_consent_reconsent_version.sql');
const purposeMigrationPath = path.join(root, 'supabase/migrations/20261103190000_purpose_scoped_ai_authorization.sql');
const endpointPath = path.join(root, 'supabase/functions/smart-endpoint/index.ts');
const appPath = path.join(root, 'App.js');
const helperUrl = pathToFileURL(path.join(root, 'supabase/functions/smart-endpoint/aiCostGuard.mjs')).href;
const migration = fs.readFileSync(migrationPath, 'utf8');
const reconsentMigration = fs.readFileSync(reconsentMigrationPath, 'utf8');
const purposeMigration = fs.readFileSync(purposeMigrationPath, 'utf8');
const endpoint = fs.readFileSync(endpointPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');

function functionBody(name) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.notEqual(start, -1, `${name} definition exists`);
  const end = migration.indexOf('$function$;', start);
  assert.notEqual(end, -1, `${name} body closes`);
  return migration.slice(start, end);
}

test('durable consent migration is private, version-pinned and records self grant/withdrawal', () => {
  assert.match(migration, /CREATE TABLE public\.bakplanla_ai_consents[\s\S]*?REFERENCES auth\.users\(id\) ON DELETE CASCADE/i);
  assert.match(migration, /ALTER TABLE public\.bakplanla_ai_consents ENABLE ROW LEVEL SECURITY/i);
  assert.doesNotMatch(migration, /CREATE POLICY[^;]*bakplanla_ai_consents/i);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.bakplanla_ai_consents FROM PUBLIC, anon, authenticated, service_role/i);

  const status = functionBody('ai_consent_is_active');
  assert.match(status, /SECURITY DEFINER[\s\S]*?SET search_path TO ''/i);
  assert.match(status, /auth\.uid\(\)/i);
  assert.match(status, /auth\.role\(\) IS DISTINCT FROM 'service_role'/i);
  assert.match(status, /p_user IS NOT NULL AND p_user <> v_uid/i);
  assert.match(status, /consent_version = '2026-10-v1'[\s\S]*?consented_at IS NOT NULL[\s\S]*?withdrawn_at IS NULL/i);
  assert.match(status, /FOR SHARE/i);

  const grant = functionBody('grant_ai_consent');
  assert.match(grant, /p_expected_user IS DISTINCT FROM v_uid/i);
  assert.match(grant, /p_version IS DISTINCT FROM '2026-10-v1'/i);
  assert.match(grant, /ON CONFLICT \(user_id\) DO UPDATE[\s\S]*?consented_at = clock_timestamp\(\)[\s\S]*?withdrawn_at = NULL/i);

  const withdraw = functionBody('withdraw_ai_consent');
  assert.match(withdraw, /p_expected_user IS DISTINCT FROM v_uid/i);
  assert.match(withdraw, /ON CONFLICT \(user_id\) DO UPDATE[\s\S]*?consented_at = NULL[\s\S]*?withdrawn_at = clock_timestamp\(\)/i);
  assert.doesNotMatch(migration, /UPDATE\s+auth\.users|INSERT\s+INTO\s+auth\.users/i);

  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.ai_consent_is_active\(uuid\) TO authenticated, service_role/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.grant_ai_consent\(text, uuid\) TO authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.withdraw_ai_consent\(uuid\) TO authenticated/i);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.(grant_ai_consent|withdraw_ai_consent)[^;]*TO (PUBLIC|anon|service_role)/i);
});

test('corrected AI notice requires a new consent version without backfilling old grants', () => {
  const functionBody = (name) => {
    const start = reconsentMigration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
    assert.notEqual(start, -1, `${name} replacement exists`);
    const end = reconsentMigration.indexOf('$function$;', start);
    assert.notEqual(end, -1, `${name} replacement closes`);
    return reconsentMigration.slice(start, end);
  };
  assert.match(reconsentMigration, /2026-10-v1 records are not promoted or rewritten/i);
  assert.match(functionBody('ai_consent_is_active'), /consent_version = '2026-11-v1'[\s\S]*?consented_at IS NOT NULL[\s\S]*?withdrawn_at IS NULL/i);
  assert.match(functionBody('grant_ai_consent'), /p_version IS DISTINCT FROM '2026-11-v1'/i);
  assert.match(functionBody('grant_ai_consent'), /identity_mismatch[\s\S]*?version_mismatch[\s\S]*?ON CONFLICT \(user_id\) DO UPDATE/i);
  const preamble = reconsentMigration.slice(0, reconsentMigration.indexOf('CREATE OR REPLACE FUNCTION'));
  assert.doesNotMatch(preamble, /UPDATE\s+public\.bakplanla_ai_consents|INSERT\s+INTO\s+public\.bakplanla_ai_consents/i);
  assert.match(reconsentMigration, /SET search_path TO ''/i);
  assert.match(reconsentMigration, /REVOKE ALL ON FUNCTION public\.ai_consent_is_active\(uuid\) FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(reconsentMigration, /GRANT EXECUTE ON FUNCTION public\.grant_ai_consent\(text, uuid\) TO authenticated/i);
});

test('purpose authorization is separately versioned, default-deny, owner-bound and never backfilled', () => {
  assert.match(purposeMigration, /CREATE TABLE app_private\.bakplanla_ai_purpose_policy[\s\S]*?enabled boolean NOT NULL DEFAULT false/i);
  assert.match(purposeMigration, /VALUES \('ai_provider_processing', NULL, false\)/i);
  assert.match(purposeMigration, /CREATE TABLE app_private\.bakplanla_ai_purpose_authorizations[\s\S]*?REFERENCES auth\.users\(id\) ON DELETE CASCADE/i);
  assert.match(purposeMigration, /ALTER TABLE app_private\.bakplanla_ai_purpose_authorizations ENABLE ROW LEVEL SECURITY/i);
  assert.match(purposeMigration, /REVOKE ALL PRIVILEGES ON TABLE app_private\.bakplanla_ai_purpose_authorizations[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i);
  const purposeSchema = purposeMigration.slice(0, purposeMigration.indexOf('CREATE OR REPLACE FUNCTION'));
  assert.doesNotMatch(purposeSchema, /INSERT\s+INTO\s+app_private\.bakplanla_ai_purpose_authorizations/i);
  assert.doesNotMatch(purposeMigration, /SELECT[\s\S]*?FROM public\.bakplanla_ai_consents/i);

  const purposeBody = (name) => {
    const start = purposeMigration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
    assert.notEqual(start, -1, `${name} is defined`);
    const end = purposeMigration.indexOf('$function$;', start);
    assert.notEqual(end, -1, `${name} body closes`);
    return purposeMigration.slice(start, end);
  };
  const status = purposeBody('ai_provider_authorization_active');
  assert.match(status, /SECURITY DEFINER[\s\S]*?SET search_path TO ''/i);
  assert.match(status, /auth\.role\(\) IS DISTINCT FROM 'service_role'/i);
  assert.match(status, /p_user IS NOT NULL AND p_user IS DISTINCT FROM v_uid/i);
  assert.match(status, /policy\.enabled = TRUE[\s\S]*?grant_row\.purpose_version = policy\.active_version[\s\S]*?grant_row\.withdrawn_at IS NULL/i);

  const grant = purposeBody('grant_ai_provider_authorization');
  assert.match(grant, /p_expected_user IS DISTINCT FROM v_uid/i);
  assert.match(grant, /enabled = TRUE[\s\S]*?active_version IS NOT NULL/i);
  assert.match(grant, /purpose_unavailable/);
  assert.match(grant, /p_version IS DISTINCT FROM v_active_version/);

  const withdraw = purposeBody('withdraw_ai_provider_authorization');
  assert.match(withdraw, /p_expected_user IS DISTINCT FROM v_uid/i);
  assert.match(withdraw, /WHERE user_id = v_uid[\s\S]*?withdrawn_at IS NULL/i);
  assert.match(purposeMigration, /GRANT EXECUTE ON FUNCTION public\.ai_provider_authorization_active\(uuid\)\s+TO authenticated, service_role/i);
  assert.match(purposeMigration, /GRANT EXECUTE ON FUNCTION public\.grant_ai_provider_authorization\(text, uuid\)\s+TO authenticated/i);
  assert.match(purposeMigration, /GRANT EXECUTE ON FUNCTION public\.withdraw_ai_provider_authorization\(uuid\)\s+TO authenticated/i);
  assert.doesNotMatch(purposeMigration, /GRANT EXECUTE ON FUNCTION public\.(grant_ai_provider_authorization|withdraw_ai_provider_authorization)[^;]*TO (PUBLIC|anon|service_role)/i);
});

test('smart-endpoint checks consent before trial/quota and again at the provider boundary; Places is exempt', () => {
  const handler = endpoint.slice(endpoint.indexOf('async function handleRequest'));
  const initial = handler.indexOf('const consent = await aiConsentStatus(userId)');
  const egress = handler.indexOf('providerProcessingEnabled(processor');
  const sensitive = handler.indexOf('providerProcessingEnabled("aiSensitiveContent"');
  const rate = handler.indexOf('const rateDecision = await checkSharedRateLimit');
  const trial = handler.indexOf('reserveFeatureTrial(featureTrialTake, userId, restrictedFeature)');
  const quota = handler.indexOf('reserveAiQuota(aiQuotaTake, userId)');
  const provider = handler.indexOf('openaiForRequest(req, openaiKey');
  assert.ok(initial >= 0 && initial < trial && initial < quota && initial < provider);
  assert.ok(initial < egress && egress < sensitive && sensitive < rate && rate < trial && trial < quota && quota < provider,
    'authorization and both default-closed provider policies must precede rate/quota/trial and dispatch');
  assert.match(endpoint, /if \(mode !== "places"\) \{[\s\S]*?const consent = await aiConsentStatus\(userId\)/);
  assert.match(endpoint, /serviceRpc\("ai_consent_is_active"[\s\S]*?serviceRpc\("ai_provider_authorization_active"/);
  assert.match(endpoint, /combineAiAuthorizations\(legacyConsent, purposeAuthorization\)/);

  const providerGateStart = endpoint.indexOf('async function openaiForRequest');
  const providerGateEnd = endpoint.indexOf('// --- Gövdeyi okurken', providerGateStart);
  const providerGate = endpoint.slice(providerGateStart, providerGateEnd);
  assert.match(providerGate, /checkAiConsent|aiConsentStatus\(reservation\.userId\)/);
  assert.ok(providerGate.indexOf('aiConsentStatus(reservation.userId)') < providerGate.indexOf('runReservedAiProvider'));
  assert.match(endpoint, /code: "ai_consent_required" }, 403/);
  assert.match(endpoint, /code: "ai_consent_unavailable" }, 503/);
  assert.match(endpoint, /code: "sensitive_processing_disabled" }, 503/);
  assert.match(endpoint, /mode === "places"\) \{\s*try \{\s*return await handlePlaces\(body\)/);
});

test('client reads server state only, uses the corrected notice version, and requires server grant/revoke RPCs without Auth metadata mirrors', () => {
  assert.match(app, /const AI_CONSENT_VERSION = '2026-11-v1'/);
  const promptStart = app.indexOf('const askAiConsent =');
  const promptEnd = app.indexOf('const hasAiConsent =', promptStart);
  const prompt = app.slice(promptStart, promptEnd);
  assert.match(prompt, /Selecting "I agree" records your choice/);
  assert.match(prompt, /does not establish that an international transfer is legally permitted/);
  assert.doesNotMatch(prompt, /give explicit consent to this transfer abroad/);
  assert.match(prompt, /text: tAi\('İzin veriyorum', 'I agree'/);
  assert.match(prompt, /API content is not used to train its models by default/i);
  assert.match(prompt, /up to 30 days by default/i);
  assert.match(prompt, /data controls for the BAKPLANLA account and configured endpoint have not been verified/i);
  assert.doesNotMatch(prompt, /does not keep it permanently|kalıcı olarak saklamaz|speichert sie nicht dauerhaft/i);

  const statusStart = app.indexOf('const hasAiConsent =');
  const ensureStart = app.indexOf('const ensureAiConsent =', statusStart);
  const status = app.slice(statusStart, ensureStart);
  assert.match(status, /supabase\.rpc\('ai_provider_authorization_active', \{ p_user: user\.id \}\)/);
  assert.match(status, /supabase\.rpc\('ai_consent_is_active', \{ p_user: user\.id \}\)/);
  assert.match(status, /purposeClosed: true/);
  assert.doesNotMatch(status, /user_metadata|AsyncStorage/);

  const grantStart = app.indexOf("supabase.rpc('grant_ai_consent'");
  const mirrorStart = app.indexOf('AsyncStorage.setItem(aiConsentKey(user.id)', grantStart);
  assert.ok(grantStart >= 0 && mirrorStart > grantStart, 'server grant succeeds before compatibility mirrors are written');
  assert.match(app.slice(grantStart, mirrorStart), /p_expected_user: user\.id/);
  const grantEnd = app.indexOf("return 'allowed';", mirrorStart);
  assert.doesNotMatch(app.slice(mirrorStart, grantEnd), /supabase\.auth\.updateUser/);

  const withdrawStart = app.indexOf("supabase.rpc('withdraw_ai_consent'");
  const removeMirror = app.indexOf('AsyncStorage.removeItem(aiConsentKey(user.id))', withdrawStart);
  assert.ok(app.indexOf("supabase.rpc('withdraw_ai_provider_authorization'") < withdrawStart, 'purpose authorization is revoked before the legacy consent record');
  assert.ok(withdrawStart >= 0 && removeMirror > withdrawStart, 'server withdrawal commits before local mirror removal');
  assert.match(app.slice(withdrawStart, removeMirror), /p_expected_user: user\.id/);
  const withdrawEnd = app.indexOf('return true;', removeMirror);
  assert.doesNotMatch(app.slice(removeMirror, withdrawEnd), /supabase\.auth\.updateUser/);
});

test('consent checks fail closed and a revocation completed before the provider-boundary check prevents invocation', async () => {
  const { checkAiConsent, runReservedAiProvider } = await import(helperUrl);
  assert.equal(await checkAiConsent(async () => true, 'synthetic-a'), 'allowed');
  assert.equal(await checkAiConsent(async () => false, 'synthetic-a'), 'denied');
  assert.equal(await checkAiConsent(async () => null, 'synthetic-a'), 'unavailable');
  assert.equal(await checkAiConsent(async () => { throw new Error('synthetic RPC failure'); }, 'synthetic-a'), 'unavailable');

  let active = true;
  let providerCalls = 0;
  const reservation = { providerStarted: false };
  const initial = await checkAiConsent(async () => active, 'synthetic-a');
  assert.equal(initial, 'allowed');
  // This models a completed withdrawal between the early gate and the final gate.
  active = false;
  const final = await checkAiConsent(async () => active, 'synthetic-a');
  if (final === 'allowed') await runReservedAiProvider(reservation, async () => { providerCalls += 1; });
  assert.equal(final, 'denied');
  assert.equal(providerCalls, 0);
  assert.equal(reservation.providerStarted, false);
});
