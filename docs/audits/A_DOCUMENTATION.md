# Agent A: Documentation Audit

Date: 2026-11-06 (machine clock, IST). Mode: read-only. Author: Agent A (Documentation Auditor).

**Read in full:** `CLAUDE.md`, `README.md`, `PRODUCT.md`, `DESIGN.md`, `blender/README.md`, and all 25 files in `docs/` (ACCEPTANCE_TESTS, AGENT_WORKFLOW, APP_AND_WEBSITE_GUIDELINES, ART_ASSET_PIPELINE, AUDIT_DOCS, BUILD_ROADMAP, COMPETITION_REQUIREMENTS, CREDITS, DATA_AND_BLUEPRINT_SPEC, DECISIONS, DEPLOYMENT_RELEASE_PLAN, DOC_PACK_README, GAMEPLAY_SYSTEMS, IDEAS, INTERACTION_SPEC, MECHANICAL_SOLVER_SPEC, PRODUCT_SPEC, PROJECT_BIBLE, REFERENCE_INDEX, SAVE_PERSISTENCE_SPEC, SIMULATION_SPEC, TECHNICAL_ARCHITECTURE, TESTING_QA_PLAN, TOOLING_REGISTRY, UI_UX_SPEC). DEPLOYMENT_RELEASE_PLAN was compared byte for byte with SIMULATION_SPEC instead of read twice.

