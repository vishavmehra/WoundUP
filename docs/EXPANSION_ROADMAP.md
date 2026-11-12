# Wound Up — Expansion Roadmap

**Project:** Wound Up
**Label:** Section 3 is **G0** (the protected competition milestone, taken from existing specifications). Sections 4 to 8 and 10 are **G1 Living Tockton, G2 Advanced engineering, G3 Creative sandbox, G4 Community, G5 Clockwork universe** and **Research**, all **proposal**. Read the scope firewall, [DECISIONS.md ADR-028](DECISIONS.md), first.
**Status:** Strategy. Adds no requirement and no task to the competition build. Nothing after G0 is scheduled to a date.
**Date:** 2026-11-06
**Source:** [owner directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) Parts 3, 10 and 13, the multiple-worlds requirement and the world-by-world production strategy; [BUILD_ROADMAP.md](BUILD_ROADMAP.md); [PRODUCT_SPEC.md](PRODUCT_SPEC.md); [IDEAS.md](IDEAS.md); [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) and [audits](audits/)
**Related:** [PRODUCT_VISION_LONG_TERM.md](PRODUCT_VISION_LONG_TERM.md), [PRODUCT_PILLARS.md](PRODUCT_PILLARS.md), [PRODUCT_METRICS_AND_RETENTION.md](PRODUCT_METRICS_AND_RETENTION.md), [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md), [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md)

## 1. Purpose and rules

[BUILD_ROADMAP.md](BUILD_ROADMAP.md) is the only schedule for the competition build and ends on 18 November 2026. This document starts where it stops. It says what each later generation contains, what must be true before it starts, what it needs, what ends it, and how the competition build is kept safe from all of it.

Rules (ADR-028; directive Parts 3 and 13):

1. The competition build is G0 only. A generation described here never becomes G0-required by being written down.
2. G1 to G5 and Research are documented, not built, until the competition build is delivered.
3. Moving an item into G0 needs an owner decision recorded in DECISIONS.md.
4. No asset for a later generation or another world is made before the competition build is stable, unless the owner approves a named reusable shared asset that does not delay the submission.
5. A generation is documented before it is built. The document that carries the detail is named in each section. Each is drafted under the same directive and stays a proposal until the owner approves its generation.

## 2. How to read the roadmap

- **No dates after the competition.** The only dates in the sources are the competition's, plus the winner announcement around 11 December 2026. Capacity after delivery is unknown, and there is still no Quest headset or tester (PRODUCTION_AUDIT §9 risk 1). This roadmap gives sequence and gates, not dates. The owner sets dates after delivery.
- **Gates are proposals.** The facts they cite are specifications, ADRs or audit findings. The gate itself, and the wording of each exit, is a proposal for the owner and lead to accept.
- **The order G1 to G5 is the directive's list order (Part 10), not a commitment.** Section 11 gives the dependencies that actually constrain the order.
- **Counts come from the manifest.** Asset counts are never restated here. Use `node tools/asset-status.mjs` and `assets/manifest/glb-manifest.json`.
- **Verification levels stay separate:** Desktop, IWER, Quest Browser, physical Quest 3 and physical Quest 3S. Nothing today is hardware-verified.

## 3. G0 — the competition build, and the hold period after it

### 3.1 What it is

G0-required is the Must rows of PRODUCT_SPEC §5: F1 trunk introduction with table detection and anchoring, F2 frozen town, F3 letters and parcel, F4 build mode, F5 wind mode and solver, F6 Music Box, F7 Carousel, F8 Windmill powering the Bakery, F10 placement and wake, F11 X-ray, F12 story repairs and the daily repair, F13 gift, F14 save and load, F15 ghost-hand onboarding, F17 accessibility, F18 pause menu.

G0-optional is F9 the Clock Tower (with Letter 6 and the theatre-door behaviour), F16 the day/night toggle, and decoy parts (PRODUCT_SPEC §5, §19).

### 3.2 Dates that matter to later work

From [BUILD_ROADMAP.md](BUILD_ROADMAP.md). The roadmap owns them; they are repeated only so later work can be placed against them.

