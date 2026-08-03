# Offline Drain — Bunker Persistence (v1)

`OFFLINE_DRAIN_V1` · shipped 2026-08-03 · local-only

## The problem it solves

The bunker was session-only. `saveVaults()` was an explicit no-op, the only localStorage key in the codebase was `SA_BATTLE_RESULT`, and the tick handler reset its delta on resume so even a backgrounded tab drained nothing. Close the tab and the grid reset to 4/4.

An idle game that doesn't idle. It also meant no fuse number could be validated, because the clock stopped whenever you looked away.

## The rate

Settled from the existing design (reduced decay during rest, soft cap, then full speed, long absences still risky):

| Time away | Rate | Effect |
|---|---|---|
| First 12 hours | **0.35×** | a night's sleep or a work day is survivable |
| Beyond 12 hours | **1.00×** | a long absence is genuinely dangerous |

There is **no total cap**. You can die while offline — that is the intended stake. Gaps under 20 seconds are ignored so reloads and tab switches cost nothing.

```
effective = min(gap, 12h) × 0.35  +  max(0, gap − 12h) × 1.00
```

### What that means in practice

AIR budgets from `CLOCK_MIN`: 3/4 = 48h, 2/4 = 24h, 1/4 = 6h.

| Away | Drift applied | From 3/4 AIR | From 2/4 AIR |
|---|---|---|---|
| 8 h | 2h 48m | survives | survives |
| 24 h | 16h 12m | survives | survives |
| 36 h | 28h 12m | survives | **dies** |
| 72 h | 64h 12m | **dies** | dies |
| 1 week | 160h 12m | **dies** | dies |

A normal night is always safe. A weekend at 2/4 kills you. A week away kills you from anywhere.

## How it works

- **One code path.** `advanceBy(dtReal, live)` is the single source of truth for elapsed time. The live tick calls it with the half-second delta; the offline catch-up calls it once with the whole absence. Live and offline cannot drift apart because they are the same function.
- **Persistence.** Key `SA_BUNKER_STATE_V1`, written on `pagehide`, `beforeunload`, `visibilitychange → hidden`, and on a 15-second heartbeat while the clocks run. Only saved once a run is past the opening kick (`openingApplied || clocksArmed`).
- **Resume.** `open()` is a new-run reset — it rerolls the bunker key, re-arms the hunt, restores every fuse. A saved run takes `resumeRun()` instead: skips the cold open, boot log and hunt, restores the grid, applies the absence, and lands the player at the hub with a report.
- **Death.** If a lethal clock hits zero during catch-up, the player returns straight to the death screen and the save is cleared — a corpse never resumes. The Matriarch's dispatch names how long the channel was silent.
- **Silence.** `simSilent` suppresses blowout sound effects during catch-up so a week away doesn't replay as a burst of zaps.

## Why local-only

v1 stores state in the browser. That is deliberate:

- No login wall in front of an unfinished game.
- Works offline, ships immediately, and unblocks validating every fuse number.

The cost is that it is single-device, and a determined player can edit their system clock. That is acceptable for a single-player idle layer, and it is exactly why the server path exists later. The record is a single flat object with a server-friendly timestamp, so swapping in a Supabase-backed `last_seen` is a change of transport, not of logic.

## Verified

Headless, against the real build:

- 7 absence scenarios from 10 seconds to a week, all matching the intended curve exactly.
- New players with no save get the normal cold open, with no resume text leaking in.
- The save is rewritten with a fresh timestamp after a surviving resume.
- Consecutive absences compound rather than resetting (162,720s → 155,155s across a second 6-hour gap — exact to the second).
- Save cleared on death. No page errors in any case.

## Known gap

There is no way to abandon a run and start fresh short of dying. If a player wants a clean slate mid-run, they currently cannot get one. A "NEW RUN" option on the hub or death screen would close this.
