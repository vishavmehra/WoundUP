# Wound Up — World Asset Inventory

**Project:** Wound Up
**Label:** Tockton: G0 competition build. Future worlds: G5 Clockwork universe, **proposal only**. Read the scope firewall in [DECISIONS.md ADR-028](DECISIONS.md) first.
**Status:** Tockton is inventoried in full in the manifest. No future world is approved, so none has manifest entries.
**Date:** 2026-11-06
**Source:** [directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md), multiple-worlds requirement and world-by-world production strategy
**Related:** [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md), [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md), [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md), [DECISIONS.md](DECISIONS.md) ADR-028, ADR-033, `MULTI_WORLD_UNIVERSE_DESIGN.md`, `WORLD_REGISTRY_AND_LOADING.md`

## Dependencies

- `assets/manifest/glb-manifest.json` and `tools/asset-status.mjs` for every Tockton count; [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md) for the item-by-item list; [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md) for the fields.
- Decisions: ADR-028 rule 4 (no future-world entries or assets before the owner approves a world), ADR-029 (specification over reference boards) and ADR-033 (world ids and folders).
- Source: the directive's multiple-worlds requirement §7 to §9 and the world-by-world production strategy.
- Owner decisions listed in section 7: which world is second, shared assets made early, and board names for residents. All are pending.
- [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) §8 for how future-world files stay out of the competition build.

## 1. Scope

Tockton is the only world required for the competition build (directive, multiple-worlds requirement §9). Every other world is future expansion content and does not change the November 2026 scope.

- **Tockton and the shared mechanical library** are listed in full, by reference to the manifest (section 2).
- **Future Tockton generations (G1 to G4)** get a family-level outline (section 4). Only 5 shared G2 mechanical parts have manifest entries.
- **Proposed future worlds** get a family-level outline only (section 5). No asset is itemised, no count is given, and no file is made before the owner approves a world and the competition build is stable. The only exception the directive allows is a reusable shared asset the owner approves explicitly and that does not delay the submission (ADR-028 rule 4).

Each world gets its own bible and asset inventory when it is approved for production (directive, multiple-worlds requirement §8). Future worlds use the shared mechanical library and are produced one world at a time (owner decision of 2026-11-06, ADR-039).

## 2. Tockton: the full inventory

Tockton's inventory is the manifest: every entry with `worldId` `tockton` or `shared`. The master tables are in [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md) §5; the manifest is [`assets/manifest/glb-manifest.json`](../assets/manifest/glb-manifest.json).

| Family | Entries | Shared | Tockton | G0-required | G0-optional | Future |
|---|---:|---:|---:|---:|---:|---:|
| A Mechanical library | 19 | 19 | 0 | 12 | 7 | 0 |
| B Trunk and workshop | 9 | 2 | 7 | 8 | 1 | 0 |
| C Music Box | 5 | 2 | 3 | 5 | 0 | 0 |
| D Carousel | 6 | 0 | 6 | 6 | 0 | 0 |
| E Windmill and Bakery | 5 | 0 | 5 | 5 | 0 | 0 |
| F Clock Tower and Theatre | 11 | 5 | 6 | 1 | 10 | 0 |
| G Tockton environment | 4 | 0 | 4 | 2 | 2 | 0 |
| H Characters | 2 | 0 | 2 | 2 | 0 | 0 |
| I Gift and presentation | 2 | 0 | 2 | 2 | 0 | 0 |
| J Future shared parts | 5 | 5 | 0 | 0 | 0 | 5 |
| **Total** | **68** | **33** | **35** | **43** | **20** | **5** |

Exact figures come from `node tools/asset-status.mjs`; see [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md) §8. Nothing here is validated, and nothing is verified on a Quest 3 or Quest 3S.

Folders (ADR-033): G0 shared files in `public/assets/models/shared/<family>/`, G0 Tockton files in `public/assets/models/tockton/<family>/`, everything else in `assets/future/<world_id>/<family>/`. Vite copies all of `public/` into the build, so a GLB under `public/` must be G0 in the manifest; the lead adds a CI check that fails otherwise.

## 3. Shared and reusable assets

