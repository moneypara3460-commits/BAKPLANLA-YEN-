const test = require('node:test');
const assert = require('node:assert/strict');

const SUBJECT_A = '00000000-0000-4000-8000-000000000001';
const CASE_A = '00000000-0000-4000-8000-000000000011';
const OPERATOR = '00000000-0000-4000-8000-000000000099';
let handle;

let serializeBoundedExport;
test.before(async () => { ({ handlePrivacyOperator: handle, serializeBoundedExport } = await import('../supabase/functions/privacy-operator/privacyOperatorHandler.mjs')); });

function response(status, body) { return { status, body: typeof body === 'string' ? body : JSON.stringify(body) }; }

function makeAdmin(options = {}) {
  const calls = { rpc: [], queries: [], storage: [] };
  const admin = {
    calls,
    auth: {
      getUser: async (token) => token === 'valid-operator-token'
        ? { data: { user: { id: OPERATOR } }, error: null }
        : { data: { user: null }, error: new Error('auth') },
      admin: { getUserById: async (id) => ({ data: { user: { id, email: 'subject@example.invalid', created_at: '2026-11-01T00:00:00Z', email_confirmed_at: null } }, error: null }) },
    },
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (options.rpcError?.(name, args)) return { data: null, error: new Error('denied') };
      if (name === 'privacy_operator_case_subject') return { data: [{ subject_user_id: options.subject ?? SUBJECT_A, case_reference: 'KVKK-DEV-001', request_authority_reference: 'AUTH-REF-001' }], error: null };
      if (name === 'privacy_operator_private_inventory') return { data: options.privateInventory ?? [
        { category: 'backup_payloads', count: options.counts?.bakplanla_backups ?? 0 },
        { category: 'shopping_plans', count: options.counts?.bakplanla_shopping_plans ?? 0 },
        { category: 'disposal_log', count: 0 },
      ], error: null };
      if (name === 'privacy_operator_export_page') {
        const rows = options.exportRows?.[args.p_source] ?? (args.p_source === 'backups'
          ? [{ payload: { tasks: [], documents: [], fixture: 'Synthetic owner-only backup' }, checksum: 'a'.repeat(64), schema_version: 1 }]
          : []);
        return { data: { rows, nextOffset: args.p_offset + rows.length, hasMore: false, oversized: false }, error: null };
      }
      if (name === 'privacy_operator_private_records') return { data: { aiConsent: [], aiPurposeAuthorizations: [], deletionReceipts: [], deletionOperations: [] }, error: null };
      if (name === 'privacy_operator_retention_inventory') return { data: { subject_user_id: SUBJECT_A, policies: [{ source: 'receipts', retention: '72 hours' }] }, error: null };
      if (name === 'privacy_operator_verify_erasure') return { data: { state: 'verified', residual_sources: [] }, error: null };
      if (name === 'privacy_operator_case_open') return { data: CASE_A, error: null };
      if (name === 'privacy_operator_case_close') return { data: true, error: null };
      if (name === 'privacy_operator_case_event') return { data: null, error: null };
      return { data: { state: 'dry_run', current: { display_name: 'Synthetic', city: 'Ankara' } }, error: null };
    },
    from(table) {
      const query = { table, filters: [], selectFields: null, head: false, count: null, offset: 0, limit: null, inValues: null };
      const chain = {
        select(fields, opts = {}) { query.selectFields = fields; query.head = !!opts.head; query.count = opts.count; return chain; },
        eq(column, value) { query.filters.push([column, value]); return chain; },
        in(column, values) { query.inValues = [column, values]; return chain; },
        range(start, end) { query.offset = start; query.limit = end - start + 1; return chain; },
        then(resolve, reject) { return Promise.resolve().then(() => {
          calls.queries.push(query);
          if (options.queryError?.(query)) return { data: null, count: null, error: new Error('query') };
          if (query.head) return { data: null, count: options.counts?.[table] ?? 0, error: null };
          if (table === 'bk_applications') return { data: options.applicationRows ?? [], count: 0, error: null };
          return { data: options.rows?.[table] ?? [], count: 0, error: null };
        }).then(resolve, reject); },
      };
      return chain;
    },
    storage: { from(bucket) { return {
      list: async (folder, opts) => { calls.storage.push({ bucket, folder, opts }); return options.storageError ? { data: null, error: new Error('storage') } : { data: [], error: null }; },
      download: async () => ({ data: null, error: new Error('not expected') }),
    }; } },
  };
  return admin;
}

