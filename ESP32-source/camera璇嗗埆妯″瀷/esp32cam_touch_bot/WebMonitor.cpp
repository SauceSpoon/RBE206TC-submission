#include "WebMonitor.h"

#include <Update.h>
#include <WebServer.h>
#include <WiFi.h>

#include "Config.h"
#include "TargetTypes.h"
#include "esp_camera.h"
#include "img_converters.h"

namespace {
WebServer server(80);
DetectionResult lastDetection;
bool wifiReady = false;
bool webServerStarted = false;
uint32_t lastWifiRetryMs = 0;
bool otaUpdateOk = false;
String otaError;

const char indexHtml[] PROGMEM = R"HTML(
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ESP32-CAM Vision Sensor</title>
  <style>
    body{margin:0;background:#111;color:#eee;font-family:system-ui,sans-serif}
    main{max-width:760px;margin:0 auto;padding:14px}
    code,pre{background:#1d1d1d;padding:10px;border-radius:8px;display:block;white-space:pre-wrap}
    a{color:#8fd3ff}
  </style>
</head>
<body>
<main>
  <h2>ESP32-CAM Vision Sensor</h2>
  <p>Recognition runs locally. Serial JSON is the primary output.</p>
  <p>Status: <a href="/status">/status</a></p>
  <p>Manual snapshot: <a href="/capture">/capture</a></p>
  <p>OTA update: <a href="/update">/update</a></p>
  <pre id="status">loading...</pre>
</main>
<script>
async function tick(){
  try {
    const r=await fetch('/status?t='+Date.now());
    document.getElementById('status').textContent=JSON.stringify(await r.json(),null,2);
  } catch(e) {}
}
setInterval(tick, 1000);
tick();
</script>
</body>
</html>
)HTML";

const char updateHtml[] PROGMEM = R"HTML(
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ESP32-CAM OTA</title>
  <style>body{font-family:system-ui,sans-serif;background:#111;color:#eee;padding:24px}input,button{font-size:16px;margin:8px 0}</style>
</head>
<body>
  <h2>ESP32-CAM OTA Update</h2>
  <form method="POST" action="/update" enctype="multipart/form-data">
    <input type="file" name="firmware" accept=".bin" required>
    <br>
    <button type="submit">Upload firmware</button>
  </form>
  <p>Upload only a compiled ESP32-CAM firmware .bin.</p>
</body>
</html>
)HTML";

void sendNoCache() {
  server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  server.sendHeader("Pragma", "no-cache");
  server.sendHeader("Access-Control-Allow-Origin", "*");
}

void handleRoot() {
  sendNoCache();
  server.send_P(200, "text/html", indexHtml);
}

void handleStatus() {
  sendNoCache();
  String json = "{";
  json += "\"device\":\"esp32cam_vision_sensor\"";
  json += ",\"ip\":\"" + WiFi.localIP().toString() + "\"";
  json += ",\"target\":\"" + String(colorName(TARGET.color)) + "_" + String(shapeName(TARGET.shape)) + "\"";
  json += ",\"found\":" + String(lastDetection.found ? "true" : "false");
  json += ",\"color\":\"" + String(colorName(lastDetection.color)) + "\"";
  json += ",\"shape\":\"" + String(shapeName(lastDetection.shape)) + "\"";
  json += ",\"confidence\":" + String(lastDetection.confidence, 3);
  json += ",\"cx\":" + String(lastDetection.cx);
  json += ",\"cy\":" + String(lastDetection.cy);
  json += ",\"area\":" + String(lastDetection.area);
  json += ",\"frameWidth\":" + String(lastDetection.frameW);
  json += ",\"frameHeight\":" + String(lastDetection.frameH);
  json += ",\"label\":\"" + String(colorName(lastDetection.color)) + "_" + String(shapeName(lastDetection.shape)) + "\"";
  json += ",\"box\":{\"x\":" + String(lastDetection.boxX);
  json += ",\"y\":" + String(lastDetection.boxY);
  json += ",\"w\":" + String(lastDetection.boxW);
  json += ",\"h\":" + String(lastDetection.boxH) + "}";
  json += ",\"otaPath\":\"/update\"";
  json += "}";
  server.send(200, "application/json", json);
}

void handleCapture() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    server.send(503, "text/plain", "camera capture failed");
    return;
  }

  uint8_t* jpgBuf = nullptr;
  size_t jpgLen = 0;
  bool converted = false;

  if (fb->format == PIXFORMAT_JPEG) {
    sendNoCache();
    server.send_P(200, "image/jpeg", reinterpret_cast<const char*>(fb->buf), fb->len);
    esp_camera_fb_return(fb);
    return;
  }

  converted = fmt2jpg(fb->buf, fb->len, fb->width, fb->height, fb->format, 80, &jpgBuf, &jpgLen);
  esp_camera_fb_return(fb);

  if (!converted || !jpgBuf) {
    server.send(500, "text/plain", "jpeg conversion failed");
    return;
  }

  sendNoCache();
  server.send_P(200, "image/jpeg", reinterpret_cast<const char*>(jpgBuf), jpgLen);
  free(jpgBuf);
}

void handleUpdatePage() {
  sendNoCache();
  server.send_P(200, "text/html", updateHtml);
}

void handleUpdateFinished() {
  sendNoCache();
  if (otaUpdateOk) {
    server.send(200, "text/plain", "OTA update OK. Rebooting...");
    delay(500);
    ESP.restart();
    return;
  }

  server.send(500, "text/plain", otaError.length() ? otaError : "OTA update failed");
}

void handleUpdateUpload() {
  HTTPUpload& upload = server.upload();

  if (upload.status == UPLOAD_FILE_START) {
    otaUpdateOk = false;
    otaError = "";
    Serial.printf("OTA start: %s\n", upload.filename.c_str());
    if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
      otaError = "Update.begin failed";
      Update.printError(Serial);
    }
    return;
  }

