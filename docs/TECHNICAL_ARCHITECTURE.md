# Wound Up — Technical Architecture

**Project:** Wound Up  
**World:** Tockton  
**Architecture status:** Planned  
**Primary platform:** Meta Quest 3 / Quest 3S  
**Framework:** IWSDK 1.x  
**Language:** TypeScript  
**Internal completion deadline:** November 18, 2026 (IST)

---

## 1. Architecture goals

The architecture must support a polished, performant, maintainable WebXR game without introducing unnecessary infrastructure.

The system should be:

- Modular.
- Testable.
- Deterministic where gameplay logic requires it.
- Optimised for standalone Quest hardware.
- Compatible with hands-first interaction.
- Easy to debug through desktop development tools.
- Suitable for parallel development by multiple agents.
- Deployable as a static HTTPS application.

The architecture should prioritise a complete gameplay experience over abstract extensibility.

Do not build a generic game engine or an elaborate framework around this project.

## 2. Technology stack

### 2.1 Core stack

| Area | Technology |
|---|---|
| Language | TypeScript |
| Runtime | Node.js >=20.19 |
| WebXR framework | IWSDK 1.x |
| 3D rendering | Three.js through IWSDK |
| Build tooling | IWSDK-supported build tooling |
| Unit testing | Vitest |
| Browser testing | Playwright |
| Deployment | Vercel (static) |
| Persistence | localStorage |
| Audio | Web Audio API |
| Hero asset creation | Blender |
| 3D interchange | glTF / GLB |

The exact versions must be recorded in the package manifest and lockfile.

Do not upgrade major framework versions casually during development.

### 2.2 Framework rules

IWSDK is the primary WebXR framework.

Before implementing any interaction or scene lifecycle functionality:

1. Inspect the installed IWSDK version.
2. Read the documentation corresponding to that version.
3. Inspect available examples and starter projects.
4. Verify the exact API and expected lifecycle.
5. Implement a minimal working example.
6. Test it in the emulator.
7. Only then integrate it into the game.

Never invent IWSDK method names, component names, event names, or configuration properties.

Do not assume that a feature from another WebXR framework exists in IWSDK.

Use the framework's built-in capabilities where appropriate, especially for:

- XR session lifecycle.
- Hand tracking.
- Input sources.
- Grab interactions.
- Poke interactions.
- Ray interactions.
- Gaze interactions.
- Reference spaces.
- Scene lifecycle.

Custom code should be limited to gameplay-specific behaviour that the framework does not already provide.

## 3. High-level architecture

The game is divided into six main layers.

### Layer 1: Application and platform

Responsibilities:

- Application startup.
- Device capability detection.
- Immersive session entry.
- Desktop fallback.
- Application lifecycle.
- Asset loading.
- Global scene setup.

### Layer 2: World and presentation

Responsibilities:

- Tockton town.
- Trunk and workbench.
- Buildings and plots.
- Machine presentation.
- Materials and lighting.
- Animations.
- Visual effects.
- Scene transitions.

### Layer 3: Interaction

Responsibilities:

- Hand tracking integration.
- Pinch interaction.
- Grab and release.
- Socket targeting.
- Winding input.
- X-ray activation.
- UI interaction.
- Gaze-and-pinch accessibility mode.

### Layer 4: Gameplay systems

Responsibilities:

- Game state.
- Letters and progression.
- Machine assembly.
- Blueprint validation.
- Mechanical solver.
- Machine operation.
- Machine placement.
- Repairs.
- Gift creation and viewing.

### Layer 5: Data and persistence

Responsibilities:

- Blueprint definitions.
- Part metadata.
- Letter definitions.
- Save data.
- Gift payloads.
- Settings.
- Version validation.

### Layer 6: Quality and deployment

Responsibilities:

- Unit tests.
- Integration tests.
- Browser tests.
- Performance checks.
- Build validation.
- Vercel deployment.

## 4. Recommended project structure

Use a clear structure similar to the following. Adapt it to the actual IWSDK starter project rather than forcing a folder structure that conflicts with the framework.

