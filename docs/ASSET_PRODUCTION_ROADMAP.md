# Wound Up — Asset Production Roadmap

**Project:** Wound Up
**Label:** G0 (competition build) in sections 4 to 9; later labels only in section 10, as a backlog that is not scheduled.
**Status:** Proposal for the lead's approval. Every date below is a proposal measured against the internal code freeze (2026-11-16) and the internal deadline (2026-11-18, IST). Effort figures are estimates from audit E and are replaced by measurements at the pilot gate. Nothing here is verified on a Quest 3 or Quest 3S; no headset and no tester exist.
**Date:** 2026-11-06
**Authority:** Directive Parts 3, 8, 13 (phases 4 to 7); [DECISIONS.md](DECISIONS.md) ADR-026, ADR-027, ADR-028, ADR-030 to ADR-037; [audit E](audits/E_BLENDER_PIPELINE.md) §1 and §5; [BUILD_ROADMAP.md](BUILD_ROADMAP.md) (lead-owned; this document does not change it).
**Related:** [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md), [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md), [ASSET_AGENT_ASSIGNMENTS.md](ASSET_AGENT_ASSIGNMENTS.md), [ASSET_QA_CHECKLIST.md](ASSET_QA_CHECKLIST.md), [BLENDER_PRODUCTION_GUIDELINES.md](BLENDER_PRODUCTION_GUIDELINES.md), [ASSET_OPTIMISATION_BUDGET.md](ASSET_OPTIMISATION_BUDGET.md), [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md), [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md)

## 1. Rules of this roadmap

1. **Order.** Pipeline framework first, then a five-asset pilot, then the competition families in dependency order, then G0-optional, then the future backlog (directive Part 13, phases 4 to 7).
2. **No mass production before the inventory and the pilot** (directive Parts 8 and 13). Production starts per family only after the pilot gate passes (CLAUDE.md §10).
3. **Competition first.** Only G0 assets are made before delivery. G1 to G5 and Research are documented, not built (ADR-028 rules 3 and 4).
4. **Protected and cut features.** The Clock Tower, then day/night, are cut first; the daily repair is protected and adds no asset (ADR-027: it reuses the machines and parts the game already has).
5. **Counts come from tools.** Totals, progress and owners are read with `node tools/asset-status.mjs`; this document names assets by id and never copies counts.
6. **Verification levels stay separate.** Desktop, IWER, Quest Browser, physical Quest 3 and physical Quest 3S are different levels. Nothing here is hardware-verified.
7. **One machine fully proven before mass production.** After the pilot (Gate P), the Music Box must pass the end-to-end milestone of section 5 (Gate M) before any other machine family scales (owner decision, 2026-11-06; ADR-039 decision 6: "One world at a time, one machine fully proven before mass production").

## 2. Where things stand

| Area | State |
|---|---|
| GLBs | Two exist, `gear_spur_16_m1` and `tockton_base_round`, both as M0 files at their old paths, both REWORK_REQUIRED. Nothing is VALIDATED or INTEGRATED (run the status tool for the live figures) |
| Pipeline framework | Not built: runner, shared Blender library, material library, vertex-AO helper, empties writer, contact-sheet helper, validator ([BLENDER_PRODUCTION_GUIDELINES.md](BLENDER_PRODUCTION_GUIDELINES.md) §4.2) |
| Runtime | No material registry, no `userData.wu` reader, no solver-driven rotation system, no `?perf` probe |
| Manifest | Complete for what the documents support. Schema v1 lacks generator parameters and structured sockets, origins and colliders |
| Open owner decisions | [2](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner) tester, 3 second validator, 5 module and tooth set. Decision 4, shared materials, was answered on 2026-11-06 (ADR-032) |
| Open lead gaps | G-07 and G-08 footprints, G-12 blueprint data (sockets), G-06 stand against town base |
| Blocked entries | Listed by the status tool; each carries its `blockedBy` reason |

## 3. Capacity and effort rates