| Date (2026) | Milestone | Why it matters here |
|---|---|---|
| 10 November | TP-7: a named Quest 3 or 3S tester, device and test date | Until it is done every hardware test stays Blocked, and so does the first real budget reading for every later generation |
| 13 November | DR-1: daily repair, after the Music Box, Carousel, Windmill, placement and gifting are integrated | The earliest point at which a next-day return can be observed (PRODUCT_METRICS_AND_RETENTION §4) |
| 15 November | QA-1: the judging checklist (ACCEPTANCE_TESTS §18); TP-5 real-Quest test at the latest | Fixes what is Pass, what is Blocked, and the known limitations |
| 16 November | Code freeze | Only critical fixes after this |
| 17 November | Footage, video, README, description | Where any "future plans" wording is written (section 11.4) |
| 18 November | Submit before midnight IST. The official deadline is 19 November at 01:30 IST | G0 is delivered |

### 3.3 Cut order and never-cut list

If the schedule slips: the Clock Tower and its theatre behaviour, then the day/night toggle, then decoy parts, then non-essential decoration. If time is still critical, simplify the daily repair and never remove it (PRODUCT_SPEC §19; BUILD_ROADMAP §16; ADR-027).

Never cut: the Music Box loop, hands-first interaction, the solver, table detection with the stand fallback, machine placement, the wake effect, save and load, the gift link, basic onboarding, stable deployment, and the daily repair in simplified form.

### 3.4 When G0 counts as delivered

1. The release acceptance list in ACCEPTANCE_TESTS §16 holds.
2. Every item of the judging checklist (ACCEPTANCE_TESTS §18, JUD-01 to JUD-21) is Pass, or Blocked with its reason and the action that would unblock it.
3. The owner has submitted the entry personally. Agents only draft the text (APP_AND_WEBSITE_GUIDELINES §4).
4. The known limitations are written down, including real-world table placement and stand comfort if there is no Hardware evidence (ACCEPTANCE_TESTS §16).

### 3.5 The hold period (submission to the winner announcement)

The build must stay reachable and free until the winner announcement, around 11 December 2026, and the entry "cannot change after the deadline" (APP_AND_WEBSITE_GUIDELINES §4). Promoting a deployment to production already needs the owner's confirmation (ADR-022). From these, a hold period is proposed.

**Owner decision pending (new):** during the hold period no later-generation work is promoted to the production URL, and any change to the submitted build, including a bug fix, is the owner's decision.

Work that is useful and does not touch the production build:

1. Record the delivered build and keep it as the known-good reference (BUILD_ROADMAP §15).
2. If a Quest tester exists, run the Blocked hardware tests against the delivered build (TBL-13 to TBL-18, STAND-05, JUD-11 and the other Hardware items), record them as new evidence, and re-base the provisional budgets on the first reading, as ADR-034 says.
3. Write a short retrospective: what was cut, what slipped, what the Blocked list still holds. Move cut items into IDEAS.md or a status of Cut (BUILD_ROADMAP §18).
4. Write the design documents for the generation the owner chooses first. Documents only.
5. Check whether IWSDK 1.1.0 stable exists and plan an upgrade on a branch. ADR-016 pins `1.1.0-rc.2`, a release candidate.

## 4. G1 Living Tockton (proposal)

**Contains (directive Part 10):** resident behaviour engine, building dependencies, town events, production chains, expanded stories, persistent world simulation, improved spatial persistence. Also pillar A and C items: unlockable districts, resident routines and personalities, daily mysteries, hidden mechanisms, secret compartments, discoverable blueprints (directive Part 2).

**Builds on:** plots with a frozen and an awakened state, saved placements (SAVE_PERSISTENCE_SPEC §3); the Windmill-to-Bakery dependency (PRODUCT_SPEC §6.3); letters as data (DATA_AND_BLUEPRINT_SPEC §11); one progression authority (§12); the baker figure (SIMULATION_SPEC §10.3).

**Entry gate**

