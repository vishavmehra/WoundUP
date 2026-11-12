

# Wound Up — Ideas Backlog

**Project:** Wound Up  
**World:** Tockton  
**Status:** Living backlog — proposals are not approved features  
**Purpose:** Capture future ideas without expanding the committed competition scope.

---

## 1. Purpose

This document records ideas that may improve Wound Up in future iterations.

It has three goals:

1. Preserve potentially valuable ideas.
2. Prevent unplanned feature additions during the competition deadline.
3. Separate approved requirements from optional proposals.

An idea recorded here is not automatically part of the product.

The authoritative scope remains:

- `PROJECT_BIBLE.md`
- `PRODUCT_SPEC.md`
- `GAMEPLAY_SYSTEMS.md`
- `DATA_AND_BLUEPRINT_SPEC.md`
- `BUILD_ROADMAP.md`
- `DECISIONS.md`

If an idea conflicts with an approved specification, the approved specification takes priority.

## 2. Idea Status

Every idea must have one of these statuses:

| Status | Meaning |
|---|---|
| Approved | Explicitly accepted and added to the relevant specification |
| Proposed | Interesting, but not approved |
| Deferred | Potentially useful after the competition |
| Rejected | Deliberately excluded |
| Implemented | Built and verified |

Only ideas marked **Approved** may enter the implementation plan.

## 3. Competition Scope Protection

The competition version must prioritise:

- A complete hands-first experience.
- A satisfying mechanical construction loop.
- Functional machine simulation.
- A visible transformation of Tockton.
- Strong visual presentation.
- Reliable desktop and headset fallback behaviour.
- A working gift-sharing experience.
- A polished demonstration.

Do not introduce new systems merely because they sound impressive.

A feature must justify its implementation cost, testing burden, performance impact, and risk to the deadline.

## 4. Proposed Future Ideas

These are optional concepts, not committed requirements.

### 4.1 More Town Residents

**Status:** Deferred

Possible future additions:

- More residents with distinct personalities.
- Additional letters and repair requests.
- Small character animations.
- Resident reactions when a machine starts.
- Personal stories connected to different town locations.

The existing residents and letters should be polished before expanding the cast.

**Design intent, not approved (G1):** [RESIDENT_BEHAVIOUR_SPEC.md](RESIDENT_BEHAVIOUR_SPEC.md) and [STORY_AND_QUEST_ENGINE.md](STORY_AND_QUEST_ENGINE.md).

### 4.2 More Machines

**Status:** Deferred

Possible future machines:

- Lighthouse mechanism.
- Steam-powered tram.
- Hot-air balloon.
- Mechanical orchestra.
- Observatory.
- Automaton theatre.

New machines should reuse the existing blueprint, solver, assembly, simulation, and placement systems.

They should not require separate hard-coded gameplay architectures.

**Design intent, not approved (G5):** several of these have a home in the future world concepts of [MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md): the lighthouse in Brasswater Harbour, the observatory in the Verdant Observatory, the mechanical orchestra and automaton theatre in the Grand Mechanical Theatre. The steam-powered tram is closest to the steam locomotives of Emberforge Mountains. The hot-air balloon has no concept. All stay excluded from the competition build.

### 4.3 More Mechanical Complexity

**Status:** Deferred

Potential systems:

- Additional gear families.
- More complex belt arrangements.
- Multiple interacting shafts.
- More advanced cam profiles.
- Compound gear trains.
- Additional mechanical failure types.

Any extension must preserve deterministic solver behaviour and remain understandable to players.

**Design intent, not approved (G5):** the mechanics each future world would ask of the engine are listed in [MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md) section 3.4 and the world tables.

### 4.4 Town Atmosphere

**Status:** Deferred

Potential improvements:

- More environmental animations.
- Animated townspeople.
- Seasonal decoration.
- More detailed window lighting.
- Additional ambient sound.
- More reactive buildings.

These should be evaluated against Quest rendering performance.

### 4.5 Personalised Gifts

**Status:** Proposed

Possible future improvements:

- Custom message cards.
- Additional engraving styles.
- More gift wrapping.
- Multiple machines in one gift.
- Gift history.

The competition version remains limited to one finished machine per gift link.

**Design intent, not approved (G4):** sharing beyond one finished machine is in [BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md), with accounts and hosted services left as owner decisions.

### 4.6 Advanced Building Mode

**Status:** Deferred

Potential improvements:

- Optional free-build mode.
- Custom machine blueprints.
- More complex part combinations.
- Saving custom creations.
- Sharing custom machine designs.

This would require additional validation and could undermine the curated puzzle experience. It is not part of the current release.

