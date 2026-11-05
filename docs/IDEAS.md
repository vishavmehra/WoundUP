

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

### 4.6 Advanced Building Mode

**Status:** Deferred

Potential improvements:

- Optional free-build mode.
- Custom machine blueprints.
- More complex part combinations.
- Saving custom creations.
- Sharing custom machine designs.

This would require additional validation and could undermine the curated puzzle experience. It is not part of the current release.

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

