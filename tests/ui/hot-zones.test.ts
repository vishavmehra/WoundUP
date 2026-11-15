import { Vector3 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { modeState, MODES } from '../../src/game/modes';
import {
  BENCH,
  BUILD_ZONE,
  DAILY_SPOT,
  FINGER_REACH_M,
  GIFT_SPOT,
  LENS_HINT_SPOT,
  LENS_SPOT,
  MEDALLION_HOT_RADIUS_M,
  MEDALLION_SIZE_M,
  PANEL_SPOT,
  PAUSE_SPOT,
  POKE_PRESS_M,
  RUN_PLAQUE,
  RUN_SIGN_HEIGHT,
  RUN_SIGN_SLIP,
  RUN_SIGN_SLIP_HEIGHT,
  benchZ,
} from '../../src/ui/layout';
import { freshLocal, viewFor } from '../../src/ui/view';

// BUG-4: the Pause medallion stood 12 cm from the second bracket in the parts tray, and a hand reaching for the bracket (open fingertip
// about 12 cm past the point where it pinches) pressed it, so the Pause panel opened in the middle of the build. This holds every pressable
// medallion clear of the tray compartments and the build zone, against the real tray model, at every town scale. Like tray-fit.test.ts it
// points at another folder with WU_MODELS_DIR=<absolute path of a public/assets/models folder>.

interface NodeFs {
  readFileSync(path: string | URL): Uint8Array;
}
const fs = (await import('node:fs' as string)) as NodeFs;
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const fileOf = (relative: string): string | URL => (env.WU_MODELS_DIR ? `${env.WU_MODELS_DIR}/${relative}` : new URL(`../../public/assets/models/${relative}`, import.meta.url));

const bytes = fs.readFileSync(fileOf('tockton/workshop/parts_tray.glb'));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
const tray: Object3D = gltf.scene;
tray.updateMatrixWorld(true);

interface Compartment {
  readonly slot: number;
  /** Centre in the tray's own space and inner size (x, z), metres. */
  readonly centre: Vector3;
  readonly width: number;
  readonly depth: number;
}
const compartments: Compartment[] = [];
tray.traverse((node) => {
  if (!/^SOCKET_Slot\d+$/.test(node.name)) return;
  const [width, depth] = (node.userData.wu as { innerMm: [number, number] }).innerMm.map((mm) => mm / 1000);
  compartments.push({ slot: Number(node.name.slice(11)), centre: node.getWorldPosition(new Vector3()), width, depth });
});
compartments.sort((a, b) => a.slot - b.slot);

/** The tray rises 2 cm when the parcel opens (flow-ui TRAY_RISE); the tallest part in it (the bracket, 5.8 cm) stands over the velvet. */
const TRAY_RISE_M = 0.02;
const TRAY_PART_HEIGHT_M = 0.07;
const SCALES = [0.75, 0.875, 1];

interface Box {
  readonly name: string;
  readonly lo: readonly [number, number, number];
  readonly hi: readonly [number, number, number];
}

/** Where a hand pinches parts and builds, in stage-local metres at town scale `s`: every compartment of the tray, and the build zone. */
function workZones(s: number): Box[] {
  const z0 = benchZ(s);
  const boxes: Box[] = compartments.map((c) => {
    const x = BENCH.tray.x + c.centre.x;
    const z = z0 + BENCH.tray.z + c.centre.z;
    return {
      name: `tray slot ${c.slot}`,
      lo: [x - c.width / 2, BENCH.top, z - c.depth / 2],
      hi: [x + c.width / 2, BENCH.top + TRAY_RISE_M + TRAY_PART_HEIGHT_M, z + c.depth / 2],
    };
  });
  boxes.push({
    name: 'build zone',
    lo: [BENCH.build.x - BUILD_ZONE.halfX, BENCH.top, z0 + BENCH.build.z - BUILD_ZONE.halfZ],
    hi: [BENCH.build.x + BUILD_ZONE.halfX, BENCH.top + BUILD_ZONE.height, z0 + BENCH.build.z + BUILD_ZONE.halfZ],
  });
  return boxes;
}

/** Distance from a point to a box (0 inside it). */
const distanceToBox = (p: { x: number; y: number; z: number }, box: Box): number =>
  Math.hypot(Math.max(box.lo[0] - p.x, 0, p.x - box.hi[0]), Math.max(box.lo[1] - p.y, 0, p.y - box.hi[1]), Math.max(box.lo[2] - p.z, 0, p.z - box.hi[2]));

const MEDALLIONS = { pause: PAUSE_SPOT, lens: LENS_SPOT, gift: GIFT_SPOT, daily: DAILY_SPOT } as const;
type Medallion = keyof typeof MEDALLIONS;

/** The medallions that show together with the parts tray, in some mode (viewFor is the one place that says what shows when). */
function shownWithTray(): Set<Medallion> {
  const shown = new Set<Medallion>();
  for (const mode of MODES) {
    const state = mode === 'pause' ? { ...modeState('pause'), resume: 'build' as const } : modeState(mode);
    const view = viewFor(state, { ...freshLocal(), parcel: 'open' }, { letter: null, closing: null, giftAvailable: true, dailyAvailable: true, xrayHint: false });
    if (!view.tray) continue;
    if (view.pauseButton) shown.add('pause');
    if (view.lens) shown.add('lens');
    if (view.giftButton) shown.add('gift');
    if (view.dailyButton) shown.add('daily');
  }
  return shown;
}

describe('pressable medallions against the tray and the build zone (BUG-4)', () => {
  it('reads all twelve compartments of the real tray', () => {
    expect(compartments).toHaveLength(12);
  });

  it('shows pause and the lens with the tray, and gift and the daily repair only in the town', () => {
    expect([...shownWithTray()].sort()).toEqual(['lens', 'pause']);
  });

  for (const s of SCALES) {
    it(`no medallion's press sphere touches a tray compartment or the build zone (town scale ${s})`, () => {
      for (const [name, spot] of Object.entries(MEDALLIONS)) {
        for (const box of workZones(s)) {
          expect(distanceToBox(spot, box), `${name} to ${box.name}`).toBeGreaterThan(MEDALLION_HOT_RADIUS_M);
        }
      }
    });

    it(`a medallion that shows while parts are handled is a fingertip's reach beyond its press sphere from every compartment and the build zone (town scale ${s})`, () => {
      for (const name of shownWithTray()) {
        for (const box of workZones(s)) {
          expect(distanceToBox(MEDALLIONS[name], box), `${name} to ${box.name}`).toBeGreaterThanOrEqual(MEDALLION_HOT_RADIUS_M + FINGER_REACH_M);
        }
      }
    });

    it(`the pause panel's plane is clear of the build zone (town scale ${s})`, () => {
      // The panel is modal (it shows only while paused or in the gift viewer), so it may stand over the tray's rear compartments on a small table;
      // it must not cut through the machine being built. A plaque is pressed within POKE_PRESS_M of its plane.
      const build = workZones(s).find((b) => b.name === 'build zone') as Box;
      expect(PANEL_SPOT.z + POKE_PRESS_M).toBeLessThan(build.lo[2]);
    });
  }

  it('would have caught BUG-4: the old pause medallion stood well inside a fingertip reach of the second compartment', () => {
    const old = { x: -0.27, y: 0.09, z: 0.2 };
    const slot2 = workZones(1).find((b) => b.name === 'tray slot 2') as Box;
    expect(distanceToBox(old, slot2)).toBeLessThan(MEDALLION_HOT_RADIUS_M + FINGER_REACH_M);
  });
});

// The run sign (the Run and Adjust plaques and the "Wound N of 8" slip above them) against the build zone and the medallions. The plaques turn to face the
// player, so in plan each is a disc of half its width about the post, whichever way it faces.

/** What a hand may brush while it works in the build zone, and the margin the sign keeps from it. */
const SIGN_MARGIN_M = 0.01;
/** The tallest housing on the bench (the Music Box case, 10 cm): the slip must float above it. */
const HOUSING_HEIGHT_M = 0.1;

interface Sign {
  /** The post, bench-local x and z. */
  readonly x: number;
  readonly z: number;
}

/** Plan distance from a disc of `radius` about the post to the build zone's footprint (negative: they overlap). */
function planGapToBuildZone(sign: Sign, radius: number): number {
  const dx = Math.max(BENCH.build.x - BUILD_ZONE.halfX - sign.x, 0, sign.x - (BENCH.build.x + BUILD_ZONE.halfX));
  const dz = Math.max(BENCH.build.z - BUILD_ZONE.halfZ - sign.z, 0, sign.z - (BENCH.build.z + BUILD_ZONE.halfZ));
  if (dx === 0 && dz === 0) {
    // The post itself is inside the footprint: how far it is from the nearest edge, as a penetration.
    const inside = Math.min(sign.x - (BENCH.build.x - BUILD_ZONE.halfX), BENCH.build.x + BUILD_ZONE.halfX - sign.x, sign.z - (BENCH.build.z - BUILD_ZONE.halfZ), BENCH.build.z + BUILD_ZONE.halfZ - sign.z);
    return -inside - radius;
  }
  return Math.hypot(dx, dz) - radius;
}

const SIGN: Sign = { x: BENCH.runSign.x, z: BENCH.runSign.z };
const OLD_SIGN: Sign = { x: 0.0975, z: 0.05 };

describe('the run sign against the build zone', () => {
  it("keeps the Run and Adjust plaques a centimetre clear of the build zone's footprint", () => {
    expect(planGapToBuildZone(SIGN, RUN_PLAQUE.w / 2)).toBeGreaterThanOrEqual(SIGN_MARGIN_M);
    // The plaques hang at heights a hand works in (so the footprint is what matters), not above the zone.
    const runY = BENCH.top + RUN_SIGN_HEIGHT;
    const adjustY = runY - 0.04;
    for (const y of [runY, adjustY]) expect(y - RUN_PLAQUE.h / 2, "inside the zone's height").toBeLessThan(BENCH.top + BUILD_ZONE.height);
  });

  it('would have caught the old post, whose Run plaque reached 7.5 mm into the footprint', () => {
    expect(planGapToBuildZone(OLD_SIGN, RUN_PLAQUE.w / 2)).toBeCloseTo(-0.0075, 4);
  });

  it('floats the slip above the tallest housing, so it never stands in front of the machine being built', () => {
    expect(BENCH.top + RUN_SIGN_SLIP_HEIGHT - RUN_SIGN_SLIP.h / 2).toBeGreaterThanOrEqual(BENCH.top + HOUSING_HEIGHT_M + 0.005);
    // ... and clear of the Run plaque under it.
    expect(RUN_SIGN_SLIP_HEIGHT - RUN_SIGN_SLIP.h / 2).toBeGreaterThan(RUN_SIGN_HEIGHT + RUN_PLAQUE.h / 2);
  });
});

// ---- Seen from the seat: nothing of the sign covers a medallion ---------------------------------------------------------------------------------------------

interface V {
  x: number;
  y: number;
  z: number;
}
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: V): V => {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** A box on the screen, in units of tangent (x right, y up) of a camera at the eye looking at the stage origin. */
interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function camera(eye: V) {
  const forward = unit({ x: -eye.x, y: -eye.y, z: -eye.z });
  const right = unit(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const toScreen = (p: V): { x: number; y: number; depth: number } => {
    const d = sub(p, eye);
    const depth = dot(d, forward);
    return { x: dot(d, right) / depth, y: dot(d, up) / depth, depth };
  };
  /** An upright panel that turns about the vertical to face the eye (`width` x `height` centred on `c`). */
  const upright = (c: V, width: number, height: number): Rect => {
    const side = unit(cross({ x: 0, y: 1, z: 0 }, unit({ x: eye.x - c.x, y: 0, z: eye.z - c.z })));
    const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => toScreen({ x: c.x + (side.x * sx * width) / 2, y: c.y + (sy * height) / 2, z: c.z + (side.z * sx * width) / 2 })));
    return { x0: Math.min(...corners.map((p) => p.x)), x1: Math.max(...corners.map((p) => p.x)), y0: Math.min(...corners.map((p) => p.y)), y1: Math.max(...corners.map((p) => p.y)) };
  };
  /** A medallion, a square plate that faces the eye. */
  const plate = (c: V, size: number): Rect => {
    const s = toScreen(c);
    const half = size / 2 / s.depth;
    return { x0: s.x - half, x1: s.x + half, y0: s.y - half, y1: s.y + half };
  };
  return { upright, plate };
}

