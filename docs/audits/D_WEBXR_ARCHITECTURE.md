# Audit D: WebXR and Architecture

Auditor: Agent D (read-only). Date: 2026-11-06. Repo: `D:/Development/AI ML/WoundUp` at HEAD `c9ea5c1` plus the uncommitted working tree.
Stack as installed: `@iwsdk/core` 1.1.0-rc.2 (a release candidate), `three` = `super-three@0.185.0`, `elics` 3.4.2, Vite 7, Vitest 5.1.
Method: read `src/**`, `tests/**`, configs and docs; read the `.d.ts` and `.js` under `node_modules/@iwsdk/*`, `three`, `@pmndrs/pointer-events`, `@types/webxr`; inspected the two shipped GLBs and `dist/`. Nothing was run or installed. Tests were not executed, so "tests pass" is Unverified.
"Unverified" means not checked in code or by a fetched page. Every budget below says what it rests on.

## 0. Short answers

1. Only the M0 foundation exists (landing, XR entry, fallback stand, one grabbable gear, 22 tests). Every gameplay module in the directive has a spec and no code.
2. IWSDK's loader is a thin cache over three's `GLTFLoader`. It never frees GPU memory on level change, loads scene assets one after another, defaults Draco/KTX2 decoders to `unpkg.com`, and never installs a meshopt decoder. All four are fixable from the project side with public calls.
3. Table work needs raw WebXR (`frame.detectedPlanes`, `frame.createAnchor`). IWSDK's own anchor is a single anchor at the reference-space origin and cannot hold a table pose.
4. A world registry that loads and unloads per-world assets is feasible with about 200 lines on public APIs. The risk is not the code. It is that Vite copies all of `public/` into the build, and that the gaze and ray modes conflict with the near-grab component.
5. The one measurement we have says fill cost, not geometry. The two GLBs already hold 36 MiB of GPU textures for 9.7k triangles. Per-GLB textures cannot scale to 180 to 200 GLBs. A shared material library can.

## 1. Modules: what exists and what is missing

Existing source (all of it): `src/index.ts` (78 lines, bootstrap), `assets.ts`, `components.ts`, `placement.ts` (pure stand maths), `stage.ts` (StageSystem, stand placement), `stage-framing.ts`, `xr-entry.ts`, `hands.ts` (self-hosted hand GLBs), `grab-mode.ts`, `grab-feedback.ts`, `returns-to-rest-component.ts`, `render-budget.ts` (2D-only frame limiter), `landing/**` (other process). Tests: 16 unit (`placement` 6, `xr-entry` 7, `stage-framing` 3) and 6 Playwright (`landing` 3, `xr-emulator` 3). `public/scenes/main.iwsdk.scene.json` holds the stand, one gear, two lights, an `IBLGradient` and a `ContactShadow`. There is no `.codegraph/` index.

| Module | Spec | Code today | Missing | Constraint from the stack |
|---|---|---|---|---|
| Mechanical simulation | `MECHANICAL_SOLVER_SPEC.md` §1-20, `TECHNICAL_ARCHITECTURE.md` §10 | None. `src/sim/` and `tests/sim/` do not exist. | Graph solver, ratios, jam, spring energy, targets, tests | Pure TypeScript, no IWSDK. Vitest runs in node (`vitest.config.ts`). |
| World simulation (plots, wake, day/night, daily repair) | `PRODUCT_SPEC.md` §11, `GAMEPLAY_SYSTEMS.md` §14, `SIMULATION_SPEC.md` §13 | None | Plot state, wake state machine, ripple effect, day/night | Scene JSON is static. Dynamic content needs `world.createTransformEntity`. A ripple shader must survive multiview (§5.3). |
| Resident behaviour | No behaviour spec. Only art (`REFERENCE_INDEX.md` character board, `character_town_residents.blend` in `ART_ASSET_PIPELINE.md`) and `IDEAS.md` §4.1 (future). | None | Everything. For the competition keep residents static or idle. Anything autonomous is G1. | IWSDK has no animation or behaviour system (no `AnimationMixer` anywhere in `core/dist` or `xr-input/dist`). |
| Story and quests | `PRODUCT_SPEC.md` letters 1-6, repairs, closing card; `GAMEPLAY_SYSTEMS.md` §4-5; `DATA_AND_BLUEPRINT_SPEC.md` §11-12 | None | Letter data, progression machine, a way to show text in XR | XR text and UI technology is undecided: `features.spatialUI` is `false` in `iwsdk.config.json`, uikit packages are installed, no ADR picks a path. Fonts must be self-hosted. |
| Spatial interaction | `INTERACTION_SPEC.md`, `TECHNICAL_ARCHITECTURE.md` §12-15 | M0 only: `grab-mode.ts`, `grab-feedback.ts` | Sockets and snapping, release logic, winding, X-ray gesture, plot targeting, ghost hands, gaze mode, tray collider rules | `OneHandGrabbable` denies ray pointers (`core/dist/grab/grab-system.js:256`). See §3.7 and §4.4. |
| Machine construction | `GAMEPLAY_SYSTEMS.md` §6-8, `TECHNICAL_ARCHITECTURE.md` §13 | None | Part catalogue, sockets, assembly state, tray | A procedural part can be a manifest entry: `AssetManifestEntry = LoadableAssetManifestEntry \| Object3D` (`asset-manager.d.ts`). |
| Blueprint validation | `DATA_AND_BLUEPRINT_SPEC.md` §5-9, §13; `TECHNICAL_ARCHITECTURE.md` §9 | None | Schema, validator, tests | Pure TypeScript. |
| Persistence | `SAVE_PERSISTENCE_SPEC.md`; `TECHNICAL_ARCHITECTURE.md` §16 (`woundup.save`, `SaveV1`) | None | Load, validate, memory fallback, reset | If `sceneUnderstanding` is switched on, IWSDK writes a second localStorage key, `iwsdk_scene_anchor_uuid` (`scene-understanding-system.js:683`). |
| Rendering | `PROJECT_BIBLE.md`, `ART_ASSET_PIPELINE.md`, `TECHNICAL_ARCHITECTURE.md` §19-20 | Lights, IBL, contact shadow, fallback stand, 2D frame limiter | Table placement, frozen/awake shading, X-ray pass, shared material library, LOD, shader pre-warm | Renderer is built inside IWSDK with `antialias: true`, `multiviewStereo: true` (`world-initializer.js:251`). The XR target uses 4 MSAA samples (`WebXRManager.js:521`). |
| Audio | `TECHNICAL_ARCHITECTURE.md` §18 | None | Web Audio engine, melody, mix | IWSDK `AudioSystem` plays loaded `AudioBuffer`s (`AudioSource.src`). Procedural audio sits beside it. |
| Asset management | `ART_ASSET_PIPELINE.md`, ADR-023, ADR-025 | `src/assets.ts` (two GLBs, `critical`), `hands.ts` | Manifest policy, material library, decoder hosting, optimiser pipeline, unload, world registry | §3 and §5. |

