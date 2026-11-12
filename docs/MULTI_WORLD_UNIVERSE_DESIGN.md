# Wound Up — Multi-World Universe Design

**Project:** Wound Up
**Label:** G5 Clockwork universe. The five worlds after Tockton are concepts, not approved for production. Tockton is the only world in the competition build. Read the scope firewall in [DECISIONS.md](DECISIONS.md) ADR-028 first.
**Status:** Proposal. This refines the six world concepts of the owner's directive into one world design document. It approves no world, creates no asset, and adds nothing to any task list.
**Date:** 2026-11-06
**Source:** [directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md), "Additional master requirement: multiple worlds and expandable universe" (called the multiple-worlds requirement below) and "World-by-world production strategy"; Part 10 (Generation 5)
**Related:** [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md), [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md), [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md), [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md), [RESIDENT_BEHAVIOUR_SPEC.md](RESIDENT_BEHAVIOUR_SPEC.md), [CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md), [PROJECT_BIBLE.md](PROJECT_BIBLE.md), [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md), [IDEAS.md](IDEAS.md), [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md), [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md), [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md), [SPATIAL_WORLD_SYSTEM.md](SPATIAL_WORLD_SYSTEM.md)

## 1. What the competition build needs from this document

Nothing is built, loaded or itemised for any world other than Tockton before the competition build is delivered (multiple-worlds requirement §9; ADR-028 rules 3 and 4).

Four constraints on the competition build keep the later worlds possible. Each one already exists elsewhere:

1. The solver, the part catalogue and the blueprint format name no world. `src/sim` never mentions Tockton (CLAUDE.md §10, §11; ADR-008).
2. Every asset and data record carries a stable id and, in the manifest, a `worldId` of `shared` or `tockton` (ADR-033; [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) section 2).
3. The save is versioned, and progress is not tied to coordinates (SAVE_PERSISTENCE_SPEC §3, §5, §10).
4. No GLB for another world sits under `public/`, because Vite ships everything there (ADR-033; [audits/D_WEBXR_ARCHITECTURE.md](audits/D_WEBXR_ARCHITECTURE.md) §5).

What the competition runtime builds for this, and what it does not, is listed in [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) §4. This document adds nothing to it.

## 2. How to read this document

- A concept is a design direction. It carries no count, no asset list and no schedule.
- Each world is described with the sixteen elements the directive requires of a complete world (multiple-worlds requirement §3), numbered 1 to 16 in the tables.
- Source text comes from the directive: theme, possible locations, unique mechanics, story direction, and the engine extension named in the world-by-world strategy. Everything else is marked proposal.
- Place names in the "buildings" row come from the directive's lists. The short "proposed first set" of four machines or buildings per world mirrors Tockton's four machine plots (PRODUCT_SPEC F2) and is a proposal.
- Resident rows give roles, not names. Names need owner approval (section 12).
- Elements 14 to 16 are mostly common to all worlds and are handled once in section 3.6; each world table adds only what is specific to it.

## 3. Rules common to every world

### 3.1 Shared and world-specific systems (multiple-worlds requirement §5)

| Shared by every world | World-specific |
|---|---|
| Player interaction, hand tracking, spatial anchoring, accessibility | Architecture, environmental design |
| Mechanical simulation engine, component library, blueprint format | Residents, story |
| Save infrastructure, inventory and journal, quest framework | Local machines, production chains |
| Audio framework, rendering and asset pipeline | World events, unique puzzles, world-specific mechanics |

A world-specific mechanic extends the shared simulation through a documented interface and never duplicates the engine (multiple-worlds requirement §5; world-by-world strategy).

### 3.2 Table-scale diorama (proposal)

Every world is a miniature placed on the player's table or the stand by the shared placement system (ADR-026), inside the Tockton footprint rule: about 60 x 40 cm, scalable to 75%, with essential targets within about 60 cm of the chest and about 35 degrees of the line of sight (PROJECT_BIBLE §2; INTERACTION_SPEC §3). A world may use height, not breadth. The world definition carries its footprint and minimum scale, and the stage root and its anchor belong to the session ([SPATIAL_WORLD_SYSTEM.md](SPATIAL_WORLD_SYSTEM.md) §11; WORLD_REGISTRY_AND_LOADING §3, §9). Reason: placement, hand tracking and comfort are shared systems, and a large open environment was rejected for Tockton (PROJECT_BIBLE §2). Larger spatial experiences are a separate G5 item in directive Part 10 and are not designed here.

### 3.3 A different look, not a recolour (multiple-worlds requirement §1)

