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
- Table placement.
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

### 4.1 Table placement and anchoring

Behaviour and the meaning of "suitable" are in `PRODUCT_SPEC.md` §3.2.

| ID | Test | Expected result | Type |
|---|---|---|---|
| TBL-01 | One level surface at table height, in reach and large enough | Surface is chosen; town is at full size | Unit |
| TBL-02 | Each alone: a vertical surface, the floor, a surface above the eyes, one out of reach, one too small | Surface is rejected; result is the stand | Unit |
| TBL-03 | Surface that fits the town only below full size | Town scales evenly to fit, never below 75% or above 100%, with its whole footprint on the surface | Unit |
| TBL-04 | Several suitable surfaces, in any report order | The same surface is chosen every time; one labelled table or desk is preferred | Unit |
| TBL-05 | Seated head pose, facing a table where the room has one, in each built-in room: `sunlit_living_room`, `home_office`, `conference_room`, `open_office`, `kitchen`, `bedroom`, `music_studio`, `open_studio` | Town stands on the table when a suitable surface is reported, otherwise on the stand. The session never fails. Outcome recorded per room | Emulator |
| TBL-06 | Start a session with plane detection withheld, then with anchors withheld | Session starts; stand appears; no error or extra step | Emulator |
| TBL-07 | No surfaces reported | Stand appears within about 2 seconds of the first tracked head pose; trunk opens normally | Emulator |
| TBL-08 | During a session: move the head, change visibility as the headset menu does, recentre the headset view, change or remove the chosen surface | Town does not move and no second choice is made | Emulator |
| TBL-09 | End the session and enter again without reloading | A new choice is made; progress is intact; `woundup.save` holds no coordinates or surface data | Emulator / Integration |
| TBL-10 | Seated head pose with the town on a table: reach the latch, every plot and the workbench with emulated hands | All are within about 60 cm of the chest and about 35° of the line of sight to the town's centre; the angle of that line below level is recorded, and may exceed 35° on a table (`INTERACTION_SPEC.md` §3) | Emulator |
| TBL-11 | Town on an emulated table | Stand is hidden; contact shadows lie on the table; town neither floats nor sinks | Visual / Emulator |
| TBL-12 | Enter in immersive VR, and open the desktop preview | Stand is always used; no surface choice is attempted | Emulator / Browser |
| TBL-13 | Real table in a room known to the headset (record device, browser, room) | Table is detected; trunk and town stand on it with no obvious gap or sinking | Hardware |
| TBL-14 | Full Music Box loop on a real table, including the headset menu, a recentre and a brief tracking loss | Anchor holds; no visible drift or jump | Hardware |
| TBL-15 | No table in reach; a room not set up on the headset; permission declined | Stand appears; session continues without errors | Hardware |
| TBL-16 | Rooms and tables not used before: desk, dining table, low or small table | A reachable surface or the stand is chosen; town scale fits; play is not disrupted | Hardware |
| TBL-17 | Seated reach and viewing comfort on a real table | Latch, plots and workbench are in comfortable reach; viewing angle is comfortable | Hardware |
| TBL-18 | Frame rate with plane detection and anchors on | Target 72 FPS, never below 60; device and build recorded | Hardware |

TBL-13 to TBL-18 are **Blocked**. Reason: there is no headset and no named Quest tester. Action: arrange a Quest 3 or Quest 3S tester (`BUILD_ROADMAP.md` TP-7). Emulated planes are not evidence of real-world plane detection, so passing TBL-05 to TBL-12 never unblocks them.

### 4.2 Fallback stand

Position: about 55 cm ahead and 38 cm below the eyes, measured from the eye position when the stand is placed (`PRODUCT_SPEC.md` §3.2). Angles are measured as defined in `INTERACTION_SPEC.md` §3.