`shared` means world-neutral design (the mechanical library and a few interaction handles). `reuseEligible` means another world could use the file unchanged. At Tockton time 39 of 68 entries are reuse-eligible (34 G0, 5 G2). The manifest field `scopeClass` turns these two flags and the label into the directive's four classes: shared assets, world-specific assets, reused assets (a world's file that another world may use unchanged) and future planned assets ([GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md) section 4). Each class counts unique deliverables only.

| Family | G0 reuse-eligible entries |
|---|---|
| A Mechanical library | `gear_spur_16_m1`, `gear_spur_12_m1`, `gear_spur_24_m1`, `gear_spur_10_m1`, `gear_spur_20_m1`, `gear_spur_36_m1`, `gear_bevel_12`, `shaft_short`, `shaft_long`, `spring_standard`, `spring_worn`, `governor_standard`, `winding_key`, `bearing_pillow_block`, `bracket_support`, `pulley_standard`, `cam_eccentric`, `follower_roller`, `crank_standard` |
| B Trunk and workshop | `workbench`, `parts_tray`, `blueprint_sheet`, `machine_base_handle`, `lantern_workbench`, `run_lever` |
| C Music Box | `cylinder_music_box`, `comb_music_box` |
| F Clock Tower and Theatre | `pendulum_clock`, `escapement_wheel`, `escapement_anchor`, `cam_hourly_chime`, `spring_barrel` |
| I Gift and presentation | `gift_box`, `gift_engraving_plate` |

This is a judgement made while only Tockton exists. Each future world must re-confirm reuse against its own art direction, and must not duplicate gears, shafts, bearings, springs, connectors or other common parts without a documented reason (directive, world-by-world strategy, "Asset reuse"). The same section asks for parameterised geometry and runtime material configuration where appropriate, and separate geometry only when the design genuinely requires it. Here that means: a size or tooth count is a parameter of a family generator and a manifest entry, not a hand-made copy (ADR-031); a finish or colour is a runtime material, so a new look is a new material, not a new file (ADR-030, ADR-032). A new world makes its own geometry only when its design needs a shape the shared library cannot give, and says why in the entry's `distinctBecause` and in the world's inventory (acceptance test WLD-06 in [MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md) section 3.6, and section 3.8).

Tockton-specific files (`worldId` `tockton`): 35 entries. They carry Tockton's identity: the trunk, the four machines' housings, the town ground and buildings, and the two figures, Otto the baker and Mira ([TOCKTON_CHARACTERS.md](TOCKTON_CHARACTERS.md)).

## 4. Future Tockton generations (family-level outline, no entries)

Labels are the ADR-028 labels. Every line is a **proposal** drawn from the directive (Parts 2, 5.2 and 10) and IDEAS.md; nothing is approved and nothing is built before the competition build is delivered.

| Label | Source | Asset families it would need | Manifest |
|---|---|---|---|
| G1 Living Tockton | Directive Part 2 pillar A, Part 10; IDEAS §4.1, §4.4 | More residents and their props (family H), more buildings and districts (G), animated town props, event props. Seasonal decoration appears in IDEAS §4.4 but is on the CLAUDE.md §14 list for the competition build. | None |
| G2 Advanced engineering | Directive Part 10; IDEAS §4.3 | Library breadth: `ratchet_wheel`, `pawl_standard`, `flywheel_standard`, `coupling_rigid`, `worm_gear` (entered). Later: multi-stage transmission parts, gauges and test rigs for fault diagnosis, new machine families. | 5 entries |
| G3 Creative sandbox | Directive Part 2 pillar D, Part 10; IDEAS §4.6 | The shared mechanical library as free-build components, a free-build workshop, shelves for saved inventions. Free-build is excluded from the competition build (CLAUDE.md §14). | None; reuses family A |
| G4 Community | Directive Part 10; IDEAS §4.5 | Mostly interface and web. Gallery and challenge display props are possible. Accounts and cloud save are excluded from the competition build. | None |
| Research | Directive Part 10 | Not assigned. | None |

## 5. Proposed future worlds (family-level outline, no entries)