- The competition palette (aged brass, walnut, cream, deep teal, warm lamp glow; PROJECT_BIBLE §4) is Tockton's. Each world proposes its own dominant colours and silhouette.
- Every world keeps the shared material vocabulary: brass, wood, enamel, glass, painted metal, fabric, ceramic, paper (CLAUDE.md §8). Shared parts then look right in any world, because a finish is a runtime material (ADR-030) and new looks are new `Mat_<Name>` entries in the shared material library, not new textures per file (ADR-032).
- The frozen and awakened structure stays: about 0.15 saturation and a cool tint when frozen, full colour and a ripple of about 1.5 seconds when awake (PROJECT_BIBLE §6). The tint direction is a per-world parameter, because a world that is already cool needs testing.
- No excessive bloom, neon or expensive post-processing (CLAUDE.md §8).

### 3.4 Extending the mechanical engine (proposal)

The directive requires that "the mechanical engine must support extensions without being tightly coupled to any individual world". The extension interface is [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md) §9, which also lists the directive's five example extensions, one per world: a world mechanic is a `SolverExtension` that is pure and deterministic, registered statically, named in a blueprint's `requires`, and shipped with the world that needs it. It adds edge types, node quantities and optional result fields. It does not change V1 semantics or add a status, and nothing in `src/sim` names a world. Rules that bind every row below, from that document and from ADR-008, ADR-009 and REJ-001:

1. Determinism rules D1 to D6 apply: canonical ordering, basic arithmetic in anything that sets a status, no hidden inputs, closed-form time, named constants (MECHANICAL_ENGINE_V2 §4).
2. No new status values. A new failure is `jams` or `runs_wrong` with a typed reason (rule C5).
3. A mechanic computes steady-state relations from authored constants and curves, like gear ratios and spring runtime. It does not time-step a physical model. "Complex fluid simulation" and "realistic wind simulation" are non-goals of the shared simulation (SIMULATION_SPEC §16), so the water and air rows below use authored relations. Lifting that non-goal for any world is an owner decision.
4. Environment cycles (tide, sky, heat, lift) are authored periodic profiles evaluated by the controller from elapsed session time (MECHANICAL_ENGINE_V2 rule D4). They restart each session, are never saved, and have no offline catch-up (WORLD_SIMULATION_SPEC §4.3). A cycle tied to the real clock would need the injected local time that day/night uses, and is an owner decision.
5. A change to the solver's five edge types is a shared-interface change owned by the lead (MECHANICAL_SOLVER_SPEC §8; AGENT_WORKFLOW §14). The "unique mechanical systems" rows state what each world asks of the engine. They do not define the contract.

### 3.5 Production order and completion gates

Order: 1 Tockton (the competition world), 2 Brasswater Harbour, 3 Emberforge Mountains, 4 Verdant Observatory, 5 Aetherian Skyworks, 6 Grand Mechanical Theatre. Worlds are not developed simultaneously. One world is finished and validated before full production starts on the next, and Tockton is the only competition world (world-by-world strategy, "Core principle", "Production discipline"). The shared foundation (the eight parts in [EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md) section 8.1) is established before world production is scaled. The first new world is built as a complete vertical slice to validate asset reuse and memory (multiple-worlds requirement §8; section 10).

A world is complete only when it has every gate below. Assets alone do not complete a world (world-by-world strategy).

| Gate | Where it is written for each new world |
|---|---|
| World design bible | Written at approval. This document holds the concept only |
| Environment and layout specification | Same |
| Machine and building inventory | Same |
| Resident and character inventory | Same |
| Story and quest specification | Same, on the model of [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) |
| Unique mechanical features | [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md) §9 plus the world's bible |
| Asset manifest | Entries in [assets/manifest/glb-manifest.json](../assets/manifest/glb-manifest.json) (section 3.6) |
| Blender source and GLB deliverables | `blender/source/<family>/` and `assets/future/<world_id>/<family>/` (ADR-033) |
| Performance budgets | Section 3.6 |
| Gameplay acceptance tests | Section 3.6 |
| Integration and release checklist | Written at approval |

### 3.6 Elements 14 to 16 for every world

**14. Performance budgets.** The ADR-034 ceilings apply to every world scene: 200 draw calls, 750k visible triangles, 128 MiB unique texture memory, and the per-category GLB limits (frame time p99 at most 16.7 ms). A world gets its own scene row only after a Quest reading, which is Blocked until a tester exists. Only the active world's assets are loaded (multiple-worlds requirement §4). IWSDK never frees asset GPU memory on a level change, so the project needs its own disposer, and the world swap should pass through an empty level so two worlds are not in memory at once ([audits/D_WEBXR_ARCHITECTURE.md](audits/D_WEBXR_ARCHITECTURE.md) §3.2, §5; [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) §6).

