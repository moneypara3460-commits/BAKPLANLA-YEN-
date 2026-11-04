const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261101100000_isbasi_completion_recovery.sql'), 'utf8');
const edgeIndex = fs.readFileSync(path.join(root, 'supabase/functions/isbasi/index.ts'), 'utf8');
const serverUrl = pathToFileURL(path.join(root, 'supabase/functions/isbasi/isbasiServer.js'));
const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
const screenSource = fs.readFileSync(path.join(root, 'IsBasiScreen.js'), 'utf8');
const replayUrl = pathToFileURL(path.join(root, 'isbasiReplay.js'));
const gameUrl = pathToFileURL(path.join(root, 'isbasi.js'));
const apiUrl = pathToFileURL(path.join(root, 'isbasiApi.js'));
let serverPromise;
let replayPromise;
let gamePromise;
let apiPromise;

const loadModules = async () => {
  [serverPromise, replayPromise, gamePromise, apiPromise] = await Promise.all([
    import(serverUrl), import(replayUrl), import(gameUrl), import(apiUrl),
  ]);
  return { server: serverPromise, replay: replayPromise, game: gamePromise, api: apiPromise };
};

const makeValidShift = async (seed = 12345) => {
  const { replay, game } = await loadModules();
  let state = replay.createRoleShift('barista', 1, seed, '2026-11-01');
  while (!state.finished) {
    const recipe = game.recipeByKey(state.orders[state.index].recipeKey);
    for (const ingredient of recipe.steps) {
      state = game.advance(state, 300);
      state = replay.dispatch(state, 'addIngredient', ingredient);
    }
    state = game.advance(state, 300);
    state = replay.dispatch(state, 'serve');
  }
  return state;
};

const createDb = async ({ now, loseClaimResponse = false, loseCommitResponse = false, rewardReady = false } = {}) => {
  const { game, server } = await loadModules();
  const userId = '11111111-1111-4111-8111-111111111111';
  const shiftId = '22222222-2222-4222-8222-222222222222';
  const progressData = game.emptyProgress();
  if (rewardReady) progressData.venues.demoCafe.rewardProgress = 4;
  const state = {
    shift: {
      id: shiftId, user_id: userId, role: 'barista', level: 1, seed: 12345, game_date: '2026-11-01',
      started_at: new Date(now - 10_000).toISOString(), status: 'started',
      completion_request: null, completion_result: null, claimed_at: null,
    },
    progress: { user_id: userId, data: progressData, version: 1 },
    coupons: [],
    claimCalls: 0,
    commitCalls: 0,
    rejectCalls: 0,
  };
  const db = {
    async claimShift(requestedShiftId, requestedUserId, submission) {
      if (requestedShiftId !== shiftId || requestedUserId !== userId) return null;
      if (state.shift.status === 'started') {
        state.shift.status = 'claimed';
        state.shift.completion_request = structuredClone(submission);
        state.shift.claimed_at = new Date(now - 5_000).toISOString();
      } else if (state.shift.status === 'claimed' && !state.shift.completion_request) {
        state.shift.completion_request = structuredClone(submission);
        state.shift.claimed_at ||= new Date(now - 5_000).toISOString();
      } else if (state.shift.status !== 'claimed' && !(state.shift.status === 'verified' && state.shift.completion_result)) {
        return null;
      }
      state.claimCalls += 1;
      if (loseClaimResponse) {
        loseClaimResponse = false;
        throw new Error('simulated claim RPC response loss after transaction commit');
      }
      return structuredClone(state.shift);
    },
    async rejectShift(_id, reason) {
      state.rejectCalls += 1;
      if (state.shift.status === 'claimed') {
        state.shift.status = 'rejected';
        state.shift.reject_reason = reason;
      }
    },
    async getProgress() { return structuredClone(state.progress); },
    async getActiveOffer() { return null; },
    async commit(args) {
      state.commitCalls += 1;
      if (state.shift.status === 'verified' && state.shift.completion_result) {
        return { ok: true, result: structuredClone(state.shift.completion_result), replayed: true };
      }
      if (state.shift.status !== 'claimed') return { ok: false, conflict: 'shift' };
      if (args.oldVersion !== state.progress.version) return { ok: false, conflict: 'progress' };

      let coupon = null;
      if (args.coupon) {
        coupon = {
          ...args.coupon,
          id: '33333333-3333-4333-8333-333333333333',
          issued_at: new Date(now).toISOString(),
          redeemed_at: null,
        };
        state.coupons.push(coupon);
      }
      state.progress = { ...state.progress, data: structuredClone(args.progress), version: state.progress.version + 1 };
      state.shift.status = 'verified';
      state.shift.score = args.score;
      state.shift.max_score = args.maxScore;
      state.shift.stars = args.stars;
      state.shift.completion_request = null;
      state.shift.completion_result = {
        ...structuredClone(args.completion),
        coupon: coupon ? server.publicCoupon(coupon) : null,
      };

      const response = { ok: true, result: structuredClone(state.shift.completion_result), replayed: false };
      if (loseCommitResponse) {
        loseCommitResponse = false;
        throw new Error('simulated commit RPC response loss after transaction commit');
      }
      return response;
    },
  };
  return { db, state, userId, shiftId };
};

