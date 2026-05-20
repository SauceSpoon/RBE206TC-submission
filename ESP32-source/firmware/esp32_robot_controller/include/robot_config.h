#pragma once

#include <Arduino.h>

constexpr uint8_t SERVO_COUNT = 9;
// 顺序对应 Web 中的舵机 ID:
// 1 左膝/Otto左腿, 2 右膝/Otto右腿, 3 左胯zy, 4 右胯zy,
// 5 左胯qh, 6 右胯qh, 7 脖子, 8 Otto右胯, 9 Otto左胯
constexpr uint8_t PCA9685_CHANNELS[SERVO_COUNT] = {15, 0, 12, 3, 9, 6, 14, 4, 11};
// 按实际装配方向修正逻辑角度：膝关节和 Otto 右胯需要镜像映射。
constexpr bool SERVO_INVERTED[SERVO_COUNT] = {true, false, false, true, true, false, false, true, false};
constexpr uint8_t PCA9685_I2C_ADDRESS = 0x40;
constexpr uint8_t PCA9685_SDA_PIN = 21;
constexpr uint8_t PCA9685_SCL_PIN = 22;
constexpr uint16_t PCA9685_PWM_FREQUENCY = 50;
constexpr bool IMU_MPU6050_ENABLED = true;
// 当前安装：MPU6050 放在机器人中部，X+ 指向前进方向，芯片朝下。
constexpr bool IMU_MPU6050_CHIP_DOWN = true;
constexpr uint8_t MPU6050_PRIMARY_I2C_ADDRESS = 0x68;
constexpr uint8_t MPU6050_SECONDARY_I2C_ADDRESS = 0x69;
constexpr unsigned long IMU_UPDATE_INTERVAL_MS = 20;
constexpr unsigned long IMU_RETRY_INTERVAL_MS = 3000;
constexpr uint16_t IMU_GYRO_CALIBRATION_SAMPLES = 200;
constexpr float IMU_COMPLEMENTARY_ALPHA = 0.98f;
constexpr float IMU_FALLEN_THRESHOLD_DEG = 45.0f;
constexpr bool OTTO_IMU_STRAIGHT_ASSIST_ENABLED = false;
constexpr float OTTO_IMU_STRAIGHT_ASSIST_DEADBAND_DEG = 2.0f;
constexpr float OTTO_IMU_STRAIGHT_ASSIST_GAIN = 0.012f;
constexpr float OTTO_IMU_STRAIGHT_ASSIST_MAX = 0.12f;
constexpr float OTTO_BOWLING_TACTIC_START_DEG = 8.0f;
constexpr float OTTO_BOWLING_TACTIC_DONE_DEG = 2.0f;
constexpr int SERVO_MIN_ANGLE = 10;
constexpr int SERVO_MAX_ANGLE = 170;
constexpr int SERVO_CENTER_ANGLE = 90;
constexpr int SERVO_TRIM_MIN_ANGLE = -30;
constexpr int SERVO_TRIM_MAX_ANGLE = 30;
// 与装配舵机时使用的 PCA9685 测试程序保持一致：
// SERVOMIN=110, SERVOMAX=510 @ 50Hz，物理中点约为 310 ticks。
constexpr uint16_t SERVO_MIN_PULSE_US = 537;
constexpr uint16_t SERVO_MAX_PULSE_US = 2490;
constexpr bool SERVO_CENTER_ON_BOOT = false;
constexpr unsigned long STATUS_PUSH_INTERVAL_MS = 1000;
constexpr unsigned long SAFETY_TIMEOUT_MS = 2500;
constexpr uint32_t PCA9685_I2C_CLOCK_HZ = 100000;
constexpr unsigned long PCA9685_RETRY_INTERVAL_MS = 1500;
constexpr uint8_t PCA9685_PROBE_ATTEMPTS = 5;
constexpr unsigned long PCA9685_PROBE_RETRY_DELAY_MS = 50;
constexpr unsigned long PCA9685_WRITE_RETRY_DELAY_MS = 100;
constexpr uint8_t PCA9685_MAX_CONSECUTIVE_WRITE_FAILURES = 5;

