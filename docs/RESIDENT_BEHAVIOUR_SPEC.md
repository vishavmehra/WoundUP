# Wound Up — Resident Behaviour Specification

**Project:** Wound Up
**Label:** G1 Living Tockton. Design intent only: not built, not scheduled, not competition scope. Read the scope firewall in [DECISIONS.md](DECISIONS.md) ADR-028 first.
**Status:** Proposal. Nothing here is approved for production or added to any task list. Open owner points are in section 11.
**Date:** 2026-11-06
**Source:** [directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) Part 2 (pillar A), Part 10 (Generation 1), Part 11; IDEAS §4.1; PRODUCT_SPEC §6.3, §7; SIMULATION_SPEC §8, §10.3, §13; WORLD_SIMULATION_SPEC §3, §4
**Related:** [TOCKTON_CHARACTERS.md](TOCKTON_CHARACTERS.md) (the canonical G0 character specification), [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md), [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md), [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md), [MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md), [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md), [SIMULATION_SPEC.md](SIMULATION_SPEC.md), [DATA_AND_BLUEPRINT_SPEC.md](DATA_AND_BLUEPRINT_SPEC.md), [SAVE_PERSISTENCE_SPEC.md](SAVE_PERSISTENCE_SPEC.md), [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md), [IDEAS.md](IDEAS.md)

## 1. What the competition build needs from this document

Nothing is built from it. The competition build (G0) has no resident system and none may be added (directive Part 3; ADR-028 rule 1).

One constraint applies, and the specifications already state it: letters, plots, machines and figures stay data with stable ids and no runtime objects, so a resident can be attached to them later without renaming anything (DATA_AND_BLUEPRINT_SPEC §2, §4.1, §14).

G0 must not take anything from this document in the other direction:

- No resident dialogue beyond the six letters and the closing card ("Do not add unnecessary dialogue or an unrelated story system", PRODUCT_SPEC §7).
- No NPC speech bubbles, quest indicators or "music playing" overlays. They appear on the board `Wound Up Town Awakening Reference Sheet-2.png` (panels E and F), but the specifications do not define them (REFERENCE_INDEX §c).
- Otto's kneading (Otto is the baker, ADR-039) is a one-shot machine reaction (PRODUCT_SPEC §6.3). It is not a behaviour engine and does not grow into one before delivery.

## 2. Scope

In scope for G1 (directive Part 2 pillar A, Part 10): resident routines and personalities, environmental reactions, town events as inputs, and consequences of player actions that residents can show.

Excluded, with the rule that excludes it:

| Excluded | Rule |
|---|---|
| AI or LLM generated dialogue or behaviour | CLAUDE.md §14 (AI/LLM gameplay calls); ADR-013; directive Part 11. Behaviour is authored data plus a deterministic function |
| Free roaming, navigation meshes, crowds, collision between residents | ADR-009 and REJ-001 (no physics for mechanisms), SIMULATION_SPEC §16. Residents follow authored paths between named anchors |
| Voice, microphone, humming | CLAUDE.md §14. Reactions are authored clips and procedural audio cues |
| Choreography | CLAUDE.md §14. Synchronised automata belong to the Grand Mechanical Theatre concept ([MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md) section 9) |
| Relationship points, XP, ranks, currency, rarity | CLAUDE.md §14. A resident reacts to world state and quest flags only |
| Text input, such as naming a resident | CLAUDE.md §14 (text keyboards in VR) |
| Multiplayer or shared residents | CLAUDE.md §14; ADR-013 |

## 3. Starting point: what G0 already has

