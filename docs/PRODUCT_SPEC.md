# WOUND UP — PRODUCT SPECIFICATION

**Product:** Wound Up  
**World:** Tockton  
**Platform:** Meta Quest 3 / Quest 3S  
**Runtime:** IWSDK WebXR  
**Track:** Gaming  
**Division:** New Experience  
**Development deadline:** November 18, 2026 (IST)  
**Code freeze:** November 16, 2026

---

# 1. PRODUCT OVERVIEW

Wound Up is a seated, hands-only mixed-reality clockwork building game.

The player discovers a miniature frozen town called Tockton.

Letters from townsfolk introduce machines that need to be built or repaired.

The player assembles the machines piece by piece, winds them and watches their mechanical systems operate.

Each completed machine is placed into the town, restoring colour, movement, lighting and sound.

The game is built around tactile mechanical construction and satisfying cause-and-effect interactions.

## Tagline

**Build the machines. Wake the town. Raise the curtain.**

## Primary product goal

Deliver a polished and memorable first gameplay experience within five minutes.

The player should be able to complete a meaningful machine-building experience without controllers.

---

# 2. TARGET PLATFORM AND EXPERIENCE

## Hardware

- Meta Quest 3.
- Meta Quest 3S.

## Interaction

- Hands-first.
- Controllers may be supported where available.
- Controllers must never be required.
- Every core gameplay action must be possible with hands.

## Comfort

- Seated.
- Stationary.
- No locomotion.
- No forced camera movement.
- No large physical movements.
- Interactions within approximately 60 cm of the player's chest.

## Performance

- Target 72 FPS.
- Never below 60 FPS on target hardware.

## Delivery

- IWSDK WebXR application.
- Static client-side application.
- Vercel (static hosting).
- HTTPS.

---

# 3. PLAYER EXPERIENCE FLOW

## 3.1 Landing page

Display:

- Wound Up title.
- Tagline.
- Enter button.

When Enter is selected:

1. Enter immersive-ar when supported.
2. Otherwise enter immersive-vr when supported.
3. Otherwise show desktop 3D preview.

Do not block the player with unnecessary setup screens.

## 3.2 Trunk introduction

A wooden trunk appears on the player's table.

Approximate trunk dimensions:

- 35 cm width.
- 25 cm depth.
- 20 cm height.

If no suitable plane is detected, display a floating velvet stand.

Fallback placement:

- Approximately 45 cm below eye level.
- Approximately 55 cm ahead of the player.

The player pinches the latch.

The trunk opens.

## 3.3 Town discovery

Tockton unfolds from the trunk.

The town is frozen and desaturated.

The player sees four machine plots, a bakery and a theatre facade.

A letter appears automatically after the trunk opens.

## 3.4 Letter interaction

The player pinches the envelope.

The letter opens.

The player reads the request and accepts it.

## 3.5 Parcel and workbench

After accepting:

- Workbench slides into view.
- Parcel opens.
- Blueprint appears.
- Parts tray appears.
- Build mode starts.

## 3.6 Assembly

The player picks up parts and snaps them into valid blueprint sockets.

Each successful placement gives visual and audio feedback.

## 3.7 Wind and run

The player pinches the winding key and rotates their wrist.

The mechanism stores energy.

On release, the simulation determines the machine's behaviour.

Possible results:

- Correct operation.
- Incorrect operation.
- Jam.
- Incomplete assembly.

## 3.8 Town placement

A correctly completed machine can be grabbed by its base handle.

The player places it on the correct town plot.

The area wakes up with colour, light, sound and animation.

---

# 4. GAME MODES

## Town

The player views and interacts with Tockton.

## Build

The player assembles machine parts using a blueprint and tray.

## Wind

The player winds the mechanism and runs it.

## Place

The player places a finished machine into its designated town plot.

## Gift

The player prepares a shareable link for one finished machine.

## Pause

The player can:

- Resume.
- Restart chapter.
- Toggle X-ray hint.
- Change accessibility settings.

