# Renewable clocks, Phase 2 (play-test build)

Development build only (`v8.90-dev`, branch `feat/renewable-clocks-phase2`, draft PR #8). Nothing here is live. The public site stays on `release/terminal-pacing-2026-10-03` at `18e4ffa` until you say yes.

Part 1 (commit `e0d9942`) added the approved refresh rule A, the return report, the fuse ledger fix and the dev time-skip. Part 2 makes the build fair and fun to play-test: markets earn over time, every currency can buy fuses, and the known loopholes from the Phase 1 audit are closed. Part 3 turns the Bank into one board you can click or tap, and makes every menu option clickable. Part 4 makes that board live: earnings count up in real time, each market shows a meter and countdown to its next fuse, and the soonest failure counts down.

## Play-test link

The play-test link serves this branch straight from GitHub through raw.githack.com. It is unlisted, not private: anyone with the link can play it. The PR description has a link pinned to the exact commit. This one always follows the branch, a few minutes behind:

`https://raw.githack.com/StartAgainDev/start-again/feat/renewable-clocks-phase2/index.html`

- The first time you open it, raw.githack.com shows its own "One more step" notice (with an advert). Click **Open the page**. It remembers that for this repo for 24 hours, then asks again. Your save is not affected.
- Saves are kept in your browser for raw.githack.com, separately from the public site.
- The dev time-skip `[T]` shows on this link and on local copies. It never shows on start-again.pplx.app.

**A quick test run** (click or tap everything; typing the keys still works):

1. Click the war-room picture to enter the bunker and play the opening.
2. Open `[2] BANK`. Every market is on one board. Pick 25%, 50% or ALL, then INVEST on a market. Its `ready` number starts counting up and its FUSE countdown starts ticking.
3. BUY FUSE on a market, then pick the system to fit it into, or KEEP AS SPARE.
4. Go to `[6] NETWORK → [1] LOCAL → [F]` (FUSE PANEL). Press `[T]` and skip `+24h`.
5. Read the return report, then `[M] BANK`. COLLECT ALL, then REINVEST ALL or PAY OUT ALL.
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

## Bank board and tapping (part 3)

You said the Bank felt like friction: a long ledger first, four screens deep, typed amounts, and the screen reprinting after every action. Part 3 rebuilds it the way AdVenture Capitalist and AdVenture Communist work. No game number changed.

**What changed:**

- `[2] BANK` opens on one board: your wallet, the fuse stock and all five markets. Each market shows what is invested, what is ready to collect and the fuse price, with COLLECT, INVEST and BUY FUSE buttons. The numbers update while it is open.
- COLLECT still asks REINVEST or PAY OUT (your 27 July rule), on the same row. COLLECT ALL asks once for every market.
- One INVEST toggle (25% / 50% / ALL) sets how much every INVEST button moves, so there is nothing to type.
- BUY FUSE opens the fit picker straight away, with the same before/after preview as the FUSE PANEL, or KEEP AS SPARE.
- Every menu option on every screen can be clicked or tapped. The keys still work. On the board: `1-5` open a market's full screen, `A` collect all, `F` fit, `V` vaults, `S` vault seeds, `L` the old ledger, `B` back.
- After the return report: `[M] BANK`, `[F] FUSE PANEL` or `[H] HUB MENU`. Enter alone still goes to the hub. The FUSE PANEL shortcut still asks for the bunker password if the bunker is locked.
- The full market screen redraws in place instead of stacking copies. Its INVEST prompt has 25% / 50% / ALL buttons beside the box.
- On a phone: buttons are at least 44 px tall, the keyboard doesn't pop up over the buttons, and the board fits the screen width.

**Why (what other games do):**

| Idea | Where it comes from |
|---|---|
| Every business on one screen, tap to collect | AdVenture Capitalist ([Wikipedia](https://en.wikipedia.org/wiki/AdVenture_Capitalist)); AdVenture Communist uses the same loop and layout ([Wanderer review](https://playwanderer.online/game-reviews/adventure-communist)) |
| One toggle sets how much each buy button buys | AdVenture Capitalist's buy multiplier: x1, x10, x100, Next, Max ([AdCap wiki](https://adventure-capitalist.fandom.com/wiki/Buy_Multiplier)) |
| Collect everything in one tap | Clash of Clans, since its May 2017 update ([Clash of Clans wiki](https://clashofclans.fandom.com/wiki/Elixir_Collector)) |
| The welcome-back screen points at what to do next | Idle-game design guidance ([gamedesign.gg](https://gamedesign.gg/articles/idle-and-incremental-game-design/)) |
| Routine actions take no more than two deliberate inputs | Idle-game UX guidance ([teemo.dev](https://teemo.dev/game-design/coop-idle/systems/ux-ui-and-accessibility-designing/)) |
| Tap targets at least 44 px | Apple's design tips ([Apple](https://developer.apple.com/design/tips/)); NN/g suggests about 1 cm square ([NN/g](https://www.nngroup.com/articles/touch-target-size/)) |

**Fairness kept:**

- Nothing on the board adds clock time. Opening it, leaving it, tapping and repeating change nothing. Only fitting a fuse helps a clock, and each fit uses one held fuse.
- A tap that starts while text is printing only finishes the text.
- A tap in the first 0.3 s after a new prompt is ignored, so a double-tap can't press the button that just appeared under your finger (for example COLLECT, then REINVEST in the same spot). Typing is never delayed.

**Two UI proposals** (in `SA_RENEW`, for you to approve; neither changes a balance number):

| Setting | Proposal | Why |
|---|---|---|
| `INVEST_STEPS` | 25% / 50% / ALL of the wallet in that market's currency; starts on 25% | Saves typing an amount, like AdVenture Capitalist's multiplier |
| `TAP_SETTLE_MS` | 300 ms | Stops accidental double-taps |

Technical detail: the board checks for changes once a second and only redraws when something changed, never while a finger or mouse button is down.

## Live board (part 4)

You asked for a real-time clock like the AdVenture games, so you can watch your investments move. While the Bank board is open, three things now move in real time:

- **Ready to collect counts up.** The cents you can collect are bright. A few dim digits after them keep moving when a small stake is too slow to move the cents, like the AdVenture Capitalist cash ticker.
- **Each market has a FUSE meter and countdown.** The meter fills with your wallet plus earnings in that currency, against today's fuse price. The countdown is the real time until you can afford the next fuse, for example `2d 00:26:03`. Instead of a countdown it can say `READY · buy it now` (the wallet covers it), `READY · pay out first` (wallet plus earnings cover it), `SOLD OUT` or `invest to earn one`.
- **The soonest failure you can see** sits under the FUSES line and counts down every second, for example `AIR in 01:08:36`. It follows COMMS: no sensor, no countdown.

To see it: open `[2] BANK` and INVEST on any market, then watch its `ready` number and countdown. Skip `+24h` with `[T]` on the FUSE PANEL and come back to see a day of earnings and the meter about half full.

**Why (what the AdVenture games do):**

| Idea | Where it comes from |
|---|---|
| Every business runs its own timer and pays when it runs out | AdVenture Capitalist: "Clicking on a business, starts a timer; when the timer runs out, it makes the listed amount of money." Cycles run from 0.6 s (Lemonade) to over 10 hours (Oil) ([AdCap wiki](https://adventure-capitalist.fandom.com/wiki/Businesses)). AdVenture Communist works the same way ([Steam discussion](https://steamcommunity.com/app/462930/discussions/0/135511655652082701/?l=czech)) |
| Show income per second once a bar is too fast to read | Players say cash per second is "only really useful when the bar moves so fast that you can't see the time" ([Steam discussion](https://steamcommunity.com/app/346900/discussions/0/618459405707832475/?l=czech)). Revenue per second is revenue per cycle divided by cycle time ([Frame Advance](https://frameadvance.net/games/adventure-capitalist/)) |
| Keep earning while away | AdCap managers "automatically start a profit cycle after one ends, even if the player is disconnected from the game" ([AdCap wiki](https://adventure-capitalist.fandom.com/wiki/Managers)) |
| Show the time to the next goal | "Players feel the interval, not the magnitude" ([gamedesign.gg](https://gamedesign.gg/articles/idle-and-incremental-game-design/)). The Cookie Clicker add-on CookieMaster shows the time left until things are affordable ([CookieMaster](https://github.com/greenc/CookieMaster)) |
| A balance that visibly grows every second | Aave's lending app: "Your balance grows every second" ([Aave](https://aave.com/app)) |

What I didn't copy: AdCap's lump payout at the end of each timer. Your markets earn smoothly under the 22% a day proposal, so a lump timer would be a new rule. The countdown to the next fuse gives the same "something is coming" feeling without a new number.

**Fairness kept:**

- The moving numbers are display only. The real tick still runs once a second, and the display never runs more than one second ahead of it.
- COLLECT, REINVEST, PAY OUT, the ALL buttons and FIT first bring the clock up to the moment you tap. You get exactly what the board shows, never more and never less.
- Nothing moves while Single Player has the bunker frozen, after death, or while the game is paused.
- Opening, leaving or watching the board adds no clock time.

**Fix: the live tick stopped after a reload with every system full.** If every system was full when you reloaded, the once-a-second tick didn't restart. Markets didn't earn and wear-out didn't count while the tab stayed open, and that time was never billed later. That broke the locked rule that obligations run at full rate. The tick now always restarts after a reload (`RESUME_ALWAYS_TICKS_V1`). No number changed.

**One UI proposal** (in `SA_RENEW`, for you to approve; not a balance number):

| Setting | Proposal | Why |
|---|---|---|
| `LIVE_DECIMALS_MAX` | 6 | The most decimal places the `ready` counter shows. Even a tiny stake visibly moves, and the cents always stay bright |

Technical detail: the moving numbers are driven by the browser's animation frame (`requestAnimationFrame`). Browsers pause it in a background tab ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)), so a hidden tab costs nothing, and rule F2 still bills that time when you come back. They only change text and bar widths. The board itself still redraws at most once a second, and only when a button or label changes, so a tap is never lost to a redraw.

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

- `npm test` runs 8 suites with 166 checks. All pass.
  - `tests/renewable_clocks_phase2.cjs` (19): rule A, the return report, the ledger and the time-skip.
  - `tests/playtest_balance_v1.cjs` (19): no instant profit; live, closed-tab and skipped time earn the same; nothing earned while frozen; collect and payout; earnings survive a reload; every currency can buy; 32 in stock; F1; F2 (8-hour hide, short hide, hunt); the sabotage share; the day count; the report's market and COMMS lines.
  - `tests/bank_board_v1.cjs` (32): tap-to-choose and the double-tap guard; the board (every market, the invest toggle, collect, collect all, buy and fit, keep as spare, prices you can't afford); a stale fit button can't fit a second fuse; taps and repeats add no clock time; the return shortcuts and the password gate. Part 4 adds: the live counter matches the next tick exactly and never runs more than 1 s ahead; how many digits it shows; a collect pays exactly what the board shows; the meter and countdown; the READY, pay out first, SOLD OUT and invest to earn one labels; the clock format; the failure line follows COMMS and counts down; nothing moves while frozen; moving numbers never redraw the board; a reload with every system full keeps the tick running.
  - Mutation check: undoing the reload fix, the settle-before-collect or the one-second limit each makes a test fail.
- **Browser check** (Chromium, desktop 1280 px and phone 390 px): the return report, investing, buying, fitting, a +24h skip with earnings, collect and payout, a 25-second hidden tab, the markets list and the death mail. No page errors and no text running off the screen.
- **Bank board browser check** (desktop with the mouse only, phone with touch taps): report → `[M] BANK` → 50% → INVEST → BUY FUSE → fit AIR → BACK → FUSE PANEL → `[T]` +24h → `[M] BANK` → COLLECT ALL → PAY OUT ALL, then the INVEST buttons on the full market screen. Buttons are at least 44 px tall on the phone, the keyboard stays down on choice screens, nothing runs off the screen, no page errors. Part 4: the `ready` counter rises within 1.6 s of investing, and the fuse countdown and the failure line tick every second, on desktop and phone.

## Rollback

- Tag `rollback/pre-phase2-bf05324` marks `main` before this work (`bf05324`).
- To roll back: don't merge the branch, revert the merge commit, or reset a branch to the tag.
- The live site is unchanged.
