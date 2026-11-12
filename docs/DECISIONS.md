# Wound Up — Architecture and Product Decisions

**Project:** Wound Up  
**Purpose:** Maintain a durable record of important project decisions.  
**Status:** Living document  
**Internal completion deadline:** November 18, 2026 (IST)

## 1. Purpose

This document records decisions that affect the product, architecture, technology, scope, and development process.

The goal is to prevent repeated discussions and contradictory implementation choices.

A decision should be recorded when it:

- Changes product scope.
- Establishes an architecture contract.
- Selects a technology.
- Changes a shared interface.
- Introduces a dependency.
- Changes the asset pipeline.
- Changes deployment.
- Alters a deadline or milestone.
- Resolves a meaningful trade-off.

Minor implementation details do not need an architecture decision record.

## 2. Decision status

Use these statuses:

- Proposed.
- Accepted.
- Rejected.
- Superseded.
- Deferred.

A proposed decision is not an approved implementation requirement.

Only accepted decisions should be treated as current project rules.

## 3. Decision record format

Use this template for new decisions:

```text
## ADR-XXX — Decision title

Date:
Status:
Owner:

Context:
What problem or question needs a decision?

Options:
What alternatives were considered?

Decision:
What was selected?

Reason:
Why was this selected?

Consequences:
What does this decision enable or constrain?

Affected documents:
Which specifications must be updated?

Verification:
How will the decision be validated?
```

## 4. Accepted product decisions

### ADR-001 — Product identity

**Status:** Accepted

**Decision:** The product is named Wound Up and its world is named Tockton.

**Reason:** The project needs a distinctive identity and a coherent fictional setting.

**Consequences:** Product documentation, branding, repository description, and demo material must use these names consistently.

### ADR-002 — Core gameplay concept

**Status:** Accepted

**Decision:** Wound Up is a seated, hands-first miniature clockwork building game.

**Reason:** The physical assembly of small mechanisms is the central interaction and differentiator.

**Consequences:** Gameplay must prioritise direct manipulation, clear mechanical feedback, and comfortable seated play.

### ADR-003 — Quest-first platform

**Status:** Accepted

**Decision:** Target Meta Quest 3 and Quest 3S through WebXR.

**Reason:** The project is intended for the Meta VR competition and should be designed around standalone headset constraints.

**Consequences:** Performance, hand tracking, spatial layout, and browser compatibility must be considered throughout development.

### ADR-004 — WebXR delivery

**Status:** Accepted

**Decision:** Use a public HTTPS web deployment, with Vercel (owner decision, 2026-11-05) as the hosting target.

**Reason:** The project should be accessible through a public playable URL without requiring a native application installation.

**Consequences:** Asset paths, build configuration, and deployment must support the repository's hosting path.

### ADR-005 — IWSDK framework

**Status:** Accepted

**Decision:** Use IWSDK 1.x as the primary WebXR framework.

**Reason:** It is the selected framework for the project.

**Consequences:** All framework APIs must be verified against the installed version. Do not invent APIs or assume compatibility with other frameworks.

### ADR-006 — TypeScript

**Status:** Accepted

**Decision:** Use TypeScript for game logic and application code.

**Reason:** Strong typing supports the mechanical solver, blueprint contracts, and parallel development.

**Consequences:** Maintain strict type checking and avoid unnecessary `any`.

### ADR-007 — Blender hero asset pipeline

**Status:** Accepted

**Decision:** Use Blender as the primary tool for major 3D hero assets.

**Reason:** The game requires a coherent, high-quality handcrafted visual identity.

**Consequences:** Hero assets must have editable source files and optimised GLB exports. Procedural geometry may be used for repeated mechanical components when appropriate. Amended by ADR-031 (2026-11-06): mechanical parts are parametric Blender GLB families, not TypeScript geometry.

### ADR-008 — Pure TypeScript mechanical solver

**Status:** Accepted

**Decision:** The mechanical solver must be independent of rendering and WebXR.

**Reason:** Mechanical correctness must be deterministic and testable without a browser or headset.

**Consequences:** No Three.js or IWSDK imports in the solver.

### ADR-009 — No rigid-body simulation for mechanisms

**Status:** Accepted

**Decision:** Mechanical machine behaviour is calculated through deterministic graph relationships and authored motion profiles, not a full rigid-body physics simulation.

**Reason:** The mechanisms have defined behaviour and need predictable results on standalone Quest hardware.

**Consequences:** Solver output drives animation and machine presentation.

### ADR-010 — Local persistence

**Status:** Accepted

**Decision:** Use localStorage for game progress.

**Reason:** The game does not require accounts, a backend, or cloud persistence.

**Consequences:** Save data must be validated and must have a memory fallback when storage is unavailable.

### ADR-011 — URL-based gifting

**Status:** Accepted

**Decision:** Share one completed machine through a compressed URL payload.

**Reason:** A shareable machine is a distinctive product feature that does not require backend infrastructure.

**Consequences:** Gift payloads must be compact, validated, versioned, and independently viewable.

### ADR-012 — Desktop fallback

**Status:** Accepted

**Decision:** Provide a desktop preview and development interaction path.

**Reason:** The developer does not have a Quest headset and requires a practical way to build and verify the game.

**Consequences:** Desktop input must use the same gameplay rules as the XR experience. Desktop tests must not be represented as hardware validation.

### ADR-013 — No backend in the shipped gameplay loop

**Status:** Accepted

**Decision:** Do not add backend services, accounts, databases, AI calls, analytics, or multiplayer.

**Reason:** These are not required for the approved experience and would add delivery risk.

**Consequences:** Keep the application static and self-contained.

### ADR-014 — Seated hands-first interaction

**Status:** Accepted

**Decision:** The complete core gameplay loop must be usable while seated and without controllers.

**Reason:** Comfort and direct manipulation are fundamental to the experience.

**Consequences:** Keep interactions within the specified comfortable reach and provide gaze-and-pinch accessibility.

### ADR-015 — Internal completion deadline

**Status:** Accepted

**Decision:** Complete the project by November 18, 2026, before midnight IST.

**Reason:** The internal deadline provides a buffer before the competition deadline listed on the supplied page.

**Consequences:** Code freeze is targeted for November 16. Do not plan to finish at the official deadline.

### Milestone M0 decisions (lead, 2026-11-05)

These were taken while building M0 (working WebXR foundation). They resolve the gaps listed in `AUDIT_DOCS.md` §4. **Status: Accepted by the lead for M0; the project owner may overrule any of them (section 8).**

### ADR-016 — IWSDK version pin

**Decision:** Pin `@iwsdk/core`, `@iwsdk/cli` and `@iwsdk/vite-plugin-dev` to exactly `1.1.0-rc.2` (the npm `latest` tag on 2026-11-05; Three.js comes from `super-three@0.185.0`).

**Reason:** `1.1.0-rc.2` (published 2026-10-23) is the first line containing the "hand pinch-to-grab" fix and CLI-driven emulated hands (upstream commits of 2026-10-22), both central to a hands-first game developed without a headset. The only stable alternative is `1.0.1` (2026-10-01, Three 0.181).

**Consequences:** It is a release candidate. If a blocking defect appears, downgrade to `1.0.1` (change the three pins and `three`/`@types/three` overrides, then re-run the tests); record the reason here. Re-check for `1.1.0` stable before the code freeze. `@iwsdk/create@1.1.0-rc.2` has no `--ai-tools` flag, ignores `--no-locomotion` for the AR target, and writes coding-agent files (skills, rules, MCP settings) by default, so the starter was generated in a scratch directory and merged by hand.

