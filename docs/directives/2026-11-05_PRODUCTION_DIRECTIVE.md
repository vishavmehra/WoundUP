# Owner directive, 2026-11-05 22:53 IST (re-sent 2026-11-06)

Verbatim copy of the production directive and the multiple-worlds requirement the owner pasted into the Claude Code session. Kept so agents read the source rather than a summary. The pasted parts are separated by horizontal rules. A third part, the world-by-world production strategy, was added on 2026-11-06 13:38 IST and is at the end.

---

# WOUND UP — MASTER PRODUCT, TECHNICAL ARCHITECTURE, DOCUMENTATION AND 3D ASSET PRODUCTION DIRECTIVE

You are the principal technical architect, game director, 3D production director, WebXR engineer, mechanical simulation engineer, and project execution coordinator for WOUND UP.

Your responsibility is to evolve the existing repository into a complete, polished, technically sophisticated mixed-reality game.

This is a substantial game production project. Do not treat it as a small Three.js experiment.

The project requires a complete game architecture, a living miniature world, a deterministic mechanical simulation system, sophisticated hand interactions, professional 3D assets, spatial integration, story systems, and a controlled asset-production pipeline.

The estimated asset requirement is approximately 180–200 individual GLB deliverables. This number must be validated by auditing the actual project requirements and should not be achieved by artificially splitting or duplicating assets.

Your first responsibility is to establish the complete production plan, documentation, asset inventory, agent ownership, and implementation priorities.

Do not assume that the current documentation already covers every future feature.

---

# PART 1 — UNDERSTAND THE ENTIRE EXISTING PROJECT

Before modifying the application, inspect the repository thoroughly.

Read:

- CLAUDE.md.
- Every relevant file in docs/.
- All architecture decisions and ADRs.
- APP_AND_WEBSITE_GUIDELINES.md.
- Competition requirements and rules.
- Technical architecture.
- Gameplay and interaction specifications.
- Mechanical solver specifications.
- Simulation specifications.
- Data and blueprint specifications.
- Art and asset pipeline.
- UI/UX specifications.
- Acceptance tests.
- Testing and QA plans.
- Deployment and release plans.
- Existing source code.
- Existing package configuration.
- Existing tests.
- Existing assets.
- Existing Blender files.
- All files inside references/.

Do not rely on previous conversation summaries instead of reading the repository.

Inspect every reference image individually.

Create an index connecting:

Reference filename → Visual subject → Relevant written specification → Intended asset → Intended implementation.

The written specifications are authoritative for dimensions, mechanical functionality, component counts, gear ratios, interactions and gameplay.

Visual references communicate appearance, construction, proportions and presentation. They must not override written specifications when they conflict.

If an image contains incorrect numerical labels or mechanical details, follow the documentation.

Do not silently change existing decisions or discard previous work.

## Initial audit deliverable

Create a concise audit documenting:

1. Existing project status.
2. Implemented functionality.
3. Missing functionality.
4. Existing assets.
5. Missing assets.
6. Technical dependencies.
7. Documentation inconsistencies.
8. Reference coverage.
9. Production risks.
10. Competition-critical priorities.
11. Long-term features.
12. Recommended agent structure.

Preserve existing work wherever possible.

---

# PART 2 — ESTABLISH THE LONG-TERM PRODUCT VISION

Wound Up must evolve into a technically sophisticated mixed-reality clockwork civilisation.

Tagline:

BUILD THE MACHINES. WAKE THE TOWN. RAISE THE CURTAIN.

The long-term product combines four connected pillars.

## Pillar A — Living miniature world

- Persistent miniature town.
- Interconnected buildings.
- Mechanical production chains.
- Resident routines and personalities.
- Environmental reactions.
- Unlockable districts.
- Town events.
- Dynamic activities.
- Meaningful consequences for player actions.

## Pillar B — Mechanical engineering

- Gears and gear trains.
- Shafts and couplings.
- Springs and winding systems.
- Cams and followers.
- Cranks and linkages.
- Escapements and pendulums.
- Energy distribution.
- Mechanical timing.
- Fault diagnosis.
- Simulation preview.
- Advanced mechanical puzzles.
- Player-designed machines.

## Pillar C — Story and adventure

- Memorable residents.
- Letters.
- Personal stories.
- Daily mysteries.
- Repair quests.
- Hidden mechanisms.
- Secret compartments.
- Discoverable blueprints.
- Multi-stage story progression.
- Town-wide events.
- Mechanical theatre performances.

## Pillar D — Creative sandbox

- Free-build workshop.
- Modular parts.
- Player-designed mechanisms.
- Blueprint editor.
- Machine validation.
- Saved inventions.
- Shareable blueprints.
- Community challenges.
- Future community gallery.

These four pillars must reinforce each other.

The experience should follow:

DISCOVER → INVESTIGATE → ENGINEER → BUILD → ACTIVATE → TRANSFORM → CREATE → SHARE.

---

