import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const script = await readFile(new URL('./pc_brain_opencv.py', import.meta.url), 'utf8');

test('opencv pc brain can attach Qwen3-VL external brain sidecar analysis', () => {
  assert.match(script, /--ollama-model/);
  assert.match(script, /qwen3-vl:4b/);
  assert.match(script, /\/api\/generate/);
  assert.match(script, /\/no_think/);
  assert.match(script, /ollama_response\.get\("response"\) or ollama_response\.get\("thinking"\)/);
  assert.match(script, /externalBrain/);
  assert.match(script, /first_yellow_ahead/);
  assert.match(script, /center_gate_visible/);
  assert.doesNotMatch(script, /top_yellow_right/);
  assert.match(script, /black_goal_visible/);
});