---

# 5. FEATURE INVENTORY

The following feature identifiers must remain consistent throughout the project.

| ID | Feature | Priority |
|---|---|---|
| F1 | Trunk introduction and town placement | Must |
| F2 | Frozen town, four machine plots, bakery and theatre facade | Must |
| F3 | Letter system and parcel opening | Must |
| F4 | Build mode with pinch-and-snap assembly | Must |
| F5 | Wind mode and mechanical solver | Must |
| F6 | Music Box | Must |
| F7 | Carousel | Must |
| F8 | Windmill powers Bakery | Must |
| F9 | Clock Tower opens theatre doors on the hour | Should |
| F10 | Place finished machine and wake town plot | Must |
| F11 | X-ray view | Must |
| F12 | Story repair letters and daily repair | Story repairs Must; daily Should |
| F13 | Gift one finished machine using a link | Must |
| F14 | Save and load progress | Must |
| F15 | Ghost-hand onboarding | Must |
| F16 | Day/night lighting toggle | Should |
| F17 | Accessibility options | Must |
| F18 | Pause menu | Must |

---

# 6. MACHINES

## 6.1 Music Box

**Priority:** Must.

**Parts:** 12.

The Music Box is the first machine.

It establishes the entire mechanical gameplay loop.

### Required components

- Main spring.
- Cylinder.
- Comb.
- Governor.
- Supporting mechanical parts defined by its blueprint.

### Behaviour

- Winding stores energy.
- Cylinder rotates.
- Comb plays the fixed melody.
- Governor spins.
- The machine stops when stored energy is exhausted.

### Target

Cylinder angular velocity:

`0.4 rad/s ±10%`

### Gameplay importance

The Music Box must be completed before expanding into other machines.

It is the first vertical slice and the main integration test for the project.

---

## 6.2 Carousel

**Priority:** Must.

**Parts:** 20.

### Behaviour

- Platform rotates.
- Horses rise and fall.
- Canopy lights twinkle.
- Music Box melody plays.

### Target

Platform angular velocity:

`0.5 rad/s ±10%`

The Carousel should feel playful but retain the project's elegant vintage aesthetic.

---

## 6.3 Windmill

**Priority:** Must.

**Parts:** 24.

### Behaviour

- Wind powers the sails.
- Millstone rotates.
- Flour puffs appear.
- Bakery is activated.

### Bakery behaviour

When the Windmill operates:

- Chimney smoke appears.
- Baker kneads.
- Oven glows.

### Target

Millstone angular velocity:

`0.6 rad/s ±15%`

The Windmill and Bakery connection is important because it demonstrates that machines can affect other objects in the town.

---

## 6.4 Clock Tower

**Priority:** Should. Cut first if behind schedule.

**Parts:** 32.

### Behaviour

- Pendulum swings.
- Clock hands show real local time.
- Hourly bell strikes.
- Theatre doors open for 30 seconds.

This feature should only be developed after the core machines, town and gifting are stable.

---

# 7. STORY AND LETTERS

Letters are the narrative mechanism.

They should feel like physical correspondence from people who live in Tockton.

## Letter 1 — Mira

“My grandmother's music box went quiet the night the clock stopped. Could you make it sing again?”

Purpose:

- Introduce the Music Box.
- Start the first build.

## Letter 2 — Mira

“It plays! But only for a moment, then it sighs and stops. Is it tired?”

Purpose:

- Introduce the worn spring repair.

## Letter 3 — Schoolteacher

“The children press their noses to the carousel every morning. Could you make it turn again?”

Purpose:

- Introduce the Carousel.

## Letter 4 — Otto

“No wind, no windmill. No windmill, no flour. No flour, no bread. Please help.”

Purpose:

- Introduce the Windmill and Bakery.

## Letter 5 — Otto

“The windmill spins like it's late for something! Flour everywhere. Something's not right inside.”

Purpose:

- Introduce the incorrect gear repair.

## Letter 6 — Theatre keeper

