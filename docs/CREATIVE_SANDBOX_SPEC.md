# Wound Up — Creative Sandbox Specification

**Project:** Wound Up
**Label:** G3 Creative sandbox. Design intent only: not built, not scheduled, not competition scope. The free-build workshop is excluded from the competition build by CLAUDE.md §14 and PRODUCT_SPEC §18. Read the scope firewall in [DECISIONS.md](DECISIONS.md) ADR-028 first.
**Status:** Proposal. Nothing here is approved for production or added to any task list. Open owner points are in section 10.
**Date:** 2026-11-06
**Source:** [directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) Part 2 (pillar D), Part 10 (Generation 3); IDEAS §4.6; DATA_AND_BLUEPRINT_SPEC §4, §7, §13; MECHANICAL_SOLVER_SPEC §4, §8, §10; ADR-008, ADR-009, ADR-030, ADR-031, ADR-034
**Related:** [BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md), [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md), [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md), [DATA_AND_BLUEPRINT_SPEC.md](DATA_AND_BLUEPRINT_SPEC.md), [MECHANICAL_SOLVER_SPEC.md](MECHANICAL_SOLVER_SPEC.md), [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md), [INTERACTION_SPEC.md](INTERACTION_SPEC.md), [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md), [IDEAS.md](IDEAS.md)

## 1. What the competition build needs from this document

No sandbox feature, hook, menu entry or placeholder is built before delivery (CLAUDE.md §14; ADR-028 rule 3).

Five existing rules keep G3 possible later. None is new:

1. Part ids and asset ids never change once used, because saves, gifts and future inventions reference them (DATA_AND_BLUEPRINT_SPEC §4.1; ADR-033).
2. Blueprints are validated data, and a validator already exists in the plan (DATA_AND_BLUEPRINT_SPEC §13).
3. The solver is pure and deterministic and works on any validated graph, not only the four machines (ADR-008; MECHANICAL_SOLVER_SPEC §2).
4. Parts are parametric Blender GLB families, cached and instanced. They are the future component library (ADR-031; [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) section 4).
5. A finish is a runtime material, so one part GLB serves every look (ADR-030).

IDEAS §4.6 warns that free-build "would require additional validation and could undermine the curated puzzle experience". That warning stands: G0's curated loop is not weakened for this.

## 2. Directive requirements and labels

| Directive item | Label | Where |
|---|---|---|
| Free-build workshop, modular parts, player-designed mechanisms, blueprint editor, machine validation, saved inventions | G3 | This document |
| Simulation preview, fault diagnosis, advanced machinery | G2 Advanced engineering. The sandbox uses them but does not define them | [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md) §6.4, §6.6 |
| Shareable blueprints, community challenges, future gallery | G4 Community | [BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md) |

CLAUDE.md §14 and PRODUCT_SPEC §18 items this document touches. All stay excluded from G0:

| Excluded item | Status in this document |
|---|---|
| Free-build workshop | The subject of G3. Excluded from G0 |
| Text keyboards in VR | Not used. Inventions are named from presets or numbered (section 5) |
| Melody composition, editing music pins, carving cams, choreography | Not part of G3 as the directive lists it (directive Part 2 pillar D, Part 10). They stay excluded until a separate owner decision |
| Rarity tiers, shop, currency, XP | Not used for unlocking parts (section 6) |
| Leaderboards, accounts, cloud save | G4 and owner decisions; see [BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md) |

## 3. Principles

1. The sandbox is a separate mode. It reuses the Build mode rules, hand interactions, Easy Snap and gaze-and-pinch (GAMEPLAY_SYSTEMS §3.2, §8; PRODUCT_SPEC §16; ADR-036). Every sandbox action works seated, with hands only, within about 60 cm of the chest (ADR-014; PROJECT_BIBLE §2).
2. Mechanics are never physical simulation. Behaviour comes from the deterministic graph solver (ADR-008, ADR-009, REJ-001).
3. Players cannot build something the shipped catalogue and the solver cannot describe. There are no custom meshes and no player-written code or text (CLAUDE.md §14, §16).
4. A sandbox invention is a blueprint and goes through the same validator and solver as a curated one (DATA_AND_BLUEPRINT_SPEC §13, §18).

## 4. Free-build model (proposal)

### 4.1 Workspace

