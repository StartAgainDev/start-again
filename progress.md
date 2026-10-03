Original prompt: do the next highest value tasks on start again game: use this research and expand if you need too:

# Start Again integrity release work

## Scope

- Isolate the existing integrity patch at `aeadb08` from Local Economy and Home.
- Validate the research against the canonical repository and the public build.
- Add adversarial regression checks before promoting the release candidate.
- Preserve the current presentation, rules, assets, and district/World Ring separation.
- Do not publish to production or change `main` without release-scope approval.

## Baseline

- Public `index.html` SHA-256 matches repository commit `492266c`.
- Isolated integrity suite: 7/7 passing.
- Current main Local Economy suite: 19/19 passing.
- Current main Home suite: 12/12 passing.
- Existing preview selected: `ee4198cf-ed10-46d1-8bac-07953760cb65`.

## QA inventory

| Claim / control | Functional check | Visible evidence |
|---|---|---|
| Fresh bunker run | Enter terminal, resolve defense, enter AZTEC key, open panel | Desktop panel with command input |
| MOVE | Move a fuse away and back, including 4/4 boundary | Fuse counts and remaining time |
| Stale MOVE source | Lose selected fuse before destination is entered | Refusal without creating a fuse |
| Bounded action pause | Hold MOVE beyond 30 seconds and inspect consecutive ticks | Countdown resumes at normal speed |
| AIM | Toggle sensor and return | Watched channel matches allocation |
| Offline resume | Leave, resume, verify elapsed time charged once | Resume report and accessible panel |
| Emergency resume | Return near failure with weak POWER | Input visible before countdown resumes |
| Death / new run | Die, reload, check absent save; start a genuinely new run | Death overlay and fresh-run entry |
| Layout | Desktop 1440x900 and mobile 375x812 | No new clipping of terminal or input |
| Release isolation | No Local Economy or Home module markers | Static release check |

## Exploration

Add checks for repeated post-pause ticks, depletion of a selected source, transitions through 4/4, reload at 4/4, and the 12-hour offline rate boundary. These cases are not covered by the original seven tests.

## Implemented and verified

- Expanded the integrity suite from seven to 24 checks.
- Reproduced and fixed repeated post-pause charging (105 seconds charged instead of 10).
- Reproduced and fixed the 4/4 reset exploit (100 seconds became 172800).
- Reproduced and fixed depleted-source negative fuses and missing-source exceptions.
- Added exact event boundaries and ordered offline rest/full-rate replay.
- Fixed pre-door disconnect and the assassination/password-lockout save loopholes.
- Kept legacy saves readable and checked weak-POWER emergency thresholds.
- Fixed clipped mobile input and made the death acknowledgement a reachable button.
- Added dependency-free `npm test` and a read-only GitHub Actions regression workflow.

## Browser observations

- Fresh entry used actual terminal commands through defense, AZTEC gate, and assault.
- AIR rescue used actual MOVE commands; the 3/4 -> 4/4 -> 3/4 round trip did not increase reserves.
- Holding MOVE beyond its allowance resumed normal drain: the next one-second step charged exactly one second.
- AIM toggles moved coverage from WATER to THERMAL and survived a reload.
- A one-minute absence charged exactly 21 seconds of life-support time.
- Emergency resume opened an actionable fuse panel with 19.5 seconds of AIR left.
- Life-support death removed the save; reload opened a new operator-name prompt.
- At 375x812, the input's bounds were x=18..357, y=746..790, height=44.
- The death title, scrollable letter, and 44px acknowledgement button all fit at 375x812.
- No page-level JavaScript errors were observed in these flows.
- The required generic game client also ran; its canvas capture targets the board, so terminal signoff uses the dedicated viewport screenshots instead.

## Not claimed

- This is not a balance lock or certification of every board-game/district/World Ring interaction.
- Browser-local saves are not cloud or cross-device saves.
- Production publication, remote branch upload, and production verification remain gated on approval.

## Security follow-up

- Pre-publish review found a pre-existing cross-window result injection/spoofing path.
- Added expected-window/origin checks, per-launch battle IDs, fresh timestamps, escaped winner labels, and command-frame-only advisor messages.
- Added nine executable message-safety checks.
- Browser tests rejected unrelated senders and stale IDs, displayed attack markup as text without creating an image/SVG, and preserved valid popup, storage-poll, parent-relay, and advisor flows.
- Local developer/game-state controls remain intentionally available for single-player playtesting and are not an authentication boundary.
- Re-review caught a shared-storage consumption race; per-battle keys and active-frame registration now protect results from unrelated tabs.
- Browser check preserved an unrelated result while the matching active parent relay resolved its battle, with command-frame storage unavailable.
