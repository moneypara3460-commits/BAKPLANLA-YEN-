const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parse } = require('@babel/parser');
const { runDeletionSteps, reconcileDeletionReceipt } = require('../supabase/functions/delete-account/deletionWorkflow.mjs');
const { hashReceiptCredential, isValidReceiptCredential } = require('../supabase/functions/delete-account/receiptCredential.mjs');
const { readBoundedJsonBody } = require('../supabase/functions/delete-account/requestBody.mjs');
const edgeSource = fs.readFileSync(require.resolve('../supabase/functions/delete-account/index.ts'), 'utf8');

test('Edge Function TypeScript parses as an ES module', () => {
  assert.doesNotThrow(() => parse(edgeSource, { sourceType: 'module', plugins: ['typescript'] }));
});

test('request body parser cancels an oversized stream at the byte limit', async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(2048));
      if (pulls > 10) controller.close();
    },
    cancel() { cancelled = true; },
  });
  const result = await readBoundedJsonBody({ headers: new Headers(), body }, 4096);
  assert.equal(result, null);
  assert.equal(cancelled, true);
  assert.ok(pulls <= 3);
});

test('request body parser rejects excessive declared length before reading the stream', async () => {
  let reads = 0;
  const body = { getReader: () => ({ read: async () => { reads += 1; return { done: true }; } }) };
  const result = await readBoundedJsonBody({ headers: new Headers({ 'content-length': '4097' }), body }, 4096);
  assert.equal(result, null);
  assert.equal(reads, 0);
});

function memoryReceipt(owner = 'synthetic-a') {
  let row = null;
  const receipt = {
    begin: async (hash, requestedOwner) => {
      if (requestedOwner !== owner) return { state: 'unavailable' };
      if (!row) row = { owner_user_id: owner, state: 'pending', stage: null, storage_done: false, database_done: false, auth_done: false, expires_at: '2099-01-01T00:00:00Z' };
      if (row.state !== 'completed') { row.state = 'pending'; row.stage = null; }
      return { ...row };
    },
    mark: async (_hash, requestedOwner, step, result) => {
      if (!row || requestedOwner !== row.owner_user_id) return { state: 'unavailable' };
      if (row.state === 'completed') return { ...row };
      if (result === 'completed') {
        if (step === 'storage') row.storage_done = true;
        else if (step === 'database' && row.storage_done) row.database_done = true;
        else if (step === 'auth' && row.storage_done && row.database_done) row.auth_done = true;
        else throw new Error('step out of order');
        row.state = row.auth_done ? 'completed' : 'pending';
        row.stage = null;
      } else {
        row.state = result;
        row.stage = step;
      }
      return { ...row };
    },
    get: async () => row && { ...row },
    seed: (overrides) => { row = { owner_user_id: owner, state: 'pending', stage: null, storage_done: false, database_done: false, auth_done: false, expires_at: '2099-01-01T00:00:00Z', ...overrides }; },
  };
  return receipt;
}

const common = (overrides = {}) => ({
  uid: 'synthetic-a', credentialHash: 'a'.repeat(64), receipt: memoryReceipt(),
  removeStorage: async () => 0,
  deleteDatabase: async () => ({ deleted_rows: 0 }),
  deleteAuth: async () => {},
  authUserExists: async () => true,
  ...overrides,
});

test('storage failure reports UNKNOWN and prevents SQL and Auth deletion', async () => {
  const calls = [];
  const options = common({
    removeStorage: async () => { calls.push('storage'); throw new Error('provider detail'); },
    deleteDatabase: async () => calls.push('database'),
    deleteAuth: async () => calls.push('auth'),
  });
  const result = await runDeletionSteps(options);
  assert.equal(result.state, 'unknown');
  assert.equal(result.stage, 'storage');
  assert.deepEqual(calls, ['storage']);
  assert.equal((await options.receipt.get()).state, 'unknown');
});