A baseplate sits on the workbench. It fits the workbench footprint of about 45 x 25 cm (PROJECT_BIBLE §2). The valid build volume is a fixed box above the plate, so reach limits hold (INTERACTION_SPEC §3, §19).

### 4.2 Parts attach only at attachment points

Every placeable part exposes typed attachment points as named helper nodes (`SOCKET_` nodes with the `wu` property, ADR-033), plus its `PIV_` pivot and `COL_` collider. A part snaps to a free attachment point on the baseplate or on an already placed part. There is no free-floating placement.

Reasons: placement is discrete and testable, snapping stays inside the Easy Snap radius of 7 cm (PRODUCT_SPEC §16), and mechanical relations can be read from data instead of guessed from mesh positions.

### 4.3 Connections are written down, not inferred from geometry

The solver requires explicit connections with enough parameters to fix the ratio and the direction (DATA_AND_BLUEPRINT_SPEC §7: "Do not allow ambiguous connections"; MECHANICAL_SOLVER_SPEC §8.3: do not infer belt behaviour from rendering geometry). The editor therefore creates a connection record when the player attaches parts, and the solver reads only the records:

| Player action | Record written | Check |
|---|---|---|
| Put a gear on a shaft attachment | `shaft` connection | Bore and shaft families match |
| Put two gears at adjacent lattice points | `mesh` connection with both tooth counts and the module | Same module, and centre distance m(z1 + z2) / 2 within a tolerance. A different module is a jam (MECHANICAL_SOLVER_SPEC §8.2) |
| Fit a belt over two pulleys | `belt` connection with both radii and the chosen routing | Pulleys exist and are in range |
| Seat a follower on a cam | `pin` connection | Profile data exists for that cam |

The lattice pitch comes from the gear module and tooth set. Both are owner decision pending ([PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) decision 5), so no pitch is fixed here.

### 4.4 Power and outputs

- Power uses the mainspring model of the curated machines: stored energy E = W x Eu, runtime T = E / D, at most eight wind units (MECHANICAL_SOLVER_SPEC §12). A sandbox invention needs at least one spring and one output.
- Outputs are the existing output parts: a rotating platform, a cylinder with a comb, a follower, a pendulum, a figure (the part families in DATA_AND_BLUEPRINT_SPEC §4). The sandbox adds no new output kind.
- Ambient wind as a power source is a blueprint-defined input (MECHANICAL_SOLVER_SPEC §12.2) and is not offered to players.

### 4.5 Validation

The solver's four statuses apply (MECHANICAL_SOLVER_SPEC §4): `incomplete`, `runs`, `runs_wrong`, `jams`. Curated machines have targets; a free invention has none, so `runs_wrong` is meaningless there and the sandbox reports:

- parts with no connection to power (disconnected);
- a jam and where it is (`jamAt`);
- the output speeds and the run time;
- budget use (section 4.6).

Targets exist only in challenges ([BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md) section 6).

### 4.6 Budget limits

An invention must fit the scene ceilings of ADR-034: 200 draw calls, 750k visible triangles, 128 MiB of unique texture memory. Reuse is mandatory: every placed part is an instance of one cached GLB (ADR-031; CLAUDE.md §12). The validator counts the invention's parts, instances and estimated draw calls and refuses to run it above the limit. The numeric part cap is set after a Quest reading, because the ADR-034 values are provisional and no headset exists.

### 4.7 Editing tools

Place, remove, rotate in discrete steps, and undo and redo through a command stack. X-ray inspects a running invention (it never alters state, GAMEPLAY_SYSTEMS §15). A dry run before winding is the G2 simulation preview, which calls the same solver (MECHANICAL_ENGINE_V2 §6.6, rule C8). No tool needs a keyboard, voice or controller (CLAUDE.md §14; REJ-003).

## 5. Saved inventions

- An invention is the user blueprint data: a version, a baseplate id, and a list of placements with part ids, attachment ids and rotations. Connection records are rebuilt on load and checked, not trusted (section 7).
- Storage is local, through the save service only (ADR-010; SAVE_PERSISTENCE_SPEC §2). It lives in the shared part of the future save ([WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md) section 5). The number of inventions and the size of each are capped, because browser storage quotas on Quest Browser are unverified.
- Names come from presets or a counter. There is no free text.
- An invention is restored from its blueprint, never from runtime objects (SAVE_PERSISTENCE_SPEC §5).
- Sharing an invention is G4 and uses a new payload version, not the G0 gift ([BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md)).