constexpr bool BOUNDARY_GUARD_ENABLED = true;
constexpr int BOUNDARY_LEFT_FRONT_PIN = -1;
constexpr int BOUNDARY_RIGHT_FRONT_PIN = -1;
constexpr int BOUNDARY_LEFT_REAR_PIN = -1;
constexpr int BOUNDARY_RIGHT_REAR_PIN = -1;
constexpr bool BOUNDARY_SENSOR_ACTIVE_LOW = true;
constexpr unsigned long BOUNDARY_GUARD_COOLDOWN_MS = 450;

constexpr bool ULTRASONIC_ENABLED = true;
constexpr int ULTRASONIC_CENTER_TRIG_PIN = 27;
constexpr int ULTRASONIC_CENTER_ECHO_PIN = 14;
constexpr unsigned long ULTRASONIC_SAMPLE_INTERVAL_MS = 60;
constexpr unsigned long ULTRASONIC_ECHO_TIMEOUT_US = 18000;
constexpr float ULTRASONIC_NEAR_CM = 12.0f;
constexpr float ULTRASONIC_DANGER_CM = 8.0f;

constexpr float TASK1_AUTOPILOT_OBSTACLE_CM = 17.0f;
constexpr unsigned long TASK1_FIRST_BYPASS_TURN_RIGHT_MS = 700;
constexpr unsigned long TASK1_FIRST_BYPASS_FORWARD_MS = 1000;
constexpr unsigned long TASK1_FIRST_BYPASS_TURN_LEFT_MS = 700;
constexpr float TASK1_FRONT_POLE_TRIGGER_CM = 17.0f;
constexpr unsigned long TASK1_FRONT_POLE_CENTER_MS = 450;
constexpr unsigned long TASK1_FRONT_POLE_TURN_60_MS = 900;
constexpr unsigned long TASK1_FRONT_POLE_FORWARD_MS = 1200;

constexpr bool VISION_UART_AUTOPILOT_ENABLED = false;
constexpr float VISION_AUTOPILOT_MIN_CONFIDENCE = 0.50f;
constexpr float VISION_AUTOPILOT_CENTER_TOLERANCE_RATIO = 0.16f;
constexpr unsigned long VISION_AUTOPILOT_LOST_TIMEOUT_MS = 900;
constexpr unsigned long VISION_AUTOPILOT_COMMAND_INTERVAL_MS = 250;
constexpr size_t VISION_UART_LINE_MAX = 240;

// 没有接电池采样时可保持 -1，固件会回落到模拟值。
constexpr int BATTERY_ADC_PIN = -1;
constexpr float ADC_REFERENCE_VOLTAGE = 3.3f;
constexpr float BATTERY_DIVIDER_RATIO = 2.0f;

constexpr bool WIFI_USE_STATIC_IP = true;
constexpr uint8_t WIFI_PRIMARY_STATIC_IP[4] = {192, 168, 10, 10};
constexpr uint8_t WIFI_PRIMARY_GATEWAY[4] = {192, 168, 10, 1};
constexpr uint8_t WIFI_PRIMARY_SUBNET[4] = {255, 255, 255, 0};
constexpr uint8_t WIFI_PRIMARY_DNS_PRIMARY[4] = {192, 168, 10, 1};
constexpr uint8_t WIFI_PRIMARY_DNS_SECONDARY[4] = {8, 8, 8, 8};
constexpr uint8_t WIFI_FALLBACK_STATIC_IP[4] = {172, 20, 10, 10};
constexpr uint8_t WIFI_FALLBACK_GATEWAY[4] = {172, 20, 10, 1};
constexpr uint8_t WIFI_FALLBACK_SUBNET[4] = {255, 255, 255, 240};
constexpr uint8_t WIFI_FALLBACK_DNS_PRIMARY[4] = {172, 20, 10, 1};
constexpr uint8_t WIFI_FALLBACK_DNS_SECONDARY[4] = {8, 8, 8, 8};
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 10000;
constexpr unsigned long WIFI_RECONNECT_INTERVAL_MS = 5000;
