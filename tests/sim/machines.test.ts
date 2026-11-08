// The three machine targets of PRODUCT_SPEC §6 and SOLVER §15, exercised with SYNTHETIC trains. Part ids and layouts here
// are made up for the test; the real Music Box, Carousel and Windmill blueprints are drafted elsewhere and plug in through
// the same `SolverInput`.

import { describe, expect, it } from 'vitest';
import {
  MACHINE_TARGET_SPECS,
  REFERENCE_DRAIN_RATE,
  REFERENCE_ENERGY_PER_UNIT,
  WORN_ENERGY_PER_UNIT,
} from '../../src/sim';
import type { InstalledPart, PartCatalogue } from '../../src/sim';
import { belt, blueprint, input, mesh, pin, run, shaft, socket, sockets, trigger } from './helpers';

const catalogue: PartCatalogue = {
  synth_spring: { mechanical: { angularVelocity: 0.8, energyPerUnit: REFERENCE_ENERGY_PER_UNIT, drainRate: REFERENCE_DRAIN_RATE } },
  synth_spring_worn: { mechanical: { angularVelocity: 0.8, energyPerUnit: WORN_ENERGY_PER_UNIT, drainRate: REFERENCE_DRAIN_RATE } },
  synth_carousel_spring: { mechanical: { angularVelocity: 1.5, energyPerUnit: REFERENCE_ENERGY_PER_UNIT, drainRate: REFERENCE_DRAIN_RATE } },
  synth_rotor: {},
  synth_pulley_1: { mechanical: { radius: 1 } },
  synth_pulley_3: { mechanical: { radius: 3 } },
  ...Object.fromEntries([5, 10, 12, 20, 24, 36, 40, 48].map((n) => [`synth_gear_${n}`, { mechanical: { toothCount: n, module: 1 } }])),
};
const part = (socketId: string, partId: string, parameters?: Record<string, number>): InstalledPart =>
  parameters === undefined ? { socketId, partId } : { socketId, partId, parameters };

describe('Music Box targets: cylinder 0.4 rad/s +-10 percent (synthetic train)', () => {
  const musicBox = blueprint(sockets('spring', 'pinion', 'wheel', 'cylinder', 'governor', 'comb'), [
    shaft('s1', 'spring', 'pinion'),
    mesh('m1', 'pinion', 'wheel'),
    shaft('s2', 'wheel', 'cylinder'),
    mesh('m2', 'pinion', 'governor'),
    trigger('t1', 'cylinder', 'comb'),
  ], {
    targets: {
      angularVelocity: { cylinder: MACHINE_TARGET_SPECS.musicBoxCylinder.angularVelocity },
      tolerance: { cylinder: MACHINE_TARGET_SPECS.musicBoxCylinder.tolerance },
    },
  });
  const build = (springId = 'synth_spring', wheel = 'synth_gear_20', springSpeed?: number): InstalledPart[] => [
    part('spring', springId, springSpeed === undefined ? undefined : { angularVelocity: springSpeed }),
    part('pinion', 'synth_gear_10'),
    part('wheel', wheel),
    part('cylinder', 'synth_rotor'),
    part('governor', 'synth_gear_5'),
    part('comb', 'synth_rotor'),
  ];
  const solveBox = (parts: InstalledPart[], windUnits = 8) => run(input(musicBox, parts, windUnits, { partCatalogue: catalogue }));

  it('runs when the cylinder turns at 0.4 rad/s', () => {
    const r = solveBox(build());
    expect(r.status).toBe('runs');
    expect(Math.abs(r.angularVelocity.cylinder)).toBeCloseTo(0.4, 12);
    expect(r.wrongTargets).toBeUndefined();
  });

  it('spins the governor and activates the comb while the cylinder turns', () => {
    const r = solveBox(build());
    expect(Math.abs(r.angularVelocity.governor)).toBeCloseTo(1.6, 12);
    expect(r.triggered).toEqual({ comb: true });
  });

  it('accepts speeds on the edges of the band, 0.36 and 0.44, and rejects just outside', () => {
    expect(solveBox(build('synth_spring', 'synth_gear_20', 0.88)).status).toBe('runs'); // 0.44
    expect(solveBox(build('synth_spring', 'synth_gear_20', 0.72)).status).toBe('runs'); // 0.36
    expect(solveBox(build('synth_spring', 'synth_gear_20', 0.9)).status).toBe('runs_wrong'); // 0.45
    expect(solveBox(build('synth_spring', 'synth_gear_20', 0.7)).status).toBe('runs_wrong'); // 0.35
  });

  it('runs wrong, not jammed, with the wrong wheel', () => {
    const r = solveBox(build('synth_spring', 'synth_gear_40')); // 0.2 rad/s
    expect(r.status).toBe('runs_wrong');
    expect(r.wrongTargets).toEqual(['cylinder']);
  });

  it('runs about 10 seconds on a standard spring and about 1.5 seconds on the worn spring, both within the speed target', () => {
    const standard = solveBox(build());
    const worn = solveBox(build('synth_spring_worn'));
    expect(standard.runSeconds).toBeCloseTo(10, 12);
    expect(worn.runSeconds).toBeCloseTo(1.5, 12);
    expect(worn.runSeconds).toBeLessThan(2);
    expect(worn.status).toBe('runs');
    expect(worn.angularVelocity.cylinder).toBe(standard.angularVelocity.cylinder);
  });

  it('cannot run without its cylinder', () => {
    const r = solveBox(build().filter((p) => p.socketId !== 'cylinder'));
    expect(r.status).toBe('incomplete');
    expect(r.missingSockets).toEqual(['cylinder']);
  });
});