function req(body, { token = 'valid-operator-token', origin } = {}) {
  return new Request('https://dev.invalid/functions/v1/privacy-operator', {
    method: 'POST',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('missing or invalid operator identity cannot reach case/database operations', async () => {
  const admin = makeAdmin();
  const noToken = await handle(req({ action: 'inventory', caseId: CASE_A }, { token: null }), JSON.stringify({ action: 'inventory', caseId: CASE_A }), { admin });
  assert.equal(noToken.status, 401);
  assert.equal(admin.calls.rpc.length, 0);
  const invalidToken = await handle(req({ action: 'inventory', caseId: CASE_A }, { token: 'wrong' }), JSON.stringify({ action: 'inventory', caseId: CASE_A }), { admin });
  assert.equal(invalidToken.status, 401);
  assert.equal(admin.calls.rpc.length, 0);
});

test('case authorization failure is default-deny before any subject query', async () => {
  const admin = makeAdmin({ rpcError: (name) => name === 'privacy_operator_case_subject' });
  const raw = JSON.stringify({ action: 'inventory', caseId: CASE_A });
  const res = await handle(req(raw), raw, { admin });
  assert.equal(res.status, 403);
  assert.equal(admin.calls.queries.length, 0);
  assert.equal(admin.calls.storage.length, 0);
});

test('another active operator cannot query or export a case they did not open', async () => {
  const OTHER_OPERATOR = '00000000-0000-4000-8000-000000000088';
  const admin = makeAdmin({ rpcError: (name, args) => name === 'privacy_operator_case_subject' && args.p_operator === OTHER_OPERATOR });
  admin.auth.getUser = async (token) => token === 'other-operator-token'
    ? { data: { user: { id: OTHER_OPERATOR } }, error: null }
    : { data: { user: null }, error: new Error('auth') };
  const raw = JSON.stringify({ action: 'export', caseId: CASE_A });
  const res = await handle(req(raw, { token: 'other-operator-token' }), raw, { admin });
  assert.equal(res.status, 403);
  assert.equal(admin.calls.queries.length, 0);
  assert.equal(admin.calls.storage.length, 0);
  assert.ok(admin.calls.rpc.some(({ name, args }) => name === 'privacy_operator_case_subject' && args.p_operator === OTHER_OPERATOR));
});

test('case intake delegates subject existence lookup until after server-side operator membership check', async () => {
  const admin = makeAdmin({ rpcError: (name) => name === 'privacy_operator_case_open' });
  let authAdminLookups = 0;
  admin.auth.admin.getUserById = async () => { authAdminLookups += 1; return { data: { user: null }, error: null }; };
  const body = {
    action: 'open_case', caseReference: 'KVKK-DEV-002', subjectUserId: SUBJECT_A,
    requestKind: 'access', requestedActions: ['inventory'],
    identityCheckMethod: 'verified_contact', identityEvidenceReference: 'VERIFY-REF-002',
  };
  const raw = JSON.stringify(body);
  const res = await handle(req(raw), raw, { admin });
  assert.equal(res.status, 503);
  assert.equal(authAdminLookups, 0);
  assert.ok(admin.calls.rpc.some(({ name }) => name === 'privacy_operator_case_open'));
});

test('inventory scopes every query to the subject resolved from the authorized case', async () => {
  const admin = makeAdmin({ subject: SUBJECT_A, counts: { bakplanla_backups: 2, bk_candidates: 1 } });
  const raw = JSON.stringify({ action: 'inventory', caseId: CASE_A });
  const res = await handle(req(raw), raw, { admin });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.sources.some((source) => source.category === 'backup_payloads' && source.count === 2));
  assert.ok(admin.calls.queries.every((query) => query.filters.some(([, value]) => value === SUBJECT_A) || query.table === 'bk_attendance'));
  assert.ok(admin.calls.rpc.some(({ name, args }) => name === 'privacy_operator_case_subject' && args.p_operator === OPERATOR && args.p_case === CASE_A));
  assert.ok(admin.calls.rpc.some(({ name }) => name === 'privacy_operator_private_inventory'));
  assert.equal(admin.calls.queries.some((query) => ['bakplanla_backups','bakplanla_devices','bakplanla_entitlements','bakplanla_feature_trials','bakplanla_pairings','bakplanla_partner_cashiers','bakplanla_partner_codes','bakplanla_promo_attempts','bakplanla_push_tokens','bakplanla_shopping_plans'].includes(query.table)), false);
  assert.equal(JSON.stringify(body).includes('admin_note'), false);
});

test('partial source failures are explicit and fail closed for RPC-bounded restricted categories', async () => {
  const admin = makeAdmin({ rpcError: (name) => name === 'privacy_operator_private_inventory', storageError: true });
  const raw = JSON.stringify({ action: 'inventory', caseId: CASE_A });
  const res = await handle(req(raw), raw, { admin });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.partialSources.includes('app_private_case_bound_sources'));
  assert.ok(body.partialSources.includes('storage_list_failed'));
});

test('cross-origin browser request is denied before authentication/data access', async () => {
  const admin = makeAdmin();
  const raw = JSON.stringify({ action: 'inventory', caseId: CASE_A });
  const res = await handle(req(raw, { origin: 'https://evil.invalid' }), raw, { admin, allowedOrigins: ['https://trusted.invalid'] });
  assert.equal(res.status, 403);
  assert.equal(admin.calls.rpc.length, 0);
});

test('candidate corrections always dry-run immediately before confirmed apply', async () => {
  const admin = makeAdmin();
  const raw = JSON.stringify({ action: 'correct_candidate', caseId: CASE_A, expectedUpdatedAt: '2026-11-01T00:00:00Z', patch: { city: 'İzmir' }, dryRun: false, confirm: true });
  const res = await handle(req(raw), raw, { admin });
  assert.equal(res.status, 200);
  const calls = admin.calls.rpc.filter((call) => call.name === 'privacy_operator_correct_candidate');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.args.p_dry_run), [true, false]);
  assert.ok(calls.every((call) => call.args.p_operator === OPERATOR && call.args.p_case === CASE_A));
});