## 6. Unlocking components

Parts become available through quests and discoveries ([STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) section 6), stored as part ids in the shared record. There is no shop, currency, rarity or XP (CLAUDE.md §14). Parts needing new solver behaviour wait for G2: `ratchet_wheel`, `pawl_standard`, `flywheel_standard`, `coupling_rigid` and `worm_gear` are the G2 shared parts already entered in the manifest. Their status comes from the manifest and `node tools/asset-status.mjs`, not from this document ([MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md); [assets/manifest/glb-manifest.json](../assets/manifest/glb-manifest.json)). The G0 solver supports five edge types only (shaft, mesh, belt, pin, trigger, MECHANICAL_SOLVER_SPEC §8), so a worm or a ratchet is a contract change owned by the lead (AGENT_WORKFLOW §14). [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md) §6.1 and §11 propose `worm` and `one_way` edges for them and leave the decision to the lead. An invention that needs such a feature lists it in `requires`, and a build that lacks the feature rejects the invention with a validation error (MECHANICAL_ENGINE_V2 rule C6).

## 7. Untrusted input

An invention is untrusted input wherever it comes from (a save, a shared link): CLAUDE.md §16 requires validation before loading. The validator checks, before any solver run:

- the version is known;
- every part id and attachment id exists in the shipped catalogue;
- the part count, coordinate range, rotation values and string lengths are inside fixed limits;
- no attachment is used twice;
- connection records match what the placements imply.

The solver then runs with a node and iteration cap, so a malicious graph cannot stall the page (MECHANICAL_SOLVER_SPEC §18). Failure shows an error state and loads nothing.

## 8. Dependencies

| Needs | Status |
|---|---|
| Delivered G0: solver, blueprints, validator, part library, save service | Not built yet |
| Gear module and tooth set (decision 5) | Owner decision pending |
| G2 solver extensions and the G2 parts | [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md), G2 proposal |
| Per-part attachment points in family A GLBs | Added to the generator contract when G3 is scheduled; the node convention already exists (ADR-033) |
| SaveV2 shared record | [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md) |
| Quest and discovery unlocks | [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) |
| A Quest measurement for the part cap | Blocked until a tester exists |

## 9. Fit with the curated game

Proposal: the sandbox is offered only after the curated Tockton story, from the workshop, so first-time players meet the curated puzzles first (IDEAS §4.6 concern). The condition is an owner decision (section 10).

## 10. Owner decisions pending

1. When the sandbox unlocks. Default: after the curated story.
2. Whether pin, cam or melody editing is ever wanted. Default: no; each needs its own decision.
3. The gear module and tooth set (decision 5).
4. Whether the sandbox lives in the same app. Default: same app, separate mode.

## 11. Acceptance criteria

Document checks:

1. G3 is stated at the top and the free-build exclusion for G0 is quoted.
2. Every CLAUDE.md §14 item touched is in the section 2 table.
3. Every concrete rule cites a specification, an ADR or a directive part, or is marked proposal.

Feature checks for G3 (proposal; added to ACCEPTANCE_TESTS.md only when G3 is scheduled). Nothing here is verified at any level; comfort and performance need a Quest.

| ID | Check | Level |
|---|---|---|
| SBX-01 | Every connection the solver sees was written by the editor; no connection is inferred from mesh positions | Desktop |
| SBX-02 | Two gears with different modules at adjacent points produce a jam, not a run | Desktop |
| SBX-03 | The same invention gives the same solver result on every run, and permuting the order of placements and connections does not change it (MECHANICAL_ENGINE_V2 rule D1) | Desktop |
| SBX-04 | A tampered invention (unknown id, out-of-range coordinate, duplicate attachment) is rejected before the solver runs | Desktop |
| SBX-05 | An invention over the budget cannot be run | Desktop |
| SBX-06 | Placing, removing and undoing work with hands, Easy Snap and gaze-and-pinch | IWER |
| SBX-07 | Saving and reloading an invention reproduces the same blueprint | Desktop |
| SBX-08 | The curated game's tests still pass with the sandbox module present | Desktop |
| SBX-09 | A 60 fps floor with an invention at the part cap | Quest Browser and physical Quest |
