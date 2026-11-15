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
  /**
   * The run sign: a post in front of the gap between the build and blueprint zones (the furthest forward that keeps the plaque within 35
   * degrees, see tests/ui/layout.test.ts). Far enough to the right that the plaques, which turn to face the player, stay a centimetre clear
   * of the build zone (BUILD_ZONE reaches x = +6.75 cm; the Run plaque is 7.5 cm wide), tests/ui/hot-zones.test.ts.
   */
  runSign: v(0.1175, 0.03, 0.04),
} as const;

/**
 * The flat paper of blueprint_sheet.glb (0.12 x 0.16 m, 0.5 mm thick, with a rolled end at each short side up to 12 mm tall): the
 * painted plan covers the paper with a margin and floats 1.5 mm above it so it never fights the sheet's own surface.
 */
export const SHEET_PAPER = { w: 0.112, h: 0.15, y: 0.002 } as const;

export const LETTER_SPOT: V3 = v(0, 0.002, 0.275);
/** Centre of the reading card and of the pause and gift panels: close, a little above the surface, facing the player. */
export const READING_SPOT: V3 = v(0, 0.17, 0.27);
/**
 * Centre of the pause, restart and gift panels (up to 29 x 32.5 cm): further from the eyes than the reading card, about 44 cm
 * from the eyes over a stand (UI_UX_SPEC section 23, "avoid large panels close to the face"), still in front of the town.
 */
export const PANEL_SPOT: V3 = v(0, 0.2, 0.15);
/**
 * Small brass buttons beside the bench, floating just above the surface. The two that show while a machine is built (pause and the
 * lens) stand on the right, away from the parts tray on the left and the build zone: a hand reaching into the tray has its open
 * fingertip about 12 cm past the part it is about to pinch, and a fingertip within 2 cm of a medallion presses it (BUG-4: the old
 * pause medallion, 12 cm from the second bracket, opened the Pause panel in the middle of the build). The two that show only in the
 * town (gift and the daily repair) stand on the left, where no tray stands then. tests/ui/hot-zones.test.ts holds every one of them
 * clear of the tray compartments and the build zone, against the real tray model.
 */
export const PAUSE_SPOT: V3 = v(0.34, 0.09, 0.2);
export const GIFT_SPOT: V3 = v(-0.28, 0.09, 0.2);
/** The daily repair medallion (ADR-027), above the gift one: the same distance from the town, one medallion higher. */
export const DAILY_SPOT: V3 = v(-0.28, 0.15, 0.2);
/**
 * The lens (X-ray) button, beside the bench on the pause side and nearer the player than the pause button, and the slip that tells
 * the player about the palm gesture just above it. Both clear of the bench (it ends at x = +22.5 cm) and of the town (it ends at z = +15 cm).
 * The pause and lens buttons stand at x = +34 cm, 6 cm further out than they once did, so that the run sign's slip (above) never covers them
 * seen from the seat: from 0.38 m above and 0.55 m ahead of the stand the old 28 cm put the slip's right end over the pause button
 * (tests/ui/hot-zones.test.ts holds it clear in screen space). Still within the comfortable reach (tests/ui/layout.test.ts).
 */
export const LENS_SPOT: V3 = v(0.34, 0.09, 0.3);
export const LENS_HINT_SPOT: V3 = v(0.34, 0.15, 0.3);
/**
 * The Helper (ADR-050, INTRICATE_ASSEMBLY_DESIGN §7.1): a medallion on the right with Pause and the lens, one medallion above Pause (the daily
 * repair sits above Gift the same way), and its one-line slip above it. Shown with the tray, so tests/ui/hot-zones.test.ts holds it, like
 * Pause, a fingertip's reach beyond its press sphere from every compartment, the build zone, the caddy and the stand.
 */
