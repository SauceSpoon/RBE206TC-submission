#include <Arduino.h>
#include <Update.h>
#include <WebServer.h>
#include <WiFi.h>
#include <esp_camera.h>
#include <img_converters.h>

#include "camera_pins.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#define WIFI_PRIMARY_SSID "YOUR_PRIMARY_WIFI_SSID"
#define WIFI_PRIMARY_PASSWORD "YOUR_PRIMARY_WIFI_PASSWORD"
#define WIFI_FALLBACK_SSID "YOUR_FALLBACK_WIFI_SSID"
#define WIFI_FALLBACK_PASSWORD "YOUR_FALLBACK_WIFI_PASSWORD"
#define CAMERA_HOSTNAME "esp32-cam"
#define CAMERA_USE_STATIC_IP false
#define CAMERA_PRIMARY_STATIC_IP_1 192
#define CAMERA_PRIMARY_STATIC_IP_2 168
#define CAMERA_PRIMARY_STATIC_IP_3 10
#define CAMERA_PRIMARY_STATIC_IP_4 11
#define CAMERA_PRIMARY_GATEWAY_1 192
#define CAMERA_PRIMARY_GATEWAY_2 168
#define CAMERA_PRIMARY_GATEWAY_3 10
#define CAMERA_PRIMARY_GATEWAY_4 1
#define CAMERA_PRIMARY_SUBNET_1 255
#define CAMERA_PRIMARY_SUBNET_2 255
#define CAMERA_PRIMARY_SUBNET_3 255
#define CAMERA_PRIMARY_SUBNET_4 0
#define CAMERA_PRIMARY_DNS_PRIMARY_1 192
#define CAMERA_PRIMARY_DNS_PRIMARY_2 168
#define CAMERA_PRIMARY_DNS_PRIMARY_3 10
#define CAMERA_PRIMARY_DNS_PRIMARY_4 1
#define CAMERA_PRIMARY_DNS_SECONDARY_1 8
#define CAMERA_PRIMARY_DNS_SECONDARY_2 8
#define CAMERA_PRIMARY_DNS_SECONDARY_3 8
#define CAMERA_PRIMARY_DNS_SECONDARY_4 8
#define CAMERA_FALLBACK_STATIC_IP_1 172
#define CAMERA_FALLBACK_STATIC_IP_2 20
#define CAMERA_FALLBACK_STATIC_IP_3 10
#define CAMERA_FALLBACK_STATIC_IP_4 11
#define CAMERA_FALLBACK_GATEWAY_1 172
#define CAMERA_FALLBACK_GATEWAY_2 20
#define CAMERA_FALLBACK_GATEWAY_3 10
#define CAMERA_FALLBACK_GATEWAY_4 1
#define CAMERA_FALLBACK_SUBNET_1 255
#define CAMERA_FALLBACK_SUBNET_2 255
#define CAMERA_FALLBACK_SUBNET_3 255
#define CAMERA_FALLBACK_SUBNET_4 240
#define CAMERA_FALLBACK_DNS_PRIMARY_1 172
#define CAMERA_FALLBACK_DNS_PRIMARY_2 20
#define CAMERA_FALLBACK_DNS_PRIMARY_3 10
#define CAMERA_FALLBACK_DNS_PRIMARY_4 1
#define CAMERA_FALLBACK_DNS_SECONDARY_1 8
#define CAMERA_FALLBACK_DNS_SECONDARY_2 8
#define CAMERA_FALLBACK_DNS_SECONDARY_3 8
#define CAMERA_FALLBACK_DNS_SECONDARY_4 8
#endif

