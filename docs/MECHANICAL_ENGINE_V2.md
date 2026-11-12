# Wound Up — Mechanical Engine V2

**Project:** Wound Up
**Label:** G2 Advanced engineering. **Proposal. Not built before the competition build is delivered.** The competition build (G0) uses [MECHANICAL_SOLVER_SPEC.md](MECHANICAL_SOLVER_SPEC.md) and [SIMULATION_SPEC.md](SIMULATION_SPEC.md) unchanged. Read the scope firewall in [DECISIONS.md ADR-028](DECISIONS.md) first.
**Status:** Design proposal. The ADR that would accept it ("H" in [audit A](audits/A_DOCUMENTATION.md) §4.2) is not recorded. Until it is, nothing here is an implementation requirement.
**Date:** 2026-11-06
**Source:** [directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) Part 2 pillar B, Part 10 (Generation 2), Part 11; world-by-world production strategy ("the mechanical engine must support extensions")
**Related:** [MASTER_SYSTEM_ARCHITECTURE.md](MASTER_SYSTEM_ARCHITECTURE.md), [DATA_AND_BLUEPRINT_SPEC.md](DATA_AND_BLUEPRINT_SPEC.md), [SAVE_PERSISTENCE_SPEC.md](SAVE_PERSISTENCE_SPEC.md), [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md), [IDEAS.md](IDEAS.md) §4.3, ADR-008, ADR-009, REJ-001

Citation key: SOLVER = MECHANICAL_SOLVER_SPEC.md. SIM = SIMULATION_SPEC.md. DATA = DATA_AND_BLUEPRINT_SPEC.md. SAVE = SAVE_PERSISTENCE_SPEC.md. TECH = TECHNICAL_ARCHITECTURE.md. A = [audits/A_DOCUMENTATION.md](audits/A_DOCUMENTATION.md).

## 1. Scope

The directive's Generation 2 asks for multi-stage transmissions, energy distribution, timing systems, mechanical diagnosis, fault propagation, simulation preview and advanced machinery (Part 10). This document says how the G0 solver grows to cover the first six without breaking the three properties G0 depends on:

1. **Determinism.** The same input gives the same result (SOLVER §2, TECH §10.4).
2. **Format stability.** Saves, gift links and shipped blueprints keep working (DATA §16, SAVE §10).
3. **No physics engine.** The engine stays a deterministic graph with authored motion profiles (ADR-008, ADR-009, REJ-001).

"Advanced machinery" means new machines built on this engine. They need their own design and are not covered here. Player-designed machines and the blueprint editor are G3 ([MASTER_SYSTEM_ARCHITECTURE.md](MASTER_SYSTEM_ARCHITECTURE.md) §6). Machine and world content that uses these features is out of scope.

## 2. What G0 provides and freezes

Everything below is already specified and is not changed by V2.

| Item | G0 definition |
|---|---|
| Edge types | Five: shaft, mesh, belt, pin, trigger (SOLVER §7, §8; DATA §7) |
| Statuses | Four: `runs`, `runs_wrong`, `jams`, `incomplete`, in the precedence of SOLVER §14 |
| Rotation rules | Shaft equal speed; mesh `ω_b = −ω_a · N_a / N_b` with a module check; belt `ω_b = ω_a · r_a / r_b` with an authored direction (SOLVER §8) |
| Loop test | A node reached by two paths whose speeds differ by more than 1 percent (relative, with a documented epsilon) is a jam (SOLVER §10) |
| Energy | `E = W · E_u`, `T = E / D`, at most 8 wind units, worn spring about 15 percent of normal energy (SOLVER §12) |
| Targets | Music Box cylinder 0.4 rad/s ±10 percent, Carousel platform 0.5 rad/s ±10 percent, Windmill millstone 0.6 rad/s ±15 percent (SOLVER §15). Clock Tower targets are undefined and are not invented here |
| Output | `SolveResult`: status, `angularVelocity`, `followerPose`, `runSeconds`, `jamAt`, `wrongTargets` (SOLVER §6). Extra diagnostics are typed fields, not strings |
| Consumption | The simulation controller animates with `θ ← θ + ω·Δt` from the solver's speeds and never decides validity (SIM §3, §7, §9) |
| Properties | Pure TypeScript, no Three.js, IWSDK, DOM or frame timing, run on change only (SOLVER §2, §18) |

## 3. Compatibility rules

These rules make V2 safe to add later. The first three bind G0 code today because each is already in a G0 spec.

