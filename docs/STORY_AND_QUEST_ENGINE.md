# Wound Up — Story and Quest Engine

**Project:** Wound Up
**Label:** Split by section. Section 3 records the G0 story that is already specified (the fixed letter sequence and the daily repair, both G0-required) and changes nothing in it. Sections 4 to 9 describe the quest engine: G1 Living Tockton, with further stories per world as G5. Read the scope firewall in [DECISIONS.md](DECISIONS.md) ADR-028 first.
**Status:** Section 3 is a summary of approved specifications. Sections 4 to 9 are proposals, not approved and not scheduled. Open owner points are in section 11.
**Date:** 2026-11-06
**Source:** [directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md) Part 2 (pillar C), Part 10 (Generation 1); PRODUCT_SPEC §7, §8; GAMEPLAY_SYSTEMS §4, §5, §12; DATA_AND_BLUEPRINT_SPEC §11, §12; SAVE_PERSISTENCE_SPEC §4.2, §4.4; ADR-027
**Related:** [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md), [RESIDENT_BEHAVIOUR_SPEC.md](RESIDENT_BEHAVIOUR_SPEC.md), [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md), [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md), [CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md), [GAMEPLAY_SYSTEMS.md](GAMEPLAY_SYSTEMS.md), [PRODUCT_SPEC.md](PRODUCT_SPEC.md), [DATA_AND_BLUEPRINT_SPEC.md](DATA_AND_BLUEPRINT_SPEC.md), [IDEAS.md](IDEAS.md)

## 1. What the competition build needs from this document

Nothing new. G0 ships the fixed six-letter sequence, the two story repairs and the daily repair exactly as PRODUCT_SPEC §7 and §8 and GAMEPLAY_SYSTEMS §4, §5 and §12 say, as data (DATA_AND_BLUEPRINT_SPEC §11, §12). No quest engine is built before delivery.

Three constraints keep G1 possible without a rewrite. All three already follow from the specifications:

1. Letters and progression stay data with stable ids, and objective types stay a closed list, not free strings (DATA_AND_BLUEPRINT_SPEC §11: "Do not use arbitrary strings throughout the game without validation").
2. There is one progression authority. The UI never keeps a second progression state (DATA_AND_BLUEPRINT_SPEC §12).
3. Letter ids and statuses in the save stay stable and validated (SAVE_PERSISTENCE_SPEC §4.2, §9, §10).

G0 must not add: weekly commissions, festivals, seasonal parts, a story system "unrelated" to the six letters (PRODUCT_SPEC §7, §18), a dialogue system, or runtime generated text (CLAUDE.md §14).

## 2. Directive requirements and their labels

Pillar C of directive Part 2 lists eleven story items. Each gets exactly one label here. A later generation never turns an item into a G0 requirement (ADR-028 rule 1).

| Pillar C item | Label | Where it lives |
|---|---|---|
| Letters | G0-required | Section 3 |
| Repair quests | G0-required (two story repairs) | Section 3 |
| Daily mysteries | G0-required in the form of the daily repair (ADR-027). Anything larger is G1 | Sections 3 and 5 |
| Memorable residents | G0 has four letter senders. More is G1 | [RESIDENT_BEHAVIOUR_SPEC.md](RESIDENT_BEHAVIOUR_SPEC.md) |
| Personal stories | G1 | Section 4 |
| Multi-stage story progression | G1 | Section 4 |
| Discoverable blueprints | G1 | Section 6 |
| Hidden mechanisms and secret compartments | G1 | Section 6 |
| Town-wide events | G1 | Section 7 |
| Mechanical theatre performances | Not G0: the grand theatre performance is excluded (CLAUDE.md §14; PRODUCT_SPEC §18). G1 or later, owner decision | Section 7 |
| Weekly commissions, seasonal parts, festivals | Excluded from G0 (CLAUDE.md §14). Not designed here | None |

## 3. G0 baseline (specified, unchanged)

### 3.1 The fixed sequence

