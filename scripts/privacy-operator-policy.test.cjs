const test = require('node:test');
const assert = require('node:assert/strict');

let policy;
test.before(async () => { policy = await import('../supabase/functions/privacy-operator/privacyOperatorPolicy.mjs'); });

const validOpen = () => ({
  action: 'open_case', caseReference: 'KVKK-DEV-001', subjectUserId: '00000000-0000-4000-8000-000000000001',
  requestKind: 'access', requestedActions: ['inventory', 'export', 'retention_review'],
  identityCheckMethod: 'manual_document_check', identityEvidenceReference: 'VERIFY-REF-001',
});

test('case intake accepts opaque verification references but rejects raw contact/identity fields', () => {
  assert.equal(policy.parseOperatorRequest(validOpen()).ok, true);
  assert.equal(policy.parseOperatorRequest({ ...validOpen(), identityEvidenceReference: '12345678901' }).ok, false);
  assert.equal(policy.parseOperatorRequest({ ...validOpen(), email: 'subject@example.invalid' }).ok, false);
});

test('case actions are bounded, unique and authority-gated for destructive corrections/disposal', () => {
  assert.equal(policy.parseOperatorRequest({ ...validOpen(), requestedActions: ['export', 'export'] }).ok, false);
  assert.equal(policy.parseOperatorRequest({ ...validOpen(), requestedActions: ['admin'] }).ok, false);
  assert.equal(policy.parseOperatorRequest({ ...validOpen(), requestedActions: ['correct_candidate'] }).code, 'authorization_reference_required');
  assert.equal(policy.parseOperatorRequest({ ...validOpen(), requestedActions: ['correct_candidate'], requestAuthorityReference: 'AUTH-REF-001' }).ok, true);
});

test('correct_candidate only allows narrow versioned fields and requires dry-run before confirmation', () => {
  const base = { action: 'correct_candidate', caseId: '00000000-0000-4000-8000-000000000001', expectedUpdatedAt: '2026-11-04T12:00:00Z', patch: { city: 'Ankara' } };
  assert.equal(policy.parseOperatorRequest({ ...base, dryRun: true }).ok, true);
  assert.equal(policy.parseOperatorRequest({ ...base, dryRun: false }).code, 'confirmation_required');
  assert.equal(policy.parseOperatorRequest({ ...base, dryRun: false, confirm: true, patch: { adult_confirmed: true } }).ok, false);
  assert.equal(policy.parseOperatorRequest({ ...base, dryRun: false, confirm: true }).ok, true);
  assert.equal(policy.parseOperatorRequest({ ...base, dryRun: true, service_role_key: 'never' }).ok, false);
});

test('disposal requires a prior read-only preview and explicit confirmation', () => {
  const base = { action: 'record_disposal', caseId: '00000000-0000-4000-8000-000000000001' };
  assert.equal(policy.parseOperatorRequest(base).code, 'confirmation_required');
  assert.equal(policy.parseOperatorRequest({ ...base, dryRun: true }).ok, true);
  assert.equal(policy.parseOperatorRequest({ ...base, dryRun: false, confirm: true }).ok, true);
});

test('export contract is visibly partial where uncertain sources and provider copies exist', () => {
  const envelope = policy.exportDisclosureEnvelope({
    generatedAt: '2026-11-04T12:00:00Z', subject: { id: 'synthetic' }, records: { tasks: [] }, media: [], partialSources: ['bk_audit.detail'],
  });
  assert.equal(envelope.schema, 'bakplanla-rights-export-v1');
  assert.equal(envelope.completeness, 'partial');
  assert.ok(envelope.manualReviewRequired.some((item) => item.source === 'bk_audit.detail'));
  assert.ok(envelope.limitations.some((item) => item.toLowerCase().includes('provider-held')));
  const unresolved = policy.exportDisclosureEnvelope({
    generatedAt: '2026-11-04T12:00:00Z', subject: { id: 'synthetic' }, records: {}, media: [], partialSources: [],
  });
  assert.equal(unresolved.completeness, 'partial');
  assert.ok(unresolved.manualReviewRequired.length > 0);
});

test('export field allowlists never select pairing, push, promo, cashier or trial secret material', () => {
  const sources = new Map(policy.EXPORT_SOURCES.map((source) => [source.table, source.fields]));
  assert.doesNotMatch(sources.get('bakplanla_pairings'), /code_hash/);
  assert.doesNotMatch(sources.get('bakplanla_push_tokens'), /token/);
  assert.doesNotMatch(sources.get('bakplanla_partner_codes') ?? '', /code,/);
  assert.doesNotMatch(sources.get('bk_attendance') ?? '', /token_hash/);
  assert.doesNotMatch([...sources.values()].join(','), /service_role|password|refresh_token/i);
});