const requestFor = (shiftId, state) => ({ mode: 'finish', shiftId, log: structuredClone(state.log), endT: state.elapsedMs });
const finish = async ({ db, userId, body, now }) => {
  const { server } = await loadModules();
  return server.handleFinish({ db, userId, body, now, randomBytes: (n) => new Uint8Array(n) });
};

test('timeout after claim recovers from the first server-persisted submission, even if retry body differs', async () => {
  const now = Date.now();
  const gameState = await makeValidShift();
  const harness = await createDb({ now, loseClaimResponse: true, rewardReady: true });
  const firstBody = requestFor(harness.shiftId, gameState);
  await assert.rejects(finish({ ...harness, body: firstBody, now }), /response loss after transaction commit/);
  assert.equal(harness.state.shift.status, 'claimed');
  assert.ok(harness.state.shift.completion_request);

  const retry = await finish({ ...harness, body: { ...firstBody, log: [], endT: 0 }, now });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.summary.score, 743);
  assert.equal(retry.body.rewardEarned, true);
  assert.equal(harness.state.progress.data.venues.demoCafe.rewardsEarned, 1);
  assert.equal(harness.state.coupons.length, 1);
});

test('concurrent completions return one durable result and award progress/coupon once', async () => {
  const now = Date.now();
  const gameState = await makeValidShift();
  const harness = await createDb({ now, rewardReady: true });
  const body = requestFor(harness.shiftId, gameState);
  const results = await Promise.all([
    finish({ ...harness, body, now }),
    finish({ ...harness, body, now }),
  ]);
  assert.deepEqual(results.map((result) => result.status), [200, 200]);
  assert.deepEqual(results[0].body, results[1].body);
  assert.equal(harness.state.progress.data.venues.demoCafe.rewardsEarned, 1);
  assert.equal(harness.state.coupons.length, 1);
  assert.equal(harness.state.progress.data.roles.barista.shifts, 1);
});

test('a response lost after transactional completion is replayed without another reward', async () => {
  const now = Date.now();
  const gameState = await makeValidShift();
  const harness = await createDb({ now, loseCommitResponse: true, rewardReady: true });
  const body = requestFor(harness.shiftId, gameState);
  await assert.rejects(finish({ ...harness, body, now }), /response loss after transaction commit/);
  assert.equal(harness.state.shift.status, 'verified');

  const retry = await finish({ ...harness, body, now });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.rewardEarned, true);
  assert.equal(harness.state.progress.data.venues.demoCafe.rewardsEarned, 1);
  assert.equal(harness.state.coupons.length, 1);
});

test('a concurrent replay returns the latest account progress instead of a stale pre-commit snapshot', async () => {
  const now = Date.now();
  const gameState = await makeValidShift();
  const harness = await createDb({ now });
  const firstRead = structuredClone(harness.state.progress);
  const newerProgress = structuredClone(harness.state.progress);
  newerProgress.version += 1;
  newerProgress.data.roles.cashier.shifts = 1;
  let reads = 0;
  harness.db.getProgress = async () => {
    reads += 1;
    return structuredClone(reads === 1 ? firstRead : newerProgress);
  };
  harness.db.commit = async () => ({
    ok: true,
    replayed: true,
    result: { verified: true, summary: gameState.log.length ? { score: 743 } : null },
  });

  const result = await finish({ ...harness, body: requestFor(harness.shiftId, gameState), now });
  assert.equal(result.status, 200);
  assert.equal(result.body.progress.roles.cashier.shifts, 1);
});

test('temporary progress contention keeps the claim recoverable for the next retry', async () => {
  const now = Date.now();
  const gameState = await makeValidShift();
  const harness = await createDb({ now, rewardReady: true });
  const commit = harness.db.commit;
  let conflicts = 4;
  harness.db.commit = async (...args) => {
    if (conflicts > 0) {
      conflicts -= 1;
      return { ok: false, conflict: 'progress' };
    }
    return commit(...args);
  };
  const body = requestFor(harness.shiftId, gameState);

  const busy = await finish({ ...harness, body, now });
  assert.equal(busy.status, 503);
  assert.equal(harness.state.shift.status, 'claimed');
  assert.ok(harness.state.shift.completion_request);

  harness.db.commit = commit;
  const recovered = await finish({ ...harness, body, now });
  assert.equal(recovered.status, 200);
  assert.equal(harness.state.shift.status, 'verified');
  assert.equal(harness.state.progress.data.venues.demoCafe.rewardsEarned, 1);
  assert.equal(harness.state.coupons.length, 1);
});

