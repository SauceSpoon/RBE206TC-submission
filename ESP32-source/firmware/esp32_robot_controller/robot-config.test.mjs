import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = readFileSync(new URL('./include/robot_config.h', import.meta.url), 'utf8');
const firmware = readFileSync(new URL('./src/main.cpp', import.meta.url), 'utf8');
const dashboardConfig = [
  readFileSync(new URL('../../apps/web/src/dashboard-config.jsx', import.meta.url), 'utf8'),
  readFileSync(new URL('../../apps/shared/otto-controls.js', import.meta.url), 'utf8')
].join('\n');

function parseBoolArray(name) {
  const match = config.match(new RegExp(`${name}\\[SERVO_COUNT\\]\\s*=\\s*\\{([^}]+)\\}`));
  assert.ok(match, `${name} must be defined`);
  return match[1].split(',').map((value) => value.trim() === 'true');
}

test('knee logical forward direction matches physical forward direction', () => {
  const inverted = parseBoolArray('SERVO_INVERTED');

  assert.equal(inverted[0], true, 'left knee should invert logical angles');
  assert.equal(inverted[1], false, 'right knee should not invert logical angles');
});

test('Otto hip servos use mirrored physical direction', () => {
  const inverted = parseBoolArray('SERVO_INVERTED');

  assert.equal(inverted[7], true, 'Otto right hip should invert logical angles');
  assert.equal(inverted[8], false, 'Otto left hip should keep normal logical angles');
});

test('lateral step is exposed as a persistent action', () => {
  assert.match(firmware, /"lateral_step"/);
  assert.match(firmware, /robotState\.mode != "lateral_step"/);
  assert.match(dashboardConfig, /label:\s*'横移步'/);
  assert.match(dashboardConfig, /name:\s*'lateral_step'/);
});

