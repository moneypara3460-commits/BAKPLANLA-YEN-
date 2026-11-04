const persistTaskDraft = async ({
  taskModal,
  tasks,
  isLoading,
  saveLock,
  getScopeGeneration,
  isPersistenceBlocked,
  saveTasks,
  normalizeDate,
  normalizeTitle,
  createId,
  now = () => new Date().toISOString(),
}) => {
  if (!taskModal || saveLock.current || isLoading) return { status: 'ignored' };

  const writeScopeGeneration = getScopeGeneration();
  const title = String(taskModal.title || '').trim();
  const rawDate = String(taskModal.date || '').trim();

  if (!title) return { status: 'invalid', field: 'title' };
  if (!rawDate) return { status: 'invalid', field: 'date' };

  const date = normalizeDate(rawDate);
  if (!date) return { status: 'invalid-date' };

  const editingId = taskModal.taskId;
  const titleKey = normalizeTitle(title);
  const duplicate = tasks.some(
    (task) => task.id !== editingId && !task.completed && task.dueDate === date && normalizeTitle(task.title) === titleKey,
  );
  if (duplicate) return { status: 'duplicate' };

  if (editingId && !tasks.some((task) => task.id === editingId)) return { status: 'missing' };

  const newTask = editingId
    ? null
    : { id: createId('task'), title, dueDate: date, completed: false, createdAt: now() };
  const nextTasks = editingId
    ? tasks.map((task) => (task.id === editingId ? { ...task, title, dueDate: date } : task))
    : [newTask, ...tasks];

  saveLock.current = true;
  try {
    if (writeScopeGeneration !== getScopeGeneration() || isLoading) return { status: 'stale' };
    const saved = isPersistenceBlocked() ? false : await saveTasks(nextTasks);
    if (writeScopeGeneration !== getScopeGeneration()) return { status: 'stale' };
    if (!saved) return { status: 'storage' };
    return { status: 'saved', editingId, newTask, title, date };
  } finally {
    saveLock.current = false;
  }
};

const toggleTaskRecord = ({ id, tasks, setTasks, cancelReminder, scheduleReminder, now = Date.now }) => {
  const target = tasks.find((task) => task.id === id);
  if (target?.remindAt) {
    if (!target.completed) {
      cancelReminder(id);
    } else if (new Date(target.remindAt).getTime() > now() + 5000) {
      scheduleReminder({
        taskId: id,
        title: `⏰ ${target.reminderTitle || target.title}`,
        body: target.reminderBody || target.title,
        at: target.remindAt,
      });
    }
  }
  setTasks((current) => current.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task)));
};

const deleteTaskRecord = ({ id, setTasks, cancelReminder }) => {
  cancelReminder(id);
  setTasks((current) => current.filter((task) => task.id !== id));
};

const createReminderTask = async ({
  reminder,
  tasks,
  isPersistenceBlocked,
  saveTasks,
  setTasks,
  createId,
  toISO,
  scheduleReminder,
  onPermission,
  fallbackTitle,
  isCurrent = () => true,
  now = Date.now,
  nowISO = () => new Date().toISOString(),
}) => {
  if (!isCurrent()) return { ok: false, reason: 'stale' };
  const at = new Date(reminder && reminder.at);
  if (!reminder || !Number.isFinite(at.getTime())) return { ok: false, reason: 'time' };
  if (at.getTime() < now() + 5000) return { ok: false, reason: 'past' };

  const title = String(reminder.title || '').replace(/\s+/g, ' ').trim().slice(0, 60) || fallbackTitle;
  const body = String(reminder.body || title).replace(/\s+/g, ' ').trim().slice(0, 200);
  const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const newTask = {
    id: createId('task'),
    title: `${hhmm} · ${title}`,
    dueDate: toISO(at),
    completed: false,
    createdAt: nowISO(),
    remindAt: at.toISOString(),
    reminderTitle: title,
    reminderBody: body,
    source: 'ai',
  };
  const nextTasks = [newTask, ...tasks];
  const saved = isPersistenceBlocked() ? false : await saveTasks(nextTasks);
  if (!isCurrent()) return { ok: false, reason: 'stale' };
  if (!saved) return { ok: false, reason: 'save' };
  setTasks((current) => (current.some((task) => task.id === newTask.id) ? current : [newTask, ...current]));
  if (!isCurrent()) return { ok: false, reason: 'stale' };
  const notif = await scheduleReminder({ taskId: newTask.id, title: `⏰ ${title}`, body, at: newTask.remindAt });
  if (!isCurrent()) return { ok: false, reason: 'stale' };
  if (notif.reason === 'permission') onPermission(notif.permission || 'denied');
  return { ok: true, task: newTask, at, notif };
};

module.exports = { createReminderTask, deleteTaskRecord, persistTaskDraft, toggleTaskRecord };
