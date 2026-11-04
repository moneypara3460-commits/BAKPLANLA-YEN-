const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createReminderTask, deleteTaskRecord, persistTaskDraft, toggleTaskRecord } = require('../taskWorkflow');

const normalizeDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
const normalizeTitle = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');
const makeContext = (overrides = {}) => {
  const saved = [];
  const lock = { current: false };
  const context = {
    taskModal: { taskId: null, title: ' Draft task ', date: '2026-11-02' },
    tasks: [],
    isLoading: false,
    saveLock: lock,
    getScopeGeneration: () => 3,
    isPersistenceBlocked: () => false,
    saveTasks: async (tasks) => { saved.push(tasks); return true; },
    normalizeDate,
    normalizeTitle,
    createId: (kind) => `${kind}-synthetic`,
    now: () => '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
  return { context, lock, saved };
};

test('creating a task preserves the storage-first contract and exact task shape', async () => {
  const existing = [{ id: 'existing', title: 'Read', dueDate: '2026-11-01', completed: false }];
  const { context, saved, lock } = makeContext({ tasks: existing });
  const result = await persistTaskDraft(context);

  assert.equal(result.status, 'saved');
  assert.equal(result.editingId, null);
  assert.deepEqual(result.newTask, {
    id: 'task-synthetic', title: 'Draft task', dueDate: '2026-11-02', completed: false, createdAt: '2026-11-01T00:00:00.000Z',
  });
  assert.deepEqual(saved, [[result.newTask, ...existing]]);
  assert.deepEqual(existing, [{ id: 'existing', title: 'Read', dueDate: '2026-11-01', completed: false }]);
  assert.equal(lock.current, false);
});

test('editing updates only title and due date and retains task identity and metadata', async () => {
  const original = { id: 'task-1', title: 'Old', dueDate: '2026-11-01', completed: true, remindAt: 'future', custom: 'kept' };
  const { context, saved } = makeContext({ taskModal: { taskId: 'task-1', title: ' New ', date: '2026-11-03' }, tasks: [original] });
  const result = await persistTaskDraft(context);

  assert.equal(result.status, 'saved');
  assert.equal(result.editingId, 'task-1');
  assert.equal(result.newTask, null);
  assert.deepEqual(saved[0], [{ ...original, title: 'New', dueDate: '2026-11-03' }]);
  assert.equal(original.title, 'Old');
});

test('invalid title/date inputs, duplicate active tasks, and a missing edited task never persist', async (t) => {
  const cases = [
    ['empty title', { taskModal: { taskId: null, title: '  ', date: '2026-11-02' } }, { status: 'invalid', field: 'title' }],
    ['empty date', { taskModal: { taskId: null, title: 'Draft', date: '  ' } }, { status: 'invalid', field: 'date' }],
    ['invalid date', { taskModal: { taskId: null, title: 'Draft', date: 'not-a-date' } }, { status: 'invalid-date' }],
    ['active duplicate', { tasks: [{ id: 'other', title: 'draft   task', dueDate: '2026-11-02', completed: false }] }, { status: 'duplicate' }],
    ['missing edit target', { taskModal: { taskId: 'missing', title: 'Draft', date: '2026-11-02' } }, { status: 'missing' }],
  ];
  for (const [name, overrides, expected] of cases) await t.test(name, async () => {
    const { context, saved, lock } = makeContext(overrides);
    assert.deepEqual(await persistTaskDraft(context), expected);
    assert.equal(saved.length, 0);
    assert.equal(lock.current, false);
  });

  const completedDuplicate = makeContext({ tasks: [{ id: 'done', title: 'Draft task', dueDate: '2026-11-02', completed: true }] });
  assert.equal((await persistTaskDraft(completedDuplicate.context)).status, 'saved');
});

test('a task save remains blocked after read protection or storage failure', async (t) => {
  const blocked = makeContext({ isPersistenceBlocked: () => true });
  assert.deepEqual(await persistTaskDraft(blocked.context), { status: 'storage' });
  assert.equal(blocked.saved.length, 0);
  assert.equal(blocked.lock.current, false);

  const failed = makeContext({ saveTasks: async (tasks) => { failed.saved.push(tasks); return false; } });
  assert.deepEqual(await persistTaskDraft(failed.context), { status: 'storage' });
  assert.equal(failed.saved.length, 1);
  assert.equal(failed.lock.current, false);
});

test('account-generation changes fence stale UI application and pre-write stale requests', async () => {
  let generation = 3;
  let release;
  const stale = makeContext({
    getScopeGeneration: () => generation,
    saveTasks: async () => new Promise((resolve) => { release = () => { generation += 1; resolve(true); }; }),
  });
  const pending = persistTaskDraft(stale.context);
  await Promise.resolve();
  release();
  assert.deepEqual(await pending, { status: 'stale' });
  assert.equal(stale.lock.current, false);

  generation += 1;
  const beforeWrite = makeContext({ getScopeGeneration: () => generation, saveTasks: async () => { throw new Error('must not write'); } });
  beforeWrite.context.getScopeGeneration = (() => { let reads = 0; return () => (reads++ === 0 ? generation : generation + 1); })();
  assert.deepEqual(await persistTaskDraft(beforeWrite.context), { status: 'stale' });
  assert.equal(beforeWrite.lock.current, false);
});

test('concurrent submissions are ignored while a save is in flight and failures release the lock', async () => {
  let release;
  const concurrent = makeContext({ saveTasks: async () => new Promise((resolve) => { release = () => resolve(true); }) });
  const first = persistTaskDraft(concurrent.context);
  await Promise.resolve();
  assert.deepEqual(await persistTaskDraft(concurrent.context), { status: 'ignored' });
  release();
  assert.equal((await first).status, 'saved');
  assert.equal(concurrent.lock.current, false);

  const thrown = makeContext({ saveTasks: async () => { throw new Error('storage rejected'); } });
  await assert.rejects(persistTaskDraft(thrown.context), /storage rejected/);
  assert.equal(thrown.lock.current, false);
});

test('completion toggles preserve reminder cancellation, scheduling threshold, and owner task mapping', () => {
  const calls = { cancel: [], schedule: [], updates: [] };
  const task = { id: 'reminder', title: 'Study', completed: false, remindAt: '2026-11-01T00:00:10.000Z', reminderTitle: 'Review', reminderBody: 'Chapter 2' };
  let current = [task];
  const update = (fn) => { current = fn(current); calls.updates.push(current); };
  toggleTaskRecord({ id: task.id, tasks: [task], setTasks: update, cancelReminder: (id) => calls.cancel.push(id), scheduleReminder: (value) => calls.schedule.push(value), now: () => Date.parse('2026-11-01T00:00:00.000Z') });
  assert.deepEqual(calls.cancel, ['reminder']);
  assert.equal(calls.updates[0][0].completed, true);

  calls.updates.length = 0;
  toggleTaskRecord({ id: task.id, tasks: current, setTasks: update, cancelReminder: (id) => calls.cancel.push(id), scheduleReminder: (value) => calls.schedule.push(value), now: () => Date.parse('2026-11-01T00:00:00.000Z') });
  assert.deepEqual(calls.schedule, [{ taskId: 'reminder', title: '⏰ Review', body: 'Chapter 2', at: task.remindAt }]);
  assert.equal(calls.updates[0][0].completed, false);

  calls.schedule.length = 0;
  toggleTaskRecord({ id: task.id, tasks: [{ ...task, completed: true, remindAt: '2026-11-01T00:00:04.000Z' }], setTasks: () => {}, cancelReminder: () => {}, scheduleReminder: (value) => calls.schedule.push(value), now: () => Date.parse('2026-11-01T00:00:00.000Z') });
  assert.equal(calls.schedule.length, 0);
});

test('deleting a task cancels its reminder and filters only the requested id', () => {
  const tasks = [{ id: 'keep' }, { id: 'remove' }];
  const calls = { cancel: [], updates: [] };
  deleteTaskRecord({ id: 'remove', cancelReminder: (id) => calls.cancel.push(id), setTasks: (fn) => calls.updates.push(fn(tasks)) });
  assert.deepEqual(calls.cancel, ['remove']);
  assert.deepEqual(calls.updates, [[{ id: 'keep' }]]);
});

test('AI reminder creation preserves validation, task shape, persist-before-state and notification contract', async () => {
  const at = new Date('2026-11-02T12:34:56.000Z');
  const calls = { writes: [], updates: [], scheduled: [], permission: [] };
  const existing = [{ id: 'existing' }];
  let current = existing;
  const result = await createReminderTask({
    reminder: { at: at.toISOString(), title: '  Review   papers  ', body: ' Check   the receipt ' },
    tasks: existing,
    isPersistenceBlocked: () => false,
    saveTasks: async (tasks) => { calls.writes.push(tasks); return true; },
    setTasks: (update) => { current = update(current); calls.updates.push(current); },
    createId: (kind) => `${kind}-reminder`,
    toISO: (date) => date.toISOString().slice(0, 10),
    scheduleReminder: async (input) => { calls.scheduled.push(input); return { id: 'notification-1' }; },
    onPermission: (permission) => calls.permission.push(permission),
    fallbackTitle: 'Reminder',
    now: () => Date.parse('2026-11-02T12:00:00.000Z'),
    nowISO: () => '2026-11-01T00:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.task, {
    id: 'task-reminder', title: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')} · Review papers`,
    dueDate: '2026-11-02', completed: false, createdAt: '2026-11-01T00:00:00.000Z', remindAt: at.toISOString(),
    reminderTitle: 'Review papers', reminderBody: 'Check the receipt', source: 'ai',
  });
  assert.deepEqual(calls.writes, [[result.task, ...existing]]);
  assert.deepEqual(calls.updates, [[result.task, ...existing]]);
  assert.deepEqual(calls.scheduled, [{ taskId: result.task.id, title: '⏰ Review papers', body: 'Check the receipt', at: at.toISOString() }]);
  assert.deepEqual(calls.permission, []);
});

test('AI reminder rejection and persistence failure do not mutate tasks or schedule notifications', async (t) => {
  const base = {
    tasks: [], isPersistenceBlocked: () => false, saveTasks: async () => true, setTasks: () => assert.fail('task state changed'),
    createId: () => 'task', toISO: () => '2026-11-02', scheduleReminder: async () => assert.fail('notification scheduled'),
    onPermission: () => {}, fallbackTitle: 'Reminder', now: () => Date.parse('2026-11-02T12:00:00Z'), nowISO: () => '2026-11-01T00:00:00Z',
  };
  await t.test('invalid time', async () => assert.deepEqual(await createReminderTask({ ...base, reminder: { at: 'bad' } }), { ok: false, reason: 'time' }));
  await t.test('too near', async () => assert.deepEqual(await createReminderTask({ ...base, reminder: { at: '2026-11-02T12:00:04Z' } }), { ok: false, reason: 'past' }));
  await t.test('blocked storage', async () => assert.deepEqual(await createReminderTask({ ...base, reminder: { at: '2026-11-02T13:00:00Z' }, isPersistenceBlocked: () => true }), { ok: false, reason: 'save' }));
  await t.test('storage failure', async () => assert.deepEqual(await createReminderTask({ ...base, reminder: { at: '2026-11-02T13:00:00Z' }, saveTasks: async () => false }), { ok: false, reason: 'save' }));
});

test('AI reminder reports notification permission failure without undoing the saved task', async () => {
  const permissions = [];
  let persisted = false;
  const result = await createReminderTask({
    reminder: { at: '2026-11-02T13:00:00Z' }, tasks: [], isPersistenceBlocked: () => false,
    saveTasks: async () => { persisted = true; return true; }, setTasks: () => {}, createId: () => 'task-reminder',
    toISO: () => '2026-11-02', scheduleReminder: async () => ({ reason: 'permission', permission: null }),
    onPermission: (value) => permissions.push(value), fallbackTitle: 'Reminder', now: () => Date.parse('2026-11-02T12:00:00Z'),
    nowISO: () => '2026-11-01T00:00:00.000Z',
  });
  assert.equal(result.ok, true);
  assert.equal(persisted, true);
  assert.deepEqual(permissions, ['denied']);
});

test('AI reminder stops after an owner switch while task persistence is pending', async () => {
  let current = true;
  let resolveSave;
  const saved = new Promise((resolve) => { resolveSave = resolve; });
  const calls = { state: 0, notifications: 0, permissions: 0 };
  const pending = createReminderTask({
    reminder: { at: '2026-11-02T13:00:00Z' }, tasks: [], isPersistenceBlocked: () => false,
    saveTasks: async () => saved, setTasks: () => { calls.state += 1; }, createId: () => 'task-reminder',
    toISO: () => '2026-11-02', scheduleReminder: async () => { calls.notifications += 1; return { reason: 'permission' }; },
    onPermission: () => { calls.permissions += 1; }, fallbackTitle: 'Reminder', isCurrent: () => current,
    now: () => Date.parse('2026-11-02T12:00:00Z'), nowISO: () => '2026-11-01T00:00:00.000Z',
  });
  current = false;
  resolveSave(true);

  assert.deepEqual(await pending, { ok: false, reason: 'stale' });
  assert.deepEqual(calls, { state: 0, notifications: 0, permissions: 0 });
});

test('AI reminder does not update the new account after notification scheduling resolves stale', async () => {
  let current = true;
  let resolveNotification;
  const scheduled = new Promise((resolve) => { resolveNotification = resolve; });
  const calls = { state: 0, permissions: 0 };
  const pending = createReminderTask({
    reminder: { at: '2026-11-02T13:00:00Z' }, tasks: [], isPersistenceBlocked: () => false,
    saveTasks: async () => true, setTasks: () => { calls.state += 1; }, createId: () => 'task-reminder',
    toISO: () => '2026-11-02', scheduleReminder: () => scheduled,
    onPermission: () => { calls.permissions += 1; }, fallbackTitle: 'Reminder', isCurrent: () => current,
    now: () => Date.parse('2026-11-02T12:00:00Z'), nowISO: () => '2026-11-01T00:00:00.000Z',
  });
  await Promise.resolve();
  current = false;
  resolveNotification({ reason: 'permission' });

  assert.deepEqual(await pending, { ok: false, reason: 'stale' });
  assert.deepEqual(calls, { state: 1, permissions: 0 });
});

test('App keeps state/UI ownership and delegates task persistence and mutations to the stable workflow module', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(app, /import \{ createReminderTask, deleteTaskRecord, persistTaskDraft, toggleTaskRecord \} from '\.\/taskWorkflow'/);
  assert.match(app, /persistTaskDraft\(\{[\s\S]*?getScopeGeneration: \(\) => dataScopeGenerationRef\.current[\s\S]*?saveTasks: \(nextTasks\) => saveInRenderedScope\(STORAGE_KEYS\.tasks, nextTasks\)/);
  assert.match(app, /setTasks\(\(cur\) => \(cur\.some\(\(task\) => task\.id === result\.newTask\.id\)[\s\S]*?setTaskModal\(null\)/);
  assert.match(app, /toggleTaskRecord\(\{ id, tasks, setTasks, cancelReminder: cancelAiReminder, scheduleReminder: scheduleAiReminder \}\)/);
  assert.match(app, /deleteTaskRecord\(\{ id, setTasks, cancelReminder: cancelAiReminder \}\)/);
  assert.match(app, /return createReminderTask\(\{[\s\S]*?scheduleReminder: scheduleAiReminder[\s\S]*?fallbackTitle: tx\('Hatırlatma', 'Reminder', 'Erinnerung'\)/);
  assert.match(app, /createAiReminder = async \(reminder, expectedGeneration = dataScopeGenerationRef\.current\)/);
  assert.match(app, /saveTasks: createScopeBoundSave\(expectedGeneration, isCurrent/);
  assert.match(app, /isCurrent: \(\) => isCurrent\(expectedGeneration\)/);
});
