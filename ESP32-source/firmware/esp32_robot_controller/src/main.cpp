#include <Arduino.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <WiFi.h>
#include <Wire.h>
#include <Preferences.h>
#include "robot_config.h"
#include "secrets.h"

AsyncWebServer server(80);
AsyncWebSocket socketServer("/ws");
Preferences preferences;
Preferences ottoPreferences;

namespace {
constexpr uint8_t PCA9685_MODE1_REGISTER = 0x00;
constexpr uint8_t PCA9685_MODE2_REGISTER = 0x01;
constexpr uint8_t PCA9685_PRESCALE_REGISTER = 0xFE;
constexpr uint8_t PCA9685_LED0_ON_L_REGISTER = 0x06;
constexpr uint8_t MPU6050_WHO_AM_I_REGISTER = 0x75;
constexpr uint8_t MPU6050_PWR_MGMT_1_REGISTER = 0x6B;
constexpr uint8_t MPU6050_SMPLRT_DIV_REGISTER = 0x19;
constexpr uint8_t MPU6050_CONFIG_REGISTER = 0x1A;
constexpr uint8_t MPU6050_GYRO_CONFIG_REGISTER = 0x1B;
constexpr uint8_t MPU6050_ACCEL_CONFIG_REGISTER = 0x1C;
constexpr uint8_t MPU6050_ACCEL_XOUT_H_REGISTER = 0x3B;
constexpr float MPU6050_ACCEL_SCALE = 16384.0f;
constexpr float MPU6050_GYRO_SCALE = 131.0f;
constexpr float K_RADIANS_TO_DEGREES = 57.2957795f;
constexpr float K_DEGREES_TO_RADIANS = 0.0174532925f;
constexpr float PENGUIN_SHIFT_LEAN_FACTOR = 0.45f;
constexpr float PENGUIN_SWING_LEAN_FACTOR = 0.72f;
constexpr uint8_t SERVO_LEFT_KNEE = 0;
constexpr uint8_t SERVO_RIGHT_KNEE = 1;
constexpr uint8_t SERVO_LEFT_HIP_ROLL = 2;
constexpr uint8_t SERVO_RIGHT_HIP_ROLL = 3;
constexpr uint8_t SERVO_LEFT_HIP_PITCH = 4;
constexpr uint8_t SERVO_RIGHT_HIP_PITCH = 5;
constexpr uint8_t SERVO_NECK = 6;
constexpr uint8_t SERVO_OTTO_LEFT_LEG = 0;
constexpr uint8_t SERVO_OTTO_RIGHT_LEG = 1;
constexpr uint8_t SERVO_OTTO_RIGHT_HIP = 7;
constexpr uint8_t SERVO_OTTO_LEFT_HIP = 8;
constexpr unsigned long LATERAL_STEP_PHASE_MS = 450;
constexpr unsigned long FORWARD_STEP_PHASE_MS = 650;
constexpr unsigned long FORWARD_WEIGHT_SHIFT_MS = 650;
constexpr float LEFT_LEAN_OFFSET = -4.0f;
constexpr float RIGHT_LEAN_OFFSET = 4.0f;
constexpr unsigned long OTTO_GAIT_PERIOD_MS = 1200;
constexpr unsigned long OTTO_GAIT_SAMPLE_MS = 30;
constexpr float OTTO_LEG_AMPLITUDE_DEG = 18.0f;
constexpr float OTTO_TURN_INNER_LEG_AMPLITUDE_DEG = 7.0f;
constexpr float OTTO_HIP_AMPLITUDE_DEG = 12.0f;
constexpr float OTTO_STRAIGHT_LEFT_LEG_AMPLITUDE_DEG = 12.0f;
constexpr float OTTO_STRAIGHT_RIGHT_LEG_AMPLITUDE_DEG = 10.5f;
constexpr float OTTO_STRAIGHT_LEFT_HIP_AMPLITUDE_DEG = 18.0f;
constexpr float OTTO_STRAIGHT_RIGHT_HIP_AMPLITUDE_DEG = 16.5f;
constexpr float OTTO_LEFT_LEG_OFFSET_DEG = 2.0f;
constexpr float OTTO_RIGHT_LEG_OFFSET_DEG = -2.0f;
constexpr float OTTO_LEFT_HIP_OFFSET_DEG = 2.0f;
constexpr float OTTO_RIGHT_HIP_OFFSET_DEG = -2.0f;
constexpr float OTTO_LEFT_TURN_INNER_LEG_SCALE = 0.45f;
constexpr float OTTO_LEFT_TURN_OUTER_LEG_SCALE = 0.85f;
constexpr float OTTO_LEFT_TURN_INNER_HIP_SCALE = 0.12f;
constexpr float OTTO_LEFT_TURN_OUTER_HIP_SCALE = 0.95f;
constexpr float OTTO_TURN_INNER_SIDE_SCALE = 0.20f;
constexpr float OTTO_TURN_OUTER_SIDE_SCALE = 1.35f;
constexpr float OTTO_SHIFT_LEG_DRAG_SCALE = 0.65f;
constexpr float OTTO_SHIFT_HIP_OFFSET_DEG = 10.0f;
constexpr uint32_t OTTO_MOTION_PROFILE_STORAGE_VERSION = 3;
constexpr size_t OTTO_MOTION_PROFILE_COUNT = 8;
constexpr const char* const OTTO_MOTION_PROFILE_NAMES[OTTO_MOTION_PROFILE_COUNT] = {
  "otto_forward",
  "otto_async_forward",
  "otto_backward",
  "otto_async_backward",
  "otto_left",
  "otto_right",
  "otto_shift_left",
  "otto_shift_right"
};
constexpr float K_TWO_PI = 6.2831853f;
constexpr float K_PI = 3.1415926f;
constexpr float K_HALF_PI = 1.5707963f;
constexpr float K_ONE_THIRD_PI = 1.0471976f;
}

struct GaitParams {
  float leanAngleDeg = 8.0f;
  float hipSwingDeg = 12.0f;
  float kneeLiftDeg = 14.0f;
  float stanceKneeDeg = 104.0f;
  unsigned long doubleSupportMs = 240;
  unsigned long swingPhaseMs = 460;
  float torsoLeadDeg = 1.0f;
  float neckTrimDeg = 1.5f;
};

enum class GaitPhase : uint8_t {
  Idle,
  ShiftLeft,
  SwingRight,
  ShiftRight,
  SwingLeft
};

struct GaitState {
  bool active = false;
  bool telemetryAvailable = false;
  bool manualControl = false;
  uint32_t trialId = 0;
  unsigned long startedAt = 0;
  unsigned long phaseStartedAt = 0;
  unsigned long durationMs = 0;
  uint32_t stepCount = 0;
  float estimatedForwardProgress = 0.0f;
  float baselineYaw = 0.0f;
  float baselineRoll = 0.0f;
  float stabilityScore = 0.0f;
  float lateralDriftMeters = 0.0f;
  float yawDriftDeg = 0.0f;
  GaitPhase phase = GaitPhase::Idle;
  GaitParams params;
};

enum class LateralStepPhase : uint8_t {
  Idle,
  PreloadRight,
  ShiftLeft,
  ShiftRight
};

struct LateralStepState {
  bool active = false;
  unsigned long phaseStartedAt = 0;
  uint32_t cycleCount = 0;
  LateralStepPhase phase = LateralStepPhase::Idle;
};

enum class ForwardStepPhase : uint8_t {
  Idle,
  ShiftToRightForLeft,
  LeftLift,
  LeftSwing,
  LeftLand,
  ShiftToLeftForSupport,
  LeftFollow,
  RightLift,
  RightSwing,
  RightLand,
  ShiftToRightForSupport,
  RightFollow
};

struct ForwardStepState {
  bool active = false;
  bool flatFootVariant = false;
  unsigned long phaseStartedAt = 0;
  uint32_t cycleCount = 0;
  ForwardStepPhase phase = ForwardStepPhase::Idle;
};

enum class OttoMoveMode : uint8_t {
  Idle,
  StraightForward,
  AsyncForward,
  StraightBackward,
  AsyncBackward,
  Forward,
  Backward,
  TurnLeft,
  TurnLeftFast,
  TurnRight,
  ShiftLeft,
  ShiftRight
};

enum class Task1AutopilotPhase : uint8_t {
  Idle,
  StartForward,
  FirstBypassTurnRight,
  FirstBypassForward,
  FirstBypassTurnLeft,
  GateForward,
  ApproachBlack,
  Completed
};

enum class Task1FrontPoleBypassPhase : uint8_t {
  Idle,
  Approach,
  CenterBeforeTurnRightOut,
  TurnRightOut,
  CenterBeforeForwardSideEntry,
  ForwardSideEntry,
  CenterBeforeTurnLeftAlongside,
  TurnLeftAlongside,
  CenterBeforeForwardPassSide,
  ForwardPassSide,
  CenterBeforeTurnLeftReturn,
  TurnLeftReturn,
  CenterBeforeForwardReturnCenter,
  ForwardReturnCenter,
  CenterBeforeTurnRightRecover,
  TurnRightRecover,
  CenterAfterRecover,
  Completed
};

struct VisionAutopilotState {
  bool enabled = VISION_UART_AUTOPILOT_ENABLED;
  String task = "idle";
  bool hasTarget = false;
  unsigned long lastSeenAt = 0;
  unsigned long lastCommandAt = 0;
  OttoMoveMode activeMode = OttoMoveMode::Idle;
  Task1AutopilotPhase task1Phase = Task1AutopilotPhase::Idle;
  unsigned long task1PhaseStartedAt = 0;
  int task1TargetCx = -1;
  int task1TargetFrameWidth = 0;
  float task1TargetConfidence = 0.0f;
};

struct Task1FrontPoleBypassState {
  bool active = false;
  Task1FrontPoleBypassPhase phase = Task1FrontPoleBypassPhase::Idle;
  unsigned long phaseStartedAt = 0;
};

struct BoundaryGuardState {
  bool configured = false;
  bool active = false;
  bool leftFront = false;
  bool rightFront = false;
  bool leftRear = false;
  bool rightRear = false;
  unsigned long lastTriggeredAt = 0;
  String lastTrigger = "";
};

struct UltrasonicState {
  bool enabled = ULTRASONIC_ENABLED;
  bool centerValid = false;
  float centerCm = 0.0f;
  unsigned long lastReadAt = 0;
};

struct OttoMotionProfile {
  float leftLegAmplitudeDeg;
  float rightLegAmplitudeDeg;
  float leftHipAmplitudeDeg;
  float rightHipAmplitudeDeg;
  unsigned long periodMs;

  constexpr OttoMotionProfile()
    : leftLegAmplitudeDeg(0.0f),
      rightLegAmplitudeDeg(0.0f),
      leftHipAmplitudeDeg(0.0f),
      rightHipAmplitudeDeg(0.0f),
      periodMs(OTTO_GAIT_PERIOD_MS) {}

  constexpr OttoMotionProfile(
    float leftLegAmplitude,
    float rightLegAmplitude,
    float leftHipAmplitude,
    float rightHipAmplitude,
    unsigned long period = OTTO_GAIT_PERIOD_MS)
    : leftLegAmplitudeDeg(leftLegAmplitude),
      rightLegAmplitudeDeg(rightLegAmplitude),
      leftHipAmplitudeDeg(leftHipAmplitude),
      rightHipAmplitudeDeg(rightHipAmplitude),
      periodMs(period) {}
};

constexpr OttoMotionProfile OTTO_DEFAULT_MOTION_PROFILES[OTTO_MOTION_PROFILE_COUNT] = {
  {12.0f, 11.6f, 18.0f, 18.2f},
  {10.2f, 7.6f, 15.3f, 11.9f},
  {12.0f, 10.5f, 18.0f, 16.5f},
  {12.0f, 10.5f, 18.0f, 16.5f},
  {12.0f, 12.0f, 18.0f, 18.0f},
  {12.0f, 12.0f, 18.0f, 18.0f},
  {8.0f, 8.0f, 16.0f, 16.0f},
  {8.0f, 8.0f, 16.0f, 16.0f}
};

struct OttoGaitState {
  bool active = false;
  OttoMoveMode mode = OttoMoveMode::Idle;
  unsigned long startedAt = 0;
  unsigned long lastSampleAt = 0;
  float straightAssistBaselineYaw = 0.0f;
  bool straightAssistActive = false;
  bool straightDiagnosticAvailable = false;
  bool straightDiagnosticRunning = false;
  unsigned long straightDiagnosticStartedAt = 0;
  unsigned long straightDiagnosticElapsedMs = 0;
  float straightDiagnosticBaselineYaw = 0.0f;
  float straightDiagnosticCurrentYaw = 0.0f;
  float straightDiagnosticYawError = 0.0f;
  float straightDiagnosticMaxAbsYawError = 0.0f;
  OttoMotionProfile motionProfile;
};

enum class BowlingTacticPhase : uint8_t {
  Idle,
  Straight,
  RecoverLeft,
  RecoverRight
};

struct BowlingTacticState {
  bool active = false;
  float targetYaw = 0.0f;
  BowlingTacticPhase phase = BowlingTacticPhase::Idle;
  OttoMotionProfile forwardProfile;
  OttoMotionProfile turnLeftProfile;
  OttoMotionProfile turnRightProfile;
};

struct RobotState {
  bool connected = false;
  bool otaInProgress = false;
  bool servoDriverReady = false;
  String mode = "idle";
  String firmwareVersion = FIRMWARE_VERSION;
  String lastDriverError = "";
  float battery = 7.4f;
  int signalStrength = -100;
  unsigned long lastCommandAt = 0;
  unsigned long nextServoWriteRetryAt = 0;
  uint32_t servoWriteFailures = 0;
  uint8_t consecutiveServoWriteFailures = 0;
  bool imuAvailable = false;
  bool imuCalibrated = false;
  bool imuPoseInitialized = false;
  bool imuFallen = false;
  uint8_t imuAddress = 0;
  float imuRoll = 0.0f;
  float imuPitch = 0.0f;
  float imuYaw = 0.0f;
  float imuTemperature = 0.0f;
  float imuAccelX = 0.0f;
  float imuAccelY = 0.0f;
  float imuAccelZ = 0.0f;
  float imuGyroX = 0.0f;
  float imuGyroY = 0.0f;
  float imuGyroZ = 0.0f;
  float imuGyroBiasX = 0.0f;
  float imuGyroBiasY = 0.0f;
  float imuGyroBiasZ = 0.0f;
  unsigned long lastImuReadAt = 0;
  int servoAngles[SERVO_COUNT] = {
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE
  };
  int servoZeroOffsets[SERVO_COUNT] = {
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  };
  uint16_t servoPwmTicks[SERVO_COUNT] = {
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  };
  bool servoPwmActive[SERVO_COUNT] = {
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false
  };
};

RobotState robotState;
GaitState gaitState;
LateralStepState lateralStepState;
ForwardStepState forwardStepState;
OttoGaitState ottoGaitState;
BowlingTacticState bowlingTacticState;
OttoMotionProfile ottoMotionProfiles[OTTO_MOTION_PROFILE_COUNT] = {
  OTTO_DEFAULT_MOTION_PROFILES[0],
  OTTO_DEFAULT_MOTION_PROFILES[1],
  OTTO_DEFAULT_MOTION_PROFILES[2],
  OTTO_DEFAULT_MOTION_PROFILES[3],
  OTTO_DEFAULT_MOTION_PROFILES[4],
  OTTO_DEFAULT_MOTION_PROFILES[5],
  OTTO_DEFAULT_MOTION_PROFILES[6],
  OTTO_DEFAULT_MOTION_PROFILES[7]
};
bool ottoMotionPreferencesReady = false;
VisionAutopilotState visionAutopilotState;
Task1FrontPoleBypassState task1FrontPoleBypassState;
String visionLineBuffer;
BoundaryGuardState boundaryGuardState;
UltrasonicState ultrasonicState;
struct WifiProfile {
  const char* name;
  const char* ssid;
  const char* password;
  const uint8_t* staticIp;
  const uint8_t* gateway;
  const uint8_t* subnet;
  const uint8_t* dnsPrimary;
  const uint8_t* dnsSecondary;
};

const WifiProfile wifiProfiles[] = {
  {
    "cudy-router",
    WIFI_PRIMARY_SSID,
    WIFI_PRIMARY_PASSWORD,
    WIFI_PRIMARY_STATIC_IP,
    WIFI_PRIMARY_GATEWAY,
    WIFI_PRIMARY_SUBNET,
    WIFI_PRIMARY_DNS_PRIMARY,
    WIFI_PRIMARY_DNS_SECONDARY
  },
  {
    "phone-hotspot",
    WIFI_FALLBACK_SSID,
    WIFI_FALLBACK_PASSWORD,
    WIFI_FALLBACK_STATIC_IP,
    WIFI_FALLBACK_GATEWAY,
    WIFI_FALLBACK_SUBNET,
    WIFI_FALLBACK_DNS_PRIMARY,
    WIFI_FALLBACK_DNS_SECONDARY
  }
};

const char* activeWifiProfileName = "none";

void applyServoAngle(uint8_t servoId, int angle);
void applyServoPhysicalAngle(uint8_t servoId, int physicalAngle, bool updateLogicalState = false);
void initPca9685();
void broadcastStatus();
void centerPose();
void centerPhysicalPose();
void stopAllMotion();
void initBoundaryGuard();
bool updateBoundaryGuard(unsigned long now);
bool isBoundaryGuardConfigured();
void restoreServoOutputs();
bool recoverPca9685IfNeeded(unsigned long now, bool force = false);
void stopLateralStep(bool resetPose = true, const String& nextMode = "idle");
void stopForwardStep(bool resetPose = true, const String& nextMode = "idle");
void stopOttoGait(bool resetPose = true, const String& nextMode = "idle");
void startOttoGait(OttoMoveMode mode, const OttoMotionProfile& profile, bool keepBowlingTactic = false);
void cancelBowlingTactic();
void startBowlingTactic(const JsonDocument& doc);
void updateBowlingTactic(unsigned long now);
void loadOttoMotionProfiles();
void saveOttoMotionProfiles();
void saveOttoMotionProfile(const String& profileName, const OttoMotionProfile& profile);
void appendOttoMotionProfilesJson(JsonObject target);
void applyOttoMotionProfileOverride(OttoMotionProfile& profile, JsonVariantConst source);
const OttoMotionProfile& ottoMotionProfileForMode(OttoMoveMode mode);
OttoMotionProfile resolveOttoMotionProfile(OttoMoveMode mode, JsonVariantConst overrideProfile);
float clampFloat(float value, float minValue, float maxValue);
void commandVisionOttoMode(OttoMoveMode mode, unsigned long now);
void updateTask1BodyAutopilot(unsigned long now);
void updateTask1FrontPoleBypass(unsigned long now);

void appendStringArray(JsonArray target, const char* const items[], size_t count) {
  for (size_t index = 0; index < count; index++) {
    target.add(items[index]);
  }
}

void appendServoIdArray(JsonArray target) {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    target.add(index + 1);
  }
}

void appendServoChannelArray(JsonArray target) {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    target.add(PCA9685_CHANNELS[index]);
  }
}

void appendServoInvertedArray(JsonArray target) {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    target.add(SERVO_INVERTED[index]);
  }
}

void appendServoZeroOffsetArray(JsonArray target) {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    target.add(robotState.servoZeroOffsets[index]);
  }
}

