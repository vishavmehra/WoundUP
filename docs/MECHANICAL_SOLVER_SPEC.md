# Wound Up — Mechanical Solver Specification

**Project:** Wound Up  
**Subsystem:** Deterministic mechanical solver  
**Status:** Planned  
**Internal completion deadline:** November 18, 2026 (IST)

## 1. Purpose

The mechanical solver determines whether an assembled machine can operate and calculates its expected mechanical behaviour.

It is one of the most important technical systems in Wound Up.

A machine must not be considered correct merely because all visible parts have been placed.

The solver must understand the mechanical relationships between parts.

It must identify:

- Incomplete assemblies.
- Correct mechanical configurations.
- Incorrect operating speeds.
- Inconsistent mechanical loops.
- Gear module mismatches.
- Available operating time.

The solver must be deterministic and independent of rendering.

## 2. Core principles

1. Implement the solver in pure TypeScript.
2. Do not import Three.js.
3. Do not import IWSDK.
4. Do not depend on DOM or browser APIs.
5. Do not use frame timing.
6. Do not use random values.
7. Use explicit units.
8. Make every supported mechanical rule testable.
9. Return structured results.
10. Keep the renderer separate from mechanical calculations.

## 3. Solver responsibilities

Input:

- Machine blueprint.
- Installed parts.
- Mechanical connections.
- Part parameters.
- Power source.
- Winding energy.

Output:

- Assembly status.
- Mechanical status.
- Calculated angular velocities.
- Follower poses.
- Runtime.
- Jam information.
- Incorrect target information.

The solver does not:

- Create meshes.
- Animate gears.
- Play audio.
- Move objects.
- Handle hand tracking.
- Decide visual effects.
- Manage game progression.

## 4. Status model

The solver must support four outcomes:

```ts
type SolveStatus =
  | "runs"
  | "runs_wrong"
  | "jams"
  | "incomplete";
```

### 4.1 `incomplete`

At least one required socket is missing a valid installed part.

The machine cannot start.

### 4.2 `runs`

The mechanical configuration is valid and all required targets are within tolerance.

### 4.3 `runs_wrong`

The mechanism is mechanically connected and can operate, but one or more target values are incorrect.

Example: a wrong gear tooth count produces an incorrect millstone speed.

### 4.4 `jams`

The mechanism contains a mechanical contradiction that prevents operation.

Examples:

- An inconsistent velocity loop.
- An incompatible gear module.
- An invalid mechanical connection.

## 5. Conceptual input contract

```ts
interface SolverInput {
  blueprint: MachineBlueprint;
  installedParts: InstalledPart[];
  connections: MechanicalConnection[];
  power: PowerInput;
}

interface InstalledPart {
  socketId: string;
  partId: string;
  parameters: Record<string, number>;
}

interface PowerInput {
  source: "mainspring" | "ambient_wind";
  windUnits: number;
}
```

Refine the exact interfaces during implementation.

Avoid passing rendering objects or interaction state into the solver.

## 6. Conceptual output contract

```ts
interface SolveResult {
  status: SolveStatus;

  angularVelocity: Record<string, number>;

  followerPose: Record<string, number>;

  runSeconds: number;

  jamAt?: string;

  wrongTargets?: string[];
}
```

The result must be serialisable and deterministic.

If additional diagnostics are needed, add typed fields rather than unstructured error strings.

## 7. Graph model

Represent the mechanical system as a graph.

- Nodes represent mechanical components or relevant rotational states.
- Edges represent mechanical relationships.
- Power sources provide initial operating values.
- Propagation calculates the resulting state of connected components.

Supported edge types:

- Shaft.
- Gear mesh.
- Belt.
- Pin.
- Trigger.

The graph must be built from validated blueprint and assembly data.

## 8. Propagation rules

### 8.1 Shaft

A shaft transmits angular velocity.

For a direct shaft connection:

\[
\omega_b = \omega_a
\]

Use the defined direction convention consistently.

### 8.2 Meshed gears

Meshed gears rotate in opposite directions.

For two external gears:

\[
\omega_b = -\omega_a \frac{N_a}{N_b}
\]

Where:

- \(N_a\) is the tooth count of the driving gear.
- \(N_b\) is the tooth count of the driven gear.
- \(\omega_a\) is the driving angular velocity.
- \(\omega_b\) is the resulting angular velocity.

The implementation must also validate gear module compatibility.

A mesh with incompatible modules must produce a jam.

### 8.3 Belt

For a belt connection:

\[
\omega_b = \omega_a \frac{r_a}{r_b}
\]

Where:

- \(r_a\) is the driving pulley radius.
- \(r_b\) is the driven pulley radius.

Direction must follow the belt configuration defined by the connection.

Do not infer crossed or uncrossed belt behaviour from rendering geometry.

### 8.4 Pin follower

A pin connection drives a follower using predefined profile data.

The solver should return the follower pose or position parameter required by the machine runtime.

Do not implement arbitrary physical collision simulation for cam and follower motion.

### 8.5 Trigger

A trigger connection represents an activation relationship.

It should communicate activation state without introducing a continuous mechanical ratio unless explicitly defined by the machine blueprint.

## 9. Traversal algorithm

Use graph traversal to propagate mechanical state.

A breadth-first traversal is suitable for the initial solver.

Conceptual process:

1. Validate required sockets.
2. Validate installed part references.
3. Build the mechanical graph.
4. Validate connection parameters.
5. Initialise power-source nodes.
6. Traverse connected nodes.
7. Calculate outgoing angular velocities.
8. Record calculated node values.
9. Detect contradictory values.
10. Validate mechanical targets.
11. Calculate runtime.
12. Return a structured result.

