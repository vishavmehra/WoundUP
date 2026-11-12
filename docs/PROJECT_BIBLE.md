# WOUND UP — PROJECT BIBLE

**Project:** Wound Up  
**World:** Tockton  
**Tagline:** Build the machines. Wake the town. Raise the curtain.  
**Genre:** Seated, hands-first mixed-reality clockwork building game  
**Platform:** Meta Quest 3 / Quest 3S  
**Technology:** IWSDK, WebXR, Three.js, TypeScript  
**Competition:** Meta VR Start Developer Competition 2026  
**Track:** Gaming  
**Division:** New Experience  
**Completion target:** November 18, 2026 (IST)

---

# 1. THE IDENTITY OF WOUND UP

Wound Up is a handcrafted miniature world that lives on the player's real-world table.

The player discovers a little town called Tockton. Its buildings, streets, machines and people are frozen in time.

The town has lost its movement, sound and colour.

A series of letters from its residents asks the player to help restore its mechanical heart.

The player becomes the town's clockmaker.

Instead of simply pressing buttons to activate machines, the player physically assembles them using their hands.

Every mechanical component has a purpose.

Gears transfer motion. Shafts connect mechanisms. Springs store energy. Cams control movement. Pendulums swing. Cylinders play music.

When a machine finally works, the player can feel that they built something real.

The machine is then placed into Tockton, restoring movement, colour, sound and life to its surroundings.

## Central fantasy

**LEGO where every piece is a real, working mechanical part.**

## Emotional experience

The player should feel:

- Curiosity when opening the trunk.
- Wonder when discovering Tockton.
- Warmth when receiving letters from residents.
- Satisfaction when assembling mechanical components.
- Anticipation when winding a machine.
- Delight when it starts working.
- Pride when placing it into the town.
- Emotional attachment as Tockton gradually wakes up.

The experience should feel personal, peaceful, tactile and rewarding.

It should never feel like a technical engineering simulator or a complicated mechanical CAD application.

---

# 2. THE WORLD — TOCKTON

Tockton is a tiny European-inspired clockwork town.

It should look like a miniature world that someone has carefully handcrafted.

The town is not a large open environment.

It is a compact diorama designed to stand on the player's real table, detected and anchored when they enter. The table is its ground. A floating stand is the fallback when no table can be used.

## World characteristics

- Small streets.
- Miniature buildings.
- A bakery.
- A carousel square.
- A windmill.
- A clock tower.
- A theatre facade.
- Mechanical decorations.
- Warm windows.
- Small figures and environmental details.

There is no flower shop (owner decision of 2026-11-06, ADR-039). The small figures are Mira and Otto only ([TOCKTON_CHARACTERS.md](TOCKTON_CHARACTERS.md)).

The town must be readable from a comfortable seated position.

Its important locations should be immediately recognisable.

## Town dimensions

- Maximum town footprint: approximately 60 x 40 cm.
- On a smaller table the town scales down to as little as 75% (`PRODUCT_SPEC.md` §3.2), so its silhouettes must still read at that size.
- Workbench: approximately 45 x 25 cm.
- All important interactions within approximately 60 cm of the player's chest.

Do not increase the world size just to add visual detail.

Use carefully designed silhouettes, layered depth and miniature environmental storytelling.

## Frozen Tockton

At the beginning, the town is frozen.

Its buildings and objects are still.

Its colours are muted.

Its machinery does not operate.

The environment should feel quiet, slightly mysterious and full of potential.

## Awakened Tockton

Every completed machine restores part of the town.

The transformation should be visually noticeable.

Examples:

- Windows begin glowing.
- Buildings regain their colour.
- Mechanical objects start moving.
- The bakery begins operating.
- The carousel rotates.
- The windmill turns.
- Ambient sounds return.
- Small environmental animations begin.

The awakening should feel like the player is bringing an entire miniature world back to life.

---

# 3. VISUAL ART DIRECTION

This is one of the most important parts of the project.

Wound Up must not look like a generic Three.js prototype.

The intended style is:

**Mature vintage storybook illustration meets an antique horology catalogue.**

The visual language combines:

- Mid-century European children's book illustration.
- Antique clockwork engineering.
- Miniature handcrafted architecture.
- Fine ink illustration.
- Soft gouache-like surfaces.
- Warm wooden materials.
- Aged brass mechanisms.
- Cream enamel details.
- Restrained magical lighting.

The result should feel like a premium handcrafted miniature.

## 3.1 Visual quality principles

1. Every major object must have a deliberate silhouette.
2. Important objects must have believable proportions.
3. Materials must communicate what an object is made from.
4. Mechanical details must be readable.
5. Bevelled edges should give objects a crafted appearance.
6. Decorative details must support the design rather than create clutter.
7. The world must maintain consistent scale.
8. All models must look good from multiple viewing angles.
9. Important objects must remain readable at Quest display resolution.
10. No placeholder-quality models should remain in the final build.

