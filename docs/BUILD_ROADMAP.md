# Wound Up — Build Roadmap

**Project:** Wound Up  
**World:** Tockton  
**Internal completion deadline:** November 18, 2026 (IST)  
**Code freeze target:** November 16, 2026

## 1. Purpose

This roadmap defines the order in which Wound Up should be researched, built, tested, integrated, and released.

The project has a fixed deadline.

The roadmap prioritises a complete, polished core experience over implementing every optional feature.

The Music Box loop, hands-first interaction, town restoration, and gifting experience are the primary product priorities.

## 2. Delivery principles

- Documentation before implementation.
- Verify IWSDK before building on it.
- Prove the smallest end-to-end interaction early.
- Build the solver independently.
- Build one complete machine before expanding the machine library.
- Integrate continuously.
- Test the deployed build.
- Keep optional features cuttable.
- Reserve time for polish, testing, and submission.

## 3. Phase 0 — Documentation and project audit

**Target: November 4–5**

Objectives:

- Complete the project documentation.
- Review `CLAUDE.md`.
- Review all specifications.
- Audit repository structure.
- Audit installed tools and MCP servers.
- Create `TOOLING_REGISTRY.md`.
- Record architecture decisions.
- Identify contradictions and missing contracts.
- Confirm project deadline and scope.

Exit criteria:

- Documentation is internally consistent.
- Shared interfaces are identified.
- Tool availability is known.
- No major unresolved architecture question blocks the first implementation milestone.

Do not begin large-scale feature implementation before this phase is complete.

## 4. Phase 1 — Foundation and WebXR proof

**Target: November 4–5**

Objectives:

- Create the new GitHub repository.
- Initialise the IWSDK project.
- Verify Node.js requirements.
- Install dependencies.
- Confirm the exact IWSDK version.
- Configure TypeScript.
- Configure build and development commands.
- Establish the desktop fallback.
- Configure initial Vercel deployment.
- Verify a minimal scene.
- Verify one basic interaction.

Critical proof:

A simple object must be interactable in the development environment and the application must be deployable to a public HTTPS URL.

Exit criteria:

- Application starts.
- Production build succeeds.
- Desktop preview works.
- IWSDK lifecycle is understood.
- Minimal interaction is verified.
- Public deployment path is proven.

## 5. Phase 2 — Mechanical solver and data foundation

**Target: November 5–7**

Objectives:

- Define stable part identifiers.
- Define blueprint contracts.
- Define socket and connection types.
- Implement pure TypeScript solver.
- Implement shaft propagation.
- Implement gear ratios.
- Implement belt ratios.
- Implement pin and trigger behaviour.
- Implement incomplete and jam detection.
- Implement target validation.
- Implement spring energy and runtime.
- Add deterministic unit tests.

Exit criteria:

- Solver tests pass.
- Blueprint validation works.
- Solver has no rendering dependencies.
- Music Box mechanical configuration can be represented and evaluated.

## 6. Phase 3 — Part library and Music Box vertical slice

**Target: November 6–8**

Objectives:

- Create required Music Box hero asset in Blender.
- Create its required mechanical parts.
- Establish GLB export conventions.
- Implement part loading.
- Implement part grabbing.
- Implement socket targeting.
- Implement snapping.
- Implement removal.
- Connect assembly to solver.
- Implement winding.
- Implement Music Box runtime.
- Implement fixed melody.
- Add first-letter progression.

Exit criteria:

The player can complete the Music Box loop:

1. Receive letter.
2. Open parcel.
3. Assemble parts.
4. Wind mechanism.
5. Start machine.
6. See it operate.

This is the first major vertical-slice milestone.

## 7. Phase 4 — Town and restoration

**Target: November 8–9**

Objectives:

- Create town base.
- Create four machine plots.
- Create static bakery and theatre facade.
- Create trunk and workbench presentation.
- Implement frozen state.
- Implement awakened state.
- Implement machine placement.
- Implement wake ripple.
- Implement local audio response.
- Implement save and load.
- Implement ghost-hand onboarding.

Exit criteria:

The Music Box can be placed in town and the correct plot visibly wakes.

## 8. Phase 5 — Repairs and additional machines

**Target: November 10–11**

Objectives:

- Implement worn spring repair.
- Implement the short-runtime symptom.
- Implement correct spring replacement.
- Build Carousel.
- Implement Carousel operation.
- Build Windmill.
- Implement Windmill operation.
- Build Bakery response.
- Implement wrong-gear repair.
- Implement X-ray.

Exit criteria:

