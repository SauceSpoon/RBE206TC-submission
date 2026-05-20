#pragma once

#include <Arduino.h>
#include "TargetTypes.h"

struct DetectionResult {
  bool found = false;
  ColorId color = ColorId::UNKNOWN;
  ShapeId shape = ShapeId::UNKNOWN;
  float confidence = 0.0f;
  int cx = -1;
  int cy = -1;
  int boxX = -1;
  int boxY = -1;
  int boxW = 0;
  int boxH = 0;
  int frameW = 0;
  int frameH = 0;
  int area = 0;
};

bool initCamera();
bool detectTarget(const TargetSpec& target, DetectionResult& out);