/** Space between two screen rectangles, in tangent units (about 0.0175 per degree); negative when they overlap. */
const screenGap = (a: Rect, b: Rect): number => Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);

/**
 * Eyes over the stand, (height above the surface, distance ahead of the stand's centre): the seat the placement aims at (38 cm above, 55 cm ahead),
 * the spread around it, and the camera the QA runs use. The two nearest, lowest corners of tests/ui/layout.test.ts (eyes 20 to 30 cm up and 45 to 50 cm ahead)
 * are left out: from there the sign, a hand's breadth from the face, covers whatever is behind it.
 */
const SEATS: ReadonlyArray<readonly [number, number]> = [
  [0.38, 0.55],
  [0.45, 0.6],
  [0.6, 0.5],
  [0.6, 0.6],
  [0.3, 0.6],
  [0.45, 0.45],
  [0.84, 0.93],
];
const VIEW_MARGIN = 0.01; // 0.6 degrees

interface SignLayout {
  readonly sign: Sign;
  readonly slipW: number;
  readonly pause: V;
  readonly lens: V;
  readonly hint: V;
}
const NOW: SignLayout = { sign: SIGN, slipW: RUN_SIGN_SLIP.w, pause: PAUSE_SPOT, lens: LENS_SPOT, hint: LENS_HINT_SPOT };
const BEFORE: SignLayout = { sign: OLD_SIGN, slipW: 0.15, pause: { ...PAUSE_SPOT, x: 0.28 }, lens: { ...LENS_SPOT, x: 0.28 }, hint: { ...LENS_HINT_SPOT, x: 0.28 } };

