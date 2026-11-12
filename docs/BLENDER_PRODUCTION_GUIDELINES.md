# Wound Up — Blender Production Guidelines

**Project:** Wound Up
**Label:** Tooling for all labels (G0 and later). Every rule applies to a G0 asset first.
**Status:** Active as a standard. The shared framework it describes (runner, shared library, vertex-AO helper, empties writer, contact-sheet helper) is not built yet; sections 4, 8, 9 and 11 say which parts exist and which do not.
**Date:** 2026-11-06
**Authority:** [directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) Parts 6, 7.3 and 9; [DECISIONS.md](DECISIONS.md) ADR-007, ADR-020, ADR-030, ADR-031, ADR-032, ADR-033; [audit E](audits/E_BLENDER_PIPELINE.md) (every measured number below is from it). Where this document differs from an ADR, the ADR wins until amended.
**Related:** [ASSET_NAMING_AND_FOLDER_STANDARDS.md](ASSET_NAMING_AND_FOLDER_STANDARDS.md), [GLB_EXPORT_AND_VALIDATION.md](GLB_EXPORT_AND_VALIDATION.md), [ASSET_OPTIMISATION_BUDGET.md](ASSET_OPTIMISATION_BUDGET.md), [ASSET_QA_CHECKLIST.md](ASSET_QA_CHECKLIST.md), [ASSET_AGENT_ASSIGNMENTS.md](ASSET_AGENT_ASSIGNMENTS.md), [ART_ASSET_PIPELINE.md](ART_ASSET_PIPELINE.md), [blender/README.md](../blender/README.md), [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md)

## 1. Scope

How an agent builds a Blender source and a GLB for one manifest entry, headless, with no GUI. It covers the toolchain, the production modes, the run order, units and pivots, modelling quality, materials, vertex ambient occlusion, helper empties, animation, review renders and parallel limits. Art direction and palette stay in [ART_ASSET_PIPELINE.md](ART_ASSET_PIPELINE.md); naming in [ASSET_NAMING_AND_FOLDER_STANDARDS.md](ASSET_NAMING_AND_FOLDER_STANDARDS.md); export properties and the validator in [GLB_EXPORT_AND_VALIDATION.md](GLB_EXPORT_AND_VALIDATION.md).

The directive's rule applies throughout: where Blender cannot be automated, report the limitation; never claim an asset was generated, and never mark one complete because an export file exists (Part 7.3).

## 2. Toolchain (measured, audit E §1)

| Item | Value |
|---|---|
| Blender | 5.2.1 LTS, hash 9e2066aef7ef. Path used by the repository: `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe` |
| Python and libraries | Python 3.13.13, numpy 2.3.4, glTF add-on `io_scene_gltf2` 5.2.40 |
| Command | `"$B" --background --factory-startup --python <script> -- <script arguments>`, started from Git Bash |
| Start-up time | First launch after idle 40.8 s (cold disk cache); then 2.6 to 3.5 s. The same command piped from PowerShell took 8 to 9 s (cause not investigated), so use Git Bash. `-noaudio` and `--disable-autoexec` gave no gain |
| Render devices | Cycles OPTIX and CUDA on the RTX 2060 (6 GB), or CPU. The Intel UHD is not offered. EEVEE runs headless on the GPU. First OPTIX use may compile kernels once; the README's "about 100 s" did not reproduce but is unverified on a clean machine |
| Machine | i7-10875H (8 cores, 16 threads), 31.8 GB RAM. A laptop: sustained thermals are unverified |

`--factory-startup` is mandatory: no add-ons, no user preferences, the same result on every machine (blender/README.md). The Blender MCP add-on is not part of the pipeline. It listens on one fixed port (9876), so it serves one agent at a time, and it needs a GUI or `blender --background --online-mode --command blender_mcp` (without `--factory-startup`). One agent may use it for interactive debugging; no batch or family run may depend on it (audit E §4).

