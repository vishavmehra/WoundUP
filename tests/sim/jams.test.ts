import { describe, expect, it } from 'vitest';
import { belt, blueprint, gear, input, mesh, plain, pulley, run, shaft, socket, sockets, spring } from './helpers';

describe('inconsistent loop detection (SOLVER §10)', () => {
  it('jams on a ring of three meshed gears: an odd ring cannot turn', () => {
    const bp = blueprint(sockets('spring', 'a', 'b', 'c'), [
      shaft('s', 'spring', 'a'),
      mesh('m1', 'a', 'b'),
      mesh('m2', 'b', 'c'),
      mesh('m3', 'c', 'a'),
    ]);
    const r = run(input(bp, [spring(), gear('a', 12), gear('b', 12), gear('c', 12)]));
    expect(r.status).toBe('jams');
    expect(r.jamReason).toBe('velocity_contradiction');
    expect(r.jamAt).toBe('c'); // the node reached a second time with a contradicting speed, in canonical traversal order
  });

  it('runs a ring of four meshed gears: an even ring is consistent', () => {
    const bp = blueprint(sockets('spring', 'a', 'b', 'c', 'd'), [
      shaft('s', 'spring', 'a'),
      mesh('m1', 'a', 'b'),
      mesh('m2', 'b', 'c'),
      mesh('m3', 'c', 'd'),
      mesh('m4', 'd', 'a'),
    ]);
    const r = run(input(bp, [spring(), gear('a', 7), gear('b', 13), gear('c', 11), gear('d', 17)]));
    expect(r.status).toBe('runs');
    expect(r.angularVelocity.a).toBe(1);
  });

  it('does not let floating-point noise create a false jam', () => {
    // Odd teeth counts around an even ring: the speed returns to 1 only to within rounding error.
    const bp = blueprint(sockets('spring', 'a', 'b', 'c', 'd'), [
      shaft('s', 'spring', 'a'),
      mesh('m1', 'a', 'b'),
      mesh('m2', 'b', 'c'),
      mesh('m3', 'c', 'd'),
      mesh('m4', 'd', 'a'),
    ]);
    const r = run(input(bp, [spring(), gear('a', 97), gear('b', 31), gear('c', 53), gear('d', 89)]));
    expect(r.status).toBe('runs');
  });

  it('runs two parallel belts that agree', () => {
    const bp = blueprint(sockets('spring', 'a', 'b'), [
      shaft('s', 'spring', 'a'),
      belt('b1', 'a', 'b', { direction: 1 }),
      belt('b2', 'a', 'b', { direction: 1 }),
    ]);
    expect(run(input(bp, [spring(), pulley('a', 2), pulley('b', 4)])).status).toBe('runs');
  });

  describe('the 1 percent threshold', () => {
    // Two belts from a to b. The first gives b = 1 * 100 / 100 = 1.
    const twoBelts = (secondRadius: number) => {
      const bp = blueprint(sockets('spring', 'a', 'b', 'c'), [
        shaft('s', 'spring', 'a'),
        belt('b1', 'a', 'b', { direction: 1, fromRadius: 100, toRadius: 100 }),
        belt('b2', 'a', 'b', { direction: 1, fromRadius: 100, toRadius: secondRadius }),
      ]);
      return run(input(bp, [spring(), plain('a'), plain('b'), plain('c')]));
    };

    it('accepts paths that differ by 0.5 percent', () => {
      expect(twoBelts(99.5).status).toBe('runs');
    });

    it('jams on paths that differ by 2 percent, at the node they disagree on', () => {
      const r = twoBelts(98);
      expect(r.status).toBe('jams');
      expect(r.jamReason).toBe('velocity_contradiction');
      expect(r.jamAt).toBe('b');
    });
  });

  it('does not let a zero-speed loop look like a contradiction', () => {
    const bp = blueprint(sockets('spring', 'a', 'b', 'c'), [
      shaft('s', 'spring', 'a'),
      mesh('m1', 'a', 'b'),
      mesh('m2', 'b', 'c'),
      mesh('m3', 'c', 'a'),
    ]);
    // Odd ring, but nothing is turning, so there is nothing to contradict.
    expect(run(input(bp, [spring('spring', 0), gear('a', 12), gear('b', 12), gear('c', 12)])).status).toBe('runs');
  });

  it('returns the jam with no operating values and no run time', () => {
    const bp = blueprint(sockets('spring', 'a', 'b', 'c'), [
      shaft('s', 'spring', 'a'),
      mesh('m1', 'a', 'b'),
      mesh('m2', 'b', 'c'),
      mesh('m3', 'c', 'a'),
    ]);
    const r = run(input(bp, [spring(), gear('a', 12), gear('b', 12), gear('c', 12)]));
    expect(r.angularVelocity).toEqual({});
    expect(r.followerPose).toEqual({});
    expect(r.runSeconds).toBe(0);
    expect(r.continuous).toBe(false);
  });
});