Machine side, measured (audit E §1): up to 8 CPU-only and 4 GPU Blender processes at once; a 4,000-triangle part builds and exports in 1.2 to 3.1 s, vertex AO takes 1.7 s, a family sheet costs 7.6 s (EEVEE draft) to about 33 s (Cycles final). Machine time was about 2 % of the old cost per asset and is not the limit.

Agent side, estimated (audit E §5.4 and §5.6; **not measured**): the old method cost about 90 minutes and 365k tokens per asset.

| Class | Meaning | One-off work | Per asset afterwards |
|---|---|---|---|
| A1 | New manifest line for an existing generator | none | 1 to 2 min, 5 to 10k tokens |
| A2 | New parametric family or member | 150 to 350 lines, 25 to 45 min and 80 to 150k tokens per new family | 1 to 3 min, 5 to 10k tokens |
| B | Kit-built building or prop | kit of 400 to 800 lines, 2 to 3 h | 8 to 15 min, 30 to 50k tokens |
| C | Bespoke hero | 300 to 700 lines each | 60 to 90 min, 150 to 300k tokens |
| D | Character or automaton | figure kit of 300 to 500 lines, 1.5 h | 10 to 20 min, 30 to 60k tokens |
| E | Small prop (after the kit) | none | 5 to 10 min, 15 to 30k tokens |

Planning assumptions (audit E §5.6): 9 working days from 6 to 14 November, 15 November for integration, 16 November the freeze; 5 effective agent-hours per day per agent; the framework needs 8 to 12 agent-hours before any family can run; 3 Blender agents give about 123 agent-hours after the framework. Blended yield is 4.8 assets per agent-hour raw and about 3.2 after 50 % rework and review. These are upper bounds from unmeasured rates. The effort for the competition set from the same rates is in MASTER_ASSET_INVENTORY §12.

What really limits delivery (audit E §5.6): the exact specification per asset (sizes, counts, sockets), visual review of contact sheets, runtime integration (material registry, `wu` reader, sockets), and the difference between distinct files and instances. A flat "10 times cheaper per asset" holds for classes A1, A2 and E, is borderline for B and D, and does not hold for C.

## 4. Stage F: pipeline framework (6 to 7 November)

Owner: Asset framework agent, with the lead for the items marked lead.

| # | Deliverable | Owner |
|---|---|---|
| F1 | `blender/scripts/lib/`: geometry helpers moved out of the gear and base scripts (revolve, outline extrude, chamfer, boolean union), export profiles L, H, A and C, vertex-AO helper, empties writer, size-aware contact sheet, box-projected UV helper | Asset framework |
| F2 | `blender/scripts/forge.py` and `<family>.report.json`; rules R1 to R5 applied to `gen_gear_spur.py`, which then passes to the Mechanical library | Asset framework |
| F3 | Shared material library: constants-only `Mat_*` proxies for every name in `meta.materialLibrary`, and tileable textures in `public/assets/materials/`, at most 48 MiB | Asset framework; lead approves names |
| F4 | `tools/validate-glb.mjs` from the prototype, with V27 to V29, and the Vitest wrapper; `npm run assets:check` and the CI step | Asset framework; lead adds npm and CI |
| F5 | Manifest schema v2 fields (generator parameters, structured empties, origin rule, allow lists) | Lead, framework proposes |
| F6 | Runtime pieces the pilot needs for Stage 6: material registry that swaps proxies by name, `userData.wu` reader for colliders, pivots and sockets, a rotation system driven by an angle, a Draco-free loader configuration | Lead, Agent 2, Agent 4 |
| F7 | Questions to the owner: tester and date (decision 2), second validator (3), module and tooth set (5); shared materials (4) was answered on 2026-11-06 | Lead |

**Gate F (end of 7 November).** Passed when: the runner regenerates `gear_spur_16_m1` from its manifest entry into a scratch root with profile L and refuses a default path; the validator reports zero FAIL on that GLB and finds all six seeded defects of audit F §2.2 on the seeded copy; a three-gear contact sheet draws without overlap; every library name has a proxy. Opus reviews the framework design at this gate and nowhere else in this stage.

