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

**Consequences:** Hero assets must have editable source files and optimised GLB exports. Procedural geometry may be used for repeated mechanical components when appropriate.

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

**Consequences:** Update CLAUDE.md §9/§10 after owner approval. Parallel agents get exclusive directories before they start.

### ADR-018 — Tooling and scripts

**Decision:** npm with a committed `package-lock.json`; scripts `dev`, `build`, `preview`, `typecheck` (`tsc --noEmit`, strict), `lint` (ESLint 10 flat config + typescript-eslint), `test` (Vitest), `test:e2e` (Playwright). Not installed on purpose: `@meta-quest/metavr` (collects usage data; dev-only, unnecessary), `@iwsdk/reference` (semantic search CLI pulling an ONNX runtime and model download; typings and the official docs are enough for now), and the IWSDK-generated Claude/Codex/Cursor skills, rules and MCP settings (new agent tooling needs owner approval; their text is reference material read from a scratch scaffold).

**Reason:** CLAUDE.md §18 requires lint; no doc names a tool. Telemetry-free, minimal dependency set.

**Consequences:** To enable the official IWSDK agent skills and MCP servers later, run the scaffolder in a scratch directory and copy the skills across, or `npx @iwsdk/cli adapter sync` once approved.

### ADR-019 — XR entry and feature policy

**Decision:** The landing page's Enter action follows PRODUCT_SPEC §3.1: `immersive-ar` if supported, else `immersive-vr`, else the desktop 3D preview. Sessions are started only from a user action: the landing button calls IWSDK's `world.launchXR`, and `xr.offer: "once"` also offers one session to the browser (the emulator's `xr enter` command needs that offer; `launchOnSessionGranted` would disable the offer flow, so it stays off). Only `handTracking` is requested, as an optional feature (controllers stay usable). Not requested at M0: plane/mesh detection, anchors, hit-test, depth, layers. Reference space is IWSDK's default (`local-floor`, then `local`, `viewer`). Without table detection the stand floats 55 cm ahead and 45 cm below the eyes (PRODUCT_SPEC §3.2), placed once per session when the first tracked head pose arrives.

**Reason:** Requesting unused features risks permission prompts and session failures on Quest; the starter's defaults (`anchors`, `meshDetection`, `hitTest`, `sceneUnderstanding`, `environmentRaycast`) appear in no spec.

**Consequences:** Table-plane placement is a later task and will add `planeDetection` as optional with this stand as the fallback.

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

**Consequences:** Every document that named GitHub Pages was updated on 2026-11-05. Source lives in the owner's repository `vishavmehra/wound-up`, private until submission, when it must be made public (COMPETITION_REQUIREMENTS §9). `References/` stays out of git. Before submission, open the production URL in a private browser window to confirm it loads without a Vercel login (deployment protection must not block judges).

### ADR-023 — Runtime asset constraints

**Decision:** Runtime models are plain GLB: no Draco, no `EXT_meshopt_compression`, no KTX2. Textures are embedded PNG/JPEG, at most 1024 x 1024 each, with total GLB size at most 3 MB for hero assets.

**Reason:** IWSDK's glTF loader wires Draco and KTX2 decoders that download from a CDN and has no meshopt decoder; compressed GLBs would fail or add runtime network requests (CLAUDE.md §16). Budgets are provisional until profiled on Quest (section 5).

**Consequences:** Revisit with self-hosted decoders if Quest profiling shows memory pressure.

### ADR-024 — M0 desktop preview input

**Decision:** The 2D preview uses IWSDK's canvas pointer events (`input.canvasPointerEvents: true`). Each part gets exactly one grab component, chosen once at start-up by `GrabModeSystem`: `OneHandGrabbable` (near grab, hands) when the browser supports WebXR, `RayInteractable` + `DistanceGrabbable` (mouse ray, `rotate: false`) when it does not. Full desktop parity (assembly, snapping, placement) arrives with those features (ACCEPTANCE INT-11).

**Reason:** Verified 2026-11-05: `OneHandGrabbable` denies ray pointers, so a mouse never grabs it, and IWSDK keeps the old grab handle when a grab component is swapped at runtime (`GrabSystem` returns early if a `Handle` exists and `Handle` is not public API). Choosing once avoids both problems. Orbit-style controls are documented only for the gift viewer.

**Consequences:** A desktop browser that has WebXR (for example PC VR, or the IWSDK emulator in dev) uses hand grabbing, so its 2D preview cannot be mouse-dragged; the mouse path is exercised by the Playwright run against the production preview. The future "ray interaction" accessibility setting must rebuild the level rather than swap components live.

### ADR-025 — Runtime network policy

**Decision:** The shipped game makes no third-party requests. IWSDK's default hand models (downloaded from jsDelivr at runtime) are replaced with copies served from `public/assets/xr/generic-hand/` (WebXR Input Profiles 1.0.20, MIT) through the official `updateVisualImplementation` hook in `src/hands.ts`. Fonts are self-hosted. Known remaining exception: if a player picks up Touch controllers, IWSDK still fetches the controller models from jsDelivr; if that request fails the controller is simply drawn without a model and input keeps working. The Draco/KTX2 decoder paths in IWSDK's glTF loader are never used because of ADR-023.

**Reason:** CLAUDE.md §16 (avoid unnecessary network requests; no external service needed to play). The Playwright run asserts that the production page requests nothing outside its own origin.

**Consequences:** Self-host the controller models too if a Quest test shows players using controllers offline. Recheck this list after every IWSDK upgrade.

## 5. Deferred decisions

The following topics require verification or a later implementation decision.

| Topic | Status | Required action |
|---|---|---|
| Exact IWSDK APIs | Deferred | Inspect installed version and official documentation |
| Exact build tooling configuration | Deferred | Confirm from starter project |
| Exact hand interaction implementation | Deferred | Verify built-in IWSDK capabilities |
| Final asset polygon budgets | Deferred | Profile representative assets on target hardware |
| Final texture budgets | Deferred | Profile runtime memory and visual quality |
| Final audio assets | Deferred | Verify source and licensing |
| Final gift payload schema | Deferred | Define before gift implementation |
| Final blueprint schema | Deferred | Validate against all required machines |
| Quest hardware performance | Deferred | Arrange hardware testing |

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
