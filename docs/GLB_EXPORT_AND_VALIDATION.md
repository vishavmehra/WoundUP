# Wound Up — GLB Export and Validation

**Project:** Wound Up
**Label:** Tooling for all labels (G0 and later).
**Status:** Active as a standard. The export profile is proven by tests in audit E. Our validator does not exist yet: a 236-line prototype exists only in the session scratch folder (section 5.3). `tools/asset-status.mjs` exists and checks the manifest against the files, but it is not the validator.
**Date:** 2026-11-06
**Authority:** [DECISIONS.md](DECISIONS.md) ADR-023, ADR-030, ADR-032, ADR-034, ADR-035, ADR-037; [audit E](audits/E_BLENDER_PIPELINE.md) §2 and §3 (export); [audit F](audits/F_QA_PERFORMANCE.md) §2 (validator). Check ids V01 to V70 and X01 to X06 are audit F's; V27 to V29 are added here.
**Related:** [BLENDER_PRODUCTION_GUIDELINES.md](BLENDER_PRODUCTION_GUIDELINES.md), [ASSET_NAMING_AND_FOLDER_STANDARDS.md](ASSET_NAMING_AND_FOLDER_STANDARDS.md), [ASSET_OPTIMISATION_BUDGET.md](ASSET_OPTIMISATION_BUDGET.md), [ASSET_QA_CHECKLIST.md](ASSET_QA_CHECKLIST.md), [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md), [audit D](audits/D_WEBXR_ARCHITECTURE.md) §3

## 1. Scope

How a GLB leaves Blender (the export profile), what the runtime does with it, and how it is checked before it may be called VALIDATED. Two gates exist and must not be confused:

- **The in-Blender QA gate** runs inside the runner in seconds, before export, and stops obvious mistakes cheaply (BLENDER_PRODUCTION_GUIDELINES §4.3).
- **The validator** is a Node script that reads the finished GLB and the manifest. Only the validator and a named reviewer may set VALIDATED, and the status is bound to the GLB's SHA-256 (ADR-037).

## 2. Export profiles

All settings are properties of `bpy.ops.export_scene.gltf` in Blender 5.2.1, which has 110 of them. The shipped helper `export_glb` in `wu_common.py` hard-codes `export_extras=False`, `export_vertex_color="NONE"`, `export_image_format="AUTO"`, `export_animations=False` and `export_attributes=False`. The framework agent adds an override or a second profile (audit E §6).

### 2.1 Profile L: library part and housing (default, ADR-032)

| Property | Value | Why (evidence) |
|---|---|---|
| `export_format` | `GLB` | One file, no external data (validator V05). |
| `use_selection` | `True` | The root and its helper empties are selected; nothing else is exported. |
| `export_yup`, `export_apply` | `True`, `True` | Y-up and applied transforms (ADR-020). |
| `export_normals`, `export_texcoords` | `True`, `True` | Required attributes (V35). |
| `export_tangents` | `False` | Adds 61.7 KB to the 3,872-triangle gear (240.4 KB against 178.7 KB). |
| `export_materials` | `EXPORT` | Material names are the link to the shared library. |
| `export_image_format` | **`NONE`** | Zero images, zero textures, material names kept (measured). Texture-linked sockets lose their factors, so proxies must be constants only (BLENDER_PRODUCTION_GUIDELINES §7). |
| `export_vertex_color` | **`ACTIVE`** | One clean `COLOR_0` (normalized unsigned short, VEC4, 8 bytes per vertex). `MATERIAL` warned "will not be exported" and produced `COLOR_0` plus `COLOR_1`. |
| `export_all_vertex_colors` | `False` | Only the AO attribute is exported. |
| `export_extras` | `True` | Object, mesh and material custom properties (nested dictionaries and lists included) reach the JSON and become `userData` in three.js: the `wu` metadata (naming standards §5). |
| `export_attributes` | `False` | Only attributes whose names start with `_` are ever exported; `_WU_PART` exported and `junk` was dropped. Use none unless a specification needs one. |
| `export_animations`, `export_skins`, `export_morph` | `False` | Static parts carry no clips (V40). |
| `export_cameras`, `export_lights` | `False` | A light in a GLB becomes a real scene light in three.js (`KHR_lights_punctual`); lights belong to code (CLAUDE.md §8; audit D §3.3). |
| `export_draco_mesh_compression_enable`, `export_meshopt_compression_enable`, `export_use_gltfpack` | `False` | ADR-023 and ADR-035; see section 3. |
| `export_gpu_instances` | `False` | `EXT_mesh_gpu_instancing` from Blender is unverified. |
| `export_unused_images`, `export_unused_textures`, `export_keep_originals` | `False` | No stray data. |

