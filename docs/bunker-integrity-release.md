# Bunker integrity release candidate

This candidate is based on `aeadb08`, the existing isolated integrity patch immediately after the deployed `492266c` build. Local Economy and Home are intentionally absent.

## Corrections

- Countdown accounting: MOVE/AIM's 30-second reprieve is charged once, not repeatedly on subsequent ticks.
- Fuse moves: a depleted or missing source is refused at commit time.
- Offline chronology: the first 12 hours use the existing 0.35 rate, followed by the existing full rate, in that order.
- Event chronology: decay and sabotage occur at their actual boundaries rather than the end of a whole minute.
- Emergency resume: the rescue threshold uses real remaining seconds after POWER scaling.
- Save lifecycle: once the opening assault has started a run, DISCONNECT saves it and life support keeps running, as it already did after the door choice. Life-support death, assassination, and password lockout all clear the save.
- Mobile controls: the prompt wraps above a visible, 44px-high input instead of pushing the field off-screen.
- Death screen: the title and acknowledgement stay visible; only the long letter scrolls.
- Reporting: short offline drift is shown in seconds instead of `0m`.
- Battle-result safety: only the launched game or direct parent relay can submit a fresh result for the current battle. Winner labels are escaped on message and storage paths; advisor intents must come from the command frame.
- Cross-tab isolation: each launched battle has its own storage key, and the parent only collects results registered by its active command frame. An unrelated or older game tab cannot consume a new battle's result.

These are correctness and usability fixes, not a balance lock. Fuse tiers, POWER multipliers, decay intervals, sabotage intervals, the rest concession, the 30-second action allowance, and the full-capacity rule are unchanged.

The message hardening is the only additional non-bunker code change. The pre-publish review identified the older handler as an injection/spoofing risk, so the release closes that issue without changing battle outcomes, rewards, or rules.

## Open design decision: full capacity

Reaching 4/4 clears a system's countdown, so a later fuse loss starts that tier's full budget. A spare fuse moved into a system and back out again can therefore refill a depleted reserve. This release keeps that existing rule.

| Option | Effect | Cost |
|---|---|---|
| Instant refill at 4/4 (current) | Simple; 4/4 always means fully repaired | Attentive players can reset any reserve at will |
| Gradual refill at 4/4 | Closes the trick; full capacity still repairs | Needs a refill rate and a visible reserve at 4/4 |
| No refill | Closes the trick | Every failure compounds; needs a visible reserve at 4/4 |

An earlier draft of this release used no refill. It was withdrawn before deployment because the panel still showed a full reserve at 4/4, failures became permanent, and a newly installed fuse would no longer restore a system.

## Known pre-existing issues (not changed here)

- The host sends `X-Frame-Options: DENY` and `frame-ancestors 'none'` for every page, including `presidential_command.html`. The game therefore cannot embed its own Presidential Command panel on the live site, and Chromium blocks the frame. The live August build has the same problem.
- Choosing the Single Player door does not stop bunker clocks that are already running, for example after the opening assault, although that door is meant to have no survival timer.

## Repeatable checks

Run `npm test` with Node 20 or later. No dependency installation is required.

The runner parses inline JavaScript in both HTML entry points and runs every regression suite present on the branch. The release branch contains the integrity and message-safety suites; main-based branches also run Local Economy and Home.

GitHub Actions runs the same command on pull requests and pushes to main, release branches, and fix branches. This workflow does not publish the game.

## Save compatibility

The save key and schema version remain `SA_BUNKER_STATE_V1` / version 1, with no new fields. Existing saves load unchanged.

Saves remain local to the browser/device. No cloud account, cross-device save, authentication service, or game-economy backend is introduced.

## Browser QA scope

The release check covers fresh terminal entry, AZTEC gate, defense resolution, opening assault, rescue moves, a 4/4 round trip under the current rule, extended MOVE, AIM changes, offline resume, emergency resume, death/reload, and desktop/mobile control bounds.

The district/World Ring and board-game systems are unchanged. Parsing those scripts and checking initial rendering is not a full balance or multiplayer certification.

Focused message checks additionally verify that unrelated senders and stale battle IDs are rejected, markup is displayed as text, and valid popup, local-storage, and parent-relay results still resolve. These ran on a local server, which permits same-origin framing; on the live host, the framing block above applies. Public local playtesting controls remain intentionally available; this is not an anti-cheat or authenticated multiplayer release.

## Release gate

Only the release candidate's static game files should be deployed. Never copy current main over the public game as part of this hotfix.

Required static files: `index.html`, `presidential_command.html`, `vance_avatar.webp`, `usa_arrival.mp4`, `site_facility.jpg`, `site_regional.jpg`, and `site_schematic.jpg`.

Do not include `.git`, test fixtures, QA screenshots, or the stale `live_current.html` snapshot in the public bundle. Update the existing `start-again.pplx.app` site in place, confirm the deployed HTML hash against the approved candidate, then repeat the production fresh-run and resume/death checks in an isolated browser.

## Development follow-up

Forward-port these corrections to a main-based fix branch before the next feature release. Keep Local Economy/Home provisional until timed market earnings, bootstrap funding, physical fuse accounting, and the sleep cost/refund table have explicit test evidence. Decide the full-capacity rule before tuning reserve-related balance.
