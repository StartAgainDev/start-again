# Command panel embedding

`HOST_FRAME_POLICY_V1`, 3 October 2026. This release changes only how the game loads the Presidential Command panel. Battle outcomes, rewards, district rules, the World Ring, and Vance's dialogue are unchanged.

## Problem

The live host sends `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` on every page. The game loaded `presidential_command.html` into its command frame by URL, so browsers blocked the frame. After the arrival scene, Single Player showed an empty error frame instead of the command panel. Chromium reproduced this against start-again.pplx.app on both the August build and the integrity hotfix.

## Fix

- The game fetches the panel from its own origin and renders it through the frame's `srcdoc`. A `srcdoc` document is not a framed navigation, so the host's anti-framing headers do not block it, and it keeps the game's origin.
- If fetching is unavailable, for example when the file is opened from disk or the request fails, the game falls back to loading by URL. That still works wherever same-origin framing is allowed.
- Re-entering command reuses the loaded panel, so an open battle is not reset. A superseded response cannot replace the current panel.
- The parent bridge derives its expected origin from the logical panel URL (`data-command-src`) and relays results to `srcdoc`-loaded frames.
- Inside `srcdoc`, `location.origin` reads `null` and the referrer is empty. The panel now resolves its parent origin from the referrer, then the document's real origin. Without this, the parent relay would reject every result.

All sender, battle-ID, timestamp, and escaping checks are unchanged.

## Validation

- `npm test` adds eight loader checks and two parent-origin checks.
- Chromium served the candidate under production's URL and headers. The real nation-select and ENTER THE VAULT route reached the panel with no framing violations or page errors.
- Vance opened from the panel.
- A district resolved through each transport on its own: direct opener message, shared-storage poll, and parent relay. A stale battle ID was ignored, and winner markup rendered as text.
- A battle reported through the game's real `__reportBattleResult()` hook resolved its district.
