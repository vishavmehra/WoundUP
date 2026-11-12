# Integration Checklist: the first machine comes alive

**Milestone:** the complete Music Box loop, from frozen Tockton through trunk, letter, parcel, assembly, Run, winding, operation and placement to the awakening (owner integration prompt, 2026-11-12).

**Baseline audited:** 2026-11-12 18:58 IST.
- Local `main` is at `edd8d51`, which merges the solver, interaction, game core and table placement.
- The main checkout's checks pass: typecheck, lint and 634 unit tests.
- Nothing has been pushed since `2609544`.
- Browser and emulator tests have not been run on `edd8d51` yet.

Status values: Completed, In progress, Blocked, Needs modification, Needs review, Needs integration testing.

## 1. Merged on main

| Workstream | Branch and commit | Status | Integration note |
|---|---|---|---|
| Mechanical solver | `sprint/solver` `fce0693` | Completed, reviewed | Needs `blueprint.power` in machine data (parts workstream) |
| Hand interaction | `sprint/interaction` `be425bc` | Completed, reviewed | Not wired into `src/index.ts`; wind rule duplicated in `src/interaction/wind.ts` with a test keeping it equal to `src/sim` |
| Game core | `sprint/game-core` `ac562ff` | Completed, reviewed | Not wired; SaveV1 follows SAVE_PERSISTENCE_SPEC (lead ADR still to record) |
| Table placement | `sprint/table-placement` `2422163` | Completed, reviewed | Wired through `StageSystem`; `planeDetection` and `anchors` requested as optional features; needs emulator re-test |

## 2. Final code wave (in progress)

| Workstream | Branch and worktree | Status |
|---|---|---|
| A. Parts and blueprints | `sprint/parts`, `.claude/worktrees/w3-parts` | In progress (builder, then Sonnet review) |
| B. Town, awakening and audio | `sprint/town`, `.claude/worktrees/w3-town` | In progress (builder, then Sonnet review) |
| C. In-headset screens | `sprint/ui`, `.claude/worktrees/w3-ui` | In progress (builder, then Sonnet review) |
| Integration | `sprint/integration`, `.claude/worktrees/w3-integration` | Waiting for A, B and C |

## 3. Assets

| Family | Status |
|---|---|
| Library gears 12, 16 and 24 (`m1`) | Completed, Gate F passed, 16T integrated in the scene |
| Mechanical parts (gears 10 and 20, bevel, shafts, springs, bearing, bracket, winding key, governor) | Produced, cross-family validation pending |
| Mira and Otto | Produced, cross-family validation pending |
| Carousel (6) and Windmill (4) | Produced, 0 validator FAIL; horse silhouette flagged as minor |
| Music Box case, cylinder, comb | In progress |
| Trunk and workshop | In progress |
| Town ground, stand rework, Bakery, theatre facade | In progress |
| Manifest fields reported by the family agents | Needs merging by the lead |

Blocked and staying blocked: `music_box_slot_11`, `music_box_slot_12`, `run_lever`, `town_houses`, `town_props_set`, `gift_engraving_plate`.

## 4. Gates before push and deploy

1. All three branches reviewed and merged into `sprint/integration`, then into `main`.
2. Typecheck, lint, unit tests and production build pass.
3. Playwright browser tests pass.
4. Emulator tests, plus the full Music Box walkthrough, repeated with reset and save restore.
5. Evidence screenshots in `docs/evidence/` with scenario, state, result and source (Desktop or IWER; never Quest).
6. Independent Sonnet integration review.
7. Then push. Deploy only after release checks pass.

Physical Quest 3 and 3S verification stays unverified until a real headset test exists.