```text
wound-up/
├── public/
│   ├── assets/
│   │   ├── models/
│   │   │   ├── environment/
│   │   │   ├── buildings/
│   │   │   ├── machines/
│   │   │   ├── characters/
│   │   │   └── props/
│   │   ├── textures/
│   │   ├── audio/
│   │   └── fonts/
│   └── favicon/
│
├── blender/
│   ├── source/
│   ├── exports/
│   ├── materials/
│   └── references/
│
├── src/
│   ├── app/
│   │   ├── bootstrap/
│   │   ├── platform/
│   │   └── lifecycle/
│   │
│   ├── core/
│   │   ├── events/
│   │   ├── state/
│   │   ├── types/
│   │   └── constants/
│   │
│   ├── world/
│   │   ├── town/
│   │   ├── trunk/
│   │   ├── workbench/
│   │   ├── plots/
│   │   └── presentation/
│   │
│   ├── interaction/
│   │   ├── hands/
│   │   ├── grabbing/
│   │   ├── snapping/
│   │   ├── winding/
│   │   ├── xray/
│   │   ├── gaze/
│   │   └── ui/
│   │
│   ├── gameplay/
│   │   ├── progression/
│   │   ├── letters/
│   │   ├── assembly/
│   │   ├── blueprints/
│   │   ├── solver/
│   │   ├── machines/
│   │   ├── repairs/
│   │   ├── placement/
│   │   └── gifting/
│   │
│   ├── data/
│   │   ├── blueprints/
│   │   ├── parts/
│   │   ├── letters/
│   │   └── save/
│   │
│   ├── audio/
│   ├── ui/
│   └── styles/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

The structure is a logical target, not permission to create empty folders without a real need.

## 5. Application lifecycle

The application should follow a controlled lifecycle.

Conceptual sequence:

1. Load application configuration.
2. Initialise the IWSDK application using verified APIs.
3. Load essential assets.
4. Create the initial scene.
5. Detect available presentation modes.
6. Display the landing experience.
7. Wait for the user's Enter action.
8. Request the appropriate immersive session when supported.
9. Initialise the world.
10. Start the game state machine.
11. Handle pause, resume, and session exit.
12. Clean up resources when the application is disposed.

The actual implementation must follow the installed IWSDK lifecycle.

Do not build a parallel session-management system if IWSDK already manages the relevant lifecycle.

## 6. Platform entry and fallback

The application should support three presentation paths.

### 6.1 Immersive AR

Preferred when supported and appropriate.

Use the verified IWSDK/WebXR path for immersive AR.

The physical table should act as the intended spatial reference when the necessary capabilities are available.

### 6.2 Immersive VR

Use as a fallback immersive presentation mode.

The game should present the miniature world on a floating velvet stand when physical table placement is unavailable.

The floating stand should preserve the same gameplay layout and interaction distances.

### 6.3 Desktop preview

When immersive WebXR is unavailable, provide a desktop 3D preview.

The desktop preview must allow meaningful verification of:

- Scene loading.
- Machine assembly.
- Socket snapping.
- Machine operation.
- Town placement.
- UI behaviour.
- Gifting.
- Save and load.

Desktop input can use mouse and keyboard as a development fallback.

Do not let desktop-specific input assumptions leak into the gameplay systems.

## 7. Game state architecture

Use an explicit state model.

The main gameplay modes are:

- Town.
- Build.
- Wind.
- Place.
- Gift.
- Pause.

The game state should be centrally represented and changed through controlled transitions.

Conceptual type:

```ts
type GameMode =
  | "town"
  | "build"
  | "wind"
  | "place"
  | "gift"
  | "pause";
