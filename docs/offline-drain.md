# Offline Drain — Bunker Persistence (v1)

`OFFLINE_DRAIN_V1` · shipped 2026-08-03 · local-only

## The problem it solves

The bunker was session-only. `saveVaults()` was an explicit no-op, the only localStorage key in the codebase was `SA_BATTLE_RESULT`, and the tick handler reset its delta on resume so even a backgrounded tab drained nothing. Close the tab and the grid reset to 4/4.

An idle game that doesn't idle. It also meant no fuse number could be validated, because the clock stopped whenever you looked away.

## Three kinds of time (v2)

**v1 got this wrong and had to be corrected.** It slowed *everything* while you were away, sabotage included — which handed the player free protection from intruders just for closing the tab. That is precisely the job the **Home (sleep) bunker** is meant to do, so node 2 of the four-node network would have been pointless before it was built. It is the same dominance bug the council flagged, arriving from the opposite direction.

The three clocks are now billed separately:

| Clock | Rate while away | Why |
|---|---|---|
| **Life support** (air / water / thermal) | reduced (see below) | the concession to players with jobs and beds |
| **Obligation** (baseline decay, 1 fuse / 24h) | **full** | obligations accrue; the bunker goes dark on its own schedule |
| **Hostile** (DEFENSE sabotage) | **full** | intruders do not care that you had dinner |

Freezing the hostile clock is reserved for the Home bunker. **Leaving DEFENSE at 4/4 is what makes an absence safe from intruders — not the act of leaving.**

### Life-support rate

| Time away | Rate |
|---|---|
| First 12 hours | **0.35×** |
| Beyond 12 hours | **1.00×** |

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

## Escape hatch

Closed: the hub now offers `[N] NEW RUN — abandon this bunker and start over`, shown only when a saved run exists. It confirms with `ABANDON THIS RUN? [Y/N]` before clearing the save and cold-starting, so days of survival cannot be thrown away by a stray keypress.

## Reaching it (IDLE_DOOR_WIRED_V1)

The bunker survival layer already existed and now persists — but it sat behind the hub's `[6] BUNKER CONTROLS`, while the one door advertising it (IDLE, "keep the life support lit") printed a "this mode is being wired up" notice. The feature existed; the door that promised it did not open it.

The IDLE door now routes into it. `window.saEnterBunkerLayer()` calls `reEnterTerminal("bunker")`, which closes the doors, brings the terminal up, prints `ROUTING TO LOCAL SYSTEMS — NODE 7`, and lands on LOCAL SYSTEMS.

The AZTEC gate is preserved rather than bypassed — it is a designed puzzle, not an obstacle to route around. Re-entry reprints the key when the bunker is still locked, so it is always obtainable:

- locked out after failed attempts → refused, back to hub
- already unlocked this run → straight in
- otherwise → `BUNKER PASSWORD >`, with the key reprinted above it

Verified end to end on the build: door → terminal → key → `BUNKER [D / F / B]` → `F` → fuse panel, with the run persisting from that point. No page errors.

## Relationship to the Home (sleep) bunker

This system covers the **undeclared** absence — you closed the tab. It is not a substitute for the **declared** one.

The four-node bunker network is: Local (starter, locked), **Home / sleep (health repair, needs work)**, Worker/Depot (needs work), Comms (locked, 1 fuse). The settled rest rules for Home are: resting freezes **hostile timers only**, obligations like depot upkeep still accrue, entry is gated so the player cannot flee mid-crisis, and early return carries a cost. Still undefined: the cost curve, sleep-duration options, and escrow amounts.

So the division of labour is:

- **Close the tab:** everything runs. Life support gets a modest concession, sabotage and decay do not.
- **Sleep at Home (not yet built):** hostile timers freeze. That is the thing worth travelling for.

Naming follows from this. The hub's save-wipe option is `[N] NEW GAME — wipe this run and start over`, deliberately **not** "abandon this bunker": leaving one bunker for another is a real mechanic in the network, so a meta save-wipe must not borrow its language.

## Verified (v2)

Fuse losses across a range of absences match `baseline(1 per 24h) + sabotage(per DEFENSE tier)` exactly:

| Case | Fuses lost | Expected | of which sabotage |
|---|---|---|---|
| DEF 4/4, away 72h | 3 | 3 | 0 |
| DEF 3/4, away 40h | 1 | 1 | 0 |
| DEF 3/4, away 50h | 3 | 3 | 1 |
| DEF 3/4, away 100h | 6 | 6 | 2 |
| DEF 2/4, away 20h | 0 | 0 | 0 |
| DEF 2/4, away 30h | 2 | 2 | 1 |
| DEF 2/4, away 8h | 0 | 0 | 0 |

A fully defended bunker (DEFENSE 4/4) takes **zero** sabotage across three days away. A night away never triggers a blow at any tier.

## The IDLE door opens onto the network (v2)

The door no longer drops the player into a single node. It scans the local mesh and presents all four sites from the settled network design:

```
// BUNKER NETWORK · LOCAL MESH //
Four sites on the mesh. Two answer.
  [1] LOCAL .... NODE 7 · ONLINE · life support grid
  [2] HOME ..... NO CARRIER · sleep + medical
  [3] DEPOT .... NO CARRIER · workers + security
  [4] COMMS .... 4/4 · outside link · sensor layer
  [B] BACK
```

- **LOCAL** routes through the AZTEC gate into the fuse panel, as before.
- **HOME** and **DEPOT** are unbuilt. Selecting them dials, fails, and reports `NO CARRIER — the site has never answered`, then returns to the mesh. They are presented the way the machine would present them, not as a "coming soon" notice: the player is looking at a dead mesh, not an unfinished menu.
- **COMMS** shows live fuse count and points at the fuse panel, where channels are actually aimed.

This makes the shape of the network visible from the first minute, so when HOME comes online it is a site answering that never answered before — not a new menu item appearing.

## The AZTEC gate no longer dead-ends a run (KEY_RECALL_V1)

Reported from play: the key flashed past once in the boot log and was gone. Two wrong attempts then sealed BUNKER CONTROLS **for the whole run** — locking the player out of the survival layer, which is the core loop, with no way back.

Three changes:

- **The key is reprinted at the prompt.** Any time local systems ask for the password and the bunker is not already unlocked, `KEY ON FILE .... AZTEC-XXXX` prints directly above the input.
- **`[K]` recalls it** without counting as an attempt. The prompt advertises this: `BUNKER PASSWORD ([K] = recall key) >`.
- **The run-long lockout is gone.** Wrong answers reprint the key and re-ask, forever.

The gate itself stays — you still have to enter the key, and it still rotates every run. What is removed is the dead end. A gate whose only failure mode is "you did not write down a four-character string thirty seconds ago" was costing players the whole game for a memory lapse, not a decision.

Verified: three consecutive wrong answers all recover with the key reshown and no lockout text; `[K]` recalls without penalty; the correct key still works afterwards; the hub never shows `BUNKER CONTROLS — LOCKED`.
