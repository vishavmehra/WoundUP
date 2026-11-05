# Wound Up — Competition Requirements

**Project:** Wound Up  
**World:** Tockton  
**Competition:** Meta VR Start Developer Competition 2026  
**Track:** Gaming  
**Division:** New Experience  
**Target platform:** Meta Quest 3 / Quest 3S  
**Internal completion deadline:** November 18, 2026 (IST)

---

## 1. Purpose

This document translates the competition requirements into concrete product, development, testing, and submission requirements.

The objective is not merely to create a technically functional WebXR application. Wound Up must deliver a polished, accessible, memorable VR experience that demonstrates thoughtful use of hands-first interaction and a strong understanding of spatial game design.

Every competition requirement must be reflected in implementation or explicitly identified as a submission task.

The competition requirements do not override the product scope defined in `PRODUCT_SPEC.md`. If a feature is not required for the competition and is outside the approved product scope, it must not be added simply to make the project appear larger.

## 2. Competition positioning

### 2.1 Category

- Track: Gaming.
- Division: New Experience.
- Product type: Seated, hands-first, mixed-reality clockwork building game.
- Experience name: Wound Up.
- World name: Tockton.

### 2.2 Positioning statement

Wound Up is a hands-first spatial building game in which players restore a miniature clockwork town by assembling, repairing, winding, and placing mechanical creations.

The experience turns a small physical or virtual surface into a handcrafted world. Players interact directly with miniature mechanisms using natural hand gestures, then watch their creations bring colour, movement, and life back to the town.

### 2.3 What makes the experience distinctive

The submission should communicate these differentiators clearly:

1. **Hands-first construction:** Players physically pinch, pick up, position, and release mechanical parts.
2. **Meaningful mechanical systems:** Machines are not decorative assemblies. Their components and connections determine whether they work.
3. **A visible world transformation:** Completing machines changes the state of Tockton.
4. **A seated miniature-world format:** The entire experience is designed around a comfortable, reachable play area.
5. **A personal creation loop:** Players can gift a completed machine through a shareable URL.

Do not describe the game as a generic VR sandbox or a collection of mechanical minigames.

## 3. Platform and delivery requirements

### 3.1 Target devices

Primary targets:

- Meta Quest 3.
- Meta Quest 3S.

The experience must be developed and optimised for standalone Quest-class hardware.

Desktop development and testing are necessary because the developer does not currently have a Quest headset. However, desktop testing must not be treated as a replacement for final hardware validation.

### 3.2 WebXR delivery

The project must be accessible through a publicly reachable HTTPS URL.

The deployment target is Vercel (public HTTPS URL on vercel.app or a custom domain).

Requirements:

- The deployed application must load over HTTPS.
- WebXR session entry must be initiated by a valid user action.
- The application must handle unsupported immersive modes gracefully.
- The application must provide a useful desktop preview when immersive WebXR is unavailable.
- Asset paths must work from the deployed domain root and from any sub-path.
- The production build must not depend on local development paths.
- The final URL must be tested from a clean browser session.

Do not assume that a successful local development server proves the deployed WebXR experience works.

### 3.3 Session entry

The application must offer a clear and immediate way to enter the experience.

The landing page should:

- Show the Wound Up identity.
- Communicate the premise through concise text and visual presentation.
- Provide a clear Enter action.
- Avoid unnecessary registration, account creation, or setup.
- Explain the immersive entry path when needed.

The player should reach the experience without navigating through a complicated website.

## 4. Interaction requirements

### 4.1 Hands-first design

Hands are the primary interaction method.

The game must not require a controller for its core gameplay loop.

Players must be able to:

- Select and pick up parts.
- Position parts.
- Snap parts into valid sockets.
- Remove incorrectly placed parts.
- Wind a machine.
- Activate a machine.
- Move completed machines.
- Interact with letters, parcels, and menus.
- Access essential accessibility and pause controls.

Controller support may be used where it is available and appropriate, but must remain optional.

### 4.2 Natural interaction

Prefer natural, understandable gestures over complex gesture combinations.

The primary interaction vocabulary is:

- Pinch to select or grab.
- Release to place.
- Wrist rotation to wind.
- Open palm to reveal X-ray information.
- Grab and release to move completed machines.
- Poke or pinch to activate interface elements.

