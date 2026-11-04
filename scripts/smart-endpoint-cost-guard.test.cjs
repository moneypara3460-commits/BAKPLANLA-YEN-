const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const guardPath = path.join(__dirname, '../supabase/functions/smart-endpoint/aiCostGuard.mjs');
const guardUrl = pathToFileURL(guardPath).href;
const sqlPath = path.join(__dirname, '../supabase/migrations/20261029190000_initial_catalog_baseline.sql');
const currentLimiterPath = path.join(__dirname, '../supabase/migrations/20261031190000_secure_promo_pairing_redemption.sql');
const endpointPath = path.join(__dirname, '../supabase/functions/smart-endpoint/index.ts');

test('AI dispatch requires both the historical gate and the distinct purpose authorization', async () => {
  const { combineAiAuthorizations } = await import(guardUrl);
  assert.equal(combineAiAuthorizations('allowed', 'allowed'), 'allowed');
  assert.equal(combineAiAuthorizations('allowed', 'denied'), 'denied');
  assert.equal(combineAiAuthorizations('denied', 'allowed'), 'denied');
  assert.equal(combineAiAuthorizations('unavailable', 'allowed'), 'unavailable');
  assert.equal(combineAiAuthorizations('allowed', 'unavailable'), 'unavailable');
});

test('shared rate limit denies unavailable, malformed and thrown DB results', async () => {
  const { checkSharedRateLimit } = await import(guardUrl);
  assert.equal(await checkSharedRateLimit(async () => true, 'synthetic-user', 'ai'), 'allowed');
  assert.equal(await checkSharedRateLimit(async () => false, 'synthetic-user', 'ai'), 'limited');
  assert.equal(await checkSharedRateLimit(async () => null, 'synthetic-user', 'ai'), 'unavailable');
  assert.equal(await checkSharedRateLimit(async () => ({ allowed: true }), 'synthetic-user', 'ai'), 'unavailable');
  assert.equal(await checkSharedRateLimit(async () => { throw new Error('synthetic DB outage'); }, 'synthetic-user', 'ai'), 'unavailable');
});

test('concurrent synthetic requests share the atomic limiter result and only admitted requests reserve quota', async () => {
  const { checkSharedRateLimit } = await import(guardUrl);
  const counters = new Map();
  const maximum = 7;
  let quotaReservations = 0;
  const atomicRpc = async (userId, bucket) => {
    const key = `${userId}:${bucket}`;
    const current = counters.get(key) || 0;
    if (current >= maximum) return false;
    counters.set(key, current + 1);
    return true;
  };
  const claims = await Promise.all(Array.from({ length: 32 }, async () => {
    const result = await checkSharedRateLimit(atomicRpc, '00000000-0000-4000-8000-000000000011', 'ai');
    if (result === 'allowed') quotaReservations += 1;
    return result;
  }));
  assert.equal(claims.filter((claim) => claim === 'allowed').length, maximum);
  assert.equal(claims.filter((claim) => claim === 'limited').length, 32 - maximum);
  assert.equal(quotaReservations, maximum);
  assert.equal(counters.get('00000000-0000-4000-8000-000000000011:ai'), maximum);
});

test('quota reservation fails closed and preserves daily/monthly limit responses', async () => {
  const { reserveAiQuota } = await import(guardUrl);
  assert.deepEqual(await reserveAiQuota(async () => ({ ok: true, day_used: 1 }), 'synthetic-user'), {
    state: 'reserved', quota: { ok: true, day_used: 1 },
  });
  assert.equal((await reserveAiQuota(async () => ({ ok: false, error: 'daily' }), 'synthetic-user')).state, 'limited');
  assert.equal((await reserveAiQuota(async () => ({ ok: false, error: 'monthly' }), 'synthetic-user')).state, 'limited');
  assert.equal((await reserveAiQuota(async () => null, 'synthetic-user')).state, 'unavailable');
  assert.equal((await reserveAiQuota(async () => ({ ok: 'true' }), 'synthetic-user')).state, 'unavailable');
  assert.equal((await reserveAiQuota(async () => { throw new Error('synthetic quota outage'); }, 'synthetic-user')).state, 'unavailable');
});

test('unavailable quota RPC fails closed before the paid provider path', async () => {
  const { reserveAiQuota, runReservedAiProvider } = await import(guardUrl);
  let providerCalls = 0;
  const decision = await reserveAiQuota(async () => { throw new Error('synthetic quota RPC outage'); }, 'synthetic-user');
  if (decision.state === 'reserved') {
    await runReservedAiProvider({ providerStarted: false, aiQuotaReserved: true }, async () => {
      providerCalls += 1;
    });
  }
  assert.equal(decision.state, 'unavailable');
  assert.equal(providerCalls, 0);
  const source = fs.readFileSync(endpointPath, 'utf8');
  assert.match(source, /else \{\s*return json\(\{ error: "Servis şu anda kullanılamıyor\." \}, 503\);\s*\}/);
});

