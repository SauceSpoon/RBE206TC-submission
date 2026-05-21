#ESP32 Robot Graphical Web Control and Burning Station

The first version of the project implemented according to the first phase goals of `esp_32_robot_web_flasher_control_plan.md` contains four parts:

- `apps/web`: React + Vite graphical console
- `apps/server`: Node.js + Express local control service
- `firmware/esp32_robot_controller`: ESP32 Arduino/PlatformIO example firmware
- `firmware/esp32_cam_streamer`: Standalone ESP32-CAM streaming firmware

## Current capabilities

- Enter the IP on the web page and connect to the robot
- The web page independently connects to ESP32-CAM and displays real-time video streams and snapshot previews
- Forward browser control commands to ESP32 through local services
- A new local script chat window has been added to the control page, and Chinese scripts can be used to directly drive the servo.
- Natural language can be planned into a whitelist script through local Ollama / Gemma, and then handed over to the local service for execution
- Supports action buttons, emergency stop, attitude return, and 7-way servo slider
- Upload `.bin` firmware and push to ESP32 via OTA
- The camera module also supports remote upgrade via Wi-Fi OTA
- Reserve USB burning entrance as first time burning/brick rescue mode
- Automatically scan and display available serial devices, and the page will automatically refresh after plugging and unplugging.
- Camera images can be forwarded through the local service proxy, and the stream can also be viewed when the console is opened remotely
- Status, log, delay, battery, motor angle and other information are displayed in real time on the page

## PCA9685 Wiring

- The current firmware outputs servo PWM through PCA9685 and no longer directly uses ESP32 GPIO to control the servo.
- Default I2C wiring: ESP32 `GPIO 21 -> SDA`, `GPIO 22 -> SCL`
- Default servo channel mapping: servo `1/2/3` on the web page corresponds to PCA9685 channel `0/1/2`
- PCA9685 logic power supply `VCC` is recommended to be connected to ESP32 `3.3V`
- Servo power supply `V+` continues to be connected to the output of your buck module
- `ESP32 GND`, `PCA9685 GND`, and the battery negative pole must be grounded together

## Directory structure

```text
ESP32/
├─ apps/
│ ├─ server/ # Local control service
│ └─ web/ # Web console
├─ firmware/
│ ├─ esp32_robot_controller/
│ ├─ include/
│ ├─ src/
│ └─ platformio.ini
│ └─ esp32_cam_streamer/
│ ├─ include/
│ ├─ src/
│ └─ platformio.ini
├─docs/
│ └─ flash-version-workflow.md
├─ .github/workflows/
│ └─ ci.yml
└─ README.md
```

## GitHub warehouse and version management

This directory should be maintained as a single repository for "all robot programming-related codes" to avoid future occurrences:

- Only the board code was changed, but the Web/Server protocol changes were not saved simultaneously.
- Directly overwrites the last stable function, causing a certain ability to be removed.
- The burning was successful, but I can’t find which version of the code it corresponded to when I looked back.

Recommended execution method:

1. Submit the code before each preparation.
2. Add Git tag after each verification is stable.
3. New features are always developed in branches and do not directly cover the stable version.
4. After pushing to GitHub, treat GitHub as the only remote backup.

For the complete process, see [docs/flash-version-workflow.md](/Users/yanyangnan/Desktop/ESP32/docs/flash-version-workflow.md).

## Quick start

### 1. Install dependencies

Execute in the project root directory:

```bash
npm install
```

### 2. Start local service

```bash
npm run dev:server
```

Listens to `http://localhost:3001` by default.

If you need to customize the configuration, copy [apps/server/.env.example](/Users/yanyangnan/Desktop/ESP32/apps/server/.env.example) to `.env` and modify it.

If you want to connect to local Ollama / Gemma, first make sure Ollama is started and the model name can be seen in `ollama list`, and then configure it in [apps/server/.env](/Users/yanyangnan/Desktop/ESP32/apps/server/.env):

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma4:26b
OLLAMA_TIMEOUT_MS=30000
```

The model name must use the name displayed in your local `ollama list`; if it is actually called `gemma3:4b`, `gemma3n` or other names, change `OLLAMA_MODEL` to the corresponding value.

### 3. Start the web console

```bash
npm run dev:web
```

The default development address is `http://localhost:5173`.

