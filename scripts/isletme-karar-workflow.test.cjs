const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.join(__dirname, '../supabase/functions/isletme-karar/index.ts');
const workflowPath = new URL('../supabase/functions/isletme-karar/decisionMailWorkflow.mjs', `file://${__dirname.replace(/\\/g, '/')}/`);
const decisionAt = '2026-11-01T12:00:00.000Z';

function repositoryFor(initial) {
  const state = structuredClone(initial);
  let claimCalls = 0;
  let releaseCalls = 0;
  return {
    state,
    get claimCalls() { return claimCalls; },
    get releaseCalls() { return releaseCalls; },
    async readDecision() { return { row: structuredClone(state), error: null }; },
    async claimDecision(id, status, reviewedAt) {
      claimCalls += 1;
      if (state.id !== id || state.status !== status || state.reviewed_at !== reviewedAt) return [];
      if (state.decision_mailed_status === status) return [];
      state.decision_mailed_status = status;
      return [{ id }];
    },
    async releaseClaim(id, status, reviewedAt) {
      releaseCalls += 1;
      if (state.id === id && state.status === status && state.reviewed_at === reviewedAt && state.decision_mailed_status === status) {
        state.decision_mailed_status = null;
        return true;
      }
      return false;
    },
    async recordSent(id, status, reviewedAt, mailedAt) {
      if (state.id === id && state.status === status && state.reviewed_at === reviewedAt && state.decision_mailed_status === status) {
        state.decision_mailed_at = mailedAt;
        return true;
      }
      return false;
    },
  };
}

const row = (overrides = {}) => ({
  id: 'synthetic-request',
  status: 'approved',
  reviewed_at: decisionAt,
  decision_mailed_status: null,
  decision_mailed_at: null,
  business_name: 'Synthetic Shop',
  contact_name: 'Synthetic Owner',
  email: 'synthetic@example.invalid',
  ...overrides,
});

async function workflow() { return import(workflowPath.href); }

test('fake-mail boundary delivers the database decision once and duplicate callbacks do not send twice', async () => {
  const { deliverCurrentDecision } = await workflow();
  const repository = repositoryFor(row());
  let releaseSend;
  const sendGate = new Promise((resolve) => { releaseSend = resolve; });
  let sendCount = 0;
  const first = deliverCurrentDecision({
    id: repository.state.id, repository, mailConfigured: true,
    async sendMail(snapshot) {
      sendCount += 1;
      assert.equal(snapshot.status, 'approved');
      await sendGate;
    },
    now: () => Date.parse(decisionAt) + 1000,
  });
  await new Promise((resolve) => setImmediate(resolve));
  const duplicate = await deliverCurrentDecision({
    id: repository.state.id, repository, mailConfigured: true,
    async sendMail() { sendCount += 1; }, now: () => Date.parse(decisionAt) + 1000,
  });
  assert.deepEqual(duplicate, { type: 'skipped', reason: 'already_mailed' });
  releaseSend();
  assert.deepEqual(await first, { type: 'success', status: 'approved' });
  assert.equal(sendCount, 1);
  assert.equal(repository.state.decision_mailed_status, 'approved');
  assert.equal(repository.state.decision_mailed_at, new Date(Date.parse(decisionAt) + 1000).toISOString());
});

test('mail failure releases only its own unchanged decision claim and permits retry', async () => {
  const { deliverCurrentDecision } = await workflow();
  const repository = repositoryFor(row({ status: 'rejected' }));
  let sends = 0;
  const first = await deliverCurrentDecision({
    id: repository.state.id, repository, mailConfigured: true,
    async sendMail() { sends += 1; throw new Error('fake SMTP failure before delivery'); },
    now: () => Date.parse(decisionAt) + 1000,
  });
  assert.equal(first.type, 'error');
  assert.equal(first.code, 'mail_failed');
  assert.equal(repository.state.decision_mailed_status, null);
  const retry = await deliverCurrentDecision({
    id: repository.state.id, repository, mailConfigured: true,
    async sendMail(snapshot) { sends += 1; assert.equal(snapshot.status, 'rejected'); },
    now: () => Date.parse(decisionAt) + 2000,
  });
  assert.deepEqual(retry, { type: 'success', status: 'rejected' });
  assert.equal(sends, 2);
});

