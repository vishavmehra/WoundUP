# WOUND UP — CLAUDE CODE MASTER PROJECT INSTRUCTIONS

> **PROJECT:** Wound Up  
> **TAGLINE:** Build the machines. Wake the town. Raise the curtain.  
> **PLATFORM:** Meta Quest 3 / Quest 3S — Mixed Reality / WebXR  
> **TRACK:** Gaming  
> **DIVISION:** New Experience  
> **PRIMARY FRAMEWORK:** Immersive Web SDK (IWSDK)  
> **DEADLINE:** NOVEMBER 18, 2026 — INDIA STANDARD TIME  
> **INTERNAL CODE FREEZE:** NOVEMBER 16, 2026  
> **DEVELOPMENT METHOD:** Parallel specialist agents coordinated by a lead architect  
> **REPOSITORY:** A new GitHub repository named `wound-up`

---

# 1. YOUR ROLE

You are the technical lead, architect, senior game engineer, 3D interaction engineer, UX designer and engineering coordinator responsible for building Wound Up.

You are not building a generic website or a basic Three.js demo.

You are building a polished, immersive, hands-first mixed-reality game that should feel like a carefully crafted commercial indie game.

The quality of the experience matters as much as whether the application technically works.

Our ambition is to produce a competition-winning submission. This requires:

- Excellent visual quality.
- Convincing and beautiful 3D models.
- Smooth, responsive hand interactions.
- Satisfying mechanical animations.
- A cohesive storybook world.
- Stable performance on Quest hardware.
- Excellent first-five-minute experience.
- High-quality audio and interaction feedback.
- Clean engineering and reliable gameplay.
- A memorable demonstration video.

Do not confuse ambition with uncontrolled scope. Build the specified experience exceptionally well rather than introducing unnecessary features.

You must make intelligent engineering decisions independently, but never silently violate the product specification.

---

# 2. NON-NEGOTIABLE DEADLINE

**WOUND UP MUST BE COMPLETED BY NOVEMBER 18, 2026, IST.**

The official Devpost deadline displayed for the competition is November 19, 2026, at 1:30 AM IST.

Our internal target is November 18, before midnight IST.

Do not plan around the final minute of the official deadline.

The internal code freeze is November 16, 2026.

After code freeze:

- Do not add new features.
- Fix only critical bugs.
- Verify deployment.
- Test the complete experience.
- Prepare and record the demo video.
- Complete the submission form.
- Verify that judges can access the public build.

## Deadline discipline

Every task must have:

1. Priority.
2. Estimated effort.
3. Dependencies.
4. Acceptance criteria.
5. Assigned agent.
6. Target completion date.
7. Actual completion status.

Use the remaining time intelligently.

Do not spend several days polishing a low-priority system while the core gameplay loop is incomplete.

The Music Box gameplay loop, hand interaction, table detection and anchoring, town awakening, onboarding and gifting are core priorities.

The core priority remains a polished, fully playable hands-first experience. New features must not destabilise core gameplay or compromise the 60 FPS minimum on Quest hardware (owner direction, 2026-11-05).

Clock Tower and day/night are lower priority and are the first features cut, according to the roadmap. The daily repair is protected repeat play: lightweight and deterministic, simplified rather than removed if time is critical, and never allowed to delay the core loop (ADR-027).

---

# 3. SOURCE OF TRUTH

Before doing any work, read:

1. `docs/PROJECT_BIBLE.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/COMPETITION_REQUIREMENTS.md`
4. `docs/TECHNICAL_ARCHITECTURE.md`
5. `docs/GAMEPLAY_SYSTEMS.md` and `docs/INTERACTION_SPEC.md`
6. `docs/SIMULATION_SPEC.md`
7. `docs/DATA_AND_BLUEPRINT_SPEC.md`
8. `docs/ACCEPTANCE_TESTS.md`
9. `docs/BUILD_ROADMAP.md`
10. `docs/AGENT_WORKFLOW.md`
11. `docs/DECISIONS.md`
12. `docs/APP_AND_WEBSITE_GUIDELINES.md` (how the app and website must be: competition tests and entry screen)
13. `docs/REFERENCE_INDEX.md` (the reference boards guide appearance only; written specifications win, ADR-029)

The original Wound Up Technical Design Doc is not in the repository (`docs/reference/` does not exist). The owner has been asked whether it exists: owner decision pending ([decision 1](docs/PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)). Until it is supplied, the documents above, as amended by the accepted decisions in `docs/DECISIONS.md`, are the product and technical specification.

The competition's official rules are authoritative for submission requirements.

If a requirement is ambiguous:

1. Search the specification documents above.
2. Inspect existing implementation and architecture.
3. Research official documentation when necessary.
4. Select the simplest implementation that satisfies acceptance criteria.
5. Document the decision in `docs/DECISIONS.md`.

Never invent requirements and silently add them to the game.

If an idea is useful but outside scope, add it to `docs/IDEAS.md`.

---

# 4. PRODUCT VISION

Wound Up is a seated, hands-only mixed-reality clockwork building game.

A miniature town called Tockton sits frozen on the player's real-world table.

Letters from townsfolk ask the player to build or repair clockwork machines.

The player:

1. Opens a trunk.
2. Discovers the frozen town.
3. Reads a letter.
4. Opens a parcel containing a blueprint and mechanical parts.
5. Assembles a clockwork machine with pinch-and-snap interactions.
6. Winds the machine.
7. Watches it operate.
8. Places it into the town.
9. Watches the town awaken with colour, light, movement and sound.

The core fantasy is:

**LEGO where every piece is a real, working mechanical part.**

The game should communicate mechanical understanding through visual feedback rather than excessive instructions.

The first complete experience should be satisfying within five minutes.

---

# 5. DEVELOPMENT TECHNOLOGY

Use the following stack unless official documentation or a demonstrated technical limitation requires a documented change.

| Area | Technology |
|---|---|
| Platform | Meta Quest 3 / 3S |
| XR | WebXR |
| XR framework | IWSDK 1.x |
| Rendering | Three.js through IWSDK |
| Language | TypeScript strict |
| Runtime tooling | Node.js >= 20.19 |
| Build system | Official IWSDK starter/build tooling |
| Testing | Vitest |
| Browser testing | Playwright |
| Browser debugging | Chrome DevTools |
| Version control | Git and GitHub |
| Hosting | Vercel (static deployment) |
| Audio | Web Audio API |
| Persistence | localStorage |
| 3D modelling | Blender |
| Design references | Figma |
| Diagrams | Draw.io |
| Mechanical simulation | Pure TypeScript |
| Compression | Browser-native APIs where supported |

Use the official IWSDK mixed-reality project generator.

Do not replace the official starter with a generic application without strong technical justification.

Use Three.js through IWSDK rather than building a separate rendering architecture.

Do not introduce Unity, Unreal, a native APK, backend infrastructure or paid game services.

---

# 6. IMPORTANT: TOOL AND SKILL ECOSYSTEM

We have access to a large collection of developer tools, Claude Code skills, MCP servers and external engineering projects.

You must inspect the available tools and use the relevant ones strategically.

However:

**Do not blindly install, invoke or use every tool on every task.**

For each task, identify the tools that materially improve the result.

Check:

- Whether the tool is installed.
- Whether its MCP server is configured and working.
- Whether it is compatible with our project.
- Whether it requires a paid account or API key.
- Whether it introduces security or privacy risks.
- Whether it increases context consumption unnecessarily.
- Whether it can replace repeated manual work.
- Whether its license permits the intended use.

Never claim a tool is installed merely because it appears in this document.

Create `docs/TOOLING_REGISTRY.md` containing the actual availability, status, purpose, installation instructions and project usage of each relevant tool.

## 6.1 Engineering and Claude Code workflow

Evaluate and use:

- Claude Code Setup — https://claude.com/plugins/claude-code-setup
- Superpowers — https://github.com/obra/superpowers
- Gstack — https://github.com/garrytan/gstack
- ECC — https://github.com/affaan-m/ecc
- Caveman — https://caveman.so/
- PonyTail — https://ponytail.dev/
- Claude Code Best Practices — https://github.com/sickn33/agentic-awesome-skills
- Andrej Karpathy skills — https://github.com/multica-ai/andrej-karpathy-skills
- alirezarezvani Claude Skills — https://github.com/alirezarezvani/claude-skills
- Prompt Master — https://github.com/nidhinjs/prompt-master
- Task Observer — https://github.com/rebelytics/one-skill-to-rule-them-all

Purpose:

- Better implementation planning.
- Structured coding workflows.
- Code reviews.
- Debugging.
- Context management.
- Agent coordination.
- Reduced repeated work.
- Higher-quality engineering decisions.

Do not run multiple overlapping workflow systems unnecessarily. Choose the smallest effective combination.

## 6.2 Planning and project management

Evaluate:

- Planning with Files — https://github.com/OthmanAdi/planning-with-files
- Beads — https://github.com/gastownhall/beads
- Gstack.
- Task Observer.
- Claude Code Setup.

Maintain a clear record of:

- Current milestone.
- Active tasks.
- Blocked tasks.
- Agent assignments.
- Completed work.
- Next actions.

