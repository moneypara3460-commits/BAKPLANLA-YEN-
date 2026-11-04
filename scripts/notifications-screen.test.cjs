const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const transformModules = require('@babel/plugin-transform-modules-commonjs');
const transformJsx = require('@babel/plugin-transform-react-jsx');
const test = require('node:test');

const root = path.resolve(__dirname, '..') + path.sep;
const source = fs.readFileSync(path.join(root, 'NotificationsScreen.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
const originalJsLoader = require.extensions['.js'];
const originalLoad = Module._load;
const nativeMocks = { Text: 'Text', TouchableOpacity: 'TouchableOpacity', Switch: 'Switch', View: 'View' };

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
  if (parent?.filename?.startsWith(root)) {
    if (request === 'react-native') return nativeMocks;
    if (request === './notifications') return { notificationsSupported: true, openSystemSettings() {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const NotificationsModule = require('../NotificationsScreen');
require.extensions['.js'] = originalJsLoader;
Module._load = originalLoad;

test('upcoming reminder count includes due-today and future open tasks only', () => {
  const tasks = [
    { dueDate: '2026-11-01', completed: false },
    { dueDate: '2026-11-02', completed: false },
    { dueDate: '2026-10-31', completed: false },
    { dueDate: '2026-11-03', completed: true },
    null,
  ];
  assert.equal(NotificationsModule.countUpcomingReminderTasks(tasks, '2026-11-01'), 2);
  assert.equal(NotificationsModule.countUpcomingReminderTasks(null, '2026-11-01'), 0);
});

test('notification screen keeps lifecycle, permission, preference and test-action contracts', () => {
  assert.match(source, /useEffect\(\(\) => \{ refreshNotifPermission\(\); \}, \[\]\)/);
  assert.match(source, /notifPermission === 'denied'/);
  assert.match(source, /onValueChange=\{toggleTaskReminders\}/);
  assert.match(source, /updateNotifPrefs\(\{ hour \}\)/);
  assert.match(source, /updateNotifPrefs\(\{ dayBefore: value \}\)/);
  assert.match(source, /onPress=\{sendTestNotif\}/);
  assert.match(source, /onPress=\{openSystemSettings\}/);
  assert.match(source, /Reminders live on this device only/);
});

test('screen is composed with an explicit contract and has no App import/context cycle', () => {
  assert.doesNotMatch(source, /useApp\(|from ['"]\.\/App['"]|require\(['"]\.\/App['"]\)/);
  assert.match(source, /from ['"]\.\/notifications['"]/);
  assert.match(appSource, /import NotificationsScreen from '\.\/NotificationsScreen'/);
  assert.match(appSource, /case 'notifications':[\s\S]*?<NotificationsScreen s=\{s\} c=\{c\} tx=\{tx\} tasks=\{tasks\}/);
});