Every material is single-sided (`use_backface_culling = True`) and opaque unless the manifest allows alpha. Expected size: the 3,872-triangle gear is 144 KB plain and 179 KB with vertex AO (audit E §2.1).

### 2.2 Profile H: hero object with its own textures

Profile L with `export_image_format = AUTO` (the shipped files embed JPEG base colour and PNG ORM and normal maps). Allowed only for a hero the lead has named in its manifest entry (ADR-032 item 4). Each map is at most 1024 px, one texture set is at most 16 MiB of GPU memory, all heroes together at most 48 MiB, and the GLB stays within its category size (ADR-023, ADR-034). `KHR_materials_sheen` is allowed for the velvet.

### 2.3 Profile A: one-shot clips

Profile L plus `export_animations = True` and **sampled** export (`export_force_sampling = True`, the default). Measured: sampled gives 49 samples for 2 s at 24 fps, unsampled gives 2 keys; both load as a three.js `AnimationClip`. Use `export_animation_mode = ACTIONS` (one clip per action, named `<Asset>_<Action>`); the pilot confirms this with `Otto_Knead`. Never use a clip for continuous rotation: a two-key full-turn clip exports as identity to identity (audit E §3).

### 2.4 Profile C: character

Profile A plus `export_skins = True`. A shared skeleton of at most 40 bones, or rigid nodes (ADR-034). `JOINTS_0` and `WEIGHTS_0` are allowed only here (V35).

## 3. Forbidden, and why

| Not allowed | Reason |
|---|---|
| Draco (`KHR_draco_mesh_compression`) | Works through IWSDK's `DRACOLoader`, but the decoder path defaults to `https://unpkg.com/three@0.185.0/...`, a third-party request (ADR-025). Draco was 43 KB against 179 KB on the gear (measured), so it is the first candidate if a spike and the owner approve (ADR-035). Decode time on a Quest is unverified. |
| Meshopt (`EXT_` or `KHR_meshopt_compression`) | IWSDK never calls `setMeshoptDecoder`. A meshopt GLB fails to load: "setMeshoptDecoder must be called before loading compressed files" (measured). |
| KTX2 (`KHR_texture_basisu`) | Same CDN default as Draco. It is the only option that cuts GPU texture memory, so it is the first spike candidate if a Quest shows memory pressure (ADR-035). |
| gltfpack | Needs an external binary that is not installed (unverified). |
| `KHR_materials_transmission`, `KHR_materials_volume` | Three.js adds a full extra opaque render pass for any transmissive material (audit D §6.2). "Warm glass" is a plain alpha material. |
| `KHR_lights_punctual`, cameras | See profile L. |
| Double-sided materials, alpha-blended materials | Allowed only where the manifest lists them (`allowDoubleSided`, `allowAlpha`). |
| External buffers, image URIs, `data:` URIs | One self-contained file (V05). |

Allowed extensions, from audit F V06: `KHR_materials_sheen`, `KHR_materials_clearcoat`, `KHR_materials_emissive_strength`, `KHR_materials_ior`, `KHR_texture_transform`. Audit D §6.2 notes that sheen, clearcoat and `ior` each switch three.js to `MeshPhysicalMaterial`. Reconciled here by taking the stricter reading: `KHR_materials_ior` is a WARN, and a physical material without a declared sheen or clearcoat is a FAIL (V34).