test('concurrent synthetic quota takes do not exceed the configured allowance', async () => {
  const { reserveAiQuota } = await import(guardUrl);
  const maximum = 9;
  let used = 0;
  const atomicQuotaRpc = async () => {
    if (used >= maximum) return { ok: false, error: 'daily' };
    used += 1;
    return { ok: true, day_used: used };
  };
  const decisions = await Promise.all(Array.from({ length: 40 }, () =>
    reserveAiQuota(atomicQuotaRpc, '00000000-0000-4000-8000-000000000012')
  ));
  assert.equal(decisions.filter((decision) => decision.state === 'reserved').length, maximum);
  assert.equal(decisions.filter((decision) => decision.state === 'limited').length, 40 - maximum);
  assert.equal(used, maximum);
});

test('paid provider invocation requires a reservation and marks ambiguous attempts before calling', async () => {
  const { runReservedAiProvider } = await import(guardUrl);
  let calls = 0;
  await assert.rejects(runReservedAiProvider(null, async () => { calls += 1; }), /reservation required/);
  assert.equal(calls, 0);

  const reservation = { providerStarted: false };
  await runReservedAiProvider(reservation, async () => {
    assert.equal(reservation.providerStarted, true);
    calls += 1;
  });
  assert.equal(calls, 1);
});

test('reservations are refunded only for errors before any provider attempt', async () => {
  const { shouldRefundPreProviderReservations } = await import(guardUrl);
  assert.equal(shouldRefundPreProviderReservations(400, { providerStarted: false }), true);
  assert.equal(shouldRefundPreProviderReservations(503, { providerStarted: false }), true);
  assert.equal(shouldRefundPreProviderReservations(502, { providerStarted: true }), false);
  assert.equal(shouldRefundPreProviderReservations(200, { providerStarted: false }), false);
  assert.equal(shouldRefundPreProviderReservations(503, null), false);
});

test('an ambiguous provider failure never becomes refundable after the provider attempt starts', async () => {
  const { runReservedAiProvider, shouldRefundPreProviderReservations } = await import(guardUrl);
  const reservation = { providerStarted: false, featureTrialReserved: true, aiQuotaReserved: true };
  await assert.rejects(runReservedAiProvider(reservation, async () => { throw new Error('synthetic provider timeout'); }), /synthetic provider timeout/);
  assert.equal(reservation.providerStarted, true);
  assert.equal(shouldRefundPreProviderReservations(502, reservation), false);
});

test('existing PostgreSQL limiter and quota RPCs retain atomic reservation primitives', () => {
  const sql = fs.readFileSync(sqlPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();
  const limiterSql = fs.readFileSync(currentLimiterPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();
  const rateStart = limiterSql.indexOf('create or replace function public.check_rate_limit(');
  const rateEnd = limiterSql.indexOf('$function$;', rateStart);
  const rateFunction = limiterSql.slice(rateStart, rateEnd);
  assert.match(rateFunction, /on conflict \(user_id, bucket, window_start\) do update set request_count = public\.rate_limit_counters\.request_count \+ 1 where public\.rate_limit_counters\.request_count < p_limit returning request_count/);
  assert.match(rateFunction, /p_bucket not in \('ai', 'places', 'pairing'\)/);

  const quotaStart = sql.indexOf('create or replace function public.ai_usage_take(');
  const quotaEnd = sql.indexOf('$function$;', quotaStart);
  const quotaFunction = sql.slice(quotaStart, quotaEnd);
  assert.match(quotaFunction, /where user_id = p_user and day = v_day for update/);
  assert.match(quotaFunction, /update public\.bakplanla_ai_usage set used = used \+ 1 where user_id = p_user and day = v_day/);
});

test('smart-endpoint has no memory fallback and gates every OpenAI call on rate and quota claims', () => {
  const source = fs.readFileSync(endpointPath, 'utf8');
  assert.doesNotMatch(source, /memoryRateLimited|RATE_LIMIT_BACKEND|RATE_LIMIT_FAIL_CLOSED|AI_QUOTA_FAIL_CLOSED/);
  assert.ok(/checkSharedRateLimit\(\s*dbRateAllowed/.test(source));
  assert.match(source, /reserveAiQuota\(aiQuotaTake/);
  assert.match(source, /const reservation = requestReservations\.get\(req\);[\s\S]*?return runReservedAiProvider\(reservation,/);
  assert.match(source, /const consent = await aiConsentStatus\(reservation\.userId\);[\s\S]*?return runReservedAiProvider\(reservation,/);
  assert.equal((source.match(/openaiResponses\(/g) || []).length, 1);
  const handler = source.slice(source.indexOf('async function handleRequest'));
  const rateClaim = handler.indexOf('const rateDecision = await checkSharedRateLimit');
  const quotaClaim = handler.indexOf('const quotaDecision = await reserveAiQuota');
  const providerCall = handler.indexOf('openaiForRequest(req, openaiKey');
  assert.ok(rateClaim >= 0 && rateClaim < quotaClaim && quotaClaim < providerCall);
  assert.match(source, /RATE_LIMIT_AI_PER_MIN", 10/);
  assert.match(source, /RATE_LIMIT_PLACES_PER_MIN", 30/);
  assert.match(source, /AI_DAILY_LIMIT_FREE", 25/);
  assert.match(source, /AI_MONTHLY_LIMIT_FREE", 300/);
  assert.match(source, /p_user: userId/);
});