If you need to modify the API address, copy [apps/web/.env.example](/Users/yanyangnan/Desktop/ESP32/apps/web/.env.example) to `.env`.

### 4. Burn in ESP32 base firmware

Enter [firmware/esp32_robot_controller](/Users/yanyangnan/Desktop/ESP32/firmware/esp32_robot_controller):

```bash
pio run -t upload
```

Before using it for the first time, please copy [include/secrets.example.h](/Users/yanyangnan/Desktop/ESP32/firmware/esp32_robot_controller/include/secrets.example.h) to `secrets.h`, and then modify the Wi‑Fi information in it.

### 5. Burn standalone ESP32-CAM firmware

Enter [firmware/esp32_cam_streamer](/Users/yanyangnan/Desktop/ESP32/firmware/esp32_cam_streamer):

```bash
pio run -t upload
```

Copy [include/secrets.example.h](/Users/yanyangnan/Desktop/ESP32/firmware/esp32_cam_streamer/include/secrets.example.h) to `secrets.h`, fill in Wi‑Fi, and then burn. By default it will provide:

- `/stream`: MJPEG real-time video stream
- `/capture`: single frame capture
- `/status`: camera parameters and online status
- `/health`: health check
- `/update`: camera firmware OTA update entrance

### 6. Unified verification

Before preparing to burn or push to GitHub, it is recommended to execute:

```bash
npm run check
```

This checks in order:

- Is the web front end buildable?
- Whether the syntax of the local server-side JS file passes
- Whether the robot main control firmware can be compiled
- Is the camera firmware compilable?

## Run process

1. Use USB to burn the basic firmware with OTA into ESP32
2. Open the Web console, enter the robot IP and connect
3. Send control commands through action buttons and sliders
4. Select the `.bin` firmware and upload it to the local service
5. Select the burning target (robot master/camera module) and OTA/USB mode
6. Click "Upload and Upgrade", the local service will push the firmware to `/update` of the corresponding device
7. Camera preview uses local service proxies `/api/camera/stream` and `/api/camera/snapshot` by default

## Local Service API

- `POST /api/connect`
- `POST /api/disconnect`
- `POST /api/camera/connect`
- `POST /api/camera/disconnect`
- `GET /api/status`
- `GET /api/camera/status`
- `GET /api/camera/stream`
- `GET /api/camera/snapshot`
- `POST /api/firmware/upload`
- `POST /api/firmware/flash`
- `POST /api/script/run`
- `POST /api/script/stop`
- `POST /api/brain/run`
- `POST /api/control`
- `GET /api/serial/ports`
- `GET /api/health`
- `WS /ws`: Push status and logs to the web frontend

## USB burning instructions

`POST /api/firmware/flash` supports:

- `target: "robot" | "camera"`
- `mode: "ota" | "usb"`

Among them `mode: "usb"` is called by default:

```bash
python3 -m esptool --chip esp32 --port <port> --baud <baudRate> write_flash 0x10000 <file>
```

This is a simplified writing method for OTA application partitions, suitable for devices that already have a basic partition table. If you need to completely burn the bootloader / partitions / app for the first time, please adjust the offset and command strategy in [apps/server/.env.example](/Users/yanyangnan/Desktop/ESP32/apps/server/.env.example).

## ESP32 firmware dependencies

It is recommended to use PlatformIO, which has been declared in [platformio.ini](/Users/yanyangnan/Desktop/ESP32/firmware/esp32_robot_controller/platformio.ini):

- `ESP Async WebServer`
- `AsyncTCP`
- `ArduinoJson`
- `ESP32Servo`

## Suggestions for subsequent expansion

- Automatically scan LAN devices
- Action recording/playback
-Multi-robot switching
- IMU visualization
- Camera streaming
- More complete USB first-time burning process





# ESP32 机器人图形化 Web 控制与烧录台

