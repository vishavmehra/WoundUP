import { Box3, Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { MUSIC_BOX } from '../../src/content/blueprints';
import { modeState, MODES } from '../../src/game/modes';
import {
  BENCH,
  BUILD_ZONE,
  CADDY_AT,
  CADDY_ZONE,
  DAILY_SPOT,
  FINGER_REACH_M,
  GIFT_SPOT,
  HELPER_HINT_SPOT,
  HELPER_SPOT,
  LENS_HINT_SPOT,
  LENS_SPOT,
  MEDALLION_HOT_RADIUS_M,
  MEDALLION_SIZE_M,
  PAUSE_PANEL_SCALE,
  PAUSE_SPOT,
  POKE_PRESS_M,
  RUN_PLAQUE,
  RUN_SIGN_HEIGHT,
  RUN_SIGN_SLIP,
  RUN_SIGN_SLIP_HEIGHT,
  SHEET_PAPER,
  STAND_ZONE,
  STEP_HELP,
  benchZ,
} from '../../src/ui/layout';
import { freshLocal, viewFor } from '../../src/ui/view';
import { PAUSE_PANELS, PAUSE_PLAQUES, placePanel } from './panel-geometry';

// BUG-4: the Pause medallion stood 12 cm from the second bracket in the parts tray, and a hand reaching for the bracket (open fingertip
// about 12 cm past the point where it pinches) pressed it, so the Pause panel opened in the middle of the build. This holds every pressable
// medallion clear of the tray compartments and the build zone, against the real tray model, at every town scale. Like tray-fit.test.ts it
// points at another folder with WU_MODELS_DIR=<absolute path of a public/assets/models folder>. ADR-050 adds the Helper medallion and two props
// to the bench, the fastener caddy and the shaft stand; their GLBs are the asset agent's, so their footprints are the design's (layout.ts).

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

/** Where a hand pinches parts and builds, in stage-local metres at town scale `s`: every compartment of the tray, the build zone, and (ADR-050) the caddy and the stand. */
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
  // The caddy's bins hand out the hardware and the stand holds the sub-assemblies: both are pinched at, so both are work zones (design §3.3).
  const x = BENCH.build.x;
  boxes.push({
    name: 'fastener caddy',
    lo: [x - CADDY_ZONE.halfX, BENCH.top, z0 + CADDY_ZONE.z0],
    hi: [x + CADDY_ZONE.halfX, BENCH.top + CADDY_ZONE.height, z0 + CADDY_ZONE.z1],
  });
  boxes.push({
    name: 'shaft stand',
    lo: [x - STAND_ZONE.halfX, BENCH.top, z0 + STAND_ZONE.z0],
    hi: [x + STAND_ZONE.halfX, BENCH.top + STAND_ZONE.height, z0 + STAND_ZONE.z1],
  });
  return boxes;
}

/** Distance from a point to a box (0 inside it). */
const distanceToBox = (p: { x: number; y: number; z: number }, box: Box): number =>
  Math.hypot(Math.max(box.lo[0] - p.x, 0, p.x - box.hi[0]), Math.max(box.lo[1] - p.y, 0, p.y - box.hi[1]), Math.max(box.lo[2] - p.z, 0, p.z - box.hi[2]));

const MEDALLIONS = { pause: PAUSE_SPOT, lens: LENS_SPOT, helper: HELPER_SPOT, gift: GIFT_SPOT, daily: DAILY_SPOT } as const;
type Medallion = keyof typeof MEDALLIONS;

/** The medallions that show together with the parts tray, in some mode (viewFor is the one place that says what shows when). */
function shownWithTray(): Set<Medallion> {
  const shown = new Set<Medallion>();
  for (const mode of MODES) {
    const state = mode === 'pause' ? { ...modeState('pause'), resume: 'build' as const } : modeState(mode);
    const view = viewFor(state, { ...freshLocal(), parcel: 'open' }, { letter: null, closing: null, giftAvailable: true, dailyAvailable: true, xrayHint: false, helper: true });
    if (!view.tray) continue;
    if (view.pauseButton) shown.add('pause');
    if (view.lens) shown.add('lens');
    if (view.helperButton) shown.add('helper');
    if (view.giftButton) shown.add('gift');
    if (view.dailyButton) shown.add('daily');
  }
  return shown;
}

