import type { V3 } from './comfort.js';

/**
 * Where every flow-UI prop sits, in stage-local metres (+Y up, +Z towards the player, the stage root is the town origin).
 * Numbers are TOCKTON_DIMENSIONS §3.3, §4 and §5; the workbench and everything on it are never scaled, the trunk and the
 * latch scale with the town (`s`, 0.75 to 1). Tests check each essential anchor against INTERACTION_SPEC §3.
 */
const v = (x: number, y: number, z: number): V3 => ({ x, y, z });

/** The workbench stands with its back edge against the town's front edge (z = +15 cm * s) and is 25 cm deep. */
export const benchZ = (s: number): number => 0.15 * s + 0.125;

/** Bench-local seat points (the `SOCKET_Tray`, `SOCKET_Build` and `SOCKET_Blueprint` empties of workbench.glb). */
export const BENCH = {
  top: 0.03,
  tray: v(-0.155, 0.03, 0),
  build: v(0.0025, 0.03, 0),
  blueprint: v(0.1575, 0.03, 0),
  /** The run sign: a post in front of the gap between the build and blueprint zones (the furthest forward that keeps the plaque within 35 degrees, see tests/ui/layout.test.ts). */
  runSign: v(0.0975, 0.03, 0.05),
} as const;

/**
 * The flat paper of blueprint_sheet.glb (0.12 x 0.16 m, 0.5 mm thick, with a rolled end at each short side up to 12 mm tall): the
 * painted plan covers the paper with a margin and floats 1.5 mm above it so it never fights the sheet's own surface.
 */
export const SHEET_PAPER = { w: 0.112, h: 0.15, y: 0.002 } as const;

export const LETTER_SPOT: V3 = v(0, 0.002, 0.275);
/** Centre of the reading card and of the pause and gift panels: close, a little above the surface, facing the player. */
export const READING_SPOT: V3 = v(0, 0.17, 0.27);
/** Small brass buttons beside the bench, floating just above the surface: pause on the left, the gift ribbon on the right. */
export const PAUSE_SPOT: V3 = v(-0.27, 0.09, 0.2);
export const GIFT_SPOT: V3 = v(0.27, 0.09, 0.2);
/** The trunk latch (trunk_main.glb `COL_Latch`) scaled with the town. */
export const latchSpot = (s: number): V3 => v(0, 0.14 * s, 0.125 * s);

export const benchPoint = (s: number, local: V3): V3 => v(local.x, local.y, benchZ(s) + local.z);

/** Height of the run sign's plaque above the bench top. */
export const RUN_SIGN_HEIGHT = 0.085;
/** The counter and result label sits on the sign, above the plaques (centre height above the bench top). */
export const RUN_SIGN_SLIP_HEIGHT = RUN_SIGN_HEIGHT + 0.05;

/** The targets INTERACTION_SPEC §3 calls essential, at town scale `s`. */
export function essentialAnchors(s: number): Record<string, V3> {
  return {
    latch: latchSpot(s),
    envelope: LETTER_SPOT,
    readingCard: READING_SPOT,
    tray: benchPoint(s, BENCH.tray),
    build: benchPoint(s, BENCH.build),
    blueprint: benchPoint(s, BENCH.blueprint),
    runSign: benchPoint(s, v(BENCH.runSign.x, BENCH.top + RUN_SIGN_HEIGHT, BENCH.runSign.z)),
    runLabel: benchPoint(s, v(BENCH.runSign.x, BENCH.top + RUN_SIGN_SLIP_HEIGHT, BENCH.runSign.z)),
  };
}
