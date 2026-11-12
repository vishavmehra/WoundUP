# Wound Up — UI and UX Specification

**Project:** Wound Up  
**World:** Tockton  
**Status:** Planned  
**Internal completion deadline:** November 18, 2026 (IST)

## 1. Purpose

This document defines the interface and user experience principles for Wound Up.

The interface should feel like part of the miniature clockwork world.

It must not resemble a conventional desktop application placed inside VR.

The player should understand what to do through the world, physical objects, visual feedback, and short contextual prompts.

## 2. UX principles

1. The world is the primary interface.
2. Physical objects should communicate their purpose.
3. Use short instructions.
4. Avoid long text panels.
5. Keep important controls close to the player.
6. Maintain a consistent visual language.
7. Make interaction states obvious.
8. Preserve comfortable seated play.
9. Avoid unnecessary menus.
10. Do not interrupt gameplay with unrelated UI.

## 3. Visual identity

Use the art direction defined in `PROJECT_BIBLE.md`.

The interface should use:

- Cream paper surfaces.
- Walnut frames.
- Brass details.
- Deep teal accents.
- Warm highlights.
- Restrained typography.
- Subtle paper and material textures.

UI should feel like a combination of:

- Antique instruction cards.
- Handwritten letters.
- Mechanical labels.
- Small workshop controls.
- Vintage catalogue details.

Avoid modern neon panels, excessive gradients, generic floating HUDs, and dense dashboard layouts.

## 4. Typography

Typography must remain readable at the intended viewing distance.

Use a restrained hierarchy:

- Large display treatment for the project identity.
- Clear readable headings for letters and machine names.
- Comfortable body text for instructions.
- Short labels for controls.
- Minimal decorative typography.

Do not use ornate fonts for important instructions.

Decorative lettering may be used for titles and selected story elements, but functional text must remain clear.

## 5. Landing experience

The landing page introduces Wound Up.

It should contain:

- Project title.
- Short tagline.
- A concise description.
- Clear Enter action.
- A suitable visual preview of Tockton.

Tagline:

**Build the machines. Wake the town. Raise the curtain.**

The landing experience should be quick.

Do not add registration, onboarding forms, account creation, or unnecessary configuration.

If immersive WebXR is unavailable, provide a clear desktop preview path.

## 6. Trunk introduction

The trunk is the player's first physical object.

It should feel like a handcrafted keepsake box.

It appears standing on the player's real table, with its contact shadow on the table. Choosing the table needs no menu, scan prompt or confirmation.

When no table can be used, the trunk appears on the floating velvet stand. The stand must read as a deliberate presentation, never as an error, and the game shows no "table not found" message.

The player should understand that it can be opened through its latch.

Use a restrained interaction hint.

When opened:

- The town unfolds.
- The world is revealed.
- The frozen state is established.
- The player receives the first letter.

Avoid a long cinematic that prevents interaction.

## 7. Town interface

The town itself communicates progression.

Each plot should indicate:

- Frozen or awakened state.
- Whether it has a completed machine.
- Whether it is relevant to the current objective.

Use environmental cues rather than a large progress dashboard.

The player should be able to recognise a completed plot visually.

## 8. Letter interface

Letters are physical objects.

The player pinches the envelope to open it.

The letter should present:

- Sender.
- Message.
- Clear Accept action.

The text should feel personal and handcrafted.

Avoid presenting the letter as a generic rectangular system notification.

Keep the letter content consistent with `GAMEPLAY_SYSTEMS.md`.

## 9. Parcel and blueprint interface

After accepting a letter, the workbench appears.

The parcel should be visually distinct and physically openable.

The blueprint should communicate the intended assembly without requiring a technical manual.

Use:

- Clear machine illustration.
- Visible part positions.
- Simple connection indicators.
- Short contextual labels.
- Subtle highlights.

Do not cover the entire workbench with instructions.

## 10. Parts tray

The parts tray should present available components in a clear physical arrangement.

Requirements:

- Parts should be easy to distinguish.
- Small parts should have enlarged interaction targets.
- Part families should be visually consistent.
- Decoy parts should remain understandable.
- The tray should not obscure the blueprint.
- The player should not need to search through a large inventory interface.

Avoid a conventional grid inventory unless the physical tray cannot communicate the available parts clearly.

## 11. Assembly feedback

The interface should communicate placement state directly through the parts and sockets.

Valid preview:

- Warm outline.
- Approximately 50% opacity.
- Clear target alignment.

Invalid preview:

- Red outline.
- No snap.

Successful placement:

- Short movement tween.
- Mechanical click.
- Small spark.

Rejected placement:

- Return to tray.
- Soft mechanical bonk.

Completed assembly:

- Clear visual confirmation.
- Transition to winding.

Do not rely on text alone to communicate these states.

## 12. Winding interface

The winding interaction should be primarily physical.

The player should see:

- Winding key movement.
- Accumulated wind units.
- Maximum wind capacity.
- A clear indication that winding can finish.

For gaze-and-pinch mode, show a readable counter and Run control.

Do not use a large floating progress dashboard.

## 13. Machine result interface

When the machine runs, the machine itself is the primary feedback.

Use a small contextual result label only when useful.

