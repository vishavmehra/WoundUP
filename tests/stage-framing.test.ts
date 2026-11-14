import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  BENCH_BOX,
  PREVIEW_CAMERA,
  PREVIEW_INSETS,
  STAGE_BOXES,
  STAGE_ORIGIN,
  STAND_BOX,
  TOWN_BOX,
  frameBoxes,
  machineFrame,
  stageFrame,
  standZoom,
  type Insets,
  type StageBox,
} from '../src/stage-framing';

// The tsconfig has no Node types (the same pattern as tests/content/glb-contract.test.ts). Files are read relative to the repository root.
interface NodeFs {
  readFileSync(path: URL): Uint8Array;
}
const fs = (await import('node:fs' as string)) as NodeFs;
const read = (relative: string): Uint8Array => fs.readFileSync(new URL(`../${relative}`, import.meta.url));
const json = (path: string): any => JSON.parse(new TextDecoder().decode(read(path))); // eslint-disable-line @typescript-eslint/no-explicit-any

/** The JSON chunk of a GLB, and the bounding box of every POSITION accessor in it (these assets have no transforms on their meshes). */
function glb(path: string): { json: any; min: number[]; max: number[] } { // eslint-disable-line @typescript-eslint/no-explicit-any
  const bytes = read(`public/assets/models/${path}`);
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of doc.meshes) {
    for (const primitive of mesh.primitives) {
      const accessor = doc.accessors[primitive.attributes.POSITION];
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], accessor.min[i]);
        max[i] = Math.max(max[i], accessor.max[i]);
      }
    }
  }
  return { json: doc, min, max };
}

describe('the authored preview camera and stage', () => {
  const config = json('iwsdk.config.json').world.render;
  const scene = json('public/scenes/main.iwsdk.scene.json');
  const stage = scene.nodes.find((n: { id: string }) => n.id === 'stage');
  const stand = stage.children.find((n: { id: string }) => n.id === 'stand');

  it('matches the constants the framing is computed from', () => {
    expect(config.fov).toBe(PREVIEW_CAMERA.fovDeg);
    expect(config.camera.position).toEqual([...PREVIEW_CAMERA.position]);
    expect(config.camera.lookAt).toEqual([...PREVIEW_CAMERA.lookAt]);
    expect(stage.transform.position).toEqual([...STAGE_ORIGIN]);
  });

  it('puts the plinth so its velvet top is the stage root, centred on the stage (TOCKTON_DIMENSIONS §9)', () => {
    const plinth = glb('tockton/environment/tockton_base_round.glb');
    const size = plinth.max.map((v, i) => v - plinth.min[i]);
    expect(size[0]).toBeCloseTo(0.64, 4);
    expect(size[1]).toBeCloseTo(0.045, 4);
    expect(size[2]).toBeCloseTo(0.59, 4);
    expect(plinth.min[1]).toBeCloseTo(0, 6); // origin on the bottom face, so the node's y is the plinth's bottom
    const velvetTop = plinth.json.nodes[0].extras.wu.velvetTopM;
    const [x, y, z] = stand.transform.position;
    expect(y + velvetTop).toBeCloseTo(0, 6); // not buried, not floating: the velvet top is the stage root
    expect([x, z]).toEqual([0, 0.125]);
    // The framing's stand box is the plinth as placed.
    const placed = [x + plinth.min[0], y + plinth.min[1], z + plinth.min[2], x + plinth.max[0], y + plinth.max[1], z + plinth.max[2]];
    [...STAND_BOX.min, ...STAND_BOX.max].forEach((v, i) => expect(placed[i]).toBeCloseTo(v, 5));
  });

  it('carries the town ground (its origin is its bottom) and the workbench inside the plinth', () => {
    const ground = glb('tockton/environment/town_ground.glb');
    expect(ground.min[1]).toBeCloseTo(0, 6); // the ground's bottom is the stage root, which is the velvet top
    expect(ground.min[0]).toBeGreaterThan(STAND_BOX.min[0]);
    expect(ground.max[0]).toBeLessThan(STAND_BOX.max[0]);
    expect(ground.min[2]).toBeGreaterThan(STAND_BOX.min[2]);
    expect(ground.max[2]).toBeLessThan(STAND_BOX.max[2]);
    expect(ground.min[0]).toBeCloseTo(TOWN_BOX.min[0], 5); // the framing's town box is the ground's footprint
    // The bench stands against the town's front edge (z +0.15) and 25 cm deep, still on the plinth.
    const bench = glb('tockton/workshop/workbench.glb');
    expect(BENCH_BOX.min[2] + (bench.max[2] - bench.min[2])).toBeLessThanOrEqual(STAND_BOX.max[2] + 1e-9);
    expect(BENCH_BOX.max[0]).toBeLessThanOrEqual(STAND_BOX.max[0]);
  });
});

