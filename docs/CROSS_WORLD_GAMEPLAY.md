# Wound Up — Cross-World Gameplay

**Project:** Wound Up
**Label:** G5 Clockwork universe. Design intent only: not built, not scheduled, not competition scope. Tockton is the only world in the competition build, so nothing here exists in it. Read the scope firewall in [DECISIONS.md](DECISIONS.md) ADR-028 first.
**Status:** Proposal. The five examples come from the owner's directive; the mechanisms are proposals and none is approved. Open owner points are in section 10.
**Date:** 2026-11-06
**Source:** [directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md), "Additional master requirement: multiple worlds" (called the multiple-worlds requirement below) §4 to §6 and the "World-by-world production strategy"; Part 10 (Generation 5); ADR-028, ADR-030, ADR-033
**Related:** [MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md), [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md), [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md), [RESIDENT_BEHAVIOUR_SPEC.md](RESIDENT_BEHAVIOUR_SPEC.md), [CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md), [BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md), [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md), [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md), [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md), [DATA_AND_BLUEPRINT_SPEC.md](DATA_AND_BLUEPRINT_SPEC.md), [MECHANICAL_SOLVER_SPEC.md](MECHANICAL_SOLVER_SPEC.md)

## 1. What the competition build needs from this document

Nothing is built and nothing in G0 refers to another world. The closing card keeps its fixed text, "Tockton is waking up. The show is coming soon." (PRODUCT_SPEC §7), and is not turned into a hook for later worlds without an owner decision (section 10).

Two properties of the G0 design keep cross-world links possible, and both already follow from the specifications:

1. Parts, blueprints and discoveries have stable ids that saves and gifts can reference (DATA_AND_BLUEPRINT_SPEC §4.1, §16; ADR-033).
2. A machine's behaviour is decided by the deterministic solver from data, so a part carried from elsewhere behaves by the same rules (ADR-008).

G0 must not add: multiplayer or cooperative play, currency, shops or trading, rarity tiers, XP, accounts, or any second world (CLAUDE.md §14; PRODUCT_SPEC §18).

## 2. The directive's examples

The directive gives five examples of cross-world progression (multiple-worlds requirement §6). Each is mapped to a link type (section 3). The directive's own test is that cross-world progression is "meaningful, not simply a collection of unrelated unlocks", and that the feature stays future-facing "until the first world is complete and stable".

| # | Directive example | Link type | What it needs |
|---|---|---|---|
| a | A component discovered in the harbour can unlock a new machine in Tockton | `part_unlock` | A Brasswater discovery ([STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) section 6), and an optional new Tockton machine that requires that part. The new machine is G1 content added after delivery |
| b | A mechanism invented in Emberforge can power a machine in another world | `part_unlock` of a drive part | A part whose definition carries the drive's characteristics (`angularVelocity`, `energyPerUnit`, `drainRate`, DATA_AND_BLUEPRINT_SPEC §4), and a socket in the target blueprint that accepts it. The solver's power input today is `mainspring` or `ambient_wind` only (MECHANICAL_SOLVER_SPEC §5), so a part-based power source is a contract change owned by the lead (AGENT_WORKFLOW §14) |
| c | A celestial blueprint from the observatory reveals a hidden location | `location_reveal` | A discovery in another world whose reveal condition reads a universe-level flag (section 3) |
| d | A performance mechanism from the theatre can be used in player-created automata | `part_unlock` into the sandbox library | World 6 and G3 ([CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md)). Without G3 the link has no consumer |
| e | Residents in different worlds can exchange letters or mechanical gifts | `correspondence`, `mechanical_gift` | Authored letters delivered by a grant, and a parcel that unlocks a part or blueprint (section 6) |

## 3. Link model (proposal)

A cross-world link is data in the same form as any quest reward: stable id, typed, validated, no runtime objects (DATA_AND_BLUEPRINT_SPEC §2, §13).

```ts
interface CrossWorldLink {
  id: string;                   // stable
  type: "part_unlock" | "blueprint_discovery" | "location_reveal"
      | "correspondence" | "mechanical_gift";
  fromWorldId: string;
  toWorldId: string;
  trigger: Condition[];         // predicates over universe progress, as in the quest engine
  grant: Reward;                // a typed unlock from STORY_AND_QUEST_ENGINE section 4.4
  textId: string;               // authored letter or journal text giving the reason
}
```

How it works:

1. The source world reports progress as saved facts: a discovery found, a quest completed, a world restored.
2. The link's trigger is a pure predicate over those facts and the local date. No scripting.
3. When it becomes true, the grant is written to the shared record once: `partUnlocks`, `blueprints`, `journal` or `links` ([WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md) section 7). Granting is idempotent.
4. The target world reads the shared record when it loads. A blueprint may list required part ids. A discovery's reveal condition may read a shared flag.
5. The player meets it through objects the game already has: a letter, a parcel, a blueprint, a journal entry (GAMEPLAY_SYSTEMS §5, §6). No new interface is introduced here.

## 4. Rules

1. **Meaningful, not a pile of unlocks.** Every link passes four design-review questions: it has authored text giving its reason; it changes what the player can build or understand in the target world; its grant is consumed by a blueprint, socket or discovery in that world; and the journal records where it came from.
2. **An earlier world never depends on a later one.** A world's required path to restoration uses only that world and worlds released before it. A link from a later world into an earlier one is an optional extension, added when the later world ships. Reason: worlds are produced and finished one at a time (world-by-world strategy), and a shipped world must stay completable.
3. **No live cross-world simulation.** One world is loaded at a time (multiple-worlds requirement §4), so effects cross as saved grants, never as two running simulations.
4. **Acyclic.** A build-time check follows the quest engine's reachability check across worlds and fails on a cycle that makes a quest, discovery or world unreachable ([STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) section 8).
5. **Deterministic.** Triggers depend on saved progress and the local date only, like the daily repair (ADR-027). No server clock.
6. **No currency, no trading.** A mechanical gift is a unique unlock, not an item stack that can be sold or traded (CLAUDE.md §14).

