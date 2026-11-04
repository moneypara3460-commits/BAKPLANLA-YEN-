const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const transformModules = require('@babel/plugin-transform-modules-commonjs');
const transformJsx = require('@babel/plugin-transform-react-jsx');
const test = require('node:test');

const root = path.resolve(__dirname, '..') + path.sep;
const baseSha = 'c4927beeaf009c885f4c63d8c82e141e74f16be4';
const appPath = path.join(root, 'App.js');
const screenPath = path.join(root, 'DocumentDetailScreen.js');
const appSource = fs.readFileSync(appPath, 'utf8');
const screenSource = fs.readFileSync(screenPath, 'utf8');
const priorAppSource = execFileSync('git', ['show', `${baseSha}:App.js`], { cwd: root, encoding: 'utf8' });
let activeRuntime = null;
const originalJsLoader = require.extensions['.js'];
const originalLoad = Module._load;
const ReactElements = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.length === 1 ? children[0] : children } }),
};

require.extensions['.js'] = (module, filename) => {
  if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) return originalJsLoader(module, filename);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    babelrc: false, configFile: false, filename, plugins: [transformModules, transformJsx],
  });
  return module._compile(code, filename);
};
Module._load = function (request, parent, isMain) {
  if (parent?.filename === screenPath) {
    if (request === 'react') return {
      __esModule: true, default: ReactElements,
      useEffect: (...args) => activeRuntime.useEffect(...args),
      useRef: (...args) => activeRuntime.useRef(...args),
      useState: (...args) => activeRuntime.useState(...args),
    };
    if (request === 'react-native') return {
      ActivityIndicator: 'ActivityIndicator', Alert: { alert: (...args) => activeRuntime?.alerts.push(args) },
      Image: 'Image', Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View',
    };
    if (request === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
    if (request === './helpers') return { formatDate: (value) => value || '' };
    if (request === './receipts') return { isReceiptDoc: (doc) => doc?.type === 'receipt' };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const DocumentDetailScreen = require('../DocumentDetailScreen').default;
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
    if (node.type === 'VariableDeclarator' && node.id?.name === name) found = node.init;
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
  }
  visit(ast);
  if (!found) throw new Error(`component not found: ${name}`);
  return found;
};
const returnedJsx = (component) => component.body.body
  .filter((node) => node.type === 'ReturnStatement' && node.argument?.type?.startsWith('JSX'))
  .map((node) => node.argument);
const digest = (node) => require('node:crypto').createHash('sha256').update(JSON.stringify(clean(node))).digest('hex');
const textContent = (node) => Array.isArray(node) ? node.map(textContent).join('')
  : typeof node === 'string' || typeof node === 'number' ? String(node)
    : node && typeof node === 'object' ? textContent(node.props?.children) : '';
const visit = (node, predicate, result = []) => {
  if (Array.isArray(node)) node.forEach((child) => visit(child, predicate, result));
  else if (node && typeof node === 'object') {
    if (node.type && predicate(node)) result.push(node);
    visit(node.props?.children, predicate, result);
  }
  return result;
};
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};
const flushAsync = async () => { await Promise.resolve(); await Promise.resolve(); };
const makeDoc = (overrides = {}) => ({ id: 'doc-a', title: 'Warranty', type: 'manual', uri: 'file://doc-a.png', createdAt: '2026-10-30', notes: '', analysis: null, ...overrides });
const makeProps = (overrides = {}) => {
  const s = new Proxy({}, { get: (_target, key) => key });
  return {
    document: makeDoc(), dataScopeGeneration: 1, isCurrentDataScope: (generation) => generation === 1,
    s, c: { green: 'green' }, tx: (_tr, en) => en, lang: 'en',
    analyzeDocument: async () => {}, deleteDocument: () => {}, createTaskFromDocument: () => {},
    Screen: 'Screen', ScreenHeader: 'ScreenHeader', EmptyCard: 'EmptyCard', ReceiptCard: 'ReceiptCard',
    ...overrides,
  };
};
const createRenderer = (Component) => {
  const slots = [];
  const pendingEffects = [];
  const stateWrites = [];
  const alerts = [];
  let cursor = 0;
  const runtime = {
    stateWrites, alerts,
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { kind: 'state', value: initial };
      const slot = slots[index];
      return [slot.value, (value) => {
        const next = typeof value === 'function' ? value(slot.value) : value;
        stateWrites.push({ index, value: next });
        slot.value = next;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { kind: 'ref', value: { current: initial } };
      return slots[index].value;
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const prior = slots[index];
      const changed = !prior || !dependencies || !prior.dependencies || dependencies.length !== prior.dependencies.length || dependencies.some((value, item) => !Object.is(value, prior.dependencies[item]));
      if (changed) pendingEffects.push({ index, effect, dependencies });
    },
    render(props) {
      activeRuntime = runtime;
      cursor = 0;
      pendingEffects.length = 0;
      const tree = Component(props);
      for (const item of pendingEffects) {
        slots[item.index]?.cleanup?.();
        const cleanup = item.effect();
        slots[item.index] = { kind: 'effect', dependencies: item.dependencies, cleanup };
      }
      return tree;
    },
    unmount() {
      for (const slot of slots) slot?.cleanup?.();
      activeRuntime = null;
    },
  };
  return runtime;
};
const nodes = (tree, name) => visit(tree, (node) => node.type === name);
const buttonWithText = (tree, label) => nodes(tree, 'TouchableOpacity').find((node) => textContent(node).includes(label));
const buttonWithStyle = (tree, styleName) => nodes(tree, 'TouchableOpacity').find((node) => {
  const styles = Array.isArray(node.props.style) ? node.props.style : [node.props.style];
  return styles.includes(styleName);
});

test('DocumentDetailScreen is a stable imported module with exact prior JSX parity', () => {
  const before = findComponent(parse(priorAppSource), 'DocumentDetailScreen');
  const after = findComponent(parse(screenSource), 'DocumentDetailScreen');
  const oldReturns = returnedJsx(before);
  const newReturns = returnedJsx(after);
  assert.equal(oldReturns.length, newReturns.length);
  assert.deepEqual(newReturns.map(digest), oldReturns.map(digest));
  assert.match(appSource, /import DocumentDetailScreenView from '\.\/DocumentDetailScreen'/);
  assert.match(appSource, /case 'documentDetail':[\s\S]*?<DocumentDetailScreenView/);
  assert.doesNotMatch(screenSource, /useApp\(|supabase|AsyncStorage|callSmartJson/);
});

test('baseline detail callbacks were unscoped; extracted callbacks carry and verify the originating generation', () => {
  const before = findComponent(parse(priorAppSource), 'DocumentDetailScreen');
  const priorSource = priorAppSource.slice(before.start, before.end);
  assert.match(priorSource, /const \[busy, setBusy\] = useState\(false\)/);
  assert.match(priorSource, /onPress: \(\) => deleteDocument\(document\.id\)/);
  assert.match(priorSource, /await analyzeDocument\(document\.id\)/);
  assert.match(screenSource, /onPress: \(\) => \{\s*if \(isCurrent\(scopeKey, generation\)\) deleteDocument\(document\.id, generation\);/);
  assert.match(screenSource, /await analyzeDocument\(document\.id, generation\)/);
  assert.match(screenSource, /const scopeKey = `\$\{dataScopeGeneration\}:\$\{document\?\.id \|\| 'missing'\}`/);
});

test('missing document uses the existing empty state and exposes no actions', () => {
  const screen = createRenderer(DocumentDetailScreen);
  const tree = screen.render(makeProps({ document: null }));
  assert.equal(nodes(tree, 'EmptyCard').length, 1);
  assert.equal(nodes(tree, 'EmptyCard')[0].props.title, 'Document not found');
  assert.equal(nodes(tree, 'TouchableOpacity').length, 0);
});

test('unanalyzed document retains its image, notes and analyze busy interaction', async () => {
  const pending = deferred();
  const calls = [];
  const props = makeProps({ document: makeDoc({ notes: 'Keep this note' }), analyzeDocument: (...args) => { calls.push(args); return pending.promise; } });
  const screen = createRenderer(DocumentDetailScreen);
  let tree = screen.render(props);
  assert.equal(nodes(tree, 'Image')[0].props.source.uri, 'file://doc-a.png');
  assert.match(textContent(tree), /Keep this note/);
  const button = buttonWithText(tree, 'Analyze Document');
  const operation = button.props.onPress();
  assert.deepEqual(calls, [['doc-a', 1]]);
  tree = screen.render(props);
  assert.equal(buttonWithStyle(tree, 'primaryBtn').props.disabled, true);
  pending.resolve();
  await operation;
  tree = screen.render(props);
  assert.equal(buttonWithText(tree, 'Analyze Document').props.disabled, false);
});

test('duplicate analysis presses for one document invoke the owner operation once', async () => {
  const pending = deferred();
  const calls = [];
  const props = makeProps({ analyzeDocument: (...args) => { calls.push(args); return pending.promise; } });
  const screen = createRenderer(DocumentDetailScreen);
  const analyze = buttonWithText(screen.render(props), 'Analyze Document').props.onPress;
  const first = analyze();
  const duplicate = analyze();
  assert.deepEqual(calls, [['doc-a', 1]]);
  pending.resolve();
  await Promise.all([first, duplicate]);
});

test('receipt analysis renders the existing ReceiptCard and actions; ordinary analysis does not', () => {
  const screen = createRenderer(DocumentDetailScreen);
  const ordinary = screen.render(makeProps({ document: makeDoc({ analysis: { summary: 'Summary A', actions: ['Call the store'] } }) }));
  assert.match(textContent(ordinary), /Summary A/);
  assert.match(textContent(ordinary), /Call the store/);
  assert.equal(nodes(ordinary, 'ReceiptCard').length, 0);

  const receipt = screen.render(makeProps({ document: makeDoc({ type: 'receipt', analysis: { summary: 'Receipt summary', receipt: { items: [] }, actions: [] } }) }));
  assert.match(textContent(receipt), /Receipt summary/);
  assert.equal(nodes(receipt, 'ReceiptCard').length, 1);
});

test('task creation requires analysis and passes the scoped document callback unchanged', () => {
  const calls = [];
  const doc = makeDoc({ analysis: { summary: 'Ready', actions: [] } });
  const props = makeProps({ document: doc, createTaskFromDocument: (...args) => calls.push(args) });
  const screen = createRenderer(DocumentDetailScreen);
  let tree = screen.render(props);
  buttonWithText(tree, 'Create Task').props.onPress();
  assert.deepEqual(calls, [[doc, undefined, 1]]);

  const unanalysed = screen.render(makeProps({ document: makeDoc(), createTaskFromDocument: (...args) => calls.push(args) }));
  assert.equal(buttonWithText(unanalysed, 'Create Task'), undefined);
  assert.equal(calls.length, 1);
});

test('delete confirmation retains existing cancel/delete behavior and is fenced after account change', () => {
  const calls = [];
  const propsA = makeProps({ deleteDocument: (...args) => calls.push(args) });
  const screen = createRenderer(DocumentDetailScreen);
  let tree = screen.render(propsA);
  buttonWithText(tree, 'Delete Document').props.onPress();
  const [, , buttons] = screen.alerts.at(-1);
  assert.equal(buttons[0].style, 'cancel');
  assert.deepEqual(calls, []);

  tree = screen.render(propsA);
  buttonWithText(tree, 'Delete Document').props.onPress();
  const confirm = screen.alerts.at(-1)[2][1].onPress;
  const propsB = { ...propsA, document: makeDoc({ id: 'doc-b', title: 'Account B' }), dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 };
  screen.render(propsB);
  confirm();
  assert.deepEqual(calls, []);
  buttonWithText(screen.render(propsB), 'Delete Document').props.onPress();
  screen.alerts.at(-1)[2][1].onPress();
  assert.deepEqual(calls, [['doc-b', 2]]);
});

test('A pending analysis busy state is hidden for B and its late completion cannot update B screen state', async () => {
  const pending = deferred();
  const calls = [];
  const propsA = makeProps({ analyzeDocument: (...args) => { calls.push(args); return pending.promise; } });
  const screen = createRenderer(DocumentDetailScreen);
  const operation = buttonWithText(screen.render(propsA), 'Analyze Document').props.onPress();
  assert.equal(buttonWithStyle(screen.render(propsA), 'primaryBtn').props.disabled, true);
  const propsB = { ...propsA, document: makeDoc({ id: 'doc-b', title: 'B document' }), dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 };
  let tree = screen.render(propsB);
  assert.equal(buttonWithText(tree, 'Analyze Document').props.disabled, false);
  const writesBeforeResolve = screen.stateWrites.length;
  pending.resolve();
  await operation;
  assert.equal(screen.stateWrites.length, writesBeforeResolve);
  tree = screen.render(propsB);
  assert.equal(buttonWithText(tree, 'Analyze Document').props.disabled, false);
  assert.deepEqual(calls, [['doc-a', 1]]);
});

test('A global analysis lock keeps B disabled until the owner releases the serialized operation', async () => {
  const pending = deferred();
  const calls = [];
  const screen = createRenderer(DocumentDetailScreen);
  const propsA = makeProps({ analyzeDocument: (...args) => { calls.push(args); return pending.promise; } });
  const operation = buttonWithText(screen.render(propsA), 'Analyze Document').props.onPress();
  const propsBLocked = {
    ...propsA,
    document: makeDoc({ id: 'doc-b', title: 'B document' }),
    dataScopeGeneration: 2,
    isCurrentDataScope: (generation) => generation === 2,
    isAnalysisInFlight: true,
  };
  let tree = screen.render(propsBLocked);
  assert.equal(buttonWithStyle(tree, 'primaryBtn').props.disabled, true);
  buttonWithStyle(tree, 'primaryBtn').props.onPress();
  assert.deepEqual(calls, [['doc-a', 1]]);

  pending.resolve();
  await operation;
  const propsBReady = { ...propsBLocked, isAnalysisInFlight: false };
  tree = screen.render(propsBReady);
  assert.equal(buttonWithText(tree, 'Analyze Document').props.disabled, false);
  buttonWithText(tree, 'Analyze Document').props.onPress();
  assert.deepEqual(calls, [['doc-a', 1], ['doc-b', 2]]);
});

test('App analysis, deletion and task owner adapters reject stale scope work', () => {
  assert.match(appSource, /const deleteDocument = \(id, expectedGeneration = dataScopeGenerationRef\.current\) => \{\s*if \(!isReadyDataScope\(expectedGeneration\)\) return \{ stale: true \};/);
  assert.match(appSource, /const updateDocument = \(id, updates, expectedGeneration = dataScopeGenerationRef\.current\)/);
  assert.match(appSource, /const analyzeDocument = async \(id, expectedGeneration = dataScopeGenerationRef\.current\)/);
  assert.match(appSource, /analyzeInFlightRef\.current \|\| isLoading/);
  assert.match(appSource, /setDocumentAnalysisInFlight\(true\)/);
  assert.match(appSource, /setDocumentAnalysisInFlight\(false\)/);
  assert.match(appSource, /isAnalysisInFlight=\{ctx\.documentAnalysisInFlight\}/);
  assert.match(appSource, /callSmartJson\(\{\s*image: base64Image,\s*\}, isCurrent\)/);
  assert.match(appSource, /const createTaskFromDocument = \(doc, action, expectedGeneration = dataScopeGenerationRef\.current\)/);
  assert.match(appSource, /markFeatureUsedForScope = async \(featureKey\)/);
  assert.match(appSource, /createScopeBoundSave\(requestScopeGeneration, \(\) => isCurrent\(\)/);
  assert.match(appSource, /refreshShoppingPlanItems\(merged\.items, requestScopeGeneration\)/);
  assert.match(appSource, /saveShoppingPlan\(\{ shopDate: shoppingPlan\.shopDate, remindAt: shoppingPlan\.remindAt, items, expectedGeneration \}\)/);
});
