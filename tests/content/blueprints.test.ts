import { describe, expect, it } from 'vitest';
import {
  BLUEPRINTS,
  CAROUSEL,
  GEAR_SPACING_EXTRA_M,
  getBlueprint,
  giftCatalogue,
  HORSE_TRAVEL_M,
  MUSIC_BOX,
  MUSIC_BOX_MIN_RUN_SECONDS,
  repairStart,
  socketIdOfNode,
  solveAssembly,
  validateMachineBlueprint,
  verifyGift,
  WINDMILL,
  WINDMILL_WIND_RAD_S,
} from '../../src/content/blueprints';
import type { Assembly, MachineBlueprint } from '../../src/content/blueprints';
import { MAX_WIND_UNITS, MACHINE_TARGET_SPECS } from '../../src/sim';
import type { SolveResult } from '../../src/sim';
import { ENGRAVING_IDS, MACHINE_IDS, REPAIRS } from '../../src/game/content';

const run = (bp: MachineBlueprint, assembly: Assembly, windUnits?: number, angles?: Record<string, number>): SolveResult => {
  const outcome = solveAssembly(bp, assembly, windUnits, angles);
  if (!outcome.ok) throw new Error(`invalid input: ${JSON.stringify(outcome.errors)}`);
  return outcome.result;
};
const swapped = (bp: MachineBlueprint, socketId: string, partId: string): Assembly => ({ ...bp.intended, [socketId]: partId });
const speed = (r: SolveResult, id: string): number => Math.abs(r.angularVelocity[id]);
const GEARS = [10, 12, 16, 20, 24].map((n) => `gear_spur_${n}_m1_brass`);

describe('blueprint data', () => {
  it.each(BLUEPRINTS.map((b) => [b.id, b] as const))('%s passes validation', (_id, bp) => {
    expect(validateMachineBlueprint(bp)).toEqual([]);
  });

  it('uses the machine ids of the game core, once each', () => {
    expect(BLUEPRINTS.map((b) => b.id)).toEqual(['music_box', 'carousel', 'windmill']);
    for (const b of BLUEPRINTS) expect(MACHINE_IDS).toContain(b.id);
    expect(getBlueprint('music_box')).toBe(MUSIC_BOX);
    expect(getBlueprint('constructor')).toBeUndefined();
    expect(getBlueprint('clock_tower')).toBeUndefined();
  });

  it('gives the Music Box its 12 required sockets, ids unique, every one mapped to a GLB empty', () => {
    expect(MUSIC_BOX.sockets).toHaveLength(12);
    expect(MUSIC_BOX.sockets.every((s) => s.required)).toBe(true);
    expect(new Set(MUSIC_BOX.sockets.map((s) => s.node)).size).toBe(12);
    expect(socketIdOfNode(MUSIC_BOX, 'GearA')).toBe('spring_pinion');
    expect(socketIdOfNode(MUSIC_BOX, 'BaseHandle')).toBeUndefined();
  });

  it('has a tray that supplies the Music Box exactly: 12 pieces, no decoys (Letter 1)', () => {
    expect(MUSIC_BOX.tray.reduce((n, t) => n + t.quantity, 0)).toBe(12);
    expect(MUSIC_BOX.tray.some((t) => t.decoy)).toBe(false);
    expect(MUSIC_BOX.tray.find((t) => t.partId === 'bracket_support_brass')?.quantity).toBe(2);
  });

  it('has two decoy gears in the Carousel (Letter 3) and Windmill (Letter 4) trays, never the intended gear', () => {
    for (const bp of [CAROUSEL, WINDMILL]) {
      const decoys = bp.tray.filter((t) => t.decoy);
      expect(decoys).toHaveLength(2);
      expect(decoys.every((t) => t.partId.startsWith('gear_spur_') && t.quantity === 1)).toBe(true);
    }
  });

  it('reports every kind of defect a broken blueprint can have', () => {
    const [firstSocket, ...restSockets] = MUSIC_BOX.sockets;
    const broken: MachineBlueprint = {
      ...MUSIC_BOX,
      id: 'Music Box',
      sockets: [{ ...firstSocket, acceptedPartIds: ['nonsense'], dependencies: ['arbor', 'nowhere'] }, ...restSockets],
      intended: { ...MUSIC_BOX.intended, arbor: 'gear_spur_10_m1_brass', ghost: 'spring_worn_brass' },
      tray: [{ partId: 'spring_standard_brass', quantity: 0 }],
      housing: { ...MUSIC_BOX.housing, assetId: 'missing_model' },
    };
    const text = validateMachineBlueprint(broken).join('\n');
    expect(text).toContain('not lowercase snake_case');
    expect(text).toContain('accepts unknown part "nonsense"');
    expect(text).toContain('depends on unknown socket "nowhere"');
    expect(text).toContain('is not accepted by socket "arbor"');
    expect(text).toContain('fills unknown socket "ghost"');
    expect(text).toContain('quantity of "spring_standard_brass" must be a positive integer');
    expect(text).toContain('tray supplies');
    expect(text).toContain('has no model path');
  });

  it('finds a dependency cycle', () => {
    const cyclic: MachineBlueprint = {
      ...MUSIC_BOX,
      sockets: MUSIC_BOX.sockets.map((s) => (s.id === 'main_spring' ? { ...s, dependencies: ['winding_key'] } : s)),
    };
    expect(validateMachineBlueprint(cyclic).join('\n')).toContain('form a cycle');
  });
});