## 5. Engine and asset consequences

- **Shared classification.** A part that can cross worlds must be `shared` and `reuseEligible` in the manifest. If a part is first made as world-specific and later crosses, the lead reclassifies it and moves its file under the shared folder in one change, and the manifest is updated with it (ADR-033; [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md) section 3).
- **Look.** A finish is a runtime material (ADR-030), so a carried part takes the target world's materials from the shared material library (ADR-032).
- **Compatibility.** A carried part obeys the target blueprint's socket family and the solver's rules, such as gear module compatibility, where a mismatch is a jam (MECHANICAL_SOLVER_SPEC §8.2).
- **Loading.** The target world's load set lists the carried part's GLB from the shared folder; no other world's assets are loaded for it.
- **Power.** Example b needs a deterministic, blueprint-defined power source in the manner of ambient wind (MECHANICAL_SOLVER_SPEC §12.2). It is not an environmental simulation. The G2 energy network already allows several sources, with mainspring, ambient wind and an optional flywheel as the first ones ([MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md) §6.2); a carried drive part would be one more source declared by its part definition, and a blueprint that needs it lists the feature in `requires` (rule C6). The contract is that document's, and the decision is the lead's.

## 6. Letters and mechanical gifts between residents

- These are resident-to-player, authored and delivered by a link grant. They are not the player-to-player gift links of [BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md), and they use no network.
- All text is authored. The player types nothing (CLAUDE.md §14: no text keyboards in VR; no runtime text generation).
- A letter can also be a quest giver, through the quest engine. The sender is a resident id from [RESIDENT_BEHAVIOUR_SPEC.md](RESIDENT_BEHAVIOUR_SPEC.md).
- A correspondence may arrive on a later local date, using the local date as the daily repair does (ADR-027).
- A mechanical gift opens like the G0 parcel and reveals a blueprint and parts (GAMEPLAY_SYSTEMS §6).

## 7. Persistence

Granted link ids are stored in `shared.links` and the resulting unlocks in `partUnlocks`, `blueprints` and `journal` ([WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md) sections 5 and 7). They are flags and ids only. They are validated on load; an unknown link id is kept and ignored, and a newer save version fails safe (SAVE_PERSISTENCE_SPEC §9, §10).

## 8. Not designed here

Directive Part 10 lists these under Generation 5. Each needs a decision that has not been made.

- **Cooperative experiences.** Real-time cooperation needs a network service, which G0 excludes (multiplayer; ADR-013) and which would need a new ADR. The only network-free forms of togetherness in the current design are link-based sharing and challenges ([BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md)).
- **Player-created districts.** They depend on G3 free-build and on a model for editing a world, which does not exist ([CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md)).
- **Expanded campaigns.** More quests and worlds on the same engine ([STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md)).
- **Advanced spatial experiences.** A separate topic. [SPATIAL_WORLD_SYSTEM.md](SPATIAL_WORLD_SYSTEM.md) §10 notes that no source in the repository describes a supported way to share an anchor between devices for cooperative play.

## 9. Dependencies

| Needs | Status |
|---|---|
| At least two worlds | Only Tockton is approved. World 2 is an owner decision ([MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md) section 12) |
| SaveV2 and its shared record | [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md) |
| The quest and discovery engine | [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) |
| [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md), for loading a carried part's asset | Written, G5 proposal |
| [MECHANICAL_ENGINE_V2.md](MECHANICAL_ENGINE_V2.md), for part-based power | Written, G2 proposal |
| G3 for example d | [CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md) |

## 10. Owner decisions pending

1. Which of the five examples are wanted. Default: none is built.
2. Whether the closing card's "The show is coming soon" is a hook to a later world. Default: no. The G0 text does not change for this reason.
3. Whether the solver's power input may gain a part-based source. Default: not before G2.
4. Whether a world-specific part may be promoted to shared after its world ships. Default: yes, as a lead change (section 5).
5. Cooperative play. Default: not designed.

## 11. Acceptance criteria

Document checks:

1. The G5 label is at the top and every example is mapped to a link type.
2. No rule makes a G5 feature a competition requirement or changes the closing card.
3. Section 8 lists each G5 item that is not designed.

Feature checks for G5 (proposal; added to ACCEPTANCE_TESTS.md only when G5 is scheduled). Nothing here is verified at any level.

| ID | Check | Level |
|---|---|---|
| XWG-01 | A build-time check rejects a link with an unknown type, an unknown world, a missing text id or a grant nothing consumes | Desktop |
| XWG-02 | The link graph has no cycle that makes a quest, discovery or world unreachable | Desktop |
| XWG-03 | Each world's required path completes with only earlier worlds' content present | Desktop |
| XWG-04 | Granting the same link twice changes nothing | Desktop |
| XWG-05 | A carried part loads in the target world from its shared path, fits compatible sockets, and a module mismatch jams | Desktop |
| XWG-06 | After a grant, the journal shows where it came from | Desktop |
| XWG-07 | Applying a grant leaves one world loaded and geometry and texture counts at baseline (WLD-01) | IWER, then Quest Browser |
| XWG-08 | No link needs the network or a clock other than the local date | Desktop |