namespace {

constexpr uint32_t kBaudRate = 115200;
constexpr uint32_t kWifiTimeoutMs = 10000;
constexpr uint16_t kServerPort = 80;
constexpr uint8_t kJpegQuality = 80;
constexpr const char* kOtaPath = "/update";

WebServer server(kServerPort);
struct WifiProfile {
  const char* name;
  const char* ssid;
  const char* password;
  IPAddress staticIp;
  IPAddress gateway;
  IPAddress subnet;
  IPAddress dnsPrimary;
  IPAddress dnsSecondary;
};

const WifiProfile wifiProfiles[] = {
  {
    "cudy-router",
    WIFI_PRIMARY_SSID,
    WIFI_PRIMARY_PASSWORD,
    IPAddress(CAMERA_PRIMARY_STATIC_IP_1, CAMERA_PRIMARY_STATIC_IP_2, CAMERA_PRIMARY_STATIC_IP_3, CAMERA_PRIMARY_STATIC_IP_4),
    IPAddress(CAMERA_PRIMARY_GATEWAY_1, CAMERA_PRIMARY_GATEWAY_2, CAMERA_PRIMARY_GATEWAY_3, CAMERA_PRIMARY_GATEWAY_4),
    IPAddress(CAMERA_PRIMARY_SUBNET_1, CAMERA_PRIMARY_SUBNET_2, CAMERA_PRIMARY_SUBNET_3, CAMERA_PRIMARY_SUBNET_4),
    IPAddress(CAMERA_PRIMARY_DNS_PRIMARY_1, CAMERA_PRIMARY_DNS_PRIMARY_2, CAMERA_PRIMARY_DNS_PRIMARY_3, CAMERA_PRIMARY_DNS_PRIMARY_4),
    IPAddress(CAMERA_PRIMARY_DNS_SECONDARY_1, CAMERA_PRIMARY_DNS_SECONDARY_2, CAMERA_PRIMARY_DNS_SECONDARY_3, CAMERA_PRIMARY_DNS_SECONDARY_4)
  },
  {
    "phone-hotspot",
    WIFI_FALLBACK_SSID,
    WIFI_FALLBACK_PASSWORD,
    IPAddress(CAMERA_FALLBACK_STATIC_IP_1, CAMERA_FALLBACK_STATIC_IP_2, CAMERA_FALLBACK_STATIC_IP_3, CAMERA_FALLBACK_STATIC_IP_4),
    IPAddress(CAMERA_FALLBACK_GATEWAY_1, CAMERA_FALLBACK_GATEWAY_2, CAMERA_FALLBACK_GATEWAY_3, CAMERA_FALLBACK_GATEWAY_4),
    IPAddress(CAMERA_FALLBACK_SUBNET_1, CAMERA_FALLBACK_SUBNET_2, CAMERA_FALLBACK_SUBNET_3, CAMERA_FALLBACK_SUBNET_4),
    IPAddress(CAMERA_FALLBACK_DNS_PRIMARY_1, CAMERA_FALLBACK_DNS_PRIMARY_2, CAMERA_FALLBACK_DNS_PRIMARY_3, CAMERA_FALLBACK_DNS_PRIMARY_4),
    IPAddress(CAMERA_FALLBACK_DNS_SECONDARY_1, CAMERA_FALLBACK_DNS_SECONDARY_2, CAMERA_FALLBACK_DNS_SECONDARY_3, CAMERA_FALLBACK_DNS_SECONDARY_4)
  }
};
String activeWifiProfileName = "none";

String jsonPair(const char* key, const String& value, bool quoted = true) {
  String pair = "\"";
  pair += key;
  pair += "\":";
  if (quoted) {
    pair += "\"";
    pair += value;
    pair += "\"";
  } else {
    pair += value;
  }
  return pair;
}

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
  config.frame_size = FRAMESIZE_240X240;
  config.jpeg_quality = 20;
  config.fb_count = psramFound() ? 2 : 1;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  config.fb_location = CAMERA_FB_IN_PSRAM;

  const esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }

  sensor_t* sensor = esp_camera_sensor_get();
  if (sensor != nullptr) {
    sensor->set_vflip(sensor, 1);
    sensor->set_brightness(sensor, 1);
    sensor->set_saturation(sensor, -1);
  }

  return true;
}