All five are **G5 Clockwork universe, proposal**. The production order is 1 Tockton (the competition world, section 2), 2 Brasswater Harbour, 3 Emberforge Mountains, 4 Verdant Observatory, 5 Aetherian Skyworks, 6 Grand Mechanical Theatre, one at a time, each finished and validated before full production starts on the next (directive, world-by-world strategy). Worlds are not developed simultaneously. The directive calls them strategic concepts, "not approved immediate implementation tasks". The ids are the ones the directive suggests for folders.

### World 2: Brasswater Harbour (`brasswater-harbour`)

- **Theme:** A mechanical harbour powered by water, tides, steam and maritime machinery.
- **Places named in the directive:** Mechanical lighthouse, shipyard, water-powered workshops, harbour cranes, floating platforms, mechanical submarines, tide observatory, ship repair station.
- **Unique mechanics named in the directive:** Water wheels, pumps, pressure systems, hydraulic linkages, floating mechanisms, tide-dependent machinery, ship navigation mechanisms.
- **Extends the shared engine with:** Hydraulic systems, pumps and water flow (directive, world-by-world strategy). These must extend the shared simulation through documented interfaces, not duplicate it.
- **Note:** The lighthouse is on the CLAUDE.md §14 list for the competition build; it belongs to this world, not to Tockton.
- **Asset families it would need (no count, no list):** environment and architecture; its machine and building set; its residents and automata; world-specific mechanical parts that do not exist in the shared library; wake or restoration presentation props. Gift and workshop assets are reused from Tockton.
- **Reuses from the shared library:** gears, shafts, springs, bearings, brackets, the winding key, the base handle and the Run lever, unless a documented reason says otherwise.

### World 3: Emberforge Mountains (`emberforge-mountains`)

- **Theme:** A mountain industrial settlement powered by steam, furnaces and mining systems.
- **Places named in the directive:** Mountain foundry, mining facilities, ore transport, mechanical lifts, furnace rooms, steam-powered locomotives, underground workshops, giant drilling machines.
- **Unique mechanics named in the directive:** Steam pressure, thermal systems, pistons, pressure valves, heavy transmissions, industrial energy distribution, complex machine sequencing.
- **Extends the shared engine with:** Pressure, pistons and foundry machinery. These must extend the shared simulation through documented interfaces, not duplicate it.
- **Note:** The steam tram is on the CLAUDE.md §14 list for the competition build.
- **Asset families it would need (no count, no list):** environment and architecture; its machine and building set; its residents and automata; world-specific mechanical parts that do not exist in the shared library; wake or restoration presentation props. Gift and workshop assets are reused from Tockton.
- **Reuses from the shared library:** gears, shafts, springs, bearings, brackets, the winding key, the base handle and the Run lever, unless a documented reason says otherwise.

### World 4: Verdant Observatory (`verdant-observatory`)

- **Theme:** An astronomical and botanical world where clockwork instruments run observatories and gardens.
- **Places named in the directive:** Astronomical observatory, planetarium, mechanical greenhouse, celestial clock, botanical laboratories, star-tracking tower, mechanical garden.
- **Unique mechanics named in the directive:** Planetary gear systems, orbital mechanisms, precision timing, telescopic assemblies, tracking systems, light and shadow mechanisms, astronomical clocks.
- **Extends the shared engine with:** Planetary gearing and precision timing. These must extend the shared simulation through documented interfaces, not duplicate it.
- **Note:** The observatory appears in IDEAS §4.2 as a deferred idea.
- **Asset families it would need (no count, no list):** environment and architecture; its machine and building set; its residents and automata; world-specific mechanical parts that do not exist in the shared library; wake or restoration presentation props. Gift and workshop assets are reused from Tockton.
- **Reuses from the shared library:** gears, shafts, springs, bearings, brackets, the winding key, the base handle and the Run lever, unless a documented reason says otherwise.

### World 5: Aetherian Skyworks (`aetherian-skyworks`)