## 4. Exporter and runtime pitfalls (each measured or read)

| Pitfall | Consequence and rule | Source |
|---|---|---|
| A default Principled material exports `doubleSided: true` | Set `use_backface_culling = True` | Audit E §2.4 |
| Texture-linked sockets with `export_image_format = NONE` lose metallic and roughness | Proxy materials are constants only; three.js would read metalness 1, roughness 1 | Audit E §2.4 |
| Child order in the GLB is alphabetical | Find helper nodes by name prefix and `userData.wu.type`, never by index | Audit E §3 |
| `empty_display_size` is not exported; empty scale is swizzled (x, y, z) to (x, z, y) | Size colliders with the empty's scale; check the axis order | Audit E §3 |
| A two-key full-turn rotation clip exports as identity | Continuous rotation comes from the solver | Audit E §3 |
| Importing `wu_common` writes `__pycache__` into the repository | Set `sys.dont_write_bytecode = True` first | Audit E §6 |
| IWSDK clones share geometry, materials and clips, not nodes | Cache one parsed GLB per asset id and clone it | Audit D §3.1 |
| IWSDK scene loading is serial; each node is awaited in turn | Prefetch in parallel before the level loads; only the stand and hands are `critical` | Audit D §3.1, §5 |
| `world.assets.instantiate()` returns the scene without its clips | Use `getGLTF` where a clip is needed | Audit D §3.6 |
| A level change does not free asset GPU memory | Unloading is our own disposer | Audit D §3.2 |
| GLB instances load as a `Group`, so scene-JSON patterns of GLBs fall back to node clones (one draw call each) | Do not rely on automatic instancing of GLBs | Audit D §3.5 |

## 5. The validator

### 5.1 Design (audit F §2.1)

One Node script, no new dependency, four layers:

| Layer | Does |
|---|---|
| A. Container and JSON | Parses the GLB header, chunks and JSON with `node:fs` only; reads accessor data from the BIN chunk. |
| B. Rules from the manifest | Applies the per-entry checks of section 5.5 with the category budgets of ADR-034. |
| C. Loader round trip | Parses the same bytes with the repository's `three/examples/jsm/loaders/GLTFLoader.js` (super-three 0.185, the version the game ships). Node has no image decoder, so `createImageBitmap` is stubbed and real image sizes come from the PNG and JPEG headers. |
| D. Cross-manifest | Duplicates, orphans and unresolved references (section 5.6). |

Exit code 1 on any FAIL. WARN lines are printed and must be read and answered, not ignored. Any exception is treated as a FAIL and the failures already found are kept: a validator that dies on malformed input is not a gate (audit F §2.2).

### 5.2 Invocation (planned)

```bash
node tools/validate-glb.mjs [--manifest <path>] [--only <id>[,<id>...]] [--json] [--report-only]
npm run assets:check          # the lead adds the npm entry
```

Plus a Vitest wrapper (`tests/assets/glb.test.ts`) so `npm test` and CI cover it (ADR-037). Audit F suggested `scripts/validate-glb.mjs`; ADR-037 and PRODUCTION_AUDIT §12 place it in `tools/`, which is used here. Owner: Asset framework agent. The lead adds the npm entries and the CI step. CI must also stop reusing an existing preview server (`reuseExistingServer: true` lets a stale build pass, audit F §1).

### 5.3 The prototype

`C:/Users/ASUS/AppData/Local/Temp/claude/11151372498ff63e/3e881673-e213-49c9-8bcf-435cb9f9d086/scratchpad/audits/validate-glb-proto.mjs` (236 lines), run as `node validate-glb-proto.mjs <repoRoot> <manifest.json> [glbRoot]`. It is the starting point for `tools/validate-glb.mjs`. **It lives only in a session scratch folder; the lead or the framework agent copies it into `tools/` before the session ends** (ADR-037 consequences). The same folder holds `manifest-proto.json`, `manifest-seeded.json` and `seeded/gear_bad.glb`.

