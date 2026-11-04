const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const transformModules = require('@babel/plugin-transform-modules-commonjs');

// Load the existing plain-JS ESM domain module and its local ESM dependencies
// through Node's test runner without changing the app's bundler configuration.
const root = path.resolve(__dirname, '..') + path.sep;
const originalJsLoader = require.extensions['.js'];
require.extensions['.js'] = (module, filename) => {
  if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
    return originalJsLoader(module, filename);
  }
  const source = fs.readFileSync(filename, 'utf8');
  const { code } = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename,
    plugins: [transformModules],
  });
  return module._compile(code, filename);
};
const compass = require('../compass.js');
require.extensions['.js'] = originalJsLoader;

const completeAnswers = (value) => Object.fromEntries(compass.QUESTIONS.map((question) => [question.id, value]));

test('PUSULA keeps its 36-question, six-area questionnaire contract', () => {
  assert.equal(compass.COMPASS_KEY, 'PLAN_COMPASS_RESULT');
  assert.equal(compass.QUESTIONS.length, 36);
  assert.equal(new Set(compass.QUESTIONS.map((question) => question.id)).size, 36);
  for (const area of compass.AREA_KEYS) {
    assert.equal(compass.QUESTIONS.filter((question) => question.area === area).length, 6);
  }
});

test('incomplete and out-of-range answers cannot produce a result', () => {
  const partial = completeAnswers(compass.ANSWER_MIN);
  delete partial.q36;
  partial.q1 = 6;
  assert.equal(compass.answeredCount(partial), 34);
  assert.deepEqual(compass.scoreCompass(partial), { ok: false, reason: 'incomplete', missing: 2 });
  assert.equal(compass.scoreCompass(null).ok, false);
});

test('complete answers produce bounded and stable area scores', () => {
  const lowest = compass.scoreCompass(completeAnswers(compass.ANSWER_MIN));
  const highest = compass.scoreCompass(completeAnswers(compass.ANSWER_MAX));
  assert.equal(lowest.ok, true);
  assert.equal(highest.ok, true);
  for (const key of compass.AREA_KEYS) {
    assert.equal(lowest.scores[key], 0);
    assert.equal(highest.scores[key], 100);
  }
  assert.deepEqual(lowest.ranked.map((item) => item.key), compass.AREA_KEYS);
  assert.deepEqual(highest.ranked.map((item) => item.key), compass.AREA_KEYS);
});

test('suggested fields follow the top two areas, language, uniqueness and limit', () => {
  const result = compass.scoreCompass(completeAnswers(compass.ANSWER_MIN));
  const tr = compass.suggestFields(result.ranked, 'tr', 3);
  const en = compass.suggestFields(result.ranked, 'en', 3);
  assert.equal(tr.length, 3);
  assert.equal(new Set(tr).size, tr.length);
  assert.notDeepEqual(tr, en);
  assert.equal(compass.areaByKey('unknown'), null);
});
