# Wound Up — Acceptance Tests

**Project:** Wound Up  
**World:** Tockton  
**Purpose:** Define objective conditions for accepting the game and its individual systems.  
**Internal completion deadline:** November 18, 2026 (IST)

## 1. Purpose

This document defines the acceptance criteria for Wound Up.

A feature is not complete merely because it has been implemented. It is complete when its expected behaviour has been verified and its important failure cases have been tested.

Acceptance testing must cover:

- Core gameplay.
- Interaction.
- Mechanical correctness.
- Progression.
- Visual presentation.
- Persistence.
- Gifting.
- Accessibility.
- Performance.
- Deployment.

Tests must distinguish between automated verification, desktop/emulator verification, and physical Quest hardware verification.

## 2. Test classifications

Use these labels when recording results:

| Classification | Meaning |
|---|---|
| Unit | Isolated logic tested automatically |
| Integration | Multiple systems tested together |
| Browser | Browser-based application behaviour |
| Emulator | IWSDK desktop emulator or supported simulation |
| Hardware | Physical Quest 3 or Quest 3S |
| Visual | Human review of appearance and presentation |
| Manual | A test requiring human interaction or judgement |

A desktop test must never be reported as a successful Quest hardware test.

## 3. Acceptance status

Each test must have one of these statuses:

- Not Run.
- Pass.
- Fail.
- Blocked.
- Not Applicable.

A blocked test must include the reason and the action required to unblock it.

Record the build or commit tested, test environment, date, and any relevant evidence.

## 4. Application and startup

| ID | Test | Expected result | Type |
|---|---|---|---|
| APP-01 | Open the landing page | Wound Up landing page loads without critical errors | Browser |
| APP-02 | Select Enter | Application follows the supported entry path | Browser / Emulator |
| APP-03 | WebXR unavailable | Desktop preview or clear fallback is shown | Browser |
| APP-04 | Immersive AR supported | AR entry is requested through the verified framework flow | Hardware |
| APP-05 | AR unavailable but VR supported | Supported immersive fallback is offered | Hardware |
| APP-06 | Exit immersive session | Application returns to a valid state | Hardware |
| APP-07 | Reload deployed page | Application loads from the public URL | Browser |
| APP-08 | Open from a sub-path (not only the domain root) | All assets load correctly | Browser |

## 5. Introduction and progression

| ID | Test | Expected result | Type |
|---|---|---|---|
| PROG-01 | Open trunk | Trunk responds to the intended interaction | Emulator / Hardware |
| PROG-02 | Reveal town | Town unfolds and displays the frozen state | Visual |
| PROG-03 | Receive first letter | Mira's first letter appears | Integration |
| PROG-04 | Open letter | Letter opens and message is readable | Emulator / Hardware |
| PROG-05 | Accept letter | Workbench and parcel sequence begins | Integration |
| PROG-06 | Complete first machine | Associated progression state updates | Integration |
| PROG-07 | Unlock next letter | Only valid progression conditions unlock it | Unit / Integration |
| PROG-08 | Reload after progression | Saved progression is restored | Integration |

## 6. Assembly and interaction

| ID | Test | Expected result | Type |
|---|---|---|---|
| INT-01 | Pinch a tray part | Correct part is selected | Emulator / Hardware |
| INT-02 | Hold selected part | Part follows interaction point stably | Emulator / Hardware |
| INT-03 | Release near valid socket | Part snaps into exact socket transform | Integration |
| INT-04 | Release outside snap radius | Part returns to tray | Integration |
| INT-05 | Place wrong-family part | Placement is rejected with clear feedback | Integration |
| INT-06 | Place compatible but mechanically incorrect part | Part can be installed and later evaluated by solver | Integration |
| INT-07 | Remove installed part | Part detaches after the required pull distance | Emulator / Hardware |
| INT-08 | Select tiny part | Enlarged collider allows reliable selection | Emulator / Hardware |
| INT-09 | Enable Easy Snap | Snap radius changes to the specified 7 cm | Unit / Integration |
| INT-10 | Idle in build mode for 20 seconds | Relevant socket guidance appears without interrupting active interaction | Emulator |
| INT-11 | Use desktop controls | Desktop actions use the same gameplay rules | Browser |

