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
const baseSha = '7b9a5dbfca4f2bab6b01ff8c7c99cb8e552e5198';
const appPath = path.join(root, 'App.js');
const screenPath = path.join(root, 'QrScreen.js');
const appSource = fs.readFileSync(appPath, 'utf8');
const screenSource = fs.readFileSync(screenPath, 'utf8');
const priorAppSource = execFileSync('git', ['show', `${baseSha}:App.js`], { cwd: root, encoding: 'utf8' });
let activeRuntime = null;
let platformOS = 'android';
const intervalCallbacks = new Map();
let nextIntervalId = 0;
global.setInterval = (callback) => { const id = ++nextIntervalId; intervalCallbacks.set(id, callback); return id; };
global.clearInterval = (id) => intervalCallbacks.delete(id);
const originalJsLoader = require.extensions['.js'];
const originalLoad = Module._load;
const ReactElements = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.length === 1 ? children[0] : children } }),
};
const NativeAlert = { alert: (...args) => activeRuntime?.alerts.push(args) };

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
      useMemo: (factory) => factory(),
      useRef: (...args) => activeRuntime.useRef(...args),
      useState: (...args) => activeRuntime.useState(...args),
    };
    if (request === 'react-native') return {
      ActivityIndicator: 'ActivityIndicator', Alert: NativeAlert, Modal: 'Modal',
      Platform: { get OS() { return platformOS; } }, Text: 'Text', TouchableOpacity: 'TouchableOpacity', View: 'View',
    };
    if (request === 'expo-camera') return {
      CameraView: 'CameraView', useCameraPermissions: () => [activeRuntime.permission, () => activeRuntime.requestPermission()],
    };
    if (request === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
    if (request === './qrcode') return { createQrMatrix: () => ({ ok: true, size: 1, matrix: [[true]] }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const QrScreen = require('../QrScreen').default;
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
  const services = {
    listDevices: async (uid) => { calls.push(['list', uid]); return { ok: true, devices: [] }; },
    upsertOwnDevice: async (input) => { calls.push(['upsert', input]); return { ok: true }; },
    removeDevice: async (uid, id) => { calls.push(['remove', uid, id]); return { ok: true }; },
    createPairingCode: async () => { calls.push(['create']); return { ok: true, code: 'ABCD1234', expiresAt: new Date(Date.now() + 300000).toISOString() }; },
    redeemPairingCode: async (input) => { calls.push(['redeem', input]); return { ok: true, paired: true }; },
  };
  return {
    s, c: { green: 'green', text: 'text', red: 'red' }, tx: (_tr, en) => en, lang: 'en',
    userId: 'account-a', dataScopeGeneration: 1, isCurrentDataScope: (generation) => generation === 1,
    setShowAuthModal: () => calls.push(['auth']), deviceId: 'device-local', deviceName: 'Phone',
    services, backupErrorText: (_tx, reason) => `Error: ${reason}`,
    Screen: 'Screen', ScreenHeader: 'ScreenHeader', EmptyCard: 'EmptyCard', calls, ...overrides,
  };
};
const createRenderer = (Component) => {
  const slots = [];
  const pendingEffects = [];
  const stateWrites = [];
  const alerts = [];
  let cursor = 0;
  const runtime = {
    stateWrites, alerts, permission: { granted: true }, requestPermission: async () => ({ granted: true }),
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
const findTextButton = (tree, text) => visit(tree, (node) => node.type === 'TouchableOpacity' && textContent(node).includes(text))[0];
const press = (tree, text) => {
  const target = findTextButton(tree, text);
  assert.ok(target, `button not found: ${text}`);
  return target.props.onPress();
};
const findCamera = (tree) => visit(tree, (node) => node.type === 'CameraView')[0];

test('QrScreen JSX is unchanged from the accepted source and imports as a stable component', () => {
  const before = findComponent(parse(priorAppSource), 'QrScreen');
  const after = findComponent(parse(screenSource), 'QrScreenView');
  assert.equal(digest(returnedJsx(before)), digest(returnedJsx(after)));
  assert.match(appSource, /import QrScreenView from ['"]\.\/QrScreen['"]/);
  assert.match(appSource, /case 'qr':[\s\S]{0,1200}<QrScreenView/);
  assert.doesNotMatch(screenSource, /useApp\(|from ['"]\.\/App['"]/);
  assert.doesNotMatch(screenSource, /session\.access_token|setSession|signIn|signOut/);
  assert.match(screenSource, /services\.redeemPairingCode\(\{ code: parsed\.code, deviceId, name: deviceName, platform: Platform\.OS \}\)/);
});

test('A device-list response cannot replace account B data after an A→B switch', async () => {
  const a = deferred();
  const b = deferred();
  const props = makeProps({ services: {
    ...makeProps().services,
    listDevices: (uid) => uid === 'account-a' ? a.promise : b.promise,
  } });
  const screen = createRenderer(QrScreen);
  screen.render(props);
  const bProps = { ...props, userId: 'account-b', dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 };
  await press(screen.render(bProps), 'Devices');
  b.resolve({ ok: true, devices: [{ device_id: 'b-device', name: 'Account B', platform: 'web' }] });
  await flushAsync();
  const stateBeforeA = screen.stateWrites.length;
  a.resolve({ ok: true, devices: [{ device_id: 'a-device', name: 'A', platform: 'ios' }] });
  await flushAsync();
  assert.equal(screen.stateWrites.length, stateBeforeA);
  assert.match(textContent(screen.render(bProps)), /B/);
  assert.doesNotMatch(textContent(screen.render(bProps)), /Account A/);
});

test('late pairing-code creation after account switch is discarded and B may create its own code', async () => {
  const a = deferred();
  const b = deferred();
  const base = makeProps();
  let createCount = 0;
  const props = { ...base, services: { ...base.services, createPairingCode: () => (++createCount === 1 ? a.promise : b.promise) } };
  const screen = createRenderer(QrScreen);
  let tree = screen.render(props);
  const requestA = press(tree, 'Create Code');
  const propsB = { ...props, userId: 'account-b', dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 };
  tree = screen.render(propsB);
  const requestB = press(tree, 'Create Code');
  b.resolve({ ok: true, code: 'BBBB2222', expiresAt: new Date(Date.now() + 300000).toISOString() });
  await requestB;
  a.resolve({ ok: true, code: 'AAAA1111', expiresAt: new Date(Date.now() + 300000).toISOString() });
  await requestA;
  tree = screen.render(propsB);
  assert.match(textContent(tree), /BBBB2222/);
  assert.doesNotMatch(textContent(tree), /AAAA1111/);
});

test('scan redemption is deduplicated, server input carries no session, and stale A response cannot alert or refresh B', async () => {
  const pending = deferred();
  const base = makeProps();
  let redemptionInput;
  let listCalls = 0;
  const props = { ...base, services: {
    ...base.services,
    listDevices: async () => { listCalls++; return { ok: true, devices: [] }; },
    redeemPairingCode: (input) => { redemptionInput = input; return pending.promise; },
  } };
  const screen = createRenderer(QrScreen);
  let tree = screen.render(props);
  await flushAsync();
  await press(tree, 'Devices');
  tree = screen.render(props);
  await press(tree, 'Scan QR and Add This Device');
  tree = screen.render(props);
  const camera = findCamera(tree);
  assert.ok(camera);
  const scanA = camera.props.onBarcodeScanned({ data: 'BAKPLANLA:PAIR:ABCD1234' });
  await flushAsync();
  await camera.props.onBarcodeScanned({ data: 'BAKPLANLA:PAIR:ABCD1234' });
  assert.deepEqual(redemptionInput, { code: 'ABCD1234', deviceId: 'device-local', name: 'Phone', platform: 'android' });
  const oldListCalls = listCalls;
  const propsB = { ...props, userId: 'account-b', dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 };
  screen.render(propsB);
  pending.resolve({ ok: true, paired: true });
  await scanA;
  assert.equal(screen.alerts.length, 0);
  assert.equal(listCalls, oldListCalls + 1);
});

test('a failed redemption closes the scanner, shows the existing error and permits a later retry', async () => {
  const base = makeProps();
  const inputs = [];
  const props = { ...base, services: { ...base.services, redeemPairingCode: async (input) => { inputs.push(input); return { ok: false, reason: 'network' }; } } };
  const screen = createRenderer(QrScreen);
  let tree = screen.render(props);
  await press(tree, 'Devices');
  tree = screen.render(props);
  await press(tree, 'Scan QR and Add This Device');
  tree = screen.render(props);
  let camera = findCamera(tree);
  await camera.props.onBarcodeScanned({ data: 'BAKPLANLA:PAIR:ABCD1234' });
  assert.match(String(screen.alerts.at(-1)?.[1]), /Error: network/);
  assert.equal(visit(screen.render(props), (node) => node.type === 'Modal')[0].props.visible, false);
  tree = screen.render(props);
  await press(tree, 'Scan QR and Add This Device');
  camera = findCamera(screen.render(props));
  await camera.props.onBarcodeScanned({ data: 'BAKPLANLA:PAIR:ABCD1234' });
  assert.equal(inputs.length, 2);
});

test('camera permission denial and account change during permission request never open the scanner', async () => {
  const denied = makeProps();
  const deniedScreen = createRenderer(QrScreen);
  let tree = deniedScreen.render(denied);
  await press(tree, 'Devices');
  tree = deniedScreen.render(denied);
  deniedScreen.permission = { granted: false };
  deniedScreen.requestPermission = async () => ({ granted: false });
  tree = deniedScreen.render(denied);
  await press(tree, 'Scan QR and Add This Device');
  assert.equal(visit(deniedScreen.render(denied), (node) => node.type === 'Modal')[0].props.visible, false);
  assert.match(String(deniedScreen.alerts.at(-1)?.[1]), /Camera permission/);

  const gate = deferred();
  const switching = createRenderer(QrScreen);
  switching.permission = { granted: false };
  switching.requestPermission = () => gate.promise;
  tree = switching.render(makeProps());
  await press(tree, 'Devices');
  tree = switching.render(makeProps());
  const request = press(tree, 'Scan QR and Add This Device');
  switching.render({ ...makeProps(), userId: 'account-b', dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 });
  gate.resolve({ granted: true });
  await request;
  assert.equal(visit(switching.render({ ...makeProps(), userId: 'account-b', dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 }), (node) => node.type === 'Modal')[0].props.visible, false);
  assert.equal(switching.alerts.length, 0);
});

test('web scanning preserves its existing unavailable message without requesting camera permission', async () => {
  platformOS = 'web';
  try {
    const props = makeProps();
    const screen = createRenderer(QrScreen);
    let tree = screen.render(props);
    await press(tree, 'Devices');
    tree = screen.render(props);
    await press(tree, 'Scan QR and Add This Device');
    assert.equal(screen.alerts.length, 1);
    assert.match(String(screen.alerts[0][1]), /only works in the phone app/);
    assert.equal(visit(screen.render(props), (node) => node.type === 'CameraView').length, 0);
  } finally { platformOS = 'android'; }
});

test('failed pairing and device-list responses retain localized error behavior; stale confirmed unlink does nothing', async () => {
  const base = makeProps();
  const listA = deferred();
  const listB = deferred();
  const props = { ...base, services: {
    ...base.services,
    listDevices: (uid) => uid === 'account-a' ? listA.promise : listB.promise,
    createPairingCode: async () => ({ ok: false, reason: 'network' }),
  } };
  const screen = createRenderer(QrScreen);
  let tree = screen.render(props);
  await press(tree, 'Create Code');
  tree = screen.render(props);
  assert.match(textContent(tree), /Error: network/);
  const propsB = { ...props, userId: 'account-b', dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 };
  await press(screen.render(propsB), 'Devices');
  listB.resolve({ ok: true, devices: [] });
  screen.render(propsB);
  await flushAsync();
  const writesBeforeA = screen.stateWrites.length;
  listA.resolve({ ok: false, reason: 'network' });
  await flushAsync();
  assert.equal(screen.stateWrites.length, writesBeforeA);
  assert.doesNotMatch(textContent(screen.render(propsB)), /Error: network/);

  const removeCalls = [];
  const deviceProps = makeProps({ services: { ...base.services, listDevices: async () => ({ ok: true, devices: [{ device_id: 'other', name: 'Other', platform: 'ios', last_seen_at: null }] }), removeDevice: async (...args) => { removeCalls.push(args); return { ok: true }; } } });
  const deviceScreen = createRenderer(QrScreen);
  tree = deviceScreen.render(deviceProps);
  await flushAsync();
  await press(tree, 'Devices');
  tree = deviceScreen.render(deviceProps);
  const row = findTextButton(tree, 'Remove');
  assert.ok(row);
  row.props.onPress();
  const confirm = deviceScreen.alerts.at(-1)[2].find((button) => button.text === 'Remove');
  const changed = { ...deviceProps, userId: 'account-b', dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 };
  deviceScreen.render(changed);
  await confirm.onPress();
  assert.deepEqual(removeCalls, []);
});

test('an unlink already sent for A cannot update the device list after switching to B', async () => {
  const removal = deferred();
  const base = makeProps();
  let listCalls = 0;
  const removeCalls = [];
  const props = makeProps({ services: {
    ...base.services,
    listDevices: async () => { listCalls++; return { ok: true, devices: [{ device_id: 'other', name: 'Other phone', platform: 'ios', last_seen_at: null }] }; },
    removeDevice: (uid, id) => { removeCalls.push([uid, id]); return removal.promise; },
  } });
  const screen = createRenderer(QrScreen);
  let tree = screen.render(props);
  await flushAsync();
  await press(tree, 'Devices');
  tree = screen.render(props);
  const row = findTextButton(tree, 'Remove');
  row.props.onPress();
  const confirm = screen.alerts.at(-1)[2].find((button) => button.text === 'Remove');
  const requestA = confirm.onPress();
  assert.deepEqual(removeCalls, [['account-a', 'other']]);
  const propsB = { ...props, userId: 'account-b', dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2 };
  screen.render(propsB);
  await flushAsync();
  const writesAfterSwitch = screen.stateWrites.length;
  const listCallsAfterSwitch = listCalls;
  removal.resolve({ ok: true });
  await requestA;
  await flushAsync();
  assert.equal(screen.stateWrites.length, writesAfterSwitch);
  assert.equal(listCalls, listCallsAfterSwitch);
});

test('unmount discards deferred list and pairing responses without post-unmount state writes', async () => {
  const list = deferred();
  const code = deferred();
  const base = makeProps();
  const props = { ...base, services: { ...base.services, listDevices: () => list.promise, createPairingCode: () => code.promise } };
  const screen = createRenderer(QrScreen);
  const tree = screen.render(props);
  const request = press(tree, 'Create Code');
  const writesBeforeUnmount = screen.stateWrites.length;
  screen.unmount();
  list.resolve({ ok: true, devices: [{ device_id: 'late', name: 'Late', platform: 'web' }] });
  code.resolve({ ok: true, code: 'LATE1234', expiresAt: new Date(Date.now() + 300000).toISOString() });
  await request;
  await flushAsync();
  assert.equal(screen.stateWrites.length, writesBeforeUnmount);
});

test('pairing countdown expires the visible code and cleans up its timer on unmount', async () => {
  intervalCallbacks.clear();
  const props = makeProps();
  const screen = createRenderer(QrScreen);
  let tree = screen.render(props);
  await press(tree, 'Create Code');
  tree = screen.render(props);
  const timer = [...intervalCallbacks.values()].at(-1);
  assert.equal(typeof timer, 'function');
  timer();
  assert.match(textContent(screen.render(props)), /expires in/);
  const expiresProps = { ...props, services: { ...props.services, createPairingCode: async () => ({ ok: true, code: 'ABCD1234', expiresAt: new Date(Date.now() - 5000).toISOString() }) } };
  await press(screen.render(expiresProps), 'Create New Code');
  screen.render(expiresProps);
  tree = screen.render(expiresProps);
  assert.match(textContent(tree), /code expired\. You can create a new one/i);
  screen.unmount();
  assert.equal(intervalCallbacks.size, 0);
});
