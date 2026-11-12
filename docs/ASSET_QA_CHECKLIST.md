# Wound Up — Asset QA Checklist

**Project:** Wound Up
**Label:** G0 (competition build). The same gates apply unchanged to later labels.
**Status:** Active as a checklist. Most automated checks cannot run yet because the validator, the `?perf` probe and the runtime registry are not built; each check below says what runs today. Nothing is verified on a Quest Browser, Quest 3 or Quest 3S: no headset and no tester exist.
**Date:** 2026-11-06
**Authority:** Directive Parts 9 and 12; [DECISIONS.md](DECISIONS.md) ADR-034, ADR-037; [audit F](audits/F_QA_PERFORMANCE.md) §4 to §6 (tests AST-01 to AST-14, stage gates, the per-asset checklist, the hardware checklist). The AST ids are proposals from audit F: `ACCEPTANCE_TESTS.md` does not list them yet, and its owner adds them (ADR-037 consequences).
**Related:** [GLB_EXPORT_AND_VALIDATION.md](GLB_EXPORT_AND_VALIDATION.md), [ASSET_OPTIMISATION_BUDGET.md](ASSET_OPTIMISATION_BUDGET.md), [BLENDER_PRODUCTION_GUIDELINES.md](BLENDER_PRODUCTION_GUIDELINES.md), [ASSET_PRODUCTION_ROADMAP.md](ASSET_PRODUCTION_ROADMAP.md), [ASSET_AGENT_ASSIGNMENTS.md](ASSET_AGENT_ASSIGNMENTS.md), [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md) §5, [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md), [TESTING_QA_PLAN.md](TESTING_QA_PLAN.md)

## 1. Rules

1. **Never mark an asset complete because an export file exists** (directive Part 7.3). Every status needs the evidence in section 3.
2. **Five verification levels, kept separate** (directive Part 12). No level implies another, and IWER is never promoted to a Quest result.

   | Level | Meaning | Evidence a record carries |
   |---|---|---|
   | Desktop verified | Chrome or Edge on the dev machine, or CI | command, commit, date |
   | IWER verified | The IWSDK emulator (emulated Quest 3, hands, rooms). It runs at about one frame per second in software, so no frame rate there means anything | spec name, room, commit |
   | Quest Browser verified | Meta Quest Browser on any Quest-family headset a tester has. Proves that browser version's WebXR behaviour only | device model, OS, browser version, recording |
   | Physical Quest 3 verified | Quest 3 with Quest Browser, per test id | same |
   | Physical Quest 3S verified | Quest 3S with Quest Browser, per test id. Optics, display and sensing may differ; repeat, do not assume | same |

3. **Result labels** are those of ACCEPTANCE_TESTS §3: Not Run, Pass, Fail, Blocked, Not Applicable. A Blocked result states the reason and the action that unblocks it. TESTING_QA_PLAN §11 still uses PASS, FAIL, BLOCKED and NOT TESTED; its owner aligns it (audit F §1). Every record names its build or commit, environment, date and evidence.
4. **A render is not evidence of Quest appearance.** Contact sheets judge shape. Appearance at gameplay distance is judged in the runtime (AST-08, AST-09), and on a Quest only by AST-14.
5. **Counts are read from the tools**, never typed: `node tools/asset-status.mjs` for status, ownership and files; the validator's X06 for unique geometry per label.
6. **The builder never signs its own review.**

## 2. What each level can prove for an asset

Yes proves it; Part is a proxy only; No cannot (audit F §4.3).

| Claim | Desktop | IWER | Quest Browser | Quest 3 | Quest 3S |
|---|---|---|---|---|---|
| GLB valid; sizes; triangle, primitive and material counts | Yes | Yes | Yes | Yes | Yes |
| Draw calls and triangles per frame | Part | Part | Yes | Yes | Yes |
| GPU texture memory | Part (estimate) | Part | Part | Part | Part |
| 72 fps and the 60 fps floor | No | No | Part (other headset) | Yes | Yes |
| Garbage-collection and shader hitches; thermal stability | No | No | Part / No | Yes | Yes |
| Hand-tracking pinch accuracy on a small part | No | Part (ideal hands) | Yes | Yes | Yes |
| Look under real passthrough; thin edges (gear teeth) at play distance | Part | Part | Yes | Yes | Yes |
| No third-party requests | Yes | Yes | Yes | Yes | Yes |

## 3. Stage gates