describe('gear module mismatch (SOLVER §8.2)', () => {
  const bp = blueprint(sockets('spring', 'a', 'b'), [shaft('s', 'spring', 'a'), mesh('mesh_ab', 'a', 'b')]);

  it('jams a mesh of unequal modules, at the connection', () => {
    const r = run(input(bp, [spring(), gear('a', 10, 1), gear('b', 20, 1.5)]));
    expect(r.status).toBe('jams');
    expect(r.jamReason).toBe('module_mismatch');
    expect(r.jamAt).toBe('mesh_ab');
    expect(r.angularVelocity).toEqual({});
    expect(r.runSeconds).toBe(0);
  });

  it('meshes equal modules', () => {
    expect(run(input(bp, [spring(), gear('a', 10, 1.5), gear('b', 20, 1.5)])).status).toBe('runs');
  });

  it('checks the module of a mesh even when nothing drives it', () => {
    const unpowered = blueprint(sockets('spring', 'a', 'x', 'y'), [shaft('s', 'spring', 'a'), mesh('m', 'x', 'y')]);
    const r = run(input(unpowered, [spring(), plain('a'), gear('x', 10, 1), gear('y', 10, 2)]));
    expect(r.status).toBe('jams');
    expect(r.jamAt).toBe('m');
  });

  it('needs the module of both gears: a missing module is invalid input, not a pass', () => {
    const out = [spring(), gear('a', 10), { socketId: 'b', partId: 'gear_20', parameters: { toothCount: 20 } }];
    const result = input(bp, out);
    expect(() => run(result)).toThrow(/missing_parameter/);
  });
});

describe('priority of outcomes (SOLVER §14)', () => {
  const targets = { angularVelocity: { b: 5 }, tolerance: { b: 0.1 } };

  it('reports a jam ahead of a missed target', () => {
    const bp = blueprint(sockets('spring', 'a', 'b'), [shaft('s', 'spring', 'a'), mesh('m', 'a', 'b')], { targets });
    const r = run(input(bp, [spring(), gear('a', 10, 1), gear('b', 20, 2)]));
    expect(r.status).toBe('jams');
    expect(r.wrongTargets).toBeUndefined();
  });

  it('reports an incomplete machine ahead of a jam', () => {
    const bp = blueprint([socket('spring'), socket('a'), socket('b'), socket('missing')], [shaft('s', 'spring', 'a'), mesh('m', 'a', 'b')]);
    const r = run(input(bp, [spring(), gear('a', 10, 1), gear('b', 20, 2)]));
    expect(r.status).toBe('incomplete');
    expect(r.jamAt).toBeUndefined();
  });

  it('reports a missed target, not a jam, for a connected machine that runs wrong', () => {
    const bp = blueprint(sockets('spring', 'a', 'b'), [shaft('s', 'spring', 'a'), mesh('m', 'a', 'b')], { targets });
    const r = run(input(bp, [spring(), gear('a', 10), gear('b', 20)]));
    expect(r.status).toBe('runs_wrong');
    expect(r.wrongTargets).toEqual(['b']);
  });
});