test('delayed failure cannot clear a newer decision claim', async () => {
  const { deliverCurrentDecision } = await workflow();
  const repository = repositoryFor(row());
  const result = await deliverCurrentDecision({
    id: repository.state.id, repository, mailConfigured: true,
    async sendMail() {
      Object.assign(repository.state, {
        status: 'rejected', reviewed_at: '2026-11-01T12:01:00.000Z', decision_mailed_status: 'rejected',
      });
      throw new Error('fake SMTP failure after a newer decision was claimed');
    },
    now: () => Date.parse(decisionAt) + 1000,
  });
  assert.equal(result.code, 'mail_failed');
  assert.equal(repository.state.status, 'rejected');
  assert.equal(repository.state.decision_mailed_status, 'rejected');
});

test('successful stale delivery cannot write its timestamp onto a newer decision', async () => {
  const { deliverCurrentDecision } = await workflow();
  const repository = repositoryFor(row());
  const result = await deliverCurrentDecision({
    id: repository.state.id, repository, mailConfigured: true,
    async sendMail() {
      Object.assign(repository.state, {
        status: 'rejected', reviewed_at: '2026-11-01T12:01:00.000Z', decision_mailed_status: 'rejected',
        decision_mailed_at: null,
      });
    },
    now: () => Date.parse(decisionAt) + 1000,
  });
  assert.deepEqual(result, { type: 'success', status: 'approved' });
  assert.equal(repository.state.status, 'rejected');
  assert.equal(repository.state.decision_mailed_status, 'rejected');
  assert.equal(repository.state.decision_mailed_at, null);
});

test('no-mail configuration never claims a decision and stale decisions do not send', async () => {
  const { deliverCurrentDecision } = await workflow();
  const repository = repositoryFor(row());
  let sends = 0;
  assert.deepEqual(await deliverCurrentDecision({
    id: repository.state.id, repository, mailConfigured: false,
    async sendMail() { sends += 1; }, now: () => Date.parse(decisionAt) + 1000,
  }), { type: 'error', code: 'no_mail_config' });
  assert.equal(repository.claimCalls, 0);
  assert.equal(repository.releaseCalls, 0);
  assert.equal(repository.state.decision_mailed_status, null, 'disabled email must leave the decision immediately retryable');
  assert.equal(sends, 0);

  const staleRepository = repositoryFor(row({ reviewed_at: '2026-11-01T08:00:00.000Z' }));
  assert.deepEqual(await deliverCurrentDecision({
    id: staleRepository.state.id, repository: staleRepository, mailConfigured: true,
    async sendMail() { sends += 1; }, now: () => Date.parse(decisionAt),
  }), { type: 'skipped', reason: 'old' });
  assert.equal(sends, 0);
});

test('production repository predicates fence claim, failure cleanup and sent timestamp by decision revision', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  assert.match(source, /\.update\(\{ decision_mailed_status: null \}\)[\s\S]*?\.eq\("status", status\)[\s\S]*?\.eq\("reviewed_at", reviewedAt\)[\s\S]*?\.eq\("decision_mailed_status", status\)/);
  assert.match(source, /\.update\(\{ decision_mailed_at: mailedAt \}\)[\s\S]*?\.eq\("status", status\)[\s\S]*?\.eq\("reviewed_at", reviewedAt\)[\s\S]*?\.eq\("decision_mailed_status", status\)/);
  assert.match(source, /\.update\(\{ decision_mailed_status: status \}\)[\s\S]*?\.eq\("reviewed_at", reviewedAt\)/);
});
