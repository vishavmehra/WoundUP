# Wound Up — World Simulation Specification

**Project:** Wound Up
**Label:** G1 Living Tockton. **Labelled future design: proposal. Not built before the competition build is delivered.** The competition build (G0) has only the wake state described in section 2. Read the scope firewall in [DECISIONS.md ADR-028](DECISIONS.md) first.
**Status:** Design proposal. Nothing in this file is an implementation requirement for G0.
**Date:** 2026-11-06
**Source:** [directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) Part 2 pillar A, Part 10 (Generation 1), Part 11 (modules "World simulation" and "Persistence")
**Related:** [SIMULATION_SPEC.md](SIMULATION_SPEC.md) §13, [GAMEPLAY_SYSTEMS.md](GAMEPLAY_SYSTEMS.md) §14, [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §6.3 and §11, [DATA_AND_BLUEPRINT_SPEC.md](DATA_AND_BLUEPRINT_SPEC.md) §5, §10 and §13, [SAVE_PERSISTENCE_SPEC.md](SAVE_PERSISTENCE_SPEC.md), [MASTER_SYSTEM_ARCHITECTURE.md](MASTER_SYSTEM_ARCHITECTURE.md), [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md), [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md), `RESIDENT_BEHAVIOUR_SPEC.md` and `STORY_AND_QUEST_ENGINE.md` (separate G1 documents)

Citation key: SIM = SIMULATION_SPEC.md. DATA = DATA_AND_BLUEPRINT_SPEC.md. SAVE = SAVE_PERSISTENCE_SPEC.md. GS = GAMEPLAY_SYSTEMS.md. PS = PRODUCT_SPEC.md.

## 1. Scope and labels

| Item | Label |
|---|---|
| A plot changes from frozen to awake when its machine is placed; the wake ripple; the Windmill also wakes the Bakery | G0-required (PS §11; SIM §13; GS §14) |
| Day/night toggle | G0-optional, among the first cut (CLAUDE.md §2; ADR-027). A setting, not a simulation |
| Building dependencies, production chains, town events, persistent world simulation, a resident hook | G1 Living Tockton: **proposal** |
| Resident behaviour | G1, in `RESIDENT_BEHAVIOUR_SPEC.md`. Only the boundary is set here (section 4.7) |
| Weekly commissions, seasons and festivals, XP, ranks, currency, AI or LLM gameplay, networked simulation | Excluded from the competition build (CLAUDE.md §14). Not designed here |

This document describes how the existing wake mechanism generalises. It invents no building, resource or event for Tockton. The only production link any specification contains is the Windmill and the Bakery (PS §6.3).

## 2. What G0 provides

| Fact | Source |
|---|---|
| Each machine wakes its own plot. The Windmill also wakes the Bakery. | PS §11 |
| A plot is frozen (desaturated, cool, static) or awake (full colour, lights, motion, sound). The wake ripple lasts about 1.5 seconds and must not obscure the miniature world. | GS §14; SIM §12 |
| A completed machine emits `MachineCompletedEvent { machineInstanceId, blueprintId, plotId }`. The town system updates the plot state, triggers the wake effect, activates connected building behaviour, updates progression and saves. The simulation controller must not edit town progression. | SIM §13 |
| A blueprint lists `wakes: string[]`, the plots it wakes. The validator checks the plot ids. | DATA §5, §13 |
| Bakery behaviour when the Windmill runs: chimney smoke, baker kneading, oven glow. | PS §6.3; SIM §10.3 |
| Presentation behaviours are typed handlers mapped from identifiers, never callbacks stored in JSON. | DATA §10 |
| The save stores each machine's `blueprintId`, built, placed and optional `plotId`. It stores no runtime objects and no solver results. The awake state of a plot follows from placement. | SAVE §3, §5 |
| Date-driven behaviour (the daily repair) is deterministic from the local date, with no backend. | ADR-027; SAVE §4.4 |
| Non-goals: realistic wind, fluid simulation, unbounded particles, networked or multiplayer simulation. | SIM §16 |

Which of the two `SaveV1` shapes applies (conflict I-11 in [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §7) is a lead decision. This document assumes only that placement records are saved and the awake state is derived from them.

## 3. Principles

Each is a G1 proposal that follows a G0 rule or an ADR.

1. **Derive state, save inputs.** Building and resource states are computed from saved facts and definitions. Only the facts are saved (SAVE §5).
2. **A pure function, not a loop.** The world is evaluated by a pure function when something changes. It is not stepped every frame (SIM §8; TECH §20).
3. **The mechanical engine stays the authority.** The world simulation reads a machine's status. It never recomputes mechanical validity (SIM §1, §3).
4. **Deterministic.** The same definitions, saved facts and injected date give the same result. No `Math.random`, no wall clock read inside the function. The ordering and arithmetic rules D1 to D3 of [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md) §4 apply.
5. **Data-driven and validated.** Definitions are plain data with stable ids and closed unions checked at load. An unknown value is a validation error (DATA §13).
6. **Independent of rendering.** The function is pure TypeScript and imports no Three.js or IWSDK (ADR-008 reasoning applied to the world layer).
7. **No network, no LLM.** The simulation is rule-based and offline (ADR-013; CLAUDE.md §14).
8. **Cheap.** It runs on events and takes well under the 2 ms per-system frame guidance (audit D §6.3). It adds no dynamic lights beyond the existing lighting rules (CLAUDE.md §8).

## 4. Model

### 4.1 Definitions (data, per world)

```ts
// PROPOSAL (G1). Not implemented. Plain data, serialisable, no engine objects.

type BuildingState = 'frozen' | 'awake' | 'running' | 'idle' | 'stalled';
// G0 has frozen and awake. G1 adds running (awake and producing), idle (awake, an input is missing),
// stalled (awake, its source machine is not running).

interface BuildingDefinition {
  id: string;
  plotId: string;
  requires?: Condition;                         // when the building may run
  produces?: { resource: string }[];
  consumes?: { resource: string }[];
}

type Condition =                                // closed union, validated at load
  | { kind: 'machine_running'; plotId: string }
  | { kind: 'resource_available'; resource: string }
  | { kind: 'building_state'; buildingId: string; state: BuildingState }
  | { kind: 'all'; of: Condition[] }
  | { kind: 'any'; of: Condition[] };
```

### 4.2 Dependency graph and the first link

Buildings and machines are nodes. A resource a node produces and another consumes is an edge. The graph must be acyclic. A cycle is rejected when the definitions load, like an invalid blueprint reference (DATA §13). Evaluation order is a topological order with ties broken by id.

The existing Windmill and Bakery link maps to it directly: the Windmill's machine is a producer of `flour` while its status is `runs`; the Bakery consumes `flour` and runs while it is available. The G0 `wakes` list stays valid and unchanged. In G1 it also reads as an edge from the machine's plot to each plot it names. **No other chain is defined by any specification.** What else Tockton contains is for the G1 content owner.

### 4.3 Steady state, not stock

The default model is **steady state**: a resource is available or not, as a function of upstream states. It is not an accumulating quantity. There are no ticks, no offline catch-up and no dependence on how long the player was away. Accumulating stock (for example bread counts) would need a clock and a catch-up rule. It is Research and is not designed here.

Open question (section 10): the G0 specs do not say whether a placed machine keeps running after its stored energy runs out. The saved record says only that it is placed. This document's default is that production follows placement and a fault-free status, with no winding upkeep. It adds no new interaction and matches what G0 saves. A maintenance loop would be a separate G1 design.

### 4.4 Town events

An event is data:

```ts
// PROPOSAL (G1).
interface TownEventDefinition {
  id: string;
  trigger:
    | { kind: 'machine_placed'; plotId: string }
    | { kind: 'plot_awakened'; plotId: string }
    | { kind: 'letter_completed'; letterId: string }
    | { kind: 'session_start' }
    | { kind: 'local_date_changed' };
  when?: Condition;
  effects: (
    | { kind: 'set_building_state'; buildingId: string; state: BuildingState }
    | { kind: 'play_cue'; cue: WorldCueId }
    | { kind: 'unlock_letter'; letterId: string }
    | { kind: 'unlock_blueprint'; blueprintId: string }
  )[];
  repeat: 'once' | 'daily';
}
```

Rules: events are evaluated in id order; effects apply after all triggers are matched; an effect never triggers another event inside the same evaluation (it can queue one for the next), so there are no loops. The trigger and effect unions are closed and validated. A `daily` event fires at most once per injected local date, like the daily repair (ADR-027). The event vocabulary above is a mechanism, not content. This document defines no particular event.

### 4.5 Output

```ts
// PROPOSAL (G1).
interface WorldSnapshot {
  buildings: Record<string, BuildingState>;     // keys inserted in sorted order
  resources: Record<string, boolean>;
  cues: WorldCue[];                             // typed, for presentation and audio
}
type WorldCue = { cue: 'wake_ripple'; plotId: string } | { cue: 'smoke_on'; buildingId: string }
  | { cue: 'oven_glow'; buildingId: string } | { cue: 'kneading'; buildingId: string } /* ... */;
```

The G0 effects (wake ripple, chimney smoke, oven glow, kneading) are the first cues. Keeping them as typed cues now means G1 changes no presentation contract: the town and audio layers map cue ids to handlers (DATA §10). The function never touches the scene.

### 4.6 Persistence

A per-world save record keeps only inputs: placement records (as in G0), the ids and dates of fired events, and any G1 flags. Building and resource states are derived on load and never saved. This needs `SaveV2` with a per-world record ([WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) §7) and an explicit migration (SAVE §10). A `SaveV1` file still loads and is migrated, not reinterpreted.

### 4.7 Boundary with resident behaviour

`RESIDENT_BEHAVIOUR_SPEC.md` reads `WorldSnapshot` (for example the baker works while the Bakery is `running`). In the baseline, residents do not change building or resource state, so gameplay-critical state has one writer. A resident-driven change, if a future design wants one, goes through a named effect in an event.

## 5. Interaction with the mechanical engine

- The world function takes each machine's status from gameplay state, which got it from the solver. It never calls the solver (SIM §1).
- With [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md), a fault upstream gives the machine a non-`runs` status, and the dependent building becomes `stalled` through the same condition. No new coupling is needed.
- A machine that jams or is incomplete never produces (SIM §7).

## 6. Performance

- Evaluation runs when a machine is placed, a status changes, a letter completes or a session starts. Never per frame.
- The graph has as many nodes as the world has buildings and machines, which in Tockton is single digits (four machine plots, a Bakery, a theatre facade; PS §3.3).
- Cues use the existing effect budgets: limited particles, no expensive systems, no extra dynamic lights (SIM §12, §14).
- Awake lighting is emissive surfaces and the existing night allowance, not new point lights (CLAUDE.md §8).

## 7. Tests (proposal)

All run in Vitest in node (TECH §21.1).

| Test | Checks |
|---|---|
| Definition validation | Unknown plot, building, resource, event or cue id is rejected. A cycle is rejected. A union with an unknown `kind` is rejected. |
| G0 equivalence | A definition set of the four plots and the `wakes` list evaluates to exactly the G0 behaviour: placement wakes its plot; Windmill running wakes the Bakery; the wake event fires once per placement (SIM §15 tests 9 and 10). |
| Chain | Windmill `runs`: Bakery `running`. Windmill `jams`: Bakery `stalled` (G1 state). |
| Determinism | Permuting the order of definitions gives the same snapshot and the same serialised bytes. |
| Events | Id-order evaluation; `once` never repeats; `daily` fires once per injected date; an effect cannot trigger an event in the same evaluation. |
| Save | Placement and fired-event records round-trip. Derived states are absent from the save. A `SaveV1` file migrates. |

Nothing here is Desktop, IWER or Quest verified: it is not built.

## 8. What G0 must keep open

All already follow from G0 specs. See [MASTER_SYSTEM_ARCHITECTURE.md](MASTER_SYSTEM_ARCHITECTURE.md) §7.

1. Plot ids and machine ids are stable (seam 1).
2. Completion and placement are typed events consumed by the town (seam 5).
3. The wake state is derived from placement and the `wakes` list (seam 6).
4. Wake presentation (ripple, smoke, oven glow, kneading) is selected by identifier through typed handlers, not hard-coded to a machine (DATA §10).
5. Anything that depends on the date receives it as an argument (seam 11).

## 9. Out of scope

Resident AI and pathfinding; seasons, festivals and weekly commissions (CLAUDE.md §14); any currency, XP or ranking; simulation between sessions; multiplayer or synchronised simulation; fluid, weather or wind models; cross-world effects (those belong to `CROSS_WORLD_GAMEPLAY.md`, G5).

## 10. Open points

| Point | Owner |
|---|---|
| Does a placed machine keep running? G0 specs are silent. Default in section 4.3. | G1 design owner |
| What buildings, resources and events does Tockton have beyond the Windmill and Bakery? None is specified. | G1 content owner |
| Is accumulation (stock) wanted? It needs a clock and a catch-up rule. | Research |
| `SaveV2` shape and the ADR that records it (ADR "G", [audit A](audits/A_DOCUMENTATION.md) §4.2) | Lead |
| `SaveV1` shape conflict (I-11) | Lead, before G0 save/load is built |

## 11. Acceptance criteria

1. The document is labelled G1 and proposal, and states what G0 contains in section 2 with sources.
2. No building, resource or event is invented beyond the Windmill and Bakery link.
3. Every mechanism is deterministic, event-driven, data-driven and independent of rendering.
4. G0 behaviour is reproduced exactly by a G0-only definition set (section 7, G0 equivalence).
5. Derived state is never saved, and the save proposal names `SaveV2`.
6. Nothing in CLAUDE.md §14 is specified as a requirement.
