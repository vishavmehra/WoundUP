# Wound Up — World Registry and Loading

**Project:** Wound Up
**Label:** G0-required for the loading and build-check work in section 4 (loading by asset id, parallel prefetch, shared material swap and the `dist/` check; each has a G0 source). The Tockton definition object, the registry, world switching, unloading a whole world, `SaveV2` and the build selection are **G5 Clockwork universe proposals**. Read the scope firewall in [DECISIONS.md ADR-028](DECISIONS.md) first.
**Status:** Design proposal. `src/assets.ts` lists two Tockton GLBs; nothing else described here exists. Nothing is verified on a Quest 3 or Quest 3S.
**Date:** 2026-11-06
**Source:** [directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) multiple-worlds requirement §4, §5, §7, §8, §9 and the world-by-world production strategy; [audit D](audits/D_WEBXR_ARCHITECTURE.md) §3, §5
**Related:** [MASTER_SYSTEM_ARCHITECTURE.md](MASTER_SYSTEM_ARCHITECTURE.md), [SPATIAL_WORLD_SYSTEM.md](SPATIAL_WORLD_SYSTEM.md), [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md), [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md), [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md), [SAVE_PERSISTENCE_SPEC.md](SAVE_PERSISTENCE_SPEC.md), ADR-017, ADR-023, ADR-025, ADR-030 to ADR-035, `MULTI_WORLD_UNIVERSE_DESIGN.md`, `WORLD_PROGRESSION_SYSTEM.md` and `CROSS_WORLD_GAMEPLAY.md` (separate G5 documents)

Citation key: D = [audits/D_WEBXR_ARCHITECTURE.md](audits/D_WEBXR_ARCHITECTURE.md). E, F = audits E and F. TECH = TECHNICAL_ARCHITECTURE.md. DATA = DATA_AND_BLUEPRINT_SPEC.md. SAVE = SAVE_PERSISTENCE_SPEC.md. PS = PRODUCT_SPEC.md.

## Dependencies

- Decisions: ADR-028 (scope firewall), ADR-017, ADR-023, ADR-025, ADR-032 (shared material swap), ADR-033 (asset ids, folders and the `dist/` check) and ADR-034 (budgets).
- IWSDK 1.1.0-rc.2 asset and level behaviour as read in D §3 and §5. Recheck it after any IWSDK upgrade (ADR-016).
- G0 tasks in [MASTER_PRODUCTION_ROADMAP.md](MASTER_PRODUCTION_ROADMAP.md): AF-3 (runtime asset support), AF-4 (move the M0 GLBs), AF-5 (the `dist/` check) and AF-8 (loading policy).
- Code: `src/assets.ts` stays pure (D §5 item 3), and the `GrabFeedbackSystem` cleanup of D §1 is needed before machines are created and torn down.
- Owner decision 4 (shared material library) shapes the swap in section 5. It was accepted on 2026-11-06 (ADR-032) and can still be reversed.
- The G5 proposals depend on the owner approving a second world ([WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) §7) and on a recorded `SaveV2` ADR. Neither exists.

## 1. Scope and labels

| Item | Label |
|---|---|
| Loading by asset id; parallel prefetch and progress; shared material swap; the CI check that keeps other worlds out of the build | G0-required (section 4) |
| Tockton's asset list, level and content reached through one definition object, and no `tockton` literal in shared modules | G5 Clockwork universe: **proposal**. No G0 specification needs it (MASTER_SYSTEM_ARCHITECTURE §7 seam 8 names none). Not scheduled; the lead decides |
| `WorldDefinition` registry with more than one entry, selecting and switching worlds, unloading a world, per-world save records, a build that includes another world | G5 Clockwork universe: **proposal** |

Tockton is the only world for the competition build. Future-world assets are not made before the competition build is stable, except an explicitly approved reusable shared asset that does not delay the submission (ADR-028 rule 4). No second world is approved: which world is second is an open owner question ([WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) §7). This document builds no second world and writes none of its content.

