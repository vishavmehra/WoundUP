# Wound Up — World Progression System

**Project:** Wound Up
**Label:** G5 Clockwork universe. Design intent only: not built, not scheduled, not competition scope. The competition build has one world and the SaveV1 of the existing specifications. Read the scope firewall in [DECISIONS.md](DECISIONS.md) ADR-028 first.
**Status:** Proposal. Nothing here is approved for production. Open owner points are in section 11.
**Date:** 2026-11-06
**Source:** [directive](directives/2026-11-05_PRODUCTION_DIRECTIVE.md), "Additional master requirement: multiple worlds" (called the multiple-worlds requirement below) §4 to §6, and Part 11; SAVE_PERSISTENCE_SPEC §2 to §12; GAMEPLAY_SYSTEMS §4; DATA_AND_BLUEPRINT_SPEC §12, §16; ADR-010, ADR-026; WORLD_REGISTRY_AND_LOADING §7, §9; WORLD_SIMULATION_SPEC §4.6
**Related:** [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md), [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md), [SPATIAL_WORLD_SYSTEM.md](SPATIAL_WORLD_SYSTEM.md), [MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md), [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md), [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md), [RESIDENT_BEHAVIOUR_SPEC.md](RESIDENT_BEHAVIOUR_SPEC.md), [CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md), [BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md), [SAVE_PERSISTENCE_SPEC.md](SAVE_PERSISTENCE_SPEC.md), [IDEAS.md](IDEAS.md)

## 1. What the competition build needs from this document

Nothing is built. G0 ships SaveV1 as SAVE_PERSISTENCE_SPEC defines it, for Tockton only. No world selector, no second record and no player-level number is added (CLAUDE.md §14; ADR-028 rule 3).

Five rules already in the specifications keep the later move to several worlds a copy and not a rewrite:

1. All persistence goes through one save service, and gameplay code never writes localStorage itself (SAVE_PERSISTENCE_SPEC §2).
2. The save has an explicit version, and migration is a separate, tested function (SAVE_PERSISTENCE_SPEC §10).
3. Letter, blueprint and plot ids are stable (DATA_AND_BLUEPRINT_SPEC §4.1, §16).
4. The save holds no coordinates, surface data or anchor handles (SAVE_PERSISTENCE_SPEC §4.1, §5; ADR-026).
5. A machine is restored from its blueprint and saved progress, never from runtime objects (SAVE_PERSISTENCE_SPEC §5).

Beyond these, the save code is not generalised before delivery: nothing is built for a second world.

One G0 problem blocks the migration design: the SaveV1 shape differs between TECHNICAL_ARCHITECTURE §16 and SAVE_PERSISTENCE_SPEC §3 ([PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) §7, ruling I-11). The lead resolves it before save and load are built. Section 5.3 follows SAVE_PERSISTENCE_SPEC §3 and says where the other shape changes the mapping.

## 2. Requirements inherited

| Requirement | Source |
|---|---|
| Select an available world; load its environment; load only the assets it needs | Multiple-worlds requirement §4 |
| Restore the correct world state; save progress independently per world | Same |
| Switch between unlocked worlds; return to a previously visited world | Same |
| Keep shared inventory and player-level progression where appropriate; keep world-specific quests and resident states | Same |
| Never hold all worlds and all their assets in memory; load and unload progressively | Same |
| One progression authority; the UI keeps no second progression | DATA_AND_BLUEPRINT_SPEC §12 |
| Progression is deterministic and easy to save, and transitions are explicit | GAMEPLAY_SYSTEMS §4 |
| Validate on load; version; migrate explicitly; never silently reinterpret; fail safe on a newer version; use a memory fallback when storage fails | SAVE_PERSISTENCE_SPEC §8 to §11; ADR-010 |
| Save after meaningful changes, never every frame | SAVE_PERSISTENCE_SPEC §6 |
| Restart needs a second deliberate confirmation | SAVE_PERSISTENCE_SPEC §12 |
| Derive what can be derived; save the facts | DATA_AND_BLUEPRINT_SPEC §2 item 6; WORLD_SIMULATION_SPEC §3 item 1, §4.6 |
| No XP, ranks, currency, rarity tiers, accounts or cloud save in G0. They are not used here by default | CLAUDE.md §14; PRODUCT_SPEC §18 |
| Cross-world progression is meaningful, not unrelated unlocks | Multiple-worlds requirement §6; [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md) |

## 3. Concepts: universe and world