Avoid:

- Generic low-poly models.
- Unmodified primitive geometry for final hero objects.
- Random decorative details.
- Excessive metallic surfaces.
- Oversaturated colours.
- Cheap-looking plastic materials.
- Inconsistent bevels.
- Poor UVs.
- Flat lighting.
- Visually noisy particle effects.
- Excessive glow and bloom.

---

# 4. COLOUR PALETTE

Use the following palette consistently.

| Colour | Hex | Usage |
|---|---|---|
| Aged brass | #C9A227 | Gears, keys, mechanical details |
| Walnut | #5B3A24 | Wooden structures and machine cases |
| Cream | #F2E6CF | Enamel, paper, walls and UI |
| Deep teal | #1F5C5C | Roofs, ribbons and important accents |
| Warm lamp glow | #FFC66D | Windows, lamps and magical highlights |

## Colour rules

- Walnut should be the primary wood material.
- Brass should be used for mechanical details and highlights.
- Cream should provide visual balance.
- Teal should create contrast and identity.
- Warm gold light should communicate activity and life.

Do not use every colour equally.

The visual hierarchy should remain restrained and elegant.

---

# 5. MATERIAL DESIGN

Create reusable material definitions.

## Walnut

- Warm brown.
- Visible wood character.
- Subtle roughness.
- Carefully controlled variation.
- Bevelled edges.

## Aged brass

- Slightly worn golden appearance.
- Metallic highlights.
- Subtle roughness variation.
- Avoid excessively reflective surfaces.

## Polished brass

- Used for selected important mechanical elements.
- Slightly brighter than aged brass.
- Should draw attention to moving components.

## Cream enamel

- Smooth, lightly reflective surface.
- Warm ivory appearance.
- Used for clock faces, decorative panels and painted components.

## Teal paint

- Deep teal.
- Soft painted finish.
- Used on roofs, ribbons and selected structures.

## Glass

- Warm, subtle transparency.
- Used sparingly for windows and selected decorative elements.
- Must remain performant on Quest.

## Paper and fabric

- Paper should look slightly aged.
- Fabric should have a soft matte finish.
- Avoid overly detailed textures that become invisible at miniature scale.

---

# 6. FROZEN AND AWAKENED VISUAL STATES

Every important town object must support two visual states.

## Frozen

- Approximately 0.15 saturation.
- Cool tint.
- No unnecessary animation.
- Muted lighting.
- Quiet atmosphere.

## Awakened

- Full colour.
- Appropriate mechanical animations.
- Warm light.
- Sound effects.
- Small environmental movement.

The transition should be smooth.

## Wake effect

When a completed machine is placed:

1. The machine snaps into its town plot.
2. A colour ripple spreads through the surrounding area.
3. The plot returns to full colour.
4. Its mechanical components begin moving.
5. Lighting and audio respond.
6. Connected town objects activate where applicable.

Target wake ripple duration: approximately 1.5 seconds.

Do not use an excessive particle explosion.

The effect should feel elegant and magical.

---

# 7. 3D MODELLING STANDARD

Blender is the primary tool for important handcrafted 3D objects.

Use Blender for:

- Trunk.
- Buildings.
- Bakery.
- Windmill.
- Music Box casing.
- Carousel structure.
- Clock Tower.
- Theatre facade.
- Gift box.
- Major decorative objects.
- Characters and figures.

Build repetitive mechanical objects as parametric Blender GLB families, loaded once, cached and placed as instances, where that gives better consistency and efficiency (ADR-031). The game does not generate part geometry in TypeScript.

Examples:

- Gears.
- Shafts.
- Springs.
- Pins.
- Simple cranks.
- Repeated mechanical connectors.

## 7.1 Modelling principles

Every major model should have:

- A strong silhouette.
- Correct proportions.
- Appropriate bevels.
- Consistent scale.
- Proper origins and pivots.
- Suitable UV mapping.
- Appropriate PBR materials.
- Optimised geometry.
- Correct export settings.

## 7.2 Asset pipeline

1. Establish reference and dimensions.
2. Create the model in Blender.
3. Inspect from all expected gameplay viewpoints.
4. Apply materials.
5. Set origins and pivots.
6. Optimise geometry.
7. Export as GLB/glTF.
8. Load into the IWSDK application.
9. Verify orientation, scale and materials.
10. Test performance and interaction.

Maintain original Blender source files where practical.

Do not load huge, unoptimised assets into the Quest runtime.

## 7.3 Model quality gate

Before a major model is accepted, review:

- Silhouette.
- Proportions.
- Material quality.
- Geometry quality.
- Texture quality.
- Scale.
- Pivot placement.
- Interaction collider.
- Performance.
- Consistency with the overall art direction.

A model that merely loads successfully is not necessarily a finished model.

---

# 8. LIGHTING AND ATMOSPHERE

The game should have warm, soft and controlled lighting.

Baseline lighting:

- One hemisphere light.
- One directional light.
- No real-time shadows on moving mechanical parts.
- Blob-shadow decals where appropriate.

Avoid expensive lighting techniques.

## Night mode

If implemented:

- Reduce ambient light.
- Use emissive windows.
- Use no more than four point lights.
- Maintain readable mechanical details.

Lighting must not make the game uncomfortable or hide important objects.

---

# 9. AUDIO IDENTITY

Use procedural Web Audio synthesis.

Audio should make mechanical interactions feel meaningful.

Required sound categories:

- Trunk opening.
- Envelope interaction.
- Parcel opening.
- Part pickup.
- Part snapping.
- Incorrect part placement.
- Mechanical winding.
- Gear movement.
- Machine starting.
- Machine stopping.
- Machine jam.
- Music Box melody.
- Carousel music.
- Windmill operation.
- Bakery activity.
- Town awakening.
- Gift reveal.

## Audio principles

- Warm and subtle.
- Mechanical but not harsh.
- No excessively loud sounds.
- Clear feedback for successful interactions.
- Distinct sounds for errors.
- Appropriate spatial placement where supported.

Do not require external audio files.

Use procedural synthesis wherever practical.

---

# 10. INTERACTION DESIGN

All interactions must feel natural.

The game is hands-first.

The player should not need a controller.

Primary interactions:

- Pinch.
- Grab.
- Release.
- Twist.
- Poke.
- Gaze-and-pinch.
- Ray interaction.

Every interaction should have visual and audio feedback.

A successful snap should feel precise.

A wrong part should clearly communicate why it cannot be placed.

Winding should feel satisfying and responsive.

Never make the player perform uncomfortable or excessive movements.

---

# 11. UI AND TYPOGRAPHY

The interface should feel like part of the miniature world.

Use:

- Cream paper panels.
- Teal accents.
- Brass details.
- Warm highlights.
- Restrained decorative borders.
- Clear readable typography.

Letters should look like physical correspondence.

Blueprints should look like carefully illustrated mechanical documents.

The parts tray should be organised and readable.

Avoid:

- Floating generic web cards.
- Excessive text.
- Large conventional dashboard panels.
- Unnecessary buttons.
- Tiny text.
- Decorative UI that obscures the machine.

Use animated demonstrations and ghost hands rather than text-heavy tutorials.

---

# 12. ANIMATION PRINCIPLES

Movement should be smooth and deliberate.

Use:

- Easing for object placement.
- Small mechanical oscillations.
- Controlled gear rotations.
- Pendulum motion.
- Gentle light flicker.
- Subtle environmental animations.

Avoid:

- Abrupt movements.
- Unnecessary bouncing.
- Excessive camera motion.
- Uncontrolled physics.
- Animations that obscure interactions.

No forced camera movement.

No locomotion.

The player remains seated.

---

# 13. PERFORMANCE AND VISUAL QUALITY BALANCE

Target 72 FPS on Quest 3/3S and never below 60 FPS.

Visual quality must not come at the cost of a poor experience.

Use:

- Cached geometry.
- Shared materials.
- Instancing.
- Optimised GLB models.
- Sensible texture resolution.
- Efficient colliders.
- Blob shadows.
- Limited lights.
- Efficient animation.

Profile the actual application.

Do not assume that a beautiful Blender render means the real-time model will perform well.

---

# 14. CONSISTENCY RULES FOR ALL AGENTS

Every agent creating a model, material, effect or interface must follow this document.

Before creating a new visual asset:

1. Check whether a similar asset already exists.
2. Reuse the shared palette.
3. Reuse established material conventions.
4. Follow the project scale.
5. Follow Blender export conventions.
6. Check existing references.
7. Avoid introducing a new visual style.

If a new visual direction is necessary, discuss it with the lead architect first.

Do not allow the game to become a collection of unrelated assets created by different agents.

---

# 15. FINAL ART DIRECTION TEST

Before accepting the final experience, ask:

- Does Tockton feel like a real handcrafted miniature town?
- Do the machines look like believable clockwork objects?
- Does the player understand what each component does?
- Do frozen and awakened states feel meaningfully different?
- Do materials look intentional?
- Are the animations smooth?
- Does the lighting create a warm atmosphere?
- Does the world feel premium rather than like a prototype?
- Does the visual quality remain good in the actual Quest application?

The answer should be yes.

**The game must feel like a little world worth caring about.**