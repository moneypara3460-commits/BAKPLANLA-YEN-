const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const transformModules = require('@babel/plugin-transform-modules-commonjs');
const transformJsx = require('@babel/plugin-transform-react-jsx');
const test = require('node:test');

const root = path.resolve(__dirname, '..') + path.sep;
const appPath = path.join(root, 'App.js');
const screenPath = path.join(root, 'HomeScreen.js');
const appSource = fs.readFileSync(appPath, 'utf8');
const screenSource = fs.readFileSync(screenPath, 'utf8');
const originalJsLoader = require.extensions['.js'];
const originalLoad = Module._load;

require.extensions['.js'] = (module, filename) => {
  if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) return originalJsLoader(module, filename);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    babelrc: false,
    configFile: false,
    filename,
    plugins: [transformModules, transformJsx],
  });
  return module._compile(code, filename);
};
Module._load = function (request, parent, isMain) {
  if (parent?.filename === screenPath) {
    if (request === 'react-native') return { Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View' };
    if (request === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const HomeScreen = require('../HomeScreen').default;
require.extensions['.js'] = originalJsLoader;
Module._load = originalLoad;

const parse = (source) => parser.parse(source, { sourceType: 'unambiguous', plugins: ['jsx'] });
const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean).filter((item) => item !== null);
  if (!value || typeof value !== 'object') return value;
  if (value.type === 'JSXText' && !value.value.trim()) return null;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (['start', 'end', 'loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
    output[key] = clean(child);
  }
  return output;
};
const findComponent = (ast, name) => {
  let found = null;
  function visit(node) {
    if (!node || typeof node !== 'object' || found) return;
    if ((node.type === 'VariableDeclarator' && node.id?.name === name) || (node.type === 'FunctionDeclaration' && node.id?.name === name)) found = node.init || node;
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
  }
  visit(ast);
  if (!found) throw new Error(`component not found: ${name}`);
  return found;
};
const returnedJsx = (component) => {
  if (component.type === 'ArrowFunctionExpression' && component.body.type !== 'BlockStatement') return component.body;
  const statement = component.body.body.find((node) => node.type === 'ReturnStatement');
  if (!statement?.argument) throw new Error('component return not found');
  return statement.argument;
};
const digest = (node) => createHash('sha256').update(JSON.stringify(clean(node))).digest('hex');
const visitElements = (node, predicate, result = []) => {
  if (Array.isArray(node)) node.forEach((child) => visitElements(child, predicate, result));
  else if (node && typeof node === 'object') {
    if (node.type && predicate(node)) result.push(node);
    visitElements(node.props?.children, predicate, result);
  }
  return result;
};
const componentTree = (element, predicate) => visitElements(element, predicate);
const makeProps = (overrides = {}) => {
  const s = new Proxy({}, { get: (_target, key) => key });
  const c = { gold: 'gold', dark: 'dark', green: 'green' };
  const callbacks = { goTab() {}, navigate() {}, openAddSheet() {}, openNewTask() {}, openTask() {}, openTasksList() {}, toggleTask() {} };
  return {
    s, c, tx: (_tr, en) => en, lang: 'en', today: '2026-11-01', userName: 'Deniz', lifeScore: 80,
    tasks: [], isKoprusuActive: false,
    ...callbacks,
    Screen: 'Screen', LogoBadge: 'LogoBadge', EmptyCard: 'EmptyCard', TaskRow: 'TaskRow',
    ...overrides,
  };
};

test('Home JSX matches the pre-extraction structure, styles, translated copy, and callbacks', () => {
  const component = findComponent(parse(screenSource), 'HomeScreen');
  assert.equal(digest(returnedJsx(component)), '0e7813e5e90dcda194d87394bf88b13848ec9656f8cc019e54768df3925cf543');
  assert.doesNotMatch(screenSource, /useApp\(|useEffect\(|useState\(|from ['"]\.\/App['"]/);
});

test('App renders the stable imported Home component directly with the characterized contract', () => {
  assert.match(appSource, /import HomeScreenView from ['"]\.\/HomeScreen['"]/);
  assert.doesNotMatch(appSource, /const\s+HomeScreen\s*=|function\s+HomeScreen\s*\(/);
  const route = appSource.match(/case 'home':[\s\S]*?return\s*\(([\s\S]*?)\);/);
  assert.ok(route, 'home route directly returns the imported component');
  for (const prop of ['s', 'c', 'tx', 'lang', 'today', 'userName', 'lifeScore', 'tasks', 'goTab', 'navigate', 'openAddSheet', 'openNewTask', 'openTask', 'openTasksList', 'toggleTask', 'isKoprusuActive', 'Screen', 'LogoBadge', 'EmptyCard', 'TaskRow']) {
    assert.match(route[1], new RegExp(`\\b${prop}=`), `home route passes ${prop}`);
  }
  assert.doesNotMatch(route[1], /useApp\(/);
});

test('Home display sorts the same active tasks and retains profile, document, explore, task and list callbacks', () => {
  const calls = [];
  const tasks = [
    { id: 'later', dueDate: '2026-11-03', completed: false },
    { id: 'done', dueDate: '2026-11-01', completed: true },
    { id: 'soon', dueDate: '2026-11-02', completed: false },
  ];
  const openTask = (...args) => calls.push(['open-task', ...args]);
  const element = HomeScreen(makeProps({
    tasks,
    goTab: (...args) => calls.push(['tab', ...args]),
    navigate: (...args) => calls.push(['navigate', ...args]),
    openAddSheet: () => calls.push(['add-document']),
    openNewTask: () => calls.push(['new-task']),
    openTask,
    openTasksList: () => calls.push(['all-tasks']),
    toggleTask: (...args) => calls.push(['toggle-task', ...args]),
    isKoprusuActive: true,
  }));
  const touchables = componentTree(element, (item) => item.type === 'TouchableOpacity');
  const avatar = touchables.find((item) => item.props.style === 'homeAvatar');
  const addDocument = touchables.find((item) => item.props.style === 'goldBtn');
  const tiles = touchables.filter((item) => item.props.style === 'exploreTile');
  const allTasks = touchables.find((item) => item.props.onPress && item.props.children?.props?.children === 'All');
  assert.ok(avatar && addDocument && allTasks);
  avatar.props.onPress();
  addDocument.props.onPress();
  allTasks.props.onPress();
  tiles.forEach((tile) => tile.props.onPress());
  assert.deepEqual(calls, [
    ['tab', 'profile'], ['add-document'], ['all-tasks'],
    ['navigate', 'ai'], ['navigate', 'opportunities'], ['navigate', 'today'], ['navigate', 'qr'],
    ['navigate', 'shopping'], ['navigate', 'isbasi'], ['navigate', 'compass'], ['navigate', 'koprusu'],
  ]);
  const rows = componentTree(element, (item) => item.type === 'TaskRow');
  assert.deepEqual(rows.map((row) => row.props.task.id), ['soon', 'later']);
  assert.equal(rows[0].props.mode, 'upcoming');
  assert.equal(rows[0].props.taskRow.openTask, openTask);
  assert.deepEqual(tasks.map((task) => task.id), ['later', 'done', 'soon']);
});

test('empty task state preserves EmptyCard actions and task-row completion callbacks remain injected', () => {
  let created = 0;
  const emptyElement = HomeScreen(makeProps({ tasks: [], openNewTask: () => { created += 1; } }));
  const emptyCard = componentTree(emptyElement, (item) => item.type === 'EmptyCard')[0];
  assert.equal(emptyCard.props.title, 'No active tasks');
  emptyCard.props.onPress();
  assert.equal(created, 1);

  const toggle = () => {};
  const open = () => {};
  const rowElement = HomeScreen(makeProps({ tasks: [{ id: 'task', dueDate: '2026-11-02', completed: false }], openTask: open, toggleTask: toggle }));
  const row = componentTree(rowElement, (item) => item.type === 'TaskRow')[0];
  assert.equal(row.props.taskRow.openTask, open);
  assert.equal(row.props.taskRow.toggleTask, toggle);
});
