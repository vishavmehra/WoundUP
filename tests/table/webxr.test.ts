import { afterEach, describe, expect, it, vi } from 'vitest';
import { TablePlacementMachine, type RefPose } from '../../src/table/machine';
import { WebXrSpatial, forwardFromQuaternion, surfaceFromPlane } from '../../src/table/webxr';

const q = (axis: 'x' | 'y' | 'z', degrees: number) => {
  const h = (degrees * Math.PI) / 360;
  return { x: axis === 'x' ? Math.sin(h) : 0, y: axis === 'y' ? Math.sin(h) : 0, z: axis === 'z' ? Math.sin(h) : 0, w: Math.cos(h) };
};

/** Column-major 4x4 for a rotation of `deg` about +Y followed by a translation, like XRRigidTransform.matrix. */
function yawMatrix(deg: number, tx: number, ty: number, tz: number): Float32Array {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  // columns: local X, local Y, local Z, translation
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, tx, ty, tz, 1]);
}

afterEach(() => vi.unstubAllGlobals());

describe('forwardFromQuaternion', () => {
  const f = (quat: { x: number; y: number; z: number; w: number }) => forwardFromQuaternion(quat, { x: 0, y: 0, z: 0 });
  it('faces -Z with no rotation', () => {
    const v = f({ x: 0, y: 0, z: 0, w: 1 });
    expect([v.x, v.y, v.z].map((n) => n + 0)).toEqual([0, 0, -1]);
  });
  it('turns left for a positive yaw (right-handed, +Y up)', () => {
    const v = f(q('y', 90));
    expect(v.x).toBeCloseTo(-1, 9);
    expect(v.z).toBeCloseTo(0, 9);
  });
  it('looks down for a negative pitch about X', () => {
    const v = f(q('x', -30));
    expect(v.y).toBeCloseTo(-0.5, 9);
    expect(v.z).toBeCloseTo(-Math.cos(Math.PI / 6), 9);
  });
});

describe('surfaceFromPlane', () => {
  const square = [
    { x: -0.5, y: 0, z: -0.25 },
    { x: 0.5, y: 0, z: -0.25 },
    { x: 0.5, y: 0, z: 0.25 },
    { x: -0.5, y: 0, z: 0.25 },
  ];

  it('flattens a level plane at the origin as it is', () => {
    const s = surfaceFromPlane(yawMatrix(0, 0, 0, 0), square, 'horizontal', 'table');
    expect(s.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(s.label).toBe('table');
    expect(s.orientation).toBe('horizontal');
    expect(s.outline.map((p) => [p.x, p.z])).toEqual([
      [-0.5, -0.25],
      [0.5, -0.25],
      [0.5, 0.25],
      [-0.5, 0.25],
    ]);
  });

  it('carries the polygon through the plane pose: turned a quarter and moved', () => {
    const s = surfaceFromPlane(yawMatrix(90, 2, 0.8, -1), [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }], undefined, undefined);
    // local +X -> world -Z, local +Z -> world +X after a quarter turn about +Y
    expect(s.outline[0]!.x).toBeCloseTo(2, 6);
    expect(s.outline[0]!.z).toBeCloseTo(-2, 6);
    expect(s.outline[1]!.x).toBeCloseTo(3, 6);
    expect(s.outline[1]!.z).toBeCloseTo(-1, 6);
    expect(s.origin).toEqual({ x: expect.closeTo(2, 6), y: expect.closeTo(0.8, 6), z: expect.closeTo(-1, 6) });
    expect(s.normal.y).toBeCloseTo(1, 6); // turning about Y leaves the normal up
  });

  it('reports a wall as not level and a degenerate matrix as not level', () => {
    // plane space +Y (the normal) lying along world +Z
    const wall = new Float32Array([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 1]);
    expect(surfaceFromPlane(wall, square, 'vertical', 'wall').normal).toEqual({ x: 0, y: 0, z: 1 });
    const flat = surfaceFromPlane(new Float32Array(16), square, 'horizontal', undefined);
    expect(flat.normal).toEqual({ x: 0, y: 0, z: 0 });
  });
});

// --- WebXrSpatial over fake WebXR objects ------------------------------------------------------------------------------

type Pose = { transform: { matrix: Float32Array; position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } } };

function poseOf(matrix: Float32Array, position = { x: 0, y: 0, z: 0 }, orientation = { x: 0, y: 0, z: 0, w: 1 }): Pose {
  return { transform: { matrix, position, orientation } };
}