Avoid repeatedly traversing the same graph without reason.

## 10. Inconsistent loop detection

A mechanical node may be reached through more than one path.

If the calculated angular velocity differs by more than 1% between paths, the mechanism must be considered inconsistent.

Conceptually:

\[
\frac{|\omega_1-\omega_2|}
{\max(|\omega_1|,|\omega_2|,\epsilon)}
> 0.01
\]

If this condition is met:

- Set status to `jams`.
- Record the relevant node or connection in `jamAt`.
- Stop treating the mechanism as a valid running machine.

Use a documented epsilon to handle values near zero.

Do not allow floating-point noise to create false jams.

## 11. Missing parts

Before graph propagation, validate all required sockets.

If any required socket is empty:

- Return `incomplete`.
- Do not calculate a valid operating result.
- Provide enough diagnostic information for the gameplay layer to identify the missing requirement.

The solver must not treat an absent part as a zero-speed component.

## 12. Spring energy and runtime

For a mainspring:

\[
E = W \times E_u
\]

Where:

- \(W\) is the number of wind units.
- \(E_u\) is energy per wind unit.

Runtime:

\[
T = \frac{E}{D}
\]

Where:

- \(E\) is available energy.
- \(D\) is the machine's drain rate.

The solver must validate input ranges.

Wind units must not exceed the gameplay maximum of eight.

### 12.1 Worn spring

The worn Music Box spring provides approximately 15% of normal energy per unit.

Under the intended eight-unit test configuration, the machine should run for approximately 1.5 seconds.

The exact energy and drain-rate constants must be selected so this behaviour is deterministic and testable.

Do not hardcode a visible 1.5-second timer independently of the energy calculation.

### 12.2 Ambient wind

The Windmill uses ambient wind as its power source.

The initial implementation should model this through deterministic blueprint-defined input rather than introducing a complex environmental simulation.

## 13. Target validation

After propagation, compare calculated values with blueprint targets.

For each target:

1. Retrieve the calculated value.
2. Retrieve the expected value.
3. Retrieve the tolerance.
4. Compare the result.
5. Record any incorrect target.

A mechanically connected machine with incorrect target values should return `runs_wrong`, not `jams`.

A jam takes precedence over incorrect target status.

An incomplete assembly takes precedence over normal propagation.

## 14. Priority of solver outcomes

Use this evaluation order:

1. Invalid input or invalid blueprint: return a validation failure through the chosen error contract.
2. Missing required parts: `incomplete`.
3. Mechanical contradiction: `jams`.
4. Incorrect target values: `runs_wrong`.
5. All targets valid: `runs`.

Do not allow an incomplete machine to be reported as running.

Do not allow a jammed machine to be reported as merely running incorrectly.

## 15. Machine-specific validation

### 15.1 Music Box

Expected:

- Cylinder speed: 0.4 rad/s.
- Tolerance: ±10%.
- Correct spring produces intended runtime.
- Worn spring produces approximately 1.5 seconds of runtime.

### 15.2 Carousel

Expected:

- Platform speed: 0.5 rad/s.
- Tolerance: ±10%.
- Correct assembly produces intended rotation.

### 15.3 Windmill

Expected:

- Millstone speed: 0.6 rad/s.
- Tolerance: ±15%.
- Incorrect 12-tooth gear in the designated 24-tooth position produces approximately twice the intended speed.

### 15.4 Clock Tower

If retained, define its mechanical targets before implementation.

Do not invent solver targets for this optional feature.

## 16. Diagnostics

The solver should return useful structured diagnostics.

Examples:

- Missing socket identifier.
- Invalid part identifier.
- Invalid connection endpoint.
- Gear module mismatch.
- Velocity contradiction.
- Incorrect target.

Diagnostics are for development and gameplay feedback.

The player should receive understandable visual and audio feedback rather than raw internal messages.

## 17. Testing requirements

Create unit tests for:

1. Direct shaft propagation.
2. 10-tooth to 20-tooth gear ratio.
3. Opposite gear rotation direction.
4. Belt ratio.
5. Pin follower profile.
6. Trigger activation.
7. Inconsistent loop detection.
8. Missing required socket.
9. Gear module mismatch.
10. Worn spring runtime below two seconds.
11. Correct Music Box targets.
12. Correct Carousel targets.
13. Correct Windmill targets.
14. Wrong Windmill gear speed.
15. Deterministic repeated results.
16. Invalid connection references.
17. Invalid numerical input.

All tests must run without browser or WebXR dependencies.

## 18. Performance

The solver should operate on small machine graphs.

Do not optimise prematurely for large arbitrary networks.

Requirements:

- No rendering dependencies.
- No per-frame graph rebuilding.
- No unnecessary allocations during repeated evaluation.
- Recompute only when assembly or relevant input changes.
- Use deterministic calculations.

## 19. Acceptance criteria

- [ ] Solver is pure TypeScript.
- [ ] Solver has no Three.js or IWSDK imports.
- [ ] Inputs are validated.
- [ ] Missing parts are detected.
- [ ] Shaft propagation works.
- [ ] Gear ratios work.
- [ ] Belt ratios work.
- [ ] Pin follower output works.
- [ ] Trigger connections work.
- [ ] Loop contradictions are detected.
- [ ] Module mismatch is detected.
- [ ] Spring runtime is calculated.
- [ ] Target tolerances are respected.
- [ ] All machine targets are testable.
- [ ] Unit tests pass.
- [ ] Results are deterministic.

## 20. Final principle

The solver is the mechanical authority of Wound Up.

The visual machine may look beautiful, but it must not be allowed to claim that a mechanism works when the solver says it does not.