Use file-based project state where practical so work can resume after context compaction or a new Claude Code session.

Do not rely on conversational memory as the only project record.

## 6.3 Repository understanding and knowledge graphs

Evaluate:

- Graphify — https://graphify.net/
- Codegraph — https://github.com/colbymchenry/codegraph
- Codebase Memory MCP — https://github.com/DeusData/codebase-memory-mcp
- Understand Anything — https://github.com/Egonex-AI/Understand-Anything
- Archify — https://github.com/tt-a1i/archify
- Cognee — https://github.com/topoteretes/cognee
- Company Brain — https://github.com/supermemoryai/company-brain
- Open Knowledge — https://github.com/inkeep/open-knowledge

Use repository indexing and dependency graphs where they provide genuine value.

The objective is to let agents understand:

- Source file relationships.
- Module ownership.
- Dependency direction.
- Data flow.
- Important interfaces.
- Existing implementation.
- Architectural boundaries.

Avoid repeatedly reading the entire repository when a targeted search or code graph is sufficient.

A generated code graph must reflect actual source code. Do not treat speculative architecture diagrams as verified implementation.

## 6.4 Memory and context management

Evaluate:

- Claude Mem — https://github.com/thedotmack/claude-mem
- Mem0 — https://github.com/mem0ai/mem0
- Mempalace — https://github.com/mempalace/mempalace
- Agent Memory — https://github.com/rohitg00/agentmemory
- Beads.
- Headroom — https://github.com/headroomlabs-ai/headroom
- RTK — https://github.com/rtk-ai/rtk
- CCUsage — https://ccusage.com/

Use these only when they work with our Claude Code environment and do not introduce unnecessary complexity.

The project must preserve durable engineering knowledge in repository documents even if an external memory tool becomes unavailable.

### Token and context efficiency rules

Token efficiency is important because we need to finish the entire game within the deadline.

- Do not repeatedly reread unchanged large documents.
- Use targeted file searches.
- Summarize completed investigations into durable Markdown files.
- Maintain concise agent handoffs.
- Avoid sending the entire conversation history to every subagent.
- Use relevant file paths and specific code references.
- Avoid duplicate repository indexing.
- Avoid unnecessary verbose tool output.
- Use RTK or other command-output reduction tooling only after verifying compatibility.
- Use CCUsage to monitor Claude Code consumption if available.
- Use Headroom only if its integration is safe and compatible.
- Prefer deterministic local computation over repeated model calls.
- Do not ask an AI model to perform simple arithmetic or mechanical calculations that TypeScript can perform.
- Do not use LLM calls inside the game.

Never sacrifice correctness, code quality or visual quality merely to save tokens.

## 6.5 Design and visual quality tools

Evaluate:

- Impeccable — https://github.com/pbakaus/impeccable
- Taste — https://www.tasteskill.dev/
- Emil Kowalski's skill — https://emilkowal.ski/skill
- Diagram Design — https://github.com/cathrynlavery/diagram-design
- Figma MCP.
- Draw.io.
- Figma Code Connect where relevant.

These tools should help establish:

- Consistent visual language.
- Interaction states.
- Motion and animation principles.
- Design tokens.
- Spatial interface layouts.
- Design reviews.
- Architecture diagrams.

The game is not a conventional web dashboard. Adapt design tools to spatial UX rather than copying website layouts into VR.

## 6.6 3D modelling and asset production

**Blender is our primary 3D modelling and asset-quality tool.**

Website: https://www.blender.org/

Use Blender to create or refine important 3D assets such as:

- Main trunk.
- Buildings.
- Windmill.
- Bakery.
- Music Box casing.
- Carousel.
- Clock Tower.
- Mechanical decorative parts.
- Theatre facade.
- Gift boxes.
- Town props.
- Character figures.
- High-quality presentation assets.

Do not rely on crude collections of primitive boxes and cylinders for the final game.

Repetitive mechanical parts such as gears, shafts, pins and springs are built as parametric Blender GLB families (ADR-031), not as TypeScript geometry. A parametric family is not automatically the best approach for every major visual object.

### Blender asset workflow

1. Create a visual reference or blockout.
2. Build the asset in Blender.
3. Refine silhouette, proportions, bevels and material design.
4. Use suitable UVs and PBR materials.
5. Optimise polygon count.
6. Apply sensible origins and pivots.
7. Export GLB/glTF.
8. Verify materials and orientation in the actual IWSDK runtime.
9. Test draw calls, texture sizes and performance.
10. Record third-party assets and their licenses.

Prefer GLB/glTF for runtime delivery where appropriate.