The directive's rules that shape this design:

- Load only the assets one world needs. Do not load all worlds into memory at once. Use progressive loading and unloading (multiple-worlds §4).
- Save progress independently per world, and keep shared player-level progress where appropriate (§4).
- Shared systems stay shared. World-specific mechanics extend the shared engine through documented interfaces (§5; world-by-world strategy).
- Do not duplicate common assets without a documented reason (strategy, "Asset reuse").

## 2. Facts the design rests on

From [audit D](audits/D_WEBXR_ARCHITECTURE.md), read in the installed IWSDK 1.1.0-rc.2. None is run on a device. Recheck after any IWSDK upgrade (ADR-016).

| Fact | Where |
|---|---|
| One asset manifest per `World.create`. `AssetManager.registerManifest` replaces the entry map. `AssetManager.init` clears it. | D §3.1 |
| Scene JSON can name only asset ids that were in the manifest at `World.create`. | D §3.1, §5 |
| `AssetManager.loadGLTF(urlOrKey, key?)` loads and caches by URL with no manifest entry. `AssetManager.getGLTF(key, { shared: true })` returns the cached instance. Both and `CacheManager` are exported from `@iwsdk/core`. | D §3.2, §5; type declarations |
| Scene-driven loading is serial: N lazy GLBs cost N round trips. Prefetch in parallel before the level loads. | D §3.1 |
| Each load has a 30 s timeout (`AssetManager.setLoadTimeout`). | D §3.1 |
| A level change does not free asset GPU memory. Cached glTFs, geometries and textures live for the page's life. `CacheManager.deleteAsset` removes only the map entry and disposes nothing. | D §3.2 |
| `LevelSystem` stages the new level before it disposes the old one, so a swap peaks at both worlds in memory. `world.loadLevel()` with no argument loads an empty level. | D §3.2, §5 |
| Entities marked `persistent` survive level changes (player, interface, game state). | D §5 |
| `Entity.dispose()` frees geometry and materials, including ones other clones share. `disposeGLTFResources` is not exported. Unloading needs our own disposer. | D §3.2 |
| Clones from `instantiate` share geometry and materials. | D §3.1 |
| Vite copies all of `public/` into the build. | D §5 |
| `GrabFeedbackSystem` clones materials per part and never cleans up. | D §1 |

Code today: `src/assets.ts` holds two `critical` GLTF entries and must stay pure because the app and the IWSDK editor both import it (D §5 item 3). `public/scenes/main.iwsdk.scene.json` holds the stage, one gear, lights, an `IBLGradient` and a `ContactShadow`. Hand models load through the asset manager when a hand connects.

## 3. The `WorldDefinition` contract

The directive's interface is "a conceptual contract. Adapt it to the existing TypeScript architecture." The adaptation keeps its fields and applies three rules from the architecture: a definition is plain serialisable data with no Three.js or IWSDK objects (DATA §1, §14); every id it holds must exist in the matching registry or manifest, checked at load (DATA §13); and no list duplicates what another definition already knows.

```ts
// PROPOSAL. Tockton would be its only entry (section 4). Not implemented and not scheduled for G0.

type WorldId = 'tockton';            // widened to a union when the owner approves a second world

interface WorldDefinition {
  id: WorldId;
  name: string;
  description: string;
  theme: string;

  spawn: WorldSpawnConfiguration;
  level: string;                      // scene JSON, resolved with import.meta.env.BASE_URL
  environmentAssets: string[];        // asset ids (ADR-033): stand, ground, props not owned by a building

  buildings: string[];                // building ids; each names its GLBs through visual.assetId
  characters: string[];
  machines: string[];                 // blueprint ids (DATA §5)
  mechanicalSystems: string[];        // solver extension ids (MECHANICAL_ENGINE_V2 §9). Empty for Tockton
  quests: string[];                   // letter ids in G0 (DATA §11)

  audio: string;                      // audio profile id
  progression: string;                // progression definition id (DATA §12)
  budget: WorldPerformanceBudget;
}

interface WorldSpawnConfiguration {
  footprintM: { width: number; depth: number };   // Tockton: 0.60 by 0.40 (PS §3.2, INTERACTION_SPEC §3)
  minScale: number;                                // Tockton: 0.75 (PS §3.2)
}
// WorldPerformanceBudget: the ADR-034 scene rows (draw calls, triangles, GPU texture memory, download).
// A world may declare stricter values and never looser ones without the lead's written exception (ADR-034).
```