The game must provide visual feedback for interaction state.

Players should be able to understand:

- What can be grabbed.
- What can be placed.
- Whether a socket is valid.
- Whether a part is incompatible.
- Whether a machine is complete.
- Whether a machine is running.

### 4.3 Comfortable spatial interaction

The experience is designed for seated play.

Requirements:

- No forced locomotion.
- No required standing.
- No forced camera movement.
- No interaction that requires reaching far away from the player.
- Keep essential interactions within approximately 60 cm of the player's chest.
- Keep important interaction targets within approximately 35 degrees of the head-forward direction.
- Avoid requiring repeated extreme wrist or shoulder movements.

The game should feel comfortable during a short session and remain usable during longer play.

### 4.4 Gaze-and-pinch accessibility

A gaze-and-pinch alternative must be available for players who cannot comfortably use the default hand interactions.

It should support essential gameplay actions through:

- Gaze-based targeting.
- Pinch-based selection.
- Simplified winding.
- An alternative X-ray activation method.
- Accessible interface activation.

The gaze mode must not become a separate incomplete version of the game. The primary gameplay loop must remain achievable.

## 5. Onboarding and accessibility

### 5.1 Onboarding

The first experience should teach the player through interaction rather than long instructions.

Use ghost-hand demonstrations to introduce:

1. Opening the trunk.
2. Opening the letter.
3. Picking up a part.
4. Snapping it into a socket.
5. Winding the mechanism.
6. Starting the machine.
7. Placing the finished machine in town.

Instructions must be concise and contextual.

The player should understand the basic interaction loop within the first few minutes.

### 5.2 First satisfying experience

Target: the player should complete the first satisfying Music Box loop within five minutes.

This is an internal experience-design target. It is intentionally more demanding than a general onboarding requirement.

The first loop should include:

- A clear objective.
- A small number of understandable parts.
- A successful assembly.
- A visible winding action.
- A satisfying machine animation.
- A clear emotional reward.

### 5.3 Accessibility options

The experience should include:

- Gaze-and-pinch interaction mode.
- Larger snap radius option.
- Easy Snap mode.
- Clear visual interaction states.
- Readable interface text.
- A pause menu.
- A comfortable seated interaction layout.

Accessibility features must be tested as actual gameplay paths, not merely displayed as settings.

## 6. Performance requirements

The target is smooth standalone Quest performance.

Internal targets:

- Aim for 72 FPS.
- Avoid dropping below 60 FPS during normal gameplay.
- Avoid unnecessary draw calls.
- Reuse and cache generated geometry.
- Instance repeated mechanical components where appropriate.
- Merge static geometry where beneficial.
- Avoid excessive real-time lights and shadows.
- Avoid unnecessary per-frame allocations.
- Keep interaction and animation updates efficient.

Performance must be measured on the deployed experience where possible.

Desktop frame rate alone is not sufficient evidence of Quest performance.

## 7. Visual and audio quality

The experience must look like a coherent, intentionally art-directed game.

Requirements:

- Maintain the vintage storybook and antique horology visual identity.
- Use high-quality Blender-created hero assets.
- Use consistent materials, scale, lighting, and proportions.
- Avoid primitive-looking final buildings and hero machines.
- Ensure frozen and awakened town states are visually distinct.
- Use restrained, purposeful animation.
- Use audio to reinforce assembly, winding, mechanical operation, and world restoration.

The experience must not look like an unconnected collection of sample assets.

## 8. Competition demonstration

### 8.1 Demo video

Prepare a demonstration video under three minutes.

The video should communicate the complete product experience rather than spending most of its time explaining the technology.

Recommended sequence:

1. **Opening:** Wound Up title and Tockton introduction.
2. **The world:** Show the frozen miniature town.
3. **The problem:** Introduce the letter requesting the Music Box repair.
4. **Hands-first interaction:** Show picking up and snapping mechanical parts.
5. **Mechanical result:** Wind the key and run the Music Box.
6. **World transformation:** Place the machine in town and show the awakening effect.
7. **Additional gameplay:** Briefly show the Carousel or Windmill.
8. **Distinctive feature:** Show the gifting experience.
9. **Closing:** Project name, competition identity, and playable URL.