Measured results (audit F §2.2): it validated three GLBs in about 0.25 s and found all six defects seeded into a copy of the gear: a forbidden `KHR_draco_mesh_compression`, an external image URI, a lying POSITION `max`, a non-identity node transform, a material `Brass_Final2` that is not in the library, and `BLEND` alpha. It also reported the loader failure and the origin offset. That run used audit F's budgets: the shipped gear failed (16 MiB of textures, 2.38 MB or 2.27 MiB of file) and the stand passed its 24 MiB environment limit. Under ADR-034 the stand's 20 MiB also exceeds the 16 MiB hero cap, so it fails too.

If the scratch file is gone, section 5.5 is the full specification; the prototype is a convenience, not a source of truth.

### 5.4 What the validator reads from the manifest

Audit F §2.3 lists the fields. Schema version 1 supplies some and lacks others:

| Validator input | In schema v1? |
|---|---|
| `id`, `glbPath`, `classification`, `category`, `materials`, `meshes`, `animations`, `dependencies`, `usedBy`, `distinctBecause`, `status`, `verified` | Yes |
| `approxDimensionsM` and `dimensionsBasis` (checked only when the basis is `spec`, `measured`, `derived` or approved) | Yes; no tolerance field (default 1 %, V21) |
| `budgets` (triangles, primitives, materials, texture MiB, KB) | Yes, per entry |
| `glbSha256`, `validationEvidence` | Yes |
| Origin as per-axis `centre`, `min` or `max`; rotation `axis`; `pivotNodes`; `requiredNodes`; `sockets` (name, position, axis); collider radius; `tiledMaterials`; `allowAlpha`; `allowDoubleSided`; `variantOf` | **No.** `originAndPivot` and `colliders` are text |

The missing fields are the schema change proposed in BLENDER_PRODUCTION_GUIDELINES §4.4 (lead). Until then the validator runs the checks that need no structured input (V01 to V14, V25, V30 to V34, V50, V70, X01 to X03, X06) and skips the rest with a printed notice, never silently.

### 5.5 Checks

**P** marks a check that works in the prototype.

*glTF 2.0 validity*

| ID | P | Check | Result |
|---|---|---|---|
| V01 | P | Container: magic `glTF`, version 2, header length equals file size, JSON chunk first, 4-byte aligned chunk lengths, no unknown chunk | FAIL |
| V02 | P | `asset.version` is `"2.0"`; record `asset.generator` (WARN if it is not `Khronos glTF Blender I/O`: hand-edited or another tool) | FAIL / WARN |
| V03 | | Every node, mesh, material, accessor, bufferView, texture, image, sampler and animation index is in range; no node cycles; one parent per node | FAIL |
| V04 | P | Accessors: valid component and type, ranges inside the BIN chunk, indices below the vertex count, POSITION `min` and `max` equal the real data within 1e-5 | FAIL |
| V05 | P | No external data: no `buffers[].uri`, `images[].uri` or `data:` URI | FAIL |
| V06 | P | `extensionsUsed` and `extensionsRequired` inside the allow list (section 3); deny list: Draco, meshopt, basisu, transmission, volume, `KHR_lights_punctual` | FAIL |
| V07 | P | Images are PNG or JPEG only; the header decodes to width x height | FAIL |

*Scale, box, origin, pivot, axes, transforms, names*