test('SQL failure after Storage cleanup is UNKNOWN and retries only incomplete steps', async () => {
  const calls = [];
  const options = common({
    removeStorage: async () => { calls.push('storage'); return 2; },
    deleteDatabase: async () => { calls.push('database'); throw new Error('private SQL detail'); },
    deleteAuth: async () => calls.push('auth'),
  });
  const result = await runDeletionSteps(options);
  assert.equal(result.state, 'unknown');
  assert.equal((await options.receipt.get()).storage_done, true);
  options.deleteDatabase = async () => { calls.push('database-retry'); return { deleted_rows: 4 }; };
  options.deleteAuth = async () => { calls.push('auth-retry'); };
  const retried = await runDeletionSteps(options);
  assert.equal(retried.state, 'completed');
  assert.deepEqual(calls, ['storage', 'database', 'database-retry', 'auth-retry']);
});

test('Auth failure with an existing user reports PARTIAL and retry resumes at Auth', async () => {
  const calls = [];
  const options = common({
    removeStorage: async () => { calls.push('storage'); return 1; },
    deleteDatabase: async () => { calls.push('database'); return { deleted_rows: 3 }; },
    deleteAuth: async () => { calls.push('auth'); throw new Error('private auth detail'); },
    authUserExists: async () => true,
  });
  const partial = await runDeletionSteps(options);
  assert.equal(partial.state, 'partial');
  options.deleteAuth = async () => { calls.push('auth-retry'); };
  assert.equal((await runDeletionSteps(options)).state, 'completed');
  assert.deepEqual(calls, ['storage', 'database', 'auth', 'auth-retry']);
});

test('lost Auth delete response reconciles only after Storage and SQL were durably completed', async () => {
  const receipt = memoryReceipt();
  receipt.seed({ storage_done: true, database_done: true, state: 'unknown', stage: 'auth' });
  const completed = await reconcileDeletionReceipt({
    operation: await receipt.get(), credentialHash: 'a'.repeat(64), receipt,
    authUserExists: async (uid) => { assert.equal(uid, 'synthetic-a'); return false; },
  });
  assert.equal(completed.state, 'completed');
  assert.deepEqual({ storage: (await receipt.get()).storage_done, db: (await receipt.get()).database_done, auth: (await receipt.get()).auth_done }, { storage: true, db: true, auth: true });
});

test('missing Auth user alone never proves deletion completed', async () => {
  const receipt = memoryReceipt();
  receipt.seed({ state: 'pending' });
  const result = await reconcileDeletionReceipt({
    operation: await receipt.get(), credentialHash: 'a'.repeat(64), receipt,
    authUserExists: async () => false,
  });
  assert.equal(result.state, 'pending');
  assert.equal((await receipt.get()).auth_done, false);
});

test('ambiguous Auth lookup remains UNKNOWN', async () => {
  const receipt = memoryReceipt();
  receipt.seed({ storage_done: true, database_done: true, state: 'partial', stage: 'auth' });
  const result = await reconcileDeletionReceipt({
    operation: await receipt.get(), credentialHash: 'a'.repeat(64), receipt,
    authUserExists: async () => { throw new Error('provider failure'); },
  });
  assert.equal(result.state, 'unknown');
});

test('status resolves UNKNOWN to PARTIAL when it later confirms Auth still exists', async () => {
  const receipt = memoryReceipt();
  receipt.seed({ storage_done: true, database_done: true, state: 'unknown', stage: 'auth' });
  const result = await reconcileDeletionReceipt({
    operation: await receipt.get(), credentialHash: 'a'.repeat(64), receipt,
    authUserExists: async () => true,
  });
  assert.equal(result.state, 'partial');
  assert.equal(result.stage, 'auth');
});

test('a receipt for another owner cannot start deletion or run any side effect', async () => {
  const calls = [];
  const result = await runDeletionSteps(common({
    uid: 'synthetic-b', receipt: memoryReceipt('synthetic-a'),
    removeStorage: async () => calls.push('storage'),
    deleteDatabase: async () => calls.push('database'),
    deleteAuth: async () => calls.push('auth'),
  }));
  assert.equal(result.state, 'not_started');
  assert.deepEqual(calls, []);
});

