# Tiny Yurts Gameplay Guardrails

Purpose: prevent AI edits from breaking core gameplay behavior.

These rules are mandatory unless the user explicitly asks to change them.

## Core Gameplay Contract

### 1) Game loop and state flow must remain
- Boot -> Menu -> Play state flow must work.
- Main updates in `Play` state must continue to run:
  - `handleInput(game)`
  - `spawnBySchedule()`
  - `updateFarmDemand(dt)`
  - `updateVillagers(game, dt)`
  - time/day progression and HUD update
- `Space` toggles pause/play.
- `S` saves the game.

Authoritative files:
- `src/core/Game.ts`
- `src/systems/inputSystem.ts`
- `src/ui/hud.ts`

### 2) Player-drawn path network is core gameplay
- Left-drag creates path edges one tile step at a time.
- Right mouse button erases edges touching the hovered tile.
- Path edges must remain adjacency-based (local grid neighbors).
- Villagers must use the path network for routing (`findPathOnNetwork`).

Authoritative files:
- `src/systems/inputSystem.ts`
- `src/systems/pathNetwork.ts`
- `src/systems/taskSystem.ts`

### 3) Service loop must remain intact
- Villagers are assigned only when:
  - villager is `idle`
  - villager `destinationType` matches farm `destination`
  - a valid network route exists
- Villager task lifecycle must remain:
  - `idle` -> `toFarm` -> `atFarm` -> `toHome` -> `idle`
- On farm arrival:
  - one farm issue is consumed
  - `servedTrips` increments
  - villager waits, then returns home by route
- If no valid return/home/farm route, fallback to stable idle behavior (no crashes/NaN positions).

Authoritative file:
- `src/systems/taskSystem.ts`

### 4) Farm demand simulation must remain
- Farms hold animals with independent demand timers.
- Animal demand converts to farm issues (`numIssues`) and farm demand score.
- `demand = numIssues * needyness`.
- Serving a farm issue resets one animal demand timer.

Authoritative file:
- `src/core/Game.ts` (`updateFarmDemand`, `consumeFarmIssue`, animal timer helpers)

### 5) Auto growth/spawn schedule is core progression
- Scheduled spawning/upgrading for farms and yurts must remain active.
- Destination ecosystem types remain: `ox`, `goat`, `fish`.
- Yurts spawn villagers (2 residents per yurt target), and save restore keeps this invariant.

Authoritative file:
- `src/core/Game.ts` (`spawnBySchedule`, spawn helpers, `ensureTwoVillagersPerYurt`)

### 6) Save/load compatibility must remain
- Snapshot includes buildings, villagers, paths, seed, servedTrips, updateCount, and time/day.
- Loading old-compatible saves must backfill structure sizes and farm demand state safely.
- Save key remains stable unless user asks for migration/versioning changes.

Authoritative files:
- `src/core/Game.ts`
- `src/systems/saveSystem.ts`
- `src/core/config.ts` (`SAVE_KEY`)

## Protected Data Model
- Building roles: `yurt` and `farm`.
- Destination types: `ox`, `goat`, `fish`.
- Villager tasks: `idle`, `toFarm`, `atFarm`, `toHome`.

Authoritative files:
- `src/entities/Building.ts`
- `src/entities/Villager.ts`

## Minimum Regression Checks After Gameplay Changes
- `src/tests/smoke.test.ts`: game boots and enters `Play`.
- `src/tests/pathfinding.test.ts`: route finds around blockers.
- `src/tests/economy.test.ts`: villager remains idle without path, starts service when path exists.

If behavior changes intentionally, update tests in the same change.

## Change Control Rules for AI Agents
1. Do not delete/disable the path-drawing loop, villager task loop, spawn schedule, or farm demand logic without explicit user approval.
2. Do not replace core loops with placeholders/stubs.
3. Do not rename/remove core task states or destination types unless user requested.
4. If a request is unclear and could alter core gameplay, ask a clarifying question before editing.
5. Prefer additive changes over destructive rewrites in protected systems.

## What Requires Explicit User Approval First
- Removing or bypassing villager service logic.
- Removing farm demand timers/issues.
- Removing path-drawn routing.
- Disabling automatic yurt/farm spawning and upgrades.
- Breaking save compatibility or changing `SAVE_KEY`.