bool isConfiguredBoundaryPin(int pin) {
  return pin >= 0;
}

bool isBoundaryGuardConfigured() {
  return BOUNDARY_GUARD_ENABLED &&
         (isConfiguredBoundaryPin(BOUNDARY_LEFT_FRONT_PIN) ||
          isConfiguredBoundaryPin(BOUNDARY_RIGHT_FRONT_PIN) ||
          isConfiguredBoundaryPin(BOUNDARY_LEFT_REAR_PIN) ||
          isConfiguredBoundaryPin(BOUNDARY_RIGHT_REAR_PIN));
}

void configureBoundaryPin(int pin) {
  if (!isConfiguredBoundaryPin(pin)) {
    return;
  }

  pinMode(pin, BOUNDARY_SENSOR_ACTIVE_LOW ? INPUT_PULLUP : INPUT);
}

bool readBoundaryPin(int pin) {
  if (!isConfiguredBoundaryPin(pin)) {
    return false;
  }

  const int value = digitalRead(pin);
  return BOUNDARY_SENSOR_ACTIVE_LOW ? value == LOW : value == HIGH;
}

bool isConfiguredUltrasonicPin(int pin) {
  return pin >= 0;
}

bool isUltrasonicConfigured() {
  return ULTRASONIC_ENABLED &&
         isConfiguredUltrasonicPin(ULTRASONIC_CENTER_TRIG_PIN) &&
         isConfiguredUltrasonicPin(ULTRASONIC_CENTER_ECHO_PIN);
}

void initUltrasonic() {
  ultrasonicState.enabled = isUltrasonicConfigured();
  if (!ultrasonicState.enabled) {
    return;
  }

  pinMode(ULTRASONIC_CENTER_TRIG_PIN, OUTPUT);
  digitalWrite(ULTRASONIC_CENTER_TRIG_PIN, LOW);
  pinMode(ULTRASONIC_CENTER_ECHO_PIN, INPUT);
}

float readUltrasonicCm(int trigPin, int echoPin, bool& valid) {
  valid = false;
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  const unsigned long duration = pulseIn(echoPin, HIGH, ULTRASONIC_ECHO_TIMEOUT_US);
  if (duration == 0) {
    return 0.0f;
  }

  valid = true;
  return static_cast<float>(duration) * 0.0343f / 2.0f;
}

void updateUltrasonic(unsigned long now) {
  if (!ultrasonicState.enabled || robotState.otaInProgress) {
    return;
  }

  if (ultrasonicState.lastReadAt != 0 && now - ultrasonicState.lastReadAt < ULTRASONIC_SAMPLE_INTERVAL_MS) {
    return;
  }

  bool valid = false;
  ultrasonicState.centerCm = readUltrasonicCm(ULTRASONIC_CENTER_TRIG_PIN, ULTRASONIC_CENTER_ECHO_PIN, valid);
  ultrasonicState.centerValid = valid;
  ultrasonicState.lastReadAt = now;
}

void initBoundaryGuard() {
  boundaryGuardState.configured = isBoundaryGuardConfigured();
  configureBoundaryPin(BOUNDARY_LEFT_FRONT_PIN);
  configureBoundaryPin(BOUNDARY_RIGHT_FRONT_PIN);
  configureBoundaryPin(BOUNDARY_LEFT_REAR_PIN);
  configureBoundaryPin(BOUNDARY_RIGHT_REAR_PIN);
}

String boundaryTriggerLabel() {
  if (boundaryGuardState.leftFront && boundaryGuardState.rightFront) {
    return "front_both";
  }
  if (boundaryGuardState.leftFront) {
    return "left_front";
  }
  if (boundaryGuardState.rightFront) {
    return "right_front";
  }
  if (boundaryGuardState.leftRear && boundaryGuardState.rightRear) {
    return "rear_both";
  }
  if (boundaryGuardState.leftRear) {
    return "left_rear";
  }
  if (boundaryGuardState.rightRear) {
    return "right_rear";
  }
  return "";
}

bool updateBoundaryGuard(unsigned long now) {
  boundaryGuardState.configured = isBoundaryGuardConfigured();
  if (!boundaryGuardState.configured || robotState.otaInProgress) {
    boundaryGuardState.active = false;
    return false;
  }

  boundaryGuardState.leftFront = readBoundaryPin(BOUNDARY_LEFT_FRONT_PIN);
  boundaryGuardState.rightFront = readBoundaryPin(BOUNDARY_RIGHT_FRONT_PIN);
  boundaryGuardState.leftRear = readBoundaryPin(BOUNDARY_LEFT_REAR_PIN);
  boundaryGuardState.rightRear = readBoundaryPin(BOUNDARY_RIGHT_REAR_PIN);

  const bool triggered =
    boundaryGuardState.leftFront ||
    boundaryGuardState.rightFront ||
    boundaryGuardState.leftRear ||
    boundaryGuardState.rightRear;

  if (!triggered) {
    boundaryGuardState.active = false;
    return false;
  }

  if (boundaryGuardState.active && now - boundaryGuardState.lastTriggeredAt < BOUNDARY_GUARD_COOLDOWN_MS) {
    return true;
  }

  boundaryGuardState.active = true;
  boundaryGuardState.lastTriggeredAt = now;
  boundaryGuardState.lastTrigger = boundaryTriggerLabel();
  stopAllMotion();
  robotState.mode = "boundary_guard";
  robotState.lastCommandAt = now;
  broadcastStatus();
  return true;
}

void writeNullableFloat(JsonObject target, const char* key, bool available, float value, uint8_t digits = 2) {
  if (!available) {
    target[key] = nullptr;
    return;
  }

  target[key] = serialized(String(static_cast<double>(value), static_cast<unsigned int>(digits)));
}

bool ensureOttoMotionPreferences() {
  if (ottoMotionPreferencesReady) {
    return true;
  }

  ottoMotionPreferencesReady = ottoPreferences.begin("robot-otto", false);
  return ottoMotionPreferencesReady;
}

size_t ottoMotionProfileIndexForMode(OttoMoveMode mode) {
  switch (mode) {
    case OttoMoveMode::StraightForward:
      return 0;
    case OttoMoveMode::AsyncForward:
      return 1;
    case OttoMoveMode::StraightBackward:
      return 2;
    case OttoMoveMode::AsyncBackward:
      return 3;
    case OttoMoveMode::TurnLeft:
    case OttoMoveMode::TurnLeftFast:
      return 4;
    case OttoMoveMode::TurnRight:
      return 5;
    case OttoMoveMode::ShiftLeft:
      return 6;
    case OttoMoveMode::ShiftRight:
      return 7;
    case OttoMoveMode::Idle:
    case OttoMoveMode::Forward:
    case OttoMoveMode::Backward:
    default:
      return 0;
  }
}

bool parseOttoMotionProfileName(const String& profileName, size_t& indexOut) {
  for (size_t index = 0; index < OTTO_MOTION_PROFILE_COUNT; index++) {
    if (profileName == OTTO_MOTION_PROFILE_NAMES[index]) {
      indexOut = index;
      return true;
    }
  }
  return false;
}

bool isNearFloat(float value, float target) {
  return fabsf(value - target) < 0.01f;
}

bool isLegacyTurnProfile(const OttoMotionProfile& profile, float leftLeg, float rightLeg) {
  return isNearFloat(profile.leftLegAmplitudeDeg, leftLeg) &&
         isNearFloat(profile.rightLegAmplitudeDeg, rightLeg) &&
         isNearFloat(profile.leftHipAmplitudeDeg, 12.0f) &&
         isNearFloat(profile.rightHipAmplitudeDeg, 12.0f);
}

void migrateLegacyOttoMotionProfiles() {
  if (isLegacyTurnProfile(ottoMotionProfiles[4], 18.0f, 7.0f)) {
    ottoMotionProfiles[4] = OTTO_DEFAULT_MOTION_PROFILES[4];
  }
  if (isLegacyTurnProfile(ottoMotionProfiles[5], 7.0f, 18.0f)) {
    ottoMotionProfiles[5] = OTTO_DEFAULT_MOTION_PROFILES[5];
  }
  if (
    isNearFloat(ottoMotionProfiles[4].leftLegAmplitudeDeg, 12.0f) &&
    isNearFloat(ottoMotionProfiles[4].rightLegAmplitudeDeg, 12.0f) &&
    isNearFloat(ottoMotionProfiles[4].leftHipAmplitudeDeg, 18.0f) &&
    isNearFloat(ottoMotionProfiles[4].rightHipAmplitudeDeg, 7.0f)
  ) {
    ottoMotionProfiles[4] = OTTO_DEFAULT_MOTION_PROFILES[4];
  }
  if (
    isNearFloat(ottoMotionProfiles[5].leftLegAmplitudeDeg, 12.0f) &&
    isNearFloat(ottoMotionProfiles[5].rightLegAmplitudeDeg, 12.0f) &&
    isNearFloat(ottoMotionProfiles[5].leftHipAmplitudeDeg, 7.0f) &&
    isNearFloat(ottoMotionProfiles[5].rightHipAmplitudeDeg, 18.0f)
  ) {
    ottoMotionProfiles[5] = OTTO_DEFAULT_MOTION_PROFILES[5];
  }
}

void migrateHiddenOttoMotionProfileScales(const bool savedProfiles[OTTO_MOTION_PROFILE_COUNT]) {
  if (savedProfiles[0]) {
    ottoMotionProfiles[0].rightLegAmplitudeDeg *= 1.10f;
    ottoMotionProfiles[0].rightHipAmplitudeDeg *= 1.10f;
  }

  if (savedProfiles[1]) {
    ottoMotionProfiles[1].leftLegAmplitudeDeg *= 0.72f * 1.18f;
    ottoMotionProfiles[1].rightLegAmplitudeDeg *= 0.72f;
    ottoMotionProfiles[1].leftHipAmplitudeDeg *= 0.72f * 1.18f;
    ottoMotionProfiles[1].rightHipAmplitudeDeg *= 0.72f;
  }
}

bool isLegacyShiftProfile(const OttoMotionProfile& profile) {
  return
    isNearFloat(profile.leftLegAmplitudeDeg, 12.0f) &&
    isNearFloat(profile.rightLegAmplitudeDeg, 12.0f) &&
    (isNearFloat(profile.leftHipAmplitudeDeg, 10.0f) || isNearFloat(profile.leftHipAmplitudeDeg, 12.0f)) &&
    (isNearFloat(profile.rightHipAmplitudeDeg, 10.0f) || isNearFloat(profile.rightHipAmplitudeDeg, 12.0f));
}

void migrateCrusaitoShiftProfiles(const bool savedProfiles[OTTO_MOTION_PROFILE_COUNT]) {
  if (savedProfiles[6] && isLegacyShiftProfile(ottoMotionProfiles[6])) {
    ottoMotionProfiles[6] = OTTO_DEFAULT_MOTION_PROFILES[6];
  }
  if (savedProfiles[7] && isLegacyShiftProfile(ottoMotionProfiles[7])) {
    ottoMotionProfiles[7] = OTTO_DEFAULT_MOTION_PROFILES[7];
  }
}

const OttoMotionProfile& ottoMotionProfileForMode(OttoMoveMode mode) {
  return ottoMotionProfiles[ottoMotionProfileIndexForMode(mode)];
}

bool isOttoForwardMode(OttoMoveMode mode) {
  return mode == OttoMoveMode::StraightForward || mode == OttoMoveMode::AsyncForward;
}

float normalizeAngleDeltaDeg(float value) {
  while (value > 180.0f) {
    value -= 360.0f;
  }
  while (value < -180.0f) {
    value += 360.0f;
  }
  return value;
}

float ottoStraightAssistCorrection() {
  if (!ottoGaitState.straightAssistActive || !robotState.imuAvailable) {
    return 0.0f;
  }

  const float yawError = normalizeAngleDeltaDeg(robotState.imuYaw - ottoGaitState.straightAssistBaselineYaw);
  if (fabsf(yawError) < OTTO_IMU_STRAIGHT_ASSIST_DEADBAND_DEG) {
    return 0.0f;
  }

  return clampFloat(
    -yawError * OTTO_IMU_STRAIGHT_ASSIST_GAIN,
    -OTTO_IMU_STRAIGHT_ASSIST_MAX,
    OTTO_IMU_STRAIGHT_ASSIST_MAX
  );
}

const char* ottoYawDirectionLabel(float yawError) {
  if (yawError > OTTO_IMU_STRAIGHT_ASSIST_DEADBAND_DEG) {
    return "left";
  }
  if (yawError < -OTTO_IMU_STRAIGHT_ASSIST_DEADBAND_DEG) {
    return "right";
  }
  return "straight";
}

void updateOttoStraightDiagnostic(unsigned long now) {
  if (!ottoGaitState.straightDiagnosticRunning) {
    return;
  }

  if (!robotState.imuAvailable) {
    ottoGaitState.straightDiagnosticRunning = false;
    return;
  }

  ottoGaitState.straightDiagnosticCurrentYaw = robotState.imuYaw;
  ottoGaitState.straightDiagnosticYawError =
    normalizeAngleDeltaDeg(robotState.imuYaw - ottoGaitState.straightDiagnosticBaselineYaw);
  ottoGaitState.straightDiagnosticMaxAbsYawError =
    max(ottoGaitState.straightDiagnosticMaxAbsYawError, fabsf(ottoGaitState.straightDiagnosticYawError));
  ottoGaitState.straightDiagnosticElapsedMs = now - ottoGaitState.straightDiagnosticStartedAt;
}

void startOttoStraightDiagnostic(OttoMoveMode mode, unsigned long now) {
  ottoGaitState.straightDiagnosticRunning = isOttoForwardMode(mode) && robotState.imuAvailable;

  if (!ottoGaitState.straightDiagnosticRunning) {
    ottoGaitState.straightDiagnosticAvailable = false;
    ottoGaitState.straightDiagnosticElapsedMs = 0;
    return;
  }

  ottoGaitState.straightDiagnosticAvailable = true;
  ottoGaitState.straightDiagnosticStartedAt = now;
  ottoGaitState.straightDiagnosticElapsedMs = 0;
  ottoGaitState.straightDiagnosticBaselineYaw = robotState.imuYaw;
  ottoGaitState.straightDiagnosticCurrentYaw = robotState.imuYaw;
  ottoGaitState.straightDiagnosticYawError = 0.0f;
  ottoGaitState.straightDiagnosticMaxAbsYawError = 0.0f;
}

void stopOttoStraightDiagnostic(unsigned long now) {
  updateOttoStraightDiagnostic(now);
  ottoGaitState.straightDiagnosticRunning = false;
}

void appendOttoMotionProfileJson(JsonObject target, const OttoMotionProfile& profile) {
  target["leftLegAmplitudeDeg"] = profile.leftLegAmplitudeDeg;
  target["rightLegAmplitudeDeg"] = profile.rightLegAmplitudeDeg;
  target["leftHipAmplitudeDeg"] = profile.leftHipAmplitudeDeg;
  target["rightHipAmplitudeDeg"] = profile.rightHipAmplitudeDeg;
  target["periodMs"] = profile.periodMs;
}

void applyOttoMotionProfileOverride(OttoMotionProfile& profile, JsonVariantConst source) {
  if (source.isNull() || !source.is<JsonObjectConst>()) {
    return;
  }

  const JsonObjectConst object = source.as<JsonObjectConst>();
  profile.leftLegAmplitudeDeg = object["leftLegAmplitudeDeg"] | profile.leftLegAmplitudeDeg;
  profile.rightLegAmplitudeDeg = object["rightLegAmplitudeDeg"] | profile.rightLegAmplitudeDeg;
  profile.leftHipAmplitudeDeg = object["leftHipAmplitudeDeg"] | profile.leftHipAmplitudeDeg;
  profile.rightHipAmplitudeDeg = object["rightHipAmplitudeDeg"] | profile.rightHipAmplitudeDeg;
  profile.periodMs = constrain(
    static_cast<unsigned long>(object["periodMs"] | profile.periodMs),
    650UL,
    1800UL
  );
}

void appendOttoMotionProfilesJson(JsonObject target) {
  JsonObject defaultProfiles = target["default"].to<JsonObject>();
  JsonObject savedProfiles = target["saved"].to<JsonObject>();

  for (size_t index = 0; index < OTTO_MOTION_PROFILE_COUNT; index++) {
    JsonObject defaultProfile = defaultProfiles[OTTO_MOTION_PROFILE_NAMES[index]].to<JsonObject>();
    appendOttoMotionProfileJson(defaultProfile, OTTO_DEFAULT_MOTION_PROFILES[index]);

    JsonObject savedProfile = savedProfiles[OTTO_MOTION_PROFILE_NAMES[index]].to<JsonObject>();
    appendOttoMotionProfileJson(savedProfile, ottoMotionProfiles[index]);
  }
}

OttoMotionProfile resolveOttoMotionProfile(OttoMoveMode mode, JsonVariantConst overrideProfile) {
  OttoMotionProfile profile = ottoMotionProfileForMode(mode);
  applyOttoMotionProfileOverride(profile, overrideProfile);
  return profile;
}

void stopVisionAutopilot(const char* nextMode = "vision_lost") {
  if (ottoGaitState.active) {
    stopOttoGait(false, nextMode);
  }
  visionAutopilotState.hasTarget = false;
  visionAutopilotState.activeMode = OttoMoveMode::Idle;
  visionAutopilotState.task1Phase = Task1AutopilotPhase::Idle;
  visionAutopilotState.task1TargetCx = -1;
  visionAutopilotState.task1TargetFrameWidth = 0;
  visionAutopilotState.task1TargetConfidence = 0.0f;
}

void setVisionAutopilotEnabled(bool enabled, const String& task) {
  const unsigned long now = millis();
  visionAutopilotState.enabled = enabled;
  if (!enabled) {
    stopVisionAutopilot("vision_autopilot_off");
    visionLineBuffer = "";
    visionAutopilotState.task = "idle";
    robotState.mode = "vision_autopilot_off";
    return;
  }

  visionAutopilotState.task = task;
  visionAutopilotState.hasTarget = false;
  visionAutopilotState.lastSeenAt = 0;
  visionAutopilotState.lastCommandAt = 0;
  visionAutopilotState.activeMode = OttoMoveMode::Idle;
  visionAutopilotState.task1Phase = task == "task1" ? Task1AutopilotPhase::StartForward : Task1AutopilotPhase::Idle;
  visionAutopilotState.task1PhaseStartedAt = now;
  visionAutopilotState.task1TargetCx = -1;
  visionAutopilotState.task1TargetFrameWidth = 0;
  visionAutopilotState.task1TargetConfidence = 0.0f;
  robotState.mode = task == "task2" ? "vision_autopilot_task2" : "vision_autopilot_task1";
  if (task == "task1") {
    commandVisionOttoMode(OttoMoveMode::StraightForward, now);
  }
}

void commandVisionOttoMode(OttoMoveMode mode, unsigned long now) {
  if (visionAutopilotState.activeMode == mode && ottoGaitState.active) {
    return;
  }

  startOttoGait(mode, ottoMotionProfileForMode(mode));
  visionAutopilotState.activeMode = mode;
  visionAutopilotState.lastCommandAt = now;
  robotState.lastCommandAt = now;
}

bool task1CenterObstacleDetected() {
  return ultrasonicState.centerValid &&
         ultrasonicState.centerCm > 0.0f &&
         ultrasonicState.centerCm <= TASK1_AUTOPILOT_OBSTACLE_CM;
}