**Not done (Unverified):**
- I did not open the 27 PNGs in `References/`. Everything about them comes from `docs/REFERENCE_INDEX.md`.
- I did not review `src/` or `tests/`. Two spot checks only: the head of `src/render-budget.ts` and `MODULE_REF` in `blender/scripts/gen_gear_spur.py`. Whether the code agrees with the docs is not covered here.
- I did not read `docs/audits/C_EXISTING_ASSETS.md` (another agent's) beyond its header.

**Moving target.** Between 12:04 and 12:08 on 2026-11-06 another process edited PRODUCT_SPEC, DECISIONS, INTERACTION_SPEC, TECHNICAL_ARCHITECTURE, APP_AND_WEBSITE_GUIDELINES, ACCEPTANCE_TESTS, COMPETITION_REQUIREMENTS, TESTING_QA_PLAN, BUILD_ROADMAP, CLAUDE.md and AGENT_WORKFLOW. I cite sections, not line numbers. Anything that matches the three owner decisions is in section 5 as "pending", not as a finding. I read some of these files before they were edited; afterwards I re-read PRODUCT_SPEC §3.2, ACCEPTANCE §4.2 and §18, and ADR-019, and re-checked by search every point this report relies on. Other edits in those files (for example new test IDs) may have been missed.

Tags: **DOC** = written in a repo document (cited by file and section). **INF** = my inference or arithmetic. **Board** = value that appears only in `REFERENCE_INDEX.md` (AI-generated boards, appearance guidance only).

---

## 0. Headlines

1. **None of the 30 directive documents exists** under its name anywhere in the repo (checked by file name, `node_modules` excluded). Coverage by existing files: 8 are mostly covered (for competition scope only), 13 have seed text only, 9 have nothing (section 4).
2. **`docs/reference/` does not exist** (confirmed). `CLAUDE.md` §3 items 5, 7 and 13 still name `GAMEPLAY_AND_INTERACTION.md`, `CONTENT_AND_BLUEPRINTS.md` and the original Technical Design Doc; none exist. `CLAUDE.md` §9 names `docs/ASSET_PIPELINE.md` (the file is `ART_ASSET_PIPELINE.md`). `DOC_PACK_README.md` calls the Technical Design Doc "the detailed source of truth", so the document the rules call authoritative is not in the repository.
3. **No document states a total GLB count.** The only numeric asset target is `ART_ASSET_PIPELINE.md` §11: "The part library targets 120+ variants." Only 69 of those are enumerated (60 spur plus 9 bevel). The owner's 180 to 200 estimate appears in no repo document (INF, grep-checked for "180", "190", "200" near GLB, asset or model).
4. **"120+ variants" counts variants, not files.** `DATA_AND_BLUEPRINT_SPEC.md` §4 keeps `visual.assetId` and `visual.finish` as two fields, so the 69 gear variants are 23 meshes (20 spur plus 3 bevel) times 3 finishes (INF). If every finish is exported as its own GLB, 46 of the 69 are material-only duplicates. This needs a ruling before any manifest is written (ADR-C in section 4.2).
5. **The written docs never list a machine's parts.** Counts are fixed (Music Box 12, Carousel 20, Windmill 24, Clock Tower 32, total 88 slots, 56 without the Clock Tower). Only 4 of the Music Box's 12 are named in writing; the other machines name about as few (Carousel: platform, horses, canopy, canopy lights; Windmill: sails, millstone, 12-tooth and 24-tooth spur gears). No blueprint data exists in any doc: no sockets, connections, gear ratios, tooth counts for the machine trains, energy or drain constants.
6. **Dimensions are written for very little.** Only the trunk, workbench, town footprint, stand pose, collider and snap distances have numbers. Plots, machines, buildings, figures, parcel, tray, gift box and parts have none. The board sizes cannot be used: the four machine footprints on the boards add up to 0.41 m², against a town footprint of 0.24 m² (INF, section 3.2 G-08).
7. **Twenty specification gaps block asset specs** (section 3.2). The ones most likely to waste asset work: whether the Windmill is wound at all, which spring ships in Letter 1, where the workbench sits, what "Parts: 12" counts, and whether the stand and the town base are one asset.
8. **Direct collisions with `CLAUDE.md` §14** come from: the retention-metrics document (analytics and telemetry forbidden), the creative sandbox (free-build sandbox forbidden), community sharing (accounts, cloud save, leaderboards, whole-town gifting forbidden), and future worlds (tram, lighthouse, hot-air balloon, grand theatre performance forbidden). Nine ADRs are needed (section 4.2).
9. **`CLAUDE.md` §14 and the other lists are worded differently.** §14 says "excluded even if they appear attractive" (no time limit). `PRODUCT_SPEC.md` §18 says "forbidden in this competition build". `IDEAS.md` §4.2 marks the same machines "Deferred" while §5 says "not approved for the competition build". The directive's G1 to G5 tracks depend on §14 being read as competition-only. That reading needs an ADR.
10. **Stale text found:** `PRODUCT.md` still says "served over HTTPS from GitHub Pages" although `DECISIONS.md` ADR-022 says every such document was updated. `DEPLOYMENT_RELEASE_PLAN.md` is still byte-identical to `SIMULATION_SPEC.md` (SHA-256 `eebb40d5...ee5ba`, checked today). `DESIGN.md` (landing layout and "no blur backdrops") contradicts `APP_AND_WEBSITE_GUIDELINES.md` §2 (full-window, centred, blurred world); the landing owner is mid-update.

---

## 1. Requirements map

Labels: **G0-required** and **G0-optional** (competition), **G1** Living Tockton, **G2** Advanced engineering, **G3** Creative sandbox, **G4** Community, **G5** Clockwork universe, **Research**. The docs themselves use no labels; the label column is mine.

### 1.1 Competition scope (G0)

| ID | Feature | Requirement as written | Source | Label |
|---|---|---|---|---|
| RQ-01 | Platform and stack | Quest 3 and 3S, WebXR, IWSDK 1.x (pinned `1.1.0-rc.2`), TypeScript strict, Node >= 20.19 | CLAUDE.md §5; ADR-003, 005, 006, 016 | G0-required |
| RQ-02 | Hosting | Static Vite build on Vercel over HTTPS. `base: './'` works at domain root and any sub-path. Deployment protection off before submitting. Reachable and free until about 11 Dec 2026 | ADR-022; TECH_ARCH §22; COMPETITION §3.2, §10; APP_AND_WEBSITE §4 | G0-required |
| RQ-03 | Forbidden systems | No backend, accounts, cloud save, analytics, telemetry, multiplayer, AI/LLM calls, passthrough computer vision, third-party runtime requests | CLAUDE.md §14, §16; PRODUCT_SPEC §18; ADR-013, 025 | G0-required (constraint) |
| RQ-04 | Performance | 72 FPS target, never below 60 on Quest. No numeric draw-call or triangle budget in any spec. Provisional asset limits: textures at most 1024 x 1024, hero GLB at most 3 MB, plain GLB only (no Draco, meshopt, KTX2) | CLAUDE.md §12; PROJECT_BIBLE §13; ACCEPTANCE §15; ADR-023; DECISIONS §5 | G0-required |
| RQ-05 | Landing and entry | Title, tagline verbatim ("Build the machines. Wake the town. Raise the curtain."), Enter. Order: immersive-ar, then immersive-vr, then desktop 3D preview. Session starts from a user action. No setup screens | PRODUCT_SPEC §3.1; UI_UX §5; APP_AND_WEBSITE §2; ADR-019 | G0-required |
| RQ-06 | Desktop preview | Same gameplay rules as XR; never reported as Quest evidence | ADR-012, 024; INTERACTION §15; ACCEPTANCE INT-11, TBL-12 | G0-required |
| RQ-07 | Hands first | Everything doable with hands; controllers optional, never required | PRODUCT_SPEC §2; REJ-003; INTERACTION §5 | G0-required |
| RQ-08 | Table detection and anchoring | In immersive-ar: detect horizontal surfaces, choose one table once per session (20 to 60 cm below eyes; town centre 40 to 60 cm away, within about 35 degrees; fits at 60 x 40 cm or scaled to no less than 75%, i.e. 45 x 30 cm), anchor for the session. `planeDetection` and `anchors` optional. Waits at most about 2 s | PRODUCT_SPEC §3.2; TECH_ARCH §6.4; ADR-026; ACCEPTANCE TBL-01 to 18 | G0-required |
| RQ-09 | Floating velvet stand | Fallback and the only mode in VR and desktop. About 38 cm below the eyes and 55 cm ahead (about 35 degrees down), measured at session start, placed again on recentre | PRODUCT_SPEC §3.2; ACCEPTANCE §4.2 (STAND-01 to 05) | G0-required |
| RQ-10 | Comfort | Seated, no locomotion, no forced camera motion, about 60 cm of the chest, about 35 degrees of head-forward | PRODUCT_SPEC §2; INTERACTION §3, §19; COMPETITION §4.3 | G0-required |
| RQ-11 | F1 Trunk | Wooden trunk 35 x 25 x 20 cm; pinch the latch; opens; contact shadow on the table | PRODUCT_SPEC §3.2, §5; UI_UX §6 | G0-required |
| RQ-12 | F2 Frozen town | Town unfolds from the trunk; four machine plots, a bakery, a theatre facade; frozen at about 0.15 saturation with a cool tint; footprint at most about 60 x 40 cm | PRODUCT_SPEC §3.3, §5; PROJECT_BIBLE §2, §6 | G0-required |
| RQ-13 | F3 Letters and parcel | Letter appears after trunk opens; pinch envelope; read; Accept. Letters 1 to 5 and the closing card are required; Letter 6 belongs to the Clock Tower. Exact texts are fixed | PRODUCT_SPEC §3.4, §7; GAMEPLAY §5; UI_UX §8 | G0-required (L1 to L5, closing); G0-optional (L6) |
| RQ-14 | Workbench, parcel, blueprint, tray | After Accept: workbench slides in, parcel opens, blueprint appears, tray appears, Build starts | PRODUCT_SPEC §3.5; GAMEPLAY §6; UI_UX §9, §10 | G0-required |
| RQ-15 | Progression | Deterministic, explicit conditions, one authority, no second system in the UI | GAMEPLAY §4; DATA §12 | G0-required |
| RQ-16 | F4 Build | Pinch and snap. Snap 4 cm, Easy Snap 7 cm. Preview 50% opacity with warm outline. 120 ms tween, click, spark. Wrong family: red outline, back to tray, soft bonk. Wrong-size parts may fit and run wrong. Removal by pulling more than 3 cm. Collider at least about 1.2 cm. Music Box in 40 pinches or fewer | PRODUCT_SPEC §9; GAMEPLAY §7, §8; INTERACTION §7 to 9 | G0-required |
| RQ-17 | Idle guidance | After about 20 s without progress: pulse next socket, replay ghost hands | PRODUCT_SPEC §15; INTERACTION §17 | G0-required |
| RQ-18 | F5 Wind | Pinch key, turn wrist; 90 degrees = 1 wind unit; maximum 8; gaze mode: one pinch = 1 unit plus a Run control | PRODUCT_SPEC §10; INTERACTION §10 | G0-required |
| RQ-19 | F5 Solver | Pure TypeScript. Outcomes: `runs`, `runs_wrong`, `jams`, `incomplete`. Edge types: shaft, mesh, belt, pin, trigger. Loop mismatch above 1% jams. Mesh with unequal modules jams. Energy = wind units x energy per unit; runtime = energy / drain | MECHANICAL_SOLVER_SPEC §4 to 14; ADR-008, 009 | G0-required |
| RQ-20 | F6 Music Box | 12 parts. Required: main spring, cylinder, comb, governor. Cylinder 0.4 rad/s +-10%. Comb fixed, governor spins, fixed melody, stops when energy is spent | PRODUCT_SPEC §6.1; SIMULATION §10.1 | G0-required |
| RQ-21 | F7 Carousel | 20 parts. Platform 0.5 rad/s +-10%. Horses rise and fall, canopy lights twinkle, Music Box melody plays | PRODUCT_SPEC §6.2; SIMULATION §10.2 | G0-required |
| RQ-22 | F8 Windmill and Bakery | 24 parts. Millstone 0.6 rad/s +-15%. Sails turn, flour puffs. Bakery: chimney smoke, baker kneads, oven glows. Power source is ambient wind | PRODUCT_SPEC §6.3; SOLVER §12.2 | G0-required |
| RQ-23 | F12 Story repairs | Worn spring: runs about 1.5 s at 8 units (about 15% energy). Windmill: 12-tooth spur in the 24-tooth position gives about twice the speed | PRODUCT_SPEC §8; SOLVER §12.1, §15.3 | G0-required |
| RQ-24 | F10 Place and wake | Grab base handle; correct plot glows; release; snap; wake ripple about 1.5 s; Windmill also wakes the Bakery. Machine takes the town's scale on the plot | PRODUCT_SPEC §11; INTERACTION §3, §12 | G0-required |
| RQ-25 | F11 X-ray | Open palm facing down, 5 to 20 cm above, hold 0.4 s; lens icon alternative; casing about 15% opacity, cool rim, moving parts opaque with warm highlight | PRODUCT_SPEC §12; INTERACTION §11 | G0-required |
| RQ-26 | F13 Gift | One finished machine. 8 preset engravings. JSON, then `CompressionStream('deflate-raw')`, then base64url, in `#g=`. Target under 1500 characters. Share, then clipboard, then visible URL. Viewer validates everything, shows an error card, does not touch the recipient's save, unwrap, orbit on desktop and phone, Make Your Own. Ribbon icon after Letter 2 | PRODUCT_SPEC §13; GAMEPLAY §16; DATA §15 | G0-required |
| RQ-27 | F14 Save | `woundup.save`, `SaveV1`, try/catch, memory fallback, save on letter change and placement, restart needs a second confirmation | PRODUCT_SPEC §14; SAVE_PERSISTENCE | G0-required |
| RQ-28 | F15 Onboarding | Ghost hands, no text walls, cues vanish after success | PRODUCT_SPEC §15; GAMEPLAY §18 | G0-required |
| RQ-29 | F17 Accessibility | Gaze-and-pinch, Easy Snap (7 cm), ray interaction mode; the main loop must be finishable in each | PRODUCT_SPEC §16; COMPETITION §4.4, §5.3 | G0-required |
| RQ-30 | F18 Pause | Resume, restart (second pinch), X-ray hint, accessibility settings | PRODUCT_SPEC §17 | G0-required |
| RQ-31 | Audio | Procedural Web Audio, no external files, no sound at startup, 17 required sound categories | PROJECT_BIBLE §9; ACCEPTANCE §14 | G0-required |
| RQ-32 | Look | Palette brass `#C9A227`, walnut `#5B3A24`, cream `#F2E6CF`, teal `#1F5C5C`, lamp `#FFC66D`. One hemisphere plus one directional light, blob shadows, no post-processing. Blender hero assets, no primitive blockouts | CLAUDE.md §8; PROJECT_BIBLE §3 to 8; ART §2 to 4 | G0-required |
| RQ-33 | Part library | 120+ variants is "a target library, not a requirement to create every possible variant before the first playable loop"; prioritise the parts in-scope machines need | ART §11 | G0-required (used subset); G0-optional (rest) |
| RQ-34 | Submission | Video under 3 minutes (emulator footage allowed), README, credits, Devpost form submitted by the owner personally | COMPETITION §8 to 10; APP_AND_WEBSITE §4 | G0-required |
| RQ-35 | Test and release gates | Acceptance IDs APP, TBL, STAND, PROG, INT, SOL, WIND, TOWN; judging checklist JUD-01 to JUD-21 (the four 25% criteria, each item names the evidence level that can pass it); Gates A to D | ACCEPTANCE_TESTS §4 to §18; TESTING_QA §13 | G0-required |
| RQ-36 | Decoy parts | Letter 1 none; Letters 3, 4, 6: correct parts plus two decoys. Cut fourth | DATA §9.1; PRODUCT_SPEC §19 | G0-optional |
| RQ-37 | F9 Clock Tower | 32 parts. Pendulum, local-time hands, hourly bell, theatre doors open 30 s. Targets undefined. Cut first | PRODUCT_SPEC §6.4; SOLVER §15.4 | G0-optional |
| RQ-38 | F12 Daily repair | After Letter 5, seeded by local date, one completion per date, must never block the story. Content undefined. Owner decision (2026-11-05, being applied): protected, cut after Clock Tower and day/night | PRODUCT_SPEC §8; GAMEPLAY §12.3; APP_AND_WEBSITE §6 | G0-optional (protected) |
| RQ-39 | F16 Day/night | Lower ambient, emissive windows, at most 4 point lights. Cut second | PROJECT_BIBLE §8; ART §13 | G0-optional |

### 1.2 Beyond the competition (from `IDEAS.md`; none approved)

| ID | Idea | Status in IDEAS | Source | Label |
|---|---|---|---|---|
| RQ-L1 | More residents, letters, small animations, resident reactions | Deferred | IDEAS §4.1 | G1 |
| RQ-L2 | Town atmosphere: environment animation, animated townspeople, window lighting, ambient sound, seasonal decoration | Deferred | IDEAS §4.4 | G1 ("seasonal" is on the §14 list) |
| RQ-L3 | More mechanical complexity: gear families, belts, multiple shafts, cam profiles, compound trains, failure types | Deferred | IDEAS §4.3 | G2 |
| RQ-L4 | More machines: lighthouse, steam tram, hot-air balloon, mechanical orchestra, observatory, automaton theatre | Deferred | IDEAS §4.2 | G5 (tram, lighthouse, balloon are on the §14 list) |
| RQ-L5 | Free-build mode, custom blueprints, saving custom creations | Deferred | IDEAS §4.6 | G3 |
| RQ-L6 | Sharing custom machine designs; custom message cards, more engravings and wrapping, multi-machine gifts, gift history | Deferred / Proposed | IDEAS §4.5, §4.6 | G4 |
| RQ-L7 | More accessibility options | Proposed | IDEAS §4.7 | No directive label fits |
| RQ-L8 | Return to the same table (persistent anchors) | Proposed | IDEAS §4.8 | Research (needs a Quest) |
| RQ-L9 | Future worlds | No text anywhere; "world" means Tockton only | PRODUCT_SPEC header; ADR-001 | G5 |

---

## 2. Asset requirements extracted from the written docs

Every row is DOC unless marked. "Missing" says what the docs leave open; I have not filled any gap.

### 2.1 What the documents can and cannot support (counts)

| Item | Count | Basis |
|---|---|---|
| Part-library variants (target) | 120 or more | ART §11 |
| Enumerated gear variants | 69 = 60 spur (10 tooth counts x 2 modules x 3 finishes) + 9 bevel (3 tooth counts x 3 finishes) | ART §11 |
| Other variants implied | at least 51, across 10 listed categories (springs, shafts, cranks, cams, escapements, pendulums, combs, cylinders, structural parts, figures) | INF: 120 minus 69 |
| Distinct gear meshes behind those 69 | 23 (20 spur + 3 bevel) | INF; `visual.assetId` vs `visual.finish`, DATA §4 |
| Machine part slots | 88 (12 + 20 + 24 + 32); 56 without the Clock Tower | PRODUCT_SPEC §6 |
| Decoy picks | 6 (two each for Letters 3, 4, 6) | DATA §9.1 |
| Tray size if "Parts" means slots | Music Box 12, Carousel 22, Windmill 26, Clock Tower 34 | INF |
| Blender hero list in the docs | 11 named in ART §4 (trunk, town buildings, bakery, windmill, Music Box casing, carousel, clock tower, theatre facade, gift box, figures, major decorative props) | ART §4, §6; CLAUDE.md §6.6 adds main trunk, mechanical decorative parts, town props, character figures, presentation assets |
| Letters | 6 plus a closing card (7 texts); senders Mira (L1, L2), Schoolteacher (L3), Otto (L4, L5), Theatre keeper (L6) | PRODUCT_SPEC §7 |
| Machine plots | 4 | PRODUCT_SPEC §3.3 |
| Engraving presets | 8 | PRODUCT_SPEC §13 |
| Total GLB count, number of figures, props or buildings | not stated anywhere | grep-checked |

### 2.2 A. Mechanical component library

| ID | Item | Written spec (numbers, finish, motion, pivot) | Source | Missing |
|---|---|---|---|---|
| A-01 | Part families | 15: `spur_gear`, `bevel_gear`, `belt`, `pulley`, `shaft`, `spring`, `crank`, `cam`, `follower`, `escapement`, `pendulum`, `comb`, `cylinder`, `structural`, `figure` | DATA §4 | No family for governor, winding key, ratchet or pawl, flywheel, bearing, coupling, bushing, fastener, bracket, lever or linkage, worm gear. Solver edges are only shaft, mesh, belt, pin, trigger (SOLVER §8), so worm, chain, planetary and ratchet drives cannot be expressed |
| A-02 | Spur gears | 10 tooth counts x 2 modules x 3 finishes = 60. Tooth counts named in text: 10 and 20 (SOLVER §17 test 2; SOL-03), 12 and 24 (repairs), 12, 24, 36 (ID examples). That is 5 distinct values: 10, 12, 20, 24, 36. Module token `m1` in IDs; at least 2 modules are needed for the jam test SOL-06. Spin about local Z, origin on the rotation centre (ADR-020) | ART §11; DATA §4.1; SOLVER §17; ADR-020 | The other 5 tooth counts; the second module; the 3 finishes (only "brass" and "walnut" appear in IDs); bore, thickness, pitch diameter. The shipped 16-tooth gear (3,872 triangles, 2.28 MB per `blender/README.md`) uses a tooth count that no written spec names (only the boards do) |
| A-03 | Bevel gears | 3 tooth counts x 3 finishes = 9. Only `gear_bevel_12_brass` is named | ART §11; DATA §4.1 | The other 2 tooth counts. No written machine uses a bevel gear |
| A-04 | Shafts | `shaft_short_walnut`, `shaft_long_brass` named, so at least 2 lengths and 2 finishes. Connection type "shaft" | DATA §4.1 | Lengths, diameters, count per machine |
| A-05 | Springs | `spring_standard_brass`, `spring_worn_brass`. Worn spring gives about 15% energy per unit and about 1.5 s at 8 units. Carousel energy "decreases over time" | DATA §4.1; SOLVER §12.1; SIMULATION §10.2 | Energy per unit and drain rate (SOLVER §12.1 leaves them open); how worn differs visibly (GAMEPLAY §12.1 expects the player to "identify the worn spring"); spring variants for the other machines |
| A-06 | Cams, cranks, followers, escapements, pendulums, combs, cylinders | Listed as categories with no counts. Follower pose comes from "predefined profile data" (SOLVER §8.4). Pendulum pivots at the suspension point; cylinder turns about its mechanical axis; governor about its shaft (ART §10). Comb stays fixed | ART §10, §11; SOLVER §8.4 | Counts, shapes, profile data. No written machine says which part uses a cam, crank or belt |
| A-07 | Belts and pulleys | In DATA families and SOLVER §8.3 (ratio r_a / r_b) | DATA §4; SOLVER §8.3 | Absent from the ART §11 category list; no written machine uses a belt |
| A-08 | Pins, fasteners, connectors | "Pins. Repeated fasteners. Small mechanical connectors." | ART §5; PROJECT_BIBLE §7 | Shapes, counts |
| A-09 | Structural parts and figures | Families `structural` and `figure` | DATA §4; ART §11 | Everything |
| A-10 | Winding key | Pinched and turned; 90 degrees = 1 unit, maximum 8; key movement and wind counter visible. Board: 0.06 x 0.045 m | PRODUCT_SPEC §3.7, §10; UI_UX §12 | Size, shape, one shared key or one per machine, Windmill case (G-01) |
| A-11 | Run control | Gaze mode needs a "Run lever" / "accessible Run control" | PRODUCT_SPEC §10; GAMEPLAY §10.2 | Whether it is a physical lever model or a UI control |
| A-12 | Decoy parts | Two per letter for Letters 3, 4, 6; none in Letter 1; "understandable and visually distinguishable" | DATA §9.1; UI_UX §10 | Which parts; decoys for Letters 2 and 5 |
| A-13 | Pre-installed faulty parts | Worn spring (Music Box); 12-tooth spur in the 24-tooth position (Windmill) | PRODUCT_SPEC §8 | How the fault is shown before the player diagnoses it |
| A-14 | Colliders | Invisible, radius at least about 1.2 cm, visible mesh not enlarged | INTERACTION §7.2 | Per-part values |
| A-15 | Sockets and previews | 50% opacity ghost with warm outline; red outline when wrong; both in real centimetres at any town scale | PRODUCT_SPEC §9; INTERACTION §3, §8 | Socket positions for every machine (none exist) |

### 2.3 B. Trunk and workshop

| ID | Item | Written spec | Source | Missing |
|---|---|---|---|---|
| B-01 | Trunk | Wooden, 35 x 25 x 20 cm, "handcrafted keepsake box"; pinch the latch; opens; town unfolds; contact shadow. First Blender priority | PRODUCT_SPEC §3.2; UI_UX §6; ART §18 | Interior, hinge pivot, latch design, finish beyond "wooden" and walnut for "machine cases" (PROJECT_BIBLE §4) |
| B-02 | Workbench | About 45 x 25 cm; slides into view; always full size; holds blueprint, tray, build area. Second Blender priority | PROJECT_BIBLE §2; INTERACTION §3; ART §18 | Where it sits relative to the trunk and town (G-05) |
| B-03 | Parcel | "Visually distinct and physically openable"; opens to reveal the blueprint | UI_UX §9; GAMEPLAY §6 | Size, wrapping, open animation |
| B-04 | Blueprint | "Carefully illustrated mechanical document": machine illustration, part positions, connection indicators, short labels. One per machine (3 required, 1 for the Clock Tower) | PROJECT_BIBLE §11; UI_UX §9 | Whether repair letters have their own; size |
| B-05 | Parts tray | Physical arrangement, not a grid; enlarged targets for small parts; must not hide the blueprint | UI_UX §10 | Layout, size, one tray or one per machine |
| B-06 | Envelope and letter | Physical; pinch the envelope; letter shows sender, message, Accept. 6 letters plus closing card | UI_UX §8; PRODUCT_SPEC §7 | Paper and envelope size; handwriting style |
| B-07 | Floating velvet stand | Shown only when no table is used; about 38 cm below the eyes and 55 cm ahead; velvet is a named material | PRODUCT_SPEC §3.2; ART §8 | Size. Shipped as `tockton_base_round.glb` (CREDITS §5) |
| B-08 | Wind counter and wind cue | Shows wind units and the maximum of 8 | UI_UX §12 | Form |
| B-09 | Result label | "Small contextual result label only when useful"; messages: works, stops too soon, jammed, a component is incorrect | UI_UX §13 | Form, wording |

### 2.4 C. Music Box (12 parts)

| Item | Written spec | Source | Missing |
|---|---|---|---|
| Parts named | main spring, cylinder, comb, governor, "supporting mechanical parts defined by its blueprint" (4 named of 12). Also mentioned elsewhere: winding key, base handle, casing (Blender hero) | PRODUCT_SPEC §6.1, §3.7, §3.8; ART §4 | 8 of 12 identities; whether key, handle and casing count inside the 12 (G-02) |
| Motion | Cylinder rotates about its axis; comb fixed; governor spins about its shaft; spring energy falls to zero | SIMULATION §10.1; ART §10 | Governor type |
| Target | Cylinder 0.4 rad/s +-10% | PRODUCT_SPEC §6.1 | Input speed, gear train, tooth counts, ratio |
| Sound | Fixed authored melody, synchronised with the cylinder | TECH_ARCH §18; SIMULATION §10.1 | Which melody, length, pin layout, comb tine count |
| Build | 40 pinches or fewer; no decoys; correct and worn spring variants | PRODUCT_SPEC §9; DATA §9.1 | Sockets, connections, tray list |
| Board only | 12 rows: lid, 2 hinges, box body, mainspring, comb, melody cylinder, large gear, small gear, winding key, bracket, 2 side panels, foot (quantities add to 18). **No governor.** Dimensions 0.24 x 0.14 x 0.16 m | REFERENCE_INDEX: boards "Music Box Assembly Blueprint Infographic", "Steampunk Music Box Exploded Assembly Guide", "Steampunk Music Box Design Blueprint" | The board list cannot be the blueprint, because the spec requires a governor |

### 2.5 D. Carousel (20 parts)

| Item | Written spec | Source | Missing |
|---|---|---|---|
| Parts named | platform, horses (count not given), canopy, canopy lights (count not given) | PRODUCT_SPEC §6.2; SIMULATION §10.2 | How these map to 20; 16 or more identities; horse count |
| Motion | Platform turns about its central axis; horses move vertically, "controlled" (not physics); lights twinkle | ART §10; SIMULATION §10.2 | Horse motion profile |
| Target | Platform 0.5 rad/s +-10% | PRODUCT_SPEC §6.2 | Gear train, ratio |
| Sound | Music Box melody | PRODUCT_SPEC §6.2 | Whether it reuses the Music Box tune |
| Build | Hero model in Blender; correct parts plus two decoys | ART §4; DATA §9.1 | Sockets, tray |
| Board only | 20 numbered rows (finial, flag, canopy roof, canopy ribs x4, frieze, lamps x6, upper ring, column, poles x3, horses x3, platform, bevel, spur and intermediate gear, shaft, 2 bearings, 2 supports, base ring, base panels x4, feet x4); quantities exceed 20. Dimensions 0.36 x 0.32 m. Another board shows a 9-part version | REFERENCE_INDEX: boards "Carousel Blueprint_ Hero Design & Assembly", "Carousel Blueprint_ 20-Part Exploded Assembly" | Board counts conflict with each other; docs win |

### 2.6 E. Windmill (24 parts) and Bakery

| Item | Written spec | Source | Missing |
|---|---|---|---|
| Windmill parts named | sails (count not given), millstone, spur gears 12-tooth and 24-tooth (the "designated 24-tooth position") | PRODUCT_SPEC §6.3, §8; SOLVER §15.3 | 21 or more identities; sail count; gear train |
| Motion | Sails turn about the hub; millstone turns about the mill axis; flour puffs | ART §10; SIMULATION §10.3 | Sail-to-millstone ratio |
| Target | Millstone 0.6 rad/s +-15%; wrong gear gives about twice the speed | PRODUCT_SPEC §6.3, §8 | Ambient wind input value (SOLVER §12.2: "deterministic blueprint-defined input") |
| Bakery | Exists frozen from the start. When the Windmill runs: chimney smoke, baker kneads, oven glows. Static model first, behaviour added | PRODUCT_SPEC §3.3, §6.3; BUILD_ROADMAP §7 | Bakery part count (none in docs), baker model, smoke form |
| Build | Correct parts plus two decoys; classed as a building (`town_windmill`) in ART §6 and §15 | DATA §9.1; ART §6, §15 | G-12 |
| Board only | 24 rows (blade panels x4, rotor hub, rotor cap, roof cap, roof tiles, roof frame, tower slats x4, wall panels x4, balcony railings x4, upper platform, bevel gear, 2 intermediate gears, millstone drive gear, main shaft, 2 bearing supports, base rings, base feet x4, window frames x2, shutters x2, door frame, door). Dimensions 0.34 x 0.34 x 0.46 m. Bakery "16 parts" (input gear, millstone, mixer, oven, conveyor). Another board says 18 | REFERENCE_INDEX: boards "Steampunk Windmill Assembly Blueprint", "Windmill Assembly Blueprint Infographic", "Windmill-Powered Bakery Awakening" | Docs win; bakery count unverified |

### 2.7 F. Clock Tower (32 parts) and Theatre

| Item | Written spec | Source | Missing |
|---|---|---|---|
| Clock Tower parts named | pendulum, clock hands (real local time), bell, clock face (cream enamel) | PRODUCT_SPEC §6.4; PROJECT_BIBLE §5 | 28 or more identities; targets (SOLVER §15.4: "Do not invent") |
| Motion | Pendulum swings about the suspension point; hands show local time; bell strikes on the hour | ART §10; SIMULATION §10.4 | Bell sound, strike count |
| Theatre facade | Static and in scope from the start (F2). Doors open for 30 s on the hour if the Clock Tower exists | PRODUCT_SPEC §3.3, §6.4 | Door design, interior, size |
| Letter 6 | Theatre keeper; two decoys | PRODUCT_SPEC §7; DATA §9.1 | |
| Board only | 32 rows (listed in REFERENCE_INDEX for "Clock Tower Blueprint_ 32-Part Assembly"); dimensions 0.38 x 0.38 x 0.72 m; another board ("Clock Tower Blueprint and Mechanism Guide") says 28 | REFERENCE_INDEX | Docs win |

### 2.8 G. Tockton environment

| ID | Item | Written spec | Source | Missing |
|---|---|---|---|---|
| G-a | Town base | Footprint at most about 60 x 40 cm; may scale evenly to 75% (45 x 30 cm), never above 100%; "kept low, so the town reads as standing on the real table" | PROJECT_BIBLE §2; PRODUCT_SPEC §3.2; ART §18 | Whether it is the same asset as the velvet stand (G-06) |
| G-b | Four machine plots | Visible when frozen; glow when valid; show frozen or awakened and whether a machine is complete | PRODUCT_SPEC §3.3; UI_UX §7 | Plot size, positions, which plot is which |
| G-c | Buildings and set pieces | List of 11 items: small streets; miniature buildings; a flower shop; a bakery; a carousel square; a windmill; a clock tower; a theatre facade; mechanical decorations; warm windows; small figures and environmental details | PROJECT_BIBLE §2 | Counts for streets, buildings, decorations, figures; the flower shop is in conflict with PRODUCT_SPEC F2 (G-07) |
| G-d | Two visual states | Frozen: about 0.15 saturation, cool tint, still. Awake: full colour, motion, warm light, emissive windows. Wake ripple about 1.5 s | PROJECT_BIBLE §6; CLAUDE.md §8 | Mechanism (material tint at runtime, not separate GLBs, is the implied reading, INF) |
| G-e | Lights | One hemisphere, one directional; night adds at most 4 point lights | CLAUDE.md §8 | |
| G-f | Roofs and ribbons | Deep teal | PROJECT_BIBLE §4 | |
| G-g | Contact shadows | Under trunk, town and placed machines; blob decals | PRODUCT_SPEC §3.2; PROJECT_BIBLE §8 | |

### 2.9 H. Characters and automata

| Item | Written spec | Source | Missing |
|---|---|---|---|
| Letter senders | Mira, Schoolteacher, Otto, Theatre keeper. Docs do not say any appears as a figure | PRODUCT_SPEC §7 | Whether they are modelled |
| Baker | Kneading animation when the Windmill runs. Unnamed; Otto writes about bread but is never called the baker | PRODUCT_SPEC §6.3 | Identity (G-10), model, rig |
| Figures | "Small figures"; `figure` part family; ART §11 category | PROJECT_BIBLE §2; DATA §4 | Count, poses, style |
| Automata | Not mentioned in any written doc | none | Everything. Only a board names "Clack (automaton, ~0.8 m)", which is unreconciled (REFERENCE_INDEX b14) |
| Carousel horses | Probably `figure` parts (INF) | | Count and style |

### 2.10 I. Gift and presentation

| Item | Written spec | Source | Missing |
|---|---|---|---|
| Gift box and wrapping | Blender hero (gift box); viewer shows a wrapped gift, unwrap sequence, machine reveal, machine starts itself | ART §4; UI_UX §18 | Size, wrap design, animation |
| Ribbon icon | Appears on finished machines after Letter 2; teal ribbons named as a use of teal | PRODUCT_SPEC §13; PROJECT_BIBLE §4 | Form, where on the machine |
| Engraving presets (exact) | For you; Happy birthday; Thinking of you; Thank you; With love; Congratulations; Made this for you; Wind me up | PRODUCT_SPEC §13; GAMEPLAY §16.2; UI_UX §17 | Where the engraving is shown (G-09) |
| Gift panel and viewer UI | Machine preview, 8 choices, share, clipboard fallback, visible URL, error card, Make Your Own link | PRODUCT_SPEC §13 | |
| Ghost hands | Animated demonstrations: 7, but the two lists differ (I-15) | PRODUCT_SPEC §15; GAMEPLAY §18 | Hand model, clips |
| Visible player hands | "Visible hands when supported"; shipped from `@webxr-input-profiles/assets` | INTERACTION §5; CREDITS §5 | |
| Lens icon | Alternative X-ray control | PRODUCT_SPEC §12 | Form |
| Pause menu | Resume, restart (second pinch), X-ray hint, accessibility; GAMEPLAY and UI_UX add Easy Snap, gaze mode, day/night | PRODUCT_SPEC §17; GAMEPLAY §20 | Form |
| Gaze target indicator | "Clear target indication" | UI_UX §20 | Form |
| Effects, no GLB | Sparks on snap; jam vibration; flour puffs; chimney smoke; oven glow; canopy twinkle; wake ripple; plot glow; X-ray rim and warm highlight; socket ghost and outlines | SIMULATION §12; INTERACTION §16 | |
| Audio, no GLB | 17 categories: trunk opening, envelope, parcel, part pickup, snapping, incorrect placement, winding, gear movement, machine start, stop, jam, Music Box melody, Carousel music, Windmill, Bakery, town awakening, gift reveal | PROJECT_BIBLE §9 | No roadmap slot (AUDIT_DOCS §5.3) |

### 2.11 J. Future-generation assets

No written spec exists. The only text is `IDEAS.md` §4.2 (lighthouse mechanism, steam-powered tram, hot-air balloon, mechanical orchestra, observatory, automaton theatre) and §4.4 (seasonal decoration, more reactive buildings). None has dimensions, parts or counts.

### 2.12 Board-only values (appearance guidance; do not copy as spec)

From `REFERENCE_INDEX.md`; I have not opened the images. Docs win on counts, dimensions and ratios.

| Board value | Why it must not be used |
|---|---|
| Trunk 0.60 x 0.34 x 0.32 m | PRODUCT_SPEC §3.2 says 35 x 25 x 20 cm |
| Workbench build surface 0.52 x 0.28 m | Docs say about 45 x 25 cm |
| Town 0.6 to 1.0 m wide | Docs say at most about 60 x 40 cm |
| Spur modules 2 mm, 20 mm; tooth counts 8, 12, 16, 20, 24, 32; bevel 12, 16, 20, 24; crown 24, 32, 40; worm 1:10, 1:20, 1:30 | Boards disagree with each other and with DATA §4.1 and ART §11 |
| Triangle budgets 10 to 20k / 5 to 10k / 2 to 5k; gear LODs 3,200 / 1,200 / 400 | DECISIONS §5 defers budgets; REFERENCE_INDEX b18 says not to use them |
| Carousel 9 or 20 parts, 0.4 rad/s; Windmill 18 or 24; Clock Tower 28 or 32; Music Box 12 rows = 18 pieces | PRODUCT_SPEC §6 sets 20 at 0.5, 24, 32, 12 |
| Gear trains 12:1 and 6:1 | No doc gives a ratio for any machine |

---

## 3. Open inconsistencies and gaps

### 3.1 Contradictions between documents (still open)

"C" = carried from `AUDIT_DOCS.md`; "N" = new in this audit. Quotes are exact.

| ID | Topic | A says | B says | Decide | Affects |
|---|---|---|---|---|---|
| I-01 N | Part module and ID scheme | DATA §4.1: `gear_spur_12_m1_brass`, `gear_spur_36_m1_brass` (module token `m1`) | ART §11: "2 modules". `blender/README.md`: "keeps ONE module (3.6158 mm)" (`MODULE_REF` in `gen_gear_spur.py`). Shipped file is `gear_spur_16_brass.glb` with no module token. Boards: 2 mm and 20 mm (REFERENCE_INDEX b9) | Lead | Every part ID, save and gift payload |
| I-02 N | Part families vs library categories | DATA §4 families include `belt`, `pulley`, `follower`; none for governor or winding key | ART §11 categories omit belts, pulleys, followers. PRODUCT_SPEC §6.1 requires "Governor" | Lead | Part catalogue, blueprint validation |
| I-03 N | Variant vs file | ART §11: "10 tooth counts x 2 modules x 3 finishes = 60 variants" | DATA §4: `visual: { assetId, finish, scale }` (finish separate from asset). ART §8 and §12: "Use shared materials where possible"; "Reuse shared materials" | Owner | Whether the library is 23 meshes or 69 files |
| I-04 N | Gears: procedural or Blender | PROJECT_BIBLE §7 and ART §5: gears, shafts, springs, pins are procedural TypeScript. CLAUDE.md §10: Agent 2 owns spur gears in `src/parts/**` | CREDITS §5 and `blender/README.md`: the shipped gear is a Blender-generated GLB (`gen_gear_spur.py`). No ADR records the change | Owner | Who builds the 120+ library |
| I-05 N | Size vs variant count | ADR-023: "total GLB size at most 3 MB for hero assets"; `blender/README.md`: one gear GLB is 2.28 MB with 3 x 1024 px textures | ART §11: 120+ variants; ART §12: "Reuse shared materials"; ADR-023 forbids KTX2, Draco, meshopt; DECISIONS §5: polygon and texture budgets "Deferred" | Lead | Whole part library |
| I-06 C/N | File and folder naming | CLAUDE.md §9: `assets/blender/`, `assets/models/`, `assets/materials/`, `assets/references/`. ART §6: `trunk_main.blend`, `machine_music_box.blend`. ART §15: `machines/music_box.glb`, `buildings/town_windmill.glb`. TECH_ARCH §19.1: `machine_music_box.blend` | ADR-017: `blender/{source,scripts,exports,previews}` and `public/assets/models/{environment,props,machines,buildings,characters}`. Shipped: `props/gear_spur_16_brass.glb`, node `GearSpur16_Brass`, materials `Mat_AgedBrass`, `Mat_Walnut`, `Mat_VelvetTeal` (README only). For machines the `.blend` has a `machine_` prefix but the `.glb` does not | Lead | Manifest, loaders, blueprint `assetId` |
| I-07 N | Windmill: machine or building | PRODUCT_SPEC §6.3: Windmill is a machine with 24 parts | ART §6 and §15 file it as `town_windmill` under `buildings/`; the other three are `machine_*` / `machines/` | Lead | Folder, ownership, where the 24 parts live |
| I-08 C | What "Parts: N" counts | PRODUCT_SPEC §6.1: "Parts: 12" | REFERENCE_INDEX b10: 12 rows, 18 pieces. Rows omit the governor that §6.1 requires | Owner | Blueprint size, tray, pinch budget |
| I-09 C | SaveV1 shape | TECH_ARCH §16: `townPlaced: string[]`, `dailyDone: string \| null`, `letterStatuses`, `machinesBuilt`, `machinePlacements` | SAVE §3: `townPlaced: boolean`, `dailyDone: boolean`, `letters`, `machines: {blueprintId, built, placed, plotId?}[]`. PRODUCT_SPEC §14: "Daily repair completion dates". GAMEPLAY §17 says SaveV1 lives in TECH_ARCH; SAVE §3 says it follows the product spec | Lead | Save, tests, SaveV2 |
| I-10 C | Letter status words | GAMEPLAY §4: Locked, Available, Active, Completed | SAVE §4.2: `"locked" \| "available" \| "accepted" \| "completed"` | Lead | Save, progression |
| I-11 C | Letter 2 trigger | DATA §12: "Letter 2 becomes available after the first Music Box is placed." Letter 3 "after the Music Box repair is completed" | GAMEPLAY §4.1: "The next Music Box repair becomes available after the first Music Box completion." ACCEPTANCE PROG-06 "Complete first machine". Gift "after Letter 2" (PRODUCT §13, GAMEPLAY §16.1, UI_UX §17) does not say arrived, accepted or completed | Owner | Progression, gift gating |
| I-12 C | Restart wording | PRODUCT_SPEC §4 Pause: "Restart chapter." | PRODUCT_SPEC §17: "Restart from beginning."; SAVE §12 clears the key | Lead | Pause menu |
| I-13 C | Ray interaction mode | PRODUCT_SPEC §16: required ("Ray interaction mode"); PROJECT_BIBLE §10 lists it | INTERACTION_SPEC has no ray section; GAMEPLAY §19 omits it; settings in TECH_ARCH §16 and SAVE §3 are `easySnap`, `gazeMode`, `xrayHint`, `night` (no ray flag) | Lead | Interaction, save |
| I-14 C | Pause menu content | PRODUCT_SPEC §17: Resume, Restart from beginning, X-ray hint toggle, Accessibility settings | GAMEPLAY §20 and UI_UX §19 list Easy Snap, Gaze mode, Day/night separately | Lead | UI |
| I-15 N | Ghost-hand demos | PRODUCT_SPEC §15: pinching, picking up a part, moving a part, snapping, winding, releasing, placing a machine | GAMEPLAY §18 and COMPETITION §5.1: opening the trunk, opening a letter, picking up a part, snapping, winding, starting a machine, placing a machine | Lead | Animation clips |
| I-16 C | Flower shop | PROJECT_BIBLE §2 lists "A flower shop" | PRODUCT_SPEC F2 and §3.3: four plots, bakery, theatre facade; nothing else | Owner | Town contents |
| I-17 C | Agent schemes | CLAUDE.md §10: Agents 0 to 4, `src/sim`, `src/parts`, `src/interaction`, `src/town`, `src/audio` | TECH_ARCH §24 and AGENT_WORKFLOW §5, §6: Lead plus A to G, `src/app`, `src/gameplay/solver`, `src/world`, `tests/unit/solver`. ADR-017 chose `src/index.ts` and kept the CLAUDE.md §10 domain names but did not update TECH_ARCH §4 or AGENT_WORKFLOW | Lead | Asset agent assignments |
| I-18 C | Phases | CLAUDE.md §17: Phases 0 to 7 | BUILD_ROADMAP: Phases 0 to 12 plus 5A (CLAUDE.md puts the solver inside Phase 2 "Music Box vertical slice"; BUILD_ROADMAP splits it into Phase 2 solver and Phase 3 Music Box; gift is Phase 5 in one and Phase 6 in the other) | Lead | Production roadmap |
| I-19 C | Missing named docs | CLAUDE.md §3 items 5, 7, 13 and §9 `docs/ASSET_PIPELINE.md` | None exist; `docs/reference/` is absent. ADR-017 says CLAUDE.md §9/§10 will be updated "after owner approval"; not done | Owner | Authority chain |
| I-20 C | Duplicate deployment doc | `DEPLOYMENT_RELEASE_PLAN.md` | Byte-identical to `SIMULATION_SPEC.md` (checked). ADR-022 records it; the file is unchanged | Lead | Release docs |
| I-21 N | Stale hosting | PRODUCT.md: "served over HTTPS from GitHub Pages" | ADR-022: Vercel, and "Every document that named GitHub Pages was updated on 2026-11-05." | Landing owner | Landing copy |
| I-22 N | Landing layout | DESIGN.md: "Stage-left ... the plate is one column at the left". "Don't put text directly on the canvas, or use glass, blur backdrops" | APP_AND_WEBSITE §2: "Full window and centred ... No left-aligned plate, no narrow card or sheet." World "blurred and dimmed" behind the title. DESIGN.md is dated 2026-11-05 21:37, the guideline 2026-11-06 12:05 | Landing owner | Landing |
| I-23 C | Image rule cited wrongly | REFERENCE_INDEX header: "The written specs in docs/ win over any image (CLAUDE.md, section 3)." | CLAUDE.md §3 says nothing about images; REFERENCE_INDEX is not in the §3 list. REFERENCE_INDEX §b item 7 also says INTERACTION_SPEC §11 "lists alternative activation as a later idea"; INTERACTION_SPEC §11 and PRODUCT_SPEC §12 require the lens-icon alternative | Lead | Reference mapping |
| I-24 N | Scope wording of the exclusion list | CLAUDE.md §14: "These features are excluded even if they appear attractive." | PRODUCT_SPEC §18: "forbidden in this competition build". IDEAS §4.2 "Deferred" vs IDEAS §5 "not approved for the competition build" | Owner | All G1 to G5 documents |
| I-25 C | Status vocabularies | ACCEPTANCE §3: Not Run / Pass / Fail / Blocked / Not Applicable | TESTING_QA §11: PASS / FAIL / BLOCKED / NOT TESTED / NOT APPLICABLE; BUILD_ROADMAP §18: Not Started / In Progress / Blocked / Complete / Cut | Lead | Gates, asset QA |
| I-26 C | Gate A lacks lint | CLAUDE.md §18: "Lint passes." ADR-018 adds lint | TESTING_QA §13 Gate A has no lint item | Lead | Gates |
| I-27 C | Emulator name | CLAUDE.md §13, TECH_ARCH §21.4: "IWSDK desktop emulator" | TESTING_QA §3.2: "WebXR Emulator"; ADR-019 (edited today): "checked in IWER" (first use of that name in the docs) | Lead | QA wording |
| I-28 C | Event and version names | TECH_ARCH §8, §9: `MachineSolved`, `MachineStarted`; blueprint has no `version` | DATA §5: `version: number`; SIMULATION §13: `MachineCompletedEvent` | Lead | Contract freeze |

### 3.2 Specification gaps that block asset or production documents

| ID | Gap | Evidence | Needed from |
|---|---|---|---|
| G-01 | Is the Windmill wound? | SOLVER §12.2: "The Windmill uses ambient wind as its power source." PRODUCT_SPEC §10 and GAMEPLAY §10: "The player winds the machine." Nothing says what the player does for the Windmill | Owner |
| G-02 | Do winding key, base handle and casing count inside "Parts: 12"? | PRODUCT_SPEC §6.1, §3.7, §3.8 | Owner |
| G-03 | Which spring ships in Letter 1? | DATA §9.1: Letter 1 has no decoys. PRODUCT_SPEC §8: "The Music Box uses a worn spring." Letter 2: "It plays! But only for a moment." How the built Music Box gets a worn spring is not described | Owner |
| G-04 | Do placed machines run forever? | SIMULATION §10.1: stops when energy is exhausted. PROJECT_BIBLE §6: awakened machines "begin moving". Not reconciled (AUDIT_DOCS §4.4) | Owner |
| G-05 | Workbench position and footprint | PRODUCT_SPEC §3.2 "Large enough" counts only the town (60 x 40 cm). The workbench (about 45 x 25 cm, always full size, INTERACTION §3) and trunk (35 x 25 cm) share the stage root | Lead |
| G-06 | Are the velvet stand and the town base one asset? | ART §18 item 5 "Town base and plots (kept low ...)"; PRODUCT_SPEC §3.2 "the velvet stand is not shown" on a table; `blender/README.md` names one asset "Round walnut / velvet stand ("Tockton base")" | Lead |
| G-07 | Plot, machine, building and figure sizes | None written. INTERACTION §3: a machine "takes on the town's scale as it settles on its plot" | Lead |
| G-08 | Board dimensions do not fit | Music Box 0.24 x 0.14, Carousel 0.36 x 0.32, Windmill 0.34 x 0.34, Clock Tower 0.38 x 0.38 (and 0.72 m tall) add to about 0.41 m2; the town is 0.24 m2 (0.135 m2 at 75%) before bakery, theatre and streets (INF; sizes from the four machine boards in REFERENCE_INDEX) | Lead |
| G-09 | Where is the engraving shown? | PRODUCT_SPEC §13 lists 8 "preset engravings" and never says where they appear | Lead |
| G-10 | Who is the baker, and who are the other residents? | PRODUCT_SPEC §6.3 "Baker kneads"; boards name Oswald, Elias, Luna, Pip, Clack (REFERENCE_INDEX b14) | Owner |
| G-11 | Gear train, ratios, energy and drain for every machine | SOLVER §12.1 leaves constants open; no doc gives a train. Only the 10T-to-20T test mesh (SOL-03) and the 12T/24T repair appear | Lead (Agent 1/2) |
| G-12 | Blueprint data does not exist | No sockets, connections, trays or runtime handlers for any machine; "Final blueprint schema: Deferred" (DECISIONS §5) | Lead |
| G-13 | Clock Tower targets | SOLVER §15.4, DATA §8: "Do not invent" | Owner |
| G-14 | Decoys for Letters 2 and 5 | DATA §9.1 | Owner |
| G-15 | Daily repair content | PRODUCT_SPEC §8: only rules (after Letter 5, local-date seed, once per date); no repair, parts or machine defined | Owner |
| G-16 | The 3 finishes and 10 tooth counts | ART §11 | Owner / Lead |
| G-17 | Melody | "Fixed authored melody" (TECH_ARCH §18); notes, length and tune not specified; audio licensing (CREDITS §6) | Owner |
| G-18 | Numeric budgets | DECISIONS §5 Deferred; only ADR-023 limits | Lead |
| G-19 | What makes a decoy "visually distinguishable" | DATA §9.1, UI_UX §10 state the goal, give no rule | Lead |
| G-20 | Size and style of blueprint illustrations | PROJECT_BIBLE §11 and UI_UX §9 give intent only | Lead |

### 3.3 Verified consistent (do not re-open)

Palette hex values; 72/60 FPS; part counts 12/20/24/32; targets 0.4/0.5/0.6 rad/s and tolerances; Windmill 12T vs 24T about 2x; worn spring about 15% and about 1.5 s; snap 4 cm and 7 cm; removal 3 cm; X-ray 5 to 20 cm, 0.4 s, 15%; 90 degrees per unit, maximum 8; idle hint 20 s; ripple 1.5 s; theatre doors 30 s; `woundup.save`; `#g=` with `deflate-raw`; the 8 engravings; letter texts in PRODUCT_SPEC §7 and GAMEPLAY §5; `SolveStatus` / `SolveResult` in TECH_ARCH §10.2 and SOLVER §4, §6. Dates: internal 18 Nov, freeze 16 Nov, official 19 Nov 01:30 IST.

### 3.4 `AUDIT_DOCS.md` items: settled vs still open

| AUDIT_DOCS item | Status now | Evidence |
|---|---|---|
| X1 deployment plan | Decision made, file still wrong | ADR-022; I-20 |
| X3 / X4 layouts | Decision made (ADR-017), docs not updated | I-06, I-17 |
| X7 lint | Decided (ADR-018); Gate A text not updated | I-26 |
| X10 reach geometry | Settled by the PRODUCT_SPEC §3.2 rewrite | PRODUCT_SPEC §3.2 |
| B1 to B5, Y1 to Y4 | Settled | ADR-016 to 022, 026 |
| B2 repo owner and visibility | Settled: private repo `vishavmehra/wound-up` | ADR-022 |
| X2, X5, X8, X11, X14, X15, X16, X17, X19, X20, X23 | Still open | I-19, I-17, I-27, I-18, I-09/I-10, I-12, I-13/I-14, I-16, I-11, I-28, I-25 |
| X6, X12, X13, X21, X22 | Minor, unchanged; not re-listed | AUDIT_DOCS §3A |
| X18 (priority list vs cut order) | Overtaken by the daily-repair decision | section 5 |
| Z1 to Z3 (trunk, workbench, town sizes on boards) | Docs win, but REFERENCE_INDEX §b still omits them | section 2.12 |
| Z4 (governor missing on Music Box board) | Still open | I-08 |
| Z5, Z6 | Still open | I-23 |
| §4.4 later-phase gaps (spring constants, ambient wind, Clock Tower targets, decoys 2 and 5, tooth counts) | Still open | G-01, G-04, G-11, G-13, G-14, G-16 |
| "Suitable plane" undefined | Settled by PRODUCT_SPEC §3.2 | |

---

## 4. The 30 directive documents

### 4.1 Coverage and collisions

Coverage: **Mostly** = an existing file already holds most of the competition-scope content; **Seed** = adjacent text exists but for a different scope; **None**.

| # | Document | Coverage | Draw from | Collides with |
|---|---|---|---|---|
| 1 | PRODUCT_VISION_LONG_TERM | Seed | PROJECT_BIBLE §1, §2; PRODUCT_SPEC §1; IDEAS §4.1 to 4.8; APP_AND_WEBSITE §8 (awards) | CLAUDE.md §14, §20; CLAUDE.md §2 owner direction of 2026-11-05 ("New features must not destabilise core gameplay or compromise the 60 FPS minimum on Quest hardware"); REJ-004; IDEAS §7 (only Approved ideas enter a plan); CLAUDE.md §3 "Never invent requirements" |
| 2 | EXPANSION_ROADMAP | Seed | IDEAS §4; BUILD_ROADMAP §10, §16 | BUILD_ROADMAP is competition-only and ends 18 Nov; PRODUCT_SPEC §18 "forbidden in this competition build" |
| 3 | PRODUCT_PILLARS | Seed | PROJECT_BIBLE §1, §3.1; CLAUDE.md §20; APP_AND_WEBSITE §1 (five tests); GAMEPLAY §23; UI_UX §2; PRODUCT.md "Product Principles" | `PRODUCT.md` already has "Product Principles" for the landing only; avoid a name clash |
| 4 | PRODUCT_METRICS_AND_RETENTION | None | PRODUCT_SPEC §20 (success criteria); APP_AND_WEBSITE §5, §8 ("Best Reason to Come Back"); TESTING_QA §9 | **Direct:** CLAUDE.md §14 and §16 ("Do not add analytics or telemetry"); PRODUCT_SPEC §18; ADR-013; SAVE §16; XP, ranks, currency are also on the list |
| 5 | MASTER_SYSTEM_ARCHITECTURE | Mostly (`TECHNICAL_ARCHITECTURE.md`) | TECH_ARCH §3 to 25; CLAUDE.md §10, §11; ADR-017, 020, 023, 025 | TECH_ARCH §1 "Do not build a generic game engine"; §23 boundaries; DATA §2 item 8. Make it a map of TECH_ARCH plus extension points, not a rewrite |
| 6 | MECHANICAL_ENGINE_V2 | Seed | MECHANICAL_SOLVER_SPEC; SIMULATION_SPEC; IDEAS §4.3; board-only worm, chain, planetary, ratchet, flywheel, governor | SOLVER §8 allows five edge types only; SOLVER §2 "Do not use frame timing"; ADR-008, 009, REJ-001 (no rigid-body); PRODUCT_SPEC §18 "Carving cams", "Editing music pins"; contract change needs the lead (AGENT_WORKFLOW §14) |
| 7 | WORLD_SIMULATION_SPEC | Seed (machines only) | SIMULATION_SPEC; PROJECT_BIBLE §6; GAMEPLAY §14 | SIMULATION §16 non-goals; CLAUDE.md §14 (weekly commissions, seasons, festivals, grand theatre performance); CLAUDE.md §8, §12 (4 point lights, no heavy post) |
| 8 | RESIDENT_BEHAVIOUR_SPEC | None | IDEAS §4.1; SIMULATION §10.3 (baker); REFERENCE_INDEX character board and §b item 14 | PRODUCT_SPEC §7 "Do not add unnecessary dialogue or an unrelated story system"; CLAUDE.md §14 "AI/LLM gameplay calls", "Choreography"; boards' NPC dialogue bubbles flagged unscoped (REFERENCE_INDEX §c) |
| 9 | STORY_AND_QUEST_ENGINE | Seed | GAMEPLAY §4, §5; DATA §11, §12; PRODUCT_SPEC §7 | PRODUCT_SPEC §7 (above); DATA §12 "Do not create a second independent progression system"; DATA §2 item 8; "Weekly commissions" |
| 10 | SPATIAL_WORLD_SYSTEM | Mostly for G0 | PRODUCT_SPEC §3.2; TECH_ARCH §6.4; ADR-020, 026; INTERACTION §3, §19; SAVE §4.1; IDEAS §4.8 | ADR-026 (anchor only for the session); SAVE §4.1 and §5 (no coordinates, surfaces or anchor handles in the save); CLAUDE.md §14 passthrough vision; PROJECT_BIBLE §2 "Do not increase the world size"; comfort limits are fixed |
| 11 | CREATIVE_SANDBOX_SPEC | None | IDEAS §4.6; DATA §13 (validation); SOLVER | **Direct:** CLAUDE.md §14 "Free-build sandbox"; PRODUCT_SPEC §18 "Free-build workshop", "Melody composition", "Editing music pins", "Carving cams"; IDEAS §4.6 itself warns it "could undermine the curated puzzle experience" |
| 12 | BLUEPRINT_SHARING_SPEC | Seed (one-machine gift) | PRODUCT_SPEC §13; GAMEPLAY §16; TECH_ARCH §17; SAVE §13; DATA §15; ACCEPTANCE §13; IDEAS §4.5 | CLAUDE.md §14 "Whole-town gifting", "Accounts", "Cloud save", "Leaderboards"; ADR-011, 013; URL target under 1500 characters; untrusted-input rule (CLAUDE.md §16); APP_AND_WEBSITE §1 "take it away" test |
| 13 | MASTER_ASSET_INVENTORY | None | Section 2 of this report; ART §4, §11, §18; PROJECT_BIBLE §2, §7; CREDITS §5; blender/README.md | ART §18 scope protection ("Do not create decorative assets ... before the required gameplay assets are complete"); I-03 (what counts as one item) |
| 14 | GLB_ASSET_MANIFEST | None | DATA §4 (`visual.assetId`); ART §15 ("Keep asset identifiers consistent ..."); `src/assets.ts` (code, per ADR-017) | I-01, I-06 (IDs and names) |
| 15 | ASSET_NAMING_AND_FOLDER_STANDARDS | Mostly, but conflicting | ART §6, §15; TECH_ARCH §4, §19.1; ADR-017, 020; blender/README.md "Conventions" | CLAUDE.md §9 (see I-06); no `parts/` folder in ART §15 |
| 16 | BLENDER_PRODUCTION_GUIDELINES | Mostly | blender/README.md; ART §7 to 9, §16, §17; PROJECT_BIBLE §7; CLAUDE.md §6.6 | I-04 (script-only vs hand-modelled: README says "Nothing here is hand-placed in the GUI"; figures are hard to script); Blender MCP add-on not running (TOOLING_REGISTRY §17) |
| 17 | GLB_EXPORT_AND_VALIDATION | Mostly | ADR-023; ADR-020; ART §9; blender/README.md "Integrity checks" | No validator tool is named in any doc (grep: no "validator"); `blender/README.md` says `wu_common.py` has its own GLB inspector and the shipped files were parsed by hand |
| 18 | ASSET_OPTIMISATION_BUDGET | Seed | ADR-023; ART §12; blender/README.md "Budgets"; AUDIT_DOCS §4.3 R9; REFERENCE_INDEX b18 | DECISIONS §5 "A deferred decision must not be silently treated as accepted"; board numbers must not be used; I-05 |
| 19 | ASSET_REFERENCE_MAPPING | Mostly | REFERENCE_INDEX.md (27 boards mapped to specs) | I-23; the "docs win" rule is not in CLAUDE.md §3 |
| 20 | ASSET_PRODUCTION_ROADMAP | Seed | ART §18 (10-step priority); BUILD_ROADMAP | BUILD_ROADMAP schedules no Blender tasks for town assets (AUDIT_DOCS §5.2); freeze 16 Nov; ART §18; CLAUDE.md §2 deadline discipline |
| 21 | ASSET_AGENT_ASSIGNMENTS | Seed | CLAUDE.md §10 (Agents 2, 4); AGENT_WORKFLOW §5 (Agent B, E); TECH_ARCH §24 | I-17; CLAUDE.md §10 "Do not create agents merely to increase agent count"; AGENT_WORKFLOW §6 exclusive ownership |
| 22 | MASTER_PRODUCTION_ROADMAP | Mostly for G0 | BUILD_ROADMAP; CLAUDE.md §17 | I-18; DECISIONS §8 (owner decides cuts); the competition track must stay separate and protected |
| 23 | AGENT_OWNERSHIP_MATRIX | Seed | CLAUDE.md §10; AGENT_WORKFLOW §6; TECH_ARCH §24; ADR-017; README "Layout" | I-17; the process that owns `src/landing/**`, `DESIGN.md`, `tests/e2e/landing.spec.ts` appears in no document |
| 24 | INTEGRATION_AND_RELEASE_GATES | Mostly | TESTING_QA §13 (Gates A to D); ACCEPTANCE §16, §17, §18 (judging checklist JUD-01 to 21); AGENT_WORKFLOW §10, §15; COMPETITION §10 | I-25, I-26; no asset gate exists |
| 25 | ASSET_QA_CHECKLIST | Seed | ART §9, §16, §17; PROJECT_BIBLE §7.3; TESTING_QA §8; ACCEPTANCE §14; blender/README.md "Integrity checks" | None; consolidation |
| 26 | MULTI_WORLD_UNIVERSE_DESIGN | None | PROJECT_BIBLE §1, §2; IDEAS §4.2 | **Direct:** CLAUDE.md §14 "Tram", "Lighthouse", "Hot-air balloon", "Grand theatre performance"; PRODUCT_SPEC §18; ADR-001 (the world is Tockton); PROJECT_BIBLE §2 "not a large open environment" |
| 27 | WORLD_REGISTRY_AND_LOADING | None | TECH_ARCH §19, §20; ART §15; DATA §2, §16; `src/assets.ts` | CLAUDE.md §12 (no off-screen rendering, geometry caching); ADR-023, 025; TECH_ARCH §1 |
| 28 | WORLD_PROGRESSION_SYSTEM | Seed | GAMEPLAY §4; DATA §12; SAVE_PERSISTENCE | SaveV1 is Tockton-only, so multi-world needs SaveV2 and a migration (SAVE §10); CLAUDE.md §14 rarity, XP, ranks, currency; DATA §12 one progression authority |
| 29 | CROSS_WORLD_GAMEPLAY | None | PRODUCT_SPEC §6.3 (Windmill wakes Bakery); DATA `wakes` | CLAUDE.md §14 multiplayer, currency, shops; APP_AND_WEBSITE §1 "take it away" test |
| 30 | WORLD_ASSET_INVENTORY | None | MASTER_ASSET_INVENTORY (Tockton section); IDEAS §4.2 | ART §18; the directive's own rule that future worlds never enter the competition path |

### 4.2 ADRs to record before the documents are written

Next free number is ADR-027 as read; the other process may take it, so check at write time.

| Proposed ADR | Settles | Overrides or clarifies |
|---|---|---|
| A. Classification labels and the competition firewall | G0 to G5 and Research labels; G1 to G5 and future worlds never enter the competition path; CLAUDE.md §14 is read as competition-build scope; sandbox, community and metrics docs are design intent only | CLAUDE.md §3, §14; PRODUCT_SPEC §18; IDEAS §1, §5, §7; REJ-004; ADR-001, 013 |
| B. Written spec beats reference image | Docs win on counts, dimensions, ratios, interactions; images guide appearance only; add REFERENCE_INDEX to the CLAUDE.md §3 list | REFERENCE_INDEX header; I-23 |
| C. What counts as one GLB, and who builds parts | Distinct geometry vs finish; procedural TypeScript vs Blender for the part library | ART §5, §11; PROJECT_BIBLE §7; CLAUDE.md §10 Agent 2; CREDITS §5 |
| D. Asset naming and folders | One scheme for IDs, files, nodes, materials; add a parts folder; Windmill classification | CLAUDE.md §9; ART §6, §15; TECH_ARCH §4, §19.1; ADR-017 |
| E. Provisional asset budgets and material strategy | Numbers to accept; how shared materials work without KTX2 | ADR-023; DECISIONS §5 |
| F. Measuring retention without telemetry | Manual or local-only measures during the competition; any real analytics only after the competition and with a new ADR | ADR-013; CLAUDE.md §14, §16 |
| G. SaveV2, multi-world save, persistent anchors | Schema, migration, whether anchor ids may ever be stored | SAVE §4.1, §5, §10; ADR-026; IDEAS §4.8 |
| H. Mechanical engine v2 contract | New connection types and how they stay deterministic and non-physical | SOLVER §8; ADR-008, 009; DATA §7 |
| I. Agent roster and ownership | One scheme; asset agents; owner of `src/landing/**` and DESIGN.md | CLAUDE.md §10; AGENT_WORKFLOW §5, §6; TECH_ARCH §24 |

---

## 5. Pending edits from the concurrent process (not findings)

State when I last looked (12:20 on 2026-11-06; no doc had changed since 12:08:36). Re-check before relying on any row.

| Owner decision | Applied in | Not yet applied |
|---|---|---|
| Table detection and anchoring is core, stand is the fallback | PRODUCT_SPEC §2, §3.2, §19; TECH_ARCH §3, §6.4; COMPETITION §3.4; ACCEPTANCE §4.1; BUILD_ROADMAP §5A; CLAUDE.md §2, §10, §13, §17; GAMEPLAY §22; ADR-026 | None found in the docs I read |
| Stand about 38 cm below the eyes, 55 cm ahead | PRODUCT_SPEC §3.2; INTERACTION §3; ACCEPTANCE §4.2 (STAND-01 to 05); BUILD_ROADMAP TP-6; ADR-019 (rewritten); APP_AND_WEBSITE §6, §9 | Code change is task TP-6 (`STAND_BELOW_EYE_M` 0.45 to 0.38, per ADR-019). `AUDIT_DOCS.md` is historic |
| Daily repair protected; Clock Tower and day/night cut first | ACCEPTANCE JUD-09 counts a daily repair as a judging item; AGENT_WORKFLOW Agent F now lists "Daily repair"; APP_AND_WEBSITE §6 opening line says items 1 to 3 are approved | The cut order still reads Clock Tower, day/night, daily repair in PRODUCT_SPEC §19, BUILD_ROADMAP §16 and GAMEPLAY §22. PRODUCT_SPEC §5 still has F12 "daily Should". CLAUDE.md §2 still says daily repair "may be cut". ACCEPTANCE §17 still groups it with cut features. APP_AND_WEBSITE §6 item 2 is still worded as a recommendation |

---

## 6. Questions that need the owner

1. What does "Parts: 12 / 20 / 24 / 32" count: unique part IDs, socket slots, or physical pieces? (I-08, G-02)
2. Is a finish (brass, walnut, third) a separate GLB or a runtime material? Is the 180 to 200 estimate meant to include finishes? (I-03)
3. Which two module values and which ten tooth counts? (G-16)
4. Is the Windmill wound by the player, or driven only by ambient wind? (G-01)
5. Which spring is in the Letter 1 tray, and how does the worn spring arrive in Letter 2? (G-03)
6. Do you have the original Technical Design Doc, or should CLAUDE.md §3 stop naming it? (I-19)
7. Is CLAUDE.md §14 permanent or competition-only? (I-24)

## 7. What I did not check

- Contents of the 27 images (only the index was read).
- Source code agreement with the docs.
- Whether the three owner decisions have been applied fully; section 5 is a snapshot.
- IWSDK behaviour; no API was touched.
