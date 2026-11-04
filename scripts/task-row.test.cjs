const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const transformModules = require('@babel/plugin-transform-modules-commonjs');
const transformJsx = require('@babel/plugin-transform-react-jsx');

const root = path.resolve(__dirname, '..') + path.sep;
const originalJsLoader = require.extensions['.js'];
const originalLoad = Module._load;
const nativeMocks = { Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View', Platform: { OS: 'ios' }, StatusBar: {}, StyleSheet: { create: (styles) => styles, absoluteFillObject: {} } };

require.extensions['.js'] = (module, filename) => {
  if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
    return originalJsLoader(module, filename);
  }
  const source = fs.readFileSync(filename, 'utf8');
  const { code } = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename,
    plugins: [transformModules, transformJsx],
  });
  return module._compile(code, filename);
};
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.startsWith(root)) {
    if (request === 'react-native') return nativeMocks;
    if (request === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
    if (request === '@react-native-async-storage/async-storage' || request === './fileSystemCompat') return {};
    if (request === './arabic') return { toArabic: (text) => text };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const TaskRowModule = require('../TaskRow');
require.extensions['.js'] = originalJsLoader;
Module._load = originalLoad;
const TaskRow = TaskRowModule.default;
const { taskRowDetails } = TaskRowModule;

const today = '2026-10-30';
const colors = { red: '#red', orange: '#orange', muted: '#muted', green: '#green', blue: '#blue' };
const styles = {
  taskRow: 'taskRow', taskIconBox: 'taskIconBox', flex1: 'flex1', taskTitle: 'taskTitle',
  taskTitleDone: 'taskTitleDone', cardMeta: 'cardMeta', taskStatus: 'taskStatus',
  taskCircle: 'taskCircle', taskCircleDone: 'taskCircleDone',
};
const translate = (language) => (tr, en, de) => language === 'en' ? en : language === 'de' ? de : tr;
const taskRowProps = (overrides = {}) => ({
  s: styles,
  c: colors,
  tx: translate(overrides.lang || 'tr'),
  lang: overrides.lang || 'tr',
  today,
  openTask() {},
  toggleTask() {},
  ...overrides,
});

const getTree = (element, predicate, result = []) => {
  if (element === null || element === undefined || typeof element === 'boolean') return result;
  if (Array.isArray(element)) {
    element.forEach((child) => getTree(child, predicate, result));
    return result;
  }
  if (typeof element !== 'object' || !element.type) return result;
  if (predicate(element)) result.push(element);
  getTree(element.props?.children, predicate, result);
  return result;
};

const textContent = (node) => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (typeof node !== 'object' || !node.type) return String(node);
  return textContent(node.props?.children);
};

const task = (id, dueDate, completed = false) => ({ id, title: id, dueDate, completed });

test('task presentation distinguishes overdue, today, upcoming and completed states', () => {
  const cases = [
    [task('overdue', '2026-10-28'), 'overdue', colors.red, 'return-up-back', '2 days overdue', true],
    [task('today', today), 'today', colors.orange, 'time-outline', 'Due today!', true],
    [task('upcoming', '2026-11-01'), 'upcoming', colors.green, 'calendar-outline', '2 days left', false],
    [task('completed', '2026-10-28', true), 'completed', colors.muted, 'checkmark', '2 days overdue', false],
  ];
  for (const [item, state, color, icon, relative, defaultVisibility] of cases) {
    const details = taskRowDetails({ task: item, today, lang: 'en', tx: translate('en'), colors });
    assert.equal(details.state, state);
    assert.equal(details.color, color);
    assert.equal(details.icon, icon);
    assert.equal(details.relative.text, relative);
    assert.equal(details.showRelative, defaultVisibility);
  }
  assert.equal(taskRowDetails({ task: task('upcoming', '2026-11-01'), mode: 'upcoming', today, lang: 'en', tx: translate('en'), colors }).showRelative, true);
});

test('TaskRow renders the existing translated date and invokes the original task and id callbacks', () => {
  const item = task('owner-task', '2026-10-29');
  const opened = [];
  const toggled = [];
  const element = TaskRow({ task: item, taskRow: taskRowProps({ lang: 'en', openTask: (value) => opened.push(value), toggleTask: (id) => toggled.push(id) }) });
  const buttons = getTree(element, (node) => node.type === 'TouchableOpacity');
  const icons = getTree(element, (node) => node.type === 'Ionicons');
  const labels = getTree(element, (node) => node.type === 'Text').map(textContent);

  assert.equal(buttons.length, 2);
  buttons[0].props.onPress();
  buttons[1].props.onPress();
  assert.deepEqual(opened, [item]);
  assert.deepEqual(toggled, ['owner-task']);
  assert.ok(labels.includes('29/10/2026'));
  assert.ok(labels.includes('1 days overdue'));
  assert.equal(icons[0].props.name, 'return-up-back');
  assert.equal(icons[0].props.color, colors.red);
});

test('TaskRow preserves localized date formatting, today wording and completed-state controls', () => {
  const todayRow = TaskRow({ task: task('today', today), taskRow: taskRowProps({ lang: 'tr' }) });
  const germanOverdueRow = TaskRow({ task: task('late', '2026-10-28'), taskRow: taskRowProps({ lang: 'de' }) });
  const completedRow = TaskRow({ task: task('done', '2026-10-28', true), taskRow: taskRowProps({ lang: 'de' }) });
  const todayText = getTree(todayRow, (node) => node.type === 'Text').map(textContent);
  const germanText = getTree(germanOverdueRow, (node) => node.type === 'Text').map(textContent);
  const completedText = getTree(completedRow, (node) => node.type === 'Text').map(textContent);
  const completedIcons = getTree(completedRow, (node) => node.type === 'Ionicons');

  assert.ok(todayText.includes('30.10.2026'));
  assert.ok(todayText.includes('Bugün son gün!'));
  assert.ok(germanText.includes('2 Tage überfällig'));
  assert.ok(germanText.includes('28.10.2026'));
  assert.ok(completedText.includes('28.10.2026'));
  assert.ok(!completedText.some((text) => text.includes('Tage überfällig')));
  assert.equal(completedIcons.at(-1).props.name, 'checkmark');
});
