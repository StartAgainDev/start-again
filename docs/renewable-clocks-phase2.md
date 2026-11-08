# Renewable clocks, Phase 2 (play-test build)

Development build only (`v8.90-dev`, branch `feat/renewable-clocks-phase2`, draft PR #8). Nothing here is live. The public site stays on `release/terminal-pacing-2026-10-03` at `18e4ffa` until you say yes.

Part 1 (commit `e0d9942`) added the approved refresh rule A, the return report, the fuse ledger fix and the dev time-skip. Part 2 makes the build fair and fun to play-test: markets earn over time, every currency can buy fuses, and the known loopholes from the Phase 1 audit are closed.

## Play-test link

The play-test link serves this branch straight from GitHub through raw.githack.com. It is unlisted, not private: anyone with the link can play it. The PR description has a link pinned to the exact commit. This one always follows the branch, a few minutes behind:

`https://raw.githack.com/StartAgainDev/start-again/feat/renewable-clocks-phase2/index.html`

- The first time you open it, raw.githack.com shows its own "One more step" notice (with an advert). Click **Open the page**. It remembers that for this repo for 24 hours, then asks again. Your save is not affected.
- Saves are kept in your browser for raw.githack.com, separately from the public site.
- The dev time-skip `[T]` shows on this link and on local copies. It never shows on start-again.pplx.app.

**A quick test run:**

1. Click the war-room picture to enter the bunker and play the opening.
2. Go to `[2] BANK → [M] MARKETS`, pick a market, `[R]` invest part of the wallet and `[Y]` buy a fuse.
3. Go to `[6] NETWORK → [1] LOCAL → [F]` (FUSE PANEL), `[I]` fit the fuse.
4. Press `[T]` and skip `+24h`. Read the return report: fuses lost, what the markets earned, what to do next.
5. Back at the market, `[C]` collect, then `[R]` reinvest or `[P]` pay out.
6. Close the tab, or leave it in the background, and come back later. Both are billed the same way.

## Your approved rule (A)

Clocks are never bought with coin. You buy a fuse at a market vendor and fit it where one blew, as in BioSys.

- A fitted fuse raises that system one level. The time left keeps the same share of the bigger level. Example: AIR at 2/4 with half its time left (12h) becomes 3/4 with half of 48h (24h).
- Fitting the fourth fuse stops the drain. The spent reserve then refills over 24 hours (the existing `FULL_CAPACITY_REFILL_S`).
- Each fit uses one held fuse, once. Coin, investing, moving fuses, reloading, changing screens and repeated taps never add time.

## Proposals switched on for the play-test

Each of these is a labelled proposal for you to approve, change or reject. They all sit in one place: `SA_RENEW` in `index.html` (search for `RENEWABLE_CLOCKS_SETTINGS_V1`).

| Setting | Proposal | Before | Why |
|---|---|---|---|
| `EARN_PER_DAY` | Each market earns 22% a day of what is invested in it, in its own currency | Instant +15% on every reinvest and 100% back on cash-out | Closes the instant profit loop (audit F3). Earnings build up on real time, AdVenture Communist style |
| `SHOP_STOCK` | 32 fuses for sale, shared by every vendor, never refilled | 24 | Lets a diligent player reach about 35 days, as in your notes |
| `PRICE_UNITS` | First fuse: 100 USD = 100 XRP = 20 GEARS = 10 BTC = 1 ETH | 100 of any currency | BTC and ETH could never reach 100, so two vendors could never sell (audit F6) |
| `STARTER_GRANT` | 25 BTC, 250 XRP, 250 USD, 2.5 ETH, 50 GEARS | 50 BTC, 500 XRP, 500 USD, 5 ETH, 100 GEARS | Halved because all five currencies now buy fuses; the old grant made a casual player as safe as a diligent one |

Unchanged, and still unapproved placeholders from Local Economy v1: the base price of 100 and the shared price rise (each fuse sold makes the next one 8% dearer at every vendor). All locked rules are unchanged.

**How earnings work:**

- A market earns on wall-clock time: live, with the tab closed, with the tab hidden and in the dev time-skip. Away time is not slowed to 0.35×; that only applies to life support.
- Nothing is earned while Single Player has the bunker frozen.
- `[C] COLLECT` asks the question from your 27 July note: `[R] REINVEST` adds the earnings to the investment so it earns more; `[P] PAYOUT` puts them in your wallet to buy fuses.
- Money you invest stays invested. Only earnings come out.
- Collecting straight after investing gives nothing, so tapping can't make money.

## Fixes (no new numbers)

- **F1, door choice saved.** An Idle run stays Idle after a reload. `[5] PROCEED` is no longer offered, so a reload can't be used to take the Single Player door and pause the bunker for free. Single Player runs keep their route back.
- **F2, hidden tab = closed tab.** A tab left in the background stops its live clock. When you come back after 20 seconds or more, the time is billed exactly like a closed tab (0.35× for the first 12 h) and you get the return report. A shorter hide is billed live at full rate, so tab-flicking gains nothing. Hiding the tab never pauses the opening assassination hunt.
- **F14, real time left.** Every countdown now shows real time to failure, including the effect of weak POWER. At POWER 3/4 a clock that fails in 8 h says 8 h (it used to say 12 h).
- **F13.** The POWER row reads `x1.0 life support`, because POWER changes the life-support clocks only.
- **F10.** Bank prompts read `BANK [V / M / B]`.
- **F7.** The Bank ledger says `Old-world ledger. Money for fuses is in [M] NEW MARKETS.`
- **Sabotage share.** When DEFENSE changes level, sabotage progress keeps its share of the interval. Example: 30 h of the 48 h at 3/4, then decay drops DEFENSE to 2/4, gives 15 h of the 24 h. The next sabotage comes 9 h later instead of instantly. The sabotage rates themselves are unchanged.
- **COMMS in the return report.** The report now hides countdowns that COMMS isn't watching (`NO SIGNAL`), like the FUSE PANEL. It used to print every countdown.
- **Survival time.** The return report header shows `DAY N`. The death mail says `APEX ECHO kept the bunker alive for X days, Y hours.` Frozen time doesn't count.

## Runway model

The model runs the real game code from this branch and scripts only the player's choices. Each line is the median of 10 random seeds (range in brackets).

| Player | Real offline rules | Every hour at full rate (harsh) |
|---|---|---|
| Never buys, only moves fuses | 6 days (5–6.3) | 3.3 days |
| Spends the starting wallet, never invests | 10 days (9–12) | 9.3 days |
| Invests once, checks in daily (casual) | 22 days (20–24) | 20.6 days |
| Invests once, checks in twice a day | 25 days (23.5–28.5) | 22.3 days |
| Every 6 h, reinvests the surplus (diligent) | 37.3 days (35.8–37.8); stock sold out about day 32 | 34.4 days |

- Your notes target about 20 days for casual play and up to about 35 for diligent play. The proposals land there.
- Earnings rate sensitivity (real rules, casual / diligent): 15% gives 14 / 16.5 days, 20% gives 21 / 26, 25% gives 25 / 37.3. 22% with a 24-fuse stock gives 22 / 29.3.
- All runs end through WATER or THERMAL, because the scripted player keeps AIR and DEFENSE full by moving fuses.

## Dev time-skip

The time-skip appears on local copies (`file://`, `localhost`, `127.0.0.1`) and on the raw.githack.com play-test link only.

- On the FUSE PANEL, press `[T]`: `[1] +10m  [2] +1h  [3] +8h  [4] +24h  [5] +3d`, and `[P]` for starting fuses (SECURE, TYPICAL, FRAGILE or ALL FULL).
- A skip saves the run, back-dates the save as if the tab had been closed that long, and reopens the bunker through the normal return path, so it uses the locked rules: AIR, WATER and THERMAL at 0.35× for the first 12 h then 1.0×, decay and sabotage at full rate, gaps under 20 s ignored. Markets earn for the skipped time.
- You see the real report, then a before → after block. An absence that would kill the run shows the real death screen and clears the save.
- A skip during Single Player adds no time.

To run it locally instead:

```
git clone https://github.com/StartAgainDev/start-again.git
cd start-again
git checkout feat/renewable-clocks-phase2
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## Part 1 summary (commit e0d9942)

- **FUSE PANEL `[I] FIT A SPARE`** lists every system with a preview (for example `AIR 2/4 → 3/4  21h 32m → 1d 19h left`). Previews respect COMMS. The fit is saved straight away.
- **Market `[I] FIT`** uses the same fit and numbering as the FUSE PANEL.
- **Return report** lists each fuse lost while away with its cause and time, spares held, market stock, which currencies can pay, how to replace a fuse and the soonest failure you can see.
- **Fuse ledger (audit F5):** the 24 fuses in the grid are counted, so stock + held + fitted + destroyed always adds up. Older saves are migrated on load.

## Tests

- `npm test` runs 7 suites with 134 checks. All pass.
  - `tests/renewable_clocks_phase2.cjs` (19): rule A, the return report, the ledger and the time-skip.
  - `tests/playtest_balance_v1.cjs` (19): no instant profit; live, closed-tab and skipped time earn the same; nothing earned while frozen; collect and payout; earnings survive a reload; every currency can buy; 32 in stock; F1; F2 (8-hour hide, short hide, hunt); the sabotage share; the day count; the report's market and COMMS lines.
- **Browser check** (Chromium, desktop 1280 px and phone 390 px): the return report, investing, buying, fitting, a +24h skip with earnings, collect and payout, a 25-second hidden tab, the markets list and the death mail. No page errors and no text running off the screen.

## Rollback

- Tag `rollback/pre-phase2-bf05324` marks `main` before this work (`bf05324`).
- To roll back: don't merge the branch, revert the merge commit, or reset a branch to the tag.
- The live site is unchanged.