bool task1FrontPoleTriggerDetected() {
  return ultrasonicState.centerValid &&
         ultrasonicState.centerCm > 0.0f &&
         ultrasonicState.centerCm <= TASK1_FRONT_POLE_TRIGGER_CM;
}

bool isTask1FrontPoleCenterPhase(Task1FrontPoleBypassPhase phase) {
  return phase == Task1FrontPoleBypassPhase::CenterBeforeTurnRightOut ||
         phase == Task1FrontPoleBypassPhase::CenterBeforeForwardSideEntry ||
         phase == Task1FrontPoleBypassPhase::CenterBeforeTurnLeftAlongside ||
         phase == Task1FrontPoleBypassPhase::CenterBeforeForwardPassSide ||
         phase == Task1FrontPoleBypassPhase::CenterBeforeTurnLeftReturn ||
         phase == Task1FrontPoleBypassPhase::CenterBeforeForwardReturnCenter ||
         phase == Task1FrontPoleBypassPhase::CenterBeforeTurnRightRecover ||
         phase == Task1FrontPoleBypassPhase::CenterAfterRecover;
}

void setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase phase, unsigned long now) {
  task1FrontPoleBypassState.phase = phase;
  task1FrontPoleBypassState.phaseStartedAt = now;
  if (isTask1FrontPoleCenterPhase(phase)) {
    stopOttoGait(true, "task1_front_pole_center");
    centerPhysicalPose();
  }
}

void startTask1FrontPoleBypass(unsigned long now) {
  setVisionAutopilotEnabled(false, "idle");
  task1FrontPoleBypassState.active = true;
  task1FrontPoleBypassState.phase = Task1FrontPoleBypassPhase::Approach;
  task1FrontPoleBypassState.phaseStartedAt = now;
  startOttoGait(OttoMoveMode::StraightForward, ottoMotionProfileForMode(OttoMoveMode::StraightForward));
  robotState.mode = "task1_front_pole_bypass";
}

void finishTask1FrontPoleBypass() {
  task1FrontPoleBypassState.active = false;
  task1FrontPoleBypassState.phase = Task1FrontPoleBypassPhase::Completed;
  stopOttoGait(true, "task1_front_pole_done");
  centerPhysicalPose();
}

void updateTask1FrontPoleBypass(unsigned long now) {
  if (!task1FrontPoleBypassState.active || robotState.otaInProgress) {
    return;
  }

  const unsigned long elapsed = now - task1FrontPoleBypassState.phaseStartedAt;

  switch (task1FrontPoleBypassState.phase) {
    case Task1FrontPoleBypassPhase::Approach:
      if (task1FrontPoleTriggerDetected()) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::CenterBeforeTurnRightOut, now);
      }
      return;

    case Task1FrontPoleBypassPhase::CenterBeforeTurnRightOut:
      if (elapsed >= TASK1_FRONT_POLE_CENTER_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::TurnRightOut, now);
        startOttoGait(OttoMoveMode::TurnRight, ottoMotionProfileForMode(OttoMoveMode::TurnRight));
      }
      return;

    case Task1FrontPoleBypassPhase::TurnRightOut:
      if (elapsed >= TASK1_FRONT_POLE_TURN_60_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::CenterBeforeForwardSideEntry, now);
      }
      return;

    case Task1FrontPoleBypassPhase::CenterBeforeForwardSideEntry:
      if (elapsed >= TASK1_FRONT_POLE_CENTER_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::ForwardSideEntry, now);
        startOttoGait(OttoMoveMode::StraightForward, ottoMotionProfileForMode(OttoMoveMode::StraightForward));
      }
      return;

    case Task1FrontPoleBypassPhase::ForwardSideEntry:
      if (elapsed >= TASK1_FRONT_POLE_FORWARD_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::CenterBeforeTurnLeftAlongside, now);
      }
      return;

    case Task1FrontPoleBypassPhase::CenterBeforeTurnLeftAlongside:
      if (elapsed >= TASK1_FRONT_POLE_CENTER_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::TurnLeftAlongside, now);
        startOttoGait(OttoMoveMode::TurnLeft, ottoMotionProfileForMode(OttoMoveMode::TurnLeft));
      }
      return;

    case Task1FrontPoleBypassPhase::TurnLeftAlongside:
      if (elapsed >= TASK1_FRONT_POLE_TURN_60_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::CenterBeforeForwardPassSide, now);
      }
      return;

    case Task1FrontPoleBypassPhase::CenterBeforeForwardPassSide:
      if (elapsed >= TASK1_FRONT_POLE_CENTER_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::ForwardPassSide, now);
        startOttoGait(OttoMoveMode::StraightForward, ottoMotionProfileForMode(OttoMoveMode::StraightForward));
      }
      return;

    case Task1FrontPoleBypassPhase::ForwardPassSide:
      if (elapsed >= TASK1_FRONT_POLE_FORWARD_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::CenterBeforeTurnLeftReturn, now);
      }
      return;

    case Task1FrontPoleBypassPhase::CenterBeforeTurnLeftReturn:
      if (elapsed >= TASK1_FRONT_POLE_CENTER_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::TurnLeftReturn, now);
        startOttoGait(OttoMoveMode::TurnLeft, ottoMotionProfileForMode(OttoMoveMode::TurnLeft));
      }
      return;

    case Task1FrontPoleBypassPhase::TurnLeftReturn:
      if (elapsed >= TASK1_FRONT_POLE_TURN_60_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::CenterBeforeForwardReturnCenter, now);
      }
      return;

    case Task1FrontPoleBypassPhase::CenterBeforeForwardReturnCenter:
      if (elapsed >= TASK1_FRONT_POLE_CENTER_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::ForwardReturnCenter, now);
        startOttoGait(OttoMoveMode::StraightForward, ottoMotionProfileForMode(OttoMoveMode::StraightForward));
      }
      return;

    case Task1FrontPoleBypassPhase::ForwardReturnCenter:
      if (elapsed >= TASK1_FRONT_POLE_FORWARD_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::CenterBeforeTurnRightRecover, now);
      }
      return;

    case Task1FrontPoleBypassPhase::CenterBeforeTurnRightRecover:
      if (elapsed >= TASK1_FRONT_POLE_CENTER_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::TurnRightRecover, now);
        startOttoGait(OttoMoveMode::TurnRight, ottoMotionProfileForMode(OttoMoveMode::TurnRight));
      }
      return;

    case Task1FrontPoleBypassPhase::TurnRightRecover:
      if (elapsed >= TASK1_FRONT_POLE_TURN_60_MS) {
        setTask1FrontPoleBypassPhase(Task1FrontPoleBypassPhase::CenterAfterRecover, now);
      }
      return;

    case Task1FrontPoleBypassPhase::CenterAfterRecover:
      if (elapsed >= TASK1_FRONT_POLE_CENTER_MS) {
        finishTask1FrontPoleBypass();
      }
      return;

    case Task1FrontPoleBypassPhase::Idle:
    case Task1FrontPoleBypassPhase::Completed:
    default:
      finishTask1FrontPoleBypass();
      return;
  }
}

void setTask1AutopilotPhase(Task1AutopilotPhase phase, unsigned long now) {
  if (visionAutopilotState.task1Phase == phase) {
    return;
  }
  visionAutopilotState.task1Phase = phase;
  visionAutopilotState.task1PhaseStartedAt = now;
}

void commandTask1ApproachBlack(unsigned long now) {
  if (!visionAutopilotState.hasTarget || visionAutopilotState.task1TargetFrameWidth <= 0 || visionAutopilotState.task1TargetCx < 0) {
    commandVisionOttoMode(OttoMoveMode::StraightForward, now);
    return;
  }

  const int center = visionAutopilotState.task1TargetFrameWidth / 2;
  const int tolerance = max(8, static_cast<int>(visionAutopilotState.task1TargetFrameWidth * VISION_AUTOPILOT_CENTER_TOLERANCE_RATIO));
  const int error = visionAutopilotState.task1TargetCx - center;
  if (error < -tolerance) {
    commandVisionOttoMode(OttoMoveMode::TurnLeft, now);
    return;
  }
  if (error > tolerance) {
    commandVisionOttoMode(OttoMoveMode::TurnRight, now);
    return;
  }
  commandVisionOttoMode(OttoMoveMode::StraightForward, now);
}

void updateTask1BodyAutopilot(unsigned long now) {
  if (!visionAutopilotState.enabled || visionAutopilotState.task != "task1" || robotState.otaInProgress) {
    return;
  }

  switch (visionAutopilotState.task1Phase) {
    case Task1AutopilotPhase::Idle:
      setTask1AutopilotPhase(Task1AutopilotPhase::StartForward, now);
      commandVisionOttoMode(OttoMoveMode::StraightForward, now);
      return;

    case Task1AutopilotPhase::StartForward:
      if (task1CenterObstacleDetected()) {
        setTask1AutopilotPhase(Task1AutopilotPhase::FirstBypassTurnRight, now);
        commandVisionOttoMode(OttoMoveMode::TurnRight, now);
        return;
      }
      commandVisionOttoMode(OttoMoveMode::StraightForward, now);
      return;

    case Task1AutopilotPhase::FirstBypassTurnRight:
      if (now - visionAutopilotState.task1PhaseStartedAt >= TASK1_FIRST_BYPASS_TURN_RIGHT_MS) {
        setTask1AutopilotPhase(Task1AutopilotPhase::FirstBypassForward, now);
        commandVisionOttoMode(OttoMoveMode::StraightForward, now);
        return;
      }
      commandVisionOttoMode(OttoMoveMode::TurnRight, now);
      return;

    case Task1AutopilotPhase::FirstBypassForward:
      if (now - visionAutopilotState.task1PhaseStartedAt >= TASK1_FIRST_BYPASS_FORWARD_MS) {
        setTask1AutopilotPhase(Task1AutopilotPhase::FirstBypassTurnLeft, now);
        commandVisionOttoMode(OttoMoveMode::TurnLeft, now);
        return;
      }
      commandVisionOttoMode(OttoMoveMode::StraightForward, now);
      return;

    case Task1AutopilotPhase::FirstBypassTurnLeft:
      if (now - visionAutopilotState.task1PhaseStartedAt >= TASK1_FIRST_BYPASS_TURN_LEFT_MS) {
        setTask1AutopilotPhase(Task1AutopilotPhase::GateForward, now);
        commandVisionOttoMode(OttoMoveMode::StraightForward, now);
        return;
      }
      commandVisionOttoMode(OttoMoveMode::TurnLeft, now);
      return;

    case Task1AutopilotPhase::GateForward:
      if (visionAutopilotState.hasTarget) {
        setTask1AutopilotPhase(Task1AutopilotPhase::ApproachBlack, now);
        commandTask1ApproachBlack(now);
        return;
      }
      commandVisionOttoMode(OttoMoveMode::StraightForward, now);
      return;

    case Task1AutopilotPhase::ApproachBlack:
      commandTask1ApproachBlack(now);
      return;

    case Task1AutopilotPhase::Completed:
    default:
      commandVisionOttoMode(OttoMoveMode::Idle, now);
      return;
  }
}

const char* task1AutopilotPhaseName(Task1AutopilotPhase phase) {
  switch (phase) {
    case Task1AutopilotPhase::StartForward:
      return "task1_start_forward";
    case Task1AutopilotPhase::FirstBypassTurnRight:
      return "task1_first_bypass_turn_right";
    case Task1AutopilotPhase::FirstBypassForward:
      return "task1_first_bypass_forward";
    case Task1AutopilotPhase::FirstBypassTurnLeft:
      return "task1_first_bypass_turn_left";
    case Task1AutopilotPhase::GateForward:
      return "task1_gate_forward";
    case Task1AutopilotPhase::ApproachBlack:
      return "task1_approach_black";
    case Task1AutopilotPhase::Completed:
      return "task1_completed";
    case Task1AutopilotPhase::Idle:
    default:
      return "idle";
  }
}

void applyVisionAutopilot(bool found, float confidence, int cx, int frameWidth, unsigned long now) {
  if (!visionAutopilotState.enabled || robotState.otaInProgress) {
    return;
  }

  if (visionAutopilotState.task == "task1") {
    if (found && confidence >= VISION_AUTOPILOT_MIN_CONFIDENCE && frameWidth > 0 && cx >= 0) {
      visionAutopilotState.hasTarget = true;
      visionAutopilotState.lastSeenAt = now;
      visionAutopilotState.task1TargetCx = cx;
      visionAutopilotState.task1TargetFrameWidth = frameWidth;
      visionAutopilotState.task1TargetConfidence = confidence;
    } else {
      visionAutopilotState.hasTarget = false;
      visionAutopilotState.task1TargetCx = -1;
      visionAutopilotState.task1TargetFrameWidth = 0;
      visionAutopilotState.task1TargetConfidence = 0.0f;
    }
    updateTask1BodyAutopilot(now);
    return;
  }

  if (!found || confidence < VISION_AUTOPILOT_MIN_CONFIDENCE || frameWidth <= 0 || cx < 0) {
    visionAutopilotState.hasTarget = false;
    if (now - visionAutopilotState.lastSeenAt >= VISION_AUTOPILOT_LOST_TIMEOUT_MS) {
      stopVisionAutopilot();
    }
    return;
  }

  visionAutopilotState.hasTarget = true;
  visionAutopilotState.lastSeenAt = now;

  const int center = frameWidth / 2;
  const int tolerance = max(8, static_cast<int>(frameWidth * VISION_AUTOPILOT_CENTER_TOLERANCE_RATIO));
  const int error = cx - center;

  if (error < -tolerance) {
    commandVisionOttoMode(OttoMoveMode::Forward, now);
    return;
  }

  if (error > tolerance) {
    commandVisionOttoMode(OttoMoveMode::Backward, now);
    return;
  }

  commandVisionOttoMode(OttoMoveMode::StraightForward, now);
}

void parseVisionSerialLine(unsigned long now) {
  JsonDocument doc;
  const DeserializationError error = deserializeJson(doc, visionLineBuffer);
  if (error) {
    return;
  }

  const String type = doc["type"] | "";
  if (type != "vision") {
    return;
  }

  const bool found = doc["found"] | false;
  const float confidence = doc["confidence"] | 0.0f;
  const int cx = doc["cx"] | -1;
  const int frameWidth = doc["frameWidth"] | 0;
  applyVisionAutopilot(found, confidence, cx, frameWidth, now);
}

void handleVisionSerialInput() {
  if (!visionAutopilotState.enabled) {
    return;
  }

  const unsigned long now = millis();
  while (Serial.available() > 0) {
    const char ch = static_cast<char>(Serial.read());
    if (ch == '\r') {
      continue;
    }

    if (ch == '\n') {
      if (visionLineBuffer.length() > 0) {
        parseVisionSerialLine(now);
        visionLineBuffer = "";
      }
      continue;
    }

    if (visionLineBuffer.length() < VISION_UART_LINE_MAX) {
      visionLineBuffer += ch;
    } else {
      visionLineBuffer = "";
    }
  }
}

void updateVisionAutopilotTimeout(unsigned long now) {
  if (!visionAutopilotState.enabled || visionAutopilotState.lastSeenAt == 0) {
    return;
  }

  if (visionAutopilotState.task == "task1") {
    return;
  }

  if (now - visionAutopilotState.lastSeenAt >= VISION_AUTOPILOT_LOST_TIMEOUT_MS) {
    visionAutopilotState.hasTarget = false;
    stopVisionAutopilot();
  }
}

void loadOttoMotionProfiles() {
  for (size_t index = 0; index < OTTO_MOTION_PROFILE_COUNT; index++) {
    ottoMotionProfiles[index] = OTTO_DEFAULT_MOTION_PROFILES[index];
  }

  if (!ensureOttoMotionPreferences()) {
    return;
  }

  const String serializedProfiles = ottoPreferences.getString("profiles", "");
  if (serializedProfiles.length() == 0) {
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, serializedProfiles)) {
    return;
  }

  bool savedProfiles[OTTO_MOTION_PROFILE_COUNT] = {};
  for (size_t index = 0; index < OTTO_MOTION_PROFILE_COUNT; index++) {
    JsonVariantConst savedProfile = doc[OTTO_MOTION_PROFILE_NAMES[index]];
    savedProfiles[index] = savedProfile.is<JsonObjectConst>();
    applyOttoMotionProfileOverride(ottoMotionProfiles[index], savedProfile);
  }

  const uint32_t storedVersion = ottoPreferences.getUInt("profilesVersion", 1);
  if (storedVersion < OTTO_MOTION_PROFILE_STORAGE_VERSION) {
    if (storedVersion < 2) {
      migrateHiddenOttoMotionProfileScales(savedProfiles);
    }
    if (storedVersion < 3) {
      migrateCrusaitoShiftProfiles(savedProfiles);
    }
    ottoPreferences.putUInt("profilesVersion", OTTO_MOTION_PROFILE_STORAGE_VERSION);
    saveOttoMotionProfiles();
  }

  migrateLegacyOttoMotionProfiles();
}

void saveOttoMotionProfiles() {
  if (!ensureOttoMotionPreferences()) {
    return;
  }

  JsonDocument doc;
  for (size_t index = 0; index < OTTO_MOTION_PROFILE_COUNT; index++) {
    JsonObject savedProfile = doc[OTTO_MOTION_PROFILE_NAMES[index]].to<JsonObject>();
    appendOttoMotionProfileJson(savedProfile, ottoMotionProfiles[index]);
  }

  String serializedProfiles;
  serializeJson(doc, serializedProfiles);
  ottoPreferences.putString("profiles", serializedProfiles);
  ottoPreferences.putUInt("profilesVersion", OTTO_MOTION_PROFILE_STORAGE_VERSION);
}

void saveOttoMotionProfile(const String& profileName, const OttoMotionProfile& profile) {
  size_t index = 0;
  if (!parseOttoMotionProfileName(profileName, index)) {
    return;
  }

  ottoMotionProfiles[index] = profile;
  saveOttoMotionProfiles();
}