describe('Carousel target: platform 0.5 rad/s +-10 percent (synthetic)', () => {
  const targets = {
    angularVelocity: { platform: MACHINE_TARGET_SPECS.carouselPlatform.angularVelocity },
    tolerance: { platform: MACHINE_TARGET_SPECS.carouselPlatform.tolerance },
  };

  it('runs with a gear drive that turns the platform at 0.5 rad/s', () => {
    const bp = blueprint(sockets('spring', 'pinion', 'platform'), [shaft('s', 'spring', 'pinion'), mesh('m', 'pinion', 'platform')], { targets });
    const parts = [part('spring', 'synth_carousel_spring'), part('pinion', 'synth_gear_12'), part('platform', 'synth_gear_36')];
    const r = run(input(bp, parts, 8, { partCatalogue: catalogue }));
    expect(r.status).toBe('runs');
    expect(Math.abs(r.angularVelocity.platform)).toBeCloseTo(0.5, 12);
  });

  it('runs with a belt drive that turns the platform at 0.5 rad/s', () => {
    const bp = blueprint(sockets('spring', 'drive', 'platform'), [shaft('s', 'spring', 'drive'), belt('b', 'drive', 'platform', { direction: 1 })], { targets });
    const parts = [part('spring', 'synth_carousel_spring'), part('drive', 'synth_pulley_1'), part('platform', 'synth_pulley_3')];
    const r = run(input(bp, parts, 8, { partCatalogue: catalogue }));
    expect(r.status).toBe('runs');
    expect(r.angularVelocity.platform).toBeCloseTo(0.5, 12);
  });

  it('runs wrong with a smaller platform gear', () => {
    const bp = blueprint(sockets('spring', 'pinion', 'platform'), [shaft('s', 'spring', 'pinion'), mesh('m', 'pinion', 'platform')], { targets });
    const parts = [part('spring', 'synth_carousel_spring'), part('pinion', 'synth_gear_12'), part('platform', 'synth_gear_24')]; // 0.75
    const r = run(input(bp, parts, 8, { partCatalogue: catalogue }));
    expect(r.status).toBe('runs_wrong');
    expect(r.wrongTargets).toEqual(['platform']);
  });

  it('raises and lowers a horse with the platform angle through a pin follower', () => {
    const bp = blueprint(sockets('spring', 'pinion', 'platform', 'horse'), [
      shaft('s', 'spring', 'pinion'),
      mesh('m', 'pinion', 'platform'),
      pin('p', 'platform', 'horse', [0, 1, 0, -1]),
    ], { targets });
    const parts = [part('spring', 'synth_carousel_spring'), part('pinion', 'synth_gear_12'), part('platform', 'synth_gear_36'), part('horse', 'synth_rotor')];
    const at = (angle: number) => run(input(bp, parts, 8, { partCatalogue: catalogue, nodeAngles: { platform: angle } })).followerPose.horse;
    expect(at(0)).toBeCloseTo(0, 9);
    expect(at(Math.PI / 2)).toBeCloseTo(1, 9);
    expect(at(1.5 * Math.PI)).toBeCloseTo(-1, 9);
  });
});

