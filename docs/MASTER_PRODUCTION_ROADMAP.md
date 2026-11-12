# Wound Up — Master Production Roadmap

**Project:** Wound Up
**Label:** G0 for sections 1 to 7 (the competition build). Section 8 covers G1 to G5 and Research: planning only, nothing in it is built before delivery ([ADR-028](DECISIONS.md)).
**Status:** Active. Dates marked "BR" come from [BUILD_ROADMAP.md](BUILD_ROADMAP.md). Dates marked "AR" come from [ASSET_PRODUCTION_ROADMAP.md](ASSET_PRODUCTION_ROADMAP.md), which is itself a proposal for the lead's approval. Dates marked "proposal" are this document's own. A proposal needs the lead's confirmation.
**Date:** 2026-11-06
**Authority:** [production directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) Parts 3, 7, 10, 12 and 13; CLAUDE.md §2 and §17; ADR-026 to ADR-037 in [DECISIONS.md](DECISIONS.md)
**Related:** [BUILD_ROADMAP.md](BUILD_ROADMAP.md) (the competition schedule), [ASSET_PRODUCTION_ROADMAP.md](ASSET_PRODUCTION_ROADMAP.md) (the asset pipeline, pilot and batches), [AGENT_OWNERSHIP_MATRIX.md](AGENT_OWNERSHIP_MATRIX.md), [INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md), [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md), [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md), [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md)

## 1. Purpose and rules

This is the one plan for the whole production: competition features, the 3D asset pipeline, the runtime and tooling work assets need, verification, release, and the generations after the competition. For every piece of work it says what, in which order, who, and what must be true before it counts as done.

1. `BUILD_ROADMAP.md` is the schedule for competition features and stays authoritative for G0 dates. This document quotes its phase numbers and dates ("BR Phase 3, Nov 6 to 8") and never copies its task tables. Its tasks (TP-1 to TP-7, DR-1, QA-1) are cited by ID.
2. `ASSET_PRODUCTION_ROADMAP.md` is the plan for the asset pipeline, the pilot and the batches. This document includes it by reference: it takes its stage names, batch numbers and dates, and does not redefine them.
3. This document adds what neither schedules: how the asset lane meets the code lane, the runtime and tooling work assets depend on, the hardware and release steps, and G1 to G5.
4. Scope does not change. G0 is what the specifications, ADR-026 and ADR-027 say. If the schedule slips, cut in the BR §16 order: Clock Tower, day/night toggle, decoy parts. The daily repair is simplified, never removed. Nothing labelled G1 to G5 or Research is built before the competition is delivered (ADR-028).
5. Status words are the BR §18 set: Not Started, In Progress, Blocked, Complete, Cut. Asset statuses are the manifest's nine ([GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md) §5). Verification levels stay separate: Desktop, IWER, Quest Browser, Quest 3, Quest 3S. Nothing in this repository is verified on a headset.
6. Gate names: "Build Gate A to D" are the build gates of `TESTING_QA_PLAN.md` §13. "Asset Gate F, P, M and C" are the pipeline gates of `ASSET_PRODUCTION_ROADMAP.md`. "AG1 to AG4" are per-asset gates. They are defined in [INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md).
7. Asset counts and progress are never typed here. Run `node tools/asset-status.mjs`; the manifest `assets/manifest/glb-manifest.json` is the source.
8. Task fields follow CLAUDE.md §2: priority, effort, dependencies, acceptance, agent, target date, status. Effort figures are estimates unless a source calls them measured. The pilot (AB-0) replaces them with measurements.

"E" and "F" mean [audit E](audits/E_BLENDER_PIPELINE.md) and [audit F](audits/F_QA_PERFORMANCE.md). A proposal is never settled fact.

## 2. Dates that do not move

| Date | Event | Source |
|---|---|---|
| Nov 6 | Today. Audit complete; production documentation being written | [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) |
| Nov 7 | Asset Gate F: the pipeline framework passes (evening) | AR §4 |
| Nov 8 | Asset Gate P: the pilot verdict (evening) | AR §5; E §5.5 |
| Nov 10 | Quest tester named with device and test date (TP-7); batches 1 and 2 VALIDATED | BR Phase 2A; AR §6 |
| Nov 11 | Batches 3 to 5 VALIDATED; asset Gate C target (evening) | AR §6, §8 |
| Nov 12 | Asset Gate C latest; Clock Tower go or no go; latest sensible date to book the tester so fixes fit before the freeze | AR §6, §7; PRODUCTION_AUDIT "Decisions needed" 2; F §0 item 5 |
| Nov 14 | Asset freeze at the end of the day: last day for new or changed GLBs | AR §8; E §5.6 |
| Nov 15 | QA and hardware validation (BR Phase 9); integration day in E §5.6 | BR |
| Nov 16 | Internal code freeze (BR Phase 10) | CLAUDE.md §2 |
| Nov 17 | Demo video, README, Devpost preparation (BR Phase 11) | BR |
| Nov 18 | Internal deadline, before midnight IST (BR Phase 12). The official Devpost deadline is Nov 19, 1:30 AM IST | [COMPETITION_REQUIREMENTS.md](COMPETITION_REQUIREMENTS.md) §11 |
| about Dec 11 | The build must still be reachable and free (winner announcement) | ADR-022 |

From today there are 10 days to the freeze and 12 to the internal deadline.

## 3. Phase crosswalk

Three phase schemes exist: the directive's Phases 1 to 7 (Part 13), CLAUDE.md §17 (Phases 0 to 7) and `BUILD_ROADMAP.md` (Phases 0 to 12 and 5A) ([audit A](audits/A_DOCUMENTATION.md) I-18). BR governs dates. The directive phases describe the production workflow that runs beside it.