## 5. Stage P: pilot batch (7 to 8 November)

The directive asks for one mechanical component, one complex mechanical assembly, one building, one character or animated figure and one environmental prop, produced as real Blender sources and real GLBs and validated in the application (Part 13, phase 4). Chosen from the G0-required entries that are not BLOCKED:

| Slot | Asset id | Class and owner | What it proves | Open points |
|---|---|---|---|---|
| Mechanical component | `gear_spur_16_m1` | A1, Mechanical library | The family generator driven by a manifest entry; profile L; vertex AO; `COL_Grab`; the validator on a file known to fail today; the first M0 migration | Module token `m1` is the default pending decision 5 |
| Complex mechanical assembly | `governor_standard` | B, Mechanical library | A multi-node GLB with a root Empty, a rotating child (`Governor_Weights`) and a pivot at the shaft; linked-duplicate weights exported as shared mesh data; the pivot test (V41, AST-07); the first `wu` reader | Governor type is chosen at Stage 1 from the Parts Catalogue; no dependency |
| Building | `bakery_building` | C, Machines | A bespoke hero in the 25,000-triangle building category; `SOCKET_Baker`; the emissive oven slot; chimney anchor; vertex AO on flat walls (subdivision rule); the draw-call share | Footprint from the lead (gaps G-07, G-08); Bakery scope defaults to a static model (BUILD_ROADMAP §7) |
| Character | `figure_otto` | D, World | Figure kit; skeleton of at most 40 bones or rigid nodes; the `Otto_Knead` sampled clip and its mixer; the 1,500-triangle character category | Depends on `bakery_building`. Otto is the baker (owner decision of 2026-11-06, ADR-039; gap G-10 is closed) |
| Environmental asset | `tockton_base_round` | B, World | Profile H and the hero texture pool; regeneration of a shipped file; the before-Enter GLB budget; the second M0 migration | Decision 4 (accepted, ADR-032); gap G-06 (stand against town base) |

Why these: all five are on the competition path, none is BLOCKED, and between them they exercise every class of the framework (generator family, multi-node assembly with a pivot, building with a socket and emissive slot, clip export, hero textures). `tockton_base_round` is an environment set rather than a small prop, chosen because it already exists, fails its budget and gates the landing page's load time. Reserves, swapped in by the lead if a pilot entry is held for more than a day: `windmill_sails` for the assembly (needs `windmill_tower` first), `theatre_facade` for the building (no board), `parcel` for the prop.

Alongside the pilot, the Mechanical library adds `gear_spur_12_m1` and `gear_spur_24_m1` as manifest lines. They are not pilot slots; they measure the A1 rate and settle the open gear question for the 24-tooth gear: the retired helper mesh had 5,024 triangles against the 4,000-triangle gear ceiling, and the regenerated file has 3,712 ([ASSET_OPTIMISATION_BUDGET.md](ASSET_OPTIMISATION_BUDGET.md) §3).

**Checks the pilot must answer:** whether a mesh without `COLOR_0` renders wrongly after the material swap (BLENDER_PRODUCTION_GUIDELINES §8, inference); whether linked duplicates export as one glTF mesh; whether `ACTIONS` mode gives the clip name `Otto_Knead`; the real draw calls and texture memory of the five in the IWER scene.

**Measurement.** For every pilot asset and the two extra gears, record agent minutes, tokens, fix passes, validator FAIL and WARN lines, and machine time, in the handoff. Compare with the table in section 3.

**Gate P (end of 8 November).** Passed when all five GLBs are VALIDATED (zero FAIL) and load in the application at Desktop and IWER level, the two M0 files are migrated or have a dated plan, and the measured figures are within 2 times the estimates of section 3. If any is more than 2 times, scope is cut before more is spent (audit E §5.5) in the order of section 9, and this roadmap is re-dated. Opus reviews the measured cost and the pilot results here.