Defects found in existing code:
- `GrabFeedbackSystem` (`grab-feedback.ts:42-45, 76-99`) clones every material of every part in `register()` and never cleans up. There is no `disqualify` handler, so destroyed parts leave entries in three Maps and undisposed materials. Harmless now (one gear). It leaks as soon as machines are built and torn down, or worlds are swapped.
- `index.ts:38` shows loading state without progress. `AssetManager.loadingManager` (public static `LoadingManager`) could feed real progress.
- Critical assets block `World.create`, and the Enter button waits for it (`index.ts:47-52`). Today that is 4.5 MB.

## 2. Tools checked

No GLB optimiser is installed: `gltf-transform`, `toktx` and `blender` are not on PATH, and none is in `node_modules/.bin`. `meshoptimizer` 1.1.1 exists only as a transitive dependency of `@types/three`. IWSDK 1.1.0-rc.2 has no build-time GLB optimiser (`vite.config.ts` has only `iwsdkDev()`; the IWSDK docs say Vite copies `public/` untouched).

## 3. Asset loading facts (decide the GLB strategy)

### 3.1 How `defineAssets` and the asset manager work

| Fact | Where |
|---|---|
| `defineAssets` only validates and freezes a map of `{url, type, priority?, name?}` or an `Object3D` prototype. Types: `gltf`, `audio`, `texture`, `hdr-texture`, `uikitml`. | `asset-manager.js:39-57, 406-433` |
| `critical` entries (the default) load in parallel inside `World.create` and block it. `background` loads after, errors only warn. `lazy` is registered and fetched on first use. | `preloadAssets`, `asset-manager.js:245-261` |
| One manifest per world, fixed at `World.create`. `RenderableAssetRegistry` has no add or remove (`preload, has, kind, list, catalog, bounds, instantiate`). | `asset-manager.d.ts`, `world-initializer.js:finalizeInitialization` |
| `AssetManager.registerManifest` replaces the entry map, it does not merge. `AssetManager.init` clears it too. | `asset-manager.js:216-243` |
| Scene JSON asset ids are validated against `world.assets.catalog()`. | `level-scene-json-importer.js:35-46` |
| `world.assets.instantiate(id)` loads a `lazy` or unloaded GLTF on demand (de-duplicated) and returns a clone of `gltf.scene`. | `asset-manager.js:174-200` |
| Clones share geometry, materials and animation clips. They do not share `Object3D` nodes. | `gltf-loader.js:136-169`, `asset-manager.js:390` |
| Scene-driven loading is serial. Each node is `await`ed in turn, including children. N lazy GLBs in a level cost N sequential round trips. Prefetch in parallel before `loadLevel`. | `level-scene-object.js:32-46, 156-168` |
| Each load has a 30 s timeout (`DEFAULT_ASSET_LOAD_TIMEOUT_MS`), changeable with `AssetManager.setLoadTimeout`. A late result is disposed. | `cached-asset-load.js` |
| The 64 MB per model and 256 MB total payload limits apply only to `GLTFLoadTransaction`, not to normal loads. Nothing in core uses the transaction. | `scene-composition/dist/validation.js:17-18`, `asset-manager.js:334` |
| Scene document limits: 10,000 nodes, 4,096 resources. Not a constraint at 200 assets. | `validation.js:13-16` |
| `AssetManager` is a static class. `World.create` calls `AssetManager.init(renderer, world)` with no options. | `world-initializer.js:126, 429` |
| Hand models load through `AssetManager` (passed to `XRInputManager` as `assetLoader`) when a hand connects, not in preload. | `world-initializer.js` `setupInputManagement`, `hands.ts` |

### 3.2 Caching, disposing, unloading

