#include "VisionPipeline.h"

#include "Config.h"
#include "ShapeClassifier.h"
#include "esp_camera.h"

namespace {
struct ColorStats {
  int count = 0;
  int sumX = 0;
  int sumY = 0;
  int minX = 10000;
  int minY = 10000;
  int maxX = -1;
  int maxY = -1;
};

inline int clampInt(int v, int lo, int hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

void rgb565ToRgb888(uint16_t pix, int& r, int& g, int& b) {
  r = ((pix >> 11) & 0x1F) * 255 / 31;
  g = ((pix >> 5) & 0x3F) * 255 / 63;
  b = (pix & 0x1F) * 255 / 31;
}

void rgbToHsv(int r, int g, int b, int& h, int& s, int& v) {
  const int rgbMin = min(r, min(g, b));
  const int rgbMax = max(r, max(g, b));
  const int diff = rgbMax - rgbMin;

  v = rgbMax;
  s = (rgbMax == 0) ? 0 : (255 * diff / rgbMax);

  if (diff == 0) {
    h = 0;
    return;
  }

  if (rgbMax == r) {
    h = 60 * (g - b) / diff;
  } else if (rgbMax == g) {
    h = 120 + 60 * (b - r) / diff;
  } else {
    h = 240 + 60 * (r - g) / diff;
  }
  if (h < 0) h += 360;
}

ColorId classifyColorHSV(int h, int s, int v) {
  if (v <= 70 && s <= 130) {
    return ColorId::BLACK;
  }

  if (v < 45 || s < 45) {
    return ColorId::UNKNOWN;
  }

  if ((h >= 0 && h <= 18) || (h >= 340 && h <= 359)) {
    return ColorId::RED;
  }
  if (h >= 70 && h <= 165) {
    return ColorId::GREEN;
  }
  if (h >= 185 && h <= 260) {
    return ColorId::BLUE;
  }
  return ColorId::UNKNOWN;
}

void updateStats(ColorStats& st, int x, int y) {
  st.count++;
  st.sumX += x;
  st.sumY += y;
  st.minX = min(st.minX, x);
  st.minY = min(st.minY, y);
  st.maxX = max(st.maxX, x);
  st.maxY = max(st.maxY, y);
}
}  // namespace

bool initCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_RGB565;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 14;
    config.fb_count = 1;
  }

  if (esp_camera_init(&config) != ESP_OK) {
    return false;
  }

  sensor_t* s = esp_camera_sensor_get();
  if (s) {
    s->set_whitebal(s, 1);
    s->set_awb_gain(s, 1);
    s->set_exposure_ctrl(s, 1);
    s->set_aec2(s, 1);
    s->set_ae_level(s, -2);
    s->set_gain_ctrl(s, 1);
    s->set_brightness(s, -2);
    s->set_contrast(s, 1);
    s->set_saturation(s, 0);
  }
  return true;
}

bool detectTarget(const TargetSpec& target, DetectionResult& out) {
  out = DetectionResult{};

  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb || fb->format != PIXFORMAT_RGB565) {
    if (fb) esp_camera_fb_return(fb);
    return false;
  }

  const int w = fb->width;
  const int h = fb->height;
  auto* pix = reinterpret_cast<const uint16_t*>(fb->buf);

  ColorStats stats[4];

  for (int y = 0; y < h; y += FRAME_SAMPLE_STEP) {
    for (int x = 0; x < w; x += FRAME_SAMPLE_STEP) {
      const uint16_t p = pix[y * w + x];
      int r = 0, g = 0, b = 0;
      rgb565ToRgb888(p, r, g, b);

      int hue = 0, sat = 0, val = 0;
      rgbToHsv(r, g, b, hue, sat, val);
      const ColorId c = classifyColorHSV(hue, sat, val);
      if (c == ColorId::UNKNOWN) continue;

      const int idx = static_cast<int>(c);
      if (idx >= 0 && idx < 4) {
        updateStats(stats[idx], x, y);
      }
    }
  }

  const int targetColorIdx = static_cast<int>(target.color);
  if (targetColorIdx < 0 || targetColorIdx > 3) {
    esp_camera_fb_return(fb);
    return true;
  }

  ColorStats st = stats[targetColorIdx];
  if (st.count < MIN_COLOR_PIXELS) {
    esp_camera_fb_return(fb);
    return true;
  }

  const int boxW = max(1, st.maxX - st.minX + 1);
  const int boxH = max(1, st.maxY - st.minY + 1);
  const int boxArea = boxW * boxH;
  const float fillRatio = static_cast<float>(st.count) / static_cast<float>(boxArea);

  out.found = true;
  out.color = target.color;
  out.boxX = st.minX;
  out.boxY = st.minY;
  out.boxW = boxW;
  out.boxH = boxH;
  out.frameW = w;
  out.frameH = h;
  float shapeConfidence = 0.0f;
  out.shape = classifyShapeModel(pix, w, h, st.minX, st.minY, st.maxX, st.maxY, &shapeConfidence);
  if (out.shape == ShapeId::UNKNOWN) {
    out.shape = classifyShapeHeuristic(boxW, boxH, fillRatio);
  }
  out.cx = clampInt(st.sumX / max(1, st.count), 0, w - 1);
  out.cy = clampInt(st.sumY / max(1, st.count), 0, h - 1);
  out.area = st.count;

  float areaScore = static_cast<float>(st.count) / static_cast<float>((w * h) / (FRAME_SAMPLE_STEP * FRAME_SAMPLE_STEP));
  areaScore = constrain(areaScore * 2.0f, 0.0f, 1.0f);
  const float shapeScore = (shapeConfidence > 0.0f) ? shapeConfidence : ((out.shape == target.shape) ? 0.9f : 0.35f);
  out.confidence = 0.55f * areaScore + 0.45f * shapeScore;

  esp_camera_fb_return(fb);
  return true;
}
