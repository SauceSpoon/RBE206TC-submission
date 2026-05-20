#pragma once

#include <Arduino.h>
#include "TargetTypes.h"

// Wi-Fi monitor. The robot keeps running even if this network is unavailable.
constexpr const char* WIFI_SSID = "yyniPhone";
constexpr const char* WIFI_PASSWORD = "yyn20050810";
constexpr int WIFI_STATIC_IP_A = 172;
constexpr int WIFI_STATIC_IP_B = 20;
constexpr int WIFI_STATIC_IP_C = 10;
constexpr int WIFI_STATIC_IP_D = 11;
constexpr int WIFI_GATEWAY_D = 1;
constexpr int WIFI_SUBNET_A = 255;
constexpr int WIFI_SUBNET_B = 255;
constexpr int WIFI_SUBNET_C = 255;
constexpr int WIFI_SUBNET_D = 0;

// AI Thinker ESP32-CAM pin map
constexpr int PWDN_GPIO_NUM = 32;
constexpr int RESET_GPIO_NUM = -1;
constexpr int XCLK_GPIO_NUM = 0;
constexpr int SIOD_GPIO_NUM = 26;
constexpr int SIOC_GPIO_NUM = 27;

constexpr int Y9_GPIO_NUM = 35;
constexpr int Y8_GPIO_NUM = 34;
constexpr int Y7_GPIO_NUM = 39;
constexpr int Y6_GPIO_NUM = 36;
constexpr int Y5_GPIO_NUM = 21;
constexpr int Y4_GPIO_NUM = 19;
constexpr int Y3_GPIO_NUM = 18;
constexpr int Y2_GPIO_NUM = 5;
constexpr int VSYNC_GPIO_NUM = 25;
constexpr int HREF_GPIO_NUM = 23;
constexpr int PCLK_GPIO_NUM = 22;

// Motor pins (replace with your driver wiring)
constexpr int MOTOR_L_IN1 = 12;
constexpr int MOTOR_L_IN2 = 13;
constexpr int MOTOR_R_IN1 = 14;
constexpr int MOTOR_R_IN2 = 15;

// Optional touch switch pin. LOW means touched by default.
constexpr int TOUCH_SWITCH_PIN = 2;

// Camera / vision tuning
constexpr int FRAME_SAMPLE_STEP = 4;      // bigger -> faster, less accurate
constexpr int MIN_COLOR_PIXELS = 120;
constexpr float DETECT_CONFIDENCE_MIN = 0.60f;
constexpr float EXECUTE_CONFIDENCE_MIN = 0.75f;
constexpr int CONFIRM_FRAMES = 3;

// Servoing thresholds
constexpr int CENTER_TOLERANCE_PX = 16;
constexpr uint32_t SEARCH_TURN_MS = 180;
constexpr uint32_t LOST_TIMEOUT_MS = 900;
constexpr uint32_t LOOP_DELAY_MS = 35;

// Example draw result, change this based on the assigned target.
constexpr TargetSpec TARGET = {ColorId::RED, ShapeId::PYRAMID};