test('disposal dry-run verifies erasure but creates no disposal record', async () => {
  const admin = makeAdmin();
  const raw = JSON.stringify({ action: 'record_disposal', caseId: CASE_A, dryRun: true });
  const res = await handle(req(raw), raw, { admin });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.noDisposalRecordCreated, true);
  assert.ok(admin.calls.rpc.some(({ name }) => name === 'privacy_operator_verify_erasure'));
  assert.equal(admin.calls.rpc.some(({ name }) => name === 'privacy_operator_record_disposal'), false);
});

test('retention review exposes a fail-closed schedule scaffold without inventing eligible purge candidates', async () => {
  const admin = makeAdmin();
  const raw = JSON.stringify({ action: 'retention_review', caseId: CASE_A });
  const res = await handle(req(raw), raw, { admin });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.subject_user_id, undefined);
  assert.equal(body.retentionControl.scheduleState, 'owner_approval_required');
  assert.equal(body.retentionControl.candidatePurgeEnabled, false);
  assert.deepEqual(body.retentionControl.candidateDryRun, { state: 'blocked_no_approved_category_schedule', candidates: [] });
});

test('export response is no-store and never includes token columns in its selected data', async () => {
  const admin = makeAdmin({ exportRows: { backups: [{ payload: { tasks: [], documents: [], fixture: 'Synthetic own backup' } }] } });
  const raw = JSON.stringify({ action: 'export', caseId: CASE_A });
  const res = await handle(req(raw), raw, { admin });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(body.schema, 'bakplanla-rights-export-v1');
  assert.ok(admin.calls.queries.every((query) => !/token_hash|push_tokens.*token|code_hash/i.test(query.selectFields ?? '')));
  assert.ok(admin.calls.rpc.some(({ name, args }) => name === 'privacy_operator_export_page' && args.p_operator === OPERATOR && args.p_case === CASE_A && args.p_source === 'backups' && args.p_offset === 0 && args.p_limit === 1));
  assert.equal(body.records.backups.length, 1);
  assert.equal(body.records.backups[0].payload.fixture, 'Synthetic own backup');
});

test('restricted export RPC failure marks that source partial and does not fall back to broad table grants', async () => {
  const admin = makeAdmin({ rpcError: (name, args) => name === 'privacy_operator_export_page' && args.p_source === 'backups' });
  const raw = JSON.stringify({ action: 'export', caseId: CASE_A });
  const res = await handle(req(raw), raw, { admin });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.partialSources.includes('bakplanla_backups.unavailable'));
  assert.equal(admin.calls.queries.some((query) => query.table === 'bakplanla_backups'), false);
});

test('export serializer fails closed above the response size bound', () => {
  assert.equal(typeof serializeBoundedExport({ schema: 'bakplanla-rights-export-v1', data: 'small' }), 'string');
  assert.equal(serializeBoundedExport({ data: 'x'.repeat(33 * 1024 * 1024) }), null);
});
