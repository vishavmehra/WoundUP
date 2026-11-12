# Wound Up — Long-Term Product Vision

**Project:** Wound Up
**Label:** Spans G0 to G5. Only G0 (G0-required and G0-optional) is the competition build. Everything labelled G1 Living Tockton, G2 Advanced engineering, G3 Creative sandbox, G4 Community, G5 Clockwork universe or Research is a **proposal** under the scope firewall, [DECISIONS.md ADR-028](DECISIONS.md).
**Status:** Strategy. This document adds no requirement to the competition build.
**Date:** 2026-11-06
**Source:** [owner directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) (Parts 2, 3, 10 and 13, the multiple-worlds requirement and the world-by-world production strategy), [PROJECT_BIBLE.md](PROJECT_BIBLE.md), [PRODUCT_SPEC.md](PRODUCT_SPEC.md), [IDEAS.md](IDEAS.md)
**Related:** [PRODUCT_PILLARS.md](PRODUCT_PILLARS.md), [EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md), [PRODUCT_METRICS_AND_RETENTION.md](PRODUCT_METRICS_AND_RETENTION.md), [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md), [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md), [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md)

## 1. How to read this document

Every statement here carries a label from ADR-028.

| Label | Meaning (ADR-028; directive Parts 3 and 10) |
|---|---|
| G0-required | Competition required. The Must rows of PRODUCT_SPEC §5 |
| G0-optional | Competition optional. Cut first if the schedule slips |
| G1 Living Tockton | Resident behaviour, building dependencies, town events, production chains, persistent world simulation |
| G2 Advanced engineering | Multi-stage transmissions, energy distribution, timing, fault diagnosis, simulation preview |
| G3 Creative sandbox | Free-build workshop, modular component library, blueprint editor, saved inventions |
| G4 Community | Blueprint sharing, challenges, gallery, optional accounts and cloud saves |
| G5 Clockwork universe | Worlds beyond Tockton, cooperative experiences, player-created districts |
| Research | Future research not yet assigned to a generation |

Three rules apply to the whole document (ADR-028 rules 1 to 3).

1. Writing a feature here never makes it G0-required. The competition build is what [PRODUCT_SPEC.md](PRODUCT_SPEC.md), ADR-026 and ADR-027 already say.
2. CLAUDE.md §14 governs the competition build. This document may describe a §14 item only with its generation attached.
3. Nothing labelled G1 to G5 or Research is built before the competition build is delivered (directive Part 13, "Phase 7 — Future feature implementation").

## 2. The vision

Wound Up grows from one frozen town on the player's table into a mixed-reality clockwork civilisation: several miniature towns, each with its own machines, people, look and sound, built from the same real mechanical parts (directive Part 2; multiple-worlds requirement §1). The tagline stays: **Build the machines. Wake the town. Raise the curtain.**

The central fantasy does not change: **LEGO where every piece is a real, working mechanical part** (PROJECT_BIBLE §1). The player is the town's clockmaker, and a machine works because its mechanism works.

The feeling the player is meant to have over time is the one PROJECT_BIBLE §1 lists: curiosity, wonder, warmth, satisfaction, anticipation, delight, pride and attachment as Tockton wakes. The long-term addition comes from the directive: "The player should not simply finish Tockton and run out of things to do", and should feel that Tockton was "the beginning of a much larger adventure" (multiple-worlds requirement §10). This is the reason the later generations exist. It is not a reason to enlarge the November build.

The long-term product rests on four connected pillars: a living miniature world, mechanical engineering, story and adventure, and a creative sandbox. They are defined, with their competition footing and later growth, in [PRODUCT_PILLARS.md](PRODUCT_PILLARS.md).

## 3. What stays true in every generation

These hold until an ADR changes them. They are the parts of the product that make it Wound Up rather than a different game.

