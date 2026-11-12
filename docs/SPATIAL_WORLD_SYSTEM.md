# Wound Up — Spatial World System

**Project:** Wound Up
**Label:** G0-required for sections 2 to 9 (table detection, anchoring and the stand fallback, per ADR-026 and ADR-019). Section 10 (cross-session anchors) is a **proposal** labelled G1 Living Tockton ("improved spatial persistence", directive Part 10) and Research. Section 11 (worlds and the stage) is a **proposal** labelled G5 Clockwork universe. Read the scope firewall in [DECISIONS.md ADR-028](DECISIONS.md) first.
**Status:** The stand is built (Desktop and IWER verified). Table choice and anchoring are planned (BUILD_ROADMAP Phase 2A, tasks TP-1 to TP-5) and not built. Nothing is verified on a Quest 3 or Quest 3S.
**Date:** 2026-11-06
**Source:** [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §3.2, [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) §6.4, ADR-019, ADR-020, ADR-026, [INTERACTION_SPEC.md](INTERACTION_SPEC.md) §3, [audit D](audits/D_WEBXR_ARCHITECTURE.md) §4
**Related:** [MASTER_SYSTEM_ARCHITECTURE.md](MASTER_SYSTEM_ARCHITECTURE.md), [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md), [SAVE_PERSISTENCE_SPEC.md](SAVE_PERSISTENCE_SPEC.md) §4.1 and §5, [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) (TBL-01 to TBL-18, STAND-01 to STAND-05), [BUILD_ROADMAP.md](BUILD_ROADMAP.md) §5A, [IDEAS.md](IDEAS.md) §4.8

Citation key: D = [audits/D_WEBXR_ARCHITECTURE.md](audits/D_WEBXR_ARCHITECTURE.md). TECH = TECHNICAL_ARCHITECTURE.md. PS = PRODUCT_SPEC.md. IS = INTERACTION_SPEC.md.

This document does not restate the product behaviour of PS §3.2 or the architecture rules of TECH §6.4. It adds the design they leave open: the frames, the decision pipeline as a state machine, the exact IWSDK and WebXR calls to use, the failure handling, the evidence each behaviour can reach, and the proposals for later generations. Where the specs give a number, the number is theirs. Where this document proposes one, it says so.

## Dependencies

- Specifications: [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §3.2; ADR-019 (XR entry and the stand), ADR-020 (stage root and units), ADR-026 (table placement is core); [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) §6.4; [INTERACTION_SPEC.md](INTERACTION_SPEC.md) §3.
- IWSDK 1.1.0-rc.2 behaviour as read in [audit D](audits/D_WEBXR_ARCHITECTURE.md) §4. Recheck it after any IWSDK upgrade (ADR-016).
- Tasks: [BUILD_ROADMAP.md](BUILD_ROADMAP.md) Phase 2A, TP-1 to TP-5 (anchor path, suitability logic, recentre behaviour, a real-device test) and TP-7 (a named Quest tester; [owner decision 2](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)). Hardware items stay Blocked until TP-7 is met.
- Assets: the stand `tockton_base_round` and the town ground `town_ground` in `assets/manifest/glb-manifest.json`. The ground footprint and plot positions are open (gap G-07).
- Save: [SAVE_PERSISTENCE_SPEC.md](SAVE_PERSISTENCE_SPEC.md) §4.1 and §5 decide what, if anything, persists about the placement.
- Sections 10 and 11 are proposals and depend on the scope firewall ADR-028; nothing in them is scheduled.

## 1. Scope and labels

| Item | Label |
|---|---|
| Detect real horizontal surfaces in `immersive-ar`, choose one table once per session, anchor Tockton to it, scale the town to fit | G0-required (ADR-026, PS §3.2, F1) |
| Floating stand as fallback, and as the only presentation in `immersive-vr` and the desktop preview | G0-required (ADR-019, ADR-026) |
| Keep the table anchor across sessions | Proposal, G1 and Research (section 10). Not required in G0 (ADR-026; SAVE §4.1) |
| Hosting different worlds under the stage root | G5 Clockwork universe, proposal (section 11) |

The game reads only the surfaces the headset reports. It never reads camera images and does no computer vision (CLAUDE.md §14, ADR-026).

## 2. Frames, units and the stage root

Conventions are those of ADR-020: metres, right-handed, +Y up, -Z forward, origin on the floor under the player (`local-floor`). Furniture and stands have their origin at the centre of the floor-contact face.

```text
XR reference space (local-floor)
  └─ anchor space (table path)   or   eye-relative pose at placement (stand path)
       └─ stage root  [origin on the surface, turned to face the player, unscaled]
            ├─ town group   [uniform scale s: trunk, buildings, plots, placed machines]
            └─ workbench group [scale 1: workbench, parts, the machine being built]
```

- The stage root is the only node that moves for placement. Trunk, town and workbench live under it (ADR-020; TECH §6.4). Town and interaction code read it and never detect surfaces.
- Town scale `s` applies to town content only (IS §3). The workbench, its parts and the machine being built always stay full size. A machine takes the town's scale as it settles on its plot (IS §3). Hand targets do not shrink: colliders and snap radii stay in real centimetres.
- In the code today the stage root is the scene node `stage` (`STAGE_NODE_ID` in `src/stage.ts`, defined in `public/scenes/main.iwsdk.scene.json`), moved by `StageSystem`. The `town` and `workbench` groups arrive with the town and workbench work. This document fixes their purpose, not their node names.
- Nothing about a surface, an anchor or `s` enters `woundup.save` (SAVE §4.1, §5).

## 3. Session features

| Rule | Detail | Source |
|---|---|---|
| Request `planeDetection` and `anchors` as optional features | A plain `true` in `world.xr.features` is optional, so the session never fails because of them. `iwsdk.config.json` currently requests only `handTracking`. Adding the two is task TP-1. | ADR-026; D §4.1 |
| Request nothing else | No mesh detection, hit-test, depth or `gazeTracking` | ADR-019, ADR-036 |
| Keep `features.sceneUnderstanding` `false` | IWSDK's wrapper creates an entity per plane and calls `getPose` for every plane every frame for the whole session, and its anchor sits at the reference-space origin | D §4.2, §4.3 |
| Know what was granted | `world.session.enabledFeatures` lists the granted features (the Playwright test already reads it). Missing `plane-detection` or `anchors` means the stand | D §4.1 |
| Feature-detect the calls | `frame.detectedPlanes`, `frame.createAnchor` and the anchor persistence members are optional in `@types/webxr`. Reading `detectedPlanes` outside an active frame throws `InvalidStateError`, so read it only inside the system's `update` with `xrFrame` set | `@types/webxr` |

## 4. The placement decision as a state machine

One decision per session (TECH §6.4). The states below are the logical model. The lead may implement them with a different shape if the behaviour is the same.

| State | Entered when | Work done | Leaves when |
|---|---|---|---|
| `Idle` | No immersive session | None. The authored stand pose shows in the 2D preview | A session starts |
| `AwaitingPose` | Session start | None | The first tracked head pose exists (`getViewerPose` non-null) |
| `Collecting` | `immersive-ar` only, first tracked pose | Each frame, read `frame.detectedPlanes` and keep the horizontal surfaces with their pose and polygon | The window ends (at most about 2 seconds, PS §3.2) |
| `Choosing` | Window ended | Pure function over the collected surfaces and the head pose (section 5), run once | A surface is chosen, or none is |
| `Anchoring` | A surface was chosen | Create the anchor (section 6) | The anchor exists, or all attempts fail |
| `PlacedTable` | Anchor exists | Stage root follows the anchor pose each frame. Stand hidden. Contact shadows lie on the table | Session ends |
| `PlacedStand` | Immersive VR, desktop session, features not granted, no surface list, no suitable surface, or anchoring failed | Place the stand once from the eye position (section 7) | Session ends |

Transitions the spec forbids or requires:

- `PlacedTable` ignores the headset menu, visibility changes, tracking loss, the platform updating or losing the plane, and recentring the view. The town does not move and no second choice is made (PS §3.2; TBL-08).
- `PlacedStand` ignores the headset menu. A recentre places the stand again from the new eye position and nothing else (ADR-019; STAND-04).
- Ending the session and entering again starts at `Idle` and makes a new choice. Progress is intact (TBL-09).
- `immersive-vr` and the desktop preview go straight to `PlacedStand` and never choose a surface (TBL-12).
- Failure at any step is silent: no error message and no extra step (PS §3.2; TBL-06, TBL-07, TBL-15).

Per-frame cost: `Collecting` reads a handful of planes for at most about 2 seconds. After that the only per-frame spatial work is one `getPose` on the anchor to move the stage root. That is the minimum the anchor needs, not surface processing, and it is consistent with TECH §6.4 ("no surface work per frame after the choice") and with the 60 FPS floor, which TBL-18 measures on a headset.

## 5. Suitability, scale and ranking (pure logic)

This runs in `src/placement.ts` as pure functions with named constants, unit-tested without WebGL (TECH §6.4; task TP-2; TBL-01 to TBL-04). Only `standPose` exists today. The numbers below are PS §3.2's starting values and are tuned on a real Quest.

### 5.1 Inputs

```ts
// PROPOSAL for TP-2. Metres, reference-space coordinates. Not implemented.
interface SurfaceInfo {
  orientation: 'horizontal' | 'vertical';      // XRPlane.orientation
  label: string | undefined;                   // XRPlane.semanticLabel, platform-defined
  origin: Vec3Like;                            // from frame.getPose(plane.planeSpace, referenceSpace)
  levelness: number;                           // how close the plane normal is to +Y
  polygon: ReadonlyArray<{ x: number; z: number }>;  // XRPlane.polygon, in the plane's own XZ frame
}
// head: eye position and horizontal forward direction, taken once from player.head
```

Plane identity is not stable across reports, so no decision uses an id or the report order (TBL-04).

### 5.2 Rules (PS §3.2)

| Check | Rule |
|---|---|
| Horizontal, at table height | Level and facing up. Not the floor. About 20 to 60 cm below the eyes |
| Within seated reach | The town centre is about 40 to 60 cm horizontally from the eyes and within about 35 degrees either side of the facing direction |
| Large enough | The town footprint of 60 × 40 cm (IS §3), scaled evenly by `s` with `0.75 ≤ s ≤ 1`, lies wholly on the surface. The town never grows above full size |
| Aim point | About 55 cm straight ahead, the same distance as the stand |
| Preference | A surface the platform labels `table` or `desk`; then the surface whose placement is closest to the aim point. The same surfaces always give the same choice |

No specification gives a level tolerance, a label list beyond `table` and `desk`, or how to treat unknown labels. The lead sets a named constant for the level tolerance in TP-2. A label equal to `floor` is rejected in addition to the height band. Other labels do not reject a surface, because the specs say only what PS §3.2 says.

### 5.3 Proposed method (for TP-2 to confirm)

1. **Fit test on the polygon, not the bounding box.** IWSDK builds its display plane from the polygon's x and z extents (D §4.2), which over-estimates an L-shaped or round table. Test the rotated footprint rectangle against the polygon: all four corners inside, and no polygon edge crossing the rectangle. The test is exact and small. (Unverified: that Quest returns polygons richer than a rectangle.)
2. **Scale first, then position.** For `s` from 1.00 down to 0.75 in steps of 0.01, look for any allowed centre where the footprint fits. Take the first `s` that has one. A larger town is preferred over a closer one. If no `s` fits, the surface is unsuitable. Quantised `s` avoids jitter and makes the result reproducible (TBL-03).
3. **Position.** Among allowed centres at that `s`, take the one nearest the aim point. Candidates are the points of a 2 cm grid inside the allowed annular sector (40 to 60 cm, 35 degrees either side), which is a few hundred points per surface. Ties go to the smaller x, then the smaller z.
4. **Rank surfaces.** Sort by label preference, then distance of the best centre from the aim point rounded to 1 mm, then larger `s`, then the centre's x and z. Report order never enters the key.
5. **Yaw.** Turn the stage so its front faces the head along the horizontal line from the town centre to the eyes (PS §3.2: "turned to face the player").

All of it uses basic arithmetic and no randomness. It runs once per session, so cost is not a concern.

## 6. Anchoring

Use the raw WebXR calls. IWSDK's `XRAnchor` component cannot hold a table pose: it creates one anchor at the reference-space origin and re-parents objects to a shared group (D §4.3). This answers the open question in ADR-026 and task TP-1.

| Step | Call | Notes |
|---|---|---|
| Create | `frame.createAnchor(new XRRigidTransform(position, orientation), referenceSpace)` inside the active frame | Returns a promise. Valid only during a frame. The pose is the chosen centre on the surface with the yaw of 5.3 step 5 |
| Follow | Each frame `frame.getPose(anchor.anchorSpace, referenceSpace)`; set the stage root pose from it | If the pose is `null` (tracking lost) or the anchor has left `frame.trackedAnchors`, keep the last pose. The town must not move (TBL-08) |
| Recentre | Ignore the reference-space `reset` event on this path | The anchor is expressed in the new reference space, so a table-anchored town stays on its table. `StageSystem` already listens for `reset`; for the table path the handler does nothing |
| End | `anchor.delete()` when the session ends | |

The pose read from the anchor places the stage root, and the town scale `s` is applied to the `town` group only.

Starting values and policy for the lead to settle in TP-1 and TP-3 (proposals, tested first in IWER, then on a headset):

- **Reveal after the anchor exists.** Create the anchor at the moment of the choice and reveal the town when it resolves. The pose is identical, so there is no jump. If the promise rejects, retry after 0.25 s and 0.5 s (the first two of IWSDK's own retry delays, D §4.3). If it still fails, use the stand. Showing the town first and moving it to the stand after a failure would be a visible jump, so the town is not shown until the anchor holds.
- **Early choice.** PS §3.2 says to collect for at most about 2 seconds. Choosing as soon as the reported set stops changing would shorten the wait but makes the choice depend on arrival timing. The default is to wait for the window. An early exit needs a rule that cannot change the choice, decided with the TBL-05 room results.

## 7. The stand fallback

Already built and tested (Desktop and IWER verified; `src/placement.ts`, `src/stage.ts`, STAND-01 to STAND-04). Facts the other documents rely on:

| Item | Value | Source |
|---|---|---|
| Position | `STAND_AHEAD_M` = 0.55 m ahead, `STAND_BELOW_EYE_M` = 0.38 m below the eyes, both measured from the eye position and the level facing direction when the stand is placed | ADR-019; `src/placement.ts` |
| Angle | About 35 degrees below a level head-forward | PS §3.2; IS §3 |
| When placed | Once, at the first tracked head pose in `immersive-vr`, or when the choice falls back in `immersive-ar` | ADR-019 |
| Re-placed | On recentring the view, from the new eye position. Not by the system menu | ADR-019; STAND-04 |
| Shown | Always in `immersive-vr` and the desktop preview. Hidden on the table path | ADR-026; PS §3.2 |

Both distances are named constants and the tuning knobs once a tester reports on comfort (STAND-05, Blocked).

## 8. Failure modes

| Situation | Result | Test |
|---|---|---|
| `planeDetection` or `anchors` not granted, or the call is missing from the browser | `PlacedStand` | TBL-06 |
| `detectedPlanes` empty or undefined at the end of the window | `PlacedStand` within about 2 seconds of the first tracked pose | TBL-07 |
| All surfaces rejected (vertical, floor, above the eyes, out of reach, too small) | `PlacedStand` | TBL-02 |
| Anchor creation fails after retries | `PlacedStand`, nothing shown on the table first | TBL-06 |
| Platform updates or removes the chosen plane after the choice | Nothing changes. The town holds its anchored pose | TBL-08 |
| Headset menu, tracking loss, recentre | `PlacedTable`: nothing moves. `PlacedStand`: only a recentre re-places the stand | TBL-08, STAND-04 |
| User declines the permission, if the platform asks | As the first row | TBL-15 |
| Session ends and restarts | New choice, progress intact | TBL-09 |

## 9. Evidence each behaviour can reach

| Behaviour | Unit (Vitest) | IWER with the built-in rooms | Quest Browser | Physical Quest 3 or 3S |
|---|---|---|---|---|
| Stand pose and re-placement | STAND-01. Built; unit-verified per [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §2 | STAND-02 to STAND-04. Built; IWER-verified per the same row | Blocked | STAND-05. Blocked |
| Surface suitability, ranking, scale | TBL-01 to TBL-04. Not built | | | |
| Choice, fallback and anchor logic in a session | | TBL-05 to TBL-12 across the eight rooms. Not built | Blocked | TBL-13 to TBL-18. Blocked |

The IWER rooms are `sunlit_living_room`, `home_office`, `conference_room`, `open_office`, `kitchen`, `bedroom`, `music_studio`, `open_studio`. Their planes use the labels `desk`, `table`, `couch`, `floor` and others (D §4.2). **Emulated planes prove logic and fallback only. They are not evidence of real-world plane detection** (TECH §6.4, §21.4). Anything labelled "table detected on a Quest" needs a physical Quest 3 or Quest 3S record (TBL-13 to TBL-18) and stays Blocked until a tester is named (TP-7, [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) decision 2).

Unverified on any device (D §4.2): whether Quest Browser asks for a spatial permission; whether it returns planes when the user has not finished Space Setup; which `semanticLabel` strings it uses; whether recentring fires the reference-space `reset` event as ADR-026 assumes; whether anchor tracking survives a headset menu and tracking loss; whether polygons are richer than rectangles; support for persistent anchors.

Proposed additions to the acceptance owner (not tests today): a polygon test with an L-shaped surface that the bounding box would accept and the exact test rejects; a test that shuffling the surface list leaves the choice and the centre identical to the millimetre.

## 10. Proposal: returning to the same table (cross-session anchors)

**Label:** G1 Living Tockton (improved spatial persistence, directive Part 10) and Research. [IDEAS.md](IDEAS.md) §4.8 records it as **Proposed**, to be tested on a real Quest first. **It is not part of G0.** G0 must not depend on it, and must not store an anchor handle (ADR-026; SAVE §4.1, §5).

**Mechanism** (the raw WebXR members exist in `@types/webxr`; Quest Browser support is Unverified, D §4.3): `anchor.requestPersistentHandle()` returns an opaque string; `session.restorePersistentAnchor(handle)` returns the anchor in a later session; `session.deletePersistentAnchor(handle)` removes it.

**Design if approved:**

1. **Where the handle lives.** Not in `woundup.save`, which holds no coordinates, surface data or anchor handles (SAVE §4.1, §5). Use a separate local-storage key, for example `woundup.anchor`, with a version, the handle and nothing else. This follows the pattern IWSDK itself uses for its own anchor id (`iwsdk_scene_anchor_uuid`, SAVE §4.1). Adding it needs an ADR that amends SAVE §4.1 and §5 ("G" in [audit A](audits/A_DOCUMENTATION.md) §4.2).
2. **Restore flow.** At session start, if a handle exists, try to restore it with a short timeout. On success the stage root takes the restored anchor and the surface choice is skipped. On failure, delete the stale handle, run the normal choice (sections 4 to 6) and request a new handle for the new anchor.
3. **It never blocks play.** Every failure path ends in the normal G0 path.
4. **Privacy.** The handle is an opaque, device-local id with no coordinates. "Restart progress" (SAVE §12) clears the key. A player-facing "forget this table" action is part of the proposal.
5. **Evidence.** It needs Quest Browser and physical-device evidence of a restore across sessions and a browser restart. It cannot be verified in IWER.
6. **Out of scope here:** sharing an anchor between devices for cooperative play (G5). No source in the repository describes a supported way to do it.

## 11. Worlds and the stage (G5 proposal)

The stage root, and its anchor, belong to the session, not to a world. A future world mounts under the same stage root, so switching worlds keeps the table choice and the anchor ([WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) §9). What a world contributes to placement is its footprint and its minimum scale, which Tockton sets to 60 × 40 cm and 0.75 (PS §3.2). The proposed carrier is the world definition's spawn configuration ([WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) §3). The suitability functions of section 5 take the footprint and minimum scale as parameters instead of reading Tockton's constants, which costs nothing in G0.

Open for G5: what happens if the next world's footprint does not fit the already chosen surface at its minimum scale (refuse the switch with a message, or choose again).

## 12. Open points for the lead

| Point | Needed by |
|---|---|
| Polygon test versus bounding box; the proposed tie-break order; the `s` scan and grid step | TP-2 |
| Level tolerance constant; treatment of unknown labels | TP-2 |
| Anchor retry policy and reveal-after-anchor; early choice | TP-1, TP-3 |
| Whether `reset` fires on recentre in IWER and on a Quest | TP-3, TBL-08, TBL-14 |
| Nodes for the `town` and `workbench` groups under the stage root | Town and workbench work |
| A named Quest tester and date | TP-7. Owner decision pending ([decision 2](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)) |

## 13. Acceptance criteria

1. Every threshold in sections 5 and 7 equals PS §3.2, IS §3 or ADR-019. Every method detail added here is labelled a proposal.
2. The table path uses raw WebXR for planes and anchors, not IWSDK's `XRAnchor` or scene-understanding wrapper, and does no surface work per frame after the choice.
3. The state machine in section 4 covers every case in TBL-06 to TBL-09 and TBL-12.
4. No coordinates, surface data, anchor handle or scale enters the save.
5. The evidence table separates unit, IWER, Quest Browser and physical Quest 3 and 3S, and claims nothing about hardware.
6. The cross-session proposal is labelled G1 and Research, is not required by any G0 test, and names the ADR it needs.