bool connectWifiProfile(const WifiProfile& profile) {
  WiFi.disconnect(false, true);
  delay(100);

  if (CAMERA_USE_STATIC_IP && !WiFi.config(
        profile.staticIp,
        profile.gateway,
        profile.subnet,
        profile.dnsPrimary,
        profile.dnsSecondary
      )) {
    Serial.printf("Static IP configuration failed for %s\n", profile.name);
  }

  WiFi.begin(profile.ssid, profile.password);
  Serial.printf("Connecting to WiFi (%s): %s\n", profile.name, profile.ssid);

  const uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < kWifiTimeoutMs) {
    delay(300);
    Serial.print('.');
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("\nWiFi connect failed for %s\n", profile.name);
    return false;
  }

  activeWifiProfileName = profile.name;
  Serial.println();
  Serial.print("Camera IP: ");
  Serial.println(WiFi.localIP());
  return true;
}

bool connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setHostname(CAMERA_HOSTNAME);
  activeWifiProfileName = "none";

  for (const WifiProfile& profile : wifiProfiles) {
    if (connectWifiProfile(profile)) {
      return true;
    }
  }

  Serial.println("WiFi connect failed for all configured profiles");
  return false;
}

void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
}

void handleOptions() {
  sendCorsHeaders();
  server.send(204);
}

void handleRoot() {
  static const char html[] PROGMEM = R"HTML(
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>ESP32-CAM Streamer</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; background: #101114; color: #f5f5f5; }
      a { color: #8ce8ff; }
      img { max-width: 100%; border-radius: 16px; border: 1px solid rgba(255,255,255,0.12); }
      .card { max-width: 960px; padding: 20px; border-radius: 20px; background: rgba(255,255,255,0.06); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>ESP32-CAM 独立串流模块</h1>
      <p>可直接接入主站点的相机面板。</p>
      <p><a href="/stream">/stream</a> | <a href="/capture">/capture</a> | <a href="/status">/status</a> | <a href="/health">/health</a> | <a href="/update">/update</a></p>
      <img src="/capture" alt="capture" />
    </div>
  </body>
</html>
)HTML";

  sendCorsHeaders();
  server.send(200, "text/html; charset=utf-8", html);
}

void handleHealth() {
  sendCorsHeaders();
  server.send(
    200,
    "application/json",
    "{\"ok\":true,\"service\":\"esp32-cam-streamer\"}"
  );
}

void handleStatus() {
  sensor_t* sensor = esp_camera_sensor_get();
  if (sensor == nullptr) {
    sendCorsHeaders();
    server.send(500, "application/json", "{\"ok\":false,\"message\":\"camera sensor missing\"}");
    return;
  }

  const camera_status_t status = sensor->status;
  String payload = "{";
  payload += jsonPair("ok", "true", false);
  payload += ",";
  payload += jsonPair("ip", WiFi.localIP().toString());
  payload += ",";
  payload += jsonPair("ssid", WiFi.SSID());
  payload += ",";
  payload += jsonPair("profile", activeWifiProfileName);
  payload += ",";
  payload += jsonPair("rssi", String(WiFi.RSSI()), false);
  payload += ",";
  payload += jsonPair("framesize", String(status.framesize), false);
  payload += ",";
  payload += jsonPair("quality", String(status.quality), false);
  payload += ",";
  payload += jsonPair("brightness", String(status.brightness), false);
  payload += ",";
  payload += jsonPair("contrast", String(status.contrast), false);
  payload += ",";
  payload += jsonPair("saturation", String(status.saturation), false);
  payload += ",";
  payload += jsonPair("special_effect", String(status.special_effect), false);
  payload += ",";
  payload += jsonPair("wb_mode", String(status.wb_mode), false);
  payload += ",";
  payload += jsonPair("otaPath", kOtaPath);
  payload += "}";

  sendCorsHeaders();
  server.send(200, "application/json", payload);
}

void handleCapture() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (fb == nullptr) {
    sendCorsHeaders();
    server.send(503, "application/json", "{\"ok\":false,\"message\":\"capture failed\"}");
    return;
  }

  uint8_t* jpegBuffer = fb->buf;
  size_t jpegLength = fb->len;
  bool converted = false;

  if (fb->format != PIXFORMAT_JPEG) {
    converted = frame2jpg(fb, kJpegQuality, &jpegBuffer, &jpegLength);
    esp_camera_fb_return(fb);
    fb = nullptr;

    if (!converted) {
      sendCorsHeaders();
      server.send(500, "application/json", "{\"ok\":false,\"message\":\"jpeg convert failed\"}");
      return;
    }
  }

  sendCorsHeaders();
  server.setContentLength(jpegLength);
  server.send(200, "image/jpeg", "");
  WiFiClient client = server.client();
  client.write(jpegBuffer, jpegLength);

  if (fb != nullptr) {
    esp_camera_fb_return(fb);
  }
  if (converted) {
    free(jpegBuffer);
  }
}

