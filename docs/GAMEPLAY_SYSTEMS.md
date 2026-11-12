# Wound Up — Gameplay Systems

**Project:** Wound Up  
**World:** Tockton  
**Document:** Gameplay systems specification  
**Status:** Planned  
**Internal completion deadline:** November 18, 2026 (IST)

---

## 1. Purpose

This document defines the gameplay systems that connect the player's actions to the world of Tockton.

It describes the rules and responsibilities of:

- Game progression.
- Letters and objectives.
- Machine assembly.
- Part interaction.
- Socket snapping.
- Mechanical validation.
- Winding.
- Machine operation.
- Repairs.
- Machine placement.
- Town restoration.
- X-ray inspection.
- Gifting.

The purpose is to ensure that every gameplay feature has a clear, testable contract.

The product must feel like one coherent game. These systems must not become disconnected demonstrations.

## 2. Core gameplay loop

The primary loop is:

1. Discover a frozen part of Tockton.
2. Receive a letter from a resident.
3. Understand the requested repair or creation.
4. Open the parcel and inspect the blueprint.
5. Pick up mechanical parts.
6. Assemble the machine.
7. Validate the mechanical configuration.
8. Wind the mechanism.
9. Release and run the machine.
10. Observe the mechanical result.
11. Pick up the finished machine.
12. Place it in its town plot.
13. Watch the town respond.
14. Continue to the next letter.

The first Music Box loop is the most important gameplay milestone.

The player should experience a complete and satisfying version of this loop within five minutes.

## 3. Game modes

The game has six primary modes.

### 3.1 Town

The player explores the miniature town visually and interacts with available letters, plots, and completed machines. The town stands on the player's real table, or on the floating stand when no table can be used (`PRODUCT_SPEC.md` §3.2).

Responsibilities:

- Show town state.
- Show available objectives.
- Show completed machines.
- Show frozen and awakened plots.
- Provide access to the next letter.

### 3.2 Build

The player assembles a machine on the workbench.

Responsibilities:

- Display the blueprint.
- Display the parts tray.
- Allow part selection.
- Allow socket targeting.
- Validate placement.
- Show incomplete or completed state.
- Allow removal of placed parts.

### 3.3 Wind

The player supplies energy to the assembled machine.

Responsibilities:

- Enable winding interaction.
- Track wind units.
- Enforce the maximum wind capacity.
- Display winding feedback.
- Start the machine after release or Run activation.

### 3.4 Place

The player moves a completed machine from the workbench to its intended town plot.

Responsibilities:

- Enable machine grabbing.
- Identify valid plots.
- Show plot feedback.
- Confirm placement.
- Trigger town restoration.

### 3.5 Gift

The player creates or views a gift.

Responsibilities:

- Select an engraving.
- Generate a validated gift payload.
- Produce a shareable URL.
- Display a wrapped gift viewer.
- Allow the recipient to unwrap and inspect the machine.

### 3.6 Pause

The player can pause the experience.

Responsibilities:

- Resume.
- Restart with confirmation.
- Adjust available accessibility settings.
- Toggle supported presentation options.
- Return to the active game.

## 4. Progression system

Progression is driven by letters and machine completion.

The progression system should be deterministic and easy to save.

A letter can have a state such as:

- Locked.
- Available.
- Active.
- Completed.

The exact internal representation may differ, but transitions must be explicit.

A letter should not become completed merely because the player opens it.

Completion should be based on the associated gameplay objective.

### 4.1 Progression rules

- The first letter is available after the trunk introduction.
- The Music Box is the first major machine.
- The next Music Box repair becomes available after the first Music Box completion.
- The Carousel becomes available through its letter.
- The Windmill becomes available through its letter.
- The Clock Tower is a lower-priority feature and may be cut.
- The daily repair is protected repeat play (ADR-027) and must not block the main story.

## 5. Letter system

Letters provide motivation and explain why each machine matters.

The letter system must be emotionally grounded and concise.

### 5.1 Letter 1 — Mira

> My grandmother's music box went quiet the night the clock stopped. Could you make it sing again?

Objective: Build and run the Music Box.

### 5.2 Letter 2 — Mira

> It plays! But only for a moment, then it sighs and stops. Is it tired?

Objective: Diagnose and repair the Music Box's worn spring.

### 5.3 Letter 3 — Schoolteacher

> The children press their noses to the carousel every morning. Could you make it turn again?

Objective: Build and run the Carousel.