| Item | G0 state | Source |
|---|---|---|
| Letter senders | Mira (Letters 1 and 2), the schoolteacher (3), Otto (4 and 5), the theatre keeper (6). They are text on letters. Only Mira and Otto have figures; the schoolteacher and the theatre keeper are roles with no figure (ADR-039) | PRODUCT_SPEC §7; [TOCKTON_CHARACTERS.md](TOCKTON_CHARACTERS.md) |
| Baker | Otto, who also sends Letters 4 and 5. He kneads while the Windmill runs. The specifications never named the baker; the owner decided on 2026-11-06 that Otto is the baker (ADR-039), which closes gap G-10 | PRODUCT_SPEC §6.3; SIMULATION_SPEC §10.3; [TOCKTON_CHARACTERS.md](TOCKTON_CHARACTERS.md); [audits/A_DOCUMENTATION.md](audits/A_DOCUMENTATION.md) gap G-10 |
| Figures in the manifest | `figure_otto` (G0-required, clip `Otto_Knead`) and `figure_mira` (G0-required, no clip). There are no other figures: the schoolteacher and theatre keeper entries were deleted (ADR-039) | [assets/manifest/glb-manifest.json](../assets/manifest/glb-manifest.json); [MASTER_ASSET_INVENTORY.md](MASTER_ASSET_INVENTORY.md) |
| Names on the boards | `WoundUp Tockton Character Design Board.png` names Oswald (baker), Mira (engineer), Elias, Luna, Pip and Clack (a brass automaton). The specifications use Mira, Otto, the schoolteacher and the theatre keeper. The specification names win; board names need owner approval | ADR-029 ruling I-8; [audits/B_REFERENCES.md](audits/B_REFERENCES.md) |
| What a figure can do | Play one authored clip when its machine runs. Nothing walks, speaks or reacts to the player | SIMULATION_SPEC §10.3 |

## 4. Resident model (proposal)

A resident is data, like a blueprint: stable ids, no runtime objects, validated before use, versioned (DATA_AND_BLUEPRINT_SPEC §2, §13, §16). The contract below is conceptual and is adapted to the real types when G1 is scheduled.

```ts
interface ResidentDefinition {
  id: string;                  // stable and unique (DATA_AND_BLUEPRINT_SPEC §2, §4.1)
  worldId: string;             // "tockton" for every G1 resident
  displayName: string;         // owner-approved names only (section 11)
  role: string;                // "baker", "schoolteacher", ...
  homePlotId: string;          // a plot id from the town data
  assetId: string;             // a family H manifest id, for example "figure_otto"
  clips: string[];             // clip names that must exist in that GLB
  anchors: string[];           // named anchor nodes the resident may stand at
  routine: RoutineSlot[];      // section 6
  reactions: ReactionRule[];   // section 5.3
  voiceCueSet?: string;        // a procedural audio cue set id (section 9)
  questIds: string[];          // quests this resident gives (STORY_AND_QUEST_ENGINE)
}
```

Rules:

1. A resident references its figure by manifest `assetId`, never by file path (ADR-033).
2. Every clip name in `clips` must exist in the GLB. The asset validator already checks that the clips a manifest entry lists are present (check V40 of [audits/F_QA_PERFORMANCE.md](audits/F_QA_PERFORMANCE.md), adopted by ADR-037), and a content check in the same style rejects a resident whose clips or anchors do not exist.
3. Anchors are named empties in the town or building GLB (`SOCKET_`-style helpers, ADR-033), so a path is a list of ids, not coordinates in data.
4. A resident never owns a machine, a plot or a quest. It reads them (section 7).

## 5. Behaviour model (proposal)

### 5.1 One pure function

A resident's state is computed from the world's state. It is not a process stepped forward in time. The function is pure TypeScript with no Three.js or IWSDK import, and it obeys the determinism rules the world and engine documents already set: no `Math.random`, no wall clock, no other hidden input, and canonical ordering of its input (WORLD_SIMULATION_SPEC §3 items 4 and 6; MECHANICAL_ENGINE_V2 §4 rules D1 to D3).

```text
resolve(definition, snapshot, flags, date) -> { state, requests }
```

- `snapshot` is the `WorldSnapshot` of WORLD_SIMULATION_SPEC §4.5: building states, resource flags and typed cues.
- `flags` are the quest and discovery flags in the world record ([STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md)).
- `date` is the injected local date. Where a choice between equivalent clips is needed, the seed is the date plus the resident id, as the daily repair does (ADR-027; SAVE_PERSISTENCE_SPEC §4.4).
- It runs when something changes (a placement, a machine status, a quest stage, a session start), never per frame (WORLD_SIMULATION_SPEC §3 item 2, §6).
- `requests` are plain data for the presentation layer: play clip, walk to anchor, play cue. The presentation layer performs them and never feeds anything back (DATA_AND_BLUEPRINT_SPEC §14).

There is no time-of-day routine in this baseline. The world simulation is steady state, with no ticks and no dependence on how long the player was away, and a clock with a catch-up rule is left as Research there (WORLD_SIMULATION_SPEC §4.3, §10). A routine tied to the time of day would need that clock, and would also depend on the day/night toggle, which is G0-optional and cut early (PRODUCT_SPEC §19).

