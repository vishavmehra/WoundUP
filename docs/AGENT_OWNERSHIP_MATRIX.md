# Wound Up — Agent Ownership Matrix

**Project:** Wound Up
**Label:** G0 (the competition build). No agent for G1 to G5 exists or is planned before delivery ([ADR-028](DECISIONS.md)).
**Status:** Accepted by the lead as ADR-038 on 2026-11-06 ([DECISIONS.md](DECISIONS.md); task PR-3 in [MASTER_PRODUCTION_ROADMAP.md](MASTER_PRODUCTION_ROADMAP.md)).
**Date:** 2026-11-06
**Authority:** CLAUDE.md §10; [production directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) Parts 7 and 13; ADR-017, ADR-031, ADR-033, ADR-037 in [DECISIONS.md](DECISIONS.md); [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §12
**Related:** [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) (task and report formats), [INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md), [MASTER_PRODUCTION_ROADMAP.md](MASTER_PRODUCTION_ROADMAP.md), [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md), [ASSET_AGENT_ASSIGNMENTS.md](ASSET_AGENT_ASSIGNMENTS.md) (per-asset assignments; written in the same documentation pass), [ASSET_NAMING_AND_FOLDER_STANDARDS.md](ASSET_NAMING_AND_FOLDER_STANDARDS.md), [audit A](audits/A_DOCUMENTATION.md) I-17

## 1. Purpose

Every file and every asset has exactly one owner at a time (directive Part 7.4; CLAUDE.md §10). This document is the single table that says who that is, which model tier does the work, what each agent reads and produces, and which gate its work must pass. It replaces three clashing schemes with one roster.

## 2. One roster instead of three schemes

[Audit A](audits/A_DOCUMENTATION.md) found three agent schemes that disagree about names, letters and folders (A I-17). A fourth collision exists: the directive's audit agents are also lettered A to F.

| Role | CLAUDE.md §10 and ADR-017 | TECHNICAL_ARCHITECTURE §24 | AGENT_WORKFLOW §5 and §6 | Resolution |
|---|---|---|---|---|
| Lead, shared contracts, XR, table placement | Agent 0 | Lead agent | Lead Agent | Agent 0 |
| IWSDK bootstrap and platform lifecycle | Agent 0 ("IWSDK setup", `src/index.ts`) | Agent A | Agent A, `src/app/` | Merged into Agent 0. No `src/app/` folder: ADR-017 follows the IWSDK starter layout |
| Blender and art pipeline | Asset production agents | Agent B | Agent B, `blender/` | Split by family, as in CLAUDE.md §10 and ADR-031 |
| Mechanical solver | Agent 1, `src/sim/**`, `tests/sim/**` | Agent C | Agent C, `src/gameplay/solver/`, `tests/unit/solver/` | Agent 1 and its paths |
| Assembly and interaction | Agent 3, `src/interaction/**`; Agent 2 for the part catalogue | Agent D | Agent D, `src/interaction/` | Agent 3 for interaction. The part catalogue and blueprints are Agent 2, who has no letter in the older schemes |
| Town, presentation, audio | Agent 4, `src/town/**`, `src/audio/**` | Agent E | Agent E, `src/world/` | Agent 4; `src/town/` replaces `src/world/` |
| Progression, persistence, gift flow, daily repair | "Additional agents when useful" (no paths) | Agent F | Agent F, `src/gameplay/progression/` | Role kept. No agent exists; Agent 0 acts until one is created |
| QA and deployment | "Additional agents when useful" | Agent G | Agent G, `tests/` | Role kept. No agent exists; Agent 0 acts until one is created |
| Landing page and entry screen | not listed | not listed | not listed | Added here: the landing agent (a separate process is working on it now) |
| Audits (directive Part 7.1) | not listed | not listed | not listed | Called "audit A to F" (the reports in `docs/audits/`), never "Agent A to F". They are finished and own nothing |

Rules of the resolution:

1. The roster is CLAUDE.md §10: Agents 0 to 4, the asset production agents, and the two additional agents when they are created. Reasons: ADR-017 kept its domain folder names; the directive's asset agents are already in it; it is the instruction file the other documents answer to.
2. The letters A to G stop being agent names. `AGENT_WORKFLOW.md` §5 stays as role descriptions, and §7 and §12 stay as the task and report formats.
3. Where a path in `TECHNICAL_ARCHITECTURE.md` §4 and §24 or `AGENT_WORKFLOW.md` §6 differs from this matrix, this matrix wins. `src/app/`, `src/gameplay/solver/`, `src/world/` and `tests/unit/solver/` are not created. `TECHNICAL_ARCHITECTURE.md` §4 remains a logical target, which it says itself, not an ownership statement.
4. Recorded as ADR-038 on 2026-11-06. `TECHNICAL_ARCHITECTURE.md` §24 now points here and keeps the old list as the original scheme; §4 remains a logical target and still shows the old paths.

## 3. The matrix

Tiers are the directive's Part 7: Sonnet is the default builder, Haiku does bounded repetitive checks, Opus is reserved (section 6). "Shared files" means the list in section 4; no agent edits them unless its row says so. "Forbidden" lists the specific traps for the role in addition to everything not owned.

| Agent | Tier | Owned paths | Forbidden paths | Inputs | Outputs | Gate |
|---|---|---|---|---|---|---|
| Agent 0: Lead Architect and Integrator | Opus | All shared files (section 4); `CLAUDE.md`; `docs/**` except a document an agent holds for one task; the work of the two uncreated agents below until they exist | None by rule. Does not edit an agent's files while that agent has an open task without telling it (AGENT_WORKFLOW §6) | Every spec and ADR; agent completion reports (AGENT_WORKFLOW §12); manifest entry-change reports | Shared interfaces; ADRs; the merged manifest; integrated builds; gate sign-offs | Signs Build Gates A to D and S, asset Gates F, P and C, and per-asset gate AG4 ([INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md)) |
| Agent 1: Mechanical Simulation | Sonnet | `src/sim/**`, `tests/sim/**` | Any import of Three.js, IWSDK or a browser API inside `src/sim/**`; `src/parts/**`, `src/content/**`; the blueprint schema and `SolveResult` without Agent 0 | `MECHANICAL_SOLVER_SPEC.md`, `SIMULATION_SPEC.md`, `DATA_AND_BLUEPRINT_SPEC.md`, `TECHNICAL_ARCHITECTURE.md` §10; blueprint data from Agent 2 | The pure TypeScript solver and `SolveResult`; deterministic tests SOL-01 to SOL-12; gear train, ratio and energy proposals per machine (gap G-11) for mechanical design review | Build Gates A and B at Desktop level. No hardware dependency |
| Agent 2: Part Catalogue and Runtime Parts | Sonnet | `src/parts/**`, `src/content/parts/**`, `src/content/blueprints/**` | Generating part geometry in TypeScript (ADR-031); GLBs, `blender/**` and the manifest; `src/sim/**` | Manifest entries (ids, sockets, colliders, pivots); `DATA_AND_BLUEPRINT_SPEC.md` §4 to §9; the solver contract | Part definitions (`visual.assetId` is the asset id, `visual.finish` names the library material); blueprints; load-once cache and instancing of part GLBs; reports of missing socket or collider names to the asset agents | Build Gate B; asset gate AG4 for every part GLB (loads from the catalogue) |
| Agent 3: Hand Interaction | Sonnet | `src/interaction/**`. When it starts, Agent 0 moves the M0 grab files into it in one change | XR initialisation and entrypoints (`src/index.ts`, `iwsdk.config.json`); `src/sim/**`; `src/town/**`; asset files. Must verify IWSDK APIs against the installed version first (CLAUDE.md §7) | `INTERACTION_SPEC.md`; IWSDK 1.1.0-rc.2 documentation and typings; socket and collider naming (ADR-033); ADR-036 for the head-directed gaze pointer | Pinch and grab, snapping, removal, winding, X-ray gesture, ghost hands, gaze mode and ray mode as interaction intents | Build Gates B and C at IWER level. WIND-02, WIND-03, JUD-12 and JUD-13 need Hardware and stay Blocked without a tester |
| Agent 4: Town, Presentation and Audio | Sonnet | `src/town/**`, `src/audio/**`, and the scene and visual directories named in its task brief | Surface detection and stage placement (`src/placement.ts`, `src/stage.ts`): it builds under the stage root and reads its scale. Mechanical correctness: it consumes `SolveResult`. GLB sources and exports | `PROJECT_BIBLE.md`, `UI_UX_SPEC.md`, `SIMULATION_SPEC.md` §10 to §12; VALIDATED GLBs by manifest id; stage root and scale from Agent 0 | The Tockton scene, plots, frozen and awakened states, wake ripple, lighting, procedural audio, machine presentation driven by solver output | Build Gates B and C; TOWN tests; asset gate AG4 for town GLBs, with the scene budgets re-checked |
| Gameplay and progression agent (not created; Agent 0 acts) | Sonnet when created | Set by Agent 0 at creation. Starting proposal: the `TECHNICAL_ARCHITECTURE.md` §4 names `src/gameplay/progression`, `letters`, `gifting` and `src/data/save` | Shared contracts; `src/sim/**`; `src/interaction/**` | `GAMEPLAY_SYSTEMS.md`, `SAVE_PERSISTENCE_SPEC.md`, `DATA_AND_BLUEPRINT_SPEC.md` §11 to §15 | Letters, progression, save and load, gift link and viewer, pause menu, daily repair (ADR-027) | Build Gates B and C; PROG, DAILY, save and gift tests |
| QA agent (not created; Agent 0 acts) | Sonnet; Haiku for repetitive runs | `tests/e2e/**` except `landing.spec.ts`; the budget spec; evidence records | Product code; manifest status fields | `TESTING_QA_PLAN.md`, `ACCEPTANCE_TESTS.md`, audit F | Test evidence per level; the QA-1 checklist evidence (BR); hardware checklist records | Records Build Gates B, C, D and S evidence. Agent 0 signs |
| Landing and entry-screen agent (a separate process; not in CLAUDE.md §10) | Sonnet (assumed; the lead confirms) | `src/landing/**`, `index.html`, `DESIGN.md`, `PRODUCT.md`, `tests/e2e/landing.spec.ts` | `src/index.ts` beyond the landing interface; `src/xr-entry.ts`; assets | `APP_AND_WEBSITE_GUIDELINES.md` §1 and §2; `UI_UX_SPEC.md` §5; audit F §7 speed budget | The entry screen meeting APP-01, APP-03 and JUD-19; speed measurements | Build Gate A (landing spec passes); the F §7.2 budget |
| Asset framework | Sonnet | `tools/**` (including `tools/asset-status.mjs` and the validator); `blender/scripts/lib/**`; `public/assets/materials/**`; `tests/assets/**` (new, proposal); `blender/exports/**` (helper output, never a deliverable); `blender/scripts/wu_common.py`, `forge.py` and `compose_m0_stage.py` (`wu_common.py` moves into `lib/`) | Family folders; `assets/manifest/glb-manifest.json` content (it reports changes); `package.json` (Agent 0 adds the npm entries); `src/**` | ADR-030 to ADR-037; audits E and F; the manifest and its schema | The `Mat_*` proxy list and library textures; the forge runner and fixed export profile; ambient-occlusion helper; empties writer; contact-sheet helper; the validator (`npm run assets:check` once added); the status tool | Asset Gate F (its own), and its part in Gate P. Its validator is the automated check of AG3 |
| Mechanical library (asset agent) | Sonnet | Family A and J: `blender/source/<family>/` and `public/assets/models/shared/<family>/` for its families; its generators in `blender/scripts/` (today `gen_gear_spur.py`; `gen_spring.py` and `gen_cam.py` also build entries Machines owns, and the script stays here); `assets/future/shared/` for family J, only after delivery and with the owner's approval (ADR-028 rule 4) | Other agents' family folders; `blender/scripts/lib/**`; `public/assets/models/tockton/**`; the manifest | Its manifest entries; `MECHANICAL_SOLVER_SPEC.md` (tooth counts, module); `DATA_AND_BLUEPRINT_SPEC.md` §4; ART_ASSET_PIPELINE §10 and §11; the part boards | One GLB per entry; source or generator; per-family report and contact sheet; entry-change report | AG1 and AG2 are its own. It submits for AG3. It does not set VALIDATED |
| Machines (asset agent) | Sonnet | Families C, D, E and F: its folders under `blender/source/<family>/` and `public/assets/models/tockton/<family>/`, plus `shared/<family>/` for the entries the manifest marks shared (cylinder, comb, pendulum, escapement) (names in [ASSET_NAMING_AND_FOLDER_STANDARDS.md](ASSET_NAMING_AND_FOLDER_STANDARDS.md)); its generators | Other agents' folders; `lib/`; the manifest | Its manifest entries; `PRODUCT_SPEC.md` §6; the machine boards; the footprint table (PR-5); blueprint data | The Music Box, Carousel, Windmill, Bakery, Clock Tower and Theatre GLBs; reports | As above |
| World (asset agent) | Sonnet | Families B, G, H and I: its folders under `blender/source/<family>/` and `public/assets/models/tockton/<family>/`, plus `shared/interaction/`; its generators (today `gen_tockton_base.py`) | Other agents' folders; `lib/`; the manifest | Its manifest entries; `PROJECT_BIBLE.md` §2; the trunk, town and character boards; the footprint table (PR-5) | The trunk, workbench kit, stand, town, residents and gift GLBs; reports | As above |
| Manifest checker (asset agent) | Haiku | Nothing. It reports in its reply and writes no file | Every edit | The manifest; `node tools/asset-status.mjs` and validator output; the naming rules; the specs for cross-checks | A batch check report: naming, duplicates, missing fields, spec cross-check | Input to AG3 for each batch. Signs nothing |

Counts of entries per asset agent come from the manifest `owner` field and `node tools/asset-status.mjs`; they are not typed here.

## 4. Shared files

No agent edits these unless a task names the file and the agent in writing. Everything else follows the matrix. Any path that neither this section nor the matrix names (for example `README.md`, `.gitignore`, `public/assets/xr/**`) belongs to Agent 0 until the lead assigns it.

| File or area | Owner | Rule |
|---|---|---|
| `package.json`, `package-lock.json` | Agent 0 | A new dependency needs approval (ADR-018, AGENT_WORKFLOW §14). Agents ask |
| `iwsdk.config.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `tsconfig.json`, `.nvmrc` | Agent 0 | Shared configuration |
| `vercel.json`, `.vercelignore`, `.github/**` | Agent 0 | Deployment is static only (ADR-022). Vercel project settings, including deployment protection and promoting to production, are the owner's |
| `src/index.ts` (the `src/main.ts` of CLAUDE.md §10, by ADR-017), `src/assets.ts`, `src/components.ts`, `src/placement.ts`, `src/stage.ts`, `src/stage-framing.ts`, `src/xr-entry.ts`, `src/hands.ts`, `src/render-budget.ts` | Agent 0 | Only Agent 0 changes XR initialisation and shared entrypoints. An agent reports the asset id it needs and Agent 0 registers the key, which equals the asset id (ADR-033) |
| `src/grab-mode.ts`, `src/grab-feedback.ts`, `src/returns-to-rest-component.ts` | Agent 0 until Agent 3 starts, then `src/interaction/**` | Moved in one change |
| `public/scenes/*.iwsdk.scene.json` | Agent 0 | A task may delegate the town part to Agent 4 |
| `tests/*.test.ts`, `tests/e2e/xr-emulator.spec.ts` | Agent 0 (the QA agent for the e2e spec, once it exists) | The M0 tests cover Agent 0's own files. A module's tests live with the module's owner, for example `tests/sim/**` with Agent 1 |
| `assets/manifest/glb-manifest.json` and its schema | Agent 0 | Asset agents report entry changes; Agent 0 merges them one at a time (CLAUDE.md §10). Only the validator and a named reviewer set VALIDATED; only the integration test or Agent 0 sets INTEGRATED (GLB_ASSET_MANIFEST §5) |
| `docs/DECISIONS.md`, `CLAUDE.md`, other `docs/**` | Agent 0 | A documentation agent holds only the files its task lists |
| `docs/CREDITS.md` | Agent 0 | Any agent that adds a non-original asset reports the row; Agent 0 merges it (AST-13) |
| `References/` | Nobody edits | A read-only working folder, never copied to `public/` or the build (ADR-017) |
| `blender/README.md` | Asset framework | Agent 0 reviews; the move of the M0 GLBs (AF-4) updates it |

## 5. Contracts between agents

A change to any of these goes through Agent 0 (AGENT_WORKFLOW §14).

| Contract | Defined in | Producer | Consumers |
|---|---|---|---|
| `SolveResult` and solver statuses | `MECHANICAL_SOLVER_SPEC.md` §4 and §6; `TECHNICAL_ARCHITECTURE.md` §10 | Agent 1 | Agent 4, Agent 3 |
| Blueprint schema and part definitions | `DATA_AND_BLUEPRINT_SPEC.md` §4 to §9 | Agent 2 | Agents 1, 3 and 4 |
| Asset id, GLB file and manifest entry | ADR-030, ADR-033 | The asset agents | Agent 2, Agent 4 |
| GLB node conventions: `COL_`, `PIV_`, `SOCKET_` and `userData.wu` | ADR-033; audit E §3 | The asset agents | Agent 0's reader, Agent 2, Agent 3 |
| Material names `Mat_<Name>` and the runtime material registry | ADR-032 | Asset framework (names), Agent 0 (registry) | All asset agents |
| Budgets per category and per scene | ADR-034 | Agent 0 | Everyone. An exception is a written line in the manifest entry |
| Stage root and town scale | `PRODUCT_SPEC.md` §3.2; `TECHNICAL_ARCHITECTURE.md` §6.4 | Agent 0 | Agents 3 and 4 |
| Interaction intents | `INTERACTION_SPEC.md`; `TECHNICAL_ARCHITECTURE.md` §12 | Agent 3 | The gameplay agent |
| Manifest entry changes | `GLB_ASSET_MANIFEST.md` §6 | The asset agents (report) | Agent 0 (merge) |

## 6. Model tiers

| Tier | Used for | Not used for |
|---|---|---|
| Sonnet | Default builder: all game code agents, the asset framework, the three family agents, the landing agent, documentation | Final reviews |
| Haiku | Inventory extraction, reference indexing, file audits, naming checks, manifest validation, documentation cross-checking, repetitive asset metadata (directive Part 7) | Anything that judges how an asset looks. Audit E §5.6 notes an agent cannot judge the in-engine look |
| Opus | The four reservations below | Individual Blender assets (directive Part 7) |

Opus review points:

| Reservation (directive Part 7) | Applies to | When |
|---|---|---|
| Difficult architectural decisions | The roster ADR (PR-3), the SaveV1 shape (PR-4), the table anchor approach (TP-1), the material library if the owner changes it, the world registry in G5. The framework design at asset Gate F (ASSET_PRODUCTION_ROADMAP §4) | Before the decision is recorded; Nov 7 for Gate F |
| Mechanical design reviews | Each machine's module, tooth counts, centre distances, gear train, ratios, energy and drain constants (gap G-11), and the Clock Tower targets if it is kept (G-13) | Once per machine, before its housing leaves Stage 1 (ASSET_AGENT_ASSIGNMENTS §6) |
| Complex integration failures | A defect a Sonnet agent has failed to fix twice (the threshold is a proposal). The measured pilot cost and pilot results at asset Gate P (ASSET_PRODUCTION_ROADMAP §5) | When it happens; Nov 8 for Gate P |
| Critical final reviews | Build Gate D and QA-1 (RL-3), the final asset review (ASSET_AGENT_ASSIGNMENTS §6), and the submission gate S | Nov 15 and Nov 17 |

## 7. Working rules for parallel agents

These add to CLAUDE.md §10 (parallel execution rules) and AGENT_WORKFLOW §9 and §14.

1. Each `.blend` and each GLB has one owner. Agents write only inside their own family folders and only files named after their own asset ids. Review renders in `blender/previews/` follow the same rule.
2. Separate branches or git worktrees per agent. Agents do not touch git history; Agent 0 merges.
3. Asset agents run Blender headless from the command line, one process per family. The Blender MCP add-on is for one agent debugging interactively, because it has a single port (audit E §4 and §8).
4. Generators refuse default output paths into `public/` and set `sys.dont_write_bytecode = True` before importing shared modules. The existing `gen_gear_spur.py` writes into `public/` when `--out` is missing (audit E §6).
5. A family agent starts production only after asset Gate P passes (CLAUDE.md §10; ASSET_PRODUCTION_ROADMAP §5).
6. Nobody edits the manifest in parallel. Agents send the entry change in their report.
7. An exported GLB is not VALIDATED until the validator passes with zero FAIL and the named reviewer has signed (ADR-037; INTEGRATION_AND_RELEASE_GATES §4).
8. Task briefs use AGENT_WORKFLOW §7. Completion reports use AGENT_WORKFLOW §12 and, for asset agents, also give the source or generator path, the GLB path, its SHA-256, the validator summary, the review render path and the manifest entry changes (directive Part 7.3).
9. Never report a Quest result from a desktop or IWER run. The level is part of every record.

## 8. Open items for the lead

| # | Item | Proposal |
|---|---|---|
| 1 | Record the roster in section 2 as an ADR | Done: ADR-038, 2026-11-06 |
| 2 | Update `TECHNICAL_ARCHITECTURE.md` §4 and §24 to point here | Lead edit; outside this task |
| 3 | The landing agent is not in CLAUDE.md §10 | Add it, or fold its paths into Agent 0 |
| 4 | Assembly state (which part sits in which socket) is assigned by none of the three schemes | Agent 3 produces the intents; Agent 0 owns the shared state type until the gameplay agent exists |
| 5 | Paths for the gameplay and QA agents | Set at creation; start from the `TECHNICAL_ARCHITECTURE.md` §4 names |
| 6 | `tests/assets/**` (the validator's Vitest wrapper, audit F §2.1) is a new path | Owned by the Asset framework |
| 7 | Who is the "named reviewer" who signs AST-08 visual review (audit F §6.2) | A reviewer who did not build the asset: Agent 0, or a different asset agent ([ASSET_AGENT_ASSIGNMENTS.md](ASSET_AGENT_ASSIGNMENTS.md) §6). The builder never signs its own review and the Manifest checker never signs a visual review |
| 8 | Asset-folder names for families B to I | In [ASSET_NAMING_AND_FOLDER_STANDARDS.md](ASSET_NAMING_AND_FOLDER_STANDARDS.md) |

## 9. Acceptance criteria

1. Every path in the repository that holds source, tests, assets or configuration belongs to exactly one row or to section 4.
2. No two rows own the same path.
3. The roster matches CLAUDE.md §10 and uses no agent letters.
4. Every row has a tier, owned and forbidden paths, inputs, outputs and a gate.
5. Every document named in a link exists when this document is accepted.
