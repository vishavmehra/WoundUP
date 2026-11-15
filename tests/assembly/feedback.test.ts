import { describe, expect, it } from 'vitest';
import { Group, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import {
  AssemblyFeedback,
  BEAT_GAP_S,
  GLINT_PEAK,
  GLINT_POOL,
  GLINT_S,
  POWER_NODE_S,
  REVEAL_CLOSE_S,
  REVEAL_OPEN_AT_S,
  REVEAL_S,
  SCREW_TURN_RAD,
  SETTLE_OVERSHOOT_M,
  SETTLE_S,
  glintEnvelope,
  powerPath,
  revealLidAngle,
  settleCurve,
} from '../../src/assembly/feedback';
import type { FeedbackAudio, FeedbackHost, RevealHinge } from '../../src/assembly/feedback';
import { MAX_SNAP_STEP } from '../../src/audio/notes';
import { MUSIC_BOX } from '../../src/content/blueprints/music-box';
import { SNAP_TWEEN_S } from '../../src/interaction/snap';

const FRAME = 1 / 60;

class Recorder implements FeedbackAudio {
  readonly calls: string[] = [];
  readonly snaps: Array<{ voice: string; step: number }> = [];
  snapMaterial(voice: string, step = 0): void {
    this.calls.push('snap');
    this.snaps.push({ voice, step });
  }
  stageChord(index: number, total: number): void {
    this.calls.push(`chord:${index}/${total}`);
  }
  dialTick(): void {
    this.calls.push('dial');
  }
  lidThump(): void {
    this.calls.push('thump');
  }
  revealRise(): void {
    this.calls.push('rise');
  }
}

function setup(stages?: number) {
  const parent = new Group();
  const camera = new PerspectiveCamera();
  const audio = new Recorder();
  const sockets = new Map<string, Vector3>();
  let lid: RevealHinge | null = null;
  const host: FeedbackHost = {
    locate: (id, out) => {
      const at = sockets.get(id);
      if (!at) return false;
      out.copy(at);
      return true;
    },
    lid: () => lid,
  };
  const feedback = new AssemblyFeedback(parent, audio, host, { stages });
  /** Steps the clock `seconds` forward in 60 Hz frames, running `each` after every frame (a stand-in for SocketSnapSystem.lock). */
  const run = (seconds: number, each?: (t: number) => void): void => {
    let t = 0;
    while (t < seconds - 1e-9) {
      feedback.update(FRAME, camera);
      t += FRAME;
      each?.(t);
    }
  };
  const part = (x = 0, y = 0, z = 0): Object3D => {
    const o = new Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    o.updateMatrixWorld(true);
    return o;
  };
  return { parent, camera, audio, sockets, feedback, run, part, setLid: (l: RevealHinge | null) => (lid = l) };
}

/**
 * Watches the glint pool frame by frame and reports each new glint as it appears: when, and which multiple of `pitch` it sits at on x
 * (the parts are placed at multiples of it, much further apart than the 8 mm sweep).
 */
function trackSpawns(
  feedback: AssemblyFeedback,
  run: (seconds: number, each?: (t: number) => void) => void,
  seconds: number,
  pitch: number,
): Array<{ index: number; at: number }> {
  const m = feedback.glints.instanceMatrix.array as Float32Array;
  const was = new Array<boolean>(GLINT_POOL).fill(false);
  const out: Array<{ index: number; at: number }> = [];
  run(seconds, (t) => {
    if (feedback.liveGlints === 0) {
      was.fill(false); // the pool is hidden and its matrices are stale
      return;
    }
    for (let i = 0; i < GLINT_POOL; i++) {
      const alive = m[i * 16] > 0; // the quad's scale: 0 for a free slot
      if (alive && !was[i]) out.push({ index: Math.round(m[i * 16 + 12] / pitch) + 0, at: t }); // + 0: no negative zero from the sweep
      was[i] = alive;
    }
  });
  return out;
}

describe('pure curves', () => {
  it('settleCurve is 0 at both ends, peaks at 1 a third of the way, and never goes below 0', () => {
    expect(settleCurve(0)).toBe(0);
    expect(settleCurve(1)).toBe(0);
    expect(settleCurve(-1)).toBe(0);
    expect(settleCurve(2)).toBe(0);
    expect(settleCurve(Number.NaN)).toBe(0);
    expect(settleCurve(1 / 3)).toBeCloseTo(1, 10);
    for (let i = 0; i <= 100; i++) {
      const v = settleCurve(i / 100);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('glintEnvelope flares to 0.6 at a fifth of its life and is gone by 0.3 s', () => {
    expect(glintEnvelope(0)).toBe(0);
    expect(glintEnvelope(GLINT_S)).toBe(0);
    expect(glintEnvelope(GLINT_S * 2)).toBe(0);
    expect(glintEnvelope(GLINT_S * 0.2)).toBeCloseTo(GLINT_PEAK, 10);
    expect(GLINT_PEAK).toBeLessThanOrEqual(0.6);
    let max = 0;
    for (let i = 0; i <= 300; i++) max = Math.max(max, glintEnvelope((i / 300) * GLINT_S));
    expect(max).toBeLessThanOrEqual(0.6 + 1e-12);
    expect(glintEnvelope(0.05)).toBeLessThan(glintEnvelope(0.06)); // rising
    expect(glintEnvelope(0.2)).toBeGreaterThan(glintEnvelope(0.25)); // fading
  });

  it('revealLidAngle shuts, holds shut, then opens, and is continuous at the joins', () => {
    const open = 1.7;
    expect(revealLidAngle(0, open, open)).toBeCloseTo(open, 10);
    expect(revealLidAngle(REVEAL_CLOSE_S * 0.5, open, open)).toBeLessThan(open);
    expect(revealLidAngle(REVEAL_CLOSE_S, open, open)).toBe(0);
    expect(revealLidAngle((REVEAL_CLOSE_S + REVEAL_OPEN_AT_S) / 2, open, open)).toBe(0);
    expect(revealLidAngle(REVEAL_OPEN_AT_S, open, open)).toBeCloseTo(0, 10);
    expect(revealLidAngle(REVEAL_OPEN_AT_S + 0.5, open, open)).toBeGreaterThan(0);
    expect(revealLidAngle(REVEAL_S, open, open)).toBe(open);
    expect(revealLidAngle(REVEAL_S + 5, open, open)).toBe(open);
    expect(REVEAL_S).toBeGreaterThan(3.5);
    expect(REVEAL_S).toBeLessThan(4.2); // "about 4 s"
    // The open phase never goes backwards.
    let last = -1;
    for (let t = REVEAL_OPEN_AT_S; t <= REVEAL_S; t += 0.02) {
      const a = revealLidAngle(t, open, open);
      expect(a).toBeGreaterThanOrEqual(last - 1e-12);
      last = a;
    }
  });

  it('a lid that is already shut stays shut until it opens', () => {
    expect(revealLidAngle(0.2, 0, 1.7)).toBe(0);
    expect(revealLidAngle(1.0, 0, 1.7)).toBe(0);
  });
});

describe('powerPath', () => {
  it('walks the Music Box in the order the design lists: spring to governor', () => {
    expect(powerPath(MUSIC_BOX)).toEqual([
      'main_spring',
      'spring_pinion',
      'cylinder_wheel',
      'arbor',
      'cylinder',
      'governor_wheel',
      'governor_pinion',
      'governor',
    ]);
  });

  it('reaches symmetric connections backwards and pin and trigger connections only forwards', () => {
    const graph = {
      power: { socketId: 'b' },
      connections: [
        { from: 'a', to: 'b', type: 'shaft' }, // a is reached backwards
        { from: 'b', to: 'c', type: 'pin' }, // c forwards
        { from: 'd', to: 'c', type: 'pin' }, // d would need a pin backwards: never
        { from: 'c', to: 'e', type: 'trigger' },
        { from: 'f', to: 'e', type: 'trigger' }, // f likewise
      ],
    };
    expect(powerPath(graph)).toEqual(['b', 'a', 'c', 'e']);
  });

  it('survives loops and a power socket that nothing connects to', () => {
    const loop = {
      power: { socketId: 'a' },
      connections: [
        { from: 'a', to: 'b', type: 'mesh' },
        { from: 'b', to: 'c', type: 'mesh' },
        { from: 'c', to: 'a', type: 'mesh' },
      ],
    };
    expect(powerPath(loop)).toEqual(['a', 'b', 'c']);
    expect(powerPath({ power: { socketId: 'solo' }, connections: [] })).toEqual(['solo']);
  });
});

describe('onSnap', () => {
  it('plays the voice of the material and climbs a rung per placement, holding the top', () => {
    const { audio, feedback, part } = setup();
    const node = part();
    for (let i = 0; i < MAX_SNAP_STEP + 3; i++) feedback.onSnap('pin', node);
    expect(audio.snaps.map((s) => s.step)).toEqual([...Array.from({ length: MAX_SNAP_STEP + 1 }, (_, i) => i), MAX_SNAP_STEP, MAX_SNAP_STEP]);
    feedback.onSnap('screw', node);
    expect(audio.snaps[audio.snaps.length - 1].voice).toBe('screw');
    expect(feedback.stageStep).toBe(MAX_SNAP_STEP);
  });

  it('flares one glint on the part, over about 0.3 s, then draws nothing', () => {
    const { feedback, part, run, parent } = setup();
    const node = part(0.05, 0.02, -0.03);
    expect(feedback.glints.parent).toBe(parent);
    expect(feedback.glints.visible).toBe(false);
    feedback.onSnap('brass', node);
    run(FRAME);
    expect(feedback.liveGlints).toBe(1);
    expect(feedback.glints.visible).toBe(true);
    run(GLINT_S * 0.6);
    expect(feedback.liveGlints).toBe(1);
    run(GLINT_S * 0.6);
    expect(feedback.liveGlints).toBe(0);
    expect(feedback.glints.visible).toBe(false);
  });

  it('puts the glint on the part, in the parent frame, and never brighter than 0.6', () => {
    const { feedback, part, run, parent } = setup();
    parent.position.set(1, 2, 3);
    parent.scale.setScalar(0.5);
    parent.updateMatrixWorld(true);
    const node = part(0.1, 0.2, 0.3);
    feedback.onSnap('brass', node);
    run(GLINT_S * 0.5);
    const m = feedback.glints.instanceMatrix.array as Float32Array;
    // slot 0 holds the glint: its translation is the part, plus a sideways sweep of at most 8 mm.
    expect(Math.abs(m[12] - 0.1)).toBeLessThan(0.01);
    expect(Math.abs(m[13] - 0.2)).toBeLessThan(0.01);
    expect(Math.abs(m[14] - 0.3)).toBeLessThan(0.01);
    const colour = feedback.glints.instanceColor?.array as Float32Array;
    expect(Math.max(colour[0], colour[1], colour[2])).toBeLessThanOrEqual(GLINT_PEAK + 1e-6);
    expect(colour[0]).toBeGreaterThan(colour[2]); // warm
  });

  it('is one draw: a single instanced mesh of 8, however many glints are alive, and it ignores rays', () => {
    const { feedback, part, run } = setup();
    const node = part();
    for (let i = 0; i < 20; i++) feedback.onSnap('washer', node);
    run(FRAME);
    expect(feedback.liveGlints).toBe(GLINT_POOL); // the pool recycles its oldest, it never grows
    expect(feedback.glints.count).toBe(GLINT_POOL);
    const hits: unknown[] = [];
    feedback.glints.raycast({} as never, hits as never);
    expect(hits).toHaveLength(0);
  });

  it('recycles the oldest glint when the pool is full', () => {
    const { feedback, part, run } = setup();
    for (let i = 0; i < GLINT_POOL; i++) {
      feedback.onSnap('pin', part(i * 0.01, 0, 0));
      run(0.02);
    }
    expect(feedback.liveGlints).toBe(GLINT_POOL);
    feedback.onSnap('pin', part(0.5, 0, 0)); // takes the oldest slot, which was the first part's
    run(FRAME);
    const m = feedback.glints.instanceMatrix.array as Float32Array;
    expect(Math.abs(m[12] - 0.5)).toBeLessThan(0.01);
  });
});

describe('settle', () => {
  /** Simulates SocketSnapSystem.lock: the pose is rewritten every frame, then the feedback's offset is added on top. */
  function settleRun(voice: 'brass' | 'screw', travel?: Vector3) {
    const { feedback, part, camera } = setup();
    const node = part(0, 0.1, 0);
    const rest = new Vector3(0, 0.1, 0);
    const restQ = new Quaternion();
    feedback.onSnap(voice, node, travel);
    const offsets: Array<{ t: number; offset: Vector3; angle: number }> = [];
    for (let i = 1; i <= 20; i++) {
      node.position.copy(rest);
      node.quaternion.copy(restQ);
      feedback.update(FRAME, camera);
      offsets.push({ t: i * FRAME, offset: node.position.clone().sub(rest), angle: node.quaternion.angleTo(restQ) });
    }
    return offsets;
  }

  it('overshoots 0.4 mm along the travel after the seat tween, and is exactly at rest again by the end', () => {
    const rows = settleRun('brass');
    const before = rows.filter((r) => r.t < SNAP_TWEEN_S - FRAME);
    for (const r of before) expect(r.offset.length()).toBe(0); // the seat tween is lock()'s own
    const during = rows.filter((r) => r.t > SNAP_TWEEN_S + FRAME && r.t < SNAP_TWEEN_S + SETTLE_S - FRAME);
    expect(during.length).toBeGreaterThan(2);
    for (const r of during) {
      expect(r.offset.y).toBeLessThan(0); // default travel: straight down
      expect(r.offset.length()).toBeLessThanOrEqual(SETTLE_OVERSHOOT_M + 1e-9);
    }
    const peak = Math.max(...rows.map((r) => r.offset.length()));
    expect(peak).toBeGreaterThan(SETTLE_OVERSHOOT_M * 0.85);
    expect(peak).toBeLessThanOrEqual(SETTLE_OVERSHOOT_M + 1e-9);
    for (const r of rows.filter((x) => x.t > SNAP_TWEEN_S + SETTLE_S + FRAME)) expect(r.offset.length()).toBe(0);
  });

  it('follows the travel it is given', () => {
    const rows = settleRun('brass', new Vector3(2, 0, 0)); // not a unit vector: normalised
    const peak = rows.reduce((a, b) => (b.offset.length() > a.offset.length() ? b : a));
    expect(peak.offset.x).toBeGreaterThan(0);
    expect(peak.offset.length()).toBeLessThanOrEqual(SETTLE_OVERSHOOT_M + 1e-9);
    expect(Math.abs(peak.offset.y)).toBeLessThan(1e-12);
  });

  it('turns a screw a quarter turn that unwinds to nothing, and leaves other parts unturned', () => {
    const screw = settleRun('screw');
    expect(screw[0].angle).toBeGreaterThan(SCREW_TURN_RAD * 0.7);
    expect(screw[0].angle).toBeLessThanOrEqual(SCREW_TURN_RAD + 1e-6);
    for (let i = 1; i < 8; i++) expect(screw[i].angle).toBeLessThanOrEqual(screw[i - 1].angle + 1e-9);
    expect(screw[screw.length - 1].angle).toBeLessThan(1e-6);
    for (const r of settleRun('brass')) expect(r.angle).toBe(0);
  });

  it('does not accumulate: with no lock() rewriting the pose, a settled part is not pushed on once the settle is over', () => {
    const { feedback, part, camera } = setup();
    const node = part(0, 0, 0);
    feedback.onSnap('brass', node);
    for (let i = 0; i < 30; i++) feedback.update(FRAME, camera);
    const settled = node.position.clone();
    for (let i = 0; i < 30; i++) feedback.update(FRAME, camera);
    expect(node.position.distanceTo(settled)).toBe(0);
    expect(settled.length()).toBeLessThanOrEqual(SETTLE_OVERSHOOT_M * 40); // at most the 90 ms of nudges, never a runaway
  });
});

describe('onStage', () => {
  it('sounds the chord and the dial tick at once, and restarts the climb', () => {
    const { audio, feedback, part } = setup();
    const node = part();
    feedback.onSnap('pin', node);
    feedback.onSnap('pin', node);
    feedback.onStage(2);
    expect(audio.calls.slice(-2)).toEqual(['chord:2/7', 'dial']);
    expect(feedback.stageStep).toBe(0);
    feedback.onSnap('pin', node);
    expect(audio.snaps[audio.snaps.length - 1].step).toBe(0);
  });

  it('uses the stage count it was built with', () => {
    const { audio, feedback } = setup(5);
    feedback.onStage(4);
    expect(audio.calls).toContain('chord:4/5');
  });

  it('glints the stage parts 60 ms apart, in the order given', () => {
    const { feedback, part, run } = setup();
    feedback.onStage(0, [part(0.05), part(0.1), part(0.15), part(0.2)]);
    const spawns = trackSpawns(feedback, run, 0.5, 0.05);
    expect(spawns.map((s) => s.index)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < spawns.length; i++) expect(spawns[i].at - spawns[i - 1].at).toBeCloseTo(BEAT_GAP_S, 1);
  });

  it('spawns the stage glints on schedule: the first at once, the last after 3 gaps', () => {
    const { feedback, part, run } = setup();
    feedback.onStage(0, [part(), part(), part(), part()]);
    run(FRAME);
    expect(feedback.liveGlints).toBe(1);
    run(BEAT_GAP_S * 3);
    expect(feedback.liveGlints).toBe(4);
  });
});

describe('onFirstRun', () => {
  function powered() {
    const s = setup();
    const path = powerPath(MUSIC_BOX);
    path.forEach((id, i) => s.sockets.set(id, new Vector3(i * 0.05, 0, 0)));
    return { ...s, path };
  }

  it('walks the solver graph, 150 ms a node, one glint each', () => {
    const { feedback, run, path } = powered();
    feedback.onFirstRun(MUSIC_BOX);
    run(FRAME);
    expect(feedback.liveGlints).toBe(1);
    run(POWER_NODE_S * 1.0);
    expect(feedback.liveGlints).toBe(2);
    run(POWER_NODE_S * (path.length - 2) + FRAME);
    // The walk is over after (n-1) * 150 ms; each glint lasts 0.3 s, so at most two overlap.
    expect(feedback.liveGlints).toBeGreaterThanOrEqual(1);
    expect(feedback.liveGlints).toBeLessThanOrEqual(3);
    run(GLINT_S + 0.1);
    expect(feedback.liveGlints).toBe(0);
  });

  it('visits the nodes in path order, 150 ms apart', () => {
    const { feedback, run, path } = powered();
    feedback.onFirstRun(MUSIC_BOX);
    const spawns = trackSpawns(feedback, run, POWER_NODE_S * path.length + GLINT_S, 0.05);
    expect(spawns.map((s) => s.index)).toEqual(path.map((_, i) => i));
    for (let i = 1; i < spawns.length; i++) expect(spawns[i].at - spawns[i - 1].at).toBeCloseTo(POWER_NODE_S, 1);
  });

  it('counts only the first run until reset', () => {
    const { feedback, run } = powered();
    feedback.onFirstRun(MUSIC_BOX);
    run(2);
    expect(feedback.liveGlints).toBe(0);
    feedback.onFirstRun(MUSIC_BOX);
    run(FRAME);
    expect(feedback.liveGlints).toBe(0); // ignored
    feedback.reset();
    feedback.onFirstRun(MUSIC_BOX);
    run(FRAME);
    expect(feedback.liveGlints).toBe(1);
  });

  it('skips a socket with nothing seated in it and carries on', () => {
    const { feedback, run, sockets } = powered();
    sockets.delete('arbor');
    feedback.onFirstRun(MUSIC_BOX);
    let peak = 0;
    run(POWER_NODE_S * 9, () => (peak = Math.max(peak, feedback.liveGlints)));
    expect(peak).toBeGreaterThan(0);
    run(GLINT_S + 0.1);
    expect(feedback.liveGlints).toBe(0);
  });
});

describe('onReveal', () => {
  function withLid(angle: number) {
    const s = setup();
    const pivot = new Object3D();
    s.parent.add(pivot);
    const hinge: RevealHinge = { pivot, rest: new Quaternion().copy(pivot.quaternion), openRad: 1.75, angle };
    s.setLid(hinge);
    return { ...s, hinge, pivot };
  }

  it('shuts the lid with a thump, holds a breath, lifts it with a rise and ends fully open at about 4 s', () => {
    const { audio, feedback, run, hinge, pivot } = withLid(1.75);
    feedback.onReveal();
    const at: Record<string, number> = {};
    let minAngle = 99;
    let t = 0;
    run(REVEAL_S + 0.2, () => {
      t += FRAME;
      minAngle = Math.min(minAngle, hinge.angle);
      for (const name of ['thump', 'rise']) if (audio.calls.includes(name) && at[name] === undefined) at[name] = t;
    });
    expect(at.thump).toBeGreaterThan(REVEAL_CLOSE_S - 0.05);
    expect(at.thump).toBeLessThan(REVEAL_CLOSE_S + 0.05);
    expect(at.rise).toBeGreaterThan(REVEAL_OPEN_AT_S - 0.05);
    expect(at.rise).toBeLessThan(REVEAL_OPEN_AT_S + 0.05);
    expect(audio.calls.filter((c) => c === 'thump')).toHaveLength(1);
    expect(audio.calls.filter((c) => c === 'rise')).toHaveLength(1);
    expect(minAngle).toBe(0);
    expect(hinge.angle).toBe(1.75);
    const spun = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 1.75);
    expect(pivot.quaternion.angleTo(spun)).toBeLessThan(1e-6);
  });

  it('turns the pivot about +Z, by the hinge angle, on top of its rest pose', () => {
    const { feedback, run, hinge, pivot } = withLid(1.75);
    feedback.onReveal();
    run(REVEAL_CLOSE_S * 0.5);
    const expected = new Quaternion().copy(hinge.rest).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), hinge.angle));
    expect(pivot.quaternion.angleTo(expected)).toBeLessThan(1e-6);
    expect(hinge.angle).toBeGreaterThan(0);
    expect(hinge.angle).toBeLessThan(1.75);
  });

  it('runs `then` as the lid starts to lift, once', () => {
    const { feedback, run } = withLid(1.75);
    let calledAt = -1;
    let calls = 0;
    feedback.onReveal(() => {
      calls++;
      calledAt = t;
    });
    let t = 0;
    run(REVEAL_S + 0.5, () => (t += FRAME));
    expect(calls).toBe(1);
    expect(Math.abs(calledAt - REVEAL_OPEN_AT_S)).toBeLessThan(0.05);
  });

  it('ignores a second call while a reveal is running, and runs again once it is over', () => {
    const { audio, feedback, run } = withLid(1.75);
    feedback.onReveal();
    run(0.2);
    feedback.onReveal();
    run(REVEAL_S);
    expect(audio.calls.filter((c) => c === 'thump')).toHaveLength(1);
    feedback.onReveal();
    run(REVEAL_S);
    expect(audio.calls.filter((c) => c === 'thump')).toHaveLength(2);
  });

  it('does not thump a lid that is already shut, but still opens it with the rise', () => {
    const { audio, feedback, run, hinge } = withLid(0);
    feedback.onReveal();
    run(REVEAL_S + 0.2);
    expect(audio.calls).not.toContain('thump');
    expect(audio.calls).toContain('rise');
    expect(hinge.angle).toBe(1.75);
  });

  it('still sounds without a lid, and still calls `then`', () => {
    const { audio, feedback, run } = setup();
    let called = false;
    feedback.onReveal(() => (called = true));
    run(REVEAL_S + 0.2);
    expect(audio.calls).toEqual(['thump', 'rise']);
    expect(called).toBe(true);
  });
});

