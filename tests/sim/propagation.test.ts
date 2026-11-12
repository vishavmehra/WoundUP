import { describe, expect, it } from 'vitest';
import type { PartCatalogue } from '../../src/sim';
import { belt, blueprint, errorsOf, gear, input, mesh, plain, pulley, run, shaft, socket, sockets, spring } from './helpers';

describe('shaft propagation (SOLVER §8.1)', () => {
  const bp = blueprint(sockets('spring', 'a', 'b'), [shaft('s1', 'spring', 'a'), shaft('s2', 'a', 'b')]);
  const parts = [spring('spring', 1.25), plain('a'), plain('b')];

  it('transmits angular velocity unchanged, omega_b = omega_a', () => {
    const r = run(input(bp, parts));
    expect(r.status).toBe('runs');
    expect(r.angularVelocity).toEqual({ a: 1.25, b: 1.25, spring: 1.25 });
  });

  it('is symmetric: the direction a connection is written in does not matter', () => {
    const reversed = blueprint(sockets('spring', 'a', 'b'), [shaft('s1', 'a', 'spring'), shaft('s2', 'b', 'a')]);
    expect(run(input(reversed, parts)).angularVelocity).toEqual({ a: 1.25, b: 1.25, spring: 1.25 });
  });
});

describe('gear mesh (SOLVER §8.2)', () => {
  const train = blueprint(sockets('spring', 'g10', 'g20', 'g40'), [
    shaft('a_shaft', 'spring', 'g10'),
    mesh('b_mesh', 'g10', 'g20'),
    mesh('c_mesh', 'g20', 'g40'),
  ]);
  const parts = [spring('spring', 1), gear('g10', 10), gear('g20', 20), gear('g40', 40)];

  it('turns a 20-tooth gear driven by a 10-tooth gear at half the speed, omega_b = -omega_a * Na / Nb', () => {
    const r = run(input(train, parts));
    expect(r.angularVelocity.g10).toBe(1);
    expect(r.angularVelocity.g20).toBe(-0.5);
  });

  it('turns meshed gears in opposite directions, and alternates along a train', () => {
    const r = run(input(train, parts));
    expect(Math.sign(r.angularVelocity.g10)).toBe(1);
    expect(Math.sign(r.angularVelocity.g20)).toBe(-1);
    expect(Math.sign(r.angularVelocity.g40)).toBe(1);
    expect(r.angularVelocity.g40).toBe(0.25);
  });

  it('gives the same speeds whichever way round the mesh is written', () => {
    const flipped = blueprint(sockets('spring', 'g10', 'g20'), [shaft('s', 'spring', 'g10'), mesh('m', 'g20', 'g10')]);
    const r = run(input(flipped, [spring('spring', 1), gear('g10', 10), gear('g20', 20)]));
    expect(r.angularVelocity.g20).toBe(-0.5);
  });

  it('multiplies stages: a compound gear on one shaft', () => {
    // 10 -> 30 (x -1/3), shaft to a 12 -> 24 pair (x -1/2): +1/6 overall
    const compound = blueprint(sockets('spring', 'g10', 'g30', 'g12', 'g24'), [
      shaft('s1', 'spring', 'g10'),
      mesh('m1', 'g10', 'g30'),
      shaft('s2', 'g30', 'g12'),
      mesh('m2', 'g12', 'g24'),
    ]);
    const r = run(input(compound, [spring('spring', 1), gear('g10', 10), gear('g30', 30), gear('g12', 12), gear('g24', 24)]));
    expect(r.angularVelocity.g24).toBeCloseTo(1 / 6, 12);
  });

  it('keeps an installed but undriven part at 0, and a part with no connection does not disturb the rest', () => {
    const r = run(input(blueprint(sockets('spring', 'a', 'idle'), [shaft('s', 'spring', 'a')]), [spring('spring', 2), plain('a'), plain('idle')]));
    expect(r.angularVelocity).toEqual({ a: 2, idle: 0, spring: 2 });
  });

  it('ignores a connection to an empty optional socket: it transmits nothing', () => {
    const bp = blueprint([socket('spring'), socket('a'), socket('x', false), socket('b')], [
      shaft('s1', 'spring', 'a'),
      shaft('s2', 'a', 'x'),
      shaft('s3', 'x', 'b'),
    ]);
    const r = run(input(bp, [spring('spring', 1), plain('a'), plain('b')]));
    expect(r.status).toBe('runs');
    expect(r.angularVelocity).toEqual({ a: 1, b: 0, spring: 1 });
  });
});