- **Theme:** An elevated civilisation of floating workshops, airships and airborne machines.
- **Places named in the directive:** Airship docks, floating workshops, cloud observatories, mechanical flight laboratories, giant propeller systems, sky bridges, airborne factories.
- **Unique mechanics named in the directive:** Propellers, rotational balancing, flight control linkages, gyroscopic systems, multi-stage transmissions, aerodynamic experimentation, complex moving structures.
- **Extends the shared engine with:** Propellers, gyroscopes and flight mechanisms. These must extend the shared simulation through documented interfaces, not duplicate it.
- **Note:** The hot-air balloon is on the CLAUDE.md §14 list for the competition build.
- **Asset families it would need (no count, no list):** environment and architecture; its machine and building set; its residents and automata; world-specific mechanical parts that do not exist in the shared library; wake or restoration presentation props. Gift and workshop assets are reused from Tockton.
- **Reuses from the shared library:** gears, shafts, springs, bearings, brackets, the winding key, the base handle and the Run lever, unless a documented reason says otherwise.

### World 6: Grand Mechanical Theatre (`grand-mechanical-theatre`)

- **Theme:** A world of automata, performance and mechanical storytelling, including player-created shows.
- **Places named in the directive:** Grand theatre, puppet workshops, mechanical orchestra, automated stages, clockwork ballet, performance laboratories, grand mechanical exhibition.
- **Unique mechanics named in the directive:** Sequenced movement, cam-based choreography, multiple synchronised mechanisms, mechanical automata, trigger networks, timing and performance systems.
- **Extends the shared engine with:** Synchronisation and coordinated automata. These must extend the shared simulation through documented interfaces, not duplicate it.
- **Note:** Choreography and the grand theatre performance are on the CLAUDE.md §14 list. Tockton's theatre facade (`theatre_facade`) is only a static front.
- **Asset families it would need (no count, no list):** environment and architecture; its machine and building set; its residents and automata; world-specific mechanical parts that do not exist in the shared library; wake or restoration presentation props. Gift and workshop assets are reused from Tockton.
- **Reuses from the shared library:** gears, shafts, springs, bearings, brackets, the winding key, the base handle and the Run lever, unless a documented reason says otherwise.

## 6. How a world enters the manifest

A world gets entries only after all of these:

1. The owner approves the world and the competition build is stable (ADR-028 rule 4). The approval is recorded in [DECISIONS.md](DECISIONS.md).
2. The world has the written gates that come before its assets: its design bible, environment and layout specification, machine and building inventory, resident and character inventory, story and quest specification, unique mechanical features, performance budgets and gameplay acceptance tests. Its asset manifest and its Blender sources and GLBs (gates 7 and 8) are what steps 3 to 5 produce, and its integration and release checklist (gate 11) closes it. The eleven gates are listed in [EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md) section 8.3 (directive, world-by-world strategy, "World completion gates").
3. Its asset inventory is written from the same rules as [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md): distinct files only, no finish or colour variants, shared parts reused, every entry traced to a spec or board.
4. Entries use `worldId` set to the world id, label G5 until the world is scheduled, and the path `assets/future/<world_id>/<family>/`.
5. The first new world is built as a complete vertical slice to validate asset reuse and memory (directive order, multiple-worlds requirement §8).

A world's GLBs move under `public/` only when that world ships. ADR-033's CI rule allows only `tockton` and `shared` there today, so the lead must amend ADR-033 and the CI check, and say how labels change, when the first non-Tockton world is scheduled. This inventory does not decide that.

A world is not complete because its assets exist (directive, world-by-world strategy); it needs the gates in step 2 and an integration and release checklist.

## 7. Open points for the owner

- **Which world is second?** The directive's order starts with Brasswater Harbour. Nothing is approved. Owner decision pending; no work starts on it.
- **Shared assets made early.** The 5 G2 entries are listed but not approved. If the owner wants any made before the competition ships, ADR-028 rule 4 requires an explicit approval that records they are reusable shared assets and do not delay the submission.
- **Board names for residents** (Oswald, Elias, Luna, Pip, Clack, Tinkerer) stay out of Tockton unless the owner approves them (ADR-029, ruling I-8). They may suit a later world or generation.
- **Multi-world save and loading** (SaveV2, world registry, unloading a world's assets) are separate documents and are not decided here.

## 8. Acceptance criteria

1. Tockton's inventory equals the manifest entries with `worldId` `tockton` or `shared`.
2. No manifest entry has a `worldId` other than `shared` or `tockton`, and none has a future-world path.
3. No future world has a count, an asset list or a GLB.
4. Every future-world statement is labelled proposal and cites the directive.
5. No G1 to G5 item is described as competition required.