**Gate M: the Music Box end-to-end milestone (owner decision, 2026-11-06; [DECISIONS.md](DECISIONS.md) ADR-039 decision 6).** It comes after Gate P and before any other machine family scales: "One world at a time, one machine fully proven before mass production." The Music Box passes only when all eight of the owner's criteria hold:

1. All 12 approved component slots are defined.
2. Correct dimensions, pivots and socket positions.
3. GLB assets are generated and validated.
4. Parts are interactively assembled and snapped.
5. The mechanical solver correctly evaluates the assembly.
6. Winding produces the intended motion.
7. The completed Music Box can be placed in Tockton and triggers its awakening event.
8. Performance and memory budgets are measured.

What it holds back. The Windmill machine files (`windmill_base`, `windmill_tower`, `windmill_sails`, `windmill_millstone` of batch 3), the Carousel (batch 4) and the Clock Tower set (batch 6b) do not start until Gate M passes. This roadmap reads "machine families" as the Carousel, the Windmill with Bakery and the Clock Tower (families D, E, F). It therefore does not hold back the shared library files (family A) of batch 3, the Town batch, the Gift batch or the pilot; whether the owner meant to hold those too is risk 13 in section 11.

What it needs. Criterion 1 cannot be met today: `music_box_slot_11` and `music_box_slot_12` are BLOCKED on gap G-12 and on the owner's approval of their specifications (ADR-039 decision 5), and batch 1 and Gate C exclude them. Criteria 4 to 7 need the Music Box slice and the placement and wake code of BUILD_ROADMAP phases 3 and 4, and criterion 8 needs a measurement. Quest figures stay unverified until a physical Quest 3 or 3S test (ADR-039 decision 7). The owner gave no date, this roadmap invents none, and the lead dates Gate M. The recorded evidence is one line per criterion in the lead's handoff, in the manner of the other gates ([INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md) section 4.1).

## 6. Competition production: G0-required batches

Each batch is run per family by the owner named in the manifest (`owner`). Dependencies are those of the manifest and of MASTER_ASSET_INVENTORY §7: the shared library files must be VALIDATED before the machines that use them, housings are designed before their cylinder and comb, and every spur gear follows `gear_spur_16_m1`. Hours are estimates from section 3 (low to high, before the 50 % rework allowance), including one-off family generators and kits.

| Batch | Assets (ids) | Owners | Prerequisites | Hours | VALIDATED by |
|---|---|---|---|---|---|
| 1 Music Box slice and workshop kit | Library: `gear_spur_12_m1`, `gear_spur_24_m1`, `shaft_short`, `spring_standard`, `spring_worn`, `winding_key`, `bracket_support`. Machines: `music_box_case`, `cylinder_music_box`, `comb_music_box`. World: `trunk_main`, `workbench`, `parts_tray`, `parcel`, `letter_envelope`, `blueprint_sheet`, `machine_base_handle` | Mechanical library, Machines, World | Gate P; Music Box socket list from Agent 2 for `music_box_case` (gap G-12); `cylinder_music_box` and `comb_music_box` follow the case. This batch is the Music Box that Gate M proves | 8 to 13 | 10 Nov |
| 2 Town | `town_ground`, `theatre_facade`, `figure_mira` (G0-required since ADR-039; built with the figure kit of the pilot); `bakery_building`, `figure_otto`, `tockton_base_round` come from the pilot | World, Machines | Gate P; footprint table (G-07, G-08); decision on stand against base (G-06) | 2.2 to 3.3 | 10 Nov |
| 3 Windmill and library part 2 | Library: `gear_bevel_12`, `shaft_long`, `bearing_pillow_block`. Machines: `windmill_base`, `windmill_tower`, `windmill_sails`, `windmill_millstone` | Mechanical library, Machines | Batch 1 families (`shaft`, `structural`); **Gate M for the four `windmill_*` files** (the library files do not wait, risk 13); `windmill_sails` and `windmill_millstone` follow the tower and base | 2 to 3 | 11 Nov |
| 4 Carousel | `carousel_base`, `carousel_column`, `carousel_platform`, `carousel_canopy`, `carousel_horse`, `carousel_lamp` | Machines | Batch 3 library files; footprint table; **Gate M** | 2.5 to 4 | 11 Nov |
| 5 Gift | `gift_box` (`gift_engraving_plate` stays BLOCKED until gap G-09 is answered) | World | none | 0.1 to 0.2 | 11 Nov |