- Cache: `CacheManager` static maps `url -> gltf`, in-flight promises, `key -> url`. Public: `deleteAsset(keyOrUrl)`, `clear()`, `setAsset`, `setKeyToUrl` (`cache-manager.js:19-85`).
- `CacheManager.deleteAsset` only removes the Map entry. It disposes nothing.
- A level change does not free asset GPU memory. `disposeSceneObjectResources` is documented "without disposing shared asset resources" and `LevelSystem` then calls `entity.destroy()`, not dispose (`level-scene-object.js:76-91`, `level-system.js:179-188`). Cached GLTFs, geometries and textures stay alive for the page lifetime.
- `LevelSystem` stages the new level before it disposes the old one (`level-system.js:81-135`), so a swap peaks at both worlds in memory.
- `disposeGLTFResources` (which does the right thing) is not exported from the package barrel. `Entity.dispose()` (default `disposeResources: true`) calls `World.disposeObject3DResources`, which disposes geometry, materials and their textures, including ones other clones still share (three re-uploads on next render, so it is safe but wasteful). Unloading a world therefore needs our own ~20-line disposer plus `CacheManager.deleteAsset`.
- `World.destroy()` exists and stops the loop, but is not meant for world swaps.

### 3.3 GLTFLoader extensions and decoder sources

IWSDK builds one `GLTFLoader` with `DRACOLoader` and `KTX2Loader` (`gltf-loader.js:44-56`). Paths default to `https://unpkg.com/three@0.185.0/examples/jsm/libs/{draco/gltf,basis}/` (`gltf-loader.js:31, 47, 50`). The production bundle contains those strings (`dist/assets/light-system-*.js`) plus `cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles` (controller models) and an `api.dicebear.com` default avatar URL from the uikit-horizon kit (not requested unless an Avatar is used; Unverified that nothing uses it).

| Extension | Wired in this stack? | Decoder or source | Self-hostable? |
|---|---|---|---|
| `KHR_materials_clearcoat, dispersion, iridescence, sheen, transmission, volume, ior, specular, anisotropy`, `EXT_materials_bump` | Yes, built into three's `GLTFLoader` constructor (`GLTFLoader.js:133-250`). Each one maps the material to `MeshPhysicalMaterial` (`getMaterialType`, e.g. lines 897, 1091, 1159). | None | n/a |
| `KHR_materials_emissive_strength`, `KHR_materials_unlit` | Yes. Emissive strength does not force Physical. | None | n/a |
| `KHR_texture_transform` | Yes (`GLTFLoader.js:1993-2050, 3401-3409`). It clones the texture. | None | n/a |
| `KHR_mesh_quantization` | Yes (`GLTFLoader.js:2054`). | None | n/a |
| `KHR_lights_punctual` | Yes. Lights in a GLB become real scene lights. Strip them on export. | None | n/a |
| `EXT_mesh_gpu_instancing` | Yes (`GLTFMeshGpuInstancing`). Produces an `InstancedMesh`. | None | n/a |
| `EXT_texture_webp`, `EXT_texture_avif` | Yes. The browser decodes. Smaller download, no GPU saving. | None | n/a |
| `KHR_texture_basisu` | Registered; needs the `KTX2Loader` IWSDK creates. Transcoder path defaults to unpkg. | `basis_transcoder.js` 57 KB, `.wasm` 527 KB at `node_modules/three/examples/jsm/libs/basis/` | Yes, see below |
| `KHR_draco_mesh_compression` | Works through IWSDK's `DRACOLoader`; decoder defaults to unpkg. | `draco/gltf/draco_wasm_wrapper.js` 58 KB, `draco_decoder.wasm` 192 KB (+ `draco_decoder.js` 512 KB fallback) at `node_modules/three/examples/jsm/libs/draco/gltf/` | Yes |
| `EXT_meshopt_compression`, `KHR_meshopt_compression` | The extension is registered, but IWSDK never calls `setMeshoptDecoder`. A GLB that requires it throws "setMeshoptDecoder must be called" (`GLTFLoader.js:1621`). | `meshopt_decoder.module.js` 29 KB at `node_modules/three/examples/jsm/libs/` | Yes, but needs the workaround below |
| `KHR_animation_pointer`, `KHR_materials_variants` | Not built in (only listed as third-party in the loader header). | n/a | n/a |

Self-hosting recipe (all public API, no fork):
1. Copy the three folders above into `public/vendor/{draco/gltf,basis,meshopt}` (a prebuild copy script; do not hand-copy). Reference them through `import.meta.env.BASE_URL` so ADR/APP-08 sub-path builds still work.
2. For Draco and KTX2: after `World.create`, call `AssetManager.init(world.renderer, world, { dracoDecoderPath, ktx2TranscoderPath })` (`AssetManagerOptions`, `asset-manager.d.ts`), then `AssetManager.registerManifest(projectOptions.assets)` again, because `init` clears the entry map (`asset-manager.js:219`). Anything marked `critical` is parsed before this point with the default loaders, so compressed GLBs must be `lazy` or `background`.
3. For meshopt, IWSDK offers no hook (`GLTFAssetLoader` is not exported and `exports` in `package.json` blocks deep imports). Use our own `GLTFLoader` (same class IWSDK uses, with `setMeshoptDecoder`, `setDRACOLoader`, `setKTX2Loader` on local paths), then hand the result to IWSDK: `CacheManager.setAsset(url, gltf)` and `CacheManager.setKeyToUrl(key, url)`. `loadCachedAsset` returns a cached asset before fetching (`cached-asset-load.js:35-38`), so `getGLTF`, `instantiate` and scene JSON all work unchanged.
4. Extend the existing "no third-party request" Playwright assertion (`landing.spec.ts` `watch()`) to load one compressed test GLB.