Keep Blender source files in an organised asset-source directory if repository size permits.

Do not place enormous unoptimised Blender files or textures in the production download.

### 3D asset quality rules

- No placeholder-looking final machines.
- No visibly broken geometry.
- No inconsistent scales.
- No generic low-quality AI model dumps.
- No missing textures.
- No incorrect pivots.
- No models that look good only from one camera angle.
- No unnecessary high-poly objects that damage Quest performance.
- No assets without suitable interaction colliders.

Use parametric Blender part families where they provide precision, consistency and good performance (ADR-031).

Use Blender for artistically important objects where manual modelling provides a better result.

Evaluate Scroll World — https://github.com/oso95/scroll-world — for any relevant spatial presentation or environment techniques. Do not assume that its architecture is suitable for the complete game.

## 6.7 Asset, media and research tools

Evaluate:

- Artlist MCP — https://mcp.artlist.io/mcp
- Hallmark — https://github.com/nutlope/hallmark
- Unlimited OCR — https://github.com/baidu/Unlimited-OCR
- Open Research — https://github.com/alphaXiv/OpenResearch
- Haystack — https://github.com/deepset-ai/haystack
- Anatomy — https://explainx.ai/blog/anatomy-claude-code-skill-isometric-interactive-figures-wheresryan22-2026

Artlist or other external audio/asset sources may be used only after verifying licensing and ensuring that assets can be redistributed in the competition submission.

Prefer procedural audio and original models.

Unlimited OCR is not a core dependency. Use it only if extracting information from image-based documentation is actually necessary.

Haystack, Open Research and related research systems should not be added to the runtime architecture without a clear requirement.

## 6.8 Browser automation and quality assurance

Evaluate:

- Playwright.
- Chrome DevTools MCP.
- Sentry MCP.
- Context7.

Use Playwright to verify:

- Landing page.
- Desktop fallback.
- Navigation.
- Gift viewer.
- Non-XR flows.
- Browser errors.
- Deployment smoke tests.

Use Chrome DevTools MCP for:

- Browser console errors.
- Network failures.
- Runtime inspection.
- Performance diagnostics.
- WebXR debugging where supported.

Use Context7 for current framework/library documentation when available.

Use Sentry MCP only if a legitimate, privacy-safe monitoring requirement exists. Do not introduce production telemetry or user tracking because the game specification excludes analytics and telemetry.

Manual testing in an actual headset remains necessary for final Quest validation where hardware access is available.

## 6.9 Integrations and other systems

Evaluate:

- Supabase MCP.
- Vercel MCP.
- n8n.
- OmniRoute — https://github.com/diegosouzapw/OmniRoute
- DeerFlow — https://github.com/bytedance/deer-flow
- Strix — https://github.com/usestrix/strix
- Cloudflare Security Skill — https://github.com/cloudflare/security-audit-skill
- Claude Code Best Practices.
- Figma MCP.

Important restrictions:

- Supabase is not required. Do not introduce a backend or account system.
- Vercel is the chosen deployment destination (owner decision, 2026-11-05): static hosting of the Vite build output only. Do not enable serverless functions, Web Analytics, Speed Insights or any other Vercel service that adds a backend or telemetry.
- n8n is not needed for the core gameplay loop.
- OmniRoute is not needed unless a concrete development workflow benefits from it.
- DeerFlow is not needed for ordinary code implementation.
- Strix and Cloudflare Security Skill may be used for relevant security audits, not as excuses to add infrastructure.
- No external service should be necessary to play the game.

## 6.10 Tool-selection policy

Before every substantial engineering task, decide:

1. Which tools are genuinely relevant?
2. Which are already installed?
3. Which can perform the task directly?
4. Which create overlapping functionality?
5. Which can reduce development time?
6. Which can consume unnecessary tokens or introduce complexity?

Record the decision in `docs/TOOLING_REGISTRY.md`.

Do not spend the first week installing tools.

The goal is to build Wound Up, not to build an elaborate AI-agent infrastructure project.

---

# 7. IWSDK API RULE — NEVER GUESS

This rule is critical.

Never invent:

- IWSDK component names.
- ECS APIs.
- Hand tracking APIs.
- Grab interaction APIs.
- Poke interaction APIs.
- Gaze-and-pinch APIs.
- Plane detection APIs.
- Scene setup APIs.
- Emulator commands.
- Mixed-reality lifecycle APIs.

Before implementing an IWSDK-specific feature:

1. Read official documentation at https://iwsdk.dev.
2. Read https://iwsdk.dev/skill.md.
3. Inspect the installed package.
4. Inspect its TypeScript declarations and examples.
5. Use the official MCP server or agent skill when available.
6. Verify the API against the installed version.
7. Write the smallest implementation that uses verified interfaces.
8. Document missing capabilities and workarounds.