| ID | Test | Expected result | Type |
|---|---|---|---|
| STAND-01 | Stand pose for several eye heights and facing directions | About 55 cm ahead and 38 cm below the eyes at every height, facing the player | Unit |
| STAND-02 | Seated head pose in the emulator with no surface: measure from the eyes to the stand | About 38 cm below and 55 cm ahead, no more than about 35° below a level head-forward; angle recorded | Emulator |
| STAND-03 | Seated head pose with the town on the stand: reach the latch, every plot and the workbench with emulated hands | All are within about 60 cm of the chest and about 35° of the line of sight to the town's centre; the viewing angle is recorded | Emulator |
| STAND-04 | During a session: open the headset menu and move the head; then change eye height and recentre | Menu and head movement leave the stand where it is; recentring places it again from the new eye position | Emulator |
| STAND-05 | Seated comfort on the stand through the Music Box loop (record the player's height, seat, device and browser) | Viewing angle and reach are comfortable; any adjustment needed is recorded | Hardware |

STAND-05 is **Blocked**, for the same reason and with the same action as TBL-13 to TBL-18. Passing STAND-02 to STAND-04 never unblocks it.

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

### 5.1 Daily repair

Rules: `PRODUCT_SPEC.md` §8 and ADR-027. Unit tests pass the local date in rather than reading the clock.

| ID | Test | Expected result | Type |
|---|---|---|---|
| DAILY-01 | Progress state before Letter 5, then after it | Not offered before Letter 5; offered after it | Unit |
| DAILY-02 | Ask for the repair of the same local date twice | The same repair both times | Unit |
| DAILY-03 | Complete the day's repair, then ask again on the same date and on the next date | Not offered again that date; offered again on the next date | Unit |
| DAILY-04 | Complete the day's repair and reload | Completion survives the reload; `dailyDone` holds that local date | Integration |
| DAILY-05 | Finish the story without touching the daily repair | No letter, machine or ending waits on it | Integration |

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
- [ ] Daily completion persists.
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
- Plane detection and anchor cost.
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
- Repository is presentable, if the owner shares it (ADR-022).
- Demo video is under three minutes.
- Submission information is complete.
- Known limitations are documented, including real-world table placement and stand comfort if they have no Hardware evidence.

## 17. Release blockers

The following are release blockers:

- Core Music Box loop cannot be completed.
- Hands-first core interaction is unusable.
- A session fails, or play is blocked, because plane detection or anchoring is unavailable.
- The town jumps or drifts during a session in a way that interrupts play.
- Machine placement or town restoration is broken.
- Gift viewer crashes on malformed data.
- Production deployment cannot load.
- Critical assets are missing.
- Critical runtime errors prevent gameplay.
- Save corruption causes unrecoverable application failure.

Optional features such as Clock Tower and day/night must not become release blockers if they are cut according to the roadmap.

## 18. Final quality checklist: judging criteria

Judges first check that the entry fits the theme and uses the required tools, then score four criteria at 25% each (Official Rules §6, summarised in `APP_AND_WEBSITE_GUIDELINES.md` §5). Run this checklist before submission, after §16.

Record a status for each item as in §3. "Evidence that counts" names the classification (§2) that can pass it. A desktop, Browser or Emulator result is never a Hardware pass: an item that needs Hardware stays Blocked until a Quest test is recorded, and is listed with the known limitations (§16).

The QA agent keeps this checklist and its evidence current; the lead signs it off as part of the release decision. Without a QA agent, the lead does both.

### Before scoring (pass or fail)

| ID | Check | Proven by | Evidence that counts |
|---|---|---|---|
| JUD-01 | The entry fits the theme, the Gaming track and the New Experience division, and uses the required tools | `APP_AND_WEBSITE_GUIDELINES.md` §4, §7 | Manual |

### Innovation & Creativity (25%)

| ID | Check | Proven by | Evidence that counts |
|---|---|---|---|
| JUD-02 | An original idea that depends on presence and real-world scale: a clockwork town standing on the player's own table | `PROJECT_BIBLE.md`; `PRODUCT_SPEC.md` §3.2; TBL-11, TBL-13 | Visual / Emulator; Hardware for a real table |
| JUD-03 | Machines work because their mechanisms work: the solver decides the result, not a canned animation | SOL-01 to SOL-12; §8 | Unit / Integration |
| JUD-04 | Device capabilities drive play: hands-first assembly, scene understanding and anchors for the table, a gaze path | §4.1, §6, §11 | Emulator for the flow; Hardware for real hands and surfaces |

### Experience Design (25%)

| ID | Check | Proven by | Evidence that counts |
|---|---|---|---|
| JUD-05 | Seated, hands-first journey: the whole main loop is done sitting, with no controller, no standing and no locomotion | `APP_AND_WEBSITE_GUIDELINES.md` §1; INT-01 to INT-08, WIND-01 to WIND-05, TOWN-01 | Emulator for the flow; Hardware for real hands |
| JUD-06 | Passthrough is purposeful and the real room changes the experience: the table is the town's ground, shadows fall on it, its size sets the town's scale; the stand is only the fallback | `PRODUCT_SPEC.md` §3.2; TBL-03, TBL-11, TBL-13 | Unit / Visual / Emulator for behaviour; Hardware for a real room |
| JUD-07 | FoV-aware: essential UI and interactions stay within about 35° of the line of sight to the town's centre and about 60 cm of the chest, on a table and on the stand; the stand's centre sits no more than about 35° below a level head-forward (angles as defined in `INTERACTION_SPEC.md` §3) | `INTERACTION_SPEC.md` §3; `UI_UX_SPEC.md` §23; TBL-10, STAND-02, STAND-03, TBL-17, STAND-05 | Emulator for angle and reach; Hardware for comfort |
| JUD-08 | Onboarding without a wall of text: ghost hands teach the steps in `COMPETITION_REQUIREMENTS.md` §5.1, and a first-time player finishes the Music Box loop within 5 minutes | `PRODUCT_SPEC.md` §15; `UI_UX_SPEC.md` §24; `COMPETITION_REQUIREMENTS.md` §5.2 | Manual with a first-time tester (record emulator or Quest) |
| JUD-09 | Habit-forming reason to return: letters unlock across sessions, progress survives a reload, a daily repair each local day, a machine to gift | PROG-07, PROG-08, DAILY-01 to DAILY-05; §12, §13; `PRODUCT_SPEC.md` §8 | Unit / Integration / Browser |
| JUD-10 | Easy in, easy out: menus work by hand, pause and resume are clean, exiting returns to a valid state | APP-06; `UI_UX_SPEC.md` §19 | Emulator; Hardware for APP-06 |

### Technical Implementation (25%)

| ID | Check | Proven by | Evidence that counts |
|---|---|---|---|
| JUD-11 | Minimum 60 fps on Quest hardware (target 72) through the main loop, with plane detection and anchors on | §15; TBL-18 | Hardware only |
| JUD-12 | Hand tracking end to end: pinch, grab, snap, remove, wind, run and place with tracked hands | INT-01 to INT-08, WIND-01 to WIND-07, TOWN-01 to TOWN-03 | Emulator for the flow; Hardware for real tracking (WIND-02, WIND-03) |
| JUD-13 | Gaze path: gaze-and-pinch selects, places, removes, winds and runs, and finishes the main loop | §11; WIND-06 | Emulator; Hardware for gaze on a Quest |
| JUD-14 | Scene understanding and anchoring: a suitable table is chosen, anchored and holds for the whole session | TBL-01 to TBL-09, TBL-13, TBL-14 | Unit / Emulator for logic; Hardware for real detection and drift |
| JUD-15 | Holds up in rooms the developer never tested: a table or the stand is chosen in every room and a session never fails | TBL-05, TBL-06, TBL-07, TBL-15, TBL-16 | Emulator for logic and fallback; Hardware for real rooms |
| JUD-16 | Bug-free: no P0 or P1 bugs, no release blocker (§17), automated tests pass, no critical console errors, the public URL loads in a private window | `TESTING_QA_PLAN.md` §5; §16, §17; APP-07, APP-08 | Unit / Browser for build and URL; Hardware for a crash-free headset session |

### Polish & Presentation (25%)

| ID | Check | Proven by | Evidence that counts |
|---|---|---|---|
| JUD-17 | Sound design: audio reinforces assembly, winding, mechanical operation and the town waking; levels are balanced; nothing plays at startup | §14; TOWN-07; `UI_UX_SPEC.md` §22 | Manual in the browser or emulator; Hardware for headset audio |
| JUD-18 | Cohesive art direction: hero assets meet the Blender standard, materials and palette match, frozen and awakened states are distinct, nothing looks like a placeholder | §14; `ART_ASSET_PIPELINE.md`; `UI_UX_SPEC.md` §3 | Visual at gameplay scale in the emulator; Hardware for the look in passthrough |
| JUD-19 | UI and text: the entry screen meets `APP_AND_WEBSITE_GUIDELINES.md` §2 (never scrolls, AA contrast, one obvious action), letters are readable, the stand reads as deliberate | APP-01; `UI_UX_SPEC.md` §25 | Browser for the entry screen; Emulator for text in the headset, Hardware to confirm |
| JUD-20 | Video: under 3 minutes, public on YouTube or Vimeo, shows real gameplay that honestly represents the experience, leads with the story and what makes it distinct, does not lean on AI-generated video; emulator footage is shown as what it is | `COMPETITION_REQUIREMENTS.md` §8; `APP_AND_WEBSITE_GUIDELINES.md` §4 | Manual review of the final cut (emulator footage is allowed but is not Hardware evidence) |
| JUD-21 | Text and images: tagline, description and images match the build and claim nothing we cannot back up | `COMPETITION_REQUIREMENTS.md` §9; `APP_AND_WEBSITE_GUIDELINES.md` §2, §4 | Manual |

## 19. Final acceptance rule

A feature is accepted only when its expected behaviour is demonstrated and its relevant tests are recorded.

A successful build is not proof of a successful game.

A successful desktop test is not proof of Quest hardware compatibility.

Keep these distinctions explicit throughout the project.
