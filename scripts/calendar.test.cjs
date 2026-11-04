const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const transformModules = require('@babel/plugin-transform-modules-commonjs');

const root = path.resolve(__dirname, '..') + path.sep;
const originalJsLoader = require.extensions['.js'];
require.extensions['.js'] = (module, filename) => {
  if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
    return originalJsLoader(module, filename);
  }
  const source = fs.readFileSync(filename, 'utf8');
  const { code } = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename,
    plugins: [transformModules],
  });
  return module._compile(code, filename);
};
const calendar = require('../calendar.js');
require.extensions['.js'] = originalJsLoader;

test('month cells preserve Monday-first weeks and leap-year boundaries', () => {
  const february = calendar.buildMonthCells(2024, 1);
  assert.equal(february.length, 35);
  assert.deepEqual(february.slice(0, 4), [null, null, null, '2024-02-01']);
  assert.equal(february[31], '2024-02-29');
  assert.deepEqual(february.slice(-3), [null, null, null]);
});

test('month cursor navigation crosses both year boundaries', () => {
  assert.deepEqual(calendar.nextCalendarMonth({ year: 2025, month: 11 }, 1), { year: 2026, month: 0 });
  assert.deepEqual(calendar.nextCalendarMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
});

test('month and selected-day task filtering use the requested calendar date', () => {
  const tasks = [
    { id: 'jan', dueDate: '2025-01-31', completed: false },
    { id: 'feb', dueDate: '2025-02-01', completed: false },
    { id: 'next-year', dueDate: '2026-02-01', completed: false },
  ];
  assert.deepEqual(calendar.tasksForCalendarMonth(tasks, 2025, 1).map((task) => task.id), ['feb']);
  assert.deepEqual(calendar.tasksForCalendarDay(tasks, '2025-02-01').map((task) => task.id), ['feb']);
});

test('selected-day tasks put incomplete first without mutating the task store array', () => {
  const tasks = [
    { id: 'done', dueDate: '2026-10-30', completed: true },
    { id: 'active-later', dueDate: '2026-10-30', completed: false },
    { id: 'other-day', dueDate: '2026-10-31', completed: false },
    { id: 'active-first', dueDate: '2026-10-30', completed: false },
  ];
  const originalOrder = tasks.map((task) => task.id);
  const selected = calendar.tasksForCalendarDay(tasks, '2026-10-30');
  assert.deepEqual(selected.map((task) => task.id), ['active-later', 'active-first', 'done']);
  assert.deepEqual(tasks.map((task) => task.id), originalOrder);
  assert.notEqual(selected, tasks);
});

test('month list sorts by due date without mutating source order', () => {
  const tasks = [
    { id: 'later', dueDate: '2026-11-21', completed: true },
    { id: 'earlier', dueDate: '2026-11-02', completed: false },
    { id: 'other-month', dueDate: '2026-12-01', completed: false },
  ];
  const monthTasks = calendar.tasksForCalendarMonth(tasks, 2026, 10);
  const list = calendar.sortCalendarTasksByDate(monthTasks);
  assert.deepEqual(list.map((task) => task.id), ['earlier', 'later']);
  assert.deepEqual(tasks.map((task) => task.id), ['later', 'earlier', 'other-month']);
});

test('calendar mode remains persisted as calendar/list and task creation uses mode date', () => {
  assert.equal(calendar.calendarViewForMode('list'), 'list');
  assert.equal(calendar.calendarViewForMode('calendar'), 'month');
  assert.equal(calendar.calendarModeForView('list'), 'list');
  assert.equal(calendar.calendarModeForView('month'), 'calendar');
  assert.equal(calendar.calendarTaskCreationDate('month', '2026-10-12', '2026-10-30'), '2026-10-12');
  assert.equal(calendar.calendarTaskCreationDate('list', '2026-10-12', '2026-10-30'), '2026-10-30');
});

test('All tasks opens the existing Calendar route in list mode in order', () => {
  const calls = [];
  calendar.openCalendarList((mode) => calls.push(['mode', mode]), (route) => calls.push(['route', route]));
  assert.deepEqual(calls, [['mode', 'list'], ['route', 'calendar']]);
});

test('shopping day keeps Istanbul-date eligibility and month visibility separate from tasks', () => {
  const plan = { shopDate: '2026-11-01', items: [{ name: 'Milk' }] };
  assert.equal(calendar.activeShoppingDate(plan, '2026-10-31'), '2026-11-01');
  assert.equal(calendar.activeShoppingDate(plan, '2026-11-02'), null);
  assert.equal(calendar.dateIsInCalendarMonth('2026-11-01', 2026, 10), true);
  assert.equal(calendar.tasksForCalendarMonth([], 2026, 10).length, 0);
});

test('empty states distinguish no items from a shopping-summary-only date or month', () => {
  assert.equal(calendar.calendarContentState(0, false), 'empty');
  assert.equal(calendar.calendarContentState(0, true), 'shopping-only');
  assert.equal(calendar.calendarContentState(2, true), 'tasks');
});

test('calendar selectors reflect changed task and plan inputs on the next render', () => {
  const initialTasks = [];
  const updatedTasks = [{ id: 'added', dueDate: '2026-11-01', completed: false }];
  assert.equal(calendar.tasksForCalendarMonth(initialTasks, 2026, 10).length, 0);
  assert.deepEqual(calendar.tasksForCalendarMonth(updatedTasks, 2026, 10), updatedTasks);
  assert.equal(calendar.activeShoppingDate(null, '2026-10-31'), null);
  assert.equal(calendar.activeShoppingDate({ shopDate: '2026-11-01' }, '2026-10-31'), '2026-11-01');
});