“The theatre doors only open when the clock tower rings. Tockton hasn't heard it in years.”

Purpose:

- Introduce the Clock Tower, if implemented.

## Closing card

“Tockton is waking up. The show is coming soon.”

Do not add unnecessary dialogue or an unrelated story system.

---

# 8. STORY REPAIRS

Repairs teach the player that mechanical components have real consequences.

## Music Box repair

Problem:

The Music Box uses a worn spring.

Symptom:

It runs for approximately 1.5 seconds and stops.

Solution:

Replace the worn spring.

## Windmill repair

Problem:

The Windmill uses a 12-tooth spur gear where a 24-tooth gear is required.

Symptom:

The millstone rotates approximately twice as fast as intended.

Solution:

Replace the incorrect gear with a 24-tooth gear.

## Daily repair

A deterministic daily repair may be implemented.

Rules:

- Available after Letter 5.
- Deterministic based on local date.
- Only one completion per date.

This is lower priority.

---

# 9. BUILD MODE

The player receives:

- Blueprint.
- Parts tray.
- Mechanical sockets.
- Assembly instructions through visual cues.

Parts are picked up using pinch interactions.

A valid part can be placed into a compatible socket.

## Snap rules

- Default snap radius: 4 cm.
- Easy Snap: 7 cm.
- Valid preview: 50% opacity ghost part with warm outline.
- Valid release: 120 ms tween into socket, click and spark.
- Wrong family: red outline, return to tray, soft bonk.
- Size mismatches are allowed and may cause incorrect behaviour.

The Music Box should be buildable using 40 pinches or fewer.

Build mode must be intuitive.

Do not make the player perform excessive precision movements.

---

# 10. WIND MODE

The player winds the machine.

## Standard mode

- Pinch the key.
- Rotate wrist.
- Every 90 degrees adds one wind unit.
- Maximum 8 wind units.
- Release to run.

## Gaze accessibility mode

- Each pinch adds one wind unit.
- A Run lever starts the machine.

The mechanical solver determines the result.

---

# 11. TOWN PLACEMENT AND AWAKENING

After a machine runs correctly:

1. The machine becomes eligible for placement.
2. Player grabs the base handle.
3. Correct plot glows.
4. Player releases machine over the plot.
5. Machine snaps into place.
6. Wake ripple begins.
7. Town plot becomes active.

The wake effect should be approximately 1.5 seconds.

Each machine activates its own town location.

The Windmill also activates the Bakery.

---

# 12. X-RAY MODE

X-ray allows the player to inspect internal mechanisms.

Activation:

- Open palm facing down.
- Hold approximately 5–20 cm above machine.
- Maintain for 0.4 seconds.

Accessibility alternative:

- Lens icon.

Appearance:

- Casing/structural parts approximately 15% opacity.
- Cool rim.
- Moving mechanical parts remain opaque.
- Moving parts receive warm highlights.

X-ray should make the mechanical structure easier to understand.

---

# 13. GIFT SYSTEM

Only a single finished machine can be gifted.

Do not implement whole-town gifting.

After Letter 2, finished machines can show a ribbon icon.

## Gift panel

Show a machine preview and allow selection from these preset engravings:

1. For you
2. Happy birthday
3. Thinking of you
4. Thank you
5. With love
6. Congratulations
7. Made this for you
8. Wind me up

## Link generation

The machine state is:

1. Serialized to JSON.
2. Compressed using `CompressionStream('deflate-raw')`.
3. Converted to base64url.
4. Stored in the URL hash using `#g=<data>`.

Target URL length: under 1500 characters.

## Validation

The viewer must reject:

- Unknown blueprints.
- Unknown parts.
- Invalid machine configurations.
- Failed solver results.
- Malformed data.

Show an error card when validation fails.

## Sharing

Use:

1. `navigator.share` when available.
2. Clipboard fallback.
3. Visible URL fallback.

## Gift viewer

