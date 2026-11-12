

# Wound Up — Testing and Quality Assurance Plan

**Project:** Wound Up  
**Status:** Quality plan  
**Depends on:** `ACCEPTANCE_TESTS.md`, `TECHNICAL_ARCHITECTURE.md`, `BUILD_ROADMAP.md`, `INTERACTION_SPEC.md`

---

## 1. Purpose

This document defines how Wound Up will be tested throughout development and before competition submission.

`ACCEPTANCE_TESTS.md` defines what must work.

This document defines:

- How testing is organised.
- Which environments are used.
- When tests are performed.
- How bugs are classified.
- How regressions are prevented.
- How performance is evaluated.
- What evidence is required before release.

## 2. Testing Principles

1. Test continuously rather than waiting until the end.
2. Test core gameplay before optional features.
3. Keep the mechanical solver independently testable.
4. Test interactions in the actual supported runtime.
5. Do not treat desktop success as proof of headset success.
6. Never claim Quest hardware verification without actual headset testing.
7. Test the deployed HTTPS application, not only the local development server.
8. Fix critical regressions before adding new features.
9. Preserve a reproducible build.
10. Do not sacrifice core reliability for optional polish.

## 3. Test Environments

### 3.1 Desktop Browser

Purpose:

- Fast development.
- UI testing.
- Gameplay progression.
- Mechanical solver testing.
- Visual inspection.
- Debugging.

Desktop is the primary development environment.

It does not prove that hand tracking or headset performance works.

### 3.2 WebXR Emulator

Purpose:

- Validate WebXR application flow.
- Test supported input emulation.
- Test immersive session transitions.
- Test interaction state changes.
- Detect browser integration problems.
- Test table placement logic and the stand fallback in every built-in room: `sunlit_living_room`, `home_office`, `conference_room`, `open_office`, `kitchen`, `bedroom`, `music_studio`, `open_studio`.

Emulator success is not equivalent to physical Quest hardware verification. Emulated planes are not evidence of real-world plane detection.

### 3.3 Quest 3 / Quest 3S

Purpose:

- Real headset validation.
- Hand tracking.
- Real-world table detection, anchor stability and spatial placement.
- Seated comfort.
- Frame rate.
- Visual quality.
- Audio.
- Long-session stability.

The project owner does not have a Quest headset.

A real Quest 3 or Quest 3S tester must be arranged for final verification. Until then, the real-world table tests (`ACCEPTANCE_TESTS.md` TBL-13 to TBL-18) and stand comfort (STAND-05) stay Blocked.

Record the exact headset model and browser used.

### 3.4 Deployed HTTPS Environment

The Vercel deployment must be tested independently.

Validate:

- Correct base path.
- Correct asset paths.
- HTTPS availability.
- Application loading.
- WebXR session support.
- Fallback behaviour.
- Reload behaviour.
- Gift links.

A successful local build does not prove that the deployed application is correct.

## 4. Testing Pyramid

### Level 1 — Unit Tests

Fast and isolated tests.

Focus:

- Mechanical solver.
- Blueprint validation.
- Part compatibility.
- Save validation.
- Gift payload validation.
- Progression rules.
- State transitions.
- Table suitability and town scale.
- Utility functions.

Use Vitest.

### Level 2 — Integration Tests

Validate interactions between systems.

Examples:

- Assembly changes trigger solver evaluation.
- Solver output controls simulation.
- Machine completion updates progression.
- Placement wakes a town plot.
- Save service restores machine progress.
- Gift payload opens the correct machine.

### Level 3 — Browser End-to-End Tests

Use Playwright where the required browser behaviour can be tested.

Examples:

- Landing page.
- Desktop fallback.
- Letter progression.
- Machine construction.
- Restart flow.
- Save/load.
- Gift viewer.
- Deployed application smoke test.

### Level 4 — Manual Spatial Tests

Manual testing is required for:

- Hand tracking.
- Pinch accuracy.
- Wrist rotation.
- Table placement.
- Gaze mode.
- Spatial comfort.
- Physical reach.
- Quest performance.

Automated browser tests cannot replace this level.

## 5. Test Priorities

### P0 — Release Blocking

- Application does not load.
- Immersive session cannot start where supported.
- A session fails, or play is blocked, because plane detection or anchoring is unavailable.
- Desktop fallback fails.
- Core Music Box loop cannot be completed.
- Solver gives incorrect results.
- Machine runs despite invalid solver result.
- Progression becomes unrecoverable.
- Gift links crash the application.
- Critical hand interactions are unusable.
- Severe performance instability.

### P1 — High Priority

- Snapping frequently fails.
- The town drifts or jumps during a session.
- Table placement chooses an unusable surface (the floor, out of reach or too small).
- Save/load loses progress.
- Audio loops do not stop.
- Machine animation is incorrect.
- Town activation does not work.
- Major visual elements are missing.
- Accessibility mode is unusable.

### P2 — Medium Priority

- Minor UI alignment issues.
- Occasional non-blocking visual glitches.
- Small audio timing differences.
- Minor animation imperfections.

### P3 — Low Priority

- Cosmetic refinements.
- Minor copy changes.
- Small decorative inconsistencies.