**Design intent, not approved (G3 and G4):** [CREATIVE_SANDBOX_SPEC.md](CREATIVE_SANDBOX_SPEC.md) for free-build, and [BLUEPRINT_SHARING_SPEC.md](BLUEPRINT_SHARING_SPEC.md) for sharing custom designs.

### 4.7 More Accessibility Options

**Status:** Proposed

Potential future improvements:

- Additional hand-tracking alternatives.
- More snap-radius settings.
- Custom interaction sensitivity.
- Additional visual contrast settings.
- Adjustable interaction distances.
- More detailed audio and visual feedback controls.

The existing accessibility requirements must be completed first.

### 4.8 Returning to the Same Table

**Status:** Proposed

Keep the town's anchor across sessions, so Tockton is waiting on the same table when the player comes back. The Official Rules name persistent anchors among the device capabilities they score.

The approved requirement is persistence within the session (ADR-026). This idea needs real Quest testing first.

**Related design intent (G5):** [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md) keeps coordinates and anchor handles out of every save record. Storing an anchor reference would need its own decision.

### 4.9 Future Worlds and the Clockwork Universe

**Status:** Deferred (G5 Clockwork universe, concept only)

The owner's directive proposes five worlds after Tockton, in this production order: 1 Tockton (the competition world), 2 Brasswater Harbour, 3 Emberforge Mountains, 4 Verdant Observatory, 5 Aetherian Skyworks and 6 Grand Mechanical Theatre. They are strategic concepts, not approved tasks. Tockton is the only world in the competition build, and no asset for another world is made before delivery unless the owner approves a reusable shared asset (ADR-028 rule 4).

Design intent, not approved:

- [MULTI_WORLD_UNIVERSE_DESIGN.md](MULTI_WORLD_UNIVERSE_DESIGN.md): the six world concepts, each with the sixteen elements the directive lists.
- [WORLD_PROGRESSION_SYSTEM.md](WORLD_PROGRESSION_SYSTEM.md): the save structure per world and shared player progression.
- [CROSS_WORLD_GAMEPLAY.md](CROSS_WORLD_GAMEPLAY.md): how progress in one world can matter in another.
- [WORLD_ASSET_INVENTORY.md](WORLD_ASSET_INVENTORY.md): what is and is not itemised for them.

## 5. Explicitly Excluded Ideas

The following are not approved for the competition build:

- Voice or microphone-based gameplay.
- Humming recognition.
- Melody editing or composition.
- Free-form music creation.
- Advanced choreography systems.
- Tram, lighthouse, or hot-air balloon gameplay.
- Full theatre performance.
- Free-build sandbox.
- Weekly commissions.
- Seasons and festivals.
- Rarity, XP, rankings, or currency.
- Shops and in-game purchases.
- Whole-town gifting.
- User accounts.
- Cloud saves.
- Leaderboards.
- Multiplayer.
- Analytics and telemetry.
- AI or LLM gameplay.
- Passthrough camera analysis or computer vision.
- VR text keyboards.
- Native APK.
- Unity or Unreal migration.

These exclusions protect the project's implementation time and technical reliability.

Under the scope firewall ([DECISIONS.md](DECISIONS.md) ADR-028), a document labelled G1 to G5 may describe some of these items as design intent. That never makes one of them part of the competition build.

## 6. Idea Evaluation

Before approving an idea, evaluate it against:

| Criterion | Question |
|---|---|
| Player value | Does it make the experience more enjoyable or understandable? |
| Theme | Does it strengthen Tockton's clockwork identity? |
| Reuse | Can existing systems support it? |
| Performance | Can it run comfortably on Quest 3 and Quest 3S? |
| Complexity | How much new code and testing are required? |
| Deadline | Can it be completed without risking the core experience? |
| Reliability | Does it introduce additional failure points? |

An idea should not be approved if it threatens the core experience.

## 7. Approval Process

To approve an idea:

1. Describe the player-facing behaviour.
2. Identify affected systems and documents.
3. Estimate implementation and testing effort.
4. Evaluate performance and compatibility.
5. Update `DECISIONS.md`.
6. Update the relevant product or technical specification.
7. Update `BUILD_ROADMAP.md` if implementation is required.
8. Only then create an implementation task.

Do not silently change the product scope in code.

## 8. Backlog Template

Use this format when adding new ideas:

### IDEA-XXX — Title

- **Status:** Proposed
- **Category:** Gameplay / Visual / Audio / Accessibility / Technical
- **Description:**
- **Player benefit:**
- **Affected systems:**
- **Technical considerations:**
- **Performance impact:**
- **Estimated complexity:**
- **Dependencies:**
- **Decision:**

---

## 9. Final Rule

During the competition implementation period, improving an existing feature is generally more valuable than introducing another feature.

The goal is not to build the largest possible game.

The goal is to deliver a small, memorable, technically convincing experience that feels complete.