## 3. Stages of one asset

The directive's seven stages (Part 9) map to manifest statuses ([GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md) §5). The evidence for each gate is in [ASSET_QA_CHECKLIST.md](ASSET_QA_CHECKLIST.md).

| Stage | Owner does | Status after |
|---|---|---|
| 1 Specification | Reads the manifest entry, the specifications and boards it lists. Proposes size, pivots, materials, node list, colliders, sockets and clips. The lead approves every size whose basis is not `spec`, `measured` or `derived`. | IN_PROGRESS |
| 2 Modelling | Builds the source with a bpy script, headless. | SOURCE_READY |
| 3 Export | Runs the fixed export profile; records SHA-256 and size. | EXPORTED |
| 4 Visual QA | Renders the family contact sheet from the re-imported GLB; checks silhouette, proportion and reference. | EXPORTED |
| 5 Technical QA | Runs the validator; reads WARN lines; checks budgets. | VALIDATING, then VALIDATED |
| 6 Integration | The lead and Agent 4 register the asset and test it in the real runtime. | INTEGRATED |
| 7 Acceptance | Sign-off against the asset checklist. | INTEGRATED |

## 4. Production modes and the family runner

### 4.1 Two modes

The manifest field `production` says which mode an entry uses.

| Mode | How it is built | Source of record |
|---|---|---|
| `parametric_family` | One generator script per family reads that family's manifest entries and exports one GLB per entry, in one Blender process per family (ADR-031). | The generator script plus the manifest entries |
| `hand_modelled` | A bespoke bpy script builds the model and saves the `.blend`; the GLB is exported from it. | The `.blend` (ADR-033). The script is committed so the `.blend` can be rebuilt (naming standards §6) |

The manifest `productionClass` sets the expected effort (audit E §5.4): A1 a new manifest line for an existing generator, A2 a new member or family of parametric parts, B a kit-built building or prop, C a bespoke hero, D a character, E a small prop. The measured and estimated rates are in [ASSET_PRODUCTION_ROADMAP.md](ASSET_PRODUCTION_ROADMAP.md) §3.

### 4.2 What exists and what does not

| Piece | State |
|---|---|
| `blender/scripts/wu_common.py` (palette, texture synthesis, PBR material builder, bake, `export_glb`, `inspect_glb`, `mesh_qa`, `uv_qa`, studio, camera, render, `import_glb`) | Exists, reusable (audit E §6) |
| `gen_gear_spur.py`, `gen_tockton_base.py` | Exist; write textured GLBs, not yet the ADR-032 profile |
| Runner `forge.py`: builds a family, bakes vertex AO, adds empties, runs the QA gate, exports, writes the report, renders the sheet | **Not built** (Asset framework agent) |
| `blender/scripts/lib/`: shared geometry helpers (revolve, outline extrude, chamfer, boolean union, now inside the gear and base scripts), export-profile override, vertex-AO helper, empties writer, size-aware contact sheet, box-projected UV helper with fixed texel density | **Not built** (audit E §6 lists each gap) |
| Shared material library: constants-only `Mat_*` proxies and tileable textures | **Not built** |
| GLB validator (`tools/validate-glb.mjs`) | **Not built**; a prototype exists in the session scratch folder ([GLB_EXPORT_AND_VALIDATION.md](GLB_EXPORT_AND_VALIDATION.md) §5) |

### 4.3 The runner (proposed interface, audit E §5.2)

The Asset framework agent fixes the final interface at Gate F and updates this section.

```bash
B="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$B" --background --factory-startup --python blender/scripts/forge.py -- \
     --family <generator> --only <id>[,<id>...] --out-root <dir> [--draft | --final] [--rework]
```

One run builds all requested entries of one family and then:

1. Builds each entry from its manifest parameters.
2. Bakes vertex ambient occlusion into `COLOR_0` (section 8).
3. Adds the collider, pivot and socket empties (section 9).
4. Runs the in-Blender QA gate (seconds, no agent tokens): node and root names, bounding box against the manifest, triangle budget, zero images, `COLOR_0` present, `mesh_qa` clean, `wu` metadata valid.
5. Exports with the fixed profile ([GLB_EXPORT_AND_VALIDATION.md](GLB_EXPORT_AND_VALIDATION.md) §2).
6. Writes `<family>.report.json` (ids, paths, SHA-256, byte sizes, counts, QA results) and renders one contact sheet from the re-imported GLB (section 11).

Safety rules for every generator and the runner (audit E §6; ADR-031 consequences):

- **R1.** No default output path. `gen_gear_spur.py` today writes `public/assets/models/props/gear_spur_16_brass.glb` when `--out` is missing, and for a 16-tooth build that is not `--clay` it saves `blender/source/gear_spur_16_brass.blend` even when `--out` is given; previews go to `blender/previews/` unless `--no-previews`. Parallel agents can overwrite shipped assets that way. A generator refuses to run without an explicit output root.
- **R2.** It writes only the paths of the entries requested with `--only` and owned by the caller (the manifest `owner` field).
- **R3.** It refuses to overwrite a GLB whose manifest status is VALIDATED or INTEGRATED unless `--rework` is given, because regenerating changes the hash and drops the status back to EXPORTED.
- **R4.** It sets `sys.dont_write_bytecode = True` before importing shared modules; importing `wu_common` otherwise writes `__pycache__` into the repository.
- **R5.** Previews are rendered into `blender/previews/<family>/`, never into `public/`.

### 4.4 Generator inputs: a gap in the manifest schema

ADR-031 says each generator reads "id, parameters, category, sockets, colliders, pivots" from the manifest. Schema version 1 has no field for generator parameters and no structured field for sockets, colliders or pivots (it has `colliders` and `originAndPivot` as text). The validator needs the same structured data ([GLB_EXPORT_AND_VALIDATION.md](GLB_EXPORT_AND_VALIDATION.md) §5.4).

Proposal for the lead, who owns the manifest and its schema: add optional `generator: { script, params }` and `empties: [{ name, type, shape, axis, accepts, positionM, sizeM }]`, bump `schemaVersion` and add a migration note to GLB_ASSET_MANIFEST §2. Until then a generator keeps its parameter table inside its own script, keyed by asset id (as `gen_gear_spur.py` takes `--teeth`), and the entry's `notes` cite it. This gap must not block the pilot.

## 5. Units, axes and pivots

From ADR-020 and blender/README.md. These are the conventions that agents most often get wrong, so each is a hard rule.

