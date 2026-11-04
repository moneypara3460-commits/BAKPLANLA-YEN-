const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

const appConfig = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const rules = require('../plugins/withAndroidBackupRules');

const section = (xml, name) => {
  const match = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
  assert.ok(match, `missing ${name} section`);
  return match[1];
};

const includes = (xml) => [...xml.matchAll(/<include\b([^>]*)\/>/g)].map(([, attributes]) => attributes.trim());
const excludes = (xml) => [...xml.matchAll(/<exclude\b([^>]*)\/>/g)].map(([, attributes]) => attributes.trim());

test('Android Auto Backup retains existing cloud preference behavior and excludes SecureStore', () => {
  const cloud = section(rules.DATA_EXTRACTION_RULES, 'cloud-backup');
  assert.deepEqual(includes(cloud), ['domain="sharedpref" path="."']);
  assert.deepEqual(excludes(cloud), ['domain="sharedpref" path="SecureStore"']);
  assert.doesNotMatch(cloud, /domain="(?:database|file)"/);
  assert.match(rules.FULL_BACKUP_RULES, /<exclude domain="sharedpref" path="SecureStore"\s*\/>/);
  assert.doesNotMatch(rules.FULL_BACKUP_RULES, /domain="(?:database|file)"/);
});

test('Android 9–11 direct device transfer includes local data; older OS keeps the existing cloud scope', () => {
  const api28Rules = rules.FULL_BACKUP_RULES_API_28;
  assert.match(api28Rules, /domain="database" path="\." requireFlags="deviceToDeviceTransfer"/);
  assert.match(api28Rules, /domain="file" path="\." requireFlags="deviceToDeviceTransfer"/);
  assert.match(api28Rules, /<exclude domain="sharedpref" path="SecureStore"\s*\/>/);
  assert.doesNotMatch(rules.FULL_BACKUP_RULES, /deviceToDeviceTransfer/);
});

test('Android 12+ direct device transfer preserves AsyncStorage and document-directory files only in transfer paths', () => {
  const transfer = section(rules.DATA_EXTRACTION_RULES, 'device-transfer');
  assert.deepEqual(includes(transfer), [
    'domain="sharedpref" path="."',
    'domain="database" path="."',
    'domain="file" path="."',
  ]);
  assert.deepEqual(excludes(transfer), ['domain="sharedpref" path="SecureStore"']);
  assert.doesNotMatch(section(rules.DATA_EXTRACTION_RULES, 'cloud-backup'), /domain="(?:database|file)"/);
});

test('Expo config uses project-owned rules and keeps Android backup enabled', () => {
  assert.equal(appConfig.android.allowBackup, true);
  const secureStore = appConfig.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-secure-store');
  assert.deepEqual(secureStore, ['expo-secure-store', { configureAndroidBackup: false }]);
  assert.ok(appConfig.plugins.includes('./plugins/withAndroidBackupRules'));
});