float clampFloat(float value, float minValue, float maxValue) {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

float lerpFloat(float start, float end, float progress) {
  return start + (end - start) * progress;
}

float easeInOutSine(float progress) {
  const float clamped = clampFloat(progress, 0.0f, 1.0f);
  return 0.5f - 0.5f * cosf(PI * clamped);
}

float swingWave(float progress) {
  const float clamped = clampFloat(progress, 0.0f, 1.0f);
  return sinf(PI * clamped);
}

const char* gaitPhaseLabel(GaitPhase phase) {
  switch (phase) {
    case GaitPhase::ShiftLeft:
      return "shift_left";
    case GaitPhase::SwingRight:
      return "swing_right";
    case GaitPhase::ShiftRight:
      return "shift_right";
    case GaitPhase::SwingLeft:
      return "swing_left";
    case GaitPhase::Idle:
    default:
      return "idle";
  }
}

unsigned long gaitPhaseDurationMs(GaitPhase phase) {
  switch (phase) {
    case GaitPhase::ShiftLeft:
    case GaitPhase::ShiftRight:
      return gaitState.params.doubleSupportMs;
    case GaitPhase::SwingRight:
    case GaitPhase::SwingLeft:
      return gaitState.params.swingPhaseMs;
    case GaitPhase::Idle:
    default:
      return 0;
  }
}

GaitPhase nextGaitPhase(GaitPhase phase) {
  switch (phase) {
    case GaitPhase::ShiftLeft:
      return GaitPhase::SwingRight;
    case GaitPhase::SwingRight:
      return GaitPhase::ShiftRight;
    case GaitPhase::ShiftRight:
      return GaitPhase::SwingLeft;
    case GaitPhase::SwingLeft:
      return GaitPhase::ShiftLeft;
    case GaitPhase::Idle:
    default:
      return GaitPhase::ShiftLeft;
  }
}

int logicalLeftKneeAngle(float bendDeg) {
  return static_cast<int>(lroundf(clampFloat(SERVO_CENTER_ANGLE - bendDeg, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE)));
}

int logicalRightKneeAngle(float bendDeg) {
  return static_cast<int>(lroundf(clampFloat(SERVO_CENTER_ANGLE + bendDeg, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE)));
}

int logicalLeftHipRollAngle(float anatomicalDeg) {
  return static_cast<int>(lroundf(clampFloat(SERVO_CENTER_ANGLE + anatomicalDeg, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE)));
}

int logicalRightHipRollAngle(float anatomicalDeg) {
  return static_cast<int>(lroundf(clampFloat(SERVO_CENTER_ANGLE - anatomicalDeg, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE)));
}

int logicalLeftHipPitchAngle(float anatomicalDeg) {
  return static_cast<int>(lroundf(clampFloat(SERVO_CENTER_ANGLE - anatomicalDeg, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE)));
}

int logicalRightHipPitchAngle(float anatomicalDeg) {
  return static_cast<int>(lroundf(clampFloat(SERVO_CENTER_ANGLE + anatomicalDeg, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE)));
}

void setPenguinPose(
  float bodyLeanDeg,
  float leftKneeBendDeg,
  float rightKneeBendDeg,
  float leftHipPitchDeg,
  float rightHipPitchDeg,
  float neckTrimDeg
) {
  applyServoAngle(SERVO_LEFT_KNEE, logicalLeftKneeAngle(leftKneeBendDeg));
  applyServoAngle(SERVO_RIGHT_KNEE, logicalRightKneeAngle(rightKneeBendDeg));
  applyServoAngle(SERVO_LEFT_HIP_ROLL, logicalLeftHipRollAngle(bodyLeanDeg));
  applyServoAngle(SERVO_RIGHT_HIP_ROLL, logicalRightHipRollAngle(bodyLeanDeg));
  applyServoAngle(SERVO_LEFT_HIP_PITCH, logicalLeftHipPitchAngle(leftHipPitchDeg));
  applyServoAngle(SERVO_RIGHT_HIP_PITCH, logicalRightHipPitchAngle(rightHipPitchDeg));
  const float neckAngle = clampFloat(
    SERVO_CENTER_ANGLE + neckTrimDeg - bodyLeanDeg * 0.35f,
    SERVO_MIN_ANGLE,
    SERVO_MAX_ANGLE
  );
  applyServoAngle(SERVO_NECK, static_cast<int>(lroundf(neckAngle)));
}

String buildStatusJson() {
  JsonDocument doc;
  doc["type"] = "status";
  doc["name"] = ROBOT_NAME;
  doc["connected"] = robotState.connected;
  doc["mode"] = robotState.mode;
  doc["battery"] = robotState.battery;
  doc["signalStrength"] = robotState.signalStrength;
  doc["firmwareVersion"] = robotState.firmwareVersion;
  doc["otaInProgress"] = robotState.otaInProgress;

  JsonObject visionAutopilot = doc["visionAutopilot"].to<JsonObject>();
  visionAutopilot["enabled"] = visionAutopilotState.enabled;
  visionAutopilot["task"] = visionAutopilotState.task;
  visionAutopilot["hasTarget"] = visionAutopilotState.hasTarget;
  visionAutopilot["lastSeenAt"] = visionAutopilotState.lastSeenAt;
  visionAutopilot["task1Phase"] = task1AutopilotPhaseName(visionAutopilotState.task1Phase);

  JsonObject imu = doc["imu"].to<JsonObject>();
  imu["available"] = robotState.imuAvailable;
  imu["calibrated"] = robotState.imuCalibrated;
  imu["fallen"] = robotState.imuFallen;
  writeNullableFloat(imu, "roll", robotState.imuAvailable, robotState.imuRoll);
  writeNullableFloat(imu, "pitch", robotState.imuAvailable, robotState.imuPitch);
  writeNullableFloat(imu, "yaw", robotState.imuAvailable, robotState.imuYaw);
  writeNullableFloat(imu, "temperature", robotState.imuAvailable, robotState.imuTemperature);
  JsonObject accel = imu["accel"].to<JsonObject>();
  writeNullableFloat(accel, "x", robotState.imuAvailable, robotState.imuAccelX, 3);
  writeNullableFloat(accel, "y", robotState.imuAvailable, robotState.imuAccelY, 3);
  writeNullableFloat(accel, "z", robotState.imuAvailable, robotState.imuAccelZ, 3);
  JsonObject gyro = imu["gyro"].to<JsonObject>();
  writeNullableFloat(gyro, "x", robotState.imuAvailable, robotState.imuGyroX, 3);
  writeNullableFloat(gyro, "y", robotState.imuAvailable, robotState.imuGyroY, 3);
  writeNullableFloat(gyro, "z", robotState.imuAvailable, robotState.imuGyroZ, 3);

  JsonObject boundaryGuard = doc["boundaryGuard"].to<JsonObject>();
  boundaryGuard["enabled"] = BOUNDARY_GUARD_ENABLED;
  boundaryGuard["configured"] = isBoundaryGuardConfigured();
  boundaryGuard["active"] = boundaryGuardState.active;
  boundaryGuard["leftFront"] = boundaryGuardState.leftFront;
  boundaryGuard["rightFront"] = boundaryGuardState.rightFront;
  boundaryGuard["leftRear"] = boundaryGuardState.leftRear;
  boundaryGuard["rightRear"] = boundaryGuardState.rightRear;
  boundaryGuard["lastTrigger"] = boundaryGuardState.lastTrigger;
  boundaryGuard["lastTriggeredAt"] = boundaryGuardState.lastTriggeredAt;

  JsonObject ultrasonic = doc["ultrasonic"].to<JsonObject>();
  ultrasonic["enabled"] = ULTRASONIC_ENABLED;
  ultrasonic["configured"] = isUltrasonicConfigured();
  ultrasonic["centerValid"] = ultrasonicState.centerValid;
  ultrasonic["centerNear"] = ultrasonicState.centerValid && ultrasonicState.centerCm <= ULTRASONIC_NEAR_CM;
  ultrasonic["centerDanger"] = ultrasonicState.centerValid && ultrasonicState.centerCm <= ULTRASONIC_DANGER_CM;
  writeNullableFloat(ultrasonic, "centerCm", ultrasonicState.centerValid, ultrasonicState.centerCm, 1);
  ultrasonic["leftValid"] = ultrasonicState.centerValid;
  ultrasonic["rightValid"] = ultrasonicState.centerValid;
  ultrasonic["leftNear"] = ultrasonicState.centerValid && ultrasonicState.centerCm <= ULTRASONIC_NEAR_CM;
  ultrasonic["rightNear"] = ultrasonicState.centerValid && ultrasonicState.centerCm <= ULTRASONIC_NEAR_CM;
  ultrasonic["leftDanger"] = ultrasonicState.centerValid && ultrasonicState.centerCm <= ULTRASONIC_DANGER_CM;
  ultrasonic["rightDanger"] = ultrasonicState.centerValid && ultrasonicState.centerCm <= ULTRASONIC_DANGER_CM;
  writeNullableFloat(ultrasonic, "leftCm", ultrasonicState.centerValid, ultrasonicState.centerCm, 1);
  writeNullableFloat(ultrasonic, "rightCm", ultrasonicState.centerValid, ultrasonicState.centerCm, 1);
  ultrasonic["nearThresholdCm"] = serialized(String(ULTRASONIC_NEAR_CM, 1));
  ultrasonic["dangerThresholdCm"] = serialized(String(ULTRASONIC_DANGER_CM, 1));
  ultrasonic["lastReadAt"] = ultrasonicState.lastReadAt;
  ultrasonic["lastCenterReadAt"] = ultrasonicState.lastReadAt;
  ultrasonic["lastLeftReadAt"] = ultrasonicState.lastReadAt;
  ultrasonic["lastRightReadAt"] = ultrasonicState.lastReadAt;

  JsonObject gaitTelemetry = doc["gaitTelemetry"].to<JsonObject>();
  gaitTelemetry["available"] = gaitState.telemetryAvailable || gaitState.active;
  gaitTelemetry["phase"] = gaitPhaseLabel(gaitState.phase);
  gaitTelemetry["stepCount"] = gaitState.stepCount;
  writeNullableFloat(
    gaitTelemetry,
    "forwardProgress",
    gaitState.telemetryAvailable || gaitState.active,
    gaitState.estimatedForwardProgress,
    3
  );
  writeNullableFloat(
    gaitTelemetry,
    "lateralDrift",
    gaitState.telemetryAvailable || gaitState.active,
    gaitState.lateralDriftMeters,
    3
  );
  writeNullableFloat(
    gaitTelemetry,
    "yawDrift",
    gaitState.telemetryAvailable || gaitState.active,
    gaitState.yawDriftDeg,
    2
  );
  writeNullableFloat(
    gaitTelemetry,
    "stabilityScore",
    gaitState.telemetryAvailable || gaitState.active,
    gaitState.stabilityScore,
    3
  );
  gaitTelemetry["fallen"] = robotState.imuFallen;
  gaitTelemetry["ottoStraightAssistActive"] = ottoGaitState.straightAssistActive;
  gaitTelemetry["ottoStraightDiagnosticAvailable"] = ottoGaitState.straightDiagnosticAvailable;
  gaitTelemetry["ottoStraightDiagnosticRunning"] = ottoGaitState.straightDiagnosticRunning;
  gaitTelemetry["ottoElapsedMs"] = ottoGaitState.straightDiagnosticAvailable
    ? ottoGaitState.straightDiagnosticElapsedMs
    : 0;
  writeNullableFloat(gaitTelemetry, "ottoBaselineYaw", ottoGaitState.straightDiagnosticAvailable, ottoGaitState.straightDiagnosticBaselineYaw);
  writeNullableFloat(gaitTelemetry, "ottoCurrentYaw", ottoGaitState.straightDiagnosticAvailable, ottoGaitState.straightDiagnosticCurrentYaw);
  writeNullableFloat(gaitTelemetry, "ottoYawError", ottoGaitState.straightDiagnosticAvailable, ottoGaitState.straightDiagnosticYawError);
  writeNullableFloat(gaitTelemetry, "ottoMaxAbsYawError", ottoGaitState.straightDiagnosticAvailable, ottoGaitState.straightDiagnosticMaxAbsYawError);
  gaitTelemetry["ottoYawDirection"] = ottoYawDirectionLabel(ottoGaitState.straightDiagnosticYawError);

  JsonObject servoAngles = doc["servoAngles"].to<JsonObject>();
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    servoAngles[String(index + 1)] = robotState.servoAngles[index];
  }

  JsonObject network = doc["network"].to<JsonObject>();
  network["wifiMode"] = "STA";
  network["ssid"] = WiFi.SSID();
  network["profile"] = activeWifiProfileName;
  network["ip"] = WiFi.localIP().toString();
  network["gateway"] = WiFi.gatewayIP().toString();
  network["subnet"] = WiFi.subnetMask().toString();
  network["dnsPrimary"] = WiFi.dnsIP(0).toString();
  network["dnsSecondary"] = WiFi.dnsIP(1).toString();
  network["staticIpEnabled"] = WIFI_USE_STATIC_IP;
  network["httpPort"] = 80;
  network["websocketPath"] = "/ws";
  network["controlPath"] = "/control";
  network["otaPath"] = "/update";

  JsonObject capabilities = doc["capabilities"].to<JsonObject>();
  JsonArray modules = capabilities["modules"].to<JsonArray>();
  const char* const enabledModules[] = {
    "wifi_sta",
    "websocket",
    "http_control",
    "ota",
    "servo_control",
    "safety_timeout"
  };
  appendStringArray(modules, enabledModules, sizeof(enabledModules) / sizeof(enabledModules[0]));
  modules.add("pca9685");
  if (WIFI_USE_STATIC_IP) {
    modules.add("static_ip");
  }
  if (IMU_MPU6050_ENABLED) {
    modules.add("imu_mpu6050");
  }
  modules.add("boundary_guard");
  modules.add("penguin_gait");
  modules.add("single_leg_forward");
  modules.add("lateral_step");
  modules.add("otto_gait");
  modules.add("gait_telemetry");

  JsonArray actions = capabilities["actions"].to<JsonArray>();
  const char* const actionNames[] = {
    "stand",
    "squat",
    "center",
    "penguin_walk",
    "lateral_step",
    "emergency_stop"
  };
  appendStringArray(actions, actionNames, sizeof(actionNames) / sizeof(actionNames[0]));

  JsonArray moves = capabilities["moves"].to<JsonArray>();
  const char* const moveNames[] = {
    "forward",
    "backward",
    "left",
    "right",
    "stop",
    "forward_2",
    "otto_forward",
    "otto_async_forward",
    "otto_backward",
    "otto_async_backward",
    "otto_left",
    "otto_left_fast",
    "otto_right",
    "otto_shift_left",
    "otto_shift_right",
    "otto_bowling_tactic",
    "otto_stop"
  };
  appendStringArray(moves, moveNames, sizeof(moveNames) / sizeof(moveNames[0]));

  JsonArray servoIds = capabilities["servoIds"].to<JsonArray>();
  appendServoIdArray(servoIds);

  JsonObject build = doc["build"].to<JsonObject>();
  build["firmwareVersion"] = FIRMWARE_VERSION;
  build["robotName"] = ROBOT_NAME;
  build["compiledAt"] = String(__DATE__) + " " + String(__TIME__);
  build["servoCount"] = SERVO_COUNT;
  build["servoDriver"] = "pca9685";
  build["servoDriverReady"] = robotState.servoDriverReady;
  build["servoWriteFailures"] = robotState.servoWriteFailures;
  build["lastDriverError"] = robotState.lastDriverError;
  build["i2cSdaPin"] = PCA9685_SDA_PIN;
  build["i2cSclPin"] = PCA9685_SCL_PIN;
  build["pca9685Address"] = PCA9685_I2C_ADDRESS;
  build["servoPwmFrequencyHz"] = PCA9685_PWM_FREQUENCY;
  build["statusPushIntervalMs"] = STATUS_PUSH_INTERVAL_MS;
  build["safetyTimeoutMs"] = SAFETY_TIMEOUT_MS;
  JsonObject boundaryPins = build["boundaryGuardPins"].to<JsonObject>();
  boundaryPins["leftFront"] = BOUNDARY_LEFT_FRONT_PIN;
  boundaryPins["rightFront"] = BOUNDARY_RIGHT_FRONT_PIN;
  boundaryPins["leftRear"] = BOUNDARY_LEFT_REAR_PIN;
  boundaryPins["rightRear"] = BOUNDARY_RIGHT_REAR_PIN;
  build["boundarySensorActiveLow"] = BOUNDARY_SENSOR_ACTIVE_LOW;
  JsonObject ultrasonicPins = build["ultrasonicPins"].to<JsonObject>();
  ultrasonicPins["centerTrig"] = ULTRASONIC_CENTER_TRIG_PIN;
  ultrasonicPins["centerEcho"] = ULTRASONIC_CENTER_ECHO_PIN;
  build["ultrasonicEnabled"] = ULTRASONIC_ENABLED;
  build["ultrasonicSampleIntervalMs"] = ULTRASONIC_SAMPLE_INTERVAL_MS;
  build["ultrasonicEchoTimeoutUs"] = ULTRASONIC_ECHO_TIMEOUT_US;
  build["imuEnabled"] = IMU_MPU6050_ENABLED;
  if (IMU_MPU6050_ENABLED) {
    build["imuModel"] = "MPU6050";
    if (robotState.imuAvailable) {
      build["imuAddress"] = robotState.imuAddress;
    } else {
      build["imuAddress"] = nullptr;
    }
    build["imuUpdateIntervalMs"] = IMU_UPDATE_INTERVAL_MS;
    build["imuRetryIntervalMs"] = IMU_RETRY_INTERVAL_MS;
    build["imuFallenThresholdDeg"] = serialized(String(IMU_FALLEN_THRESHOLD_DEG, 1));
  }

  JsonObject angleRange = build["angleRange"].to<JsonObject>();
  angleRange["min"] = SERVO_MIN_ANGLE;
  angleRange["max"] = SERVO_MAX_ANGLE;
  angleRange["center"] = SERVO_CENTER_ANGLE;

  JsonObject pulseRangeUs = build["pulseRangeUs"].to<JsonObject>();
  pulseRangeUs["min"] = SERVO_MIN_PULSE_US;
  pulseRangeUs["max"] = SERVO_MAX_PULSE_US;

  JsonArray servoChannels = build["servoChannels"].to<JsonArray>();
  appendServoChannelArray(servoChannels);
  JsonArray servoInverted = build["servoInverted"].to<JsonArray>();
  appendServoInvertedArray(servoInverted);
  JsonArray servoZeroOffsets = build["servoZeroOffsets"].to<JsonArray>();
  appendServoZeroOffsetArray(servoZeroOffsets);
  JsonObject ottoMotionProfiles = doc["ottoMotionProfiles"].to<JsonObject>();
  appendOttoMotionProfilesJson(ottoMotionProfiles);
  build["servoCenterOnBoot"] = SERVO_CENTER_ON_BOOT;
  JsonObject trimRange = build["servoTrimRange"].to<JsonObject>();
  trimRange["min"] = SERVO_TRIM_MIN_ANGLE;
  trimRange["max"] = SERVO_TRIM_MAX_ANGLE;

  String output;
  serializeJson(doc, output);
  return output;
}

void broadcastStatus() {
  socketServer.textAll(buildStatusJson());
}

float readBatteryVoltage() {
  if (BATTERY_ADC_PIN < 0) {
    return 7.4f;
  }

  int raw = analogRead(BATTERY_ADC_PIN);
  const float adcVoltage = (static_cast<float>(raw) / 4095.0f) * ADC_REFERENCE_VOLTAGE;
  return adcVoltage * BATTERY_DIVIDER_RATIO;
}

