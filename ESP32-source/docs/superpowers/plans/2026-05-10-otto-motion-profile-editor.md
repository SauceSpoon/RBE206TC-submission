# Otto 动作参数编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Otto 控制页增加可持久保存的动作参数编辑器，支持每个动作独立调参、临时试跑、恢复当前动作默认值，以及保存到机器人后长期生效。

**Architecture:** 机器人端保存一份“已保存动作档案”，Web 端维护一份“当前草稿档案”。运动按钮只触发动作；编辑器只编辑当前动作档案。试跑通过 `move` 请求携带临时 profile 覆盖值实现，不写入持久存储；保存通过独立命令写入 `Preferences`，并让 `/status` 公开当前已保存档案，方便 Web 载入和回显。  
为了防止刷新丢失，Web 再加一层 `localStorage`，只缓存未保存的草稿。

**Tech Stack:** ESP32 Arduino, `Preferences`, `ArduinoJson`, React, Vite, browser `localStorage`

---

### Task 1: Define Otto profile data and firmware commands

**Files:**
- Modify: `firmware/esp32_robot_controller/src/main.cpp`
- Modify: `firmware/esp32_robot_controller/robot-config.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('Otto motion profiles are exposed in status and include defaults', () => {
  assert.match(firmware, /ottoMotionProfiles/);
  assert.match(firmware, /otto_motion_profile_save/);
  assert.match(firmware, /move.*profile/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test firmware/esp32_robot_controller/robot-config.test.mjs`
Expected: FAIL because Otto profile fields and save command are not yet present.

- [ ] **Step 3: Write minimal implementation**

```cpp
struct OttoMotionProfile {
  float leftLegAmplitudeDeg;
  float rightLegAmplitudeDeg;
  float leftHipAmplitudeDeg;
  float rightHipAmplitudeDeg;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test firmware/esp32_robot_controller/robot-config.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add firmware/esp32_robot_controller/src/main.cpp firmware/esp32_robot_controller/robot-config.test.mjs
git commit -m "feat: add otto motion profile persistence"
```

### Task 2: Add Otto profile editor state and UI

**Files:**
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/pages/ControlPage.jsx`
- Modify: `apps/web/src/dashboard-config.jsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write the failing test**

```js
// In a web test or smoke check:
assert.match(dashboardConfig, /otto_motion_profile/);
assert.match(controlPageSource, /恢复当前动作默认值/);
assert.match(controlPageSource, /测试当前动作/);
assert.match(controlPageSource, /保存到机器人/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @esp32-robot/web run build`
Expected: FAIL because the new editor props and handlers are missing.

- [ ] **Step 3: Write minimal implementation**

```jsx
const [ottoMotionDrafts, setOttoMotionDrafts] = useState(() => loadDraftsFromStorage());
const [selectedOttoMotion, setSelectedOttoMotion] = useState('otto_forward');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @esp32-robot/web run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.jsx apps/web/src/pages/ControlPage.jsx apps/web/src/dashboard-config.jsx apps/web/src/styles.css
git commit -m "feat: add otto motion profile editor ui"
```

### Task 3: Persist drafts in browser storage

**Files:**
- Modify: `apps/web/src/App.jsx`

- [ ] **Step 1: Write the failing test**

```js
assert.match(appSource, /localStorage/);
assert.match(appSource, /ottoMotionDrafts/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @esp32-robot/web run build`
Expected: FAIL because draft hydration/persistence is not wired yet.

- [ ] **Step 3: Write minimal implementation**

```jsx
useEffect(() => {
  window.localStorage.setItem('ottoMotionDrafts', JSON.stringify(ottoMotionDrafts));
}, [ottoMotionDrafts]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @esp32-robot/web run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.jsx
git commit -m "feat: persist otto motion drafts"
```

### Task 4: Verify end-to-end behavior and tighten tests

**Files:**
- Modify: `firmware/esp32_robot_controller/robot-config.test.mjs`
- Modify: `apps/web/src/simulation-3d.integration.test.mjs` or add a focused web smoke test if needed

- [ ] **Step 1: Write the failing test**

```js
test('saved profile survives status reload and temporary test profile does not overwrite storage', () => {
  assert.ok(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test firmware/esp32_robot_controller/robot-config.test.mjs`
Expected: FAIL until the profile save/load flow is fully wired.

- [ ] **Step 3: Write minimal implementation**

Keep the test focused on concrete behavior:
- saved profile comes back from `/status`
- test-run payload uses inline profile override
- restore-default only changes the selected draft

- [ ] **Step 4: Run test to verify it passes**

Run:
`node --test firmware/esp32_robot_controller/robot-config.test.mjs`
`npm --workspace @esp32-robot/web run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add firmware/esp32_robot_controller/robot-config.test.mjs apps/web/src/simulation-3d.integration.test.mjs
git commit -m "test: cover otto motion profile editor flow"
```

