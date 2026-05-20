# Final Go Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Final go!` page and backend placeholder APIs for competition-day start, stop, and resume actions.

**Architecture:** Backend state lives in `StateStore` under `finalRun`; `FinalRunManager` validates target labels and updates placeholder state. Frontend adds a focused `FinalGoPage` route with target dropdown, confirmation modal, and API calls.

**Tech Stack:** Express, React, Vite, Node test runner.

---

### Task 1: Backend Placeholder API

**Files:**
- Create: `apps/server/src/final-run-manager.js`
- Test: `apps/server/src/final-run-manager.test.js`
- Modify: `apps/server/src/state-store.js`
- Modify: `apps/server/src/index.js`
- Modify: `apps/server/package.json`

- [ ] Add a failing test for target validation and start/stop/resume state.
- [ ] Implement `FinalRunManager`.
- [ ] Add `finalRun` default state and `updateFinalRun`.
- [ ] Register `/api/final-run/start`, `/api/final-run/stop`, `/api/final-run/resume`.
- [ ] Include `final-run-manager.js` in server syntax check.

### Task 2: Frontend Final Go Page

**Files:**
- Create: `apps/web/src/pages/FinalGoPage.jsx`
- Test: `apps/web/src/final-go-page.test.mjs`
- Modify: `apps/web/src/dashboard-config.jsx`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/styles.css`

- [ ] Add a failing static test for the tab, labels, confirm text, and endpoints.
- [ ] Build the page with compact selected-target display and dropdown.
- [ ] Wire page actions through `request()`.
- [ ] Add route metadata and render branch.
- [ ] Add minimal responsive styles.

### Task 3: Verification

- [ ] Run backend final-run test.
- [ ] Run frontend static test.
- [ ] Run server syntax check.
- [ ] Run web build.