This reverses ADR-023's "no compression" rule, which was correct for two GLBs. It needs an ADR amendment by the lead. KTX2 is the only item that cuts GPU memory (4x to 8x). Meshopt cuts geometry download. WebP only cuts download.

### 3.4 Reusing one material across many GLBs

- GPU textures are shared only when the `Texture.source` and sampler key match (`WebGLTextures.js:371-406, 532-551`). Each GLB decodes its own images, so identical PNGs in two GLBs upload twice. `KHR_texture_transform` clones that share a source do share the upload.
- Today `tockton_base_round.glb` carries 9 embedded textures and `gear_spur_16_brass.glb` carries 3 at 1024x1024. Each new brass part would repeat that.
- Strategy that works with the installed code: export GLBs with named materials and no textures (`Mat_AgedBrass`, `Mat_Walnut`, ... already the Blender naming). At first load of each GLB, walk the cached scene once (use `AssetManager.getGLTF(id, { shared: true })`) and replace `mesh.material` with the instance from a persistent `MaterialLibrary` keyed by material name; dispose the GLB's own. Clones taken afterwards inherit the shared material. Do this before the first `instantiate`.
- The material library is a persistent bucket that world unload never touches (reference-count it if two worlds ever share).
- `GrabFeedbackSystem` currently clones a material per part for the glow. Textures stay shared (clone keeps texture references), but the material count grows with parts. Use `emissive` on a per-part clone only for the held part, or a shader uniform.

### 3.5 Instancing

- `@iwsdk/core` re-exports all of three (`runtime/three.js`: `export * from 'three'`), so `InstancedMesh` and `BatchedMesh` are available. IWSDK also patches `Mesh.prototype.raycast` with three-mesh-bvh `acceleratedRaycast`, and `BatchedMesh` BVH helpers (`runtime/three.js`).
- Scene JSON `pattern` content uses `InstancedMesh` only when the prefab root is a single `Mesh` with no children and no components (`level-scene-object.js:220-247, 345-351`). A GLB instance is a `Group` (`GLTFLoader.js:4428-4436`), so GLB patterns fall back to node clones (shared geometry and material, one draw call each). Instancing from GLB works through `EXT_mesh_gpu_instancing` in the file or a hand-built `InstancedMesh`. A bare `Mesh` or primitive manifest entry also instances.
- Near-grab handles `InstancedMesh` (loops every instance); ray hits are O(instances) unless BVH-accelerated.

### 3.6 Animation clips in GLBs

`AssetManager.getGLTF(id)` returns `{ scene, scenes, animations, ... }` with clips shared by reference. `world.assets.instantiate()` returns only `scene`, so clips are lost on that path. No IWSDK system plays clips. Use `new AnimationMixer(sceneClone)` from three (available via `@iwsdk/core`), kept in one ECS `createSystem` that calls `mixer.update(delta)`. Clip tracks bind by node name, and `SkeletonUtils.clone` keeps names. Mechanical motion should come from the solver, not clips. Use clips for residents and automata only (G0-optional/G1).

### 3.7 Collider options for grab targets

| Option | What IWSDK does | Notes |
|---|---|---|
| Visible meshes in the entity subtree (default) | `OneHandGrabbable`/`TwoHandsGrabbable`: grab pointer is a sphere of radius 0.07 m on the grip space (`pointer-events/dist/pointer/grab.js:5`; IWSDK passes no radius). The sphere is tested against each mesh's geometry bounding box in the mesh's local space (`sphere.js:119-197`), after a bounding-sphere check. Triangle count does not matter for near grab. | Parts closer than about 7 cm compete for the same hand. Leave spacing, or provide a custom `object.spherecast` (supported, `sphere.js:121`). |
| Invisible proxy mesh | Pointer filter requires every ancestor to have `visible === true` (`xr-input/dist/pointer/visibility.js`). Use `material.visible = false`, not `object.visible = false`. | Gives the 1.2 cm minimum radius of `INTERACTION_SPEC.md` §7.2 without enlarging the model. No draw cost. |
| Ray, mouse, poke | Entities with `RayInteractable` or `PokeInteractable` get a BVH built automatically (`input-system.js:194, 283`). `DistanceGrabbable` or `OneHandGrabbable` alone do not. | Dense meshes need this. The desktop fallback in `grab-mode.ts` adds `RayInteractable`, so it is covered. |
| Physics colliders | Off (`physics: false`). | Not needed. |

Cost note: `InputSystem.update` rebuilds the interactable arrays every frame, including a `Set` and `Array.from`, and uses `includes()` (O(n^2)) for distance and two-hand grabbables (`input-system.js` `updateDescendantArrays`). Keep the number of live grabbable entities in the tens, not hundreds, by removing the grab component from parts that are not currently reachable. Non-interactive town geometry is not walked by pointers.

### 3.8 The two GLBs in the repo (measured from the files)

| File | Size | Triangles | Draw calls | Textures (embedded) | Extensions | GPU texture memory (RGBA8 + mips, computed) |
|---|---|---|---|---|---|---|
| `environment/tockton_base_round.glb` | 2.0 MB | 5,792 | 3 | 9: 2 at 1024², 7 at 512² | `KHR_materials_sheen` (velvet only) | about 20 MiB |
| `props/gear_spur_16_brass.glb` | 2.3 MB | 3,872 | 1 | 3 at 1024² | none | about 16 MiB |
| `xr/generic-hand/left.glb` (right is the same) | 93 KB | 2,314 | 2 passes each | 0 | none | negligible |