bool probeI2cDevice(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

bool writePca9685Register(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(PCA9685_I2C_ADDRESS);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool probePca9685() {
  return probeI2cDevice(PCA9685_I2C_ADDRESS);
}

bool probePca9685WithRetry() {
  for (uint8_t attempt = 0; attempt < PCA9685_PROBE_ATTEMPTS; attempt++) {
    if (probePca9685()) {
      return true;
    }
    delay(PCA9685_PROBE_RETRY_DELAY_MS);
  }
  return false;
}

uint8_t readPca9685Register(uint8_t reg) {
  Wire.beginTransmission(PCA9685_I2C_ADDRESS);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) {
    return 0;
  }

  if (Wire.requestFrom(static_cast<int>(PCA9685_I2C_ADDRESS), 1) != 1) {
    return 0;
  }

  return static_cast<uint8_t>(Wire.read());
}

bool writePca9685Pwm(uint8_t channel, uint16_t on, uint16_t off) {
  if (channel > 15 || on > 4095 || off > 4095) {
    return false;
  }

  Wire.beginTransmission(PCA9685_I2C_ADDRESS);
  Wire.write(static_cast<uint8_t>(PCA9685_LED0_ON_L_REGISTER + 4 * channel));
  Wire.write(static_cast<uint8_t>(on & 0xFF));
  Wire.write(static_cast<uint8_t>((on >> 8) & 0x0F));
  Wire.write(static_cast<uint8_t>(off & 0xFF));
  Wire.write(static_cast<uint8_t>((off >> 8) & 0x0F));
  return Wire.endTransmission() == 0;
}

bool writePca9685FullOff(uint8_t channel) {
  if (channel > 15) {
    return false;
  }

  Wire.beginTransmission(PCA9685_I2C_ADDRESS);
  Wire.write(static_cast<uint8_t>(PCA9685_LED0_ON_L_REGISTER + 4 * channel));
  Wire.write(0x00);
  Wire.write(0x00);
  Wire.write(0x00);
  Wire.write(0x10);
  return Wire.endTransmission() == 0;
}

uint16_t pulseUsToTicks(uint16_t pulseUs) {
  const uint32_t periodUs = 1000000UL / PCA9685_PWM_FREQUENCY;
  const uint32_t ticks = (static_cast<uint32_t>(pulseUs) * 4096UL + periodUs / 2UL) / periodUs;
  return static_cast<uint16_t>(ticks > 4095 ? 4095 : ticks);
}

uint16_t angleToPulseUs(int angle) {
  const int constrained = constrain(angle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
  return static_cast<uint16_t>(
    map(constrained, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE, SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US)
  );
}

int mapLogicalAngleToPhysical(uint8_t servoId, int angle) {
  const int constrained = constrain(angle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
  if (servoId >= SERVO_COUNT) {
    return constrained;
  }
  const int delta = constrained - SERVO_CENTER_ANGLE;
  const int direction = SERVO_INVERTED[servoId] ? -1 : 1;
  const int trimmed = SERVO_CENTER_ANGLE + robotState.servoZeroOffsets[servoId] + direction * delta;
  return constrain(trimmed, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
}

bool shouldSkipServoPwmWrite(uint8_t servoId, uint16_t ticks) {
  return servoId < SERVO_COUNT &&
         robotState.servoPwmActive[servoId] &&
         robotState.servoPwmTicks[servoId] == ticks;
}

bool shouldDeferServoPwmWrite() {
  return robotState.nextServoWriteRetryAt > 0 && millis() < robotState.nextServoWriteRetryAt;
}

void markServoPwmWriteSucceeded(uint8_t servoId, uint16_t ticks) {
  if (servoId >= SERVO_COUNT) {
    return;
  }

  robotState.servoPwmTicks[servoId] = ticks;
  robotState.servoPwmActive[servoId] = true;
  robotState.consecutiveServoWriteFailures = 0;
  robotState.nextServoWriteRetryAt = 0;
  robotState.lastDriverError = "";
}

void markServoPwmWriteFailed(uint8_t servoId, const char* context) {
  robotState.servoWriteFailures++;
  robotState.consecutiveServoWriteFailures++;
  robotState.lastDriverError = "PCA9685 write failed";
  robotState.nextServoWriteRetryAt = millis() + PCA9685_WRITE_RETRY_DELAY_MS;
  Serial.printf("PCA9685 %s failed on channel %u, consecutive failures: %u\n",
                context,
                PCA9685_CHANNELS[servoId],
                robotState.consecutiveServoWriteFailures);

  if (robotState.consecutiveServoWriteFailures >= PCA9685_MAX_CONSECUTIVE_WRITE_FAILURES) {
    robotState.servoDriverReady = false;
    robotState.nextServoWriteRetryAt = 0;
    for (uint8_t index = 0; index < SERVO_COUNT; index++) {
      robotState.servoPwmActive[index] = false;
    }
  }
}

bool writeMpu6050Register(uint8_t reg, uint8_t value) {
  if (!robotState.imuAddress) {
    return false;
  }

  Wire.beginTransmission(robotState.imuAddress);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool readMpu6050Bytes(uint8_t reg, uint8_t* buffer, size_t length) {
  if (!robotState.imuAddress || !buffer || length == 0) {
    return false;
  }

  Wire.beginTransmission(robotState.imuAddress);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  const int received = Wire.requestFrom(static_cast<int>(robotState.imuAddress), static_cast<int>(length));
  if (received != static_cast<int>(length)) {
    return false;
  }

  for (size_t index = 0; index < length; index++) {
    buffer[index] = static_cast<uint8_t>(Wire.read());
  }

  return true;
}

float computeAccelRoll(float accelX, float accelY, float accelZ) {
  return atan2f(accelY, accelZ) * K_RADIANS_TO_DEGREES;
}

float computeAccelPitch(float accelX, float accelY, float accelZ) {
  return atan2f(-accelX, sqrtf(accelY * accelY + accelZ * accelZ)) * K_RADIANS_TO_DEGREES;
}

float mapImuAccelX(float value) {
  return value;
}

float mapImuAccelY(float value) {
  return IMU_MPU6050_CHIP_DOWN ? -value : value;
}

float mapImuAccelZ(float value) {
  return IMU_MPU6050_CHIP_DOWN ? -value : value;
}

float mapImuGyroX(float value) {
  return value;
}

float mapImuGyroY(float value) {
  return IMU_MPU6050_CHIP_DOWN ? -value : value;
}

float mapImuGyroZ(float value) {
  return IMU_MPU6050_CHIP_DOWN ? -value : value;
}

bool readMpu6050Sample() {
  uint8_t rawBytes[14];
  if (!readMpu6050Bytes(MPU6050_ACCEL_XOUT_H_REGISTER, rawBytes, sizeof(rawBytes))) {
    return false;
  }

  const int16_t rawAccelX = static_cast<int16_t>((rawBytes[0] << 8) | rawBytes[1]);
  const int16_t rawAccelY = static_cast<int16_t>((rawBytes[2] << 8) | rawBytes[3]);
  const int16_t rawAccelZ = static_cast<int16_t>((rawBytes[4] << 8) | rawBytes[5]);
  const int16_t rawTemperature = static_cast<int16_t>((rawBytes[6] << 8) | rawBytes[7]);
  const int16_t rawGyroX = static_cast<int16_t>((rawBytes[8] << 8) | rawBytes[9]);
  const int16_t rawGyroY = static_cast<int16_t>((rawBytes[10] << 8) | rawBytes[11]);
  const int16_t rawGyroZ = static_cast<int16_t>((rawBytes[12] << 8) | rawBytes[13]);

  robotState.imuAccelX = mapImuAccelX(static_cast<float>(rawAccelX) / MPU6050_ACCEL_SCALE);
  robotState.imuAccelY = mapImuAccelY(static_cast<float>(rawAccelY) / MPU6050_ACCEL_SCALE);
  robotState.imuAccelZ = mapImuAccelZ(static_cast<float>(rawAccelZ) / MPU6050_ACCEL_SCALE);
  robotState.imuTemperature = static_cast<float>(rawTemperature) / 340.0f + 36.53f;

  const float rawMappedGyroX = (static_cast<float>(rawGyroX) / MPU6050_GYRO_SCALE) - robotState.imuGyroBiasX;
  const float rawMappedGyroY = (static_cast<float>(rawGyroY) / MPU6050_GYRO_SCALE) - robotState.imuGyroBiasY;
  const float rawMappedGyroZ = (static_cast<float>(rawGyroZ) / MPU6050_GYRO_SCALE) - robotState.imuGyroBiasZ;
  const float gyroX = mapImuGyroX(rawMappedGyroX);
  const float gyroY = mapImuGyroY(rawMappedGyroY);
  const float gyroZ = mapImuGyroZ(rawMappedGyroZ);
  robotState.imuGyroX = gyroX;
  robotState.imuGyroY = gyroY;
  robotState.imuGyroZ = gyroZ;

  const float accelRoll = computeAccelRoll(robotState.imuAccelX, robotState.imuAccelY, robotState.imuAccelZ);
  const float accelPitch = computeAccelPitch(robotState.imuAccelX, robotState.imuAccelY, robotState.imuAccelZ);
  const unsigned long now = millis();

  if (!robotState.imuPoseInitialized || robotState.lastImuReadAt == 0 || now <= robotState.lastImuReadAt) {
    robotState.imuRoll = accelRoll;
    robotState.imuPitch = accelPitch;
    robotState.imuYaw = 0.0f;
    robotState.imuPoseInitialized = true;
  } else {
    const float dt = static_cast<float>(now - robotState.lastImuReadAt) / 1000.0f;
    robotState.imuRoll =
      IMU_COMPLEMENTARY_ALPHA * (robotState.imuRoll + gyroX * dt) +
      (1.0f - IMU_COMPLEMENTARY_ALPHA) * accelRoll;
    robotState.imuPitch =
      IMU_COMPLEMENTARY_ALPHA * (robotState.imuPitch + gyroY * dt) +
      (1.0f - IMU_COMPLEMENTARY_ALPHA) * accelPitch;
    robotState.imuYaw += gyroZ * dt;
  }

  robotState.lastImuReadAt = now;
  robotState.imuFallen =
    fabsf(robotState.imuRoll) >= IMU_FALLEN_THRESHOLD_DEG ||
    fabsf(robotState.imuPitch) >= IMU_FALLEN_THRESHOLD_DEG;

  return true;
}

void resetImuState() {
  robotState.imuAvailable = false;
  robotState.imuCalibrated = false;
  robotState.imuPoseInitialized = false;
  robotState.imuFallen = false;
  robotState.imuAddress = 0;
  robotState.imuRoll = 0.0f;
  robotState.imuPitch = 0.0f;
  robotState.imuYaw = 0.0f;
  robotState.imuTemperature = 0.0f;
  robotState.imuAccelX = 0.0f;
  robotState.imuAccelY = 0.0f;
  robotState.imuAccelZ = 0.0f;
  robotState.imuGyroX = 0.0f;
  robotState.imuGyroY = 0.0f;
  robotState.imuGyroZ = 0.0f;
  robotState.imuGyroBiasX = 0.0f;
  robotState.imuGyroBiasY = 0.0f;
  robotState.imuGyroBiasZ = 0.0f;
  robotState.lastImuReadAt = 0;
}

bool initMpu6050() {
  resetImuState();
  if (!IMU_MPU6050_ENABLED) {
    return false;
  }

  if (probeI2cDevice(MPU6050_PRIMARY_I2C_ADDRESS)) {
    robotState.imuAddress = MPU6050_PRIMARY_I2C_ADDRESS;
  } else if (probeI2cDevice(MPU6050_SECONDARY_I2C_ADDRESS)) {
    robotState.imuAddress = MPU6050_SECONDARY_I2C_ADDRESS;
  } else {
    Serial.println("MPU6050 not detected on I2C");
    return false;
  }

  uint8_t whoAmI = 0;
  if (!readMpu6050Bytes(MPU6050_WHO_AM_I_REGISTER, &whoAmI, 1) ||
      (whoAmI != MPU6050_PRIMARY_I2C_ADDRESS && whoAmI != MPU6050_SECONDARY_I2C_ADDRESS)) {
    Serial.printf("MPU6050 WHO_AM_I check failed: 0x%02X\n", whoAmI);
    resetImuState();
    return false;
  }

  if (!writeMpu6050Register(MPU6050_PWR_MGMT_1_REGISTER, 0x00) ||
      !writeMpu6050Register(MPU6050_SMPLRT_DIV_REGISTER, 0x07) ||
      !writeMpu6050Register(MPU6050_CONFIG_REGISTER, 0x03) ||
      !writeMpu6050Register(MPU6050_GYRO_CONFIG_REGISTER, 0x00) ||
      !writeMpu6050Register(MPU6050_ACCEL_CONFIG_REGISTER, 0x00)) {
    Serial.println("MPU6050 register configuration failed");
    resetImuState();
    return false;
  }

  delay(100);

  float gyroBiasX = 0.0f;
  float gyroBiasY = 0.0f;
  float gyroBiasZ = 0.0f;
  for (uint16_t sampleIndex = 0; sampleIndex < IMU_GYRO_CALIBRATION_SAMPLES; sampleIndex++) {
    uint8_t rawBytes[14];
    if (!readMpu6050Bytes(MPU6050_ACCEL_XOUT_H_REGISTER, rawBytes, sizeof(rawBytes))) {
      Serial.println("MPU6050 calibration read failed");
      resetImuState();
      return false;
    }

    const int16_t rawGyroX = static_cast<int16_t>((rawBytes[8] << 8) | rawBytes[9]);
    const int16_t rawGyroY = static_cast<int16_t>((rawBytes[10] << 8) | rawBytes[11]);
    const int16_t rawGyroZ = static_cast<int16_t>((rawBytes[12] << 8) | rawBytes[13]);
    gyroBiasX += static_cast<float>(rawGyroX) / MPU6050_GYRO_SCALE;
    gyroBiasY += static_cast<float>(rawGyroY) / MPU6050_GYRO_SCALE;
    gyroBiasZ += static_cast<float>(rawGyroZ) / MPU6050_GYRO_SCALE;
    delay(3);
  }

  robotState.imuGyroBiasX = gyroBiasX / static_cast<float>(IMU_GYRO_CALIBRATION_SAMPLES);
  robotState.imuGyroBiasY = gyroBiasY / static_cast<float>(IMU_GYRO_CALIBRATION_SAMPLES);
  robotState.imuGyroBiasZ = gyroBiasZ / static_cast<float>(IMU_GYRO_CALIBRATION_SAMPLES);

  if (!readMpu6050Sample()) {
    Serial.println("MPU6050 initial sample failed");
    resetImuState();
    return false;
  }

  robotState.imuAvailable = true;
  robotState.imuCalibrated = true;
  Serial.printf("MPU6050 ready on I2C 0x%02X\n", robotState.imuAddress);
  return true;
}

void updateImu() {
  if (!robotState.imuAvailable) {
    return;
  }

  if (!readMpu6050Sample()) {
    Serial.println("MPU6050 read failed");
    resetImuState();
  }
}

void initPca9685() {
  Wire.begin(PCA9685_SDA_PIN, PCA9685_SCL_PIN);
  Wire.setClock(PCA9685_I2C_CLOCK_HZ);

  robotState.servoDriverReady = probePca9685WithRetry();
  if (!robotState.servoDriverReady) {
    robotState.lastDriverError = "PCA9685 not detected on I2C";
    Serial.println(robotState.lastDriverError);
    return;
  }

  const float prescaleValue =
    (25000000.0f / (4096.0f * static_cast<float>(PCA9685_PWM_FREQUENCY))) - 1.0f;
  const uint8_t prescale = static_cast<uint8_t>(prescaleValue + 0.5f);
  const uint8_t oldMode = readPca9685Register(PCA9685_MODE1_REGISTER);
  const uint8_t sleepMode = static_cast<uint8_t>((oldMode & 0x7F) | 0x10);

  writePca9685Register(PCA9685_MODE1_REGISTER, sleepMode);
  writePca9685Register(PCA9685_PRESCALE_REGISTER, prescale);
  writePca9685Register(PCA9685_MODE2_REGISTER, 0x04);
  writePca9685Register(PCA9685_MODE1_REGISTER, static_cast<uint8_t>((oldMode & 0xEF) | 0x20));
  delay(5);
  writePca9685Register(PCA9685_MODE1_REGISTER, static_cast<uint8_t>((oldMode & 0xEF) | 0xA1));
  robotState.consecutiveServoWriteFailures = 0;
  robotState.nextServoWriteRetryAt = 0;
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    robotState.servoPwmActive[index] = false;
  }
  robotState.lastDriverError = "";
}

void restoreServoOutputs() {
  if (!robotState.servoDriverReady) {
    return;
  }

  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    const int physicalAngle = mapLogicalAngleToPhysical(index, robotState.servoAngles[index]);
    const uint16_t pulseUs = angleToPulseUs(physicalAngle);
    const uint16_t ticks = pulseUsToTicks(pulseUs);

    if (shouldSkipServoPwmWrite(index, ticks)) {
      continue;
    }

    if (shouldDeferServoPwmWrite()) {
      return;
    }

    if (!writePca9685Pwm(PCA9685_CHANNELS[index], 0, ticks)) {
      markServoPwmWriteFailed(index, "restore");
      return;
    }

    markServoPwmWriteSucceeded(index, ticks);
  }

  robotState.lastDriverError = "";
}

bool recoverPca9685IfNeeded(unsigned long now, bool force) {
  static unsigned long lastPcaRetryAt = 0;

  if (robotState.servoDriverReady) {
    return true;
  }

  if (!force && now - lastPcaRetryAt < PCA9685_RETRY_INTERVAL_MS) {
    return false;
  }

  lastPcaRetryAt = now;
  Serial.println("Attempting PCA9685 recovery");
  initPca9685();

  if (!robotState.servoDriverReady) {
    return false;
  }

  stopAllMotion();
  robotState.mode = "pca9685_recovered";
  if (robotState.servoDriverReady) {
    Serial.println("PCA9685 recovery succeeded");
    broadcastStatus();
    return true;
  }

  return false;
}

void applyServoAngle(uint8_t servoId, int angle) {
  if (servoId >= SERVO_COUNT) {
    return;
  }

  if (!robotState.servoDriverReady) {
    robotState.lastDriverError = "PCA9685 not ready";
    return;
  }

  const int constrained = constrain(angle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
  const int physicalAngle = mapLogicalAngleToPhysical(servoId, constrained);
  const uint16_t pulseUs = angleToPulseUs(physicalAngle);
  const uint16_t ticks = pulseUsToTicks(pulseUs);

  if (shouldSkipServoPwmWrite(servoId, ticks)) {
    robotState.servoAngles[servoId] = constrained;
    return;
  }

  if (shouldDeferServoPwmWrite()) {
    robotState.lastDriverError = "PCA9685 write retry pending";
    return;
  }

  if (!writePca9685Pwm(PCA9685_CHANNELS[servoId], 0, ticks)) {
    markServoPwmWriteFailed(servoId, "write");
    return;
  }

  markServoPwmWriteSucceeded(servoId, ticks);
  robotState.servoAngles[servoId] = constrained;
}

void applyServoPhysicalAngle(uint8_t servoId, int physicalAngle, bool updateLogicalState) {
  if (servoId >= SERVO_COUNT) {
    return;
  }

  if (!robotState.servoDriverReady) {
    robotState.lastDriverError = "PCA9685 not ready";
    return;
  }

  const int constrained = constrain(physicalAngle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
  const uint16_t pulseUs = angleToPulseUs(constrained);
  const uint16_t ticks = pulseUsToTicks(pulseUs);

  if (shouldSkipServoPwmWrite(servoId, ticks)) {
    if (updateLogicalState) {
      robotState.servoAngles[servoId] = constrained;
    }
    return;
  }

  if (shouldDeferServoPwmWrite()) {
    robotState.lastDriverError = "PCA9685 write retry pending";
    return;
  }

  if (!writePca9685Pwm(PCA9685_CHANNELS[servoId], 0, ticks)) {
    markServoPwmWriteFailed(servoId, "physical write");
    return;
  }

  markServoPwmWriteSucceeded(servoId, ticks);
  if (updateLogicalState) {
    robotState.servoAngles[servoId] = constrained;
  }
}

void centerPose() {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    applyServoAngle(index, SERVO_CENTER_ANGLE);
  }
}

void centerPhysicalPose() {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    applyServoPhysicalAngle(index, SERVO_CENTER_ANGLE, true);
  }
}

void releaseServoOutputs() {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    if (!writePca9685FullOff(PCA9685_CHANNELS[index])) {
      robotState.servoWriteFailures++;
      robotState.lastDriverError = "PCA9685 release failed";
    } else {
      robotState.servoPwmActive[index] = false;
    }
  }
}

String trimPreferenceKey(uint8_t servoId) {
  return String("trim") + String(servoId + 1);
}

void loadServoZeroOffsets() {
  preferences.begin("robot-servo", false);
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    robotState.servoZeroOffsets[index] = preferences.getInt(trimPreferenceKey(index).c_str(), 0);
  }
}

void saveServoZeroOffset(uint8_t servoId) {
  if (servoId >= SERVO_COUNT) {
    return;
  }
  preferences.putInt(trimPreferenceKey(servoId).c_str(), robotState.servoZeroOffsets[servoId]);
}

void resetServoZeroOffsets() {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    robotState.servoZeroOffsets[index] = 0;
    saveServoZeroOffset(index);
  }
}