### 5.2 States

| State | Meaning |
|---|---|
| `frozen` | The plot is not awake. This is the only G0 state. The figure is static and desaturated like the rest of the plot (PROJECT_BIBLE §6) |
| `idle` | Awake, no routine slot active. Plays an idle clip |
| `routine` | A routine slot's condition holds (section 6) |
| `reacting` | A reaction rule fired. Returns to `routine` or `idle` when the clip ends |

Walking from one anchor to another is the presentation of a change of state, over a duration taken from the clip. It is not a simulated path and is not saved.

### 5.3 Inputs and outputs

| Input | Origin | Label |
|---|---|---|
| `PlotAwakened`, `MachinePlaced` (frozen to awake) | Town system (SIMULATION_SPEC §13; TECHNICAL_ARCHITECTURE §8) | G0 event, reused |
| `WorldSnapshot`: building states `awake`, `running`, `idle`, `stalled`, resource flags, cues such as `kneading` and `smoke_on` | World simulation (WORLD_SIMULATION_SPEC §4.1, §4.5, §4.7) | G1 proposal |
| Quest and discovery flags | Quest engine | G1 proposal |
| `PlayerNear`, `PlayerGesture` on a resident | Interaction layer | G1 proposal; costs interaction design and colliders, see section 11 |

A `ReactionRule` is `{ when, clip, cue? }`, and a `RoutineSlot` is `{ when, anchorId, clip }`. `when` reuses the closed `Condition` union of WORLD_SIMULATION_SPEC §4.1 (`machine_running`, `resource_available`, `building_state`, `all`, `any`), so the project has one condition vocabulary. Example: `{ when: { kind: 'building_state', buildingId: 'bakery', state: 'stalled' }, clip: 'Otto_Idle' }`.

## 6. Routines and personality (proposal)

A resident with no routine slot stays `idle`. Slots are checked in order and the first whose condition holds wins.

Personality is authored data that selects between pre-authored material: which idle clips are used, which cue set is used, how strong a reaction is. It is not a simulated mind. This keeps behaviour testable and matches "resident routines and personalities" in directive Part 2 without adding an AI system.

Examples, to show the data shape only. Each one is a G1 idea derived from a letter or the specification, and none is approved. Each needs an approved story beat before any asset is made.

| Resident | Routine or reaction | Derived from |
|---|---|---|
| Baker | Kneads while the Windmill runs (the G0 `kneading` cue). G1: switches to an idle clip when the Bakery is `stalled` | PRODUCT_SPEC §6.3; WORLD_SIMULATION_SPEC §4.1 |
| Schoolteacher | Stands by the carousel square while the Carousel runs | Letter 3 ("The children press their noses to the carousel every morning") |
| Theatre keeper | Stands at the theatre doors during the 30 seconds they are open | PRODUCT_SPEC §6.4 (needs the Clock Tower, which is G0-optional) |
| Mira | Listens near her workshop while the Music Box plays | Letters 1 and 2 |

The schoolteacher and theatre keeper rows are G1 ideas about roles that have no figure in G0 (ADR-039). They would need the owner to approve a figure first ([TOCKTON_CHARACTERS.md](TOCKTON_CHARACTERS.md) section 6).

## 7. How residents connect to the rest of the simulation

- Residents read the world and show it. They never change machine state, plot state or progression. The solver is the authority for machines, the town system for plots, the progression system for quests (GAMEPLAY_SYSTEMS §4; DATA_AND_BLUEPRINT_SPEC §12; SIMULATION_SPEC §13). In the baseline, residents also do not change building or resource state, so gameplay-critical state has one writer (WORLD_SIMULATION_SPEC §4.7).
- Building dependencies, production chains and town events are G1 too (directive Part 10) but belong to [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md) §4.2 and §4.4, not here. G0's only dependency is the Windmill waking the Bakery, expressed as `wakes` in the blueprint (DATA_AND_BLUEPRINT_SPEC §5; PRODUCT_SPEC §11).
- A resident can give a quest, but the quest engine owns letters, objectives and rewards ([STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md)).

## 8. Persistence

