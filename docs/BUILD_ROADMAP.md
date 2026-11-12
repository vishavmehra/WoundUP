# Wound Up — Build Roadmap

**Project:** Wound Up  
**World:** Tockton  
**Internal completion deadline:** November 18, 2026 (IST)  
**Code freeze target:** November 16, 2026  
**Related:** [MASTER_PRODUCTION_ROADMAP.md](MASTER_PRODUCTION_ROADMAP.md) adds the asset lane, the verification and release tasks and the generations after the competition; this document stays authoritative for the dates of competition features. Gates: [INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md).

## 1. Purpose

This roadmap defines the order in which Wound Up should be researched, built, tested, integrated, and released.

The project has a fixed deadline.

The roadmap prioritises a complete, polished core experience over implementing every optional feature.

The Music Box loop, hands-first interaction, table placement, town restoration, and gifting experience are the primary product priorities.

The core priority remains a polished, fully playable hands-first experience. No new feature may destabilise core gameplay or compromise the 60 FPS minimum on Quest hardware (owner direction, 2026-11-05).

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

## 5A. Phase 2A — Table detection and anchoring

**Target: November 7–8, straight after the solver and alongside the Music Box slice**

A core feature (ADR-026). Behaviour: `PRODUCT_SPEC.md` §3.2. Architecture: `TECHNICAL_ARCHITECTURE.md` §6.4. Tests: `ACCEPTANCE_TESTS.md` §4.1.