Pilot assets (about 3 to 4 hours, estimated): `gear_spur_16_m1`, `governor_standard`, `bakery_building`, `figure_otto`, `tockton_base_round`. Summed with the pilot, the batches agree with the G0-required effort estimate in MASTER_ASSET_INVENTORY §12 (same rates). Blocked entries (`music_box_slot_11`, `music_box_slot_12`, `run_lever`, `gift_engraving_plate`) are not scheduled; each has a decision that decides whether the file exists, and the lead records the decision in DECISIONS.md before work starts.

**Gate C (target 11 November evening, latest 12 November).** Every non-blocked G0-required entry is VALIDATED, or has a written reason and a new date. Each batch has its own gate: contact sheet reviewed, validator zero FAIL, WARN lines answered, handoff received, manifest merged by the lead ([ASSET_QA_CHECKLIST.md](ASSET_QA_CHECKLIST.md)).

## 7. G0-optional (12 to 14 November, only after Gate C)

Audit E §5.6: start G0-optional only when the G0 set has passed the QA gate. The order is the reverse of the cut order of BUILD_ROADMAP §16 and ADR-027 (Clock Tower, day/night, decoys, decorative details), so what is cut last is built first. Batch 6c is on no cut list because no feature needs it; it is built last or not at all.

| Batch | Assets | Hours | Notes |
|---|---|---|---|
| 6a Decoys and props | `gear_spur_10_m1`, `gear_spur_20_m1`, `gear_spur_36_m1`; `lantern_workbench` | 0.2 to 0.4 | Library gears can serve as decoys (inventory §11). The 36-tooth clay file is 259.8 KB, over the 250 KB gear ceiling (audit E §2.1); the 24-tooth gear fits since the generator rework (3,712 triangles, ASSET_OPTIMISATION_BUDGET §3); the 36-tooth gear has not been remeasured. Tooth set pending decision 5 |
| 6b Clock Tower | `clock_tower_base`, `clock_tower_shell`, `clock_face`, `clock_hands`, `clock_bell`, `pendulum_clock`, `escapement_wheel`, `escapement_anchor`, `cam_hourly_chime`, `spring_barrel` | 2.8 to 5.2 | Go or no go decided by the lead on 12 November from the state of Gate C, and not started before Gate M passes. Cut first (PRODUCT_SPEC §19, ADR-027). Gears for its trains are open (gap G-11, G-13) |
| 6c Library breadth | `pulley_standard`, `cam_eccentric`, `follower_roller`, `crank_standard` | 1.3 to 3.2 | No Must machine uses them; built only if time remains |
| Blocked, not scheduled | `town_houses`, `town_props_set` | n/a | Wait for the lead and owner on gap G-07 and for the owner to approve their specifications (ADR-039); ART §18 defers decoration. The flower shop was removed by the owner on 2026-11-06 |

## 8. Calendar against the freeze

Dates are proposals. The BUILD_ROADMAP column shows the integration phase each batch feeds, with its target dates.