### ADR-017 — Layout and entrypoint

**Decision:** Follow the IWSDK starter layout: `iwsdk.config.json` is the project authority, `src/index.ts` is the application entrypoint and carries the "main entry" ownership that CLAUDE.md §10 calls `src/main.ts`, scene composition lives in `public/scenes/*.iwsdk.scene.json`, models are registered in `src/assets.ts`. Blender sources live in `blender/{source,scripts,exports,previews}`; runtime models in `public/assets/models/{environment,props,machines,buildings,characters}`. `References/` (about 68 MB of AI-generated boards) is a working folder: it is never copied into `public/` or the Vercel deployment artifact.

**Reason:** CLAUDE.md §9/§10 and TECHNICAL_ARCHITECTURE §4 / ART_ASSET_PIPELINE §6, §15 disagree; the latter two describe what a static host serves, and TECHNICAL_ARCHITECTURE §4 tells us to adapt to the starter. Domain folders (`src/sim`, `src/parts`, `src/interaction`, `src/town`, `src/audio`) keep the CLAUDE.md §10 names when those phases start.

**Consequences:** Update CLAUDE.md §9/§10 after owner approval. Parallel agents get exclusive directories before they start. The model folder list is amended by ADR-033 (2026-11-06).

### ADR-018 — Tooling and scripts

**Decision:** npm with a committed `package-lock.json`; scripts `dev`, `build`, `preview`, `typecheck` (`tsc --noEmit`, strict), `lint` (ESLint 10 flat config + typescript-eslint), `test` (Vitest), `test:e2e` (Playwright). Not installed on purpose: `@meta-quest/metavr` (collects usage data; dev-only, unnecessary), `@iwsdk/reference` (semantic search CLI pulling an ONNX runtime and model download; typings and the official docs are enough for now), and the IWSDK-generated Claude/Codex/Cursor skills, rules and MCP settings (new agent tooling needs owner approval; their text is reference material read from a scratch scaffold).

**Reason:** CLAUDE.md §18 requires lint; no doc names a tool. Telemetry-free, minimal dependency set.

**Consequences:** To enable the official IWSDK agent skills and MCP servers later, run the scaffolder in a scratch directory and copy the skills across, or `npx @iwsdk/cli adapter sync` once approved.

### ADR-019 — XR entry and feature policy