**15. Required GLB inventory.** None is written for any world after Tockton and no count is given ([WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) section 5). After approval, entries use `worldId` equal to the world id, a G5 label until the world is scheduled, and the path `assets/future/<world_id>/<family>/` (ADR-033). The count is distinct deliverables only. Finishes, colours and repeated pieces are not counted (ADR-030; world-by-world strategy).

**16. World-specific acceptance tests.** Every world needs these common tests (proposal), plus the world's own:

| ID | Check | Level |
|---|---|---|
| WLD-01 | Entering and leaving the world returns `renderer.info.memory` geometries and textures to their prior values | IWER, then Quest Browser |
| WLD-02 | The world restores exactly from its save record | Desktop |
| WLD-03 | The restoration event plays once and is recorded | Desktop |
| WLD-04 | The world's unique mechanic passes its solver unit tests | Desktop |
| WLD-05 | The scene stays inside the ADR-034 ceilings | Quest Browser and physical Quest |
| WLD-06 | No asset is duplicated against the shared library without a recorded reason | Desktop (manifest check) |

### 3.7 Where concepts touch items excluded from the competition build

These items are on the CLAUDE.md §14 and PRODUCT_SPEC §18 lists. A concept below may describe them as design intent only (ADR-028 rule 2). All remain excluded from G0.

| Concept element | Excluded item | Status |
|---|---|---|
| Mechanical lighthouse (World 2) | Lighthouse | Excluded from G0; belongs to World 2 only |
| Steam-powered locomotives, ore transport (World 3) | Tram | Excluded from G0; World 3 only |
| Airships (World 5) | Hot-air balloon | Excluded from G0. The directive's World 5 lists airships, not balloons, so no balloon is proposed |
| Grand theatre, clockwork ballet, cam-based choreography, mechanical orchestra (World 6) | Grand Theatre performance, choreography, carving cams | Excluded from G0. Tockton's theatre facade stays a static front |
| Cooperative experiences, player-created districts (directive Part 10) | Multiplayer; free-build workshop | Not designed. See [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md) section 8 |
| Collectibles in every world | Rarity tiers, XP, ranks, currency, shops | Not used by default |
| Town events | Festivals, seasonal parts, weekly commissions | Not implied |
| Observatory | Appears in IDEAS §4.2 as a deferred machine idea | World 4 is its home |

### 3.8 Asset reuse (world-by-world strategy, "Asset reuse")

Every world uses the shared mechanical library wherever possible. The rules, from the directive and the accepted ADRs:

1. No gear, shaft, bearing, spring, connector or other common part is duplicated without a documented reason. The reason is written in the new entry's `distinctBecause` and in the world's inventory, and acceptance test WLD-06 checks it (section 3.6).
2. Geometry is parameterised where appropriate: a tooth count, length or size is a parameter of a family generator and one manifest entry (ADR-031), not a hand-made copy.
3. Looks are runtime material configuration: a finish or colour is a material from the shared library, never a second file (ADR-030, ADR-032; section 3.3).
4. Separate geometry is made only when the design genuinely requires it, for example a building or a machine housing that has the world's identity, or a mechanism part the shared library cannot give.
5. The manifest keeps the distinction visible: `scopeClass` is `shared`, `world-specific`, `reused` or `future-planned`, and the counts are unique deliverables only ([GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md) section 4).

## 4. World 1: Tockton, the Forgotten Clockwork Town (G0, the only competition world)

Tockton is specified in the competition documents. This table shows where each of the sixteen elements lives and where a gap remains. It does not restate the specifications, and it does not restate asset counts: the manifest and `node tools/asset-status.mjs` are the source ([GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md) section 8).

