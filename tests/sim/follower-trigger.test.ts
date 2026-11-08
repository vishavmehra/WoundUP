import { describe, expect, it } from 'vitest';
import { sampleFollowerProfile } from '../../src/sim';
import { blueprint, input, pin, plain, run, shaft, sockets, spring, trigger } from './helpers';

const QUARTER = Math.PI / 2;
const PROFILE = [0, 1, 0, -1]; // pose at 0, 90, 180, 270 degrees

describe('sampleFollowerProfile (SOLVER §8.4)', () => {
  it('returns the sample at its own angle', () => {
    expect(sampleFollowerProfile(PROFILE, 0)).toBe(0);
    expect(sampleFollowerProfile(PROFILE, QUARTER)).toBe(1);
    expect(sampleFollowerProfile(PROFILE, 2 * QUARTER)).toBe(0);
    expect(sampleFollowerProfile(PROFILE, 3 * QUARTER)).toBe(-1);
  });

  it('interpolates linearly between samples', () => {
    expect(sampleFollowerProfile(PROFILE, QUARTER / 2)).toBe(0.5);
    expect(sampleFollowerProfile(PROFILE, 1.5 * QUARTER)).toBe(0.5);
  });

  it('is periodic: whole turns, negative angles and the wrap from the last sample back to the first', () => {
    expect(sampleFollowerProfile(PROFILE, 4 * QUARTER + QUARTER / 2)).toBeCloseTo(0.5, 9);
    expect(sampleFollowerProfile(PROFILE, -QUARTER / 2)).toBe(-0.5); // halfway from sample 3 (-1) round to sample 0 (0)
    expect(sampleFollowerProfile(PROFILE, 40 * Math.PI + QUARTER)).toBeCloseTo(1, 9);
  });
});

describe('pin follower (SOLVER §8.4)', () => {
  const bp = blueprint(sockets('spring', 'cam', 'horse'), [shaft('s', 'spring', 'cam'), pin('p', 'cam', 'horse', PROFILE)]);
  const parts = [spring('spring', 1), plain('cam'), plain('horse')];

  it('reports the follower pose for the cam angle supplied', () => {
    expect(run(input(bp, parts, 8, { nodeAngles: { cam: QUARTER } })).followerPose).toEqual({ horse: 1 });
    expect(run(input(bp, parts, 8, { nodeAngles: { cam: QUARTER / 2 } })).followerPose).toEqual({ horse: 0.5 });
  });

  it('defaults the cam angle to 0', () => {
    expect(run(input(bp, parts)).followerPose).toEqual({ horse: 0 });
  });

  it('gives the follower no speed of its own: a pin carries a pose, not a velocity ratio', () => {
    const r = run(input(bp, parts, 8, { nodeAngles: { cam: QUARTER } }));
    expect(r.angularVelocity.horse).toBe(0);
    expect(r.angularVelocity.cam).toBe(1);
  });

  it('has no follower pose when there is no pin', () => {
    const r = run(input(blueprint(sockets('spring', 'a'), [shaft('s', 'spring', 'a')]), [spring(), plain('a')]));
    expect(r.followerPose).toEqual({});
  });

  it('checks a follower pose target with its tolerance', () => {
    const withTarget = blueprint(sockets('spring', 'cam', 'horse'), bp.connections, {
      targets: { followerPose: { horse: 0.5 }, tolerance: { horse: 0.05 } },
    });
    expect(run(input(withTarget, parts, 8, { nodeAngles: { cam: QUARTER / 2 } })).status).toBe('runs');
    const wrong = run(input(withTarget, parts, 8, { nodeAngles: { cam: QUARTER } }));
    expect(wrong.status).toBe('runs_wrong');
    expect(wrong.wrongTargets).toEqual(['horse']);
  });
});

describe('trigger (SOLVER §8.5)', () => {
  const bp = blueprint(sockets('spring', 'cylinder', 'comb', 'bell'), [
    shaft('s', 'spring', 'cylinder'),
    trigger('t1', 'cylinder', 'comb'),
    trigger('t2', 'comb', 'bell'),
  ]);
  const parts = (omega: number) => [spring('spring', omega), plain('cylinder'), plain('comb'), plain('bell')];

  it('activates the target while the source moves, and follows a chain of triggers', () => {
    const r = run(input(bp, parts(0.4)));
    expect(r.triggered).toEqual({ bell: true, comb: true });
  });

  it('does not activate anything while the source stands still', () => {
    const r = run(input(bp, parts(0)));
    expect(r.status).toBe('runs');
    expect(r.triggered).toEqual({ bell: false, comb: false });
  });

  it('introduces no speed ratio: the triggered node stays at 0', () => {
    const r = run(input(bp, parts(0.4)));
    expect(r.angularVelocity.comb).toBe(0);
    expect(r.angularVelocity.bell).toBe(0);
    expect(r.angularVelocity.cylinder).toBe(0.4);
  });

  it('is directed: a trigger does not activate its source', () => {
    const backwards = blueprint(sockets('spring', 'cylinder', 'comb'), [shaft('s', 'spring', 'cylinder'), trigger('t', 'comb', 'cylinder')]);
    const r = run(input(backwards, [spring('spring', 0.4), plain('cylinder'), plain('comb')]));
    expect(r.triggered).toEqual({ cylinder: false });
  });
});