describe('reset and dispose', () => {
  it('reset drops pending events and live glints and the climb', () => {
    const { audio, feedback, part, run } = setup();
    feedback.onSnap('pin', part());
    feedback.onStage(0, [part(), part(), part()]);
    feedback.reset();
    run(1);
    expect(feedback.liveGlints).toBe(0);
    expect(feedback.stageStep).toBe(0);
    expect(audio.calls.filter((c) => c === 'snap')).toHaveLength(1);
  });

  it('dispose takes the glint mesh out of the scene', () => {
    const { feedback, parent } = setup();
    expect(parent.children).toContain(feedback.glints);
    feedback.dispose();
    expect(parent.children).not.toContain(feedback.glints);
  });

  it('a paused or zero frame changes nothing', () => {
    const { feedback, part, run, camera } = setup();
    feedback.onSnap('pin', part());
    run(0.1);
    const live = feedback.liveGlints;
    for (let i = 0; i < 10; i++) feedback.update(0, camera);
    feedback.update(Number.NaN, camera);
    feedback.update(-1, camera);
    expect(feedback.liveGlints).toBe(live);
  });

  it('works without a camera', () => {
    const { feedback, part } = setup();
    feedback.onSnap('pin', part());
    expect(() => feedback.update(FRAME, null)).not.toThrow();
    expect(feedback.liveGlints).toBe(1);
  });
});