A 1024² map is 5.33 MiB uploaded, a 512² map 1.33 MiB, a 2048² map 21.3 MiB. The two models total 9,664 triangles and 4 draw calls (3 + 1). The owner's 9,698 triangles and 5 draw calls fit these two plus the contact-shadow quad (remaining 34 triangles presumed, Unverified). The owner's "16 textures" is more than the 12 embedded ones; the difference is presumably the environment map, the contact-shadow texture and lookup textures (Unverified). Hand visuals add 4 more draw calls and about 9.3k triangles (stencil pass plus back-face outline per hand, `animated-hand.js`).

## 4. Spatial facts for table placement

### 4.1 Session features

`iwsdk.config.json` currently requests only `handTracking`. `buildSessionInit` (`core/dist/init/xr.js:40-119`) maps `planeDetection -> 'plane-detection'`, `anchors -> 'anchors'`, `meshDetection`, `hitTest`, `depthSensing`, `layers`, `unbounded`, `gazeTracking -> 'gaze-tracking'` (also offers `'eye-tracking'` as optional). A plain `true` is optional, `{required:true}` is required. `local-floor`, `bounded-floor` and `layers` are always offered as optional (`defaultOffers`). Reference space defaults to `local-floor` then `local` then `viewer` (`xr.js:121-138`). Granted features are in `world.session.enabledFeatures`, which the Playwright test already reads.

### 4.2 Plane detection (raw WebXR, the part the game needs)

| Need | API | Verified in |
|---|---|---|
| Current frame and space | `world.xrFrame` (null outside a frame), `world.xrReferenceSpace` | `world.js:296-309`; `stage.ts:49-51` already uses them |
| Planes | `frame.detectedPlanes: Set<XRPlane>` | `@types/webxr/index.d.ts:744-763` |
| Per plane | `orientation: 'horizontal' \| 'vertical'`, `planeSpace`, `polygon: DOMPointReadOnly[]`, `lastChangedTime`, `semanticLabel?` | same |
| Plane pose | `frame.getPose(plane.planeSpace, referenceSpace)`, then `pose.transform.matrix` | `scene-understanding-system.js` `updatePlanes` |
| Plane size | extents of `polygon` in x and z (IWSDK builds `BoxGeometry(maxX-minX, 0.001, maxZ-minZ)`) | `scene-understanding-system.js` `createPlaneGeometry` |
| Labels in the emulator | `desk, couch, floor, ceiling, wall, door, window, table, shelf, bed, screen, lamp, plant, wall art, global mesh, other` | IWER chunk in `vite-plugin-dev/dist/injection/chunks/injection-template-*.js` |
| Emulator rooms | `sunlit_living_room, home_office, conference_room, open_office, kitchen, bedroom, music_studio, open_studio` (+ legacy names) | `project/types.d.ts` `ProjectEmulatorRoom`; one chunk file per room exists |

IWSDK's optional wrapper: `features.sceneUnderstanding: true` registers `SceneUnderstandingSystem` (priority -1) and the `XRPlane`, `XRMesh`, `XRAnchor` components. It creates one entity per plane and calls `getPose` for every plane every frame for the whole session (`updatePlanes`). That contradicts `TECHNICAL_ARCHITECTURE.md` §6.4 ("no surface work per frame after the choice") unless the system is stopped after the choice (`System.stop()`/`play()` exist in elics 3.4.2, `lib/system.d.ts:65-66`). The simpler route is to read `frame.detectedPlanes` directly for the 2-second window inside `StageSystem.update`, which already runs inside the frame.

Not verified on a device: whether Quest Browser prompts for spatial permission, whether it returns planes when the user has not completed Space Setup, and which `semanticLabel` strings it uses (the emulator has both `table` and `desk`). IWSDK itself has `initiateRoomCapture` commented out ("anchor wiping issue", `scene-understanding-system.js` onSessionStart).

### 4.3 Anchors

- Raw API (`@types/webxr/index.d.ts:586-670`): `frame.createAnchor(new XRRigidTransform(pos, quat), space) -> Promise<XRAnchor>` (only valid inside an active frame), `anchor.anchorSpace`, `frame.getPose(anchor.anchorSpace, space)`, `anchor.requestPersistentHandle()`, `session.restorePersistentAnchor(uuid)`, `session.deletePersistentAnchor(uuid)`, `anchor.delete()`, `frame.trackedAnchors`.
- IWSDK's anchor cannot hold a table pose: `createAnchor` is called with `new XRRigidTransform()` at the reference-space origin, retried at 0.25, 0.5, 1, 2, 5 s, and objects with the `XRAnchor` component are re-parented into one shared `anchoredGroup` (`scene-understanding-system.js` `createAnchor`, `updateAnchoredObject`, `ANCHOR_RETRY_DELAYS_SECONDS`). This answers the open question in ADR-026 / task TP-1: do not use `XRAnchor` for the table. Create a native anchor at the chosen pose from `StageSystem`, then each frame read its pose and move the stage root (a few lines; the stage already moves from a pose in `stage.ts:57-62`).
- `StageSystem` already listens for the reference space `reset` event (`stage.ts:52-55`). For an anchored table a reset should not re-place the stage, only the stand fallback should react.
- Persistent handles are optional per ADR-026 ("keeping it across sessions is not required"). Support in Quest Browser is Unverified.

### 4.4 Hand tracking and gaze

