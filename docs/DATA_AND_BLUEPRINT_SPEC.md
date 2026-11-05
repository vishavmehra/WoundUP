# Wound Up — Data and Blueprint Specification

**Project:** Wound Up  
**World:** Tockton  
**Status:** Planned  
**Internal completion deadline:** November 18, 2026 (IST)

## 1. Purpose

This document defines the data structures used to describe machines, mechanical parts, sockets, connections, letters, progression, and machine behaviour.

The objective is to keep gameplay definitions separate from rendering and interaction implementation.

Blueprints must be data-driven, serialisable, deterministic, and testable.

Do not store Three.js objects, IWSDK entities, DOM elements, or other runtime objects inside blueprint data.

## 2. Data design principles

1. Use stable identifiers for all machines, parts, sockets, letters, and connections.
2. Keep definitions separate from runtime instances.
3. Store mechanical properties explicitly.
4. Keep visual metadata separate from mechanical rules where possible.
5. Validate all externally supplied data.
6. Avoid duplicating values that can be derived reliably.
7. Keep schemas simple enough to maintain within the project deadline.
8. Do not create a generic data framework for features that do not need one.

## 3. Core data categories

The game requires the following data categories:

- Part definitions.
- Machine blueprints.
- Socket definitions.
- Mechanical connection definitions.
- Machine targets.
- Tray definitions.
- Machine runtime configuration.
- Letter definitions.
- Progression definitions.
- Save data.
- Gift payloads.

## 4. Part definitions

A part definition describes a reusable mechanical or structural component.

Conceptual TypeScript contract:

```ts
type PartFamily =
  | "spur_gear"
  | "bevel_gear"
  | "belt"
  | "pulley"
  | "shaft"
  | "spring"
  | "crank"
  | "cam"
  | "follower"
  | "escapement"
  | "pendulum"
  | "comb"
  | "cylinder"
  | "structural"
  | "figure";

interface PartDefinition {
  id: string;
  name: string;
  family: PartFamily;

  mechanical?: {
    toothCount?: number;
    module?: number;
    radius?: number;
    angularVelocity?: number;
    energyPerUnit?: number;
    drainRate?: number;
  };

  visual: {
    assetId: string;
    finish: string;
    scale: number;
  };

  grab: {
    enabled: boolean;
    colliderRadius: number;
  };
}
```

This is a conceptual starting point. Refine it to match actual machine requirements.

Do not add unused fields to every part.

### 4.1 Stable part IDs

Part identifiers must be stable and unique.

Examples:

```text
gear_spur_12_m1_brass
gear_spur_24_m1_brass
gear_spur_36_m1_brass
gear_bevel_12_brass
spring_standard_brass
spring_worn_brass
shaft_short_walnut
shaft_long_brass
```

The naming convention should be consistent and documented.

Part IDs are referenced by:

- Blueprints.
- Assembly state.
- Save data.
- Gift payloads.
- Tests.

Do not rename a part ID without considering compatibility with saved data and gift payloads.

## 5. Machine blueprint

A machine blueprint describes the complete assembly and expected behaviour of a machine.

Conceptual contract:

```ts
interface MachineBlueprint {
  id: string;
  name: string;
  version: number;

  sockets: SocketDefinition[];

  requiredParts: string[];

  connections: MechanicalConnection[];

  targets: MachineTargets;

  tray: TrayDefinition;

  onRun: MachineRunDefinition;

  wakes: string[];
}
```

The final implementation may use smaller nested types, but the responsibilities must remain clear.

## 6. Socket definitions

Each socket describes a location where a part can be installed.

Conceptual contract:

```ts
interface SocketDefinition {
  id: string;
  family: PartFamily;

  position: [number, number, number];
  rotation: [number, number, number];

  required: boolean;

  acceptedPartIds?: string[];

  dependencies?: string[];
}
```

Requirements:

- Socket IDs must be unique within a blueprint.
- Position and rotation must use a documented coordinate convention.
- Required sockets must be validated before assembly completion.
- Optional sockets must not prevent completion.
- Accepted part restrictions must be explicit where needed.
- Socket compatibility must not be inferred from visual appearance.

Use a consistent local coordinate system for every machine.

## 7. Mechanical connections

Connections describe how parts transmit or constrain mechanical behaviour.

Supported connection types:

- Shaft.
- Gear mesh.
- Belt.
- Pin.
- Trigger.

Conceptual contract:

```ts
type ConnectionType =
  | "shaft"
  | "mesh"
  | "belt"
  | "pin"
  | "trigger";

interface MechanicalConnection {
  id: string;
  type: ConnectionType;

  from: string;
  to: string;

  parameters?: {
    fromTeeth?: number;
    toTeeth?: number;
    fromRadius?: number;
    toRadius?: number;
    module?: number;
    direction?: number;
  };
}
```

The actual solver contract must define which parameters are mandatory for each connection type.

Do not allow ambiguous connections.

For example, a gear mesh must have enough information to determine the ratio and direction.

## 8. Machine targets