```

This is a conceptual contract. The implementation may use a different representation if it provides equivalent clarity.

State transitions should be explicit.

Examples:

- Town → Build when the player accepts a build letter.
- Build → Wind when all required parts are correctly placed.
- Wind → Place when the machine successfully runs.
- Place → Town after successful placement.
- Any active mode → Pause when the player pauses.

The game state must not be inferred from arbitrary visual object visibility.

## 8. Event and system communication

Keep gameplay systems loosely coupled.

Use explicit function calls or a small typed event mechanism where asynchronous communication is genuinely useful.

Avoid a large generic event bus.

Important events may include:

- LetterAccepted.
- PartGrabbed.
- PartPlaced.
- PartRemoved.
- AssemblyCompleted.
- MachineSolved.
- MachineStarted.
- MachineStopped.
- MachinePlaced.
- PlotAwakened.
- GiftCreated.
- SaveUpdated.

Events must have typed payloads.

Do not use stringly typed event payloads or global mutable objects.

## 9. Blueprint architecture

Blueprints are data-driven definitions of machine assemblies.

A blueprint should describe:

- Machine identity.
- Required parts.
- Socket identifiers.
- Socket positions and orientations.
- Part families.
- Required and optional status.
- Valid connection definitions.
- Mechanical parameters.
- Tray contents.
- Expected targets.
- On-run behaviour.
- Town wake-up behaviour.

Blueprint data must be separated from rendering code.

A conceptual structure:

```ts
interface MachineBlueprint {
  id: string;
  name: string;
  sockets: SocketDefinition[];
  requiredParts: string[];
  connections: MechanicalConnection[];
  targets: MachineTargets;
  tray: TrayDefinition;
  onRun: MachineRunDefinition;
  wakes: string[];
}
```

The actual interfaces should be refined when the complete data schema is created.

Do not store arbitrary Three.js objects inside blueprint JSON.

Blueprints should be serialisable and independently testable.

## 10. Mechanical solver architecture

The mechanical solver is a pure TypeScript subsystem.

It must not depend on:

- Three.js.
- IWSDK.
- Browser APIs.
- DOM objects.
- WebXR objects.
- Rendering state.
- Frame timing.

Its job is to determine whether an assembled mechanism is mechanically valid and calculate its expected behaviour.

### 10.1 Inputs

The solver receives:

- Blueprint definition.
- Assembled part configuration.
- Part parameters.
- Mechanical connections.
- Power source.
- Winding energy.

### 10.2 Outputs

The solver returns a structured result.

Conceptual contract:

```ts
type SolveStatus =
  | "runs"
  | "runs_wrong"
  | "jams"
  | "incomplete";

