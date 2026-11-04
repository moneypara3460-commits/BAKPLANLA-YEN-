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
const screenPath = path.join(root, 'TodayScreen.js');
const screenSource = fs.readFileSync(screenPath, 'utf8');
const helpersSource = fs.readFileSync(path.join(root, 'helpers.js'), 'utf8');
const arabicSource = fs.readFileSync(path.join(root, 'arabic.js'), 'utf8');
const partnerSource = fs.readFileSync(path.join(root, 'isletmeTanitim.js'), 'utf8');
const placesSource = fs.readFileSync(path.join(root, 'places.js'), 'utf8');
let activeRuntime = null;
let nextId = 0;
let partners = [];
let locationCalls = [];
let locationImpl = {
  permission: async () => ({ status: 'denied' }),
  lastKnown: async () => null,
  current: async () => null,
};
const originalJsLoader = require.extensions['.js'];
const originalLoad = Module._load;
const ReactElements = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.length === 1 ? children[0] : children } }),
};
const NativeAlert = { alert: (...args) => activeRuntime?.alerts.push(args) };
const NativeLinking = { openURL: (url) => { activeRuntime?.urls.push(url); return Promise.resolve(); } };
const Location = {
  Accuracy: { Balanced: 'balanced' },
  requestForegroundPermissionsAsync: (...args) => { locationCalls.push(['permission', ...args]); return locationImpl.permission(...args); },
  getLastKnownPositionAsync: (...args) => { locationCalls.push(['last-known', ...args]); return locationImpl.lastKnown(...args); },
  getCurrentPositionAsync: (...args) => { locationCalls.push(['current', ...args]); return locationImpl.current(...args); },
};
const activityOptions = [
  { key: 'restaurant', tr: 'Restoran', en: 'Restaurant', de: 'Restaurant', icon: '🍽️' },
  { key: 'cafe', tr: 'Kafe', en: 'Cafe', de: 'Café', icon: '☕' },
  { key: 'cinema', tr: 'Sinema', en: 'Cinema', de: 'Kino', icon: '🎬' },
  { key: 'event', tr: 'Etkinlik', en: 'Event', de: 'Event', icon: '🎟️' },
  { key: 'nightlife', tr: 'Gece Hayatı', en: 'Nightlife', de: 'Nachtleben', icon: '🌃' },
  { key: 'activity', tr: 'Aktivite', en: 'Activity', de: 'Aktivität', icon: '🎯' },
  { key: 'shopping', tr: 'Alışveriş', en: 'Shopping', de: 'Shopping', icon: '🛍️' },
  { key: 'outdoor', tr: 'Açık Hava', en: 'Outdoor', de: 'Outdoor', icon: '🌳' },
];

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
      ActivityIndicator: 'ActivityIndicator', Alert: NativeAlert, Linking: NativeLinking,
      Switch: 'Switch', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', View: 'View',
    };
    if (request === 'expo-location') return Location;
    if (request === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
    if (request === './helpers') return {
      ACTIVITY_OPTIONS: activityOptions,
      PEOPLE_OPTIONS: ['1', '2', '3', '4', '5+'],
      WITH_WHO_OPTIONS: [
        { key: 'alone', tr: 'Yalnız', en: 'Alone', de: 'Allein', icon: '🧍' },
        { key: 'partner', tr: 'Sevgilimle', en: 'Partner', de: 'Partner', icon: '❤️' },
        { key: 'friends', tr: 'Arkadaşlarla', en: 'Friends', de: 'Freunde', icon: '👥' },
        { key: 'family', tr: 'Aileyle', en: 'Family', de: 'Familie', icon: '👨‍👩‍👧‍👦' },
      ],
      TRANSPORT_OPTIONS: [
        { key: 'walk', tr: 'Yürüyerek', en: 'Walking', de: 'Zu Fuß', icon: '🚶' },
        { key: 'car', tr: 'Arabayla', en: 'Car', de: 'Auto', icon: '🚗' },
        { key: 'public', tr: 'Toplu Taşıma', en: 'Public transport', de: 'ÖPNV', icon: '🚌' },
        { key: 'taxi', tr: 'Taksi', en: 'Taxi', de: 'Taxi', icon: '🚕' },
      ],
      createId: (prefix) => `${prefix}-${++nextId}`,
      makeSmartError: (kind) => Object.assign(new Error(kind), { kind }),
      smartErrorMessage: (_error, lang, fallback) => fallback[lang] || fallback.en,
    };
    if (request === './arabic') return {
      pickByLang: (obj, lang) => obj?.[lang] || obj?.tr || '',
    };
    if (request === './isletmeTanitim') return {
      validIsletmeler: () => partners,
      isletmeText: (value, lang) => typeof value === 'string' ? value : value?.[lang] || value?.tr || '',
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const TodayScreen = require('../TodayScreen').default;
require.extensions['.js'] = originalJsLoader;
Module._load = originalLoad;

const parse = (source) => parser.parse(source, { sourceType: 'unambiguous', plugins: ['jsx'] });
const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean).filter((item) => item !== null);
  if (!value || typeof value !== 'object') return value;
  if (value.type === 'JSXExpressionContainer' && value.expression?.type === 'JSXEmptyExpression') return null;
  if (value.type === 'JSXText' && !value.value.trim()) return null;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (['start', 'end', 'loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
    const cleaned = clean(child);
    output[key] = key === 'name' && typeof cleaned === 'string'
      ? ({ setStoredResults: 'setResults', setStoredPartners: 'setPartners', setStoredProviderNotice: 'setProviderNotice' }[cleaned] || cleaned)
      : cleaned;
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
const flushAsync = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const defaultPreferences = () => ({ location: 'Kadıköy', budget: '600', peopleCount: '2', withWho: 'friends', activityType: 'cafe', activityTypes: ['cafe'], transport: 'walk' });
const makeProps = (overrides = {}) => {
  const s = new Proxy({}, { get: (_target, key) => key });
  const c = { green: 'green', gold: 'gold', text: 'text' };
  const calls = [];
  const alerts = [];
  const urls = [];
  return {
    s, c, tx: (_tr, en) => en, lang: 'en', todayPreferences: defaultPreferences(),
    setTodayPreferences: (update) => { calls.push(['preferences', update]); },
    dataScopeGeneration: 1, isCurrentDataScope: (generation) => generation === 1,
    requestPlaces: (params) => { calls.push(['places', params]); return Promise.resolve({ places: [] }); },
    openLegal: (url) => calls.push(['legal', url]), logSmartError: (_label, error) => calls.push(['error', error.kind]),
    Chip: 'Chip', Screen: 'Screen', ScreenHeader: 'ScreenHeader', calls, alerts, urls,
    ...overrides,
  };
};
const createRenderer = (Component) => {
  const slots = [];
  const pendingEffects = [];
  const stateWrites = [];
  const alerts = [];
  const urls = [];
  let cursor = 0;
  const runtime = {
    stateWrites, alerts, urls,
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
const findButton = (tree, text) => visit(tree, (node) => node.type === 'TouchableOpacity').find((node) => textContent(node).includes(text));
const resetProviders = () => {
  partners = [];
  locationCalls = [];
  locationImpl = { permission: async () => ({ status: 'denied' }), lastKnown: async () => null, current: async () => null };
  nextId = 0;
};

test('Today JSX, stable imported route and exact Places request boundary are preserved', () => {
  assert.equal(digest(returnedJsx(findComponent(parse(screenSource), 'TodayScreenView'))), '58602f38daf2adb1135746cf53ced051852f908076cae5051dd619e1faa6062c');
  assert.match(appSource, /import TodayScreenView from ['"]\.\/TodayScreen['"]/);
  assert.doesNotMatch(screenSource, /useApp\(|from ['"]\.\/App['"]/);
  assert.match(appSource, /case 'today':[\s\S]{0,650}requestPlaces=\{\(params, isCurrent\) => callSmartJson\(\{ mode: 'places', \.\.\.params \}, isCurrent\)\}/);
  assert.match(appSource, /case 'today':[\s\S]{0,500}dataScopeGeneration=\{ctx\.dataScopeGeneration\} isCurrentDataScope=\{ctx\.isCurrentDataScope\}/);
  for (const source of [helpersSource, arabicSource, partnerSource, placesSource]) assert.doesNotMatch(source, /TodayScreen|from ['"]\.\/App['"]/);
});

test('permission and provider parameters, partner matching, ordering, stale fallback and directions remain intact', async () => {
  resetProviders();
  partners = [{ id: 'partner-1', ad: 'Partner Cafe', sektor: { tr: 'Kafe' }, sehir: 'Kadıköy / Istanbul', adres: 'Pier 1', indirim: { baslik: { en: 'Partner discount' }, saat: '10-12' } }];
  locationImpl = {
    permission: async () => ({ status: 'granted' }),
    lastKnown: async () => null,
    current: async () => ({ coords: { latitude: 41.0, longitude: 29.0 } }),
  };
  let requestArgs;
  const props = makeProps({ todayPreferences: { ...defaultPreferences(), activityTypes: ['cafe', 'restaurant'] }, requestPlaces: async (args) => {
    requestArgs = args;
    return { stale: true, center: { lat: 41, lng: 29 }, places: [
      { id: 'far', name: 'Far Cafe', category: 'cafe', latitude: 41.03, longitude: 29.0, address: 'Far street' },
      { id: 'near', name: 'Near Cafe', category: 'cafe', latitude: 41.001, longitude: 29.0, address: 'Near street' },
      { id: 'partner-copy', name: 'Partner Cafe Kadıköy', category: 'cafe', latitude: 41.002, longitude: 29.0 },
      { id: 'over', name: 'Over Budget Restaurant', category: 'restaurant', latitude: 41.002, longitude: 29.0 },
    ] };
  } });
  const screen = createRenderer(TodayScreen);
  let tree = screen.render(props);
  findButton(tree, 'Find suggestions').props.onPress();
  await flushAsync();
  tree = screen.render(props);
  assert.deepEqual(locationCalls.map((call) => call[0]), ['permission', 'last-known', 'current']);
  assert.deepEqual(requestArgs, { locationName: 'Kadıköy', category: 'cafe', categories: ['cafe', 'restaurant'], radius: 3000, budget: '600' });
  const text = textContent(tree);
  assert.ok(text.indexOf('Partner Cafe') < text.indexOf('Near Cafe'));
  assert.ok(text.indexOf('Near Cafe') < text.indexOf('Far Cafe'));
  assert.doesNotMatch(text, /Over Budget Restaurant/);
  assert.equal((text.match(/Partner Cafe/g) || []).length, 1);
  assert.match(text, /Showing cached place results/);

  const partnerCard = visit(tree, (node) => node.type === 'TouchableOpacity').find((node) => textContent(node).includes('Partner Cafe'));
  partnerCard.props.onPress();
  assert.match(screen.alerts.at(-1)[1], /Get directions/);
  screen.alerts.at(-1)[2][1].onPress();
  assert.match(screen.urls.at(-1), /destination=Partner%20Cafe%2C%20Pier%201%2C%20Kad%C4%B1k%C3%B6y/);
  const placeCard = visit(tree, (node) => node.type === 'TouchableOpacity').find((node) => textContent(node).includes('Near Cafe'));
  placeCard.props.onPress();
  screen.alerts.at(-1)[2][1].onPress();
  assert.match(screen.urls.at(-1), /destination=41\.001%2C29/);
  const copyright = visit(tree, (node) => node.type === 'Text').find((node) => node.props.accessibilityRole === 'link');
  assert.ok(copyright);
  copyright.props.onPress();
  assert.deepEqual(props.calls.at(-1), ['legal', 'https://www.openstreetmap.org/copyright']);
});

test('same-scope in-flight search is deduplicated and a provider failure remains retryable', async () => {
  resetProviders();
  const request = deferred();
  let calls = 0;
  const props = makeProps({ requestPlaces: () => { calls += 1; return request.promise; } });
  const screen = createRenderer(TodayScreen);
  let tree = screen.render(props);
  const button = findButton(tree, 'Find suggestions');
  button.props.onPress();
  button.props.onPress();
  await flushAsync();
  assert.equal(calls, 1);
  assert.deepEqual(locationCalls.map((call) => call[0]), ['permission']);
  request.reject(Object.assign(new Error('network'), { kind: 'network' }));
  await flushAsync();
  assert.equal(props.calls.filter((call) => call[0] === 'error').length, 1);
  assert.equal(screen.alerts.length, 1);
  tree = screen.render(props);
  findButton(tree, 'Find suggestions').props.onPress();
  await flushAsync();
  assert.equal(calls, 2);
});

test('empty location and valid empty provider results retain their existing messages', async () => {
  resetProviders();
  const emptyLocation = makeProps({ todayPreferences: { ...defaultPreferences(), location: '' } });
  const first = createRenderer(TodayScreen);
  findButton(first.render(emptyLocation), 'Find suggestions').props.onPress();
  assert.match(first.alerts[0][1], /Please enter your location/);
  assert.equal(locationCalls.length, 0);
  assert.equal(emptyLocation.calls.filter((call) => call[0] === 'places').length, 0);

  const emptyPlaces = makeProps({ requestPlaces: async () => ({ places: [] }) });
  const second = createRenderer(TodayScreen);
  findButton(second.render(emptyPlaces), 'Find suggestions').props.onPress();
  await flushAsync();
  assert.match(second.alerts[0][1], /couldn't find a suitable place/i);
});

test('account switch while location permission is pending stops before the provider request', async () => {
  resetProviders();
  const permission = deferred();
  locationImpl = { permission: () => permission.promise, lastKnown: async () => null, current: async () => null };
  const props = makeProps();
  const screen = createRenderer(TodayScreen);
  findButton(screen.render(props), 'Find suggestions').props.onPress();
  await flushAsync();
  const accountB = { ...props, dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2, todayPreferences: { ...props.todayPreferences, location: 'Üsküdar' } };
  screen.render(accountB);
  permission.resolve({ status: 'granted' });
  await flushAsync();
  assert.equal(props.calls.filter((call) => call[0] === 'places').length, 0);
  assert.equal(screen.alerts.length, 0);
});

test('preference change during permission await invalidates old search and allows a fresh search', async () => {
  resetProviders();
  const permission = deferred();
  locationImpl = { permission: () => permission.promise, lastKnown: async () => null, current: async () => ({ coords: { latitude: 1, longitude: 1 } }) };
  const calls = [];
  const props = makeProps({ requestPlaces: async (args) => { calls.push(args); return { places: [] }; } });
  const screen = createRenderer(TodayScreen);
  findButton(screen.render(props), 'Find suggestions').props.onPress();
  await flushAsync();
  const changed = { ...props, todayPreferences: { ...props.todayPreferences, location: 'Üsküdar', budget: '900' } };
  screen.render(changed);
  permission.resolve({ status: 'granted' });
  await flushAsync();
  assert.equal(calls.length, 0);
  findButton(screen.render(changed), 'Find suggestions').props.onPress();
  await flushAsync();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].locationName, 'Üsküdar');
  assert.equal(calls[0].budget, '900');
});

test('provider adapter receives a live account guard before dispatch', async () => {
  resetProviders();
  let activeGeneration = 1;
  let requestGuard = null;
  const props = makeProps({
    isCurrentDataScope: (generation) => generation === activeGeneration,
    requestPlaces: async (_args, isCurrent) => { requestGuard = isCurrent; return { places: [] }; },
  });
  const screen = createRenderer(TodayScreen);
  findButton(screen.render(props), 'Find suggestions').props.onPress();
  await flushAsync();
  assert.equal(typeof requestGuard, 'function');
  assert.equal(requestGuard(), true);
  activeGeneration = 2;
  assert.equal(requestGuard(), false);
});

test('late provider response after account transition cannot publish A results or alerts', async () => {
  resetProviders();
  const request = deferred();
  let calls = 0;
  const props = makeProps({ requestPlaces: () => {
    calls += 1;
    return calls === 1
      ? Promise.resolve({ places: [{ id: 'private-a', name: 'Private A Venue', category: 'cafe' }] })
      : request.promise;
  } });
  const screen = createRenderer(TodayScreen);
  findButton(screen.render(props), 'Find suggestions').props.onPress();
  await flushAsync();
  assert.match(textContent(screen.render(props)), /Private A Venue/);
  findButton(screen.render(props), 'Find suggestions').props.onPress();
  await flushAsync();
  const accountB = { ...props, dataScopeGeneration: 2, isCurrentDataScope: (generation) => generation === 2, todayPreferences: { ...props.todayPreferences, location: 'Üsküdar' } };
  const firstBRender = screen.render(accountB);
  assert.doesNotMatch(textContent(firstBRender), /Private A Venue/);
  request.resolve({ places: [{ id: 'a-place', name: 'Private A Venue', category: 'cafe' }] });
  await flushAsync();
  const afterResponse = screen.render(accountB);
  assert.doesNotMatch(textContent(afterResponse), /Private A Venue/);
  assert.equal(screen.alerts.length, 0);
});

test('preference change during provider await discards results for the old search', async () => {
  resetProviders();
  const request = deferred();
  const props = makeProps({ requestPlaces: () => request.promise });
  const screen = createRenderer(TodayScreen);
  findButton(screen.render(props), 'Find suggestions').props.onPress();
  await flushAsync();
  const changed = { ...props, todayPreferences: { ...props.todayPreferences, location: 'Beşiktaş' } };
  screen.render(changed);
  request.resolve({ places: [{ id: 'old', name: 'Old preference result', category: 'cafe' }] });
  await flushAsync();
  assert.doesNotMatch(textContent(screen.render(changed)), /Old preference result/);
  assert.equal(screen.alerts.length, 0);
});

test('unmount during location and provider awaits suppresses later work and state writes', async () => {
  resetProviders();
  const permission = deferred();
  locationImpl = { permission: () => permission.promise, lastKnown: async () => null, current: async () => null };
  const props = makeProps();
  const duringPermission = createRenderer(TodayScreen);
  findButton(duringPermission.render(props), 'Find suggestions').props.onPress();
  await flushAsync();
  duringPermission.unmount();
  permission.resolve({ status: 'granted' });
  await flushAsync();
  assert.equal(props.calls.filter((call) => call[0] === 'places').length, 0);

  resetProviders();
  const provider = deferred();
  const providerProps = makeProps({ requestPlaces: () => provider.promise });
  const duringProvider = createRenderer(TodayScreen);
  findButton(duringProvider.render(providerProps), 'Find suggestions').props.onPress();
  await flushAsync();
  const writesBeforeUnmount = duringProvider.stateWrites.length;
  duringProvider.unmount();
  provider.resolve({ places: [{ id: 'late', name: 'Late Venue', category: 'cafe' }] });
  await flushAsync();
  assert.equal(duringProvider.stateWrites.length, writesBeforeUnmount);
  assert.equal(duringProvider.alerts.length, 0);
});
