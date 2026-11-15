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
   * The run sign: a post at the back right of the bench, over the blueprint's far edge, beyond the winding key. The Music Box's key juts out of the
   * case's right wall to x = +10.5 cm, 4 to 41 mm in front of the bench centre, and the player has to see it and turn it while the sign shows. The
   * post used to stand in front of the key's tip (x = +11.75 cm, 4 cm in front of the centre): seen from the seat the Run plaque covered the key's
   * outer half and reached into its volume. Moving it right alone is not enough (the sign must stay within 35 degrees of the line of sight from every
   * seat, tests/ui/layout.test.ts, and a post 17 cm right of the middle and in front is 40 degrees off from the lowest, nearest seats), so it also moves
   * back, behind the build zone's middle: there the plaques and the slip clear the key's outline in the player's view by more than a centimetre from
   * every seat and town scale, no plaque is within 9 cm of the key (a fingertip that pinches it is nowhere near the 2 cm press distance of Run), and
   * the plaques, which turn to face the player, are 12 cm from the build zone (tests/ui/hot-zones.test.ts, "the run sign against the winding key").
   */
  runSign: v(0.175, 0.03, -0.085),
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
 * Centre of the gift panel (29 x 30 cm), when no machine stands on the bench: further from the eyes than the reading card, about 44 cm
 * from the eyes over a stand (UI_UX_SPEC section 23, "avoid large panels close to the face"), still in front of the town.
 */
export const PANEL_SPOT: V3 = v(0, 0.2, 0.15);

/** The pause and restart panel's base (five setting rows, each with its caption under it, and the Resume and Restart buttons), metres, before `PAUSE_PANEL_SCALE`. */
export const PAUSE_PANEL_BASE = { w: 0.26, h: 0.381 } as const;
/** The first setting plaque (centre, metres from the panel's centre), the step between rows (a row and its caption take 0.056) and the plaque's size. */
export const SETTING_ROW_Y = 0.1305;
export const SETTING_ROW_STEP = 0.056;
export const SETTING_PLAQUE = { w: 0.21, h: 0.032 } as const;
/** Resume and Restart chapter: the row they stand on in the pause panel (the restart panel's pair is higher, in a shorter stack), their offset from the middle and their size. */
export const PAUSE_BUTTON_ROW_Y = -0.1655;
export const PANEL_BUTTON = { w: 0.115, h: 0.034, x: 0.067 } as const;
/**
 * The pause and restart panel is shown at 70% of its drawn size and stands in front of the machine on the bench, over the front of the
 * bench, about 29 cm from the eyes: the old spot (the middle of the town's front, 15 cm ahead of the stand's centre) put the lower rows
 * behind the Music Box and its open lid. 38 cm of panel does not fit anywhere else: behind the machine it is hidden unless raised above the
 * lid's line of sight, where the top rows are out of arm's reach (60 cm from the chest) and the lowest eyes cannot see it within 35 degrees;
 * at its old size in front of the machine it would fill the face (54 x 71 degrees at 26 cm). At 70% (18 x 27 cm) it fills the same view
 * as the old panel did at its old distance (about 35 x 50 degrees), the plaques are still over 2.2 cm tall (a fingertip presses within 2 cm),
 * and the whole panel sits on the line of sight to the town's centre, so nothing makes the player turn their head.
 * tests/ui/hot-zones.test.ts holds every plaque in the player's view and in reach, clear of the machine, from every seat and town scale.
 */
export const PAUSE_PANEL_SCALE = 0.7;
export const PAUSE_PANEL_SPOT: V3 = v(0, 0.185, 0.34);
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
    pausePanel: PAUSE_PANEL_SPOT,
    tray: benchPoint(s, BENCH.tray),
    build: benchPoint(s, BENCH.build),
    blueprint: benchPoint(s, BENCH.blueprint),
    runSign: benchPoint(s, v(BENCH.runSign.x, BENCH.top + RUN_SIGN_HEIGHT, BENCH.runSign.z)),
    runLabel: benchPoint(s, v(BENCH.runSign.x, BENCH.top + RUN_SIGN_SLIP_HEIGHT, BENCH.runSign.z)),
  };
}
