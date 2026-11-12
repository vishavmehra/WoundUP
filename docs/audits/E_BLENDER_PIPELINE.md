# Audit E - Blender pipeline

Date: 2026-11-06. Auditor: Agent E. Repo: read-only except this file. All test outputs are in
`C:/Users/ASUS/AppData/Local/Temp/claude/11151372498ff63e/3e881673-e213-49c9-8bcf-435cb9f9d086/scratchpad/audits/` (scripts at the top level, outputs in `out/`).

Labels: **Measured** = I ran it on this machine. **Read** = read from source or docs. **Estimate** = my judgement, not measured. **Unverified** = not checked.

## 0. Short answer

| Question | Answer |
|---|---|
| Does headless Blender work for the whole pipeline? | Yes. Generate, bake, export, render, all with `--background --factory-startup --python`. Measured. |
| Can a GLB carry material names with no embedded images? | Yes (`export_image_format="NONE"`). Catch: texture-linked sockets lose their metallic/roughness factors (see 2.4). Measured. |
| Can per-vertex AO ship as `COLOR_0`? | Yes. `bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")` then `export_vertex_color="ACTIVE"`. three r185 loads it with `vertexColors=true`. Measured. |
| How big is a ~4,000 tri gear GLB? | 144 KB plain, 179 KB with vertex AO, 43 KB with Draco. The shipped textured hero gear is 2.28 MB. Measured. |
| Is the Blender MCP usable now? | Not connected now. It can run headless via `blender --background --online-mode --command blender_mcp`, but only one server fits on port 9876, so it cannot serve parallel agents. Measured. |
| Can the new pipeline be 10x cheaper per asset? | Machine time: about 15-25x less (measured). Agent time: about 30-90x less for variants of an existing family, about 6-12x for kit-built assets, only 1-2.4x for bespoke hero models (estimates). The blended figure is about 7x time and 9x tokens, so a flat "10x for every asset" is not something I can promise. See section 5. |
| Can 180-200 GLBs be made by 2026-11-16? | Raw production capacity is not the limit (estimate: about 56 agent-hours needed against about 120+ available). The limits are asset specs, visual review and runtime integration. See 5.6. |

## 1. Headless automation (all measured)

Blender 5.2.1 LTS, hash 9e2066aef7ef. Python 3.13.13, numpy 2.3.4, glTF add-on `io_scene_gltf2` 5.2.40. Machine: i7-10875H (8 cores / 16 threads), 31.8 GB RAM (13 GB free during tests), RTX 2060 6 GB.

| Test | Result |
|---|---|
| `--background --factory-startup --python t0.py` | Works. First launch after idle: 40.8 s (cold disk cache). Warm: 3.49 s, 2.68 s, 2.57 s (timed in Git Bash). Launched from PowerShell with output piped, the same command took 9.3 s and 8.3 s; cause not investigated. |
| `-noaudio`, `--disable-autoexec` | No gain (3.0-3.7 s). |
| Cycles devices | OPTIX (RTX 2060), CUDA (RTX 2060), CPU. Intel UHD is not offered. A `HIPEW ... Error opening HIP` warning is harmless. |
| Cycles OPTIX headless | Works with `--factory-startup` (`device GPU`). The README's "about 100 s first OPTIX use" did not reproduce: kernels were already cached. Unverified on a clean machine. |
| EEVEE headless | Works on the GPU. Engine id is `BLENDER_EEVEE`. |

Render times (12 gears, about 46k tris, cyclorama studio from `wu_common.build_studio`):

| Render | Time |
|---|---|
| Cycles OPTIX 1920x1080, 64 spp, denoised, cold / warm | 32.8 s / 30.8 s |
| Cycles OPTIX 1280x960, 96 spp (the old per-view preview size) | 18.1 s |
| Cycles OPTIX 2048x2048, 128 spp | 69.7 s |
| Cycles OPTIX 960x540, 32 spp | 6.3 s |
| EEVEE 1920x1080, 16 spp, cold / warm | 14.6 s / 12.2 s |
| EEVEE 1280x960, 16 spp | 7.6 s |

