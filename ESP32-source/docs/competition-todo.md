# Competition Todo

## Current 5-Step Plan

1. Add 2 or 4 black-line boundary sensors.
   - Minimum: 2 sensors at front-left and front-right.
   - Better: 4 sensors at front-left, front-right, rear-left, and rear-right.
   - Goal: detect the black boundary line before the robot leaves the allowed area.

2. Implement `boundary_guard` in the ESP32 robot firmware.
   - Boundary detection must have the highest priority.
   - If the left sensor detects the line: stop, back up, then turn right.
   - If the right sensor detects the line: stop, back up, then turn left.
   - If both sensors detect the line: stop, back up longer, then rotate away.

3. Turn the `Final go!` page from a placeholder into the real run entry point.
   - `Go!` should start the actual competition state machine.
   - `Stop` should send a real stop/emergency-stop command.
   - `Resume` should continue from a known safe state.

4. Complete Task 1 first.
   - Search for and approach the black column.
   - Avoid the 4 yellow obstacles.
   - Stay inside the black boundary.
   - Confirm touch or arrival at the black column.

5. Complete Task 2 after Task 1 is stable.
   - Use the selected random target color and shape.
   - Detect one of the 12 target labels.
   - Search, align, approach, and touch the selected object.
   - Keep boundary protection active during the whole process.

## Priority

The immediate next work should be:

1. Hardware: add black-line sensors.
2. Firmware: add `boundary_guard`.
3. Software: connect `Final go!` to the real autonomous flow.