describe('Music Box', () => {
  it('runs at the cylinder target, 0.4 rad/s +-10 percent, when built as intended', () => {
    const r = run(MUSIC_BOX, MUSIC_BOX.intended);
    expect(r.status).toBe('runs');
    expect(speed(r, 'cylinder')).toBeCloseTo(MACHINE_TARGET_SPECS.musicBoxCylinder.angularVelocity, 12);
    // MUSIC_BOX_BLUEPRINT §3.3
    expect(r.angularVelocity.main_spring).toBeCloseTo(0.8, 12);
    expect(r.angularVelocity.spring_pinion).toBeCloseTo(0.8, 12);
    expect(r.angularVelocity.cylinder_wheel).toBeCloseTo(-0.4, 12);
    expect(r.angularVelocity.arbor).toBeCloseTo(-0.4, 12);
    expect(r.angularVelocity.governor_wheel).toBeCloseTo(-0.4, 12);
    expect(r.angularVelocity.governor_pinion).toBeCloseTo(0.5333333333, 9);
    expect(r.angularVelocity.governor).toBeCloseTo(0.5333333333, 9);
    expect(r.angularVelocity.comb).toBe(0); // installed, not driven
    expect(r.continuous).toBe(false);
  });

  it('plays one whole cylinder turn, 15.708 s, on eight wind units, and proportionally less on fewer', () => {
    expect(run(MUSIC_BOX, MUSIC_BOX.intended, MAX_WIND_UNITS).runSeconds).toBeCloseTo((2 * Math.PI) / 0.4, 9);
    expect(run(MUSIC_BOX, MUSIC_BOX.intended, 4).runSeconds).toBeCloseTo(7.854, 3);
    expect(run(MUSIC_BOX, MUSIC_BOX.intended, 0).runSeconds).toBe(0);
  });

  it('still runs when wound a little: the run-time target uses full-wind capacity, not the player wind', () => {
    const r = run(MUSIC_BOX, MUSIC_BOX.intended, 1);
    expect(r.status).toBe('runs');
    expect(r.runSeconds).toBeCloseTo(1.9635, 3);
  });

  it('Letter 2: the worn spring stops after about 1.5 s and the machine runs wrong', () => {
    const start = repairStart(REPAIRS.worn_spring);
    expect(start?.faultySocket).toBe('main_spring');
    const r = run(MUSIC_BOX, start!.assembly, MAX_WIND_UNITS);
    expect(r.runSeconds).toBeCloseTo(1.5, 9);
    expect(r.status).toBe('runs_wrong');
    expect(r.wrongTargets).toEqual(['runSeconds']);
    expect(speed(r, 'cylinder')).toBeCloseTo(0.4, 12); // the gears are right: only the energy is wrong
    // Fixed: the standard spring in the same assembly is the intended build.
    expect(run(MUSIC_BOX, swapped(MUSIC_BOX, 'main_spring', REPAIRS.worn_spring.correctPartId)).status).toBe('runs');
  });

  it('worn spring: 15 percent of the energy per unit and a faster drain', () => {
    const worn = run(MUSIC_BOX, swapped(MUSIC_BOX, 'main_spring', 'spring_worn_brass'), 4);
    const standard = run(MUSIC_BOX, MUSIC_BOX.intended, 4);
    expect(worn.runSeconds).toBeCloseTo(0.75, 9);
    expect(worn.runSeconds / standard.runSeconds).toBeCloseTo(0.0955, 3); // 0.15 of the energy, drained pi/2 times faster
  });

  it('only two of the 24 ways to place the four gears run: the intended one and the governor pair swapped', () => {
    const sockets = ['spring_pinion', 'cylinder_wheel', 'governor_wheel', 'governor_pinion'] as const;
    const permutations = (items: readonly string[]): string[][] =>
      items.length <= 1 ? [[...items]] : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
    const four = ['gear_spur_10_m1_brass', 'gear_spur_20_m1_brass', 'gear_spur_16_m1_brass', 'gear_spur_12_m1_brass'];
    let running = 0;
    const all = permutations(four);
    expect(all).toHaveLength(24);
    for (const p of all) {
      const assembly: Assembly = { ...MUSIC_BOX.intended, ...Object.fromEntries(sockets.map((s, i) => [s, p[i]])) };
      if (run(MUSIC_BOX, assembly).status === 'runs') running++;
    }
    expect(running).toBe(2);
  });

  it('runs wrong, never jams, with a wrong gear in the stage-1 sockets', () => {
    for (const gear of GEARS.filter((g) => g !== 'gear_spur_10_m1_brass')) {
      const r = run(MUSIC_BOX, swapped(MUSIC_BOX, 'spring_pinion', gear));
      expect(r.status).toBe('runs_wrong');
      expect(r.wrongTargets).toEqual(['cylinder']);
    }
  });

  it('is incomplete with any socket empty, naming it, and with an empty power socket', () => {
    for (const s of MUSIC_BOX.sockets) {
      const { [s.id]: _removed, ...rest } = MUSIC_BOX.intended;
      const r = run(MUSIC_BOX, rest);
      expect(r.status).toBe('incomplete');
      expect(r.missingSockets).toEqual([s.id]);
    }
  });

  it('does not accept a part the socket does not list', () => {
    const outcome = solveAssembly(MUSIC_BOX, swapped(MUSIC_BOX, 'comb', 'gear_spur_10_m1_brass'));
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.errors.map((e) => e.code)).toContain('part_not_accepted');
  });

  it('has the run-time target of MUSIC_BOX_BLUEPRINT §4.4', () => {
    expect(MUSIC_BOX.targets.minRunSeconds).toBe(MUSIC_BOX_MIN_RUN_SECONDS);
    expect(MUSIC_BOX_MIN_RUN_SECONDS).toBeCloseTo((2 * Math.PI) / 0.4 / 2, 3);
  });

  it('adds 1.0 mm to the centre distance of both gear pairs and keeps the arbor and its gears where they were', () => {
    const at = (id: string) => MUSIC_BOX.sockets.find((s) => s.id === id)!.position!;
    const distance = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    // MUSIC_BOX_BLUEPRINT §7.1 as written (before the Gate F spacing).
    const docStage1 = distance([0.0394, 0.0532, 0.0223], [0.0394, 0.035, -0.0105]);
    const docStage2 = distance([-0.0504, 0.0514, 0.0204], [-0.0504, 0.035, -0.0105]);
    expect(distance(at('spring_pinion'), at('cylinder_wheel'))).toBeCloseTo(docStage1 + GEAR_SPACING_EXTRA_M, 6);
    expect(distance(at('governor_pinion'), at('governor_wheel'))).toBeCloseTo(docStage2 + GEAR_SPACING_EXTRA_M, 6);
    expect(GEAR_SPACING_EXTRA_M).toBe(0.001);
    expect(at('cylinder_wheel')).toEqual([0.0394, 0.035, -0.0105]);
    expect(at('arbor')).toEqual([-0.0055, 0.035, -0.0105]);
    // The spring axis moves as one: spring, pinion and key keep their offsets to each other.
    expect(at('main_spring')[1] - at('spring_pinion')[1]).toBeCloseTo(0, 9);
    expect(at('winding_key')[2] - at('spring_pinion')[2]).toBeCloseTo(0, 9);
    // The lid still closes: the 12T pinion tip (34.3 mm across at module 2.5 mm, MUSIC_BOX_BLUEPRINT §6.2) stays under the 7.0 cm ceiling.
    expect(at('governor_pinion')[1] + 0.0343 / 2).toBeLessThan(0.07);
  });
});

