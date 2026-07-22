# START AGAIN — The Civilisation Rebuild Board

A turn-based, post-collapse civilisation-rebuild strategy game. This repository holds the
canonical build of the digital playtester / play platform.

**Live app:** https://start-again.pplx.app/

## Current build

- **Version:** v8.89
- **Entry point:** `index.html`
- **Format:** single self-contained HTML file (all scripts, styles, and assets inlined —
  no build step required; just open `index.html` in a browser to play)

## Systems included (v8.89)

- **Claims & Siege** — faucet economy and Territory-card siege loop
- **World Ring conquest** — ring-gate ownership drives VP (`RING_GATES`, `bankControlsRing`,
  `bankCheckRingConquest`); lose a gate, lose the VP
- **Single-player nation mode** — same game with nation-themed factions
  (USA / China / Europe / UK / Russia / Japan) and a campaign-shaping doctrine choice
- **Phase I → Phase II ("conquest")** endgame with Victory Track
- **Bank system** — Phase-2 shares, land, loans, VP pressure
- **Superweapons** — Nuke, Satellite, VP Miner
- **Council & Diplomacy**, **Bunker / APEX ECHO** survival layer
- **Milestones**, **Remnant March**, **State of the World (SOTW)** deck
- **Science Hand**, **Occupying Forces**, **Zone of Control**

## Running locally

Open `index.html` in any modern browser. No server or dependencies needed.

## Versioning notes

The prior playtester snapshots topped out at v7.7 ("Digital Playtester" title). This build
(v8.89, "The Civilisation Rebuild Board") supersedes them and is the authoritative source.
