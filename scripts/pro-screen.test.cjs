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
const screenPath = path.join(root, 'ProScreen.js');
const appSource = fs.readFileSync(appPath, 'utf8');
const screenSource = fs.readFileSync(screenPath, 'utf8');
const originalJsLoader = require.extensions['.js'];
const originalLoad = Module._load;
const actualReact = require('react');
let selectedPlan;
let effects;
const alertCalls = [];

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
    if (request === 'react') return {
      __esModule: true,
      default: actualReact,
      useState(initial) {
        if (selectedPlan === undefined) selectedPlan = initial;
        return [selectedPlan, (value) => { selectedPlan = value; }];
      },
      useEffect(effect, dependencies) { effects.push({ effect, dependencies }); },
    };
    if (request === 'react-native') return {
      ActivityIndicator: 'ActivityIndicator', Alert: { alert: (...args) => alertCalls.push(args) },
      Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View',
    };
    if (request === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
    if (request === './helpers') return { dateLocaleFor: (lang) => ({ en: 'en-GB', de: 'de-DE' }[lang] || 'tr-TR') };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const ProScreen = require('../ProScreen').default;
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
  return {
    s, c: { green: 'green' }, tx: (_tr, en) => en, lang: 'en', goBack() {},
    entitlement: { state: 'idle', reason: null }, proActive: false, proInfo: { state: 'free', periodEnd: null },
    refreshEntitlement() {}, backupErrorText: (_tx, reason) => `backup:${reason}`,
    Screen: 'Screen', ScreenHeader: 'ScreenHeader',
    ...overrides,
  };
};
const render = (props) => {
  selectedPlan = undefined;
  effects = [];
  return ProScreen(props);
};

test('Pro JSX matches the pre-extraction structure, translations, styles and callbacks', () => {
  assert.equal(digest(returnedJsx(findComponent(parse(screenSource), 'ProScreen'))), '097ff0c414227cc29ae31d37d8bede78a8aa184ebd1c3bc3f230b8e53dfadbbf');
  assert.doesNotMatch(screenSource, /useApp\(|from ['"]\.\/App['"]/);
  assert.match(screenSource, /import \{ dateLocaleFor \} from ['"]\.\/helpers['"]/);
});

test('App route directly renders the stable imported Pro component with read-only entitlement and unchanged refresh inputs', () => {
  assert.match(appSource, /import ProScreenView from ['"]\.\/ProScreen['"]/);
  assert.doesNotMatch(appSource, /const\s+ProScreen\s*=|function\s+ProScreen\s*\(/);
  const route = appSource.match(/case 'pro':\s*return\s*(<ProScreenView[\s\S]*?\/>);/);
  assert.ok(route, 'Pro route directly renders the module-level imported component');
  for (const prop of ['s', 'c', 'tx', 'lang', 'goBack', 'entitlement', 'proActive', 'proInfo', 'refreshEntitlement', 'backupErrorText', 'Screen', 'ScreenHeader']) {
    assert.match(route[1], new RegExp(`\\b${prop}=`), `Pro route passes ${prop}`);
  }
  assert.doesNotMatch(screenSource, /supabase\.|consume_feature_trial\s*\(|setEntitlement\s*\(|RevenueCat/);
});

test('mount refresh and local plan selection keep their original lifecycle and default', () => {
  let refreshes = 0;
  let goBacks = 0;
  const props = makeProps({ refreshEntitlement: () => { refreshes += 1; }, goBack: () => { goBacks += 1; } });
  const first = render(props);
  assert.equal(selectedPlan, 'yearly');
  assert.equal(effects.length, 1);
  assert.deepEqual(effects[0].dependencies, []);
  effects[0].effect();
  assert.equal(refreshes, 1);

  const buttons = visitElements(first, (item) => item.type === 'TouchableOpacity');
  const monthly = buttons.find((button) => Array.isArray(button.props.style) && button.props.style[0] === 'planCard');
  assert.ok(monthly);
  monthly.props.onPress();
  const rerendered = ProScreen(props);
  assert.equal(selectedPlan, 'monthly');
  const monthlyCard = visitElements(rerendered, (item) => item.type === 'TouchableOpacity')
    .find((button) => Array.isArray(button.props.style) && button.props.style[0] === 'planCard');
  assert.equal(monthlyCard.props.style[1], 'planCardActive');
  assert.equal(goBacks, 0);
});

test('entitlement error and unavailable-purchase alert remain display-only and use existing callbacks', () => {
  alertCalls.length = 0;
  let wentBack = 0;
  const props = makeProps({ entitlement: { state: 'error', reason: 'network' }, goBack: () => { wentBack += 1; } });
  const element = render(props);
  assert.ok(textContent(element).includes('backup:network'));
  const upgrade = visitElements(element, (item) => item.type === 'TouchableOpacity')
    .find((button) => textContent(button).includes('Upgrade to Pro'));
  assert.ok(upgrade);
  upgrade.props.onPress();
  assert.equal(alertCalls.length, 1);
  assert.equal(alertCalls[0][0], 'BAKPLANLA Pro');
  assert.match(alertCalls[0][1], /payment system is not connected/);
  assert.equal(typeof alertCalls[0][2][0].onPress, 'function');
  alertCalls[0][2][0].onPress();
  assert.equal(wentBack, 1);
});