interface SolveResult {
  status: SolveStatus;
  angularVelocity: Record<string, number>;
  followerPose: Record<string, number>;
  runSeconds: number;
  jamAt?: string;
  wrongTargets?: string[];
}
```

### 10.3 Mechanical rules

- Shaft connections propagate angular velocity.
- Meshed gears rotate in opposite directions.
- Gear ratios depend on tooth counts.
- Belt ratios depend on pulley radii.
- Pin followers use defined profile data.
- Inconsistent velocity reaching a node indicates a jam.
- Missing required sockets indicate incomplete assembly.
- Meshed gears with incompatible modules indicate a jam.
- Spring energy determines available operating time.

### 10.4 Determinism

The solver must produce the same result for the same input.

Avoid random values and frame-dependent calculations.

Use deterministic tests for all supported mechanical cases.

### 10.5 Renderer separation

The renderer must consume `SolveResult`.

The renderer must not independently decide whether the machine is mechanically valid.

The solver determines the mechanical result. The renderer presents it.

## 11. Machine runtime architecture

Machine animation should be driven by solver output.

Examples:

- Music Box: cylinder rotation, governor movement, spring runtime.
- Carousel: platform rotation, horse movement, canopy lights.
- Windmill: sail rotation, millstone movement, flour puffs, bakery activity.
- Clock Tower: pendulum, clock hands, bell, theatre doors.

Do not simulate every gear using a full rigid-body physics engine.

These mechanisms are deterministic animated systems. Use calculated angular velocity, ratios, and predefined motion profiles.

This is simpler, more predictable, and more suitable for standalone performance.

## 12. Interaction architecture

Separate input detection from gameplay decisions.

### 12.1 Input layer

Responsibilities:

- Read hand tracking and input state through verified IWSDK APIs.
- Identify pinch and release.
- Identify relevant hand poses.
- Provide interaction rays or target information.
- Support desktop development input.

### 12.2 Interaction layer

Responsibilities:

- Determine which object is targeted.
- Validate whether an object can be grabbed.
- Manage held objects.
- Find candidate sockets.
- Validate placement.
- Provide visual feedback.
- Trigger gameplay commands.

### 12.3 Gameplay layer

Responsibilities:

- Update assembly state.
- Validate machine completion.
- Trigger solver execution.
- Start machine operation.
- Update progression.

Input systems must not directly modify arbitrary machine state.

Use a clear boundary between input, interaction, and gameplay.

## 13. Snapping architecture

Snapping is a gameplay-specific system.

Responsibilities:

1. Detect a candidate socket.
2. Check distance.
3. Check part compatibility.
4. Check socket availability.
5. Show a valid or invalid preview.
6. Commit placement on release.
7. Animate the part into position.
8. Update assembly state.
9. Trigger the next gameplay state if appropriate.

Target snap radii:

- Standard: 4 cm.
- Easy Snap: 7 cm.

The visual preview and actual placement validation must use the same rules.

Do not allow a visual valid state to disagree with the actual placement result.

## 14. Winding architecture

Winding is a distinct interaction system.

Default mode:

- Pinch the winding key.
- Rotate the wrist.
- Each 90-degree rotation adds one wind unit.
- Maximum: 8 units.
- Release to finish winding.

Gaze-and-pinch mode:

- Each pinch adds one wind unit.
- A visible counter communicates remaining capacity.
- A Run control starts the machine.

Winding should update the machine's energy input, not directly animate the mechanism.

The solver determines the machine's runtime from its available energy and drain rate.

## 15. X-ray architecture

X-ray is a presentation mode for understanding internal mechanisms.

Activation:

- Open palm facing down.
- Move approximately 5–20 cm over the machine.
- Hold for approximately 0.4 seconds.
- Provide a lens icon alternative.

Presentation:

- Casing becomes approximately 15% opaque.
- Internal moving parts remain opaque.
- Internal components receive a restrained warm glow.
- Use a cool rim or outline for the casing.

X-ray must not change mechanical state.

## 16. Persistence architecture

Use localStorage for local game progress.

Storage key:

```text
woundup.save
```

Save format:

```ts
interface SaveV1 {
  version: 1;
  townPlaced: string[];
  letterStatuses: Record<string, string>;
  machinesBuilt: string[];
  machinePlacements: Record<string, string>;
  dailyDone: string | null;
  settings: {
    easySnap: boolean;
    gazeMode: boolean;
    xrayHint: boolean;
    night: boolean;
  };
}
```

The implementation must validate loaded data.

Requirements:

- Catch storage access errors.
- Handle malformed JSON.
- Handle unsupported save versions.
- Use a memory fallback if localStorage is unavailable.
- Save after letter-state changes.
- Save after successful machine placement.
- Avoid writing on every animation frame.
- Require a second confirmation before restarting and deleting progress.

No cloud save or account system is in scope.

## 17. Gift URL architecture

Gifting is a self-contained feature.

The gift payload represents one completed machine.

Conceptual pipeline:

1. Build a compact serialisable payload.
2. Validate blueprint and part identifiers.
3. Encode JSON.
4. Compress with `CompressionStream('deflate-raw')`.
5. Encode as base64url.
6. Attach it as a URL hash parameter:

```text
#g=<data>
```

Target URL length: below 1500 characters.

The viewer must:

- Parse the hash.
- Decode the payload.
- Validate its structure.
- Validate blueprint and part identifiers.
- Re-run the mechanical solver.
- Reject invalid or unsupported payloads.
- Display a clear error state if validation fails.

Sharing fallback:

1. Try `navigator.share`.
2. If unavailable, use clipboard.
3. If clipboard fails, show a selectable URL.

The gift viewer must not modify the recipient's save data.

## 18. Audio architecture

Use Web Audio API for game audio.

Audio should be organised by purpose:

- Interface feedback.
- Part interaction.
- Snap and release.
- Winding.
- Mechanical operation.
- Machine-specific audio.
- Town ambience.
- Wake-up effects.

Audio must be activated in a browser-compliant manner following user interaction.

Avoid creating multiple unnecessary AudioContexts.

Use a small, controlled audio system with volume management.

The Music Box melody should be a fixed authored melody. Melody editing and composition are out of scope.

## 19. Blender asset pipeline

Blender is the primary tool for high-quality hero assets.

Hero assets include:

- Trunk.
- Buildings.
- Bakery.
- Windmill.
- Music Box casing.
- Carousel.
- Clock Tower.
- Theatre facade.
- Gift box.
- Figures and major props.

Mechanical components that repeat frequently may be generated procedurally in TypeScript where appropriate.

### 19.1 Source and export conventions

Keep editable Blender source files separate from runtime exports.

Suggested paths:

```text
blender/source/
blender/exports/
public/assets/models/
```

Use descriptive asset names:

```text
trunk_main.blend
town_bakery.blend
town_windmill.blend
machine_music_box.blend
machine_carousel.blend
machine_clock_tower.blend
```

Runtime exports should use GLB/glTF.

### 19.2 Asset requirements

Every exported asset should have:

- Correct scale.
- Correct origin and pivot.
- Appropriate topology.
- Optimised polygon count.
- UVs where needed.
- Consistent materials.
- Correct texture references.
- Clear naming.
- Tested export settings.

Do not export unnecessarily complex Blender scenes.

Do not use low-quality primitive assemblies as final hero assets.

### 19.3 Runtime optimisation

- Reuse geometry.
- Reuse materials.
- Instance repeated components.
- Avoid excessive transparent surfaces.
- Avoid unnecessary texture resolution.
- Use appropriate mesh complexity.
- Keep animated components separate from static components.
- Ensure pivots support intended mechanical movement.

## 20. Performance architecture

Quest performance is a design constraint, not a final optimisation task.

Rules:

- Cache generated geometry.
- Reuse materials.
- Instance repeated components.
- Merge static geometry when beneficial.
- Avoid unnecessary lights.
- Avoid expensive real-time shadows.
- Use blob decals for contact shadows where appropriate.
- Avoid unnecessary transparent materials.
- Avoid per-frame allocations.
- Avoid unnecessary scene graph traversal.
- Keep solver execution outside per-frame rendering loops.
- Use deterministic animation values.
- Dispose of unused resources correctly.

Target:

- Aim for 72 FPS.
- Do not allow normal gameplay to fall below 60 FPS.

Measure actual performance rather than assuming it.

## 21. Testing architecture

### 21.1 Unit tests

Use Vitest for pure logic.

Priorities:

- Mechanical solver.
- Gear ratios.
- Belt ratios.
- Inconsistent loops.
- Missing required sockets.
- Gear module mismatch.
- Spring energy and runtime.
- Blueprint validation.
- Gift payload validation.
- Save-data validation.
- Progression transitions.

### 21.2 Integration tests

Verify interactions between:

- Assembly and solver.
- Solver and machine runtime.
- Machine runtime and town wake-up.
- Placement and progression.
- Gift generation and gift viewing.
- Save and load.

### 21.3 Browser tests

Use Playwright where appropriate for:

- Landing page.
- Desktop fallback.
- Application navigation.
- UI interactions.
- Gift viewer.
- URL parsing.
- Save and load.
- Production deployment smoke tests.

Do not pretend that Playwright desktop tests validate real Quest hand tracking.

### 21.4 Emulator testing

Use the IWSDK desktop emulator and supported browser development tools.

Test:

- Scene lifecycle.
- Hand interaction flows where emulation supports them.
- Assembly.
- Snapping.
- Machine operation.
- Placement.
- UI.
- Error handling.

The emulator is the development baseline because the developer does not have a Quest headset.

### 21.5 Hardware testing

Arrange a Quest 3 or Quest 3S tester for final validation.

Hardware testing should cover:

- WebXR session entry.
- Hand tracking.
- Seated comfort.
- Interaction reach.
- Machine assembly.
- Performance.
- Audio.
- Session exit and resume.

Clearly record any hardware tests that could not be completed.

## 22. Deployment architecture

Use Vercel as the static hosting target (owner decision, 2026-11-05). Vercel serves the Vite build output (`dist/`) from the domain root, with no serverless functions or other backend services.

The deployment must:

- Use HTTPS.
- Work from the domain root and from any sub-path, using the build's base-path configuration.
- Resolve all static assets correctly.
- Avoid runtime dependencies on local files.
- Provide a clean public entry URL.
- Be tested after deployment.

Use the actual build tool's supported base-path configuration.

Do not assume root-relative asset paths will work on a sub-path.

## 23. Architecture boundaries

The following are explicitly out of scope:

- Backend services.
- User accounts.
- Cloud save.
- Multiplayer.
- Leaderboards.
- Analytics.
- Telemetry.
- AI or LLM calls.
- External databases.
- Payment systems.
- Native APK development.
- Unity or Unreal.
- Passthrough camera processing.

Do not introduce these systems without an explicit change to the product scope.

## 24. Parallel development boundaries

Parallel agents must have clear file ownership.

Suggested ownership:

- Agent A: IWSDK bootstrap and platform lifecycle.
- Agent B: Blender assets and asset pipeline.
- Agent C: Mechanical solver and unit tests.
- Agent D: Assembly and snapping.
- Agent E: Town, buildings, and machine presentation.
- Agent F: Letters, progression, and persistence.
- Agent G: Testing, integration, and deployment.

The lead agent owns:

- Architecture decisions.
- Shared interfaces.
- Integration.
- Conflict resolution.
- Final quality gate.

Agents must not independently redefine shared types or change architecture contracts.

## 25. Final architecture principles

1. IWSDK APIs must be verified before use.
2. Mechanical logic must remain independent of rendering.
3. Blueprint data must remain separate from scene objects.
4. Input must remain separate from gameplay decisions.
5. Rendering must reflect gameplay state, not invent it.
6. Save data must be validated.
7. Gift payloads must be validated.
8. Blender hero assets must meet the quality bar.
9. Quest performance must be considered throughout development.
10. The architecture must remain as simple as the product allows.