| Need | API | Verified in |
|---|---|---|
| Is hand tracking in use | `world.input.isPrimary('hand', 'left'\|'right')`, `world.input.getPrimaryInputSource(handedness) -> XRInputSource` (has `.hand`) | `input-manager.d.ts`, `xr-input-manager.d.ts` |
| Pinch edge, one frame | `world.input.xr.getSelectState(handedness) -> {start, end, active}` | `xr-input-manager.d.ts`; used by `GrabSystem.update` |
| Pinch strength 0..1 | `world.input.visualAdapters.hand.left.getPinchStrength()`. Constants: commit 0.008 m, open 0.05 m, cooldown 0.2 s (`hand-visual-adapter.js:10, 15, 76`) | `hand-visual-adapter.d.ts:39` |
| Joint poses (wrist twist, open palm) | `inputSource.hand.get('wrist')`, `frame.getJointPose(joint, referenceSpace)`; also `adapter.jointSpaces`, `adapter.jointTransforms` | `@types/webxr:902`, `hand-visual-adapter.d.ts:13-14` |
| Ghost-hand capture | `adapter.capturePose(refSpace) -> Promise<HandPose>` (`{jointName: number[]}`) | `hand-visual-adapter.d.ts:41`, `base-visual-adapter.d.ts:32` |
| Poses | `world.player.head`, `.raySpaces`, `.gripSpaces`, `.indexTipSpaces` (`Group`s) | `xr-origin.d.ts` |
| Grab pointer | sphere r = 0.07 m on grip space; poke: hover 0.2 m, down 0.02 m, click 800 ms (`touch-pointer.js` `TOUCH_DEFAULTS`) | see §3.7 |
| Gaze | `xr.features.gazeTracking` (or `eyeTracking`) registers `GazeSystem` and sets `input.xr.gazeEnabled`. Options: `features.gaze` (`coneAngle` 5°, `dwellWindowSeconds` 0.15, `maxRayLength` 30, ...). Pointer: `world.input.xr.gazePointer`. Eye pose: `world.player.eyeSpace` and `gazeOrigin: 'tracked' \| 'none'`. | `world-initializer.js` `registerFeatureSystems`, `gaze-system.js`, `xr-origin.d.ts` |
| Gaze targets | Explicit list only: `input.xr.gazeCandidates = rayDescendants` (RayInteractable + DistanceGrabbable entities) | `input-system.js:112-116` |
| Emulator gaze | `dev.targetDevicePreview.gazeSimulation: 'head'` | `project/types.d.ts` |

Three interaction facts that shape the design:
1. `OneHandGrabbable` sets `pointerEventsType = {deny:'ray'}` (`grab-system.js:256`) and is not in the gaze candidate list, so gaze-and-pinch cannot target near-grab parts. `DistanceGrabbable` (deny `'grab'`, allow ray) can. Only one grab component per entity takes effect, because the handle is created once (`if (entity.hasComponent(Handle)) return`). Choosing gaze mode therefore means rebuilding the level, which ADR-024 already anticipates.
2. IWSDK gaze is eye-tracking based (it looks for an input source with `targetRayMode === 'gaze'`, `gaze-pointer.js` `findGazeSource`). Meta's developer docs list eye tracking for Quest Pro and Meta VR Glasses only (`developers.meta.com/vr/documentation/unity/move-eye-tracking-overview/`, from a search result; the page was not fetched). Quest 3 and 3S have no eye tracking hardware. A gaze-and-pinch mode that must run on Quest 3/3S needs a head-directed pointer of our own. Unverified on a device.
3. `GrabSystem` grabs on the session `select` event routed as `squeeze` (`grab-system.js` update), not on the adapter's own pinch distance.

## 5. World registry feasibility (current world only, no future worlds in the build)

Feasible. It needs three public primitives and one rule.

Design, using only verified calls:
- `WorldDefinition = { id, level: string, assets: DefinedAssetManifest (all lazy), onEnter?, onExit? }` and a `Map<WorldId, WorldDefinition>`. The competition build registers `tockton` only, by static import.
- `enterWorld(id)`: (1) prefetch the world's critical GLBs in parallel with `AssetManager.loadGLTF(url, key)` (public, no manifest needed, cached by URL); (2) `world.loadLevel(url)`; (3) record the keys loaded.
- `exitWorld(id)`: `await world.loadLevel()` (an empty level, `level-system.js:106-107`) so the old tree is released first and the swap does not hold two worlds; then for each recorded key traverse the cached `gltf.scene`, dispose geometry, materials and textures, then `CacheManager.deleteAsset(key)`; skip the persistent material library; remove the world's sockets, grab components and `GrabFeedbackSystem` entries.
- Keep `persistent: true` entities (player, UI, game state) outside the level so they survive swaps (`world.js:145-188`).

Constraints that decide the shape:
1. The scene JSON can only name assets that were in the manifest at `World.create`. For the competition, the manifest is Tockton's. A future world needs either its own `World.create` (separate build entry) or its lazy manifest merged at creation. Merging lazy entries costs nothing at runtime but puts URL strings in the bundle.
2. Vite copies everything under `public/` into `dist/` (`vite.config.ts: publicDir: 'public'`, confirmed by `dist/assets/models/**`). Future-world GLBs must not live in `public/`. Keep them in a separate source folder that only a non-competition build copies, and add a CI check that fails when `dist/` contains a forbidden world id or folder.
3. `src/assets.ts` is imported by the app and by the IWSDK editor (two realms) and must stay pure. It must import only Tockton's manifest.
4. IWSDK never frees assets (§3.2), so unload is ours. Add a Playwright or console check on `renderer.info.memory.{geometries,textures}` before and after enter/exit.
5. Prefetch in parallel (§3.1: scene loads are serial) and mark only the stand and hands `critical`.
6. Effort: about 200 lines TypeScript plus one unit test for the disposer and the "dist contains no foreign world" check. Add the seam for Tockton only; do not write any second world.