| ID | P | Check | Result |
|---|---|---|---|
| V20 | | Y-up: glTF is Y-up by definition, so a Z-up mistake shows as swapped axes; covered by V21 | via V21 |
| V21 | P | Bounding box from the real vertex data through the node matrices (not accessor metadata) equals the declared size within 1 % | FAIL |
| V22 | P | Origin per axis (centre, min or max) within 0.5 mm. Gear: bore centre. Stand: bottom-face centre (ADR-020) | FAIL |
| V23 | P | Transforms applied: root and child nodes are identity unless listed in `pivotNodes`; no `matrix`; no negative or non-uniform scale | FAIL |
| V24 | | Rotation axis for rotating parts: smallest extent along +Z, XY centroid within 0.5 mm of 0, maximum radius equals the declared tip radius within 1 % | FAIL |
| V25 | P | Names: unique and non-empty; mesh name equals node name; `PascalCase_Underscore`; no `.001` suffix | FAIL |
| V26 | P | Every `requiredNodes` entry (pivots, `SOCKET_*`, moving groups) exists exactly once | FAIL |
| **V27** | | **Root:** exactly one top-level node; it carries `extras.wu` with `id` equal to the manifest id and `family` equal to the folder (naming standards §5). Added here from audit E §3 | FAIL |
| **V28** | | **Helper empties:** every node named `COL_*`, `PIV_*` or `SOCKET_*` has `extras.wu.type` equal to `collider`, `pivot` or `socket` respectively; a collider has a shape and positive scale. Added from audit E §3 | FAIL |

*Materials and textures*

| ID | P | Check | Result |
|---|---|---|---|
| V30 | P | Each material name is in the shared library list; unused materials | FAIL / WARN |
| V31 | P | `alphaMode` is `OPAQUE` unless listed in `allowAlpha`; `doubleSided` is a WARN unless listed in `allowDoubleSided` | FAIL / WARN |
| V32 | P | Embedded images only, at most 1024 px (ADR-023), power of two, PNG or JPEG. Library parts embed none | FAIL |
| V33 | P | Texture memory: the sum over unique images of width x height x 4 x 4/3 (RGBA8 with mip chain) against the entry budget | FAIL |
| V34 | P | Loaded material class via the loader: `MeshStandardMaterial`, or `MeshPhysicalMaterial` only where sheen or clearcoat is declared | FAIL |
| V35 | | Required attributes `POSITION`, `NORMAL`, `TEXCOORD_0` on lit meshes; `COLOR_0` allowed; `JOINTS_0` and `WEIGHTS_0` only for characters; `TEXCOORD_1` is a WARN | FAIL / WARN |
| **V29** | | **Vertex colour:** every primitive that uses a library material has `COLOR_0` (ADR-032; BLENDER_PRODUCTION_GUIDELINES §8). WARN until the pilot confirms the runtime swap, then FAIL | WARN, then FAIL |

*Geometry quality*

| ID | P | Check | Result |
|---|---|---|---|
| V10 | P | Triangles only (mode 4); counts of triangles, vertices, primitives, meshes and nodes | FAIL |
| V12 | P | No NaN or infinity in POSITION; normals unit length within 1e-3 | FAIL / WARN |
| V13 | P | No degenerate triangles | FAIL |
| V14 | P | UVs inside 0..1 except materials listed in `tiledMaterials` | FAIL |
| V15 | | Uint16 indices when the vertex count is under 65,536 | WARN |
| V16 | | Assets flagged `closed`: every edge shared by two triangles, positive signed volume | WARN |

*Budgets, animation, colliders, sockets, loader*

| ID | P | Check | Result |
|---|---|---|---|
| V50 | P | Triangles, primitives, materials, texture MiB and file bytes against the entry's category budget ([ASSET_OPTIMISATION_BUDGET.md](ASSET_OPTIMISATION_BUDGET.md)) | FAIL |
| V40 | | Default: zero clips. Where the manifest lists clips: names present, channels target existing nodes, input times strictly increasing, duration in range, first key equals last key when looping | FAIL |
| V41 | | Each moving part is its own node with its pivot at the rotation centre and no static geometry beneath it; rotating the pivot node moves the subtree's rotation centre by less than 0.5 mm | FAIL |
| V60 | | A grabbable asset contains at least one triangle mesh (IWSDK hit-tests by raycasting the Object3D tree) | FAIL |
| V61 | | `COL_Grab` radius declared and at least 0.012 m (INTERACTION_SPEC §7.2); equals `PartDefinition.grab.colliderRadius`; the visible mesh is never enlarged | FAIL |
| V62 | | Each declared `SOCKET_*` node lies within 0.5 mm of the declared position and its +Z within 1 degree of the declared axis | FAIL |
| V70 | P | `GLTFLoader.parse` succeeds, captured `console.warn` output is empty, the loader's `Box3` equals the raw box within 0.1 mm, the scene is not empty, `clone()` works (IWSDK `getGLTF` returns clones) | FAIL |