How the directive's fields map:

| Directive field | Field here | G0 use |
|---|---|---|
| `id`, `name`, `description`, `theme` | same | `tockton` and its text |
| `spawnConfiguration` | `spawn` | Feeds table placement and town scale ([SPATIAL_WORLD_SYSTEM.md](SPATIAL_WORLD_SYSTEM.md) §5, §11) |
| `environmentAssets` | same | The stand and the town base |
| `buildingDefinitions`, `characterDefinitions`, `machineDefinitions` | `buildings`, `characters`, `machines` | Ids of content definitions. Their GLBs come from each definition's `visual.assetId`, so no asset is listed twice |
| `mechanicalSystems` | same | Empty. Tockton uses the shared engine only |
| `questDefinitions` | `quests` | The letters |
| `audioConfiguration`, `progressionConfiguration` | `audio`, `progression` | Ids of the audio profile and the progression definition |
| `performanceBudget` | `budget` | The ADR-034 rows |

The asset set a world needs is computed, never hand-listed twice: `environmentAssets`, plus the `visual.assetId` of every building, character and machine definition, plus the part assets each machine's blueprint can name. Because loading is by asset id, the gift viewer can load one machine's parts and housing without loading the town (PS §13; DATA §15).

## 4. What G0 needs, and what it does not build

| G0 needs | Reason and source | Cost |
|---|---|---|
| Asset ids equal the file name, the manifest id and the `src/assets.ts` key, with the folders of ADR-033 (`public/assets/models/shared/<family>/` and `public/assets/models/tockton/<family>/`) | A world is a folder; shared parts stay shared (ADR-033) | Decided. The two M0 files move in one lead change when their replacements validate |
| `src/assets.ts` lists Tockton's assets only and stays pure | D §5 item 3 | None |
| Prefetch in parallel with real progress, the stand and hands as the only `critical` assets, shared material swap by name before the first clone, shader pre-warm behind the loading screen | D §3.1, §3.4, §5 item 5, §6.2; ADR-032, ADR-034 (before-Enter budget) | These are G0 needs on their own |
| The CI check that fails the build when `dist/` holds a GLB that is not a G0 manifest entry or a world other than `tockton` or `shared` (section 8) | ADR-033; D §5; F X04 | Owned by the lead |
| Cleanup path in `GrabFeedbackSystem` so building and tearing down machines does not leak | D §1 defect. Machines are created and torn down in G0 | A `disqualify` handler |
| `SaveV1` keeps `version` and an explicit migration function | SAVE §10 | Already required |
| A disposer and the empty-level swap | Build them only if a G0 flow replaces the level (restart chapter, or a gift viewer that uses its own level). D sizes registry plus disposer plus one test at about 200 lines | Decide when those flows are fixed |

G0 does **not** build: a registry holding more than one entry, a world selection interface, `SaveV2` or per-world keys, switching worlds, unloading Tockton on exit, a second world, or a build selection flag.

**Proposal, not G0:** Tockton's level, asset list, blueprints and letters reached through one definition object, with no `tockton` literal in shared modules ([MASTER_SYSTEM_ARCHITECTURE.md](MASTER_SYSTEM_ARCHITECTURE.md) §7 seam 8). No G0 specification needs it. It costs one small module, is not scheduled, and the lead decides whether to build it before a second world is approved.

## 5. Loading a world (proposal for G5; steps 1 to 4 and 6 already apply to Tockton)

