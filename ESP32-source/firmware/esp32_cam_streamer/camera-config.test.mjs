import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const firmware = readFileSync(new URL('./src/main.cpp', import.meta.url), 'utf8');
const secrets = readFileSync(new URL('./include/secrets.h', import.meta.url), 'utf8');

test('camera WiFi failover tries Cudy router for 10 seconds before phone hotspot', () => {
  assert.match(secrets, /#define WIFI_PRIMARY_SSID "Cudy-8434"/);
  assert.match(secrets, /#define WIFI_PRIMARY_PASSWORD "13390877"/);
  assert.match(secrets, /#define WIFI_FALLBACK_SSID "yyniPhone"/);
  assert.match(secrets, /#define WIFI_FALLBACK_PASSWORD "yyn20050810"/);
  assert.match(secrets, /#define CAMERA_PRIMARY_STATIC_IP_1 192/);
  assert.match(secrets, /#define CAMERA_PRIMARY_STATIC_IP_2 168/);
  assert.match(secrets, /#define CAMERA_PRIMARY_STATIC_IP_3 10/);
  assert.match(secrets, /#define CAMERA_PRIMARY_STATIC_IP_4 11/);
  assert.match(secrets, /#define CAMERA_PRIMARY_GATEWAY_4 1/);
  assert.match(secrets, /#define CAMERA_FALLBACK_STATIC_IP_1 172/);
  assert.match(secrets, /#define CAMERA_FALLBACK_STATIC_IP_2 20/);
  assert.match(secrets, /#define CAMERA_FALLBACK_STATIC_IP_3 10/);
  assert.match(secrets, /#define CAMERA_FALLBACK_STATIC_IP_4 11/);
  assert.match(firmware, /constexpr uint32_t kWifiTimeoutMs = 10000;/);
  assert.match(firmware, /const WifiProfile wifiProfiles\[\]/);
  assert.match(firmware, /"cudy-router"/);
  assert.match(firmware, /"phone-hotspot"/);
  assert.match(firmware, /for \(const WifiProfile& profile : wifiProfiles\)/);
  assert.match(firmware, /WiFi\.begin\(profile\.ssid, profile\.password\);/);
  assert.match(firmware, /payload \+= jsonPair\("ssid", WiFi\.SSID\(\)\);/);
  assert.match(firmware, /payload \+= jsonPair\("profile", activeWifiProfileName\);/);
  assert.match(firmware, /while \(!connectWifi\(\)\)\s*\{\s*delay\(1000\);/);
});

test('camera initializes with a sensor-compatible raw format and serves JPEG over HTTP', () => {
  assert.match(firmware, /constexpr uint8_t kJpegQuality = 80;/);
  assert.match(firmware, /config\.pixel_format = PIXFORMAT_RGB565;/);
  assert.match(firmware, /config\.frame_size = FRAMESIZE_240X240;/);
  assert.match(firmware, /config\.fb_location = CAMERA_FB_IN_PSRAM;/);
  assert.match(firmware, /config\.fb_count = psramFound\(\) \? 2 : 1;/);
  assert.match(firmware, /config\.grab_mode = CAMERA_GRAB_WHEN_EMPTY;/);
  assert.match(firmware, /frame2jpg\(fb, kJpegQuality, &jpegBuffer, &jpegLength\);/);
  assert.match(firmware, /server\.send\(200, "image\/jpeg", ""\);/);
  assert.match(firmware, /Content-Type: image\/jpeg/);
});