test('completed receipt replay is read-only and does not repeat destructive effects', async () => {
  const receipt = memoryReceipt();
  receipt.seed({ state: 'completed', storage_done: true, database_done: true, auth_done: true });
  const calls = [];
  const result = await runDeletionSteps(common({
    receipt,
    removeStorage: async () => calls.push('storage'),
    deleteDatabase: async () => calls.push('database'),
    deleteAuth: async () => calls.push('auth'),
  }));
  assert.equal(result.state, 'completed');
  assert.deepEqual(calls, []);
});

test('receipt credential is high-entropy-format checked and stored only as a one-way hash', async () => {
  const credential = 'ab'.repeat(32);
  const hash = await hashReceiptCredential(credential);
  assert.equal(isValidReceiptCredential(credential), true);
  assert.equal(isValidReceiptCredential('not-a-receipt'), false);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, credential);
  await assert.rejects(() => hashReceiptCredential('short'), /invalid_receipt_credential/);
});

test('expired receipt is not available for destructive replay', async () => {
  const receipt = memoryReceipt();
  receipt.seed({ state: 'expired', expires_at: '2000-01-01T00:00:00Z' });
  receipt.begin = async () => ({ state: 'expired' });
  const calls = [];
  const result = await runDeletionSteps(common({
    receipt,
    removeStorage: async () => calls.push('storage'),
    deleteDatabase: async () => calls.push('database'),
  }));
  assert.equal(result.state, 'not_started');
  assert.deepEqual(calls, []);
});

test('deletion does not begin when the receipt lacks the minimum reconciliation window', async () => {
  const receipt = memoryReceipt();
  receipt.seed({ expires_at: new Date(Date.now() + 60_000).toISOString() });
  const calls = [];
  const result = await runDeletionSteps(common({
    receipt,
    removeStorage: async () => calls.push('storage'),
    deleteDatabase: async () => calls.push('database'),
    deleteAuth: async () => calls.push('auth'),
  }));
  assert.equal(result.state, 'not_started');
  assert.deepEqual(calls, []);
});

test('concurrent duplicate requests remain scoped to the verified owner', async () => {
  const receipt = memoryReceipt();
  let authExists = true;
  let storageCalls = 0;
  const options = common({
    receipt,
    removeStorage: async (uid) => { assert.equal(uid, 'synthetic-a'); storageCalls += 1; return 0; },
    deleteAuth: async (uid) => { assert.equal(uid, 'synthetic-a'); if (!authExists) throw new Error('already deleted'); authExists = false; },
    authUserExists: async () => authExists,
  });
  const results = await Promise.all([runDeletionSteps(options), runDeletionSteps(options)]);
  assert.ok(results.every((result) => result.state === 'completed' || result.state === 'unknown'));
  const final = await receipt.get();
  assert.equal(final.storage_done, true);
  assert.equal(final.database_done, true);
  if (!authExists) assert.equal(final.auth_done, true);
  assert.ok(storageCalls >= 1);
});

test('Edge Function validates authenticated identity before receipt creation and effects', () => {
  const authLookup = edgeSource.indexOf('admin.auth.getUser(m[1])');
  const identityAssignment = edgeSource.indexOf('const uid = user.id;', authLookup);
  const workflowCall = edgeSource.indexOf('runDeletionSteps({', identityAssignment);
  assert.ok(authLookup >= 0 && identityAssignment > authLookup && workflowCall > identityAssignment);
  assert.match(edgeSource, /const m = \(req\.headers\.get\("authorization"\) \?\? ""\)\.match/);
  assert.doesNotMatch(edgeSource, /body\.uid|p_user:\s*body/);
});

test('receipt status uses POST body, does not require the deleted user JWT, and returns no account fields', () => {
  const statusBranch = edgeSource.slice(edgeSource.indexOf('if (body.action === "status")'), edgeSource.indexOf('const m = (req.headers.get("authorization")'));
  assert.match(statusBranch, /receipt\.get\(credentialHash\)/);
  assert.match(statusBranch, /reconcileDeletionReceipt/);
  assert.doesNotMatch(statusBranch, /req\.headers\.get\("authorization"\)/);
  assert.doesNotMatch(statusBranch, /email|phone|documents|owner_user_id/);
  assert.match(edgeSource, /MAX_BODY_BYTES = 4096/);
});
