import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('otto motion profile editor wiring exists in the web control surface', async () => {
  const [config, app, controlPage, styles] = await Promise.all([
    read('src/dashboard-config.jsx'),
    read('src/App.jsx'),
    read('src/pages/ControlPage.jsx'),
    read('src/styles.css')
  ]);

  assert.match(config, /ottoMotionProfileDefaults/);
  assert.match(config, /ottoAggressiveMoveButtons/);
  assert.match(config, /ottoTestMoveButtons/);
  assert.match(config, /const testPeriodMs = 950;/);
  assert.match(config, /direction:\s*'otto_left_fast'/);
  assert.match(config, /ottoMotionProfile:[\s\S]*periodMs:\s*testPeriodMs/);
  assert.match(config, /const aggressiveForwardPeriodMs = 1050;/);
  assert.match(config, /otto_forward:[\s\S]*periodMs:\s*aggressiveForwardPeriodMs/);
  assert.match(config, /otto_forward:[\s\S]*leftLegAmplitudeDeg:\s*10\.5/);
  assert.match(config, /otto_forward:[\s\S]*rightLegAmplitudeDeg:\s*11\.2/);
  assert.match(config, /otto_forward:[\s\S]*leftHipAmplitudeDeg:\s*18\.5/);
  assert.match(config, /otto_forward:[\s\S]*rightHipAmplitudeDeg:\s*19\.5/);
  assert.match(config, /periodMs:\s*aggressivePeriodMs/);
  assert.match(config, /leftHipAmplitudeDeg:\s*20/);
  assert.match(config, /rightHipAmplitudeDeg:\s*20/);
  assert.match(config, /ottoMotionProfileSelector/);
  assert.match(config, /otto_async_forward:\s*\{/);
  assert.match(config, /otto_shift_left:\s*\{/);
  assert.match(config, /otto_shift_right:\s*\{/);
  assert.match(config, /\{ id:\s*'otto_async_forward', label:\s*'异步直行' \}/);
  assert.match(config, /\{ id:\s*'otto_shift_left', label:\s*'左修正' \}/);
  assert.match(config, /\{ id:\s*'otto_shift_right', label:\s*'右修正' \}/);
  assert.match(config, /direction:\s*'otto_shift_left'/);
  assert.match(config, /direction:\s*'otto_shift_right'/);
  assert.match(config, /rightLegAmplitudeDeg:\s*11\.6/);
  assert.match(config, /rightHipAmplitudeDeg:\s*18\.2/);
  assert.match(config, /otto_async_forward:[\s\S]*leftLegAmplitudeDeg:\s*10\.2/);
  assert.match(config, /otto_async_forward:[\s\S]*rightLegAmplitudeDeg:\s*7\.6/);
  assert.match(config, /otto_async_forward:[\s\S]*leftHipAmplitudeDeg:\s*15\.3/);
  assert.match(config, /otto_async_forward:[\s\S]*rightHipAmplitudeDeg:\s*11\.9/);
  assert.match(config, /leftLegAmplitudeDeg/);
  assert.match(config, /rightHipAmplitudeDeg/);
  assert.match(app, /localStorage/);
  assert.match(app, /otto-motion-drafts:v2/);
  assert.match(app, /ottoMotionDrafts/);
  assert.match(app, /secondaryMoveButtons=\{ottoAggressiveMoveButtons\}/);
  assert.match(app, /secondaryMoveTitle="激进区"/);
  assert.match(app, /testMoveButtons=\{ottoTestMoveButtons\}/);
  assert.match(app, /testMoveTitle="测试区"/);
  assert.match(app, /keyboardControlMode/);
  assert.match(app, /setKeyboardControlMode/);
  assert.match(app, /getMovePayloadByKey/);
  assert.match(app, /keyboardControlMode === 'smooth'/);
  assert.match(app, /keyboardControlMode === 'super'/);
  assert.match(app, /periodMs:\s*900/);
  assert.match(app, /leftLegAmplitudeDeg:\s*10\.2/);
  assert.match(app, /rightLegAmplitudeDeg:\s*11/);
  assert.match(app, /leftHipAmplitudeDeg:\s*17\.5/);
  assert.match(app, /rightHipAmplitudeDeg:\s*18\.5/);
  assert.match(app, /return defaultMovePayloadByKey\[key\]/);
  assert.match(app, /findMovePayload\(ottoTestMoveButtons,\s*'同步直行'\)/);
  assert.match(app, /findMovePayload\(ottoTestMoveButtons,\s*'同步后退'\)/);
  assert.match(app, /findMovePayload\(ottoTestMoveButtons,\s*'左快'\)/);
  assert.match(app, /findMovePayload\(ottoTestMoveButtons,\s*'右转'\)/);
  assert.match(app, /getMotionLabelByKey/);
  assert.match(app, /findMovePayload\(ottoAggressiveMoveButtons,\s*'同步直行'\)/);
  assert.match(app, /findMovePayload\(ottoMoveButtons,\s*'左快'\)/);
  assert.match(app, /return '激进同步直行'/);
  assert.match(app, /return '左快'/);
  assert.match(controlPage, /keyboardControlMode/);
  assert.match(controlPage, /setKeyboardControlMode/);
  assert.match(controlPage, /平稳键盘/);
  assert.match(controlPage, /稳定键盘/);
  assert.match(controlPage, /超级键盘/);
  assert.match(controlPage, /激进键盘/);
  assert.match(config, /ottoBowlingTacticButton/);
  assert.match(config, /label:\s*'保龄球战术'/);
  assert.match(config, /direction:\s*'otto_bowling_tactic'/);
  assert.match(config, /ottoMotionProfiles:[\s\S]*forward:[\s\S]*periodMs:\s*aggressiveForwardPeriodMs/);
  assert.match(config, /ottoMotionProfiles:[\s\S]*turnLeft:[\s\S]*periodMs:\s*aggressivePeriodMs/);
  assert.match(config, /ottoMotionProfiles:[\s\S]*turnRight:[\s\S]*periodMs:\s*aggressivePeriodMs/);
  assert.match(app, /keyboardActionButtons=\{\[ottoBowlingTacticButton\]\}/);
  assert.match(controlPage, /keyboardActionButtons/);
  assert.match(app, /otto_motion_profile_save/);
  assert.match(app, /motionProfile:\s*currentDraft/);
  assert.match(app, /ottoMotionSaveStatus/);
  assert.match(app, /savedOttoMotionProfiles/);
  assert.match(app, /setSavedOttoMotionProfiles/);
  assert.match(app, /profileSnapshot\?\.saved/);
  assert.match(app, /savedOttoMotionProfiles\[motionId\] \|\| ottoMotionProfileDefaults\[motionId\]/);
  assert.match(app, /已保存到机器人/);
  assert.match(controlPage, /恢复当前动作默认值/);
  assert.match(controlPage, /测试当前动作/);
  assert.match(controlPage, /保存到机器人/);
  assert.match(controlPage, /保存中\.\.\./);
  assert.match(controlPage, /otto-motion-save-status/);
  assert.match(controlPage, /aria-live="polite"/);
  assert.match(controlPage, /secondaryMoveButtons/);
  assert.match(controlPage, /testMoveButtons/);
  assert.match(controlPage, /ottoMotionProfileSelector/);
  assert.match(styles, /otto-motion-editor/);
  assert.match(styles, /otto-motion-save-status\.success/);
  assert.match(styles, /otto-motion-save-status\.error/);
});