test('the client persists before submit, retains uncertain outcomes and refuses a submit when persistence fails', async () => {
  const { api } = await loadModules();
  const pending = { shiftId: 'shift', log: [[1, 0]], endT: 2, savedAt: 1 };
  const events = [];
  const uncertain = await api.finishWithDurablePending(pending, {
    persist: async () => { events.push('persist'); return true; },
    submit: async () => { events.push('submit'); return { ok: false, kind: 'network', status: 0 }; },
    clear: async () => { events.push('clear'); return true; },
  });
  assert.deepEqual(events, ['persist', 'submit']);
  assert.equal(uncertain.kind, 'network');

  const authEvents = [];
  const authRetry = await api.finishWithDurablePending(pending, {
    persist: async () => { authEvents.push('persist'); return true; },
    submit: async () => { authEvents.push('submit'); return { ok: false, kind: 'auth', status: 401 }; },
    clear: async () => { authEvents.push('clear'); return true; },
  });
  assert.equal(authRetry.kind, 'auth');
  assert.deepEqual(authEvents, ['persist', 'submit']);

  let submitted = false;
  const unsaved = await api.finishWithDurablePending(pending, {
    persist: async () => false,
    submit: async () => { submitted = true; return { ok: true }; },
    clear: async () => true,
  });
  assert.equal(unsaved.kind, 'pending_storage');
  assert.equal(submitted, false);
  assert.equal(api.isPendingUsable({ ...pending, savedAt: 1 }, 60 * 60 * 1000), true);
});

test('finish deadline covers a stalled response body and preserves the receipt for idempotent retry', async () => {
  const { api: helpers } = await loadModules();
  const pending = { shiftId: 'durable-shift', log: [[300, 1, 'milk']], endT: 900, savedAt: 123 };
  let requestCount = 0;
  let firstSignal;
  const submittedBodies = [];
  const api = helpers.createIsbasiApi({
    baseUrl: 'https://dev.example.invalid',
    apiKey: 'synthetic-public-key',
    getToken: async () => 'synthetic-user-session',
    timeoutMs: 20,
    fetchImpl: async (_url, options) => {
      requestCount += 1;
      submittedBodies.push(JSON.parse(options.body));
      if (requestCount === 1) {
        firstSignal = options.signal;
        return { status: 200, json: () => new Promise(() => {}) };
      }
      return { status: 200, json: async () => ({
        ok: true,
        summary: { score: 743, stars: 3 },
        progress: { version: 2 },
        coupon: { id: 'synthetic-coupon' },
      }) };
    },
  });
  let storedPending = null;
  let cleared = false;
  const submitPending = (submission) => helpers.finishWithDurablePending(submission, {
    persist: async (value) => { storedPending = structuredClone(value); return true; },
    submit: (shiftId, log, endT) => api.finish(shiftId, log, endT),
    clear: async () => { cleared = true; storedPending = null; return true; },
  });
  const first = await Promise.race([
    submitPending(pending),
    new Promise((_, reject) => setTimeout(() => reject(new Error('body_timeout_unbounded')), 250)),
  ]);
  assert.equal(first.kind, 'network');
  assert.equal(first.status, 0);
  assert.equal(firstSignal.aborted, true);
  assert.deepEqual(storedPending, pending);
  assert.equal(cleared, false);

  const retry = await submitPending(storedPending);
  assert.equal(retry.ok, true);
  assert.deepEqual(retry.data.summary, { score: 743, stars: 3 });
  assert.equal(retry.data.progress.version, 2);
  assert.equal(cleared, true);
  assert.equal(storedPending, null);
  assert.equal(requestCount, 2);
  assert.deepEqual(submittedBodies[0], submittedBodies[1]);
  assert.deepEqual(submittedBodies[1], { mode: 'finish', shiftId: pending.shiftId, log: pending.log, endT: pending.endT });
});