describe('Windmill target: millstone 0.6 rad/s +-15 percent, ambient wind (synthetic)', () => {
  // Sails at 0.3 rad/s drive a 48-tooth gear that meshes with the gear in the "slot": 24 teeth is correct.
  const windmill = blueprint([socket('sails'), socket('drive'), socket('slot', true, ['synth_gear_12', 'synth_gear_24', 'synth_gear_36']), socket('millstone')], [
    shaft('s1', 'sails', 'drive'),
    mesh('m', 'drive', 'slot'),
    shaft('s2', 'slot', 'millstone'),
  ], {
    power: { source: 'ambient_wind', socketId: 'sails', angularVelocity: 0.3 },
    targets: {
      angularVelocity: { millstone: MACHINE_TARGET_SPECS.windmillMillstone.angularVelocity },
      tolerance: { millstone: MACHINE_TARGET_SPECS.windmillMillstone.tolerance },
    },
  });
  const withSlot = (slotPart: string) =>
    run({
      blueprint: windmill,
      installedParts: [part('sails', 'synth_rotor'), part('drive', 'synth_gear_48'), part('slot', slotPart), part('millstone', 'synth_rotor')],
      power: { source: 'ambient_wind' },
      partCatalogue: catalogue,
    });

  it('runs with the 24-tooth gear: millstone at 0.6 rad/s', () => {
    const r = withSlot('synth_gear_24');
    expect(r.status).toBe('runs');
    expect(Math.abs(r.angularVelocity.millstone)).toBeCloseTo(0.6, 12);
    expect(r.continuous).toBe(true);
  });

  it('runs wrong with a 12-tooth gear where 24 is required: about twice the speed', () => {
    const right = withSlot('synth_gear_24');
    const wrong = withSlot('synth_gear_12');
    expect(wrong.status).toBe('runs_wrong');
    expect(wrong.wrongTargets).toEqual(['millstone']);
    expect(Math.abs(wrong.angularVelocity.millstone) / Math.abs(right.angularVelocity.millstone)).toBeCloseTo(2, 12);
  });

  it('also runs wrong with a 36-tooth decoy: too slow', () => {
    const r = withSlot('synth_gear_36');
    expect(r.status).toBe('runs_wrong');
    expect(Math.abs(r.angularVelocity.millstone)).toBeCloseTo(0.4, 12);
  });

  it('keeps the 15 percent band: 0.69 passes, 0.70 fails', () => {
    const at = (windSpeed: number) =>
      run({
        blueprint: { ...windmill, power: { source: 'ambient_wind', socketId: 'sails', angularVelocity: windSpeed } },
        installedParts: [part('sails', 'synth_rotor'), part('drive', 'synth_gear_48'), part('slot', 'synth_gear_24'), part('millstone', 'synth_rotor')],
        power: { source: 'ambient_wind' },
        partCatalogue: catalogue,
      }).status;
    expect(at(0.345)).toBe('runs'); // 0.69
    expect(at(0.35)).toBe('runs_wrong'); // 0.70
    expect(at(0.255)).toBe('runs'); // 0.51
    expect(at(0.25)).toBe('runs_wrong'); // 0.50
  });
});