### 5.4 Letter 4 — Otto

> No wind, no windmill. No windmill, no flour. No flour, no bread. Please help.

Objective: Build and run the Windmill.

### 5.5 Letter 5 — Otto

> The windmill spins like it's late for something! Flour everywhere. Something's not right inside.

Objective: Repair the Windmill's incorrect gear ratio.

### 5.6 Letter 6 — Theatre keeper

> The theatre doors only open when the clock tower rings. Tockton hasn't heard it in years.

Objective: Build the Clock Tower if this feature remains in scope.

### 5.7 Closing letter

> Tockton is waking up. The show is coming soon.

The closing message should reinforce the player's contribution to the town.

## 6. Parcel and blueprint presentation

After accepting a letter:

1. The workbench slides into view.
2. A parcel appears.
3. The player opens the parcel.
4. The blueprint is revealed.
5. The parts tray becomes available.

The parcel should feel like a physical object, not a flat menu.

The blueprint should communicate:

- The machine being built.
- The intended part positions.
- The important mechanical relationships.
- The order of assembly where necessary.

Avoid overwhelming the player with technical diagrams or long explanations.

## 7. Part interaction

Parts are physical objects within the workbench area.

The player must be able to:

- Pinch a part.
- Pick it up.
- Move it toward a socket.
- Receive placement feedback.
- Release it.
- Remove it if necessary.

### 7.1 Selection

The player targets a part and pinches.

The part should visibly respond to selection.

The selected part should follow the player's interaction point using a stable and comfortable method.

### 7.2 Placement

When the player releases a part:

- Check for a candidate socket.
- Validate compatibility.
- Validate availability.
- Snap if valid.
- Reject if invalid.

### 7.3 Removal

The player can pinch a placed part and pull it more than 3 cm away from its socket.

In gaze-and-pinch mode, use pinch-and-hold as the removal interaction.

### 7.4 Part feedback

Use clear feedback:

- Valid placement: warm outline and preview.
- Invalid family: red outline.
- Successful snap: short tween, click, and spark.
- Rejected placement: return to tray with a soft mechanical bonk.
- Completed assembly: clear visual confirmation.

## 8. Socket snapping

Standard snap radius: 4 cm.

Easy Snap radius: 7 cm.

A valid socket preview should appear at approximately 50% opacity with a warm outline.

A part should snap into its exact blueprint transform when released within a valid radius.

The same compatibility rules must be used for preview and final placement.

### 8.1 Invalid placements

If the part belongs to the wrong family:

- Show red feedback.
- Reject placement.
- Return the part to its tray position.
- Play a restrained rejection sound.

### 8.2 Incorrect but compatible parts

Some parts may fit physically but create an incorrect mechanical result.

This is intentional.

For example, an incorrect gear tooth count may fit the socket but cause the mechanism to run at the wrong speed.

Do not reject every mechanically incorrect part at the snapping stage.

The player should be able to discover certain mechanical mistakes through operation and repair.

### 8.3 Idle guidance

If the player remains in build mode without progress for approximately 20 seconds:

- Pulse the next relevant socket.
- Replay the ghost-hand demonstration.
- Avoid interrupting the player's current action.

## 9. Mechanical validation

After required parts are assembled, pass the configuration to the mechanical solver.

Possible outcomes:

### 9.1 Incomplete

One or more required sockets are empty.

The player must continue assembly.

### 9.2 Runs

The machine is mechanically correct.

It can operate according to the blueprint's intended behaviour.

### 9.3 Runs wrong

The machine is mechanically connected but produces an incorrect result.

Examples:

- Incorrect gear ratio.
- Incorrect operating speed.
- Incorrect output target.

### 9.4 Jams

The mechanism cannot operate because of a mechanical contradiction.

Examples:

- Inconsistent gear-loop velocity.
- Incompatible gear modules.
- Invalid mechanical connection.

The result should be communicated through both visual and audio feedback.

Do not show raw technical error messages to the player.

## 10. Winding system

The player winds the machine before starting it.

### 10.1 Default interaction

- Pinch the winding key.
- Rotate the wrist.
- Every 90 degrees adds one wind unit.
- Maximum: 8 wind units.
- Release to finish winding.

### 10.2 Gaze-and-pinch interaction

- Each pinch adds one wind unit.
- Display the current wind amount.
- Provide an accessible Run control.

### 10.3 Energy rules

Spring energy is calculated from wind units and energy per unit.

Runtime is calculated using available energy and drain rate.