So the old 5 previews per asset cost about 90 s of Cycles time. Machine time was never the problem.

Parallel instances (each process ran the real `gen_gear_spur.run`):

| Load | N | Wall | Throughput | Peak RAM per process |
|---|---|---|---|---|
| CPU only (6 clay gear variants per process, includes about 4 s startup) | 1 | 13.8 s | 0.43 variants/s | 284 MB |
| | 4 | 21.4 s | 1.12 | 272 MB |
| | 8 | 25.6 s | 1.88 | 271 MB |
| | 12 | 45.6 s | 1.58 (worse) | 270 MB |
| GPU (512 px OPTIX bake plus one 960x540 render) | 1 | 22.0 s | 1.0x | 1,147 MB |
| | 2 | 26.7 s | 1.65x | 1,148 MB |
| | 4 | 33.6 s | 2.6x | 1,148 MB |

Sensible limits: up to 8 CPU-only processes (the 8 physical cores), up to 4 GPU processes. A mixed load was not measured. RAM is not the limit for these scenes. This is a laptop, so sustained thermals are Unverified.

## 2. glTF exporter in this exact version

`bpy.ops.export_scene.gltf` has 110 properties here. Values below are read from its RNA and proven by test exports (matrix in `out/exp_results.json`).

| Topic | What exists | Proven |
|---|---|---|
| Image format | `export_image_format` = AUTO, JPEG, WEBP, **NONE**. AVIF is not offered. `export_image_add_webp`, `export_image_webp_fallback`. | NONE: 0 images, 0 textures, material names kept. WEBP: `EXT_texture_webp`, 3 images. |
| Draco | `export_draco_mesh_compression_enable` plus level and quantization bits (position 14, normal 10, texcoord 12, color 10, generic 12). Bridge DLL present. | 43,132 B, `KHR_draco_mesh_compression`, 0.63 s export. |
| Meshopt | `export_meshopt_compression_enable`, `EXT_meshopt_compression` or `KHR_meshopt_compression`. | 112,416 B / 107,644 B. **Not loadable in IWSDK** (see 2.5). |
| gltfpack | `export_use_gltfpack` and `export_gltfpack_*`. Needs an external gltfpack binary, not bundled. | Unverified. |
| Vertex colours | `export_vertex_color` = MATERIAL, ACTIVE, NAME, NONE; `export_all_vertex_colors`. | ACTIVE gives a clean single `COLOR_0` (ushort normalized VEC4, 8 B/vertex, even from FLOAT_COLOR). MATERIAL mode warned "will not be exported" and produced `COLOR_0` plus `COLOR_1`. Use ACTIVE. |
| Custom properties as extras | `export_extras` | Object, mesh and material extras all appear in the JSON, nested dicts and lists included. three puts them in `userData`. |
| Custom attributes | `export_attributes` | Only attributes whose name starts with `_` are exported. `_WU_PART` exported, `junk` dropped. |
| Tangents | `export_tangents` | `TANGENT` VEC4 added, +61.7 KB. |
| Animation clips | `export_animations`, `export_animation_mode` (ACTIONS, ACTIVE_ACTIONS, BROADCAST, NLA_TRACKS, SCENE), `export_force_sampling` (default True), `export_frame_step`, `export_optimize_animation_size`, `export_bake_animation`, `export_pointer_animation`. | Sampled: 49 samples for 2 s at 24 fps. Unsampled: 2 keys. Both load in three as an `AnimationClip`. |
| Instancing | `export_gpu_instances` (`EXT_mesh_gpu_instancing`) | Unverified. |

### 2.1 Test mesh and sizes

Mesh: `gen_gear_spur.py --teeth 16 --clay --no-previews --out <scratch>`. 3,872 triangles, 1,928 Blender vertices, 3,850 GLB vertices.

