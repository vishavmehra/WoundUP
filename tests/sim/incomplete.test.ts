import { describe, expect, it } from 'vitest';
import { blueprint, gear, input, mesh, plain, run, shaft, socket, sockets, spring } from './helpers';

describe('missing required sockets (SOLVER §11)', () => {
  const bp = blueprint([socket('spring'), socket('pinion'), socket('wheel'), socket('flourish', false)], [
    shaft('s', 'spring', 'pinion'),
    mesh('m', 'pinion', 'wheel'),
  ]);
  const complete = [spring(), gear('pinion', 10), gear('wheel', 20)];

  it('returns incomplete and names the missing socket', () => {
    const r = run(input(bp, [spring(), gear('pinion', 10)]));
    expect(r.status).toBe('incomplete');
    expect(r.missingSockets).toEqual(['wheel']);
  });

  it('lists every missing required socket, sorted', () => {
    const r = run(input(bp, [spring()]));
    expect(r.missingSockets).toEqual(['pinion', 'wheel']);
  });

  it('calculates no operating result: a missing part is not a zero-speed component', () => {
    const r = run(input(bp, [spring(), gear('pinion', 10)]));
    expect(r.angularVelocity).toEqual({});
    expect(r.followerPose).toEqual({});
    expect(r.triggered).toEqual({});
    expect(r.runSeconds).toBe(0);
  });

  it('does not wait for an optional socket', () => {
    const r = run(input(bp, complete));
    expect(r.status).toBe('runs');
    expect(r.missingSockets).toBeUndefined();
  });

  it('needs the power source even if its socket is marked optional', () => {
    const optionalSpring = blueprint([socket('spring', false), socket('a')], [shaft('s', 'spring', 'a')]);
    const r = run(input(optionalSpring, [plain('a')]));
    expect(r.status).toBe('incomplete');
    expect(r.missingSockets).toEqual(['spring']);
  });

  it('is incomplete with nothing installed', () => {
    const r = run(input(blueprint(sockets('spring', 'a'), [shaft('s', 'spring', 'a')]), []));
    expect(r.status).toBe('incomplete');
    expect(r.missingSockets).toEqual(['a', 'spring']);
  });
});
