import { describe, expect, it } from 'vitest';
import type { SurfaceInfo } from '../../src/placement';
import {
  ANCHOR_BUDGET_S,
  ANCHOR_RETRY_DELAYS_S,
  COLLECT_WINDOW_S,
  TablePlacementMachine,
  type HeadPose,
  type RefPose,
  type SpatialFrame,
} from '../../src/table/machine';
import { FORWARD, HEAD, goodTable } from './fixtures';

class FakeAnchor {
  deleted = 0;
  delete(): void {
    this.deleted++;
  }
}

type Create = 'resolve' | 'reject' | 'hang' | 'null' | 'throw';

/** A scripted XR frame: everything the machine can ask for, with counters for what it asked. */
class FakeSpatial implements SpatialFrame<FakeAnchor> {
  table = true;
  head_: HeadPose | null = { position: { ...HEAD }, forward: { ...FORWARD } };
  planes: SurfaceInfo[] | null = [goodTable()];
  /** What the next createAnchor calls do, in order; the last entry repeats. */
  script: Create[] = ['resolve'];
  /** What the anchor reports each frame; null = not tracked. */
  anchorPose: RefPose | null = null;

  surfaceReads = 0;
  creates: RefPose[] = [];
  anchors: FakeAnchor[] = [];
  hung: Array<(a: FakeAnchor) => void> = [];