1. A resident behaviour specification exists. None does today (PRODUCTION_AUDIT §3; audit A §4.1). A draft is in [RESIDENT_BEHAVIOUR_SPEC.md](RESIDENT_BEHAVIOUR_SPEC.md), with [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md) and [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md).
2. Persistent world state has a save version. SaveV1 holds town placement, letters, machines, `dailyDone` and settings only. A new version needs an explicit migration and a test per migration, and an unknown version must fail safely (SAVE_PERSISTENCE_SPEC §3, §10).
3. A budget plan exists before any resident is modelled. The awakened town is already estimated at 150 to 190 draw calls against a ceiling of 200 and a target of 150 (PRODUCTION_AUDIT §9 risk 5; ADR-034). Animated residents must be paid for by merging, instancing or hiding. ADR-034 sets 1,500 triangles, 4 draw calls and a shared skeleton of at most 40 bones per character, and no character exists yet.
4. Behaviour is authored and deterministic and uses no LLM or AI calls (CLAUDE.md §14; directive Part 11).
5. The owner decides whether the §14 items weekly commissions, seasonal parts and festivals return as town events. IDEAS §4.4 lists seasonal decoration as deferred. Until decided they stay excluded.
6. Spatial persistence is tested on a real Quest first. IDEAS §4.8 ("Returning to the same table") is Proposed and says exactly that. G0 must not depend on it and `woundup.save` holds no anchor data (SAVE_PERSISTENCE_SPEC §4.1, §5; design in [SPATIAL_WORLD_SYSTEM.md](SPATIAL_WORLD_SYSTEM.md) §10). Whether an anchor id may ever be stored is an open save decision (audit A §4.2, proposed ADR G).

**Exit gate**

- Each specified behaviour has deterministic unit tests, in the style of the solver tests.
- The save migration is tested, and an old SaveV1 still loads.
- Scene draw calls, triangles and texture memory are read from `renderer.info` and stay inside ADR-034, or are flagged Blocked until a Quest reading exists.
- The G0 regression suite passes (TESTING_QA_PLAN §6).
- 60 fps holds on a Quest, or the item is recorded Blocked.

**Excluded:** other worlds (G5), sharing and accounts (G4).

## 5. G2 Advanced engineering (proposal)

**Contains (directive Part 10):** multi-stage transmissions, energy distribution, timing systems, mechanical diagnosis, fault propagation, simulation preview, advanced machinery. IDEAS §4.3 adds additional gear families, belt arrangements, multiple interacting shafts, advanced cam profiles and compound gear trains.

**Builds on:** the four solver outcomes, the five connection types, spring energy, the two scripted repairs and X-ray (section 3.1; [PRODUCT_PILLARS.md](PRODUCT_PILLARS.md) §4). Five shared mechanical parts already have manifest entries labelled G2: `ratchet_wheel`, `pawl_standard`, `flywheel_standard`, `coupling_rigid` and `worm_gear` (MASTER_ASSET_INVENTORY §5, family J).

**Entry gate**

1. A mechanical engine v2 contract is accepted in an ADR, saying which new connection types exist and how they stay deterministic and non-physical (audit A §4.2, proposed ADR H). Today the solver allows five edge types (MECHANICAL_SOLVER_SPEC §8), forbids frame timing (§2), and a contract change needs the lead (AGENT_WORKFLOW §14). A draft is in [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md).
2. The five G2 parts need one-way, worm and inertia behaviour, which are outside the five edge types (MASTER_ASSET_INVENTORY §5 J). They are not approved to build before delivery (ADR-028 rule 4; WORLD_ASSET_INVENTORY §7).
3. The blueprint schema is final. It is a deferred decision today ("Final blueprint schema: validate against all required machines", DECISIONS §5), and blueprint versions must not reinterpret older data (DATA_AND_BLUEPRINT_SPEC §16).
4. Simulation preview shows the solver's result and not a physics run (ADR-009, REJ-001; SIMULATION_SPEC §16). Any new outcome value beyond `runs`, `runs_wrong`, `jams` and `incomplete` changes the solver contract and needs the lead.
5. New machines reuse the existing blueprint, solver, assembly, simulation and placement systems and need no hard-coded gameplay architecture (IDEAS §4.2).