Stage is separate from verification level. An asset can be INTEGRATED with Desktop and IWER evidence only; the Quest columns in the manifest `verified` block stay false until a tester fills them. The statuses and who sets them are in GLB_ASSET_MANIFEST §5 and ASSET_AGENT_ASSIGNMENTS §7.

| Stage | Meaning | Enters from | Evidence that moves it |
|---|---|---|---|
| SOURCE_READY | Source exists and rebuilds; manifest row complete | none, or REWORK_REQUIRED | `.blend` or generator script committed; row has category, size, origin, pivots, materials, label; reference approved; clay shape-review render for heroes; licence noted |
| EXPORTED | GLB produced by the generator | SOURCE_READY | Generator exits 0; GLB path matches the manifest; SHA-256 and bytes recorded; no hand edits |
| VALIDATING | A check or review is open; time-boxed to 48 hours, with no result it returns to EXPORTED | EXPORTED | Validator run started; reviewer named |
| VALIDATED | All automated checks pass and required reviews are signed. **Bound to the GLB's hash**: any change to the GLB resets it to EXPORTED | VALIDATING | AST-01 to AST-05 pass; WARN lines reviewed; previews rendered from the re-imported GLB; AST-07 for moving parts; AST-08 signed |
| INTEGRATED | In use by a blueprint or scene and loading in the real runtime | VALIDATED | AST-06 and AST-09 to AST-12 pass; no console errors; scene budgets still hold with it; id referenced from `src/assets.ts` or content data |
| REWORK_REQUIRED | A gate failed, a later regression was found, or the file predates the pipeline | any | Failure list with a reason code (section 8) and an owner |

Counting for reports: "delivered" is EXPORTED or later, "accepted" is VALIDATED or later, "in the game" is INTEGRATED. Planned entries with no source carry no stage. The two M0 files are REWORK_REQUIRED with validation FAIL and integration INTEGRATED: they run in the M0 scene at their old paths and fail ADR-032 and ADR-034.

## 4. Asset tests AST-01 to AST-14

| ID | Test | Level | Type | Runs today? | State |
|---|---|---|---|---|---|
| AST-01 | Manifest complete: every GLB listed, every entry's file present and fields complete (X04) | Desktop | Unit | Partly: `node tools/asset-status.mjs` covers orphans, missing files and fields | Not Run as a gate |
| AST-02 | Validator reports zero FAIL (V01 to V70, X01 to X06) | Desktop | Unit | No: validator not built | Not Run |
| AST-03 | Validator WARN lines reviewed and written into the evidence | Desktop | Manual | No | Not Run |
| AST-04 | No exact duplicate geometry; near duplicates justified (X01, X02, X05) | Desktop | Unit | No | Not Run |
| AST-05 | Category budgets met (V50) | Desktop | Unit | No | Not Run |
| AST-06 | Loads in the runtime with no console warnings; on-screen bounding box in world metres matches the manifest | Desktop and IWER | Browser | No: runtime registry not built | Not Run |
| AST-07 | Pivot test: rotate each moving part by the solver angle; the rotation centre does not drift (V41) | Desktop | Unit | No | Not Run |
| AST-08 | Visual review at gameplay distance, fixed camera, game lighting, against the approved reference | Desktop and IWER | Visual | No | Not Run |
| AST-09 | Frozen and awakened material states both render correctly | Desktop and IWER | Visual | No | Not Run |
| AST-10 | Grab, snap and release with emulated hands; collider radius at least 1.2 cm | IWER | Emulator | No | Not Run |
| AST-11 | Scene budgets re-checked after integration (PERF-01, PERF-03) | Desktop and IWER | Integration | No: `?perf` probe not built | Not Run |
| AST-12 | Production build: the asset URL returns 200 under a sub-path, with the right content type and the bytes in the manifest (APP-08) | Desktop | Browser | No | Not Run |
| AST-13 | Licence row in CREDITS.md for anything not original | n/a | Manual | Yes | Not Run |
| AST-14 | Eyes-on at gameplay distance on a Quest 3, and separately on a Quest 3S | Physical Quest 3, physical Quest 3S | Hardware | No | **Blocked:** no headset and no named tester (task TP-7). Unblocked by a tester and a dated session |

## 5. Checklists by stage

### Stage 1: Specification (before IN_PROGRESS and SOURCE_READY)