**Decision:** The landing page's Enter action follows PRODUCT_SPEC §3.1: `immersive-ar` if supported, else `immersive-vr`, else the desktop 3D preview. Sessions are started only from a user action: the landing button calls IWSDK's `world.launchXR`, and `xr.offer: "once"` also offers one session to the browser (the emulator's `xr enter` command needs that offer; `launchOnSessionGranted` would disable the offer flow, so it stays off). M0 requests only `handTracking`, as an optional feature (controllers stay usable). ADR-026 adds `planeDetection` and `anchors`, also optional, when table placement is built. Mesh detection, hit-test, depth and layers stay unrequested until a spec needs them. Reference space is IWSDK's default (`local-floor`, then `local`, `viewer`). The fallback stand floats about 55 cm ahead and about 38 cm below the eyes, about 35° below a level head-forward (PRODUCT_SPEC §3.2, INTERACTION_SPEC §3). Both are measured from the eye position, and the level facing direction, read at the moment the stand is placed, never from the floor or a fixed world height. The stand is placed once per session, when the placement choice falls back to it: at the first tracked head pose in `immersive-vr`, or after the surface wait of up to about 2 seconds in `immersive-ar` (ADR-026). It is placed again only when the player recentres the headset view, which is how they adjust it after changing posture or seat.

**Reason:** Requesting unused features risks permission prompts and session failures on Quest; at M0 no spec needed the starter's defaults (`anchors`, `meshDetection`, `hitTest`, `sceneUnderstanding`, `environmentRaycast`).

**Consequences:** Superseded in part by ADR-026 (owner decision, 2026-11-05): table placement is now a core feature scheduled straight after the solver, with this stand as its fallback. The stand height is also an owner decision of 2026-11-05: it was 45 cm below the eyes, about 39° down, outside INTERACTION_SPEC §3's 35° and against the FoV-aware design the Official Rules score. `STAND_BELOW_EYE_M` in `src/placement.ts` changes from 0.45 to 0.38, with re-placing on recentre in `src/stage.ts`, in the lead's next code pass (task TP-6). Both distances stay named constants to tune: angle and reach are checked in IWER (ACCEPTANCE STAND-02 to STAND-04), comfort on a Quest (STAND-05, Blocked until a tester exists).

### ADR-020 — Units and coordinate conventions

**Decision:** Metres; right-handed, +Y up, -Z forward (three.js/WebXR); the world origin is the floor under the player (`local-floor`). Rotating parts spin about their local Z axis with the origin on the rotation centre; furniture and stands have their origin at the centre of the floor-contact face. Blender models are authored Z-up and exported glTF Y-up with transforms applied.

**Reason:** DATA_AND_BLUEPRINT_SPEC §6 requires a documented convention and none existed.

**Consequences:** The solver stays unit-agnostic; the content layer converts. Asset verification reads the exported POSITION bounds.

### ADR-021 — M0 test-scene lighting

**Decision:** One hemisphere light, one warm directional light, a static gradient image-based environment (`IBLGradient`, cream/walnut), no shadow maps, a `ContactShadow` blob under the stand, ACES tone mapping at exposure 1. The environment gradient is not a light and not a post-process pass.

**Reason:** CLAUDE.md §8 allows two lights and no post-processing but is silent on environment maps; metals look flat and dark with two lights alone.

**Consequences:** Revisit tone mapping once real Quest passthrough is tested; keep any change within the "no expensive post-processing" rule.

### ADR-022 — Deployment

**Decision:** Deploy the static Vite build output (`dist/`) to Vercel (owner decision, 2026-11-05; supersedes the GitHub Pages target in ADR-004). Vercel is used for static hosting and HTTPS only: no serverless functions, no Web Analytics or Speed Insights, no other Vercel services. Keep Vite `base: './'` so the build works from the domain root and from any sub-path (ACCEPTANCE APP-08). `vercel.json` and `.vercelignore` live in the repository; GitHub Actions only runs checks (typecheck, lint, test, build). The first deployment is a Vercel preview; promoting to production and attaching any custom domain need the owner's confirmation.

**Reason:** The owner prefers Vercel. `DEPLOYMENT_RELEASE_PLAN.md` is a byte-identical copy of `SIMULATION_SPEC.md`, so no deployment spec existed.

**Consequences:** Every document that named GitHub Pages was updated on 2026-11-05. Source lives in the owner's private repository `vishavmehra/wound-up`; the Official Rules do not require a public repository, so going public is the owner's choice. The build must stay reachable until the winner announcement, around 11 December 2026. `References/` stays out of git. Before submission, open the production URL in a private browser window to confirm it loads without a Vercel login (deployment protection must not block judges).

### ADR-023 — Runtime asset constraints

**Decision:** Runtime models are plain GLB: no Draco, no `EXT_meshopt_compression`, no KTX2. Textures are embedded PNG/JPEG, at most 1024 x 1024 each, with total GLB size at most 3 MB for hero assets.

**Reason:** IWSDK's glTF loader wires Draco and KTX2 decoders that download from a CDN and has no meshopt decoder; compressed GLBs would fail or add runtime network requests (CLAUDE.md §16). Budgets are provisional until profiled on Quest (section 5).

**Consequences:** Revisit with self-hosted decoders if Quest profiling shows memory pressure. Amended by ADR-035 (2026-11-06): the totals set in ADR-034 also apply, and any compression needs a spike and the owner's approval.

### ADR-024 — M0 desktop preview input

**Decision:** The 2D preview uses IWSDK's canvas pointer events (`input.canvasPointerEvents: true`). Each part gets exactly one grab component, chosen once at start-up by `GrabModeSystem`: `OneHandGrabbable` (near grab, hands) when the browser supports WebXR, `RayInteractable` + `DistanceGrabbable` (mouse ray, `rotate: false`) when it does not. Full desktop parity (assembly, snapping, placement) arrives with those features (ACCEPTANCE INT-11).

**Reason:** Verified 2026-11-05: `OneHandGrabbable` denies ray pointers, so a mouse never grabs it, and IWSDK keeps the old grab handle when a grab component is swapped at runtime (`GrabSystem` returns early if a `Handle` exists and `Handle` is not public API). Choosing once avoids both problems. Orbit-style controls are documented only for the gift viewer.

**Consequences:** A desktop browser that has WebXR (for example PC VR, or the IWSDK emulator in dev) uses hand grabbing, so its 2D preview cannot be mouse-dragged; the mouse path is exercised by the Playwright run against the production preview. The future "ray interaction" accessibility setting must rebuild the level rather than swap components live.

### ADR-025 — Runtime network policy

**Decision:** The shipped game makes no third-party requests. IWSDK's default hand models (downloaded from jsDelivr at runtime) are replaced with copies served from `public/assets/xr/generic-hand/` (WebXR Input Profiles 1.0.20, MIT) through the official `updateVisualImplementation` hook in `src/hands.ts`. Fonts are self-hosted. Known remaining exception: if a player picks up Touch controllers, IWSDK still fetches the controller models from jsDelivr; if that request fails the controller is simply drawn without a model and input keeps working. The Draco/KTX2 decoder paths in IWSDK's glTF loader are never used because of ADR-023.

**Reason:** CLAUDE.md §16 (avoid unnecessary network requests; no external service needed to play). The Playwright run asserts that the production page requests nothing outside its own origin.

**Consequences:** Self-host the controller models too if a Quest test shows players using controllers offline. Recheck this list after every IWSDK upgrade.

### ADR-026 — Table detection and spatial anchoring

**Decision:** Table placement is a core feature (owner decision, 2026-11-05; supersedes the plane and anchor exclusions and the "later task" status in ADR-019). In `immersive-ar` the game detects real horizontal surfaces, chooses one suitable table once per session (horizontal at table height, within seated reach, large enough or with the town scaled to fit, as defined in PRODUCT_SPEC §3.2), anchors Tockton to it and uses it as the ground the town stands on. `planeDetection` and `anchors` are requested as optional WebXR features, so a session never fails because of them. The floating stand is the fallback when detection or anchoring is unavailable or declined, or when no surface is suitable; `immersive-vr` and the desktop preview always use the stand. The anchor must hold for the session, including when the player recentres the headset view (only the stand is placed again then); keeping it across sessions is not required. The game reads only the surfaces the headset reports: passthrough camera processing stays forbidden (CLAUDE.md §14).

**Reason:** The Official Rules (§6) score scene understanding, anchoring to detected surfaces and a real room that changes the experience. The stand-first plan in ADR-019 would have given all of that up. The fallback keeps the game playable in any room.

**Consequences:** Every affected document was updated on 2026-11-05. Scheduled as Phase 2A in BUILD_ROADMAP, straight after the solver and owned by Agent 0. The thresholds are starting values, kept as named constants in `src/placement.ts` and tuned on a real Quest. Emulated planes prove logic and fallback only: real-world detection needs Hardware evidence (ACCEPTANCE TBL-13 to TBL-18) and stays Blocked until a Quest tester exists. No coordinates or surface data enter `woundup.save` (SAVE_PERSISTENCE_SPEC §4.1). Read from the installed IWSDK 1.1.0-rc.2: `XRAnchor` attaches objects to one group anchored at the reference-space origin, not at a chosen pose, and keeps an opaque id in localStorage under `iwsdk_scene_anchor_uuid`. Task TP-1 must establish whether that is stable enough for a table, including through a recentre (which resets the reference-space origin), or whether a native anchor at the town's pose is needed (CLAUDE.md §7).

### ADR-027 — Daily repair protected

**Decision:** The daily repair stays in planned scope (owner decision, 2026-11-05) as a lightweight, deterministic repeat-play activity: offered after Letter 5, chosen from the local date, completable once per date, and never required to finish the story (PRODUCT_SPEC §8). It reuses the machines, parts and repair faults the game already has and adds no new machine or system. The Clock Tower, then the day/night toggle, are the first features cut. If time becomes critical, the daily repair is simplified, never removed. It is built after the Music Box, Carousel, Windmill, assembly, placement and gifting work and must not delay any of them. The save keeps the local date of the last completed daily repair, or `null` (`dailyDone: string | null`, as in TECHNICAL_ARCHITECTURE §16); a boolean cannot tell yesterday's completion from today's.

**Reason:** Repeat usage is scored under two judging criteria and has its own award, Best Reason to Come Back (APP_AND_WEBSITE_GUIDELINES §5, §8). The previous cut order dropped the daily repair third, which would have given up the game's clearest reason to return tomorrow.

**Consequences:** Every affected document was updated on 2026-11-05: PRODUCT_SPEC §5 (F12 daily repair is now Must), §8, §14 and §19; GAMEPLAY_SYSTEMS §4.1, §12.3 and §22; BUILD_ROADMAP §10 (task DR-1) and §16; ACCEPTANCE_TESTS §5.1 (DAILY-01 to DAILY-05), §12, §17 and JUD-09; SAVE_PERSISTENCE_SPEC §3 and §4.4; APP_AND_WEBSITE_GUIDELINES §3, §6 and §9; CLAUDE.md §2 and §17. The cut order, identical in PRODUCT_SPEC §19, BUILD_ROADMAP §16 and GAMEPLAY_SYSTEMS §22, is now Clock Tower, day/night toggle, decoy parts. Which repairs the daily pool contains is still for the owner to define.

### Production phase decisions (lead, 2026-11-06)

These decisions settle what the documentation and asset work under the owner's production directive ([directives/2026-11-05_PRODUCTION_DIRECTIVE.md](directives/2026-11-05_PRODUCTION_DIRECTIVE.md)) depends on. Letters A to F cite the audit reports in [audits/](audits/) (A documentation, B references, C existing assets, D WebXR architecture, E Blender pipeline, F QA and performance). An unprefixed I-number (I-1 to I-13) is a conflict in [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §7 ("PA I-n" where clarity helps). [Audit A](audits/A_DOCUMENTATION.md) §3.1 has its own two-digit list (I-01 to I-28), cited as "A I-nn" or "audit A I-nn". Each ADR carries its own status. Where the owner still has to decide, the default is applied and the point is marked "owner decision pending" with a link to the [owner decision list](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner).

### ADR-028 — Scope firewall and classification labels

**Status:** Accepted (owner directive, Parts 3, 10 and 13; multiple-worlds requirement §9).

**Decision:** Every requirement, feature and asset carries exactly one of these labels, spelled as here:

| Label | Covers (directive Parts 3 and 10) |
|---|---|
| G0-required | Competition required |
| G0-optional | Competition optional |
| G1 Living Tockton | Resident behaviour, building dependencies, town events, production chains, persistent world simulation |
| G2 Advanced engineering | Multi-stage transmissions, energy distribution, timing, fault diagnosis, simulation preview |
| G3 Creative sandbox | Free-build workshop, modular component library, blueprint editor, saved inventions |
| G4 Community | Blueprint sharing, challenges, gallery, optional accounts and cloud saves |
| G5 Clockwork universe | Worlds beyond Tockton, cooperative experiences, player-created districts |
| Research | Future research not yet assigned to a generation |

Rules:

1. The competition build is G0 only, and G0 is what the specifications and ADR-026 and ADR-027 already say (directive Part 3). Writing a feature into a later-generation document never makes it G0-required. The Clock Tower, then the day/night toggle, are cut first; the daily repair is protected (ADR-027).
2. CLAUDE.md §14 governs the competition build. A later-generation document may describe a §14 item (free-build, accounts, cloud save, multiplayer and so on) only labelled with its generation, as design intent.
3. G1 to G5 and Research are documented, not built, until the competition build is delivered (directive Part 13, Phase 7).
4. No asset for a future world is made before the competition build is stable, unless the owner explicitly approves it as a reusable shared asset that does not delay the submission (multiple-worlds requirement §9).
5. Each future-generation document opens with its label and a link to this ADR.

**Reason:** The directive asks for long-term documents and separate labels but forbids expanding the competition build ("No future feature should be silently marked as competition required", Part 3). CLAUDE.md §14 is worded without a time limit, while PRODUCT_SPEC §18 says "forbidden in this competition build"; the G1 to G5 tracks only work if §14 is read as competition scope (A §0 items 8 and 9; I-10).

**Consequences:** CLAUDE.md §14 points here. The asset manifest's class field uses these labels (F §2.3). ADR-013 and REJ-004 still bind G0 unchanged. Moving any item into G0 needs an owner decision recorded in this file.

### ADR-029 — Written specification over reference boards

**Status:** Accepted (directive Part 1).

**Decision:** For dimensions, mechanics, part counts, gear ratios, interactions and gameplay, the written specifications in `docs/` win over the boards in `References/`. Boards guide appearance, construction, proportions and presentation only. When a board conflicts with a specification, the specification is followed and the conflict is noted in the reference mapping. Default rulings applied from PRODUCTION_AUDIT §7:

| # | Conflict | Ruling |
|---|---|---|
| I-5 | Trunk 35 × 25 × 20 cm (PRODUCT_SPEC §3.2) against 60 × 34 × 32 cm on the boards | 35 × 25 × 20 cm |
| I-6 | Governor required by PRODUCT_SPEC §6.1 but missing from the 12-part boards | The governor is one of the Music Box's 12 parts |
| I-7 | Boards drive the Windmill from Music Box gears; PRODUCT_SPEC §6.3 says "Wind powers the sails" | Ambient wind drives the sails; the boards' Music Box drive is not used. Whether the player also winds the Windmill is a separate open gap (A §6 question 4) that this ruling does not settle |
| I-8 | Boards name Oswald, Elias, Luna, Pip, Clack and Tinkerer; the specifications name Mira, Otto, the schoolteacher and the theatre keeper (PRODUCT_SPEC §7) | The specification names are used in the competition build. Board names are used only if the owner approves them |

The gear module (I-4) is not settled here: owner decision pending ([decision 5](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)); see ADR-033.

**Reason:** Directive Part 1: "The written specifications are authoritative for dimensions, mechanical functionality, component counts, gear ratios, interactions and gameplay", and "If an image contains incorrect numerical labels or mechanical details, follow the documentation." The boards are AI-generated and carry part counts, speeds, a module and a trunk size that conflict with the specifications (B §4; PRODUCTION_AUDIT §8).

**Consequences:** Manifest dimensions and part lists come from the specifications. Where a specification gives no value (ten items, PRODUCTION_AUDIT §5), the manifest value is labelled as a proposal. CLAUDE.md §3 lists `REFERENCE_INDEX.md` so agents read the boards through this rule (A §4.2, ADR-B).

### ADR-030 — What one GLB deliverable is

**Status:** Accepted (directive Parts 5.2 and 5.3: "Do not count duplicate exports, different filenames for the same asset, or unnecessary subdivisions as independent assets"; "Determine the correct asset packaging strategy ... Document these choices").

**Decision:**

1. One GLB deliverable is a distinct mesh set with its own purpose in the game. Two files with the same geometry are one deliverable. The validator's count of unique geometry hashes per class label (F §2.5, X06) is the official count.
2. A material finish (brass, walnut or any other) is a runtime material, not a separate GLB. `PartDefinition.visual.assetId` names the GLB and `visual.finish` names the material (DATA_AND_BLUEPRINT_SPEC §4). The 69 gear variants of ART_ASSET_PIPELINE §11 are therefore 23 GLBs: 20 spur and 3 bevel (A §0 item 4; I-1). The tooth and module set itself is owner decision pending ([decision 5](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)).
3. "Parts: N" in PRODUCT_SPEC §6 (Music Box 12, Carousel 20, Windmill 24, Clock Tower 32) counts unique part slots in the blueprint. A piece that repeats is one GLB placed several times as instances (I-2). The boards' piece counts are not used (ADR-029).
4. Packaging:
   - Each interactive part (grabbed, snapped, wound or diagnosed by the player) has its own GLB.
   - A static housing or a decorative set may be one GLB with several named nodes.
   - Each animated component is a separate node with its pivot at its rotation centre (ART_ASSET_PIPELINE §10, ADR-020).
   - Continuous rotation (gears, cylinder, governor, platform, sails, millstone) is driven at runtime from the solver's output, not from baked clips. A two-key full-turn clip exports as identity to identity and does not rotate (E §3), and IWSDK has no clip player (D §3.6).
   - Short authored one-shot motions (trunk lid, doors) and character motion may be glTF clips, exported sampled (E §3) and played by a three.js `AnimationMixer` in one ECS system (D §3.6).
5. A finished machine is shown by placing its part GLBs and its housing. An assembled-machine GLB that repeats part geometry is a duplicate and is not made. A simplified town copy counts as its own deliverable only if its geometry really differs (for example merged and reduced), and is made only if a scene budget measurement needs it (F §3.3; D §6.3).
6. Each manifest entry states what its GLB contains; a near-duplicate states why it is distinct (`distinctBecause`, F §2.3 and X02, X05).

**Reason:** No document defined a deliverable (I-1). Counting finishes and repeated pieces as files would inflate the count towards the directive's 180 to 200 estimate, which the directive forbids, and would multiply download and memory (C §5; F §0 item 2).

**Consequences:** The 180 to 200 estimate is replaced by the counted total, with the difference explained (directive Part 8). The runtime needs a solver-driven rotation system and a reader that finds pivot, socket and collider nodes by name prefix and `userData.wu.type`, never by index (E §3).

### ADR-031 — Mechanical parts are parametric Blender GLB families

**Status:** Accepted (directive Parts 5.2 A, 6, 7.2 and 7.3; I-3). Amends ADR-007; supersedes "procedural TypeScript geometry" in ART_ASSET_PIPELINE §5 and CLAUDE.md §9.

**Decision:** The mechanical component library (gears, shafts, springs, cranks, cams, escapements, pendulums, fasteners and the other family A parts) is built in Blender as parametric GLB families. One generator script per family reads that family's manifest entries (id, parameters, category, sockets, colliders, pivots) and exports one GLB per entry with one fixed export profile, in one Blender process per family (E §5.2). At runtime each part GLB is loaded once and cached; repeated placements are clones or instances that share geometry and material (D §3.1, §3.5; ART_ASSET_PIPELINE §12). The game does not generate part geometry in TypeScript.

Agent 2 (CLAUDE.md §10) now owns the part catalogue, blueprint data, and the runtime caching and instancing of part GLBs, not geometry generation. The GLBs come from the asset production agents.

**Reason:**

- The owner asked for Blender-produced assets: the directive gives the mechanical and gear library to a Blender production agent that creates sources and exports GLBs (Part 7.2 item 1, Part 7.3) and lists it as a GLB family to inventory (Part 5.2 A).
- Measured cost and size (E §2.1, §5.3): a 4,000-triangle gear builds and exports in 1.2 to 3.1 s, at 144 to 179 KB without textures, and one process builds a whole family. The old run's cost was agent iteration, not machine time (E §5.1).
- One visual pipeline: the shipped gear is already a Blender GLB and `src/` has no procedural geometry (C §1h). TypeScript parts would be a second pipeline whose bevels, normals and materials must match Blender's (CLAUDE.md §9 requires visual consistency).

**Consequences:** ART_ASSET_PIPELINE §5 and CLAUDE.md §9 are updated. CLAUDE.md §6.6, PROJECT_BIBLE §7 and TECHNICAL_ARCHITECTURE §19 are reworded on 2026-11-06 so none reads as permitting TypeScript part geometry. Generators live in `blender/scripts/` and must refuse default output paths into `public/` (E §6, repo-write hazard). The pilot gate measures agent minutes per family before scaling (E §5.5). Hand-modelled Blender work stays for heroes (ADR-007).

### ADR-032 — Shared material library

**Status:** Accepted. The owner approved building the shared asset framework on 2026-11-06 at 17:09: "Build the shared asset framework: materials, generators, GLB validator and manifest tooling." That closes [decision 4](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner). The owner can still reverse it; the fallback is in the consequences below.

**Decision:**

1. GLBs carry named proxy materials from one library list (`Mat_<Name>`, starting with `Mat_AgedBrass`, `Mat_Walnut`, `Mat_VelvetTeal`) with constant values only, no image-linked sockets, plus baked per-vertex ambient occlusion in `COLOR_0`. Export profile: images NONE, vertex colour ACTIVE, extras on, no compression, single-sided materials (E §2.2 to §2.4, §5.2).
2. When a GLB is first loaded, before the first clone, the runtime replaces each proxy by name with one shared textured material from a persistent material library and disposes the GLB's own copy (D §3.4). Unloading a world never disposes the library.
3. Library textures are tileable (E §5.2 item 3), at most 1024 px (ADR-023), loaded once from `public/assets/materials/` (ADR-033).
4. Per-asset baked textures are allowed only for hero objects named in the manifest and approved by the lead, inside the hero texture pool of ADR-034.

Proxies must be constants only because a texture-linked socket exported with images NONE loses its metallic and roughness factors, and three.js then reads metalness 1 and roughness 1 (E §2.4).

**Reason:** Per-GLB embedded textures do not scale. The two shipped GLBs already use 36 MiB of GPU texture memory; twelve parts in the gear's style would need 192 MiB (F §0 item 2, §3.4; D §3.4). Each GLB uploads its own images even when material names match (C §4). Vertex ambient occlusion adds about 31 KB to a 4,000-triangle gear and loads in three.js r185 (E §2.2).

**Consequences:** Some per-asset texture detail is lost; vertex ambient occlusion is low-frequency and large flat faces get none unless subdivided (E §2.2, §8 risk 2). The runtime material registry does not exist yet (E §2.4) and must exist before the part library is mass-produced (F §8 risk 1). The validator checks material names against the library (F V30). If the owner reverses this ADR, the fallback is one texture atlas per machine (F §3.4 option B) and ADR-034's texture rows are redone.

### ADR-033 — Asset naming and folders

**Status:** Accepted. The module token in gear ids is owner decision pending ([decision 5](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)); the manifest's default applies until then. Amends the model folder list in ADR-017 and ART_ASSET_PIPELINE §6 and §15.

**Decision:**

Asset ids are lowercase snake_case (letters, digits, underscores), ordered from general to specific, compatible with DATA_AND_BLUEPRINT_SPEC §4.1: for example `gear_spur_12_m1`, `gear_bevel_12`, `shaft_short`. An asset id carries no finish (ADR-030) and no version or status word (`final`, `v2`, `new`), and never changes once a blueprint, save or gift uses it (DATA_AND_BLUEPRINT_SPEC §4.1). The part id of §4.1 stays as it is and may include the finish (`gear_spur_12_m1_brass`); its `visual.assetId` is the asset id without the finish (`gear_spur_12_m1`), and its `visual.finish` names the library material. The same asset id is used for the GLB file name (`<asset_id>.glb`), the manifest `id`, the `src/assets.ts` key and `visual.assetId` (ART_ASSET_PIPELINE §15).

| What | Where |
|---|---|
| Blender sources | `blender/source/<family>/`. A hand-modelled asset is `<asset_id>.blend`. For a parametric family the generator script and its manifest entries are the source; any `.blend` the runner saves is for inspection and is not hand-edited |
| Generators and shared Blender code | `blender/scripts/`, with shared modules in `blender/scripts/lib/` (PRODUCTION_AUDIT §12) |
| G0 GLBs reusable by any world (mechanical library, other assets with no Tockton identity) | `public/assets/models/shared/<family>/` |
| G0 GLBs specific to Tockton | `public/assets/models/tockton/<family>/` |
| Shared material library textures | `public/assets/materials/` |
| Every other GLB (G1 to G5, Research, any world other than Tockton) | `assets/future/<world_id>/<family>/`, outside `public/` |
| Machine-readable manifest | `assets/manifest/glb-manifest.json` |

`<family>` is a snake_case folder name; mechanical families use the `PartFamily` values of DATA_AND_BLUEPRINT_SPEC §4 (`spur_gear`, `bevel_gear`, `shaft`, `spring` and so on). Inside a GLB, materials are named `Mat_<Name>`, and helper empties use the prefixes `COL_` (collider), `PIV_` (secondary pivot) and `SOCKET_` (socket), each with a `wu` custom property that three.js exposes as `userData.wu` (E §3). The full family list and node rules are in `ASSET_NAMING_AND_FOLDER_STANDARDS.md`.

Vite copies all of `public/` into the build (D §5), so every GLB under `public/` must be G0-required or G0-optional in the manifest. The lead adds a CI check that fails when `dist/` holds a GLB that is not a G0 manifest entry, or a world id other than `tockton` or `shared` (D §5; F X04).

The two existing game GLBs:

| Today | Becomes |
|---|---|
| `public/assets/models/props/gear_spur_16_brass.glb`, key `gear-spur-16-brass`, source `blender/source/gear_spur_16_brass.blend` | A spur gear family entry at `public/assets/models/shared/spur_gear/gear_spur_16_<module>.glb`, regenerated by the family generator with the ADR-032 profile. It fails the part budget today (16 MiB of textures, 2.38 MB or 2.27 MiB of file, F §3.2), so it is regenerated, not moved. Its module token waits for owner decision 5 |
| `public/assets/models/environment/tockton_base_round.glb`, key `tockton-base-round`, source `blender/source/tockton_base_round.blend` | `public/assets/models/tockton/environment/tockton_base_round.glb`, id `tockton_base_round`, source `blender/source/environment/tockton_base_round.blend`, regenerated to fit the before-Enter GLB budget (ADR-034; 2.12 MB or 2.02 MiB today, F §7.2) |

Until each replacement passes the validator, the M0 files stay where they are so the current build keeps working. The lead then moves each one in a single change that updates `src/assets.ts` (the key becomes the asset id), `public/scenes/main.iwsdk.scene.json`, `blender/README.md` and the manifest together, and deletes the old file, so no GLB exists at two paths (F X01). The helper GLBs `blender/exports/variants/gear_spur_{12,24}_brass.glb` are not deliverables, are not in the manifest and never go under `public/` (C §3); whether they stay in git is the owner's choice (C §7).

**Reason:** The repository already uses `blender/{source,scripts,exports,previews}`, `public/assets/models/` and snake_case ids (ADR-017, `blender/README.md`), and the directive says to adapt its suggested `assets/` tree to the repository (Part 6; multiple-worlds requirement §7). The `shared/` and `tockton/` split gives the directive's shared versus world-specific classification without duplicating shared parts (multiple-worlds requirement §7). Post-competition GLBs must sit outside `public/` or Vite ships them (D §5).

**Consequences:** ADR-017's `public/assets/models/{environment,props,machines,buildings,characters}` list no longer applies to new assets. ART_ASSET_PIPELINE §6 and §15 and CLAUDE.md §9 follow this ADR.

### ADR-034 — Asset and scene budgets

**Status:** Accepted as provisional starting values until measured on a Quest (section 5). The texture rows assume ADR-032, which the owner accepted on 2026-11-06 and can still reverse.

**Decision:** One budget set replaces the three in D §6.3, E §2.1 and §8, and F §3 (I-13). Where the audits disagreed, the stricter value is used unless a measured asset or a documented count already exceeds it; each exception is stated. Basis: **O** official Meta or competition figure; **I** IWSDK or ADR-023 limit; **E** engineering estimate to confirm on hardware. Every value without a mark is E.

Per GLB, by category. These are ceilings, not allowances; scene totals still apply.

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

Choices between the audits: gears keep F's 4,000 rather than D's 2,000, because the only measured part, the shipped 16-tooth gear, has 3,872 triangles (E §2.1). Other parts take F's 1,500, stricter than D's 2,000. Characters take D's 1,500 with a shared skeleton, stricter than F's 6,000; no character exists yet. Textures per GLB are 0 (D §6.3, ADR-032) except for the hero pool.

Texture memory counts each image once, as width × height × 4 bytes × 4/3 for mipmaps (F V33): a 1024 px map is 5.33 MiB, a 512 px map 1.33 MiB. The shared material library gets at most 48 MiB. A hero object named in the manifest may embed one texture set of at most 16 MiB (three 1024 px maps; maps are at most 1024 px, ADR-023, I); all hero textures together get at most 48 MiB.

Per scene, inside an immersive session (scenes S0 landing and stand to S4 gift viewer, F §3.3; S3, the awakened town, is the heaviest):

| Metric | Target (72 fps) | Ceiling (60 fps floor) | Basis |
|---|---|---|---|
| Frame time | p95 at most 13.9 ms | p99 at most 16.7 ms | O: Meta gives 13.8 ms at 72 Hz for Quest 3 and 16.6 ms at 60 fps; the competition requires at least 60 fps on Quest hardware (APP_AND_WEBSITE_GUIDELINES §5) |
| Draw calls (`renderer.info.render.calls`) | 150 | 200 | O for the ceiling: Meta recommends fewer than 200 for Quest 3 (native guidance; no WebXR or Quest 3S figure). E for the target: F's 150 rather than D's 120, because F's on-paper count of the awakened town is already 150 to 190 (F §3.3) |
| Visible triangles (`renderer.info.render.triangles`) | 400k | 750k | O reference: Meta recommends fewer than 1.5M for Quest 3 (native). E: F's values, about a quarter and a half of Meta's. D's 300k and 500k rest on a fill-rate measurement on an Intel UHD laptop GPU, which D itself says must not be scaled to Quest (D §6.1) |
| Unique GPU texture memory | 96 MiB | 128 MiB | E: F's target and D's ceiling, stricter than F's 160 MiB, because the Quest Browser tab memory limit is unknown (F §3.1). Library 48 plus hero pool 48 is the target; the rest of the ceiling covers hands, environment map, contact shadow and interface |

Download (compressed transfer, all E):

| Metric | Target | Ceiling | Basis |
|---|---|---|---|
| Before Enter is enabled | 3.0 MB, of which GLBs at most 1.5 MB | 4 MB | F §3.3 and §7.2; stricter than D's 5 MB |
| Each scene loaded after Enter | 8 MB | 12 MB | F §3.3 |
| Whole competition build | 40 MB | 60 MB | F §3.3; E §8 also suggests 40 MB. D's 100 MB is not needed: GLBs without embedded textures are 0.12 to 0.28 MB each (E §2.1) |

IWSDK's 64 MiB per model and 256 MiB total payload limits are safety limits of one loader path, not budgets, and its 30 s load timeout applies per asset (I; D §3.1, F §3.1).

Enforcement: the validator fails any GLB over its category values (F V50). Scene counts are read from `renderer.info` (PERF-01) and download bytes are asserted on the built preview (PERF-03, F §4.2 and §7.3). An asset over its category needs the lead's written exception, with a reason, in its manifest entry. An asset whose integration takes a scene over a ceiling is not INTEGRATED (F §6.2). Frame time can only be proven on a Quest (F §4.3), so those checks stay Blocked until a tester exists. Whether multiview makes the draw-call count per frame or per eye is unverified (D §6.2) and is recorded at the first device reading.

**Reason:** Three audits gave three budget sets (I-13), and Meta publishes few figures: none for WebXR and none for Quest 3S (F §0 item 4, §3.1).

**Consequences:** `ASSET_OPTIMISATION_BUDGET.md` carries these tables as the working copy; where it differs, this ADR wins until amended. The 160 MiB ceiling in PRODUCTION_AUDIT §9 risk 2 becomes 128 MiB. The two M0 GLBs (4.5 MB together) fail the before-Enter budget and must shrink or load after Enter (F §7.2). The values are revised after the first Quest reading (F §8 risk 7).

### ADR-035 — No compression by default; ADR-023 gains total caps

**Status:** Accepted. Amends ADR-023.

**Decision:** Plain GLB stays the default for every runtime model: no Draco, no meshopt and no KTX2 (ADR-023). ADR-023's per-file limits (maps at most 1024 px, hero GLB at most 3 MB) are joined by totals: download before Enter, per scene and for the whole build, and scene GPU texture memory, as set in ADR-034. Draco, meshopt or KTX2 may be used only after both of these:

1. A spike self-hosts the decoder under `public/`, loads a test GLB through IWSDK, and passes the Playwright check for requests outside our origin (D §3.3 recipe; ADR-025).
2. The owner approves it in a new ADR.

**Reason:** IWSDK's loader fetches its Draco and KTX2 decoders from unpkg.com by default and has no meshopt decoder; a meshopt GLB fails to load (measured, E §2.5; D §3.3). Assets marked critical are parsed before the decoder paths can be changed, so compressed GLBs could only be lazy or background (D §3.3). Decode time on a Quest cannot be measured without a headset (E §8). ADR-023 capped single files, but nothing capped the sum (F §1).

**Consequences:** Download size is controlled by ADR-032 (no embedded textures), not by compression. KTX2 is the only option that reduces GPU texture memory (D §3.3; F §3.4 option D), so it is the first spike candidate if a Quest reading shows memory pressure. The validator rejects the compression extensions (F V06).

### ADR-036 — Gaze-and-pinch uses a head-directed pointer on Quest 3 and 3S

**Status:** Accepted by the lead. Unverified on a device. The owner may veto it.

**Decision:** The gaze-and-pinch accessibility mode (ADR-014; INTERACTION_SPEC §14; PRODUCT_SPEC §10 and §16) aims with a ray from the head pose (`world.player.head`) instead of eye tracking, and acts on a pinch (`world.input.xr.getSelectState`) (D §4.4). The current target is highlighted before a pinch acts, and nothing is selected without a pinch, so objects are never chosen just for being near the centre of view (INTERACTION_SPEC §14). In this mode parts use a ray-capable grab component, so choosing the mode rebuilds the level instead of swapping components live (ADR-024; D §4.4). The `gazeTracking` feature is not requested, following ADR-019's rule to request only features the game uses. Agent 3 verifies these APIs against the installed IWSDK before building the mode (CLAUDE.md §7).

**Reason:** IWSDK's gaze input looks for an eye-tracking input source, and Meta lists eye tracking for Quest Pro, not Quest 3 or 3S (D §4.4; from a search result, page not fetched). Without our own pointer the mode would do nothing on the target headsets. Near-grab parts (`OneHandGrabbable`) refuse ray pointers and are not gaze targets (D §4.4).

**Consequences:** IWER can check the flow with head-simulated gaze (D §4.4; ACCEPTANCE WIND-06, JUD-13). Accuracy and comfort need a Quest and stay Blocked until a tester exists. Where documents say "gaze" for Quest 3 and 3S, read head-directed. If the owner vetoes this, the mode is redesigned before Agent 3 builds it, because JUD-13 needs a gaze path.

### ADR-037 — GLB validation gate

**Status:** Accepted for our own validator. Adding Khronos `gltf-validator` as a dev dependency: Proposed, owner decision pending ([decision 3](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)).

**Decision:** Every GLB passes our own validator, a Node script with no new dependency. It parses the GLB container and JSON, applies the manifest rules and ADR-034 budgets, round-trips the file through the three.js `GLTFLoader` the game ships (super-three 0.185), and checks the whole manifest for duplicates and orphans (F §2.1; checks V01 to V70 and X01 to X06). Any FAIL exits non-zero; WARN lines are reviewed and recorded. It lives in `tools/` (PRODUCTION_AUDIT §12) and runs as `npm run assets:check` and through a Vitest wrapper, so `npm test` and CI cover it (F §2.1). The lead adds the npm entries. An asset is VALIDATED only with zero FAIL, and the status is bound to the GLB's hash (F §6.2). Khronos `gltf-validator` (Apache-2.0) would add full glTF schema conformance as a second check for release candidates only (F §2.6). Until the owner approves it, it is not installed and nothing waits on it.

**Reason:** The prototype (236 lines) validated three GLBs in about 0.25 s and caught all six seeded defects (F §2.2). `gltf-validator` cannot check our budgets, material library, pivots, sockets or duplicates (F §2.6), and a new dependency needs the owner's approval (ADR-018).

**Consequences:** The prototype in the session scratch folder (F §2.2) must be copied into `tools/` before it is lost. CI gains the validator. ACCEPTANCE_TESTS gains the asset tests AST-01 to AST-14 (F §6.1) through its owner.

### ADR-038 — Agent roster and ownership

**Status:** Accepted by the lead (directive Part 7; CLAUDE.md §10; task PR-3). It settles the proposal in [AGENT_OWNERSHIP_MATRIX.md](AGENT_OWNERSHIP_MATRIX.md).

**Decision:** The roster, model tiers, and owned and forbidden paths of AGENT_OWNERSHIP_MATRIX.md §2 and §3 are final. Every path has one owner.

1. Game code agents. Agent 0, Lead Architect and Integrator (Opus): the shared files of matrix §4, `CLAUDE.md`, `docs/**`, and the work of the two agents in item 2 until they exist. Agent 1, Mechanical Simulation (`src/sim/**`, `tests/sim/**`). Agent 2, Part Catalogue and Runtime Parts (`src/parts/**`, `src/content/parts/**`, `src/content/blueprints/**`; no part geometry, ADR-031). Agent 3, Hand Interaction (`src/interaction/**`). Agent 4, Town, Presentation and Audio (`src/town/**`, `src/audio/**`). Agents 1 to 4 are Sonnet.
2. Not created yet: a gameplay and progression agent (letters, save and load, gift flow, pause menu, daily repair) and a QA agent (Sonnet; Haiku for repetitive runs). Agent 0 does their work and sets their paths when it creates them.
3. The landing and entry-screen agent is a separate process with its own paths (`src/landing/**`, `index.html`, `DESIGN.md`, `PRODUCT.md`, `tests/e2e/landing.spec.ts`). Whether CLAUDE.md §10 should list it (matrix open item 3) is not settled here.
4. Asset production agents (ADR-031, ADR-033, ADR-037): Asset framework, Mechanical library, Machines and World (all Sonnet), and the Manifest checker (Haiku, read-only). Each `.blend` and each GLB has one owner, and agents do not edit the manifest in parallel.
5. Model tiers (directive Part 7): Sonnet builds. Haiku does bounded repetitive checks and never judges how an asset looks. Opus is reserved for difficult architectural decisions, mechanical design reviews, complex integration failures and critical final reviews.
6. The letters A to G stop being agent names. "Audit A to F" means the reports in `docs/audits/`. Where a path in TECHNICAL_ARCHITECTURE.md §4 and §24 or AGENT_WORKFLOW.md §6 differs from the matrix, the matrix wins.
7. The application entry point is `src/index.ts` (ADR-017), owned by Agent 0. CLAUDE.md §10 called it `src/main.ts`.

**Reason:** Three agent schemes disagreed about names, letters and folders (audit A I-17), and the directive's audit agents were also lettered A to F. One roster gives every file one owner (directive Part 7.4; CLAUDE.md §10).

**Consequences:** The "proposed, PR-3" markers in CLAUDE.md §10 are removed and §10 names `src/index.ts`. AGENT_OWNERSHIP_MATRIX.md is Accepted and its open item 1 is closed; its other open items stay open.

### ADR-039 — Owner decisions of 2026-11-06

**Status:** Accepted (owner, 2026-11-06, at 17:09 and 17:20). The quoted words are the owner's.

**Decision:**

1. Inventory. "The Tockton inventory and the revised 71-GLB target are approved." The 71 is the current audited inventory, not an arbitrary target. Finishes, repeated physical pieces and colour variants are never counted as separate GLBs. The distinction between required, optional, future and blocked assets is kept. The two M0 assets stay tracked as requiring rework. No asset moves from Blocked to Ready without an approved specification. Future worlds use the shared mechanical library and are produced sequentially, one world at a time (also the world-by-world strategy in the 2026-11-05 production directive, last part).
2. "No flower shop in Tockton." `flower_shop` is deleted from the manifest.
3. "Otto is the baker." This closes gap G-10. `figure_baker` becomes `figure_otto`.
4. Characters. "Create character figures only for people explicitly named in the written specifications. Do not invent additional resident figures for letter senders." In the current Tockton build only Mira and Otto have figures: Mira is a named character and gets a figure; Otto is a named character and the baker, gets a figure and appears in the Bakery performing the kneading animation. The schoolteacher and the theatre keeper are roles only and have no separate figure. Other letter senders have no figure unless they are explicitly named and approved later. The specification is [TOCKTON_CHARACTERS.md](TOCKTON_CHARACTERS.md). In the manifest, `figure_schoolteacher` and `figure_theatre_keeper` are deleted and `figure_mira` becomes G0-required.
5. Blocked assets. "Keep all seven blocked assets blocked until I approve the relevant specifications." The manifest listed seven before decision 2 and lists six now: `music_box_slot_11`, `music_box_slot_12`, `run_lever`, `town_houses`, `town_props_set` and `gift_engraving_plate`. Each stays BLOCKED until the owner approves its specification.
6. Music Box end-to-end milestone. It must pass before other machine families scale. "One world at a time, one machine fully proven before mass production." Its eight criteria are: (1) all 12 approved component slots are defined; (2) correct dimensions, pivots and socket positions; (3) GLB assets generated and validated; (4) parts interactively assembled and snapped; (5) the mechanical solver correctly evaluates the assembly; (6) winding produces the intended motion; (7) the completed Music Box can be placed in Tockton and triggers its awakening event; (8) performance and memory budgets are measured.
7. Release and hardware. "Do not push or deploy until the relevant integration and release checks pass." Quest hardware verification stays explicitly unverified until a physical Quest 3 or 3S test is completed.
8. The shared asset framework (materials, generators, GLB validator, manifest tooling) is approved. That accepts ADR-032.

**Reason:** The owner's instruction of 2026-11-06. It settles audit A conflict I-16 (flower shop) and gap G-10 (who the baker is), and fixes the figure count that the manifest left open for the sender figures.

**Consequences:**

- The manifest has 68 entries: 43 G0-required, 20 G0-optional, 5 future, 6 blocked. The three deleted entries are kept in `meta.removedByOwnerDecision` so the audited 71 stays traceable. `node tools/asset-status.mjs` prints the live figures, and the asset documents were updated to match.
- Criterion 1 needs Music Box slots 11 and 12 specified and approved first, and both are BLOCKED on gap G-12 (no blueprint data).
- The milestone is recorded here as a gate and is written into the plans as Asset Gate M: [ASSET_PRODUCTION_ROADMAP.md](ASSET_PRODUCTION_ROADMAP.md) section 5 (after the pilot, before the Windmill, Carousel and Clock Tower machine files), [MASTER_PRODUCTION_ROADMAP.md](MASTER_PRODUCTION_ROADMAP.md) (AB-1M, CK-1M), [INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md) section 4.1 and [ASSET_QA_CHECKLIST.md](ASSET_QA_CHECKLIST.md) section 6. The owner gave no date and none was invented. The dates of the Windmill, Carousel and Clock Tower batches still pre-date the gate and are marked as earliest dates. The lead has to date Gate M and re-date them. Whether the gate also holds back the library, town and gift batches is open (ASSET_PRODUCTION_ROADMAP risk 13).
- No document may say the flower shop is possible, or that the baker has another name. The board names Oswald, Elias, Luna, Pip, Clack and Tinkerer stay unused (ADR-029, ruling I-8).

### ADR-040 — Entry screen small-window fallback

**Status:** Accepted by the lead. Source: `src/landing/landing.css` and the landing review of 2026-11-06.

**Decision:** On a very small window the entry screen drops spare content before it shrinks anything. The premise (`.wu-lede`) and the imprint (`.wu-imprint`) are hidden below about 336 px of window height, or below about 512 px in portrait. Below 280 px of height or 256 px of width, the clockwork device is also hidden and the content (`.wu-body`) gets `zoom: 0.78` as a last resort, so nothing clips. These media queries are in `px`, not `rem`, so text a reader has enlarged does not trigger them; the page scrolls instead.

**Reason:** From the comments in `landing.css`: the spare lines go only when the window truly has no room for them, and the last resort keeps everything on screen, just smaller. Sizes are in `px` so that a reader who enlarges the default text keeps those lines, and the page scrolls for them instead.

**Consequences:** In a window this small the premise and the imprint are not shown, although APP_AND_WEBSITE_GUIDELINES.md §2 lists them as content. That is accepted for windows this small.

### ADR-041 — Asset scope class in the manifest

**Status:** Accepted by the lead. Source: the owner's world-by-world production strategy (directive, last part, "Production discipline").

**Decision:** Every manifest entry has one `scopeClass`: `shared`, `world-specific`, `reused` or `future-planned`. The value is derived from `classification`, `worldId` and `reuseEligible` as [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md) section 4 says: a non-G0 entry is `future-planned`; a G0 entry with `worldId` `shared` is `shared`; a G0 entry with a world's identity is `reused` when `reuseEligible` is true and `world-specific` when it is false. The schema and `tools/asset-status.mjs` both check it, and the tool prints the count per class.

**Reason:** The directive says the manifest "must distinguish shared assets, world-specific assets, reused assets and future planned assets" and that counts are "based on unique deliverables, never inflated through material or colour variants". The existing fields (`classification`, `worldId`, `sharedOrWorldSpecific`, `reuseEligible`) could not name "reused" or "future planned" in one place. A derived field is the smallest change: it adds no entry, changes no count of deliverables (68 stay 68) and no path.

**Consequences:** The four counts add up to the total. A new world's entries stay `future-planned` until it is scheduled. A file that two worlds really share is reclassified `shared` by the lead in one change (CROSS_WORLD_GAMEPLAY section 5). The field is required, but `schemaVersion` stays 1: the repository holds one manifest and it was updated in the same change, so no migration is needed.

## 5. Deferred decisions

The following topics require verification or a later implementation decision.

| Topic | Status | Required action |
|---|---|---|
| Exact IWSDK APIs | Deferred | Inspect installed version and official documentation |
| Exact build tooling configuration | Deferred | Confirm from starter project |
| Exact hand interaction implementation | Deferred | Verify built-in IWSDK capabilities |
| Final asset polygon budgets | Deferred | Profile representative assets on target hardware; starting values in ADR-034 |
| Final texture budgets | Deferred | Profile runtime memory and visual quality; starting values in ADR-034 |
| Final audio assets | Deferred | Verify source and licensing |
| Final gift payload schema | Deferred | Define before gift implementation |
| Final blueprint schema | Deferred | Validate against all required machines |
| Quest hardware performance | Deferred | Arrange hardware testing |
| Final tuning of the table-placement thresholds and stand position (starting values accepted in ADR-019 and ADR-026), and real-world plane behaviour | Deferred | Tune and verify on a physical Quest (ACCEPTANCE TBL-13 to TBL-18, STAND-05) |

A deferred decision must not be silently treated as accepted.

## 6. Rejected approaches

### REJ-001 — Full rigid-body simulation for all mechanisms

**Status:** Rejected

**Reason:** Unnecessary complexity and unpredictable behaviour for mechanisms with known deterministic relationships.

**Alternative:** Use the mechanical graph solver and authored animation profiles.

### REJ-002 — Backend-dependent gameplay

**Status:** Rejected

**Reason:** The core experience does not require a backend and must remain easy to deploy.

**Alternative:** Use local persistence and compressed gift URLs.

### REJ-003 — Controller-required gameplay

**Status:** Rejected

**Reason:** Hands-first interaction is a core product requirement.

**Alternative:** Use hands as the primary interaction method and controllers only as optional support.

### REJ-004 — Scope expansion for its own sake

**Status:** Rejected

**Reason:** Adding unrelated features threatens the completion deadline and product coherence.

**Alternative:** Complete and polish the approved gameplay loop.

## 7. Change control

When a decision changes:

1. Create or update the relevant decision record.
2. Explain why the previous decision is no longer suitable.
3. Identify affected specifications.
4. Update the source documents.
5. Notify affected agents.
6. Update implementation contracts.
7. Add or update tests where necessary.

Do not modify one document while leaving contradictory requirements in another.

## 8. Decision authority

The lead project owner is responsible for final product and architecture decisions.

Agents may recommend changes and provide evidence.

Agents must not independently change accepted product scope or shared architecture contracts.

## 9. Final principle

This document is the durable record of why Wound Up is built the way it is.

If a significant decision changes, record it here before allowing the project documentation and implementation to diverge.