describe('gear mesh data sources', () => {
  const bp = blueprint(sockets('spring', 'a', 'b'), [
    shaft('s', 'spring', 'a'),
    mesh('m', 'a', 'b', { fromTeeth: 10, toTeeth: 20, module: 1 }),
  ]);

  it('falls back to the connection parameters when the parts supply no values', () => {
    const r = run(input(bp, [spring('spring', 1), plain('a'), plain('b')]));
    expect(r.angularVelocity.b).toBe(-0.5);
  });

  it('lets what is installed win over what the connection authored: the wrong gear is the point of a repair', () => {
    const r = run(input(bp, [spring('spring', 1), gear('a', 10), gear('b', 12)]));
    expect(r.angularVelocity.b).toBeCloseTo(-10 / 12, 12);
  });

  it('reads the catalogue below the installed parameters and above the connection', () => {
    const catalogue: PartCatalogue = {
      spring: { mechanical: { angularVelocity: 1, energyPerUnit: 1, drainRate: 1 } },
      gear_a: { mechanical: { toothCount: 10, module: 1 } },
      gear_b: { mechanical: { toothCount: 40, module: 1 } },
    };
    const parts = [{ socketId: 'spring', partId: 'spring' }, { socketId: 'a', partId: 'gear_a' }, { socketId: 'b', partId: 'gear_b' }];
    expect(run(input(bp, parts, 8, { partCatalogue: catalogue })).angularVelocity.b).toBe(-0.25);
    const overridden = [parts[0], parts[1], { ...parts[2], parameters: { toothCount: 20 } }];
    expect(run(input(bp, overridden, 8, { partCatalogue: catalogue })).angularVelocity.b).toBe(-0.5);
  });
});

describe('belt (SOLVER §8.3)', () => {
  const bp = blueprint(sockets('spring', 'p1', 'p2', 'p3'), [
    shaft('s', 'spring', 'p1'),
    belt('b1', 'p1', 'p2', { direction: 1 }),
    belt('b2', 'p2', 'p3', { direction: -1 }),
  ]);
  const parts = [spring('spring', 1), pulley('p1', 1), pulley('p2', 2), pulley('p3', 4)];

  it('scales speed by the radius ratio, omega_b = omega_a * ra / rb', () => {
    const r = run(input(bp, parts));
    expect(r.angularVelocity.p2).toBe(0.5);
  });

  it('follows the authored direction: open keeps the sense, crossed reverses it', () => {
    const r = run(input(bp, parts));
    expect(r.angularVelocity.p2).toBeGreaterThan(0);
    expect(r.angularVelocity.p3).toBe(-0.25); // crossed: -(0.5 * 2 / 4)
  });

  it('does not infer the sense from anything else: a belt without a direction is invalid', () => {
    const noDirection = blueprint(sockets('spring', 'p1', 'p2'), [shaft('s', 'spring', 'p1'), belt('b', 'p1', 'p2', { fromRadius: 1, toRadius: 2 })]);
    const errors = errorsOf(input(noDirection, [spring('spring', 1), plain('p1'), plain('p2')]));
    expect(errors).toContainEqual(expect.objectContaining({ code: 'missing_parameter', path: 'connections[1].parameters.direction' }));
  });

  it('gives the same speed whichever way round the belt is written (the reverse ratio is rb / ra)', () => {
    const flipped = blueprint(sockets('spring', 'p1', 'p2'), [shaft('s', 'spring', 'p1'), belt('b', 'p2', 'p1', { direction: -1 })]);
    expect(run(input(flipped, [spring('spring', 1), pulley('p1', 1), pulley('p2', 2)])).angularVelocity.p2).toBe(-0.5);
  });

  it('takes radii from the connection when the parts have none', () => {
    const withRadii = blueprint(sockets('spring', 'p1', 'p2'), [
      shaft('s', 'spring', 'p1'),
      belt('b', 'p1', 'p2', { fromRadius: 3, toRadius: 1, direction: 1 }),
    ]);
    expect(run(input(withRadii, [spring('spring', 1), plain('p1'), plain('p2')])).angularVelocity.p2).toBe(3);
  });
});

describe('governor (SIMULATION_SPEC §10.1; MECHANICAL_ENGINE_V2 §6)', () => {
  // In the competition build the governor is an ordinary rotating part driven through the gear train.
  const bp = blueprint(sockets('spring', 'pinion', 'governor'), [shaft('s', 'spring', 'pinion'), mesh('m', 'pinion', 'governor')]);
  const parts = (omega: number) => [spring('spring', omega), gear('pinion', 10), gear('governor', 5)];

  it('spins at the speed its train sets', () => {
    const r = run(input(bp, parts(0.8)));
    expect(r.angularVelocity.governor).toBeCloseTo(-1.6, 12);
    expect(Math.abs(r.angularVelocity.governor)).toBeGreaterThan(0);
  });

  it('does not regulate: twice the input speed is twice the governor speed', () => {
    const slow = run(input(bp, parts(0.8))).angularVelocity.governor;
    const fast = run(input(bp, parts(1.6))).angularVelocity.governor;
    expect(fast).toBeCloseTo(2 * slow, 12);
  });
});