按 `esp_32_robot_web_flasher_control_plan.md` 的第一阶段目标实现的初版项目，包含四部分：

- `apps/web`：React + Vite 图形化控制台
- `apps/server`：Node.js + Express 本地控制服务
- `firmware/esp32_robot_controller`：ESP32 Arduino / PlatformIO 示例固件
- `firmware/esp32_cam_streamer`：独立 ESP32-CAM 串流固件

## 当前能力

- Web 页面输入 IP 并连接机器人
- Web 页面独立连接 ESP32-CAM，并显示实时视频流与抓拍预览
- 通过本地服务把浏览器控制指令转发到 ESP32
- 控制页新增本地脚本聊天窗口，可用中文脚本直接驱动舵机
- 可通过本地 Ollama / Gemma 把自然语言规划成白名单脚本，再交给本地服务执行
- 支持动作按钮、急停、姿态回中、7 路舵机滑块
- 上传 `.bin` 固件并通过 OTA 推送到 ESP32
- 相机模块同样支持通过 Wi-Fi OTA 远程升级
- 保留 USB 烧录入口，作为首次烧录/救砖模式
- 自动扫描并显示可用串口设备，插拔后页面自动刷新
- 相机画面可通过本地服务代理转发，远程打开控制台时也能看流
- 状态、日志、延迟、电池、电机角度等信息在页面里实时显示

## PCA9685 接线

- 当前固件通过 PCA9685 输出舵机 PWM，不再直接使用 ESP32 GPIO 控舵机
- 默认 I2C 接线：ESP32 `GPIO 21 -> SDA`，`GPIO 22 -> SCL`
- 默认舵机通道映射：网页的舵机 `1/2/3` 对应 PCA9685 通道 `0/1/2`
- PCA9685 逻辑电源 `VCC` 建议接 ESP32 `3.3V`
- 舵机电源 `V+` 继续接你的降压模块输出
- `ESP32 GND`、`PCA9685 GND`、电池负极必须共地

## 目录结构

```text
ESP32/
├─ apps/
│  ├─ server/   # 本地控制服务
│  └─ web/      # Web 控制台
├─ firmware/
│  ├─ esp32_robot_controller/
│     ├─ include/
│     ├─ src/
│     └─ platformio.ini
│  └─ esp32_cam_streamer/
│     ├─ include/
│     ├─ src/
│     └─ platformio.ini
├─ docs/
│  └─ flash-version-workflow.md
├─ .github/workflows/
│  └─ ci.yml
└─ README.md
```

## GitHub 仓库与版本管理

这个目录应作为“机器人所有烧录相关代码”的单一仓库来维护，避免以后出现：

- 只改了板端代码，但没同步保存 Web / Server 协议变更
- 直接覆盖上一次稳定功能，导致某个能力被顶掉
- 烧录成功了，但回头找不到当时对应的是哪一版代码

推荐执行方式：

1. 每次准备烧录前先提交代码。
2. 每次验证稳定后打 Git tag。
3. 新功能一律在分支开发，不直接覆盖稳定版。
4. 推送到 GitHub 后，把 GitHub 当作唯一远程备份。

完整流程见 [docs/flash-version-workflow.md](/Users/yanyangnan/Desktop/ESP32/docs/flash-version-workflow.md)。

## 快速开始

### 1. 安装依赖

在项目根目录执行：

```bash
npm install
```

### 2. 启动本地服务

```bash
npm run dev:server
```

默认监听 `http://localhost:3001`。

如需自定义配置，复制 [apps/server/.env.example](/Users/yanyangnan/Desktop/ESP32/apps/server/.env.example) 为 `.env` 后修改。

如果要接入本地 Ollama / Gemma，先确认 Ollama 已启动并且模型名能在 `ollama list` 里看到，然后在 [apps/server/.env](/Users/yanyangnan/Desktop/ESP32/apps/server/.env) 中配置：

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gemma4:26b
OLLAMA_TIMEOUT_MS=30000
```

模型名必须使用你本机 `ollama list` 显示的名字；如果实际叫 `gemma3:4b`、`gemma3n` 或其他名字，就把 `OLLAMA_MODEL` 改成对应值。

### 3. 启动 Web 控制台

```bash
npm run dev:web
```

默认开发地址为 `http://localhost:5173`。