- Positions, current clips and timers are derived, not saved. The save never holds temporary animation state (SAVE_PERSISTENCE_SPEC §5), and building and resource states are derived on load (WORLD_SIMULATION_SPEC §4.6).
- On load, the resident state is computed once from the saved world record, the quest flags and the local date. It is never produced by replaying elapsed time, so resuming causes no jump (SAVE_PERSISTENCE_SPEC §14).
- Anything a resident needs to remember is a quest or discovery flag in the world record ([WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md) section 4). G1 therefore needs SaveV2 and a migration from SaveV1 (SAVE_PERSISTENCE_SPEC §10).

## 9. Presentation, audio and performance

- Figures are family H GLBs. Character motion may be glTF clips played by a three.js `AnimationMixer` in one ECS system, because IWSDK has no clip player (ADR-030 item 4; [audits/D_WEBXR_ARCHITECTURE.md](audits/D_WEBXR_ARCHITECTURE.md) §3.6). That system does not exist yet and is a G1 dependency.
- A character GLB stays within the ADR-034 ceiling: 1,500 triangles, 4 primitives, 3 materials, a shared skeleton of at most 40 bones if skinned.
- The G0 awakened town is already estimated at 150 to 190 draw calls against a ceiling of 200 ([PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §9 risk 5; ADR-034). G1 can add animated residents only by merging or instancing, hiding what is not in view, or raising the budget after the first Quest measurement. Until a headset reading exists, the number of simultaneously animated residents has no safe value, so none is set here.
- Audio is Web Audio, procedural where possible (PROJECT_BIBLE §9; CLAUDE.md §6.7). Night lighting allows at most four point lights (CLAUDE.md §8), so resident lights are emissive materials, not lights.

## 10. Dependencies

| Needs | Status |
|---|---|
| [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md) (`WorldSnapshot`, `Condition`, events) | Written, G1 proposal |
| [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) | Written, G1 proposal |
| SaveV2 ([WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md)) | G5 design; G1 needs only its per-world record |
| Animation player system | Not built (ADR-030) |
| Family H figures with clips | Only `figure_otto` has a clip. `figure_mira` is G0-required without one. Any other figure needs the owner's approval (ADR-039) |
| A Quest measurement of the G0 awakened town | Blocked until a tester exists ([PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) decision 2) |

## 11. Owner decisions pending

Defaults apply until answered. Source: [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) "Decisions needed from the owner" and [audits/A_DOCUMENTATION.md](audits/A_DOCUMENTATION.md).

1. Decided on 2026-11-06 (ADR-039): Otto is the baker (gap G-10 is closed), and figures exist only for people named in the written specifications, which today means Mira and Otto. Who any later resident would be is open, and ruling I-8 still governs names.
2. May board names (Oswald, Elias, Luna, Pip, Clack) be used in a later generation? Default: no.
3. The flower shop does not exist: decided on 2026-11-06 (ADR-039; ruling I-16 is closed).
4. Should the player be able to touch or gesture at a resident? Default: no, because it adds colliders and interaction states that G0 does not budget (INTERACTION_SPEC).
5. Whether a clock-driven daily routine is wanted, which needs the clock and catch-up rule that WORLD_SIMULATION_SPEC §10 leaves open. Default: no.

## 12. Acceptance criteria

Document checks:

1. The label G1 is at the top and no section claims a competition requirement.
2. Every excluded item names its rule.
3. Every example is marked as an example and derived from a letter or specification section.

Feature checks for G1 (proposal; added to ACCEPTANCE_TESTS.md only when G1 is scheduled). Performance and comfort items need Quest Browser and physical Quest evidence and stay Blocked until a tester exists. Nothing here is verified at any level.

| ID | Check | Level |
|---|---|---|
| RES-01 | `resolve` gives identical output for identical definition, snapshot, flags and date, including when the input arrays are permuted, in a Vitest test | Desktop |
| RES-02 | No file under the resident module imports Three.js or IWSDK, and none calls `Math.random` or reads the clock | Desktop (lint or test) |
| RES-03 | `resolve` runs once per triggering change and never per frame | Desktop |
| RES-04 | The save holds no position, clip or timer for any resident | Desktop |
| RES-05 | Loading a save after a long absence produces one consistent state and no animation burst | IWER |
| RES-06 | A resident with a missing clip or unknown anchor is rejected at load with a useful message | Desktop |
| RES-07 | With residents active, the awakened town stays within the ADR-034 scene ceilings | Quest Browser and physical Quest |