- **World progress** belongs to one world: whether it is placed, its quests, its machines, its discoveries, its fired events, its restoration and its daily repair. It is what SaveV1 holds today, for Tockton.
- **Universe progress** belongs to the player and is shared by all worlds: settings, which worlds are unlocked and the last one visited, unlocked parts and blueprints, journal entries, granted cross-world links, and in G3 the saved inventions.
- "Player-level progression" in the directive means the universe record. Here it is a set of unlock flags. It is not a number: there is no XP, rank or currency by default (CLAUDE.md §14). Whether it should ever mean more is an owner decision (section 11).

## 4. The world record (proposal)

One record per visited world. Its fields are the G0 progress fields plus the G1 additions; WORLD_REGISTRY_AND_LOADING §7 calls the G0 part `WorldSaveV1`. Conceptual contract; plain data only.

```ts
interface WorldRecord {
  version: number;                             // this world's own record version
  placed: boolean;                             // SaveV1 townPlaced
  quests: Record<string, QuestStatus>;         // SaveV1 letters
  stage: Record<string, number>;               // quest stage, G1
  machines: { blueprintId: string; built: boolean; placed: boolean; plotId?: string }[];
  discoveries: string[];                       // ids, G1
  firedEvents: Record<string, string>;         // town event id -> local date it last fired, G1
  eventSeen: boolean;                          // the restoration event has played
  daily: string | null;                        // SaveV1 dailyDone
}
```

Rules:

1. A world has its own `version`, so one world can change its record without a migration of every other world.
2. Derived values are not stored (DATA_AND_BLUEPRINT_SPEC §2 item 6). Building and resource states are computed on load from placements and fired events (WORLD_SIMULATION_SPEC §4.6). "Restored" is computed from the quests and machines. Only `eventSeen` is stored, so the restoration event plays once.
3. No coordinates, surface data, anchors, resident positions, animation state or timers (SAVE_PERSISTENCE_SPEC §5; [RESIDENT_BEHAVIOUR_SPEC.md](RESIDENT_BEHAVIOUR_SPEC.md) section 8).
4. Every id is checked against the world's own data on load. An unknown quest, blueprint or plot id is dropped safely or the world falls back to a fresh state (SAVE_PERSISTENCE_SPEC §9).
5. Resident and quest state use the same record. There is no separate resident save.

## 5. Save structure

### 5.1 Root record (proposal)

WORLD_REGISTRY_AND_LOADING §7 proposes a root record plus one record per world: `SaveRootV2 { version: 2; settings; lastWorld; unlocked }` under the existing key `woundup.save`, and one world record under `woundup.world.<worldId>`. This document adopts that shape and its names, and adds the shared record:

```ts
interface SaveRootV2 {
  version: 2;
  settings: { easySnap: boolean; gazeMode: boolean; xrayHint: boolean; night: boolean };
  lastWorld: string;
  unlocked: string[];           // world ids; an unlock is a granted fact, saved when it happens
  shared: {
    partUnlocks: string[];      // part ids
    blueprints: string[];       // discovered blueprint ids
    journal: string[];          // journal entry ids
    links: string[];            // cross-world link ids already granted
  };
  inventions: InventionRecord[];  // G3, optional
}
```

The settings are the SaveV1 settings, shared by all worlds because accessibility is a shared system (multiple-worlds requirement §5).

### 5.2 Layout on storage

| Layout | For | Against |
|---|---|---|
| One key holding everything | One atomic write; simplest migration | Every save rewrites every world; one corrupt value loses all worlds; the whole save is parsed to load one world |
| Root key plus one key per world | Worlds save independently, as the directive asks; one corrupt world does not affect the others; only the active world is parsed | Two writes are not atomic, so load must reconcile |

Adopted: the second layout, as WORLD_REGISTRY_AND_LOADING §7 proposes. All keys are touched only by the save service. Browser storage quotas on Quest Browser are unverified; every record is small plain data and the invention list is capped.

Reconciliation on load:

- A world in `unlocked` with no record starts fresh. A world record the root does not list is ignored and not deleted.
- A corrupt world record resets only that world and shows a subtle warning (SAVE_PERSISTENCE_SPEC §11). A corrupt root falls back to defaults and leaves the world records alone (WORLD_REGISTRY_AND_LOADING §7).
- Writes happen on the triggers in section 6.3, world record first, then the root if it changed.
- Restart clears one world's key after the second confirmation of SAVE_PERSISTENCE_SPEC §12. A full reset clears every key (WORLD_REGISTRY_AND_LOADING §7).

### 5.3 Migration from SaveV1 (explicit)

The migration is one tested function, `migrateSave(data: unknown)` (SAVE_PERSISTENCE_SPEC §10). Mapping from the SaveV1 of SAVE_PERSISTENCE_SPEC §3:

| SaveV1 | SaveV2 |
|---|---|
| `version: 1` | Root `version: 2` |
| `townPlaced: boolean` | World record `tockton`, `placed` |
| `letters` | World record `tockton`, `quests` (ids and statuses unchanged) |
| `machines[]` | World record `tockton`, `machines` |
| `dailyDone` | World record `tockton`, `daily` |
| `settings` | Root `settings` |
| (new) | `lastWorld: "tockton"`, `unlocked: ["tockton"]`, empty `shared` |

If the I-11 ruling keeps the TECHNICAL_ARCHITECTURE §16 shape instead (`townPlaced: string[]`, `machinesBuilt: string[]`, `machinePlacements`), `machinesBuilt` and `machinePlacements` fold into `machines[]` (built for each id in the first list, placed and `plotId` from the second), and the lead defines what `townPlaced` as a list of strings becomes. The table is rewritten after that ruling.

Rules:

1. The migration writes `woundup.world.tockton` first, then rewrites `woundup.save` as version 2. If it stops between the two writes, the root is still version 1 and still holds everything, so the migration repeats safely (WORLD_REGISTRY_AND_LOADING §7).
2. A save with a version newer than the build understands fails safe, shows that the saved data is incompatible, and is not overwritten, so an older build never destroys newer progress (SAVE_PERSISTENCE_SPEC §10).
3. Migration code lives apart from gameplay code and is tested with a fixture for each supported shape and for the interrupted case.

## 6. World lifecycle

### 6.1 Statuses

A world's status is derived, not stored (DATA_AND_BLUEPRINT_SPEC §2 item 6). These are progression statuses. They are not the runtime load states (`unloaded`, `loading`, `ready`, `active`, `unloading`, `failed`) of WORLD_REGISTRY_AND_LOADING §9.

| Status | How it is derived | Becomes the next when |
|---|---|---|
| `locked` | The id is not in `unlocked` | The world's unlock conditions hold and the grant is saved |
| `available` | In `unlocked`, no world record | The player enters it for the first time; the record is created |
| `in_progress` | A record exists and the restoration conditions do not yet hold | All required quests are complete; the restoration event plays, then `eventSeen` is saved |
| `restored` | The restoration conditions hold | Stays enterable for optional content, daily repairs and the sandbox |

Unlock conditions are pure predicates over saved facts, in the form of [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) section 4.3. Transitions are explicit (GAMEPLAY_SYSTEMS §4).

### 6.2 Unlocking (proposal)

Default: worlds unlock in production order, so World N+1 becomes available when World N is restored. Reason: each world extends the shared engine in turn, and an earlier world must be completable without any later one ([CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md) section 4). Unlocking by knowledge, such as a letter from another world, is also allowed. Unlocking by currency is not. Owner decision (section 11).

In G0, Tockton has no `restored` state and no closing event beyond the closing card (PRODUCT_SPEC §7). The G5 condition for Tockton restored would be the G0 letters complete, with the Letter 6 fallback still an open G0 question ([STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) section 3.3).

### 6.3 Save triggers

SAVE_PERSISTENCE_SPEC §6 lists seven. G5 adds: a world unlocked, a world restored, a discovery found, a cross-world link granted, a world switched, an invention saved, a town event fired. Never every frame, and never rewrite unchanged data.

## 7. Shared progression

- Everything shared is a flag or an id, not a quantity: `partUnlocks`, `blueprints`, `journal`, `links`. Granting is idempotent, so re-delivery never duplicates.
- A part or blueprint unlock is read by the world that requires it ([CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md) section 3).
- The journal and inventory are shared systems (multiple-worlds requirement §5). They must not become a large inventory screen: the parts tray avoids a conventional grid inventory (UI_UX_SPEC §10). Presenting the journal as a small physical object is a proposal for the interface specification, not decided here.
- Settings are universe-wide.
- The daily repair stays per world in this proposal, because its pool depends on that world's machines (ADR-027 sets the rule for Tockton; WORLD_REGISTRY_AND_LOADING §7 leaves the question to this document). Owner decision (section 11).

## 8. Switching worlds and loading only what is needed

[WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md) §5, §6 and §9 own the mechanism: validate, compute the load set, prefetch, swap materials, release the old level first, dispose with the project's own disposer, keep the persistent set. This section states only the progression-side requirements:

1. Switch only from `town` mode. Work in progress, such as an unfinished assembly, is not saved, so ask first (WORLD_REGISTRY_AND_LOADING §6 step 1; SAVE_PERSISTENCE_SPEC §14).
2. Save the current world record before unloading anything.
3. Read the target world's record, or create a fresh one.
4. Rebuild machines from blueprints and the record. Reuse the session's stage root and table anchor or stand; a world switch does not choose a surface again (ADR-026; [SPATIAL_WORLD_SYSTEM.md](SPATIAL_WORLD_SYSTEM.md) §11). If the next world's footprint does not fit the chosen surface at its minimum scale, the switch is refused with a message or a new choice is made. That is an open point there.
5. The player stays seated and the camera is never moved (INTERACTION_SPEC §3).
6. Record `lastWorld`.

A gift viewer loads only the assets its blueprint needs and never reads or writes the player's records (SAVE_PERSISTENCE_SPEC §13; [BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md)). If the app is suspended during a switch, the record was saved first, so it resumes in a stable world.

## 9. Failure behaviour

| Failure | Behaviour |
|---|---|
| Storage unavailable or full | Continue in memory for every world, show a subtle warning, retry after the next meaningful change (SAVE_PERSISTENCE_SPEC §11) |
| Corrupt world record | That world starts fresh; the others are untouched |
| Unknown world id in `unlocked` | Treated as unavailable and kept, not deleted |
| Newer save version | Fail safe and write nothing (section 5.3) |
| A world asset fails to load | Offer Retry or Return, as WORLD_REGISTRY_AND_LOADING §10 describes; never load part of a world |

## 10. Dependencies

| Needs | Status |
|---|---|
| The I-11 ruling and SaveV1 built and tested | Lead; G0 |
| ADR "G" recording SaveV2, named in [audits/A_DOCUMENTATION.md](audits/A_DOCUMENTATION.md) §4.2 | Not yet recorded in DECISIONS.md |
| The G1 quest engine for `quests` and `stage` | [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md) |
| The world simulation for `firedEvents` | [WORLD_SIMULATION_SPEC.md](WORLD_SIMULATION_SPEC.md) §4.4, §4.6 |
| The registry, loader and disposer | [WORLD_REGISTRY_AND_LOADING.md](WORLD_REGISTRY_AND_LOADING.md); not built |
| A second world | Not approved ([MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md) section 12) |

## 11. Owner decisions pending

1. Which world is second, and whether any exists. Default: none.
2. Unlock order. Default: production order.
3. Restart scope. Default: two actions, "restart this world" and "erase everything", each with the second confirmation of SAVE_PERSISTENCE_SPEC §12.
4. Whether the daily repair is per world or one for the universe. Default: per world.
5. Whether "player-level progression" ever means more than unlock flags. Default: no.
6. The SaveV1 shape (G0 prerequisite, I-11). The storage layout of section 5.2 is a lead decision, recorded with ADR "G".

## 12. Acceptance criteria

Document checks:

1. The G5 label is at the top and G0 keeps SaveV1 and a single world.
2. Every field of SaveV1 in SAVE_PERSISTENCE_SPEC §3 appears in the section 5.3 mapping.
3. No record in sections 4 and 5 holds a coordinate, anchor, runtime object or timer.
4. No XP, rank or currency appears except as an exclusion.
5. The root and world record names and the migration order agree with WORLD_REGISTRY_AND_LOADING §7.

Feature checks for G5 (proposal; added to ACCEPTANCE_TESTS.md only when G5 is scheduled). Nothing here is verified at any level.

| ID | Check | Level |
|---|---|---|
| WPR-01 | A SaveV1 fixture migrates to SaveV2 with every letter status, machine, setting and the daily date preserved | Desktop |
| WPR-02 | A save with a newer version fails safe and nothing is written | Desktop |
| WPR-03 | A corrupt world record resets only that world | Desktop |
| WPR-04 | A listed world with no record starts fresh; an unlisted record is ignored and kept | Desktop |
| WPR-05 | Switching worlds saves before unloading, and the reload restores the same state | Desktop |
| WPR-06 | A schema test finds no coordinate, anchor, runtime object or timer in any record | Desktop |
| WPR-07 | Writes occur only on the section 6.3 triggers, never per frame | Desktop |
| WPR-08 | Granting the same shared id or link twice changes nothing | Desktop |
| WPR-09 | After a switch, geometry and texture counts return to the baseline (WLD-01) | IWER, then Quest Browser |
| WPR-10 | Both restart actions need a second confirmation | Desktop |
| WPR-11 | With storage blocked, every world plays on the memory fallback | Desktop |
| WPR-12 | The G0 save tests (SAVE_PERSISTENCE_SPEC §15) still pass | Desktop |
| WPR-13 | A migration interrupted between the two writes leaves a version 1 root that migrates again correctly | Desktop |
