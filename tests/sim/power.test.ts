import { describe, expect, it } from 'vitest';
import {
  CONTINUOUS_RUN_SECONDS,
  MAX_WIND_UNITS,
  REFERENCE_DRAIN_RATE,
  REFERENCE_ENERGY_PER_UNIT,
  WORN_ENERGY_PER_UNIT,
  WORN_SPRING_ENERGY_FRACTION,
  windUnitsFromAngle,
} from '../../src/sim';
import type { PartCatalogue } from '../../src/sim';
import { blueprint, errorsOf, input, plain, run, shaft, sockets, spring } from './helpers';

const QUARTER = Math.PI / 2;
const bp = blueprint(sockets('spring', 'cylinder'), [shaft('s', 'spring', 'cylinder')]);
const withSpring = (energyPerUnit: number, drainRate = REFERENCE_DRAIN_RATE) => [spring('spring', 0.4, energyPerUnit, drainRate), plain('cylinder')];

describe('spring energy and run time (SOLVER §12)', () => {
  it('runs a standard spring wound to the maximum for 10 seconds: T = W * Eu / D', () => {
    const r = run(input(bp, withSpring(REFERENCE_ENERGY_PER_UNIT), 8));
    expect(r.runSeconds).toBeCloseTo(10, 12);
    expect(r.status).toBe('runs');
  });

  it('runs a worn spring at the maximum for about 1.5 seconds, under two (SOLVER §12.1)', () => {
    const r = run(input(bp, withSpring(WORN_ENERGY_PER_UNIT), 8));
    expect(r.runSeconds).toBeCloseTo(1.5, 12);
    expect(r.runSeconds).toBeLessThan(2);
    expect(r.status).toBe('runs');
  });

  it('stores about 15 percent of the energy in a worn spring, so it runs 15 percent as long', () => {
    expect(WORN_SPRING_ENERGY_FRACTION).toBe(0.15);
    const normal = run(input(bp, withSpring(REFERENCE_ENERGY_PER_UNIT), 8)).runSeconds;
    const worn = run(input(bp, withSpring(WORN_ENERGY_PER_UNIT), 8)).runSeconds;
    expect(worn / normal).toBeCloseTo(0.15, 12);
  });

  it('derives the run time from the energy: it moves with wind units, energy per unit and drain', () => {
    const base = run(input(bp, withSpring(0.15), 8)).runSeconds;
    expect(run(input(bp, withSpring(0.15), 4)).runSeconds).toBeCloseTo(base / 2, 12);
    expect(run(input(bp, withSpring(0.3), 8)).runSeconds).toBeCloseTo(base * 2, 12);
    expect(run(input(bp, withSpring(0.15, 1.6), 8)).runSeconds).toBeCloseTo(base / 2, 12);
  });

  it('stores nothing at zero wind units: the machine is valid but runs for no time', () => {
    const r = run(input(bp, withSpring(1), 0));
    expect(r.status).toBe('runs');
    expect(r.runSeconds).toBe(0);
    expect(r.angularVelocity.cylinder).toBe(0.4);
  });

  it('accepts the maximum of eight wind units and refuses more', () => {
    expect(MAX_WIND_UNITS).toBe(8);
    expect(run(input(bp, withSpring(1), 8)).status).toBe('runs');
    expect(errorsOf(input(bp, withSpring(1), 9))).toContainEqual({ code: 'invalid_parameter', path: 'power.windUnits' });
  });

  it('takes spring values from the catalogue and the drain rate from the blueprint when the part has none', () => {
    const catalogue: PartCatalogue = {
      spring_worn: { mechanical: { angularVelocity: 0.4, energyPerUnit: WORN_ENERGY_PER_UNIT } },
      cylinder: {},
    };
    const machine = blueprint(sockets('spring', 'cylinder'), [shaft('s', 'spring', 'cylinder')], {
      power: { source: 'mainspring', socketId: 'spring', drainRate: REFERENCE_DRAIN_RATE },
    });
    const parts = [
      { socketId: 'spring', partId: 'spring_worn' },
      { socketId: 'cylinder', partId: 'cylinder' },
    ];
    expect(run(input(machine, parts, 8, { partCatalogue: catalogue })).runSeconds).toBeCloseTo(1.5, 12);
  });

  it('needs a spring that says how much energy a wind unit holds', () => {
    const noEnergy = [{ socketId: 'spring', partId: 'spring', parameters: { angularVelocity: 1, drainRate: 1 } }, plain('cylinder')];
    expect(errorsOf(input(bp, noEnergy))).toContainEqual({ code: 'missing_parameter', path: 'power.energyPerUnit', id: 'spring' });
  });
});