1. **Units.** Metres, scale 1. The scene unit scale is 1.0 and the unit system is metric. All transforms are applied: object location 0, rotation 0, scale 1, no modifiers. Only declared pivot nodes (section 9) may have a non-identity transform.
2. **Axes.** Blender is Z-up. The exporter converts `(x, y, z)` in Blender to `(x, z, -y)` in glTF, which is Y-up. Think in glTF space when a rule names an axis. glTF +Z (the way a figure faces) is Blender -Y.
3. **Rotating parts.** The rotation axis is local **+Z** in glTF space. The origin is the rotation centre. The thin axis is z. For a gear, tooth 0 lies along +X and the front face looks towards +Z. In Blender the mesh is built with its axis along Y by rotating the model-space mesh +90 degrees about X before applying, as the gear generator does.
4. **Furniture, stands, buildings and props.** Origin at the centre of the floor-contact face, +Y up (ADR-020). The stand's contact plane is y = 0.
5. **Characters.** Origin at the centre of the feet, +Y up, facing +Z (manifest `figure_otto`).
6. **Moving sub-parts.** A moving part is its own node with its pivot at its rotation centre and no static geometry beneath it, so rotating the node does not drift (ART_ASSET_PIPELINE §10; validator V41). A hinged part (lid, door, flap) has a `PIV_` empty at the hinge.
7. **Scale.** Authored at real miniature size, 1:1 at the workbench. The town may be scaled by the runtime (INTERACTION_SPEC: a machine takes the town's scale on its plot); assets never scale themselves.
8. **Dimensions.** The manifest `approxDimensionsM` is `[x width, y height, z depth]` in glTF axes. A dimension whose `dimensionsBasis` is `board` or `unspecified` is a proposal from Stage 1 and needs the lead's approval before Stage 2 (audit B: board sizes are appearance only, ADR-029). The machines' footprints need the lead's footprint table first (gaps G-07 and G-08).

## 6. Modelling quality

The art direction is in ART_ASSET_PIPELINE §2 and §3, the palette in CLAUDE.md §8. The rules that apply to every model:

1. **Not a blockout.** No final machine or building is built from unmodified boxes and cylinders (CLAUDE.md §6.6; ART §4). Every silhouette must read at play distance, and the proportions must be believable.
2. **Topology.** Closed, watertight solids with outward normals, quads on curved surfaces, weighted normals, flat faces kept flat, curved walls smooth. Every convex hard edge carries a chamfer (the gear uses 0.45 mm). The `mesh_qa` helper must report zero non-manifold edges, loose vertices or edges, duplicate vertices and zero-area faces, with consistent winding and positive signed volume (blender/README.md).
3. **Small bevels.** Build at 100 times scale (1 unit = 1 cm) so bevels sit far above Blender's merge tolerances, then scale to metres before applying (blender/README.md).
4. **Single-sided.** Closed solids are single-sided (`use_backface_culling = True`). A default Principled material exports `doubleSided: true`, so set it explicitly (audit E §2.4).
5. **Detail density.** Spend triangles where the player sees them. Do not remove silhouette or material detail only to save triangles; the category ceilings are in [ASSET_OPTIMISATION_BUDGET.md](ASSET_OPTIMISATION_BUDGET.md). Foveation is at its maximum and MSAA is 4 samples in XR, so thin features such as gear teeth may soften or shimmer on a Quest (audit D §6.2); check them at play distance (hardware checklist H08), and do not pre-empt the result.
6. **Hidden interior.** Three.js has no occlusion culling. A part inside an opaque casing is a separate node so the runtime can hide it unless X-ray is on (audit F §3.3). Do not model geometry nobody can see in any state.
7. **Static merge, moving separate.** Merge parts that never move into one mesh per material. Keep moving components as separate nodes (ART §12).
8. **Repeated pieces.** Across files, a repeated piece is one GLB placed several times (ADR-030 item 3). Inside one file (windmill blades, canopy lamps), use linked duplicates that share mesh data. Whether the exporter writes them as one glTF mesh referenced by several nodes is not tested; the pilot checks it on the `governor_standard` weights.
9. **UVs.** One map named `UVMap`, non-overlapping islands with uniform texel density per material. Meshes that use shared tiling textures need box-projected UVs at a fixed texel density; that helper does not exist yet (audit E §6). UVs outside 0..1 are allowed only for materials declared tiled in the manifest (validator V14).
10. **Quality bar.** Match the approved reference, use the palette, avoid cartoon or generic low-poly forms (CLAUDE.md §6.6, §8). A failing model is revised, not exported (ART §17).

## 7. Materials

**Shared library (ADR-032, Accepted by the owner on 2026-11-06 and still reversible: [decision 4](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)).**

1. A GLB carries named proxy materials from the manifest `meta.materialLibrary` (`Mat_<Name>`), with **constant values only**: no image-linked sockets. With images disabled, a texture-linked socket exports without its metallic and roughness factors and three.js then reads metalness 1 and roughness 1 (audit E §2.4). A constants-only Principled material exports its real factors: the measured clay `Mat_AgedBrass` is base colour 0.423 / 0.223 / 0.033, metallic 0.85, roughness 0.45.
2. At first load the runtime replaces each proxy by name with one shared textured material and disposes the GLB's copy (audit D §3.4). That registry does not exist in `src/` yet (lead). The proxies are therefore only a stand-in for the final look.
3. Library textures are tileable, at most 1024 px, generated once with the existing `brass_maps(..., tile=True)`, `walnut_maps` and `velvet_maps` of `wu_common.py`, and stored in `public/assets/materials/` (ADR-032 item 3). The library gets at most 48 MiB of GPU texture (ADR-034). The Asset framework agent owns the library; a new name needs the lead.
4. Materials are single-sided and opaque unless the manifest lists `allowAlpha` for that material. "Warm glass" is a plain alpha material: transmission and volume are forbidden because three.js adds a full extra render pass for them (audit D §6.2; validator V06).
5. Warm lamp and window light uses `Mat_WarmEmissive` with `KHR_materials_emissive_strength`; frozen and awakened looks are runtime states of the same material, not separate files.
6. Sheen (`KHR_materials_sheen`) makes three.js load a physical material. It is allowed for the velvet only. At most three physical materials appear in a scene (audit D §6.3).

**Palette.** Aged brass `#C9A227`, walnut `#5B3A24`, cream `#F2E6CF`, deep teal `#1F5C5C`, warm lamp `#FFC66D` (CLAUDE.md §8). Albedo is neutral: no baked light, so the game can desaturate and re-tint for the frozen and awakened looks (blender/README.md). Board colours outside the palette (red canopies, navy, lilac, mint) are not used (ASSET_REFERENCE_MAPPING §4).

**Hero objects with their own textures (ADR-032 item 4, ADR-034).** Allowed only for a hero named in the manifest with the lead's written exception in `notes`; the mechanism is a `budgets.textureMiB` above 0. No entry has one today. One texture set of at most 16 MiB (three 1024 px maps), all heroes together at most 48 MiB, PNG or JPEG, embedded. Keep the existing packing: base colour sRGB; ORM with occlusion in R, roughness in G and metallic in B in one image; tangent-space normal map in OpenGL convention (+Y up). The M0 stand embeds 20 MiB and is regenerated to fit.

## 8. Vertex ambient occlusion

Library parts get their contact shading from a baked per-vertex colour, because a per-GLB AO texture would block texture sharing (audit F §3.4).

1. Create a point-domain float colour attribute named `AO`, make it the active colour attribute, and bake:

   ```python
   me.color_attributes.new("AO", "FLOAT_COLOR", "POINT")
   bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")   # Cycles OPTIX, 64 samples
   ```

2. Measured on the 1,928-vertex gear: 1.71 s; AO range 0.375 to 1.0, mean 0.803. The exporter writes it as `COLOR_0` (normalized unsigned short, 8 bytes per vertex, so +30.8 KB on a 3,850-vertex gear) when `export_vertex_color = "ACTIVE"`. Three.js r185 loads it with `vertexColors = true` and multiplies it into the base colour; neutral grey AO does not break the frozen and awakened desaturation (audit E §2.2).
3. **Limits.** AO resolution follows vertex density. Large flat faces (building walls) get no contact shadow unless subdivided. It is not a substitute for a 1024 px AO texture on a hero object; use the hero path for those.
4. **Every mesh that uses a library material ships `COLOR_0`**, neutral white if it was not baked. Inference, not measured: when the runtime swaps in a shared material that has `vertexColors = true`, a mesh without `COLOR_0` may render black. The pilot checks this on the first swap (ASSET_PRODUCTION_ROADMAP §5).

## 9. Colliders, pivots and sockets as empties

Convention tested in audit E §3 and loaded with the repository's GLTFLoader. Select the empties together with the mesh at export (`use_selection=True`).

| Element | Blender | In the GLB and in three.js |
|---|---|---|
| Collider | Empty `COL_<Purpose>`, display type SPHERE or CUBE, custom property `wu = {"type":"collider","shape":"box","purpose":"grab"}` (the shape is `"box"` or `"sphere"`). Set the display size to 1 and put the half-extents (box) or radius (sphere), in metres, into the empty's **scale**. | A node whose scale carries the size. `empty_display_size` is not exported. |
| Secondary pivot | Empty `PIV_<Name>`, `wu = {"type":"pivot","kind":"rotation_axis","axis":"+Z"}`. The mesh origin is the main pivot. | Node translation and rotation. |
| Socket | Empty `SOCKET_<Name>`, `wu = {"type":"socket","accepts":[...]}`, placed by location; its +Z is the mating axis. | Node translation and the `accepts` array. |

- **Axis swizzle.** Scale is swizzled like position: Blender `(x, y, z)` becomes glTF `(x, z, y)`. A gear collider authored with Blender scale `(0.032, 0.0076, 0.032)` becomes glTF `(0.032, 0.032, 0.0076)` (measured).
- **Minimum size.** A grabbable part has a `COL_Grab` of at least 1.2 cm radius; the visible mesh is never enlarged (INTERACTION_SPEC §7.2; validator V61). The value must equal `PartDefinition.grab.colliderRadius`; a mismatch is an integration failure for the lead and Agent 2.
- **Runtime.** Whether IWSDK grab or physics can use these nodes directly is unverified (audit E §3). The safe route is a small TypeScript reader (lead or Agent 2, not an asset task) that builds an invisible proxy from `userData.wu`. IWSDK ignores an object whose ancestor has `visible = false`, so the proxy hides with `material.visible = false` (audit D §3.7).
- **Sockets depend on blueprint data.** A housing's `SOCKET_` positions come from the machine blueprint (DATA_AND_BLUEPRINT_SPEC §5 and §6), which does not exist yet (gap G-12). Until Agent 2 publishes the Music Box socket list, the socket nodes of `music_box_case` are proposals placed from the Music Box boards, marked as such in the handoff. Snap radii (4 cm, 7 cm Easy Snap) are interaction constants in INTERACTION_SPEC, not data in the GLB.

## 10. Animation

1. Continuous rotation (gears, cylinder, governor, platform, sails, millstone) is never a baked clip. A two-key full-turn clip exports as identity to identity and does not rotate (audit E §3), and IWSDK has no clip player. The solver supplies the angle at runtime (ADR-030 item 4).
2. One-shot motion (trunk lid, parcel flap, doors) and character motion may be clips, exported sampled (`export_force_sampling`; 49 samples for 2 s at 24 fps measured) so the keys survive the loader.
3. IWSDK has no animation mixer, so a clip needs a three.js `AnimationMixer` in one ECS system, and `world.assets.instantiate()` returns only the scene, losing the clips (audit D §3.6). This is runtime work for Agent 4, not an asset task, but the clip name must match the manifest.
4. A character uses a shared skeleton of at most 40 bones or rigid nodes (ADR-034). `JOINTS_0` and `WEIGHTS_0` are allowed only on characters (validator V35).

## 11. Review renders and the iteration limit

Machine time was never the problem; agent iterations were. The old pipeline rendered five previews per asset (about 90 s of Cycles time and five images to read). Audit E §5 sets the replacement:

1. **One contact sheet per family per round.** A family with several files is tiled in one image with a size-aware layout (a fixed pitch made large gears overlap in the audit's test). Each cell is labelled with the asset id. A family with one hero tiles three views of it (front, three-quarter, top) in one image (proposal; the pilot confirms). Render the sheet from the **re-imported GLB** (blender/README.md), not from the build scene.
2. **Two render grades.** A draft in EEVEE (1280 x 960, 16 samples: 7.6 s) and one final in Cycles OPTIX (1920 x 1080, 64 samples, denoised: about 31 to 33 s; 2048 x 2048, 128 samples: 69.7 s).
3. **The sequence.** Draft sheet, one fix pass, final sheet. Per asset, at most two fix passes; then the asset is accepted with its WARN lines recorded, or escalated to the lead (REWORK_REQUIRED with a reason code, or a scope cut). The agent reads one JSON report and one image per round.
4. **What the sheet can judge.** Shape, proportion, bevels, AO and the proxy colour constants. It cannot show the shared textured look, because the proxies carry no textures. The look at play distance is judged in the runtime with the shared materials (AST-08 and AST-09 in [ASSET_QA_CHECKLIST.md](ASSET_QA_CHECKLIST.md)); no render here is evidence of Quest appearance.

## 12. Parallel runs (measured, audit E §1)

| Load | Processes | Result | Peak RAM per process |
|---|---|---|---|
| CPU only (clay gear variants) | 1 / 4 / 8 / 12 | 0.43 / 1.12 / 1.88 / 1.58 variants per second (12 is worse than 8) | about 270 to 284 MB |
| GPU (512 px OPTIX bake plus one 960 x 540 render) | 1 / 2 / 4 | 1.0 / 1.65 / 2.6 times the single-process rate | about 1.15 GB |

Limits: at most 8 CPU-only Blender processes and at most 4 GPU processes on this machine. A mixed load was not measured. Proposal within those limits, while three production agents and the framework agent are active: each production agent runs at most 2 CPU-only processes and 1 GPU process at a time, the framework agent at most 2 and 1, so the totals stay at 8 and 4. Agents never write into another owner's family folder, and never open the same `.blend` at the same time (directive Part 7.4).

## 13. Procedure for one family run

1. Read the manifest entry, the specifications it names, and only the boards in its `references`, each once. Where a board and a specification disagree, follow the specification ([ASSET_REFERENCE_MAPPING.md](ASSET_REFERENCE_MAPPING.md)). If the entry is BLOCKED, stop and report.
2. Stage 1: write the proposal (size and basis, pivots, nodes, materials, colliders, sockets, clips) into the handoff. Wait for the lead's approval of any size that is not `spec`, `measured` or `derived`.
3. Build with the generator or build script, into a scratch output root. Never write into `public/` before the QA gate passes.
4. Run the in-Blender QA gate and fix what it reports.
5. Render the draft sheet. Read the report and the sheet once. Make one fix pass for the whole family.
6. Export to the manifest path, render the final sheet, and run the validator ([GLB_EXPORT_AND_VALIDATION.md](GLB_EXPORT_AND_VALIDATION.md)). Fix FAIL lines; write an answer for every WARN line.
7. Hand off to the lead: ids, source and GLB paths with SHA-256, report and sheet paths, WARN answers, open questions, and agent minutes and tokens (the pilot gate needs them). Entry changes go in the handoff; the lead edits the manifest ([ASSET_AGENT_ASSIGNMENTS.md](ASSET_AGENT_ASSIGNMENTS.md)).

## 14. Dependencies

- The framework pieces of section 4.2 (Asset framework agent) before any family run other than the pilot.
- The manifest schema fields of section 4.4 (lead) before the validator can check sockets and origins.
- The runtime material registry, the `userData.wu` reader and the solver-driven rotation system (lead, Agent 2, Agent 4) before Stage 6.
- Owner decision 4 (shared material library; accepted on 2026-11-06, ADR-032) and decision 5 (module and tooth set; still open).

## 15. Acceptance criteria

1. From a clean checkout, an agent regenerates `gear_spur_16_m1` using only this document and its manifest entry, and the GLB passes the validator with zero FAIL.
2. No generator has a default output path, and none writes outside the entries it was asked to build (R1 to R3).
3. Every family run produces one report and one sheet per round, within two fix passes per asset.
4. A GLB from a run contains no image, has `COLOR_0`, single-sided materials from the library, helper empties with `wu` properties, and node names that match the manifest.
5. Contact sheets are described as shape evidence only. No document or handoff calls them proof of in-game or Quest appearance.