- [ ] The entry is not BLOCKED; pending owner decisions are noted in the handoff.
- [ ] The listed specifications and only the listed boards were read; conflicts follow ASSET_REFERENCE_MAPPING §4.
- [ ] Size proposed with its basis; the lead approved any size not `spec`, `measured` or `derived`.
- [ ] Origin, pivots and rotation axis follow BLENDER_PRODUCTION_GUIDELINES §5.
- [ ] The node list (root, meshes, helper empties) follows the naming standards §5 and is written into the manifest `meshes`.
- [ ] Materials come from the library; the allowance is at or below the category ceiling.
- [ ] Colliders are at least 1.2 cm; socket positions are confirmed or marked as proposals; clips are listed.
- [ ] The reference is approved, a board or a lead-approved proposal. Licence noted (original).

### Stages 2 and 3: Modelling and export (to EXPORTED)

- [ ] Built headless with `--factory-startup`; no default output path; only owned paths written.
- [ ] In-Blender QA gate clean: names, bounding box against the manifest, triangle budget, zero images, `COLOR_0` present, `mesh_qa` clean, `wu` metadata valid.
- [ ] Export profile as the entry requires (L, H, A or C).
- [ ] SHA-256 and byte size recorded; the report file written.

### Stage 4: Visual QA (contact sheet from the re-imported GLB)

- [ ] The silhouette reads at gameplay distance and looks intentional, not a primitive blockout (CLAUDE.md §6.6).
- [ ] Proportions are believable and fit the miniature world; the model matches the approved reference.
- [ ] Edges are bevelled; no broken geometry, flipped normals or z-fighting.
- [ ] Colours match the palette; materials separate brass, wood, enamel and fabric; not everything is metallic.
- [ ] Ambient occlusion is plausible; the flat-face limit is noted where it matters.
- [ ] A rotating part is centred on its shaft; teeth of gears of the same module mesh visually.
- [ ] The sheet is not described as in-game or Quest appearance.

### Stage 5: Technical QA (to VALIDATED)

- [ ] `npm run assets:check` shows zero FAIL for the entry.
- [ ] Every WARN line has a written answer.
- [ ] Category budget met, or the lead's written exception is in the entry.
- [ ] Not a duplicate or near-duplicate; `distinctBecause` written.
- [ ] Moving parts pass the pivot test (AST-07); grabbable parts have `COL_Grab` of at least 1.2 cm; sockets are exact (V61, V62).
- [ ] A named reviewer, not the builder, signed AST-08.
- [ ] `glbSha256` recorded and `validationStatus` set to PASS by the lead.

### Stage 6: Integration (to INTEGRATED)

- [ ] The asset id is in `src/assets.ts` or content data; the shared material replaced the proxy by name.
- [ ] No console warnings (AST-06); the on-screen bounding box matches the manifest.
- [ ] Frozen and awakened looks are both right (AST-09).
- [ ] Grab, snap and release work with emulated hands (AST-10).
- [ ] Scene budgets hold with the asset in place (AST-11); no request leaves the origin (PERF-12).
- [ ] The production build serves the asset under a sub-path (AST-12).
- [ ] CREDITS.md has a row for anything not original (AST-13).

### Stage 7: Acceptance

- [ ] The lead signs the per-asset checklist (section 7).
- [ ] The manifest `verified` block records Desktop and IWER only; the Quest fields stay false.

## 6. Framework, pilot, batch and freeze gates

| Gate | Passed when | Signed by |
|---|---|---|
| Gate F (end of 7 Nov) | The runner regenerates `gear_spur_16_m1` into a scratch root with profile L and refuses a default path; the validator shows zero FAIL on it and finds all six seeded defects; a three-gear contact sheet has no overlap; every library name has a proxy | Lead, with an Opus design review |
| Gate P (end of 8 Nov) | All five pilot GLBs VALIDATED (zero FAIL) and loading in the application at Desktop and IWER level; measured cost within 2 times the estimate; M0 files migrated or planned | Lead, with an Opus review of cost |
| Gate M (Music Box end-to-end milestone; no date yet) | All eight owner criteria (ASSET_PRODUCTION_ROADMAP §5): all 12 approved component slots defined; correct dimensions, pivots and socket positions; GLB assets generated and validated; parts interactively assembled and snapped; the mechanical solver correctly evaluates the assembly; winding produces the intended motion; the completed Music Box can be placed in Tockton and triggers its awakening event; performance and memory budgets measured | Lead |
| Batch gate | Contact sheet reviewed; validator zero FAIL; every WARN answered; handoff received; manifest merged; status tool shows no disagreement | Lead |
| Gate C (target 11 Nov, latest 12 Nov) | Every non-blocked G0-required entry VALIDATED, or a written reason and date | Lead |
| Asset freeze (end of 14 Nov) | No new GLB after this point; rework only | Lead |
| Release check (15 to 17 Nov) | AST-11 and AST-12 on the built preview and the deployed build; Quest session if a tester exists; QA-1 items Pass or Blocked with a reason | Lead, final asset review by Opus |