| Task | Priority | Effort | Dependencies | Acceptance | Agent | Target | Status |
|---|---|---|---|---|---|---|---|
| TP-1 Verify IWSDK's plane and anchor path against the installed version; request `planeDetection` and `anchors` as optional features; establish whether the anchor keeps the town on the table through a recentre (ADR-026) | Must | 2 hours | Phase 1 | TBL-06, TBL-08 | Agent 0 | Nov 7 | Not Started |
| TP-2 Surface suitability, ranking and town scale as pure logic in `src/placement.ts` | Must | 2 hours | `PRODUCT_SPEC.md` §3.2 | TBL-01 to TBL-04 | Agent 0 | Nov 7 | Not Started |
| TP-3 Apply the choice once per session in `src/stage.ts`: anchor, stand hidden, contact shadows on the table, town scale, stand fallback. A visibility change must not re-place the stage, and a recentre must not move a table-anchored town; a recentre places only the stand again (the TP-6 change to `StageSystem` already ignores the menu's visibility change; keep that true on the table path) | Must | 4 hours | TP-1, TP-2 | TBL-07, TBL-08, TBL-09, TBL-11, TBL-12 | Agent 0 | Nov 8 | Not Started |
| TP-4 Run all eight built-in emulator rooms; check seated reach and viewing angle on the table and on the stand | Must | 2 hours | TP-3 | TBL-05, TBL-10, STAND-03 | Agent 0 | Nov 8 | Not Started |
| TP-5 Test on a real Quest | Must | Half a day with a tester | TP-3, TP-7 | TBL-13 to TBL-18, STAND-05 | Agent 0, with the tester | As soon as a tester exists, at the latest Nov 15 | Blocked: no headset and no named tester |
| TP-6 Raise the fallback stand to about 38 cm below the eyes, 55 cm ahead, measured from the eyes when it is placed and placed again on recentre (ADR-019) | Must | 1 hour | Phase 1 | STAND-01, STAND-02, STAND-04 | Agent 0 | Nov 6 | In Progress |
| TP-7 Arrange a Quest 3 or Quest 3S tester: a named person, their device and a test date, early enough to fix what TP-5 finds | Must | The owner's time; 1 hour for Agent 0 to prepare the build link and the TP-5 test list | None | Tester, device and date recorded in this row | Owner, with Agent 0 | Nov 10 | Not Started |

The stand path must keep working at every step, so the Music Box slice never waits on this phase.

Exit criteria:

- TBL-01 to TBL-12 and STAND-01 to STAND-04 pass against the current stage. Phase 4 re-runs the ones that need the trunk, workbench and save.
- TBL-13 to TBL-18 and STAND-05 stay recorded as Blocked until a tester is available; an emulator pass does not replace them.
- Table placement adds no per-frame surface work.

## 6. Phase 3 — Part library and Music Box vertical slice

**Target: November 6–8**

Asset supply: the Blender assets this phase needs come from the asset lane in [MASTER_PRODUCTION_ROADMAP.md](MASTER_PRODUCTION_ROADMAP.md) §4.1 and §5.3. Its proposed dates run up to two days behind this phase (risk R-1 there). The lead decides between dev-only stand-ins and moving this phase's visual exit criteria to the day the assets are integrated.

Objectives:

- Create required Music Box hero asset in Blender.
- Create its required mechanical parts.
- Establish GLB export conventions.
- Build under the stage root, so the slice works on a table and on the stand.
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
- Re-run TBL-07, TBL-09, TBL-10, TBL-11 and STAND-03 with the real trunk, town, workbench and save; keep the workbench in reach on a shallow table.
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

## 10. Phase 7 — Daily repair, optional features and completeness

**Target: November 13**

| Task | Priority | Effort | Dependencies | Acceptance | Agent | Target | Status |
|---|---|---|---|---|---|---|---|
| DR-1 Daily repair (ADR-027): lightweight and deterministic; offered after Letter 5, chosen from the local date, one completion per date, reusing existing machines, parts and repair faults | Must | Half a day | Letter 5 and the Windmill repair (Phase 5), save and load (Phase 4) | DAILY-01 to DAILY-05 | The progression agent, or Agent 0 while there is none | Nov 13 | Not Started |

DR-1 starts only once the Music Box loop, Carousel, Windmill, placement and gifting are integrated (Phases 3 to 6), and must not delay them. If time is critical, simplify it rather than cut it.

Potential objectives:

- Clock Tower.
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
- Run the Quest tester session booked in TP-7.
- Verify real-world table detection and anchoring (TBL-13 to TBL-18) and stand comfort (STAND-05).
- Verify hand tracking.
- Verify seated comfort.
- Verify performance.
- Fix critical issues.
- Record unresolved hardware limitations.
- Complete the final quality checklist for the four judging criteria (task QA-1).

| Task | Priority | Effort | Dependencies | Acceptance | Agent | Target | Status |
|---|---|---|---|---|---|---|---|
| QA-1 Final quality checklist for the four judging criteria (`ACCEPTANCE_TESTS.md` §18) | Must | Half a day | Phases 2A to 8; TP-7 for the Hardware items | JUD-01 to JUD-21 each Pass, or Blocked with its reason | The QA agent records the evidence, Agent 0 signs it off (Agent 0 does both while there is no QA agent) | Nov 15 | Not Started |

Exit criteria:

No known critical issue prevents a judge from experiencing the core game, and every judging-criteria item passes with the evidence it names or is recorded as Blocked.

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
- If the owner makes the repository public, verify it is presentable (ADR-022).
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
- Verify repository visibility matches the owner's choice.
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
3. Decoy parts.
4. Non-essential decorative details.
5. Optional presentation refinements.

If time is still critical, simplify the daily repair rather than remove it (ADR-027).

Do not cut:

- Core Music Box loop.
- Hands-first interaction.
- Mechanical solver.
- Table detection and anchoring, with the floating stand as fallback.
- Machine placement.
- Town wake-up.
- Save/load.
- Core gift-sharing experience.
- Daily repair, in simplified form if needed.
- Basic onboarding.
- Stable deployment.

## 17. Critical dependencies

| Feature | Dependency |
|---|---|
| Assembly | Part data, hand interaction, sockets |
| Solver | Blueprint and mechanical contracts |
| Table placement | Verified IWSDK plane and anchor APIs, stage root, stand fallback |
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

Asset statuses (NOT_STARTED to INTEGRATED) are separate from these words and are defined in [GLB_ASSET_MANIFEST.md](GLB_ASSET_MANIFEST.md) §5. The gates that decide them, and Gates A to D, are in [INTEGRATION_AND_RELEASE_GATES.md](INTEGRATION_AND_RELEASE_GATES.md).

## 19. Final principle

The project succeeds when the core experience is complete, polished, playable, and submitted on time.

A smaller finished Wound Up is better than a larger unfinished Wound Up.