| # | Element | Where it is specified | Gap |
|---|---|---|---|
| 1 | Identity and story | PROJECT_BIBLE §1; PRODUCT_SPEC §7 | None |
| 2 | Layout | PROJECT_BIBLE §2; PRODUCT_SPEC §3.2, §3.3 | Plot sizes and positions are unwritten (audit A gap G-07) |
| 3 | Art direction | PROJECT_BIBLE §3 to §6; CLAUDE.md §8 | None |
| 4 | Major buildings | PRODUCT_SPEC F2: four machine plots, bakery, theatre facade | No flower shop (owner decision of 2026-11-06, ADR-039; ruling I-16 is closed). Houses are open (manifest `town_houses`) |
| 5 | Characters and residents | PRODUCT_SPEC §6.3, §7; [TOCKTON_CHARACTERS.md](TOCKTON_CHARACTERS.md) | Only Mira and Otto have figures, and Otto is the baker (ADR-039, gap G-10 closed). Their scale and placement wait for the canonical dimensions table |
| 6 | Machine families | PRODUCT_SPEC §6: Music Box, Carousel, Windmill with Bakery, Clock Tower (G0-optional) | Only 4 of the Music Box's 12 parts are named, and no machine has sockets, ratios or energy constants ([PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §9 risk 3) |
| 7 | Component requirements | DATA_AND_BLUEPRINT_SPEC §4; manifest family A | Gear module and tooth set (decision 5) |
| 8 | Unique mechanical systems | MECHANICAL_SOLVER_SPEC §8, §12 | None |
| 9 | Quests and progression | [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) section 3; GAMEPLAY_SYSTEMS §4, §5, §12 | Letter 2 trigger and Letter 6 fallback |
| 10 | Environmental interactions | GAMEPLAY_SYSTEMS §14 (wake); MECHANICAL_SOLVER_SPEC §12.2 (ambient wind); PRODUCT_SPEC §6.4 | None |
| 11 | Audio identity | PROJECT_BIBLE §9; SIMULATION_SPEC §11 | None |
| 12 | Collectibles and discoveries | None in G0. Rarity is excluded; discoveries are G1 | By design |
| 13 | Restoration progression | PRODUCT_SPEC §11; GAMEPLAY_SYSTEMS §14; closing card | None |
| 14 | Performance budgets | ADR-034; CLAUDE.md §12 | Values provisional until a Quest reading |
| 15 | GLB inventory | [assets/manifest/glb-manifest.json](../assets/manifest/glb-manifest.json); [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md) | See that document |
| 16 | Acceptance tests | ACCEPTANCE_TESTS | Quest-level checks are Blocked |

## 5. World 2: Brasswater Harbour (`brasswater-harbour`, concept)

Theme (directive): a mysterious mechanical harbour powered by water, tides, steam and maritime machinery. Engine extension named by the strategy: hydraulic systems, pumps and water flow.

| # | Element | Concept |
|---|---|---|
| 1 | Identity and story | The harbour stopped working and ships have been stranded for years. The player restores its machinery and uncovers what happened to the missing expedition (directive) |
| 2 | Layout | Proposal: a quayside diorama. The sea fills one long edge, wharf and workshops the other, floating platforms add vertical variation, all inside the section 3.2 footprint |
| 3 | Art direction | Proposal: cool sea-grey and teal with weathered brass and verdigris, dark wet-looking walnut, rope and canvas, painted iron hulls, warm lamp glow in the windows. A horizontal skyline against Tockton's town silhouette. The frozen tint needs testing because the palette is already cool (section 3.3) |
| 4 | Major buildings | Directive: mechanical lighthouse, shipyard, water-powered workshops, harbour cranes, floating platforms, mechanical submarines, tide observatory, ship repair station. Proposed first set: water-powered workshop, tide observatory, harbour crane, mechanical lighthouse |
| 5 | Characters and residents | Roles only, derived from the places: lighthouse keeper, shipwright, tide watcher, crane operator. The missing expedition is known through letters and journal pages, not a present character (proposal) |
| 6 | Machine families | Proposal from the directive's mechanics: water wheel and pump station, tide table mechanism, crane with hydraulic linkage, lighthouse lamp mechanism |
| 7 | Component requirements | Reuse family A: gears, shafts, springs, bearings, cams, cranks, pulleys, belts. New parts to check against the library before any file is made: paddle wheel, pump piston and cylinder, valve, float. Pipes are runtime geometry unless a model proves necessary |
| 8 | Unique mechanical systems | Proposal for a `hydraulics` extension: a fluid edge type carrying flow Q and pressure p. A pump gives Q = d x w for an authored displacement d per radian; a water wheel or hydraulic motor gives w = Q / dm; a hydraulic ram gives speed v = Q / A. Valves are open or closed. Pressure drop is an authored constant per pipe run. All steady-state (section 3.4). Tide is an authored periodic profile that scales the available head (section 3.4 rule 4). A float's height is a lookup of water level. A pressure contradiction in a loop is a jam with a typed reason, like a velocity contradiction (MECHANICAL_SOLVER_SPEC §10) |
| 9 | Quests and progression | Proposal for four beats: wake the first pump station (it teaches the fluid rule as the Music Box teaches gears); restore tide-dependent machines; free the stranded ships; reveal the expedition's fate. A repair fault such as a stuck valve reuses the G0 repair pattern (GAMEPLAY_SYSTEMS §12) |
| 10 | Environmental interactions | The tide, an authored periodic profile (section 3.4 rule 4), raises and lowers floating platforms and scales available flow. Harbour lights respond to power. No weather or fluid simulation (SIMULATION_SPEC §16) |
| 11 | Audio identity | Water lap, buoy and ship bells, rope creak, pump thump, lighthouse horn. Procedural Web Audio (PROJECT_BIBLE §9) |
| 12 | Collectibles and discoveries | Expedition journal pages, charts as blueprints, salvaged components, as discoveries ([STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) section 6). A harbour component can unlock a Tockton machine (directive; [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md) section 2) |
| 13 | Restoration progression | Each restored machine wakes its plot. The restoration event: the lighthouse and tide gate come alive and the stranded ships are freed (story direction) |
| 14 | Performance budgets | Section 3.6, plus: water is the main risk. Transparent layers and animated surfaces cost fill rate, so use few stylised layers (directive Part 6: avoid excessive transparent materials; CLAUDE.md §12) |
| 15 | GLB inventory | Section 3.6 |
| 16 | Acceptance tests | Section 3.6, plus: the tide cycle is deterministic; pump and wheel relations pass unit tests; an inconsistent pressure loop is rejected like an inconsistent velocity loop (MECHANICAL_SOLVER_SPEC §10) |

