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
const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
const screenPath = path.join(root, 'CloudScreen.js');
const screenSource = fs.readFileSync(screenPath, 'utf8');
const originalJsLoader = require.extensions['.js'];
const originalLoad = Module._load;
const effectCalls = [];
require.extensions['.js'] = (module, filename) => {
  if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) return originalJsLoader(module, filename);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    babelrc: false, configFile: false, filename, plugins: [transformModules, transformJsx],
  });
  return module._compile(code, filename);
};
Module._load = function (request, parent, isMain) {
  if (parent?.filename === screenPath) {
    if (request === 'react') return { __esModule: true, default: require('react'), useEffect: (effect, dependencies) => effectCalls.push({ effect, dependencies }) };
    if (request === 'react-native') return {
      ActivityIndicator: 'ActivityIndicator', Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View',
    };
    if (request === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
    if (request === './helpers') return { dateLocaleFor: (lang) => ({ en: 'en-GB', de: 'de-DE' }[lang] || 'tr-TR') };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const CloudScreen = require('../CloudScreen').default;
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
const returnedJsx = (component) => component.body.body.find((node) => node.type === 'ReturnStatement')?.argument;
const digest = (node) => createHash('sha256').update(JSON.stringify(clean(node))).digest('hex');
const visitElements = (node, predicate, result = []) => {
  if (Array.isArray(node)) node.forEach((child) => visitElements(child, predicate, result));
  else if (node && typeof node === 'object') {
    if (node.type && predicate(node)) result.push(node);
    visitElements(node.props?.children, predicate, result);
  }
  return result;
};
const textContent = (node) => {
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return node && typeof node === 'object' ? textContent(node.props?.children) : '';
};
const makeProps = (overrides = {}) => {
  const s = new Proxy({}, { get: (_target, key) => key });
  const calls = [];
  return {
    s, c: { green: 'green', red: 'red' }, tx: (_tr, en) => en, lang: 'en',
    session: { user: { id: 'user-a', email: 'a@example.invalid' } }, setShowAuthModal: (...args) => calls.push(['auth', ...args]),
    backupBusy: false, backupStatus: null, backupInfo: { lastBackupAt: null, taskCount: 0, documentCount: 0, hasPreRestore: false },
    refreshBackupInfo: () => calls.push(['refresh-local']), cloudMeta: { state: 'ready', exists: false },
    refreshCloudMeta: () => calls.push(['refresh-cloud']), runBackup: () => calls.push(['backup']),
    runRestore: () => calls.push(['restore']), undoRestore: () => calls.push(['undo']), deleteCloudBackup: () => calls.push(['delete-cloud']),
    backupErrorText: (_tx, reason) => `backup:${reason}`, Screen: 'Screen', ScreenHeader: 'ScreenHeader',
    calls, ...overrides,
  };
};
const render = (props) => CloudScreen(props);

test('Cloud JSX matches the pre-extraction layout, copy, status and action controls', () => {
  assert.equal(digest(returnedJsx(findComponent(parse(screenSource), 'CloudScreen'))), '3fe5903b14893c68eb6d7af5fa133cc4e2490a8562db3388e4ae9d482144d6d3');
  assert.doesNotMatch(screenSource, /useApp\(|from ['"]\.\/App['"]|runRestore\s*=|async\s+function/);
});

test('App renders the stable imported Cloud component directly with backup operations kept as callbacks', () => {
  assert.match(appSource, /import CloudScreenView from ['"]\.\/CloudScreen['"]/);
  assert.doesNotMatch(appSource, /const\s+CloudScreen\s*=|function\s+CloudScreen\s*\(/);
  const route = appSource.match(/case 'cloud':\s*return\s*(<CloudScreenView[\s\S]*?\/>);/);
  assert.ok(route);
  for (const prop of ['session', 'refreshBackupInfo', 'refreshCloudMeta', 'runBackup', 'runRestore', 'undoRestore', 'deleteCloudBackup', 'backupErrorText', 'Screen', 'ScreenHeader']) {
    assert.match(route[1], new RegExp(`\\b${prop}=`), `cloud route passes ${prop}`);
  }
  assert.match(screenSource, /useEffect\(\(\) => \{ refreshBackupInfo\(\); refreshCloudMeta\(\); \}, \[session\?\.user\?\.id\]\)/);
});

test('mount refresh remains keyed to the active session ID and invokes the same refresh adapters', () => {
  effectCalls.length = 0;
  const props = makeProps();
  render(props);
  assert.equal(effectCalls.length, 1);
  assert.deepEqual(effectCalls[0].dependencies, ['user-a']);
  effectCalls[0].effect();
  assert.deepEqual(props.calls.slice(0, 2), [['refresh-local'], ['refresh-cloud']]);

  effectCalls.length = 0;
  render(makeProps({ session: null }));
  assert.equal(effectCalls.length, 1);
  assert.deepEqual(effectCalls[0].dependencies, [undefined]);
});

test('guest gating, retry controls and backup actions preserve existing callback ownership', () => {
  const guestCalls = [];
  const guestTree = render(makeProps({ session: null, setShowAuthModal: (...args) => guestCalls.push(args) }));
  const guestButtons = visitElements(guestTree, (item) => item.type === 'TouchableOpacity');
  const login = guestButtons.find((button) => textContent(button).includes('Sign In / Sign Up'));
  const backupGuest = guestButtons.find((button) => textContent(button).includes('Back Up Now'));
  assert.ok(login && backupGuest);
  assert.equal(backupGuest.props.disabled, true);
  login.props.onPress();
  assert.deepEqual(guestCalls, [[true]]);

  const props = makeProps({ backupInfo: { lastBackupAt: '2026-10-31T12:00:00Z', taskCount: 2, documentCount: 1, hasPreRestore: true } });
  const tree = render(props);
  const buttons = visitElements(tree, (item) => item.type === 'TouchableOpacity');
  for (const label of ['Refresh server status', 'Back Up Now', 'Restore from Backup', 'Undo Last Restore', 'Delete My Cloud Backup']) {
    const button = buttons.find((item) => textContent(item).includes(label));
    assert.ok(button, `${label} exists`);
    button.props.onPress();
  }
  assert.deepEqual(props.calls.filter((call) => !call[0].startsWith('refresh')), [['backup'], ['restore'], ['undo'], ['delete-cloud']]);
  assert.ok(props.calls.some((call) => call[0] === 'refresh-cloud'));
});
