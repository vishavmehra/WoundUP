# Wound Up — Master System Architecture

**Project:** Wound Up
**Label:** G0-required for the module map, the dependency rules and the seam rules except seam 8 (they describe the competition build). Seam 8 is a proposal. Everything labelled G1 to G5 or Research in this file is a **proposal**. Read the scope firewall in [DECISIONS.md ADR-028](DECISIONS.md) first.
**Status:** Planned. Only the M0 foundation exists in code.
**Date:** 2026-11-06
**Source:** [directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) Part 11, Part 10, multiple-worlds requirement §4 and §5; [audit D](audits/D_WEBXR_ARCHITECTURE.md)
**Related:** [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) (authoritative for G0), [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md), [SPATIAL_WORLD_SYSTEM.md](SPATIAL_WORLD_SYSTEM.md), [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md), [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md), [DECISIONS.md](DECISIONS.md), [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md)

Citation key: D, A, E, F = the audit reports in [audits/](audits/) (D = WebXR and architecture). TECH = [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md). SOLVER = [MECHANICAL_SOLVER_SPEC.md](MECHANICAL_SOLVER_SPEC.md). SIM = [SIMULATION_SPEC.md](SIMULATION_SPEC.md). DATA = [DATA_AND_BLUEPRINT_SPEC.md](DATA_AND_BLUEPRINT_SPEC.md). SAVE = [SAVE_PERSISTENCE_SPEC.md](SAVE_PERSISTENCE_SPEC.md).

## 1. Purpose and authority

[TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) is the architecture of the competition build and stays authoritative for it. This file does not repeat it. It adds four things the directive asks for (Part 11, multiple-worlds requirement §5) that TECH does not hold:

1. A map from each module the directive lists to its governing spec, its state today, its code home and its owner (section 3).
2. Dependency rules that say which module may import which (section 4).
3. The split between systems shared by every world and systems specific to one world (section 5), and what each later generation adds (section 6).
4. The few rules G0 code must follow so later generations can extend it without a rewrite (section 7).

TECH §1 says "Do not build a generic game engine". This file respects that. A seam here is a rule about how G0 code is written (stable ids, versioned formats, typed events, data instead of hard-coded content). It is not extra code. Section 7 states the cost of every seam, and a seam becomes G0 work only where a G0 spec already needs it.

Order of authority when documents disagree: accepted ADRs, then TECH for G0, then this file.

## 2. State used in this file