void captureCurrentPoseAsServoZero() {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    const int delta = robotState.servoAngles[index] - SERVO_CENTER_ANGLE;
    const int direction = SERVO_INVERTED[index] ? -1 : 1;
    const int nextOffset = constrain(
      robotState.servoZeroOffsets[index] + direction * delta,
      SERVO_TRIM_MIN_ANGLE,
      SERVO_TRIM_MAX_ANGLE
    );
    robotState.servoZeroOffsets[index] = nextOffset;
    saveServoZeroOffset(index);
  }

  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    applyServoAngle(index, SERVO_CENTER_ANGLE);
  }
}

void resetGaitTelemetry() {
  gaitState.telemetryAvailable = false;
  gaitState.stepCount = 0;
  gaitState.estimatedForwardProgress = 0.0f;
  gaitState.baselineYaw = robotState.imuYaw;
  gaitState.baselineRoll = robotState.imuRoll;
  gaitState.stabilityScore = 0.0f;
  gaitState.lateralDriftMeters = 0.0f;
  gaitState.yawDriftDeg = 0.0f;
  gaitState.phase = GaitPhase::Idle;
}

void updateGaitTelemetry() {
  if (!gaitState.active && !gaitState.telemetryAvailable) {
    return;
  }

  if (robotState.imuAvailable) {
    gaitState.yawDriftDeg = robotState.imuYaw - gaitState.baselineYaw;
    gaitState.lateralDriftMeters =
      sinf((robotState.imuRoll - gaitState.baselineRoll) * K_DEGREES_TO_RADIANS) * 0.045f;
    const float rollPenalty = fabsf(robotState.imuRoll) * 0.018f;
    const float pitchPenalty = fabsf(robotState.imuPitch) * 0.022f;
    gaitState.stabilityScore = clampFloat(1.0f - rollPenalty - pitchPenalty, -1.0f, 1.0f);
  } else {
    gaitState.yawDriftDeg = 0.0f;
    gaitState.lateralDriftMeters = 0.0f;
    gaitState.stabilityScore = 0.0f;
  }

  gaitState.telemetryAvailable = gaitState.active || robotState.imuAvailable;
}

void stopPenguinGait(bool resetPose = true, const String& nextMode = "idle") {
  gaitState.active = false;
  gaitState.manualControl = false;
  gaitState.durationMs = 0;
  gaitState.phase = GaitPhase::Idle;
  updateGaitTelemetry();
  if (resetPose) {
    centerPose();
  }
  robotState.mode = nextMode;
}

void loadGaitParamsFromJson(JsonVariantConst paramsVariant) {
  gaitState.params.leanAngleDeg =
    clampFloat(paramsVariant["leanAngleDeg"] | gaitState.params.leanAngleDeg, 2.0f, 14.0f);
  gaitState.params.hipSwingDeg =
    clampFloat(paramsVariant["hipSwingDeg"] | gaitState.params.hipSwingDeg, 4.0f, 24.0f);
  gaitState.params.kneeLiftDeg =
    clampFloat(paramsVariant["kneeLiftDeg"] | gaitState.params.kneeLiftDeg, 4.0f, 28.0f);
  gaitState.params.stanceKneeDeg =
    clampFloat(paramsVariant["stanceKneeDeg"] | gaitState.params.stanceKneeDeg, 82.0f, 118.0f);
  gaitState.params.doubleSupportMs = constrain(
    static_cast<unsigned long>(paramsVariant["doubleSupportMs"] | gaitState.params.doubleSupportMs),
    80UL,
    420UL
  );
  gaitState.params.swingPhaseMs = constrain(
    static_cast<unsigned long>(paramsVariant["swingPhaseMs"] | gaitState.params.swingPhaseMs),
    180UL,
    820UL
  );
  gaitState.params.torsoLeadDeg =
    clampFloat(paramsVariant["torsoLeadDeg"] | gaitState.params.torsoLeadDeg, -8.0f, 12.0f);
  gaitState.params.neckTrimDeg =
    clampFloat(paramsVariant["neckTrimDeg"] | gaitState.params.neckTrimDeg, -16.0f, 16.0f);
}

void startPenguinGait(unsigned long durationMs, bool manualControl, uint32_t trialId = 0) {
  gaitState.active = true;
  gaitState.manualControl = manualControl;
  gaitState.trialId = trialId;
  gaitState.startedAt = millis();
  gaitState.phaseStartedAt = gaitState.startedAt;
  gaitState.durationMs = durationMs;
  gaitState.stepCount = 0;
  gaitState.estimatedForwardProgress = 0.0f;
  gaitState.baselineYaw = robotState.imuYaw;
  gaitState.baselineRoll = robotState.imuRoll;
  gaitState.phase = GaitPhase::ShiftLeft;
  gaitState.telemetryAvailable = true;
  gaitState.yawDriftDeg = 0.0f;
  gaitState.lateralDriftMeters = 0.0f;
  gaitState.stabilityScore = 0.0f;
  setPenguinPose(
    0.0f,
    0.0f,
    0.0f,
    0.0f,
    0.0f,
    0.0f
  );
  robotState.mode = manualControl ? "penguin_walk" : "gait_trial";
}

void updatePenguinGait() {
  if (!gaitState.active) {
    return;
  }

  const unsigned long now = millis();
  if (gaitState.durationMs > 0 && now - gaitState.startedAt >= gaitState.durationMs) {
    stopPenguinGait(true, "idle");
    return;
  }

  if (robotState.imuFallen) {
    stopPenguinGait(true, "gait_fallen");
    return;
  }

  unsigned long phaseDuration = gaitPhaseDurationMs(gaitState.phase);
  if (phaseDuration == 0) {
    gaitState.phase = GaitPhase::ShiftLeft;
    gaitState.phaseStartedAt = now;
    phaseDuration = gaitPhaseDurationMs(gaitState.phase);
  }

  if (now - gaitState.phaseStartedAt >= phaseDuration) {
    if (gaitState.phase == GaitPhase::SwingRight || gaitState.phase == GaitPhase::SwingLeft) {
      gaitState.stepCount++;
      gaitState.estimatedForwardProgress += gaitState.params.hipSwingDeg * 0.0014f;
    }
    gaitState.phase = nextGaitPhase(gaitState.phase);
    gaitState.phaseStartedAt = now;
    phaseDuration = gaitPhaseDurationMs(gaitState.phase);
  }

  const float progress = phaseDuration == 0
    ? 1.0f
    : clampFloat(static_cast<float>(now - gaitState.phaseStartedAt) / static_cast<float>(phaseDuration), 0.0f, 1.0f);
  const float eased = easeInOutSine(progress);
  const float wave = swingWave(progress);
  const float stanceBend = clampFloat(
    gaitState.params.stanceKneeDeg - SERVO_CENTER_ANGLE,
    2.0f,
    30.0f
  );
  const float shiftLean = gaitState.params.leanAngleDeg * PENGUIN_SHIFT_LEAN_FACTOR;
  const float swingLean = gaitState.params.leanAngleDeg * PENGUIN_SWING_LEAN_FACTOR;

  float bodyLean = 0.0f;
  float leftKneeBend = stanceBend;
  float rightKneeBend = stanceBend;
  float leftHipPitch = gaitState.params.torsoLeadDeg;
  float rightHipPitch = gaitState.params.torsoLeadDeg;

  switch (gaitState.phase) {
    case GaitPhase::ShiftLeft:
      bodyLean = lerpFloat(0.0f, shiftLean, eased);
      break;
    case GaitPhase::SwingRight:
      bodyLean = swingLean;
      rightKneeBend = stanceBend + gaitState.params.kneeLiftDeg * wave;
      leftHipPitch = gaitState.params.torsoLeadDeg + lerpFloat(
        gaitState.params.hipSwingDeg * 0.18f,
        -gaitState.params.hipSwingDeg * 0.55f,
        eased
      );
      rightHipPitch = gaitState.params.torsoLeadDeg + lerpFloat(
        -gaitState.params.hipSwingDeg * 0.45f,
        gaitState.params.hipSwingDeg,
        eased
      );
      break;
    case GaitPhase::ShiftRight:
      bodyLean = lerpFloat(shiftLean, -shiftLean, eased);
      break;
    case GaitPhase::SwingLeft:
      bodyLean = -swingLean;
      leftKneeBend = stanceBend + gaitState.params.kneeLiftDeg * wave;
      leftHipPitch = gaitState.params.torsoLeadDeg + lerpFloat(
        -gaitState.params.hipSwingDeg * 0.45f,
        gaitState.params.hipSwingDeg,
        eased
      );
      rightHipPitch = gaitState.params.torsoLeadDeg + lerpFloat(
        gaitState.params.hipSwingDeg * 0.18f,
        -gaitState.params.hipSwingDeg * 0.55f,
        eased
      );
      break;
    case GaitPhase::Idle:
    default:
      break;
  }

  setPenguinPose(
    bodyLean,
    leftKneeBend,
    rightKneeBend,
    leftHipPitch,
    rightHipPitch,
    gaitState.params.neckTrimDeg
  );
  updateGaitTelemetry();
}

void startLateralStep() {
  if (gaitState.active) {
    stopPenguinGait(false, "idle");
  }

  lateralStepState.active = true;
  lateralStepState.phase = LateralStepPhase::PreloadRight;
  lateralStepState.phaseStartedAt = millis();
  lateralStepState.cycleCount = 0;
  applyServoAngle(SERVO_LEFT_HIP_ROLL, 90);
  applyServoAngle(SERVO_RIGHT_HIP_ROLL, 90);
  robotState.mode = "lateral_step";
}

void stopLateralStep(bool resetPose, const String& nextMode) {
  lateralStepState.active = false;
  lateralStepState.phase = LateralStepPhase::Idle;
  if (resetPose) {
    applyServoAngle(SERVO_LEFT_HIP_ROLL, 90);
    applyServoAngle(SERVO_RIGHT_HIP_ROLL, 90);
  }
  robotState.mode = nextMode;
}

void advanceLateralStepPhase(unsigned long now) {
  switch (lateralStepState.phase) {
    case LateralStepPhase::PreloadRight:
      lateralStepState.phase = LateralStepPhase::ShiftLeft;
      break;
    case LateralStepPhase::ShiftLeft:
      lateralStepState.phase = LateralStepPhase::ShiftRight;
      break;
    case LateralStepPhase::ShiftRight:
      lateralStepState.phase = LateralStepPhase::ShiftLeft;
      lateralStepState.cycleCount++;
      break;
    case LateralStepPhase::Idle:
    default:
      lateralStepState.phase = LateralStepPhase::PreloadRight;
      break;
  }

  lateralStepState.phaseStartedAt = now;
}

void updateLateralStep() {
  if (!lateralStepState.active) {
    return;
  }

  const unsigned long now = millis();
  if (now - lateralStepState.phaseStartedAt >= LATERAL_STEP_PHASE_MS) {
    advanceLateralStepPhase(now);
  }

  const float progress = clampFloat(
    static_cast<float>(now - lateralStepState.phaseStartedAt) / static_cast<float>(LATERAL_STEP_PHASE_MS),
    0.0f,
    1.0f
  );
  const float eased = easeInOutSine(progress);

  float leftHipRoll = 90.0f;
  float rightHipRoll = 90.0f;

  switch (lateralStepState.phase) {
    case LateralStepPhase::PreloadRight:
      leftHipRoll = 90.0f;
      rightHipRoll = lerpFloat(90.0f, 95.0f, eased);
      break;
    case LateralStepPhase::ShiftLeft:
      leftHipRoll = lerpFloat(90.0f, 85.0f, eased);
      rightHipRoll = lerpFloat(95.0f, 90.0f, eased);
      break;
    case LateralStepPhase::ShiftRight:
      leftHipRoll = lerpFloat(85.0f, 90.0f, eased);
      rightHipRoll = lerpFloat(90.0f, 95.0f, eased);
      break;
    case LateralStepPhase::Idle:
    default:
      break;
  }

  applyServoAngle(SERVO_LEFT_HIP_ROLL, static_cast<int>(lroundf(leftHipRoll)));
  applyServoAngle(SERVO_RIGHT_HIP_ROLL, static_cast<int>(lroundf(rightHipRoll)));
}

void startForwardStep(bool flatFootVariant = false) {
  if (gaitState.active) {
    stopPenguinGait(false, "idle");
  }
  if (lateralStepState.active) {
    stopLateralStep(false, "idle");
  }
  if (ottoGaitState.active) {
    stopOttoGait(false, "idle");
  }

  forwardStepState.active = true;
  forwardStepState.flatFootVariant = flatFootVariant;
  forwardStepState.phase = ForwardStepPhase::ShiftToRightForLeft;
  forwardStepState.phaseStartedAt = millis();
  forwardStepState.cycleCount = 0;
  applyServoAngle(SERVO_LEFT_KNEE, 90);
  applyServoAngle(SERVO_RIGHT_KNEE, 90);
  applyServoAngle(SERVO_LEFT_HIP_ROLL, 90);
  applyServoAngle(SERVO_RIGHT_HIP_ROLL, 90);
  applyServoAngle(SERVO_LEFT_HIP_PITCH, 90);
  applyServoAngle(SERVO_RIGHT_HIP_PITCH, 90);
  robotState.mode = flatFootVariant ? "forward_step_2" : "forward_step";
}

void stopForwardStep(bool resetPose, const String& nextMode) {
  forwardStepState.active = false;
  forwardStepState.flatFootVariant = false;
  forwardStepState.phase = ForwardStepPhase::Idle;
  if (resetPose) {
    applyServoAngle(SERVO_LEFT_KNEE, 90);
    applyServoAngle(SERVO_RIGHT_KNEE, 90);
    applyServoAngle(SERVO_LEFT_HIP_ROLL, 90);
    applyServoAngle(SERVO_RIGHT_HIP_ROLL, 90);
    applyServoAngle(SERVO_LEFT_HIP_PITCH, 90);
    applyServoAngle(SERVO_RIGHT_HIP_PITCH, 90);
  }
  robotState.mode = nextMode;
}

void advanceForwardStepPhase(unsigned long now) {
  switch (forwardStepState.phase) {
    case ForwardStepPhase::ShiftToRightForLeft:
      forwardStepState.phase = ForwardStepPhase::LeftLift;
      break;
    case ForwardStepPhase::LeftLift:
      forwardStepState.phase = ForwardStepPhase::LeftSwing;
      break;
    case ForwardStepPhase::LeftSwing:
      forwardStepState.phase = ForwardStepPhase::LeftLand;
      break;
    case ForwardStepPhase::LeftLand:
      forwardStepState.phase = ForwardStepPhase::ShiftToLeftForSupport;
      break;
    case ForwardStepPhase::ShiftToLeftForSupport:
      forwardStepState.phase = ForwardStepPhase::LeftFollow;
      break;
    case ForwardStepPhase::LeftFollow:
      forwardStepState.phase = ForwardStepPhase::RightLift;
      break;
    case ForwardStepPhase::RightLift:
      forwardStepState.phase = ForwardStepPhase::RightSwing;
      break;
    case ForwardStepPhase::RightSwing:
      forwardStepState.phase = ForwardStepPhase::RightLand;
      break;
    case ForwardStepPhase::RightLand:
      forwardStepState.phase = ForwardStepPhase::ShiftToRightForSupport;
      break;
    case ForwardStepPhase::ShiftToRightForSupport:
      forwardStepState.phase = ForwardStepPhase::RightFollow;
      break;
    case ForwardStepPhase::RightFollow:
      forwardStepState.phase = ForwardStepPhase::LeftLift;
      forwardStepState.cycleCount++;
      break;
    case ForwardStepPhase::Idle:
    default:
      forwardStepState.phase = ForwardStepPhase::ShiftToRightForLeft;
      break;
  }

  forwardStepState.phaseStartedAt = now;
}

unsigned long forwardStepPhaseDurationMs(ForwardStepPhase phase) {
  switch (phase) {
    case ForwardStepPhase::ShiftToRightForLeft:
    case ForwardStepPhase::ShiftToLeftForSupport:
    case ForwardStepPhase::ShiftToRightForSupport:
      return FORWARD_WEIGHT_SHIFT_MS;
    case ForwardStepPhase::Idle:
    default:
      return FORWARD_STEP_PHASE_MS;
  }
}

void setForwardLean(float offset) {
  applyServoAngle(SERVO_LEFT_HIP_ROLL, static_cast<int>(lroundf(SERVO_CENTER_ANGLE + offset)));
  applyServoAngle(SERVO_RIGHT_HIP_ROLL, static_cast<int>(lroundf(SERVO_CENTER_ANGLE - offset)));
}

