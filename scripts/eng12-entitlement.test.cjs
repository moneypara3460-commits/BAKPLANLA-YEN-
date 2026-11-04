const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const entitlementUrl = pathToFileURL(path.join(__dirname, '../entitlement.js')).href;
const guardUrl = pathToFileURL(path.join(__dirname, '../supabase/functions/smart-endpoint/aiCostGuard.mjs')).href;
const migrationPath = path.join(__dirname, '../supabase/migrations/20261031110000_server_authoritative_document_trial.sql');
const edgePath = path.join(__dirname, '../supabase/functions/smart-endpoint/index.ts');
const appPath = path.join(__dirname, '../App.js');
const helpersPath = path.join(__dirname, '../helpers.js');

const mockSupabase = ({ entitlement, trials, error } = {}) => {
  const calls = { tables: [], rpc: [] };
  const supabase = {
    from(table) {
      calls.tables.push(table);
      const result = table === 'bakplanla_entitlements'
        ? { data: entitlement ?? null, error: error ?? null }
        : { data: trials ?? [], error: error ?? null };
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        maybeSingle() { return Promise.resolve(result); },
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      };
      return builder;
    },
    rpc(...args) { calls.rpc.push(args); throw new Error('client RPC must not authorize AI'); },
  };
  return { supabase, calls };
};

test('AI feature mapping restricts document analysis only and preserves all current free modes', async () => {
  const { featureForSmartMode } = await import(guardUrl);
  assert.equal(featureForSmartMode(undefined), 'documentAnalysis');
  assert.equal(featureForSmartMode('unknown-fallback-mode'), 'documentAnalysis');
  assert.equal(featureForSmartMode('chat'), null);
  assert.equal(featureForSmartMode('opportunities'), null);
  assert.equal(featureForSmartMode('receipt'), null);
  assert.equal(featureForSmartMode('places'), null);
});

test('feature RPC decision fails closed on malformed, denied and unavailable results', async () => {
  const { featureTrialDecision, reserveFeatureTrial } = await import(guardUrl);
  assert.deepEqual(featureTrialDecision({ allowed: true, pro: true }), { state: 'pro' });
  assert.deepEqual(featureTrialDecision({ allowed: true, pro: false }), { state: 'trial' });
  assert.deepEqual(featureTrialDecision({ allowed: false, pro: false }), { state: 'limited' });
  assert.deepEqual(featureTrialDecision({ allowed: false, pro: false, retry_limited: true }), { state: 'retry_limited' });
  assert.deepEqual(featureTrialDecision({ allowed: true }), { state: 'unavailable' });
  assert.deepEqual(await reserveFeatureTrial(async () => { throw new Error('rpc down'); }, 'synthetic', 'documentAnalysis'), { state: 'unavailable' });
});

test('UI gate previews server entitlement and trial state without consuming or refunding a trial', async () => {
  const { createFeatureGate } = await import(entitlementUrl);
  const { supabase, calls } = mockSupabase({ trials: [] });
  const gate = createFeatureGate({ supabase, getUid: () => 'synthetic-user' });
  const result = await gate('documentAnalysis');
  assert.equal(result.allowed, true);
  assert.equal(result.mode, 'trial');
  assert.equal(typeof result.refund, 'function');
  await result.refund();
  assert.deepEqual(calls.tables, ['bakplanla_entitlements', 'bakplanla_feature_trials']);
  assert.deepEqual(calls.rpc, []);
});

test('UI preview recognizes current Pro, expired Pro and an exhausted trial from server rows', async () => {
  const { createFeatureGate } = await import(entitlementUrl);
  const pro = mockSupabase({
    entitlement: { plan: 'pro_monthly', status: 'active', current_period_end: '2027-01-01T00:00:00Z' },
  });
  assert.equal((await createFeatureGate({ supabase: pro.supabase, getUid: () => 'u', now: () => Date.parse('2026-10-31') })('documentAnalysis')).mode, 'pro');
  assert.deepEqual(pro.calls.tables, ['bakplanla_entitlements']);

  const expired = mockSupabase({
    entitlement: { plan: 'pro_yearly', status: 'canceled', current_period_end: '2026-01-01T00:00:00Z' },
    trials: [],
  });
  assert.equal((await createFeatureGate({ supabase: expired.supabase, getUid: () => 'u', now: () => Date.parse('2026-10-31') })('documentAnalysis')).mode, 'trial');

  const used = mockSupabase({ trials: [{ feature: 'documentAnalysis', used_count: 1 }] });
  assert.equal((await createFeatureGate({ supabase: used.supabase, getUid: () => 'u' })('documentAnalysis')).mode, 'blocked');
});

