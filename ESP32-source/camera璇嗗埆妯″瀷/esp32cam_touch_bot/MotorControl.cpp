#include "MotorControl.h"
#include "Config.h"

namespace {
void setLeft(bool in1, bool in2) {
  digitalWrite(MOTOR_L_IN1, in1 ? HIGH : LOW);
  digitalWrite(MOTOR_L_IN2, in2 ? HIGH : LOW);
}

void setRight(bool in1, bool in2) {
  digitalWrite(MOTOR_R_IN1, in1 ? HIGH : LOW);
  digitalWrite(MOTOR_R_IN2, in2 ? HIGH : LOW);
}
}  // namespace

void initMotors() {
  pinMode(MOTOR_L_IN1, OUTPUT);
  pinMode(MOTOR_L_IN2, OUTPUT);
  pinMode(MOTOR_R_IN1, OUTPUT);
  pinMode(MOTOR_R_IN2, OUTPUT);
  stopMotors();
}

void stopMotors() {
  setLeft(false, false);
  setRight(false, false);
}

void turnLeftSlow() {
  setLeft(false, true);
  setRight(true, false);
}

void turnRightSlow() {
  setLeft(true, false);
  setRight(false, true);
}

void forwardSlow() {
  setLeft(true, false);
  setRight(true, false);
}

void backwardShort() {
  setLeft(false, true);
  setRight(false, true);
  delay(120);
  stopMotors();
}