| Letter | Sender | Objective | Source |
|---|---|---|---|
| 1 | Mira | Build and run the Music Box | PRODUCT_SPEC §7; GAMEPLAY_SYSTEMS §5.1 |
| 2 | Mira | Diagnose and replace the worn spring | GAMEPLAY_SYSTEMS §5.2, §12.1 |
| 3 | Schoolteacher | Build and run the Carousel | GAMEPLAY_SYSTEMS §5.3 |
| 4 | Otto | Build and run the Windmill (the Bakery wakes with it) | GAMEPLAY_SYSTEMS §5.4 |
| 5 | Otto | Replace the 12-tooth gear with the 24-tooth gear | GAMEPLAY_SYSTEMS §5.5, §12.2 |
| 6 | Theatre keeper | Build the Clock Tower. Only if the Clock Tower stays in scope | GAMEPLAY_SYSTEMS §5.6; PRODUCT_SPEC §19 |
| Closing card | None | Text only: "Tockton is waking up. The show is coming soon." | PRODUCT_SPEC §7 |

Rules in force (GAMEPLAY_SYSTEMS §4, §4.1): the first letter is available after the trunk introduction. A letter is never completed by opening it; completion follows the gameplay objective. Transitions are explicit. The save stores `locked`, `available`, `accepted` or `completed` per letter (SAVE_PERSISTENCE_SPEC §4.2; GAMEPLAY_SYSTEMS §4 calls the third state "Active", and the exact representation may differ).

### 3.2 The daily repair

Offered after Letter 5, chosen deterministically from the local date, completable once per date, never required to finish the story, built from machines, parts and faults the game already has, simplified rather than removed if time is short (PRODUCT_SPEC §8; GAMEPLAY_SYSTEMS §12.3; ADR-027). The save holds `dailyDone`, the local date of the last completion or `null`. Tests DAILY-01 to DAILY-05 in ACCEPTANCE_TESTS §5.1 apply. Which repairs the daily pool holds is owner decision pending (ADR-027).

### 3.3 Gaps in the G0 specifications

These are G0 questions for the lead and the owner. This document does not settle them.

