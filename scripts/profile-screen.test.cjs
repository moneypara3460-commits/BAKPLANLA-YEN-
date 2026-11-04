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
const screenPath = path.join(root, 'ProfileScreen.js');
const screenSource = fs.readFileSync(screenPath, 'utf8');
const originalJsLoader = require.extensions['.js'];
const originalLoad = Module._load;
const alerts = [];
const openedUrls = [];
require.extensions['.js'] = (module, filename) => {
  if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) return originalJsLoader(module, filename);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    babelrc: false, configFile: false, filename, plugins: [transformModules, transformJsx],
  });
  return module._compile(code, filename);
};
Module._load = function (request, parent, isMain) {
  if (parent?.filename === screenPath) {
    if (request === 'react-native') return {
      ActivityIndicator: 'ActivityIndicator', Alert: { alert: (...args) => alerts.push(args) },
      Linking: { openURL: (url) => { openedUrls.push(url); return Promise.resolve(); } },
      Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View',
    };
    if (request === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const ProfileScreen = require('../ProfileScreen').default;
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
    s, c: { red: 'red' }, tx: (_tr, en) => en,
    userName: 'Deniz', session: { user: { id: 'user-a', email: 'deniz@example.invalid' } },
    navigate: (...args) => calls.push(['navigate', ...args]),
    setShowPlanModal: (...args) => calls.push(['plan', ...args]),
    setShowAppearanceModal: (...args) => calls.push(['appearance', ...args]),
    setShowAuthModal: (...args) => calls.push(['auth', ...args]),
    resetData: (...args) => calls.push(['reset', ...args]),
    deleteAccount: (...args) => calls.push(['delete-account', ...args]),
    accountDeleting: false, proActive: false, proInfo: { state: 'free' }, notifPrefs: { taskReminders: true, hour: 9 },
    isletmePanelActive: false, appVersion: '1.2.0', supportEmail: 'support@example.invalid',
    legalUrls: { privacy: 'https://example.invalid/privacy' },
    openLegal: (...args) => calls.push(['legal', ...args]),
    withdrawAiConsent: async () => true,
    Screen: 'Screen', ScreenHeader: 'ScreenHeader', MenuRow: 'MenuRow', calls,
    ...overrides,
  };
};
const render = (props) => ProfileScreen(props);

test('Profile JSX matches its pre-extraction structure, copy, styles, conditions and actions', () => {
  assert.equal(digest(returnedJsx(findComponent(parse(screenSource), 'ProfileScreen'))), 'b0a9a1e6f526e0180b1c779640be165795d17dc6d1bbafaae040fc1819861072');
  assert.doesNotMatch(screenSource, /useApp\(|useEffect\(|useState\(|from ['"]\.\/App['"]/);
});

test('App directly renders stable Profile import with explicit owner and sensitive-action callbacks', () => {
  assert.match(appSource, /import ProfileScreenView from ['"]\.\/ProfileScreen['"]/);
  assert.doesNotMatch(appSource, /const\s+ProfileScreen\s*=|function\s+ProfileScreen\s*\(/);
  const route = appSource.match(/case 'profile':\s*return\s*(<ProfileScreenView[\s\S]*?\/>);/);
  assert.ok(route);
  for (const prop of ['session', 'setShowPlanModal', 'setShowAppearanceModal', 'setShowAuthModal', 'resetData', 'deleteAccount', 'accountDeleting', 'withdrawAiConsent', 'Screen', 'ScreenHeader', 'MenuRow']) {
    assert.match(route[1], new RegExp(`\\b${prop}=`), `profile route passes ${prop}`);
  }
  assert.doesNotMatch(screenSource, /supabase|deleteLocalAccountScope|signOut\s*\(/);
});

test('profile taps preserve account, plan, Pro and navigation callback ownership', () => {
  const props = makeProps();
  const tree = render(props);
  const touchables = visitElements(tree, (item) => item.type === 'TouchableOpacity');
  const userCard = touchables.find((item) => item.props.style === 'userCard');
  assert.ok(userCard);
  userCard.props.onPress();
  const menu = visitElements(tree, (item) => item.type === 'MenuRow');
  menu.find((item) => item.props.icon === 'person-outline').props.onPress();
  menu.find((item) => item.props.icon === 'cloud-outline').props.onPress();
  const proPill = touchables.find((item) => item.props.style === 'proPill');
  proPill.props.onPress();
  assert.deepEqual(props.calls, [['plan', true], ['plan', true], ['navigate', 'cloud'], ['navigate', 'pro']]);
});

test('destructive actions remain explicit App callbacks and consent/legal actions remain owner supplied', async () => {
  alerts.length = 0;
  const props = makeProps();
  const tree = render(props);
  const touchables = visitElements(tree, (item) => item.type === 'TouchableOpacity');
  const reset = touchables.find((item) => Array.isArray(item.props.style) && item.props.style[0] === 'dangerBtn' && item.props.disabled === undefined);
  const deleteAccount = touchables.find((item) => item.props.disabled === false);
  assert.ok(reset && deleteAccount);
  reset.props.onPress();
  deleteAccount.props.onPress();
  assert.deepEqual(props.calls.slice(-2), [['reset'], ['delete-account']]);

  const menu = visitElements(tree, (item) => item.type === 'MenuRow');
  menu.find((item) => item.props.icon === 'shield-checkmark-outline').props.onPress();
  assert.equal(alerts.length, 1);
  const actions = alerts[0][2];
  actions.find((item) => item.text === 'Privacy Policy').onPress();
  assert.deepEqual(props.calls.at(-1), ['legal', 'https://example.invalid/privacy']);
  await actions.find((item) => item.text === 'Withdraw AI consent').onPress();
  assert.equal(alerts.length, 2);
});
