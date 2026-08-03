# START AGAIN — The Civilisation Rebuild Board

A turn-based, post-collapse civilisation-rebuild strategy game. This repository holds the
canonical build of the digital playtester / play platform.

**Live app:**  
https://start-again.pplx.app/

## Current build

**Version:**  
v8.89

**Entry point:**  
`index.html`

**Format:**  
Single self-contained HTML file (all scripts, styles, and assets inlined — no build step
required; just open `index.html` in a browser to play).

## Systems included (v8.89)

- **Claims & Siege** — faucet economy and Territory-card siege loop.
- **World Ring conquest** — ring-gate ownership drives VP (`RING_GATES`,
  `bankControlsRing`, `bankCheckRingConquest`); lose a gate, lose the VP.
- **Single-player nation mode** — same game with nation-themed factions
  (USA / China / Europe / UK / Russia / Japan) and a campaign-shaping doctrine choice.
- **Phase I → Phase II ("conquest")** — endgame with Victory Track.
- **Bank system** — Phase-2 shares, land, loans, VP pressure.
- **Superweapons** — Nuke, Satellite, VP Miner.
- **Council & Diplomacy**.
- **Bunker / APEX ECHO survival layer** — the Idle door at Site AZTEC. Pure survival:
  its only loss condition is death by life-support failure, which severs terminal
  access. It has no win condition of its own. Conquest and overthrow are resolved at
  the district and World Ring tiers, never here — see
  [`docs/bunker-loss-condition.md`](docs/bunker-loss-condition.md).
- **Milestones**, **Remnant March**, **State of the World (SOTW)** deck.
- **Science Hand**, **Occupying Forces**, **Zone of Control**.

## Running locally

Open `index.html` in any modern browser.  
No server or dependencies needed.

## Versioning notes

The prior playtester snapshots topped out at v7.7 ("Digital Playtester" title).  
This build (v8.89, "The Civilisation Rebuild Board") supersedes them and is the authoritative source.

## Roadmap / Next steps

### v8.9x focus

- Refine turn flow, clarity, and pacing across all phases.
- Continue balance work on Claims & Siege, World Ring control, bank pressure, and victory pacing.
- Improve UX readability for key systems, board state, and player decision points.
- Expand and stabilize diplomacy, council, survival, and science-hand interactions.
- Clean up edge cases, rule consistency, and in-game messaging.

### v9.0 goals

- Establish a more complete and polished core ruleset for the Civilisation Rebuild Board.
- Improve AI/opponent behaviour and solo-play scaffolding.
- Separate major systems more cleanly for easier iteration and maintenance.
- Expand documentation for mechanics, setup, phases, and faction/nation play.
- Move toward a more robust long-term digital playtesting platform.
