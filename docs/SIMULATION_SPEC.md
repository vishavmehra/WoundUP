

# Wound Up — Machine Simulation Specification

**Project:** Wound Up  
**World:** Tockton  
**Status:** Implementation specification  
**Depends on:** `MECHANICAL_SOLVER_SPEC.md`, `DATA_AND_BLUEPRINT_SPEC.md`, `GAMEPLAY_SYSTEMS.md`, `TECHNICAL_ARCHITECTURE.md`

---

## 1. Purpose

This document defines how completed mechanical machines behave at runtime.

The mechanical solver determines whether an assembled machine works and calculates its mechanical results.

The simulation layer consumes those results and translates them into:

- Rotating components.
- Moving followers.
- Animated machine parts.
- Mechanical sound.
- Visual effects.
- Machine completion feedback.
- Town activation events.

The simulation layer must not independently determine whether a machine is mechanically valid.

## 2. Architecture

The runtime pipeline is:

```text
Player Assembly
      |
      v
Machine Blueprint
      |
      v
Mechanical Solver
      |
      v
SolveResult
      |
      v
Simulation Controller
      |
      +------> Part Animation
      |
      +------> Audio Controller
      |
      +------> Visual Effects
      |
      +------> Machine Behaviour
      |
      +------> Town Activation
```

The solver is authoritative.

The simulation controller is responsible for presentation and runtime behaviour.

## 3. Core Principles

1. Simulation must be deterministic where possible.
2. The solver must remain independent of Three.js.
3. Rendering must not modify solver results.
4. Machine behaviour must be data-driven.
5. Every machine must support starting, running, stopping, and reset.
6. All runtime animation must be frame-rate independent.
7. Simulation must be lightweight enough for Quest hardware.
8. A machine must never visually run if its solver result says it cannot run.
9. Simulation must not require a physics engine.
10. No gameplay-critical backend or external service is permitted.

## 4. Runtime States

Every machine uses the following runtime states:

| State | Meaning |
|---|---|
| Unassembled | Required components are missing |
| Ready | Assembly is complete and solver can evaluate it |
| Invalid | Solver reports incomplete, jammed, or otherwise invalid |
| Wound | Machine has stored energy and is ready to run |
| Running | Machine is actively simulating |
| Exhausted | Stored energy has been consumed |
| Paused | Runtime is temporarily suspended |
| Completed | Machine has fulfilled its relevant progression requirement |

The exact state transition must be validated by the machine controller.

## 5. State Transitions

```text
Unassembled
    |
    | Required parts placed
    v
Ready
    |
    | Solver evaluation
    |
    +---- Invalid result ----> Invalid
    |
    +---- Valid result ------> Wound
                                  |
                                  | Player releases Run
                                  v
                                Running
                                  |
                     +------------+------------+
                     |                         |
                 Energy ends              Player pauses
                     |                         |
                     v                         v
                 Exhausted                  Paused
                     |                         |
                     +----------+--------------+
                                |
                         Restart / Rewind
                                |
                                v
                              Wound
```

This is a logical model. The implementation may use a state machine or equivalent typed controller.

## 6. Simulation Inputs

The simulation controller receives:

- Machine blueprint ID.
- Machine instance ID.
- Validated assembly.
- `SolveResult`.
- Current winding energy.
- Machine runtime configuration.
- Current simulation state.
- Player pause state.
- Relevant town progression events.

It must not infer mechanical validity from visual transforms.

## 7. SolveResult Consumption

The simulation layer reads the solver output.

Relevant information includes:

- Overall solver status.
- Angular velocity values.
- Follower poses.
- Runtime duration.
- Jam information.
- Wrong-target information.

If the solver returns:

### `runs`

The machine may run according to the calculated mechanical behaviour.

### `runs_wrong`

The machine runs with the incorrect behaviour described by the solver.

Examples:

- A windmill rotates too quickly.
- A machine runs for an unexpectedly short duration.
- A mechanism produces an incorrect output.

### `jams`

The machine must not enter normal running mode.

It should provide mechanical feedback such as a short clunk, visible vibration, or jam indication.

### `incomplete`

The machine must not run.

The interface should direct attention to the missing assembly requirement.

## 8. Time and Frame Management

Simulation must use elapsed time rather than assuming a fixed frame rate.

Use a delta-time approach:

```ts
const deltaSeconds = Math.min(rawDeltaSeconds, maxDeltaSeconds);
```

The implementation should:

- Clamp unusually large frame deltas.
- Avoid large animation jumps after tab suspension.
- Pause or safely suspend simulation when the application is backgrounded.
- Resume without suddenly consuming all stored energy.
- Avoid accumulating unbounded time.

Use a bounded update loop if necessary.

Do not run expensive graph calculations every render frame.

Solver evaluation should happen when assembly changes or when the machine is explicitly evaluated.

## 9. Mechanical Animation

### 9.1 Rotating Components

For a component with angular velocity `omega`:

\[
\theta_{next} = \theta_{current} + \omega \Delta t
\]

Use the solver-provided angular velocity.

Do not hard-code gear speeds independently of the solver.

### 9.2 Gear Relationships

The solver determines the relationship between meshed gears.

The renderer animates each gear using its calculated angular velocity.

Opposite rotation direction must be preserved.

### 9.3 Shafts

Connected shafts must follow the solver's shared angular velocity.

### 9.4 Belt Systems

Belt-connected components must use the solver's calculated speed relationship.

### 9.5 Cam Followers

The simulation controller consumes the solver's follower pose.

The renderer interpolates between poses smoothly.

### 9.6 Pendulum

The Clock Tower uses a controlled pendulum animation.

Its motion must remain visually consistent with the relevant blueprint configuration.

Do not introduce a full rigid-body simulation.

## 10. Machine Behaviour

### 10.1 Music Box

Expected behaviour:

- Cylinder rotates.
- Comb remains fixed.
- Governor rotates.
- Mechanical melody plays.
- Spring energy decreases.
- Machine stops when energy is exhausted.

Target cylinder angular velocity: approximately 0.4 rad/s, within ±10%.

Audio must be synchronised with cylinder rotation.

### 10.2 Carousel

Expected behaviour:

- Main platform rotates.
- Horses move vertically.
- Canopy lights twinkle.
- Music Box melody plays.
- Energy decreases over time.

Target platform angular velocity: approximately 0.5 rad/s, within ±10%.

### 10.3 Windmill

Expected behaviour:

- Sails rotate.
- Millstone rotates.
- Flour puffs appear.
- Bakery chimney emits smoke.
- Baker performs a kneading animation.
- Bakery oven glows.

Target millstone angular velocity: approximately 0.6 rad/s, within ±15%.

The windmill's successful activation must trigger the bakery's town behaviour.

### 10.4 Clock Tower

Expected behaviour:

- Pendulum swings.
- Clock hands display local time.
- Bell activates at the relevant hour.
- Theatre doors open for 30 seconds.

This feature is lower priority and may be cut according to the roadmap.

## 11. Audio Simulation

Audio must reflect machine state.

| State | Audio |
|---|---|
| Assembly | Soft part placement clicks |
| Correct snap | Mechanical click |
| Incorrect part | Soft wooden or mechanical bonk |
| Wind | Spring tension sound |
| Start | Short mechanical release |
| Running | Machine-specific loop |
| Jam | Short mechanical clunk |
| Exhausted | Gradual stop or final click |
| Town wake | Gentle magical/mechanical sound |

Audio requirements:

- Avoid abrupt volume spikes.
- Avoid excessive overlapping loops.
- Stop loops when machines stop.
- Pause or suspend audio appropriately.
- Respect user audio settings.
- Use local assets.

## 12. Visual Effects

Effects must communicate state rather than distract.

Examples:

- Small sparks on successful assembly.
- Gear movement during operation.
- Subtle vibration during a jam.
- Flour puffs from the windmill.
- Warm light in awakened buildings.
- Wake ripple during town activation.

The wake ripple lasts approximately 1.5 seconds.

Avoid expensive particle systems and large numbers of real-time lights.

## 13. Simulation and Town Integration

A machine may emit a completion event when it has fulfilled its progression requirement.

The town system consumes the event.

Example:

```ts
type MachineCompletedEvent = {
  machineInstanceId: string;
  blueprintId: string;
  plotId: string;
};
```

The exact event interface may be adapted to the existing project architecture.

The town system is responsible for:

- Updating the plot state.
- Triggering the wake effect.
- Activating connected building behaviour.
- Updating progression.
- Saving the resulting state.

The simulation controller must not directly manipulate unrelated town progression data.

## 14. Performance Requirements

- Reuse geometry.
- Avoid unnecessary object allocation per frame.
- Avoid repeated solver execution.
- Avoid unnecessary scene traversal.
- Use shared materials.
- Prefer instancing for repeated parts.
- Limit particle effects.
- Limit active dynamic lights.
- Stop inactive machine animation.
- Pause simulation when appropriate.

## 15. Testing Requirements

Test:

1. Valid Music Box starts and runs.
2. Invalid Music Box cannot run.
3. Jammed machine displays jam feedback.
4. Worn spring consumes energy faster.
5. Machine stops at energy exhaustion.
6. Angular velocity is respected.
7. Animation is frame-rate independent.
8. Pause and resume work correctly.
9. Windmill completion activates the bakery.
10. Town wake event is triggered once per successful placement.
11. No duplicate audio loops are created.
12. Background suspension does not cause simulation jumps.

## 16. Explicit Non-Goals

Do not implement:

- Full rigid-body physics.
- Realistic gear collision simulation.
- Unnecessary physical constraints.
- Complex fluid simulation.
- Realistic wind simulation.
- Unbounded particle effects.
- Networked simulation.
- Multiplayer synchronisation.

The objective is convincing clockwork behaviour, not a general-purpose physics engine.