| Invariant | Source |
|---|---|
| Seated, stationary and hands-first. Controllers may help and are never required. A later generation re-tests comfort limits instead of assuming the G0 numbers | ADR-014, REJ-003, PRODUCT_SPEC §2 |
| The mechanics are real. The graph solver decides the result, not a canned animation. It is deterministic, independent of rendering and XR, and not a rigid-body simulation | ADR-008, ADR-009, REJ-001, directive Part 11; JUD-03 |
| Understanding comes from visible cause and effect, with ghost hands and no wall of text | CLAUDE.md §4, PRODUCT_SPEC §15 |
| Craft is constant, identity varies. Every world is handcrafted, premium and restrained, and every world must look different rather than be a recoloured Tockton | PROJECT_BIBLE §3, CLAUDE.md §8, multiple-worlds requirement §1 |
| The shared foundation is built once: one mechanical engine, one part library, one blueprint format, one save infrastructure, one asset pipeline and validator | Directive, world-by-world strategy ("Shared foundation"); ADR-030, ADR-031, ADR-037 |
| Machines are data. Blueprints, parts, letters and saves are versioned, validated and kept separate from rendering | Directive Part 11; DATA_AND_BLUEPRINT_SPEC §2, §14, §16 |
| The basic gameplay loop works without network services | Directive Part 11 |
| 60 fps is a floor and 72 fps the target. A new feature must not compromise either | CLAUDE.md §2 (owner direction, 2026-11-05); directive Part 12; ADR-034 |
| Quality beats quantity. A few exceptionally executed interactions are worth more than many incomplete features | CLAUDE.md §20, IDEAS §9, REJ-004 |
| Verification is honest. Desktop, IWER, Quest Browser, physical Quest 3 and physical Quest 3S are separate levels, and nothing is called hardware-verified without evidence | Directive Part 12 |

## 4. The experience loop

The directive names the loop: **DISCOVER → INVESTIGATE → ENGINEER → BUILD → ACTIVATE → TRANSFORM → CREATE → SHARE** (Part 2). The game repeats it for each letter, and later generations make each step larger rather than adding a different loop.

| Step | The player | G0 (competition build) | Later generations (proposal) |
|---|---|---|---|
| DISCOVER | Opens the trunk. The frozen town unfolds on the table | F1 and F2: latch, unfolding town, four plots, Bakery and theatre facade, desaturated and still (PRODUCT_SPEC §3.2, §3.3) | G1: unlockable districts. G5: further worlds |
| INVESTIGATE | Reads a letter, studies the blueprint, uses X-ray to see inside a machine | Letters 1 to 5 and the closing card; Letter 6 is G0-optional (PRODUCT_SPEC §7). X-ray, F11 (§12). Visible symptoms of a fault, such as a Music Box that stops after about 1.5 seconds (§8) | G1: daily mysteries, hidden mechanisms, secret compartments, discoverable blueprints (pillar C). G2: mechanical diagnosis, fault propagation |
| ENGINEER | Decides which part fits and why | Part families and sizes, with the solver outcomes `runs`, `runs_wrong`, `jams` and `incomplete`; wrong-size parts may be fitted and run wrong (PRODUCT_SPEC §9; MECHANICAL_SOLVER_SPEC). Two scripted repairs (§8) | G2: multi-stage transmissions, energy distribution, timing systems, simulation preview, advanced mechanical puzzles |
| BUILD | Pinches parts and snaps them into sockets | F4: 4 cm snap, 7 cm Easy Snap, the Music Box in 40 pinches or fewer (PRODUCT_SPEC §9) | G3: free-build workshop, modular parts |
| ACTIVATE | Winds the key and runs the machine | F5: wrist winding in 90 degree steps up to 8 units, the solver decides (PRODUCT_SPEC §10) | G2: timing systems |
| TRANSFORM | Places the machine; the town responds | F10: wake ripple of about 1.5 seconds with colour, light, movement and sound; the Windmill also wakes the Bakery (PRODUCT_SPEC §11, §6.3) | G1: meaningful consequences, production chains, town events. G5: a restoration event per world |
| CREATE | Makes something nobody authored | None. Free-build is excluded (PRODUCT_SPEC §18). The nearest act is choosing one of eight preset engravings (§13) | G3: custom machine construction, blueprint editor, saved inventions |
| SHARE | Gives something away | F13: one finished machine in a URL hash, a viewer that needs no save, and a Make Your Own link (PRODUCT_SPEC §13; ADR-011) | G4: blueprint sharing, machine challenges, curated gallery, community-created puzzles |

CREATE is thin on purpose in the competition build. Judges see the arc from DISCOVER to TRANSFORM and then SHARE, and the video must show what exists and nothing more (COMPETITION_REQUIREMENTS §8.1: "Do not show unfinished features as if they were complete").

## 5. Generations at a glance

