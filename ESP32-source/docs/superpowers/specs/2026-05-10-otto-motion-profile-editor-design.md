# Otto 动作参数编辑器 Design

**Goal:** 在 Otto 控制页新增一个可持久保存的动作参数编辑器，让用户为每个运动动作单独调节关节幅度，支持恢复当前动作默认值、临时试跑、保存到机器人。

**Architecture:** 机器人端保存每个 Otto 动作的参数档案，Web 端把这些档案渲染成可编辑草稿并通过本地存储记住未保存修改。运动按钮仍然只负责发动作命令；编辑器只负责选中当前动作、调整参数、试跑当前草稿和保存当前草稿。  
试跑通过把草稿作为临时 profile 下发给机器人实现，不写入持久存储；保存则写入 ESP32 `Preferences`，并同步回 Web 状态。

**Tech Stack:** React, Vite, ESP32 Arduino, `Preferences`, `ArduinoJson`, localStorage

---

## Scope

### In scope
- Otto 控制页新增“动作参数编辑器”
- 支持动作档案：`otto_forward`、`otto_backward`、`otto_left`、`otto_right`、`otto_shift_left`、`otto_shift_right`
- 每个动作独立保存一组关节幅度参数
- 支持“恢复当前动作默认值”
- 支持“测试当前动作”
- 支持“保存到机器人”
- Web 重启后保留未保存草稿
- 机器人重启后保留已保存参数

### Out of scope
- 不修改 Otto 的相位/偏移公式，只暴露幅度参数
- 不把“恢复默认值”做成自动写入持久存储
- 不改其他普通舵机零位校准逻辑

## Data Model

### Otto motion profile
Each profile stores four floats:
- `leftLegAmplitudeDeg`
- `rightLegAmplitudeDeg`
- `leftHipAmplitudeDeg`
- `rightHipAmplitudeDeg`

### Profile defaults
Defaults stay aligned with current gait logic:
- `otto_forward` and `otto_backward`
  - left leg 12.0
  - right leg 10.5
  - left hip 18.0
  - right hip 16.5
- `otto_left`
  - left leg 18.0
  - right leg 7.0
  - left hip 12.0
  - right hip 12.0
- `otto_right`
  - left leg 7.0
  - right leg 18.0
  - left hip 12.0
  - right hip 12.0
- `otto_shift_left` and `otto_shift_right`
  - left leg 12.0
  - right leg 12.0
  - left hip 10.0
  - right hip 10.0

### Persistence rules
- Robot-side saved profiles live in `Preferences`
- Web-side drafts live in `localStorage`
- If the user never clicks save, the last draft stays in the browser after refresh/reopen
- If the user clicks save, the robot-side profile becomes the saved value that future button presses use

## UI Behavior

### Movement area
- Buttons still execute the current Otto motion immediately
- Buttons do not save or reset profiles
- Clicking a motion button does not need to auto-switch the editor if that would make the separation feel too tight

### Editor area
- Shows one selected motion profile at a time
- Includes:
  - motion selector buttons for the six Otto motions
  - four sliders for the current motion profile
  - `恢复当前动作默认值`
  - `测试当前动作`
  - `保存到机器人`
- `恢复当前动作默认值` only resets the current draft to the built-in default for that motion
- `测试当前动作` sends the current draft as a temporary override and starts that motion once
- `保存到机器人` writes the current draft into robot storage and keeps it after robot or Web restart

### Slider constraints
- Use a single safe slider range for all four fields
- Clamp on both client and firmware side
- Preferred range: `0.0` to `30.0`, step `0.5`

## Firmware Behavior

### Status payload
Expose:
- saved Otto motion profiles
- built-in Otto motion profile defaults
- current active Otto mode

### Control commands
- `move` may accept an optional `profile` object
  - when present for an Otto motion, it acts as a temporary runtime override
  - it is not persisted
- new save command:
  - `type: "otto_motion_profile_save"`
  - fields: `direction`, `profile`
  - persists the profile to `Preferences`
  - does not have to stop or restart the current gait

### Runtime rules
- Current gait evaluation reads from saved profile by default
- When a temporary profile override is present, the current run uses that override until the motion stops
- Restoring defaults in the UI only changes the draft, not the robot store

## Web Behavior

### Draft management
- Initialize drafts from robot status if saved profiles exist
- Merge with browser-local drafts so unsaved changes survive reload
- Key drafts by robot identity when available, otherwise by a stable fallback key

### API interactions
- `测试当前动作` posts `move` with `profile`
- `保存到机器人` posts `otto_motion_profile_save`
- After save, update the local draft cache to match the saved value

## Testing

- Add firmware tests for:
  - default Otto motion profiles
  - status payload includes saved/default motion profiles
  - `move` with a temporary profile override is wired through
  - save command persists the selected profile
- Add Web tests or snapshot checks for:
  - editor renders six motion selectors
  - `恢复当前动作默认值` only affects the current draft
  - `测试当前动作` and `保存到机器人` call the right payloads
  - local draft persistence is keyed and restored on reload

## Files to Change

- `firmware/esp32_robot_controller/src/main.cpp`
- `firmware/esp32_robot_controller/robot-config.test.mjs`
- `apps/web/src/App.jsx`
- `apps/web/src/pages/ControlPage.jsx`
- `apps/web/src/dashboard-config.jsx`
- `apps/web/src/styles.css`

