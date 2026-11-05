# Wound Up — Documentation Audit for M0 (Working WebXR Foundation)

**Date:** 2026-11-05 (Thu) · **Mode:** read-only · **Read in full:** `CLAUDE.md`, `README.md`, and the 22 other files in `docs/` (21 present when I started + `REFERENCE_INDEX.md`, which another actor added at 19:16 while this audit ran; this matches the brief's "22"). All 23 originals were re-hashed at 19:28 and are unchanged since I read them. **Not viewed by me:** the 27 PNGs in `References/` (~68 MB); I rely on `REFERENCE_INDEX.md` for their content. A partial IWSDK scaffold (`vite.config.ts`, `iwsdk.config.json`, `tsconfig.json`, `.nvmrc`, `src/`, `public/`, `tests/`, `blender/`) also appeared at 19:24; I read those config files read-only (see §3B). I created nothing except this file.

Tags: **DOC** = stated in a repo doc, cited `FILE §section` · **INF** = my inference or recommendation, not in any doc · **PROBE** = read-only environment check run during this audit.

---

## 0. Headline findings

1. **No deployment plan exists.** `docs/DEPLOYMENT_RELEASE_PLAN.md` is byte-identical to `docs/SIMULATION_SPEC.md` (SHA-256 `eebb40d5d134fedb66f5589c9ba162ea218e3ead7bd4032a6ee3fb8b383ee5ba`, `cmp` identical, zero hits for "github pages / base path / vite / workflow / https"). No doc references the filename. Probably a paste error (INF). M0 item 12 rests only on generic rules in TECH_ARCH §22, COMPETITION §3.2, ACCEPTANCE APP-07/08.
2. **Three docs named in CLAUDE.md §3 are missing**: `GAMEPLAY_AND_INTERACTION.md`, `CONTENT_AND_BLUEPRINTS.md`, and the original Technical Design Doc in `docs/reference/`. CLAUDE.md §3 and README call that TDD the authoritative spec. `docs/ASSET_PIPELINE.md` (CLAUDE.md §9) also does not exist (it is `ART_ASSET_PIPELINE.md`).
3. **Tooling is almost entirely unspecified**: no bundler, package manager, lint tool, script names, exact IWSDK/Three.js/TS/Vitest/Playwright versions, WebXR feature list, reference space, base-path string, or numeric draw-call/triangle/texture budget. Verified by grep. DECISIONS §5 defers build tooling, IWSDK APIs and budgets. The generated scaffold now answers some of this in practice (Vite, `strict: true`, emulator config, `base: './'`; see §3B), but not lint, scripts, versions, or budgets.
4. **Directory layouts conflict** across CLAUDE.md §9-10, TECH_ARCH §4, AGENT_WORKFLOW §6, ART §6/§15 (see §3, X3-X5).
5. **Phase 0 exit criteria are not met** (BUILD_ROADMAP §3: "documentation is internally consistent", "tool availability is known"): §3 logs 33 items (23 doc-vs-doc, 4 starter-vs-docs, 6 boards-vs-docs) on top of the 18 image discrepancies already listed in `REFERENCE_INDEX.md` §b; TOOLING_REGISTRY §17 is entirely "Not checked"; DECISIONS ends at ADR-015.
6. **The schedule has already lost a day.** Phase 0 and Phase 1 are both due Nov 4-5 (BUILD_ROADMAP §3-4). At 19:28 on Nov 5 there is still no git repo, no `package.json` and no `index.html`; only config files from the official generator have appeared (partial scaffold, §3B).
7. **Environment (PROBE):** Node v24.18.1 (meets >= 20.19; scaffold `.nvmrc` pins 22.12.0), npm 11.16.0, git 2.55.0, gh 2.102.0 logged in as `Alivestars24` (https). `.claude/settings.local.json` pre-approves only `npm -v` and `git --version`, so other commands (npm create/install, git init, gh repo create) will prompt.
8. **`REFERENCE_INDEX.md` (new) is unreferenced by any doc** and not named in CLAUDE.md §3. It records that all 27 boards are AI-generated and lists 18 image-vs-doc discrepancies; it missed several dimension conflicts (§3C). `CREDITS.md` §8 (AI-generated assets) has no entry for the boards.

---

## 1. Doc map

### 1.1 Docs named by CLAUDE.md §3 vs disk

| CLAUDE.md §3 item | On disk? | Most likely replacement |
|---|---|---|
| 1 `PROJECT_BIBLE.md` | yes | |
| 2 `PRODUCT_SPEC.md` | yes | |
| 3 `COMPETITION_REQUIREMENTS.md` | yes | |
| 4 `TECHNICAL_ARCHITECTURE.md` | yes | |
| 5 `GAMEPLAY_AND_INTERACTION.md` | **NO** | `GAMEPLAY_SYSTEMS.md` + `INTERACTION_SPEC.md` (AGENT_WORKFLOW §5 Agent D cites INTERACTION_SPEC; DATA §11 and UI_UX §8 cite GAMEPLAY_SYSTEMS) |
| 6 `SIMULATION_SPEC.md` | yes (also duplicated as DEPLOYMENT_RELEASE_PLAN.md) | solver detail lives in `MECHANICAL_SOLVER_SPEC.md` |
| 7 `CONTENT_AND_BLUEPRINTS.md` | **NO** | `DATA_AND_BLUEPRINT_SPEC.md` (schemas, letters, progression data); content facts in PRODUCT_SPEC §6-8 and GAMEPLAY_SYSTEMS §5 |
| 8 `ACCEPTANCE_TESTS.md` | yes | |
| 9 `BUILD_ROADMAP.md` | yes | |
| 10 `AGENT_WORKFLOW.md` | yes | |
| 11 `DECISIONS.md` | yes | |
| 12 `docs/reference/` original TDD | **NO** (dir absent) | none. README says the pack "translates its requirements"; PRODUCT_SPEC, TECH_ARCH, COMPETITION_REQUIREMENTS carry that translation. Ask the owner for the TDD or for confirmation that the docs supersede it. |
| (§9) `docs/ASSET_PIPELINE.md` | **NO** | `ART_ASSET_PIPELINE.md` |

On disk but not in §3: GAMEPLAY_SYSTEMS, INTERACTION_SPEC, DATA_AND_BLUEPRINT_SPEC, MECHANICAL_SOLVER_SPEC, ART_ASSET_PIPELINE, UI_UX_SPEC, SAVE_PERSISTENCE_SPEC, TESTING_QA_PLAN, DEPLOYMENT_RELEASE_PLAN (duplicate), CREDITS, IDEAS, TOOLING_REGISTRY (the last three are named elsewhere in CLAUDE.md §3/§6/§9/§16), and the new REFERENCE_INDEX (named nowhere).

### 1.2 Every doc on disk

| File | Purpose | Authoritative for |
|---|---|---|
| `CLAUDE.md` | operating manual: role, deadline, stack, tool policy, IWSDK no-guess rule, visual rules, agent ownership, phases, DoD | process, stack table (§5), palette/lighting (§8), ownership (§10), phases (§17), task acceptance (§18) |
| `README.md` | pack readme (copy files into new `wound-up` repo; audit first) | nothing; will be replaced (COMPETITION §9 requires a real README) |
| `PROJECT_BIBLE` | identity, Tockton, art direction, palette, materials, frozen/awake, lighting, audio, UI tone | visual rules, town dimensions (§2) |
| `PRODUCT_SPEC` | flow, F1-F18, machines, letters, repairs, build/wind/X-ray/gift/save/pause rules, cut order | product scope and numbers |
| `COMPETITION_REQUIREMENTS` | competition rules turned into product/dev/submission requirements | delivery (HTTPS, subpath, session entry), submission checklist; does not override PRODUCT_SPEC (§1) |
| `TECHNICAL_ARCHITECTURE` | layers, folder tree, lifecycle, AR/VR/desktop paths, state, solver/persistence/gift/audio/perf/test/deploy contracts | architecture contracts, `SaveV1` (per GAMEPLAY §17) |
| `GAMEPLAY_SYSTEMS` | loop, modes, progression, letters (text), part/snap/winding/repair/placement/X-ray/gift rules; §22 priority + cut | gameplay rules, letter text |
| `INTERACTION_SPEC` | input abstraction, pinch/grab, snap, removal, winding, X-ray, gaze, desktop input, priorities | interaction thresholds |
| `DATA_AND_BLUEPRINT_SPEC` | part/blueprint/socket/connection/target/tray/letter/progression/save/gift contracts | (conceptual) schemas, decoy policy, unlock rules |
| `MECHANICAL_SOLVER_SPEC` | pure-TS solver rules, outcome priority, loop detection, spring maths | solver behaviour, machine targets |
| `SIMULATION_SPEC` | runtime states, SolveResult consumption, animation, audio table, town events | runtime presentation of solver output |
| `ART_ASSET_PIPELINE` | Blender to GLB, materials, 120+ variant target, runtime paths | asset conventions |
| `UI_UX_SPEC` | UI principles, landing, letter, tray, feedback, gift viewer, pause, comfort | UI/UX, landing content |
| `SAVE_PERSISTENCE_SPEC` | localStorage service, validation, migration, reset | persistence detail; subordinate to PRODUCT_SPEC §14 by its own §3 |
| `ACCEPTANCE_TESTS` | test IDs APP/PROG/INT/SOL/WIND/TOWN, checklists, release blockers | acceptance criteria |
| `TESTING_QA_PLAN` | environments, pyramid, P0-P3, gates A-D, evidence format | test process; Gate A = M0 |
| `BUILD_ROADMAP` | 13 dated phases, cut strategy, dependencies | schedule |
| `AGENT_WORKFLOW` | roles A-G, ownership example, task and report formats, escalation | process |
| `DECISIONS` | ADR-001..015, deferred table (§5), REJ-001..004, change control | accepted decisions only (§2) |
| `IDEAS` | backlog and exclusions | nothing in scope |
| `CREDITS` | attribution template, all placeholders | licence tracking |
| `TOOLING_REGISTRY` | candidate tools; audit table all "Not checked" (§17) | nothing (unverified template) |
| `DEPLOYMENT_RELEASE_PLAN` | **duplicate of SIMULATION_SPEC** | nothing |
| `REFERENCE_INDEX` (added 19:16) | index of the 27 AI-generated boards in `References/` with M0 / Music Box / Later priority, 18 image-vs-doc discrepancies, AI-artefact warnings, palette check, "Milestone-1 picks" | nothing: it states "written specs in docs/ win over any image"; it is the only place image-derived numbers are recorded |

SIMULATION_SPEC, SAVE_PERSISTENCE_SPEC, TESTING_QA_PLAN, IDEAS, TOOLING_REGISTRY and DEPLOYMENT_RELEASE_PLAN all begin with two blank lines, so they look like a later generation batch (INF).

### 1.3 Documented precedence rules (there is no full ranking)

- CLAUDE.md §3: original TDD is authoritative (missing); competition's official rules are authoritative for submission; ambiguity procedure = search TDD, inspect implementation, official docs, simplest implementation meeting acceptance criteria, log in DECISIONS.
- COMPETITION §1: competition requirements do not override PRODUCT_SPEC scope.
- IDEAS §1: authoritative scope = PROJECT_BIBLE, PRODUCT_SPEC, GAMEPLAY_SYSTEMS, DATA_AND_BLUEPRINT_SPEC, BUILD_ROADMAP, DECISIONS.
- SAVE §3: persisted fields must stay consistent with the product spec. GAMEPLAY §17: `SaveV1` is defined in TECH_ARCH.
- DATA §11, UI_UX §8: letter text must match GAMEPLAY_SYSTEMS.
- DECISIONS §2, §5, §7, §8: only Accepted ADRs are rules; Deferred is not Accepted; update all affected docs; project owner decides.
- AGENT_WORKFLOW §14: two specs conflict means stop and ask the lead.
- TECH_ARCH §4 and CLAUDE.md §7: the generated IWSDK starter wins over the folder tree.
- Global `~/.claude/CLAUDE.md` §11: project CLAUDE.md overrides generic instructions.
- **No doc ranks PRODUCT_SPEC vs TECH_ARCH vs GAMEPLAY_SYSTEMS.** INF: PRODUCT_SPEC for product semantics, TECH_ARCH for technical contracts, CLAUDE.md for process; log an ADR (next id ADR-016) for every pick.

---

## 2. What the docs specify that constrains M0 / Phase 1 (DOC unless tagged)

### 2.1 Stack and versions
- CLAUDE.md §5 table: Quest 3/3S; WebXR; **IWSDK 1.x**; Three.js through IWSDK; **TypeScript strict**; **Node >= 20.19**; build = "Official IWSDK starter/build tooling"; Vitest; Playwright; Chrome DevTools; Git + GitHub; GitHub Pages; Web Audio; localStorage; Blender; pure-TS simulation; browser-native compression. TECH_ARCH §2.1 repeats it (adds glTF/GLB); ADR-003/004/005/006.
- Use the official IWSDK mixed-reality generator; do not replace the starter without strong justification (CLAUDE.md §5). No Unity/Unreal/APK/backend/paid services (CLAUDE.md §5, §14; TECH_ARCH §23; ADR-013).
- Record exact versions in manifest + lockfile; no casual major upgrades (TECH_ARCH §2.1).
- IWSDK API rule (CLAUDE.md §7; TECH_ARCH §2.2): read iwsdk.dev and iwsdk.dev/skill.md, inspect installed package and typings, verify against installed version, build a minimal example, test in emulator, only then integrate. "The generated official starter is our reference implementation."
- Not specified anywhere: IWSDK/Three.js/TS/Vitest/Playwright versions, bundler, package manager (only `package-lock.json` in TECH_ARCH §4 hints npm), lint, formatter.

### 2.2 Repo, layout, ownership
- Repo `wound-up` (CLAUDE.md header; README step 1). Current folder is not a repo (PROBE).
- Target tree: TECH_ARCH §4 ("similar to… adapt to the actual IWSDK starter"; "not permission to create empty folders").
- Ownership: CLAUDE.md §10. Agent 0 (Lead) owns `CLAUDE.md`, `src/main.ts`, shared integration and config; "package/config changes controlled by the lead" (rule 4); never let agents modify the main entrypoint (rule 9). No parallel agents before shared contracts and file ownership are clear (CLAUDE.md §19; AGENT_WORKFLOW §3, §9). **For M0 everything is Lead-only.**
- AGENT_WORKFLOW §3 audit list: structure, docs, manifests, actual IWSDK version, build/test commands, MCP/skills, Blender version, deployment config, doc-vs-implementation gaps.

### 2.3 Build, hosting, base path
- Build tool: unspecified (CLAUDE.md §5 "starter tooling"; DECISIONS §5 "Deferred: confirm from starter project").
- Host: GitHub Pages over HTTPS (CLAUDE.md §5; TECH_ARCH §22; ADR-004; PRODUCT_SPEC §2 "Static client-side application").
- TECH_ARCH §22 / COMPETITION §3.2: support the repository base path; all static assets resolve; no dependency on local dev paths; clean public entry URL; tested after deployment and from a clean browser session; "do not assume root-relative asset paths will work on a repository subpath"; use the build tool's supported base-path config. ACCEPTANCE APP-07 (reload deployed page), APP-08 (open from repository subpath).
- The base-path string is not documented. INF: `/wound-up/` from the repo name; URL `https://<owner>.github.io/wound-up/` with owner undecided.
- Gift links use the hash `#g=` (PRODUCT_SPEC §13), so Pages needs no rewrite rules (INF).
- BUILD_ROADMAP §4 critical proof: "A simple object must be interactable in the development environment and the application must be deployable to a public HTTPS URL."

### 2.4 Test runner, lint, commands, definition of done
- Vitest for pure logic, Playwright for browser journeys, IWSDK desktop emulator for manual hand flows (CLAUDE.md §13; TECH_ARCH §21; TESTING_QA §3-4).
- **No config, script names, thresholds, or lint tool anywhere.** Test dirs: TECH_ARCH §4 `tests/{unit,integration,e2e}`; CLAUDE.md §10 `tests/sim/**`; AGENT_WORKFLOW §8 `tests/unit/solver/`.
- CLAUDE.md §18 "complete" = implementation, tests pass, typecheck, **lint**, build, emulator behaviour verified, acceptance criteria pass, no critical regression; report = task, summary, files, tests, exact results, screenshots, issues, next task; never fabricate results. AGENT_WORKFLOW §12 has a report template.
- TESTING_QA §13 **Gate A (Foundation)** = application starts; TypeScript checks; production build succeeds; desktop fallback works; basic interaction works.
- BUILD_ROADMAP §4 exit = application starts; production build succeeds; desktop preview works; IWSDK lifecycle understood; minimal interaction verified; public deployment path proven.

### 2.5 Landing screen
- PRODUCT_SPEC §3.1: title, tagline, Enter. UI_UX §5: title, short tagline, concise description, clear Enter, visual preview of Tockton. COMPETITION §3.3: identity, premise in concise text, Enter, explain the immersive entry path when needed, no registration or setup.
- Exact tagline: "Build the machines. Wake the town. Raise the curtain." (UI_UX §5; CLAUDE.md header).
- Enter order: immersive-ar if supported, else immersive-vr if supported, else desktop 3D preview; "do not block the player with unnecessary setup screens" (PRODUCT_SPEC §3.1).
- Look: cream paper, walnut frames, brass details, teal accents, warm highlights, restrained type, "large display treatment for the project identity"; avoid neon, gradients, generic HUDs (UI_UX §3-4). Fonts must stay readable; no font family is named; CREDITS §7 requires font licences.
- Gaps: no authored description copy, no font, no preview art.

### 2.6 XR session modes, features, fallback

| Item | Documented status | Source |
|---|---|---|
| immersive-ar | first choice "when supported"; "preferred when supported and appropriate"; table is the spatial reference when capabilities exist | PRODUCT_SPEC §3.1; TECH_ARCH §6.1 |
| immersive-vr | second choice; miniature on a floating velvet stand | PRODUCT_SPEC §3.1; TECH_ARCH §6.2 |
| desktop 3D preview | third; must be "useful"; mouse + keyboard map to the same gameplay actions; must eventually allow assembly, snapping, placement, gifting, save/load | PRODUCT_SPEC §3.1; COMPETITION §3.2; TECH_ARCH §6.3; INTERACTION §15; ADR-012; ACCEPTANCE INT-11 |
| hand tracking | primary input; "visible hands when supported"; controllers optional, never required | PRODUCT_SPEC §2; INTERACTION §1, §5; REJ-003. No feature string documented. |
| plane / table detection | best effort. If no suitable plane: floating velvet stand ~45 cm below eye level, ~55 cm ahead. "Suitable plane" is undefined. | PRODUCT_SPEC §3.2; CLAUDE.md §13 |
| anchors | not mentioned anywhere. SAVE §4.1: never persist headset coordinates as world truth | SAVE_PERSISTENCE §4.1 |
| reference space | only "Reference spaces" listed as an IWSDK built-in; type (local / local-floor) unspecified; seated, stationary | TECH_ARCH §2.2; PRODUCT_SPEC §2 |
| session start | must come from a valid user action | COMPETITION §3.2; TECH_ARCH §5 steps 7-8 |
| unsupported modes | handle gracefully | COMPETITION §3.2; ACCEPTANCE APP-03 |
| lifecycle | follow IWSDK's; no parallel session manager | TECH_ARCH §5 |
| session exit | return to a valid state | ACCEPTANCE APP-06 (Hardware) |
| passthrough camera processing | forbidden | CLAUDE.md §14 |

The emulator is named "IWSDK desktop emulator" (CLAUDE.md §13; TECH_ARCH §21.4) or "WebXR Emulator" (TESTING_QA §3.2). **"IWER" appears in no doc.** CLAUDE.md §7 forbids guessing emulator commands. The generated `iwsdk.config.json` has a `dev.emulator` block (`device: "metaQuest3"`, `environment: "sunlit_living_room"`), which is the starter-provided emulator config (PROBE, §3B).

### 2.7 Performance budgets
- **72 FPS target, never below 60** (CLAUDE.md §12; PROJECT_BIBLE §13; PRODUCT_SPEC §2; COMPETITION §6; TECH_ARCH §20; ACCEPTANCE §15).
- Qualitative rules only: cache geometry, share materials, instance, merge static geometry, no per-frame allocation, few lights, no expensive shadows, no expensive post-processing, avoid transparency, profile on target hardware (CLAUDE.md §12; TECH_ARCH §20; ART §12).
- **No numeric draw-call, triangle, texture-memory, bundle-size or load-time budget exists in any spec.** DECISIONS §5: "Final asset polygon budgets / texture budgets: Deferred". The only numbers in the repo are printed on AI-generated boards (REFERENCE_INDEX rows 1 and 3: hero 10-20k, gameplay 5-10k, distant 2-5k triangles; gear LODs 3,200 / 1,200 / 400); REFERENCE_INDEX §b item 18 says not to treat them as targets. ACCEPTANCE §15 lists what to check, no thresholds, and says to record device, browser, build, scene and method. Desktop FPS is not Quest evidence (CLAUDE.md §12; COMPETITION §6; ACCEPTANCE §15; TESTING_QA §7).

### 2.8 Palette, material, lighting
- Palette (identical in CLAUDE.md §8, PROJECT_BIBLE §4, ART §3): aged brass `#C9A227`, walnut `#5B3A24`, cream `#F2E6CF`, deep teal `#1F5C5C`, warm lamp glow `#FFC66D`. Use "consistently across world, UI, models, particles and lighting"; do not use every colour equally.
- Materials (PROJECT_BIBLE §5; CLAUDE.md §8): aged and polished brass, walnut, cream enamel, teal paint, warm glass, paper, fabric, subtle emissive; bevelled edges; "do not make everything metallic"; avoid default Three.js primitive look, plastic look, neon, heavy bloom.
- **Lighting baseline:** one hemisphere light + one directional light; no real-time shadows on moving mechanical parts; blob-shadow decals; no expensive post-processing; night mode = lower ambient + emissive windows + max 4 point lights (CLAUDE.md §8; PROJECT_BIBLE §8; ART §13). Documents are silent on environment maps / image-based lighting.
- Frozen ~0.15 saturation + cool tint; awakened full colour; wake ripple ~1.5 s (CLAUDE.md §8; PROJECT_BIBLE §6).
- Lighting must not be uncomfortable or hide objects (PROJECT_BIBLE §8). No forced camera motion, no locomotion (PROJECT_BIBLE §12).

### 2.9 Dimensions for the test environment
- Trunk 35 x 25 x 20 cm (PRODUCT_SPEC §3.2). Town <= ~60 x 40 cm; workbench ~45 x 25 cm; important interactions within ~60 cm of the chest (PROJECT_BIBLE §2; INTERACTION §3). Targets within ~35 degrees of head-forward (INTERACTION §3; COMPETITION §4.3).
- Fallback stand: ~45 cm below eye, ~55 cm ahead (PRODUCT_SPEC §3.2).
- Min grab collider radius ~1.2 cm; do not enlarge the visible mesh (INTERACTION §7.2). Snap 4 cm / Easy 7 cm; removal > 3 cm.
- Units, handedness, up-axis and origin conventions are **not defined** (DATA §6 demands a "documented coordinate convention" but none exists).

### 2.10 Acceptance tests tied to M0

| ID | Requirement (ACCEPTANCE §4/§6) | Type | Verifiable at M0? |
|---|---|---|---|
| APP-01 | landing loads, no critical errors | Browser | yes |
| APP-02 | Enter follows supported entry path | Browser/Emulator | yes |
| APP-03 | WebXR unavailable gives desktop preview or clear fallback | Browser | yes |
| APP-04 | AR supported: AR requested via verified framework flow | Hardware | emulator evidence only; Hardware Blocked |
| APP-05 | AR unavailable, VR supported: fallback offered | Hardware | emulator evidence only; Hardware Blocked |
| APP-06 | exit session returns to valid state | Hardware | emulator evidence only; Hardware Blocked |
| APP-07 | reload deployed page | Browser | after deploy |
| APP-08 | open from repository subpath, all assets load | Browser | yes (local preview under subpath, then deployed) |
| INT-01/02 | pinch / hold selected object | Emulator/Hardware | with test object, emulator only |
| INT-11 | desktop controls use same gameplay rules | Browser | principle only |

Rules: "A desktop test must never be reported as a successful Quest hardware test" (ACCEPTANCE §2). Blocked tests need reason + unblock action; record build/commit, environment, date, evidence (ACCEPTANCE §3; TESTING_QA §11).

### 2.11 Guard rails that touch M0
No analytics/telemetry (CLAUDE.md §16; ADR-013); avoid unnecessary network requests, so no CDN fonts or scripts (CLAUDE.md §16, §6.9; SIMULATION §11 "use local assets"); no paid service without approval (CLAUDE.md §15); record dependency licences (CREDITS §3-4, §11); no sound at startup, audio only after user interaction (ACCEPTANCE §14; TECH_ARCH §18); no secrets committed (CLAUDE.md §16).

---

## 3. Contradictions and inconsistencies

"Resolution" follows the documented precedence in §1.3; where none exists I say so and mark the pick INF. **M0** = affects M0.

### 3A. Doc vs doc, doc vs CLAUDE.md

| # | A says | B says | Resolution | M0 |
|---|---|---|---|---|
| X1 | `DEPLOYMENT_RELEASE_PLAN.md` should be the deployment plan | file is byte-identical to `SIMULATION_SPEC.md` | Treat deployment plan as missing; author via ADR (Lead) | yes |
| X2 | CLAUDE.md §3 names `GAMEPLAY_AND_INTERACTION.md`, `CONTENT_AND_BLUEPRINTS.md`, `docs/reference/` TDD; §9 names `docs/ASSET_PIPELINE.md` | none exist; 12 docs on disk are not in §3 | Use the §1.1 mapping; Lead owns CLAUDE.md (§10), update §3 after owner OK; request the TDD | yes |
| X3 | CLAUDE.md §10: `src/main.ts`, `src/sim`, `tests/sim`, `src/parts`, `src/content/{parts,blueprints}`, `src/interaction`, `src/town`, `src/audio` | TECH_ARCH §4: `src/{app,core,world,interaction,gameplay/{solver,…},data/{…},audio,ui,styles}`, `tests/{unit,integration,e2e}`, no `src/main.ts`. AGENT_WORKFLOW §6/§8: `src/app`, `src/gameplay/solver`, `src/world`, `tests/unit/solver` | TECH_ARCH §4 and AGENT_WORKFLOW §6 call themselves "recommended"/"example" and defer to the starter. CLAUDE.md §10 is the only "Owns:" text and project CLAUDE.md outranks generic. INF: take CLAUDE.md §10 names for owned dirs, TECH_ARCH names for the rest, map the starter's entry file to the `src/main.ts` ownership; ADR before any parallel agent | yes |
| X4 | CLAUDE.md §9: `assets/{blender,models,materials,references}` | TECH_ARCH §4 + ART §6/§15: `blender/{source,exports,materials,references}` and `public/assets/{models/*,textures,audio,fonts}`; actual `References/` at root (27 PNG, ~68 MB) matches neither | Two docs agree on TECH_ARCH/ART; `public/` is what a static host serves (INF). Runtime assets in `public/assets/**`, sources in `blender/**`, `References/` renamed or untracked; never into `public/` or the Pages artifact. The scaffold already uses `blender/{source,exports,scripts}` and `public/assets` (Y4) | yes |
| X5 | CLAUDE.md §10: Agents 0-4 (Lead, Sim, Parts, Interaction, Town+Audio) + optional gameplay/QA | TECH_ARCH §24 and AGENT_WORKFLOW §5: Lead + Agents A-G (bootstrap, Blender, solver, assembly, town, progression/persistence, QA/deploy). Audio and "procedural parts" exist in only one scheme | Project CLAUDE.md governs. Irrelevant at M0 (Lead-only) | no |
| X6 | PRODUCT_SPEC §3.1 landing = title, tagline, Enter | UI_UX §5 adds description + Tockton preview; COMPETITION §3.3 adds "explain immersive entry path" | Union; no conflict, just uneven detail | yes |
| X7 | CLAUDE.md §18.4 (and global §2): "Lint passes" is part of done | AGENT_WORKFLOW §15 and TESTING_QA Gate A omit lint; no lint tool is named | CLAUDE.md is higher; add lint to Gate A and pick the tool (INF) | yes |
| X8 | CLAUDE.md §13 / TECH_ARCH §21.4: "IWSDK desktop emulator" | TESTING_QA §3.2: "WebXR Emulator"; brief says "IWER"; no doc says IWER | CLAUDE.md §7: starter is the reference. Use the emulator the starter ships (the scaffold's `iwsdk.config.json` has a `dev.emulator` block, Y-notes in §3B) and record its real name in TOOLING_REGISTRY | yes |
| X9 | CLAUDE.md §8 avoid "default Three.js primitive appearance" | CLAUDE.md §17 Phase 1 "Create test cube" | Test cube is a Phase 1 proof; style it with palette materials and bevels; PROJECT_BIBLE §3.1(10) only bans placeholders in the *final* build | yes |
| X10 | PRODUCT_SPEC §3.2 stand ~55 cm ahead; PROJECT_BIBLE §2 / INTERACTION §3 town 60 x 40 cm | same docs: all important interaction within ~60 cm of chest. Derived (INF, "chest" origin is undefined): assuming chest ~30 cm below the eye and 0-10 cm behind it, the town centre is ~57-67 cm away and the far edge/corners ~77-91 cm (far edge = 55 cm + half of 40 cm depth) | Not a doc-vs-doc numeric error, a geometry tension. Define the reference point and whether 55 cm is near edge or centre; instrument a 60 cm reach gizmo in the M0 scene | yes |
| X11 | CLAUDE.md §17: Phases 0-7 (solver inside Phase 2 "Music Box slice"; gift = 5) | BUILD_ROADMAP §3-15: Phases 0-12 (solver = 2, Music Box = 3, gift = 6). Only Phase 1 matches | Dates come from BUILD_ROADMAP, rules from CLAUDE.md. Refer to milestones by name | no |
| X12 | COMPETITION §11: Nov 17 = "final testing, trailer, Devpost prep" | BUILD_ROADMAP: QA + hardware Nov 15 (§12), "final regression testing" Nov 16 (§13), submission prep Nov 17 (§14), submit Nov 18 (§15) | BUILD_ROADMAP is more granular and is in IDEAS §1's authoritative list | no |
| X13 | CLAUDE.md §12 / PRODUCT_SPEC §2: "never below 60 FPS" | COMPETITION §6 "avoid dropping below 60"; TECH_ARCH §20 / ACCEPTANCE §15 "normal gameplay" not below 60 | Numbers agree (72/60). INF: design to the strictest, measure p99 frame time | no |
| X14 | PRODUCT_SPEC §14: fields incl. "Daily repair completion **dates**" | TECH_ARCH §16 `SaveV1`: `townPlaced: string[]`, `letterStatuses`, `machinesBuilt: string[]`, `machinePlacements`, `dailyDone: string or null`. SAVE §3 `SaveV1`: `townPlaced: boolean`, `letters`, `machines: {blueprintId,built,placed,plotId?}[]`, `dailyDone: boolean`. Letter status "active" (GAMEPLAY §4) vs "accepted" (SAVE §4.2). Save triggers: 2 (PRODUCT §14, TECH §16) vs 7 (SAVE §6) | GAMEPLAY §17 names TECH_ARCH as home of `SaveV1`; SAVE §3 defers to the product spec. TECH_ARCH §16 shape wins, but `dailyDone` (one date vs "once per date") and `townPlaced` need an ADR before Phase 3 | no |
| X15 | PRODUCT_SPEC §4 Pause: "Restart **chapter**" | PRODUCT_SPEC §17 "Restart **from beginning**"; SAVE §12 clears the key; TECH_ARCH §16 deletes progress | Full reset with double confirmation (§17, SAVE §12); fix §4 text | no |
| X16 | PRODUCT_SPEC §16 accessibility = gaze-and-pinch, Easy Snap, **Ray interaction mode** (also TESTING_QA §10) | GAMEPLAY §19 and COMPETITION §5.3 omit ray mode and list "larger snap radius" and "Easy Snap" separately; `settings` in TECH_ARCH §16 / SAVE §3 has no ray-mode flag; INTERACTION_SPEC has no ray section; pause menu lists differ (PRODUCT §17 vs GAMEPLAY §20 / UI_UX §19) | PRODUCT_SPEC governs (COMPETITION §1): ray mode is required; larger radius == Easy Snap (7 cm); add a settings field via ADR | no |
| X17 | PROJECT_BIBLE §2 lists a "flower shop" | PRODUCT_SPEC F2 / §3.3: four plots, bakery, theatre facade; no other doc mentions it | PRODUCT_SPEC F2 governs; flower shop at most a supporting prop (ART §18 item 9) | no |
| X18 | GAMEPLAY §22 priority list ranks Clock Tower 14, Daily repair 15, Day/night 16 | same section's cut order: Clock Tower, Day/night, Daily repair. "Never cut" lists: PRODUCT §19 = 7 items; ROADMAP §16 = 9 (adds save/load, stable deployment); GAMEPLAY §22 = 4 | Follow the explicit cut order (identical in PRODUCT §19, ROADMAP §16, GAMEPLAY §22); priority list = build order; never-cut = union | no |
| X19 | DATA §12: Letter 2 available "after the first Music Box is **placed**" | GAMEPLAY §4.1: "after the first Music Box **completion**"; ACCEPTANCE PROG-06 "complete first machine"; gift icon "after Letter 2" (received/accepted/completed?) | DATA §12 is explicit; ADR defining "completed" and "after Letter 2" | no |
| X20 | TECH_ARCH §9 `MachineBlueprint` has no `version`; events list `MachineSolved/Started/Stopped/Placed` (§8) | DATA §5 has `version: number`; SIMULATION §13 uses `MachineCompletedEvent` | DATA is the specialist doc; align event names when the contract is frozen | no |
| X21 | PRODUCT §13 / TECH §17: gift URL target "under 1500" | ACCEPTANCE §13: "below 1500 where feasible" | Target 1500, treat as soft limit | no |
| X22 | CLAUDE.md §6.1 "Claude Code Best Practices" = `sickn33/agentic-awesome-skills` | TOOLING_REGISTRY §6.10 = `shanraisshan/claude-code-best-practice` (sickn33 listed separately in §6.8). Hallmark: CLAUDE.md §6.7 (assets/research) vs registry §7 (planning). Registry audit table is entirely "Not checked" though CLAUDE.md §6/§19 require actual availability | Registry is an unverified template; not M0-blocking | no |
| X23 | ACCEPTANCE §3 statuses: Not Run / Pass / Fail / Blocked / Not Applicable | TESTING_QA §11: PASS / FAIL / BLOCKED / NOT TESTED / NOT APPLICABLE; ROADMAP §18 milestone statuses differ again | Pick one vocabulary in the test log (INF: ACCEPTANCE's, it owns the test IDs) | no |

### 3B. Generated starter scaffold vs docs (PROBE, read-only; files may be mid-edit by the lead)

Files read: `.nvmrc`, `iwsdk.config.json`, `vite.config.ts`, `tsconfig.json`. Not yet present at 19:28: `package.json`, `index.html`, `src/index.*`, `public/scenes/main.iwsdk.scene.json` (referenced by `iwsdk.config.json`), `src/assets` (referenced), any git repo. Semantics of every starter setting must still be verified against iwsdk.dev and the installed typings (CLAUDE.md §7).

| # | Starter default says | Docs say | Resolution | M0 |
|---|---|---|---|---|
| Y1 | `world.xr.mode: "ar"`, `offer: "always"` (a single mode) | PRODUCT_SPEC §3.1, TECH_ARCH §6: AR, else VR, else desktop preview | Verify whether IWSDK falls back to VR / non-XR when AR is unsupported; if not, build the chain on IWSDK's verified session API (CLAUDE.md §7) and record an ADR | yes |
| Y2 | `xr.features`: `handTracking`, `anchors`, `planeDetection`, `meshDetection`, `hitTest` all `true`; `features.sceneUnderstanding` and `environmentRaycast` `true` | Hand tracking is primary; plane detection is best effort with a velvet-stand fallback (PRODUCT §3.2). Anchors, mesh detection, hit-test, scene understanding appear in no doc. Whether `true` means required or optional is unknown; a required feature the device lacks would fail session start | Verify semantics. INF: keep documented needs only, rest optional or off; ADR-019 | yes |
| Y3 | `features.spatialUI`: kit `horizon`, `preferredColorScheme: "dark"` | UI_UX §3, PROJECT_BIBLE §11: cream paper, walnut, brass, teal; avoid generic floating panels, neon, dashboards | Do not ship the Horizon dark kit for in-world UI without theming (INF); irrelevant to a DOM landing page | no |
| Y4 | Creates `blender/{source,exports,scripts}`, `public/assets`, `tests/` | TECH_ARCH §4 / ART §6 agree; CLAUDE.md §9 `assets/blender` disagrees; `blender/scripts` is in no doc | Supports the X4 resolution; add `blender/scripts` to the documented layout (INF) | yes |

Compatible or neutral with the docs: `tsconfig` `strict: true` (CLAUDE.md §5); `.nvmrc` 22.12.0 satisfies >= 20.19 (CI should read `.nvmrc`, INF); `vite.config.ts` `base: './'` is a relative base that should work on a Pages subpath (TECH_ARCH §22; verify APP-08) and `outDir: 'dist'`; `physics: false` and `locomotion: false` agree with ADR-009 / PRODUCT §2 (yet `@babylonjs/havok` is in `optimizeDeps`: dead weight if installed, INF); generated files carry a Meta MIT header, so CREDITS §3 needs the real package names (the `vite.config.ts` comment mentions a "super-three alias", i.e. a Three.js fork); `tsconfig.include` is only `src/**/*.ts`, so `tests/` and config files are not type-checked (INF).

### 3C. Reference boards vs docs (docs win per REFERENCE_INDEX; images not viewed by me)

REFERENCE_INDEX §b lists 18 discrepancies (part counts 9/18/28 vs 20/24/32, carousel 0.4 vs 0.5 rad/s, ratios 12:1 vs 6:1, winding "5-10 turns" vs 8 x 90 degrees, "72-90 FPS" vs 72/60, X-ray toggle vs hold, three module values vs two, navy vs teal in §d). I checked the doc side of each: the docs agree with each other (see "Verified consistent"). It missed or misstated the following:

| # | Board / index says | Docs say | Resolution |
|---|---|---|---|
| Z1 | Trunk board (row 9): 0.60 x 0.34 x 0.32 m | PRODUCT_SPEC §3.2: 35 x 25 x 20 cm | Docs win; tell the owner, since the trunk is the first hero asset and sets scene scale |
| Z2 | Workbench board (row 10): build surface 0.52 x 0.28 m | PROJECT_BIBLE §2, INTERACTION §3: ~45 x 25 cm | Docs win |
| Z3 | Art-direction board scale strip: town 0.6-1.0 m wide | PROJECT_BIBLE §2: max ~60 x 40 cm | Docs win |
| Z4 | Music Box boards 12 and 13 list 12 rows / items and no governor (per REFERENCE_INDEX text); catalogue board 02 has a governor | PRODUCT_SPEC §6.1 lists Governor as required; SIMULATION §10.1, GAMEPLAY §11.1, ACCEPTANCE §8 require governor animation | Docs win; the blueprint must include a governor. "12 parts" (rows) vs 18 pieces needs an owner ruling (REFERENCE_INDEX §b item 10) |
| Z5 | REFERENCE_INDEX §b item 7: INTERACTION_SPEC §11 "lists alternative activation as a later idea" | INTERACTION_SPEC §11, PRODUCT_SPEC §12, TECH_ARCH §15, GAMEPLAY §15, UI_UX §14: lens icon alternative is part of the spec (F11 and F17 are Must); IDEAS §4.7 covers only *additional* alternatives | The index is wrong here; do not defer the lens icon |
| Z6 | REFERENCE_INDEX header cites "CLAUDE.md, section 3" for "specs win over any image" | CLAUDE.md §3 never mentions images (it ranks the TDD and competition rules). CLAUDE.md §9 mentions `assets/references/` for "approved references"; none are designated, and `References/` matches no documented path (X4) | Rule is sensible but undocumented. INF: record an ADR naming the approved boards and their home |

### Verified consistent (no conflict found)
- Dates: internal Nov 18 before midnight IST; official Nov 19 01:30 IST; freeze Nov 16 (CLAUDE.md §2; COMPETITION §11; ROADMAP §13, §15; ADR-015).
- Palette hex values identical in CLAUDE.md §8, PROJECT_BIBLE §4, ART §3 (only role names differ: "Aged brass" vs "Brass"; "Warm lamp glow" vs "Warm lamp").
- FPS 72 / 60 in every doc. Node >= 20.19 in CLAUDE.md §5 and TECH_ARCH §2.1.
- Part counts 12 / 20 / 24 / 32 (PRODUCT_SPEC §6.1-6.4; reference image filenames agree for 20 and 32). ART §11 library math 10x2x3=60 plus 3x3=9 is correct; no doc enumerates the 10 tooth counts or the 2 modules (example IDs use 12/24/36 module m1; tests use 10T/20T; repair uses 12T/24T).
- Windmill repair 12T vs 24T gives about 2x speed (PRODUCT §8; GAMEPLAY §12.2; SOLVER §15.3; ACCEPTANCE §8). Targets 0.4 / 0.5 / 0.6 rad/s at +-10 / +-10 / +-15 % in PRODUCT §6, GAMEPLAY §11, SIMULATION §10, SOLVER §15, DATA §8, ACCEPTANCE §8. Worn spring ~15 % energy per unit, ~1.5 s at 8 wind units (SOLVER §12.1; PRODUCT §8; ACCEPTANCE SOL-09). Loop jam threshold 1 % (SOLVER §10).
- Snap 4 / 7 cm, removal ~3 cm, X-ray 5-20 cm / 0.4 s / ~15 % opacity, 90 degrees per wind unit with max 8, idle hint 20 s, ripple ~1.5 s, theatre doors 30 s, storage key `woundup.save`, gift hash `#g=` with `CompressionStream('deflate-raw')`.
- `SolveStatus` / `SolveResult` identical in TECH_ARCH §10.2 and SOLVER §4, §6.

---

## 4. Missing information that blocks M0, and recommended decisions

### 4.1 Hard blockers (an M0 item cannot be completed without an answer)

| # | Gap (DOC evidence) | Blocks | What is needed |
|---|---|---|---|
| B1 | No deployment spec (X1). Pages source mechanism, workflow, base path, URL, smoke test undefined | M0-12 | Write ADR-016 "Deployment" (see R3-R4) |
| B2 | GitHub owner, visibility and approval undocumented. Repo must be public by submission (COMPETITION §9); creating a public repo and enabling Pages is publishing, which needs confirmation (global `CLAUDE.md` §30) | M0-12, Phase 1 | Owner OK on: account (gh is authed as `Alivestars24` [PROBE]), public from day one, exact name `wound-up` |
| B3 | IWSDK facts absent by design (CLAUDE.md §7; DECISIONS §5): generator command, installed version, session config, emulator mechanism, grab API. The missing TDD may have held some. The scaffold now shows starter defaults (§3B) but they are unverified | M0-4..7, 9, 10 | Read iwsdk.dev and iwsdk.dev/skill.md, inspect the installed package typings. Context7 MCP (TOOLING_REGISTRY §11.3) needs OAuth in this session; use WebFetch on iwsdk.dev instead |
| B4 | WebXR feature policy and reference space undocumented (table in §2.6) | M0-6, 7 | Decide after reading IWSDK docs (R7) |
| B5 | No lint tool, script names or Gate A tooling, but CLAUDE.md §18 requires lint | Definition of done | Decide R5-R6 |

### 4.2 Soft gaps (decide quickly, log in DECISIONS)
- S1 Layout/entrypoint (X3); S2 landing copy + font (§2.5); S3 desktop-preview camera/controls (docs say only "mouse and keyboard", INTERACTION §15; orbit is documented only for the gift viewer, PRODUCT §13; the starter sets `input.canvasPointerEvents: true`); S4 units and coordinate convention (§2.9); S5 numeric perf ceilings (§2.7); S6 image-based lighting (§2.8); S7 whether `References/` is committed (68 MB; all AI-generated per REFERENCE_INDEX but no CREDITS §8 entry; keep out of the public repo or use LFS, INF); S8 who tests on a Quest (no tester named; CREDITS §10 placeholder; TESTING_QA §3.3 owner has no headset).

### 4.3 Recommended decisions (all INF, none documented)

- **R1 Scaffold.** Use the official IWSDK mixed-reality generator with the command from iwsdk.dev. A partial scaffold now sits in the root (no `package.json` or `index.html` yet): complete it rather than regenerating over it, and never overwrite `docs/`, `CLAUDE.md`, `References/`. Pin versions in `package.json` and commit `package-lock.json` (TECH_ARCH §2.1).
- **R2 Entrypoint.** Keep the starter's entry file; document that it carries the `src/main.ts` ownership (X3).
- **R3 Base path.** The scaffold's `vite.config.ts` already has `base: './'`, a relative base that should work on a Pages subpath; keep it unless an asset URL breaks (then use `/wound-up/` from one env var). Never root-relative URLs. Verify by serving the production build under `/wound-up/` locally and checking the network panel for 404s (APP-08), then on the deployed URL.
- **R4 Deploy.** GitHub Actions to Pages using the official `configure-pages`, `upload-pages-artifact`, `deploy-pages` actions; `npm ci` then typecheck, lint, test, build, deploy on push to `main`. Public repo (Pages on private repos needs a paid plan). Do not use the "branch /docs" Pages source, which collides with `docs/`. Add Playwright smoke on the deployed URL (APP-07/08).
- **R5 Scripts.** `dev`, `build`, `preview`, `typecheck` (tsc strict, noEmit), `lint`, `test` (vitest run), `test:e2e` (playwright). Adopt the starter's scripts where they exist.
- **R6 Lint.** ESLint with typescript-eslint unless the starter already ships a linter. Add `.gitignore` for `node_modules`, `dist`, `.claude/`, `.remember/`. Widen the typecheck to `tests/` and config files (scaffold `include` is `src/**/*.ts` only).
- **R7 XR policy.** One Enter: try AR, then VR, then desktop (PRODUCT §3.1) using IWSDK's verified session config. Request hand tracking as optional (controllers allowed, PRODUCT §2). Plane detection optional with velvet-stand fallback (PRODUCT §3.2). No anchors, no layers at M0. Reference space per IWSDK default for seated use, verified in the emulator. Enter click must start the session synchronously inside the user gesture (COMPETITION §3.2). Starter defaults to review against this: AR-only `mode`, and anchors / meshDetection / hitTest / sceneUnderstanding switched on (Y1, Y2).
- **R8 Test scene.** Hemisphere (cream sky, walnut ground, low intensity) + one warm directional light; no shadow maps, no post-processing; walnut tabletop slab sized to the 60 x 40 cm footprint at the fallback position; one bevelled brass test object ~5 cm with a >= 1.2 cm collider; blob-shadow decal; a 60 cm reach gizmo (X10). Metals read dark/flat with only two lights, so decide explicitly on a tiny static environment map (not a light, not a post pass) or lower metalness, and record it.
- **R9 Perf instrumentation.** Dev-only overlay for frame ms, draw calls, triangles. Provisional M0 ceilings (tiny scene): <= 50 draw calls, <= 50k triangles, 0 shadow maps, <= 2 lights, 0 post passes. Label all desktop numbers "proxy, not Quest evidence".
- **R10 ADRs.** ADR-016 deployment, 017 layout/entrypoint, 018 lint + scripts, 019 XR feature policy, 020 units/coordinates, 021 test-cube and IBL exception, using the DECISIONS §3 template.
- **R11 Landing.** DOM overlay over the canvas. Exact tagline, one-sentence premise (from PRODUCT §1), Enter button, one capability line (AR / VR / desktop preview), self-hosted OFL font with licence logged in CREDITS §7, palette from UI_UX §3, no analytics, no remote requests.
- **R12 Evidence.** Log APP-01/02/03/07/08 and INT-01/02 as Browser/Emulator with commit, date, environment. Record APP-04..06 as emulator evidence plus "Hardware: Blocked, no headset, action: arrange tester". Never report them as hardware passes.
- **R13 README.** Replace the pack README at first commit with a minimal one (run, build, deploy); expand to COMPETITION §9's list later.
- **R14 Hardware smoke.** As soon as the Pages URL is live, ask any available Quest owner for a 5-minute session-entry check. Hardware first contact is otherwise Nov 15 (BUILD_ROADMAP §12).

### 4.4 Later-phase gaps (do not block M0)
Blueprint and gift-payload schemas are Deferred (DECISIONS §5); spring energy and drain constants undefined (SOLVER §12.1 leaves them to implementation); how an awakened machine keeps running after placement (spring-limited vs ambient) is unspecified; Clock Tower targets undefined (SOLVER §15.4, DATA §8); decoys for Letters 2 and 5 undefined (DATA §9.1); "suitable plane" criteria undefined; tooth-count/module enumeration; `grab`/collider data only conceptual.

---

## 5. Deadline feasibility

### 5.1 Arithmetic
- Nov 5 (Thu) to Nov 16 (Mon) inclusive = 12 calendar days. Nov 16 is code freeze (critical fixes only), so **11 days of feature work (Nov 5-15)**, including weekends Nov 7-8 and 14-15. Only 8 of the 12 days are weekdays; the roadmap schedules calendar days.
- BUILD_ROADMAP budgeted Nov 4-15 = 12 feature days; Nov 4 is already spent.
- Phases 2-8 hold 13 phase-days (3+3+2+2+1+1+1) inside a 10-day window (Nov 5-14): 3 days are double-booked (P2/P3 on Nov 6-7, P3/P4 on Nov 8). The plan therefore assumes parallel agents (CLAUDE.md §10) with frozen contracts, but CLAUDE.md §19 forbids launching them before contracts and ownership exist, and the blueprint and gift schemas are still Deferred (DECISIONS §5).
- The "buffer" in ADR-015 is thin: official deadline Nov 19 01:30 IST = Nov 18 20:00 UTC; internal "before midnight IST" is ~18:30 UTC, so about 1.5 hours.

### 5.2 Roadmap vs reality (counts are bullets in each phase's Objectives list)

| Phase (BUILD_ROADMAP §) | Dates | Days | Obj. | State on 2026-11-05 | Risk |
|---|---|---|---|---|---|
| P0 Docs + audit (§3) | Nov 4-5 | 2 | 9 | docs exist; audit open; registry unverified | Med: exit criteria unmet |
| P1 Foundation / WebXR proof (§4) = M0 | Nov 4-5 | 2 | 11 | partial generator scaffold (configs only) at 19:24; no `package.json`, `index.html` or git | **High**: ~1 day left, includes publishing |
| P2 Solver + data (§5) | Nov 5-7 | 3 | 12 | not started; needs frozen contracts | Med |
| P3 Part library + Music Box slice (§6) | Nov 6-8 | 3 | 13 | not started | **Very high**: Blender hero asset + parts + grab/snap/remove + solver link + winding + runtime + melody + letter, and depends on M0's IWSDK grab proof |
| P4 Town + restoration (§7) | Nov 8-9 | 2 | 11 | | **Very high**: trunk, workbench, town, plots, bakery, theatre models + frozen/awake states + placement + ripple + audio + save + ghost hands; roadmap schedules no Blender tasks for these |
| P5 Repairs, Carousel, Windmill, X-ray (§8) | Nov 10-11 | 2 | 10 | | **Very high**: two machines (20 + 24 parts) with hero models, two repairs, bakery response, X-ray |
| P6 Gifting (§9) | Nov 12 | 1 | 12 | | **High**: whole pipeline + viewer + unwrap + phone/desktop inspect; gift box is a Blender hero asset (ART §4, §18) |
| P7 Optional (§10) | Nov 13 | 1 | 5 | | Intended slack (all cuttable) |
| P8 Accessibility + polish (§11) | Nov 14 | 1 | 10 | | **High**: full gaze-and-pinch loop (ACCEPTANCE §11) + pause + audio mix + perf review |
| P9 QA + hardware (§12) | Nov 15 | 1 | 11 | no tester named | **High**: first real-headset contact one day before freeze |
| P10 Freeze (§13) | Nov 16 | 1 | n/a | | |
| P11 Submission prep (§14) | Nov 17 | 1 | 10 | | Med |
| P12 Final buffer (§15) | Nov 18 | 1 | 7 | | Med: ~1.5 h real buffer |

M0 as briefed exceeds ROADMAP §4: it adds a landing page (UI_UX §5) and a "beautiful" lit environment; Phase 1 only asks for "a minimal scene" (§4). Timebox both (INF).

### 5.3 Required work with no roadmap slot
Desktop input parity (TECH_ARCH §6.3, INTERACTION §15, ACCEPTANCE INT-11); ~17 procedural audio categories (PROJECT_BIBLE §9); most Blender hero assets (trunk, workbench, town, bakery, theatre, carousel, windmill, gift box, figures; ART §4); ray-interaction mode (PRODUCT §16); ghost-hand demos beyond one bullet in Phase 4; README and credits (COMPETITION §9, CREDITS §11); the hardware tester.

### 5.4 Scope-cut order the docs prescribe
1. Clock Tower and theatre hourly behaviour (PRODUCT §19; ROADMAP §16; GAMEPLAY §22; F9 "cut first")
2. Day/night toggle (F16)
3. Daily repair (F12 daily part)
4. Decoy parts
5. Non-essential decorative details (ROADMAP §16)
6. Optional presentation refinements (ROADMAP §16)

Never cut (union of PRODUCT §19, ROADMAP §16, GAMEPLAY §22): Music Box loop, hands-first interaction, mechanical solver, machine placement, town wake-up, save/load, core gift sharing, basic onboarding, stable deployment.

**Gap:** nothing is prescribed after item 6, yet Carousel (F7), Windmill/Bakery (F8), X-ray (F11), story repairs (F12), accessibility (F17) and pause (F18) are all "Must" and sit in the riskiest phases (P5, P8). Documented hints for a next cut: PRODUCT §6.3 values the Windmill-to-Bakery link as the proof that machines affect the town; COMPETITION §8.1 step 7 needs only "the Carousel or the Windmill" in the demo. Any such cut is an owner decision (DECISIONS §8).

### 5.5 INF triage suggestions
- Checkpoint end Nov 6: M0 done and contracts frozen, otherwise slide P2/P3 and spend the Nov 13 slack.
- Checkpoint end Nov 8: Music Box loop works in the emulator, otherwise take cuts 1-3 immediately (they free Nov 13 entirely).
- Target submission Nov 17 night, not Nov 18.