function fakeFrame(opts: {
  planes?: Array<{ space: object; polygon: Array<{ x: number; y: number; z: number }>; orientation?: string; label?: string }> | undefined | 'throw';
  poses?: Map<object, Pose | undefined>;
  viewer?: Pose | undefined;
  anchors?: boolean;
}) {
  const poses = opts.poses ?? new Map();
  const frame: Record<string, unknown> = {
    getViewerPose: vi.fn(() => opts.viewer),
    getPose: vi.fn((space: object) => poses.get(space)),
  };
  if (opts.planes === 'throw') {
    Object.defineProperty(frame, 'detectedPlanes', {
      get() {
        throw new Error('InvalidStateError');
      },
    });
  } else if (opts.planes !== undefined) {
    frame.detectedPlanes = new Set(opts.planes.map((p) => ({ planeSpace: p.space, polygon: p.polygon, orientation: p.orientation, semanticLabel: p.label })));
  }
  if (opts.anchors !== false) frame.createAnchor = vi.fn(async () => ({ anchorSpace: {}, delete: vi.fn() }));
  return frame as unknown as XRFrame & { getViewerPose: ReturnType<typeof vi.fn>; getPose: ReturnType<typeof vi.fn>; createAnchor: ReturnType<typeof vi.fn> };
}

const SPACE = {} as XRReferenceSpace;
const session = (features: string[] | undefined, blend: XREnvironmentBlendMode = 'alpha-blend') =>
  ({ enabledFeatures: features, environmentBlendMode: blend }) as unknown as XRSession;

describe('WebXrSpatial.canPlaceOnTable', () => {
  const use = (frame: XRFrame | null, s: XRSession | undefined) => {
    const spatial = new WebXrSpatial();
    spatial.setFrame(frame, SPACE, s);
    return spatial.canPlaceOnTable();
  };
  const both = ['plane-detection', 'anchors', 'hand-tracking'];

  it('is true in a mixed-reality session with both features and both calls', () => {
    expect(use(fakeFrame({ planes: [] }), session(both))).toBe(true);
    expect(use(fakeFrame({ planes: [] }), session(both, 'additive'))).toBe(true);
  });
  it('is false when either feature was not granted (TBL-06)', () => {
    expect(use(fakeFrame({ planes: [] }), session(['anchors']))).toBe(false);
    expect(use(fakeFrame({ planes: [] }), session(['plane-detection']))).toBe(false);
    expect(use(fakeFrame({ planes: [] }), session(['hand-tracking']))).toBe(false);
    expect(use(fakeFrame({ planes: [] }), session(undefined))).toBe(false);
  });
  it('is false in immersive-vr, in a browser without the calls, and outside a frame (TBL-12)', () => {
    expect(use(fakeFrame({ planes: [] }), session(both, 'opaque'))).toBe(false);
    expect(use(fakeFrame({ anchors: false, planes: [] }), session(both))).toBe(false);
    expect(use(fakeFrame({}), session(both))).toBe(false); // no detectedPlanes member at all
    expect(use(null, session(both))).toBe(false);
    expect(use(fakeFrame({ planes: [] }), undefined)).toBe(false);
  });
});

describe('WebXrSpatial reading the frame', () => {
  it('reads the head: eye position and the way it faces', () => {
    const spatial = new WebXrSpatial();
    spatial.setFrame(fakeFrame({ viewer: poseOf(new Float32Array(16), { x: 1, y: 1.3, z: 2 }, q('y', 90)) }), SPACE, session([]));
    const head = spatial.head()!;
    expect(head.position).toEqual({ x: 1, y: 1.3, z: 2 });
    expect(head.forward.x).toBeCloseTo(-1, 9);
  });

  it('has no head while the headset is not tracked', () => {
    const spatial = new WebXrSpatial();
    spatial.setFrame(fakeFrame({ viewer: undefined }), SPACE, session([]));
    expect(spatial.head()).toBeNull();
    spatial.setFrame(null, null, undefined);
    expect(spatial.head()).toBeNull();
  });

  it('lists planes with their poses and skips planes that have none this frame', () => {
    const a = {};
    const b = {};
    const poses = new Map<object, Pose | undefined>([
      [a, poseOf(yawMatrix(0, 0, 0.8, -0.55))],
      [b, undefined],
    ]);
    const polygon = [{ x: -0.5, y: 0, z: -0.5 }, { x: 0.5, y: 0, z: -0.5 }, { x: 0, y: 0, z: 0.5 }];
    const frame = fakeFrame({
      planes: [
        { space: a, polygon, orientation: 'horizontal', label: 'table' },
        { space: b, polygon, orientation: 'vertical', label: 'wall' },
      ],
      poses,
    });
    const spatial = new WebXrSpatial();
    spatial.setFrame(frame, SPACE, session([]));
    const surfaces = spatial.surfaces()!;
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.label).toBe('table');
    expect(surfaces[0]!.origin.y).toBeCloseTo(0.8, 6);
    expect(frame.getPose).toHaveBeenCalledWith(a, SPACE);
  });

  it('has no surface list when the frame has none or refuses to give it', () => {
    const spatial = new WebXrSpatial();
    spatial.setFrame(fakeFrame({}), SPACE, session([]));
    expect(spatial.surfaces()).toBeNull();
    spatial.setFrame(fakeFrame({ planes: 'throw' }), SPACE, session([]));
    expect(spatial.surfaces()).toBeNull();
    spatial.setFrame(null, null, undefined);
    expect(spatial.surfaces()).toBeNull();
  });

  it('creates an anchor at the pose in the reference space', async () => {
    const transforms: unknown[] = [];
    vi.stubGlobal(
      'XRRigidTransform',
      class {
        constructor(
          public position: unknown,
          public orientation: unknown,
        ) {
          transforms.push(this);
        }
      },
    );
    const frame = fakeFrame({ planes: [] });
    const spatial = new WebXrSpatial();
    spatial.setFrame(frame, SPACE, session([]));
    const pose: RefPose = { x: 1, y: 2, z: 3, qx: 0, qy: 0.5, qz: 0, qw: 0.8660254 };
    await spatial.createAnchor(pose);
    expect(frame.createAnchor).toHaveBeenCalledTimes(1);
    expect(frame.createAnchor.mock.calls[0]![1]).toBe(SPACE);
    expect(transforms[0]).toMatchObject({ position: { x: 1, y: 2, z: 3 }, orientation: { x: 0, y: 0.5, z: 0, w: 0.8660254 } });

    spatial.setFrame(fakeFrame({ anchors: false }), SPACE, session([]));
    expect(spatial.createAnchor(pose)).toBeNull();
  });

  it('reads an anchor pose, and says so when the anchor is not tracked', () => {
    const anchorSpace = {};
    const anchor = { anchorSpace, delete: vi.fn() } as unknown as XRAnchor;
    const poses = new Map<object, Pose | undefined>([[anchorSpace, poseOf(new Float32Array(16), { x: 0.1, y: 0.8, z: -0.5 }, q('y', 30))]]);
    const spatial = new WebXrSpatial();
    spatial.setFrame(fakeFrame({ poses }), SPACE, session([]));
    const out: RefPose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
    expect(spatial.readAnchor(anchor, out)).toBe(true);
    expect(out).toMatchObject({ x: 0.1, y: 0.8, z: -0.5, qw: expect.closeTo(Math.cos(Math.PI / 12), 9) });

    poses.set(anchorSpace, undefined);
    const before = { ...out };
    expect(spatial.readAnchor(anchor, out)).toBe(false);
    expect(out).toEqual(before); // untouched: the caller keeps the last pose
  });
});

