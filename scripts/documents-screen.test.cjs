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
const screenPath = path.join(root, 'DocumentsScreen.js');
const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
const screenSource = fs.readFileSync(screenPath, 'utf8');
const notificationSource = fs.readFileSync(path.join(root, 'NotificationsScreen.js'), 'utf8');
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
    if (request === 'react-native') return { Image: 'Image', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', View: 'View' };
    if (request === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
    if (request === './helpers') return { formatDate: (value) => value };
    if (request === './receipts') return {
      isReceiptDoc: (doc) => doc.kind === 'receipt',
      receiptStoreName: (receipt) => receipt.store,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const DocumentsModule = require('../DocumentsScreen');
require.extensions['.js'] = originalJsLoader;
Module._load = originalLoad;

const baseline = {
  // JSX hashes come from the pre-extraction screen; whitespace-only JSX and the new injected style/translation props are normalized.
  sourceSha: '6dab94823058d5f5a2c36b9ca4d219657643ec67',
  jsx: {
    DocumentCard: '9280e186ec44619b6f7a923ec0f4cd07bc82c1a812e549df02aa7a62b183a3e3',
    DocumentsScreen: 'bab9941ce59e00a23d94c6fdcc4c5bc722977d531ab0153a9ba7075abe86d7ee',
    searchExpression: 'a30791b49098370d3b23fb4c74d1a6516480d14ded20e01def4f0c579b49dbb1',
  },
};

const parse = (source) => parser.parse(source, { sourceType: 'unambiguous', plugins: ['jsx'] });
const clean = (value, stripDocumentInjectionProps = false) => {
  if (Array.isArray(value)) return value.map((item) => clean(item, stripDocumentInjectionProps)).filter((item) => item !== null);
  if (!value || typeof value !== 'object') return value;
  if (value.type === 'JSXText' && value.value.trim() === '') return null;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (['start', 'end', 'loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
    if (stripDocumentInjectionProps && key === 'attributes' && value.type === 'JSXOpeningElement' && value.name?.name === 'DocumentCard') {
      output[key] = child.filter((attribute) => !['s', 'c', 'tx', 'lang'].includes(attribute.name?.name)).map((attribute) => clean(attribute, stripDocumentInjectionProps));
    } else output[key] = clean(child, stripDocumentInjectionProps);
  }
  return output;
};
const digest = (node, stripDocumentInjectionProps = false) => createHash('sha256')
  .update(JSON.stringify(clean(node, stripDocumentInjectionProps))).digest('hex');
const findComponent = (ast, name) => {
  let found = null;
  function visit(node) {
    if (!node || typeof node !== 'object' || found) return;
    if (node.type === 'VariableDeclarator' && node.id?.name === name) found = node.init;
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) found = node;
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
const returnedExpression = (component) => component.body.body.find((node) => node.type === 'ReturnStatement')?.argument;

test('list and card JSX match the pre-extraction source structure, styles, copy, image URI and callbacks', () => {
  const ast = parse(screenSource);
  assert.equal(digest(returnedJsx(findComponent(ast, 'DocumentCard'))), baseline.jsx.DocumentCard);
  assert.equal(digest(returnedJsx(findComponent(ast, 'DocumentsScreen')), true), baseline.jsx.DocumentsScreen);
  assert.equal(baseline.sourceSha, '6dab94823058d5f5a2c36b9ca4d219657643ec67');
  assert.match(screenSource, /<DocumentCard key=\{doc\.id\} doc=\{doc\} s=\{s\} c=\{c\} tx=\{tx\} lang=\{lang\} onPress=\{\(\) => openDocument\(doc\.id\)\} \/>/);
});

test('document search preserves trim, Turkish case-folding, receipt item/store matching and empty-query identity', () => {
  const receipt = { kind: 'receipt', analysis: { receipt: { items: [{ name: 'Domates', raw_name: 'DOMATES ÜRÜNÜ' }], store: 'Şok Market' } } };
  const documents = [
    { id: 'notes', title: 'İŞ PLANI', notes: 'Kariyer hedefi' },
    { id: 'receipt', title: 'Receipt', notes: '', ...receipt },
    { id: 'other', title: 'Kimlik', notes: '' },
  ];
  assert.equal(DocumentsModule.filterDocuments(documents, '   '), documents);
  assert.deepEqual(DocumentsModule.filterDocuments(documents, ' kariyer '), [documents[0]]);
  assert.deepEqual(DocumentsModule.filterDocuments(documents, ' iş '), [documents[0]]);
  assert.deepEqual(DocumentsModule.filterDocuments(documents, 'domates ürünü'), [documents[1]]);
  assert.deepEqual(DocumentsModule.filterDocuments(documents, 'şok market'), [documents[1]]);
  assert.deepEqual(DocumentsModule.filterDocuments(documents, 'unmatched'), []);
});

test('search expression and screen composition match the prior behavior with only explicit data/UI injection', () => {
  const ast = parse(screenSource);
  const filter = findComponent(ast, 'filterDocuments');
  assert.equal(digest(returnedExpression(filter)), baseline.jsx.searchExpression);
  assert.match(appSource, /import DocumentsScreenView from '\.\/DocumentsScreen'/);
  assert.match(appSource, /case 'documents':[\s\S]*?return <DocumentsScreenView[\s\S]*?documents=\{documents\}[\s\S]*?openDocument=\{openDocument\}[\s\S]*?openAddSheet=\{openAddSheet\}[\s\S]*?\/>/);
  assert.doesNotMatch(screenSource, /useApp\(|supabase|analyzeDocument|deleteDocument|AsyncStorage|backup/);
});

test('source-level identity contract keeps Documents mounted across parent rerenders and retains search-state owner', () => {
  const appAst = parse(appSource);
  const programImports = appAst.program.body.filter((node) => node.type === 'ImportDeclaration');
  assert.ok(programImports.some((node) => node.source.value === './DocumentsScreen'
    && node.specifiers.some((specifier) => specifier.local.name === 'DocumentsScreenView')));
  assert.doesNotMatch(appSource, /const\s+DocumentsScreen\s*=|function\s+DocumentsScreen\s*\(/);

  const route = appSource.match(/case 'documents':\s*return\s*(<DocumentsScreenView[\s\S]*?\/>);/);
  assert.ok(route, 'documents route directly renders the module-level imported component');
  assert.match(route[1], /s=\{s\}/);
  assert.match(route[1], /c=\{c\}/);
  assert.match(route[1], /tx=\{tx\}/);
  assert.match(route[1], /lang=\{lang\}/);
  assert.match(route[1], /documents=\{documents\}/);
  assert.match(route[1], /openDocument=\{openDocument\}/);
  assert.match(route[1], /openAddSheet=\{openAddSheet\}/);
  assert.match(route[1], /Screen=\{Screen\}/);
  assert.match(route[1], /ScreenHeader=\{ScreenHeader\}/);
  assert.match(route[1], /EmptyCard=\{EmptyCard\}/);

  const screenAst = parse(screenSource);
  const screenComponent = findComponent(screenAst, 'DocumentsScreen');
  assert.match(JSON.stringify(screenComponent), /useState/);
  assert.match(screenSource, /<TextInput\s+value=\{query\}[\s\S]*?onChangeText=\{setQuery\}/);
});

test('the German notification copy is restored and push explanation remains byte-for-byte unchanged', () => {
  const original = 'Erinnerungen funktionieren nur in der Android- und iOS-App, nicht im Browser.';
  assert.ok(notificationSource.includes(original));
  assert.ok(notificationSource.includes('Reminders live on this device only; there are no server push notifications. Deleting the app removes them.'));
});
