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
const screenPath = path.join(root, 'OpportunitiesScreen.js');
const screenSource = fs.readFileSync(screenPath, 'utf8');
const receiptsSource = fs.readFileSync(path.join(root, 'receipts.js'), 'utf8');
const helpersSource = fs.readFileSync(path.join(root, 'helpers.js'), 'utf8');
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
      ActivityIndicator: 'ActivityIndicator', Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View',
    };
    if (request === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
    if (request === './helpers') return {
      makeSmartError: (kind) => Object.assign(new Error(kind), { kind }),
      smartErrorMessage: (_error, _lang, fallback) => fallback.en,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const OpportunitiesScreen = require('../OpportunitiesScreen').default;
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
const textContent = (node) => {
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return node && typeof node === 'object' ? textContent(node.props?.children) : '';
};
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
const makeProps = (overrides = {}) => {
  const s = new Proxy({}, { get: (_target, key) => key });
  const calls = [];
  const logs = [];
  return {
    s, c: { green: 'green', orange: 'orange', blue: 'blue', red: 'red' }, tx: (_tr, en) => en, lang: 'en',
    documents: [{ id: 'doc-a', title: 'A document', type: 'bill', analyzed: true, analysis: { summary: 'A summary' } }],
    dataScopeGeneration: 1, isCurrentDataScope: (generation) => generation === 1,
    requestOpportunities: (documents) => { calls.push(documents); return Promise.resolve({ opportunities: [] }); },
    logSmartError: (_label, error) => logs.push(error?.kind || 'unknown'),
    Screen: 'Screen', ScreenHeader: 'ScreenHeader', calls, logs, ...overrides,
  };
};
const createRenderer = (Component) => {
  const slots = [];
  const pendingEffects = [];
  const stateWrites = [];
  let cursor = 0;
  const renderer = {
    stateWrites,
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
      activeRuntime = renderer;
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
  return renderer;
};
const flushAsync = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test('Opportunities JSX and server request route preserve the prior layout and payload boundary', () => {
  assert.equal(digest(returnedJsx(findComponent(parse(screenSource), 'OpportunitiesScreenView'))), '2fafe7a9e04c7e8a045f2a59816e72bee6091cc3f6071bf6cbd7fbd3902b3af2');
  assert.match(appSource, /import OpportunitiesScreenView from ['"]\.\/OpportunitiesScreen['"]/);
  assert.doesNotMatch(screenSource, /useApp\(|from ['"]\.\/App['"]/);
  assert.doesNotMatch(receiptsSource, /OpportunitiesScreen|from ['"]\.\/App['"]/);
  assert.doesNotMatch(helpersSource, /OpportunitiesScreen|from ['"]\.\/App['"]/);
  assert.match(appSource, /case 'opportunities':[\s\S]{0,700}requestOpportunities=\{\(analyzedDocuments, isCurrent\) => callSmartJson\(\{ mode: 'opportunities', documents: analyzedDocuments \}, isCurrent\)\}/);
  assert.match(appSource, /case 'opportunities':[\s\S]{0,500}dataScopeGeneration=\{ctx\.dataScopeGeneration\} isCurrentDataScope=\{ctx\.isCurrentDataScope\}/);
});

test('normal response prepares only analyzed documents, ignores invalid items and retains the five-result cap', async () => {
  const first = deferred();
  const props = makeProps({ requestOpportunities: (docs) => { props.calls.push(docs); return first.promise; } });
  const screen = createRenderer(OpportunitiesScreen);
  screen.render(props);
  assert.equal(props.calls.length, 1);
  assert.deepEqual(props.calls[0], [{ id: 'doc-a', title: 'A document', type: 'bill', analyzed: true, analysis: { summary: 'A summary' } }]);
  first.resolve({ opportunities: [{ title: 'One' }, null, 4, { title: 'Two' }, { title: 'Three' }, { title: 'Four' }, { title: 'Five' }, { title: 'Six' }] });
  await flushAsync();
  const tree = screen.render(props);
  const text = textContent(tree);
  for (const title of ['One', 'Two', 'Three', 'Four', 'Five']) assert.match(text, new RegExp(title));
  assert.doesNotMatch(text, /Six/);
});

test('request adapter receives a live owner-scope predicate before provider dispatch', async () => {
  let activeGeneration = 1;
  let requestScope = null;
  const props = makeProps({
    isCurrentDataScope: (generation) => generation === activeGeneration,
    requestOpportunities: async (_docs, isCurrent) => {
      requestScope = isCurrent;
      return { opportunities: [] };
    },
  });
  const screen = createRenderer(OpportunitiesScreen);
  screen.render(props);
  await flushAsync();
  assert.equal(typeof requestScope, 'function');
  assert.equal(requestScope(), true);
  activeGeneration = 2;
  assert.equal(requestScope(), false);
});

test('empty documents, unanalyzed documents and empty response keep the existing empty states', async () => {
  const noDocs = makeProps({ documents: [] });
  const firstScreen = createRenderer(OpportunitiesScreen);
  assert.match(textContent(firstScreen.render(noDocs)), /No documents yet/);
  assert.equal(noDocs.calls.length, 0);

  const unanalyzed = makeProps({ documents: [{ id: 'raw', analysis: null }] });
  const secondScreen = createRenderer(OpportunitiesScreen);
  assert.match(textContent(secondScreen.render(unanalyzed)), /No opportunities found/);
  assert.equal(unanalyzed.calls.length, 0);

  const emptyResponse = deferred();
  const empty = makeProps({ requestOpportunities: () => emptyResponse.promise });
  const thirdScreen = createRenderer(OpportunitiesScreen);
  thirdScreen.render(empty);
  emptyResponse.resolve({});
  await flushAsync();
  assert.match(textContent(thirdScreen.render(empty)), /No opportunities found/);
});

test('duplicate renders do not duplicate an in-flight request; failure exposes the existing retry action', async () => {
  const pending = deferred();
  const props = makeProps({ requestOpportunities: (docs) => { props.calls.push(docs); return pending.promise; } });
  const screen = createRenderer(OpportunitiesScreen);
  screen.render(props);
  screen.render(props);
  assert.equal(props.calls.length, 1);
  pending.reject({ kind: 'server' });
  await flushAsync();
  const failed = screen.render(props);
  assert.match(textContent(failed), /could not be generated right now/i);
  assert.deepEqual(props.logs, ['server']);
  const retry = visit(failed, (node) => node.type === 'TouchableOpacity').find((node) => /Try Again/.test(textContent(node)));
  assert.ok(retry);
  retry.props.onPress();
  assert.equal(props.calls.length, 2);
});

test('null, array and malformed opportunity responses are rejected as format errors', async () => {
  for (const response of [null, [], { opportunities: { title: 'invalid' } }]) {
    const props = makeProps({ requestOpportunities: async () => response });
    const screen = createRenderer(OpportunitiesScreen);
    screen.render(props);
    await flushAsync();
    assert.deepEqual(props.logs, ['format']);
    assert.match(textContent(screen.render(props)), /could not be generated right now/i);
  }
});

test('late response after document change cannot overwrite the newer result', async () => {
  const a = deferred();
  const b = deferred();
  const props = makeProps({ requestOpportunities: (docs) => {
    props.calls.push(docs[0].id);
    return docs[0].id === 'doc-a' ? a.promise : b.promise;
  } });
  const screen = createRenderer(OpportunitiesScreen);
  screen.render(props);
  const changed = { ...props, documents: [{ id: 'doc-b', title: 'B document', type: 'bill', analyzed: true, analysis: { summary: 'B' } }] };
  screen.render(changed);
  assert.deepEqual(props.calls, ['doc-a', 'doc-b']);
  b.resolve({ opportunities: [{ title: 'B result' }] });
  await flushAsync();
  a.resolve({ opportunities: [{ title: 'Stale A result' }] });
  await flushAsync();
  const text = textContent(screen.render(changed));
  assert.match(text, /B result/);
  assert.doesNotMatch(text, /Stale A result/);
});

test('A to B account transition invalidates identical document payloads and uses the new scope request', async () => {
  const a = deferred();
  const b = deferred();
  let activeGeneration = 1;
  const documentsA = [{ id: 'same-doc', title: 'Same', type: 'bill', analyzed: true, analysis: { summary: 'same' } }];
  const documentsB = [{ ...documentsA[0] }];
  const props = makeProps({ documents: documentsA, isCurrentDataScope: (generation) => generation === activeGeneration,
    requestOpportunities: () => { props.calls.push(activeGeneration); return activeGeneration === 1 ? a.promise : b.promise; } });
  const screen = createRenderer(OpportunitiesScreen);
  screen.render(props);
  activeGeneration = 2;
  const accountB = { ...props, documents: documentsB, dataScopeGeneration: 2 };
  screen.render(accountB);
  assert.deepEqual(props.calls, [1, 2]);
  a.resolve({ opportunities: [{ title: 'Account A result' }] });
  await flushAsync();
  b.resolve({ opportunities: [{ title: 'Account B result' }] });
  await flushAsync();
  const text = textContent(screen.render(accountB));
  assert.match(text, /Account B result/);
  assert.doesNotMatch(text, /Account A result/);
});

test('previous account results are hidden immediately when the active scope changes', async () => {
  let activeGeneration = 1;
  const pendingB = deferred();
  const docs = [{ id: 'same-doc', title: 'Same', type: 'bill', analyzed: true, analysis: { summary: 'same' } }];
  const props = makeProps({ requestOpportunities: () => activeGeneration === 1
    ? Promise.resolve({ opportunities: [{ title: 'Private A result' }] })
    : pendingB.promise,
  });
  const screen = createRenderer(OpportunitiesScreen);
  screen.render(props);
  await flushAsync();
  const accountA = screen.render(props);
  assert.match(textContent(accountA), /Private A result/);

  activeGeneration = 2;
  const accountB = { ...props, documents: [{ ...docs[0] }], dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === activeGeneration };
  const firstAccountBRender = screen.render(accountB);
  assert.doesNotMatch(textContent(firstAccountBRender), /Private A result/);
  pendingB.resolve({ opportunities: [] });
  await flushAsync();
});

test('unmount invalidates a pending request before it can update state', async () => {
  const pending = deferred();
  const props = makeProps({ requestOpportunities: () => pending.promise });
  const screen = createRenderer(OpportunitiesScreen);
  screen.render(props);
  const writesBeforeUnmount = screen.stateWrites.length;
  screen.unmount();
  pending.resolve({ opportunities: [{ title: 'Too late' }] });
  await flushAsync();
  assert.equal(screen.stateWrites.length, writesBeforeUnmount);
});