## 6. Performance constraints that affect art

### 6.1 What the measurement says

Owner's number: Intel UHD, 1440x900, 5 draw calls, 9,698 triangles, `MeshPhysicalMaterial` velvet, MSAA, 16 textures: 10 to 12 ms. Half resolution reaches 120+ fps. Removing sheen or normal maps changes little. This matches the repo exactly (§3.8).
- 1440x900 is 1.296 Mpx, so 7.7 to 9.3 ms per Mpx if the device pixel ratio was 1. `render-budget.ts` allows a ratio up to 1.5 (2.9 Mpx), which would give 3.4 to 4.1 ms per Mpx. Which was in force is Unverified.
- Meta's own test for this is the same as yours: lower the render scale; if time improves the app is fragment bound (`webxr-perf-workflow`). Verdict: fragment or bandwidth bound. The data cannot separate shader ALU from texture and MSAA bandwidth, because an integrated GPU shares system memory.
- Hypothesis, not tested: every PBR fragment samples the PMREM environment (`IBLGradient` produces `scene.environment`, `environment-system.js:491`) in addition to its material maps, which cost the same whether or not sheen is present. A direct test is to set `scene.environment = null` for one run.
- Do not scale 10 to 12 ms to Quest. The GPUs differ by an unknown factor. Use the measurement only to rank things.

### 6.2 What is fixed by the stack (code facts)

| Item | Value | Where | Consequence for art |
|---|---|---|---|
| MSAA | 4 samples in XR, no switch | `WebXRManager.js:521`, `world-initializer.js:251` | Edge aliasing is handled; fill and bandwidth pay for it. Fewer, simpler overlapping layers. |
| Foveation | 1.0 (maximum), never changed by IWSDK or this repo | `WebXRManager.js:50-51` | The table sits about 35° below head-forward; fine detail (gear teeth, letter text) may be soft. `renderer.xr.setFoveation(0..1)` is available. Test on device. |
| Framebuffer scale | 1.0; cannot change during a session | `WebXRManager.js:45, 283-296` | `renderer.xr.setFramebufferScaleFactor(0.8..1)` before entering is the Meta-recommended last resort. |
| Multiview | `multiviewStereo: true` (one draw serves both eyes) if the device exposes `OCULUS_multiview` | `world-initializer.js:251`, `WebXRManager.js:492` | Draw calls count once. Whether Quest Browser exposes it is Unverified. The desktop emulator will not exercise this path. |
| AR background | Suppressed, clear alpha 0, so the camera feed shows | `scene-ar-environment.js` | Fill cost is only the pixels our geometry covers. Keep the town compact and avoid large transparent planes. |
| Custom shaders | IWSDK patches `ShaderChunk.common` so multiview compiles; any custom `ShaderMaterial` or `onBeforeCompile` (frozen/awake tint, wake ripple, X-ray) is untested | `runtime/three.js` | Test every custom shader on a real Quest. Do not name a function parameter `viewMatrix`. |
| Post-processing | None, and none is possible without breaking the budget | `CLAUDE.md` §8 | Do desaturation and ripple in the material, not in a pass. |
| Transmission | Any material with transmission adds a full extra opaque render of the scene | `WebGLRenderer.js:1987` | Forbid `KHR_materials_transmission`. Make "warm glass" a plain alpha material. |
| Shader compile | Programs compile on first use | three | Pre-warm all material variants with `renderer.compileAsync(scene, camera)` (exists, `WebGLRenderer.js:1491`) behind the loading screen, to avoid first-appearance hitches in headset. |
| Hands | 4 draw calls (2 passes x 2), about 9.3k triangles, skinned, transparent | `animated-hand.js` | Always present in the budget. |

### 6.3 Concrete budgets

Basis column: **O** official figure from a fetched page, **C** derived from code or file measurement, **J** engineering judgment to be replaced by device data.