Machine targets describe the expected result of a correct mechanical configuration.

Conceptual contract:

```ts
interface MachineTargets {
  angularVelocity?: Record<string, number>;
  followerPose?: Record<string, number>;
  tolerance?: Record<string, number>;
}
```

Target values must be expressed in documented units.

Known targets:

| Machine | Component | Target |
|---|---|---:|
| Music Box | Cylinder | 0.4 rad/s ±10% |
| Carousel | Platform | 0.5 rad/s ±10% |
| Windmill | Millstone | 0.6 rad/s ±15% |

The Clock Tower target values must be defined before implementation if that feature remains in scope.

Do not invent target values for optional machines.

## 9. Tray definitions

A tray describes the parts available to the player for a particular assembly.

It may include:

- Part IDs.
- Quantities.
- Tray positions.
- Decoy parts.
- Display ordering.

The tray must not determine whether an installed part is mechanically correct.

The blueprint and solver determine mechanical correctness.

### 9.1 Decoy policy

- Letter 1: no decoy parts.
- Letters 3, 4, and 6: correct parts plus two decoys.
- Decoys must be understandable and visually distinguishable.
- Decoy parts must not make the first Music Box experience unnecessarily difficult.

## 10. Machine runtime definitions

Machine runtime definitions describe how a correct machine is presented when operating.

Examples:

Music Box:

- Cylinder rotation.
- Governor rotation.
- Fixed melody playback.

Carousel:

- Platform rotation.
- Horse rise and fall.
- Canopy light animation.
- Music Box melody playback.

Windmill:

- Sail rotation.
- Millstone movement.
- Flour puffs.
- Bakery response.

Runtime definitions should refer to stable component IDs.

Avoid embedding arbitrary rendering callbacks in JSON blueprint files.

Use typed runtime handlers that map known identifiers to presentation behaviour.

## 11. Letter definitions

Letters should be represented as data.

Conceptual contract:

```ts
interface LetterDefinition {
  id: string;
  sender: string;
  message: string;

  objective: {
    type: string;
    targetId: string;
  };

  unlockConditions: string[];
  completionConditions: string[];
}
```

The exact objective types must be explicitly defined.

Do not use arbitrary strings throughout the game without validation.

The letter text must remain consistent with `GAMEPLAY_SYSTEMS.md`.

## 12. Progression data

Progression should be controlled by explicit conditions.

Examples:

- Letter 1 becomes available after opening the trunk.
- Letter 2 becomes available after the first Music Box is placed.
- Letter 3 becomes available after the Music Box repair is completed, according to the approved progression design.
- Later letters unlock through completion of their associated objectives.

Do not create a second independent progression system inside the UI.

The progression system is the authority.

## 13. Blueprint validation

Every blueprint must pass validation before being used.

Validation should check:

- Unique machine ID.
- Unique socket IDs.
- Valid part IDs.
- Valid part families.
- Valid connection endpoints.
- Valid connection parameters.
- Required socket definitions.
- Required target definitions.
- Valid tray entries.
- Valid runtime references.
- Valid wake-up plot IDs.

Invalid blueprints must fail early with useful development diagnostics.

Do not silently ignore invalid references.

## 14. Data and rendering separation

Data describes what a machine is.

Rendering describes how the machine looks.

Gameplay systems describe what happens when the player interacts with it.

These responsibilities must remain separate.

A blueprint must not directly construct a Three.js mesh.

A renderer must not independently invent mechanical rules.

An interaction system must not modify blueprint definitions.

## 15. Gift payload compatibility

Gift payloads must reference stable blueprint and part identifiers.

A gift must include enough information to reconstruct one completed machine.

The gift viewer must validate:

- Payload version.
- Blueprint ID.
- Part IDs.
- Assembly configuration.
- Solver result.
- Supported engraving.

Never trust URL data.

Unknown IDs or invalid mechanical configurations must produce an error state.

## 16. Data versioning

Use explicit versions for persisted and externally shared data.

At minimum:

- Save data version.
- Gift payload version.
- Blueprint version where compatibility requires it.

Do not silently reinterpret older data using incompatible new rules.

For this competition build, backward compatibility should remain simple. Avoid building a complex migration framework unless an actual version change requires it.

## 17. Acceptance criteria

- [ ] All machine blueprints use stable IDs.
- [ ] All sockets use stable IDs.
- [ ] Part definitions are independent of runtime meshes.
- [ ] Connections are explicitly defined.
- [ ] Mechanical targets use documented units.
- [ ] Tray contents are defined in data.
- [ ] Letters are data-driven.
- [ ] Progression is explicit.
- [ ] Blueprint validation catches invalid references.
- [ ] Gift payloads use stable identifiers.
- [ ] Save and gift data are versioned.
- [ ] No runtime scene objects are stored in blueprint JSON.

## 18. Final principle

Blueprints are the source of truth for machine construction.

The solver is the source of truth for mechanical behaviour.

The renderer is responsible for presenting the result.

Keeping these responsibilities separate is essential for correctness, testing, and parallel development.
