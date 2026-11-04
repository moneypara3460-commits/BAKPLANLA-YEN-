const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
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
const baseSha = 'ffed4abfd974ea83aacd821fd9febaa7440c659f';
const appPath = path.join(root, 'App.js');
const screenPath = path.join(root, 'AiScreen.js');
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
      Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', View: 'View',
    };
    if (request === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
    if (request === './helpers') return {
      dateLocaleFor: (lang) => lang === 'en' ? 'en-GB' : 'tr-TR',
      smartErrorMessage: (_error, _lang, fallback) => fallback.en,
      toISO: (date) => date.toISOString().slice(0, 10),
    };
    if (request === './receipts') return {
      docForAi: (doc) => doc,
      fitDocsForAi: (docs) => docs,
      isShoppingQuestion: (question) => /shopping|receipt/i.test(question),
      receiptDocsOf: (docs) => docs.filter((doc) => doc.type === 'receipt'),
      shoppingContextForAi: (items, docs) => ({ items, receiptCount: docs.filter((doc) => doc.type === 'receipt').length }),
    };
    if (request === './shoppingPlan') return {
      formatRemindAt: (value) => value || '', formatShopDate: (value) => value || '',
    };
    if (request === './notifications') return { openSystemSettings: () => activeRuntime?.calls.push(['settings']) };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const AiScreen = require('../AiScreen').default;
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
const sourceStrings = (component) => {
  const values = new Set();
  function visitStrings(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'StringLiteral' && node.value.length > 20 && !/^[A-Z0-9_]+$/.test(node.value)) values.add(node.value);
    if (node.type === 'TemplateLiteral') for (const item of node.quasis) if ((item.value.cooked || '').length > 20) values.add(item.value.cooked);
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visitStrings); else if (value && typeof value === 'object') visitStrings(value);
  }
  visitStrings(component);
  return values;
};
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
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flushAsync = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const makeProps = (overrides = {}) => {
  const s = new Proxy({}, { get: (_target, key) => key });
  const calls = [];
  const docs = [
    { id: 'document-a', title: 'Warranty', type: 'document', analyzed: true, analysis: { summary: 'Receipt warranty' } },
    { id: 'receipt-a', title: 'Market receipt', type: 'receipt', analysis: { receipt: { items: [{ name: 'Milk' }] } } },
  ];
  return {
    s, c: { green: 'green' }, tx: (_tr, en) => en, lang: 'en', documents: docs,
    userId: 'account-a', dataScopeGeneration: 1, isCurrentDataScope: (generation) => generation === 1,
    readShoppingList: async () => JSON.stringify({ items: [{ name: 'Milk', checked: false }] }),
    requestChat: async (_body) => ({ answer: 'AI answer' }),
    createAiReminder: async () => ({ ok: true, at: new Date('2026-11-02T18:30:00Z'), notif: { ok: true } }),
    saveShoppingPlan: async ({ shopDate, remindAt }) => ({ ok: true, plan: { shopDate, remindAt, items: [] } }),
    logSmartError: (_label, error) => calls.push(['error', error.kind]),
    Screen: 'Screen', ScreenHeader: 'ScreenHeader', calls,
    ...overrides,
  };
};
const createRenderer = (Component) => {
  const slots = [];
  const pendingEffects = [];
  const stateWrites = [];
  const alerts = [];
  const calls = [];
  let cursor = 0;
  const runtime = {
    stateWrites, alerts, calls,
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
const questionInput = (tree) => visit(tree, (node) => node.type === 'TextInput')[0];
const send = (tree) => visit(tree, (node) => node.type === 'TouchableOpacity')[0]?.props.onPress();
const askQuestion = async (screen, props, question) => {
  let tree = screen.render(props);
  questionInput(tree).props.onChangeText(question);
  tree = screen.render(props);
  return send(tree);
};

test('AiScreen JSX is unchanged from the accepted source and the imported module receives explicit adapters', () => {
  const before = findComponent(parse(priorAppSource), 'AiScreen');
  const after = findComponent(parse(screenSource), 'AiScreenView');
  assert.equal(digest(returnedJsx(before)), digest(returnedJsx(after)));
  const afterStrings = sourceStrings(after);
  for (const text of sourceStrings(before)) assert.ok(afterStrings.has(text), `missing original screen copy: ${text}`);
  assert.match(screenSource, /requestChat\(/);
  assert.doesNotMatch(screenSource, /useApp\(|from ['"]\.\/App['"]/);
  assert.doesNotMatch(screenSource, /Authorization|access_token|grant_ai_consent|consume_feature_trial/);
  assert.match(appSource, /requestChat=\{\(body, isCurrent\) => callSmartJson\(body, isCurrent\)\}/);
  assert.match(appSource, /dataScopeGeneration=\{ctx\.dataScopeGeneration\} isCurrentDataScope=\{ctx\.isCurrentDataScope\}/);
  assert.match(appSource, /saveShoppingPlan = async \(\{ shopDate, remindAt, items, expectedGeneration \} = \{\}\)/);
  assert.match(appSource, /if \(!isExpectedScope\(\)\) return \{ ok: false, reason: 'stale' \};/);
  assert.match(appSource, /createScopeBoundSave\(expectedGeneration/);
});

test('the prior AiScreen had no account-generation checks after awaited context/provider work', () => {
  const prior = findComponent(parse(priorAppSource), 'AiScreen');
  const priorFlow = priorAppSource.slice(prior.start, prior.end);
  assert.doesNotMatch(priorFlow, /dataScopeGeneration|isCurrentDataScope/);
  assert.match(priorFlow, /await AsyncStorage\.getItem\('PLAN_SHOPPING_LIST_V1'\)/);
  assert.match(priorFlow, /await callSmartJson\(/);
  assert.match(priorFlow, /await saveShoppingPlan\(/);
  assert.match(priorFlow, /await handleReminder\(/);
});

test('chat request keeps the existing document, receipt and shopping-context payload', async () => {
  const base = makeProps();
  let body;
  const props = { ...base, requestChat: async (value) => { body = value; return { answer: 'Saved answer' }; } };
  const screen = createRenderer(AiScreen);
  const pending = askQuestion(screen, props, 'What about my receipt shopping?');
  await pending;
  assert.equal(body.mode, 'chat');
  assert.equal(body.question, 'What about my receipt shopping?');
  assert.equal(body.documents.length, 2);
  assert.equal(body.shopping.items[0].name, 'Milk');
  assert.equal(body.shopping.receiptCount, 1);
  assert.match(textContent(screen.render(props)), /Saved answer/);
});

test('A shopping-list read completed after A→B does not dispatch a chat request or leak A messages', async () => {
  const read = deferred();
  const base = makeProps({ readShoppingList: () => read.promise });
  const requestCalls = [];
  const props = { ...base, requestChat: async (body) => { requestCalls.push(body); return { answer: 'A response' }; } };
  const screen = createRenderer(AiScreen);
  const pending = askQuestion(screen, props, 'A private question');
  await flushAsync();
  const propsB = { ...props, userId: 'account-b', dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 };
  assert.doesNotMatch(textContent(screen.render(propsB)), /A private question/);
  read.resolve(JSON.stringify({ items: [{ name: 'A list item' }] }));
  await pending;
  assert.equal(requestCalls.length, 0);
  assert.deepEqual(requestCalls, []);
  assert.deepEqual(screen.stateWrites.filter((write) => write.value?.value?.some?.((message) => message.text === 'A response')), []);
  assert.doesNotMatch(textContent(screen.render(propsB)), /A private question|A response/);
});

test('provider responses from A after switching to B cannot update messages or dispatch plan/reminder mutations', async () => {
  const response = deferred();
  const base = makeProps({ requestChat: () => response.promise });
  const planCalls = [];
  const reminderCalls = [];
  const props = { ...base,
    saveShoppingPlan: async (input) => { planCalls.push(input); return { ok: true, plan: { shopDate: input.shopDate, remindAt: input.remindAt, items: [] } }; },
    createAiReminder: async (...args) => { reminderCalls.push(args); return { ok: true, notif: { ok: true }, at: new Date() }; },
  };
  const screen = createRenderer(AiScreen);
  const pending = askQuestion(screen, props, 'Plan my shopping');
  await flushAsync();
  const propsB = { ...props, userId: 'account-b', dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 };
  screen.render(propsB);
  response.resolve({ answer: 'A private answer', shopping_plan: { shop_date: '2026-11-05', remind_at: null }, reminder: { title: 'A reminder' } });
  await pending;
  assert.deepEqual(planCalls, []);
  assert.deepEqual(reminderCalls, []);
  assert.doesNotMatch(textContent(screen.render(propsB)), /A private question|A private answer/);
});

test('B can start its own request while A is pending; A late completion cannot append to B history', async () => {
  const a = deferred();
  const b = deferred();
  const base = makeProps({ requestChat: (body) => body.question.startsWith('A') ? a.promise : b.promise });
  const saveCalls = [];
  const props = { ...base, saveShoppingPlan: async (value) => { saveCalls.push(value); return { ok: true, plan: { shopDate: value.shopDate, remindAt: value.remindAt, items: [] } }; } };
  const screen = createRenderer(AiScreen);
  const pendingA = askQuestion(screen, props, 'A private question');
  await flushAsync();
  const propsB = { ...props, userId: 'account-b', dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 };
  const pendingB = askQuestion(screen, propsB, 'B question');
  await flushAsync();
  b.resolve({ answer: 'B answer' });
  await pendingB;
  a.resolve({ answer: 'A answer', shopping_plan: { shop_date: '2026-11-05' } });
  await pendingA;
  assert.deepEqual(saveCalls, []);
  const text = textContent(screen.render(propsB));
  assert.match(text, /B answer/);
  assert.doesNotMatch(text, /A private question|A answer/);
});

test('response-side shopping-plan action is scope-tagged and its completion cannot update B UI', async () => {
  const save = deferred();
  const base = makeProps({ requestChat: async () => ({ answer: 'Plan response', shopping_plan: { shop_date: '2026-11-05' } }), saveShoppingPlan: () => save.promise });
  const screen = createRenderer(AiScreen);
  const pending = askQuestion(screen, base, 'Plan shopping');
  await flushAsync();
  assert.equal(screen.stateWrites.some((write) => write.value?.scopeKey === '1:account-a' && write.value?.value?.some?.((message) => /Plan response/.test(message.text))), true);
  const propsB = { ...base, userId: 'account-b', dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 };
  screen.render(propsB);
  save.resolve({ ok: true, plan: { shopDate: '2026-11-05', remindAt: null, items: [] } });
  await pending;
  assert.doesNotMatch(textContent(screen.render(propsB)), /Plan response|plan saved/i);
});

test('reminder side effect is awaited only for the active scope and a late response is discarded', async () => {
  const reminder = deferred();
  const calls = [];
  const base = makeProps({ requestChat: async () => ({ answer: 'Reminder response', reminder: { title: 'Study', at: '2026-11-02T18:30:00Z' } }), createAiReminder: (...args) => { calls.push(args); return reminder.promise; } });
  const screen = createRenderer(AiScreen);
  const pending = askQuestion(screen, base, 'Set a reminder');
  await flushAsync();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 1);
  const propsB = { ...base, userId: 'account-b', dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 };
  screen.render(propsB);
  reminder.resolve({ ok: true, at: new Date(), notif: { ok: true } });
  await pending;
  assert.doesNotMatch(textContent(screen.render(propsB)), /Reminder response|Reminder set/);
});

test('duplicate request is suppressed, storage failure falls back, and provider errors remain visible', async () => {
  const response = deferred();
  const base = makeProps({ readShoppingList: async () => { throw new Error('storage unavailable'); }, requestChat: () => response.promise });
  const screen = createRenderer(AiScreen);
  const pending = askQuestion(screen, base, 'A question');
  await flushAsync();
  const tree = screen.render(base);
  const duplicate = send(tree);
  assert.equal(await duplicate, undefined);
  response.reject(Object.assign(new Error('offline'), { kind: 'network' }));
  await pending;
  assert.deepEqual(base.calls, [['error', 'network']]);
  assert.match(textContent(screen.render(base)), /could not connect/i);
});

test('unmount during a provider response suppresses answer and post-response mutations', async () => {
  const response = deferred();
  const planCalls = [];
  const base = makeProps({ requestChat: () => response.promise, saveShoppingPlan: async (value) => { planCalls.push(value); return { ok: true }; } });
  const screen = createRenderer(AiScreen);
  const pending = askQuestion(screen, base, 'Plan shopping');
  await flushAsync();
  const beforeUnmount = screen.stateWrites.length;
  screen.unmount();
  response.resolve({ answer: 'Late answer', shopping_plan: { shop_date: '2026-11-05' } });
  await pending;
  assert.equal(screen.stateWrites.length, beforeUnmount);
  assert.deepEqual(planCalls, []);
});