The worn spring repair must be able to produce a runtime of approximately 1.5 seconds under the intended test configuration.

The winding animation must not decide runtime independently of the solver.

## 11. Machine operation

Machine operation is driven by the mechanical solver result.

The game should show the machine's behaviour clearly enough for the player to understand whether it works.

### 11.1 Music Box

- Cylinder rotates.
- Comb remains fixed.
- Governor spins.
- Fixed melody plays.
- Target cylinder speed: 0.4 rad/s, within ±10%.

### 11.2 Carousel

- Platform rotates.
- Horses rise and fall.
- Canopy lights twinkle.
- Music Box melody plays.
- Target platform speed: 0.5 rad/s, within ±10%.

### 11.3 Windmill

- Sails rotate.
- Millstone operates.
- Flour puffs appear.
- Bakery chimney emits smoke.
- Baker performs a kneading animation. The baker is Otto (ADR-039; [TOCKTON_CHARACTERS.md](TOCKTON_CHARACTERS.md)).
- Oven glows.
- Target millstone speed: 0.6 rad/s, within ±15%.

### 11.4 Clock Tower

If retained:

- Pendulum swings.
- Clock hands show local time.
- Hourly bell plays.
- Theatre doors open for 30 seconds after the hour.

The Clock Tower is lower priority and must be cut before core gameplay quality is compromised.

## 12. Repair system

Repairs introduce mechanical diagnosis.

The player should understand the symptom before being asked to replace a component.

### 12.1 Music Box repair

Problem: Worn spring.

Symptom:

- Machine starts.
- It runs briefly.
- It stops after approximately 1.5 seconds.

Solution:

- Identify the worn spring.
- Remove it.
- Replace it with the correct spring.
- Wind the machine.
- Verify that the machine now operates correctly.

### 12.2 Windmill repair

Problem: Incorrect gear ratio.

Symptom:

- A 12-tooth spur gear is installed where a 24-tooth gear is required.
- The millstone runs approximately twice as fast as intended.

Solution:

- Identify the incorrect gear.
- Remove it.
- Install the correct 24-tooth gear.
- Run the mechanism again.
- Verify the corrected speed.

### 12.3 Daily repair

Daily repair is protected repeat play (ADR-027): lightweight and deterministic, reusing existing machines, parts and repair faults, and simplified rather than cut if time is critical.

It should become available after Letter 5 and use the local date as its seed.

It must be completable once per day.

It must not block the main story or be required to finish the game.

## 13. Machine placement

After a machine has been successfully built and run, the player can move it to its intended town plot.

Interaction:

1. Grab the machine by its base handle.
2. Move it toward the correct plot.
3. Show valid plot feedback.
4. Release.
5. Confirm placement.
6. Trigger the town wake-up effect.

The machine should not be considered placed until a valid placement is committed.

## 14. Town restoration

Town restoration is the main emotional reward.

When a machine is placed:

- The associated plot changes from frozen to awakened.
- Colour returns.
- Relevant objects begin moving.
- Appropriate lights activate.
- Audio changes to reflect the restored area.
- A wake ripple appears for approximately 1.5 seconds.

The frozen town should be visibly desaturated and cool.

The awakened town should use the full warm palette.

The town should feel more alive after each successful contribution.

Do not make the wake-up effect so large or bright that it obscures the miniature world.

## 15. X-ray inspection

X-ray allows the player to inspect internal machine components.

Activation:

- Open palm facing down.
- Move 5–20 cm above the machine.
- Hold for approximately 0.4 seconds.
- Provide a lens icon alternative.

Visual result:

- Outer casing becomes approximately 15% opaque.
- Internal moving parts remain opaque.
- Internal components receive a warm glow.
- Casing receives a cool rim treatment.

X-ray is an inspection feature. It must not alter assembly state or machine operation.

## 16. Gifting system

The player can gift one completed machine.

The gifting feature is intended to make a player's creation shareable.

### 16.1 Availability

After the second letter, completed machines can expose a gift action through a ribbon icon.

### 16.2 Engravings

Provide these preset engravings:

- For you
- Happy birthday
- Thinking of you
- Thank you
- With love
- Congratulations
- Made this for you
- Wind me up

Do not implement a full text keyboard or free-form engraving editor.

### 16.3 Gift creation

The game serialises the completed machine into a compact payload.

The payload is compressed and encoded into a URL hash.

Target URL length: below 1500 characters.

### 16.4 Gift viewing

