# Renewable clocks, Phase 2 (part 1)

Development build only (`v8.90-dev`, branch `feat/renewable-clocks-phase2`). Nothing here is live. The public site stays on `release/terminal-pacing-2026-10-03` at `18e4ffa` until you say yes.

## The approved rule (A)

Clocks are never bought with coin. You buy a fuse at a market vendor and fit it where one blew, as in BioSys.

- A fitted fuse raises that system one level. The time left keeps the same share of the bigger level. Example: AIR at 2/4 with half its time left (12h) becomes 3/4 with half of 48h (24h).
- Fitting the fourth fuse stops the drain. The spent reserve then refills over 24 hours, using the existing `FULL_CAPACITY_REFILL_S`.
- Each fit uses one held fuse, once. Coin, investing, moving fuses, reloading and repeated taps never add time.

Rule A needs no new numbers.

## What changed

- **FUSE PANEL `[I] FIT A SPARE`**:
  - Lists every system with a preview, for example `AIR 2/4 → 3/4  21h 32m → 1d 19h left`, `drain stops · full again in 12h 0m`, `sabotage 1 per 24h → 1 per 48h`, `+1 sensor channel` or `life support x1.5 → x1.0`.
  - The previews respect COMMS. A system with no sensor on it says so instead of showing a countdown.
  - The fit is saved straight away. The result line stays under the redrawn panel, next to the prompt.
- **Market `[I] INSTALL`** now uses the same fit and the same numbering as the FUSE PANEL (1 DEFENSE, 2 AIR, 3 POWER, 4 WATER, 5 THERMAL, 6 COMMS).
- **Buying a fuse** is saved straight away.
- **Return report** after a real absence. It now lists:
  - each fuse lost while you were away, with its cause (`burned out` for baseline decay, `sabotaged` for DEFENSE sabotage) and when it went, or `No fuses failed while you were away.`
  - spares held, market stock, the next price and which currencies can pay
  - how to replace a fuse (`[2] BANK → [M] MARKETS`, then `[I]` on the FUSE PANEL)
  - the soonest failure you can see. This respects COMMS.
- **Fuse ledger (audit F5)**: the 24 fuses in the grid are now counted.
  - `installed` always equals the fuses lit in the grid.
  - `destroyed` is whatever is not in stock, held or installed.
  - Older saves are migrated on load.
- **Panel wording**: `a blown fuse is gone for good.` replaces `fuses are scarce — they only move`, because replacements now come from the market.
- **One settings block**: `SA_RENEW` in `index.html` (search for `RENEWABLE_CLOCKS_SETTINGS_V1`). It holds only the dev time-skip steps and the dev starting grids. It contains no balance numbers.

## Dev time-skip (local copies only)

The time-skip only appears on `file://`, `localhost` or `127.0.0.1`. The public site never shows it. This was checked in Chromium on a non-local address.

**To try it:**

```
git clone https://github.com/StartAgainDev/start-again.git
cd start-again
git checkout feat/renewable-clocks-phase2
python3 -m http.server 8000
```

1. Open http://localhost:8000/, or open `index.html` directly.
2. Click the war-room picture to enter the bunker, and play until the FUSE PANEL appears. From the menu, the route is `[6] NETWORK → [1] LOCAL → [F]`.
3. Press `[T]`.

**The `[T]` menu:**

- `[1] +10m  [2] +1h  [3] +8h  [4] +24h  [5] +3d`
- `[P]` starting fuses: SECURE, TYPICAL, FRAGILE (19 fuses each, as in the Phase 1 audit) or ALL FULL.

**How it works:**

- A skip saves the run, back-dates the save as if the tab had been closed that long, and reopens the bunker through the normal return path.
- The catch-up therefore uses the locked rules:
  - AIR, WATER and THERMAL drain at 0.35× for the first 12h, then 1.0×.
  - Decay and sabotage run at full rate.
  - Gaps under 20 seconds are ignored.
- You see the real report, followed by a before → after block.
- If the absence would kill the run, you get the real death screen and the save is cleared, as on a real return.
- A skip during Single Player adds no time, as on a real return.

## Tests

- `npm test` runs 6 suites with 115 checks: the 96 existing checks plus 19 new ones in `tests/renewable_clocks_phase2.cjs`. All pass.
- The new checks cover:
  - the settings block
  - the public/local/file gate
  - every skip matching a real closed-tab absence (3 grids × 5 steps)
  - no time added during Single Player
  - the return report lines, COMMS limits and the all-clear
  - rule A: share of time, 4/4 stop and the 24h refill
  - previews for each system
  - previews matching the panel clock at low POWER
  - coin never buying time
  - moving or reloading adding no time
  - repeated taps not fitting twice
  - market numbering
  - the ledger through the opening, decay, buying, fitting, Home and reload
  - old-save migration
  - the version label
- **Browser check** (Chromium; desktop 1280 px, phone 390 px, and a non-local address):
  - covered the return report, buying at the market, fitting on the FUSE PANEL, the presets, and skips of +24h and +3d
  - no page errors and no text running off the screen
  - after the TYPICAL preset, +24h and then +3d ended on the real AIR death screen. This fits the audit's runway model, where a player who never buys lasts about 3.3 days

## Waiting for your decision (not built)

1. **Market earnings.** Proposed: 22% per day (or 20% or 25%), collected as reinvest or payout, with the money you invest staying in. Until this replaces the instant profit loop (F3), currency is unlimited, so fuses are effectively free. Phase 2 should not go live without it.
2. **Shop stock:** 24 or 32 fuses.
3. **F1 and F2 fixes.** F1 is a free pause via reload → Single Player door. F2 is an open background tab draining 2.86× faster with no report. They could go in Phase 2, go out as a live hotfix, or wait.

## Noticed, not changed

- **F14, weak POWER shows too much time left.** This affects the panel, the bunker controls board and the return report. The clock shows the time left at full POWER, but runs faster.
  - AIR showing `12h 0m left` actually fails after 8h at POWER 3/4, 6h at 2/4, 4h at 1/4 and 2.4h at 0/4. The live build does the same.
  - The new previews and the soonest-failure line use the same reading, so the screens agree with each other.
  - Options:
    - A: show real time left everywhere (recommended; it matches the emergency rescue and Home checks, which already use real time)
    - B: keep the clock reading and add a real-time note when POWER is low
    - C: leave it as it is
- **Sabotage progress carries over when DEFENSE drops.** Example: decay knocks DEFENSE from 3/4 to 2/4 after 24h of sabotage progress. The next sabotage then comes at once, because those 24h already count toward the new 1-per-24h rate. Two fuses can go in the same minute. This is existing behaviour and is noted only.

## Rollback

- Tag `rollback/pre-phase2-bf05324` marks `main` before this work (`bf05324`).
- To roll back, do one of these:
  - don't merge the branch
  - revert the merge commit
  - reset a branch to the tag
- The live site is unchanged.
