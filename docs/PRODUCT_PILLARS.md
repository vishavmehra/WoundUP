# Wound Up — Product Pillars

**Project:** Wound Up
**Label:** Each pillar is split into its **G0** footing (competition build, cited to the specifications) and its **G1 to G5** growth (proposal). Read the scope firewall, [DECISIONS.md ADR-028](DECISIONS.md), first.
**Status:** Strategy. Adds no requirement to the competition build.
**Date:** 2026-11-06
**Source:** [owner directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) Part 2 (the four pillars and the loop) and Part 10 (generations); [PRODUCT_SPEC.md](PRODUCT_SPEC.md); [GAMEPLAY_SYSTEMS.md](GAMEPLAY_SYSTEMS.md); [DATA_AND_BLUEPRINT_SPEC.md](DATA_AND_BLUEPRINT_SPEC.md)
**Related:** [PRODUCT_VISION_LONG_TERM.md](PRODUCT_VISION_LONG_TERM.md), [EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md), [PRODUCT_METRICS_AND_RETENTION.md](PRODUCT_METRICS_AND_RETENTION.md), [IDEAS.md](IDEAS.md)

## 1. What the pillars are for

The directive says Wound Up's long-term product "combines four connected pillars" and that "these four pillars must reinforce each other" (Part 2). A pillar is a lens for deciding whether a feature belongs and what it should do. It is not a feature list and not a schedule.

Other sets of principles already exist, and none of them is replaced:

| Set | What it governs |
|---|---|
| The five tests (hands, airplane seat, one bus stop, take it away, policy) in [APP_AND_WEBSITE_GUIDELINES.md](APP_AND_WEBSITE_GUIDELINES.md) §1 | Every screen and feature of the competition build |
| Visual quality principles in PROJECT_BIBLE §3.1 | How things look |
| "Product Principles" in `PRODUCT.md` | The entry screen only |
| The four pillars here | What the product is for, across all generations |

## 2. The four pillars at a glance

| Pillar | Player promise | G0 footing | Grows in |
|---|---|---|---|
| A Living miniature world | The town is a place that remembers and responds | Frozen then awakened town, wake effect, the Windmill waking the Bakery, saved placements | G1, G5 |
| B Mechanical engineering | Machines work because their mechanisms work | Deterministic solver, four outcomes, two scripted repairs, X-ray | G2, G3 |
| C Story and adventure | Someone in the town needs you, and why | Letters 1 to 5, closing card, repair quests, deterministic progression | G1, G5 |
| D Creative sandbox | What you make can be yours and can be given | One finished machine as a gift link, protected by solver validation | G3, G4 |

G0 is deliberately strong in A, B and C and thin in D. The honest reading of the competition build is "a polished, complete loop with a gift", not "a sandbox" (section 8).

## 3. Pillar A — Living miniature world

**The directive lists:** a persistent miniature town, interconnected buildings, mechanical production chains, resident routines and personalities, environmental reactions, unlockable districts, town events, dynamic activities, and meaningful consequences for player actions.

**G0 footing (G0-required unless stated)**

| Element | Where it is specified |
|---|---|
| The town is frozen (desaturated, cool, still) and wakes (full colour, motion, light, sound) | PRODUCT_SPEC §3.3, §11; PROJECT_BIBLE §2 |
| Four machine plots, the Bakery and a theatre facade | PRODUCT_SPEC §3.3, F2 |
| Wake ripple of about 1.5 seconds on placement | PRODUCT_SPEC §11, F10; ACCEPTANCE TOWN-06 |
| One machine affecting another building: the Windmill turns, chimney smoke appears, the baker kneads, the oven glows | PRODUCT_SPEC §6.3 |
| The real table is the ground, contact shadows fall on it and its size sets the town's scale | PRODUCT_SPEC §3.2; ADR-026 |
| Persistence: town placements and letter states survive a reload | SAVE_PERSISTENCE_SPEC §3, §6; ACCEPTANCE §12 |
| Day/night lighting toggle (G0-optional) | PRODUCT_SPEC F16 |

**Growth (proposal)**

| Label | What | Basis |
|---|---|---|
| G1 Living Tockton | Resident behaviour engine, building dependencies, town events, production chains, persistent world simulation, improved spatial persistence | Directive Part 10; IDEAS §4.1, §4.4, §4.8 |
| G1 Living Tockton | Unlockable districts | Directive Part 2, pillar A |
| G5 Clockwork universe | Other towns with their own architecture, residents and events; player-created districts | Directive, multiple-worlds requirement |