| Date | Asset work | Feeds (BUILD_ROADMAP) |
|---|---|---|
| Fri 6 Nov | Documents. Owner questions asked. Stage F starts | Phase 2 solver (5 to 7 Nov); Phase 3 opens (6 to 8 Nov) |
| Sat 7 Nov | Stage F completes; Gate F in the evening. Pilot Stage 1 proposals written in parallel | Phase 2A table placement (7 to 8 Nov) |
| Sun 8 Nov | Pilot built, exported, validated. Gate P in the evening. M0 migration | Phase 3 Music Box slice (6 to 8 Nov) can load the pilot gear and governor from here |
| Mon 9 Nov | Batches 1 and 2 | Phase 4 town (8 to 9 Nov) |
| Tue 10 Nov | Batches 1 and 2 validated by evening. Batch 3 library part begins | |
| Wed 11 Nov | Batches 3, 4 and 5 validated by evening. Gate C | Phase 5 machines (10 to 11 Nov) |
| Thu 12 Nov | Gate C latest. Clock Tower go or no go. Batch 6a. Rework | Phase 6 gifting (12 Nov) |
| Fri 13 Nov | Batch 6b if go. Rework. Integration support | Phase 7 daily repair (13 Nov; adds no asset) |
| Sat 14 Nov | Last day for new GLBs. **Asset freeze at end of day** | Phase 8 polish (14 Nov) |
| Sun 15 Nov | Asset checks on the built preview (AST-11, AST-12). Quest session if a tester exists | Phase 9 QA (15 Nov), tasks TP-5 and QA-1 |
| Mon 16 Nov | **Code freeze.** No new asset. Critical rework only (CLAUDE.md §2) | Phase 10 |
| Tue 17 Nov | Deployment check: every asset URL returns 200 under a sub-path, bytes equal the manifest | Phase 11 submission preparation |
| Wed 18 Nov | Final check before midnight IST | Phase 12 final buffer and submission |

**Gate M is not in this calendar.** The owner's milestone of 2026-11-06 arrived after these dates were set. The dates of the Windmill machine files, the Carousel and the Clock Tower set (batches 3, 4 and 6b) are therefore conditional on Gate M, and the lead re-dates them when Gate M has a date. Until then they are the earliest dates, not commitments.

**The dates do not line up with BUILD_ROADMAP phases 3 to 5.** Those phases were dated before the asset framework existed. On these dates the Music Box part set is VALIDATED about two days after Phase 3 ends, the trunk, workbench and town about one day after Phase 4 ends, and the Carousel and Windmill on the last day of Phase 5. BUILD_ROADMAP belongs to the lead. The lead decides whether to move those phases, or to integrate against the M0 gear, the M0 stand and the pilot assets in the meantime. Until then the shipped gear and stand keep working at their old paths (ADR-033).

## 9. Cut order and fallbacks (asset side)

1. **If the pilot costs more than 2 times the estimate:** stop all G0-optional work, then build the heroes from the shared kit as well as the smaller classes (audit E §5.6: a true 10 times needs the class C heroes kept to G0 only, or built from the kit), and re-date this roadmap.
2. **Cut order if time runs out** (BUILD_ROADMAP §16, ADR-027, applied to assets): batch 6c is never started unless everything else is done, because no feature needs it. Then (1) the Clock Tower set (batch 6b); (2) day/night, which has no asset to cut; (3) decoy parts, which use library gears, so only the extra gears of batch 6a go; (4) non-essential decorative details: `lantern_workbench`, then extra nodes of the housings. `figure_mira` is G0-required (ADR-039) and is not on this list.
3. **Never cut without the owner:** a G0-required entry is simplified (fewer unique nodes, one horse design, fewer lamps) before it is dropped; relabelling or deleting one needs a DECISIONS.md entry and the owner told (ADR-028). `spring_worn` and the gear set are protected because the daily repair and the repairs depend on them.
4. **If the owner reverses the shared material library (decision 4, accepted on 2026-11-06 as ADR-032):** one texture atlas per machine; budgets and the library deliverable F3 are redone (ADR-032 consequences), and the schedule moves by the time to rebuild the family generators' texture step.
5. **If the validator or the runtime registry slips:** assets stay EXPORTED, not VALIDATED or INTEGRATED. No status is raised on the strength of a render.

## 10. Future backlog (not scheduled)

Nothing here starts before the competition build is delivered (ADR-028 rule 3; directive Part 13, phase 7). The only exception is a reusable shared asset the owner explicitly approves because it does not delay submission (ADR-028 rule 4).