test('forward move uses single-leg qh pitch sequence starting with the left leg', () => {
  assert.match(firmware, /ForwardStepPhase::ShiftToRightForLeft/);
  assert.match(firmware, /ForwardStepPhase::LeftLift/);
  assert.match(firmware, /void startForwardStep\(bool flatFootVariant = false\)/);
  assert.match(firmware, /if \(direction == "forward"\)\s*\{\s*startForwardStep\(false\);/);
  assert.match(firmware, /SERVO_LEFT_HIP_PITCH,\s*static_cast<int>\(lroundf\(leftHipPitch\)\)/);
  assert.match(firmware, /SERVO_RIGHT_HIP_PITCH,\s*static_cast<int>\(lroundf\(rightHipPitch\)\)/);
  assert.match(firmware, /constexpr float LEFT_LEAN_OFFSET = -4\.0f;/);
  assert.match(firmware, /constexpr float RIGHT_LEAN_OFFSET = 4\.0f;/);
  assert.match(firmware, /SERVO_LEFT_HIP_ROLL,\s*static_cast<int>\(lroundf\(SERVO_CENTER_ANGLE \+ offset\)\)/);
  assert.match(firmware, /SERVO_RIGHT_HIP_ROLL,\s*static_cast<int>\(lroundf\(SERVO_CENTER_ANGLE - offset\)\)/);
  assert.match(firmware, /leftKnee = flatFootVariant \? lerpFloat\(90\.0f, 70\.0f, eased\) : lerpFloat\(90\.0f, 105\.0f, eased\)/);
  assert.match(firmware, /leftHipPitch = flatFootVariant \? lerpFloat\(90\.0f, 110\.0f, eased\) : lerpFloat\(90\.0f, 85\.0f, eased\)/);
  assert.match(firmware, /leftHipPitch = flatFootVariant \? 110\.0f : lerpFloat\(85\.0f, 100\.0f, eased\)/);
  assert.match(firmware, /case ForwardStepPhase::LeftLand:[\s\S]*leftHipPitch = flatFootVariant \? 110\.0f : 100\.0f;/);
  assert.match(firmware, /case ForwardStepPhase::ShiftToLeftForSupport:[\s\S]*leftHipPitch = flatFootVariant \? 110\.0f : 100\.0f;/);
  assert.match(firmware, /case ForwardStepPhase::LeftFollow:[\s\S]*leftHipPitch = flatFootVariant \? lerpFloat\(110\.0f, 90\.0f, eased\) : lerpFloat\(100\.0f, 90\.0f, eased\)/);
  assert.match(firmware, /rightKnee = flatFootVariant \? lerpFloat\(90\.0f, 70\.0f, eased\) : lerpFloat\(90\.0f, 105\.0f, eased\)/);
  assert.match(firmware, /rightHipPitch = flatFootVariant \? lerpFloat\(90\.0f, 110\.0f, eased\) : lerpFloat\(90\.0f, 85\.0f, eased\)/);
  assert.match(firmware, /rightHipPitch = flatFootVariant \? 110\.0f : lerpFloat\(85\.0f, 100\.0f, eased\)/);
  assert.match(firmware, /case ForwardStepPhase::RightLand:[\s\S]*rightHipPitch = flatFootVariant \? 110\.0f : 100\.0f;/);
  assert.match(firmware, /case ForwardStepPhase::ShiftToRightForSupport:[\s\S]*rightHipPitch = flatFootVariant \? 110\.0f : 100\.0f;/);
  assert.match(firmware, /case ForwardStepPhase::RightFollow:[\s\S]*rightHipPitch = flatFootVariant \? lerpFloat\(110\.0f, 90\.0f, eased\) : lerpFloat\(100\.0f, 90\.0f, eased\)/);
  assert.match(firmware, /robotState\.mode != "forward_step"/);
  assert.match(dashboardConfig, /label:\s*'步态1'/);
  assert.match(dashboardConfig, /direction:\s*'forward'/);
});

test('second forward gait uses flat-foot hip and knee compensation', () => {
  assert.match(firmware, /bool flatFootVariant = false;/);
  assert.match(firmware, /void startForwardStep\(bool flatFootVariant = false\)/);
  assert.match(firmware, /if \(direction == "forward_2"\)\s*\{\s*startForwardStep\(true\);/);
  assert.match(firmware, /robotState\.mode = flatFootVariant \? "forward_step_2" : "forward_step";/);
  assert.match(firmware, /leftKnee = flatFootVariant \? lerpFloat\(90\.0f, 70\.0f, eased\)/);
  assert.match(firmware, /leftHipPitch = flatFootVariant \? lerpFloat\(90\.0f, 110\.0f, eased\)/);
  assert.match(firmware, /rightKnee = flatFootVariant \? lerpFloat\(90\.0f, 70\.0f, eased\)/);
  assert.match(firmware, /rightHipPitch = flatFootVariant \? lerpFloat\(90\.0f, 110\.0f, eased\)/);
  assert.match(firmware, /robotState\.mode != "forward_step_2"/);
  assert.match(dashboardConfig, /label:\s*'步态2'/);
  assert.match(dashboardConfig, /direction:\s*'forward_2'/);
});

test('move stop holds the current pose instead of recentering servos', () => {
  assert.match(
    firmware,
    /if \(direction == "stop"\)\s*\{\s*stopPenguinGait\(false, "idle"\);\s*stopLateralStep\(false, "idle"\);\s*stopForwardStep\(false, "idle"\);\s*stopOttoGait\(false, "idle"\);\s*return;\s*\}/
  );
});

test('PCA9685 writes skip unchanged PWM ticks and tolerate transient failures', () => {
  assert.match(config, /constexpr uint32_t PCA9685_I2C_CLOCK_HZ = 100000;/);
  assert.match(config, /constexpr uint8_t PCA9685_PROBE_ATTEMPTS = 5;/);
  assert.match(config, /constexpr unsigned long PCA9685_PROBE_RETRY_DELAY_MS = 50;/);
  assert.match(config, /constexpr unsigned long PCA9685_WRITE_RETRY_DELAY_MS = 100;/);
  assert.match(config, /constexpr uint8_t PCA9685_MAX_CONSECUTIVE_WRITE_FAILURES = 5;/);
  assert.match(firmware, /Wire\.setClock\(PCA9685_I2C_CLOCK_HZ\);/);
  assert.match(firmware, /bool probePca9685WithRetry\(\)/);
  assert.match(firmware, /for \(uint8_t attempt = 0; attempt < PCA9685_PROBE_ATTEMPTS; attempt\+\+\)/);
  assert.match(firmware, /delay\(PCA9685_PROBE_RETRY_DELAY_MS\);/);
  assert.match(firmware, /bool shouldSkipServoPwmWrite\(uint8_t servoId, uint16_t ticks\)/);
  assert.match(firmware, /robotState\.servoPwmActive\[servoId\] &&\s*robotState\.servoPwmTicks\[servoId\] == ticks/);
  assert.match(firmware, /if \(shouldSkipServoPwmWrite\(servoId, ticks\)\)\s*\{\s*robotState\.servoAngles\[servoId\] = constrained;\s*return;\s*\}/);
  assert.match(firmware, /robotState\.nextServoWriteRetryAt = millis\(\) \+ PCA9685_WRITE_RETRY_DELAY_MS;/);
  assert.match(firmware, /robotState\.consecutiveServoWriteFailures >= PCA9685_MAX_CONSECUTIVE_WRITE_FAILURES/);
  assert.match(firmware, /robotState\.servoDriverReady = false;/);
  assert.match(firmware, /stopAllMotion\(\);[\s\S]*robotState\.mode = "pca9685_recovered";/);
});

test('MPU6050 chip-down center mount maps IMU axes into robot frame', () => {
  assert.match(config, /constexpr bool IMU_MPU6050_CHIP_DOWN = true;/);
  assert.match(firmware, /float mapImuAccelY\(float value\)\s*\{\s*return IMU_MPU6050_CHIP_DOWN \? -value : value;\s*\}/);
  assert.match(firmware, /float mapImuAccelZ\(float value\)\s*\{\s*return IMU_MPU6050_CHIP_DOWN \? -value : value;\s*\}/);
  assert.match(firmware, /float mapImuGyroY\(float value\)\s*\{\s*return IMU_MPU6050_CHIP_DOWN \? -value : value;\s*\}/);
  assert.match(firmware, /float mapImuGyroZ\(float value\)\s*\{\s*return IMU_MPU6050_CHIP_DOWN \? -value : value;\s*\}/);
  assert.match(firmware, /robotState\.imuAccelX = mapImuAccelX\(static_cast<float>\(rawAccelX\) \/ MPU6050_ACCEL_SCALE\);/);
  assert.match(firmware, /robotState\.imuAccelY = mapImuAccelY\(static_cast<float>\(rawAccelY\) \/ MPU6050_ACCEL_SCALE\);/);
  assert.match(firmware, /robotState\.imuAccelZ = mapImuAccelZ\(static_cast<float>\(rawAccelZ\) \/ MPU6050_ACCEL_SCALE\);/);
  assert.match(firmware, /rawGyroY\) \/ MPU6050_GYRO_SCALE\) - robotState\.imuGyroBiasY/);
  assert.match(firmware, /const float gyroY = mapImuGyroY\(rawMappedGyroY\);/);
  assert.match(firmware, /const float gyroZ = mapImuGyroZ\(rawMappedGyroZ\);/);
});

test('Otto forward IMU yaw assist stays disabled by default until field-tuned', () => {
  assert.match(config, /constexpr bool OTTO_IMU_STRAIGHT_ASSIST_ENABLED = false;/);
  assert.match(config, /constexpr float OTTO_IMU_STRAIGHT_ASSIST_DEADBAND_DEG = 2\.0f;/);
  assert.match(config, /constexpr float OTTO_IMU_STRAIGHT_ASSIST_GAIN = 0\.012f;/);
  assert.match(config, /constexpr float OTTO_IMU_STRAIGHT_ASSIST_MAX = 0\.12f;/);
  assert.match(firmware, /float straightAssistBaselineYaw = 0\.0f;/);
  assert.match(firmware, /bool straightAssistActive = false;/);
  assert.match(firmware, /bool isOttoForwardMode\(OttoMoveMode mode\)/);
  assert.match(firmware, /return mode == OttoMoveMode::StraightForward \|\| mode == OttoMoveMode::AsyncForward;/);
  assert.match(firmware, /ottoGaitState\.straightAssistBaselineYaw = robotState\.imuYaw;/);
  assert.match(firmware, /ottoGaitState\.straightAssistActive =\s*OTTO_IMU_STRAIGHT_ASSIST_ENABLED &&\s*robotState\.imuAvailable &&\s*isOttoForwardMode\(mode\);/);
  assert.match(firmware, /float ottoStraightAssistCorrection\(\)/);
  assert.match(firmware, /fabsf\(yawError\) < OTTO_IMU_STRAIGHT_ASSIST_DEADBAND_DEG/);
  assert.match(firmware, /clampFloat\(\s*-yawError \* OTTO_IMU_STRAIGHT_ASSIST_GAIN,\s*-OTTO_IMU_STRAIGHT_ASSIST_MAX,\s*OTTO_IMU_STRAIGHT_ASSIST_MAX\s*\)/);
  assert.match(firmware, /if \(isOttoForwardMode\(ottoGaitState\.mode\)\)[\s\S]*leftHipAmplitude \*= 1\.0f \+ correction;[\s\S]*rightHipAmplitude \*= 1\.0f - correction;/);
  assert.match(firmware, /gaitTelemetry\["ottoStraightAssistActive"\] = ottoGaitState\.straightAssistActive;/);
});