**Pillar tests**

1. After one machine is placed, can a person who was not watching the screen say what changed in the town? (PRODUCT_SPEC §11; ACCEPTANCE TOWN-07; UI_UX_SPEC §24)
2. Does the town still read at the smallest allowed scale, 75% of full size? (PROJECT_BIBLE §2; PRODUCT_SPEC §3.2)
3. Do effects leave the miniature world unobscured? (ACCEPTANCE §14)

**Limits.** The town is a compact diorama of about 60 x 40 cm at most and "Do not increase the world size just to add visual detail" (PROJECT_BIBLE §2). Weekly commissions, seasonal parts and festivals are excluded from G0 (PRODUCT_SPEC §18); IDEAS §4.4 lists seasonal decoration as deferred.

## 4. Pillar B — Mechanical engineering

**The directive lists:** gears and gear trains, shafts and couplings, springs and winding systems, cams and followers, cranks and linkages, escapements and pendulums, energy distribution, mechanical timing, fault diagnosis, simulation preview, advanced mechanical puzzles, and player-designed machines.

**G0 footing (G0-required unless stated)**

| Element | Where it is specified |
|---|---|
| A solver in pure TypeScript that returns `runs`, `runs_wrong`, `jams` or `incomplete` from a graph of five connection types | MECHANICAL_SOLVER_SPEC §4 to §14; ADR-008, ADR-009 |
| Spring energy: wind units times energy per unit, runtime from stored energy over drain | MECHANICAL_SOLVER_SPEC; SIMULATION_SPEC |
| Targets: Music Box cylinder 0.4 rad/s (±10%), Carousel platform 0.5 rad/s (±10%), Windmill millstone 0.6 rad/s (±15%) | PRODUCT_SPEC §6 |
| Part families and sizes that can be fitted wrongly and then run wrong | PRODUCT_SPEC §9; DATA_AND_BLUEPRINT_SPEC §4 |
| Two scripted repairs: the worn spring (about 1.5 seconds of runtime) and the 12-tooth gear where a 24-tooth gear belongs (a millstone about twice as fast) | PRODUCT_SPEC §8 |
| X-ray: casing at about 15% opacity, moving parts opaque and warm | PRODUCT_SPEC §12, F11 |
| Pendulum and escapement of the Clock Tower (G0-optional) | PRODUCT_SPEC §6.4 |

**Growth (proposal)**

| Label | What | Basis |
|---|---|---|
| G2 Advanced engineering | Multi-stage transmissions, energy distribution, timing systems, mechanical diagnosis, fault propagation, simulation preview, advanced machinery | Directive Part 10; IDEAS §4.3 |
| G3 Creative sandbox | Player-designed machines, with machine validation as the guard-rail | Directive Part 2, pillar D |
| G5 Clockwork universe | Each world adds one discipline: hydraulics, pressure and pistons, planetary gearing, propellers and gyroscopes, synchronisation | Directive, world-by-world strategy |

**Pillar tests**

1. When a machine fails, can the player see why from the machine itself, without text? (CLAUDE.md §4; GAMEPLAY_SYSTEMS §9)
2. Is every result decided by the solver, with no machine-specific rule in the renderer? (CLAUDE.md §11; DATA_AND_BLUEPRINT_SPEC §14; JUD-03)
3. Does an identical build give an identical result every time? (ACCEPTANCE SOL-10)

**Limits.** No rigid-body simulation (ADR-009, REJ-001; SIMULATION_SPEC §16). The solver allows five edge types today and a change to that contract needs the lead (MECHANICAL_SOLVER_SPEC §8; AGENT_WORKFLOW §14). Anything beyond them, such as a one-way ratchet, a worm drive or an inertia wheel, needs a mechanical engine decision first (MASTER_ASSET_INVENTORY, G2 entries).

## 5. Pillar C — Story and adventure

**The directive lists:** memorable residents, letters, personal stories, daily mysteries, repair quests, hidden mechanisms, secret compartments, discoverable blueprints, multi-stage story progression, town-wide events, and mechanical theatre performances.

**G0 footing (G0-required unless stated)**