## 6. World 3: Emberforge Mountains (`emberforge-mountains`, concept)

Theme (directive): a mountainous industrial settlement powered by steam, furnaces and large mining systems. Engine extension named by the strategy: pressure, pistons and foundry machinery.

| # | Element | Concept |
|---|---|---|
| 1 | Identity and story | The mountain's great furnace has gone cold. The residents need the player to restore the ancient machinery beneath the mountain (directive) |
| 2 | Layout | Proposal: a terraced cutaway. The settlement sits on top and mine shafts, lifts and the furnace chamber show in a cross-section beneath, so the underground fits the table footprint |
| 3 | Art direction | Proposal: iron, soot-dark painted metal, copper and aged brass, stone. Ember orange appears only as emissive glow at furnaces and windows. Heavier silhouettes than Tockton. No bloom (CLAUDE.md §8) |
| 4 | Major buildings | Directive: mountain foundry, mining facilities, ore transport, mechanical lifts, furnace rooms, steam-powered locomotives, underground workshops, giant drilling machines. Proposed first set: furnace room, mechanical lift, mountain foundry, giant drilling machine |
| 5 | Characters and residents | Roles only: foundry master, miner, lift operator, engineer (proposal) |
| 6 | Machine families | Proposal: furnace with bellows, steam engine with piston, lift with counterweight, drill with a heavy transmission, ore cart or locomotive (the locomotive touches the tram exclusion, section 3.7) |
| 7 | Component requirements | Reuse family A at larger sizes, plus the shared G2 parts `flywheel_standard` and `coupling_rigid` ([MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md)). New parts to check first: piston and cylinder, valve, boiler vessel, bellows, chain |
| 8 | Unique mechanical systems | Proposal for a `pressure` extension that builds on G2. Energy distribution and torque overload are already proposed in MECHANICAL_ENGINE_V2 §6.1 and §6.2: several sources and consumers, T = sum E / sum D, and a load the torque cannot meet is a jam with reason `overload`. Emberforge adds a pressure vessel as one more energy source in that network: it fills at a boiler rate and drains at the engines' draw. A piston gives force F = p x A; a crank turns stroke into rotation (existing crank family); valve timing uses an existing cam and follower (MECHANICAL_SOLVER_SPEC §8.4); a relief valve that opens above a threshold is a typed jam reason, `overpressure`. The "complex machine sequencing" the directive names uses the existing trigger edge (§8.5): a consumer starts only after the one it depends on |
| 9 | Quests and progression | Proposal: relight the furnace in stages: air and bellows, boiler pressure, the lift, then the drill that reaches the ancient machinery. Sequencing puzzles carry the world's identity |
| 10 | Environmental interactions | An authored heat level (cold, warm, hot) sets pressure generation and light. Lifts move between levels. No thermal simulation |
| 11 | Audio identity | Furnace roar, hammer and anvil ring, steam hiss, chain clank, a lower register than Tockton |
| 12 | Collectibles and discoveries | Foundry blueprints and ancient components found under the mountain, as discoveries. A mechanism invented here can drive a machine in another world (directive; [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md) section 2) |
| 13 | Restoration progression | Each restored machine heats and lights its area. The restoration event: the great furnace is relit (story direction) |
| 14 | Performance budgets | Section 3.6, plus: steam and smoke are particles, which must stay few (SIMULATION_SPEC §14, §16). Furnace and window glow are emissive materials, not lights, because night allows at most four point lights (CLAUDE.md §8) |
| 15 | GLB inventory | Section 3.6 |
| 16 | Acceptance tests | Section 3.6, plus: pressure fill and drain runtime; the overpressure jam reason; start-order cases |

