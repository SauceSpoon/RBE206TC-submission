import assert from 'node:assert/strict';
import test from 'node:test';
import { StateStore } from './state-store.js';

test('state store forwards robot saved Otto motion profiles to the web runtime build', () => {
  const store = new StateStore();
  const profiles = {
    default: {
      otto_forward: {
        leftLegAmplitudeDeg: 12,
        rightLegAmplitudeDeg: 11.6,
        leftHipAmplitudeDeg: 18,
        rightHipAmplitudeDeg: 18.2,
        periodMs: 1200
      }
    },
    saved: {
      otto_forward: {
        leftLegAmplitudeDeg: 12.4,
        rightLegAmplitudeDeg: 11.9,
        leftHipAmplitudeDeg: 18.1,
        rightHipAmplitudeDeg: 18.4,
        periodMs: 1200
      }
    }
  };

  store.applyRobotStatus({
    build: {
      compiledAt: 'May 16 2026 17:08:53',
      servoDriverReady: true
    },
    ottoMotionProfiles: profiles
  });

  assert.equal(store.snapshot().runtime.build.compiledAt, 'May 16 2026 17:08:53');
  assert.deepEqual(store.snapshot().runtime.build.ottoMotionProfiles, profiles);
});
