# ESP32-CAM 烧录原理说明

## 1. Flash 的分块结构

ESP32的Flash存储器（通常4MB或更多）被划分为多个"分区"（partition），每个区域有不同的用途：

```
ESP32 Flash 布局（示例，4MB）
┌─────────────────────────────────────┐
│ bootloader      (约 20KB)           │ ← 启动引导程序，决定运行哪个app
├─────────────────────────────────────┤
│ partition_table (约 4KB)            │ ← 分区表，描述flash布局
├─────────────────────────────────────┤
│ app0           (约 1.5MB)           │ ← 你的主程序（CameraWebServer等）
├─────────────────────────────────────┤
│ app1/ota       (约 1.5MB, 可选)     │ ← OTA升级备用分区
├─────────────────────────────────────┤
│ nvs            (约 20KB)            │ ← 非易失性存储（WiFi密码、配置等）
├─────────────────────────────────────┤
│ phy_init       (约 4KB)             │ ← 无线电PHY初始化数据
├─────────────────────────────────────┤
│ spiffs         (剩余空间, 可选)     │ ← 文件系统（可以存图片、网页等）
└─────────────────────────────────────┘
```

## 2. Arduino IDE 烧录时写入的内容

当你点击"上传"时，Arduino IDE会烧录以下部分：

```
烧录的内容：
✓ bootloader.bin      ← 引导程序（除非定制，一般不变）
✓ partition-table.bin ← 分区表（除非定制，一般不变）
✓ 你的程序.bin        ← 这是你的代码编译出来的二进制文件
✗ WiFi配置等数据      ← 不会烧录，每次运行时写入
```

**关键点：**
- 每次烧录都会**完全覆盖** `app0` 分区（你的程序）
- `bootloader` 和 `partition-table` 通常只在必要时更新
- **NVS分区不会被烧录覆盖**（但运行时程序会读写它）

## 3. 哪些东西是"新程序自带的"？

| 项目 | 存储位置 | 烧录时是否覆盖 | 说明 |
|------|----------|---------------|------|
| 你的代码逻辑 | app0 | ✓ 覆盖 | 这是核心 |
| WiFi SSID/密码 | 代码中硬编码 | ✓ 覆盖 | 写死在程序里 |
| 配置参数 | NVS | ✗ 不覆盖 | 需程序清除或手动擦除 |
| 摄像头校准数据 | NVS | ✗ 不覆盖 | 需程序清除或手动擦除 |
| SPIFFS中的文件 | SPIFFS分区 | 看情况 | 取决于是否勾选"擦除Flash" |

## 4. 实际例子：CameraWebServer

**烧录前你在代码里设置的：**
```cpp
// 在 CameraWebServer.ino 中
#define WIFI_SSID "你的WiFi名称"
#define WIFI_PASSWORD "你的WiFi密码"

// 相机模型选择
#define CAMERA_MODEL_AI_THINKER
```

这些会**编译进程序**，烧录后固定在 `app0` 分区。

**运行时动态产生的：**
- 连上WiFi后获得的IP地址（存在运行内存，重启重新获取）
- 用户在网页上的设置（如果程序支持存NVS，会保留）

## 5. 再烧录另一个程序时会发生什么？

**场景：** 你已经烧录了CameraWebServer，现在要烧录自己的识别程序

```
操作步骤：
1. 在Arduino IDE打开你的新程序
2. 点击"上传"

结果：
┌─────────────────────────────────────┐
│ 旧内容          新内容              │
├─────────────────────────────────────┤
│ bootloader  →   bootloader          │ ← 一般不变
│ partition   →   partition           │ ← 一般不变
│ CameraWebServer → 你的识别程序      │ ← 完全替换！
│ nvs数据    →   nvs数据（保留）      │ ← 不擦除！
└─────────────────────────────────────┘
```

**可能遇到的问题：**

如果你旧程序在NVS里存了配置，新程序可能会读出这些"旧配置"并报错。

**解决方法：**
```cpp
// 在你的 setup() 开始时添加
preferences.begin("my-app", false);
preferences.clear();  // 清除旧数据
preferences.end();
```

或者在Arduino IDE上传时：
- 工具 → **Erase All Flash Before Sketch Upload**（擦除全部后再上传）

## 6. 如何查看当前分区表？

在Arduino IDE：
1. 按住Shift键，点击"上传"
2. 观察底部日志，会看到类似：
   ```
   Writing at 0x00001000... (partition table)
   Writing at 0x00008000... (bootloader)
   Writing at 0x00010000... (application)
   ```

或者查看你的分区表定义文件：
- Arduino IDE：工具 → Partition Scheme（可以选择不同的方案）

## 7. 实用建议

**对于你当前的ESP32-CAM项目：**

1. **CameraWebServer采集阶段**：
   - 只用它来抓图
   - 不需要关心配置保留

2. **切换到识别程序时**：
   - 建议先勾选"擦除全部Flash"
   - 避免读取到旧的WiFi配置或校准数据

3. **如果你想在程序间保留数据**：
   - 使用SPIFFS或LittleFS文件系统
   - 或者在代码里明确处理NVS的读取/清除

## 8. 常见疑问

**Q: 我修改了代码，只上传了部分内容？**
A: 不对，每次"上传"都是完整替换 app0 分区

**Q: WiFi密码会保留吗？**
A: 取决于程序。如果新程序代码里写死了WiFi配置，就只用代码里的；如果程序读取NVS，可能会读到旧的

**Q: 如何彻底清空ESP32？**
A: Arduino IDE：工具 → "Erase All Flash Before Sketch Upload" → 上传任意程序

**Q: 我可以保留CameraWebServer同时添加我的识别代码吗？**
A: 可以！把两个代码合并，或者让CameraWebServer的网页调用你的识别功能