The contents column is the directive's Part 10 list. Entry gates, exit gates, dependencies and the §14 items each generation could lift are in [EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md).

| Label | Contains | Pillars it mainly advances |
|---|---|---|
| G0-required, G0-optional | The November 2026 scope: Tockton only | All four, with the sandbox pillar limited to one gift |
| G1 Living Tockton | Resident behaviour engine, building dependencies, town events, production chains, expanded stories, persistent world simulation, improved spatial persistence | A, C |
| G2 Advanced engineering | Multi-stage transmissions, energy distribution, timing systems, mechanical diagnosis, fault propagation, simulation preview, advanced machinery | B |
| G3 Creative sandbox | Free-build workshop, modular component library, custom machine construction, blueprint editor, machine validation, saved inventions | D, B |
| G4 Community | Blueprint sharing, machine challenges, curated gallery, optional accounts, optional cloud saves, community-created puzzles | D |
| G5 Clockwork universe | Multiple towns and environments, advanced spatial experiences, cooperative experiences, player-created districts, expanded campaigns | A and C, with the others carried along |
| Research | Not assigned to a generation | None |

## 6. From a town to a universe (G5, proposal)

Tockton is World 1: the introductory world, and the only world in the competition build (multiple-worlds requirement §1, §9; ADR-001). The directive proposes five more. It calls them "strategic concepts, not approved immediate implementation tasks" and asks that they be refined in a world design document. They are listed here only to show the direction. Production order is the numbered order below, one world at a time, each finished and validated before full production starts on the next. Worlds are not developed simultaneously, and the shared foundation (EXPANSION_ROADMAP section 8.1) comes first.

| Order | World | Theme (directive) | New mechanical discipline the directive names | Engine extension the directive names |
|---|---|---|---|---|
| 1 | Tockton (the competition world) | A forgotten clockwork town frozen on the player's table ([MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md) section 4) | The G0 mechanisms of PRODUCT_SPEC section 6 | None: the shared engine itself |
| 2 | Brasswater Harbour | Harbour powered by water, tides, steam and maritime machinery | Water wheels, pumps, pressure, hydraulic linkages, floating mechanisms, tide-dependent machinery | Hydraulic systems, pumps and water flow |
| 3 | Emberforge Mountains | Mountain settlement of steam, furnaces and mining | Steam pressure, pistons, pressure valves, heavy transmissions, machine sequencing | Pressure, pistons and foundry machinery |
| 4 | Verdant Observatory | Astronomical and botanical world of clockwork instruments | Planetary gear systems, orbital mechanisms, precision timing, tracking | Planetary gearing and precision timing |
| 5 | Aetherian Skyworks | Floating workshops, airships and airborne machines | Propellers, rotational balancing, gyroscopes, flight linkages | Propellers, gyroscopes and flight mechanisms |
| 6 | Grand Mechanical Theatre | Automata, performance and player-created shows | Sequenced movement, cam choreography, synchronised mechanisms, trigger networks | Synchronisation and coordinated automata |

Rules the directive sets for them:

- A world is a complete gameplay experience, not a set of GLBs: identity and story, layout, art direction, buildings, residents, machine families, unique mechanics, quests and progression, audio identity, collectibles, a restoration event, performance budgets, an asset inventory and acceptance tests (multiple-worlds requirement §3). The eleven completion gates a world must pass are in [EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md) §8.
- Shared across worlds: interaction, the mechanical engine, the component library, the blueprint format, save infrastructure, accessibility, hand tracking, spatial anchoring, inventory and journal, the quest framework, audio, rendering and the asset pipeline. World-specific: architecture, residents, environment, story, local machines, production chains, events, unique puzzles and world-specific mechanics. World-specific mechanics extend the shared simulation through documented interfaces and do not duplicate it (multiple-worlds requirement §5; world-by-world strategy).
- Cross-world progression is future-facing. Its examples are a harbour component unlocking a Tockton machine, an Emberforge mechanism powering a machine elsewhere, a celestial blueprint revealing a hidden location, a theatre mechanism reused in player automata, and residents exchanging letters or gifts. It must be meaningful, "not simply a collection of unrelated unlocks", and waits until the first world is complete and stable (multiple-worlds requirement §6).
- Only the worlds a player has unlocked are loaded, progress is saved per world, and worlds load and unload progressively instead of all at once (multiple-worlds requirement §4). Audit D §5 found a world registry feasible on public APIs. What G0 keeps open for it, and what it does not build, is in [MASTER_SYSTEM_ARCHITECTURE.md](MASTER_SYSTEM_ARCHITECTURE.md) §7 and [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) §4. SaveV1 holds Tockton only, so several worlds need a new save version with a migration (SAVE_PERSISTENCE_SPEC §10).
- No asset for any of these worlds is made before the competition build is stable, unless the owner approves a specific reusable shared asset that does not delay the submission (ADR-028 rule 4). The family-level outline is in [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) §5, and the detailed world drafts are [MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md) and [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md).