## 7. One-page checklist per asset

Audit F §6.3. Copy into the handoff or the manifest evidence.

- [ ] Manifest row complete; source and generator committed.
- [ ] GLB regenerated from source; SHA-256 recorded.
- [ ] Validator: 0 FAIL; WARN lines read and answered.
- [ ] Category budget met (triangles, primitives, materials, texture MiB, bytes).
- [ ] Size, origin and pivots as declared; transforms applied; names as the convention.
- [ ] Materials from the shared library; no alpha or double-sided without a reason.
- [ ] Not a duplicate or near-duplicate; `distinctBecause` written.
- [ ] Moving parts rotate about their pivot without drift (AST-07).
- [ ] Collider radius at least 1.2 cm if grabbable; sockets exact if declared.
- [ ] Previews rendered from the re-imported GLB and reviewed at gameplay distance.
- [ ] Loads in the runtime with no console warnings; scale correct on screen.
- [ ] Frozen and awakened looks checked.
- [ ] Scene budgets re-checked with the asset in place.
- [ ] Production build serves it under a sub-path.
- [ ] Licence recorded.
- [ ] Quest 3 and Quest 3S checks: **Blocked**, or done with date and tester (never one headset standing in for the other).

## 8. Failure handling

| Reason code | Meaning |
|---|---|
| VAL_FAIL | The validator reported a FAIL |
| REVIEW_FAIL | The visual or mechanical review failed |
| BUDGET_BREACH | The asset or the scene is over a budget |
| INT_FAIL | The asset failed in the runtime |
| REGRESSION | A later change broke an accepted asset |
| SPEC_CHANGE | A specification or decision changed |

A REWORK_REQUIRED entry carries its code, an owner and a date. It returns to SOURCE_READY if the source changes and to EXPORTED if only the export changes. A changed GLB hash always resets VALIDATED. More than two fix passes on an asset: accept with recorded WARN lines, or escalate (BLENDER_PRODUCTION_GUIDELINES §11).

## 9. Hardware checklist for assets

The full 14-step tester list (H01 to H14) is in audit F §5 and is run once on a Quest 3 and once on a Quest 3S. The steps that concern assets:

| Step | What the tester checks | Maps to |
|---|---|---|
| H07 | Frame times for 60 s in each of S1 (trunk and frozen town), S2 (workbench build with X-ray), S3 (awakened town), S4 (gift viewer): no sustained dip below 60 fps, typical 72 | PERF, TBL-18 |
| H08 | At play distance, each integrated hero asset: silhouette, material, shimmer on thin edges (gear teeth), pivots turn correctly, text readable, frozen against awakened colour. Pass or fail per asset with a photo | AST-14, TOWN-06, TOWN-07 |
| H13 | 20 continuous minutes: frame times do not degrade; note warmth and any tab reload | PERF, TBL-18 |

Before starting, record headset model, OS version, Quest Browser version, the build URL and commit id, and whether hand tracking is on. Return the filled table, recordings, OVR Metrics Tool screenshots or a `?perf` report, and the build id. Every row stays Blocked until a tester is named and a session is dated; the roadmap asks for the booking before about 12 November so fixes fit before the freeze.

## 10. Reporting

Report progress with the status tool's output, not with typed counts. A report states for each claim its verification level. The words "validated", "integrated" and "verified" are used only with the stage or level they mean. A report never says an asset works on a Quest without a tester's evidence for the named device.

## 11. Dependencies

- The validator (Asset framework), the `?perf` probe and the PERF-01, PERF-03 and PERF-12 tests (lead), the runtime registry (lead and game agents).
- `ACCEPTANCE_TESTS.md` and `TESTING_QA_PLAN.md` owners to add AST-01 to AST-14, the five verification levels and one label set.
- A Quest 3 and a Quest 3S tester (task TP-7) for AST-14 and the hardware steps.

## 12. Acceptance criteria

1. Every asset status in the manifest has the evidence of section 3 behind it, and `tools/asset-status.mjs` reports no disagreement.
2. Each of AST-01 to AST-13 has a result with a level, a commit and a date, or a stated reason it cannot run yet. AST-14 is Blocked until a tester exists and is never filled from a desktop or emulator run.
3. No document or report mixes verification levels or states a frame rate for a Quest without a named tester and device.
4. Every VALIDATED entry has a builder-independent reviewer and a matching hash.