/** The smallest gap between the sign (slip and both plaques) and the pause button, the lens button and the lens hint, over the seats and the town scales. */
function narrowestGap(layout: SignLayout, seats: typeof SEATS = SEATS): { gap: number; at: string } {
  let worst = { gap: Infinity, at: '' };
  for (const s of SCALES) {
    for (const [height, ahead] of seats) {
      const view = camera({ x: 0, y: height, z: ahead });
      const z = benchZ(s) + layout.sign.z;
      const at = (above: number): V => ({ x: layout.sign.x, y: BENCH.top + above, z });
      const parts: Array<[string, Rect]> = [
        ['slip', view.upright(at(RUN_SIGN_SLIP_HEIGHT), layout.slipW, RUN_SIGN_SLIP.h)],
        ['Run', view.upright(at(RUN_SIGN_HEIGHT), RUN_PLAQUE.w, RUN_PLAQUE.h)],
        ['Adjust', view.upright(at(RUN_SIGN_HEIGHT - 0.04), RUN_PLAQUE.w, RUN_PLAQUE.h)],
      ];
      const targets: Array<[string, Rect]> = [
        ['pause', view.plate(layout.pause, MEDALLION_SIZE_M)],
        ['lens', view.plate(layout.lens, MEDALLION_SIZE_M)],
        ['lens hint', view.upright(layout.hint, 0.17, 0.045)],
      ];
      for (const [name, part] of parts) {
        for (const [other, target] of targets) {
          const gap = screenGap(part, target);
          if (gap < worst.gap) worst = { gap, at: `${name} against ${other}, eyes ${height}/${ahead}, town scale ${s}` };
        }
      }
    }
  }
  return worst;
}

describe('the run sign seen from the seat', () => {
  it('never covers the pause button, the lens button or the lens hint, from the seats the placement allows (0.6 degrees to spare)', () => {
    const { gap, at } = narrowestGap(NOW);
    expect(gap, at).toBeGreaterThanOrEqual(VIEW_MARGIN);
  });

  it('would have caught the old layout: the 15 cm slip, 28 cm out from the pause button, covered part of it from the seat', () => {
    const { gap, at } = narrowestGap(BEFORE, [[0.38, 0.55]]); // the seat the placement aims at
    expect(gap, at).toBeLessThan(0);
    expect(at).toMatch(/^slip against (pause|lens)/);
  });
});
