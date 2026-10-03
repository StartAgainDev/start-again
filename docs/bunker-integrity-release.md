# Bunker integrity release candidate

This candidate is based on `aeadb08`, the existing isolated integrity patch immediately after the deployed `492266c` build. Local Economy and Home are intentionally absent.

## Corrections

- Countdown accounting: MOVE/AIM's 30-second reprieve is charged once, not repeatedly on subsequent ticks.
- Fuse moves: a depleted or missing source is refused at commit time.
- Reserve conservation: moving through 4/4 stops drain without refilling spent reserves; the retained fraction survives reload.
- Offline chronology: the first 12 hours use the existing 0.35 rate, followed by the existing full rate, in that order.
- Event chronology: decay and sabotage occur at their actual boundaries rather than the end of a whole minute.
- Emergency resume: the rescue threshold uses real remaining seconds after POWER scaling.
- Save lifecycle: pre-door disconnect retains the live run, and life-support death, assassination, and password lockout all clear it.
- Mobile controls: the prompt wraps above a visible, 44px-high input instead of pushing the field off-screen.
- Death screen: the title and acknowledgement stay visible; only the long letter scrolls.
- Reporting: short offline drift is shown in seconds instead of `0m`.

These are correctness and usability fixes, not a balance lock. Fuse tiers, POWER multipliers, decay intervals, sabotage intervals, the rest concession, and the 30-second action allowance are unchanged.

## Repeatable checks

Run `npm test` with Node 20 or later. No dependency installation is required.

The runner parses inline JavaScript in both HTML entry points and runs every regression suite present on the branch. The release branch contains the integrity suite; main-based branches also run Local Economy and Home.

GitHub Actions runs the same command on pull requests and pushes to main, release branches, and fix branches. This workflow does not publish the game.

## Save compatibility

The save key and schema version remain `SA_BUNKER_STATE_V1` / version 1. The optional `reserveFraction` field is additive, so old saves load without a migration; degraded-system reserves retain their saved values.

Old saves that were already at 4/4 contain no record of previously spent reserves. Those systems receive the legacy full-reserve default on their first subsequent degradation; the new field prevents future full-capacity reload exploits.

Saves remain local to the browser/device. No cloud account, cross-device save, authentication service, or game-economy backend is introduced.

## Browser QA scope

The release check covers fresh terminal entry, AZTEC gate, defense resolution, opening assault, rescue moves, the 4/4 round trip, extended MOVE, AIM changes, offline resume, emergency resume, death/reload, and desktop/mobile control bounds.

The district/World Ring and board-game systems are unchanged. Parsing those scripts and checking initial rendering is not a full balance or multiplayer certification.

## Release gate

Only the release candidate's static game files should be deployed. Never copy current main over the public game as part of this hotfix.

Required static files: `index.html`, `presidential_command.html`, `vance_avatar.webp`, `usa_arrival.mp4`, `site_facility.jpg`, `site_regional.jpg`, and `site_schematic.jpg`.

Do not include `.git`, test fixtures, QA screenshots, or the stale `live_current.html` snapshot in the public bundle. Confirm the deployed HTML hash against the approved candidate, then repeat the production fresh-run and resume/death checks in an isolated browser.

## Development follow-up

Forward-port these corrections to a main-based fix branch before the next feature release. Keep Local Economy/Home provisional until timed market earnings, bootstrap funding, physical fuse accounting, sleep-expiry replay, and the sleep cost/refund table have explicit test evidence.
