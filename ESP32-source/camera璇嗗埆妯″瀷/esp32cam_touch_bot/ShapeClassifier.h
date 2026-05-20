#pragma once

#include <stdint.h>

#include "TargetTypes.h"

ShapeId classifyShapeHeuristic(int width, int height, float fillRatio);

ShapeId classifyShapeModel(const uint16_t* pixels,
                           int frameWidth,
                           int frameHeight,
                           int minX,
                           int minY,
                           int maxX,
                           int maxY,
                           float* confidence);