**Exit gate**

- Each new connection type has unit tests for correct results, determinism (as SOL-10) and invalid input (as SOL-11 and SOL-12).
- Every G0 solver test still passes.
- New parts reach VALIDATED and then INTEGRATED under ADR-037, with the status tied to the file hash.
- Understandability is checked with a first-time tester, because advanced mechanics must stay "understandable to players" (IDEAS §4.3).

**Excluded:** a player-facing free-build editor (G3).

## 6. G3 Creative sandbox (proposal)

**Contains (directive Part 10):** free-build workshop, modular component library, custom machine construction, blueprint editor, machine validation, saved inventions. Free-build is a CLAUDE.md §14 item: it stays excluded from G0 and returns here only.

**Builds on:** the part catalogue and sockets, the solver, blueprint validation (DATA_AND_BLUEPRINT_SPEC §13) and the shared mechanical library, which is the free-build component set (WORLD_ASSET_INVENTORY §4). A draft is in [CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md).

**Entry gate**

1. Validation is hardened. In G0 every blueprint is authored by us. In G3 the input is no longer curated, so the checks in DATA_AND_BLUEPRINT_SPEC §13 and the safe-failure behaviour of SOL-11 and SOL-12 become the guard-rail.
2. The curated path is protected (proposal, from IDEAS §4.6: free-build "could undermine the curated puzzle experience"). Letters, repairs, the daily repair and the gift keep working unchanged, and the sandbox is a separate mode. G0 has six modes: Town, Build, Wind, Place, Gift and Pause (PRODUCT_SPEC §4).
3. Saved inventions have a save version. SaveV1 stores blueprint ids and built and placed flags, not assemblies (SAVE_PERSISTENCE_SPEC §4.3).
4. A part cap per machine is derived from ADR-034, which budgets a machine assembly at 60,000 triangles and 48 draw calls, and is measured on a Quest. Without a cap, a player can build past the draw-call ceiling.
5. The blueprint editor works in VR without a text keyboard. Text keyboards in VR are a §14 item, so naming an invention needs a text-free method or an explicit owner decision.
6. Gaze-and-pinch and Easy Snap complete the editor loop. Accessibility is tested as a real path (COMPETITION_REQUIREMENTS §5.3; ADR-014, ADR-036).
7. Melody composition, editing music pins and carving cams are §14 items that no generation in the directive contains. They stay excluded unless the owner assigns them (section 10).

**Exit gate**

- The validator rejects malformed or unsafe designs and fails safely.
- A sandbox session cannot change curated progress; save tests prove it.
- The part cap holds 60 fps on a Quest, or is recorded Blocked.
- The editor loop is completed by gaze-and-pinch in IWER, and on a Quest when one is available.

**Excluded:** sharing designs with other players (G4).

## 7. G4 Community (proposal)

**Contains (directive Part 10):** blueprint sharing, machine challenges, curated gallery, optional accounts, optional cloud saves, community-created puzzles.

**Builds on:** the gift link: a compact, versioned payload with a viewer that validates everything and never touches the viewer's save (ADR-011; DATA_AND_BLUEPRINT_SPEC §15; PRODUCT_SPEC §13). Sharing player designs and community puzzles need G3. Optional accounts and cloud saves do not. A draft is in [BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md).

**Entry gate**