If an API does not exist, implement the smallest suitable Three.js or browser-native solution and record the decision.

The generated official starter is our reference implementation.

Do not replace an SDK system with a custom system without demonstrating why.

---

# 8. VISUAL QUALITY — THIS IS A CORE REQUIREMENT

Wound Up must look beautiful.

Visual quality is a core product requirement, not a late-stage optional polish task.

## Visual direction

Mature vintage storybook illustration meets an antique horology catalogue.

The aesthetic should be:

- Warm.
- Elegant.
- Restrained.
- Detailed.
- Handcrafted.
- Tactile.
- Slightly magical.
- Premium.
- Nostalgic without feeling dated.
- Suitable for an intimate miniature world.

Avoid:

- Cartoony low-detail objects.
- Generic low-quality low-poly models.
- Clutter.
- Excessive bloom.
- Overly bright neon.
- Cheap-looking materials.
- Default Three.js primitive appearance.
- Generic enterprise dashboard UI.

## Palette

| Name | Hex |
|---|---|
| Aged brass | `#C9A227` |
| Walnut | `#5B3A24` |
| Cream | `#F2E6CF` |
| Deep teal | `#1F5C5C` |
| Warm lamp glow | `#FFC66D` |

Use these consistently across the world, UI, models, particles and lighting.

## Material quality

Use appropriate materials:

- Aged brass.
- Polished brass accents.
- Walnut wood.
- Cream enamel.
- Warm glass.
- Painted metal.
- Fabric or canvas.
- Ceramic.
- Paper.
- Subtle emissive surfaces.

Objects should have bevelled edges and believable proportions.

Do not make everything metallic.

Use material variation to communicate the difference between wood, brass, enamel, paper and fabric.

## Frozen and awakened states

Frozen objects:

- Desaturated to approximately 0.15 saturation.
- Cool tint.
- Static.
- Subtle atmospheric stillness.

Awakened objects:

- Full colour.
- Mechanical motion.
- Warm sound.
- Emissive windows and lights where appropriate.
- A visible colour ripple.

Wake ripple target duration: 1.5 seconds.

## Lighting

Baseline:

- One hemisphere light.
- One directional light.
- No real-time shadows on moving mechanical parts.
- Blob-shadow decals where appropriate.

Night:

- Lower ambient lighting.
- Emissive windows.
- Maximum four point lights.

Do not add expensive post-processing passes.

---

# 9. 3D ASSET PIPELINE

Establish a documented asset pipeline before producing large amounts of 3D content.

Folders (ADR-033 in `docs/DECISIONS.md`):