The final video must be clear, well-paced, and visually polished.

Do not show unfinished features as if they were complete.

Do not use fake gameplay footage or imply that an interaction works when it does not.

### 8.2 Video production quality

- Capture at a resolution suitable for clear viewing.
- Keep text readable.
- Avoid excessive transitions.
- Use a consistent visual identity.
- Make hand interactions visible.
- Show the actual application.
- Use captions or short labels where they improve understanding.
- Keep the final video within the competition's stated duration limit.

## 9. Submission requirements

The Devpost submission must be prepared with the following information:

- Project name.
- Project description.
- Public project URL.
- Public source-code repository.
- Demo video under three minutes.
- Competition track and division.
- Required technical and product explanations requested by the submission form.

The public project URL must point to the deployed playable experience.

The GitHub repository must be accessible to judges and contain sufficient information to understand and build the project.

The README should explain:

- What Wound Up is.
- How to access the experience.
- How to run it locally.
- How to build and deploy it.
- The technology stack.
- The interaction model.
- The project structure.
- Known limitations.
- Credits and asset attribution.

Do not invent submission-form questions or claim that a field has been completed until it has been verified on the actual submission page.

## 10. Testing and judging readiness

Before submission, verify:

### Experience

- [ ] Landing page loads.
- [ ] Enter action works.
- [ ] Immersive entry is handled correctly.
- [ ] Desktop fallback works.
- [ ] Trunk introduction works.
- [ ] Letter interaction works.
- [ ] Music Box can be assembled.
- [ ] Music Box can be wound and started.
- [ ] Completed machine can be placed.
- [ ] Town wake-up effect works.
- [ ] Save and load work.
- [ ] Gifting URL can be generated and opened.
- [ ] Essential accessibility options work.
- [ ] Pause and restart work.

### Technical

- [ ] Production build succeeds.
- [ ] Tests pass.
- [ ] No critical console errors.
- [ ] No broken asset paths.
- [ ] No missing runtime dependencies.
- [ ] Vercel deployment works.
- [ ] Public URL works in a clean browser session.
- [ ] WebXR entry is tested in a supported environment.
- [ ] Performance has been measured.
- [ ] Quest hardware validation has been arranged.

### Submission

- [ ] Public repository is accessible.
- [ ] README is complete.
- [ ] Demo video is under three minutes.
- [ ] Video shows real gameplay.
- [ ] Public project URL works.
- [ ] Devpost fields are complete.
- [ ] Credits and asset licences are documented.

## 11. Deadline management

The official competition page supplied for this project lists the deadline as **November 19, 2026, at 1:30 AM IST**.

The internal project deadline is deliberately earlier:

**November 18, 2026, before midnight IST.**

Internal milestones:

- November 16: Code freeze.
- November 17: Final testing, trailer, and Devpost preparation.
- November 18: Final verification and submission buffer.

Do not plan to finish implementation at the official deadline.

The project must be in a submission-ready state before the internal deadline.

## 12. Competition scope protection

The competition is not a reason to add unrelated features.

Prioritise:

1. A complete and satisfying Music Box gameplay loop.
2. Reliable hands-first interaction.
3. A polished miniature town.
4. Visible machine placement and town restoration.
5. A functional gift-sharing experience.
6. A stable WebXR deployment.
7. A compelling demonstration video.

Features identified as optional or cuttable in `PRODUCT_SPEC.md` must remain cuttable.

Do not introduce accounts, cloud services, multiplayer, AI calls, analytics, monetisation, or other excluded systems to improve the submission's apparent complexity.

## 13. Final acceptance standard

Wound Up is ready for submission when:

- The core gameplay loop is complete.
- The experience is understandable without lengthy explanation.
- The player can complete the main loop using hands.
- The game is comfortable while seated.
- The visual quality is coherent and polished.
- The deployed application works through its public HTTPS URL.
- The project repository is presentable.
- The demo video communicates the experience clearly.
- All required submission fields are complete.
- No critical known issue prevents a judge from experiencing the game.

The goal is a small, complete, memorable game—not a large unfinished prototype.
