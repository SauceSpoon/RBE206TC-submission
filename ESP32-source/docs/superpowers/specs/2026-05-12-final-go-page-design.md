# Final Go Page Design

## Goal

Add a `Final go!` page for competition-day operation. The page lets the operator pick the drawn target object, start the full run, stop it, and resume it. The real autonomous Task1/Task2 logic is intentionally deferred.

## Scope

- Add a new Web tab named `Final go!`.
- Show only the currently selected target object and a dropdown for switching among the 12 training labels.
- Use training labels exactly: `black_cube`, `black_ball`, `black_pyramid`, `blue_cube`, `blue_ball`, `blue_pyramid`, `green_cube`, `green_ball`, `green_pyramid`, `red_cube`, `red_ball`, `red_pyramid`.
- Add `Go!`, `停止`, and `继续` controls.
- `Go!` and `停止` must show a confirm/cancel dialog before sending a request.
- Add backend placeholder APIs:
  - `POST /api/final-run/start`
  - `POST /api/final-run/stop`
  - `POST /api/final-run/resume`
- Placeholder APIs update server state and logs only. They do not send robot control commands yet.

## State

`finalRun` tracks the selected target, run status, phase label, timestamps, and the last requested action. The frontend keeps the selected target locally and sends it on start; the backend records the selected target in shared dashboard state.