1. An ADR amends ADR-013 for G4 only. It names the service, the data kept and what happens offline. ADR-013 keeps binding G0 unchanged (ADR-028 consequences). The directive says not to introduce Supabase, Render, external LLM APIs or backend infrastructure "unless a real future requirement justifies it" (Part 11). Optional accounts and cloud saves are that requirement if they are chosen. The basic gameplay loop stays independent of network services (Part 11).
2. Community content is untrusted input. It gets the same treatment as a gift link: validated, versioned, never trusted (CLAUDE.md §16; DATA_AND_BLUEPRINT_SPEC §15). The deterministic solver (ADR-008) is what lets the client check a design.
3. Someone curates the gallery. The curation process is not designed, and Meta's content rules apply (APP_AND_WEBSITE_GUIDELINES §1 policy test, §6 item 7).
4. A privacy decision exists. The G0 baseline is no personal information, identity or telemetry (SAVE_PERSISTENCE_SPEC §16). Any data collection is G4 or later, opt-in and the owner's decision ([PRODUCT_METRICS_AND_RETENTION.md](PRODUCT_METRICS_AND_RETENTION.md) §7).
5. Machine challenges are defined as solver-checkable goals. Leaderboards, ranks, XP and currency are §14 items that no generation in the directive contains. They are not included (proposal).

**Exit gate**

- The service works with the network off: the basic loop plays and the local save is intact.
- Hostile payloads are rejected, tested the way gift links are (ACCEPTANCE_TESTS §13).
- The policy and privacy decisions are recorded in DECISIONS.md.
- The G0 build is unchanged and still has no third-party requests (ADR-025). G4 services belong to a separate build, never to the competition build.

**Not assigned to G4:** whole-town gifting, multiple machines in one gift and other personalised gift extras (IDEAS §4.5, Proposed).

## 8. G5 Clockwork universe (proposal)

**Contains (directive Part 10):** multiple towns, multiple environments, advanced spatial experiences, cooperative experiences, player-created districts, expanded campaigns. The concrete shape is the proposed worlds in [PRODUCT_VISION_LONG_TERM.md](PRODUCT_VISION_LONG_TERM.md) §6 and the family outlines in [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) §5. Drafts are in [MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md), [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md), [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md) and [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md).

### 8.1 Shared foundation first

The directive says to build the shared technology once, and not to develop all worlds simultaneously (world-by-world strategy, "Core principle"). Before world production is scaled, these eight parts are established ("Shared foundation"). Where each part stands, as the documents describe it today:

| Foundation part | State |
|---|---|
| Shared mechanical simulation engine | Built for Tockton in G0. It must support extensions without being tightly coupled to any individual world (directive): `src/sim` names no world, and a world mechanic is a `SolverExtension` registered statically and named in a blueprint's `requires` ([MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md) section 9, the five named extensions). The extension contract needs the G2 ADR before any extension code |
| Reusable mechanical component library | Family A in the manifest, shared and not tied to Tockton |
| Shared Blender materials and asset generators | ADR-031 and ADR-032. ADR-032 was accepted by the owner on 2026-11-06 (decision 4) and can still be reversed |
| Interaction and hand-tracking systems | G0 (`src/interaction`) |
| Save and progression infrastructure | SaveV1 is Tockton-only. Several worlds need a new version and a migration (SAVE_PERSISTENCE_SPEC §10; audit A §4.1) |
| World registry and loading | Feasible in about 200 lines on public APIs, not built (audit D §5) |
| Shared asset manifest and validation | The manifest exists. The validator is specified in ADR-037 |
| Accessibility, audio and UI systems | G0 |

The foundation is a precondition, not a deliverable of a later world: world production is not scaled until these parts exist (directive, "Before scaling world production, establish"). The rows that say "not built" or "needs" show what is still missing.

### 8.2 Order and rule

Production order is 1 Tockton (initial competition world), 2 Brasswater Harbour, 3 Emberforge Mountains, 4 Verdant Observatory, 5 Aetherian Skyworks, 6 Grand Mechanical Theatre. Finish and validate one world before starting full production on the next, and keep future worlds in the architecture and roadmap without letting them increase the current competition scope (directive, world-by-world strategy). Tockton is the only competition world; all other worlds are future expansion content. The first new world is built as a complete vertical slice to validate asset reuse and memory performance, and further worlds follow incrementally (multiple-worlds requirement §8).

### 8.3 The eleven completion gates

A world is not complete because its assets exist. Every world must have (directive, world-by-world strategy):