  canPlaceOnTable(): boolean {
    return this.table;
  }
  head(): HeadPose | null {
    return this.head_;
  }
  surfaces(): ReadonlyArray<SurfaceInfo> | null {
    this.surfaceReads++;
    return this.planes;
  }
  createAnchor(pose: RefPose): Promise<FakeAnchor> | null {
    const step = this.script[Math.min(this.creates.length, this.script.length - 1)]!;
    this.creates.push({ ...pose });
    if (step === 'null') return null;
    if (step === 'throw') throw new Error('InvalidStateError');
    if (step === 'reject') return Promise.reject(new Error('anchor failed'));
    const anchor = new FakeAnchor();
    this.anchors.push(anchor);
    if (step === 'hang') return new Promise<FakeAnchor>((resolve) => this.hung.push(() => resolve(anchor)));
    return Promise.resolve(anchor);
  }
  readAnchor(_anchor: FakeAnchor, out: RefPose): boolean {
    if (!this.anchorPose) return false;
    Object.assign(out, this.anchorPose);
    return true;
  }
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

/** Drives a machine at 10 frames per second from `t0`, returning the step of the last frame. */
function setup() {
  const machine = new TablePlacementMachine<FakeAnchor>();
  const xr = new FakeSpatial();
  const run = async (from: number, to: number, dt = 0.1) => {
    const steps: string[] = [];
    for (let t = from; t <= to + 1e-9; t += dt) {
      steps.push(machine.update(t, xr));
      await settle();
    }
    return steps;
  };
  return { machine, xr, run };
}

/** Frames from the first pose until the town is on the table. */
async function toTable(ctx: ReturnType<typeof setup>) {
  ctx.machine.begin();
  const steps = await ctx.run(0, COLLECT_WINDOW_S + 0.5);
  expect(ctx.machine.phase).toBe('table');
  return steps;
}

describe('a session without table support goes straight to the stand (TBL-06, TBL-12)', () => {
  it('places the stand at the first tracked pose and never looks at surfaces', async () => {
    const { machine, xr, run } = setup();
    xr.table = false; // immersive-vr, or plane detection / anchors not granted
    machine.begin();
    expect(await run(0, 0.3)).toEqual(['stand', 'none', 'none', 'none']);
    expect(machine.phase).toBe('stand');
    expect(machine.standReason).toBe('no-table-support');
    expect(machine.townScale).toBe(1);
    expect(xr.surfaceReads).toBe(0);
    expect(xr.creates).toHaveLength(0);
  });

  it('waits for the first tracked pose before placing the stand', async () => {
    const { machine, xr, run } = setup();
    xr.table = false;
    xr.head_ = null;
    machine.begin();
    expect(await run(0, 0.5)).toEqual(Array(6).fill('none'));
    xr.head_ = { position: { ...HEAD }, forward: { ...FORWARD } };
    expect((await run(0.6, 0.6))[0]).toBe('stand');
  });

  it('places the stand again on a recentre, from the new eyes, without any new choice (STAND-04)', async () => {
    const { machine, xr, run } = setup();
    xr.table = false;
    machine.begin();
    await run(0, 0.2);
    machine.recentre();
    expect(await run(0.3, 0.5)).toEqual(['stand', 'none', 'none']);
    machine.recentre();
    xr.head_ = null; // tracking is out when the recentre lands: wait for the eyes, then place
    expect(await run(0.6, 0.8)).toEqual(['none', 'none', 'none']);
    xr.head_ = { position: { x: 0.2, y: 1.3, z: 0.1 }, forward: { ...FORWARD } };
    expect((await run(0.9, 0.9))[0]).toBe('stand');
    expect(xr.surfaceReads).toBe(0);
  });
});

describe('the choice window (PRODUCT_SPEC §3.2: at most about 2 seconds)', () => {
  it('starts at the first tracked pose, not at the session start', async () => {
    const { machine, xr, run } = setup();
    xr.head_ = null;
    machine.begin();
    await run(0, 4.9); // five seconds with no tracked pose
    expect(machine.phase).toBe('awaiting-pose');
    xr.head_ = { position: { ...HEAD }, forward: { ...FORWARD } };
    await run(5, 6.8);
    expect(machine.phase).toBe('collecting');
    expect(xr.surfaceReads).toBe(0);
    await run(6.9, 7.1);
    expect(xr.surfaceReads).toBe(1); // chosen about two seconds after the first pose (5.0), not after the session start
    expect(machine.phase).not.toBe('collecting');
  });

  it('puts the stand up when no surfaces are reported, at the end of the window (TBL-07)', async () => {
    const { machine, xr, run } = setup();
    xr.planes = [];
    machine.begin();
    const steps = await run(0, 2.0);
    expect(steps.slice(0, -1).every((s) => s === 'none')).toBe(true); // nothing before the window ends
    expect(steps[steps.length - 1]).toBe('stand');
    expect(machine.standReason).toBe('no-suitable-surface');
  });

  it('puts the stand up when the frame cannot list surfaces, or none is suitable (TBL-02)', async () => {
    for (const planes of [null, [goodTable({ y: 0 })], [goodTable({ cz: 0.55 })], [goodTable({ width: 0.3 })]]) {
      const { machine, xr, run } = setup();
      xr.planes = planes;
      machine.begin();
      await run(0, 2.2);
      expect(machine.phase).toBe('stand');
      expect(machine.standReason).toBe('no-suitable-surface');
    }
  });

  it('waits for tracking if the eyes are out when the window ends, then chooses', async () => {
    const { machine, xr, run } = setup();
    machine.begin();
    await run(0, 1.9);
    xr.head_ = null;
    await run(2.0, 3.0);
    expect(machine.phase).toBe('collecting');
    expect(xr.surfaceReads).toBe(0);
    xr.head_ = { position: { ...HEAD }, forward: { ...FORWARD } };
    await run(3.1, 3.2);
    expect(xr.surfaceReads).toBe(1);
    expect(machine.phase).not.toBe('collecting');
  });
});

describe('table: the anchor is made at the chosen pose and the town waits for it (TBL-01, TBL-03)', () => {
  it('anchors at the chosen centre and yaw, then reveals the town on the first frame the anchor exists', async () => {
    const ctx = setup();
    ctx.xr.anchorPose = { x: 0.01, y: 0.8, z: -0.55, qx: 0, qy: 0, qz: 0, qw: 1 };
    const steps = await toTable(ctx);
    expect(ctx.xr.creates).toHaveLength(1);
    const made = ctx.xr.creates[0]!;
    expect(made.x).toBeCloseTo(0, 9);
    expect(made.y).toBeCloseTo(0.8, 9);
    expect(made.z).toBeCloseTo(-0.55, 9);
    expect([made.qx, made.qy, made.qz].map((v) => Math.abs(v))).toEqual([0, 0, 0]); // looking along -Z: no turn needed
    expect(made.qw).toBeCloseTo(1, 9);
    expect(steps.filter((s) => s === 'stand')).toHaveLength(0);
    expect(steps.filter((s) => s === 'table-start')).toHaveLength(1);
    expect(steps.indexOf('table-start')).toBeGreaterThan(steps.indexOf('none')); // the stage was not shown before the anchor
    expect(steps[steps.length - 1]).toBe('table');
    expect(ctx.machine.standReason).toBeNull();
    expect(ctx.machine.townScale).toBe(1);
    expect(ctx.machine.pose.x).toBeCloseTo(0.01); // follows the anchor
  });

  it('turns the stage to face the eyes: the anchor yaw is the choice yaw', async () => {
    const ctx = setup();
    ctx.xr.head_ = { position: { x: 1, y: 1.3, z: 2 }, forward: { x: 1, y: 0, z: 0 } }; // looking along +X
    ctx.xr.planes = [goodTable({ cx: 1.55, cz: 2, y: 0.9 })];
    await toTable(ctx);
    const q = ctx.xr.creates[0]!;
    const yaw = 2 * Math.atan2(q.qy, q.qw);
    expect(Math.sin(yaw)).toBeCloseTo(-1, 6); // local +Z -> world -X
    expect(q.qx).toBe(0);
    expect(q.qz).toBe(0);
  });

  it('applies the town scale only once the town is on the table', async () => {
    const ctx = setup();
    ctx.xr.planes = [goodTable({ width: 0.5, depth: 0.5 })];
    ctx.machine.begin();
    await ctx.run(0, 1.9);
    expect(ctx.machine.townScale).toBe(1);
    await ctx.run(2.0, 2.5);
    expect(ctx.machine.phase).toBe('table');
    expect(ctx.machine.townScale).toBe(0.83);
  });

  it('keeps the chosen pose when the anchor reports none on its first frame', async () => {
    const ctx = setup();
    ctx.xr.anchorPose = null;
    await toTable(ctx);
    expect(ctx.machine.pose.y).toBeCloseTo(0.8, 9);
    expect(ctx.machine.pose.z).toBeCloseTo(-0.55, 9);
  });
});

describe('table: nothing moves after the choice (TBL-08)', () => {
  it('ignores recentring, plane updates, a lost head and a lost anchor', async () => {
    const ctx = setup();
    ctx.xr.anchorPose = { x: 0, y: 0.8, z: -0.55, qx: 0, qy: 0, qz: 0, qw: 1 };
    await toTable(ctx);
    expect(ctx.xr.surfaceReads).toBe(1);
    const placedAt = { ...ctx.machine.pose };

    ctx.machine.recentre(); // the player recentres the headset view
    ctx.xr.planes = [goodTable({ y: 0.5, label: 'table' })]; // the platform changes the surface
    ctx.xr.head_ = { position: { x: 0.4, y: 1.5, z: 0.3 }, forward: { x: 1, y: 0, z: 0 } }; // the head moves
    let steps = await ctx.run(3, 3.4);
    expect(steps).toEqual(Array(5).fill('table'));
    expect(ctx.machine.pose).toEqual(placedAt);

    ctx.xr.planes = []; // ... or loses it altogether
    ctx.xr.head_ = null; // tracking drops
    ctx.xr.anchorPose = null;
    steps = await ctx.run(3.5, 3.9);
    expect(steps).toEqual(Array(5).fill('table'));
    expect(ctx.machine.pose).toEqual(placedAt); // the last pose is held

    expect(ctx.xr.surfaceReads).toBe(1); // no second choice
    expect(ctx.xr.creates).toHaveLength(1);
    expect(ctx.machine.phase).toBe('table');
  });

  it('follows the anchor when tracking refines it', async () => {
    const ctx = setup();
    await toTable(ctx);
    ctx.xr.anchorPose = { x: 0.004, y: 0.801, z: -0.553, qx: 0, qy: 0.01, qz: 0, qw: 0.99995 };
    await ctx.run(3, 3.1);
    expect(ctx.machine.pose).toMatchObject({ x: 0.004, y: 0.801, z: -0.553 });
  });
});

describe('anchor creation (SPATIAL_WORLD_SYSTEM §6)', () => {
  it('retries after 0.25 s and then 0.5 s, and uses the first anchor that succeeds', async () => {
    const ctx = setup();
    ctx.xr.script = ['reject', 'reject', 'resolve'];
    ctx.machine.begin();
    await ctx.run(0, 1.9); // collecting
    expect(ctx.xr.creates).toHaveLength(0);
    await ctx.run(2.0, 2.0);
    expect(ctx.xr.creates).toHaveLength(1);
    await ctx.run(2.1, 2.2); // the rejection is seen on the next frame; no retry before 0.25 s later
    expect(ctx.xr.creates).toHaveLength(1);
    await ctx.run(2.3, 2.5);
    expect(ctx.xr.creates).toHaveLength(2);
    await ctx.run(2.6, 2.9);
    expect(ctx.xr.creates).toHaveLength(2); // the second retry waits 0.5 s
    await ctx.run(3.0, 3.3);
    expect(ctx.xr.creates).toHaveLength(3);
    expect(ctx.machine.phase).toBe('table');
    expect(ANCHOR_RETRY_DELAYS_S).toEqual([0.25, 0.5]);
  });

  it('uses the stand, nothing shown on the table first, when every attempt is rejected (TBL-06)', async () => {
    const ctx = setup();
    ctx.xr.script = ['reject'];
    ctx.machine.begin();
    const steps = await ctx.run(0, 5);
    expect(ctx.xr.creates).toHaveLength(3);
    expect(steps).not.toContain('table-start');
    expect(steps.filter((s) => s === 'stand')).toHaveLength(1);
    expect(ctx.machine.phase).toBe('stand');
    expect(ctx.machine.standReason).toBe('anchor-failed');
    expect(ctx.machine.townScale).toBe(1);
  });

  it('counts a synchronous throw as a failed attempt', async () => {
    const ctx = setup();
    ctx.xr.script = ['throw', 'resolve'];
    ctx.machine.begin();
    await ctx.run(0, 3.5);
    expect(ctx.xr.creates).toHaveLength(2);
    expect(ctx.machine.phase).toBe('table');
  });

  it('uses the stand at once when the frame cannot make anchors', async () => {
    const ctx = setup();
    ctx.xr.script = ['null'];
    ctx.machine.begin();
    const steps = await ctx.run(0, 2.2);
    expect(steps.filter((s) => s === 'stand')).toHaveLength(1); // on the frame the window ends: no retries for this
    expect(ctx.xr.creates).toHaveLength(1);
    expect(ctx.machine.standReason).toBe('anchor-failed');
  });

  it('gives up on a promise that never settles, and deletes the anchor if it arrives late', async () => {
    const ctx = setup();
    ctx.xr.script = ['hang'];
    ctx.machine.begin();
    await ctx.run(0, COLLECT_WINDOW_S + ANCHOR_BUDGET_S + 0.5);
    expect(ctx.machine.phase).toBe('stand');
    expect(ctx.machine.standReason).toBe('anchor-failed');
    expect(ctx.xr.creates).toHaveLength(1);
    ctx.xr.hung[0]!(ctx.xr.anchors[0]!); // too late
    await settle();
    expect(ctx.xr.anchors[0]!.deleted).toBe(1);
    expect(ctx.machine.phase).toBe('stand'); // not switched to the table
  });
});

describe('sessions (TBL-09)', () => {
  it('deletes the anchor when the session ends and makes a new choice in the next one', async () => {
    const ctx = setup();
    await toTable(ctx);
    const first = ctx.xr.anchors[0]!;
    ctx.machine.end();
    expect(first.deleted).toBe(1);
    expect(ctx.machine.phase).toBe('idle');
    expect(ctx.machine.townScale).toBe(1);

    ctx.xr.planes = [goodTable({ cx: 0.1, width: 1.5, label: 'desk' })];
    ctx.machine.begin();
    await ctx.run(10, 12.5);
    expect(ctx.machine.phase).toBe('table');
    expect(ctx.xr.surfaceReads).toBe(2); // exactly one decision per session
    expect(ctx.xr.creates).toHaveLength(2);
    expect(first.deleted).toBe(1);
  });

  it('deletes an anchor that resolves after the session already ended', async () => {
    const ctx = setup();
    ctx.xr.script = ['hang'];
    ctx.machine.begin();
    await ctx.run(0, 2.2);
    expect(ctx.xr.creates).toHaveLength(1);
    ctx.machine.end();
    ctx.xr.hung[0]!(ctx.xr.anchors[0]!);
    await settle();
    expect(ctx.xr.anchors[0]!.deleted).toBe(1);
    expect(ctx.machine.phase).toBe('idle');
  });

  it('is idle and does nothing before begin() and after end()', async () => {
    const { machine, xr, run } = setup();
    expect(await run(0, 0.3)).toEqual(['none', 'none', 'none', 'none']);
    expect(xr.surfaceReads).toBe(0);
    machine.begin();
    machine.end();
    expect(machine.update(1, xr)).toBe('none');
  });

  it('does not throw when deleting the anchor fails because the session is gone', async () => {
    const ctx = setup();
    await toTable(ctx);
    ctx.xr.anchors[0]!.delete = () => {
      throw new Error('InvalidStateError');
    };
    expect(() => ctx.machine.end()).not.toThrow();
  });
});

describe('the stand in a mixed-reality session after a failed choice', () => {
  it('is placed once, then only again on a recentre', async () => {
    const ctx = setup();
    ctx.xr.planes = [];
    ctx.machine.begin();
    const steps = await ctx.run(0, 4);
    expect(steps.filter((s) => s === 'stand')).toHaveLength(1);
    ctx.machine.recentre();
    expect(await ctx.run(4.1, 4.3)).toEqual(['stand', 'none', 'none']);
    expect(ctx.xr.surfaceReads).toBe(1);
  });
});

describe('head pose is only read when it is needed (per-frame cost)', () => {
  it('does not touch the head or the surfaces while the window runs', async () => {
    const ctx = setup();
    let headReads = 0;
    const original = ctx.xr.head.bind(ctx.xr);
    ctx.xr.head = () => {
      headReads++;
      return original();
    };
    ctx.machine.begin();
    await ctx.run(0, 1.9);
    expect(headReads).toBe(1); // only the first-pose check
    expect(ctx.xr.surfaceReads).toBe(0);
  });
});