The recipient opens a wrapped gift.

They can:

- Click, tap, or pinch to unwrap it.
- Inspect the machine.
- Watch it wind and run automatically.
- Orbit the machine on desktop or phone.
- Grab, turn, and inspect it in headset mode.
- Use X-ray.
- Choose Make Your Own to enter the main experience.

The viewer must validate all incoming data.

Unknown blueprints, invalid parts, or failed mechanical validation must produce a clear error state.

The gift viewer must not save progress into the recipient's main game.

## 17. Save and load

Persist:

- Town placements.
- Letter states.
- Completed machines.
- Machine placements.
- Daily repair completion.
- Accessibility and presentation settings.

Use the `woundup.save` localStorage key and the `SaveV1` structure defined in `TECHNICAL_ARCHITECTURE.md`.

Save after important progression changes.

Do not save every frame.

Handle invalid or unavailable storage gracefully.

Restarting must require a second confirmation before deleting progress.

## 18. Onboarding and guidance

Use ghost hands to teach interactions.

Required demonstrations:

- Opening the trunk.
- Opening a letter.
- Picking up a part.
- Snapping a part.
- Winding a key.
- Starting a machine.
- Placing a machine.

Guidance should be contextual.

Do not interrupt the player unnecessarily.

If the player is idle for approximately 20 seconds during assembly, highlight the next relevant socket and replay the associated ghost-hand action.

## 19. Accessibility

Support:

- Gaze-and-pinch mode.
- Larger snap radius.
- Easy Snap.
- Accessible winding.
- Alternative X-ray activation.
- Readable UI.
- Seated interaction.
- Pause.

Accessibility modes must preserve the core experience rather than removing essential gameplay.

## 20. Pause and restart

Pause should be available during active gameplay.

The pause interface should provide:

- Resume.
- Restart.
- Easy Snap setting.
- Gaze mode setting.
- X-ray hint setting.
- Day/night setting if implemented.

Restart must require explicit confirmation.

Do not allow accidental progress deletion.

## 21. Gameplay quality gates

### Music Box

- [ ] Letter appears.
- [ ] Parcel opens.
- [ ] Blueprint is readable.
- [ ] Parts can be picked up.
- [ ] Parts snap correctly.
- [ ] Invalid parts are rejected.
- [ ] Required assembly is detected.
- [ ] Solver returns the expected result.
- [ ] Winding works.
- [ ] Machine runs.
- [ ] Melody plays.
- [ ] Machine can be placed.
- [ ] Town plot wakes.

### Repairs

- [ ] Worn spring symptom is visible.
- [ ] Worn spring can be removed.
- [ ] Correct spring can be installed.
- [ ] Incorrect gear symptom is visible.
- [ ] Wrong gear can be removed.
- [ ] Correct gear can be installed.
- [ ] Corrected machine behaves as expected.

### Gifting

- [ ] Completed machine can be selected.
- [ ] Preset engraving can be selected.
- [ ] Gift URL is generated.
- [ ] URL remains within the target length.
- [ ] Gift viewer opens.
- [ ] Payload is validated.
- [ ] Invalid payload shows an error.
- [ ] Recipient can unwrap and inspect the machine.

## 22. Scope priority

The core systems must be completed before optional systems.

Priority order:

1. Music Box assembly and operation.
2. Hands-first interaction.
3. Mechanical solver.
4. Table detection and anchoring, with the floating stand as fallback.
5. Machine placement.
6. Town restoration.
7. Letters and progression.
8. Save and load.
9. Music Box repair.
10. Carousel.
11. Windmill and Bakery.
12. Gifting.
13. X-ray.
14. Accessibility.
15. Daily repair.
16. Clock Tower.
17. Day/night toggle.

If the deadline becomes tight, cut in this order:

1. Clock Tower.
2. Day/night toggle.
3. Decoy parts.

If time is still critical, simplify the daily repair rather than remove it (ADR-027).

Never cut the complete Music Box loop, hands-first interaction, table detection and anchoring with its stand fallback, town placement and wake-up, the core gift-sharing experience, or the daily repair (in simplified form if needed) without an explicit product decision.

## 23. Final gameplay principle

Every machine must feel like a meaningful creation.

The player should not merely assemble parts and receive a completion message.

They should understand the problem, interact with the mechanism, see whether it works, correct mistakes where appropriate, and watch their work make Tockton more alive.

The emotional reward comes from the relationship between physical interaction, mechanical behaviour, and visible world restoration.