test('Otto forward modes publish yaw diagnostics without enabling IMU control', () => {
  assert.match(firmware, /bool straightDiagnosticAvailable = false;/);
  assert.match(firmware, /bool straightDiagnosticRunning = false;/);
  assert.match(firmware, /float straightDiagnosticBaselineYaw = 0\.0f;/);
  assert.match(firmware, /float straightDiagnosticYawError = 0\.0f;/);
  assert.match(firmware, /float straightDiagnosticMaxAbsYawError = 0\.0f;/);
  assert.match(firmware, /void startOttoStraightDiagnostic\(OttoMoveMode mode, unsigned long now\)/);
  assert.match(firmware, /void updateOttoStraightDiagnostic\(unsigned long now\)/);
  assert.match(firmware, /void stopOttoStraightDiagnostic\(unsigned long now\)/);
  assert.match(firmware, /ottoGaitState\.straightDiagnosticRunning = isOttoForwardMode\(mode\) && robotState\.imuAvailable;/);
  assert.match(firmware, /ottoGaitState\.straightDiagnosticYawError =\s*normalizeAngleDeltaDeg\(robotState\.imuYaw - ottoGaitState\.straightDiagnosticBaselineYaw\);/);
  assert.match(firmware, /max\(ottoGaitState\.straightDiagnosticMaxAbsYawError, fabsf\(ottoGaitState\.straightDiagnosticYawError\)\)/);
  assert.match(firmware, /gaitTelemetry\["ottoStraightDiagnosticAvailable"\] = ottoGaitState\.straightDiagnosticAvailable;/);
  assert.match(firmware, /gaitTelemetry\["ottoStraightDiagnosticRunning"\] = ottoGaitState\.straightDiagnosticRunning;/);
  assert.match(firmware, /writeNullableFloat\(gaitTelemetry, "ottoBaselineYaw"/);
  assert.match(firmware, /writeNullableFloat\(gaitTelemetry, "ottoYawError"/);
  assert.match(firmware, /writeNullableFloat\(gaitTelemetry, "ottoMaxAbsYawError"/);
  assert.match(firmware, /gaitTelemetry\["ottoYawDirection"\] = ottoYawDirectionLabel\(ottoGaitState\.straightDiagnosticYawError\);/);
  assert.match(firmware, /if \(yawError > OTTO_IMU_STRAIGHT_ASSIST_DEADBAND_DEG\)\s*\{\s*return "left";\s*\}/);
  assert.match(firmware, /if \(yawError < -OTTO_IMU_STRAIGHT_ASSIST_DEADBAND_DEG\)\s*\{\s*return "right";\s*\}/);
});

test('Otto bowling tactic keeps aggressive forward until IMU yaw needs recovery turns', () => {
  assert.match(config, /constexpr float OTTO_BOWLING_TACTIC_START_DEG = 8\.0f;/);
  assert.match(config, /constexpr float OTTO_BOWLING_TACTIC_DONE_DEG = 2\.0f;/);
  assert.match(firmware, /enum class BowlingTacticPhase/);
  assert.match(firmware, /BowlingTacticPhase::Straight/);
  assert.match(firmware, /BowlingTacticPhase::RecoverLeft/);
  assert.match(firmware, /BowlingTacticPhase::RecoverRight/);
  assert.match(firmware, /float targetYaw = 0\.0f;/);
  assert.match(firmware, /OttoMotionProfile forwardProfile;/);
  assert.match(firmware, /OttoMotionProfile turnLeftProfile;/);
  assert.match(firmware, /OttoMotionProfile turnRightProfile;/);
  assert.match(firmware, /void startBowlingTactic\(const JsonDocument& doc\)/);
  assert.match(firmware, /bowlingTacticState\.targetYaw = robotState\.imuYaw;/);
  assert.match(firmware, /direction == "otto_bowling_tactic"/);
  assert.match(firmware, /void updateBowlingTactic\(unsigned long now\)/);
  assert.match(firmware, /normalizeAngleDeltaDeg\(robotState\.imuYaw - bowlingTacticState\.targetYaw\)/);
  assert.match(firmware, /fabsf\(yawError\) <= OTTO_BOWLING_TACTIC_DONE_DEG/);
  assert.match(firmware, /fabsf\(yawError\) <= OTTO_BOWLING_TACTIC_START_DEG/);
  assert.match(firmware, /startOttoGait\(OttoMoveMode::StraightForward, bowlingTacticState\.forwardProfile, true\)/);
  assert.match(firmware, /startOttoGait\(OttoMoveMode::TurnLeft, bowlingTacticState\.turnLeftProfile, true\)/);
  assert.match(firmware, /startOttoGait\(OttoMoveMode::TurnRight, bowlingTacticState\.turnRightProfile, true\)/);
  assert.match(firmware, /robotState\.mode = "otto_bowling_tactic";/);
  assert.match(firmware, /robotState\.mode != "otto_bowling_tactic"/);
});

test('robot-body task1 autopilot uses center ultrasonic fixed-route state machine', () => {
  assert.match(config, /constexpr float TASK1_AUTOPILOT_OBSTACLE_CM = 17\.0f;/);
  assert.match(config, /constexpr unsigned long TASK1_FIRST_BYPASS_TURN_RIGHT_MS = 700;/);
  assert.match(config, /constexpr unsigned long TASK1_FIRST_BYPASS_FORWARD_MS = 1000;/);
  assert.match(config, /constexpr unsigned long TASK1_FIRST_BYPASS_TURN_LEFT_MS = 700;/);
  assert.match(firmware, /enum class Task1AutopilotPhase/);
  assert.match(firmware, /Task1AutopilotPhase::StartForward/);
  assert.match(firmware, /Task1AutopilotPhase::FirstBypassTurnRight/);
  assert.match(firmware, /Task1AutopilotPhase::FirstBypassForward/);
  assert.match(firmware, /Task1AutopilotPhase::FirstBypassTurnLeft/);
  assert.match(firmware, /Task1AutopilotPhase::GateForward/);
  assert.match(firmware, /Task1AutopilotPhase::ApproachBlack/);
  assert.match(firmware, /void updateTask1BodyAutopilot\(unsigned long now\)/);
  assert.match(firmware, /task1CenterObstacleDetected\(\)/);
  assert.match(firmware, /ultrasonicState\.centerCm <= TASK1_AUTOPILOT_OBSTACLE_CM/);
  assert.match(firmware, /commandVisionOttoMode\(OttoMoveMode::TurnRight, now\)/);
  assert.match(firmware, /commandVisionOttoMode\(OttoMoveMode::TurnLeft, now\)/);
  assert.match(firmware, /commandVisionOttoMode\(OttoMoveMode::StraightForward, now\)/);
  assert.match(firmware, /if \(visionAutopilotState\.task == "task1"\)[\s\S]*updateTask1BodyAutopilot\(now\);/);
  assert.match(firmware, /updateUltrasonic\(now\);[\s\S]*updateTask1BodyAutopilot\(now\);/);
  assert.match(
    firmware,
    /if \(\s*visionAutopilotState\.activeMode == mode &&\s*ottoGaitState\.active\s*\)\s*\{\s*return;\s*\}/
  );
});

test('task1 front-pole bypass command centers between stable Otto gait segments', () => {
  assert.match(config, /constexpr float TASK1_FRONT_POLE_TRIGGER_CM = 17\.0f;/);
  assert.match(config, /constexpr unsigned long TASK1_FRONT_POLE_CENTER_MS = 450;/);
  assert.match(config, /constexpr unsigned long TASK1_FRONT_POLE_TURN_60_MS = 900;/);
  assert.match(config, /constexpr unsigned long TASK1_FRONT_POLE_FORWARD_MS = 1200;/);
  assert.match(firmware, /enum class Task1FrontPoleBypassPhase/);
  assert.match(firmware, /Task1FrontPoleBypassPhase::Approach/);
  assert.match(firmware, /Task1FrontPoleBypassPhase::TurnRightOut/);
  assert.match(firmware, /Task1FrontPoleBypassPhase::ForwardSideEntry/);
  assert.match(firmware, /Task1FrontPoleBypassPhase::TurnLeftAlongside/);
  assert.match(firmware, /Task1FrontPoleBypassPhase::ForwardPassSide/);
  assert.match(firmware, /Task1FrontPoleBypassPhase::TurnLeftReturn/);
  assert.match(firmware, /Task1FrontPoleBypassPhase::ForwardReturnCenter/);
  assert.match(firmware, /Task1FrontPoleBypassPhase::TurnRightRecover/);
  assert.match(firmware, /void startTask1FrontPoleBypass\(unsigned long now\)/);
  assert.match(firmware, /void updateTask1FrontPoleBypass\(unsigned long now\)/);
  assert.match(firmware, /centerPhysicalPose\(\);[\s\S]*Task1FrontPoleBypassPhase::CenterBeforeTurnRightOut/);
  assert.match(firmware, /startOttoGait\(OttoMoveMode::TurnRight, ottoMotionProfileForMode\(OttoMoveMode::TurnRight\)\)/);
  assert.match(firmware, /startOttoGait\(OttoMoveMode::StraightForward, ottoMotionProfileForMode\(OttoMoveMode::StraightForward\)\)/);
  assert.match(firmware, /startOttoGait\(OttoMoveMode::TurnLeft, ottoMotionProfileForMode\(OttoMoveMode::TurnLeft\)\)/);
  assert.match(firmware, /if \(type == "task1_front_pole_bypass"\)/);
  assert.match(firmware, /updateTask1FrontPoleBypass\(now\);/);
});

test('Otto control page exposes four named servos and sine gait moves with lateral adjust steps', () => {
  assert.match(config, /constexpr uint8_t SERVO_COUNT = 9;/);
  assert.match(config, /PCA9685_CHANNELS\[SERVO_COUNT\]\s*=\s*\{15, 0, 12, 3, 9, 6, 14, 4, 11\}/);
  assert.match(firmware, /constexpr uint8_t SERVO_OTTO_LEFT_LEG = 0;/);
  assert.match(firmware, /constexpr uint8_t SERVO_OTTO_RIGHT_LEG = 1;/);
  assert.match(firmware, /constexpr uint8_t SERVO_OTTO_LEFT_HIP = 8;/);
  assert.match(firmware, /constexpr uint8_t SERVO_OTTO_RIGHT_HIP = 7;/);
  assert.match(firmware, /constexpr OttoMotionProfile OTTO_DEFAULT_MOTION_PROFILES\[OTTO_MOTION_PROFILE_COUNT\] = \{/);
  assert.match(firmware, /void updateOttoGait\(\)/);
  assert.match(firmware, /OTTO_GAIT_PERIOD_MS/);
  assert.match(firmware, /float leftLegAmplitude = ottoGaitState\.motionProfile\.leftLegAmplitudeDeg;/);
  assert.match(firmware, /float rightHipAmplitude = ottoGaitState\.motionProfile\.rightHipAmplitudeDeg;/);
  assert.match(firmware, /JsonObject ottoMotionProfiles = doc\["ottoMotionProfiles"\]\.to<JsonObject>\(\);/);
  assert.match(
    firmware,
    /if \(direction == "otto_forward"\)\s*\{\s*startOttoGait\(OttoMoveMode::StraightForward, resolveOttoMotionProfile\(OttoMoveMode::StraightForward, motionProfileOverride\)\);/
  );
  assert.match(
    firmware,
    /if \(direction == "otto_async_forward"\)\s*\{\s*startOttoGait\(OttoMoveMode::AsyncForward, resolveOttoMotionProfile\(OttoMoveMode::AsyncForward, motionProfileOverride\)\);/
  );
  assert.match(
    firmware,
    /if \(direction == "otto_backward"\)\s*\{\s*startOttoGait\(OttoMoveMode::StraightBackward, resolveOttoMotionProfile\(OttoMoveMode::StraightBackward, motionProfileOverride\)\);/
  );
  assert.match(
    firmware,
    /if \(direction == "otto_async_backward"\)\s*\{\s*startOttoGait\(OttoMoveMode::AsyncBackward, resolveOttoMotionProfile\(OttoMoveMode::AsyncBackward, motionProfileOverride\)\);/
  );
  assert.match(
    firmware,
    /if \(direction == "otto_left"\)\s*\{\s*startOttoGait\(OttoMoveMode::TurnLeft, resolveOttoMotionProfile\(OttoMoveMode::TurnLeft, motionProfileOverride\)\);/
  );
  assert.match(
    firmware,
    /if \(direction == "otto_right"\)\s*\{\s*startOttoGait\(OttoMoveMode::TurnRight, resolveOttoMotionProfile\(OttoMoveMode::TurnRight, motionProfileOverride\)\);/
  );
  assert.match(
    firmware,
    /if \(direction == "otto_shift_left"\)\s*\{\s*startOttoGait\(OttoMoveMode::ShiftLeft, resolveOttoMotionProfile\(OttoMoveMode::ShiftLeft, motionProfileOverride\)\);/
  );
  assert.match(
    firmware,
    /if \(direction == "otto_shift_right"\)\s*\{\s*startOttoGait\(OttoMoveMode::ShiftRight, resolveOttoMotionProfile\(OttoMoveMode::ShiftRight, motionProfileOverride\)\);/
  );
  assert.match(firmware, /case OttoMoveMode::StraightForward:/);
  assert.match(
    firmware,
    /case OttoMoveMode::StraightForward:\s*leftLegPhase = basePhase \+ K_HALF_PI;\s*rightLegPhase = basePhase \+ K_HALF_PI;\s*leftHipPhase = basePhase;\s*rightHipPhase = basePhase;/
  );
  assert.match(
    firmware,
    /case OttoMoveMode::StraightBackward:\s*leftLegPhase = basePhase - K_HALF_PI;\s*rightLegPhase = basePhase - K_HALF_PI;\s*leftHipPhase = basePhase;\s*rightHipPhase = basePhase;/
  );
  assert.match(firmware, /case OttoMoveMode::AsyncForward:[\s\S]*leftLegPhase = basePhase \+ K_HALF_PI;[\s\S]*rightLegPhase = basePhase - K_HALF_PI;[\s\S]*leftHipPhase = basePhase;[\s\S]*rightHipPhase = basePhase \+ K_PI;/);
  assert.match(firmware, /case OttoMoveMode::AsyncBackward:[\s\S]*leftLegPhase = basePhase - K_HALF_PI;[\s\S]*rightLegPhase = basePhase \+ K_HALF_PI;[\s\S]*leftHipPhase = basePhase;[\s\S]*rightHipPhase = basePhase \+ K_PI;/);
  assert.match(firmware, /case OttoMoveMode::TurnLeft:[\s\S]*leftLegPhase = basePhase \+ K_HALF_PI;[\s\S]*rightLegPhase = basePhase \+ K_HALF_PI;[\s\S]*leftHipPhase = basePhase;[\s\S]*rightHipPhase = basePhase;[\s\S]*leftLegAmplitude \*= OTTO_LEFT_TURN_INNER_LEG_SCALE;[\s\S]*rightLegAmplitude \*= OTTO_LEFT_TURN_OUTER_LEG_SCALE;[\s\S]*leftHipAmplitude \*= OTTO_LEFT_TURN_INNER_HIP_SCALE;[\s\S]*rightHipAmplitude \*= OTTO_LEFT_TURN_OUTER_HIP_SCALE;/);
  assert.match(firmware, /case OttoMoveMode::TurnRight:[\s\S]*leftLegPhase = basePhase \+ K_HALF_PI;[\s\S]*rightLegPhase = basePhase \+ K_HALF_PI;[\s\S]*leftHipPhase = basePhase;[\s\S]*rightHipPhase = basePhase;[\s\S]*leftHipAmplitude \*= OTTO_TURN_OUTER_SIDE_SCALE;[\s\S]*rightHipAmplitude \*= OTTO_TURN_INNER_SIDE_SCALE;/);
  assert.match(firmware, /constexpr float OTTO_SHIFT_HIP_OFFSET_DEG = 10\.0f;/);
  assert.match(firmware, /constexpr float K_ONE_THIRD_PI = 1\.0471976f;/);
  assert.match(firmware, /case OttoMoveMode::ShiftLeft:[\s\S]*leftLegAmplitude \*= OTTO_SHIFT_LEG_DRAG_SCALE;[\s\S]*rightLegAmplitude \*= OTTO_SHIFT_LEG_DRAG_SCALE;[\s\S]*leftLegPhase = basePhase \+ K_HALF_PI;[\s\S]*rightLegPhase = basePhase \+ K_HALF_PI;[\s\S]*leftHipPhase = basePhase;[\s\S]*rightHipPhase = basePhase - K_ONE_THIRD_PI;[\s\S]*leftHipOffset = OTTO_SHIFT_HIP_OFFSET_DEG;[\s\S]*rightHipOffset = -OTTO_SHIFT_HIP_OFFSET_DEG;/);
  assert.match(firmware, /case OttoMoveMode::ShiftRight:[\s\S]*leftLegAmplitude \*= OTTO_SHIFT_LEG_DRAG_SCALE;[\s\S]*rightLegAmplitude \*= OTTO_SHIFT_LEG_DRAG_SCALE;[\s\S]*leftLegPhase = basePhase \+ K_HALF_PI;[\s\S]*rightLegPhase = basePhase \+ K_HALF_PI;[\s\S]*leftHipPhase = basePhase;[\s\S]*rightHipPhase = basePhase \+ K_ONE_THIRD_PI;[\s\S]*leftHipOffset = -OTTO_SHIFT_HIP_OFFSET_DEG;[\s\S]*rightHipOffset = OTTO_SHIFT_HIP_OFFSET_DEG;/);
  assert.match(firmware, /JsonVariantConst motionProfileOverride = doc\["ottoMotionProfile"\];/);
  assert.match(firmware, /if \(motionProfileOverride\.isNull\(\)\)\s*\{\s*motionProfileOverride = doc\["motionProfile"\];\s*\}/);
  assert.match(firmware, /if \(direction == "otto_stop"\)\s*\{\s*stopOttoGait\(false, "idle"\);/);
  assert.match(firmware, /robotState\.mode != "otto_forward"/);
  assert.match(firmware, /robotState\.mode != "otto_shift_left"/);
  assert.match(firmware, /robotState\.mode != "otto_shift_right"/);
  assert.match(dashboardConfig, /label:\s*'实时控制区\(Otto\)'/);
  assert.match(dashboardConfig, /label:\s*'左腿', channel:\s*15/);
  assert.match(dashboardConfig, /label:\s*'右腿', channel:\s*0/);
  assert.match(dashboardConfig, /label:\s*'左胯', channel:\s*11/);
  assert.match(dashboardConfig, /label:\s*'右胯', channel:\s*4/);
  assert.match(dashboardConfig, /label:\s*'同步直行', payload:\s*\{ type:\s*'move', direction:\s*'otto_forward'/);
  assert.match(dashboardConfig, /label:\s*'异步直行', payload:\s*\{ type:\s*'move', direction:\s*'otto_async_forward'/);
  assert.match(dashboardConfig, /label:\s*'同步后退', payload:\s*\{ type:\s*'move', direction:\s*'otto_backward'/);
  assert.match(dashboardConfig, /label:\s*'异步后退', payload:\s*\{ type:\s*'move', direction:\s*'otto_async_backward'/);
  assert.match(dashboardConfig, /direction:\s*'otto_left'/);
  assert.match(dashboardConfig, /direction:\s*'otto_right'/);
  assert.match(dashboardConfig, /label:\s*'左修正', payload:\s*\{ type:\s*'move', direction:\s*'otto_shift_left'/);
  assert.match(dashboardConfig, /label:\s*'右修正', payload:\s*\{ type:\s*'move', direction:\s*'otto_shift_right'/);
  assert.match(dashboardConfig, /direction:\s*'otto_stop'/);
});

test('center ultrasonic sensor is configured for final go dashboard telemetry', () => {
  assert.match(config, /constexpr bool ULTRASONIC_ENABLED = true;/);
  assert.match(config, /constexpr int ULTRASONIC_CENTER_TRIG_PIN = 27;/);
  assert.match(config, /constexpr int ULTRASONIC_CENTER_ECHO_PIN = 14;/);
  assert.doesNotMatch(config, /ULTRASONIC_LEFT_TRIG_PIN/);
  assert.doesNotMatch(config, /ULTRASONIC_RIGHT_TRIG_PIN/);
  assert.match(firmware, /struct UltrasonicState/);
  assert.match(firmware, /void initUltrasonic\(\)/);
  assert.match(firmware, /pulseIn\(echoPin, HIGH, ULTRASONIC_ECHO_TIMEOUT_US\)/);
  assert.match(firmware, /updateUltrasonic\(now\);/);
  assert.match(firmware, /JsonObject ultrasonic = doc\["ultrasonic"\]\.to<JsonObject>\(\);/);
  assert.match(firmware, /writeNullableFloat\(ultrasonic, "centerCm", ultrasonicState\.centerValid, ultrasonicState\.centerCm, 1\);/);
  assert.match(firmware, /ultrasonicPins\["centerTrig"\] = ULTRASONIC_CENTER_TRIG_PIN;/);
});

test('Otto turn moves use differential forward phases while async forward keeps opposed phases', () => {
  assert.match(firmware, /constexpr float K_PI = 3\.1415926f;/);
  assert.doesNotMatch(firmware, /OTTO_FORWARD_RIGHT_LEG_CORRECTION/);
  assert.doesNotMatch(firmware, /OTTO_FORWARD_RIGHT_HIP_CORRECTION/);
  assert.doesNotMatch(firmware, /OTTO_ASYNC_FORWARD_AMPLITUDE_SCALE/);
  assert.doesNotMatch(firmware, /OTTO_ASYNC_LEFT_LEG_CORRECTION/);
  assert.doesNotMatch(firmware, /OTTO_ASYNC_LEFT_HIP_CORRECTION/);
  assert.doesNotMatch(firmware, /OTTO_ASYNC_RIGHT_LEG_CORRECTION/);
  assert.doesNotMatch(firmware, /OTTO_ASYNC_RIGHT_HIP_CORRECTION/);
  assert.match(firmware, /constexpr uint32_t OTTO_MOTION_PROFILE_STORAGE_VERSION = 3;/);
  assert.match(firmware, /constexpr float OTTO_LEFT_TURN_INNER_LEG_SCALE = 0\.45f;/);
  assert.match(firmware, /constexpr float OTTO_LEFT_TURN_OUTER_LEG_SCALE = 0\.85f;/);
  assert.match(firmware, /constexpr float OTTO_LEFT_TURN_INNER_HIP_SCALE = 0\.12f;/);
  assert.match(firmware, /constexpr float OTTO_LEFT_TURN_OUTER_HIP_SCALE = 0\.95f;/);
  assert.match(firmware, /constexpr float OTTO_TURN_INNER_SIDE_SCALE = 0\.20f;/);
  assert.match(firmware, /constexpr float OTTO_TURN_OUTER_SIDE_SCALE = 1\.35f;/);
  assert.match(
    firmware,
    /case OttoMoveMode::StraightForward:[\s\S]*leftLegPhase = basePhase \+ K_HALF_PI;[\s\S]*rightLegPhase = basePhase \+ K_HALF_PI;[\s\S]*leftHipPhase = basePhase;[\s\S]*rightHipPhase = basePhase;[\s\S]*break;/
  );
  assert.match(
    firmware,
    /case OttoMoveMode::AsyncForward:[\s\S]*leftLegPhase = basePhase \+ K_HALF_PI;[\s\S]*rightLegPhase = basePhase - K_HALF_PI;[\s\S]*leftHipPhase = basePhase;[\s\S]*rightHipPhase = basePhase \+ K_PI;[\s\S]*break;/
  );
  assert.match(firmware, /if \(storedVersion < 2\)[\s\S]*migrateHiddenOttoMotionProfileScales\(savedProfiles\);/);
  assert.match(firmware, /if \(storedVersion < 3\)[\s\S]*migrateCrusaitoShiftProfiles\(savedProfiles\);/);
  assert.match(firmware, /isLegacyShiftProfile\(ottoMotionProfiles\[6\]\)/);
  assert.match(firmware, /ottoMotionProfiles\[6\] = OTTO_DEFAULT_MOTION_PROFILES\[6\];/);
  assert.match(firmware, /ottoMotionProfiles\[0\]\.rightLegAmplitudeDeg \*= 1\.10f;/);
  assert.match(firmware, /ottoMotionProfiles\[1\]\.leftLegAmplitudeDeg \*= 0\.72f \* 1\.18f;/);
  assert.match(firmware, /ottoPreferences\.putUInt\("profilesVersion", OTTO_MOTION_PROFILE_STORAGE_VERSION\);/);
  assert.match(
    firmware,
    /case OttoMoveMode::TurnLeft:[\s\S]*leftLegPhase = basePhase \+ K_HALF_PI;[\s\S]*rightLegPhase = basePhase \+ K_HALF_PI;[\s\S]*leftHipPhase = basePhase;[\s\S]*rightHipPhase = basePhase;[\s\S]*leftLegAmplitude \*= OTTO_LEFT_TURN_INNER_LEG_SCALE;[\s\S]*rightLegAmplitude \*= OTTO_LEFT_TURN_OUTER_LEG_SCALE;[\s\S]*leftHipAmplitude \*= OTTO_LEFT_TURN_INNER_HIP_SCALE;[\s\S]*rightHipAmplitude \*= OTTO_LEFT_TURN_OUTER_HIP_SCALE;/
  );
  assert.match(
    firmware,
    /case OttoMoveMode::TurnRight:[\s\S]*leftLegPhase = basePhase \+ K_HALF_PI;[\s\S]*rightLegPhase = basePhase \+ K_HALF_PI;[\s\S]*leftHipPhase = basePhase;[\s\S]*rightHipPhase = basePhase;[\s\S]*leftHipAmplitude \*= OTTO_TURN_OUTER_SIDE_SCALE;[\s\S]*rightHipAmplitude \*= OTTO_TURN_INNER_SIDE_SCALE;/
  );
  assert.match(firmware, /"otto_async_forward"/);
  assert.match(firmware, /"otto_async_backward"/);
  assert.match(firmware, /robotState\.mode != "otto_async_forward"/);
  assert.match(firmware, /robotState\.mode != "otto_async_backward"/);
  assert.match(dashboardConfig, /label:\s*'同步直行', payload:\s*\{ type:\s*'move', direction:\s*'otto_forward'/);
  assert.match(dashboardConfig, /label:\s*'异步直行', payload:\s*\{ type:\s*'move', direction:\s*'otto_async_forward'/);
  assert.match(dashboardConfig, /label:\s*'同步后退', payload:\s*\{ type:\s*'move', direction:\s*'otto_backward'/);
  assert.match(dashboardConfig, /label:\s*'异步后退', payload:\s*\{ type:\s*'move', direction:\s*'otto_async_backward'/);
  assert.match(dashboardConfig, /direction:\s*'otto_left'[\s\S]*leftHipAmplitudeDeg:\s*20,\s*rightHipAmplitudeDeg:\s*20/);
  assert.match(dashboardConfig, /direction:\s*'otto_right'[\s\S]*leftHipAmplitudeDeg:\s*20,\s*rightHipAmplitudeDeg:\s*20/);
});

test('Otto motion profiles are surfaced in status and persisted through a save command', () => {
  assert.match(firmware, /constexpr size_t OTTO_MOTION_PROFILE_COUNT = 8;/);
  assert.match(firmware, /"otto_async_forward"/);
  assert.match(firmware, /"otto_async_backward"/);
  assert.match(firmware, /"otto_shift_left"/);
  assert.match(firmware, /"otto_shift_right"/);
  assert.match(firmware, /case OttoMoveMode::AsyncForward:[\s\S]*return 1;/);
  assert.match(firmware, /case OttoMoveMode::StraightBackward:[\s\S]*return 2;/);
  assert.match(firmware, /case OttoMoveMode::AsyncBackward:[\s\S]*return 3;/);
  assert.match(firmware, /case OttoMoveMode::ShiftLeft:[\s\S]*return 6;/);
  assert.match(firmware, /case OttoMoveMode::ShiftRight:[\s\S]*return 7;/);
  assert.match(firmware, /struct OttoMotionProfile/);
  assert.match(firmware, /unsigned long periodMs;/);
  assert.match(firmware, /periodMs\(OTTO_GAIT_PERIOD_MS\)/);
  assert.match(firmware, /constexpr OttoMotionProfile OTTO_DEFAULT_MOTION_PROFILES\[OTTO_MOTION_PROFILE_COUNT\]/);
  assert.match(firmware, /void loadOttoMotionProfiles\(\)/);
  assert.match(firmware, /void saveOttoMotionProfiles\(\)/);
  assert.match(firmware, /void migrateLegacyOttoMotionProfiles\(\)/);
  assert.match(firmware, /isLegacyTurnProfile\(ottoMotionProfiles\[4\], 18\.0f, 7\.0f\)/);
  assert.match(firmware, /isLegacyTurnProfile\(ottoMotionProfiles\[5\], 7\.0f, 18\.0f\)/);
  assert.match(firmware, /void appendOttoMotionProfilesJson\(JsonObject target\)/);
  assert.match(firmware, /JsonObject defaultProfiles = target\["default"\]\.to<JsonObject>\(\);/);
  assert.match(firmware, /JsonObject savedProfiles = target\["saved"\]\.to<JsonObject>\(\);/);
  assert.match(firmware, /if \(type == "otto_motion_profile_save"\)\s*\{/);
  assert.match(firmware, /JsonObject ottoMotionProfiles = doc\["ottoMotionProfiles"\]\.to<JsonObject>\(\);/);
  assert.match(firmware, /doc\["profile"\]/);
  assert.match(firmware, /doc\["motionProfile"\]/);
  assert.match(firmware, /doc\["ottoMotionProfile"\]/);
  assert.match(firmware, /target\["periodMs"\] = profile\.periodMs;/);
  assert.match(firmware, /profile\.periodMs = constrain\(/);
  assert.match(firmware, /applyOttoMotionProfileOverride\(profile, doc\["motionProfile"\]\);/);
  assert.match(firmware, /applyOttoMotionProfileOverride\(profile, doc\["ottoMotionProfile"\]\);/);
  assert.match(dashboardConfig, /otto_async_forward:\s*\{/);
  assert.match(dashboardConfig, /\{ id:\s*'otto_async_forward', label:\s*'异步直行' \}/);
  assert.match(dashboardConfig, /otto_shift_left:\s*\{/);
  assert.match(dashboardConfig, /otto_shift_right:\s*\{/);
  assert.match(dashboardConfig, /\{ id:\s*'otto_shift_left', label:\s*'左修正' \}/);
  assert.match(dashboardConfig, /\{ id:\s*'otto_shift_right', label:\s*'右修正' \}/);
});

test('vision UART autopilot is disabled by default so camera connection does not start motion', () => {
  assert.match(config, /constexpr bool VISION_UART_AUTOPILOT_ENABLED = false;/);
  assert.match(config, /constexpr float VISION_AUTOPILOT_MIN_CONFIDENCE = 0\.50f;/);
  assert.match(firmware, /struct VisionAutopilotState/);
  assert.match(firmware, /bool enabled = VISION_UART_AUTOPILOT_ENABLED;/);
  assert.match(firmware, /String task = "idle";/);
  assert.match(firmware, /doc\["visionAutopilot"\]/);
  assert.match(firmware, /if \(type == "vision_autopilot"\)\s*\{/);
  assert.match(firmware, /setVisionAutopilotEnabled\(enabled, task\);/);
  assert.match(firmware, /task != "task1" && task != "task2"/);
  assert.match(firmware, /void handleVisionSerialInput\(\)/);
  assert.match(firmware, /deserializeJson\(doc, visionLineBuffer\)/);
  assert.match(firmware, /doc\["type"\]\s*\|\s*""/);
  assert.match(firmware, /type != "vision"/);
  assert.match(firmware, /applyVisionAutopilot\(found, confidence, cx, frameWidth, now\)/);
  assert.match(firmware, /void commandVisionOttoMode\(OttoMoveMode mode, unsigned long now\)/);
  assert.match(firmware, /startOttoGait\(mode,\s*ottoMotionProfileForMode\(mode\)\)/);
  assert.match(firmware, /commandVisionOttoMode\(OttoMoveMode::Forward, now\)/);
  assert.match(firmware, /commandVisionOttoMode\(OttoMoveMode::Backward, now\)/);
  assert.doesNotMatch(firmware, /commandVisionOttoMode\(OttoMoveMode::ShiftLeft, now\)/);
  assert.match(firmware, /void stopVisionAutopilot\(const char\* nextMode = "vision_lost"\)/);
  assert.match(firmware, /stopOttoGait\(false,\s*nextMode\)/);
  assert.match(firmware, /handleVisionSerialInput\(\);/);
  assert.match(firmware, /updateVisionAutopilotTimeout\(now\);/);
});

test('boundary guard is configurable and surfaced in robot status', () => {
  assert.match(config, /constexpr bool BOUNDARY_GUARD_ENABLED = true;/);
  assert.match(config, /constexpr int BOUNDARY_LEFT_FRONT_PIN = -1;/);
  assert.match(config, /constexpr int BOUNDARY_RIGHT_FRONT_PIN = -1;/);
  assert.match(config, /constexpr bool BOUNDARY_SENSOR_ACTIVE_LOW = true;/);
  assert.match(firmware, /struct BoundaryGuardState/);
  assert.match(firmware, /void initBoundaryGuard\(\)/);
  assert.match(firmware, /bool updateBoundaryGuard\(unsigned long now\)/);
  assert.match(firmware, /JsonObject boundaryGuard = doc\["boundaryGuard"\]\.to<JsonObject>\(\);/);
  assert.match(firmware, /boundaryGuard\["configured"\] = isBoundaryGuardConfigured\(\);/);
  assert.match(firmware, /modules\.add\("boundary_guard"\);/);
  assert.match(firmware, /if \(!robotState\.otaInProgress && updateBoundaryGuard\(now\)\)\s*\{\s*return;/);
});

test('WiFi failover tries Cudy router for 10 seconds before phone hotspot', () => {
  const secrets = readFileSync(new URL('./include/secrets.h', import.meta.url), 'utf8');

  assert.match(secrets, /#define WIFI_PRIMARY_SSID "Cudy-8434"/);
  assert.match(secrets, /#define WIFI_PRIMARY_PASSWORD "13390877"/);
  assert.match(secrets, /#define WIFI_FALLBACK_SSID "yyniPhone"/);
  assert.match(secrets, /#define WIFI_FALLBACK_PASSWORD "yyn20050810"/);
  assert.match(config, /constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 10000;/);
  assert.match(config, /WIFI_PRIMARY_STATIC_IP\[4\] = \{192, 168, 10, 10\}/);
  assert.match(config, /WIFI_PRIMARY_GATEWAY\[4\] = \{192, 168, 10, 1\}/);
  assert.match(config, /WIFI_PRIMARY_SUBNET\[4\] = \{255, 255, 255, 0\}/);
  assert.match(config, /WIFI_FALLBACK_STATIC_IP\[4\] = \{172, 20, 10, 10\}/);
  assert.match(config, /WIFI_FALLBACK_GATEWAY\[4\] = \{172, 20, 10, 1\}/);
  assert.match(firmware, /const WifiProfile wifiProfiles\[\]/);
  assert.match(firmware, /"cudy-router"/);
  assert.match(firmware, /"phone-hotspot"/);
  assert.match(firmware, /millis\(\) - startedAt < WIFI_CONNECT_TIMEOUT_MS/);
  assert.match(firmware, /for \(const WifiProfile& profile : wifiProfiles\)/);
  assert.match(firmware, /network\["ssid"\] = WiFi\.SSID\(\);/);
  assert.match(firmware, /network\["profile"\] = activeWifiProfileName;/);
});