describe('machine + adapter on synthetic planes (the wiring the StageSystem uses)', () => {
  it('chooses a labelled desk from plane poses and anchors there; keeps the stand when only a wall and the floor exist', async () => {
    vi.stubGlobal('XRRigidTransform', class {
      constructor(public position: unknown, public orientation: unknown) {}
    });
    const floor = {};
    const wall = {};
    const desk = {};
    const rect = (w: number, d: number) => [
      { x: -w / 2, y: 0, z: -d / 2 },
      { x: w / 2, y: 0, z: -d / 2 },
      { x: w / 2, y: 0, z: d / 2 },
      { x: -w / 2, y: 0, z: d / 2 },
    ];
    const wallMatrix = new Float32Array([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1.2, -1.5, 1]);
    const poses = new Map<object, Pose | undefined>([
      [floor, poseOf(yawMatrix(0, 0, 0, 0))],
      [wall, poseOf(wallMatrix)],
      [desk, poseOf(yawMatrix(0, 0, 0.8, -0.6))],
    ]);
    const anchorSpace = {};
    const created = { anchorSpace, delete: vi.fn() } as unknown as XRAnchor;
    poses.set(anchorSpace, poseOf(yawMatrix(0, 0, 0.8, -0.55), { x: 0, y: 0.8, z: -0.55 }));

    const run = async (planes: Array<{ space: object; polygon: ReturnType<typeof rect>; orientation: string; label: string }>) => {
      const machine = new TablePlacementMachine<XRAnchor>();
      const spatial = new WebXrSpatial();
      machine.begin();
      const steps: string[] = [];
      for (let t = 0; t <= 2.5; t += 0.1) {
        const frame = fakeFrame({ planes, poses, viewer: poseOf(new Float32Array(16), { x: 0, y: 1.2, z: 0 }) });
        (frame as unknown as { createAnchor: unknown }).createAnchor = vi.fn(async () => created);
        spatial.setFrame(frame, SPACE, session(['plane-detection', 'anchors']));
        steps.push(machine.update(t, spatial));
        for (let i = 0; i < 6; i++) await Promise.resolve();
      }
      return { machine, steps };
    };

    const room = [
      { space: floor, polygon: rect(4, 4), orientation: 'horizontal', label: 'floor' },
      { space: wall, polygon: rect(3, 2.4), orientation: 'vertical', label: 'wall' },
      { space: desk, polygon: rect(1.2, 0.7), orientation: 'horizontal', label: 'desk' },
    ];
    const withDesk = await run(room);
    expect(withDesk.machine.phase).toBe('table');
    expect(withDesk.machine.pose.y).toBeCloseTo(0.8, 6);
    expect(withDesk.steps).toContain('table-start');
    expect(withDesk.steps).not.toContain('stand');

    const without = await run(room.slice(0, 2));
    expect(without.machine.phase).toBe('stand');
    expect(without.machine.standReason).toBe('no-suitable-surface');
    expect(without.steps.filter((s) => s === 'stand')).toHaveLength(1);
  });
});