## 7. Mechanical solver

| ID | Test | Expected result | Type |
|---|---|---|---|
| SOL-01 | Empty required socket | Result is `incomplete` | Unit |
| SOL-02 | Direct shaft connection | Angular velocity propagates correctly | Unit |
| SOL-03 | 10T to 20T external gear mesh | Correct ratio and opposite direction | Unit |
| SOL-04 | Belt connection | Correct pulley-radius ratio | Unit |
| SOL-05 | Inconsistent loop | Result is `jams` | Unit |
| SOL-06 | Gear module mismatch | Result is `jams` | Unit |
| SOL-07 | Wrong but compatible gear | Result is `runs_wrong` when targets are outside tolerance | Unit |
| SOL-08 | Correct machine | Result is `runs` | Unit |
| SOL-09 | Worn Music Box spring | Runtime is approximately 1.5 seconds under the defined test setup | Unit |
| SOL-10 | Repeat identical solver input | Result remains deterministic | Unit |
| SOL-11 | Invalid connection reference | Validation fails safely | Unit |
| SOL-12 | Invalid numerical parameter | Invalid input is rejected safely | Unit |

## 8. Machine acceptance

### Music Box

- [ ] Correct parts can be assembled.
- [ ] Incorrect-family parts are rejected.
- [ ] Mechanically incorrect compatible parts are evaluated by the solver.
- [ ] Correct spring produces intended runtime.
- [ ] Worn spring produces the intended short runtime.
- [ ] Cylinder target is 0.4 rad/s within ±10%.
- [ ] Governor animation works.
- [ ] Fixed melody plays.
- [ ] Machine can be placed in its intended plot.

### Carousel

- [ ] Required assembly is possible.
- [ ] Platform target is 0.5 rad/s within ±10%.
- [ ] Horses rise and fall.
- [ ] Canopy lights twinkle.
- [ ] Music Box melody plays.
- [ ] Machine can be placed in its intended plot.

### Windmill and Bakery

- [ ] Required assembly is possible.
- [ ] Sails rotate.
- [ ] Millstone target is 0.6 rad/s within ±15%.
- [ ] Incorrect 12T gear produces the expected wrong-speed symptom.
- [ ] Correct 24T gear fixes the symptom.
- [ ] Flour puffs appear.
- [ ] Bakery chimney and baker animations respond.
- [ ] Oven glow responds.
- [ ] Machine can be placed in its intended plot.

### Clock Tower

This machine is optional and lower priority.

If implemented, test its pendulum, clock hands, bell, and theatre-door behaviour. Do not allow it to delay the core acceptance criteria.

## 9. Winding and operation

| ID | Test | Expected result | Type |
|---|---|---|---|
| WIND-01 | Pinch winding key | Key enters winding interaction | Emulator / Hardware |
| WIND-02 | Rotate wrist 90 degrees | One wind unit is added | Hardware |
| WIND-03 | Rotate through multiple increments | Units are counted without duplicate input | Hardware |
| WIND-04 | Reach eight units | Additional winding is prevented | Integration |
| WIND-05 | Release key | Winding ends cleanly | Emulator / Hardware |
| WIND-06 | Gaze mode winding | Each pinch adds one unit | Emulator / Hardware |
| WIND-07 | Start machine | Runtime follows solver result | Integration |

## 10. Placement and town restoration

| ID | Test | Expected result | Type |
|---|---|---|---|
| TOWN-01 | Grab completed machine | Machine can be moved by its base handle | Emulator / Hardware |
| TOWN-02 | Move to correct plot | Intended plot highlights | Emulator |
| TOWN-03 | Release over valid plot | Machine placement is committed | Integration |
| TOWN-04 | Release over invalid location | Placement is rejected | Integration |
| TOWN-05 | Place machine | Correct plot changes to awakened state | Integration |
| TOWN-06 | Observe wake effect | Ripple lasts approximately 1.5 seconds | Visual |
| TOWN-07 | Observe restored plot | Colour, movement, lighting, and audio respond appropriately | Visual / Hardware |

