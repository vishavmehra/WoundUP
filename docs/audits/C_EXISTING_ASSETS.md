# Agent C: Existing Asset Audit

Date: 2026-11-06. Scope: every 3D and texture asset in the repo except `node_modules` and `dist`.
Method: a Node script (GLB JSON chunk parser, PNG/JPEG header reader) in the scratch folder `C:/Users/ASUS/AppData/Local/Temp/claude/11151372498ff63e/3e881673-e213-49c9-8bcf-435cb9f9d086/scratchpad/audits/`. Nothing in the repo was edited.

Unverified in this audit: runtime loading in three.js (the README claims a Node GLTFLoader check; I did not re-run it), rendering, the internals of the `.blend` files (not opened), and Quest performance.

## 1. Inventory

### 1a. Shipped runtime GLBs (referenced by code or scene)

| File | Used by | Size on disk | Triangles | Vertices | Draw primitives | Materials | Embedded images |
|---|---|---|---|---|---|---|---|
| `public/assets/models/props/gear_spur_16_brass.glb` | `src/assets.ts` key `gear-spur-16-brass`; `public/scenes/main.iwsdk.scene.json` node `gear-16` | 2,384,924 B (2.27 MiB) | 3,872 | 3,850 | 1 | `Mat_AgedBrass` | 3 PNG/JPEG, 2,236,647 B (2.13 MiB) |
| `public/assets/models/environment/tockton_base_round.glb` | `src/assets.ts` key `tockton-base-round`; scene node `stand` | 2,118,464 B (2.02 MiB) | 5,792 | 4,426 | 3 | `Mat_Walnut`, `Mat_AgedBrass`, `Mat_VelvetTeal` (sheen) | 9 PNG/JPEG, 1,937,185 B (1.85 MiB) |

Both files: one node, one mesh, no node transforms, no Draco, no meshopt, no KTX2, no external URIs. Texture sampler: linear mipmap, clamp to edge. Generator: Khronos glTF Blender I/O v5.2.40. Base extension: `KHR_materials_sheen` (velvet only).

### 1b. Embedded texture sizes (read from the image headers)

| GLB | Image | Format | Size | Bytes |
|---|---|---|---|---|
| gear_spur_16 | brass_baseColor | JPEG | 1024 x 1024 | 144,239 |
| gear_spur_16 | brass_orm | PNG | 1024 x 1024 | 831,095 |
| gear_spur_16 | brass_normal | PNG | 1024 x 1024 | 1,261,313 |
| base | walnut_baseColor | JPEG | 1024 x 1024 | 166,631 |
| base | walnut_orm | PNG | 1024 x 1024 | 423,115 |
| base | walnut_normal | PNG | 512 x 512 | 228,001 |
| base | brass_baseColor | JPEG | 512 x 512 | 33,946 |
| base | brass_orm | PNG | 512 x 512 | 197,941 |
| base | brass_normal | PNG | 512 x 512 | 317,601 |
| base | velvet_baseColor | JPEG | 512 x 512 | 20,371 |
| base | velvet_orm | PNG | 512 x 512 | 186,719 |
| base | velvet_normal | PNG | 512 x 512 | 362,860 |

Note: `blender/README.md` says the base walnut is "1024 px (+512 normal)". That is correct for the normal map, but the ORM is also 1024. The README is slightly incomplete. The README table also says the gear is "3 x 1024 px", which matches.

### 1c. Helper and variant GLBs (not shipped to `public/`)

| File | Size | Triangles | Verts | Textures | Status |
|---|---|---|---|---|---|
| `blender/exports/variants/gear_spur_12_brass.glb` | 748,376 B | 3,456 | 3,386 | 3 x 512 (images 617,444 B total) | Tracked in git. Modified in working tree. Not referenced by `src/` or `public/`. README says "not shipped". |
| `blender/exports/variants/gear_spur_24_brass.glb` | 823,416 B | 5,024 | 5,196 | 3 x 512 (images 625,158 B total) | Same as above. |

Inconsistency: `blender/README.md` says the variants are "GLB only in `blender/exports/variants/`, not shipped". They are in git, but the `.blend` variant sources are deleted in the working tree (`D`). Confirm before any packaging step that globs `exports/`.

