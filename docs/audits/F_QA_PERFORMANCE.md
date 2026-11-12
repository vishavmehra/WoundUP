# Audit F: QA and Performance

Agent F, QA and Performance Auditor. Date: 2026-11-06 (IST, machine clock). Read-only audit: nothing in the repo was changed except this file.

Marks used below: **[V]** checked by running it or reading the file, **[E]** our own engineering estimate to confirm on hardware, **[U]** Unverified. Official sources are cited by URL.

Snapshot caveat: another process was rebuilding `dist/` and editing docs while this audit ran. The entry chunk hash changed three times. Numbers tied to `dist/` are a snapshot taken about 12:15 IST.

## 0. Read this first

1. **The GLB validator needs no new dependency.** A prototype (about 240 lines of Node, plus the repo's own three.js GLTFLoader with image decoding stubbed) ran against both shipped GLBs and a helper gear. It also caught all 6 defects seeded into a copy of the gear. Path and results are in section 2.2 [V].
2. **The current GLB pattern does not scale.** The two shipped assets already need about 36 MiB of GPU texture memory (gear 16 MiB, stand 20 MiB), because each GLB embeds its own 1024 px maps. If each of 12 Music Box parts copied the gear's pattern, that is 192 MiB, above the 160 MiB ceiling proposed here [V arithmetic on measured files]. Agent C reached the same conclusion from file sizes. This needs a lead decision (section 3.4).
3. **The public page is gated on 4.4 MB of GLBs and 2.4 MB of JavaScript.** Enter enables about 80 ms after the scene JSON, which loads after both GLBs. The first paint waits for the 2.3 MB JS chunk because `index.html` has an empty body [V].
4. **Official performance numbers are few.** Meta gives, for Quest 3, fewer than 200 draw calls and fewer than 1.5M triangles per frame, a 13.8 ms budget at 72 Hz. It gives no WebXR triangle budget and no Quest 3S column. Everything else here is our estimate, marked [E].
5. **All hardware levels are Blocked.** There is no headset and no named tester. Quest Browser, Quest 3 and Quest 3S evidence is zero. A tester must be booked before about 12 November to leave fix time before the 16 November freeze.
6. **QA plumbing gaps (section 1):** CI runs no Playwright and no asset checks; the emulator spec silently skips when the dev runtime is down; Playwright reuses an already-running preview server and so can test a stale build; no frame-time or draw-call instrumentation exists in `src/`.
7. **IWSDK's glTF loader defaults to fetching Draco and KTX2 decoders from `unpkg.com`.** ADR-023 and ADR-025 avoid it by forbidding those formats. The validator must enforce that rule mechanically (section 2) [V].

## 1. QA baseline today

| Item | State | Evidence |
|---|---|---|
| Unit tests | 3 files, 16 tests, all pass | `npx vitest run`, 12:18 IST [V] |
| Typecheck, lint | `tsc --noEmit` and `eslint src tests ...` print no errors | run 12:19 IST [V] |
| Playwright `landing.spec.ts` | 3 tests (APP-01/03, preview flow, INT-11 preview). Watches console errors and any non-localhost request | read; not run by this audit, because its web server step rebuilds `dist/` which another process is using |
| Playwright `xr-emulator.spec.ts` | 3 tests (APP-02/04/06, stand placement, ADR-025 hand models). Needs the IWSDK dev runtime on `https://localhost:8081`; **skips itself** if it is not up (`tests/e2e/xr-emulator.spec.ts:44-48`) | read [V] |
| CI | `.github/workflows/ci.yml`: typecheck, lint, test, build. **No Playwright, no asset checks, no size check, no deployed smoke test** | read [V] |
| Stale-build risk | `playwright.config.ts` has `reuseExistingServer: true`; a preview server was already listening on :4173 during this audit, so `npm run test:e2e` would test whatever `dist/` it serves, with no rebuild | netstat + config [V]; consequence inferred |
| Perf instrumentation | None. `src/render-budget.ts` only throttles the 2D preview (60 fps cap, resolution scale). XR frames are unlimited by design. No `renderer.info`, no frame-time ring buffer anywhere in `src/` | grep [V] |
| Hardware | Zero evidence at any Quest level; TBL-13 to TBL-18 already Blocked in `ACCEPTANCE_TESTS.md` | docs [V] |

Document conflicts to fix (lead owns the docs):

| Topic | Conflict | Proposed fix |
|---|---|---|
| Status labels | `TESTING_QA_PLAN.md` §11 uses PASS/FAIL/BLOCKED/NOT TESTED/NOT APPLICABLE. `ACCEPTANCE_TESTS.md` §3 uses Not Run/Pass/Fail/Blocked/Not Applicable | One set. Use the `ACCEPTANCE_TESTS.md` set |
| "Hardware" class | `ACCEPTANCE_TESTS.md` §2 has one Hardware class. It cannot say Quest 3 versus Quest 3S, or a borrowed older headset | Replace with the three Quest levels in section 4.1 |
| Performance acceptance | `ACCEPTANCE_TESTS.md` §15 and `TESTING_QA_PLAN.md` §7 list what to measure but give no thresholds and no test IDs. The only numbers are 72 and 60 | Add PERF-01 to PERF-13 and the budgets in section 3 |
| Asset acceptance | No asset test IDs exist | Add AST-01 to AST-14 (section 6) |
| ADR-023 | Caps one GLB at 3 MB with textures at most 1024 px, but nothing caps the sum | Add the aggregate and scene budgets (section 3) |

## 2. Automated GLB validator

### 2.1 Design

Four layers, in one Node script, no new dependency. Suggested path `scripts/validate-glb.mjs`, run as `npm run assets:check`, plus a Vitest wrapper `tests/assets/glb.test.ts` so `npm test` and CI cover it. The lead adds the script and the npm entries; this audit may not write to the repo.

| Layer | What it does |
|---|---|
| A. Container and JSON | Parses the GLB header, chunks and JSON with `node:fs` only. Reads accessor data from the BIN chunk |
| B. Rules from the manifest | Applies the per-entry checks in 2.4 using the category budgets in section 3 |
| C. Loader round trip | Parses the same bytes with `three/examples/jsm/loaders/GLTFLoader.js` from `node_modules` (super-three 0.185, the version the game ships). Node has no image decoder, so `createImageBitmap` is stubbed; real image sizes come from the PNG/JPEG headers in layer A |
| D. Cross-manifest | Duplicate geometry, duplicate images, orphans, unresolved asset references (2.5) |

Exit code 1 on any FAIL. WARN lines are printed and must be reviewed, not ignored. The validator treats any exception as a FAIL and keeps the other failures it already found.

### 2.2 Prototype and proof [V]

File: `C:/Users/ASUS/AppData/Local/Temp/claude/11151372498ff63e/3e881673-e213-49c9-8bcf-435cb9f9d086/scratchpad/audits/validate-glb-proto.mjs` (236 lines). It is a session scratch file; the lead should copy it to `scripts/` before the session ends. Manifests: `manifest-proto.json`, `manifest-seeded.json` in the same folder.

Run: `node validate-glb-proto.mjs <repoRoot> <manifest.json> [glbRoot]`. It validated 3 GLBs in about 0.25 s.

| Asset | Result under the proposed budgets | Why |
|---|---|---|
| `gear_spur_16_brass.glb` (part) | FAIL | texture memory 16 MiB over 4 MiB; file 2.27 MB over 0.39 MB. Passes tris (3,872 of 4,000), size 64 x 64 x 15.2 mm, origin at bore centre, name and material checks |
| `tockton_base_round.glb` (environment set) | PASS | 5,792 tris, 3 primitives, 3 materials, 20 MiB textures (limit 24), 2.02 MB (limit 3 MB). `KHR_materials_sheen` is the only extension. Loader maps `Mat_VelvetTeal` to `MeshPhysicalMaterial`. Size 0.46 x 0.045 x 0.46 m, origin at bottom-face centre |
| `gear_spur_12_brass.glb` (helper, not shipped) | FAIL on file size; also failed size because the manifest declared 56 mm and the real size is 49.5 mm. That was my wrong guess, not an asset defect. It shows a wrong declaration is caught |
| Seeded copy of the gear | 11 FAIL lines | All 6 seeded defects found: forbidden `KHR_draco_mesh_compression`, external image URI, lying POSITION `max`, non-identity node transform, material `Brass_Final2` not in the library, `BLEND` alpha. The loader failure and the origin offset were also reported |

Two bugs in my first draft were found by the seeded run and fixed (crash on an external image; a loader exception that discarded earlier results). A validator that dies on malformed input is not a gate.

### 2.3 Manifest fields the validator reads

One row per GLB. The join key to game data is `PartDef.visual.assetId` (`DATA_AND_BLUEPRINT_SPEC.md` §4). Field names are proposals; reconcile with the lead's manifest.

`id`, `path`, `class` (G0-required, G0-optional, G1 to G5, Research), `category` (budget key), `source` {blend, generator command}, `dimensionsM` [x, y, z] with `dimTolerance`, `origin` {x, y, z: centre|min|max}, `axis` (for rotating parts, +Z per ADR-020), `pivotNodes[]`, `requiredNodes[]`, `sockets[]` {name, positionM, axis}, `materials[]` (library names), `tiledMaterials[]`, `allowAlpha[]`, `allowDoubleSided[]`, `animations[]` {name, loop, durationS}, `grabbable` {colliderRadiusM}, `variantOf`, `usedBy[]`, `distinctBecause`, `licence`, `status`, `statusCommit`, `evidence[]`, `verified` {desktop, iwer, questBrowser, quest3, quest3s}.

### 2.4 What it must check per entry

"P" marks checks already working in the prototype. Others are specified and straightforward to add.

| ID | Check | How | Result |
|---|---|---|---|
| **glTF 2.0 validity** | | | |
| V01 P | GLB container | magic `glTF`, version 2, header length equals file size, JSON chunk first, chunk lengths 4-byte aligned, no unknown chunk | FAIL |
| V02 P | asset version | `asset.version == "2.0"`; record `asset.generator` (WARN if it is not `Khronos glTF Blender I/O`: hand-edited or other tool) | FAIL / WARN |
| V03 | References in range | every node, mesh, material, accessor, bufferView, texture, image, sampler, animation index exists; no node cycles; one parent per node | FAIL |
| V04 P | Accessors | component and type valid, ranges inside BIN, indices below vertex count, POSITION `min`/`max` equal the real data within 1e-5 | FAIL |
| V05 P | No external data | no `buffers[].uri`, no `images[].uri`, no `data:` URIs | FAIL |
| V06 P | Extensions | `extensionsUsed` and `extensionsRequired` within the allowlist. Proposed allow: `KHR_materials_sheen`, `KHR_materials_clearcoat`, `KHR_materials_emissive_strength`, `KHR_materials_ior`, `KHR_texture_transform`. Deny: `KHR_draco_mesh_compression`, `EXT_meshopt_compression`, `KHR_texture_basisu` (ADR-023), `KHR_materials_transmission` and `KHR_materials_volume` (three.js adds a render pass for transmissive objects), `KHR_lights_punctual` (lights belong to code, CLAUDE.md section 8) | FAIL |
| V07 P | Image formats | only PNG or JPEG; header decodes to width x height | FAIL |
| **Scale, box, origin, pivot, Y-up, transforms** | | | |
| V20 | Y-up | glTF is Y-up by definition, so a Z-up mistake shows as swapped axes. Covered by V21 | via V21 |
| V21 P | Bounding box vs declared size | real vertex data through node matrices, not accessor metadata; default tolerance 1% | FAIL |
| V22 P | Origin and pivot | per-axis rule (centre/min/max) within 0.5 mm. Gear: bore centre. Stand: bottom-face centre (ADR-020) | FAIL |
| V23 P | Transforms applied | root and child nodes identity unless listed in `pivotNodes`; no `matrix`; no negative or non-uniform scale | FAIL |
| V24 | Rotation axis | for rotating parts: smallest extent along +Z, XY centroid within 0.5 mm of 0, maximum radius equals declared tip radius within 1% | FAIL |
| V25 P | Names | unique non-empty node names, mesh name equals node name, PascalCase_Underscore pattern, no `.001` suffixes | FAIL |
| V26 P | Required nodes | every `requiredNodes` entry exists exactly once (pivots, `SOCKET_*`, moving groups) | FAIL |
| **Materials and textures** | | | |
| V30 P | Material names | each name is in the shared library list (`Mat_AgedBrass`, `Mat_Walnut`, `Mat_VelvetTeal`, more as added); unused materials WARN | FAIL / WARN |
| V31 P | Alpha and sidedness | `alphaMode` OPAQUE unless listed in `allowAlpha`; `doubleSided` WARN unless listed | FAIL / WARN |
| V32 P | Texture limits | embedded only, at most 1024 px (ADR-023), power of two, PNG/JPEG | FAIL |
| V33 P | Texture memory | sum over unique images of width x height x 4 x 4/3 (RGBA8 plus mip chain; three.js uploads PNG/JPEG uncompressed) | FAIL over budget |
| V34 P | Loaded material class | via the loader: `MeshStandardMaterial`, or `MeshPhysicalMaterial` only where sheen/clearcoat is declared | FAIL |
| V35 | Required attributes | POSITION, NORMAL, TEXCOORD_0 on lit meshes; `COLOR_0` allowed; `JOINTS_0`/`WEIGHTS_0` only for characters; TEXCOORD_1 WARN | FAIL / WARN |
| **Geometry quality** | | | |
| V10 P | Triangles only | mode 4; counts of triangles, vertices, primitives, meshes, nodes | FAIL |
| V12 P | Finite data | no NaN or infinity in POSITION; normals unit length within 1e-3 (WARN) | FAIL / WARN |
| V13 P | Degenerate triangles | zero | FAIL |
| V14 P | UV range | inside 0..1 except materials listed in `tiledMaterials` | FAIL |
| V15 | Index width | Uint16 when under 65,536 vertices | WARN |
| V16 | Closed solids | assets flagged `closed`: every edge shared by two triangles, positive signed volume | WARN |
| **Budgets** | | | |
| V50 P | Budgets | triangles, primitives, materials, texture MiB, file bytes against the category (section 3.2) | FAIL |
| **Animation** | | | |
| V40 | Clips | default is zero clips (the Blender export sets `export_animations=False`, `wu_common.py` line ~675). Where the manifest lists clips: names present, channels target existing nodes, input times strictly increasing, duration in range, first key equals last key when `loop` | FAIL |
| V41 | Moving parts | each moving part is its own node with its pivot at the rotation centre and no static geometry beneath it (`ART_ASSET_PIPELINE.md` section 10). Test: rotate the pivot node; subtree centre of rotation drifts under 0.5 mm | FAIL |
| **Colliders and sockets** | | | |
| V60 | Raycastable | grabbable assets contain at least one triangle mesh. IWSDK hit-tests grabbables by raycasting the Object3D tree (`@iwsdk/core/dist/grab/grab-warnings.d.ts`: `hasRaycastableMesh`) [V] | FAIL |
| V61 | Collider radius | `colliderRadiusM` declared and at least 0.012 m (`INTERACTION_SPEC.md` section 7.2). The collider is data, not geometry in the GLB. It must equal `PartDef.grab.colliderRadius`. Visible mesh is never enlarged | FAIL |
| V62 | Sockets | each declared `SOCKET_*` node sits within 0.5 mm of the declared position and its +Z within 1 degree of the declared axis | FAIL |
| **Loader round trip** | | | |
| V70 P | Loads | `GLTFLoader.parse` succeeds, captured `console.warn` output is empty, loader `Box3` equals the raw box within 0.1 mm, scene is non-empty, `clone()` works (IWSDK `getGLTF` returns clones) | FAIL |

### 2.5 Cross-manifest checks

| ID | Check | Result |
|---|---|---|
| X01 P | Same geometry hash (SHA-1 of POSITION and index bytes) under two ids: an exact duplicate export | FAIL |
| X02 P | Same triangle count, vertex count and size rounded to 0.2 mm: near duplicate. Needs `variantOf` and a stated differing parameter | WARN |
| X03 P | Same embedded image hash in two GLBs (for example brass textures repeated) | WARN now; FAIL after the shared-material decision |
| X04 | Orphans both ways: every GLB under `public/assets/models` is in the manifest and every manifest path exists; every `visual.assetId` and every URL in `src/assets.ts` resolves | FAIL |
| X05 | Artificial splitting: entries with empty `usedBy`, or four or more siblings with one parent and identical material sets, are listed for human review. A `distinctBecause` sentence is required | WARN |
| X06 P | **The real GLB count.** Print the number of unique geometry hashes per class label. That is the validated deliverable count the owner asked for, free of duplicates | report |

### 2.6 What Khronos gltf-validator would add

Package `gltf-validator` on npm, Apache-2.0, command-line and JavaScript, writes a JSON report and exits non-zero on errors (README of https://github.com/KhronosGroup/glTF-Validator, fetched) [V]. It is **not installed** in this repo [V: not in `node_modules`]. **Installing it needs the owner's approval** (new dev dependency; use it for release-candidate runs only).

| It adds | It cannot do |
|---|---|
| Full spec conformance: JSON-schema property types, every accessor, bufferView and sparse accessor rule, animation sampler rules, skin and joint rules, extension payload schemas for `KHR_*`, image header consistency and non-power-of-two warnings, unused-object warnings. An independent second implementation of V01 to V07 | Our budgets, material library, names, pivots, declared sizes, sockets, colliders, duplicate detection, or any game rule |

Recommendation: do not block M1 on it. Ask for approval before the first release-candidate asset run.

## 3. Budgets

### 3.1 Where the numbers come from

| Source | What it says | Status |
|---|---|---|
| Meta, device comparison, https://developers.meta.com/vr/resources/device-optimization-comparison/ | Quest 3: target 72 Hz (90 Hz recommended), frame budget 13.8 ms at 72 Hz, recommended draw calls fewer than 200, recommended triangles fewer than 1.5M per frame, ASTC recommended. Chipset Snapdragon XR2 Gen 2, 8 GB RAM, 2064 x 2208 per eye. Page compares Quest 3 with Quest 2 only | Official [V fetched]. No Quest 3S column |
| Meta, Unity testing page, https://developers.meta.com/vr/documentation/unity/unity-perf/ | Quest 3 and 3S draw-call example ranges 200-300 (busy), 400-600 (medium), 700-1000 (light); triangles 1.3M-1.8M "internally-recommended". Unity-specific; says nothing on texture memory | Official, but not WebXR |
| Meta, WebXR best practices, https://developers.meta.com/vr/documentation/web/webxr-perf-bp/ | With PBR, limit to one directional or one point light; a shadow-casting point light costs 6 shadow maps; KTX 2.0/Basis recommended; draw opaque front to back; transparent draws overdraw. No numeric budgets | Official [V fetched] |
| Meta, WebXR workflow, https://developers.meta.com/horizon/documentation/web/webxr-perf-workflow/ | 60 fps = 16.6 ms, 72 = 13.7 ms, 90 = 11.1 ms. 1000 single-triangle draw calls would likely fall below 72 fps from CPU cost. App logic over 2 ms is worth optimising. Framebuffer scale 0.8-0.9 is a last resort. Tools: OVR Metrics Tool (in-headset HUD), Chrome Tracing, RenderDoc for Oculus. CPU-bound test: disable rendering; fill-bound test: render scale 0.01 | Official [V fetched] |
| Devpost rules via `APP_AND_WEBSITE_GUIDELINES.md` section 5 | Minimum 60 fps on Quest hardware | Official (as supplied by the owner) |
| IWSDK source in `node_modules` | 64 MiB per model and 256 MiB total payload ceilings (`@iwsdk/scene-composition/dist/validation.js:17-18`); 30 s load timeout (`@iwsdk/core/dist/asset/loaders/cached-asset-load.js:10`). Safety limits, not performance budgets | IWSDK [V] |
| https://iwsdk.dev/skill.md | Asset section says GLTF/GLB only. No performance budgets. The rest of iwsdk.dev was not crawled | [V fetched skill.md] |
| Google, https://web.dev/articles/vitals | Good thresholds at the 75th percentile: LCP 2.5 s, INP 200 ms, CLS 0.1 | Official [V fetched] |
| Everything else in this section | Our estimates | [E] |

Unverified: any Quest 3S-specific number (display, GPU clocks, memory limits, plane-detection quality); whether Quest Browser or `super-three` uses `OCULUS_multiview` in IWSDK sessions (the class exists in `three.module.js:4713`), which decides whether `renderer.info.render.calls` counts one pass or two; the per-tab memory limit of Quest Browser.

### 3.2 Per asset category [E]

Textures count GPU memory after decoding, with mipmaps (1024 px map = 5.33 MiB; 512 px = 1.33 MiB; 2048 px = 21.33 MiB). The columns are ceilings per GLB, not allowances. Scene totals in 3.3 still apply.

| Category | Triangles | Primitives (draws) | Materials | Own texture memory | GLB size |
|---|---|---|---|---|---|
| Tiny fastener (pin, rivet, screw, nut, washer, collar) | 300 | 1 | 1 | 0 | 30 KB |
| Gear or part (gears, shafts, springs, cranks, cams, pawls, pulleys, pendulums, escapement) | 4,000 for a gear, 1,500 for simple parts | 2 | 2 | 0 with a shared library; 4 MiB if embedded | 250 KB shared; 400 KB embedded |
| Machine assembly (finished machine with its moving sub-nodes) | 60,000 | 48 | 6 | 16 MiB | 3 MB |
| Building (Bakery, houses, theatre facade) | 25,000 | 16 | 6 | 16 MiB | 2 MB |
| Hero tower (Clock Tower shell, Windmill tower; moving parts are separate entries) | 50,000 | 24 | 8 | 24 MiB | 3 MB |
| Character or automaton | 6,000; skinned: at most 40 bones | 4 | 3 | 4 MiB | 400 KB |
| Prop (letters, parcel, gift box, barrel, lantern) | 3,000 | 3 | 2 | 2 MiB | 200 KB |
| Environment set (stand, trunk, workbench, plot terrain) | 40,000 | 24 | 8 | 24 MiB | 3 MB |

Basis: 3 MB is ADR-023's hero cap. A vertex costs about 32 bytes (position, normal, UV), so 4,000 triangles is about 150 KB; 250 KB leaves room for a small texture set. Draw calls are what hurt first on Quest in WebXR (Meta's 1000-draw example), so primitive caps are tight and triangle caps are loose.

How the shipped assets score:

| Asset | Category | Triangles | Primitives | Materials | Texture memory | File |
|---|---|---|---|---|---|---|
| `gear_spur_16_brass.glb` | Gear or part | 3,872 / 4,000 pass | 1 / 2 pass | 1 / 2 pass | 16 MiB vs 4 (or 0): **fail** | 2.27 MB vs 0.4: **fail** (passes ADR-023's 3 MB) |
| `tockton_base_round.glb` | Environment set | 5,792 / 40,000 pass | 3 / 24 pass | 3 / 8 pass | 20 / 24 MiB pass, at 83% | 2.02 / 3 MB pass |

### 3.3 Scene budgets for 72 fps target, 60 fps floor [E unless noted]

Scenes to measure: S0 landing and stand with gear; S1 trunk and frozen town; S2 workbench with Music Box build, including X-ray; S3 full awakened town with all machines running (heaviest); S4 gift viewer.

| Metric | Target | Ceiling | Basis |
|---|---|---|---|
| Frame time | p95 at or under 13.9 ms | p99 at or under 16.7 ms | 72 Hz budget and the 60 fps floor. Meta lists 13.7 and 13.8 ms for 72 Hz in two places; 1000/72 is 13.89 |
| Draw calls per frame (`renderer.info.render.calls`, inside an immersive session) | 150 | 200 | Ceiling is Meta's "fewer than 200" for Quest 3 [official]. Target is ours. Record whether the count is per eye or per pass (multiview, [U]) |
| Visible triangles per frame (`renderer.info.render.triangles`) | 400k | 750k | Meta says fewer than 1.5M [official]. Ours are 27% and 50% of that, for WebXR overhead, two views, PBR with normal maps and sheen |
| Unique GPU texture memory (each image counted once) | 96 MiB | 160 MiB | Estimate; Quest 3 has 8 GB RAM shared, the tab limit is [U] |
| Transparent overdraw | at most 2 blended layers deep; blended pixels at most 15% of the eye buffer | 25% | Estimate; the X-ray casing at 15% opacity is the worst case; one X-ray at a time |
| Lights | Hemisphere plus one directional; at night, at most 4 extra point lights | same | CLAUDE.md section 8; Meta suggests one directional or one point for PBR |
| Shadow maps, post-processing passes | 0, 0 | 0, 0 | CLAUDE.md section 8 |
| Shader programs (`renderer.info.programs`) | 20 | 32 | Estimate; first-use compile hitches |
| App logic per frame on Quest | 2 ms | 4 ms | Meta: over 2 ms is worth optimising [official guidance] |
| Solver | one solve of the largest blueprint (32 parts) under 1 ms in Node | 3 ms | Estimate; solver runs on events only (`TECHNICAL_ARCHITECTURE.md` section 20) |
| Download before Enter (compressed) | 3.0 MB | 4 MB | Estimate |
| Download per scene (extra, lazy) | 8 MB | 12 MB | Estimate |
| Download, whole game | 40 MB | 60 MB | Estimate. IWSDK's 64 MiB and 256 MiB are safety limits, not budgets |

On-paper S3 draw calls [E]: stand 3, trunk about 8, four town buildings about 40, 56 machine parts at about 1.3 primitives each about 73, hands and UI about 20. That is roughly 150-190, so S3 sits on the ceiling. **Interior parts hidden inside an opaque casing must not render** (three.js has no occlusion culling): set them invisible unless X-ray is on. Static geometry merging and instancing (already required by `ART_ASSET_PIPELINE.md` section 12) are needed, not optional.

### 3.4 The texture-memory problem and a lead decision

Measured: the gear embeds 3 x 1024 px maps (16 MiB decoded). The stand embeds 9 images (20 MiB). Textures are not shared across GLB files, because each GLB is parsed separately and creates its own texture objects (inference from how `GLTFLoader` works; not tested). IWSDK's `getGLTF` shares geometry and materials only between clones of one loaded asset (iwsdk.dev/skill.md, section 4) [V]. The pipeline also bakes ambient occlusion into a per-asset ORM texture (`blender/README.md`), which blocks sharing.

| Option | Effect | Cost |
|---|---|---|
| A. Shared material library: GLBs carry geometry plus material names; the runtime swaps in shared materials (the validator already checks names). Ambient occlusion moves to `COLOR_0` vertex colours | GLB per part about 100-250 KB; texture memory flat as parts grow | Change to the Blender generators; runtime material swap; loses per-asset baked textures |
| B. Per-machine atlas: one 1024 px set per machine, shared by its parts | About 16 MiB per machine | UV packing across parts; loader must share the texture object |
| C. Keep as is | 16 MiB per gear-like asset | Fails the scene ceiling after about 9 such assets |
| D. KTX2/ASTC (decoders self-hosted) | 1024 px map about 0.6 MiB instead of 5.33 (computed, ASTC 6x6) | Blocked by ADR-023. IWSDK's loader defaults to `https://unpkg.com/three@0.185.0/...` for decoders (`@iwsdk/core/dist/asset/loaders/gltf-loader.js:25,47,50`) and `AssetManager.init(renderer, world)` is called without options (`world-initializer.js:429`), so the paths cannot be set before the critical preload [V]. Whether they can be overridden afterwards for background assets is [U] |

QA recommendation: A for parts, B for machines, and reserve D. This is an art and architecture decision for the lead and owner. QA only needs it made before the part library is mass-produced.

## 4. Runtime performance checks without a headset

### 4.1 Verification levels (kept separate)

| Level | Meaning | Evidence a record must carry |
|---|---|---|
| Desktop verified | Chrome or Edge on the dev machine (i7-10875H, RTX 2060 and Intel UHD) or CI. The 2D page and the `?debug` hooks | command, commit, date |
| IWER verified | The IWSDK emulator (IWER): emulated Quest 3 headset, hands, rooms. Software rendering runs at about one frame per second (comment at `tests/e2e/xr-emulator.spec.ts:74`), so frame rates there mean nothing | spec name, room, commit |
| Quest Browser verified | Meta Quest Browser on **any** Quest-family headset a tester has. Proves that browser version's WebXR behaviour only. Not Quest 3 or 3S performance | device model, OS, browser version, recording |
| Physical Quest 3 verified | Quest 3 plus Quest Browser, per test ID | same |
| Physical Quest 3S verified | Quest 3S plus Quest Browser, per test ID. Optics, display and sensing may differ from Quest 3; effects are [U], so repeat, do not assume | same |

Rules: no level implies another. IWER is never promoted. A test record names its level. This replaces the single "Hardware" class.

### 4.2 Checks that work now

| ID | Check | How | Proves | Does not prove |
|---|---|---|---|---|
| PERF-01 | Counts per scene state | read `renderer.info` (calls, triangles, geometries, textures, programs) through the `?debug` `__world` hook in Playwright; assert against 3.3 | Counts are within budget. Deterministic | Frame rate, fill rate, multiview behaviour |
| PERF-02 | Static asset budgets | the validator (section 2) | File and geometry limits | Anything at runtime |
| PERF-03 | Bytes per scene | Playwright records same-origin response sizes per scene; assert against 3.3 | Download size | Download time on the tester's Wi-Fi |
| PERF-04 | CPU cost trend | per-frame JS time with CPU throttling 4x and 6x (Chrome DevTools Protocol `Emulation.setCPUThrottlingRate`); compare to a stored baseline | Regressions between commits | Quest CPU or GPU time. The factor between this laptop and Quest is [U]; do not convert. Not run in this audit |
| PERF-05 | Allocation churn | 600 steady frames in build mode; heap or `performance.memory` delta | No steady growth, no per-frame garbage in our code | Garbage-collection pauses on Quest |
| PERF-06 | Leak loop | assemble and tear down the Music Box 50 times; enter and exit IWER 10 times; `renderer.info.memory` returns to baseline, JS heap within +10% | No leaks in our code | Device memory |
| PERF-07 | Overdraw | render with a debug material (additive blend, dark colour, no depth test) and read the pixels; report blended coverage and maximum layers, including X-ray | Geometry-driven overdraw | Fragment cost on Quest |
| PERF-08 | Solver cost | Vitest benchmark of the largest blueprint, 10,000 solves | Algorithm cost in Node | Quest CPU speed |
| PERF-09 | Load timeline | built preview, cold cache: html, JS, GLB, ready times (script in section 7) | Where startup time goes | Real network conditions |
| PERF-10 | Shader warm-up | programs after visiting every scene state; frame times for the first 30 frames after a new material appears | Program count, first-use spike on desktop | Shader compile time on Quest |
| PERF-11 | IWER soak | 5 minutes of a session in IWER | Functional stability of the stereo path | Any frame-rate conclusion |
| PERF-12 | Third-party request guard | extend the `landing.spec.ts` request watcher to XR flows; fail on `unpkg.com`, `jsdelivr.net` and anything off-origin | The no-third-party rule (ADR-025) | Controller-model fetches (known exception in ADR-025) |
| PERF-13 | In-session probe | the `?perf` probe below | On Quest it is the main source beside OVR Metrics Tool | n/a |

### 4.3 What each level can prove

Yes = proves it. Part = proxy only. No = cannot.

| Claim | Desktop | IWER | Quest Browser | Quest 3 | Quest 3S |
|---|---|---|---|---|---|
| GLB valid, sizes, triangle/primitive/material counts | Yes | Yes | Yes | Yes | Yes |
| Draw calls and triangles per frame | Part | Part | Yes | Yes | Yes |
| GPU texture memory | Part (estimate) | Part | Part | Part | Part |
| 72 fps and 60 fps floor | No | No | Part (other headset) | Yes | Yes |
| GC and shader hitches | No | No | Part | Yes | Yes |
| Thermal and long-session stability | No | No | No | Yes | Yes |
| Session entry and exit, feature negotiation | No | Part | Yes | Yes | Yes |
| Hand-tracking pinch accuracy and comfort | No | Part (ideal hands) | Yes | Yes | Yes |
| Plane detection and anchor on a real table | No | No (emulated planes) | Yes (API behaviour) | Yes | Yes |
| Look under real passthrough, audio levels | Part | Part | Yes | Yes | Yes |
| No third-party requests | Yes | Yes | Yes | Yes | Yes |

### 4.4 The missing probe (specification)

Nothing in `src/` measures frames. Build a dev-only `?perf` probe (lead owns `src/index.ts`, so the lead integrates it): a ring buffer of the last 600 frame deltas taken from the XR frame callback; p50, p95, p99, max; counts of frames over 13.9 ms and over 16.7 ms; a `renderer.info` snapshot each second; `window.__perf.report()` returning JSON (for Playwright); a "copy report" action for testers (no network, user-initiated; the project forbids telemetry). It must cost under 0.2 ms per frame and draw nothing in the headset unless asked. Without it the first Quest frame-rate number depends on a tester installing OVR Metrics Tool.

## 5. Physical hardware checklist for a future tester

Run the whole list once on a Quest 3 and once on a Quest 3S. Record each result with its level. Never fill a Quest 3S row from a Quest 3 run.

Before starting:

| Item | Record |
|---|---|
| Headset model, OS version, Quest Browser version | all three |
| Build URL and commit id (the page should show a build id; add one if it does not) | both |
| Hand tracking on; controllers put away; Space Setup done; room scanned with a real table in it | yes/no |
| Battery over 50%, headset at room temperature, Wi-Fi speed (approximate) | values |
| Recording: use the headset's record function or casting; install OVR Metrics Tool (Meta's HUD, from the Meta Quest Developer Hub or sideloaded) for frame times | yes/no |

| # | Step | Pass if | Maps to |
|---|---|---|---|
| H01 | Open the URL in Quest Browser. Time from tap to Enter enabled | Enter works within 5 s on the tester's Wi-Fi [E]; no error text | APP-01, APP-07 |
| H02 | Press Enter. Accept the prompts. Repeat once declining hand tracking, planes and anchors | Session starts both times; stand appears when declined | APP-02, APP-04, TBL-15 |
| H03 | Pinch 20 times on the smallest part; rotate the wrist 90 degrees three times | At least 18 of 20 pinches hit; one wind unit per 90 degrees | INT-01, INT-08, WIND-02, WIND-03 |
| H04 | Try three surfaces: dining table, desk, low coffee table. Then floor only, then a room without a scan | A reachable surface or the stand is chosen; no gap or sinking (photo); scale fits | TBL-13, TBL-15, TBL-16 |
| H05 | Play one full Music Box loop (about 5 min). During it: open and close the system menu; recentre (long-press Meta button); cover the cameras for about 2 s; lean 1 m | Town does not drift or jump by more than 1 cm [E] | TBL-14, TBL-08 |
| H06 | Sit 10 minutes. Reach latch, plots, workbench without leaning; note neck angle | All reachable; comfortable | TBL-17, TBL-10 |
| H07 | Frame times for 60 s in each of S1, S2 (with X-ray on), S3, S4 | No sustained dip below 60 fps; typical 72; note any stutter and where | TBL-18, PERF |
| H08 | At play distance, check each integrated hero asset: silhouette, material, shimmer on thin edges (gear teeth), pivots turn correctly, text readable, frozen versus awakened colour | Each asset marked pass or fail with a photo | TOWN-06, TOWN-07, AST-14 |
| H09 | Audio: nothing plays at startup; levels balanced; loops stop on pause and exit | Pass | Visual and audio acceptance |
| H10 | Exit the session; re-enter without reload; take the headset off for 30 s and put it back; switch tabs | Progress intact; stand or table chosen again; no crash | APP-06, TBL-09 |
| H11 | Open a gift link in the headset browser | Viewer loads and can be inspected by hand | Gifting |
| H12 | Finish the Music Box with gaze-and-pinch only, then with Easy Snap, then with ray mode | Each finishes the loop | Accessibility |
| H13 | 20 continuous minutes; note start and end frame times, headset warmth, battery drop, any tab reload | No crash; frame times do not degrade | PERF, TBL-18 |
| H14 | Repeat H04 and H05 in a second room with different lighting | Table found or stand used; passthrough blend acceptable | Rules: rooms never tested |

Return: filled table, recordings, the OVR Metrics Tool screenshots or `?perf` report, and the exact build id.

## 6. Asset acceptance tests, gates and checklist

### 6.1 Proposed tests (add to `ACCEPTANCE_TESTS.md`)

| ID | Test | Level | Type |
|---|---|---|---|
| AST-01 | Manifest complete: every GLB is listed, every entry has its file and complete fields (X04) | Desktop | Unit |
| AST-02 | Validator reports zero FAIL (V01-V70) | Desktop | Unit |
| AST-03 | Validator WARN lines reviewed and written into the evidence | Desktop | Manual |
| AST-04 | No exact duplicate geometry; near duplicates justified (X01, X02, X05) | Desktop | Unit |
| AST-05 | Category budgets met (V50) | Desktop | Unit |
| AST-06 | Loads in the runtime with no console warnings; on-screen bounding box in world metres matches the manifest | Desktop and IWER | Browser |
| AST-07 | Pivot test: rotate each moving part by the solver angle; no drift (V41) | Desktop | Unit |
| AST-08 | Visual review at gameplay distance, fixed camera, game lighting, against the approved reference | Desktop and IWER | Visual |
| AST-09 | Frozen and awakened material states both render correctly | Desktop and IWER | Visual |
| AST-10 | Grab, snap and release work with emulated hands; collider radius at least 1.2 cm | IWER | Emulator |
| AST-11 | Scene budgets re-checked after integration (PERF-01, PERF-03) | Desktop and IWER | Integration |
| AST-12 | Production build: the asset URL returns 200 under a sub-path, correct content type, bytes match the manifest (APP-08) | Desktop | Browser |
| AST-13 | Licence row in `CREDITS.md` for anything not original | n/a | Manual |
| AST-14 | Eyes-on at gameplay distance on a Quest 3, and separately a Quest 3S | Quest 3, Quest 3S | Hardware. **Blocked** until a tester exists |

### 6.2 Stage gates

Stage is separate from verification level. An asset can be INTEGRATED with Desktop and IWER evidence only; the Quest columns in the manifest stay empty until a tester fills them.

| Stage | Meaning | Enters from | Evidence that moves it |
|---|---|---|---|
| SOURCE_READY | Source exists and rebuilds; manifest row complete | none, or REWORK_REQUIRED | `.blend` or generator script committed; manifest row has category, size, origin, pivots, materials, class; reference approved; clay shape-review render for hero assets; licence noted |
| EXPORTED | GLB produced by the generator | SOURCE_READY | Generator command exits 0; GLB path matches the manifest; SHA-256 and byte size recorded; no hand edits |
| VALIDATING | A check or human review is open. Time-boxed to 48 h; no result means back to EXPORTED | EXPORTED | Validator run started; reviewer named |
| VALIDATED | All automated checks pass and required reviews are signed | VALIDATING | AST-01 to AST-05 pass; WARNs reviewed; previews rendered from the re-imported GLB; AST-07 for animated parts; AST-08 sign-off. **Bound to the GLB's hash**: any change to the GLB resets it to EXPORTED |
| INTEGRATED | In use by blueprint or scene and loading in the real runtime | VALIDATED | AST-06, AST-09 to AST-12 pass; no console errors; scene budgets still within 3.3 with this asset; asset id referenced from `src/assets.ts` or content data |
| REWORK_REQUIRED | A gate failed or a later regression was found | any stage | Failure list with a reason code (VAL_FAIL, REVIEW_FAIL, BUDGET_BREACH, INT_FAIL, REGRESSION, SPEC_CHANGE) and an owner. Returns to SOURCE_READY if the source changes, EXPORTED if only the export changes |

Counting rule for the production dashboard: "delivered" is EXPORTED or later; "accepted" is VALIDATED or later; "in the game" is INTEGRATED. Only the validator and a named reviewer set VALIDATED. Only the integration test or the lead sets INTEGRATED. Planned rows with no source carry no stage.

### 6.3 One-page checklist per asset

- [ ] Manifest row complete; source and generator committed
- [ ] GLB regenerated from source; SHA-256 recorded
- [ ] Validator: 0 FAIL; WARNs read and answered
- [ ] Category budget met (triangles, primitives, materials, texture MiB, bytes)
- [ ] Size, origin and pivots as declared; transforms applied; names as convention
- [ ] Materials from the shared library; no alpha or double-sided without a reason
- [ ] Not a duplicate or near-duplicate; `distinctBecause` written
- [ ] Moving parts rotate about their pivot without drift (AST-07)
- [ ] Collider radius at least 1.2 cm if grabbable; sockets exact if declared
- [ ] Previews rendered from the re-imported GLB and reviewed at gameplay distance
- [ ] Loads in the runtime with no console warnings; scale correct on screen
- [ ] Frozen and awakened looks checked
- [ ] Scene budgets re-checked with the asset in place
- [ ] Production build serves it under a sub-path
- [ ] Licence recorded
- [ ] Quest 3 and Quest 3S checks: **Blocked** or done (with date and tester)

## 7. Website speed budget (public entry page)

### 7.1 Current measurement [V]

Method: `measure-entry.mjs` in the scratch folder (Playwright Chromium, SwiftShader, 1440 x 900, cold context each run, no network throttling) against `https://localhost:4173/wound-up/`, 3 runs, machine under load. No server compression (Vite preview), so sizes are raw. Compressed sizes below were computed with Node zlib (gzip level 9 and Brotli 11); the host's real encoding is [U].

| Measure | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| First paint | 2.78 s | 0.07 s* | 0.10 s* |
| First contentful paint | 2.78 s | 1.09 s | 2.28 s |
| Largest contentful paint | 3.44 s | 2.07 s | 3.85 s |
| Enter or Preview enabled | 2.94 s | 3.87 s | 3.24 s |
| Load event | 0.69 s | 0.76 s | 1.67 s |
| GLBs finished | 2.17 s | 1.94 s | 2.38 s |

*First paint in runs 2 and 3 is the empty page background; there was no visible text before FCP. The owner's own reading was 5 to 7 seconds to ready under load; these three runs are shorter, and the difference was not resolved.

| Payload before Enter | Raw | Gzip | Brotli |
|---|---|---|---|
| JavaScript (entry 50 KB, `light-system` 2,305 KB, `world-initializer` 53 KB) | 2,407 KiB | 663 KiB | 534 KiB |
| GLBs (stand 2,069 KiB, gear 2,329 KiB) | 4,398 KiB (4.30 MiB) | 4.10 MiB | 4.05 MiB |
| CSS and 4 fonts | 67 KiB | about 60 KiB | about 60 KiB |
| **Total** | about 7.0 MB (6.7 MiB) | about 5.0 MB | about 4.9 MB |

GLBs are about 87% of what a visitor downloads before Enter, and they barely compress (images inside). Another 11 requests in the log are `blob:` fetches of the images inside the GLBs (in memory, not network). A pure transfer of 4.9 MB takes about 0.4 s at 100 Mbit/s, 0.8 s at 50, 2.0 s at 20, 3.9 s at 10, 7.8 s at 5 (arithmetic, excludes latency and parsing). The built `dist/` has no source maps. `vercel.json` sets no cache headers and the GLB file names are not hashed; repeat-visit caching is the Vercel default [U].

### 7.2 Budget

| Metric | Budget | Measured | Verdict |
|---|---|---|---|
| First contentful paint (broadband, cold) | at most 1.0 s [E] | 1.1-2.8 s | Fail or at risk. The body is two empty divs until JS mounts the landing, and the entry JS imports the 2.3 MB chunk first. A static HTML and CSS shell in `index.html` would move FCP to about the HTML, CSS and font time (a recommendation for the landing owner; I did not change it) |
| Largest contentful paint (p75) | at most 2.5 s (Google) | 2.1-3.9 s | Fail or at risk |
| Time to enter (button enabled), broadband | at most 3.0 s [E] | 2.9-3.9 s with no network at all | **Fail** once real transfer (about 2 s at 20 Mbit/s) is added |
| Time to enter, Quest Browser on home Wi-Fi | at most 5 s [E] | Not measured | [U] |
| JavaScript before Enter | at most 2.5 MB raw and 0.7 MB Brotli [E] | 2.41 MB / 0.52 MB | Pass, 4% headroom raw. Game systems (solver, machines, town) load as dynamic chunks after the landing is interactive; entry chunk growth over 10% needs lead sign-off |
| GLB payload before Enter | at most 1.5 MB [E] | 4.50 MB | **Fail by 3x** |
| Total before Enter, compressed | at most 3.0 MB [E] | about 4.9 MB | **Fail by 1.9 MB, all of it GLB** |
| Cumulative layout shift, INP | at most 0.1, at most 200 ms (Google) | Not measured | [U] |
| Third-party requests | 0 | 0 on landing (spec checks it) | Pass |

Cause of the Enter delay [V from the request timeline]: both GLBs are `priority: 'critical'` in `src/assets.ts`, so `World.create` waits for them, and `landing.setSupport` enables the buttons only afterwards (`src/index.ts`). Meeting the budget means either shrinking the two landing assets to about 1.5 MB together (one 512 px texture set each, or the shared-material route in 3.4) or loading them after Enter is enabled.

### 7.3 How to enforce

Assert bytes, record times. Bytes are deterministic; times on a loaded laptop are not.

1. A Playwright spec on the built preview asserts same-origin response sizes against a small `budgets.json`: entry JS, GLB total, total before Enter. Fail on any request off `localhost`.
2. The same spec records first paint, FCP, LCP and ready time to `test-results/` without asserting them.
3. Before submission, once on the Vercel preview URL in a private window (deployment protection off): record timings with Lighthouse through the Chrome DevTools MCP. Not run here.
4. The e2e web server step should rebuild; set `reuseExistingServer` to false in CI so a stale build cannot pass.

## 8. Risks and decisions

| # | Risk or decision | Owner |
|---|---|---|
| 1 | Texture-memory model (3.4) must be decided before the part library is built; otherwise the first full scene will exceed any plausible budget | Lead and owner |
| 2 | Approve `gltf-validator` as a dev dependency, for release-candidate runs | Owner |
| 3 | Book a Quest 3 tester and a Quest 3S tester; schedule before about 12 November | Owner |
| 4 | Landing GLBs capped at about 1.5 MB total (art tradeoff on the first impression) | Owner and lead |
| 5 | Add the `?perf` probe early, not at the end | Lead |
| 6 | Make CI run the validator, the budget spec and Playwright against a fresh build; make the emulator spec fail, not skip, in CI | Lead |
| 7 | Budgets in 3.2 and 3.3 are provisional. Meta's native numbers may be loose or tight for WebXR in three.js. Revise after the first Quest reading | QA |
| 8 | Multiview use [U] changes how draw calls are counted | QA and lead |
| 9 | The 180-200 GLB estimate should be replaced by X06 (unique geometry hashes per class) once the manifest exists | Lead |
| 10 | Procedural gears in TypeScript do not need GLBs; do not count them as deliverables | Lead |

## 9. What was run and what was not

Run: `vitest run`, `tsc --noEmit`, `eslint` (all clean or passing); the validator prototype on 3 GLBs and one seeded copy; the entry measurement three times; size and compression arithmetic on `dist/` files; web fetches of the Meta pages, `iwsdk.dev/skill.md`, the Khronos validator README and web.dev vitals; reads of the QA, acceptance, pipeline and guideline docs, tests, configs, IWSDK loader sources.

Not run: the Playwright suites (they rebuild or reuse a `dist/` another process was changing); `npm run build`; the IWSDK dev runtime; Blender; Lighthouse; CPU-throttled traces; anything on a headset.

Scratch files (all in `C:/Users/ASUS/AppData/Local/Temp/claude/11151372498ff63e/3e881673-e213-49c9-8bcf-435cb9f9d086/scratchpad/audits/`): `validate-glb-proto.mjs`, `measure-entry.mjs`, `mutate.mjs`, `manifest-proto.json`, `manifest-seeded.json`, `out-proto.txt`, `seeded/gear_bad.glb`.