describe('minimum run time target (SIMULATION_SPEC §7)', () => {
  const needsFiveSeconds = blueprint(sockets('spring', 'cylinder'), [shaft('s', 'spring', 'cylinder')], {
    targets: { minRunSeconds: 5 },
  });

  it('is runs_wrong for a machine that runs for an unexpectedly short time, such as a worn spring', () => {
    const r = run(input(needsFiveSeconds, withSpring(WORN_ENERGY_PER_UNIT), 8));
    expect(r.status).toBe('runs_wrong');
    expect(r.wrongTargets).toEqual(['runSeconds']);
  });

  it('runs once the spring is replaced', () => {
    expect(run(input(needsFiveSeconds, withSpring(REFERENCE_ENERGY_PER_UNIT), 8)).status).toBe('runs');
  });

  it('is not applied when the blueprint sets no run-time target: a worn spring still runs', () => {
    expect(run(input(bp, withSpring(WORN_ENERGY_PER_UNIT), 8)).status).toBe('runs');
  });
});

describe('ambient wind (SOLVER §12.2)', () => {
  const windBp = blueprint(sockets('sails', 'millstone'), [shaft('s', 'sails', 'millstone')], {
    power: { source: 'ambient_wind', socketId: 'sails', angularVelocity: 0.6 },
  });
  const parts = [plain('sails'), plain('millstone')];

  it('drives the machine from the blueprint-defined wind speed, with no wind units needed', () => {
    const r = run({ blueprint: windBp, installedParts: parts, power: { source: 'ambient_wind' } });
    expect(r.status).toBe('runs');
    expect(r.angularVelocity).toEqual({ millstone: 0.6, sails: 0.6 });
  });

  it('never drains: continuous, with a finite run time that survives JSON', () => {
    const r = run({ blueprint: windBp, installedParts: parts, power: { source: 'ambient_wind' } });
    expect(r.continuous).toBe(true);
    expect(r.runSeconds).toBe(CONTINUOUS_RUN_SECONDS);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('is not continuous when it cannot run', () => {
    const r = run({ blueprint: windBp, installedParts: [plain('sails')], power: { source: 'ambient_wind' } });
    expect(r.status).toBe('incomplete');
    expect(r.continuous).toBe(false);
  });
});

describe('windUnitsFromAngle (INTERACTION_SPEC §10)', () => {
  it('earns one unit per 90 degrees of rotation', () => {
    expect(windUnitsFromAngle(0)).toBe(0);
    expect(windUnitsFromAngle(QUARTER)).toBe(1);
    expect(windUnitsFromAngle(3 * QUARTER)).toBe(3);
    expect(windUnitsFromAngle(7 * QUARTER)).toBe(7);
  });

  it('counts only whole quarter turns', () => {
    expect(windUnitsFromAngle(QUARTER * 0.99)).toBe(0);
    expect(windUnitsFromAngle(QUARTER * 2.99)).toBe(2);
  });

  it('stops at the maximum of eight units', () => {
    expect(windUnitsFromAngle(8 * QUARTER)).toBe(8);
    expect(windUnitsFromAngle(100 * Math.PI)).toBe(8);
  });

  it('earns nothing for a negative or invalid rotation', () => {
    expect(windUnitsFromAngle(-5)).toBe(0);
    expect(windUnitsFromAngle(Number.NaN)).toBe(0);
  });
});