  if (upload.status == UPLOAD_FILE_WRITE) {
    if (otaError.length()) {
      return;
    }
    if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
      otaError = "Update.write failed";
      Update.printError(Serial);
    }
    return;
  }

  if (upload.status == UPLOAD_FILE_END) {
    if (!otaError.length() && Update.end(true)) {
      otaUpdateOk = true;
      Serial.printf("OTA success: %u bytes\n", upload.totalSize);
    } else {
      if (!otaError.length()) {
        otaError = "Update.end failed";
      }
      Update.printError(Serial);
    }
    return;
  }

  if (upload.status == UPLOAD_FILE_ABORTED) {
    otaError = "OTA upload aborted";
    Update.abort();
  }
}

void startWebServer() {
  if (!webServerStarted) {
    server.on("/", HTTP_GET, handleRoot);
    server.on("/status", HTTP_GET, handleStatus);
    server.on("/capture", HTTP_GET, handleCapture);
    server.on("/update", HTTP_GET, handleUpdatePage);
    server.on("/update", HTTP_POST, handleUpdateFinished, handleUpdateUpload);
    server.begin();
    webServerStarted = true;
  }

  wifiReady = true;
  Serial.print("WiFi connected. Open http://");
  Serial.println(WiFi.localIP());
  Serial.println("Vision status/OTA server ready.");
}
}  // namespace

void initWebMonitor() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);

  IPAddress localIp(WIFI_STATIC_IP_A, WIFI_STATIC_IP_B, WIFI_STATIC_IP_C, WIFI_STATIC_IP_D);
  IPAddress gateway(WIFI_STATIC_IP_A, WIFI_STATIC_IP_B, WIFI_STATIC_IP_C, WIFI_GATEWAY_D);
  IPAddress subnet(WIFI_SUBNET_A, WIFI_SUBNET_B, WIFI_SUBNET_C, WIFI_SUBNET_D);
  IPAddress dns(WIFI_STATIC_IP_A, WIFI_STATIC_IP_B, WIFI_STATIC_IP_C, WIFI_GATEWAY_D);
  if (!WiFi.config(localIp, gateway, subnet, dns)) {
    Serial.println("WiFi static IP config failed; fallback to DHCP.");
  }

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("WiFi connecting to ");
  Serial.println(WIFI_SSID);
  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 12000) {
    Serial.print(".");
    delay(300);
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Serial vision output continues; WiFi will retry in background.");
    lastWifiRetryMs = millis();
    return;
  }

  startWebServer();
}

void updateWebMonitor(const DetectionResult& detection) {
  lastDetection = detection;
}

void handleWebMonitor() {
  if (WiFi.status() != WL_CONNECTED) {
    wifiReady = false;
    const uint32_t now = millis();
    if (now - lastWifiRetryMs >= 5000) {
      lastWifiRetryMs = now;
      Serial.println("WiFi retrying in background...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    return;
  }

  if (!wifiReady) {
    startWebServer();
  }

  server.handleClient();
}