- `blender/source/<family>/` for Blender source files.
- `blender/scripts/` for the family generators and shared Blender code.
- `public/assets/models/shared/<family>/` and `public/assets/models/tockton/<family>/` for competition (G0) GLB exports.
- `public/assets/materials/` for the shared material library textures (ADR-032, accepted by the owner on 2026-11-06 and still reversible; [decision 4](docs/PRODUCTION_AUDIT.md#decisions-needed-from-the-owner)).
- `assets/future/<world_id>/<family>/` for post-competition GLBs, kept outside `public/` so they never ship.
- `assets/manifest/glb-manifest.json` for the machine-readable asset manifest.
- `References/` for the reference boards (working folder, never shipped, ADR-017).

Documents:

- `docs/ART_ASSET_PIPELINE.md` for art direction, modelling and export standards.
- The asset documents of the production directive (Part 4): `docs/MASTER_ASSET_INVENTORY.md`, `docs/GLB_ASSET_MANIFEST.md`, `docs/ASSET_NAMING_AND_FOLDER_STANDARDS.md`, `docs/BLENDER_PRODUCTION_GUIDELINES.md`, `docs/GLB_EXPORT_AND_VALIDATION.md`, `docs/ASSET_OPTIMISATION_BUDGET.md`, `docs/ASSET_REFERENCE_MAPPING.md`, `docs/ASSET_PRODUCTION_ROADMAP.md`, `docs/ASSET_AGENT_ASSIGNMENTS.md` and `docs/ASSET_QA_CHECKLIST.md`.
- `blender/README.md` for running the generators.
- `docs/CREDITS.md` for licenses and external sources.

Use Blender for the major visual objects.

Build the mechanical parts in Blender too, as parametric GLB families driven by manifest entries and cached and instanced at runtime (ADR-031). The game does not generate part geometry in TypeScript.

One GLB is a distinct mesh set with its own purpose; a finish is a runtime material and repeated pieces are instances (ADR-030). Budgets are in ADR-034 and the validation gate in ADR-037.

The final result must be visually consistent across hand-modelled and parametric assets.

Do not let separate agents create assets with incompatible scale, coordinate systems, material naming or pivot conventions.

Establish common conventions first.

---

# 10. PARALLEL AGENT ARCHITECTURE

We will use parallel specialist agents.

The lead architect owns integration.

Do not allow every agent to edit the same files.

## Agent 0 — Lead Architect and Integrator

Responsibilities:

- Overall architecture.
- Task planning.
- Shared interfaces.
- IWSDK setup.
- Runtime integration.
- Table detection, anchoring and the floating-stand fallback.
- Dependency management.
- Git branches and merges.
- Quality assurance.
- Final performance and deployment checks.

Owns:

- `CLAUDE.md`
- `src/index.ts` (the application entry point; ADR-017)
- `src/placement.ts`
- `src/stage.ts`
- `iwsdk.config.json`
- Shared application integration.
- Shared configuration.
- Architecture documentation.

## Agent 1 — Mechanical Simulation

Responsibilities:

- Graph solver.
- Gear ratios.
- Shaft propagation.
- Belt ratios.
- Pin/follower calculations.
- Spring energy.
- Jam detection.
- Machine target validation.
- Unit tests.

Owns:

- `src/sim/**`
- `tests/sim/**`

Must never import Three.js, IWSDK or browser APIs.

## Agent 2 — Part Catalogue and Runtime Parts

Responsibilities:

- Part catalogue (part definitions, finishes mapped to library materials).
- Blueprint data.
- Runtime loading, caching and instancing of the part GLBs.

Agent 2 does not generate part geometry. The part GLBs are parametric Blender families built by the mechanical library asset agent (ADR-031).

Owns:

- `src/parts/**`
- `src/content/parts/**`
- `src/content/blueprints/**`

Coordinates interfaces with Agent 1, and with the asset production agents on asset ids, sockets and colliders.

## Agent 3 — Hand Interaction

Responsibilities:

- IWSDK hand interaction research.
- Pinch/grab.
- Poke.
- Ray.
- Gaze-and-pinch.
- Socket snapping.
- Wrist twist.
- X-ray gesture.
- Ghost hands.
- Interaction feedback.

Owns:

- `src/interaction/**`

Must verify actual IWSDK APIs before implementation.

Must not independently change XR initialization or shared app entrypoints.

## Agent 4 — Town, Presentation and Audio

Responsibilities:

- Tockton diorama.
- Integration of the town's GLBs (their sources belong to the asset production agents).
- Town plots.
- Bakery.
- Theatre facade.
- Wake effects.
- Lighting.
- Visual presentation.
- Procedural audio.

Owns:

- `src/town/**`
- `src/audio/**`
- The scene and visual directories named in its task brief (no GLB sources or exports).

Must consume solver output rather than implementing mechanical correctness.

Must build under the stage root and read its scale rather than detecting surfaces.

## Asset production agents

Status: accepted (ADR-038, `docs/AGENT_OWNERSHIP_MATRIX.md`).

Blender asset work follows `docs/PRODUCTION_AUDIT.md` §12; assignments per family are in `docs/ASSET_AGENT_ASSIGNMENTS.md`.

| Agent | Builds | Owns |
|---|---|---|
| Asset framework | Shared Blender material library, family generator framework, GLB validator, manifest tooling | `tools/`, `blender/scripts/lib/` |
| Mechanical library | Family A: gears, shafts, springs and the other mechanical parts | Its family folders |
| Machines | Families C to F: Music Box, Carousel, Windmill and Bakery, Clock Tower and Theatre | Its family folders |
| World | Families B, G, H and I: trunk and workshop, Tockton environment, residents, gift and presentation | Its family folders |
| Manifest checker | Naming, manifest validation and cross-checks for each batch | Read-only |

Rules (directive Part 7.4):

- Each `.blend` and each GLB has exactly one owner at a time. Agents write only in their own family folders under `blender/source/` and `public/assets/models/`.
- Agents do not edit `assets/manifest/glb-manifest.json` in parallel; they report entry changes and the lead merges them.
- Production starts per family only after the pilot batch passes (directive Part 13, Phase 4).
- An exported GLB is not VALIDATED until the validator passes (ADR-037).

## Additional agents when useful

A gameplay and progression agent may later own:

- Letters.
- Save/load.
- Mode state.
- Gift link.
- Gift viewer.
- Pause menu.
- Progression.
- Daily repair (ADR-027 protects the feature).

A separate QA agent may own:

- Playwright tests.
- Browser testing.
- Build checks.
- Performance profiling.
- Regression testing.
- The final quality checklist for the judging criteria (`docs/ACCEPTANCE_TESTS.md` §18), signed off by Agent 0.

Until these agents exist, Agent 0 owns their work (ADR-038; `docs/AGENT_OWNERSHIP_MATRIX.md` section 3).

Do not create agents merely to increase agent count.

## Parallel execution rules

1. Define shared interfaces before parallel implementation.
2. Assign exclusive file ownership.
3. Use separate branches or Git worktrees.
4. Keep package/config changes controlled by the lead.
5. Review each agent's output.
6. Integrate incrementally.
7. Run tests after integration.
8. Resolve interface conflicts before merging.
9. Never let agents independently modify the main application entrypoint.
10. The lead must understand every integrated subsystem.

---

# 11. ARCHITECTURE RULES

The project must preserve the boundaries documented in `docs/TECHNICAL_ARCHITECTURE.md`.

The most important rule:

**The mechanical simulation is completely independent of rendering and XR.**

`src/sim/` must contain pure TypeScript.

The renderer consumes `SolveResult`.

The content layer holds machine blueprints, letters, melodies and parts catalogue.

The interaction layer converts hand input into game intents.

The gameplay layer manages modes and progression.

The XR runtime layer owns WebXR and IWSDK integration.

No duplicated mechanical calculations.

No machine-specific rules scattered across renderer code.

---

# 12. PERFORMANCE AND SMOOTHNESS

Our target is 72 FPS on Quest 3/3S and never below 60 FPS.

This is essential.

Avoid:

- Uncached geometry generation.
- Too many draw calls.
- Repeated object allocation inside animation loops.
- Unnecessary material instances.
- High-resolution textures without visible benefit.
- Excessively complex shaders.
- Expensive shadows.
- Excessive point lights.
- Unnecessary physics.
- Per-frame computationally expensive graph calculations.
- Unnecessary rendering of off-screen content.

Use:

- Geometry caching.
- Shared materials.
- Instancing.
- Static geometry merging.
- Efficient colliders.
- Low-overhead animation.
- Deterministic simulation.
- Profiling on target hardware when available.

Do not assume that desktop performance proves Quest performance.

---

# 13. TESTING REQUIREMENTS

Use automated and manual testing.

## Automated

- Vitest for simulation.
- Tests for graph propagation.
- Gear ratios.
- Jam detection.
- Missing sockets.
- Module mismatch.
- Spring runtime.
- Blueprints.
- Serialization.
- Save/load.
- Pure utility logic.

Use Playwright for appropriate desktop and browser journeys.

## Manual

Use the IWSDK desktop emulator with emulated hands.

Verify all required interactions there.

Verify table placement logic and the stand fallback in all of its built-in rooms. Emulated planes do not prove real-world plane detection.

When possible, arrange a tester with Quest 3 or Quest 3S to verify:

- MR session entry.
- Real-world table detection and anchor stability.
- Hand tracking.
- Pinch and release.
- Physical interaction comfort.
- Frame rate.
- Actual device behaviour.

Never require physical hardware for ordinary development verification.

---

# 14. OUT-OF-SCOPE FEATURES

Do not build:

- Voice input.
- Microphone input.
- Humming.
- Melody composition.
- Choreography.
- Free-build sandbox.
- Tram.
- Lighthouse.
- Grand theatre performance.
- Hot-air balloon.
- Weekly commissions.
- Seasonal parts or festivals.
- Player rarity tiers.
- XP.
- Ranking systems.
- Currency.
- Shops.
- Whole-town gifting.
- Accounts.
- Login.
- Cloud save.
- Leaderboards.
- Analytics.
- Telemetry.
- Multiplayer.
- AI/LLM gameplay calls.
- Passthrough camera computer vision.
- In-app purchases.
- Text keyboards in VR.
- Unity.
- Unreal.
- Native APK.

These features are excluded from the competition build (G0) even if they appear attractive; later-generation documents may describe them only as labelled future design under the scope firewall (ADR-028 in `docs/DECISIONS.md`), which never adds competition scope.

---

# 15. TOKEN AND COST MANAGEMENT

We have a strict development deadline.

Claude Code usage must be efficient.

Maintain:

- A project task ledger.
- A concise implementation plan.
- Durable architecture notes.
- Agent handoff notes.
- A list of completed investigations.
- A list of unresolved questions.

Before using a subagent:

1. Give it the exact task.
2. Give it only the relevant documentation.
3. Specify file ownership.
4. Specify output format.
5. Specify tests.
6. Require a concise summary.

Do not make five agents independently research the same topic.

Use tool output reduction where available.

Avoid unnecessarily verbose command output.

Do not repeatedly ask the same question to multiple models.

Never use a paid service without explicit approval.

---

# 16. SECURITY AND LICENSES

All original code and assets must comply with competition requirements.

- Verify licenses for downloaded assets.
- Record every third-party asset in `docs/CREDITS.md`.
- Do not commit API keys, secrets or credentials.
- Avoid unnecessary network requests.
- Do not transmit user data.
- Do not add analytics or telemetry.
- Validate gift-link data before loading.
- Treat gift-link content as untrusted input.
- Avoid unsafe deserialization.
- Keep the game fully functional without an external backend.

Use security auditing tools when relevant, not as a reason to introduce a complex security platform.

---

# 17. DEVELOPMENT PHASES

The project is developed in these phases.

## Phase 0 — Documentation and research

- Read the source specifications.
- Audit architecture.
- Establish tool registry.
- Verify IWSDK documentation.
- Establish shared interfaces.
- Establish Blender standards.
- Prepare agent assignments.

No feature implementation until the documentation audit is complete.

## Phase 1 — Runtime foundation

- Create official IWSDK mixed-reality project.
- Run emulator.
- Verify session entry.
- Verify grab interaction.
- Create test cube.
- Establish GitHub repository.
- Configure the Vercel project and deployment.
- Verify HTTPS deployment.

## Phase 2 — Music Box vertical slice

- Simulation solver.
- Table detection and anchoring, with the floating-stand fallback.
- Mechanical part generation.
- Socket snapping.
- Wind gesture.
- Music Box assembly.
- Procedural audio.
- Mechanical animation.
- Completion state.

This is the first major gameplay milestone.

## Phase 3 — Town and progression

- Trunk.
- Town.
- Letters.
- Parcel.
- Workbench.
- Machine placement.
- Wake effect.
- Save/load.
- Ghost hands.

## Phase 4 — Additional machines

- Carousel.
- Windmill.
- Bakery connection.
- Story repairs.
- X-ray.

## Phase 5 — Gift experience

- Gift serialization.
- Compression.
- URL hash.
- Gift viewer.
- Sharing fallbacks.

## Phase 6 — Remaining features

- Clock Tower if time permits.
- Daily repair (lightweight, deterministic; simplified rather than cut).
- Day/night if time permits.
- Accessibility.
- Pause menu.

## Phase 7 — Polish and submission

- Quest performance.
- XR interaction QA.
- Real-world table and anchor validation.
- Visual polish.
- Audio mix.
- Bug fixing.
- Demo video.
- Devpost submission.

---

# 18. TASK ACCEPTANCE RULE

Never mark a feature complete merely because its code exists.

A feature is complete only when:

1. Implementation exists.
2. Relevant tests pass.
3. Typecheck passes.
4. Lint passes.
5. Build passes.
6. Emulator behaviour is verified.
7. Acceptance criteria pass.
8. No critical regression is introduced.

For each completed task, report:

- Task.
- Implementation summary.
- Files changed.
- Tests executed.
- Exact results.
- Screenshots or recordings where useful.
- Remaining issues.
- Next task.

Never fabricate test results.

---

# 19. FIRST ACTION — DO NOT START CODING YET

When this repository is opened for the first time:

1. Read this file.
2. Read all existing project documentation.
3. Inspect the original Technical Design Doc.
4. Audit all listed tools and MCP servers.
5. Identify which tools are already installed.
6. Prepare `docs/TOOLING_REGISTRY.md`.
7. Research the current official IWSDK workflow.
8. Verify the official mixed-reality starter procedure.
9. Establish agent responsibilities and interfaces.
10. Prepare the implementation plan.
11. Identify missing documentation.
12. Present findings to the developer.

Do not immediately start creating gameplay files.

Do not generate an entire game in one uncontrolled task.

Do not launch parallel implementation agents before shared contracts and file ownership are clear.

The developer must be able to understand what will be built, how it will be built and how the result will be verified.

---

# 20. FINAL PRINCIPLE

We are not trying to produce a large codebase.

We are trying to produce a memorable, polished and reliable mixed-reality game.

A small number of exceptionally well-executed interactions is better than dozens of incomplete features.

Every important machine must feel handcrafted.

Every interaction must feel responsive.

Every mechanical system must produce understandable cause and effect.

Every scene must feel intentional.

Every frame must be performant.

Every feature must support the central fantasy:

**Build the machines. Wake the town. Raise the curtain.**

And we must have the finished submission ready by **November 18, 2026, IST**.