| Variant | GLB size |
|---|---|
| Generator's own clay export (POSITION, NORMAL, TEXCOORD_0, no images) | 144.3 KB |
| Same via my probe (A: images NONE, no vertex colour) | 147.7 KB |
| B: plus baked vertex AO as `COLOR_0` | 178.7 KB (+30.8 KB = 3,850 x 8 B) |
| C: plus tangents | 240.4 KB |
| F: plus one INT custom attribute | 194.2 KB |
| D: Draco, with `COLOR_0` | 43.1 KB |
| E: Meshopt (EXT / KHR), with `COLOR_0` | 112.4 / 107.6 KB |
| Textured material, 3 x 256 px maps: NONE / WEBP / AUTO | 178.6 / 185.2 / 330.9 KB |
| Shipped hero gear with embedded 1024 px textures (README) | 2.28 MB |
| Re-generated 18T, 512 px bake / 1024 px bake | 790 KB / 2.40 MB |

Family sizes, clay, no vertex colour (measured): 8T 125.8 KB, 10T 123.8, 12T 130.4, 14T 140.9, 18T 166.4, 20T 178.4, 22T 184.5, 24T 197.7, 28T 216.8, 32T 235.4, 36T 259.8, 40T 281.0.

### 2.2 Baked per-vertex AO

