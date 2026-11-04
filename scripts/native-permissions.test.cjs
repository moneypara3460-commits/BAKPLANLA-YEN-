const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = require(path.join(root, 'app.json')).expo;
const cameraPlugin = app.plugins.find(([name]) => name === 'expo-camera')?.[1];
const imagePickerPlugin = app.plugins.find(([name]) => name === 'expo-image-picker')?.[1];
const source = fs.readFileSync(path.join(root, 'App.js'), 'utf8');

test('camera, location, and notification permissions remain declared', () => {
  assert.deepEqual(app.android.permissions, [
    'CAMERA',
    'ACCESS_COARSE_LOCATION',
    'ACCESS_FINE_LOCATION',
    'POST_NOTIFICATIONS',
  ]);
});

test('unused Android microphone permission is blocked at config and plugin boundaries', () => {
  assert.ok(app.android.blockedPermissions.includes('android.permission.RECORD_AUDIO'));
  assert.equal(cameraPlugin.recordAudioAndroid, false);
  assert.equal(imagePickerPlugin.microphonePermission, false);
  assert.match(source, /ImagePicker\.launchCameraAsync\(/);
  assert.doesNotMatch(source, /\.recordAsync\(|recordAudio|MediaTypeOptions\.Videos/);
});
