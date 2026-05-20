import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardConfig = await readFile(new URL('./dashboard-config.jsx', import.meta.url), 'utf8');
const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
const page = await readFile(new URL('./pages/Task1Page.jsx', import.meta.url), 'utf8');

test('task1 page is registered as its own dashboard tab', () => {
  assert.match(dashboardConfig, /id:\s*'task1'/);
  assert.match(dashboardConfig, /label:\s*'task1'/);
  assert.match(app, /import Task1Page from '\.\/pages\/Task1Page\.jsx'/);
  assert.match(app, /case 'task1':/);
  assert.match(app, /<Task1Page/);
  assert.match(page, /export default function Task1Page/);
});

test('task1 page exposes a front-pole bypass button wired to the robot command API', () => {
  assert.match(page, /绕正前方柱子/);
  assert.match(page, /task1_front_pole_bypass/);
  assert.match(page, /manualCommand/);
  assert.match(page, /onToast/);
  assert.match(app, /manualCommand=\{postControlCommand\}/);
  assert.match(app, /onToast=\{setToast\}/);
});