Loading uses only calls verified in [audit D](audits/D_WEBXR_ARCHITECTURE.md).

1. **Validate the definition.** A pure function checks every id against the matching registry and the manifest, and rejects any asset that is not G0 when running a competition build. It fails before any network request.
2. **Compute the load set.** `needed(world)` minus `loaded`. The loader keeps a reference count per asset key, so an asset shared by two worlds loads once.
3. **Prefetch in parallel.** `await Promise.all(toLoad.map(id => AssetManager.loadGLTF(url(id), id)))`. Feed `AssetManager.loadingManager` (a three.js `LoadingManager`) into the loading display. Only the stand and the hands are `critical`. Everything else loads after entry (D §5 item 5).
4. **Swap in shared materials.** For each newly loaded GLB, read it with `AssetManager.getGLTF(id, { shared: true })`, replace each proxy material by name with the persistent library material, dispose the GLB's own copy, and mark the GLB as swapped (ADR-032; D §3.4). Do this before the first `instantiate`.
5. **Load the level.** `await world.loadLevel(definition.level)`. How the level's asset ids reach the manifest is the open design question in section 5.1.
6. **Pre-warm.** `renderer.compileAsync(scene, camera)` behind the loading screen so no shader compiles on first appearance in the headset (D §6.2).
7. **Record and start.** Record the keys loaded for this world, restore its save record (section 7) and start its systems.

Budgets: before Enter, 3.0 MB target and 4 MB ceiling with GLBs at most 1.5 MB; each scene loaded after Enter 8 MB target and 12 MB ceiling; whole build 40 MB target and 60 MB ceiling (ADR-034). One slow or failed asset is bounded by the 30 s timeout.

### 5.1 Open design question: how a level names assets

The manifest is fixed at `World.create`, and scene JSON may name only manifest ids (section 2). For Tockton alone this is no problem. For a second world, three options exist. The choice needs a short spike before the second world starts. It is not decided here.

| Option | How | For | Against |
|---|---|---|---|
| A. One `World.create` per world | A separate build entry per world, each with its own manifest | Uses the IWSDK editor scene as designed. Only that world's URLs ship | Switching worlds means a new `World.create`, so persistent entities and the XR session continuity need care |
| B. Merge every world's lazy entries at creation | The manifest holds all worlds' ids, all lazy | One `World.create`. Nothing loads until used | Puts every world's URL strings in the bundle, which conflicts with keeping future worlds out of the competition build. Usable only in a non-competition build |
| C. Build the level in code | `AssetManager.loadGLTF(url, key)` needs no manifest. A TypeScript level builder places the instances | No manifest constraint. Switching is plain code | No editor scene for that world. More code |

Whichever is chosen, the competition build contains Tockton's manifest only.

## 6. Unloading a world (proposal, G5)

IWSDK never frees asset GPU memory, so unload is ours (section 2). Order matters because the new level is staged before the old one is disposed.

1. **Gate.** Switch only from `town` mode. If an assembly is in progress, ask first: in-progress assembly is not saved (SAVE §14).
2. **Flush the save** for this world if it is dirty (section 7).
3. **Stop world systems.** Remove the world's sockets, grab components, `GrabFeedbackSystem` entries, audio nodes, timers and event listeners.
4. **Release the old level first.** `await world.loadLevel()` with no argument, so the old tree is gone before anything new stages. This is what stops a swap from holding two worlds at once.
5. **Dispose what is no longer needed.** `release = outgoing keys − incoming keys − persistent keys`, using the reference counts. For each key in `release`: read the cached glTF, traverse it, call `dispose()` on each geometry; for each material, skip it if it belongs to the shared library, otherwise dispose it and its textures except library textures; then `CacheManager.deleteAsset(key)`. Entities are removed with `destroy()` when their resources are shared with the cache, because `Entity.dispose()` would free the shared ones.
6. **Keep the persistent set.** Hands, the player, the interface, game state, the shared material library, and any shared part GLB that the incoming world also uses.
7. **Verify.** `renderer.info.memory.geometries` and `.textures` after enter, exit and enter again must equal the values after the first enter, over three cycles (D §5 item 4).