- Music Box repair works.
- Carousel loop works.
- Windmill loop works.
- Windmill repair works.
- X-ray can inspect internal mechanisms.

## 9. Phase 6 — Gifting

**Target: November 12**

Objectives:

- Define gift payload.
- Implement compression.
- Implement base64url encoding.
- Implement URL generation.
- Implement payload validation.
- Implement native share.
- Implement clipboard fallback.
- Implement visible URL fallback.
- Build gift viewer.
- Implement unwrapping.
- Implement machine presentation.
- Implement desktop and phone inspection.

Exit criteria:

A completed machine can be shared through a URL and opened in a separate browser session.

## 10. Phase 7 — Optional features and completeness

**Target: November 13**

Potential objectives:

- Clock Tower.
- Daily repair.
- Day/night toggle.
- Additional letters.
- Optional presentation details.

These are conditional tasks.

Do not begin optional work while any critical core feature is incomplete.

Exit criteria:

All retained features are integrated and the product remains stable.

## 11. Phase 8 — Accessibility and polish

**Target: November 14**

Objectives:

- Gaze-and-pinch mode.
- Easy Snap.
- Accessible winding.
- Alternative X-ray activation.
- Pause menu.
- Restart confirmation.
- Audio mix.
- Interaction feedback polish.
- Visual consistency review.
- Performance review.

Exit criteria:

The main experience is comfortable, understandable, and polished.

## 12. Phase 9 — QA and hardware validation

**Target: November 15**

Objectives:

- Run acceptance tests.
- Run unit tests.
- Run integration tests.
- Run browser tests.
- Test deployed application.
- Arrange Quest 3 or Quest 3S tester.
- Verify hand tracking.
- Verify seated comfort.
- Verify performance.
- Fix critical issues.
- Record unresolved hardware limitations.

Exit criteria:

No known critical issue prevents a judge from experiencing the core game.

## 13. Phase 10 — Code freeze

**Target: November 16**

Code freeze means:

- No new gameplay features.
- No architectural experiments.
- No optional scope expansion.
- Only critical bug fixes.
- Only release-blocking corrections.
- Final regression testing.

Do not use code freeze as an opportunity to add features.

## 14. Phase 11 — Submission preparation

**Target: November 17**

Objectives:

- Capture final gameplay footage.
- Produce demo video under three minutes.
- Finalise README.
- Verify public repository.
- Verify public playable URL.
- Prepare project description.
- Prepare technology explanation.
- Prepare competition submission.
- Verify asset credits.
- Review final build.

## 15. Phase 12 — Final buffer and submission

**Target: November 18, before midnight IST**

Objectives:

- Final deployment check.
- Final browser smoke test.
- Verify video link.
- Verify repository visibility.
- Verify Devpost fields.
- Submit before the internal deadline.
- Preserve a final known-good build.

The official competition page supplied for the project lists the deadline as November 19, 2026, at 1:30 AM IST.

The internal deadline remains November 18 before midnight IST.

Do not plan to finish at the official deadline.

## 16. Cut strategy

If the schedule slips, cut in this order:

1. Clock Tower.
2. Day/night toggle.
3. Daily repair.
4. Decoy parts.
5. Non-essential decorative details.
6. Optional presentation refinements.

Do not cut:

- Core Music Box loop.
- Hands-first interaction.
- Mechanical solver.
- Machine placement.
- Town wake-up.
- Save/load.
- Core gift-sharing experience.
- Basic onboarding.
- Stable deployment.

## 17. Critical dependencies

| Feature | Dependency |
|---|---|
| Assembly | Part data, hand interaction, sockets |
| Solver | Blueprint and mechanical contracts |
| Machine runtime | Solver output and machine assets |
| Placement | Completed machine and town plots |
| Town wake-up | Valid placement and progression |
| Repair | Solver symptoms and replaceable parts |
| Gifting | Stable blueprint IDs and solver validation |
| Save/load | Stable progression and save schema |
| Accessibility | Shared interaction abstraction |
| Deployment | Stable build and correct asset paths |

Resolve dependencies before parallelising implementation.

## 18. Progress tracking

For each milestone, record:

- Planned date.
- Actual completion date.
- Owner.
- Status.
- Dependencies.
- Tests.
- Blockers.
- Evidence.
- Scope changes.

Use:

- Not Started.
- In Progress.
- Blocked.
- Complete.
- Cut.

Do not mark a milestone complete based only on code being written.

## 19. Final principle

The project succeeds when the core experience is complete, polished, playable, and submitted on time.

A smaller finished Wound Up is better than a larger unfinished Wound Up.