- Works in ordinary browsers.
- Does not load the player's game save.
- Shows wrapped machine.
- Click, tap or pinch to unwrap.
- Machine winds itself and runs.
- Desktop/phone supports orbit.
- Headset supports grabbing, turning and X-ray.
- Show a Make Your Own link.

---

# 14. SAVE AND LOAD

Use localStorage.

Storage key:

`woundup.save`

Versioned structure:

`SaveV1`

Required fields:

- Version.
- Town placed.
- Letter statuses.
- Machine build state.
- Machine placements.
- Daily repair completion dates.
- Accessibility settings.
- X-ray hint.
- Night setting.

Save after:

- Letter state changes.
- Successful machine placement.

All storage access must be protected by try/catch.

If storage is unavailable, the game must continue using in-memory state.

Pause menu restart requires a second pinch confirmation.

---

# 15. ONBOARDING

Use animated ghost hands.

Do not use text walls.

Demonstrate:

- Pinching.
- Picking up a part.
- Moving a part.
- Snapping.
- Winding.
- Releasing.
- Placing a machine.

When the player is inactive in Build mode for 20 seconds:

1. Pulse the next required socket.
2. Replay the ghost-hand demonstration.

Tutorial cues should disappear after the player successfully performs the action.

---

# 16. ACCESSIBILITY

Required options:

- Gaze-and-pinch.
- Easy Snap.
- Ray interaction mode.

Easy Snap uses a 7 cm radius.

Gaze mode must provide alternatives to gestures that are difficult to perform.

All essential gameplay remains seated-accessible.

---

# 17. PAUSE MENU

The pause menu must include:

- Resume.
- Restart from beginning.
- X-ray hint toggle.
- Accessibility settings.

Restart requires a second pinch confirmation.

Pause and resume must work cleanly.

---

# 18. OUT-OF-SCOPE FEATURES

The following are forbidden in this competition build:

- Humming.
- Voice input.
- Microphone.
- Melody composition.
- Editing music pins.
- Choreography.
- Carving cams.
- Tram.
- Lighthouse.
- Grand Theatre performance.
- Hot-air balloon.
- Free-build workshop.
- Weekly commissions.
- Seasonal parts.
- Festivals.
- Rarity tiers.
- Ranks.
- XP.
- Currency.
- Shop.
- Whole-town gifting.
- Accounts.
- Login.
- Cloud save.
- Leaderboards.
- Analytics.
- Telemetry.
- Multiplayer.
- AI/LLM calls.
- Passthrough camera/computer vision.
- In-app purchases.
- Text keyboards in VR.
- Unity.
- Unreal.
- Native APK.

If an agent suggests these features, reject implementation and add the idea to `docs/IDEAS.md` if appropriate.

---

# 19. PRIORITY AND CUT STRATEGY

The project must be completed by November 18, 2026 (IST).

Code freeze is November 16.

If development falls behind, cut in this order:

1. Clock Tower and theatre hourly behaviour.
2. Day/night toggle.
3. Daily repair.
4. Decoy parts.

Never cut:

- Core Music Box gameplay.
- Hands-first interactions.
- Mechanical solver.
- Town placement.
- Town wake effect.
- Gift link.
- Onboarding.

Do not allow lower-priority features to delay the first complete gameplay loop.

---

# 20. PRODUCT SUCCESS CRITERIA

Wound Up is successful when:

1. A player can enter the experience quickly.
2. The trunk and town create an immediate sense of discovery.
3. The player understands the first letter.
4. The player can assemble the Music Box using hands.
5. Mechanical assembly feels precise and satisfying.
6. Winding feels natural.
7. The Music Box runs correctly.
8. The machine produces satisfying sound and motion.
9. The player places it into town.
10. The town visibly wakes up.
11. Progress persists.
12. A finished machine can be gifted.
13. The experience works without controllers.
14. The application runs smoothly on Quest.
15. The visual quality feels like a polished, handcrafted game.

**Our goal is not to show how much code we wrote. It is to make the player care about Tockton.**