"State today" was read from the `src/` file list and [audit D](audits/D_WEBXR_ARCHITECTURE.md) §1 on 2026-11-06. The M0 foundation (entry page, XR entry, fallback stand, one grabbable gear, 16 unit tests, 6 Playwright tests) is the only code. It is Desktop verified and IWER verified at most. Nothing is Quest Browser verified or verified on a physical Quest 3 or Quest 3S: no headset and no tester exist ([PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §9, risk 1). There is no `.codegraph/` index in the repository.

## 3. Module map

### 3.1 The eleven modules of directive Part 11

| Module | Label | State today | Governing spec | Code home and owner |
|---|---|---|---|---|
| Mechanical simulation | G0-required (solver v1); G2 extends it | Not started. `src/sim/` and `tests/sim/` do not exist (D §1). | SOLVER, SIM §1 to §9, TECH §10 and §11 | `src/sim/**`, `tests/sim/**`. Agent 1. Pure TypeScript. |
| World simulation | G0-required for the wake state only; G1 for the rest | Not started. | SIM §13, [GAMEPLAY_SYSTEMS.md](GAMEPLAY_SYSTEMS.md) §14, [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §11. G1: [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md) | G0: `src/town/**`, Agent 4, consuming the solver's output. |
| Resident behaviour | G1 | Not started. No behaviour spec exists. G0 residents are static or scripted (D §1). | None for G0. `RESIDENT_BEHAVIOUR_SPEC.md` is a separate G1 document | None in G0. |
| Story and quests | G0-required for letters, repairs and the daily repair; G1 and later expand it | Not started. | [GAMEPLAY_SYSTEMS.md](GAMEPLAY_SYSTEMS.md) §4 and §5, DATA §11 and §12, [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §7 and §8 | Data in `src/content/**`. Progression in the gameplay layer. No owner is named in CLAUDE.md §10 (section 3.3). |
| Spatial interaction (hands) | G0-required | M0 only: `src/grab-mode.ts`, `src/grab-feedback.ts`, `src/returns-to-rest-component.ts`, `src/hands.ts`. Sockets, winding, X-ray, ghost hands and gaze mode are missing (D §1). | [INTERACTION_SPEC.md](INTERACTION_SPEC.md), TECH §12 to §15 | `src/interaction/**`. Agent 3. |
| Machine construction | G0-required | Not started. | GAMEPLAY_SYSTEMS §6 to §8, TECH §13 | Part catalogue and part loading in `src/parts/**` and `src/content/parts/**` (Agent 2). Snapping in `src/interaction/**` (Agent 3). Assembly state in the gameplay layer. |
| Blueprint validation | G0-required | Not started. | DATA §5 to §9 and §13, TECH §9 | Blueprint data in `src/content/blueprints/**` (Agent 2). The validator is pure TypeScript. Its folder is an open point (section 10). |
| Persistence | G0-required | Not started. | SAVE, TECH §16 | A single save service. No owner is named in CLAUDE.md §10 (section 3.3). |
| Rendering | G0-required | Partial: lights, `IBLGradient`, contact shadow, fallback stand, 2D-only frame limiter `src/render-budget.ts` (D §1). Frozen and awake shading, wake ripple and X-ray pass are missing. | [ART_ASSET_PIPELINE.md](ART_ASSET_PIPELINE.md), TECH §19 and §20, ADR-021, ADR-034 | `public/scenes/*.iwsdk.scene.json`, `src/town/**` (Agent 4), shared material library (asset management row). |
| Audio | G0-required | Not started. | TECH §18, SIM §11 | `src/audio/**`. Agent 4. Procedural Web Audio, no audio files ([MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md) §8). |
| Asset management | G0-required | Partial: `src/assets.ts` (two critical GLB keys), `src/hands.ts`, `assets/manifest/glb-manifest.json`, `tools/asset-status.mjs`. The runtime material library, the part loader and the validator do not exist (D §1; E §2.4). | ADR-023, ADR-025, ADR-030 to ADR-035, ADR-037, [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md) | `src/assets.ts` (Agent 0). Part loading and instancing (Agent 2). `tools/` and `blender/scripts/lib/` (asset framework agent, CLAUDE.md §10). |

### 3.2 Modules the directive does not list but TECH §3 needs

| Module | Label | State today | Governing spec | Code home and owner |
|---|---|---|---|---|
| Platform and application (entry, XR session, landing, desktop preview) | G0-required | Implemented: `src/index.ts`, `src/xr-entry.ts`, `src/render-budget.ts`. `src/landing/**` belongs to another process. | TECH §5 and §6, ADR-019, ADR-024 | Agent 0, except `src/landing/**`. |
| Spatial world (table detection, anchor, stand fallback, stage root) | G0-required | Stand only: `src/placement.ts` (`standPose`), `src/stage.ts` (`StageSystem`), `src/stage-framing.ts`. Table choice and anchor are not built (BUILD_ROADMAP Phase 2A). | TECH §6.4, ADR-019, ADR-020, ADR-026. Design: [SPATIAL_WORLD_SYSTEM.md](SPATIAL_WORLD_SYSTEM.md) | Agent 0. |
| Game state and progression | G0-required | Not started. | TECH §7, DATA §12, GAMEPLAY_SYSTEMS §3 and §4 | Gameplay layer. No owner named (section 3.3). |
| Gifting | G0-required | Not started. | [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §13, TECH §17, DATA §15 | Gameplay layer. |
| Accessibility (Easy Snap, gaze mode, reduced motion and the other settings) | G0-required | Not started. | [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §16, INTERACTION_SPEC §14, ADR-036 | Settings in the save; behaviour in the layer that each setting affects. |
| XR text and panel interface | G0-required (letters, wind counter, pause menu) | Technology undecided: `spatialUI` is `false` in `iwsdk.config.json` and no ADR picks a path (D §1, D §7 risk 8). | [UI_UX_SPEC.md](UI_UX_SPEC.md) | Open (section 10). |
| World registry and loading | G0: Tockton only; loading by asset id and the `dist/` check. G5 proposal: the registry and the Tockton definition object | Not started. | Directive multiple-worlds requirement §4. Design: [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) | Agent 0. |

### 3.3 Ownership gaps

These are modules CLAUDE.md §10 does not give to any named agent. Until the "additional agents" of CLAUDE.md §10 exist, Agent 0 owns them.

| Gap | Why it matters | Source |
|---|---|---|
| The simulation controller: the runtime state machine (Unassembled, Ready, Wound, Running, Exhausted and so on) that turns a `SolveResult` into animation, audio and a completion event | SIM §2 to §8 specify it. Agent 1 owns the solver, Agent 4 owns presentation. Nobody owns the controller between them. | SIM §4, §5, §13; CLAUDE.md §10 |
| Save service, progression, letters and assembly state, gift link and viewer, pause menu | CLAUDE.md §10 lists them under "Additional agents when useful". | CLAUDE.md §10; SAVE §2 |
| Cleanup of `GrabFeedbackSystem` | It clones every material of every part and never releases them. Harmless with one gear, a leak once parts are created and destroyed. | D §1 defects |

## 4. Layers and dependency rules

### 4.1 Layers

Imports point downward only. A module never imports a module above it.

```text
  L5  Runtime wiring       src/index.ts, src/stage.ts, src/placement.ts, src/xr-entry.ts, src/landing/**
        |  (wires everything; nothing imports L5)
  L4  Presentation         src/town/**, machine views, effects, src/audio/**, scene JSON
  L3  Interaction          src/interaction/**   (IWSDK hand input -> typed intents)
        |
  L2  Gameplay             modes, progression, assembly state, save service, gift, simulation controller
        |
  L1  Content (data)       src/content/**   blueprints, part catalogue, letters, melodies
  L0  Simulation           src/sim/**       pure TypeScript, imports nothing from the project
  --  Assets               src/assets.ts, material library, part loader   (used by L3, L4, L5; imports no gameplay)
```

| Layer | May import | Must not import | How a breach is caught |
|---|---|---|---|
| L0 `src/sim` | Its own files and pure shared types | Three.js, IWSDK, DOM or browser APIs, `src/content`, anything above (CLAUDE.md §10 Agent 1; ADR-008; SOLVER §2) | Vitest runs in the `node` environment (`vitest.config.ts`), so DOM use fails at test time. The lead adds an ESLint `no-restricted-imports` rule for `three` and `@iwsdk/*` in `src/sim/**` when the folder is created (proposal). |
| L1 `src/content` | Pure types and data | Three.js objects, IWSDK entities, DOM elements inside definitions (DATA §1, §14) | Blueprint validation (DATA §13) rejects non-serialisable fields. |
| L2 Gameplay | L0, L1 | IWSDK input, Three.js scene objects. Keep state modules free of engine types where practical so Vitest can test them (TECH §21.2). ECS systems are thin adapters. | Unit and integration tests in node. |
| L3 Interaction | IWSDK, Three.js, L1 helpers such as "can this part go in this socket" | Direct mutation of machine or town state. It emits intents; L2 decides (TECH §12.3). The solver is not called from here. | Review, plus the rule that L3 exports no state setters. |
| L4 Presentation | IWSDK, Three.js, L2 state snapshots, `SolveResult` | The solver as a source of validity: it presents results and never decides them (TECH §10.5; SIM §3 item 3). L3. | Review. |
| Assets | IWSDK asset manager, Three.js | L2 and L3 | Review. |
| L5 Runtime wiring | Everything | Nothing imports it | Not applicable. |

### 4.2 Flow rules

1. **One direction of control.** Hand input becomes an intent (L3). Gameplay changes state and calls the solver (L2, L0). Presentation shows the state and the `SolveResult` (L4). No arrow runs the other way (TECH §10.5, §12; SIM §2).
2. **Events are typed.** Cross-module notifications use a small typed event set with typed payloads, not a general event bus and not strings (TECH §8). The events TECH §8 lists (`LetterAccepted`, `PartPlaced`, `MachineSolved`, `MachinePlaced`, `PlotAwakened`, `GiftCreated`, `SaveUpdated`) and the `MachineCompletedEvent` of SIM §13 are the seams later generations subscribe to.
3. **Time.** Frame time exists only in L4 and L5. The solver uses no timing (SOLVER §2). The simulation controller clamps the frame delta (SIM §8). Logic that depends on the calendar date (the daily repair, ADR-027) receives the date as an argument, so tests can fix it.
4. **Data is separate from objects.** Blueprints, part definitions, letters, saves and gift payloads hold plain serialisable data and stable ids (DATA §2). The only link from data to a file is `visual.assetId`, which is the asset id of ADR-033.
5. **IWSDK stays at the edge.** IWSDK and Three.js types appear only in L3, L4, L5 and the asset loader. Everything else runs in node.
6. **Saves hold progress only.** No coordinates, surfaces, anchors, runtime objects or solver results are saved (SAVE §5).
7. **No network in the game loop.** The shipped game makes no third-party request and uses no backend (ADR-013, ADR-025). A later generation that wants a service needs its own ADR (section 6).

### 4.3 Dependencies per module

| Module | Depends on | Used by |
|---|---|---|
| Mechanical simulation | Shared pure types only | Gameplay (assembly, gift viewer), tests. G2: preview and diagnosis |
| World simulation | Machine status from gameplay; the world's definitions (L1) | Town presentation, audio, save |
| Resident behaviour (G1) | A read-only world snapshot | Town presentation |
| Story and quests | Letter and progression data (L1); typed events | Gameplay, interface, save |
| Spatial interaction (hands) | IWSDK input; part, socket and plot data (L1) | Gameplay, as intents |
| Machine construction | Part catalogue and blueprints (L1); the asset loader | Gameplay; the solver's input |
| Blueprint validation | Blueprint and part types (L1) | Gameplay at load, the gift viewer, tests |
| Persistence | Plain gameplay data types | Gameplay, pause menu (restart) |
| Rendering | IWSDK, Three.js, assets, `SolveResult`, state snapshots | Runtime wiring |
| Audio | Machine runtime state; world cues | Runtime wiring |
| Asset management | IWSDK asset manager, the manifest, the material library | Rendering, parts, town |
| Spatial world | WebXR through IWSDK; pure placement logic | Everything under the stage root (town, interaction) |

## 5. Shared versus world-specific systems

The split is the one in directive multiple-worlds requirement §5. In G0 there is one world, so "shared" describes how the code is written, not a second world's code.

### 5.1 Shared by every world

| System | G0 home | Rule for G0 code |
|---|---|---|
| Player interaction | L3 `src/interaction/**` | Takes part, socket and plot ids. No world name in the code. |
| Mechanical simulation engine | L0 `src/sim/**` | Takes a blueprint and an assembly. Knows no machine by name. Machine targets live in blueprint data (DATA §8). |
| Component library | The `shared` GLB folder (ADR-033) and `src/content/parts/**` | Part ids have no world token (ADR-033). A finish is a runtime material (ADR-030). |
| Blueprint format | L1 and DATA | Versioned. A world adds blueprints, not fields. |
| Save infrastructure | L2 save service | Versioned with an explicit migration (SAVE §10). |
| Accessibility | Settings in the save | Settings are player-level, not world-level. |
| Hand tracking | IWSDK plus `src/hands.ts` | Already world-neutral. |
| Spatial anchoring | `src/stage.ts`, `src/placement.ts` | The stage root is the only mount point for world content (section 7, seam 7). |
| Inventory and journal | Not in G0. The parts tray is per letter (DATA §9). | Proposal (G1 and later): a player-level record. No G0 work. |
| Quest framework | G0 is the letter data and the progression authority (DATA §11, §12) | Letters are data. A second progression system is not allowed (DATA §12). Generalising to quests is G1. |
| Audio framework | L4 `src/audio/**` | One audio context (TECH §18). World-specific sound is configuration, not a second engine. |
| Rendering and asset pipeline | `src/assets.ts`, shared material library, ADR-030 to ADR-035 | World-neutral. A new look is a new material, not a new file. |

### 5.2 World-specific

| System | Where it lives for Tockton in G0 | Notes |
|---|---|---|
| Architecture and environmental design | Tockton GLBs (`worldId` `tockton` in the manifest), `src/town/**`, the scene JSON | |
| Residents | Static or scripted figures (the baker) | Behaviour is G1 ([WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md)). |
| Story | Letters 1 to 6 and the closing card (DATA §11) | |
| Local mechanical machines | Music Box, Carousel, Windmill, Clock Tower blueprints and housings | Built on the shared engine. |
| Production chains | One link: the Windmill wakes the Bakery (`wakes`, DATA §5) | General chains are G1. |
| World events | The wake state of each plot (SIM §13) | G1 adds more. |
| Unique puzzles | The Music Box and Windmill repairs (PRODUCT_SPEC §8) | |
| World-specific mechanics | None in G0 | A world extends the shared engine through a documented interface, never by copying it. See [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md) §9. |

## 6. What each generation adds, by module

All cells after G0 are proposals drawn from directive Parts 2 and 10, the ADR-028 table and [IDEAS.md](IDEAS.md). None of it is built before the competition build is delivered (ADR-028 rule 3).

| Module | G0 | G1 Living Tockton | G2 Advanced engineering | G3 Creative sandbox | G4 Community | G5 Clockwork universe |
|---|---|---|---|---|---|---|
| Mechanical simulation | Solver v1: five edge types, four statuses | Reads machine status for production; no solver change | [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md) | Validates player-made assemblies with the same solver | Validates received blueprints with the same solver | World-specific solver extensions registered per world |
| World simulation | Wake state per plot | [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md) | | | | One instance per world, cross-world effects |
| Resident behaviour | Static or scripted | Behaviour engine | | | | Per-world residents |
| Story and quests | Letters, repairs, daily repair | Expanded stories | | | Community-created puzzles | Expanded campaigns |
| Spatial interaction | Hands, snapping, winding, X-ray | | | Free-build workshop interaction | | Cooperative experiences |
| Machine construction | Curated sockets from blueprints | | | Modular component library, custom machines | | |
| Blueprint validation | Validator for shipped blueprints | | | Blueprint editor, machine validation | Validation of untrusted shared blueprints | |
| Persistence | `SaveV1`, localStorage | Persistent world state | | Saved inventions | Optional accounts and cloud saves (each needs a new ADR; ADR-013) | Per-world save records ([WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) §7) |
| Rendering | Frozen and awake palette | | | | | Per-world look |
| Audio | Procedural, one context | | | | | Per-world audio identity |
| Asset management | Plain GLB, shared material library | | | | | World registry, load and unload |
| Spatial world | Table choice and anchor for the session, stand fallback | Improved spatial persistence ([SPATIAL_WORLD_SYSTEM.md](SPATIAL_WORLD_SYSTEM.md) §10) | | | | One stage root hosts one world at a time |

## 7. Seams G0 must keep open

Each seam except seam 8 is a rule for G0 code that a G0 spec already contains or implies. None adds a feature. Seam 8 has no G0 source: it is a G5 proposal, shown here so the lead can decide.

| # | Seam | G0 rule | G0 source | Later use | G0 cost |
|---|---|---|---|---|---|
| 1 | Stable ids | Machine, part, socket, letter, plot and asset ids are stable. An asset id carries no world token, no finish and no version word. | DATA §2, §4.1; ADR-033 | Any world uses the same shared parts | None |
| 2 | Versioned formats | Save, gift payload and blueprint carry a version. An unknown or newer version fails safely and is never reinterpreted. | DATA §16; SAVE §10 | `SaveV2`; engine v2 blueprints | None |
| 3 | Closed unions checked at load | `ConnectionType`, `PartFamily`, `LetterStatus` and `GameMode` are closed unions. An unknown value is a validation error, never silently ignored. | DATA §7, §13; SAVE §4.2 | New members arrive with a version bump | A validation case |
| 4 | Additive results | `SolveResult` is plain and serialisable. Extra diagnostics are new typed optional fields, not strings. | SOLVER §6, §16 | Engine v2 fields | None |
| 5 | Typed events | Completion and placement are typed events that the town consumes. The simulation controller never edits town progression. | TECH §8; SIM §13 | G1 world simulation subscribes | None |
| 6 | Derived wake state | A plot is awake when a machine is placed on it. The blueprint's `wakes` list names the other plots to wake. | DATA §5; SAVE §3 | G1 building dependencies | None |
| 7 | One mount point | Trunk, town and workbench sit under the stage root. World content never detects surfaces. | ADR-020; TECH §6.4 | One stage hosts whichever world is active | None |
| 8 | Tockton behind one definition (**proposal**) | Tockton's asset list, level, blueprints and letters are reached through one definition object. Shared modules contain no `tockton` literal. | None. Section 5 describes the shared and world-specific split, and D §5 a registry feasibility design; neither is a G0 requirement | The registry adds entries | One small module ([WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) §3). Not scheduled; the lead decides |
| 9 | World-tagged files | Every GLB has a `worldId` in the manifest and lives in the folder ADR-033 assigns. A CI check fails the build when `dist/` holds a GLB that is not G0 or a world other than `tockton` or `shared`. | ADR-033; D §5; F X04 | Future worlds stay out of `public/` | A CI check the lead already owns |
| 10 | No network | No backend, account, analytics, telemetry or third-party request. | ADR-013, ADR-025 | A service needs a new ADR | None |
| 11 | Injected date | Anything that depends on the local date takes the date as an argument. | ADR-027; GAMEPLAY_SYSTEMS §12.3 | G1 day ticks | None |

## 8. Performance and verification

- Scene budgets are the ADR-034 tables: draw calls, visible triangles, GPU texture memory and download size. A module may not exceed them. A module needing an exception gets the lead's written exception (ADR-034 enforcement).
- Gameplay code that runs each frame costs at most 2 ms per system (Meta's WebXR performance guidance, D §6.3). The solver, validator and save service run on change, not per frame (SOLVER §18; TECH §20).
- Per-frame code allocates nothing and caches geometry and materials (TECH §20).

Highest verification level each layer can reach today:

| Layer | Reachable today | Not reachable without a headset |
|---|---|---|
| L0 Simulation, L1 Content, L2 Gameplay state | Vitest in node (unit and integration) | Nothing needs a headset |
| L3 Interaction | Desktop, IWER with emulated hands | Hand feel, comfort, real tracking noise |
| L4 Presentation | Desktop, IWER | Frame time, multiview, foveation, custom-shader behaviour on a Quest (D §6.2) |
| L5 Spatial world | Unit tests for the pure logic, IWER rooms for the flow | Real plane detection, anchor stability, permission prompt (D §4.2) |

A statement of the form "works on Quest" needs Quest Browser or physical Quest 3 or Quest 3S evidence and stays Blocked until a tester is named (TP-7 in [BUILD_ROADMAP.md](BUILD_ROADMAP.md)). The levels Desktop, IWER, Quest Browser, physical Quest 3 and physical Quest 3S are never merged.

## 9. IWSDK facts this architecture depends on

All are from [audit D](audits/D_WEBXR_ARCHITECTURE.md), checked in the installed 1.1.0-rc.2 package, not run on a device. Re-check them after any IWSDK upgrade (ADR-016).

- The asset manifest is fixed at `World.create`. `AssetManager.registerManifest` replaces the entry map (D §3.1).
- Scene-driven asset loading is serial, so assets are prefetched in parallel before a level loads (D §3.1).
- A level change does not free asset GPU memory. Releasing a world's assets needs our own disposer (D §3.2).
- `CacheManager` and `AssetManager.loadGLTF(urlOrKey, key?)` are public and exported from `@iwsdk/core` (D §3.2, §5).
- IWSDK has no animation player and no behaviour system (D §1, §3.6).
- Table placement needs raw WebXR (`frame.detectedPlanes`, `frame.createAnchor`); IWSDK's own anchor holds only the reference-space origin (D §4.3).
- Vite copies all of `public/` into the build (D §5).

Not verified: anything on a Quest; plane permission and labels; persistent anchors; multiview and custom shaders; eye-tracking absence on Quest 3 and 3S (D §8).

## 10. Open points

Lead decisions (Agent 0):

| Point | Detail |
|---|---|
| Home of shared pure types | `Blueprint`, `PartDefinition`, `SolverInput` and `SolveResult` are used by L0, L1 and L2. The solver must be able to import them without importing engine code, and `src/sim` must not import `src/content` (rule in section 4.1). A shared pure types file defined before parallel work starts satisfies both (AGENT_WORKFLOW: define shared interfaces first). |
| Folders for gameplay, save and validator | TECH §4 sketches `src/gameplay/**` and `src/data/**`. ADR-017 keeps the CLAUDE.md §10 folders. The unnamed modules need folders before their agent starts. |
| XR text and panel technology | Undecided (section 3.2). Fonts must be self-hosted (ADR-025). |
| `SaveV1` shape | TECH §16 and SAVE §3 differ (conflict I-11). A lead ADR is needed before save and load are built. |
| ADR for the engine v2 contract and ADR for `SaveV2` | Proposed as "H" and "G" in [audit A](audits/A_DOCUMENTATION.md) §4.2. Neither is recorded in [DECISIONS.md](DECISIONS.md). Neither is needed for G0. Both are needed before any G2 or G5 code. |

Owner decisions pending ([PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)):

- **Decision 4, shared material library.** Decided on 2026-11-06: ADR-032 is accepted, and the owner can still reverse it. The shared library is a dependency of the asset management row and of cross-world reuse.
- **Decision 2, Quest tester.** Owner decision pending. Every Quest-level verification stays Blocked until it is answered.
- **Decision 1, original Technical Design Doc.** Owner decision pending. Until it arrives, the listed docs plus the accepted ADRs are the specification (CLAUDE.md §3).

## 11. Acceptance criteria

1. Every module in directive Part 11 appears in section 3.1 with a label, a state, a spec and a code home.
2. No row claims a state that `src/` does not show on the date above.
3. No G1 to G5 item is labelled G0-required. Every post-G0 cell in section 6 is a proposal.
4. The dependency rules in section 4 can be checked by lint, test environment or review, and `src/sim` keeps no engine import.
5. Every seam in section 7 except the labelled proposal (seam 8) cites a G0 source, and every seam states its cost.
6. No count of assets appears here; counts come from `assets/manifest/glb-manifest.json` and `node tools/asset-status.mjs`.
7. TECH is linked and not duplicated.