- Bake call: `me.color_attributes.new("AO", "FLOAT_COLOR", "POINT")`, make it active, then `bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")` with Cycles OPTIX at 64 spp. Bake targets in 5.2.1: IMAGE_TEXTURES, VERTEX_COLORS.
- Time: 1.71 s for the 1,928-vertex gear. AO range 0.375 to 1.0, mean 0.803.
- GLB `COLOR_0` accessor: 3,850 entries, normalized ushort, 24,576 to 65,535, which matches the baked range.
- three r185 `GLTFLoader` (the repo's own, run in Node): `MeshStandardMaterial`, `vertexColors = true`, colour itemSize 4, normalized.
- Quality (I looked at one close-up render, `out/vao_close.png`): soft, low-frequency darkening at spoke roots and the hub, no banding. AO resolution is limited by vertex density, so large flat faces (building walls) get no contact shadow unless subdivided. It is not a substitute for a 1024 px AO atlas on a hero object.
- three multiplies `COLOR_0` into the base colour. A neutral grey AO therefore does not break the frozen/awake desaturation described in the README.

### 2.3 Material names but no images

`export_image_format="NONE"` removes all images and textures and keeps `materials[].name` (proven with `Mat_AgedBrass_Tex`, 3 textured maps in the Blender material, 0 images in the GLB).

### 2.4 Catch: texture-linked sockets lose their factors

When Base Color, ORM and Normal are image-linked (as `wu_common.build_pbr_material` builds them), NONE exports `baseColorFactor` 0.8 and no metallic/roughness factor. three then reads `metalness = 1, roughness = 1` (measured). A constants-only Principled material exports its real factors (clay `Mat_AgedBrass`: base 0.423/0.223/0.033, metallic 0.85, roughness 0.45).
Consequence: library proxy materials in the Blender material library must be **constants only**, and the game must replace them by name with the shared textured material. No such registry exists in `src/` yet (grep for `Mat_` in `src` found nothing).
Also: a default Principled material exports `doubleSided: true`. Set `use_backface_culling = True` to keep the README's single-sided rule.

### 2.5 Runtime limits that shape the export profile (Read, plus one test)

- `node_modules/@iwsdk/core/dist/asset/loaders/gltf-loader.js` configures a `DRACOLoader` and a `KTX2Loader` only. No `MeshoptDecoder`. A meshopt GLB fails: "setMeshoptDecoder must be called before loading compressed files" (measured). Do not export meshopt.
- That loader's default Draco and KTX2 paths are `https://unpkg.com/three@0.185.0/...` (a CDN). The game must work with no external service, so Draco would need `dracoDecoderPath` pointed at self-hosted files. IWSDK vendors a decoder in `node_modules/@iwsdk/core/dist/vendor/draco/`. Whether the Vite build copies it is Unverified. Draco decode time on Quest is Unverified (the owner has no headset).
- IWSDK payload ceilings (`@iwsdk/scene-composition/dist/validation.js`): 64 MB per model, 256 MB total.
- `blender/README.md` says "no Draco". `docs/ART_ASSET_PIPELINE.md` sets no total download budget (Read; grep found none). Default recommendation: plain GLB, no compression, and set a budget.

## 3. Colliders, pivots and metadata three.js can read

Convention tested (`out/M_extras.glb`, script `meta_test.py`), loaded with the repo's GLTFLoader:

| Element | Blender | In the GLB / in three |
|---|---|---|
| Part root | Empty `Part_<id>` with custom prop `wu` = `{id, family, tier, ...}` | Node with `extras.wu`; `userData.wu` in three |
| Mesh | Child of the root; mesh and material custom props allowed | Mesh node; mesh extras appear on the Mesh object's `userData` |
| Collider | Empty `COL_*`, display type SPHERE / CUBE / CIRCLE, prop `wu = {type:"collider", shape:"box"\|"sphere", purpose:"grab"}`; **size set with the empty's scale (metres)** | Node `scale` carries the half-size. `empty_display_size` is not exported. Blender (x, y, z) is swizzled to glTF (x, z, y) for scale, as for position (verified: box scale 0.032, 0.0076, 0.032 became 0.032, 0.032, 0.0076) |
| Secondary pivot | Empty `PIV_*` with `wu = {type:"pivot", kind:"rotation_axis", axis:"+Z"}`; the mesh origin is the main pivot (README convention) | Node translation and rotation |
| Socket | Empty `SOCKET_*` with `wu = {type:"socket", accepts:[...], snap_mm:3}`, placed by location | Node translation; `accepts` array survives |

Notes: select the empties as well as the mesh (`use_selection=True`). Child order in the GLB was alphabetical, so find nodes by name prefix and `userData.wu.type`, never by index. A hidden convex-hull collision mesh (`COLM_*`) was not tested. Whether IWSDK physics or grab colliders can consume these nodes directly is Unverified; a small TypeScript reader that builds colliders from `userData.wu` is the safe route.
Pitfall found: a full-turn rotation clip with two keys exports as identity to identity (output values `[0,0,0,1]` and `[0,0,0,1]`), so it does not rotate. Continuous rotation should come from the solver at runtime. Use clips only for one-shot motion, and use sampled export.

## 4. Blender MCP add-on

| Item | Finding |
|---|---|
| What it is | Blender Lab "MCP" extension v1.0.3, `blender_version_min = 5.1.0`, at `C:/Users/ASUS/AppData/Roaming/Blender Foundation/Blender/5.2/extensions/user_default/mcp`. Permission: local TCP server. |
| Client | `C:/Users/ASUS/.local/bin/blender-mcp.exe`, registered in `~/.claude.json` as `mcpServers.blender` (stdio). The stdio process is running. |
| Needs | Blender GUI running with the add-on server started on `localhost:9876` (auto-start default True, delayed), and online access allowed (`bpy.app.online_access`, `--online-mode` on the CLI). |
| Connected now? | **No.** `mcp__blender__get_objects_summary` returned "Cannot connect to Blender at localhost:9876". No Blender process, nothing listening. |
| Headless mode | Works. `blender --background --online-mode --command blender_mcp` listened on 9876, and `execute_blender_code` returned `{"version":"5.2.1 LTS","background":true,"objects":3}`. It must **not** include `--factory-startup`, or the command is "Unrecognized" because user extensions are not loaded. I stopped that process afterwards (port closed). |
| Limits | One server on one fixed port, so one agent at a time. Deferred responses are rejected in background mode (Read). Screenshot and viewport tools in background mode: Unverified. The bundled API and manual doc search tools: not tested. |

Decision: the pipeline must not depend on the MCP. Parallel agents use CLI scripts. The MCP is optional for one agent debugging interactively.

## 5. Cost model and proposed pipeline

### 5.1 What the old run cost

Owner figure: about 3 h and 730k tokens for two assets, so about 90 min and 365k tokens each. The code behind it is about 2,530 lines of Python (`wu_common.py` 1,074, `gen_gear_spur.py` 854, `gen_tockton_base.py` 524, `compose_m0_stage.py` 76). Machine time for one asset was small (measured): textured gear 1024 px 20.9 s, plus 5 previews at 18.1 s = about 111 s, roughly 2% of the 90 minutes. The cost was agent iteration, so the fix has to cut agent iterations, not render time.

### 5.2 Proposed pipeline ("family forge")

1. **One generator module per family** (gear is the first), driven by **manifest entries** (JSON: id, family, params, material, tier, collider/pivot/socket list). A manifest line is the only thing a new variant needs.
2. **One runner**, `forge.py --manifest <file> [--only ids]`. It builds, bakes vertex AO, adds collider/pivot/socket empties, runs the QA gate, exports, writes `<family>.report.json`, and renders **one contact sheet per family** (EEVEE for drafts, Cycles for the final). One Blender process handles the whole family, so startup is paid once.
3. **One shared material and texture library**: constants-only `Mat_*` proxy materials in the GLBs; shared tileable ORM and normal textures (generated once with the existing `brass_maps(..., tile=True)`, `walnut_maps`, `velvet_maps`) loaded once by the game and swapped in by material name. Hero objects keep their own textured GLBs.
4. **Fixed export profile**: images NONE, `export_extras=True`, `export_vertex_color="ACTIVE"`, no compression, no tangents, `_`-prefixed attributes only if needed, single-sided materials.
5. **Fixed iteration limit**: per family, one EEVEE draft sheet, one fix pass, one Cycles final sheet. Per asset, at most 2 fix passes, then accept or escalate. The agent reads one JSON and one image per round, not 5 images per asset.
6. **QA gate** (seconds, no agent tokens): name and bbox match the manifest, tri budget, 0 images, `COLOR_0` present, `mesh_qa` clean, metadata schema valid.

### 5.3 Machine time (measured)

| Step | Old (per asset) | New (per asset) |
|---|---|---|
| Build + export, clay | n/a | 1.2-3.1 s (median 1.46 s, 12 gear variants in one process) |
| Textures / bake | 10.5 s (512 px) or 20.9 s (1024 px) | vertex AO: 1.7 s |
| Previews | 5 x 18.1 s = about 90 s | one sheet per family: 7.6-30.8 s shared by 12+ assets, about 1-3 s per asset |
| Total | about 111 s | about 4-8 s |

About 15-25x less machine time per asset. Throughput with 8 parallel CPU processes was 1.9 variants/s including startup (measured).

### 5.4 Agent time and tokens per family type (Estimates, not measured)

Basis: the old run (90 min, 365k tokens per asset), the line counts above, and the measured machine times. Agent time is the part I could not measure.

| Family type | Examples | One-off work | Per asset after that | Reduction vs 90 min / 365k |
|---|---|---|---|---|
| A1 Existing generator, new manifest line | more gear sizes and materials | none | 1-2 min, 5-10k tokens | 45-90x / 36-73x |
| A2 New mechanical family generator | bevel gear, shaft, spring, cam, crank, pulley, ratchet, pawl, escapement, pendulum, flywheel | 150-350 lines; 25-45 min and 80-150k tokens per family | 1-3 min, 5-10k tokens | 30-90x / 36-73x once the family exists |
| B Kit-built buildings and props | walls, roofs, windows, chimneys, jars, parcels | kit of 400-800 lines; 2-3 h once | 8-15 min, 30-50k tokens | 6-11x / 7-12x |
| C Bespoke heroes | trunk, Music Box casing, Carousel, Windmill, Bakery, Clock Tower, Theatre | 300-700 lines each | 60-90 min, 150-300k tokens | 1-1.5x / 1.2-2.4x |
| D Characters and automata (figure kit) | townsfolk | kit of 300-500 lines; 1.5 h once | 10-20 min, 30-60k tokens | 4.5-9x / 6-12x |
| E Small props | letters, gift boxes, keys | none after kit B | 5-10 min, 15-30k tokens | 9-18x / 12-24x |

**Honest conclusion on "10x per asset":** it holds for A1, A2 and E, is borderline for B and D, and does not hold for C. For a mixed set of about 180 assets (60 A1, 10 families / about 50 A2 variants, 30 B, 10 C, 15 D, 15 E) the estimate sums to about 38 agent-hours and about 7.2M tokens (kit setup assumed at 300k tokens for B and 400k for D), against 270 h and 66M tokens for the old method. That is about 7x in time and 9x in tokens. Reaching a true 10x needs C kept to the G0 heroes only, or heroes built from the kit as well.

### 5.5 Pilot gate

Pilot gate (by 2026-11-08): framework (runner, library, vertex AO helper, empties writer, QA gate) plus the gear family from a manifest plus one new family. Record real agent minutes and tokens per asset. If the measured figure is more than 2x the table above, cut scope before spending more.

### 5.6 How many by 2026-11-16 (Estimate; machine side measured)

Assumptions: 9 working days (11-06 to 11-14), 11-15 for integration, 11-16 freeze. 5 effective agent-hours per day per agent. Framework needs about 8-12 agent-hours (lead) before families can run. Blended yield about 4.8 assets per agent-hour raw, about 3.2 after 50% for rework and review.

| Blender agents in parallel | Agent-hours after framework (about 41 h each) | Theoretical output at 3.2/h |
|---|---|---|
| 2 | 82 | about 260 |
| 3 | 123 | about 390 |
| 4 | 164 | about 520 |

These numbers are upper bounds from unmeasured agent rates. The machine is not the limit: 4 GPU processes scale 2.6x, 8 CPU processes 4.3x (measured), which is far above what agents can feed it. The real limits are:

1. The asset list and exact specs per asset (dimensions, counts) from the other audits. I do not have their GLB count, so I cannot confirm 180-200 or the G0-required share.
2. Visual review of contact sheets (the agent cannot judge in-engine look; the owner has no Quest).
3. Runtime integration: material registry, `userData.wu` reader, socket and collider code (none exists yet).
4. Distinct parts versus instances: a machine's 12, 20, 24 or 32 parts are placements of shared part GLBs, not one GLB each.

Recommendation: build G0-required first. Start G0-optional and G1 only when the G0 set has passed the QA gate. G2-G5 should not enter the path.

## 6. Existing scripts: reuse and gaps

Reusable as-is in `blender/scripts/wu_common.py`: palette, `brass_maps` (has `tile=`), `walnut_maps`, `velvet_maps`, `write_png`, `build_pbr_material`, `bake_maps` (image bake), `export_glb`, `inspect_glb`, `mesh_qa`, `uv_qa`, `build_studio`, `make_camera`, `render_to`, `import_glb`, `reset_scene`, `setup_cycles` (OPTIX with CPU fallback).

Gaps to close (do not exist today):

| Gap | Where it bites |
|---|---|
| `export_glb` hard-codes `export_extras=False`, `export_vertex_color="NONE"`, `export_image_format="AUTO"`, `export_animations=False`, `export_attributes=False` | Needs an override argument or a second profile. |
| No vertex-AO helper | About 15 lines (shown in 2.2). |
| No empties writer for collider / pivot / socket | About 30 lines. |
| No contact-sheet helper. My test layout used a fixed pitch and large gears overlapped | Needs size-aware layout. |
| No box-projected UV helper with fixed texel density | Needed for shared tileable textures (gears use planar discs plus strips). |
| Geometry helpers (revolve, outline extrude, chamfer, boolean union) live inside `gen_gear_spur.py` and `gen_tockton_base.py`, not in `wu_common` | New families would copy them. Move to a shared module. |
| Gear generator only varies teeth, tip diameter, thickness, bore | Spokes, hub and rivets are fixed. Variants like solid discs need parameters. |
| **Repo-write hazard:** `gen_gear_spur.py` without `--out` writes `public/assets/models/props/gear_spur_16_brass.glb` and `blender/source/gear_spur_16_brass.blend` (16T, non-clay), and previews always go to `blender/previews/` | Parallel agents can overwrite shipped assets. The runner should refuse default paths. |
| Importing `wu_common` from another script writes `__pycache__` into the repo unless `sys.dont_write_bytecode = True` is set first | I set it. Agents should too. |

## 7. Installed tools and skills that help (from the skill and tool lists; contents mostly not opened)

| Tool / skill | Area | Use for this pipeline | Status |
|---|---|---|---|
| Blender 5.2.1 CLI | Blender | Everything above | Measured |
| `mcp__blender__*` (Blender Lab MCP, 26 tools, including `*_for_cli` variants that I did not test) | Blender | Single-agent interactive debugging only | Registered, add-on not running |
| `ecc:blender-motion-state-inspection` | Blender | Rigs, poses, retargeting. Only relevant if characters are rigged. Static parts do not need it | Frontmatter read |
| `agentic-awesome-skills:threejs-loaders`, `threejs-materials`, `threejs-textures`, `threejs-geometry`, `threejs-fundamentals`, `threejs-lighting`, `threejs-animation`, `threejs-interaction`, `threejs-shaders`, `threejs-postprocessing`, `threejs-skills` | three.js | Reference for the material registry and `userData.wu` reader. `threejs-loaders` and `threejs-materials` are the relevant two | Frontmatter of loaders and materials read; others by name only |
| `3d-games`, `3d-web-experience` (also under `agentic-awesome-skills:`), `game-development` | 3D / games | Generic principles. Low value beyond the above | Frontmatter read for two |
| `lookdev`, `lookdev-auto` | Visual tuning | A vision model rates render variants. Could judge contact sheets, but adds tokens | Frontmatter read |
| `progressive-estimation` | Planning | PERT estimates for the pilot recalibration | Frontmatter read |
| Playwright MCP, Chrome DevTools MCP (two copies) | Browser | In-engine GLB check, console and network | Names only |
| `scroll-world:scroll-world` | Spatial presentation | CLAUDE.md says to evaluate it. Not an asset-pipeline tool | Name only |
| Generative image / 3D skills (`ai-studio-image`, `generate-nanobanana`, `stability-ai`, `ecc:fal-ai-media`, `comfyui-gateway`, `vizcom`) | Generative | Not recommended: license and redistribution risk, and CLAUDE.md rejects "generic AI model dumps" | Names only |
| Artlist MCP | Media | Needs authorization, unavailable until the owner authorizes it | Auth required |
| `node_modules/meshoptimizer`, `sharp` | Asset tooling | Present. `@gltf-transform/*` and `gltfpack` are **not** installed | Read |

No installed skill covers procedural modelling or asset-manifest pipelines. That is what section 5.2 builds.

## 8. Risks, blockers, owner questions

Risks
1. Agent-time figures in 5.4 and 5.6 are estimates. The pilot gate in 5.5 exists to replace them with measurements.
2. Vertex AO is low-frequency. Large flat surfaces need subdivision or a small AO atlas.
3. NONE-image export drops factors on texture-linked materials (measured), so proxy materials must be constants-only.
4. The runtime has no material registry or `userData.wu` reader yet.
5. IWSDK has no meshopt decoder, and Draco defaults to a CDN. Plain GLBs are the safe default, which makes total payload a decision to set: if all of about 190 files were gear-sized (0.12-0.28 MB plain, 4,000 tris), that is roughly 23-53 MB uncompressed, and Draco was 4.1x smaller on the gear. The real average is unknown until the asset list is final.
6. GPU scaling is only 2.6x at 4 processes. Laptop thermals under sustained load are Unverified.
7. Repo-write hazard from default paths (section 6).
8. Blender MCP single-port limit.

Blockers: none for this audit.

Owner questions (only those that need the owner)
1. Approve moving non-hero parts to "constants-only materials plus shared texture library plus vertex AO", and keeping embedded textures only for hero objects? It changes `blender/README.md` conventions, so it needs a `docs/DECISIONS.md` entry.
2. Set a total GLB download budget (suggestion: 40 MB; no budget exists in the docs).
3. Plain GLB or Draco? Default: plain. Draco needs self-hosted decoders, and its decode cost on Quest cannot be measured without a headset.
