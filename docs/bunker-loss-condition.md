# Bunker Layer — Loss Condition (canonical)

`BUNKER_LOSS_CONDITION_V1`

## The rule

> **Idle door loss condition: death by life-support failure, which severs terminal access. Conquest and overthrow are resolved at the district and World Ring tiers.**

Use that sentence verbatim in any tooltip, onboarding line, or doc that needs to state the condition.

## Tier separation

| Tier | Win | Lose |
|---|---|---|
| Bunker / Idle door (Site AZTEC) | none — only continued survival | death by life-support failure (AIR/WATER/THERMAL to 0, or DEFENSE breach at 0/4) |
| District | take the four national districts | district losses |
| World Ring | unify the six nations before the biome clock | biome collapse / loss of last territory |

The bunker has **no win condition**. Staying alive is not winning; it is the precondition for playing the tier above. Death severs the terminal link and the nation runs unattended.

## The national terminal is a view

From the bunker's perspective the national terminal is a **passive display** of what the nation is doing. The bunker layer contains no defend, overthrow, or combat interaction against it, and none may be added. Losing the terminal is never a combat outcome — it is a consequence of dying.

Note the tier boundary: the Presidential Command panel is the district tier's own surface and legitimately launches district battles (`SP_BATTLE_AUTOSTART_V1`, `?battle=1`, `__reportBattleResult`). That combat is district-tier and stays. What is forbidden is combat *in the bunker layer* or combat *over the terminal itself*.

## One-way separation (enforced)

The fuse economy (AIR / WATER / THERMAL / DEFENSE / POWER / COMMS) is a self-contained module. It must not read from or write to district or World Ring state, and they must not touch it.

- Ring chip decay, biome collapse, and district losses **must never** blow a bunker fuse.
- Bunker fuses **must never** produce Ring chips. Fuses are bought and consumed; chips are inherited and conserved. Keep the vocabulary split hard.
- The only permitted crossing is **information and launch**: the terminal displays national state, and the nation-select bridge assigns the human faction when the district game starts. No resource, timer, or health value crosses in either direction.

## Verification

Audited on the v8.89 build:

- No `overthrow` or `terminal battle` strings exist anywhere in the codebase.
- No `G.`, `TERRITORIES`, `RING_ECON`, biome, district, or chip **state** reads occur inside the fuse module (lines ~30400–31035). Matches in that range are lore text only.
- No code outside the terminal IIFE reads or writes `FUSE`, `bunkerLive`, or `commsWatch`.
- Remaining `conquer`/`conquest` matches are district/Ring/Bank-tier and are correct in place.