| Label | Content | State |
|---|---|---|
| G1 Living Tockton | Resident behaviour, building dependencies, events, production chains | No asset entries; documented only |
| G2 Advanced engineering | `ratchet_wheel`, `pawl_standard`, `flywheel_standard`, `coupling_rigid`, `worm_gear` (priority 11) | Manifest entries under `assets/future/shared/`; not built |
| G3 Creative sandbox, G4 Community | Free-build components, blueprint sharing | No entries |
| G5 Clockwork universe | The worlds after Tockton, in the directive's production order: 2 Brasswater Harbour, 3 Emberforge Mountains, 4 Verdant Observatory, 5 Aetherian Skyworks, 6 Grand Mechanical Theatre (world 1 is Tockton, the only competition world; directive world-by-world strategy) | Proposals in [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md); no manifest entries until the owner approves a world |
| Research | Belts, other open items | Unassigned |

When a world is approved it gets its own bible and inventory, and the previous world is finished and validated first; worlds are never produced in parallel. The framework of section 4 (material library, runner, validator, manifest) is the asset part of the shared foundation each world reuses; it is the reason it is built once and first. Each world's assets reuse the shared mechanical library: no duplicate common part without a written reason, parameterised geometry and runtime materials instead of copies, and separate geometry only where the design requires it ([MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md) section 3.8). A world is not complete because its assets are generated: it needs all eleven completion gates ([EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md) section 8.3).

## 11. Risks and decisions

| # | Risk or decision | Owner |
|---|---|---|
| 1 | Agent-time figures are estimates; the pilot gate replaces them | Lead |
| 2 | No headset and no tester: every Quest-level check stays Blocked. Book a tester before about 12 November (task TP-7) | Owner |
| 3 | Housing sockets need blueprint data that does not exist (gap G-12) | Lead, Agent 2 |
| 4 | Machine footprints do not fit the town (gaps G-07, G-08) | Lead |
| 5 | The manifest schema cannot yet carry generator parameters or structured empties (F5) | Lead |
| 6 | Runtime material registry and `wu` reader are not built; the pilot cannot reach Stage 6 without them (F6) | Lead, Agent 2, Agent 4 |
| 7 | Shared material library and vertex AO lose some per-asset texture detail (accepted on 2026-11-06, ADR-032; [decision 4](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)) | Owner |
| 8 | Gear module and tooth set decide the gear file count and the ids ([decision 5](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)) | Owner |
| 9 | The 36-tooth gear may exceed the gear ceiling (259.8 KB clay file against 250 KB, measured before the generator rework); the 24-tooth gear fits (3,712 triangles, 205,472 bytes) | Lead, Mechanical library |
| 10 | The validator prototype exists only in the session scratch folder (ADR-037) | Lead |
| 11 | Laptop thermals under sustained parallel Blender load are unverified | Asset framework |
| 12 | BUILD_ROADMAP phases 3 to 5 pre-date the asset dates (section 8) | Lead |
| 13 | Gate M (section 5) has no date, and the slots 11 and 12 it needs are BLOCKED. It is read here as holding back machine families D, E and F only; the owner may have meant the library, town and gift batches too | Lead, Owner |

## 12. Dependencies

- Owner decisions 2 to 5; lead gaps G-06, G-07, G-08, G-12, and the schema change F5.
- Stage F before any family other than the pilot; Gate P before batches 1 to 5; Gate M before the Windmill machine files, the Carousel and the Clock Tower set.
- The runtime pieces F6 before any asset can be INTEGRATED.
- `tools/asset-status.mjs` for progress; the validator for VALIDATED.

## 13. Acceptance criteria

1. Every stage and batch has a named owner, a date and an objective gate; no gate depends on a number typed by hand.
2. Gate F, Gate P, Gate M and Gate C are each recorded in the lead's handoff with the evidence the QA checklist names. Gate M records the eight criteria of section 5 one by one.
3. At the asset freeze, `node tools/asset-status.mjs` shows every G0-required, non-blocked entry VALIDATED or INTEGRATED, or shows a written reason and the lead's decision for each exception.
4. No document, report or status claims Quest Browser, Quest 3 or Quest 3S verification without a named tester's evidence.
5. No G1 to G5 or Research asset is made, and no GLB for a world other than Tockton is under `public/`, before delivery.