1. World design bible.
2. Environment and layout specification.
3. Machine and building inventory.
4. Resident and character inventory.
5. Story and quest specification.
6. Unique mechanical features.
7. Asset manifest.
8. Blender source and GLB deliverables.
9. Performance budgets.
10. Gameplay acceptance tests.
11. Integration and release checklist.

The world definition must also cover identity, art direction, audio identity, collectibles, a restoration event and progression (multiple-worlds requirement §3).

### 8.4 Loading, memory and folders

- Only the active world's assets are loaded; worlds load and unload progressively and progress is saved independently (multiple-worlds requirement §4).
- IWSDK's level swap stages the new level before it disposes the old, so a swap peaks at two worlds in memory. Leaving through an empty level, then disposing the recorded assets with our own disposer, avoids it. The shared material library must never be disposed by an unload (audit D §3, §5).
- Under ADR-033 only G0 assets sit under `public/` and a CI check allows only world ids `tockton` and `shared`. The first non-Tockton world to ship needs the lead to amend ADR-033 and the check (WORLD_ASSET_INVENTORY §6).
- A world's asset inventory follows the rules of MASTER_ASSET_INVENTORY: distinct files only, no finish or colour variants, shared parts reused.

### 8.5 Cross-world progression, cooperation, districts

- Cross-world progression waits until the first world is complete and stable (multiple-worlds requirement §6). It needs a progression design ([WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md)) that keeps one progression authority per save (DATA_AND_BLUEPRINT_SPEC §12).
- Cooperative experiences are multiplayer, a §14 item, and networked simulation is a SIMULATION_SPEC §16 non-goal for G0. They need a networking ADR and a feasibility spike before any design (Research).
- Player-created districts depend on G3 and G4.

**Exit gate (per world):** all eleven gates, the integration and release checklist, the G0 regression suite, budgets within ADR-034 on a Quest or recorded Blocked, and a first-time playtest of the world's opening (JUD-08 style).

## 9. What G0 already does for the future

The specifications already contain these decisions, except the last row, which is a labelled proposal. The rest cost nothing extra and are the only way G0 prepares for what follows. The full list of seams G0 keeps open is [MASTER_SYSTEM_ARCHITECTURE.md](MASTER_SYSTEM_ARCHITECTURE.md) §7; this table is the strategic summary.

| Seam | Source | Helps |
|---|---|---|
| Machines are data: blueprints, parts, sockets and connections with stable IDs, separate from rendering | DATA_AND_BLUEPRINT_SPEC §2, §14; directive Part 11 | G2, G3, G4, G5 |
| The solver is pure, deterministic and imports no rendering or XR | ADR-008; CLAUDE.md §11 | G2, G3, G4 (client-side validation) |
| A finish is a runtime material, an asset id carries no finish, and repeated parts are instances | ADR-030, ADR-032, ADR-033 | G3, G5 |
| Folders split `shared`, `tockton` and `assets/future`, with a CI check on `dist/` | ADR-033 | G5 |
| Saves and gift payloads are versioned, validated and fail safely on an unknown version | SAVE_PERSISTENCE_SPEC §9, §10; DATA_AND_BLUEPRINT_SPEC §16 | G1, G3, G5 |
| The gift is one machine as validated data in a URL | ADR-011; DATA_AND_BLUEPRINT_SPEC §15 | G4 |
| One progression authority, and letters as data | GAMEPLAY_SYSTEMS §4; DATA_AND_BLUEPRINT_SPEC §11, §12 | G1, G5 |
| A shared interaction abstraction under hands, ray and gaze modes | BUILD_ROADMAP §17; ADR-024, ADR-036 | G3 |
| Proposal, not a G0 requirement: Tockton reached through one definition object, with no `tockton` literal in shared modules (no G0 specification needs it; the lead decides). A registry holding more than one entry is not built in G0 | MASTER_SYSTEM_ARCHITECTURE §7 seam 8; WORLD_REGISTRY_AND_LOADING §1; audit D §5 | G5 |

**Deliberately not built in G0:** a second save version, any second world, resident behaviour, a free-build editor, any backend or account, and any analytics. Building one early to "get ahead" breaks ADR-028 and risks the deadline (REJ-004).

