#include "ShapeClassifier.h"

#include <Arduino.h>
#include <string.h>

#include <Allen6666-project-1_inferencing.h>

namespace {
constexpr int kRoiSize = EI_CLASSIFIER_INPUT_WIDTH;
static_assert(EI_CLASSIFIER_INPUT_WIDTH == EI_CLASSIFIER_INPUT_HEIGHT,
              "Shape model expects square input.");

uint8_t g_roiRgb[kRoiSize * kRoiSize * 3];

inline int clampInt(int v, int lo, int hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

inline void rgb565ToRgb888(uint16_t pix, uint8_t& r, uint8_t& g, uint8_t& b) {
  r = static_cast<uint8_t>(((pix >> 11) & 0x1F) * 255 / 31);
  g = static_cast<uint8_t>(((pix >> 5) & 0x3F) * 255 / 63);
  b = static_cast<uint8_t>((pix & 0x1F) * 255 / 31);
}

int roiSignalGetData(size_t offset, size_t length, float* outPtr) {
  size_t pixelIx = offset * 3;
  for (size_t i = 0; i < length; ++i) {
    const uint8_t r = g_roiRgb[pixelIx + 0];
    const uint8_t g = g_roiRgb[pixelIx + 1];
    const uint8_t b = g_roiRgb[pixelIx + 2];
    outPtr[i] = static_cast<float>((r << 16) | (g << 8) | b);
    pixelIx += 3;
  }
  return 0;
}

ShapeId shapeFromLabel(const char* label) {
  if (strcmp(label, "cube") == 0) return ShapeId::CUBE;
  if (strcmp(label, "ball") == 0) return ShapeId::BALL;
  if (strcmp(label, "pyramid") == 0) return ShapeId::PYRAMID;
  return ShapeId::UNKNOWN;
}
}  // namespace

ShapeId classifyShapeHeuristic(int width, int height, float fillRatio) {
  if (width <= 0 || height <= 0) {
    return ShapeId::UNKNOWN;
  }

  const float aspect = static_cast<float>(width) / static_cast<float>(height);

  // Quick shape baseline before replacing by the 3-class model.
  if (fillRatio < 0.55f) {
    return ShapeId::PYRAMID;
  }
  if (aspect < 0.70f || aspect > 1.45f) {
    return ShapeId::PYRAMID;
  }
  if (fillRatio > 0.80f) {
    return ShapeId::CUBE;
  }
  return ShapeId::BALL;
}

ShapeId classifyShapeModel(const uint16_t* pixels,
                           int frameWidth,
                           int frameHeight,
                           int minX,
                           int minY,
                           int maxX,
                           int maxY,
                           float* confidence) {
  if (confidence) *confidence = 0.0f;
  if (!pixels || frameWidth <= 0 || frameHeight <= 0) {
    return ShapeId::UNKNOWN;
  }

  minX = clampInt(minX, 0, frameWidth - 1);
  maxX = clampInt(maxX, 0, frameWidth - 1);
  minY = clampInt(minY, 0, frameHeight - 1);
  maxY = clampInt(maxY, 0, frameHeight - 1);
  if (minX > maxX || minY > maxY) {
    return ShapeId::UNKNOWN;
  }

  const int boxW = max(1, maxX - minX + 1);
  const int boxH = max(1, maxY - minY + 1);
  const int side = max(boxW, boxH);
  const int cx = (minX + maxX) / 2;
  const int cy = (minY + maxY) / 2;
  const int squareMinX = clampInt(cx - side / 2, 0, frameWidth - 1);
  const int squareMinY = clampInt(cy - side / 2, 0, frameHeight - 1);

  for (int y = 0; y < kRoiSize; ++y) {
    const int srcY = clampInt(squareMinY + (y * side) / kRoiSize, 0, frameHeight - 1);
    for (int x = 0; x < kRoiSize; ++x) {
      const int srcX = clampInt(squareMinX + (x * side) / kRoiSize, 0, frameWidth - 1);
      uint8_t r = 0, g = 0, b = 0;
      rgb565ToRgb888(pixels[srcY * frameWidth + srcX], r, g, b);
      const int dst = (y * kRoiSize + x) * 3;
      g_roiRgb[dst + 0] = r;
      g_roiRgb[dst + 1] = g;
      g_roiRgb[dst + 2] = b;
    }
  }

  ei::signal_t signal;
  signal.total_length = EI_CLASSIFIER_INPUT_WIDTH * EI_CLASSIFIER_INPUT_HEIGHT;
  signal.get_data = roiSignalGetData;

  ei_impulse_result_t result = {};
  const EI_IMPULSE_ERROR err = run_classifier(&signal, &result, false);
  if (err != EI_IMPULSE_OK) {
    return ShapeId::UNKNOWN;
  }

  float bestScore = -1.0f;
  ShapeId bestShape = ShapeId::UNKNOWN;
  for (uint16_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; ++i) {
    const float score = result.classification[i].value;
    if (score > bestScore) {
      bestScore = score;
      bestShape = shapeFromLabel(ei_classifier_inferencing_categories[i]);
    }
  }

  if (confidence) *confidence = bestScore;
  return bestShape;
}