## 6. Regression Testing

After any change to a core system, rerun its related tests.

| Changed system | Required regression |
|---|---|
| Solver | All solver unit tests |
| Blueprint data | Blueprint validation and all machine assembly tests |
| Interaction | Pinch, snap, removal, winding, placement |
| Simulation | Machine start, stop, speed, energy, pause |
| Persistence | Save, reload, migration, reset |
| Gifting | Payload validation and viewer |
| Town | Placement, wake effects, connected building behaviour |
| Table placement | Surface choice, town scale, anchor stability, stand fallback, all emulator rooms |
| UI | Main progression and desktop fallback |
| Build configuration | Production build and deployed smoke test |

Before code freeze, run the full regression suite.

## 7. Performance Testing

Performance must be evaluated on the target class of hardware.

Measure:

- Frame rate.
- Frame-time consistency.
- Initial loading time.
- Memory growth.
- Number of active objects.
- Draw calls where available.
- Texture memory.
- Geometry complexity.
- Interaction responsiveness.
- Frame-time cost of plane detection and anchors.

Avoid relying on desktop frame rate as a Quest performance indicator.

The experience should target stable, comfortable performance on Quest 3 and Quest 3S.

The exact runtime performance target must be verified against the actual browser and headset configuration.

## 8. Visual QA

Inspect:

- Model quality.
- Correct pivots.
- Gear alignment.
- Material consistency.
- Lighting.
- Frozen versus awakened state.
- Text readability.
- Interaction highlights.
- X-ray clarity.
- Gift presentation.
- Town composition.

Hero assets must not look like unfinished primitive placeholders.

Check assets at actual gameplay distance and scale.

## 9. Interaction QA

Test:

- Pinch selection.
- Part attachment.
- Snap preview.
- Valid snap.
- Invalid snap.
- Part removal.
- Winding.
- Run release.
- X-ray activation.
- Machine placement.
- UI poke.
- Gaze-and-pinch fallback.
- Easy Snap.

Test with different hand positions and realistic seated reach, on a table and on the stand.

Do not assume that an interaction works because it works with a mouse.

## 10. Accessibility QA

Validate:

- Gaze-and-pinch mode.
- Larger snap radius.
- Ray interaction mode.
- Readable text.
- Clear feedback.
- Seated play.
- No forced locomotion.
- No forced camera movement.
- Pause and resume.
- Clear restart confirmation.

## 11. Test Evidence

For each important test, record:

- Test ID.
- Date.
- Build identifier or commit.
- Environment.
- Browser.
- Headset model, if applicable.
- Steps performed.
- Expected result.
- Actual result.
- Pass/fail.
- Screenshot or recording when useful.
- Known limitations.

Do not mark a test passed based on assumptions.

Use these labels:

- `PASS`
- `FAIL`
- `BLOCKED`
- `NOT TESTED`
- `NOT APPLICABLE`

## 12. Bug Reporting Template

### BUG-XXX — Short description

- **Severity:** P0 / P1 / P2 / P3
- **Environment:**
- **Build/commit:**
- **Steps to reproduce:**
- **Expected result:**
- **Actual result:**
- **Frequency:**
- **Screenshot/video:**
- **Suspected system:**
- **Owner:**
- **Status:**

## 13. Test Gates

### Gate A — Foundation

Must pass:

- Application starts.
- TypeScript checks.
- Production build succeeds.
- Desktop fallback works.
- Basic interaction works.

### Gate B — Core Gameplay

Must pass:

- Town stands on an emulated table, and falls back to the stand when no surface can be used.
- Town opens.
- Letter progression works.
- Music Box assembles.
- Solver evaluates correctly.
- Winding and running work.
- Machine can be placed.

### Gate C — Feature Integration

Must pass:

- Carousel.
- Windmill and Bakery.
- Save/load.
- X-ray.
- Gift link.
- Progression.

Optional systems may be cut if they threaten stability.

### Gate D — Release Candidate

Must pass:

- Full acceptance suite.
- Regression suite.
- Deployed HTTPS smoke test.
- No P0 or P1 bugs.
- Performance review.
- Manual headset test or clearly documented hardware-testing limitation.
- Final demo flow.

## 14. Final QA Checklist

- [ ] Application loads from the deployed URL.
- [ ] Desktop fallback works.
- [ ] WebXR session flow works where supported.
- [ ] Table placement and the stand fallback work.
- [ ] Town introduction works.
- [ ] Letters progress correctly.
- [ ] Music Box can be assembled.
- [ ] Solver returns expected results.
- [ ] Machine simulation follows solver output.
- [ ] Winding and energy exhaustion work.
- [ ] Machine placement works.
- [ ] Town wake effect works.
- [ ] Save/load works.
- [ ] Gift link works.
- [ ] Accessibility options work.
- [ ] No critical console errors.
- [ ] No P0 or P1 bugs remain.
- [ ] Performance has been reviewed.
- [ ] Quest testing status is honestly documented.
- [ ] Final demo recording has been reviewed.
- [ ] The judging-criteria checklist (`ACCEPTANCE_TESTS.md` §18) is complete, with the evidence level of each item recorded.