/** Where a stage-local point lands in a window of `w` x `h` pixels, with three.js' own projection and the frame applied. */
function projector(w: number, h: number, frame: { zoom: number; offsetX: number; offsetY: number }): (p: readonly number[]) => { x: number; y: number } {
  const camera = new PerspectiveCamera(PREVIEW_CAMERA.fovDeg, w / h, 0.01, 20);
  camera.position.set(...PREVIEW_CAMERA.position);
  camera.lookAt(...PREVIEW_CAMERA.lookAt);
  camera.zoom = frame.zoom;
  camera.setViewOffset(w, h, frame.offsetX, frame.offsetY, w, h);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return (p) => {
    const v = new Vector3(STAGE_ORIGIN[0] + p[0], STAGE_ORIGIN[1] + p[1], STAGE_ORIGIN[2] + p[2]).project(camera);
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  };
}

function cornersOf(boxes: readonly StageBox[]): number[][] {
  const out: number[][] = [];
  for (const { min, max } of boxes) for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
}

/** Extent of the boxes on screen, and whether every corner is inside the free rectangle. */
function measure(w: number, h: number, boxes: readonly StageBox[], frame: { zoom: number; offsetX: number; offsetY: number }, insets: Insets) {
  const project = projector(w, h, frame);
  const points = cornersOf(boxes).map(project);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const free = { left: insets.left, right: w - insets.right, top: insets.top, bottom: h - insets.bottom };
  return {
    inside: left >= free.left - 0.5 && right <= free.right + 0.5 && top >= free.top - 0.5 && bottom <= free.bottom + 0.5,
    fillW: (right - left) / (free.right - free.left),
    fillH: (bottom - top) / (free.bottom - free.top),
    centre: { x: (left + right) / 2 - (free.left + free.right) / 2, y: (top + bottom) / 2 - (free.top + free.bottom) / 2 },
  };
}

const WINDOWS: ReadonlyArray<[number, number]> = [
  [1440, 900],
  [1920, 1080],
  [768, 1024],
  [375, 812],
  [390, 844],
  [844, 390],
  [1024, 768],
];

describe('stageFrame (the 2D preview)', () => {
  for (const [w, h] of WINDOWS) {
    it(`keeps the whole stage inside the free window, centred and large, at ${w}x${h}`, () => {
      const frame = stageFrame(w, h);
      const m = measure(w, h, STAGE_BOXES, frame, PREVIEW_INSETS);
      expect(m.inside).toBe(true);
      expect(Math.max(m.fillW, m.fillH)).toBeGreaterThan(0.9); // as large as it can be, limited by one side
      expect(Math.abs(m.centre.x)).toBeLessThan(1.5);
      expect(Math.abs(m.centre.y)).toBeLessThan(1.5);
    });
  }

  it('zooms out on narrow portrait windows and never below the floor', () => {
    expect(standZoom(390, 844)).toBeLessThan(standZoom(1440, 900));
    expect(standZoom(10, 2000)).toBe(0.3);
    expect(frameBoxes(0, 0, STAGE_BOXES)).toEqual({ zoom: 0.3, offsetX: 0, offsetY: 0 });
  });

  it('does nothing when the insets leave no room', () => {
    expect(frameBoxes(400, 100, STAGE_BOXES, { top: 60, right: 0, bottom: 60, left: 0 })).toEqual({ zoom: 0.3, offsetX: 0, offsetY: 0 });
  });
});

describe('machineFrame (the gift viewer)', () => {
  // The largest machine on the stand: the Clock Tower and the Carousel's canopy are the tallest (TOCKTON_DIMENSIONS §3.3).
  const machine: StageBox = { min: [-0.1, 0, -0.1], max: [0.1, 0.28, 0.1] };
  const cases: Array<[string, number, number, Insets]> = [
    ['phone portrait, card at the bottom', 375, 812, { top: 12, right: 12, bottom: 340, left: 12 }],
    ['tablet portrait, card at the bottom', 768, 1024, { top: 24, right: 24, bottom: 360, left: 24 }],
    ['desktop, card on the left', 1440, 900, { top: 24, right: 24, bottom: 24, left: 480 }],
  ];
  for (const [name, w, h, insets] of cases) {
    it(`shows the whole machine in the part of the window the card leaves free: ${name}`, () => {
      const frame = machineFrame(w, h, machine, insets);
      const m = measure(w, h, [machine], frame, insets);
      expect(m.inside).toBe(true);
      expect(Math.max(m.fillW, m.fillH)).toBeGreaterThan(0.6); // the machine is the hero of the page
    });
  }
});