test('restricted UI preview fails closed when entitlement or trial reads fail', async () => {
  const { createFeatureGate } = await import(entitlementUrl);
  const { supabase } = mockSupabase({ error: { code: '42501', message: 'denied' } });
  const result = await createFeatureGate({ supabase, getUid: () => 'synthetic-user' })('documentAnalysis');
  assert.equal(result.allowed, false);
  assert.equal(result.mode, 'error');
});

test('migration grants identity-explicit atomic trial RPCs only to service_role and revokes client refunds', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /consume_feature_trial_for_user\(p_user uuid, p_feature text\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path TO ''/);
  assert.match(sql, /ON CONFLICT \(user_id, feature\)[\s\S]*?WHERE t\.used_count < 1/);
  assert.equal((sql.match(/p_feature IS DISTINCT FROM 'documentAnalysis'/g) || []).length, 2);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.consume_feature_trial_for_user\(uuid, text\) FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.consume_feature_trial_for_user\(uuid, text\) TO service_role;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.refund_feature_trial_for_user\(uuid, text\) TO service_role;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.refund_feature_trial\(text\) FROM PUBLIC, anon, authenticated, service_role;/);
});

test('refund cap never consumes a trial on a later pre-provider attempt', () => {
  const refundMigration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261031110000_server_authoritative_document_trial.sql'), 'utf8');
  assert.match(refundMigration, /AND t\.refunds < 5/);
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261031170000_preserve_trial_after_refund_limit.sql'), 'utf8');
  assert.match(sql, /WHERE t\.used_count < 1\s+AND t\.refunds < 5/);
  assert.match(sql, /IF v_used = 0 AND v_refunds >= 5 THEN[\s\S]*?retry_limited/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.consume_feature_trial_for_user\(uuid, text\) TO service_role;/);
  const edge = fs.readFileSync(edgePath, 'utf8');
  assert.match(edge, /access\.state === "retry_limited"[\s\S]*?code: "feature_trial_retry_limit"/);
  assert.match(edge, /code: "feature_trial_retry_limit"[^\n]*429/);
  assert.match(edge, /if \(shouldRefundPreProviderReservations\(res\.status, reservation\)\) \{[\s\S]*?reservation\.featureTrialReserved[\s\S]*?featureTrialRefund/);
  assert.match(fs.readFileSync(helpersPath, 'utf8'), /data\?\.code === 'feature_trial_retry_limit'[\s\S]*?featureTrialRetryLimit/);
});

test('smart-endpoint authorizes the document feature before daily quota and gates every provider path', () => {
  const edge = fs.readFileSync(edgePath, 'utf8');
  const featureGate = edge.indexOf('reserveFeatureTrial(featureTrialTake, userId, restrictedFeature)');
  const quotaGate = edge.indexOf('reserveAiQuota(aiQuotaTake, userId)');
  assert.notEqual(featureGate, -1);
  assert.ok(featureGate < quotaGate);
  assert.match(edge, /body\.code === "feature_trial_exhausted"|code: "feature_trial_exhausted"/);
  assert.doesNotMatch(edge, /body\.(?:isPro|pro|entitlement|featureTrial)/);
  assert.equal((edge.match(/openaiForRequest\(req, openaiKey/g) || []).length, 4);
  assert.match(edge, /if \(reservation\.featureTrialReserved\) await featureTrialRefund\(reservation\.userId, "documentAnalysis"\)/);
});

test('document-analysis trial rejection preserves the existing blocked modal and never calls the client refund RPC', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  const helpers = fs.readFileSync(helpersPath, 'utf8');
  assert.match(app, /error\?\.kind === 'featureTrial'[\s\S]*?showGateBlocked\(\{ mode: 'blocked' \}/);
  assert.doesNotMatch(app, /gate\.refund\(/);
  assert.match(helpers, /data\?\.code === 'feature_trial_exhausted'[\s\S]*?makeSmartError\('featureTrial'/);
});