Possible player-facing messages should communicate:

- The machine works.
- The machine stops too soon.
- Something is jammed.
- A component is incorrect.

Avoid exposing raw solver terms such as graph node IDs or angular velocity calculations.

The player should understand the symptom and what to investigate.

## 14. X-ray interface

X-ray should not introduce a separate menu.

Use the visual transformation of the machine:

- Casing becomes approximately 15% opaque.
- Internal components remain visible.
- Internal components receive warm glow.
- Casing receives a cool rim.

A small lens icon can provide an alternative activation path.

## 15. Machine placement interface

When the player carries a completed machine:

- Highlight the intended plot.
- Show valid placement feedback.
- Avoid highlighting unrelated plots.
- Confirm successful placement.
- Trigger the wake ripple.

The player should understand where the machine belongs.

## 16. Wake-up presentation

The wake-up effect is a major emotional reward.

It should include:

- A visible 1.5-second ripple.
- Return of colour.
- Relevant mechanical movement.
- Local lighting changes.
- Appropriate sound.

The effect should be clear without overwhelming the town.

Do not use a large full-screen flash or camera shake.

## 17. Gift interface

The gift interface should feel personal.

Use the ribbon icon to expose gifting for completed machines after the second letter.

Present the approved engraving presets:

- For you.
- Happy birthday.
- Thinking of you.
- Thank you.
- With love.
- Congratulations.
- Made this for you.
- Wind me up.

The interface should make it clear that a shareable link is being created.

Provide visible fallback when native sharing or clipboard access is unavailable.

## 18. Gift viewer UX

The gift viewer should create a small unwrapping moment.

Sequence:

1. Show wrapped gift.
2. Invite the recipient to unwrap.
3. Open the wrapping.
4. Reveal the machine.
5. Start the machine's presentation.
6. Allow inspection.
7. Offer Make Your Own.

Desktop and phone:

- Orbit the machine using appropriate input.

Headset:

- Grab and turn the machine.
- Use X-ray where supported.

Do not require the recipient to create an account.

## 19. Pause interface

The pause interface should be compact and readable.

It should offer:

- Resume.
- Restart.
- Easy Snap.
- Gaze mode.
- X-ray hint.
- Day/night setting if implemented.

Restart must require confirmation.

Do not add unnecessary settings that do not affect the actual experience.

## 20. Accessibility UX

Accessibility settings must be understandable.

Use concise labels.

Explain Easy Snap and gaze mode in plain language.

The gaze-and-pinch mode must show a clear target indication.

Ensure essential text and controls remain readable.

Do not use colour as the only indicator of valid or invalid placement.

## 21. Motion and transition design

Animations should feel deliberate and mechanical.

Use restrained transitions:

- Trunk opening.
- Town unfolding.
- Workbench movement.
- Parcel opening.
- Part snapping.
- Machine starting.
- Machine placement.
- Wake ripple.
- Gift unwrapping.

Avoid excessive easing, large camera movements, or animations that delay interaction.

## 22. Audio and interface feedback

Interface sounds should be consistent with the world.

Examples:

- Paper movement for letters.
- Small latch sound for opening.
- Mechanical click for snapping.
- Soft bonk for rejection.
- Winding mechanism sound.
- Machine startup.
- Warm musical response for town restoration.

Audio should support the interaction rather than compete with it.

## 23. Comfort

- Keep interface elements within comfortable reach.
- Avoid large panels close to the face.
- Avoid rapid movement of interface elements.
- Avoid forced head movement.
- Avoid excessive visual effects.
- Keep the main world stable.
- Keep instructions concise.

## 24. UX testing

Test:

- Whether the landing page explains the experience.
- Whether the town reads as standing on the real table.
- Whether the trunk is understandable.
- Whether letters are readable.
- Whether the parcel is discoverable.
- Whether the blueprint is understandable.
- Whether parts are distinguishable.
- Whether socket feedback is clear.
- Whether winding is understandable.
- Whether machine errors are understandable.
- Whether placement is clear.
- Whether the town wake-up reward is noticeable.
- Whether gifting is understandable.
- Whether pause and accessibility controls are discoverable.

Where possible, observe a first-time tester without explaining the controls.

Record where they hesitate or misunderstand.

## 25. Acceptance criteria

- [ ] Landing experience is clear.
- [ ] Enter action is obvious.
- [ ] Trunk and town read as standing on the real table.
- [ ] The floating stand reads as deliberate, not as an error.
- [ ] Trunk interaction is discoverable.
- [ ] Letters are readable.
- [ ] Parcel interaction is clear.
- [ ] Blueprint is understandable.
- [ ] Parts tray is easy to use.
- [ ] Placement feedback is immediate.
- [ ] Machine result is understandable.
- [ ] X-ray state is clear.
- [ ] Placement target is clear.
- [ ] Wake-up reward is noticeable.
- [ ] Gift creation is understandable.
- [ ] Gift viewer is intuitive.
- [ ] Pause and accessibility settings are usable.
- [ ] No unnecessary UI blocks the experience.

## 26. Final principle

The player should feel as if they are interacting with a tiny handcrafted world.

The best interface is often the machine itself, the letter in their hand, or the town changing in response to their work—not another floating menu.
