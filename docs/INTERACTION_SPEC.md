# Wound Up — Interaction Specification

**Project:** Wound Up  
**Primary interaction:** Hands-first  
**Play style:** Seated  
**Status:** Planned  
**Internal completion deadline:** November 18, 2026 (IST)

## 1. Purpose

This document defines how players interact with Wound Up.

The interaction system must make miniature mechanical construction feel natural, precise, comfortable, and satisfying.

The player should feel as if they are working with physical objects on the real table in front of them.

Hands are the primary input method.

Controllers are optional.

## 2. Interaction principles

1. Prefer simple gestures.
2. Keep interactions within comfortable reach.
3. Make selectable objects visually understandable.
4. Provide immediate feedback.
5. Avoid requiring precise finger movements for tiny components.
6. Use stable grab and release behaviour.
7. Avoid accidental interactions.
8. Support seated play.
9. Keep gameplay input separate from rendering.
10. Use verified IWSDK capabilities wherever possible.

Do not create a custom hand-tracking framework if IWSDK already provides the necessary functionality.

## 3. Spatial interaction limits

The game is designed around a miniature world.

Target dimensions:

- Town footprint: approximately 60 × 40 cm.
- Workbench: approximately 45 × 25 cm.
- Primary interaction distance: within approximately 60 cm of the player's chest.
- Main interaction direction: within approximately 35 degrees of head-forward, measured as below.

The player must not need to stand or move around the environment.

No forced locomotion or camera movement is allowed.

**How the 35 degrees is measured.** The limit is checked with two angles:

- **Placement angle:** the line from the eyes to the town's centre, measured below a level head-forward (the way the player faces, head pitch ignored). The stand is placed with it.
- **Target angle:** each essential target (the latch, letters, plots, workbench, parts tray and essential UI) measured from that line of sight, because the player tilts their head to look at the town. Each must be within about 35 degrees of it, and within about 60 cm of the chest, on a table and on the stand.

**On a real table** (`PRODUCT_SPEC.md` §3.2) the height is not ours to choose, so the town is placed for reach first. Its placement angle can be more than 35 degrees; the natural downward head tilt of someone looking at a table covers that, and the target angle still applies. Check the actual angles and comfort in the emulator, then on hardware.

**On the floating stand** the height is ours, so it sits about 55 cm ahead and 38 cm below the eyes, a placement angle of about 35 degrees, inside the main interaction direction (`PRODUCT_SPEC.md` §3.2).

**Town scale.** Table placement may scale the town (trunk, buildings, plots and placed machines) down evenly to 75%. Hand targets do not shrink with it: colliders stay at or above the §7.2 minimum, and snap radii and plot distances stay in real centimetres. The workbench, its parts and the machine being built always stay full size. A machine takes on the town's scale as it settles on its plot.

## 4. Input abstraction

Gameplay systems should not depend directly on raw hand-tracking data.

Create a small input abstraction that converts available input into meaningful actions.

Conceptual actions:

```ts
type InteractionAction =
  | "select"
  | "grab"
  | "release"
  | "poke"
  | "wind"
  | "inspect"
  | "activate"
  | "move";
```

The exact interface must match the verified IWSDK input model.

Do not assume that the conceptual type above is an existing IWSDK API.

## 5. Hand interaction

Use the framework's supported hand-tracking and interaction capabilities.

The game should provide:

- Visible hands when supported.
- Stable pinch detection.
- Reliable selection.
- Clear grab state.
- Predictable release.
- Comfortable interaction distances.

Avoid unnecessary custom gesture recognition.

Only implement custom gesture logic where the required gameplay action is not adequately supported by the framework.

## 6. Pinch interaction

Pinch is the primary selection gesture.

Use it for:

- Selecting a part.
- Grabbing a part.
- Opening a letter.
- Opening a parcel.
- Activating an interaction.
- Grabbing a completed machine.
- Selecting gift actions.

The pinch threshold and release threshold should avoid rapid flickering between states.

Use hysteresis or the framework's stable interaction state where appropriate.

Do not create repeated grab and release events while a player holds a pinch.

## 7. Part grabbing

### 7.1 Selection

When the player pinches a valid part:

- Highlight the part.
- Confirm selection.
- Attach it to a stable interaction point.
- Preserve a comfortable relationship between the hand and object.

The part must not jump unpredictably when grabbed.

### 7.2 Tiny parts

Some mechanical components are very small.

Minimum target collider radius: approximately 1.2 cm.

Use enlarged invisible colliders where required.

The visual mesh should retain its correct scale.

Do not enlarge the visible gear simply to make it easier to select.

### 7.3 Release

On release:

- Find the closest valid socket candidate.
- Validate the part family.
- Validate socket availability.
- Validate the snap distance.
- Commit placement if valid.
- Otherwise return the part to its tray position.

## 8. Socket targeting

The player should receive a clear indication when a part approaches a socket.

Standard snap radius: 4 cm.

Easy Snap radius: 7 cm.

The socket should provide a visual preview when a valid part is close enough.

Valid preview:

- Approximately 50% opacity.
- Warm outline.
- Clear indication of the target transform.

Invalid preview:

- Red outline.
- No successful snap.

The actual placement validation must use the same rules as the preview.

## 9. Part removal

A placed part can be removed.

Default interaction:

1. Pinch the placed part.
2. Pull it away from the socket.
3. When displacement exceeds approximately 3 cm, detach it.
4. Return it to a valid tray location.

Gaze-and-pinch mode should use a pinch-and-hold removal interaction.

Do not detach a part merely because hand-tracking noise causes a tiny positional movement.

## 10. Winding interaction