### 3.1 The directive's phases

| Directive phase | Dates | Content here | Status on 2026-11-06 |
|---|---|---|---|
| 1 Complete audit | Nov 5 to 6 | PR-1 | Complete: [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) and audits A to F exist |
| 2 Documentation and inventory | Nov 6 to 7 (proposal) | PR-2 | In Progress: the manifest, its schema and the status tool exist; the other production documents are being written |
| 3 Agent assignment | Nov 6 to 7 (proposal) | PR-3 | Done: the roster is recorded as ADR-038 on 2026-11-06 ([AGENT_OWNERSHIP_MATRIX.md](AGENT_OWNERSHIP_MATRIX.md)) |
| 4 Pipeline verification pilot | Nov 6 to 8 (AR §4, §5) | AF-1 to AF-3, AB-0 | Not Started |
| 5 Competition asset production | Nov 9 to 12 (AR §6) | AB-1 to AB-3: the G0-required batches | Not Started |
| 6 Remaining asset production | Nov 12 to 14 (AR §7) | AB-4: the G0-optional batches, only after asset Gate C | Not Started |
| 7 Future feature implementation | After Nov 18 | Section 8 | Not Started. Planning only; no code, no future-world assets before delivery (ADR-028 rule 4) |

### 3.2 One row per BUILD_ROADMAP phase

| BR phase | BR dates | CLAUDE.md §17 | Directive phase beside it |
|---|---|---|---|
| 0 Documentation and audit | Nov 4 to 5 | 0 | 1 |
| 1 Foundation and WebXR proof | Nov 4 to 5 | 1 | none |
| 2 Solver and data foundation | Nov 5 to 7 | 2 | 2, 3, 4 |
| 2A Table detection and anchoring | Nov 7 to 8 | 2 | 4 |
| 3 Part library and Music Box slice | Nov 6 to 8 | 2 | 4 |
| 4 Town and restoration | Nov 8 to 9 | 3 | 5 |
| 5 Repairs and additional machines | Nov 10 to 11 | 4 | 5 |
| 6 Gifting | Nov 12 | 5 | 5 |
| 7 Daily repair and optional work | Nov 13 | 6 | 6 |
| 8 Accessibility and polish | Nov 14 | 6 | 6 |
| 9 QA and hardware validation | Nov 15 | 7 | none |
| 10 Code freeze | Nov 16 | 7 | none |
| 11 Submission preparation | Nov 17 | 7 | none |
| 12 Final buffer and submission | Nov 18 | 7 | none |

## 4. Competition critical path

### 4.1 The chain and what each step needs from the asset lane