test('a server retry must recover the unresolved submission before another shift can start', async () => {
  const { api } = await loadModules();
  const pending = { shiftId: 'old-shift', log: [[1, 0]], endT: 2 };
  let started = false;
  const blocked = await api.startAfterPendingRecovery(pending, {
    retry: async () => ({ ok: false, kind: 'network', status: 0 }),
    start: async () => { started = true; return { ok: true }; },
  });
  assert.equal(blocked.kind, 'pending');
  assert.equal(started, false);

  const recovered = await api.startAfterPendingRecovery(pending, {
    retry: async () => ({ ok: true, data: { progress: {} } }),
    start: async () => { started = true; return { ok: true, shift: 'new-shift' }; },
  });
  assert.equal(recovered.ok, true);
  assert.equal(started, true);
});

test('pending recovery never replaces another stored or malformed pending record', async () => {
  const { api } = await loadModules();
  const memory = { shiftId: 'shift-b', log: [[1, 0]], endT: 2 };
  assert.deepEqual(api.selectPendingForRecovery({ shiftId: 'shift-a', log: [], endT: 0 }, memory), {
    ok: false, kind: 'pending_conflict',
  });
  assert.deepEqual(api.selectPendingForRecovery({ broken: true }, memory), {
    ok: false, kind: 'invalid_pending',
  });
  assert.deepEqual(api.selectPendingForRecovery(null, memory), { ok: true, pending: memory });
});

test('startup preserves unreadable or malformed pending records for recovery review', () => {
  const start = screenSource.indexOf('const pendingRead = await loadValueStrict(ISBASI_PENDING_KEY, null);');
  const end = screenSource.indexOf("if (cancelled) return;", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const startupRecovery = screenSource.slice(start, end);
  assert.match(startupRecovery, /if \(!pendingRead\.ok\)/);
  assert.doesNotMatch(startupRecovery, /saveValue\(ISBASI_PENDING_KEY, null\)/);
});

test('İş Başı remains a stable imported route with explicit domain and shared-screen inputs', () => {
  assert.match(appSource, /import IsBasiScreen from '\.\/IsBasiScreen'/);
  assert.match(appSource, /case 'isbasi':[\s\S]*?<IsBasiScreen s=\{ctx\.s\} c=\{ctx\.c\} tx=\{ctx\.tx\} lang=\{ctx\.lang\} showToast=\{ctx\.showToast\} navigate=\{ctx\.navigate\} dataScopeGeneration=\{ctx\.dataScopeGeneration\} isCurrentDataScope=\{ctx\.isCurrentDataScope\} Screen=\{Screen\} ScreenHeader=\{ScreenHeader\} ibApi=\{ibApi\}/);
  assert.match(screenSource, /const IsBasiScreen = \(\{ s, c, tx, lang, showToast, navigate, dataScopeGeneration, isCurrentDataScope, Screen, ScreenHeader, ibApi, isKoprusuActive \}\) =>/);
  assert.doesNotMatch(screenSource, /useApp\(\)|from ['"]\.\/App/);
  assert.match(screenSource, /<IbCouponTicket[^>]+c=\{c\} tx=\{tx\} lang=\{lang\}/);
  assert.match(screenSource, /<IbXpBar[^>]+tx=\{tx\} lang=\{lang\}/);
});

test('duplicate cached reward coupons are not added twice during startup reconciliation', async () => {
  const { api } = await loadModules();
  const coupon = { id: 'coupon-1', code: 'ABCDE-FGHIJ' };
  assert.deepEqual(api.mergeCoupon([coupon], coupon), [coupon]);
  assert.deepEqual(api.mergeCoupon([], coupon), [coupon]);
  assert.deepEqual(api.mergeCoupon([coupon], { id: 'other-id', code: coupon.code }), [coupon]);
});

test('migration makes claims and completion receipts durable and leaves the functions service-role-only', () => {
  assert.match(migration, /ADD COLUMN completion_request jsonb/);
  assert.match(migration, /ADD COLUMN claimed_at timestamptz/);
  assert.match(migration, /ADD COLUMN completion_result jsonb/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /v_shift\.status = 'verified'[\s\S]*?completion_result/);
  assert.match(migration, /completion_request = NULL[\s\S]*?completion_result = v_completion/);
  assert.match(migration, /EXCEPTION WHEN unique_violation THEN[\s\S]*?'conflict', 'code'/);
  assert.match(migration, /SET search_path TO ''/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.isbasi_claim_shift\(uuid, uuid, jsonb\) TO service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.isbasi_commit\(uuid, uuid, integer, jsonb, integer, integer, integer, jsonb, jsonb\) TO service_role/);
  assert.doesNotMatch(migration, /TO (PUBLIC|anon|authenticated)[;,]/i);
  assert.match(edgeIndex, /p_submission: submission/);
  assert.match(edgeIndex, /p_completion: a\.completion/);
  assert.match(edgeIndex, /\.eq\("status", "claimed"\)/);
});
