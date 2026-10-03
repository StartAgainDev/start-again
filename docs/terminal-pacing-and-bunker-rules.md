# Terminal pacing and bunker rules

3 October 2026. Four changes: two fix the GUARDS timing complaint, and two implement the full-capacity and Single Player decisions.

## Fair hostile clock (`FAIR_HUNT_CLOCK_V1`)

The hidden 90-second assassination budget starts when the hub prompt appears. GUARDS only works while 60 seconds remain, so the player has a 30-second window.

Printing the hub, mesh, password, and controls screens took 12.5 seconds of that window, even with instant inputs. A player who went straight to Bunker Defense could still miss GUARDS.

Time the terminal spends printing text is now credited back while the hunt is armed. Time at a prompt, on the doors screen, or anywhere else still counts in full, and the assassination fires at 90 player seconds.

## Faster text and skip (`TERMINAL_PACING_V1`)

- Text prints in half its previous time, with an 8 ms-per-character floor (`TYPE_SCALE = 0.5`, `TYPE_FLOOR = 8`).
- Press Enter or Space, or tap the screen, while text is printing to finish it instantly. The skip lasts until the next prompt.
- Readability is unchanged where it matters: every screen that clears still waits for PRESS ENTER.

## Gradual refill at 4/4 (`FULL_CAPACITY_REFILL_V1`)

- Reaching 4/4 stops the drain but keeps the reserve already spent.
- A full system refills its reserve on real time: an empty reserve refills completely in 24 hours (`FULL_CAPACITY_REFILL_S`). Offline time counts at the full wall-clock rate.
- Losing a fuse later starts the countdown from the current reserve. Moving a spare fuse in and straight back out no longer resets a depleted system.
- The panel shows the refilling reserve at 4/4, for example `██░░░░  full in 16h 0m`.
- Older saves without reserve data load as full, matching the previous rule.

## Single Player pauses the bunker (`SINGLE_PLAYER_FREEZE_V1`)

- Choosing the Single Player door freezes the bunker exactly where it is: no life-support drain, decay, sabotage, assassins, refill, or offline drift.
- The run and its save are kept. The next time the player opens the bunker terminal, it resumes untouched and reports: "The bunker held while you led the nation. No drift."
- A frozen bunker can never tick, so its countdowns cannot be wiped by a stray timer.

## Validation

- `npm test` adds 17 bunker checks. The release branch passes 58 checks; the main-based branch passes 94.
- Chromium, same human pacing (21 seconds of reading and thinking, plus typing the key):
  - Live build: GUARDS was INEFFECTIVE.
  - Candidate: 71 seconds remained at Bunker Defense, and GUARDS took a prisoner.
- The hub printed in 8.2 seconds on the live build, 4.5 seconds on the candidate, and 1.0 second with Space pressed.

## Tuning

`TYPE_SCALE`, `TYPE_FLOOR`, and `FULL_CAPACITY_REFILL_S` are single constants in `index.html`. The GUARDS and AUTO windows, the 90-second budget, fuse tiers, and all other balance values are unchanged.