### 5.6 Cross-manifest checks

| ID | P | Check | Result |
|---|---|---|---|
| X01 | P | Same geometry hash (SHA-1 of POSITION and index bytes) under two ids: an exact duplicate export | FAIL |
| X02 | P | Same triangle count, vertex count and size rounded to 0.2 mm: a near duplicate; needs `variantOf` and a stated differing parameter | WARN |
| X03 | P | Same embedded image hash in two GLBs (repeated brass textures) | WARN now; FAIL after the shared-material decision |
| X04 | | Orphans both ways: every GLB under `public/assets/models` is in the manifest, every manifest path exists, every `visual.assetId` and every URL in `src/assets.ts` resolves | FAIL |
| X05 | | Artificial splitting: entries with an empty `usedBy`, or four or more siblings with one parent and identical material sets, are listed for human review; a `distinctBecause` sentence is required | WARN |
| X06 | P | The real GLB count: the number of unique geometry hashes per classification label. This is the validated deliverable count the owner asked for, free of duplicates | report |

`tools/asset-status.mjs` already covers the file-system half of X04 (orphans and missing files) and the path rules. Counts are always read from it or from X06, never typed into a document.

### 5.7 Status rules

1. The validator prints results and never edits the manifest. The lead records `validationStatus`, `validationEvidence` (command, commit, date, FAIL and WARN lists) and `glbSha256`.
2. VALIDATED needs zero FAIL, every WARN read and answered, previews rendered from the re-imported GLB, and a named reviewer. A changed GLB changes the hash and drops the entry to EXPORTED; `tools/asset-status.mjs` reports the mismatch.
3. VALIDATING is time-boxed to 48 hours; with no result it returns to EXPORTED.
4. Passing the validator proves file structure, budgets and conventions. It does not prove appearance, in-engine behaviour or anything on a Quest ([ASSET_QA_CHECKLIST.md](ASSET_QA_CHECKLIST.md)).

### 5.8 Khronos `gltf-validator`

Package `gltf-validator` (Apache-2.0) gives full glTF schema conformance as an independent second implementation of V01 to V07, and reports unused objects and non-power-of-two images. It cannot check our budgets, material library, names, pivots, sockets, colliders or duplicates. It is **not installed**. **Owner decision pending** ([decision 3](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)): adding it as a dev dependency for release-candidate runs only. Nothing waits on it.

## 6. Dependencies

- The export override and framework pieces of BLENDER_PRODUCTION_GUIDELINES §4.2 (Asset framework agent).
- The structured manifest fields of section 5.4 (lead).
- `package.json` scripts, the CI step and the `dist/` check (lead).
- The shared material library list (`meta.materialLibrary`) for V30.
- Owner decision 3 (second validator) and decision 4 (shared materials, accepted on 2026-11-06, which turns X03 into a FAIL).

## 7. Acceptance criteria

1. `tools/validate-glb.mjs` exists, runs from `npm run assets:check` and from Vitest, and exits 1 on any FAIL.
2. On the three audit GLBs and the seeded copy it reproduces audit F's results, including all six seeded defects and the loader and origin findings.
3. Every check in section 5.5 and 5.6 is implemented, or is skipped with a printed notice that names the missing manifest field. None is skipped silently.
4. A GLB exported with profile L from the runner contains no image, has `COLOR_0`, passes V01 to V07 and V25 to V28, and uses only library material names.
5. No entry is VALIDATED without a matching `glbSha256`.