Winding is a distinct interaction mode.

Default:

1. Player pinches the winding key.
2. Player rotates the wrist.
3. Every 90 degrees adds one wind unit.
4. Maximum is eight wind units.
5. Player releases to finish winding.

The interaction must:

- Track rotation robustly.
- Avoid counting the same rotation repeatedly.
- Prevent sudden tracking jumps from adding multiple units.
- Provide visual feedback.
- Stop at the maximum.

Gaze-and-pinch mode:

- Each pinch adds one unit.
- Show the wind count.
- Provide a Run control.

## 11. X-ray interaction

X-ray reveals the internal structure of a machine.

Default activation:

- Open palm facing down.
- Move approximately 5–20 cm above the machine.
- Hold for approximately 0.4 seconds.

Provide a lens icon alternative.

X-ray should have a clear active and inactive state.

It must not interfere with normal grabbing or assembly.

If an interaction conflict occurs, prioritise the active grab over X-ray activation.

## 12. Machine placement

Completed machines can be moved from the workbench to their intended town plots.

Interaction:

1. Pinch or grab the base handle.
2. Move the machine.
3. Identify the intended plot.
4. Show plot validity.
5. Release.
6. Commit placement if valid.

The machine should not be placeable on arbitrary locations.

The plot must provide visual feedback when the machine is correctly positioned.

## 13. Interface interaction

UI controls should support:

- Poke where appropriate.
- Pinch selection.
- Gaze-and-pinch mode.

Buttons must be large enough for reliable selection.

Avoid tiny text controls and dense panels.

Keep interaction surfaces close to the player.

The UI should feel like part of the miniature physical world.

## 14. Gaze-and-pinch accessibility mode

This mode provides an alternative interaction path.

It should support:

- Gaze-based targeting.
- Pinch to select.
- Pinch to grab.
- Pinch and release to place.
- Pinch-and-hold to remove.
- Pinch-based winding.
- Alternative X-ray activation.
- Accessible Run control.
- UI activation.

Gaze mode must provide clear targeting feedback.

Avoid selecting objects simply because they happen to be near the centre of the screen.

## 15. Desktop development input

Desktop input is a development and fallback path.

It should allow testing of:

- Object selection.
- Object movement.
- Assembly.
- Snapping.
- Winding.
- Machine operation.
- Placement.
- Menus.
- Gift viewing.

Mouse and keyboard input must map to gameplay actions through the same interaction and gameplay interfaces.

Do not create separate gameplay logic for desktop.

## 16. Interaction feedback

Every important action must provide feedback.

| Action | Feedback |
|---|---|
| Select part | Highlight |
| Grab part | Visual attachment response |
| Valid socket | Warm preview |
| Invalid socket | Red outline |
| Successful snap | Short tween, click, spark |
| Rejected placement | Return to tray, soft bonk |
| Winding | Key movement and wind counter |
| Machine starts | Mechanical motion and audio |
| X-ray activates | Casing fades, internals glow |
| Valid plot | Plot glow |
| Machine placed | Wake ripple and town response |

Feedback should be immediate and restrained.

Do not use excessive screen effects.

## 17. Idle guidance

When the player has made no assembly progress for approximately 20 seconds:

- Pulse the next relevant socket.
- Replay the appropriate ghost-hand demonstration.
- Do not move the player's hand or part automatically.
- Do not interrupt an active grab.

The guidance should be helpful rather than intrusive.

## 18. Interaction conflict rules

A hand may be close to several interactive objects.

Use a predictable priority order.

Recommended priority:

1. Active held object.
2. Explicit UI control interaction.
3. Valid part or machine grab.
4. Socket target.
5. Contextual interaction.
6. X-ray gesture.
7. Background gaze target.

Adjust based on verified IWSDK behaviour, but keep the resulting interaction deterministic.

Avoid two systems responding to the same gesture simultaneously.

## 19. Comfort and stability

- No forced camera movement.
- No forced locomotion.
- No required standing.
- No long-distance reaching.
- Avoid rapid wrist rotation requirements.
- Avoid tiny interaction targets.
- Avoid objects moving unexpectedly while held.
- Avoid excessive hand-dependent UI motion.
- Keep the main world stable: once placed, the town stays anchored to its table or stand for the session and never moves on its own.

## 20. Testing requirements

Test:

- Pinch detection.
- Grab stability.
- Release stability.
- Small-part selection.
- Enlarged colliders.
- Standard snapping.
- Easy Snap.
- Invalid part rejection.
- Part removal.
- Winding rotation.
- Maximum wind limit.
- X-ray activation.
- Machine placement.
- Gaze targeting.
- Desktop input mapping.
- Interaction conflicts.
- Seated reach, on a real table and on the stand.

Where desktop emulation cannot validate real hand tracking, explicitly mark the test as requiring Quest hardware.

## 21. Acceptance criteria

- [ ] Core gameplay can be completed without controllers.
- [ ] Pinch selection is stable.
- [ ] Parts do not jump when grabbed.
- [ ] Small parts are selectable.
- [ ] Valid sockets show clear previews.
- [ ] Invalid parts are rejected.
- [ ] Placed parts can be removed.
- [ ] Winding counts rotations correctly.
- [ ] Maximum winding is enforced.
- [ ] X-ray works.
- [ ] Machine placement works.
- [ ] Gaze-and-pinch supports the core loop.
- [ ] Desktop fallback supports gameplay verification.
- [ ] Main interactions remain within comfortable reach, on a real table and on the stand.

## 22. Final principle

Interactions should feel physical, deliberate, and forgiving.

The player should feel that they are carefully building a miniature machine—not fighting a tracking system.
