#pragma once

enum class ColorId : int {
  BLACK = 0,
  BLUE = 1,
  GREEN = 2,
  RED = 3,
  UNKNOWN = -1
};

enum class ShapeId : int {
  CUBE = 0,
  BALL = 1,
  PYRAMID = 2,
  UNKNOWN = -1
};

struct TargetSpec {
  ColorId color;
  ShapeId shape;
};

inline const char* colorName(ColorId id) {
  switch (id) {
    case ColorId::BLACK: return "BLACK";
    case ColorId::BLUE: return "BLUE";
    case ColorId::GREEN: return "GREEN";
    case ColorId::RED: return "RED";
    default: return "UNKNOWN";
  }
}

inline const char* shapeName(ShapeId id) {
  switch (id) {
    case ShapeId::CUBE: return "CUBE";
    case ShapeId::BALL: return "BALL";
    case ShapeId::PYRAMID: return "PYRAMID";
    default: return "UNKNOWN";
  }
}