| Element | Where it is specified |
|---|---|
| Letters from Mira, the schoolteacher and Otto, plus the closing card. Letter 6 from the theatre keeper belongs to the Clock Tower (G0-optional). Letter text is fixed | PRODUCT_SPEC §7; GAMEPLAY_SYSTEMS §5 |
| Repair quests: the worn spring (Letter 2) and the wrong gear (Letter 5) | PRODUCT_SPEC §7, §8 |
| One progression authority with explicit transitions; a letter is not completed by opening it | GAMEPLAY_SYSTEMS §4; DATA_AND_BLUEPRINT_SPEC §12 |
| Daily repair as repeat play that never blocks the story | PRODUCT_SPEC §8; ADR-027 |
| Resident names are the specification's. Board names need the owner's approval | PRODUCT_SPEC §7; ADR-029, ruling I-8 |

**Growth (proposal)**

| Label | What | Basis |
|---|---|---|
| G1 Living Tockton | Expanded stories, resident personalities and routines, daily mysteries, hidden mechanisms, secret compartments, discoverable blueprints, town-wide events | Directive Part 2 and Part 10; IDEAS §4.1 |
| G5 Clockwork universe | Expanded campaigns, a story and a restoration event for each world, residents exchanging letters across worlds, mechanical theatre performances (World 6) | Directive, multiple-worlds requirement §1, §6 |

**Pillar tests**

1. Does each letter ask for something the player can see change in the town? (PROJECT_BIBLE §1; PRODUCT_SPEC §7)
2. Does progression follow the objective, not the reading? (GAMEPLAY_SYSTEMS §4)
3. Are letters still physical correspondence, with no extra dialogue system? (PRODUCT_SPEC §7: "Do not add unnecessary dialogue or an unrelated story system")

**Limits.** No voice, microphone or AI/LLM-generated content in G0 (CLAUDE.md §14). The grand theatre performance and choreography are on the §14 list and belong, as a proposal, to World 6 (G5), not to Tockton's theatre facade.

## 6. Pillar D — Creative sandbox

**The directive lists:** a free-build workshop, modular parts, player-designed mechanisms, a blueprint editor, machine validation, saved inventions, shareable blueprints, community challenges, and a future community gallery.

**G0 footing.** Almost none, by design. Free-build is excluded from the competition build (CLAUDE.md §14; PRODUCT_SPEC §18). What G0 has is the seed of sharing:

| Element | Where it is specified |
|---|---|
| Gift one finished machine (never the whole town) as a compressed URL hash, with one of eight preset engravings | PRODUCT_SPEC §13, F13; ADR-011 |
| A viewer that works in an ordinary browser, does not read or write the viewer's save, and offers Make Your Own | PRODUCT_SPEC §13; ACCEPTANCE §13 |
| Validation of every incoming payload: version, blueprint, parts, assembly, solver result, engraving | DATA_AND_BLUEPRINT_SPEC §15 |
| Parts as modular catalogue entries with stable IDs | DATA_AND_BLUEPRINT_SPEC §4 |

**Growth (proposal)**

| Label | What | Basis |
|---|---|---|
| G3 Creative sandbox | Free-build workshop, modular component library, custom machine construction, blueprint editor, machine validation, saved inventions | Directive Part 2 and Part 10; IDEAS §4.6 |
| G4 Community | Blueprint sharing, machine challenges, curated gallery, community-created puzzles | Directive Part 2 and Part 10 |
| Research | Personalised gift extras (custom message cards, more wrapping, several machines in one gift, gift history). IDEAS §4.5 marks them Proposed and G0 allows one machine per link | IDEAS §4.5 |

**Pillar tests**

1. Can a finished machine be understood by someone who has no save and no account? (ACCEPTANCE §13)
2. Does everything that can be shared pass the same validation as everything that can be built? (DATA_AND_BLUEPRINT_SPEC §15; CLAUDE.md §16: gift links are untrusted input)
3. In G0, is the gift still exactly one machine? (PRODUCT_SPEC §13)

**Limits.** No free-build, accounts, cloud save, leaderboards, whole-town gifting or text keyboards in VR in G0 (PRODUCT_SPEC §18). IDEAS §4.6 warns that a free-build mode "could undermine the curated puzzle experience", so G3 must keep the curated path intact (see [EXPANSION_ROADMAP.md](EXPANSION_ROADMAP.md) §6).

## 7. How the pillars reinforce each other

### 7.1 Pairs

Each row has the G0 instance first, then growth. "Design reading" marks an interpretation that no specification states.