| # | Rule | G0 source |
|---|---|---|
| C1 | Blueprints, saves and gift payloads carry a version. An unknown or newer version fails safely and is never reinterpreted. | DATA §16; SAVE §10 |
| C2 | `ConnectionType`, `PartFamily` and the solver's status values are closed unions checked at load. An unknown value is a validation error, never ignored. | DATA §7, §13 |
| C3 | `SolveResult` is plain, serialisable and extended only by new optional typed fields. | SOLVER §6, §16 |
| C4 | **V2 is additive.** A blueprint that uses only V1 features produces a `SolveResult` identical to V1's, field for field, under V2 code. | This document |
| C5 | **No new status values.** A new failure is a `jams` or `runs_wrong` result with a typed reason, because renderers and the gift viewer switch over the four statuses. | SOLVER §4; SIM §7 |
| C6 | **Opt-in by blueprint.** A blueprint that needs a V2 feature lists it in `requires`. A solver that does not provide the feature rejects the blueprint with a validation error. | DATA §13 |
| C7 | **Defaults reproduce V1.** Every new part parameter has a default that gives the V1 behaviour (efficiency 1, no fault, no inertia). | C4 |
| C8 | **One solver.** Preview, diagnosis, validation, the gift viewer and play all call the same `solve` function. | TECH §10.5; DATA §15 |
| C9 | **Published blueprints are immutable.** A published (`id`, `version`) pair never changes meaning. A changed machine gets a new version. | DATA §4.1, §16 |

## 4. Determinism rules for V2

V2 adds quantities and outputs. These rules keep each of them reproducible. Rules D1 to D6 are proposals.

| # | Rule | Reason |
|---|---|---|
| D1 | **Canonical order.** Before building the graph, sort installed parts by socket id and connections by id, using plain code-unit comparison, not locale comparison. Permuting the input arrays must not change the result. | A gift payload may list parts in any order. `Array.prototype.sort` with a default comparator is deterministic, locale comparison is not. |
| D2 | **Basic arithmetic only in result-bearing code.** Use `+ − × ÷`, `Math.sqrt`, `Math.abs`, `Math.min`, `Math.max` and `Math.floor`. Keep `Math.sin`, `Math.cos`, `Math.exp` and general `Math.pow` out of anything that sets a status or a discrete output. | IEEE 754 fixes the result of the basic operations and of square root. ECMAScript lets an engine approximate the other `Math` functions, so two browsers may differ in the last bits. The gift viewer must run in any browser. Presentation may use them freely. |
| D3 | **No hidden inputs.** No `Date`, `Math.random`, `performance.now`, environment reads or iteration over an object whose key order is not controlled. Build output objects with keys inserted in sorted order so the serialised form is byte-identical. | SOLVER §2 |
| D4 | **Closed-form time.** The solver never steps time. It returns rates, periods and piecewise-linear profiles (section 5). The simulation controller evaluates them at the elapsed time. | SIM §3 item 6, §8, §9 |
| D5 | **Named constants.** Every epsilon and tolerance is a named, documented constant. | SOLVER §10 |
| D6 | **Margin check.** The blueprint validator checks that no authored correct or wrong configuration lies within 1e-6 (relative) of a tolerance band or of the 1 percent loop threshold. | Removes the one case where two engines could legitimately round to different statuses. |

Cross-engine rule: the same input must give identical statuses, ids and `jamAt` values everywhere, and numbers equal within a relative 1e-9 across engines (bit-identical within one engine).

## 5. Model extensions

The block below is a **proposal** showing the shape of the additions. It is not code. Names change when the lead records the ADR.

```ts
// PROPOSAL (G2). Not implemented. Every field is optional; absence means the V1 behaviour (rule C7).

type SolverFeature = 'torque' | 'energy_network' | 'timing' | 'faults' | 'one_way' | 'worm';

interface MachineBlueprintV2 extends MachineBlueprint {   // blueprint.version >= 2
  requires: SolverFeature[];                               // rule C6
}

type ConnectionTypeV2 = ConnectionType | 'worm' | 'one_way' | 'escapement';

// A time-dependent quantity is a list of linear segments, so one evaluator serves every node.
// A V1 constant-speed run is the one-segment profile [{ t0: 0, t1: runSeconds, v0: w, v1: w }].
interface Segment { t0: number; t1: number; v0: number; v1: number }

interface SolveResultV2 extends SolveResult {
  jamReason?: 'module_mismatch' | 'velocity_contradiction' | 'overload' | 'seized';
  torque?: Record<string, number>;                         // N·m per node
  profiles?: Record<string, Segment[]>;                    // angular speed over time, per node
  periods?: Record<string, number>;                        // seconds per revolution or per cycle
  energy?: { exhaustedAt: number; segments: Segment[] };   // stored energy against time
  paths?: Record<string, PathStage[]>;                     // source-to-node stage list with ratios
  faultTrace?: FaultEffect[];
}
```