void updateForwardStep() {
  if (!forwardStepState.active) {
    return;
  }

  const unsigned long now = millis();
  unsigned long phaseDuration = forwardStepPhaseDurationMs(forwardStepState.phase);
  if (now - forwardStepState.phaseStartedAt >= phaseDuration) {
    advanceForwardStepPhase(now);
    phaseDuration = forwardStepPhaseDurationMs(forwardStepState.phase);
  }

  const float progress = clampFloat(
    static_cast<float>(now - forwardStepState.phaseStartedAt) / static_cast<float>(phaseDuration),
    0.0f,
    1.0f
  );
  const float eased = easeInOutSine(progress);

  float leftKnee = 90.0f;
  float rightKnee = 90.0f;
  float leftHipPitch = 90.0f;
  float rightHipPitch = 90.0f;
  float leanOffset = 0.0f;
  const bool flatFootVariant = forwardStepState.flatFootVariant;

  switch (forwardStepState.phase) {
    case ForwardStepPhase::ShiftToRightForLeft:
      leanOffset = lerpFloat(0.0f, RIGHT_LEAN_OFFSET, eased);
      break;
    case ForwardStepPhase::LeftLift:
      leanOffset = RIGHT_LEAN_OFFSET;
      leftKnee = flatFootVariant ? lerpFloat(90.0f, 70.0f, eased) : lerpFloat(90.0f, 105.0f, eased);
      leftHipPitch = flatFootVariant ? lerpFloat(90.0f, 110.0f, eased) : lerpFloat(90.0f, 85.0f, eased);
      break;
    case ForwardStepPhase::LeftSwing:
      leanOffset = RIGHT_LEAN_OFFSET;
      leftKnee = flatFootVariant ? 70.0f : 105.0f;
      leftHipPitch = flatFootVariant ? 110.0f : lerpFloat(85.0f, 100.0f, eased);
      break;
    case ForwardStepPhase::LeftLand:
      leanOffset = RIGHT_LEAN_OFFSET;
      leftKnee = flatFootVariant ? lerpFloat(70.0f, 90.0f, eased) : lerpFloat(105.0f, 90.0f, eased);
      leftHipPitch = flatFootVariant ? 110.0f : 100.0f;
      break;
    case ForwardStepPhase::ShiftToLeftForSupport:
      leanOffset = lerpFloat(RIGHT_LEAN_OFFSET, LEFT_LEAN_OFFSET, eased);
      leftHipPitch = flatFootVariant ? 110.0f : 100.0f;
      break;
    case ForwardStepPhase::LeftFollow:
      leanOffset = LEFT_LEAN_OFFSET;
      leftHipPitch = flatFootVariant ? lerpFloat(110.0f, 90.0f, eased) : lerpFloat(100.0f, 90.0f, eased);
      break;
    case ForwardStepPhase::RightLift:
      leanOffset = LEFT_LEAN_OFFSET;
      rightKnee = flatFootVariant ? lerpFloat(90.0f, 70.0f, eased) : lerpFloat(90.0f, 105.0f, eased);
      rightHipPitch = flatFootVariant ? lerpFloat(90.0f, 110.0f, eased) : lerpFloat(90.0f, 85.0f, eased);
      break;
    case ForwardStepPhase::RightSwing:
      leanOffset = LEFT_LEAN_OFFSET;
      rightKnee = flatFootVariant ? 70.0f : 105.0f;
      rightHipPitch = flatFootVariant ? 110.0f : lerpFloat(85.0f, 100.0f, eased);
      break;
    case ForwardStepPhase::RightLand:
      leanOffset = LEFT_LEAN_OFFSET;
      rightKnee = flatFootVariant ? lerpFloat(70.0f, 90.0f, eased) : lerpFloat(105.0f, 90.0f, eased);
      rightHipPitch = flatFootVariant ? 110.0f : 100.0f;
      break;
    case ForwardStepPhase::ShiftToRightForSupport:
      leanOffset = lerpFloat(LEFT_LEAN_OFFSET, RIGHT_LEAN_OFFSET, eased);
      rightHipPitch = flatFootVariant ? 110.0f : 100.0f;
      break;
    case ForwardStepPhase::RightFollow:
      leanOffset = RIGHT_LEAN_OFFSET;
      rightHipPitch = flatFootVariant ? lerpFloat(110.0f, 90.0f, eased) : lerpFloat(100.0f, 90.0f, eased);
      break;
    case ForwardStepPhase::Idle:
    default:
      break;
  }

  setForwardLean(leanOffset);
  applyServoAngle(SERVO_LEFT_KNEE, static_cast<int>(lroundf(leftKnee)));
  applyServoAngle(SERVO_RIGHT_KNEE, static_cast<int>(lroundf(rightKnee)));
  applyServoAngle(SERVO_LEFT_HIP_PITCH, static_cast<int>(lroundf(leftHipPitch)));
  applyServoAngle(SERVO_RIGHT_HIP_PITCH, static_cast<int>(lroundf(rightHipPitch)));
}

String ottoModeName(OttoMoveMode mode) {
  switch (mode) {
    case OttoMoveMode::StraightForward:
      return "otto_forward";
    case OttoMoveMode::AsyncForward:
      return "otto_async_forward";
    case OttoMoveMode::StraightBackward:
      return "otto_backward";
    case OttoMoveMode::AsyncBackward:
      return "otto_async_backward";
    case OttoMoveMode::Forward:
      return "otto_forward";
    case OttoMoveMode::Backward:
      return "otto_backward";
    case OttoMoveMode::TurnLeft:
      return "otto_left";
    case OttoMoveMode::TurnLeftFast:
      return "otto_left_fast";
    case OttoMoveMode::TurnRight:
      return "otto_right";
    case OttoMoveMode::ShiftLeft:
      return "otto_shift_left";
    case OttoMoveMode::ShiftRight:
      return "otto_shift_right";
    case OttoMoveMode::Idle:
    default:
      return "idle";
  }
}

float oscillatorAngle(float phase, float amplitudeDeg, float offsetDeg = 0.0f) {
  return clampFloat(
    SERVO_CENTER_ANGLE + offsetDeg + amplitudeDeg * sinf(phase),
    SERVO_MIN_ANGLE,
    SERVO_MAX_ANGLE
  );
}

void applyOttoPose(float leftLeg, float rightLeg, float leftHip, float rightHip) {
  applyServoAngle(SERVO_OTTO_LEFT_LEG, static_cast<int>(lroundf(leftLeg)));
  applyServoAngle(SERVO_OTTO_RIGHT_LEG, static_cast<int>(lroundf(rightLeg)));
  applyServoAngle(SERVO_OTTO_LEFT_HIP, static_cast<int>(lroundf(leftHip)));
  applyServoAngle(SERVO_OTTO_RIGHT_HIP, static_cast<int>(lroundf(rightHip)));
}

OttoMotionProfile bowlingTacticProfileFromCommand(
  const JsonDocument& doc,
  const char* name,
  const OttoMotionProfile& fallback
) {
  OttoMotionProfile profile = fallback;
  JsonVariantConst profiles = doc["ottoMotionProfiles"];
  if (!profiles.isNull() && profiles.is<JsonObjectConst>()) {
    applyOttoMotionProfileOverride(profile, profiles[name]);
  }
  return profile;
}

void cancelBowlingTactic() {
  bowlingTacticState.active = false;
  bowlingTacticState.targetYaw = 0.0f;
  bowlingTacticState.phase = BowlingTacticPhase::Idle;
}

void commandBowlingTacticPhase(BowlingTacticPhase phase) {
  if (bowlingTacticState.phase == phase && ottoGaitState.active) {
    robotState.mode = "otto_bowling_tactic";
    return;
  }

  bowlingTacticState.phase = phase;
  switch (phase) {
    case BowlingTacticPhase::RecoverLeft:
      startOttoGait(OttoMoveMode::TurnLeft, bowlingTacticState.turnLeftProfile, true);
      break;
    case BowlingTacticPhase::RecoverRight:
      startOttoGait(OttoMoveMode::TurnRight, bowlingTacticState.turnRightProfile, true);
      break;
    case BowlingTacticPhase::Straight:
      startOttoGait(OttoMoveMode::StraightForward, bowlingTacticState.forwardProfile, true);
      break;
    case BowlingTacticPhase::Idle:
    default:
      break;
  }

  robotState.mode = "otto_bowling_tactic";
}

void startBowlingTactic(const JsonDocument& doc) {
  const OttoMotionProfile aggressiveForwardProfile(10.5f, 11.2f, 18.5f, 19.5f, 1050UL);
  const OttoMotionProfile aggressiveTurnProfile(12.0f, 12.0f, 20.0f, 20.0f, 1100UL);

  bowlingTacticState.active = true;
  bowlingTacticState.targetYaw = robotState.imuYaw;
  bowlingTacticState.forwardProfile =
    bowlingTacticProfileFromCommand(doc, "forward", aggressiveForwardProfile);
  bowlingTacticState.turnLeftProfile =
    bowlingTacticProfileFromCommand(doc, "turnLeft", aggressiveTurnProfile);
  bowlingTacticState.turnRightProfile =
    bowlingTacticProfileFromCommand(doc, "turnRight", aggressiveTurnProfile);
  bowlingTacticState.phase = BowlingTacticPhase::Idle;
  commandBowlingTacticPhase(BowlingTacticPhase::Straight);
}

void updateBowlingTactic(unsigned long now) {
  (void)now;
  if (!bowlingTacticState.active || !robotState.imuAvailable) {
    return;
  }

  const float yawError = normalizeAngleDeltaDeg(robotState.imuYaw - bowlingTacticState.targetYaw);
  BowlingTacticPhase nextPhase = bowlingTacticState.phase;

  if (bowlingTacticState.phase == BowlingTacticPhase::Straight) {
    if (fabsf(yawError) <= OTTO_BOWLING_TACTIC_START_DEG) {
      return;
    }
    nextPhase = yawError > 0.0f ? BowlingTacticPhase::RecoverRight : BowlingTacticPhase::RecoverLeft;
  } else if (fabsf(yawError) <= OTTO_BOWLING_TACTIC_DONE_DEG) {
    nextPhase = BowlingTacticPhase::Straight;
  } else {
    nextPhase = yawError > 0.0f ? BowlingTacticPhase::RecoverRight : BowlingTacticPhase::RecoverLeft;
  }

  commandBowlingTacticPhase(nextPhase);
}

void startOttoGait(OttoMoveMode mode, const OttoMotionProfile& profile, bool keepBowlingTactic) {
  if (!keepBowlingTactic) {
    cancelBowlingTactic();
  }
  if (gaitState.active) {
    stopPenguinGait(false, "idle");
  }
  if (lateralStepState.active) {
    stopLateralStep(false, "idle");
  }
  if (forwardStepState.active) {
    stopForwardStep(false, "idle");
  }

  const unsigned long now = millis();
  ottoGaitState.active = true;
  ottoGaitState.mode = mode;
  ottoGaitState.startedAt = now;
  ottoGaitState.lastSampleAt = 0;
  ottoGaitState.straightAssistBaselineYaw = robotState.imuYaw;
  ottoGaitState.straightAssistActive =
    OTTO_IMU_STRAIGHT_ASSIST_ENABLED &&
    robotState.imuAvailable &&
    isOttoForwardMode(mode);
  startOttoStraightDiagnostic(mode, now);
  ottoGaitState.motionProfile = profile;
  applyOttoPose(90.0f, 90.0f, 90.0f, 90.0f);
  robotState.mode = ottoModeName(mode);
}

void stopOttoGait(bool resetPose, const String& nextMode) {
  cancelBowlingTactic();
  stopOttoStraightDiagnostic(millis());
  ottoGaitState.active = false;
  ottoGaitState.mode = OttoMoveMode::Idle;
  ottoGaitState.straightAssistActive = false;
  ottoGaitState.straightAssistBaselineYaw = 0.0f;
  if (resetPose) {
    applyOttoPose(90.0f, 90.0f, 90.0f, 90.0f);
  }
  ottoGaitState.motionProfile = OttoMotionProfile{};
  robotState.mode = nextMode;
}

void updateOttoGait() {
  if (!ottoGaitState.active) {
    return;
  }

  const unsigned long now = millis();
  if (ottoGaitState.lastSampleAt != 0 && now - ottoGaitState.lastSampleAt < OTTO_GAIT_SAMPLE_MS) {
    return;
  }
  ottoGaitState.lastSampleAt = now;

  const unsigned long gaitPeriodMs = constrain(ottoGaitState.motionProfile.periodMs, 650UL, 1800UL);
  const float cycleProgress =
    static_cast<float>((now - ottoGaitState.startedAt) % gaitPeriodMs) /
    static_cast<float>(gaitPeriodMs);
  const float basePhase = K_TWO_PI * cycleProgress;

  float leftLegAmplitude = ottoGaitState.motionProfile.leftLegAmplitudeDeg;
  float rightLegAmplitude = ottoGaitState.motionProfile.rightLegAmplitudeDeg;
  float leftHipAmplitude = ottoGaitState.motionProfile.leftHipAmplitudeDeg;
  float rightHipAmplitude = ottoGaitState.motionProfile.rightHipAmplitudeDeg;
  float leftLegPhase = basePhase;
  float rightLegPhase = basePhase;
  float leftHipPhase = basePhase - K_HALF_PI;
  float rightHipPhase = basePhase - K_HALF_PI;
  float leftLegOffset = 0.0f;
  float rightLegOffset = 0.0f;
  float leftHipOffset = OTTO_LEFT_HIP_OFFSET_DEG;
  float rightHipOffset = OTTO_RIGHT_HIP_OFFSET_DEG;

  switch (ottoGaitState.mode) {
    case OttoMoveMode::StraightForward:
      leftLegPhase = basePhase + K_HALF_PI;
      rightLegPhase = basePhase + K_HALF_PI;
      leftHipPhase = basePhase;
      rightHipPhase = basePhase;
      leftLegOffset = OTTO_LEFT_LEG_OFFSET_DEG;
      rightLegOffset = OTTO_RIGHT_LEG_OFFSET_DEG;
      leftHipOffset = 0.0f;
      rightHipOffset = 0.0f;
      break;
    case OttoMoveMode::AsyncForward:
      leftLegPhase = basePhase + K_HALF_PI;
      rightLegPhase = basePhase - K_HALF_PI;
      leftHipPhase = basePhase;
      rightHipPhase = basePhase + K_PI;
      leftLegOffset = OTTO_LEFT_LEG_OFFSET_DEG;
      rightLegOffset = OTTO_RIGHT_LEG_OFFSET_DEG;
      leftHipOffset = 0.0f;
      rightHipOffset = 0.0f;
      break;
    case OttoMoveMode::StraightBackward:
      leftLegPhase = basePhase - K_HALF_PI;
      rightLegPhase = basePhase - K_HALF_PI;
      leftHipPhase = basePhase;
      rightHipPhase = basePhase;
      leftLegOffset = OTTO_LEFT_LEG_OFFSET_DEG;
      rightLegOffset = OTTO_RIGHT_LEG_OFFSET_DEG;
      leftHipOffset = 0.0f;
      rightHipOffset = 0.0f;
      break;
    case OttoMoveMode::AsyncBackward:
      leftLegPhase = basePhase - K_HALF_PI;
      rightLegPhase = basePhase + K_HALF_PI;
      leftHipPhase = basePhase;
      rightHipPhase = basePhase + K_PI;
      leftLegOffset = OTTO_LEFT_LEG_OFFSET_DEG;
      rightLegOffset = OTTO_RIGHT_LEG_OFFSET_DEG;
      leftHipOffset = 0.0f;
      rightHipOffset = 0.0f;
      break;
    case OttoMoveMode::Backward:
      leftHipPhase = basePhase + K_HALF_PI;
      rightHipPhase = basePhase - K_HALF_PI;
      rightHipOffset = OTTO_LEFT_HIP_OFFSET_DEG;
      break;
    case OttoMoveMode::TurnLeft:
      leftLegPhase = basePhase + K_HALF_PI;
      rightLegPhase = basePhase + K_HALF_PI;
      leftHipPhase = basePhase;
      rightHipPhase = basePhase;
      leftLegAmplitude *= OTTO_LEFT_TURN_INNER_LEG_SCALE;
      rightLegAmplitude *= OTTO_LEFT_TURN_OUTER_LEG_SCALE;
      leftHipAmplitude *= OTTO_LEFT_TURN_INNER_HIP_SCALE;
      rightHipAmplitude *= OTTO_LEFT_TURN_OUTER_HIP_SCALE;
      leftLegOffset = OTTO_LEFT_LEG_OFFSET_DEG;
      rightLegOffset = OTTO_RIGHT_LEG_OFFSET_DEG;
      leftHipOffset = 0.0f;
      rightHipOffset = 0.0f;
      break;
    case OttoMoveMode::TurnLeftFast:
      leftLegPhase = basePhase + K_HALF_PI;
      rightLegPhase = basePhase + K_HALF_PI;
      leftHipPhase = basePhase;
      rightHipPhase = basePhase;
      leftHipAmplitude *= OTTO_TURN_INNER_SIDE_SCALE;
      rightHipAmplitude *= OTTO_TURN_OUTER_SIDE_SCALE;
      leftLegOffset = OTTO_LEFT_LEG_OFFSET_DEG;
      rightLegOffset = OTTO_RIGHT_LEG_OFFSET_DEG;
      leftHipOffset = 0.0f;
      rightHipOffset = 0.0f;
      break;
    case OttoMoveMode::TurnRight:
      leftLegPhase = basePhase + K_HALF_PI;
      rightLegPhase = basePhase + K_HALF_PI;
      leftHipPhase = basePhase;
      rightHipPhase = basePhase;
      leftHipAmplitude *= OTTO_TURN_OUTER_SIDE_SCALE;
      rightHipAmplitude *= OTTO_TURN_INNER_SIDE_SCALE;
      leftLegOffset = OTTO_LEFT_LEG_OFFSET_DEG;
      rightLegOffset = OTTO_RIGHT_LEG_OFFSET_DEG;
      leftHipOffset = 0.0f;
      rightHipOffset = 0.0f;
      break;
    case OttoMoveMode::ShiftLeft:
      leftLegAmplitude *= OTTO_SHIFT_LEG_DRAG_SCALE;
      rightLegAmplitude *= OTTO_SHIFT_LEG_DRAG_SCALE;
      leftLegPhase = basePhase + K_HALF_PI;
      rightLegPhase = basePhase + K_HALF_PI;
      leftHipPhase = basePhase;
      rightHipPhase = basePhase - K_ONE_THIRD_PI;
      leftLegOffset = OTTO_LEFT_LEG_OFFSET_DEG;
      rightLegOffset = OTTO_RIGHT_LEG_OFFSET_DEG;
      leftHipOffset = OTTO_SHIFT_HIP_OFFSET_DEG;
      rightHipOffset = -OTTO_SHIFT_HIP_OFFSET_DEG;
      break;
    case OttoMoveMode::ShiftRight:
      leftLegAmplitude *= OTTO_SHIFT_LEG_DRAG_SCALE;
      rightLegAmplitude *= OTTO_SHIFT_LEG_DRAG_SCALE;
      leftLegPhase = basePhase + K_HALF_PI;
      rightLegPhase = basePhase + K_HALF_PI;
      leftHipPhase = basePhase;
      rightHipPhase = basePhase + K_ONE_THIRD_PI;
      leftLegOffset = OTTO_LEFT_LEG_OFFSET_DEG;
      rightLegOffset = OTTO_RIGHT_LEG_OFFSET_DEG;
      leftHipOffset = -OTTO_SHIFT_HIP_OFFSET_DEG;
      rightHipOffset = OTTO_SHIFT_HIP_OFFSET_DEG;
      break;
    case OttoMoveMode::Forward:
      rightHipPhase = basePhase + K_HALF_PI;
      rightHipOffset = OTTO_LEFT_HIP_OFFSET_DEG;
      break;
    case OttoMoveMode::Idle:
    default:
      break;
  }

  if (isOttoForwardMode(ottoGaitState.mode)) {
    updateOttoStraightDiagnostic(now);
    const float correction = ottoStraightAssistCorrection();
    leftLegAmplitude *= 1.0f + correction * 0.5f;
    rightLegAmplitude *= 1.0f - correction * 0.5f;
    leftHipAmplitude *= 1.0f + correction;
    rightHipAmplitude *= 1.0f - correction;
  }

  const float leftLeg = oscillatorAngle(leftLegPhase, leftLegAmplitude, leftLegOffset);
  const float rightLeg = oscillatorAngle(rightLegPhase, rightLegAmplitude, rightLegOffset);
  const float leftHip = oscillatorAngle(leftHipPhase, leftHipAmplitude, leftHipOffset);
  const float rightHip = oscillatorAngle(rightHipPhase, rightHipAmplitude, rightHipOffset);

  applyOttoPose(leftLeg, rightLeg, leftHip, rightHip);
}

