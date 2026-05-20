import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');

test('robot connection defaults to the current robot access point IP', () => {
  assert.match(app, /const AUTO_CONNECT_IP = '192\.168\.10\.10';/);
  assert.doesNotMatch(app, /const AUTO_CONNECT_IP = '172\.20\.10\.10';/);
});

test('dashboard status updates do not overwrite a manually edited robot IP', () => {
  assert.doesNotMatch(
    app,
    /setServoDrafts\(dashboard\.servoAngles\);\s*if \(dashboard\.robot\.ip\) {\s*setIp\(dashboard\.robot\.ip\);\s*}/
  );
  assert.match(app, /setIp\(\(currentIp\) =>/);
  assert.match(app, /currentIp\.trim\(\) \? currentIp : dashboard\.robot\.ip/);
});