如需修改 API 地址，复制 [apps/web/.env.example](/Users/yanyangnan/Desktop/ESP32/apps/web/.env.example) 为 `.env`。

### 4. 烧入 ESP32 基础固件

进入 [firmware/esp32_robot_controller](/Users/yanyangnan/Desktop/ESP32/firmware/esp32_robot_controller)：

```bash
pio run -t upload
```

首次使用前请先把 [include/secrets.example.h](/Users/yanyangnan/Desktop/ESP32/firmware/esp32_robot_controller/include/secrets.example.h) 复制为 `secrets.h`，再修改其中的 Wi‑Fi 信息。

### 5. 烧入独立 ESP32-CAM 固件

进入 [firmware/esp32_cam_streamer](/Users/yanyangnan/Desktop/ESP32/firmware/esp32_cam_streamer)：

```bash
pio run -t upload
```

把 [include/secrets.example.h](/Users/yanyangnan/Desktop/ESP32/firmware/esp32_cam_streamer/include/secrets.example.h) 复制为 `secrets.h` 后填好 Wi‑Fi，再烧录。默认会提供：

- `/stream`：MJPEG 实时视频流
- `/capture`：单帧抓拍
- `/status`：相机参数和在线状态
- `/health`：健康检查
- `/update`：相机固件 OTA 更新入口

### 6. 统一校验

在准备烧录或推送到 GitHub 前，建议先执行：

```bash
npm run check
```

这会依次检查：

- Web 前端是否可构建
- 本地服务端 JS 文件是否语法通过
- 机器人主控固件是否可编译
- 相机固件是否可编译

## 运行流程

1. 用 USB 给 ESP32 烧入带 OTA 的基础固件
2. 打开 Web 控制台，输入机器人 IP 并连接
3. 通过动作按钮、滑块发送控制命令
4. 选择 `.bin` 固件，上传到本地服务
5. 选择烧录目标（机器人主控 / 相机模块）和 OTA / USB 模式
6. 点击“上传并升级”，本地服务会把固件推送到对应设备的 `/update`
7. 相机预览默认走本地服务代理 `/api/camera/stream` 和 `/api/camera/snapshot`

## 本地服务 API

- `POST /api/connect`
- `POST /api/disconnect`
- `POST /api/camera/connect`
- `POST /api/camera/disconnect`
- `GET /api/status`
- `GET /api/camera/status`
- `GET /api/camera/stream`
- `GET /api/camera/snapshot`
- `POST /api/firmware/upload`
- `POST /api/firmware/flash`
- `POST /api/script/run`
- `POST /api/script/stop`
- `POST /api/brain/run`
- `POST /api/control`
- `GET /api/serial/ports`
- `GET /api/health`
- `WS /ws`：向 Web 前端推送状态和日志

## USB 烧录说明

`POST /api/firmware/flash` 支持：

- `target: "robot" | "camera"`
- `mode: "ota" | "usb"`

其中 `mode: "usb"` 默认调用：

```bash
python3 -m esptool --chip esp32 --port <port> --baud <baudRate> write_flash 0x10000 <file>
```

这是面向 OTA 应用分区的简化写入方式，适合已具备基本分区表的设备。若你需要首次完整烧录 bootloader / partitions / app，请自行调整 [apps/server/.env.example](/Users/yanyangnan/Desktop/ESP32/apps/server/.env.example) 中的偏移与命令策略。

## ESP32 固件依赖

建议使用 PlatformIO，已在 [platformio.ini](/Users/yanyangnan/Desktop/ESP32/firmware/esp32_robot_controller/platformio.ini) 中声明：

- `ESP Async WebServer`
- `AsyncTCP`
- `ArduinoJson`
- `ESP32Servo`

## 后续扩展建议

- 自动扫描局域网设备
- 动作录制 / 回放
- 多机器人切换
- IMU 可视化
- 摄像头串流
- 更完整的 USB 首次烧录流程