void handleStream() {
  WiFiClient client = server.client();
  client.print("HTTP/1.1 200 OK\r\n");
  client.print("Content-Type: multipart/x-mixed-replace; boundary=frame\r\n");
  client.print("Access-Control-Allow-Origin: *\r\n");
  client.print("Cache-Control: no-cache\r\n");
  client.print("Pragma: no-cache\r\n\r\n");

  while (client.connected()) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (fb == nullptr) {
      break;
    }

    uint8_t* jpegBuffer = fb->buf;
    size_t jpegLength = fb->len;
    bool converted = false;

    if (fb->format != PIXFORMAT_JPEG) {
      converted = frame2jpg(fb, kJpegQuality, &jpegBuffer, &jpegLength);
      esp_camera_fb_return(fb);
      fb = nullptr;
      if (!converted) {
        break;
      }
    }

    client.printf("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", static_cast<unsigned>(jpegLength));
    client.write(jpegBuffer, jpegLength);
    client.print("\r\n");

    if (fb != nullptr) {
      esp_camera_fb_return(fb);
    }
    if (converted) {
      free(jpegBuffer);
    }

    delay(30);
  }
}

void handleUpdateUpload() {
  HTTPUpload& upload = server.upload();

  if (upload.status == UPLOAD_FILE_START) {
    Update.onProgress([](size_t current, size_t total) {
      if (total == 0) {
        return;
      }

      Serial.printf("OTA progress: %u%%\n", static_cast<unsigned>((current * 100U) / total));
    });

    if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
      Update.printError(Serial);
    }

    Serial.printf("OTA start: %s\n", upload.filename.c_str());
    return;
  }

  if (upload.status == UPLOAD_FILE_WRITE) {
    if (!Update.hasError() && Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
      Update.printError(Serial);
    }
    return;
  }

  if (upload.status == UPLOAD_FILE_END) {
    if (Update.end(true)) {
      Serial.printf("OTA success: %u bytes\n", upload.totalSize);
    } else {
      Update.printError(Serial);
    }
    return;
  }

  if (upload.status == UPLOAD_FILE_ABORTED) {
    Update.abort();
    Serial.println("OTA aborted");
  }
}

void handleUpdatePost() {
  sendCorsHeaders();

  const bool success = !Update.hasError();
  server.send(
    success ? 200 : 500,
    "application/json",
    success ? "{\"ok\":true,\"message\":\"restarting\"}" : "{\"ok\":false,\"message\":\"update failed\"}"
  );

  if (success) {
    delay(500);
    ESP.restart();
  }
}

void configureRoutes() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/health", HTTP_GET, handleHealth);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/capture", HTTP_GET, handleCapture);
  server.on("/stream", HTTP_GET, handleStream);
  server.on(kOtaPath, HTTP_POST, handleUpdatePost, handleUpdateUpload);
  server.onNotFound([]() {
    sendCorsHeaders();
    server.send(404, "application/json", "{\"ok\":false,\"message\":\"not found\"}");
  });
  server.on("/status", HTTP_OPTIONS, handleOptions);
  server.on("/capture", HTTP_OPTIONS, handleOptions);
  server.on("/stream", HTTP_OPTIONS, handleOptions);
  server.on(kOtaPath, HTTP_OPTIONS, handleOptions);
}

}  // namespace

void setup() {
  Serial.begin(kBaudRate);
  delay(500);

  if (!initCamera()) {
    return;
  }

  while (!connectWifi()) {
    delay(1000);
  }

  configureRoutes();
  server.begin();
  Serial.printf("Camera server started on http://%s/\n", WiFi.localIP().toString().c_str());
}

void loop() {
  server.handleClient();
}