## 7. World 4: Verdant Observatory (`verdant-observatory`, concept)

Theme (directive): a mysterious astronomical and botanical world where clockwork instruments control observatories, gardens and celestial mechanisms. Engine extension named by the strategy: planetary gearing and precision timing.

| # | Element | Concept |
|---|---|---|
| 1 | Identity and story | An ancient observatory has lost its ability to track the stars. Restoring its mechanisms reveals a forgotten connection between the different worlds (directive) |
| 2 | Layout | Proposal: a tiered hilltop. The observatory dome sits at the back, the greenhouse and garden terraces in front, and the star-tracking tower to one side. The dome opens so the player looks into the planetarium |
| 3 | Art direction | Proposal: patinated bronze, deep green, midnight blue, pale glass, white enamel, warm lamp glow. Stars are small emissive points. Thin rings and arcs give a lighter, finer silhouette than Tockton |
| 4 | Major buildings | Directive: astronomical observatory, planetarium, mechanical greenhouse, celestial clock, botanical laboratories, star-tracking tower, mechanical garden. Proposed first set: celestial clock, telescope mount, planetarium orrery, mechanical greenhouse |
| 5 | Characters and residents | Roles only: astronomer, gardener, instrument maker. The reference boards' clockkeeper and archivist roles fit here if the owner approves board characters (section 12; [audits/B_REFERENCES.md](audits/B_REFERENCES.md)) |
| 6 | Machine families | Proposal: orrery as a planetary gear train, telescope tracking drive, celestial clock, greenhouse louvres and vents, moving garden |
| 7 | Component requirements | Reuse family A gears, and the shared clock parts `escapement_wheel`, `escapement_anchor`, `pendulum_clock`, `spring_barrel` from family F (G0-optional in Tockton). New parts: internal ring gear, planet carrier, armillary rings and arms, lens or mirror mounts |
| 8 | Unique mechanical systems | Proposal for a `planetary` extension. A planetary set has two inputs and one output tied by a constraint, ws x Ns + wr x Nr = wc x (Ns + Nr), for sun, ring and carrier speeds and tooth counts, with any one member held fixed. The one-speed-per-node propagation of the G0 solver cannot express it, so it needs a small fixed-order constraint block inside an extension, as MECHANICAL_ENGINE_V2 §9 records, and the 1% inconsistent-loop rule (MECHANICAL_SOLVER_SPEC §10) still applies. Precision timing builds on the G2 timing feature: periods, phases and escapement regulators (MECHANICAL_ENGINE_V2 §6.3), with tighter tolerances in the existing tolerance field (DATA_AND_BLUEPRINT_SPEC §8). Light and shadow mechanisms use authored beams and decals, not real-time shadows (CLAUDE.md §8) |
| 9 | Quests and progression | Proposal: restore the celestial clock, align the tracking tower, then complete the orrery, which reveals the connection between worlds (story direction; [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md) section 2) |
| 10 | Environmental interactions | The sky is an authored periodic profile (section 3.4 rule 4); stars appear as the dome opens; greenhouse light level drives the moving garden through authored states |
| 11 | Audio identity | Soft chimes, glass harmonics, escapement ticks, quiet gear whirr |
| 12 | Collectibles and discoveries | Star charts as blueprints, lens components, botanical sample cards, as discoveries. A celestial blueprint can reveal a hidden location in another world (directive) |
| 13 | Restoration progression | Instruments return one by one. The restoration event: the star map completes and shows the link between worlds (story direction) |
| 14 | Performance budgets | Section 3.6, plus: nested rings and glass multiply draw calls and transparency, so rings are instanced and static parts merged (directive Part 6; CLAUDE.md §12) |
| 15 | GLB inventory | Section 3.6 |
| 16 | Acceptance tests | Section 3.6, plus: planetary relation unit tests with each member held fixed; a long-run phase test, because the solver returns closed-form periods and does not tick (MECHANICAL_ENGINE_V2 rule D4) |

## 8. World 5: Aetherian Skyworks (`aetherian-skyworks`, concept)

Theme (directive): an elevated civilisation of floating workshops, airships and elaborate airborne machines. Engine extension named by the strategy: propellers, gyroscopes and flight mechanisms.