The material library is reference counted if two worlds share a material. Its textures never go through the disposer in step 5. The shared-library approach is ADR-032, accepted on 2026-11-06 ([decision 4](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)); if the owner reverses it, ADR-032's fallback of one atlas per machine changes what is shared, and this section's skip rule changes with it.

## 7. Saving per world (proposal, G5)

`SaveV1` is Tockton-only (SAVE §3). The directive wants progress saved independently per world and shared progress kept where appropriate. Multi-world needs `SaveV2` and an explicit migration (SAVE §10; ADR "G" in [audit A](audits/A_DOCUMENTATION.md) §4.2, not yet recorded in [DECISIONS.md](DECISIONS.md)).

Proposed shape: a root record plus one record per world, each under its own storage key.

```ts
// PROPOSAL (G5). SaveV1 stays exactly as specified for G0.
interface SaveRootV2 { version: 2; settings: Settings; lastWorld: WorldId; unlocked: WorldId[] }
// key: woundup.save                       (the existing key)
interface WorldSaveV1 { version: 1; /* the G0 SaveV1 progress fields */ }
// key: woundup.world.<worldId>            (one per world)
```

| Rule | Reason |
|---|---|
| Separate keys give separate failure domains. A corrupted world record resets only that world, after a notice. A corrupted root falls back to defaults and leaves the world records alone. | Independent saving (directive §4); safe loading (SAVE §9) |
| Migration from `SaveV1` writes `woundup.world.tockton` first, then rewrites `woundup.save` as version 2. If the process stops between the two writes, the root is still version 1 and still holds everything, so the migration repeats safely. | SAVE §10: explicit and never silently reinterpreted |
| Restart asks for the second confirmation of SAVE §12 and clears one world's key. A full reset clears every key. | SAVE §12 |
| Player-level progress (settings, unlocked worlds, and later a shared inventory and journal) lives in the root. Whether the daily repair is per world or per player is a progression-design question for `WORLD_PROGRESSION_SYSTEM.md`. | Directive §4, §6 |
| Not saved: asset keys, load state, anchors, coordinates, surfaces or runtime objects. | SAVE §5 |
| Machine, part and letter ids are unique across the universe, so a gift payload needs no world field. | MASTER_SYSTEM_ARCHITECTURE seam 1; DATA §15 |

This document does not define unlock conditions or cross-world effects. Those belong to the progression and cross-world documents.

## 8. Keeping future worlds out of the competition build

| Rule | Detail | Source |
|---|---|---|
| Folders | G0 files live under `public/assets/models/shared/` and `public/assets/models/tockton/`. Every other GLB lives under `assets/future/<world_id>/<family>/`, outside `public/`. | ADR-033 |
| The check | After `vite build`, fail if `dist/` holds a `.glb` that does not map to a G0 entry in `assets/manifest/glb-manifest.json` (G0-required or G0-optional), a path segment naming a world other than `tockton` or `shared`, or a text file that contains the string `assets/future`. | ADR-033; D §5 item 2; F X04 |
| Manifest | Entries under `public/` have `worldId` `shared` or `tockton`. | [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) §8 |
| Code | `src/assets.ts` imports only Tockton's manifest. No other module names a future world. | D §5 item 3 |

**Proposal for when a second world ships:** a post-build step copies the selected world's folder from `assets/future/<world_id>/` into `dist/assets/models/<world_id>/`, driven by an explicit build setting, and the default build copies nothing. The lead then amends ADR-033, the CI check and the label rules, and records how labels change for that world ([WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) §6). World ids use lowercase kebab-case as in WORLD_ASSET_INVENTORY §5 (`brasswater-harbour`); ADR-033 does not fix the case, so the lead confirms it then.