describe('Carousel', () => {
  it('runs at the platform target, 0.5 rad/s +-10 percent, when built as intended', () => {
    const r = run(CAROUSEL, CAROUSEL.intended);
    expect(r.status).toBe('runs');
    expect(speed(r, 'platform')).toBeCloseTo(MACHINE_TARGET_SPECS.carouselPlatform.angularVelocity, 12);
    expect(speed(r, 'central_shaft')).toBeCloseTo(0.5, 12);
    expect(speed(r, 'spring')).toBeCloseTo(0.8, 12);
    expect(speed(r, 'key')).toBeCloseTo(0.8, 12); // the winding path stays geared to the arbor (MACHINE_SLOT_MAPPINGS §3.5)
    expect(r.runSeconds).toBeCloseTo((2 * Math.PI) / 0.4, 9);
  });

  it('runs wrong with any other gear in the 16T position or the 10T position', () => {
    for (const gear of GEARS) {
      if (gear !== 'gear_spur_16_m1_brass') expect(run(CAROUSEL, swapped(CAROUSEL, 'drive_gear', gear)).status).toBe('runs_wrong');
      if (gear !== 'gear_spur_10_m1_brass') expect(run(CAROUSEL, swapped(CAROUSEL, 'drive_pinion', gear)).status).toBe('runs_wrong');
    }
    // The decoys of Letter 3 in the 16T position: 0.667 and 0.400 rad/s.
    expect(speed(run(CAROUSEL, swapped(CAROUSEL, 'drive_gear', 'gear_spur_12_m1_brass')), 'platform')).toBeCloseTo(0.6667, 4);
    expect(speed(run(CAROUSEL, swapped(CAROUSEL, 'drive_gear', 'gear_spur_20_m1_brass')), 'platform')).toBeCloseTo(0.4, 12);
  });

  it('lifts each horse once per platform turn, 120 degrees apart, within +-0.6 cm', () => {
    const pose = (angle: number): Record<string, number> => run(CAROUSEL, CAROUSEL.intended, MAX_WIND_UNITS, { platform: angle }).followerPose;
    const turn = 2 * Math.PI;
    let peak = 0;
    for (let k = 0; k < 12; k++) {
      const p = pose((turn * k) / 12);
      expect(Object.keys(p).sort()).toEqual(['horse_0', 'horse_1', 'horse_2']);
      for (const v of Object.values(p)) peak = Math.max(peak, Math.abs(v));
      // horse 1 is horse 0 a third of a turn (4 samples) later
      expect(p.horse_1).toBeCloseTo(pose((turn * (k - 4)) / 12).horse_0, 12);
      expect(p.horse_2).toBeCloseTo(pose((turn * (k - 8)) / 12).horse_0, 12);
    }
    expect(peak).toBeCloseTo(HORSE_TRAVEL_M, 9);
    expect(pose(0).horse_0).toBeCloseTo(0, 12);
    expect(pose(turn).horse_0).toBeCloseTo(pose(0).horse_0, 12); // periodic
  });

  it('is incomplete with a lamp missing', () => {
    const { lamp_3: _lamp, ...rest } = CAROUSEL.intended;
    expect(run(CAROUSEL, rest).missingSockets).toEqual(['lamp_3']);
  });
});