Output ordering follows rule D3. `profiles` is the only place the renderer needs to learn something new: it evaluates a node's speed and angle from its segments (angle is the integral, piecewise quadratic, closed form), which keeps animation frame-rate independent (SIM §3 item 6).

## 6. Features

### 6.1 Multi-stage transmissions

**Meaning.** A drive passes through several stages (compound gears on one shaft, a reduction followed by a belt, a worm). V1 already composes stages, because a shaft edge joins two gears and the speeds multiply along the path. What V1 does not track is torque, and it cannot explain a path.

**Additions.**

- **Stage paths.** While propagating, record each node's parent edge. `paths[nodeId]` is the ordered list of stages from the power source with each stage's ratio and the cumulative ratio. It is derived output only. The tree comes from the sorted breadth-first order of rule D1, so it is deterministic. Where a node is reached by two consistent paths the tree path is reported.
- **Torque** (feature `torque`). The spring part carries a torque parameter. Each edge scales torque by the inverse speed ratio times an `efficiency` (default 1): mesh `τ_b = τ_a · (N_b / N_a) · η`, belt `τ_b = τ_a · (r_b / r_a) · η`, shaft `τ_b = τ_a · η`. A part may declare a `loadTorque`. If the torque reaching it is below the load, the result is `jams` with `jamReason: 'overload'` and `jamAt` set to that node. A reduction therefore trades speed for torque, which is what makes a multi-stage choice meaningful. Spring torque is constant until the energy runs out. A decaying spring is not modelled, matching SOLVER §12.
- **Worm drive** (feature `worm`). Edge type `worm`. For a worm with `z` starts driving a wheel of `N` teeth: `ω_wheel = ω_worm · z / N`, with the direction taken from an authored parameter, as for belts (SOLVER §8.3). A mismatched axial module is a jam, as for gears. A `selfLocking` flag blocks the wheel from driving the worm.
- **One-way drive** (feature `one_way`). Edge type `one_way` for a ratchet and pawl. It transmits speed in the authored direction. In the other direction the driven node holds its angle and the drive side sees speed zero. No collision is simulated (SOLVER §8.4's rule against arbitrary collision applies).

**Determinism.** Only basic arithmetic. Torque and ratios are products along a tree. **Format effect.** None on save or gift data, because no solver output is stored (section 7).

### 6.2 Energy distribution

**Meaning.** V1 has one power source and one drain rate per machine (SOLVER §12). V2 allows several sources and several consumers on one machine.

**Model** (feature `energy_network`). Sources are mainspring, ambient wind and, optionally, a flywheel. Consumers are the machine's loads, each with a drain rate `D_k` while active. A consumer is active when its trigger condition holds. A trigger edge already expresses "active after" (SOLVER §8.5).

- Total stored energy `E = Σ E_j` over the sources of the connected machine. Total drain `D = Σ D_k` over the active consumers.
- With a constant active set, `T = E / D`, which is the V1 formula with one consumer.
- When consumers switch on or off at authored times, the drain is piecewise constant. The solver walks the segments in time order, subtracting `D_seg · (t1 − t0)` until the energy reaches zero, and reports `energy.exhaustedAt` and the segment list. The result is exact and needs no time stepping (rule D4).
- **Flywheel coast-down.** A flywheel with inertia `I` at speed `ω₀` against a constant load torque `τ_L` slows linearly: `ω(t) = max(0, ω₀ − (τ_L / I) · t)`, stopping at `I·ω₀ / τ_L`. This is the one case where speed falls with time, and it is a single linear `Segment` in `profiles`. This is optional within G2. Skip it unless a puzzle needs it.

**Not modelled:** energy priority when torque is short (that is an overload, section 6.1), and fluid or pressure flow (a world-specific extension, section 9).

**Compatibility.** A V1 machine has one source and one consumer, so its `energy.exhaustedAt` equals V1's `runSeconds`. `runSeconds` stays filled so that V1 renderers keep working.

### 6.3 Timing

**Meaning.** G0 gives a follower pose from profile data and no notion of period (SOLVER §8.4). Clocks, music and automata need periods and phase.

**Additions** (feature `timing`).

- `periods[nodeId]` is `2π / |ω|` for a rotating node. A cam with `L` lobes drives its follower with period `2π / (|ω| · L)`. Two cams on one shaft keep a fixed authored phase offset.
- **Pendulum and escapement.** A pendulum has an authored period `T_p`. An escapement edge fixes the escape wheel speed at `ω = 2π / (N · T_p)`, one tooth per full pendulum period (a 30-tooth wheel on a 2 s pendulum turns once a minute). The escapement is a **regulator**: it, not the power source, fixes speed in its connected train. The spring then supplies torque and energy only. Two regulators in one train must agree within the 1 percent loop test, otherwise `jams`. A blueprint without a regulator behaves exactly as in V1 (rule C4).
- **Governor.** The Music Box governor is a rotating part in G0 (SIM §10.1) and stays one. A speed-limiting governor is a V2 regulator with an authored setpoint.
- Pendulum period from length uses `2π·√(L/g)` for small swings with a game constant for `g`. Authoring the period directly avoids the question. Both use only `√` and basic arithmetic (rule D2).

The solver returns periods and phases. It does not tick. The controller derives the instant pose from elapsed time, so any number of mechanisms stay in step without sharing a clock (rule D4). Clock Tower targets stay undefined here (SOLVER §15.4).

### 6.4 Mechanical diagnosis

**Meaning.** A pure function `diagnose(input, result)` that turns a result into typed causes the gameplay layer can present. It does not decide what the player sees. Whether a diagnostic tool exists in the game, and how much it reveals, is a G2 design question, because G0 teaches through visible consequences rather than instructions (CLAUDE.md §4; [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §8).

**Output.** Typed items, extending the diagnostics SOLVER §16 lists: `missing_socket`, `module_mismatch`, `velocity_contradiction` (with the two paths), `wrong_target` (expected, actual, tolerance), `overload` (required and available torque), `energy_short` (run seconds against needed seconds).

**Additions.**

- **Ratio explanation.** For a failing target, the stage list from `paths` with each stage's ratio, so the cause reads "stage 2 gives 1:1, the target needs 1:2".
- **Candidate fixes.** For each socket that lists `acceptedPartIds` (DATA §6), try each alternative part alone, call `solve`, and keep those that give `runs`. Sort by number of changed sockets (1), then socket id, then part id. The search is bounded by sockets times accepted parts. The Windmill has 24 part slots ([PRODUCT_SPEC.md](PRODUCT_SPEC.md) §6.3), so a single-swap search is on the order of one solve per accepted alternative per socket, tens of solves for the Windmill. Run it on demand in slices of at most 2 ms of work per frame (audit D §6.3), never every frame.

**Determinism.** Reuses `solve`. The search order is fixed by rule D1.

### 6.5 Fault propagation

**Meaning.** A defective part changes what happens downstream. G0 already has two faults, and both are different part ids: the worn spring (`spring_worn`, about 15 percent energy) and the 12-tooth gear in a 24-tooth socket ([PRODUCT_SPEC.md](PRODUCT_SPEC.md) §8). V2 keeps that approach and extends it.

**Rules.**

- **Faults are discrete.** A fault is a part variant id or a part parameter with a small closed set of values (for example severity 0 to 3), never a free float and never random. This keeps saves and gift payloads exact and a fault repeatable (feature `faults`).
- **Effects** come from a data table per fault kind: `speed_scale` (slip), `torque_loss`, `stall` (seized), `stutter` (a missing tooth: one event per revolution of the faulty gear, period `2π / |ω_gear|`, so it is deterministic and not random).
- **Propagation.** Starting at the faulty node, visit nodes in the sorted breadth-first order of D1 and apply each edge's rule to the downstream quantity. A trigger edge does not send activation from a stalled node. A `stall` through rigid edges is a `jams` result with `jamReason: 'seized'`.
- **Trace.** `faultTrace` lists, in visit order, each affected node with the effect, the factor and the causing part. The presentation can ripple a stutter or a block along the same path.

### 6.6 Simulation preview

**Meaning.** Show the effect of a candidate change before the player commits it, without changing the assembly.

**Functions** (pure, proposal).

- `previewPlacement(input, socketId, partId)` solves a copy of the assembly with the candidate installed and returns the new result and the difference from the current one (status, changed speeds, run seconds).
- `previewTimeline(result, samples)` samples `profiles` and `energy` at a fixed number of points for a small chart, using the same segment evaluator as the renderer.

**Rules.**

- Preview calls `solve`, the one solver (rule C8). For every reachable assembly, the previewed result must equal the result after actually installing the part. This is a test.
- Preview results are cached by a canonical key (blueprint id and version, sorted installed parts, power input), with a small fixed-size cache and deterministic eviction.
- Preview runs when the candidate socket changes, not each frame.
- Preview never touches progression, saves or gifts. Like X-ray, it must not change mechanical state (TECH §15).
- Preview is a G2 feature. A G0 build has no preview, and G0 hints stay as GAMEPLAY_SYSTEMS §8.3 describes.

## 7. Format compatibility

| Format | G0 | What V2 may add | Rule that protects G0 data |
|---|---|---|---|
| Blueprint | `version` field, five edge types | `version` 2 with `requires` and new edge types | C1, C2, C6. A V1 blueprint is solved by V2 code unchanged (C4). |
| Part definition | Stable id, family, mechanical parameters | Optional parameters (`efficiency`, `torque`, `inertia`, `starts`, `lobes`, `period`) and new families | Ids are never renamed (DATA §4.1). Defaults reproduce V1 (C7). A new family needs an entry in the `PartFamily` union (see section 11). |
| `SaveV1` | Records `blueprintId`, built, placed, plot (SAVE §3) | Nothing. It holds no solver output, and SAVE §5 forbids saving temporary solver objects. | No migration is needed for V2 alone. Any new persisted machine state belongs to `SaveV2` ([WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) §7). |
| Gift payload | Blueprint id, part ids, assembly; the viewer re-runs the solver (TECH §17; DATA §15) | New solver features change what the viewer computes, not what the payload holds | The payload version is checked first (C1), so a payload a build cannot understand shows the error card. C9 keeps an old link meaning the same machine. |
| `SolveResult` | Six fields | Optional typed fields (section 5) | C3 and C5. A V1 renderer ignores the new fields. |

Recommendation for the lead, outside this document's authority: have the G0 gift payload name the blueprint `version` along with the blueprint id (DATA §16 allows "blueprint version where compatibility requires it"). It costs a few characters against the 1500-character target (TECH §17) and is the only way an old link can be told apart from a changed blueprint. Retrofitting it later breaks every link already shared.

## 8. Testing

All V2 tests run in Vitest in node, with no browser or WebXR dependency, as SOLVER §17 requires.

| Test | Checks |
|---|---|
| Golden corpus | The 17 cases of SOLVER §17 plus the correct and wrong configurations of the three G0 machines (worn spring, 12-tooth Windmill gear) are frozen as canonical JSON when the V1 solver is accepted. V2 must reproduce them unchanged (C4). |
| Permutation invariance | Shuffling installed parts and connections gives an identical result (D1). |
| Scale invariance | Multiplying every source speed by `k` multiplies all speeds by `k` and changes no status. |
| Monotonic runtime | More wind units never reduce `runSeconds`. |
| Default equivalence | A V1 blueprint with every V2 parameter set to its default equals the V1 result (C7). |
| Preview equals solve | For each reachable assembly of each shipped blueprint, `previewPlacement` equals the result after installing (6.6). |
| Margin check | The validator rejects an authored configuration within 1e-6 of a tolerance (D6). |
| Per feature | Torque overload; worm ratio, module mismatch and self-locking; one-way hold; piecewise energy exhaustion; escapement speed (30 teeth, 2 s, one turn per minute); regulator conflict; candidate-fix ordering; fault trace order. |
| Cross-engine | One Playwright test solves the golden corpus in Chromium and compares with the node result: ids and statuses equal, numbers within a relative 1e-9. Chromium only. Other browsers are not tested here. |

Nothing in this table runs on a Quest. Frame cost on a headset stays unmeasured.

## 9. World-specific extensions

The directive requires that a world's special mechanics "extend the shared engine through documented interfaces" and never duplicate it (world-by-world strategy, "World-specific extensions"). The interface is proposed here and designed for no particular world.

```ts
// PROPOSAL (G5 hook). Not implemented.
interface SolverExtension {
  id: string;                 // for example 'hydraulics'; named in blueprint.requires
  edgeTypes: string[];        // connection types this extension propagates
  // A pure function over the same graph state. It may add node quantities and result fields.
}
```

Rules for an extension:

1. It is pure and deterministic and obeys rules D1 to D6.
2. It is registered statically at start-up in a fixed order. There is no dynamic loading.
3. It adds edge types, node quantities and optional result fields. It does not change V1 semantics, add a status, or read anything outside the solver input.
4. A blueprint names it in `requires`. The save loader and the gift viewer reject a blueprint that needs an extension the build does not register (C6).
5. An extension ships with the world that needs it. Nothing in `src/sim` names a world.

The directive requires that "the mechanical engine must support extensions without being tightly coupled to any individual world" (world-by-world strategy, "Shared foundation"). The five extensions it names, one for each later world in production order (world-by-world strategy, "World-specific extensions"), are below. Each is a G5 proposal, none is designed here, and none is built before the competition ships.

| Order | World | Extension the directive names | Proposed `SolverExtension` id; where it is worked out in [MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md) |
|---|---|---|---|
| 2 | Brasswater Harbour | Hydraulic systems, pumps and water flow | `hydraulics`; section 5, row 8 |
| 3 | Emberforge Mountains | Pressure, pistons and foundry machinery | `pressure`, built on the G2 energy network of sections 6.1 and 6.2 of this document; section 6, row 8 |
| 4 | Verdant Observatory | Planetary gearing and precision timing | `planetary`; section 7, row 8 |
| 5 | Aetherian Skyworks | Propellers, gyroscopes and flight mechanisms | `flight`; section 8, row 8 |
| 6 | Grand Mechanical Theatre | Synchronisation and coordinated automata | `sync`; section 9, row 8 |

World 1, Tockton, needs no extension: it runs on the shared engine (MULTI_WORLD_UNIVERSE_DESIGN section 4, row 8). The ids are proposals and the interface above is the only contract. Because an extension is registered statically, named only in a blueprint's `requires`, and shipped with its own world (rules 2, 4 and 5), the engine never imports or names a world, and removing a world removes its extension without touching `src/sim`.

One structural point is recorded for whoever designs planetary gearing: a planetary or differential gear train has two inputs and one output tied by a constraint equation (`ω_sun·N_sun + ω_ring·N_ring = ω_carrier·(N_sun + N_ring)`), which the one-speed-per-node propagation of SOLVER §9 cannot express. It needs a small fixed-order linear constraint block inside an extension. The core graph traversal does not change.

## 10. Performance

- The solver runs when the assembly or the power input changes (SOLVER §18; SIM §8). V2 never moves work into the frame loop.
- V2 adds linear passes over the graph (torque, profiles, paths). The largest required G0 machine is the Windmill with 24 part slots, and the optional Clock Tower has 32 ([PRODUCT_SPEC.md](PRODUCT_SPEC.md) §6.3, §6.4). The cost is a small constant factor over V1 and is measured by a desktop Vitest benchmark when the code exists. A Quest value is unknown and is not claimed.
- Diagnosis and preview run on demand and in slices (6.4, 6.6). The per-system frame guidance is 2 ms (audit D §6.3).

## 11. Dependencies and open points

| Item | Detail |
|---|---|
| ADR "H" | The engine V2 contract ([audit A](audits/A_DOCUMENTATION.md) §4.2) must be recorded in [DECISIONS.md](DECISIONS.md) before any V2 code. Changing a solver contract needs the lead (AGENT_WORKFLOW §14). |
| Part families | A-01 records that the 15 `PartFamily` values have no family for governor, ratchet, pawl, flywheel, coupling or worm gear. The G2 shared parts in the manifest (`ratchet_wheel`, `pawl_standard`, `flywheel_standard`, `coupling_rigid`, `worm_gear`) are entered so the library can grow. Their status and counts come from `assets/manifest/glb-manifest.json` and `node tools/asset-status.mjs`. The manifest says each needs an engine edge type. This document proposes `worm` and `one_way` as edges, the flywheel as a node parameter and the coupling as a torque limit on the shaft edge. The lead decides. |
| Typed jam reasons in V1 | SOLVER §16 already asks for typed diagnostics. If the V1 solver emits `jamReason` for module mismatch and velocity contradiction now, V2 only adds kinds. |
| Original Technical Design Doc | Owner decision pending ([decision 1](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)). Nothing here depends on it. |

## 12. Acceptance criteria

1. Every V2 feature states its determinism treatment, its effect on save and gift data, and its tests.
2. No G2 item is labelled G0-required, and G0 solver behaviour is unchanged (C4).
3. No new status value is introduced (C5), and every new failure is a typed reason on an existing status.
4. The golden-corpus test is defined before V2 code starts.
5. Every number in section 2 matches SOLVER and PRODUCT_SPEC; no Clock Tower target is invented.
6. Every G2 part in the manifest is connected to an engine feature or flagged as an open point.