## 10. Research, and where excluded items could return

### 10.1 Research items already named in the documents

| Item | Source |
|---|---|
| Draco, meshopt or KTX2 compression: a self-hosted spike and the owner's approval first. KTX2 is the first candidate if a Quest reading shows texture-memory pressure | ADR-035 |
| Belts generated at runtime, because their length depends on the layout | MASTER_ASSET_INVENTORY §10 |
| Cooperative WebXR experiences: feasibility only, no design | Directive Part 10 (G5); section 8.5 |

### 10.2 The CLAUDE.md §14 map

Every §14 item is excluded from G0 (ADR-028 rule 2). This table says where it could return as a proposal, or that no generation holds it.

| §14 item | Where it could return | Basis |
|---|---|---|
| Free-build workshop | G3 | Directive Parts 2 and 10; IDEAS §4.6 |
| Weekly commissions, seasonal parts, festivals | G1, as town events or expanded stories, by owner decision | Directive Part 10 G1; IDEAS §4.4 |
| Accounts, login, cloud save | G4, optional | Directive Part 10 G4 |
| Multiplayer | G5, as cooperative experiences | Directive Part 10 G5 |
| Analytics, telemetry | G4 or later, opt-in, owner decision | [PRODUCT_METRICS_AND_RETENTION.md](PRODUCT_METRICS_AND_RETENTION.md) §7 |
| Lighthouse | G5, Brasswater Harbour | WORLD_ASSET_INVENTORY §5 |
| Tram | G5, Emberforge Mountains (steam locomotives) | WORLD_ASSET_INVENTORY §5 |
| Hot-air balloon | G5, Aetherian Skyworks | WORLD_ASSET_INVENTORY §5 |
| Grand theatre performance, choreography | G5, Grand Mechanical Theatre | Directive, World 6 |
| Whole-town gifting | Not assigned. G4 covers blueprint sharing | Directive Part 10 G4; IDEAS §4.5 |
| Leaderboards, ranks, XP, currency, shops, rarity tiers, in-app purchases | Not assigned | No generation in Part 10 names them |
| Voice input, microphone, humming, melody composition, editing music pins, carving cams | Not assigned | No generation in Part 10 names them |
| AI/LLM calls | Not assigned. Needs a real future requirement | Directive Part 11 |
| Passthrough camera or computer vision | Not assigned | No generation in Part 10 names it |
| Text keyboards in VR | Not assigned. Raised by G3 naming of inventions | Section 6 |
| Unity, Unreal, native APK | Not assigned. A technology change needs an ADR | CLAUDE.md §5 |

"Not assigned" means a later owner decision could assign it. It does not mean it is planned.

## 11. Sequencing, gates, risks and open decisions

### 11.1 What actually constrains the order

| Generation | Hard dependencies | Soft dependencies |
|---|---|---|
| G1 | G0 delivered; a resident behaviour spec; a new save version if world state persists beyond SaveV1; a budget plan | A first Quest reading |
| G2 | G0 solver stable; the engine v2 contract ADR; the five G2 parts | None |
| G3 | G0 blueprints and validation; the shared part library; a new save version for inventions; an editor interaction design | G2 gives a richer part vocabulary |
| G4 | An ADR amending ADR-013; privacy and policy decisions. Sharing player designs and community puzzles also need G3 | G2 |
| G5 | The shared foundation (section 8.1); the world registry; a multi-world save; the first-world vertical slice | Content from G1 to G4 |

### 11.2 Gate templates (proposal)

**To start a generation:**

1. The owner approves it and the approval is recorded in DECISIONS.md.
2. G0 is delivered and the hold period is over, or the owner has said how it applies (section 3.5).
3. Its design documents are written and its shared contracts are defined before parallel work begins (CLAUDE.md §10 rule 1, §19).
4. Its budgets are re-based on a Quest reading when one exists, otherwise marked provisional (ADR-034).
5. Each task has a priority, effort, dependencies, acceptance criteria, an assigned agent, a target date and a status (CLAUDE.md §2).