## 9. Switching worlds and the stage (G5 proposal)

States of a world: `unloaded`, `loading`, `ready`, `active`, `unloading`, `failed`. Exactly one world is `active`. Only `unloaded` worlds hold no asset keys beyond the persistent set.

- The stage root and its table anchor belong to the session. A switch keeps them. The incoming world's `spawn` footprint and minimum scale are applied to the already chosen surface ([SPATIAL_WORLD_SYSTEM.md](SPATIAL_WORLD_SYSTEM.md) §11). If it does not fit, the switch is refused with a message. That is an open point.
- Game mode (`town`, `build`, `wind`, `place`, `gift`, `pause`) is per world and starts in `town` on entry.
- The shared mechanical engine, part library, audio engine, interaction system and settings are not reloaded.
- A returning visit restores that world's save record (section 7).

## 10. Failure handling

| Situation | Behaviour |
|---|---|
| Definition or manifest id invalid | Fails in step 1 of section 5, before any request. The current world is untouched |
| An asset fails or times out (30 s) after the old world was released | Offer Retry, or Return, which loads the previous world again. The limitation is stated: once the old level is released, it is not restored automatically |
| A non-critical asset fails | A visible warning in development; the world loads without it only if the definition marks it optional |
| Out of memory risk | The budget per world (ADR-034) is checked at integration (F §6.2), not at runtime |

A faster failure path is possible: warm the browser cache with `fetch` for the incoming critical files before releasing the old world. It is not adopted because whether the browser reuses the warmed files depends on the host's caching headers, which have not been checked. Revisit if load failures are measured.

## 11. Tests (proposal)

| Test | Level |
|---|---|
| `WorldDefinition` validator: unknown ids, a non-G0 asset in a competition build, a missing manifest entry, duplicate asset in two lists | Vitest, node |
| Disposer over a small scene: each geometry, material and texture disposed once; library materials and textures skipped; `deleteAsset` called | Vitest, node |
| Reference counting: an asset used by both worlds is not released | Vitest, node |
| `SaveV2` migration: from `SaveV1`; repeated; stopped between the two writes; corrupted world record isolated | Vitest, node |
| `dist/` foreign-world check: passes on a clean build, fails with a planted future GLB | Build step test |
| Enter, exit and re-enter keeps `renderer.info.memory` constant over three cycles | IWER with the console, Desktop. Not a Quest reading |
| No request outside our origin while loading | Playwright (existing assertion, ADR-025) |

Memory on a Quest, the headset's tab memory limit and decode times are unmeasured and stay Blocked until a tester is named (TP-7).

## 12. Open points

| Point | Owner |
|---|---|
| Option A, B or C for naming assets in a level (section 5.1), by spike | Lead, before a second world starts |
| Which world is second; approval of any early shared asset | Owner decision pending ([WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) §7) |
| ADR "G" (`SaveV2`) recorded in DECISIONS.md | Lead |
| `GrabFeedbackSystem` cleanup | Lead, G0 |
| Material library semantics if ADR-032 changes | Only if the owner reverses decision 4 (accepted on 2026-11-06) |
| World id case, and ADR-033 amendment when the first non-Tockton world ships | Lead |
| Whether the disposer is needed in G0 | Lead, when the restart and gift-viewer flows are fixed |
| Whether Tockton gets a definition object before a second world is approved (seam 8 has no G0 source) | Lead, as a proposal |

## 13. Acceptance criteria

1. Tockton is the only world defined, and no second world's content, asset list or file exists.
2. Every field of the directive's `WorldDefinition` is mapped or deliberately merged, and no id is listed twice.
3. Every IWSDK call named is one the audit verified in the installed version; unverified behaviour is marked.
4. Section 4 lists exactly what G0 builds, and every item cites a G0 source.
5. The competition build contains no GLB that is not a G0 manifest entry, checked by section 8.
6. Memory counts, device memory and decode time are not claimed anywhere.
7. All G5 material is labelled proposal.