# PART 3 — PROTECT THE COMPETITION BUILD

The November 2026 Meta VR Start competition submission is a separate, protected milestone.

Do not interpret this long-term strategy as permission to expand the immediate competition build.

The competition-critical scope remains the documented current experience:

- WebXR foundation.
- IWSDK.
- Three.js.
- Quest 3 and Quest 3S support.
- Hand tracking.
- Table detection and spatial anchoring.
- Frozen miniature town.
- Trunk.
- Workbench.
- Letters and parcels.
- Music Box.
- Carousel.
- Windmill and Bakery.
- Clock Tower only according to its existing priority and available time.
- Mechanical solver.
- X-ray.
- Machine placement.
- Town awakening.
- Daily repair.
- Gift sharing.
- Save/load.
- Accessibility.
- Performance.
- Final presentation.

Daily repair is protected.

Clock Tower and day/night are among the first features to cut if required.

Do not sacrifice core quality or stability for unplanned features.

Do not introduce multiplayer, online galleries, cloud accounts, free-build mode or other future-generation features into the competition critical path.

Maintain separate labels for:

- Competition required.
- Competition optional.
- Post-competition Generation 1.
- Post-competition Generation 2.
- Post-competition Generation 3.
- Future research.

No future feature should be silently marked as competition required.

---

# PART 4 — COMPLETE DOCUMENTATION EXPANSION

You must audit the existing documentation and create or update the following documents.

Do not blindly overwrite existing documents.

Read them first, preserve useful information and consolidate duplicates where appropriate.

## Product strategy

- docs/PRODUCT_VISION_LONG_TERM.md
- docs/EXPANSION_ROADMAP.md
- docs/PRODUCT_PILLARS.md
- docs/PRODUCT_METRICS_AND_RETENTION.md

## Architecture

- docs/MASTER_SYSTEM_ARCHITECTURE.md
- docs/MECHANICAL_ENGINE_V2.md
- docs/WORLD_SIMULATION_SPEC.md
- docs/RESIDENT_BEHAVIOUR_SPEC.md
- docs/STORY_AND_QUEST_ENGINE.md
- docs/SPATIAL_WORLD_SYSTEM.md
- docs/CREATIVE_SANDBOX_SPEC.md
- docs/BLUEPRINT_SHARING_SPEC.md

## 3D production

- docs/MASTER_ASSET_INVENTORY.md
- docs/GLB_ASSET_MANIFEST.md
- docs/ASSET_NAMING_AND_FOLDER_STANDARDS.md
- docs/BLENDER_PRODUCTION_GUIDELINES.md
- docs/GLB_EXPORT_AND_VALIDATION.md
- docs/ASSET_OPTIMISATION_BUDGET.md
- docs/ASSET_REFERENCE_MAPPING.md
- docs/ASSET_PRODUCTION_ROADMAP.md
- docs/ASSET_AGENT_ASSIGNMENTS.md

## Execution

- docs/MASTER_PRODUCTION_ROADMAP.md
- docs/AGENT_OWNERSHIP_MATRIX.md
- docs/INTEGRATION_AND_RELEASE_GATES.md
- docs/ASSET_QA_CHECKLIST.md

For every document:

- Use clear technical language.
- Include concrete requirements.
- Include dependencies.
- Include acceptance criteria.
- Link related specifications.
- Avoid contradicting existing decisions.
- Do not create empty documents containing only headings.

If a document already exists, update it instead of creating a duplicate.

---

# PART 5 — THE 180–200 GLB ASSET PRODUCTION PROGRAM

This is a major production requirement.

We expect approximately 180–200 distinct GLB deliverables across the entire game.

The exact total must be determined through a comprehensive asset audit.

Do not guess the list.

Do not generate fake assets to meet a numerical target.

Do not count duplicate exports, different filenames for the same asset, or unnecessary subdivisions as independent assets.

## 5.1 Asset inventory

Create a master inventory containing every required GLB.

Each asset must have:

- Unique asset ID.
- Unique filename.
- Display name.
- Category.
- Description.
- Gameplay purpose.
- Competition or future-generation classification.
- Related machine or environment.
- Relevant reference image.
- Relevant specification.
- Blender source path.
- GLB export path.
- Required meshes.
- Required materials.
- Required animations.
- Required interaction colliders.
- Origin and pivot requirements.
- Approximate dimensions.
- Scale convention.
- Polygon budget.
- Texture budget.
- Material budget.
- Dependencies.
- Production owner.
- Status.
- Validation status.
- Integration status.

Use a machine-readable manifest, preferably JSON, alongside the human-readable Markdown inventory.

Recommended statuses:

- NOT_STARTED
- BLOCKED
- IN_PROGRESS
- SOURCE_READY
- EXPORTED
- VALIDATING
- VALIDATED
- INTEGRATED
- REWORK_REQUIRED

Every asset must be traceable from its specification to its Blender source and final GLB.

## 5.2 Asset families to audit

The inventory must cover all relevant asset families.