**To finish a generation:**

1. Implementation, tests, typecheck, lint and build pass, and acceptance criteria are met (CLAUDE.md §18).
2. Verification levels are recorded separately. Anything without hardware evidence is Blocked and listed.
3. Scenes are within ADR-034, or the exceptions are written and justified.
4. Assets are VALIDATED and INTEGRATED, not merely exported (directive Part 9).
5. The G0 regression suite passes and the delivered competition behaviour is unchanged.
6. A first-time playtest has been observed for any new player-facing flow ([PRODUCT_METRICS_AND_RETENTION.md](PRODUCT_METRICS_AND_RETENTION.md) §4.2).

### 11.3 Risks

| Risk | Source | Effect on the roadmap |
|---|---|---|
| No headset and no tester | PRODUCTION_AUDIT §9 risk 1 | Every generation starts from a base with no Quest evidence unless TP-7 is met |
| The awakened town is near the draw-call ceiling | PRODUCTION_AUDIT §9 risk 5; ADR-034 | G1 and G5 content has no spare budget without merging, instancing or a separate scene |
| Release-candidate SDK | PRODUCTION_AUDIT §9 risk 6; ADR-016 | An upgrade may change APIs; the first task after delivery is a branch check |
| Save format growth | SAVE_PERSISTENCE_SPEC §10; audit A §4.2 | Several generations need a new save version; plan one migration path |
| Asset capacity | PRODUCTION_AUDIT §9 risk 4; audit E §5 | Parametric families and one review render per family are what make asset volume feasible |
| Scope creep into G0 | REJ-004; ADR-028 | The firewall and the hold period exist for this |

### 11.4 What may be said publicly about the future

The Devpost description asks for inspiration, how it was built and future plans (APP_AND_WEBSITE_GUIDELINES §4). The owner submits it personally and agents only draft. Future plans may use the labels in this roadmap, worded as plans and never as features. The video and text claim nothing that is not built (JUD-20, JUD-21; COMPETITION_REQUIREMENTS §8.1).

### 11.5 Open decisions for the owner

| Decision | Default applied | Link |
|---|---|---|
| Is there an original Technical Design Doc, which could change this roadmap | None; the listed documents and ADRs are the specification | Owner decision pending: [decision 1](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner) |
| Who tests on a Quest 3 or 3S, and when | Hardware tests stay Blocked | Owner decision pending: [decision 2](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner); BUILD_ROADMAP TP-7 |
| Shared material library (ADR-032), which G3 and G5 reuse | Accepted on 2026-11-06 | Decided: [decision 4](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner); the owner can still reverse it |
| Gear module and tooth set, which every later part family inherits | Manifest default | Owner decision pending: [decision 5](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner) |
| Which generation follows delivery, and whether they are built strictly in order | Directive list order; not a commitment | Owner decision pending (new) |
| Which world comes second | Directive order, Brasswater Harbour; not approved | Owner decision pending: WORLD_ASSET_INVENTORY §7 |
| Hold-period rule: nothing later is promoted to production, and any change to the submitted build is the owner's call | Applied as a proposal | Owner decision pending (new): section 3.5 |
| Whether any shared asset is made before delivery | No; ADR-028 rule 4 | WORLD_ASSET_INVENTORY §7 |

## 12. Acceptance criteria for this document

1. G0 and each of G1 to G5 and Research has a label, contents that match directive Part 10, an entry gate and an exit gate or a stated reason it has none.
2. Section 3 matches PRODUCT_SPEC §5 and §19 and BUILD_ROADMAP §16 and §13, with no change to the cut order.
3. Every CLAUDE.md §14 item is mapped to a generation or marked not assigned.
4. No date after 18 November is given except the winner announcement around 11 December, which comes from APP_AND_WEBSITE_GUIDELINES §4.
5. Every owner decision that is still open is marked "Owner decision pending" with a link.
6. No asset or feature count is restated by hand, and no G1 to G5 item is described as competition required.
7. Every link resolves.
