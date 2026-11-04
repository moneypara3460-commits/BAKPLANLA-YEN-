const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const babel = require('@babel/core');
const transformModules = require('@babel/plugin-transform-modules-commonjs');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const endpointPath = path.join(root, 'supabase/functions/smart-endpoint/index.ts');
const appPath = path.join(root, 'App.js');
const todayScreenPath = path.join(root, 'TodayScreen.js');
const helpersPath = path.join(root, 'helpers.js');
const migrationPath = path.join(root, 'supabase/migrations/20261101090000_global_nominatim_request_gate.sql');
const guardUrl = pathToFileURL(path.join(root, 'supabase/functions/smart-endpoint/placesProviderGuard.mjs')).href;
const endpoint = fs.readFileSync(endpointPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const todayScreen = fs.readFileSync(todayScreenPath, 'utf8');
const helpers = fs.readFileSync(helpersPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');

test('Nominatim permit wait is bounded and fails closed on an unavailable or malformed RPC', async () => {
  const { waitForProviderPermit } = await import(guardUrl);
  let now = 0;
  const waits = [250, 0];
  const result = await waitForProviderPermit(
    async () => waits.shift(),
    1000,
    { now: () => now, sleep: async (ms) => { now += ms; } },
  );
  assert.equal(result, 'allowed');
  assert.equal(now, 250);
  assert.equal(await waitForProviderPermit(async () => null, 1000, { now: () => 0 }), 'unavailable');
  assert.equal(await waitForProviderPermit(async () => { throw new Error('rpc unavailable'); }, 1000, { now: () => 0 }), 'unavailable');
  assert.equal(await waitForProviderPermit(async () => 1, 0, { now: () => 0 }), 'limited');
});

test('simultaneous instances cannot obtain more than one rolling one-second provider slot', async () => {
  const { waitForProviderPermit } = await import(guardUrl);
  const now = Date.now();
  let last = now - 1000;
  const claim = async () => {
    if (last <= now - 1000) { last = now; return 0; }
    return 1000 - (now - last);
  };
  const results = await Promise.all(Array.from({ length: 24 }, () =>
    waitForProviderPermit(claim, now + 100, { now: () => now, sleep: async () => {} })
  ));
  assert.equal(results.filter((result) => result === 'allowed').length, 1);
  assert.equal(results.filter((result) => result === 'limited').length, 23);
});

test('the global RPC serializes across instances and direct client table/RPC access is revoked', () => {
  assert.match(migration, /CREATE TABLE public\.provider_rate_limit_state[\s\S]*?PRIMARY KEY/i);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.provider_rate_limit_state FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(migration, /SECURITY DEFINER[\s\S]*?SET search_path TO ''/i);
  assert.match(migration, /FOR UPDATE/i);
  assert.match(migration, /v_last <= v_now - interval '1 second'/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.claim_nominatim_request_slot\(\) TO service_role/i);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.claim_nominatim_request_slot\(\) TO (PUBLIC|anon|authenticated)/i);
});

test('only public Nominatim text geocoding acquires the shared permit; category POI searches never use Nominatim', () => {
  const geocodeStart = endpoint.indexOf('async function geocode(');
  const geocodeEnd = endpoint.indexOf('// ---------------------------------------------------------------\n// Kategori eşlemeleri', geocodeStart);
  const geocode = endpoint.slice(geocodeStart, geocodeEnd);
  assert.match(geocode, /isPublicNominatim\(cfg\.nominatimUrl\)[\s\S]*?acquireNominatimPermit[\s\S]*?fetchText\(/);
  assert.doesNotMatch(endpoint, /nominatimPoiSearch|NOMINATIM_PHRASES/);
  assert.match(endpoint, /serviceRpc\("claim_nominatim_request_slot"/);
  assert.match(endpoint, /"https:\/\/overpass-api\.de\/api\/interpreter"\s*\)\s*\.split/);
});

test('Overpass backpressure falls through the provider chain instead of probing more public instances', async () => {
  const { shouldTryNextOverpassEndpoint } = await import(guardUrl);
  assert.equal(shouldTryNextOverpassEndpoint(429), false);
  assert.equal(shouldTryNextOverpassEndpoint(504), false);
  assert.equal(shouldTryNextOverpassEndpoint(503), true);
  assert.match(endpoint, /if \(!shouldTryNextOverpassEndpoint\(r\.status\)\)\s*\{[\s\S]*?return null;/);
  assert.match(endpoint, /if \(result\) return \{ result, notes \};/);
  assert.match(migration, /claim_nominatim_request_slot/);
});

test('Places results show localized, screen-reader accessible OpenStreetMap attribution linked to ODbL/copyright', () => {
  assert.match(todayScreen, /const OSM_COPYRIGHT_URL = 'https:\/\/www\.openstreetmap\.org\/copyright'/);
  assert.match(todayScreen, /results\.length > 0 && \([\s\S]*?accessibilityRole="link"[\s\S]*?accessibilityLabel=\{tx\([\s\S]*?onPress=\{\(\) => openLegal\(OSM_COPYRIGHT_URL\)\}/);
  assert.match(todayScreen, /© OpenStreetMap katkıda bulunanlar · ODbL/);
  assert.match(todayScreen, /© OpenStreetMap contributors · ODbL/);
  assert.match(todayScreen, /© OpenStreetMap-Mitwirkende · ODbL/);
});

test('Today composition sends Places search text but keeps device GPS out of the provider request', () => {
  assert.match(app, /requestPlaces=\{\(params, isCurrent\) => callSmartJson\(\{ mode: 'places', \.\.\.params \}, isCurrent\)\}/);
  const requestStart = todayScreen.indexOf('const data = await requestPlaces({');
  const requestEnd = todayScreen.indexOf('}, () => isCurrent());', requestStart);
  assert.ok(requestStart >= 0 && requestEnd > requestStart, 'locate the production Places adapter request object');
  const requestBody = todayScreen.slice(requestStart, requestEnd);
  assert.match(requestBody, /locationName: place/);
  assert.doesNotMatch(requestBody, /deviceOrigin|latitude|longitude/);
});

test('approved Places providers always use Overpass first and permit only configured Geoapify after it', async () => {
  const { approvedPlacesProviderOrder } = await import(guardUrl);
  assert.deepEqual(approvedPlacesProviderOrder(['geoapify', 'overpass', 'nominatim', 'geoapify']), ['overpass', 'geoapify']);
  assert.deepEqual(approvedPlacesProviderOrder(['nominatim']), ['overpass']);
  assert.deepEqual(approvedPlacesProviderOrder([]), ['overpass']);
  assert.match(endpoint, /providerOrder: envStr\("PLACES_PROVIDER_ORDER", "overpass,geoapify"\)/);
  assert.match(endpoint, /if \(!cfg\.geoapifyKey\)/);
  assert.match(endpoint, /const order = approvedPlacesProviderOrder\(cfg\.providerOrder\)/);
  assert.doesNotMatch(endpoint, /name === "nominatim"/);
});

test('empty provider results remain successful; approved-provider failure maps to a localized unavailable message', async () => {
  const start = helpers.indexOf('export const makeSmartError =');
  const end = helpers.indexOf('export const buildAnalysis =', start);
  assert.ok(start >= 0 && end > start);
  const module = { exports: {} };
  const pick = (lang, tr, en, de) => lang === 'en' ? en : lang === 'de' ? de : tr;
  const snippet = helpers.slice(start, end) + '\nmodule.exports = { requestJsonWithTimeout, smartErrorMessage };';
  const { code } = babel.transformSync(snippet, {
    babelrc: false,
    configFile: false,
    plugins: [transformModules],
  });
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    pick,
    AbortController,
    Promise,
    setTimeout,
    clearTimeout,
    JSON,
    String,
    Number,
    Error,
  });
  const { requestJsonWithTimeout, smartErrorMessage } = module.exports;
  const response = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  });
  const empty = await requestJsonWithTimeout(async () => response(200, { success: true, places: [] }), 100);
  assert.equal(empty.places.length, 0);
  await assert.rejects(
    requestJsonWithTimeout(async () => response(502, { code: 'places_provider_unavailable', error: 'Mekan arama servisine ulaşılamadı.' }), 100),
    (error) => error.kind === 'placesUnavailable' && error.status === 502,
  );
  const unavailable = { kind: 'placesUnavailable' };
  assert.match(smartErrorMessage(unavailable, 'tr'), /Mekan sağlayıcıları şu anda kullanılamıyor/);
  assert.match(smartErrorMessage(unavailable, 'en'), /Place search providers are temporarily unavailable/);
  assert.match(smartErrorMessage(unavailable, 'de'), /Anbieterdienste für Orte sind gerade nicht verfügbar/);
  assert.match(endpoint, /code: "places_provider_unavailable"/);
  assert.match(todayScreen, /data\.places \|\| \[\]/);
  assert.match(todayScreen, /I couldn't find a suitable place around/);
  assert.match(todayScreen, /const isStale = data\.stale === true/);
  assert.match(todayScreen, /Son kayıtlı mekan sonuçları gösteriliyor/);
  assert.match(todayScreen, /Showing cached place results/);
  assert.match(todayScreen, /Zwischengespeicherte Ergebnisse werden angezeigt/);
  assert.match(todayScreen, /Mekan sağlayıcıları şu anda kullanılamıyor\. Güncel mekan sonucu alınamadı\./);
  assert.match(todayScreen, /No current place results could be retrieved/);
  assert.match(todayScreen, /Es konnten keine aktuellen Ergebnisse abgerufen werden/);
  assert.match(todayScreen, /accessibilityRole="alert" style=\{\[s\.note/);
  assert.equal((todayScreen.match(/const displayedResults =/g) || []).length, 2);
  assert.equal((todayScreen.match(/setStoredProviderNotice\(isStale[\s\S]*?displayedResults\.length[\s\S]*?No current place results could be retrieved/g) || []).length, 2);
  const placesButton = todayScreen.indexOf("tx('Öneri Bul', 'Find suggestions'");
  const providerAlert = todayScreen.indexOf('accessibilityRole="alert"', placesButton);
  const resultSection = todayScreen.indexOf('(results.length > 0 || partners.length > 0)', placesButton);
  assert.ok(providerAlert > placesButton && providerAlert < resultSection, 'provider warning must render even when filtering leaves no visible results');
});