describe('Windmill', () => {
  it('runs at the millstone target, 0.6 rad/s +-15 percent, on ambient wind that never drains', () => {
    const r = run(WINDMILL, WINDMILL.intended);
    expect(r.status).toBe('runs');
    expect(speed(r, 'millstone')).toBeCloseTo(MACHINE_TARGET_SPECS.windmillMillstone.angularVelocity, 12);
    expect(speed(r, 'rotor')).toBeCloseTo(WINDMILL_WIND_RAD_S, 12);
    expect(speed(r, 'main_shaft')).toBeCloseTo(WINDMILL_WIND_RAD_S, 12);
    expect(r.continuous).toBe(true);
    expect(JSON.parse(JSON.stringify(r)).status).toBe('runs'); // serialisable (SOLVER §6)
  });

  it('is not affected by wind units: there is no spring and no key', () => {
    expect(run(WINDMILL, WINDMILL.intended, 0).status).toBe('runs');
    expect(WINDMILL.sockets.some((s) => s.family === 'spring' || s.family === 'winding_key')).toBe(false);
  });

  it('Letter 5: a 12-tooth gear in the 24-tooth position turns the millstone twice as fast and runs wrong', () => {
    const start = repairStart(REPAIRS.wrong_gear);
    expect(start?.faultySocket).toBe('gear_24');
    const r = run(WINDMILL, start!.assembly);
    expect(r.status).toBe('runs_wrong');
    expect(r.wrongTargets).toEqual(['millstone']);
    expect(speed(r, 'millstone')).toBeCloseTo(2 * 0.6, 12);
    expect(speed(r, 'millstone') / 0.6).toBeCloseTo(REPAIRS.wrong_gear.symptom.kind === 'speed_ratio' ? REPAIRS.wrong_gear.symptom.ratio : NaN, 12);
    expect(run(WINDMILL, swapped(WINDMILL, 'gear_24', REPAIRS.wrong_gear.correctPartId)).status).toBe('runs');
  });

  it('no other single gear swap lands inside the target band', () => {
    for (const gear of GEARS) {
      expect(run(WINDMILL, swapped(WINDMILL, 'gear_24', gear)).status === 'runs').toBe(gear === 'gear_spur_24_m1_brass');
      expect(run(WINDMILL, swapped(WINDMILL, 'pinion', gear)).status === 'runs').toBe(gear === 'gear_spur_12_m1_brass');
    }
    // The decoys of Letter 4 in the 24T position: 0.900 and 0.720 rad/s.
    expect(speed(run(WINDMILL, swapped(WINDMILL, 'gear_24', 'gear_spur_16_m1_brass')), 'millstone')).toBeCloseTo(0.9, 12);
    expect(speed(run(WINDMILL, swapped(WINDMILL, 'gear_24', 'gear_spur_20_m1_brass')), 'millstone')).toBeCloseTo(0.72, 12);
  });

  it('is incomplete without its rotor, the wind-driven power socket', () => {
    const { rotor: _rotor, ...rest } = WINDMILL.intended;
    expect(run(WINDMILL, rest).missingSockets).toEqual(['rotor']);
  });
});