### 1d. Third-party GLBs (hands)

| File | Size | Triangles | Verts | Textures | Notes |
|---|---|---|---|---|---|
| `public/assets/xr/generic-hand/left.glb` | 94,572 B | 2,314 | 1,360 | none | 29 joint nodes, `Default_Material`, Blender I/O v3.3.32. Used by `src/hands.ts`. |
| `public/assets/xr/generic-hand/right.glb` | 94,004 B | 2,314 | 1,360 | none | Same as left. |

Licence: `public/assets/xr/generic-hand/LICENSE.md` (MIT, per its first line). The `src/hands.ts` comment cites WebXR Input Profiles 1.0.20. Not reworked by this audit.

### 1e. Blender sources (binary, not parsed)

| File | Size | Tracked | Notes |
|---|---|---|---|
| `blender/source/gear_spur_16_brass.blend` | 2,420,978 B | Yes, modified | Source of the 16T gear GLB. Contents Unverified. |
| `blender/source/tockton_base_round.blend` | 2,144,334 B | Yes, modified | Source of the base GLB. Contents Unverified. |
| `blender/exports/variants/gear_spur_12_brass.blend` | (deleted in working tree) | Tracked | Session-start git status shows `D`. |
| `blender/exports/variants/gear_spur_24_brass.blend` | (deleted in working tree) | Tracked | Same. |

### 1f. Blender scripts (procedural generators)

| File | Size | Role |
|---|---|---|
| `blender/scripts/wu_common.py` | 48,053 B | Shared palette, texture synthesis, PNG writer, PBR material builder, Cycles AO bake, GLB export and QA, studio renderer. |
| `blender/scripts/gen_gear_spur.py` | 39,802 B | Gear generator (`--teeth N`). Builds `.blend`, `.glb`, previews. |
| `blender/scripts/gen_tockton_base.py` | 24,681 B | Base generator. |
| `blender/scripts/compose_m0_stage.py` | 3,456 B | Check-render composer. Needs the 12T/24T helper gears, which are not shipped. |

### 1g. Previews and other images

| Set | Count on disk | Tracked | Notes |
|---|---|---|---|
| `blender/previews/*.png` | 12 (5 gear, 5 tockton, 2 m0 stage) | 16 (6 `test_*` deleted in working tree) | Renders of the re-imported GLB. Not runtime. |
| `References/*.png` | 27 files, about 66.9 MB total | Not checked | Design reference art (blueprints, infographics). Not runtime. Not parsed. |
| `public/fonts/*.woff2` | 4 | Yes | Not 3D. Listed for completeness. |

### 1h. Procedural geometry in `src/`

None. A search for `BufferGeometry`, `BoxGeometry`, `CylinderGeometry`, `TorusGeometry`, `LatheGeometry`, `ExtrudeGeometry`, `SphereGeometry`, `ConeGeometry` and `PlaneGeometry` in `src/` returned no hits. Every visible 3D object currently comes from a GLB. Mechanical parts are not yet generated at runtime.

### 1i. Counts

| Category | Count |
|---|---|
| Shipped runtime GLBs (game assets) | 2 |
| Third-party GLBs (hands) | 2 |
| Helper GLBs (not shipped, in git) | 2 |
| Blender `.blend` sources (tracked, on disk) | 2 (+2 variant `.blend` deleted in working tree) |
| Blender generator scripts | 4 |
| Procedural runtime generators in `src/` | 0 |
| Standalone texture files (`.png`/`.jpg`/`.ktx2`) used at runtime | 0 |

## 2. Registration and code references

- `src/assets.ts` is the only registry. It calls `defineAssets` from `@iwsdk/core` with two entries. Both are `AssetType.GLTF` with `priority: 'critical'`. Paths are built from `import.meta.env.BASE_URL` plus `assets/models/<path>`.
- Scene references: `public/scenes/main.iwsdk.scene.json` line 56 (`tockton-base-round`) and line 77 (`gear-spur-16-brass`). The gear sits at `[0, 0.0486, 0.02]` with `rotationDeg [-90, 0, 0]` and has a `ReturnsToRest` component. The stand sits in group `stage` at `[0, 0.82, -0.55]`.
- `src/hands.ts` loads hands from `assets/xr/generic-hand/{side}.glb` through `AnimatedHand.assetPath` (not through `src/assets.ts`).
- No other `.glb`, `.gltf`, or model path is referenced in `src/`, `tests/`, `index.html`, or `iwsdk.config.json`. Confirmed by grep.