These are categories to investigate, not a pre-approved final count.

### A. Mechanical component library

- Spur gears.
- Bevel gears.
- Worm gears if required by the specifications.
- Shafts.
- Axles.
- Couplings.
- Bearings.
- Bushings.
- Springs.
- Winding keys.
- Cranks.
- Cams.
- Followers.
- Levers.
- Linkages.
- Pulleys.
- Belts.
- Ratchets.
- Pawls.
- Escapement components.
- Pendulums.
- Flywheels.
- Governors.
- Fasteners.
- Mechanical housings.
- Connectors.
- Structural brackets.

Use actual mechanical design requirements. Gear tooth counts, modules, diameters, pivots and connection geometry must be consistent.

Do not create visually convincing but mechanically incompatible parts.

### B. Trunk and workshop

- Trunk exterior.
- Trunk lid.
- Hinges.
- Locks.
- Latches.
- Decorative metalwork.
- Internal compartments.
- Workshop structure.
- Workbench.
- Drawers.
- Parts trays.
- Blueprint holders.
- Tools.
- Lamps.
- Decorative props.
- Interaction handles.

### C. Music Box

- Exterior case.
- Lid.
- Base.
- Cylinder.
- Comb.
- Spring assembly.
- Gear train.
- Shaft assemblies.
- Governor.
- Internal supports.
- Decorative details.
- Mechanical figures if specified.

Follow the documented 12-part Music Box requirement and its assembly sequence.

### D. Carousel

- Base.
- Platform.
- Central shaft.
- Drive train.
- Horses.
- Horse support rods.
- Canopy.
- Decorative trim.
- Lighting.
- Rotating components.
- Structural details.

Follow the documented 20-part Carousel requirement.

### E. Windmill and Bakery

- Windmill building.
- Sails.
- Hub.
- Drive shaft.
- Gear train.
- Millstone.
- Grain hopper.
- Flour mechanism.
- Flour effects where implemented as assets.
- Bakery exterior.
- Bakery interior.
- Oven.
- Chimney.
- Bread props.
- Bakery figures.
- Connecting mechanical structures.

Follow the documented 24-part Windmill requirement and the documented bakery power relationship.

### F. Clock Tower and Theatre

- Tower structure.
- Clock face.
- Hands.
- Pendulum.
- Escapement.
- Drive train.
- Bell.
- Bell hammer.
- Theatre facade.
- Doors.
- Curtain mechanism.
- Theatre stage.
- Mechanical performance props.

Follow the documented 32-part Clock Tower specification. Preserve its competition priority as documented.

### G. Tockton environment

- Town base.
- Streets.
- Paths.
- Fences.
- Bridges.
- Lamp posts.
- Benches.
- Trees.
- Shrubs.
- Flowers.
- Signboards.
- Decorative structures.
- Small environmental details.
- District-specific props.

### H. Characters and automata

- Every resident.
- Character clothing variations where justified.
- Character accessories.
- Mechanical helpers.
- Automata.
- Animated figures.
- Character-specific props.

Create appropriate turnarounds and animation requirements.

### I. Gift and presentation

- Gift box.
- Wrapping.
- Ribbon.
- Gift tags.
- Presentation platform.
- Gift reveal components.
- Machine display elements.

### J. Future-generation assets

Maintain separate future asset groups for:

- Free-build components.
- Additional machine families.
- Additional districts.
- Advanced automata.
- New environmental systems.
- Player-designed inventions.

Do not let future assets interfere with competition asset production.

## 5.3 Critical distinction: individual GLB deliverables versus machine components

Do not assume that every mechanical part requires a separate GLB.

Determine the correct asset packaging strategy.

For example:

- A standalone interactive gear may need its own GLB.
- A static decorative assembly may be exported as one GLB containing multiple meshes.
- A machine may have a complete assembled GLB for visual presentation and individual component GLBs for interactive assembly.
- Repeated gears may use reusable geometry and instancing.
- A machine animation may use a GLB with animation clips or a separate deterministic runtime animation system.

Document these choices.

The inventory must describe what each deliverable actually contains.

---

# PART 6 — BLENDER AND GLB PRODUCTION STANDARDS

Blender is the primary production tool for major hero assets, buildings, characters, complex machinery and polished environmental objects.

Procedural TypeScript geometry can be used for repeated components when it is technically appropriate and maintains visual quality.

Do not make the entire world from primitive boxes, cylinders and spheres.

## Blender requirements

Every major asset should have:

- Proper geometry.
- Clean topology.
- Consistent scale.
- Correct origin.
- Correct pivot.
- Appropriate bevels.
- UV mapping where required.
- Proper materials.
- Correct naming.
- Appropriate level of detail.
- Optimised mesh structure.
- Required animations.
- Interaction colliders where needed.

Retain the editable Blender source.

Recommended structure:

assets/
  blender/
    mechanical/
    trunk/
    workshop/
    music-box/
    carousel/
    windmill/
    bakery/
    clock-tower/
    theatre/
    environment/
    characters/
    gifts/
    shared/
  models/
    mechanical/
    trunk/
    workshop/
    music-box/
    carousel/
    windmill/
    bakery/
    clock-tower/
    theatre/
    environment/
    characters/
    gifts/
  textures/
  audio/
  references/

Adapt this to the existing repository instead of blindly creating duplicates.

## GLB export standards

- glTF 2.0 compatible.
- Correct transforms.
- Correct scale.
- Correct coordinate conventions.
- Consistent material naming.
- No unnecessary embedded resources.
- Appropriate compression where supported.
- Correct animation exports.
- No broken texture references.
- No missing materials.
- No unexpected mesh duplication.

Use automated validation wherever possible.

## Asset performance

Establish budgets by asset category.

Do not apply the same polygon budget to a tiny screw and a hero clock tower.

Consider:

- Triangle count.
- Draw calls.
- Material count.
- Texture memory.
- Animation complexity.
- Collider complexity.
- Total scene memory.
- Number of simultaneous instances.

Quest performance is a major design constraint.

Use instancing for repeated components where possible.

Cache and reuse geometry.

Merge static geometry when appropriate.

Use invisible simplified interaction colliders.

Avoid excessive transparent materials and expensive realtime shadows.

---

# PART 7 — CREATE A SPECIALISED MULTI-AGENT PRODUCTION TEAM

Use Claude Code subagents and the cheapest capable model for bounded tasks.

Sonnet should be the default builder.

Use Haiku or another inexpensive capable model for:

- Inventory extraction.
- Reference indexing.
- File audits.
- Naming checks.
- Manifest validation.
- Documentation cross-checking.
- Repetitive asset metadata tasks.

Reserve Opus for:

- Difficult architectural decisions.
- Mechanical design reviews.
- Complex integration failures.
- Critical final reviews.

Do not use Opus for every Blender asset.

## 7.1 Initial audit agents

Create the following independent audit agents first.

### Agent A — Documentation Auditor

Read all documentation and create the requirements map.

No application code modifications.

### Agent B — Reference Auditor

Inspect every image in references/ and map it to the corresponding asset or feature.

No asset generation.

### Agent C — Existing Asset Auditor

Inspect every existing GLB, GLTF, Blender file, texture, model and procedural asset.

Identify reusable assets and gaps.

### Agent D — WebXR and Architecture Auditor

Inspect IWSDK, Three.js, spatial interactions, simulation architecture and performance constraints.

### Agent E — Blender Pipeline Auditor

Inspect available Blender installation, version, automation options, scripting environment, export capabilities and existing asset pipeline.

Do not assume Blender is installed or that an agent can directly interact with its GUI.

### Agent F — QA and Performance Auditor

Define automated GLB validation, asset budgets, Quest performance checks and acceptance tests.

After these audits, consolidate their findings into the master inventory.

## 7.2 Asset production agents

After the inventory is approved, create specialised asset production agents.

Potential responsibilities:

1. Mechanical components and gear library.
2. Springs, shafts and transmission mechanisms.
3. Trunk and workshop.
4. Music Box.
5. Carousel.
6. Windmill.
7. Bakery.
8. Clock Tower and Theatre.
9. Town architecture.
10. Environment and decorative props.
11. Residents and characters.
12. Automata and animated figures.
13. Gift and presentation assets.
14. Future sandbox component library.

Adjust the number of agents based on the actual asset inventory and available execution capacity.

One agent may own a complete asset family.

Do not create 200 separate agents.

## 7.3 Blender agent requirements

Each production agent must:

- Read the relevant specifications.
- Inspect the relevant reference images.
- Read the Blender production guidelines.
- Read the asset's manifest entry.
- Work only on assigned files.
- Create Blender source files.
- Export the requested GLB files.
- Validate geometry and materials.
- Report source and export paths.
- Report any missing requirements.
- Provide screenshots or renders where supported.
- Never mark an asset complete merely because an export file exists.

Where direct GUI control is unavailable, use Blender's Python scripting and background mode when supported.

If Blender cannot be automated, report the limitation rather than claiming the asset was generated.

## 7.4 File ownership

Every asset and source file must have exactly one production owner at a time.

Agents must not edit the same .blend file simultaneously.

Avoid shared mutable files.

Use separate directories or asset-family branches where appropriate.

The main agent is responsible for integration.

---

# PART 8 — BUILD THE COMPLETE ASSET MANIFEST BEFORE MASS PRODUCTION

This is one of the most important requirements.

Do not begin mass GLB generation before the inventory exists.

First create:

1. A complete list of every expected GLB.
2. A machine-readable asset manifest.
3. A dependency graph.
4. Asset-family ownership.
5. Competition versus future classification.
6. Priority.
7. Validation criteria.
8. Reference mapping.

Target approximately 180–200 genuinely distinct GLB deliverables.

If the audit determines a different justified count, report the exact count and explain the difference.

The manifest must make it possible to answer:

- How many GLBs are required?
- How many already exist?
- How many are missing?
- Which assets are competition-critical?
- Which are optional?
- Which belong to future generations?
- Which agent owns each asset?
- Which references guide it?
- Which specifications govern it?
- Which assets depend on other assets?
- Which assets have been exported?
- Which assets have been validated?
- Which assets are integrated into the game?

Maintain a progress summary.

Example:

Total planned assets: N
Existing validated: N
In production: N
Exported, awaiting validation: N
Blocked: N
Not started: N
Integrated: N

The numbers must be derived from the actual manifest and filesystem, never manually guessed.

---

# PART 9 — ASSET PRODUCTION WORKFLOW

Use a controlled pipeline.

Stage 1: Specification.

- Read requirements.
- Inspect references.
- Define dimensions.
- Define pivots.
- Define materials.
- Define geometry.
- Define animation and interaction requirements.

Stage 2: Modelling.

- Create Blender source.
- Create meshes.
- Create materials.
- Establish pivots.
- Add required animations.
- Add colliders or collider metadata where appropriate.

Stage 3: Export.

- Export GLB.
- Preserve Blender source.
- Validate file structure.
- Check transforms.
- Check materials.
- Check animations.
- Check scale.

Stage 4: Visual QA.

- Generate previews.
- Inspect geometry.
- Check reference consistency.
- Check visual quality.
- Check mechanical plausibility.

Stage 5: Technical QA.

- Check file loading.
- Check memory and triangle budgets.
- Check mesh and material count.
- Check animations.
- Check compatibility with Three.js.

Stage 6: Integration.

- Add the asset to the application asset registry.
- Add metadata.
- Connect it to its blueprint or environment.
- Test it in the actual experience.

Stage 7: Acceptance.

Only after all relevant checks should the asset be marked VALIDATED and INTEGRATED.

---

# PART 10 — LONG-TERM FEATURE ROADMAP

Maintain the following generations.

## Generation 0 — Competition build

The current November 2026 scope.

Protect it.

## Generation 1 — Living Tockton

- Resident behaviour engine.
- Building dependencies.
- Town events.
- Production chains.
- Expanded stories.
- Persistent world simulation.
- Improved spatial persistence.

## Generation 2 — Advanced engineering

- Multi-stage transmissions.
- Energy distribution.
- Timing systems.
- Mechanical diagnosis.
- Fault propagation.
- Simulation preview.
- Advanced machinery.

## Generation 3 — Creative sandbox

- Free-build workshop.
- Modular component library.
- Custom machine construction.
- Blueprint editor.
- Machine validation.
- Saved inventions.

## Generation 4 — Community

- Blueprint sharing.
- Machine challenges.
- Curated gallery.
- Optional accounts.
- Optional cloud saves.
- Community-created puzzles.

## Generation 5 — Clockwork universe

- Multiple towns.
- Multiple environments.
- Advanced spatial experiences.
- Cooperative experiences.
- Player-created districts.
- Expanded campaigns.

Future generations must remain separate from the current competition milestone.

---

# PART 11 — TECHNICAL ARCHITECTURE PRINCIPLES

Preserve the current WebXR technology foundation unless a documented technical limitation requires a change.

Primary technologies:

- IWSDK.
- WebXR.
- Three.js.
- TypeScript.
- Blender.
- GLB/glTF.
- Vitest.
- Playwright.
- IWER.
- Vercel static hosting.

Architecture should eventually contain independent modules for:

- Mechanical simulation.
- World simulation.
- Resident behaviour.
- Story and quests.
- Spatial interaction.
- Machine construction.
- Blueprint validation.
- Persistence.
- Rendering.
- Audio.
- Asset management.

Keep the mechanical simulation deterministic.

Keep simulation independent of rendering.

Use data-driven machine blueprints.

Version save formats.

Keep the basic gameplay loop independent of network services.

Do not introduce Supabase, Render, external LLM APIs, or backend infrastructure unless a real future requirement justifies it.

---

# PART 12 — PERFORMANCE AND QUALITY REQUIREMENTS

The experience must target at least 60 FPS on Quest hardware.

Profile rather than guess.

Prioritise:

- Instancing.
- Geometry reuse.
- Material reuse.
- Optimised GLB assets.
- Efficient animation.
- Low draw calls.
- Controlled transparency.
- Limited realtime shadows.
- Memory management.
- Comfortable interaction distances.
- Appropriate collider geometry.
- Progressive asset loading.

Distinguish:

- Desktop verified.
- IWER verified.
- Quest Browser verified.
- Physical Quest 3 verified.
- Physical Quest 3S verified.

The developer currently does not own a Quest headset.

Never claim that physical headset verification has happened unless actual test evidence exists.

Maintain a physical hardware test checklist.

---

# PART 13 — EXECUTION ORDER

Do not attempt to do everything simultaneously.

Follow this order.

## Phase 1 — Complete audit

Run the documentation, references, asset, architecture, Blender and QA audits.