void stopAllMotion() {
  stopPenguinGait(true, "stop");
  stopLateralStep(true, "stop");
  stopForwardStep(true, "stop");
  stopOttoGait(true, "stop");
}

void runAction(const String& name) {
  if (gaitState.active) {
    stopPenguinGait(false, "idle");
  }
  if (lateralStepState.active) {
    stopLateralStep(false, "idle");
  }
  if (forwardStepState.active) {
    stopForwardStep(false, "idle");
  }
  if (ottoGaitState.active) {
    stopOttoGait(false, "idle");
  }

  if (name == "lateral_step") {
    startLateralStep();
    return;
  }

  if (name == "stand") {
    applyServoAngle(0, 90);
    applyServoAngle(1, 85);
    applyServoAngle(2, 95);
    robotState.mode = "stand";
    return;
  }

  if (name == "squat") {
    applyServoAngle(0, 70);
    applyServoAngle(1, 115);
    applyServoAngle(2, 125);
    robotState.mode = "squat";
    return;
  }

  if (name == "center") {
    centerPose();
    robotState.mode = "center";
    return;
  }

  if (name == "factory_center") {
    centerPhysicalPose();
    robotState.mode = "factory_center";
    return;
  }

  robotState.mode = "idle";
}

void runMove(const JsonDocument& doc) {
  const String direction = doc["direction"] | "stop";
  const int speed = doc["speed"] | 0;
  JsonVariantConst motionProfileOverride = doc["ottoMotionProfile"];
  if (motionProfileOverride.isNull()) {
    motionProfileOverride = doc["motionProfile"];
  }

  if (direction == "otto_bowling_tactic") {
    startBowlingTactic(doc);
    return;
  }

  if (direction == "otto_forward") {
    startOttoGait(OttoMoveMode::StraightForward, resolveOttoMotionProfile(OttoMoveMode::StraightForward, motionProfileOverride));
    return;
  }

  if (direction == "otto_async_forward") {
    startOttoGait(OttoMoveMode::AsyncForward, resolveOttoMotionProfile(OttoMoveMode::AsyncForward, motionProfileOverride));
    return;
  }

  if (direction == "otto_backward") {
    startOttoGait(OttoMoveMode::StraightBackward, resolveOttoMotionProfile(OttoMoveMode::StraightBackward, motionProfileOverride));
    return;
  }

  if (direction == "otto_async_backward") {
    startOttoGait(OttoMoveMode::AsyncBackward, resolveOttoMotionProfile(OttoMoveMode::AsyncBackward, motionProfileOverride));
    return;
  }

  if (direction == "otto_left") {
    startOttoGait(OttoMoveMode::TurnLeft, resolveOttoMotionProfile(OttoMoveMode::TurnLeft, motionProfileOverride));
    return;
  }

  if (direction == "otto_left_fast") {
    startOttoGait(OttoMoveMode::TurnLeftFast, resolveOttoMotionProfile(OttoMoveMode::TurnLeftFast, motionProfileOverride));
    return;
  }

  if (direction == "otto_right") {
    startOttoGait(OttoMoveMode::TurnRight, resolveOttoMotionProfile(OttoMoveMode::TurnRight, motionProfileOverride));
    return;
  }

  if (direction == "otto_shift_left") {
    startOttoGait(OttoMoveMode::ShiftLeft, resolveOttoMotionProfile(OttoMoveMode::ShiftLeft, motionProfileOverride));
    return;
  }

  if (direction == "otto_shift_right") {
    startOttoGait(OttoMoveMode::ShiftRight, resolveOttoMotionProfile(OttoMoveMode::ShiftRight, motionProfileOverride));
    return;
  }

  if (direction == "otto_stop") {
    stopOttoGait(false, "idle");
    return;
  }

  if (direction == "forward") {
    startForwardStep(false);
    return;
  }

  if (direction == "forward_2") {
    startForwardStep(true);
    return;
  }

  if (direction == "stop") {
    stopPenguinGait(false, "idle");
    stopLateralStep(false, "idle");
    stopForwardStep(false, "idle");
    stopOttoGait(false, "idle");
    return;
  }

  if (gaitState.active) {
    stopPenguinGait(false, "idle");
  }
  if (lateralStepState.active) {
    stopLateralStep(false, "idle");
  }
  if (forwardStepState.active) {
    stopForwardStep(false, "idle");
  }
  if (ottoGaitState.active) {
    stopOttoGait(false, "idle");
  }

  const int delta = constrain(speed / 5, 0, 18);

  if (direction == "backward") {
    applyServoAngle(0, 90 - delta);
    applyServoAngle(1, 90 + delta);
    applyServoAngle(2, 90 - delta);
    robotState.mode = "backward";
    return;
  }

  if (direction == "left") {
    applyServoAngle(0, 90 - delta);
    applyServoAngle(1, 90);
    applyServoAngle(2, 90 + delta);
    robotState.mode = "left";
    return;
  }

  if (direction == "right") {
    applyServoAngle(0, 90 + delta);
    applyServoAngle(1, 90);
    applyServoAngle(2, 90 - delta);
    robotState.mode = "right";
    return;
  }

  stopAllMotion();
}

bool handleCommandDocument(JsonDocument& doc) {
  if (!doc["type"].is<const char*>()) {
    return false;
  }

  const String type = doc["type"].as<String>();
  robotState.lastCommandAt = millis();

  if (type == "status_request") {
    broadcastStatus();
    return true;
  }

  if (robotState.otaInProgress) {
    return false;
  }

  if (type == "servo") {
    if (gaitState.active) {
      stopPenguinGait(false, "idle");
    }
    if (lateralStepState.active) {
      stopLateralStep(false, "idle");
    }
    if (forwardStepState.active) {
      stopForwardStep(false, "idle");
    }
    if (ottoGaitState.active) {
      stopOttoGait(false, "idle");
    }
    const uint8_t id = static_cast<uint8_t>((doc["id"] | 1) - 1);
    const int angle = doc["angle"] | SERVO_CENTER_ANGLE;
    applyServoAngle(id, angle);
    robotState.mode = "servo";
    broadcastStatus();
    return true;
  }

  if (type == "servo_trim") {
    if (gaitState.active) {
      stopPenguinGait(false, "idle");
    }
    if (lateralStepState.active) {
      stopLateralStep(false, "idle");
    }
    if (forwardStepState.active) {
      stopForwardStep(false, "idle");
    }
    if (ottoGaitState.active) {
      stopOttoGait(false, "idle");
    }
    const uint8_t id = static_cast<uint8_t>((doc["id"] | 1) - 1);
    if (id >= SERVO_COUNT) {
      return false;
    }

    const int offset = constrain(
      static_cast<int>(doc["offset"] | 0),
      SERVO_TRIM_MIN_ANGLE,
      SERVO_TRIM_MAX_ANGLE
    );
    const bool applyNow = doc["applyNow"] | true;
    robotState.servoZeroOffsets[id] = offset;
    saveServoZeroOffset(id);
    if (applyNow) {
      applyServoAngle(id, robotState.servoAngles[id]);
    }
    robotState.mode = "servo_trim";
    broadcastStatus();
    return true;
  }

  if (type == "servo_trim_reset_all") {
    if (gaitState.active) {
      stopPenguinGait(false, "idle");
    }
    if (lateralStepState.active) {
      stopLateralStep(false, "idle");
    }
    if (forwardStepState.active) {
      stopForwardStep(false, "idle");
    }
    if (ottoGaitState.active) {
      stopOttoGait(false, "idle");
    }
    resetServoZeroOffsets();
    for (uint8_t index = 0; index < SERVO_COUNT; index++) {
      applyServoAngle(index, robotState.servoAngles[index]);
    }
    robotState.mode = "servo_trim_reset_all";
    broadcastStatus();
    return true;
  }

  if (type == "servo_trim_capture_current_pose") {
    if (gaitState.active) {
      stopPenguinGait(false, "idle");
    }
    if (lateralStepState.active) {
      stopLateralStep(false, "idle");
    }
    if (forwardStepState.active) {
      stopForwardStep(false, "idle");
    }
    if (ottoGaitState.active) {
      stopOttoGait(false, "idle");
    }
    captureCurrentPoseAsServoZero();
    robotState.mode = "servo_trim_capture_current_pose";
    broadcastStatus();
    return true;
  }

  if (type == "gait_trial_start") {
    if (lateralStepState.active) {
      stopLateralStep(false, "idle");
    }
    if (forwardStepState.active) {
      stopForwardStep(false, "idle");
    }
    if (ottoGaitState.active) {
      stopOttoGait(false, "idle");
    }
    loadGaitParamsFromJson(doc["params"]);
    startPenguinGait(
      static_cast<unsigned long>(doc["durationMs"] | 0),
      false,
      static_cast<uint32_t>(doc["trialId"] | 0)
    );
    broadcastStatus();
    return true;
  }

  if (type == "gait_trial_stop") {
    stopPenguinGait(true, "idle");
    stopLateralStep(true, "idle");
    stopForwardStep(true, "idle");
    stopOttoGait(true, "idle");
    broadcastStatus();
    return true;
  }

  if (type == "action") {
    runAction(doc["name"] | "idle");
    broadcastStatus();
    return true;
  }

  if (type == "move") {
    runMove(doc);
    broadcastStatus();
    return true;
  }

  if (type == "vision_autopilot") {
    const bool enabled = doc["enabled"] | true;
    String task = doc["task"] | "task1";
    if (task != "task1" && task != "task2") {
      task = "task1";
    }
    setVisionAutopilotEnabled(enabled, task);
    broadcastStatus();
    return true;
  }

  if (type == "task1_front_pole_bypass") {
    startTask1FrontPoleBypass(millis());
    broadcastStatus();
    return true;
  }

  if (type == "otto_motion_profile_save") {
    String profileName = doc["profile"] | "";
    if (profileName.length() == 0) {
      profileName = doc["name"] | "";
    }
    if (profileName.length() == 0) {
      profileName = doc["direction"] | "";
    }
    size_t profileIndex = 0;
    if (!parseOttoMotionProfileName(profileName, profileIndex)) {
      return false;
    }

    OttoMotionProfile profile = ottoMotionProfiles[profileIndex];
    applyOttoMotionProfileOverride(profile, doc["motionProfile"]);
    applyOttoMotionProfileOverride(profile, doc["ottoMotionProfile"]);
    saveOttoMotionProfile(profileName, profile);
    broadcastStatus();
    return true;
  }

  if (type == "emergency_stop") {
    setVisionAutopilotEnabled(false, "idle");
    stopAllMotion();
    robotState.mode = "emergency_stop";
    broadcastStatus();
    return true;
  }

  return false;
}

void handleControlBody(
  AsyncWebServerRequest* request,
  uint8_t* data,
  size_t len,
  size_t index,
  size_t total
) {
  String* body = reinterpret_cast<String*>(request->_tempObject);

  if (index == 0) {
    request->_tempObject = new String();
    body = reinterpret_cast<String*>(request->_tempObject);
    body->reserve(total);
  }

  for (size_t offset = 0; offset < len; offset++) {
    body->concat(static_cast<char>(data[offset]));
  }

  if (index + len != total) {
    return;
  }

  JsonDocument doc;
  const DeserializationError error = deserializeJson(doc, *body);

  delete body;
  request->_tempObject = nullptr;

  if (error || !handleCommandDocument(doc)) {
    request->send(400, "application/json", "{\"ok\":false,\"message\":\"invalid command\"}");
    return;
  }

  request->send(200, "application/json", "{\"ok\":true}");
}

void handleWebSocketMessage(
  AsyncWebSocket* serverPtr,
  AsyncWebSocketClient* client,
  AwsEventType type,
  void* arg,
  uint8_t* data,
  size_t len
) {
  if (type == WS_EVT_CONNECT) {
    client->text(buildStatusJson());
    return;
  }

  if (type != WS_EVT_DATA) {
    return;
  }

  AwsFrameInfo* info = reinterpret_cast<AwsFrameInfo*>(arg);
  if (!info->final || info->index != 0 || info->len != len || info->opcode != WS_TEXT) {
    return;
  }

  JsonDocument doc;
  const DeserializationError error = deserializeJson(doc, data, len);
  if (error) {
    client->text("{\"type\":\"error\",\"message\":\"invalid json\"}");
    return;
  }

  if (!handleCommandDocument(doc)) {
    client->text("{\"type\":\"error\",\"message\":\"command rejected\"}");
  }
}

void configureHttpRoutes() {
  server.on("/status", HTTP_GET, [](AsyncWebServerRequest* request) {
    robotState.connected = WiFi.status() == WL_CONNECTED;
    robotState.signalStrength = WiFi.RSSI();
    robotState.battery = readBatteryVoltage();
    request->send(200, "application/json", buildStatusJson());
  });

  server.on(
    "/control",
    HTTP_POST,
    [](AsyncWebServerRequest* request) {},
    nullptr,
    handleControlBody
  );

  server.on(
    "/update",
    HTTP_POST,
    [](AsyncWebServerRequest* request) {
      const bool success = !Update.hasError();
      request->send(
        success ? 200 : 500,
        "application/json",
        success ? "{\"ok\":true,\"message\":\"restarting\"}" : "{\"ok\":false}"
      );

      if (success) {
        delay(500);
        ESP.restart();
      }
    },
    [](AsyncWebServerRequest* request, const String& filename, size_t index, uint8_t* data, size_t len, bool final) {
      if (index == 0) {
        robotState.otaInProgress = true;
        stopAllMotion();
        if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
          Update.printError(Serial);
        }
        Serial.printf("OTA start: %s\n", filename.c_str());
      }

      if (!Update.hasError() && Update.write(data, len) != len) {
        Update.printError(Serial);
      }

      if (final) {
        if (Update.end(true)) {
          Serial.printf("OTA success: %u bytes\n", index + len);
        } else {
          Update.printError(Serial);
        }
        robotState.otaInProgress = false;
        broadcastStatus();
      }
    }
  );

  server.onNotFound([](AsyncWebServerRequest* request) {
    request->send(404, "application/json", "{\"ok\":false,\"message\":\"not found\"}");
  });

  socketServer.onEvent(handleWebSocketMessage);
  server.addHandler(&socketServer);
}

IPAddress ipFromBytes(const uint8_t* value) {
  return IPAddress(value[0], value[1], value[2], value[3]);
}

bool connectWifiProfile(const WifiProfile& profile) {
  WiFi.disconnect(false, true);
  delay(100);

  if (WIFI_USE_STATIC_IP) {
    if (!WiFi.config(
          ipFromBytes(profile.staticIp),
          ipFromBytes(profile.gateway),
          ipFromBytes(profile.subnet),
          ipFromBytes(profile.dnsPrimary),
          ipFromBytes(profile.dnsSecondary)
        )) {
      Serial.printf("Static IP configuration failed for %s\n", profile.name);
    }
  }

  WiFi.begin(profile.ssid, profile.password);
  Serial.printf("Connecting to Wi-Fi (%s): %s\n", profile.name, profile.ssid);

  unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_CONNECT_TIMEOUT_MS) {
    delay(300);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("Wi-Fi connection timeout for %s\n", profile.name);
    return false;
  }

  activeWifiProfileName = profile.name;
  robotState.connected = true;
  robotState.signalStrength = WiFi.RSSI();
  Serial.printf("Wi-Fi connected via %s: %s\n", profile.name, WiFi.localIP().toString().c_str());
  return true;
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  activeWifiProfileName = "none";

  for (const WifiProfile& profile : wifiProfiles) {
    if (connectWifiProfile(profile)) {
      return;
    }
  }

  robotState.connected = false;
  Serial.println("Wi-Fi connection failed for all configured profiles");
}

void setup() {
  Serial.begin(115200);
  delay(200);

  resetGaitTelemetry();
  loadServoZeroOffsets();
  loadOttoMotionProfiles();
  initBoundaryGuard();
  initUltrasonic();
  initPca9685();
  initMpu6050();
  if (SERVO_CENTER_ON_BOOT) {
    centerPose();
  } else {
    releaseServoOutputs();
  }
  connectWifi();
  configureHttpRoutes();
  server.begin();
  broadcastStatus();
}

void loop() {
  socketServer.cleanupClients();

  const unsigned long now = millis();
  static unsigned long lastStatusPushAt = 0;
  static unsigned long lastImuUpdateAt = 0;
  static unsigned long lastImuRetryAt = 0;
  static unsigned long lastWifiReconnectAt = 0;

  updateUltrasonic(now);
  handleVisionSerialInput();
  updateVisionAutopilotTimeout(now);
  updateTask1BodyAutopilot(now);
  updateTask1FrontPoleBypass(now);

  if (!robotState.otaInProgress && updateBoundaryGuard(now)) {
    return;
  }

  if (IMU_MPU6050_ENABLED) {
    if (robotState.imuAvailable) {
      if (now - lastImuUpdateAt >= IMU_UPDATE_INTERVAL_MS) {
        updateImu();
        updateGaitTelemetry();
        lastImuUpdateAt = now;
      }
    } else if (now - lastImuRetryAt >= IMU_RETRY_INTERVAL_MS) {
      initMpu6050();
      lastImuRetryAt = now;
      lastImuUpdateAt = now;
    }
  }

  if (!robotState.otaInProgress) {
    recoverPca9685IfNeeded(now);
  }

  updatePenguinGait();
  updateLateralStep();
  updateForwardStep();
  updateBowlingTactic(now);
  updateOttoGait();

  if (WiFi.status() != WL_CONNECTED) {
    robotState.connected = false;
    if (!robotState.otaInProgress && now - lastWifiReconnectAt >= WIFI_RECONNECT_INTERVAL_MS) {
      lastWifiReconnectAt = now;
      Serial.println("Wi-Fi disconnected, attempting configured profiles");
      connectWifi();
    }
  } else {
    if (!robotState.connected) {
      robotState.connected = true;
      Serial.printf("Wi-Fi reconnected: %s\n", WiFi.localIP().toString().c_str());
      broadcastStatus();
    }
    robotState.connected = true;
    lastWifiReconnectAt = now;
  }

  if (now - lastStatusPushAt >= STATUS_PUSH_INTERVAL_MS) {
    robotState.signalStrength = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : -100;
    robotState.battery = readBatteryVoltage();
    broadcastStatus();
    lastStatusPushAt = now;
  }

  const bool shouldAutoStop =
    robotState.mode != "idle" &&
    robotState.mode != "servo" &&
    robotState.mode != "servo_trim" &&
    robotState.mode != "servo_trim_reset_all" &&
    robotState.mode != "servo_trim_capture_current_pose" &&
    robotState.mode != "penguin_walk" &&
    robotState.mode != "gait_trial" &&
    robotState.mode != "lateral_step" &&
    robotState.mode != "forward_step" &&
    robotState.mode != "forward_step_2" &&
    robotState.mode != "otto_forward" &&
    robotState.mode != "otto_async_forward" &&
    robotState.mode != "otto_backward" &&
    robotState.mode != "otto_async_backward" &&
    robotState.mode != "otto_left" &&
    robotState.mode != "otto_left_fast" &&
    robotState.mode != "otto_right" &&
    robotState.mode != "otto_shift_left" &&
    robotState.mode != "otto_shift_right" &&
    robotState.mode != "otto_bowling_tactic";

  if (!robotState.otaInProgress && shouldAutoStop && now - robotState.lastCommandAt > SAFETY_TIMEOUT_MS) {
    stopAllMotion();
    robotState.mode = "idle";
    broadcastStatus();
  }
}
