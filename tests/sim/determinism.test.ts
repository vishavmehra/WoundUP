import { describe, expect, it } from 'vitest';
import { solve } from '../../src/sim';
import type { SolverInput } from '../../src/sim';
import { belt, blueprint, gear, input, mesh, pin, plain, pulley, run, shaft, sockets, spring, trigger } from './helpers';

// A machine that exercises every connection type at once.
const machine = (): SolverInput => {
  const bp = blueprint(sockets('spring', 'pinion', 'wheel', 'cylinder', 'governor', 'comb', 'drive', 'driven', 'horse'), [
    shaft('s1', 'spring', 'pinion'),
    mesh('m1', 'pinion', 'wheel'),
    shaft('s2', 'wheel', 'cylinder'),
    mesh('m2', 'pinion', 'governor'),
    trigger('t1', 'cylinder', 'comb'),
    shaft('s3', 'spring', 'drive'),
    belt('b1', 'drive', 'driven', { direction: -1 }),
    pin('p1', 'cylinder', 'horse', [0, 0.5, 1, 0.5]),
  ], { targets: { angularVelocity: { cylinder: 0.4 }, tolerance: { cylinder: 0.1 } } });
  return input(
    bp,
    [
      spring('spring', 0.8, 1, 0.8),
      gear('pinion', 10),
      gear('wheel', 20),
      plain('cylinder'),
      gear('governor', 5),
      plain('comb'),
      pulley('drive', 1),
      pulley('driven', 3),
      plain('horse'),
    ],
    8,
    { nodeAngles: { cylinder: 1.234 } },
  );
};

const reversed = (i: SolverInput): SolverInput => ({
  ...i,
  blueprint: {
    ...i.blueprint,
    sockets: [...i.blueprint.sockets].reverse(),
    connections: [...i.blueprint.connections].reverse(),
  },
  installedParts: [...i.installedParts].reverse(),
});

const json = (i: SolverInput) => JSON.stringify(run(i));

describe('determinism (SOLVER §2, §17)', () => {
  it('gives the same result for the same input, every time', () => {
    const first = json(machine());
    for (let n = 0; n < 50; n++) expect(json(machine())).toBe(first);
  });

  it('is not affected by earlier solves: it keeps no state', () => {
    const before = json(machine());
    run(input(blueprint(sockets('spring', 'a'), [shaft('s', 'spring', 'a')]), [spring('spring', 9), plain('a')]));
    expect(json(machine())).toBe(before);
  });

  it('gives a byte-identical result whatever order the input arrays are in', () => {
    expect(json(reversed(machine()))).toBe(json(machine()));
  });

  it('reports a jam at the same place whatever the order of the input arrays', () => {
    const ring = blueprint(sockets('spring', 'a', 'b', 'c'), [shaft('s', 'spring', 'a'), mesh('m1', 'a', 'b'), mesh('m2', 'b', 'c'), mesh('m3', 'c', 'a')]);
    const ringInput = input(ring, [spring(), gear('a', 12), gear('b', 12), gear('c', 12)]);
    expect(run(reversed(ringInput))).toEqual(run(ringInput));
  });

  it('does not modify its input', () => {
    const frozen = deepFreeze(machine());
    expect(() => solve(frozen)).not.toThrow(); // writing to a frozen object throws in strict mode
    expect(solve(frozen).ok).toBe(true);
  });

  it('returns plain, serialisable data', () => {
    const r = run(machine());
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('emits output keys in sorted order and never -0', () => {
    const r = run(machine());
    const keys = Object.keys(r.angularVelocity);
    expect(keys).toEqual([...keys].sort());
    for (const v of Object.values(r.angularVelocity)) expect(Object.is(v, -0)).toBe(false);
  });

  it('returns the same result for the machine as a whole', () => {
    const r = run(machine());
    expect(r.status).toBe('runs');
    expect(r.angularVelocity.cylinder).toBeCloseTo(-0.4, 12);
    expect(r.angularVelocity.driven).toBeCloseTo(-0.8 / 3, 12);
    expect(r.triggered).toEqual({ comb: true });
    expect(r.runSeconds).toBeCloseTo(10, 12);
  });
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