Consequence: adding a model means editing `src/assets.ts` and the scene JSON. Nothing enumerates the `public/assets/models` folder.

## 3. Reuse verdict

| Asset | Verdict | Reason |
|---|---|---|
| `gear_spur_16_brass.glb` | Reusable as is for the competition build. Rework needed for a scaled pipeline. | 3,872 tris is within its own 4,000 budget. Single draw. Clean structure. Heavy images (1.2 MB normal map, 1024 px for a small prop). |
| `tockton_base_round.glb` | Reusable as is for the competition build. Rework needed for a scaled pipeline. | 3 draws and 3 materials. 9 images for one object. Brass uses a tiled 512 texture. Sheen is fine. |
| `gear_spur_12_brass.glb`, `gear_spur_24_brass.glb` | Keep as generator outputs only. Do not ship. | Helper gears for the composition render. Their brass textures duplicate the 16T gear's. |
| `left.glb`, `right.glb` (hands) | Keep. Not part of the asset pipeline. | Third-party MIT, no textures, already served from our origin. |
| `.blend` sources | Keep as source of truth. | Regenerable from the Python scripts. |

## 4. Shared-material pipeline: what needs rework

1. Each GLB embeds its own copies of the brass textures. The gear and the base both have `Mat_AgedBrass` with different images (1024 px vs 512 px). Shared material names do not mean shared textures.
2. The 12T and 24T gears would each carry another copy of the brass set (about 0.6 MB each) if shipped.
3. There is no texture atlas, no KTX2, and no Draco or meshopt. Every texture is PNG or JPEG at full size.
4. Texture resolution is not tied to on-screen size. A 1024 px normal map on a 6 cm gear is probably more than the piece needs. Unverified: the exact texel density needed on Quest.
5. Scripts regenerate each asset from scratch, so the palette and conventions live in `wu_common.py` (good). But there is no manifest that records asset IDs, material IDs, budgets, or licences in one place. `docs/CREDITS.md` and `docs/ART_ASSET_PIPELINE.md` exist and were not reviewed in this audit.

## 5. What 100 to 200 assets would mean

Assumptions: each asset uses the current embedding pattern (self-contained GLB, about 2 MB of images each), and every asset has its own textures.

| Scenario | Image payload (approx.) | Notes |
|---|---|---|
| 100 assets at 2.0 MB each | 200 MB | Download and GPU memory would be far above a sensible Quest budget. |
| 200 assets at 2.0 MB each | 400 MB | Same pattern at the owner's upper estimate. |
| 200 assets, shared atlases (say 4 atlases of 2048 px, about 8 MB total) | about 8 MB of textures, plus geometry | Geometry for these two assets is about 0.15 MB each (146 KB and 176 KB). |

Geometry is small. Images are almost all of the bytes. The current pattern is not sustainable at 100 to 200 assets. A shared atlas and a material manifest are needed before the mass-production phase. Figures are arithmetic from the measured sizes above, not a measured load test.

## 6. Findings for the owner

1. The repo has 2 shipped game GLBs, 2 third-party hand GLBs, and 2 helper GLBs. Only the two game GLBs count toward the asset target.
2. The 2 shipped game GLBs are reusable for the competition build as they are.
3. The current GLB structure does not scale. About 85% of each game GLB is embedded images.
4. `blender/README.md` says the variant GLBs are not shipped. They are in git. Their `.blend` sources are deleted in the working tree. Reconcile this before packaging.
5. No procedural runtime geometry exists in `src/` yet.
6. The `References/` folder (27 PNGs, about 67 MB) is design reference only and must not be bundled.

## 7. Owner questions

None blocking. Decisions that will need the owner later: whether the helper gear variants stay in git, and whether a single shared brass atlas should replace per-asset brass textures.