## Phase 2 — Documentation and inventory

Create or update all required documents.

Produce the complete GLB manifest.

Establish the actual asset count.

Map all references.

Define priorities.

## Phase 3 — Agent assignment

Assign asset families to specialised agents.

Set file ownership.

Define output and validation requirements.

## Phase 4 — Production pipeline verification

Before mass production, create a small pilot batch.

Include:

- One mechanical component.
- One complex mechanical assembly.
- One building.
- One character or animated figure.
- One environmental prop.

Generate actual Blender source files and actual GLB exports.

Validate them in the application.

Use the pilot to correct the pipeline before scaling.

## Phase 5 — Competition asset production

Prioritise only the assets needed for the competition build.

Keep future assets in the backlog.

## Phase 6 — Remaining asset production

Continue asset families in controlled batches.

Integrate and validate each batch before starting too many new assets.

## Phase 7 — Future feature implementation

Only after competition delivery, begin the long-term roadmap.

---

# PART 14 — FIRST RESPONSE AND REQUIRED OUTPUT

Start by inspecting the actual repository.

Do not immediately start generating hundreds of assets.

Use inexpensive audit subagents where supported.

Then report:

1. Repository status.
2. Documents inspected.
3. References inspected.
4. Installed design and Blender-related skills.
5. Available Blender automation capabilities.
6. Existing GLB and Blender asset counts.
7. Missing assets.
8. Proposed complete asset categories.
9. Proposed total GLB count.
10. Competition-critical asset count.
11. Future asset count.
12. Proposed agent structure.
13. Asset production dependencies.
14. Recommended first pilot batch.
15. Exact files that need to be created or updated.

After presenting the audit, create the documentation and master asset manifest.

Then establish the pilot production batch.

Do not claim that 180–200 assets have been created when only an inventory exists.

Do not claim that assets have been validated when only exported.

Do not stop at planning indefinitely. Once the inventory and pipeline are sound, begin actual production in the approved order.

The objective is a complete, professionally produced mixed-reality game with a consistent visual identity, technically correct mechanisms, high-quality 3D assets, and a scalable production pipeline.

**Treat Wound Up as a real game production with a substantial asset library, not a small experimental project.**




---

# ADDITIONAL MASTER REQUIREMENT — MULTIPLE WORLDS AND EXPANDABLE UNIVERSE

## 1. Core vision: Wound Up is a universe, not a single town

Wound Up must be architected as an expandable mixed-reality clockwork universe.

Tockton is the first world and the introductory experience. It is not the only town, environment, campaign or mechanical ecosystem the game will eventually contain.

The long-term vision is to introduce multiple distinct worlds, each with its own:

- Visual identity and art direction.
- Architecture and environmental design.
- Geography and layout.
- Residents and characters.
- Stories and quests.
- Machines and mechanical systems.
- Mechanical challenges.
- Production chains and dependencies.
- Collectible components and blueprints.
- Environmental interactions.
- Secrets and discoveries.
- World progression and events.
- Soundscape and music.
- Unique ending or world restoration event.

Every world must feel different rather than being a recoloured version of Tockton.

## 2. World expansion strategy

Develop a modular world architecture that allows new worlds to be added without rewriting the core game engine.

The following are proposed future world concepts. They are strategic concepts, not approved immediate implementation tasks. Claude should refine them into a world design document without adding them to the competition build.

### World 1 — Tockton: The Forgotten Clockwork Town

<badge color="success">Initial world</badge>

The introductory world.

Theme:
- Vintage European storybook town.
- Antique brass machinery.
- Wooden buildings.
- Clock towers.
- Windmills.
- Bakeries.
- Carousel.
- Mechanical theatre.

Gameplay identity:
- Learn mechanical construction.
- Repair forgotten machines.
- Restore the town.
- Discover residents' stories.
- Understand interconnected mechanical systems.

### World 2 — The Brasswater Harbour

Theme:
A mysterious mechanical harbour powered by water, tides, steam and enormous maritime machinery.

Possible locations:
- Mechanical lighthouse.
- Shipyard.
- Water-powered workshops.
- Harbour cranes.
- Floating platforms.
- Mechanical submarines.
- Tide observatory.
- Ship repair station.

Unique mechanics:
- Water wheels.
- Pumps.
- Pressure systems.
- Hydraulic linkages.
- Floating mechanisms.
- Tide-dependent machinery.
- Ship navigation mechanisms.

Story direction:
The harbour has stopped functioning, and ships have been stranded for years. The player must restore its machinery and uncover what happened to the missing expedition.

### World 3 — The Emberforge Mountains

Theme:
A mountainous industrial settlement powered by steam, furnaces and enormous mechanical mining systems.

Possible locations:
- Mountain foundry.
- Mining facilities.
- Ore transport systems.
- Mechanical lifts.
- Furnace rooms.
- Steam-powered locomotives.
- Underground workshops.
- Giant mechanical drilling machines.