- Letter 2's trigger is worded two ways: "after the first Music Box is placed" (DATA_AND_BLUEPRINT_SPEC §12) and "after the first Music Box completion" (GAMEPLAY_SYSTEMS §4.1). Gift gating "after Letter 2" does not say arrived, accepted or completed ([audits/A_DOCUMENTATION.md](audits/A_DOCUMENTATION.md) conflict on the Letter 2 trigger; owner).
- The specifications do not say what Letter 6 and the closing card do if the Clock Tower is cut ("if this feature remains in scope", GAMEPLAY_SYSTEMS §5.6).
- The SaveV1 shape differs between TECHNICAL_ARCHITECTURE §16 and SAVE_PERSISTENCE_SPEC §3 ([PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §7, ruling I-11). Section 9 depends on the answer.

## 4. Quest engine model (G1 proposal)

### 4.1 The idea

A quest is a letter generalised: the same data, the same single progression authority, more than one stage, and typed rewards. The six G0 letters become the first six quests with one stage each. G0 behaviour is the regression test for the engine (QST-01).

The engine is pure TypeScript with no Three.js or IWSDK import, like the solver (CLAUDE.md §11; ADR-008). It reads a read-only snapshot of world progress and emits events. It does not move objects.

### 4.2 Data (conceptual contract)

```ts
type QuestStatus = "locked" | "available" | "accepted" | "completed";

interface QuestDefinition {
  id: string;                    // stable; the G0 letter ids are reused
  worldId: string;
  giverResidentId?: string;      // RESIDENT_BEHAVIOUR_SPEC
  textId: string;                // letter or journal text, authored, never generated
  stages: QuestStage[];          // one stage = a G0 letter
  unlock: Condition[];           // all must hold
  rewards: Reward[];             // typed unlocks only (4.4)
}

interface QuestStage {
  objective: Objective;          // closed list, 4.3
  complete: Condition[];
}
```

The contract extends `LetterDefinition` in DATA_AND_BLUEPRINT_SPEC §11 (`objective`, `unlockConditions`, `completionConditions`). It keeps the rule that definitions hold no callbacks and no runtime objects; behaviour is chosen by identifier through typed handlers (DATA_AND_BLUEPRINT_SPEC §10).

### 4.3 Objectives and conditions

Objective types start from what the G0 letters already ask for and stay a closed list:

| Type | Parameters | G0 use |
|---|---|---|
| `build_and_run` | blueprint id | Letters 1, 3, 4, 6 |
| `repair_fault` | blueprint id, fault id | Letters 2, 5 and the daily repair |
| `place_machine` | blueprint id, plot id | Placement (GAMEPLAY_SYSTEMS §13) |
| `find_discovery` | discovery id | G1 only (section 6) |

New types need a spec change, a validator update and a test, never a string in content.

A condition is a pure predicate over the snapshot: quest status, machine built or placed, plot awake, discovery found, local date. There is no scripting language. The project already has one closed `Condition` union, in WORLD_SIMULATION_SPEC §4.1 (`machine_running`, `resource_available`, `building_state`, `all`, `any`). The quest engine reuses it and adds kinds for the facts above, so there is one condition vocabulary and not two.

### 4.4 Rewards

Rewards are unlocks, not points: a quest, a blueprint id, a part id, a plot, a discovery, a cross-world link ([CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md)). XP, ranks, currency, shops and rarity tiers are excluded from G0 (CLAUDE.md §14) and are not used here by default. Adding any of them is an owner decision (section 11).

### 4.5 Events

Consumed: machine completed, machine placed, repair completed, discovery found, date changed. Emitted: quest available, quest completed, reward granted. All carry typed payloads and use the small typed mechanism of TECHNICAL_ARCHITECTURE §8, not a large generic bus.

## 5. Daily mysteries (G1 proposal)

The G0 daily repair stays as specified. A G1 extension may widen its pool or add a clue chain, with these limits:

- The choice stays a pure function of the local date, so it is testable and needs no backend (ADR-027; DAILY-02).
- The result stays "one completion per date, never required" (ADR-027).
- A pool item is a combination of an existing machine and an existing fault. It adds no new machine or system until a quest explicitly needs one.

## 6. Discoveries: hidden mechanisms, secret compartments, blueprints (G1 proposal)

A discovery is data: `{ id, worldId, anchorId, reveal: Condition[], grants: Reward[] }`. It has two parts.

- Reveal: a condition the player satisfies, such as inspecting a machine with X-ray (read-only by definition, GAMEPLAY_SYSTEMS §15), running a machine, or placing machines in a stated order.
- Grant: a blueprint, part or letter, stored as an id in the world record.

A discovery never needs a text keyboard, voice or camera input (CLAUDE.md §14). Its state is saved as ids only (SAVE_PERSISTENCE_SPEC §5).

## 7. Town events and theatre performances

**Town events (G1).** A town event is data owned by the world simulation: a trigger, an optional condition and typed effects, evaluated once per change (WORLD_SIMULATION_SPEC §4.4). A quest may wait for one. This engine does not define events and does not own a calendar. Festivals and seasons are excluded from G0 and are not implied here.

One overlap needs a decision before G1 is built. The event effects in WORLD_SIMULATION_SPEC §4.4 include `unlock_letter` and `unlock_blueprint`, which are quest rewards, and DATA_AND_BLUEPRINT_SPEC §12 allows only one progression authority. Proposal: an event raises a fact, quests read facts in their unlock conditions, and any unlock effect an event carries is applied only through the quest engine's reward path. That keeps one writer of progression. Lead decision (section 11).

**Mechanical theatre performances (not G0).** The grand theatre performance and choreography are excluded from the competition build (CLAUDE.md §14; PRODUCT_SPEC §18). Tockton's theatre facade stays a static front with doors that open for 30 seconds on the hour if the Clock Tower is built (PRODUCT_SPEC §6.4). A performance, if ever approved, would be a quest stage whose objective is "set X running in synchrony". That needs a synchronisation feature in the mechanical engine and belongs to the Grand Mechanical Theatre concept ([MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md) section 9). Owner decision.

## 8. Authoring and validation (G1 proposal)

Quest content is data validated at build time, in the way blueprints are validated (DATA_AND_BLUEPRINT_SPEC §13: "fail early with useful development diagnostics"). The content check fails on:

- duplicate quest, stage or discovery ids;
- an objective that names an unknown blueprint, fault, plot or discovery;
- a reward that names something that does not exist;
- a quest that can never unlock (unreachable), or a cycle of unlock conditions (deadlock);
- letter text over the length the letter UI can show (GAMEPLAY_SYSTEMS §5: "emotionally grounded and concise").

All text is authored. There is no runtime text generation (CLAUDE.md §14; directive Part 11).

## 9. Persistence

- The G0 `letters` map becomes per-world quest statuses. Ids and statuses carry over one to one, so the migration SaveV1 to SaveV2 is a copy with a version bump (SAVE_PERSISTENCE_SPEC §10; [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md) section 5). The exact copy depends on the SaveV1 shape ruling (section 3.3).
- Stage progress is a small integer per accepted quest. Discoveries are a list of ids. `dailyDone` keeps its meaning.
- The engine saves on state changes, never per frame (SAVE_PERSISTENCE_SPEC §6).
- A save from a newer build that holds quest ids this build does not know is not reinterpreted; it fails safe (SAVE_PERSISTENCE_SPEC §10).

## 10. Dependencies

| Needs | Status |
|---|---|
| G0 letters, progression and daily repair built and tested | G0, not started in code |
| Ruling on the SaveV1 shape (I-11) and on the Letter 2 trigger | Lead and owner |
| SaveV2 design | [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md) |
| Events and the shared `Condition` union | [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md) §4.1, §4.4, G1 proposal |
| Residents for `giverResidentId` | [RESIDENT_BEHAVIOUR_SPEC.md](RESIDENT_BEHAVIOUR_SPEC.md) |
| Timing and synchronisation in the mechanical engine, for any performance quest | [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md) §6.3, G2 proposal |

## 11. Owner decisions pending

1. The daily repair pool (ADR-027, G0).
2. The Letter 2 trigger and what "after Letter 2" means for gifting (G0).
3. What happens to Letter 6 and the closing card if the Clock Tower is cut (G0).
4. Whether any G1 quest content may add a points-style reward. Default: no.
5. Whether the closing card's "The show is coming soon" is a hook to a later theatre story. The G0 text is fixed (PRODUCT_SPEC §7) and does not change for this reason. Default: no hook is assumed.

Lead decision (G1): who applies `unlock_letter` and `unlock_blueprint` from a town event (section 7). Default: the quest engine, as stated there.

## 12. Acceptance criteria

Document checks:

1. Section 3 matches PRODUCT_SPEC §7, §8 and GAMEPLAY_SYSTEMS §5, §12 and changes no letter text.
2. No section calls a quest-engine feature a competition requirement.
3. Every excluded item (weekly commissions, festivals, seasons, theatre performance, points-style rewards) names its rule.

Feature checks for G1 (proposal; added to ACCEPTANCE_TESTS.md only when G1 is scheduled). Nothing here is verified at any level.

| ID | Check | Level |
|---|---|---|
| QST-01 | The six G0 letters, expressed as quests, give the same unlock order and the same saved statuses as GAMEPLAY_SYSTEMS §4.1 (PROG-07 still passes) | Desktop |
| QST-02 | A quest never completes because it was opened | Desktop |
| QST-03 | The content check rejects each failure in section 8 in a test fixture | Desktop |
| QST-04 | The same local date gives the same daily choice; a different date may differ (DAILY-02 still passes) | Desktop |
| QST-05 | The engine module imports no Three.js, IWSDK or DOM API | Desktop (lint or test) |
| QST-06 | A SaveV1 file migrates to SaveV2 with every letter status preserved | Desktop |
| QST-07 | Finishing the story without touching the daily repair still works (DAILY-05) | Integration |
| QST-08 | An event effect that unlocks a letter or blueprint changes progression only through the quest engine's reward path | Desktop |