| # | Element | Concept |
|---|---|---|
| 1 | Identity and story | The skyworks have lost the ability to stay connected. The player rebuilds the mechanisms that hold the airborne civilisation together (directive) |
| 2 | Layout | Proposal: a stack of floating platforms joined by sky bridges, hovering above the table on a cloud-like base. A height cap keeps essential targets inside the section 3.2 comfort rules, since a tall tower would fail the 60 cm and 35 degree limits |
| 3 | Art direction | Proposal: pale sky blue, warm cream, canvas, light lacquered wood, copper and brass, rope. Airy and light, with large rotating shapes, opposite to Tockton's earthbound warmth |
| 4 | Major buildings | Directive: airship docks, floating workshops, cloud observatories, mechanical flight laboratories, giant propeller systems, sky bridges, airborne factories. Proposed first set: airship dock, flight laboratory, propeller system, sky bridge |
| 5 | Characters and residents | Roles only: airship pilot, flight engineer, dock master, rigger (proposal) |
| 6 | Machine families | Proposal: propeller drive, gyroscopic stabiliser, flight-control linkage, mooring crane, bridge extension mechanism, balancing rig |
| 7 | Component requirements | Reuse family A gears, shafts, bearings, cams, cranks, pulleys. New parts: propeller hub and blades, gyroscope rotor and gimbal, counterweights, flexible couplings |
| 8 | Unique mechanical systems | Proposal for a `flight` extension. A propeller outputs a scalar lift L = k x w x w for an authored k, which sets a platform's float level. Rotational balance is a scalar, the sum of counterweight and blade moments, and an imbalance above a tolerance is a jam with a typed reason, `imbalance`. A gyroscope gives a stability value S = min(1, w / w_nominal), with no precession simulated. Linkage ratios are authored, not inferred from geometry (DATA_AND_BLUEPRINT_SPEC §7). Multi-stage transmissions are the G2 stage paths and torque model (MECHANICAL_ENGINE_V2 §6.1). No aerodynamic simulation (SIMULATION_SPEC §16) |
| 9 | Quests and progression | Proposal: restore the propellers for lift, balance them, then connect platforms with sky bridges |
| 10 | Environmental interactions | An authored air current and cloud layer. Platforms bob in proportion to lift. Airships follow authored routes |
| 11 | Audio identity | Wind, propeller whirr with pitch following the solver's rotation speed, rope creak, distant engines |
| 12 | Collectibles and discoveries | Flight logs, propeller designs, salvaged components, as discoveries |
| 13 | Restoration progression | Platforms reconnect one by one. The restoration event: the last sky bridge completes and the airships dock (story direction) |
| 14 | Performance budgets | Section 3.6, plus a risk, unverified: fast rotors can strobe on a 72 Hz display. Test on device whether rotors above a speed threshold need a cheaper disc or fewer blades |
| 15 | GLB inventory | Section 3.6 |
| 16 | Acceptance tests | Section 3.6, plus: lift and balance relations; the height cap against INTERACTION_SPEC §3 |

## 9. World 6: Grand Mechanical Theatre (`grand-mechanical-theatre`, concept)

Theme (directive): a spectacular world of automata, performance, mechanical storytelling and player-created shows. Engine extension named by the strategy: synchronisation and coordinated automata.

