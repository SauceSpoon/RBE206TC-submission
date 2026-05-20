import assert from 'node:assert/strict';
import test from 'node:test';

import { ottoStableMoveButtons, ottoStableMoveCommand } from './otto-controls.js';

test('stable Otto controls expose a fast left turn command', () => {
  const leftFastButton = ottoStableMoveButtons.find((button) => button.label === '左快');

  assert.deepEqual(leftFastButton?.payload, {
    type: 'move',
    direction: 'otto_left_fast',
    speed: 40
  });
  assert.deepEqual(ottoStableMoveCommand('otto_left_fast'), leftFastButton.payload);
});

test('stable Otto move commands return a copy of the stored payload', () => {
  const command = ottoStableMoveCommand('otto_left_fast');

  command.speed = 0;

  assert.equal(ottoStableMoveCommand('otto_left_fast').speed, 40);
});