describe('pressable medallions against the tray and the build zone (BUG-4)', () => {
  it('reads all twelve compartments of the real tray', () => {
    expect(compartments).toHaveLength(12);
  });

  it('shows pause, the lens and the Helper with the tray, and gift and the daily repair only in the town', () => {
    expect([...shownWithTray()].sort()).toEqual(['helper', 'lens', 'pause']);
  });

  it('reads the caddy and the stand as work zones, outside the build zone in z, and inside the bench', () => {
    const zones = workZones(1);
    const names = zones.map((z) => z.name);
    expect(names).toContain('fastener caddy');
    expect(names).toContain('shaft stand');
    const build = zones.find((z) => z.name === 'build zone') as Box;
    const caddy = zones.find((z) => z.name === 'fastener caddy') as Box;
    const stand = zones.find((z) => z.name === 'shaft stand') as Box;
    expect(caddy.lo[2]).toBeLessThan(build.hi[2]); // the caddy's back edge is under the build zone's front edge: the strips touch, they do not leave a gap
    expect(caddy.hi[2]).toBeGreaterThan(build.hi[2]);
    expect(stand.lo[2]).toBeLessThan(build.lo[2]);
    // The bench is 25 cm deep (workbench.glb): nothing sticks out over its front or back edge.
    for (const z of [caddy, stand]) {
      expect(z.lo[2]).toBeGreaterThanOrEqual(benchZ(1) - 0.125);
      expect(z.hi[2]).toBeLessThanOrEqual(benchZ(1) + 0.125);
    }
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

  }

  it('keeps the Helper in the right-hand column with Pause, one medallion above it, and its slip above that', () => {
    expect(HELPER_SPOT.x).toBe(PAUSE_SPOT.x);
    expect(HELPER_SPOT.z).toBe(PAUSE_SPOT.z);
    expect(HELPER_SPOT.y - PAUSE_SPOT.y).toBeCloseTo(0.06, 6);
    expect(HELPER_HINT_SPOT.x).toBe(HELPER_SPOT.x);
    expect(HELPER_HINT_SPOT.y).toBeGreaterThan(HELPER_SPOT.y + 0.05);
    // It does not sit on the lens's slip (0.28, 0.15, 0.30) or on the lens.
    expect(Math.hypot(HELPER_SPOT.x - LENS_SPOT.x, HELPER_SPOT.y - LENS_SPOT.y, HELPER_SPOT.z - LENS_SPOT.z)).toBeGreaterThan(2 * MEDALLION_HOT_RADIUS_M - 0.01);
  });

  for (const s of SCALES) {
    it(`a poke on the Master "?" corner of the sheet presses no medallion (town scale ${s})`, () => {
      const at = { x: BENCH.blueprint.x + STEP_HELP.x, y: BENCH.top + SHEET_PAPER.y, z: benchZ(s) + BENCH.blueprint.z - STEP_HELP.y };
      for (const [name, spot] of Object.entries(MEDALLIONS)) {
        expect(Math.hypot(spot.x - at.x, spot.y - at.y, spot.z - at.z), `${name} to the ? corner`).toBeGreaterThan(MEDALLION_HOT_RADIUS_M);
      }
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
/** Where the post stood before the winding key was found hidden behind the Run plaque. */
const KEY_HIDING_SIGN: Sign = { x: 0.1175, z: 0.04 };

describe('the run sign against the build zone', () => {
  it("keeps the Run and Adjust plaques a centimetre clear of the build zone's footprint", () => {
    expect(planGapToBuildZone(SIGN, RUN_PLAQUE.w / 2)).toBeGreaterThanOrEqual(SIGN_MARGIN_M);
    // The plaques hang at heights a hand works in (so the footprint is what matters), not above the zone.
    const runY = BENCH.top + RUN_SIGN_HEIGHT;
    const adjustY = runY - 0.04;
    for (const y of [runY, adjustY]) expect(y - RUN_PLAQUE.h / 2, "inside the zone's height").toBeLessThan(BENCH.top + BUILD_ZONE.height);
  });

  it("keeps the Run and Adjust plaques, which turn to face the player, a centimetre clear of the caddy's and the stand's footprints (ADR-050)", () => {
    // workZones(1) in the stage's frame; the sign's post is bench-local, so its z is measured from the bench's middle at the same scale.
    for (const zone of workZones(1).filter((b) => b.name === 'fastener caddy' || b.name === 'shaft stand')) {
      const z = benchZ(1) + SIGN.z;
      const gap = Math.hypot(Math.max(zone.lo[0] - SIGN.x, 0, SIGN.x - zone.hi[0]), Math.max(zone.lo[2] - z, 0, z - zone.hi[2])) - RUN_PLAQUE.w / 2;
      expect(gap, zone.name).toBeGreaterThanOrEqual(SIGN_MARGIN_M);
    }
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

// ---- The Music Box on the bench: what the run sign and the pause panel must neither hide nor stand in -----------------------------------------------------------

// The machine as the game builds it on the bench (the first, and the commonest, build): its case from the real GLB, the lid opened the way Gameplay.openLid
// opens it for the build (the pivot turned by `openDeg`, 100 degrees), and the winding key, which the blueprint seats on the case's right wall and which turns
// about the x axis, so the box it sweeps is its length along x and a radius about the axis. Bench-local metres (x from the build point, y above the bench top,
// z from the bench's middle). Measured in the IWER emulator too (Box3 of the case, lid and key meshes in the running game): the same to a millimetre.
async function glb(relative: string): Promise<Object3D> {
  const bytes = fs.readFileSync(fileOf(relative));
  const parsed = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
  parsed.scene.updateMatrixWorld(true);
  return parsed.scene;
}
const musicBox = await glb('tockton/music_box/music_box_case.glb');
const caseBounds = new Box3().setFromObject(musicBox.getObjectByName('MusicBoxCase_Body') as Object3D);
const lidPivot = musicBox.getObjectByName('PIV_Lid') as Object3D;
const lidNode = musicBox.getObjectByName('MusicBoxCase_Lid') as Object3D;
lidPivot.attach(lidNode);
lidPivot.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (((lidPivot.userData.wu as { openDeg?: number } | undefined)?.openDeg ?? 100) * Math.PI) / 180));
musicBox.updateMatrixWorld(true);
const lidBounds = new Box3().setFromObject(lidNode);

const KEY_SOCKET = MUSIC_BOX.sockets.find((socket) => socket.id === 'winding_key')?.position as readonly [number, number, number];
/** The key's sweep about its socket: along its axis (x), and out to this radius round it. winding_key.glb has wings 3 cm across and is 3.6 cm long; the game draws it a sixth larger. */
const KEY_ALONG_M = [-0.005, 0.042] as const;
const KEY_RADIUS_M = 0.018;

const toBox = (name: string, lo: readonly [number, number, number], hi: readonly [number, number, number]): Box => ({ name, lo, hi });
const BENCH_LOCAL_BOXES: readonly Box[] = [
  toBox('case', [caseBounds.min.x, caseBounds.min.y, caseBounds.min.z], [caseBounds.max.x, caseBounds.max.y, caseBounds.max.z]),
  toBox('open lid', [lidBounds.min.x, lidBounds.min.y, lidBounds.min.z], [lidBounds.max.x, lidBounds.max.y, lidBounds.max.z]),
  toBox('winding key', [KEY_SOCKET[0] + KEY_ALONG_M[0], KEY_SOCKET[1] - KEY_RADIUS_M, KEY_SOCKET[2] - KEY_RADIUS_M], [KEY_SOCKET[0] + KEY_ALONG_M[1], KEY_SOCKET[1] + KEY_RADIUS_M, KEY_SOCKET[2] + KEY_RADIUS_M]),
];
/** The machine's boxes in the stage's frame at town scale `s`. */
function machineBoxes(s: number): Box[] {
  const at = [BENCH.build.x, BENCH.top, benchZ(s) + BENCH.build.z] as const;
  return BENCH_LOCAL_BOXES.map((b) => toBox(b.name, [b.lo[0] + at[0], b.lo[1] + at[1], b.lo[2] + at[2]], [b.hi[0] + at[0], b.hi[1] + at[1], b.hi[2] + at[2]]));
}
const keyBox = (s: number): Box => machineBoxes(s)[2];
/** The fastener caddy's body (the real GLB, 3 cm tall) where it stands on the bench (`CADDY_AT`), in the stage's frame at town scale `s`: it stands in front of the machine, under the pause panel. */
const caddyBounds = new Box3().setFromObject(await glb('tockton/workshop/fastener_caddy.glb'));
function caddyBox(s: number): Box {
  const at = [CADDY_AT.x, CADDY_AT.y, benchZ(s) + CADDY_AT.z] as const;
  return toBox('caddy', [caddyBounds.min.x + at[0], caddyBounds.min.y + at[1], caddyBounds.min.z + at[2]], [caddyBounds.max.x + at[0], caddyBounds.max.y + at[1], caddyBounds.max.z + at[2]]);
}

describe('the machine the tests stand on', () => {
  it('has a case 13 x 10 x 9 cm, a lid standing open behind it, and a key on its right wall that the winding_key part fits inside', async () => {
    const [case_, lid, key] = BENCH_LOCAL_BOXES;
    expect(case_.hi[0] - case_.lo[0]).toBeCloseTo(0.13, 2);
    expect(case_.hi[1] - case_.lo[1]).toBeCloseTo(0.1, 2);
    expect(case_.hi[2] - case_.lo[2]).toBeCloseTo(0.09, 2);
    expect(lid.hi[2]).toBeLessThan(case_.lo[2] + 0.005); // behind the case's front half: it stands up at the back
    expect(lid.hi[1]).toBeGreaterThan(0.15); // and rises well over the case (15.6 cm over the bench)
    expect(key.hi[0]).toBeGreaterThan(case_.hi[0] + 0.03); // it juts out of the right wall by more than 3 cm
    // The part's own bounds: wings 3 cm across, 3.6 cm long, along its local z (turned onto x by the socket).
    const part = new Box3().setFromObject(await glb('shared/winding_key/winding_key.glb'));
    expect(KEY_ALONG_M[1]).toBeGreaterThanOrEqual(part.max.z);
    expect(-KEY_ALONG_M[0]).toBeGreaterThanOrEqual(-part.min.z);
    expect(KEY_RADIUS_M).toBeGreaterThanOrEqual(Math.max(part.max.x, part.max.y));
  });
});

// ---- The run sign against the winding key -----------------------------------------------------------------------------------------------------------------------

/** One centimetre in the sign's own plane (about a degree at the player's distance): the key and every part of the sign keep at least this much between them. */
const KEY_VIEW_MARGIN_M = 0.01;
/** A fingertip on the key (its sweep reaches 1.8 cm round the axis) stays 3 cm from every plaque: over the 2 cm press distance, with a centimetre to spare. */
const KEY_POKE_CLEARANCE_M = 0.03;

/** The run sign turns about the vertical to face the eye, so its plane is vertical, holds the post, and has the eye on its front side. */
function signPlane(eye: V, s: number, sign: Sign) {
  const post: V = { x: sign.x, y: 0, z: benchZ(s) + sign.z };
  const n = unit({ x: eye.x - post.x, y: 0, z: eye.z - post.z });
  return { post, n, side: unit(cross({ x: 0, y: 1, z: 0 }, n)) };
}

/** Where the line from the eye through `p` crosses the sign's plane: along it (u, from the post), up it (v, above the stage's floor), and how far from the eye (t = 1 at `p`). */
function throughSignPlane(eye: V, p: V, s: number, sign: Sign): { u: number; v: number; t: number } {
  const { post, n, side } = signPlane(eye, s, sign);
  const d = sub(p, eye);
  const t = dot(sub(post, eye), n) / dot(d, n);
  const hit = { x: eye.x + t * d.x, y: eye.y + t * d.y, z: eye.z + t * d.z };
  return { u: dot(sub(hit, post), side), v: hit.y, t };
}

interface SignPart {
  readonly name: string;
  /** Across (u) and up (v) in the sign's plane. */
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
}
const signRect = (name: string, width: number, centreAbove: number, height: number): SignPart => ({
  name,
  u0: -width / 2,
  u1: width / 2,
  v0: BENCH.top + centreAbove - height / 2,
  v1: BENCH.top + centreAbove + height / 2,
});
/** Everything of the sign that is drawn: the Run plaque, the Adjust plaque under it, the slip over them and the post (5 mm across). */
const SIGN_PARTS: readonly SignPart[] = [
  signRect('Run plaque', RUN_PLAQUE.w, RUN_SIGN_HEIGHT, RUN_PLAQUE.h),
  signRect('Adjust plaque', RUN_PLAQUE.w, RUN_SIGN_HEIGHT - 0.04, RUN_PLAQUE.h),
  signRect('slip', RUN_SIGN_SLIP.w, RUN_SIGN_SLIP_HEIGHT, RUN_SIGN_SLIP.h),
  signRect('post', 0.005, (RUN_SIGN_HEIGHT - 0.012) / 2, RUN_SIGN_HEIGHT - 0.012),
];

const cornersOf = (box: Box): V[] => [box.lo[0], box.hi[0]].flatMap((x) => [box.lo[1], box.hi[1]].flatMap((y) => [box.lo[2], box.hi[2]].map((z) => ({ x, y, z }))));

/**
 * The narrowest gap, in the sign's plane, between the outline of the key as the eye sees it (the eight corners of its box, each through the plane along
 * the line from the eye) and any part of the sign: negative where they overlap. The key may be in front of the plane or behind it; either way what the
 * player sees must not overlap.
 */
function keyGapToSign(eye: V, s: number, sign: Sign): { gap: number; part: string } {
  const hits = cornersOf(keyBox(s)).map((p) => throughSignPlane(eye, p, s, sign));
  const k = { u0: Math.min(...hits.map((h) => h.u)), u1: Math.max(...hits.map((h) => h.u)), v0: Math.min(...hits.map((h) => h.v)), v1: Math.max(...hits.map((h) => h.v)) };
  let worst = { gap: Infinity, part: '' };
  for (const part of SIGN_PARTS) {
    const gap = Math.max(part.u0 - k.u1, k.u0 - part.u1, part.v0 - k.v1, k.v0 - part.v1);
    if (gap < worst.gap) worst = { gap, part: part.name };
  }
  return worst;
}

describe('the run sign against the winding key', () => {
  it('keeps the key a centimetre clear of every part of the sign, seen from every seat the placement allows and at every town scale', () => {
    for (const s of SCALES) {
      for (const [height, ahead] of SEATS) {
        const { gap, part } = keyGapToSign({ x: 0, y: height, z: ahead }, s, SIGN);
        expect(gap, `${part}, eyes ${height}/${ahead}, town scale ${s}`).toBeGreaterThanOrEqual(KEY_VIEW_MARGIN_M);
      }
    }
  });

  it('would have caught the post where it stood before: from the seat the placement aims at, the Run plaque covered the key', () => {
    const { gap, part } = keyGapToSign({ x: 0, y: 0.38, z: 0.55 }, 1, KEY_HIDING_SIGN);
    expect(gap).toBeLessThan(0);
    expect(part).toBe('Run plaque');
  });

  it('keeps the Run and Adjust plaques 3 cm from the key, so the fingertip that pinches it is never within the press distance of either', () => {
    for (const s of SCALES) {
      for (const [height, ahead] of SEATS) {
        const { post, side } = signPlane({ x: 0, y: height, z: ahead }, s, SIGN);
        for (const plaque of SIGN_PARTS.slice(0, 2)) {
          for (const u of [plaque.u0, 0, plaque.u1]) {
            for (const v of [plaque.v0, (plaque.v0 + plaque.v1) / 2, plaque.v1]) {
              const point = { x: post.x + side.x * u, y: v, z: post.z + side.z * u };
              expect(distanceToBox(point, keyBox(s)), `${plaque.name}, eyes ${height}/${ahead}, town scale ${s}`).toBeGreaterThanOrEqual(KEY_POKE_CLEARANCE_M);
            }
          }
        }
      }
    }
    expect(KEY_POKE_CLEARANCE_M).toBeGreaterThan(POKE_PRESS_M);
  });

  it('would have caught that post there too: its Run plaque reached into the key', () => {
    const { post, side } = signPlane({ x: 0, y: 0.38, z: 0.55 }, 1, KEY_HIDING_SIGN);
    const run = SIGN_PARTS[0];
    const tip = { x: post.x + side.x * run.u0, y: (run.v0 + run.v1) / 2, z: post.z + side.z * run.u0 };
    expect(distanceToBox(tip, keyBox(1))).toBeLessThan(POKE_PRESS_M);
  });
});

// ---- The pause panel against the machine --------------------------------------------------------------------------------------------------------------------------

/** Does the segment from `a` to `b` pass through `box` grown by `pad`? */
function segmentHitsBox(a: V, b: V, box: Box, pad: number): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const [i, axis] of (['x', 'y', 'z'] as const).entries()) {
    const d = b[axis] - a[axis];
    const lo = box.lo[i] - pad;
    const hi = box.hi[i] + pad;
    if (Math.abs(d) < 1e-12) {
      if (a[axis] < lo || a[axis] > hi) return false;
      continue;
    }
    const ta = (lo - a[axis]) / d;
    const tb = (hi - a[axis]) / d;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return false;
  }
  return true;
}

/** What stands between the eye and `p`: the machine (the case, the open lid, the key), the fastener caddy or a part of the run sign. Empty when `p` is in the player's view. */
function hiddenBy(eye: V, p: V, s: number): string[] {
  const hidden = [...machineBoxes(s), caddyBox(s)]
    .filter((box) => segmentHitsBox(eye, p, box, 0.005))
    .map((box) => box.name);
  const hit = throughSignPlane(eye, p, s, SIGN);
  if (hit.t > 0 && hit.t < 1) {
    for (const part of SIGN_PARTS) if (hit.u >= part.u0 - 0.005 && hit.u <= part.u1 + 0.005 && hit.v >= part.v0 - 0.005 && hit.v <= part.v1 + 0.005) hidden.push(`sign ${part.name}`);
  }
  return hidden;
}

/** The plaque and base points to test: the centre, the corners, the middles of the edges and the points between (a 5 x 3 grid of fractions of the half sizes). */
const GRID: ReadonlyArray<readonly [number, number]> = [-1, -0.5, 0, 0.5, 1].flatMap((fx) => [-1, 0, 1].map((fy) => [fx, fy] as const));
/** A plaque is pressed within POKE_PRESS_M of its plane: so its centre stays that far, and a centimetre more, from the machine (a fingertip there is not inside it). */
const PANEL_CLEARANCE_M = POKE_PRESS_M + 0.01;
/** The panel hovers at least this far over the bench top. */
const PANEL_OVER_BENCH_M = 0.02;
const OLD_PANEL = { x: 0, y: 0.2 + 0.028, z: 0.15 }; // the old PANEL_SPOT and the raise the five-row base needed, at full size: what stood behind the machine

describe('the pause panel against the machine on the bench', () => {
  // Both panels: the five setting rows, and the six once a build difficulty is chosen (ADR-050), which is taller and raised so its bottom stays put.
  for (const panel of PAUSE_PANELS) {
    for (const s of SCALES) {
      it(`shows every plaque from every seat the placement allows: nothing of the machine, the caddy or the sign stands between the eyes and any point of it (${panel.name}, town scale ${s})`, () => {
        for (const [height, ahead] of SEATS) {
          const eye = { x: 0, y: height, z: ahead };
          for (const plaque of placePanel(eye, panel.plaques, panel.spot)) {
            for (const [fx, fy] of GRID) {
              expect(hiddenBy(eye, plaque.at(fx, fy), s), `${plaque.name} (${fx}, ${fy}), eyes ${height}/${ahead}, town scale ${s}`).toEqual([]);
            }
          }
        }
      });

      it(`keeps every plaque, and the base it stands on, out of the machine and the build, caddy and stand zones, and every plaque centre out of a fingertip's reach of the machine (${panel.name}, town scale ${s})`, () => {
        // The machine itself, which a plaque centre must also stay a fingertip's reach from, and the zones a hand works in on the bench (the build zone, the
        // envelope of any machine a hand works on, and the caddy and the stand of the Music Box's deep build, ADR-050): only to be outside them.
        const machine = machineBoxes(s);
        const solids = [...machine, ...workZones(s).filter((b) => ['build zone', 'fastener caddy', 'shaft stand'].includes(b.name))];
        expect(solids).toHaveLength(machine.length + 3);
        for (const [height, ahead] of SEATS) {
          const eye = { x: 0, y: height, z: ahead };
          for (const item of [...placePanel(eye, panel.plaques, panel.spot), ...placePanel(eye, [panel.base], panel.spot)]) {
            const plaque = item.name !== panel.base.name;
            for (const box of solids) {
              for (const [fx, fy] of GRID) {
                const centre = fx === 0 && fy === 0;
                const gap = distanceToBox(item.at(fx, fy), box);
                expect(gap, `${item.name} (${fx}, ${fy}) to the ${box.name}, eyes ${height}/${ahead}`).toBeGreaterThan(plaque && centre && machine.includes(box) ? PANEL_CLEARANCE_M : 0);
              }
            }
          }
          const [base] = placePanel(eye, [panel.base], panel.spot);
          expect(Math.min(...base.corners.map((c) => c.y)), `lowest corner of the base, eyes ${height}/${ahead}`).toBeGreaterThanOrEqual(BENCH.top + PANEL_OVER_BENCH_M);
        }
      });
    }
  }

  it('would have caught the old panel: at full size behind the machine, from the seat the placement aims at, the Resume plaque and the Night row were behind the case and the lid', () => {
    const eye = { x: 0, y: 0.38, z: 0.55 };
    const hidden = placePanel(eye, PAUSE_PLAQUES, OLD_PANEL, 1)
      .filter((plaque) => GRID.some(([fx, fy]) => hiddenBy(eye, plaque.at(fx, fy), 1).length > 0))
      .map((plaque) => plaque.name);
    expect(hidden).toContain('Resume');
    expect(hidden).toContain('Night');
  });

  it('keeps every plaque at least as tall as the press distance, at the size the panel is shown', () => {
    for (const panel of PAUSE_PANELS) for (const plaque of panel.plaques) expect(Math.min(plaque.w, plaque.h) * PAUSE_PANEL_SCALE, plaque.name).toBeGreaterThanOrEqual(POKE_PRESS_M);
  });
});