## 7. The competition milestone is protected

The November 2026 Meta VR Start submission is a separate milestone and nothing in this document enlarges it (directive Part 3).

**What the competition build is.** G0-required is the Must rows of PRODUCT_SPEC §5: F1 to F8, F10 to F15, F17 and F18. That includes X-ray, the story repairs with the daily repair inside F12 (ADR-027), the gift, save and load, ghost-hand onboarding, accessibility and the pause menu. G0-optional is F9 the Clock Tower, F16 the day/night toggle, Letter 6 and decoy parts. Table detection and anchoring with the floating stand as the fallback is part of F1 (ADR-026).

**The cut order** is the Clock Tower and its theatre-door behaviour, then the day/night toggle, then decoy parts. If time is still critical, the daily repair is simplified, never removed (PRODUCT_SPEC §19; BUILD_ROADMAP §16; ADR-027). The never-cut list is the Music Box loop, hands-first interaction, the solver, table detection with the stand fallback, machine placement, the wake effect, save and load, the gift link, onboarding and stable deployment.

**The rules that protect it:**

1. G1 to G5 and Research are documented, not built, until the competition build is delivered (ADR-028 rule 3).
2. No feature, code path or asset for a later generation is added to the competition critical path. The directive names multiplayer, online galleries, cloud accounts and free-build in particular (Part 3).
3. Pulling any later item into G0 needs an owner decision recorded in DECISIONS.md (ADR-028 consequences).
4. A new feature must not compromise the 60 fps minimum on Quest hardware (CLAUDE.md §2), and severe performance instability is a P0 release blocker (TESTING_QA_PLAN §5).
5. After the code freeze on 16 November only critical fixes are made (BUILD_ROADMAP §13).

**Dates.** Code freeze 16 November 2026. Internal deadline 18 November before midnight IST. The official deadline is 19 November 2026 at 01:30 IST. The build must stay reachable and free until the winner announcement, around 11 December 2026 (APP_AND_WEBSITE_GUIDELINES §4). What happens between submission and that announcement is covered in [EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md) §3.

**What the competition build already does for the future, at no extra cost,** is listed in [EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md) §9. It is limited to decisions the specifications already make: data-driven machines, a pure solver, versioned saves and gift payloads, and a shared asset library.

## 8. Open points for the owner

| Point | Default applied | Where it is tracked |
|---|---|---|
| Is there an original Technical Design Doc? This vision rests on the directive and the written specifications, because that document is not in the repository | The listed documents and accepted ADRs are the specification | Owner decision pending: [decision 1](PRODUCTION_AUDIT.md#decisions-needed-from-the-owner) |
| Which world comes second, and which generation comes first after delivery | The directive's order (World 2 is Brasswater Harbour; generations in the order of Part 10). Neither is approved | Owner decision pending: [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) §7; [EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md) §11 |
| Resident names from the reference boards (Oswald, Elias, Luna, Pip, Clack, Tinkerer) | Not used in Tockton. They may suit a later generation | Owner decision pending: ADR-029, ruling I-8 |
| Whether CLAUDE.md §14 is permanent | Settled as competition-build scope by ADR-028 | ADR-028 |

## 9. Acceptance criteria for this document

1. Every generation from G1 to G5 is listed with its label and contents as in directive Part 10.
2. Nothing in sections 4 to 6 is presented as competition required.
3. Every CLAUDE.md §14 item mentioned carries a generation or is marked not assigned.
4. Every statement about a future world is marked proposal and cites the directive.
5. Section 7 matches PRODUCT_SPEC §5 and §19 and BUILD_ROADMAP §16.
6. Every link resolves, and no asset or feature count is restated by hand. Counts come from `assets/manifest/glb-manifest.json` and `tools/asset-status.mjs`.