| # | Element | Concept |
|---|---|---|
| 1 | Identity and story | The legendary theatre is preparing its greatest performance, but its performers and stage machinery have frozen in time (directive) |
| 2 | Layout | Proposal: a proscenium stage diorama facing the player, with wings and a fly-loft above, an orchestra pit in front and workshops behind |
| 3 | Art direction | Proposal: crimson velvet, gilded brass, polished wood, painted scenery flats of paper and canvas, warm spotlight glow. The most theatrical and gilded of the worlds |
| 4 | Major buildings | Directive: grand theatre, puppet workshops, mechanical orchestra, automated stages, clockwork ballet, performance laboratories, grand mechanical exhibition. Proposed first set: automated stage, mechanical orchestra, puppet workshop, ballet turntable |
| 5 | Characters and residents | The automata are the cast. Roles: puppet maker, stage manager, conductor automaton, dancer automata (proposal). Tockton's theatre keeper (PRODUCT_SPEC §7) is a possible bridge character; owner decision |
| 6 | Machine families | Proposal: cam-driven automaton, mechanical orchestra, stage lift and trap, curtain mechanism, ballet turntable |
| 7 | Component requirements | Reuse family A cams, gears, springs and governors, and the shared `cylinder_music_box` and `comb_music_box`. New parts: figure bodies with jointed limbs, curtain track, rigging |
| 8 | Unique mechanical systems | Proposal for a `sync` extension. Synchronisation is a shared drive phase: every cam follower reads its authored profile at (phase + offset), and a common shaft already gives that (MECHANICAL_SOLVER_SPEC §8.1, §8.4). The G2 timing feature already returns periods and phases, and two cams on one shaft keep a fixed authored offset (MECHANICAL_ENGINE_V2 §6.3). New here: validated phase offsets across machines, cue points that fire at phase thresholds, and trigger networks built on the existing trigger edge (§8.5). A performance is an ordered cue list, valid when every cue fires inside its tolerance. Authored cams only. Player-made cams, choreography editing and melody editing stay excluded (section 3.7) |
| 9 | Quests and progression | Proposal: restore stage machinery piece by piece, wake the orchestra, solve rehearsal puzzles that need two machines in step, then stage the greatest performance |
| 10 | Environmental interactions | Stage lighting states, curtain and house lights. The audience is static |
| 11 | Audio identity | Mechanical orchestra with fixed authored melodies. Cue times derive from the phase and are scheduled on the Web Audio clock, so sound and motion do not drift apart (proposal; PROJECT_BIBLE §9) |
| 12 | Collectibles and discoveries | Scores as blueprints, props and automaton designs, as discoveries. A theatre mechanism can serve player-made automata once G3 exists (directive; [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md) section 2) |
| 13 | Restoration progression | Stage sections return in turn. The restoration event is the greatest performance, which is the Grand Theatre performance excluded from G0 (section 3.7) |
| 14 | Performance budgets | Section 3.6, plus: many animated figures strain the character limits (1,500 triangles, shared skeleton of at most 40 bones, ADR-034) and draw calls. Synchronised figures share clip data and instance meshes |
| 15 | GLB inventory | Section 3.6 |
| 16 | Acceptance tests | Section 3.6, plus: phase offsets validated; every cue fires once inside tolerance; audio and animation drift measured on a device |

## 10. The first new world as a vertical slice

The directive orders: finish and polish Tockton, build the shared loading architecture, build the next world as a complete vertical slice, validate reuse and memory, then add worlds one at a time (multiple-worlds requirement §8). Brasswater Harbour is next in the directive's order, but nothing is approved and the choice is an owner decision (section 12).

The slice must prove, measured, not assumed:

1. Entering and leaving leaves no GPU memory behind (WLD-01).
2. One unique mechanic extends the shared engine through a documented interface, with unit tests (WLD-04).
3. The share of the world built from shared library parts, recorded from the manifest, with each new file justified (WLD-06).
4. Frame time and draw calls inside the ADR-034 ceilings on a Quest, with the first real reading used to revise the provisional budgets (ADR-034).
5. The per-world save record round-trips and the Tockton record is untouched ([WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md)).

## 11. Dependencies

| Needs | Status |
|---|---|
| Competition build delivered and stable | Scheduled for 18 November 2026 IST |
| Shared material library and parametric part families | Planned (ADR-031, ADR-032) |
| [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) | Written, G5 proposal; its §4 lists the G0 seam |
| [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md), including the extension interface of its §9 | Written, G2 proposal |
| [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md), for building states and events | Written, G1 proposal |
| SaveV2 with per-world records | [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md) |
| ADR-033 and the CI rule amended when a non-Tockton world ships ([WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) section 6) | Lead |
| A Quest tester | Blocked ([PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) decision 2) |

## 12. Owner decisions pending

1. Which world is second. The directive's order starts with Brasswater Harbour. Default: none is started.
2. Whether any early shared asset may be made before delivery (ADR-028 rule 4). Default: no.
3. Whether board characters (Oswald, Elias, Luna, Pip, Clack) may be used in any world (ADR-029 ruling I-8). Default: no.
4. Whether the engine's non-goals on fluid and air (SIMULATION_SPEC §16) may ever be lifted for a world. Default: no; authored relations only.
5. Whether World 6's performance, a Grand Theatre performance excluded from G0, is wanted at all.

## 13. Acceptance criteria

Document checks:

1. The G5 label and the "concepts, not approved" statement are at the top.
2. Each of the five concept worlds has all sixteen elements, and elements 14 to 16 resolve to section 3.6.
3. No world after Tockton has an asset count or an asset list.
4. Every directive place name, mechanic and story direction appears as the directive gives it; everything else is marked proposal.
5. Every concept element that touches a CLAUDE.md §14 item is in the section 3.7 table.
6. No G5 item is described as a competition requirement.
7. Tockton's section 4 only points to specifications and invents none.