describe('repair start states', () => {
  it('are the intended build with one faulty part and a one-piece tray', () => {
    for (const repair of Object.values(REPAIRS)) {
      const start = repairStart(repair)!;
      const bp = getBlueprint(repair.blueprintId)!;
      expect(Object.keys(start.assembly).sort()).toEqual(Object.keys(bp.intended).sort());
      expect(start.assembly[start.faultySocket]).toBe(repair.faultyPartId);
      expect(bp.intended[start.faultySocket]).toBe(repair.correctPartId);
      expect(start.tray).toEqual([{ partId: repair.correctPartId, quantity: 1 }]);
    }
  });

  it('are refused for an unknown blueprint, or a correct part that is not in exactly one socket', () => {
    expect(repairStart({ blueprintId: 'nope', faultyPartId: 'a', correctPartId: 'b' })).toBeUndefined();
    expect(repairStart({ blueprintId: 'music_box', faultyPartId: 'spring_worn_brass', correctPartId: 'bracket_support_brass' })).toBeUndefined(); // two brackets
    expect(repairStart({ blueprintId: 'music_box', faultyPartId: 'spring_worn_brass', correctPartId: 'gear_spur_24_m1_brass' })).toBeUndefined(); // none
  });
});

describe('gift catalogue', () => {
  it('knows the blueprints, their sockets and what each accepts', () => {
    const info = giftCatalogue.blueprint('music_box')!;
    expect(info.version).toBe(1);
    expect(info.sockets).toHaveLength(12);
    expect(info.accepts('main_spring', 'spring_worn_brass')).toBe(true);
    expect(info.accepts('main_spring', 'gear_spur_10_m1_brass')).toBe(false);
    expect(info.accepts('constructor', 'spring_worn_brass')).toBe(false);
    expect(giftCatalogue.blueprint('clock_tower')).toBeUndefined();
    expect(giftCatalogue.blueprint('__proto__')).toBeUndefined();
    expect(giftCatalogue.hasPart('spring_worn_brass')).toBe(true);
    expect(giftCatalogue.hasPart('constructor')).toBe(false);
  });

  it('verifies only a gift that runs correctly', () => {
    const gift = (bp: MachineBlueprint, assembly: Assembly) => ({
      blueprintId: bp.id,
      blueprintVersion: bp.version,
      placements: Object.entries(assembly).map(([socketId, partId]) => ({ socketId, partId })),
      engraving: ENGRAVING_IDS[0],
    });
    for (const bp of BLUEPRINTS) expect(verifyGift(gift(bp, bp.intended))).toBe(true);
    expect(verifyGift(gift(MUSIC_BOX, swapped(MUSIC_BOX, 'main_spring', 'spring_worn_brass')))).toBe(false);
    expect(verifyGift(gift(WINDMILL, swapped(WINDMILL, 'gear_24', 'gear_spur_12_m1_brass')))).toBe(false);
    expect(verifyGift({ ...gift(MUSIC_BOX, MUSIC_BOX.intended), placements: [] })).toBe(false); // incomplete
    expect(verifyGift({ ...gift(MUSIC_BOX, MUSIC_BOX.intended), blueprintId: 'nope' })).toBe(false);
  });
});