| Pair | One feeds the other | And back | Growth (proposal) |
|---|---|---|---|
| A and B | **B to A.** A running machine is what wakes a plot, and the Windmill's turning wakes the Bakery (PRODUCT_SPEC §11, §6.3) | **A to B.** Every plot and building gives a machine a place and a reason (PRODUCT_SPEC §11: "Each machine activates its own town location") | G1: production chains and building dependencies make a machine's output matter to other buildings |
| A and C | **C to A.** Letters name a place and a need: the carousel and the children, the windmill, flour and bread (PRODUCT_SPEC §7) | **A to C.** The frozen town is the visible question and each awakened plot is the answer to a letter | G1: residents with routines, town events. G5: campaigns |
| B and C | **C to B.** Each letter introduces one lesson: the worn spring, the wrong gear (PRODUCT_SPEC §7, §8) | **B to C.** Story progress follows mechanical completion (GAMEPLAY_SYSTEMS §4), and symptoms are told in the resident's voice ("The windmill spins like it's late for something!") | G1: hidden mechanisms, secret compartments. G2: diagnosis puzzles |
| B and D | **B to D.** The solver is the referee for anything shared: unknown parts and failed solver results are rejected (PRODUCT_SPEC §13; DATA_AND_BLUEPRINT_SPEC §15) | **D to B.** A machine that may be given away is a reason to build it well (design reading) | G3: machine validation makes free-build safe. G4: challenges judged by the solver |
| A and D | **D to A.** Make Your Own brings the recipient from the viewer into the main experience (PRODUCT_SPEC §13) | **A to D.** The town is where a machine gets its meaning before it is given; the gift icon appears on finished machines after Letter 2 (PRODUCT_SPEC §13) | G4: gallery. G5: player-created districts |
| C and D | **C to D.** The letters are the model for a gift: a short message from one person to another (design reading) | **D to C.** A gift with an engraving such as "Wind me up" lets the player write back (design reading) | G4: community-created puzzles. G5: residents exchanging letters and gifts across worlds (multiple-worlds requirement §6) |

### 7.2 A chain that already exists in G0

Letter 4 says "No wind, no windmill. No windmill, no flour. No flour, no bread." (PRODUCT_SPEC §7). The letter (C) names a dependency, the player builds the Windmill (B), the Windmill's turning wakes the Bakery (A), and the finished Windmill can be gifted (D). It is the one place all four pillars meet in the competition build and is a good candidate for the demo video (COMPETITION_REQUIREMENTS §8.1, step 7).

### 7.3 Which pillar carries each step of the loop

The loop is defined in [PRODUCT_VISION_LONG_TERM.md](PRODUCT_VISION_LONG_TERM.md) §4.

| Step | Primary | Supporting |
|---|---|---|
| DISCOVER | A | C |
| INVESTIGATE | C | B (X-ray, symptoms) |
| ENGINEER | B | C (the repair letters) |
| BUILD | B | D from G3 |
| ACTIVATE | B | none |
| TRANSFORM | A | B (the cause), C (the letter's answer) |
| CREATE | D | B |
| SHARE | D | A (Make Your Own), C (the engraving) |

## 8. Rules for using the pillars

1. Every idea proposed for IDEAS.md or a roadmap names the pillar it serves and its generation label. This is a process proposal; the IDEAS template (§8) does not have the field yet.
2. In G0 a pillar never outranks the competition priority order (PRODUCT_SPEC §19; COMPETITION_REQUIREMENTS §12).
3. A feature that serves no pillar is not added. A feature that serves a pillar but weakens the core loop is not added either (IDEAS §6; REJ-004).
4. The imbalance is deliberate and is stated honestly. G0 deepens A, B and C; G1 deepens A and C; G2 deepens B; G3 and G4 build D; G5 combines them. Submission text, video and the Devpost description must not describe a sandbox or community features as present (JUD-21; COMPETITION_REQUIREMENTS §8.1).
5. Every pillar inherits the invariants in [PRODUCT_VISION_LONG_TERM.md](PRODUCT_VISION_LONG_TERM.md) §3: seated and hands-first, real mechanics, 60 fps floor, offline basic loop.

## 9. Acceptance criteria for this document

1. The four pillars and their listed contents match directive Part 2.
2. Every G0 footing row cites a specification section, ADR or acceptance test, and none is an invented requirement.
3. Every growth row carries a generation label and a source, and none is presented as competition required.
4. Pillar D states that free-build and the other CLAUDE.md §14 items are excluded in G0.
5. The reinforcement table covers all six pairs in both directions, and interpretations are marked "design reading".
6. Every link resolves.