export const HELPER_SPOT: V3 = v(0.34, 0.15, 0.2);
export const HELPER_HINT_SPOT: V3 = v(0.34, 0.21, 0.2);
/** The trunk latch (trunk_main.glb `COL_Latch`) scaled with the town. */
export const latchSpot = (s: number): V3 => v(0, 0.14 * s, 0.125 * s);

/** Side of a medallion (a square brass plate), metres: the `Surface` size flow-ui builds each of them at. */
export const MEDALLION_SIZE_M = 0.05;
/**
 * How close a fingertip must come to a pressable surface to press it: IWSDK's touch pointer presses at 2 cm (`TOUCH_DEFAULTS.downRadius`
 * in @iwsdk/xr-input) and clicks when the finger leaves again.
 */
export const POKE_PRESS_M = 0.02;
/**
 * A medallion turns to face the player, so what presses it is a sphere about its centre: half the plate's diagonal plus the press
 * distance, whichever way it faces.
 */
export const MEDALLION_HOT_RADIUS_M = (MEDALLION_SIZE_M * Math.SQRT2) / 2 + POKE_PRESS_M;
/**
 * How far an open hand's index fingertip reaches past the point where the hand pinches (the IWER hand: 6 cm left, 6 cm up, 8 cm
 * ahead, about 12 cm). A medallion that shows while parts are handled must be this far, beyond its own press sphere, from every
 * place a part is pinched, or the finger approaching the part presses it.
 */
export const FINGER_REACH_M = 0.12;
/** The footprint and height of the build zone about `BENCH.build` (the widest machine base, the Music Box case and the Carousel base, is 13 cm; the case is 10 cm tall, and a held part rises above it). */
export const BUILD_ZONE = { halfX: 0.065, halfZ: 0.065, height: 0.13 } as const;

/**
 * The two props the intricate Music Box build adds to the bench (design §3.3), as footprints about the bench centre (bench-local metres,
 * x measured from `BENCH.build.x`): the fastener caddy in the build zone's front strip and the shaft stand in its back strip. Both lie
 * outside `BUILD_ZONE` in z, so the hot-zone test checks them as zones of their own. The GLBs are the world asset agent's; these are the
 * design's numbers (12.5 x 5.0 cm stand, 16.2 x 4.2 cm caddy) and a held part's height above them.
 */
export const CADDY_ZONE = { halfX: 0.081, z0: 0.055, z1: 0.097, height: 0.065 } as const;
export const STAND_ZONE = { halfX: 0.0625, z0: -0.105, z1: -0.055, height: 0.09 } as const;

/**
 * The "?" corner of the blueprint sheet (Master only, design §6.1): a 4 cm plaque at the sheet's near-right corner, in the painted
 * plane's own coordinates (x right, y up the page; the page's top is away from the player).
 */
export const STEP_HELP = { size: 0.04, x: SHEET_PAPER.w / 2 - 0.026, y: -SHEET_PAPER.h / 2 + 0.026 } as const;

export const benchPoint = (s: number, local: V3): V3 => v(local.x, local.y, benchZ(s) + local.z);

/** The run sign's plaques (Run, and Adjust under it): width and height in metres. */
export const RUN_PLAQUE = { w: 0.075, h: 0.032 } as const;
/** The slip above them that shows the wind counter or the result: 13 cm wide (it was 15), so its end stays clear of the pause button in the player's view. */
export const RUN_SIGN_SLIP = { w: 0.13, h: 0.056 } as const;
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
    panel: PANEL_SPOT,
    tray: benchPoint(s, BENCH.tray),
    build: benchPoint(s, BENCH.build),
    blueprint: benchPoint(s, BENCH.blueprint),
    runSign: benchPoint(s, v(BENCH.runSign.x, BENCH.top + RUN_SIGN_HEIGHT, BENCH.runSign.z)),
    runLabel: benchPoint(s, v(BENCH.runSign.x, BENCH.top + RUN_SIGN_SLIP_HEIGHT, BENCH.runSign.z)),
  };
}