The order is the competition-critical order of [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §10. Batch numbers are those of `ASSET_PRODUCTION_ROADMAP.md` §6; the pilot is its §5. VALIDATED dates are AR §8. An asset counts for the code lane only when it is INTEGRATED (asset gate AG4, [INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md) §4), which this document proposes one day after VALIDATED, because AG4 needs the runtime pieces (AF-3) and the scene budget check.

| # | Step | BR phase and dates | Asset inputs (manifest ids) | Asset lane: VALIDATED (AR), INTEGRATED (proposal) | Gap to BR |
|---|---|---|---|---|---|
| 1 | Table detection and anchoring, stand fallback | 2A: TP-6 Nov 6; TP-1, TP-2 Nov 7; TP-3, TP-4 Nov 8; TP-7 Nov 10; TP-5 by Nov 15 | `tockton_base_round` (pilot) | Nov 8; moved into its new folder Nov 8 to 9 (AF-4) | None for the logic. The M0 stand works throughout |
| 2 | Mechanical solver | 2: Nov 5 to 7 | None. `src/sim` is pure TypeScript | n/a | None |
| 3 | Music Box part library and loop | 3: Nov 6 to 8 | Pilot: `gear_spur_16_m1`, `governor_standard`. Batch 1: `gear_spur_12_m1`, `gear_spur_24_m1`, `shaft_short`, `spring_standard`, `spring_worn`, `winding_key`, `bracket_support`, `music_box_case`, `cylinder_music_box`, `comb_music_box`, the workbench kit, `machine_base_handle` | Pilot pieces Nov 8; batch 1 Nov 10, integrated Nov 11 | Batch 1: 2 days late validated, 3 integrated (R-1) |
| 4 | Trunk, town, letters, parcel, workbench; placement and wake | 4: Nov 8 to 9 | Batch 1: `trunk_main`, `workbench`, `parts_tray`, `parcel`, `letter_envelope`, `blueprint_sheet`. Batch 2: `town_ground`, `theatre_facade`. Pilot: `bakery_building`, `tockton_base_round` | Pilot Nov 8; batches 1 and 2 Nov 10, integrated Nov 11 | Pilot pieces on time; the rest 1 day late validated, 2 integrated (R-1) |
| 5 | Carousel, Windmill and Bakery, repairs, X-ray | 5: Nov 10 to 11 | Batch 3: `gear_bevel_12`, `shaft_long`, `bearing_pillow_block`, the Windmill set. Batch 4: the Carousel set. Pilot: `figure_otto` | Nov 11, integrated Nov 12 | 0 validated, 1 integrated, on AR dates that do not yet include Asset Gate M. The Windmill machine files and the Carousel start only after it (AB-1M, CK-1M), so these dates are the earliest, not commitments |
| 6 | Gifting | 6: Nov 12 | Batch 5: `gift_box`. `gift_engraving_plate` stays BLOCKED by G-09 | Nov 11, integrated Nov 12 | 0 |
| 7 | Daily repair | 7: Nov 13 (DR-1) | None. ADR-027 reuses existing machines, parts and faults | n/a | None |
| 8 | Accessibility, pause, polish | 8: Nov 14 | `run_lever` only if the Run control is decided to be a model (A-11) | Decide by Nov 12 | Decision date only |
| 9 | Clock Tower and day/night (cut first) | 7: Nov 13, conditional | Batch 6b, the Clock Tower set | Only if the go decision on Nov 12 keeps it, and only after Asset Gate M (AB-1M) | Cut by default |
| 10 | QA, hardware, freeze, submission | 9 to 12: Nov 15 to 18 | All integrated assets. AST-14 (eyes-on at gameplay distance on a Quest) stays Blocked without a tester | AB-5: asset freeze Nov 14, checks Nov 15 | n/a |

Machine families scale one at a time. After the pilot, the Music Box is proven end to end (Asset Gate M, AB-1M; the owner's eight criteria are listed there) before the Windmill, Carousel and Clock Tower machine files are produced in numbers ("one machine fully proven before mass production", ADR-039 decision 6). The same discipline applies to worlds: one world at a time (section 8.2).

Compression lever: [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md) §12 and AR §3 estimate the G0-required work at far less than the roughly 120 agent-hours available, and machine time is seconds per asset (E §5.3). The limits are the framework build, open design decisions, visual review and runtime integration (E §5.6). If the pilot beats the E §5.4 rates, pull the batch dates forward before touching BR dates.

### 4.2 Checkpoints

| ID | Date | Question | What happens, by answer | Source |
|---|---|---|---|---|
| CK-1 | Nov 7 evening (asset Gate F); Nov 8 evening (asset Gate P) | Does the framework pass Gate F? Does the pilot pass Gate P? | Yes: the three family agents start batches 1 to 5. No, or measured agent minutes more than 2 times the E §5.4 rates: cut scope before spending more, in the AR §9 order, and re-date | AR §4, §5; E §5.5 |
| CK-1M | No date (Asset Gate M, AR §5) | Is the Music Box fully proven end to end: the eight criteria of AB-1M? | Yes: the Windmill machine files, the Carousel and, if kept, the Clock Tower set may start. No: they do not start, and the batch 3 machine files, batch 4 and batch 6b dates are re-dated by the lead, or cut in the AR §9 order | ADR-039 decision 6; AR §5 |
| CK-2 | Nov 10 | Is a Quest tester named with device and date (TP-7)? | No tester: every hardware row stays Blocked and the limitation text is prepared ([INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md) §9) | BR Phase 2A |
| CK-3 | Nov 12 evening | Scope checkpoint: is asset Gate C passed, and are BR Phases 3 to 6 integrated (Build Gate C)? | Yes: Clock Tower and day/night work may start. No: both are Cut, AB-4 shrinks to the cheap Family A parts, and the daily repair is simplified if time is critical | BR §10, §16; AR §7; ADR-027 |
| CK-4 | Nov 14 end of day | Asset freeze: is every G0-required entry INTEGRATED, or listed as a release blocker? | New and changed GLBs stop. After this only a critical bug may change a GLB | AR §8; E §5.6 |
| CK-5 | Nov 15 | Release candidate: Build Gate D | See [INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md) §5 | BR Phase 9 |
| CK-6 | Nov 16 | Code freeze | BR Phase 10: no features, only critical fixes | CLAUDE.md §2 |

## 5. Task register

Tasks that `BUILD_ROADMAP.md` already schedules are not repeated: TP-1 to TP-7, DR-1 and QA-1 are cited where they matter. "Must" means a G0-required item cannot be delivered without it.

### 5.1 Records and decisions (PR)

| Task | Priority | Effort | Dependencies | Acceptance | Agent | Target | Status |
|---|---|---|---|---|---|---|---|
| PR-1 Complete the audit (directive Phase 1) | Must | Done | None | [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) and audits A to F exist | Audit agents (finished); Agent 0 | Nov 6 | Complete |
| PR-2 Production documents and manifest (directive Phase 2) | Must | About 1 day (estimate) | PR-1 | Every directive Part 4 document exists or is merged into an existing one, carries its ADR-028 label, has no empty headings; `node tools/asset-status.mjs` prints no errors | Agent 0 with documentation agents | Nov 7 (proposal) | In Progress |
| PR-3 Agent roster and ownership (directive Phase 3) | Must | 1 hour (estimate) | [AGENT_OWNERSHIP_MATRIX.md](AGENT_OWNERSHIP_MATRIX.md) | The roster is recorded as an ADR (audit A §4.2 ADR-I); `TECHNICAL_ARCHITECTURE.md` §24 points to the matrix | Agent 0 | Nov 7 (proposal) | Done: ADR-038 recorded 2026-11-06 |
| PR-4 State one SaveV1 shape (audit A I-09; PA I-11) | Must | 1 hour (estimate) | `TECHNICAL_ARCHITECTURE.md` §16; `SAVE_PERSISTENCE_SPEC.md` §3 | One document holds the shape and the other points to it; letter status words agree (audit A I-10) | Agent 0 | Nov 8, before BR Phase 4 builds save and load | Not Started |
| PR-5 Publish the footprint table for plots, machines and buildings (gaps G-07, G-08) and settle the stand against the town base (G-06) | Must | 2 hours (estimate) | `PRODUCT_SPEC.md` §3.2 (town at most about 60 × 40 cm, scaled to no less than 75%); `INTERACTION_SPEC.md` §3 (a machine takes the town's scale on its plot) | One table whose machine footprints fit the town at 75%; the manifest `approxDimensionsM` values it implies are proposed and approved. Unblocks the town, Carousel, Windmill and Clock Tower (AR §6 prerequisites) | Agent 0 with the Machines and World agents | Nov 8 (proposal), before batch 2 starts | Not Started |

### 5.2 Pipeline framework and runtime support (AF)

These are the shared pieces every family needs. Nothing in a batch can reach INTEGRATED without them. Stage F items are `ASSET_PRODUCTION_ROADMAP.md` §4.

| Task | Priority | Effort | Dependencies | Acceptance | Agent | Target | Status |
|---|---|---|---|---|---|---|---|
| AF-1 Stage F framework: F1 shared Blender library and export profiles, F2 runner and per-family report, F3 shared material library, F5 manifest schema v2 fields, F7 owner questions | Must | 8 to 12 agent-hours (E §5.6) | ADR-031, ADR-032 (accepted 2026-11-06) | Asset Gate F (AR §4): the runner regenerates `gear_spur_16_m1` into a scratch root and refuses a default path; every library name has a proxy; a three-gear contact sheet draws without overlap | Asset framework; the lead for F5 and F7 | Nov 7 (AR §4) | Not Started |
| AF-2 GLB validator in `tools/` (F4; ADR-037; F §2): container and JSON checks, manifest rules V01 to V70, loader round trip with the shipped three.js, cross-manifest checks X01 to X06. The 236-line prototype from the audit scratch folder is copied in before it is lost | Must | 3 to 5 hours (estimate) | Manifest and schema (exist) | Reproduces the prototype result (three GLBs checked, all six seeded defects caught, F §2.2); runs as `npm run assets:check` and inside `npm test`; AST-01 to AST-05 can be evaluated | Asset framework builds; Agent 0 adds the npm entries and the CI step | Nov 7 (AR §4) | Not Started. Prototype exists only in the session scratch folder |
| AF-3 Runtime asset support (F6, then what the batches need): persistent material registry that swaps proxies by name (ADR-032 item 2); `userData.wu` reader that finds pivots, sockets and colliders by name prefix, never by index (E §3); rotation system driven by the solver (ADR-030 item 4); load-once cache and instancing of part GLBs (ADR-031); Draco-free loader configuration; fix the `GrabFeedbackSystem` material leak ([audit D](audits/D_WEBXR_ARCHITECTURE.md) §1) | Must | About 1 to 1.5 days (estimate) | AF-1 export profile; `SolveResult` from BR Phase 2 | The pilot minimum (registry, reader, one rotating part) is in by Nov 8 for Gate P; the rest by Nov 10. AST-06, AST-07 and AST-09 pass on the pilot assets; `renderer.info.memory` returns to baseline after 50 assemble and tear-down cycles (PERF-06) | Agent 0 (registry, reader, loader); Agent 4 (rotation); Agent 2 (cache, instancing) | Nov 8 minimum; Nov 10 complete (proposal) | Not Started |
| AF-4 Move the regenerated M0 gear and stand GLBs into the new folders in one change (ADR-033 table) so the page is no longer gated on 4.5 MB of GLBs. The regeneration itself is part of the pilot (AB-0) | Must | 3 to 4 hours (estimate) | AF-1 to AF-3; the regenerated gear and stand VALIDATED at Gate P | `src/assets.ts`, the scene JSON, `blender/README.md` and the manifest change together; the old files are deleted so no GLB exists at two paths (F X01); GLBs before Enter at most 1.5 MB (ceiling 4 MB) measured by the byte-budget spec. Today the M0 gear and stand total 4.5 MB before Enter (F §7.2) | Agent 0, with the Mechanical library and World agents for the regenerated files | Nov 8 to 9 (AR §8 plans the migration on Nov 8) | Not Started |
| AF-5 CI and build checks: validator and byte-budget spec in CI; Playwright against a fresh build (`reuseExistingServer` off in CI); emulator spec fails instead of skipping where its runtime can run; `dist/` check that fails on a GLB that is not a G0 manifest entry or on a world id other than `tockton` or `shared` (ADR-033) | Must | 3 to 4 hours (estimate) | AF-2 | A broken seeded case fails CI; today CI runs only typecheck, lint, test and build (F §1) | Agent 0 | Nov 9 (proposal) | Not Started |
| AF-6 `?perf` probe (F §4.4): ring buffer of 600 frame deltas, p50, p95, p99, maximum, counts over 13.9 ms and 16.7 ms, `renderer.info` snapshot each second, `window.__perf.report()` JSON, a user-started copy action, no network | Must | 2 to 3 hours (estimate) | BR Phase 1 | Costs under 0.2 ms per frame; draws nothing in the headset unless asked; a Playwright run reads the report. Needed for the first Quest frame-rate number | Agent 0 | Nov 10 (proposal), before the TP-5 session | Not Started |
| AF-7 Budget spec: same-origin bytes per scene against `budgets.json` and `renderer.info` counts per scene state (PERF-01, PERF-03); the third-party request watcher extended to XR flows (PERF-12) | Must | About 3 hours (estimate) | AF-2, AF-6 | Fails on any request off the origin and on a value above its ADR-034 ceiling; passes on the current M0 build except the before-Enter bytes, which AF-4 fixes | Agent 0 until a QA agent exists | Nov 10 (proposal) | Not Started |
| AF-8 Loading policy ([WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) §4): only the stand and hands are `critical`; the rest prefetch in parallel after Enter with real progress from `AssetManager.loadingManager`; shader pre-warm behind the loading screen. The Tockton definition module (seam 8) is a G5 proposal with no G0 source, is not part of this task and is not scheduled | Must | 4 to 6 hours (estimate made when the definition module was included; likely high) | AF-3, AF-4; audit D §3.1, §5, §6.2 | Enter is enabled once the stand and hands are loaded and no larger GLB blocks it; progress is shown; the PERF-09 load timeline is recorded; the landing speed budget of audit F §7.2 is met or its remaining gap is stated | Agent 0, with the landing agent for the Enter gating | Nov 10 (proposal) | Not Started |

### 5.3 Asset production (AB)

Pipeline, pilot items and per-asset order are in `ASSET_PRODUCTION_ROADMAP.md`; per-asset assignments are in [ASSET_AGENT_ASSIGNMENTS.md](ASSET_AGENT_ASSIGNMENTS.md). Batches follow dependency order there, not the ART_ASSET_PIPELINE §18 rank order, and both put the competition path first. A family agent starts its next batch when its previous batch is VALIDATED (asset gate AG3). BLOCKED entries stay blocked until their decision is made; no geometry is invented for them. Hours are the AR §3 and §6 estimates, before its 50 percent rework allowance, including one-off generators and kits.

| Task | Priority | Effort | Dependencies | Acceptance | Agent | Target | Status |
|---|---|---|---|---|---|---|---|
| AB-0 Stage P pilot (AR §5): `gear_spur_16_m1`, `governor_standard`, `bakery_building`, `figure_otto`, `tockton_base_round`, with `gear_spur_12_m1` and `gear_spur_24_m1` alongside to measure the A1 rate | Must | About 3 to 4 hours of agent time (AR §6); measured at the gate | AF-1, AF-2, AF-3 (pilot minimum); PR-5 for `bakery_building` | Asset Gate P (AR §5): all five VALIDATED with zero FAIL and loading in the application at Desktop and IWER level; the M0 gear and stand migrated or given a dated plan; measured figures within 2 times the estimates | Asset framework with the Mechanical library, Machines and World agents | Nov 8 evening (AR §5) | Not Started |
| AB-1 Batch 1, Music Box slice and workshop kit (AR §6): library parts, the Music Box set, `trunk_main`, the workbench kit, `machine_base_handle` | Must | 8 to 13 agent-hours | Asset Gate P; the Music Box socket list from Agent 2 for `music_box_case` (G-12); `cylinder_music_box` and `comb_music_box` follow the case; decisions 4 and 5 (defaults apply) | Each entry VALIDATED (AG3), then INTEGRATED (AG4) | Mechanical library; Machines; World | VALIDATED Nov 10 (AR §6); INTEGRATED Nov 11 (proposal). BR needs it by Nov 8 to 9 | Not Started |
| AB-1M Asset Gate M, the Music Box end-to-end milestone (AR §5; owner decision of 2026-11-06, ADR-039 decision 6): "one machine fully proven before mass production". It comes after the five-asset pilot (AB-0) and before the Windmill, Carousel and Clock Tower machine files scale | Must | Not estimated; it is integration and measurement work, not asset production | AB-0 (Gate P); AB-1; the Music Box slice and the placement and wake of BR Phases 3 and 4; `music_box_slot_11` and `music_box_slot_12` specified and approved by the owner (BLOCKED on G-12, ADR-039 decision 5) | All eight criteria hold, one line each in the lead's handoff: all 12 approved component slots defined; correct dimensions, pivots and socket positions; GLB assets generated and validated; parts interactively assembled and snapped; the mechanical solver correctly evaluates the assembly; winding produces the intended motion; the completed Music Box can be placed in Tockton and triggers its awakening event; performance and memory budgets measured. Quest figures stay unverified without a physical Quest 3 or 3S test (ADR-039 decision 7) | Agent 0; the Machines and Mechanical library agents; Opus reviews the mechanical design | The owner set no date and this document sets none: the lead dates it. Earliest sensible point is when AB-1 is VALIDATED (Nov 10, AR §6) | Blocked: slots 11 and 12 |
| AB-2 Batch 2, Town (AR §6): `town_ground`, `theatre_facade`, `figure_mira` (G0-required since ADR-039; same figure kit as `figure_otto`) | Must | 2.2 to 3.3 agent-hours | Asset Gate P; PR-5 | As AB-1 | World; Machines | VALIDATED Nov 10; INTEGRATED Nov 11 (proposal) | Not Started |
| AB-3 Batches 3 to 5 (AR §6): Windmill and library part 2, Carousel, Gift. `gift_engraving_plate` waits for G-09 | Must | 4.6 to 7.2 agent-hours | Batch 1 families validated; PR-5; AB-2 for the town fit; G-09 decided by Nov 10 for the plate; **Asset Gate M (AB-1M) for the Windmill machine files and the Carousel** (the library part of batch 3 and the Gift batch do not wait, AR risk 13) | As AB-1. Asset Gate C (AR §6): every non-blocked G0-required entry VALIDATED, or a written reason and a new date. The awakened-town scene stays inside the draw-call ceiling when its pieces are merged, instanced or hidden (F §3.3) | Mechanical library; Machines; World | VALIDATED Nov 11; asset Gate C Nov 11 evening, latest Nov 12; INTEGRATED Nov 12 (proposal) | Not Started |
| AB-4 Batches 6a to 6c, G0-optional (AR §7): decoy gears, lantern; Clock Tower set; library breadth | Could | 6a 0.2 to 0.4; 6b 2.8 to 5.2; 6c 1.5 to 3 agent-hours | Asset Gate C; the go decision of CK-3 for 6b; **Asset Gate M (AB-1M) for 6b** | As AB-1. An entry not INTEGRATED by CK-4 is Cut. The order is the reverse of the cut order, so what is cut last is built first (AR §7) | Mechanical library; Machines; World | Nov 12 to 14 (AR §7) | Not Started |
| AB-5 Asset freeze and integration pass (AR §8) | Must | 4 to 6 hours (estimate) | CK-4 | Every G0-required entry INTEGRATED or listed as a release blocker; `node tools/asset-status.mjs` prints no errors and no file disagreements; AST-08 visual review of each integrated asset at gameplay distance; AST-11 and AST-12 on the built preview (AR §8); a `CREDITS.md` row for anything not original (AST-13) | Agent 0 with the Manifest checker | Freeze end of Nov 14; checks Nov 15 (AR §8) | Not Started |

Entries labelled G2 (the Family J shared parts) and anything for a world other than Tockton are not scheduled here (section 8).

### 5.4 Verification and release (RL)

BR tasks used here: TP-5 (real-Quest placement test), TP-7 (tester named), QA-1 (final quality checklist). Their text is in `BUILD_ROADMAP.md`.

| Task | Priority | Effort | Dependencies | Acceptance | Agent | Target | Status |
|---|---|---|---|---|---|---|---|
| RL-1 Tester pack: build URL with a visible build id and commit, the H01 to H14 hardware checklist (F §5), `?perf` report instructions, recording instructions | Must | 2 hours (estimate) | AF-6; TP-7 | A tester can run the list with no help from the developer and return filled rows with their level (Quest 3 or Quest 3S) | Agent 0 | Nov 11 (proposal) | Not Started |
| RL-2 Deployed-build smoke test on the public Vercel URL in a private window: APP-07, APP-08, AST-12, and no request to another origin | Must | 1 hour per run (estimate) | The owner turns Vercel deployment protection off and promotes a build (ADR-022). Today the public URL sits behind Vercel Authentication and shows an older build ([PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §1) | A clean private window loads the current build with no login; run once after each batch integration from Nov 12, and on the final build | Agent 0 runs it; the owner changes the Vercel setting | First run Nov 9 (proposal); final run Nov 17 to 18 | Not Started. Needs an owner action |
| RL-3 Release candidate review (Build Gate D) and QA-1 sign-off | Must | Half a day (BR QA-1) | Build Gate C; AB-5; RL-1 | [INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md) §5 Build Gate D passes, or each failing item is a recorded blocker; QA-1 rows Pass or Blocked with reasons; an Opus review of the whole (directive Part 7) | Agent 0; Opus reviewer | Nov 15 (BR Phase 9) | Not Started |
| RL-4 Known-limitations text for the README and Devpost | Must | 2 hours (estimate) | RL-3; whether a tester produced evidence | Every hardware-only item without evidence is listed in plain words; nothing claims a frame rate, Quest verification or real-table drift behaviour that has no Hardware record (ACCEPTANCE_TESTS §16; JUD-21) | Agent 0 | Nov 17 | Not Started |
| RL-5 Submission: demo video under three minutes, README, Devpost fields, public URL check, final known-good build preserved | Must | BR Phases 11 and 12 | RL-3, RL-4; the owner has joined the contest and is a Meta VR Start Program member (COMPETITION_REQUIREMENTS §10) | BR Phase 11 and 12 objectives; submitted before midnight IST on Nov 18, not at the official deadline | Agent 0; the owner holds the Devpost account | Nov 17 to 18 | Not Started |

## 6. Schedule risks

| # | Risk | Evidence | Mitigation | Decide by |
|---|---|---|---|---|
| R-1 | The asset lane finishes after the BR phases that need its assets (section 4.1) | AR §8: the Music Box part set and the trunk and workbench are VALIDATED about two days after BR Phase 3 and one to two days after Phase 4 end | Option (a): the code lane integrates against the M0 gear, the M0 stand and the pilot assets, which are real, and uses dev-only stand-ins (not manifest entries, never shipped, deleted at AG4) for anything else. Option (b): move the visual exit criteria of BR Phases 3 and 4 to the day the batch is INTEGRATED. Recommended: (a). Pull batch dates forward if the pilot beats the E §5.4 rates | Lead, Nov 7 |
| R-2 | Framework, validator and runtime support are due the day before and the day of the pilot verdict | E §5.6: 8 to 12 agent-hours before families can run; AR §4 and §8 | Build AF-1 and AF-2 in parallel; the lead owns AF-3. If Gate F slips a day, Gate P and the batch dates move with it (AR §9 item 1) | Nov 7 |
| R-3 | No headset and no named tester | PRODUCTION_AUDIT §9 risk 1; TP-5, TP-7 | Name a tester by Nov 10. Without one, all hardware rows stay Blocked and RL-4 documents the limitation. A desktop or IWER result is never promoted | Owner, Nov 10 |
| R-4 | Texture memory: per-GLB baked textures do not scale | F §0 item 2: 192 MiB for twelve parts in the gear's style against a 128 MiB ceiling | ADR-032 (shared material library, vertex ambient occlusion). If the owner reverses it, one atlas per machine (ADR-032 consequences) and the ADR-034 texture rows are redone | Accepted 2026-11-06 (ADR-032) |
| R-5 | Blocked entries hold G0-required slots | Inventory §5: Music Box slots 11 and 12, `run_lever`, `gift_engraving_plate` | Each has a decision date in section 7. Do not invent geometry | Dates in section 7 |
| R-6 | The awakened town may exceed the draw-call ceiling | F §3.3: 150 to 190 on paper against 200 | Merge static geometry, instance repeats, hide interior parts; check with PERF-01 at Build Gate C | Build Gate C, Nov 12 |
| R-7 | IWSDK is a release candidate (1.1.0-rc.2) | PRODUCTION_AUDIT §9 risk 6 | Everything pinned; recheck APIs after any upgrade; no upgrade after Nov 12 | Lead |
| R-8 | The M0 gear and stand GLBs breach the before-Enter ceiling and keep the page waiting | F §7.2: 4.5 MB against a 1.5 MB target | AF-4 and AF-8 | Nov 9 |
| R-9 | The 24-tooth and 36-tooth gears exceed the 4,000-triangle gear ceiling at today's generator settings | AR §11 risk 9 | Settle in the pilot (`gear_spur_24_m1` runs alongside it) | Gate P |

## 7. Decisions

### 7.1 Owner decisions pending

The defaults apply until the owner answers ([PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)). "Needed by" is the date after which a late answer costs rework.

| # | Question | Default applied | Needed by | What a late or different answer costs |
|---|---|---|---|---|
| [1](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner) Owner decision pending | Is there an original Technical Design Doc? | CLAUDE.md §3 no longer names it; the listed documents and accepted ADRs are the specification | None | Nothing is blocked |
| [2](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner) Owner decision pending | Who tests on a Quest 3 or 3S, and when? | Every hardware row is Blocked | Named by Nov 10 (TP-7); booked by Nov 12 | Hardware items stay Blocked at Build Gate D and the submission carries the limitation |
| [3](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner) Owner decision pending | May Khronos `gltf-validator` be added as a dev dependency? | Not installed. Our own validator is the gate (ADR-037) | Nov 14, only for a release-candidate run | Nothing waits on it |
| [4](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner) Decided 2026-11-06 | Shared material library with vertex ambient occlusion, baked textures only for heroes (ADR-032)? | Accepted (the owner approved building the shared asset framework); the owner can still reverse it | Nov 8, asset Gate P | A reversal after batch 1 means regenerating parts as one atlas per machine |
| [5](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner) Owner decision pending | Gear module and tooth set (I-4, G-16) | `gear_spur_<teeth>_m1` as in the manifest | Nov 8, when the shipped gear is regenerated and migrated | The asset id changes with the module token, and ids never change once a blueprint, save or gift uses them (ADR-033) |

### 7.2 Open gaps that block dated work

The gap text is in the [inventory](MASTER_ASSET_INVENTORY.md) §11 and each entry's `blockedBy`. Dates are the latest day that still fits the BR phase that uses the answer.

| Gap | Blocks | Needed by | Who decides |
|---|---|---|---|
| G-12 and G-02: blueprint data for the Music Box; whether the winding key, base handle and case count inside "Parts: 12" | `music_box_slot_11`, `music_box_slot_12`; the Music Box blueprint | Nov 8 (BR Phase 3) | Agent 0 with Agents 1 and 2; the owner for G-02 |
| G-01: is the Windmill wound by the player, or driven by ambient wind only? (ADR-029 settles only that wind drives the sails) | Windmill blueprint; no new file | Nov 10 (BR Phase 5) | Owner |
| G-09: where the eight engravings appear | `gift_engraving_plate` | Nov 10 (BR Phase 6 is Nov 12) | Lead |
| A-11: Run control as a model or a UI control | `run_lever` | Nov 12 (BR Phase 8 is Nov 14) | Lead |
| G-07: houses and props (I-16, the flower shop, and G-10, the baker, were decided on 2026-11-06: no flower shop, Otto is the baker; ADR-039) | `town_houses`, `town_props_set` (BLOCKED until the owner approves their specifications) | Nov 12 (CK-3); both G0-optional | Owner |

### 7.3 Lead decisions

| # | Decision | Default | By |
|---|---|---|---|
| L-1 | Approve the dates of `ASSET_PRODUCTION_ROADMAP.md`, a proposal for the lead's approval | Approve as written, then pull forward if the pilot is fast | Nov 7 |
| L-2 | Dev-only stand-ins, or slipping the visual exits of BR Phases 3 and 4 (R-1) | Stand-ins and the real pilot assets | Nov 7 |
| L-3 | Record the agent roster as an ADR (PR-3) | Done: [AGENT_OWNERSHIP_MATRIX.md](AGENT_OWNERSHIP_MATRIX.md) accepted as written (ADR-038, 2026-11-06) | Nov 7 |
| L-4 | A world disposer and empty-level swap (audit D §5, about 200 lines with a registry and one test) | Build it only if a G0 flow replaces the level, such as restart or a gift viewer with its own level (WORLD_REGISTRY_AND_LOADING §4). A registry with more than one entry, world switching and SaveV2 stay G5 | Nov 12 (BR Phase 6) |

## 8. After the competition

Everything in this section is G1 to G5 or Research. It is documented, not built, until the competition build is delivered (directive Part 13, Phase 7; ADR-028 rules 1 to 3). Each generation's document opens with its label and a link to ADR-028. Dates are not set: the owner schedules these after delivery. The generation order below is the directive's numbering; the owner may reorder it. `ASSET_PRODUCTION_ROADMAP.md` §10 holds the matching asset backlog.

### 8.1 Generations

| Label | Scope (directive Part 10) | Must exist before it starts | First deliverable (proposal) | Documents (directive Part 4) |
|---|---|---|---|---|
| G1 Living Tockton | Resident behaviour, building dependencies, town events, production chains, expanded stories, persistent world simulation, improved spatial persistence | Competition delivered; a SaveV2 and migration design (audit A §4.2 ADR-G); a resident behaviour spec, which did not exist before the production pass (audit A §1) | The resident behaviour spec, then one resident routine in Tockton | [RESIDENT_BEHAVIOUR_SPEC.md](RESIDENT_BEHAVIOUR_SPEC.md), [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md), [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) |
| G2 Advanced engineering | Multi-stage transmissions, energy distribution, timing, diagnosis, fault propagation, simulation preview, advanced machinery | An ADR for the engine v2 contract: new connection types stay deterministic and non-physical (SOLVER §8; ADR-008, ADR-009) | The contract ADR; then the Family J parts already in the manifest | [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md) |
| G3 Creative sandbox | Free-build workshop, modular components, custom machine construction, blueprint editor, validation, saved inventions | G2 contracts; library breadth beyond the G0 parts; the blueprint validation of DATA_AND_BLUEPRINT_SPEC §13 | A review of the sandbox spec against the IDEAS §4.6 warning that free build could undermine the curated puzzles | [CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md) |
| G4 Community | Blueprint sharing, challenges, curated gallery, optional accounts and cloud saves, community puzzles | G3 inventions; a new ADR that allows a backend for G4 only, with privacy and moderation review (ADR-013 and CLAUDE.md §16 bind the competition build) | The backend and privacy ADR | [BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md) |
| G5 Clockwork universe | Multiple towns and environments, cooperative experiences, player-created districts, expanded campaigns | A registry with more than one entry, world switching and unloading (WORLD_REGISTRY_AND_LOADING §5); SaveV2 with per-world state; the shared library proven by a second world | The multi-entry registry, then the second world as a complete vertical slice | [MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md), [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md), [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md), [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md), [SPATIAL_WORLD_SYSTEM.md](SPATIAL_WORLD_SYSTEM.md), [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) |
| Research | Persistent anchors across sessions (IDEAS §4.8), eye-tracking gaze, compression (ADR-035), the Khronos validator (decision 3), KTX2 if Quest memory is tight, how multiview counts draw calls (audit D §6.2) | A Quest and a tester | Each item is a spike with a written result | none |

Four strategy documents sit across these generations and must respect the firewall. [PRODUCT_VISION_LONG_TERM.md](PRODUCT_VISION_LONG_TERM.md), [EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md) and [PRODUCT_PILLARS.md](PRODUCT_PILLARS.md) set direction only. [PRODUCT_METRICS_AND_RETENTION.md](PRODUCT_METRICS_AND_RETENTION.md) may not introduce analytics or telemetry (ADR-013, CLAUDE.md §14 and §16); until a new ADR allows more, retention is judged by hand or locally.

### 8.2 World order and world completion gates

Build the shared technology once and produce worlds one at a time; do not develop all worlds simultaneously (directive, world-by-world strategy). The directive's production order is 1 Tockton (the initial competition world), 2 Brasswater Harbour, 3 Emberforge Mountains, 4 Verdant Observatory, 5 Aetherian Skyworks, 6 Grand Mechanical Theatre. Tockton is the only competition world; all other worlds are future expansion content and must not enlarge the competition scope. No other world is approved, and which one is second needs the owner's approval before any work: Owner decision pending ([WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) §7).

Before scaling, the shared foundation must exist: the mechanical simulation, the reusable component library, the shared Blender materials and generators, the interaction and hand systems, save and progression, the world registry and loading, the shared manifest and validator, and common accessibility, audio and interface systems. The G0 work in section 5 builds most of it: the part library, the material library, the family generators and the validator (ADR-031, ADR-032, ADR-037; AF-1, AF-2, AB-1). The manifest and the status tool already exist. The world registry and a multi-world save are not in the G0 plan.

A world is complete only when it has all of these: a design bible; an environment and layout specification; a machine and building inventory; a resident and character inventory; a story and quest specification; its unique mechanical features; an asset manifest; Blender sources and GLB deliverables; performance budgets; gameplay acceptance tests; and an integration and release checklist. Generated assets alone do not make a world complete. Each world finishes and is validated before full production starts on the next. Each world's mechanics extend the shared engine through documented interfaces, never by coupling the engine to the world: Brasswater hydraulic systems, pumps and water flow; Emberforge pressure, pistons and foundry machinery; Verdant Observatory planetary gearing and precision timing; Aetherian Skyworks propellers, gyroscopes and flight mechanisms; Grand Mechanical Theatre synchronisation and coordinated automata ([MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md) section 9). Worlds reuse the shared mechanical library: no duplicated gear, shaft, bearing, spring or connector without a written reason, parameterised geometry and runtime materials, and separate geometry only where the design requires it ([MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md) section 3.8). The manifest tells the four asset classes apart (`scopeClass`: shared, world-specific, reused, future-planned) and counts unique deliverables only ([GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md) section 4).

Before delivery, no future-world asset is made unless the owner approves it as a reusable shared asset that does not delay the submission (ADR-028 rule 4). That includes the Family J (G2) shared parts already listed in the manifest ([WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) §7).

### 8.3 Post-delivery gate

G1 or any later generation starts only when all of these hold. The gate is detailed in [INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md) §12.

1. The competition entry is submitted and the build is live.
2. Hardware results are recorded, or the limitation is carried forward in writing.
3. The ADR-034 budgets are revised from the first Quest reading, or recorded as still provisional.
4. An owner decision recorded in [DECISIONS.md](DECISIONS.md) moves the generation's scope into planned work. Until then it stays outside G0.

## 9. Keeping this document true

- Agent 0 refreshes statuses once a day and after each gate, and runs `node tools/asset-status.mjs` before changing any asset line.
- A date changes only with a line in the change log below. BR dates change only in `BUILD_ROADMAP.md`, and AR dates only in `ASSET_PRODUCTION_ROADMAP.md`.
- A task enters a table with all seven fields filled. A task whose source is not a spec section, an ADR, an audit finding, a reference board or the directive is a proposal and says so.
- Something cut is marked Cut, not deleted.

Change log

| Date | Change |
|---|---|
| 2026-11-06 | First version. Asset stages, batches and dates taken from `ASSET_PRODUCTION_ROADMAP.md`. |

## 10. Acceptance criteria for this document

1. Every date is a BR date, an AR date, an audit date or marked proposal.
2. Every task row has priority, effort, dependencies, acceptance, agent, target and status.
3. No G1 to G5 or Research item is scheduled before section 8, and none is labelled G0.
4. No asset count is typed by hand; progress comes from `node tools/asset-status.mjs`.
5. Every owner decision still open is marked "Owner decision pending" with a link, and the default is stated.
6. Gate names do not collide: Build Gate A to D, asset Gate F, P and C, and AG1 to AG4 each mean one thing.
7. Every document it names in a link exists in the repository when this document is accepted.
