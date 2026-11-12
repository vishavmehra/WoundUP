# Wound Up — Asset Optimisation Budget

**Project:** Wound Up
**Label:** G0 (competition build). Every value is a ceiling or target for G0 assets; later labels inherit it until their own review.
**Status:** Provisional starting values. Nothing here has been measured on a Quest 3 or Quest 3S; no headset or tester exists. Frame time can only be proven on a headset (audit F §4.3), so those rows stay Blocked until a tester exists.
**Date:** 2026-11-06
**Authority:** [DECISIONS.md](DECISIONS.md) ADR-034 (the budget set), ADR-032 (texture rows), ADR-035 (totals), ADR-023. This document is the working copy of ADR-034. **Where it differs from the ADR, the ADR wins until amended** (ADR-034 consequences).
**Related:** [GLB_EXPORT_AND_VALIDATION.md](GLB_EXPORT_AND_VALIDATION.md) (check V50), [BLENDER_PRODUCTION_GUIDELINES.md](BLENDER_PRODUCTION_GUIDELINES.md), [ASSET_QA_CHECKLIST.md](ASSET_QA_CHECKLIST.md), [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md), [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §9, audits [D](audits/D_WEBXR_ARCHITECTURE.md) §6, [E](audits/E_BLENDER_PIPELINE.md), [F](audits/F_QA_PERFORMANCE.md) §3

## 1. How to read the numbers

One budget set replaces the three that the audits produced (D §6.3, E §2.1 and §8, F §3; conflict I-13). Rule used: where audits disagreed, the stricter value applies unless a measured asset or a documented count already exceeds it, and each exception is stated.

Basis marks: **O** an official Meta or competition figure; **I** an IWSDK or ADR-023 limit; **E** our engineering estimate to confirm on hardware. A value without a mark is E. Meta publishes no WebXR triangle budget and no Quest 3S figure (audit F §3.1); its draw-call and triangle numbers are native-app guidance, so even O values are references, not guarantees.

The per-GLB values are **ceilings, not allowances**. Stage 1 of each asset sets an allowance at or below the ceiling so that the scene totals of section 4 hold; the lead tracks the running sum per scene. An asset over its ceiling needs the lead's written exception, with a reason, in its manifest entry. An asset whose integration takes a scene over a ceiling is not INTEGRATED.

## 2. Per GLB, by category

The manifest `category` field is the key, and each entry's `budgets` block carries these values. The validator fails any GLB over its category (check V50).

| Category | Triangles | Primitives (draws) | Materials | Own texture memory | GLB file |
|---|---|---|---|---|---|
| Tiny fastener (pin, rivet, screw, nut, washer, collar) | 300 | 1 | 1 | 0 | 30 KB |
| Gear | 4,000 | 2 | 2 | 0 | 250 KB |
| Other mechanical part (shaft, spring, crank, cam, pawl, pulley, pendulum, escapement) | 1,500 | 2 | 2 | 0 | 250 KB |
| Machine assembly or housing | 60,000 | 48 | 6 | 0, or hero pool | 3 MB (I) |
| Building (Bakery, houses, theatre facade) | 25,000 | 16 | 6 | 0, or hero pool | 2 MB |
| Hero tower (Windmill tower, Clock Tower shell; moving parts are separate) | 50,000 | 24 | 8 | 0, or hero pool | 3 MB (I) |
| Character or automaton | 1,500; if skinned, a shared skeleton of at most 40 bones | 4 | 3 | 0 | 400 KB |
| Prop (letter, parcel, gift box, lantern) | 3,000 | 3 | 2 | 0 | 200 KB |
| Environment set (stand, trunk, workbench, plot terrain) | 40,000 | 24 | 8 | 0, or hero pool | 3 MB (I) |

Choices between the audits (ADR-034): gears keep audit F's 4,000, not D's 2,000, because the only measured part, the shipped 16-tooth gear, has 3,872 triangles (audit E §2.1). Other parts take F's 1,500, stricter than D's 2,000. Characters take D's 1,500 with a shared skeleton, stricter than F's 6,000; no character exists yet. Draw calls are what hurt first on Quest in WebXR (Meta's example: 1,000 single-triangle draws would likely miss 72 fps), so primitive caps are tight and triangle caps are loose (audit F §3.2).

### 2.1 Texture memory

Textures count GPU memory after decoding, with mipmaps, each image once: width x height x 4 bytes x 4/3 (validator V33). A 512 px map is 1.33 MiB, a 1024 px map 5.33 MiB, a 2048 px map 21.33 MiB. Maps are at most 1024 px (ADR-023, I), so 2048 px is not available.

| Pool | Limit | Basis |
|---|---|---|
| Per GLB | 0 | ADR-032: library parts carry proxies and vertex AO, no images |
| Shared material library | at most 48 MiB in total | ADR-034. That is room for 9 maps at 1024 px or 36 at 512 px; materials without textures (emissive, glass) cost nothing. The framework agent sets the sizes per material and reports the total |
| One hero object | at most 16 MiB (three 1024 px maps) | ADR-034; the hero is named in the manifest with the lead's written exception |
| All hero objects together | at most 48 MiB | ADR-034 |

If the owner reverses the shared library (accepted on 2026-11-06, ADR-032; [decision 4](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)), the fallback is one texture atlas per machine and these rows are redone (ADR-032 consequences).

## 3. Where the shipped and planned assets stand against it

Measured values; the manifest status tool lists the live state.

| Asset | Against its category | Verdict |
|---|---|---|
| `gear_spur_16_m1` (the M0 gear) | 3,872 triangles of 4,000, 1 primitive, 1 material: pass. 16 MiB of embedded texture against 0, and 2.38 MB (2.27 MiB) against 250 KB: **fail** | REWORK_REQUIRED; regenerated with the ADR-032 profile |
| `tockton_base_round` (the M0 stand) | 5,792 triangles, 3 primitives, 3 materials: pass. 20 MiB of texture against the 16 MiB hero cap: **fail**. 2.12 MB (2.02 MiB) of 3 MB: pass | REWORK_REQUIRED |
| Both together | 4.5 MB of GLB before Enter against a 1.5 MB GLB target (3.0 MB total target, 4 MB ceiling) | Fail; shrink them or load them after Enter is enabled (audit F §7.2) |
| `gear_spur_12_m1`, `gear_spur_24_m1` | Regenerated by the forge runner on 2026-11-06 (`blender/previews/spur_gear/spur_gear.report.json`): 2,832 and 3,712 triangles, 1 primitive and 1 material each, 151,236 and 205,472 bytes (147.7 and 200.7 KiB), no embedded image; `node tools/validate-glb.mjs`: 0 FAIL, 0 WARN for both. Both are under the 4,000-triangle and 250 KB gear ceilings. The earlier 3,456 and 5,024 triangles (blender/README.md) belong to the retired helper meshes, not to these files. The 36-tooth clay file is 259.8 KB (audit E §2.1), over the 250 KB ceiling before vertex colour adds about 8 bytes per vertex; it has not been remeasured with the new generator | **Pass for both files** (status EXPORTED, reviewer sign-off pending). The 36-tooth gear stays **open** until `gear_spur_36_m1` is built and measured (ASSET_PRODUCTION_ROADMAP §5) |

Why the totals matter: if all 88 spec part slots (Music Box 12, Carousel 20, Windmill 24, Clock Tower 32) were gears at the shipped 16-tooth size they would need 341k triangles (audit D §6.3), 85 % of the 400k target. Most slots are not gears and the other-part ceiling is 1,500, but the arithmetic is why town copies use a merged shell with only the moving parts separate, and why interior parts are hidden.

## 4. Per scene, inside an immersive session

Scenes (audit F §3.3): **S0** landing and stand with the gear; **S1** trunk and frozen town; **S2** workbench with a Music Box build, including X-ray; **S3** full awakened town with all machines running (the heaviest); **S4** gift viewer.

| Metric | Target (72 fps) | Ceiling (60 fps floor) | Basis |
|---|---|---|---|
| Frame time | p95 at most 13.9 ms | p99 at most 16.7 ms | **O.** Meta gives 13.8 ms at 72 Hz for Quest 3 and 16.6 ms at 60 fps; the competition requires at least 60 fps on Quest hardware (APP_AND_WEBSITE_GUIDELINES §5) |
| Draw calls (`renderer.info.render.calls`) | 150 | 200 | **O** for the ceiling: Meta recommends fewer than 200 for Quest 3 (native guidance, no Quest 3S figure). **E** for the target: audit F's 150 rather than D's 120, because F's on-paper count of S3 is already 150 to 190 |
| Visible triangles (`renderer.info.render.triangles`) | 400k | 750k | **O** reference: Meta recommends fewer than 1.5M for Quest 3 (native). **E:** about a quarter and a half of that. Audit D's 300k and 500k rest on a fill-rate measurement on an Intel UHD laptop GPU, which D itself says must not be scaled to Quest |
| Unique GPU texture memory | 96 MiB | 128 MiB | **E.** Library 48 plus hero pool 48 is the target; the rest of the ceiling covers hands, the environment map, the contact shadow and interface. Stricter than F's 160 MiB because the Quest Browser tab limit is unknown |

Whether Quest Browser uses multiview, which would make the draw-call count per frame rather than per eye, is unverified and is recorded at the first device reading (audit D §6.2).

### 4.1 Download (compressed transfer, all E)

| Metric | Target | Ceiling | Basis |
|---|---|---|---|
| Before Enter is enabled | 3.0 MB, of which GLBs at most 1.5 MB | 4 MB | Audit F §3.3 and §7.2; stricter than D's 5 MB |
| Each scene loaded after Enter | 8 MB | 12 MB | Audit F §3.3 |
| Whole competition build | 40 MB | 60 MB | Audit F §3.3; audit E §8 also suggests 40 MB. GLBs without embedded textures are 0.12 to 0.28 MB each (audit E §2.1), so D's 100 MB is not needed |

JavaScript before Enter is held at 2.5 MB raw and 0.7 MB Brotli by the landing owner (audit F §7.2); entry-chunk growth over 10 % needs the lead.

### 4.2 Further limits from the audits (not in ADR-034)

These rows come from audits D and F, are not in ADR-034, and stand until the lead folds them into it. The stricter value is used where the audits differ.

| Item | Target | Ceiling | Basis |
|---|---|---|---|
| Transparent overdraw (X-ray casing at 15 % opacity is the worst case; one X-ray at a time) | at most 2 blended layers deep; blended pixels at most 15 % of the eye buffer | 25 % | E (audit F §3.3) |
| Lights | one hemisphere plus one directional; at night at most 4 extra point lights; none from GLBs | same | CLAUDE.md §8. Meta advises one directional or one point light with PBR (O), so the 4-light night allowance is to be decided after a device test (audit D §6.3) |
| Shadow maps, post-processing passes | 0, 0 | 0, 0 | CLAUDE.md §8 |
| Shader programs (`renderer.info.programs`) | 20 | 32 | E; first-use compile hitches. Pre-warm with `renderer.compileAsync` behind the loading screen |
| Material class | `MeshStandardMaterial`; at most 3 `MeshPhysicalMaterial` (velvet and similar) | | Audit D §6.3 |
| App logic per frame | 2 ms | 4 ms | O guidance: Meta says logic over 2 ms is worth optimising |
| Solver | one solve of the largest blueprint (32 parts) under 1 ms in Node | 3 ms | E; the solver runs on events only |
| Live grabbable entities | 60 | | Audit D §6.3: IWSDK rebuilds the interactable arrays every frame and uses O(n^2) lookups. Remove the grab component from parts that are not reachable |
| Spacing of small grabbable parts | 8 cm centre to centre, or a custom `spherecast` | | Audit D §6.3: the grab sphere has a 7 cm radius |
| IWSDK payload limits | 64 MiB per model, 256 MiB total, 30 s load timeout | | I: safety limits of one loader path, not budgets |

Fixed by the stack, so assets must live with it (audit D §6.2): MSAA 4 samples in XR with no switch; foveation 1.0 (maximum); framebuffer scale 1.0, fixed during a session; hands always cost 4 draw calls and about 9.3k triangles; any custom shader (frozen and awakened tint, wake ripple, X-ray) is untested on a Quest.

## 5. What the budgets force on asset design

On-paper S3 draw calls (audit F §3.3): stand 3, trunk about 8, four town buildings about 40, 56 machine parts at about 1.3 primitives each about 73, hands and interface about 20. That is roughly 150 to 190, so S3 sits on the ceiling. Therefore:

1. **Hide interior parts.** Three.js has no occlusion culling. A part inside an opaque casing is a separate, named node that the runtime hides unless X-ray is on.
2. **Merge and instance.** Merge static geometry; keep moving parts separate; place repeated parts as instances of one cached GLB (ADR-030, ART_ASSET_PIPELINE §12).
3. **Few materials.** Every extra material per mesh is another draw call. Shared library materials make clones share them.
4. **Opaque by default.** Alpha only where the manifest allows it.
5. **No cost for state.** Frozen and awakened looks are material states, not extra meshes.
6. **Parts are cheap, hosts are not.** A town copy of a machine uses a merged shell; a build-mode machine uses the individual parts.

## 6. How each budget is checked

| Budget | Check | Level that can prove it | State |
|---|---|---|---|
| Per-GLB category values | Validator V50 (PERF-02) | Desktop | Validator not built |
| Draw calls, triangles, programs, texture memory per scene | `renderer.info` through the `?debug` world hook in Playwright (PERF-01) | Desktop and IWER count; Quest Browser, Quest 3 and Quest 3S for the real figure | `?perf` probe and hook not built |
| Download bytes per scene | Playwright records same-origin response sizes against a budget file (PERF-03) | Desktop | Not built |
| Leaks (assemble and tear down 50 times; enter and exit IWER 10 times) | PERF-06 | Desktop and IWER | Not built |
| Frame time p95 and p99, 72 fps, 60 fps floor, GC and shader hitches, thermal stability | The `?perf` probe and Meta's OVR Metrics Tool on a headset (PERF-13) | Physical Quest 3 and physical Quest 3S only | **Blocked**: no headset, no named tester (task TP-7) |

IWER runs at about one frame per second in software, so no frame rate measured there means anything (audit F §4.1). A desktop number is never reported as a Quest number.

## 7. Revision

The values change only by an amendment to ADR-034. The first Quest reading (frame time, multiview, texture memory) is the trigger for review (audit F §8 risk 7). Candidates already named: the 128 MiB texture ceiling against F's 160 MiB; the 4-light night allowance; the gear ceiling (section 3); KTX2 if a Quest shows memory pressure (ADR-035).

## 8. Dependencies

- Owner decision 4 (shared materials) for every texture row: accepted on 2026-11-06 (ADR-032), still reversible.
- The validator (V50, V33), the `?perf` probe and the PERF-01 and PERF-03 tests (lead and framework agent).
- A tester and a headset for every frame-time row.
- Footprints and scale of plots, machines and buildings (gaps G-07 and G-08) before Stage 1 allowances for the Carousel, Windmill and Clock Tower can be set.

## 9. Acceptance criteria

1. The category table in section 2 equals ADR-034 value for value, and every manifest `budgets` block equals the ceiling of its category.
2. Every GLB passes V50, or its manifest entry carries the lead's written exception with a reason.
3. After each batch is integrated, S1 to S3 counts are read from `renderer.info` and stay inside the section 4 ceilings; an asset that breaks one is returned to REWORK_REQUIRED with reason code BUDGET_BREACH.
4. The shared library and hero pool totals are reported and stay at or under 48 MiB each.
5. No document or report states a frame rate for a Quest unless a named tester produced it on a named device.