| Item | Limit | Basis |
|---|---|---|
| Draw calls per frame, hands and UI included | target 120, ceiling 200 | O: Meta Unity example ranges for Quest 3/3S are 200-300 busy, 400-600 medium, 700-1000 light (`developers.meta.com/horizon/documentation/unity/unity-perf/`, "example ranges, results vary"). J: three on WebGL costs more CPU per call than native; Meta's WebXR page warns that 1000 tiny draws miss 72 fps. |
| Triangles in view | target 300k, ceiling 500k | O: Meta lists 1.3 to 1.8 M for Quest 3/3S (same Unity page, "internally-recommended"). J: we are fill-bound, so use about a quarter of the low end. |
| Mechanical part | 2,000 triangles or fewer (the 16-tooth gear is 3,872) | C: Music Box 12 + Carousel 20 + Windmill 24 + Clock Tower 32 = 88 parts. At 3,872 each that is 341k, over the whole-scene target on its own. Town copies of machines should use a merged shell with only moving parts separate. |
| Material class | `MeshStandardMaterial`; at most 3 `MeshPhysicalMaterial` (velvet and similar) | C: ten `KHR_materials_*` extensions switch the class (§3.3). Blender must not write `ior`/`specular` for ordinary parts. Sheen removal changed little in the owner's test, so this is hygiene, not the main lever. |
| Lights | 1 hemisphere + 1 directional by default, at most 4 point lights at night; none from GLBs | O: Meta WebXR best practices: "limit yourself to one directional light or one point light". C: `GLTFLightsExtension` instantiates lights from files. Note the conflict with the 4-light night allowance in `CLAUDE.md` §8; decide after device test. |
| Shadows | None; contact-shadow blobs only | O: shadow passes count against the draw and triangle budget (Meta WebXR best practices). C: `shadows: false` in the scene. |
| Textures per GLB | None. Shared library only, 1024² maximum, 512² for props | C: §3.4 and §3.8. Eight palette materials x 3 maps at 1024² is 128 MiB uncompressed (5.33 MiB each x 24), about a quarter of that with KTX2 (compression ratio is J). |
| GPU texture total | 128 MiB uncompressed-equivalent | J: no figure for Quest Browser tab memory was found. Unverified. |
| Download | critical 5 MB, first playable (to Music Box) 25 MB, whole game 100 MB streamed | J: no source. Today `dist/` is 7.7 MB, 4.5 MB of it GLBs. ADR-023's 3 MB per hero GLB cannot hold at 190 GLBs without a shared library. |
| Live grabbable entities | 60 | C: per-frame array rebuild and O(n²) `includes` (§3.7). |
| Gameplay JavaScript | 2 ms per system per frame | O: Meta WebXR perf workflow says logic over 2 ms should be optimised; 72 fps is 13.7 ms, 60 fps is 16.6 ms. |
| Residents and characters | 1,500 triangles each, shared skeleton | J: hands are 2,314 triangles each. |
| Spacing of small grabbable parts | 8 cm centre to centre or a custom `spherecast` | C: grab sphere radius 7 cm (§3.7). |

### 6.4 First on-device measurements to take (one hour, needs a Quest)

1. Log `renderer.xr.isMultiview`, `glProjLayer` texture size (eye buffer) and `renderer.info.render.calls/triangles`.
2. Scale test per Meta: `setFramebufferScaleFactor` 1.0 / 0.9 / 0.8, then foveation 0 / 0.5 / 1.0, then `scene.environment = null`.
3. Same scene with the gear GLB's three textures replaced by a shared material (cost of per-GLB textures).
4. Enter with and without a table plane to confirm `detectedPlanes` and its labels.

## 7. Risks, blockers, open decisions

Risks:
1. No Quest hardware: multiview, foveation, plane labels, anchors, hand feel and frame time are all unmeasured.
2. IWSDK is `1.1.0-rc.2`. Treat any API above as pinned to this exact version and recheck after any upgrade.
3. Asset scale: 180 to 200 GLBs with per-GLB textures is impossible on GPU memory (36 MiB for two assets today). Needs the shared material library and probably KTX2.
4. Gaze mode on Quest 3/3S probably lacks eye data (§4.4).
5. Future-world files in `public/` would ship in the competition build (§5).
6. `GrabFeedbackSystem` leak will bite when machines are created and destroyed.
7. External URL strings remain in the bundle (unpkg, jsdelivr, dicebear). They are inactive today (compressed GLBs, Touch controllers and avatars are not used), but a controller user triggers a jsdelivr request (known, ADR-025).
8. XR text and UI technology is undecided. `spatialUI: false` means no `PanelUI`.
9. Critical assets delay the Enter button; scene loads are serial.

Blockers: none for this audit. For the compressed-GLB pipeline there is no optimiser installed (`gltf-transform`, `toktx`) and installing is outside this audit's rules.

Decisions for the lead (ADR text, not owner): allow meshopt and KTX2 with self-hosted decoders; shared material library; amend ADR-023.

## 8. Unverified (explicit list)

Test results (not run). Quest Browser: multiview, eye-buffer size, tab memory, plane permission and labels, persistent anchors, foveation visual effect. Owner measurement device pixel ratio. Hand visual cost on device. Custom-shader multiview behaviour. Quest 3/3S eye tracking absence beyond Meta's doc summary. Whether anything in the build uses the uikit Avatar. The PMREM hypothesis in §6.1. All "J" budgets.

## 9. Sources

Fetched: `https://iwsdk.dev/skill.md`, `https://iwsdk.dev/guides/04-external-assets.html` (priorities, 30 s timeout, no compression or disposal guidance), `https://iwsdk.dev/guides/08-build-deploy.html` (Vite copies `public/` unchanged, no budgets), `https://developers.meta.com/horizon/documentation/unity/unity-perf/` (draw call and triangle ranges), `https://developers.meta.com/horizon/documentation/web/webxr-perf-workflow/` (CPU/GPU/fragment tests, FFR, frame times, 2 ms rule), `https://developers.meta.com/horizon/documentation/web/webxr-perf-bp/` (one light, shadows count, overdraw).
Search results only (page not fetched): Meta eye tracking overview `https://developers.meta.com/vr/documentation/unity/move-eye-tracking-overview/`; Quest 3 per-eye 2064x2208 panel (Wikipedia and press; not used for any budget).
Code read: `node_modules/@iwsdk/core/dist/{asset,level,ecs,init,input,grab,scene-understanding,environment,gaze,runtime,project}`, `@iwsdk/xr-input/dist`, `@iwsdk/scene-composition/dist/validation.js`, `@iwsdk/vite-plugin-dev/dist/index.js` and injection chunks, `three/src/renderers/{WebGLRenderer.js,webxr/WebXRManager.js,webgl/WebGLTextures.js}`, `three/examples/jsm/loaders/{GLTFLoader,DRACOLoader,KTX2Loader}.js`, `@pmndrs/pointer-events/dist`, `@types/webxr/index.d.ts`, `elics/lib`.