## 11. X-ray and accessibility

- [ ] Open-palm gesture activates X-ray when supported.
- [ ] Gesture hold duration is approximately 0.4 seconds.
- [ ] Activation distance is within the specified 5–20 cm range.
- [ ] Lens icon alternative works.
- [ ] Casing becomes approximately 15% opaque.
- [ ] Internal moving parts remain visible.
- [ ] Internal parts receive the intended warm glow.
- [ ] Easy Snap uses the 7 cm radius.
- [ ] Gaze-and-pinch can select and grab parts.
- [ ] Gaze-and-pinch can place and remove parts.
- [ ] Gaze-and-pinch supports winding and Run.
- [ ] Essential controls remain usable while seated.

Hardware-dependent gestures must be marked as unverified until tested on a Quest device.

## 12. Save and load

- [ ] Save key is `woundup.save`.
- [ ] Save data contains the expected version.
- [ ] Town placements persist.
- [ ] Letter states persist.
- [ ] Machine completion persists.
- [ ] Settings persist.
- [ ] Malformed JSON does not crash the application.
- [ ] Unsupported versions are handled safely.
- [ ] Storage access failure uses the memory fallback.
- [ ] Restart requires a second confirmation.
- [ ] Save operations do not run every frame.

## 13. Gifting

- [ ] Gift action is available at the intended progression point.
- [ ] Preset engravings are selectable.
- [ ] One completed machine is encoded.
- [ ] Gift URL targets remain below 1500 characters where feasible.
- [ ] Native sharing is attempted where supported.
- [ ] Clipboard fallback works.
- [ ] Visible URL fallback works.
- [ ] Gift viewer parses valid payloads.
- [ ] Invalid payloads display an error.
- [ ] Unknown blueprints are rejected.
- [ ] Unknown parts are rejected.
- [ ] Failed solver validation is rejected.
- [ ] Gift viewer does not alter recipient save data.
- [ ] Desktop and phone inspection controls work.
- [ ] Headset inspection is verified on hardware.

## 14. Visual and audio acceptance

Review the following:

- [ ] Hero assets meet the Blender quality standard.
- [ ] No major final asset looks like an unfinished primitive blockout.
- [ ] Materials match the art direction.
- [ ] Frozen town is cool and desaturated.
- [ ] Awakened town is warm and colourful.
- [ ] Machine animations use correct pivots.
- [ ] Mechanical feedback is understandable.
- [ ] Audio levels are balanced.
- [ ] No sound plays unexpectedly at application startup.
- [ ] Visual effects do not obscure the miniature world.

## 15. Performance acceptance

Targets:

- Aim for 72 FPS.
- Normal gameplay should not fall below 60 FPS.

Check:

- Draw calls.
- Geometry reuse.
- Material reuse.
- Texture memory.
- Transparent surfaces.
- Lighting cost.
- Animation cost.
- Solver execution frequency.
- Memory growth during repeated interactions.

Record actual device, browser, build, scene, and measurement method.

Do not report Quest performance based solely on desktop hardware.

## 16. Release acceptance

A release candidate must satisfy:

- Production build succeeds.
- Automated tests pass.
- Critical browser flows pass.
- No critical console errors.
- Public Vercel URL works.
- All assets load from the deployed path.
- README is complete.
- Repository is accessible.
- Demo video is under three minutes.
- Submission information is complete.
- Known limitations are documented.

## 17. Release blockers

The following are release blockers:

- Core Music Box loop cannot be completed.
- Hands-first core interaction is unusable.
- Machine placement or town restoration is broken.
- Gift viewer crashes on malformed data.
- Production deployment cannot load.
- Critical assets are missing.
- Critical runtime errors prevent gameplay.
- Save corruption causes unrecoverable application failure.

Optional features such as Clock Tower, daily repair, and day/night must not become release blockers if they are cut according to the roadmap.

## 18. Final acceptance rule

A feature is accepted only when its expected behaviour is demonstrated and its relevant tests are recorded.

A successful build is not proof of a successful game.

A successful desktop test is not proof of Quest hardware compatibility.

Keep these distinctions explicit throughout the project.
