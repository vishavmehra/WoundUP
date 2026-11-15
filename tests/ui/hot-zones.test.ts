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
  LENS_SPOT,
  MEDALLION_HOT_RADIUS_M,
  PANEL_SPOT,
  PAUSE_SPOT,
  POKE_PRESS_M,
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
