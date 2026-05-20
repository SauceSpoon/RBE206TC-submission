#include <Arduino.h>

#include "Config.h"
#include "TargetTypes.h"
#include "VisionPipeline.h"
#include "WebMonitor.h"

namespace {
void sendVisionSerial(const DetectionResult& d) {
  Serial.print("{\"type\":\"vision\"");
  Serial.print(",\"found\":");
  Serial.print(d.found ? "true" : "false");
  Serial.print(",\"color\":\"");
  Serial.print(colorName(d.color));
  Serial.print("\",\"shape\":\"");
  Serial.print(shapeName(d.shape));
  Serial.print("\",\"label\":\"");
  Serial.print(colorName(d.color));
  Serial.print("_");
  Serial.print(shapeName(d.shape));
  Serial.print("\",\"confidence\":");
  Serial.print(d.confidence, 3);
  Serial.print(",\"cx\":");
  Serial.print(d.cx);
  Serial.print(",\"cy\":");
  Serial.print(d.cy);
  Serial.print(",\"frameWidth\":");
  Serial.print(d.frameW);
  Serial.print(",\"frameHeight\":");
  Serial.print(d.frameH);
  Serial.println("}");
}

void sendVisionStatus(const char* status) {
  Serial.print("{\"type\":\"vision_status\",\"status\":\"");
  Serial.print(status);
  Serial.print("\",\"target\":\"");
  Serial.print(colorName(TARGET.color));
  Serial.print("_");
  Serial.print(shapeName(TARGET.shape));
  Serial.println("\"}");
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(400);

  sendVisionStatus("booting");

  if (!initCamera()) {
    Serial.println("{\"type\":\"vision_error\",\"message\":\"camera init failed\"}");
    while (true) {
      delay(1000);
    }
  }

  initWebMonitor();
  sendVisionStatus("ready");
}

void loop() {
  DetectionResult d;
  const bool ok = detectTarget(TARGET, d);
  if (!ok) {
    Serial.println("{\"type\":\"vision_error\",\"message\":\"camera frame error\"}");
    delay(60);
    handleWebMonitor();
    return;
  }

  sendVisionSerial(d);
  updateWebMonitor(d);
  handleWebMonitor();
  delay(LOOP_DELAY_MS);
}