Unique mechanics:
- Steam pressure.
- Thermal systems.
- Pistons.
- Pressure valves.
- Heavy mechanical transmissions.
- Industrial energy distribution.
- Complex machine sequencing.

Story direction:
The mountain's great furnace has gone cold. Its residents need the player to restore the ancient machinery beneath the mountain.

### World 4 — The Verdant Observatory

Theme:
A mysterious astronomical and botanical world where clockwork instruments control observatories, gardens and celestial mechanisms.

Possible locations:
- Astronomical observatory.
- Planetarium.
- Mechanical greenhouse.
- Celestial clock.
- Botanical laboratories.
- Star-tracking tower.
- Mechanical garden.

Unique mechanics:
- Planetary gear systems.
- Orbital mechanisms.
- Precision timing.
- Telescopic assemblies.
- Mechanical tracking systems.
- Light and shadow mechanisms.
- Complex astronomical clocks.

Story direction:
An ancient observatory has lost its ability to track the stars. Restoring its mechanisms reveals a forgotten connection between the different worlds.

### World 5 — The Aetherian Skyworks

Theme:
An elevated civilisation of floating workshops, airships and elaborate airborne machines.

Possible locations:
- Airship docks.
- Floating workshops.
- Cloud observatories.
- Mechanical flight laboratories.
- Giant propeller systems.
- Sky bridges.
- Airborne factories.

Unique mechanics:
- Propellers.
- Rotational balancing.
- Flight control linkages.
- Gyroscopic systems.
- Multi-stage transmissions.
- Aerodynamic experimentation.
- Complex moving structures.

Story direction:
The skyworks have lost their ability to remain connected. The player must rebuild the mechanisms that hold the airborne civilisation together.

### World 6 — The Grand Mechanical Theatre

Theme:
A spectacular world dedicated to automata, performance, mechanical storytelling and player-created shows.

Possible locations:
- Grand theatre.
- Puppet workshops.
- Mechanical orchestra.
- Automated stages.
- Clockwork ballet.
- Performance laboratories.
- Grand mechanical exhibition.

Unique mechanics:
- Sequenced movement.
- Cam-based choreography.
- Multiple synchronised mechanisms.
- Mechanical automata.
- Trigger networks.
- Timing and performance systems.

Story direction:
The legendary mechanical theatre is preparing its greatest performance, but its performers and stage machinery have become frozen in time.

## 3. A world must be a complete gameplay experience

Do not treat a world as a collection of decorative GLBs.

Each world should have a complete content specification.

Every world must define:

1. World identity and story.
2. World layout.
3. Environmental art direction.
4. Major buildings.
5. Characters and residents.
6. Machine families.
7. Mechanical component requirements.
8. Unique mechanical systems.
9. Quests and progression.
10. Environmental interactions.
11. Audio identity.
12. Collectibles and discoveries.
13. World restoration progression.
14. Performance budgets.
15. Required GLB inventory.
16. World-specific acceptance tests.

A world should have a meaningful beginning, progression and restoration or completion event.

## 4. Multiple-world architecture

Create a world registry and world-loading architecture.

Suggested conceptual interface:

```ts
interface WorldDefinition {
  id: string;
  name: string;
  description: string;

  theme: string;
  spawnConfiguration: WorldSpawnConfiguration;

  environmentAssets: string[];
  buildingDefinitions: string[];
  characterDefinitions: string[];
  machineDefinitions: string[];

  mechanicalSystems: string[];
  questDefinitions: string[];

  audioConfiguration: string;
  progressionConfiguration: string;

  performanceBudget: WorldPerformanceBudget;
}
```

This is a conceptual contract. Adapt it to the existing TypeScript architecture.

The game must support:

- Selecting an available world.
- Loading its environment.
- Loading only the assets required by that world.
- Restoring the correct world state.
- Saving progress independently.
- Switching between unlocked worlds.
- Returning to a previously visited world.
- Keeping shared inventory and player-level progression where appropriate.
- Maintaining world-specific quests and resident states.

Do not load all worlds and all their assets into memory simultaneously.

Use progressive loading and unloading.

## 5. Shared universe systems

Some systems should be shared across every world:

- Player interaction system.
- Mechanical simulation engine.
- Component library.
- Blueprint format.
- Save infrastructure.
- Accessibility system.
- Hand tracking.
- Spatial anchoring.
- Inventory and journal.
- Quest framework.
- Audio framework.
- Rendering and asset pipeline.

Other systems should remain world-specific:

- Architecture.
- Residents.
- Environmental design.
- Story.
- Local mechanical machines.
- Production chains.
- World events.
- Unique puzzles.
- World-specific mechanics.

World-specific mechanics should extend shared simulation primitives instead of duplicating the mechanical engine.

## 6. Cross-world progression

Eventually, the player should be able to discover connections between worlds.

Examples:

- A component discovered in the harbour can unlock a new machine in Tockton.
- A mechanism invented in Emberforge can power a machine in another world.
- A celestial blueprint from the observatory reveals a hidden location.
- A performance mechanism from the theatre can be used in player-created automata.
- Residents in different worlds can exchange letters or mechanical gifts.

Cross-world progression should be meaningful, not simply a collection of unrelated unlocks.

Keep the feature future-facing until the first world is complete and stable.

## 7. Multi-world asset production requirements

Extend the master GLB inventory to support multiple worlds.

Every asset must have:

- World ID.
- Shared or world-specific classification.
- Asset family.
- Reuse eligibility.
- World-specific visual requirements.
- Dependencies.
- Source file.
- GLB export.
- Validation status.

Organise assets so shared components are not duplicated unnecessarily.

For example:

assets/
  shared/
    mechanical/
    tools/
    common-materials/
    reusable-props/
  worlds/
    tockton/
    brasswater-harbour/
    emberforge-mountains/
    verdant-observatory/
    aetherian-skyworks/
    grand-mechanical-theatre/

Adapt to the actual repository structure.

## 8. Production planning

Create:

- docs/MULTI_WORLD_UNIVERSE_DESIGN.md
- docs/WORLD_REGISTRY_AND_LOADING.md
- docs/WORLD_PROGRESSION_SYSTEM.md
- docs/CROSS_WORLD_GAMEPLAY.md
- docs/WORLD_ASSET_INVENTORY.md

Each proposed world must receive its own world bible and asset inventory when it is approved for production.

Do not start producing all worlds simultaneously.

The correct order is:

1. Finish and polish Tockton.
2. Establish the shared world-loading architecture.
3. Build the next world as a complete vertical slice.
4. Validate asset reuse and memory performance.
5. Introduce further worlds incrementally.

## 9. Critical production restriction

The multiple-world universe is a long-term expansion strategy.

It does not increase the November 2026 competition scope.

Do not create assets for future worlds before the current competition build is stable, unless they are explicitly approved as reusable shared assets that do not delay the submission.

Tockton remains the only world required for the initial competition experience.

## 10. Long-term objective

Wound Up should eventually feel like a collection of interconnected miniature clockwork civilisations.

Every world should offer something new to discover, a different mechanical discipline to master, a distinct visual identity, and meaningful connections to the larger universe.

The player should not simply finish Tockton and run out of things to do.

They should feel that Tockton was the beginning of a much larger adventure.


This is how Claude Code surfaces messages the user sends mid-turn — within the running turn, often alongside the next tool result, rather than as a separate conversation turn. Address the message above as you continue this turn.

---

<!-- Added 2026-11-06 13:38 IST, pasted by the owner -->

# WORLD-BY-WORLD PRODUCTION STRATEGY

Adopt a sequential world-production strategy for Wound Up.

## Core principle

Build the shared technology once and produce individual worlds sequentially.

Do not develop all worlds simultaneously.

## Shared foundation

Before scaling world production, establish:

- Shared mechanical simulation engine.
- Reusable mechanical component library.
- Shared Blender materials and asset generators.
- Interaction and hand-tracking systems.
- Save and progression infrastructure.
- World registry and world-loading architecture.
- Shared asset manifest and validation pipeline.
- Common accessibility, audio and UI systems.

The mechanical engine must support extensions without being tightly coupled to any individual world.

## World production order

1. Tockton — initial competition world.
2. Brasswater Harbour.
3. Emberforge Mountains.
4. Verdant Observatory.
5. Aetherian Skyworks.
6. Grand Mechanical Theatre.

## World completion gates

Every world must have:

- World design bible.
- Environment and layout specification.
- Machine and building inventory.
- Resident and character inventory.
- Story and quest specification.
- Unique mechanical features.
- Asset manifest.
- Blender source and GLB deliverables.
- Performance budgets.
- Gameplay acceptance tests.
- Integration and release checklist.

A world is not considered complete merely because its assets have been generated.

## Asset reuse

All worlds must use the shared mechanical library wherever possible.

Do not duplicate gears, shafts, bearings, springs, connectors or other common assets without a documented reason.

Use parameterized geometry and runtime material configuration where appropriate. Create separate geometry only when the design genuinely requires it.

## World-specific extensions

A world may introduce new mechanical systems, but these must extend the shared engine through documented interfaces.

Examples:

- Brasswater: hydraulic systems, pumps and water flow.
- Emberforge: pressure, pistons and foundry machinery.
- Verdant Observatory: planetary gearing and precision timing.
- Aetherian Skyworks: propellers, gyroscopes and flight mechanisms.
- Grand Mechanical Theatre: synchronisation and coordinated automata.

## Production discipline

Finish and validate one world before starting full production on the next.

Keep future worlds in the architecture and roadmap, but do not allow them to increase the current competition scope.

Tockton is the only competition world. All additional worlds are future expansion content.

The shared asset manifest must distinguish shared assets, world-specific assets, reused assets and future planned assets. Asset counts must be based on unique deliverables, never inflated through material or colour variants.
