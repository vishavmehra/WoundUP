import { describe, expect, it } from 'vitest';
import {
  BELFRY,
  BELFRY_BELL_PROFILE,
  filledDependents,
  getBlueprint,
  repairStart,
  solveAssembly,
  unmetDependencies,
  validateMachineBlueprint,
  WELL,
  WELL_PROFILE,
  WELL_STROKE_M,
} from '../../src/content/blueprints';
import type { Assembly, MachineBlueprint } from '../../src/content/blueprints';
import { requirePart } from '../../src/content/parts';
import { REPAIRS } from '../../src/game/content';
import { MAX_WIND_UNITS } from '../../src/sim';
import type { SolveResult } from '../../src/sim';

// WELL_FOUNTAIN_BLUEPRINT §14 and BELFRY_BLUEPRINT §14: the acceptance criteria that the solver and the data can answer.

const run = (bp: MachineBlueprint, assembly: Assembly, windUnits: number = MAX_WIND_UNITS, nodeAngles?: Record<string, number>): SolveResult => {
  const outcome = solveAssembly(bp, assembly, windUnits, nodeAngles);
  if (!outcome.ok) throw new Error(`invalid input: ${JSON.stringify(outcome.errors)}`);
  return outcome.result;
};
const swapped = (bp: MachineBlueprint, socketId: string, partId: string): Assembly => ({ ...bp.intended, [socketId]: partId });
const gear = (teeth: number): string => `gear_spur_${teeth}_m1_brass`;
const ROUND = 1e-9;

describe('both machines', () => {
  it.each([WELL, BELFRY])('$id: passes blueprint validation, is registered, and has 11 required sockets, each with a pose', (bp) => {
    expect(validateMachineBlueprint(bp)).toEqual([]);
    expect(getBlueprint(bp.id)).toBe(bp);
    expect(bp.sockets).toHaveLength(11);
    expect(bp.sockets.every((s) => s.required)).toBe(true);
    for (const s of bp.sockets) {
      expect(s.node, s.id).toBeDefined();
      expect(s.position, s.id).toHaveLength(3);
      expect(s.rotation, s.id).toHaveLength(4);
      expect(requirePart(bp.intended[s.id]).family, s.id).toBe(s.family);
    }
  });

  it.each([WELL, BELFRY])('$id: the tray holds the 11 intended parts and two decoys that no socket of the build needs', (bp) => {
    const intended = bp.tray.filter((t) => t.decoy !== true).reduce((n, t) => n + t.quantity, 0);
    const decoys = bp.tray.filter((t) => t.decoy === true);
    expect(intended).toBe(11);
    expect(decoys).toHaveLength(2);
    for (const d of decoys) expect(Object.values(bp.intended), d.partId).not.toContain(d.partId);
  });

  it('gives the two machines their own plots, letters and repairs (ADR-048)', () => {
    expect(REPAIRS.slow_pump.blueprintId).toBe('well');
    expect(REPAIRS.silent_bell.blueprintId).toBe('belfry');
    expect(WELL.housing.assetId).toBe('well_base');
    expect(BELFRY.housing.assetId).toBe('belfry_base');
  });
});

describe('the Well (WELL_FOUNTAIN_BLUEPRINT)', () => {
  it('has the sockets of section 7.1: ids, families, positions to 0.1 mm, the pawl turned 230 degrees, and the dependencies', () => {
    const table: Array<[id: string, family: string, position: [number, number, number], dependsOn: string[]]> = [
      ['bearing_top', 'structural', [0.017, 0.195, 0.0064], []],
      ['drive_gear', 'spur_gear', [-0.004, 0.036, -0.0114], []],
      ['spring', 'spring', [-0.004, 0.036, 0.0022], ['drive_gear']],
      ['key', 'winding_key', [-0.004, 0.036, 0.0092], ['spring']],
      ['cam_gear', 'spur_gear', [-0.004, 0.0745, -0.0114], ['drive_gear']],
      ['cam', 'cam', [-0.004, 0.0745, 0.0012], ['cam_gear']],
      ['follower', 'follower', [-0.004, 0.09, 0.0012], ['cam']],
      ['ratchet', 'ratchet', [-0.004, 0.0745, 0.0093], ['cam']],
      ['pawl', 'pawl', [0.0149, 0.1081, 0.0093], ['ratchet']],
      ['pulley_drive', 'pulley', [-0.004, 0.0745, 0.0184], ['ratchet']],
      ['pulley_idle', 'pulley', [0.017, 0.195, 0.0184], ['bearing_top', 'pulley_drive']],
    ];
    expect(WELL.sockets.map((s) => s.id)).toEqual(table.map(([id]) => id));
    for (const [id, family, position, dependsOn] of table) {
      const s = WELL.sockets.find((x) => x.id === id)!;
      expect(s.family, id).toBe(family);
      s.position!.forEach((v, k) => expect(Math.abs(v - position[k]), `${id} position ${k}`).toBeLessThan(1e-4));
      expect(s.dependencies, id).toEqual(dependsOn);
      // Every part turns about Z, towards the player, so only the pawl is turned (230 degrees about Z).
      const q = s.rotation!;
      const identity = [0, 0, 0, 1];
      const turned = [0, 0, Math.sin((230 * Math.PI) / 360), Math.cos((230 * Math.PI) / 360)];
      const want = id === 'pawl' ? turned : identity;
      expect(Math.abs(q.reduce((sum, v, k) => sum + v * want[k], 0)), `${id} rotation`).toBeGreaterThan(1 - 1e-4);
    }
  });

  it('runs at the target: the cam, the ratchet and both pulleys at 1.6 rad/s clockwise, the pawl triggered, 15.708 s at eight units', () => {
    const r = run(WELL, WELL.intended);
    expect(r.status).toBe('runs');
    expect(r.angularVelocity.spring).toBeCloseTo(0.8, 12);
    expect(r.angularVelocity.drive_gear).toBeCloseTo(0.8, 12);
    for (const id of ['cam_gear', 'cam', 'ratchet', 'pulley_drive', 'pulley_idle']) expect(r.angularVelocity[id], id).toBeCloseTo(-1.6, 12);
    expect(r.triggered).toEqual({ pawl: true });
    expect(r.runSeconds).toBeCloseTo(15.708, 3);
    expect(r.runSeconds).toBeCloseTo(2 * Math.PI / 0.4, 9); // the same seconds as the Music Box, one cylinder turn
    expect((r.runSeconds * 1.6) / (2 * Math.PI)).toBeCloseTo(4, 3); // a full wind gives exactly four pump strokes
    // The bucket chain: 1.6 rad/s on an 11.8 mm groove is 18.9 mm/s, a bucket every 1.7 s.
    expect(Math.abs(r.angularVelocity.pulley_idle) * 0.0118).toBeCloseTo(0.01888, 5);
  });

  it('refuses every decoy of the tray in the cam gear and the drive gear socket with the speeds of section 10.2, all runs_wrong', () => {
    const expected: Array<[socket: string, teeth: number, cam: number]> = [
      ['cam_gear', 16, 1.0],
      ['cam_gear', 12, 1.333333],
      ['drive_gear', 16, 1.28],
      ['drive_gear', 12, 0.96],
    ];
    for (const [socket, teeth, cam] of expected) {
      const r = run(WELL, swapped(WELL, socket, gear(teeth)));
      expect(r.status, `${teeth}T in ${socket}`).toBe('runs_wrong');
      expect(r.wrongTargets).toEqual(['cam']);
      expect(Math.abs(r.angularVelocity.cam), `${teeth}T in ${socket}`).toBeCloseTo(cam, 5);
    }
  });

  it('has no other pair of the tray\'s four gears that gets the cam to 1.6 rad/s plus or minus 10 percent', () => {
    const tray = [10, 20, 16, 12];
    const fits: string[] = [];
    for (const drive of tray) {
      for (const cam of tray) {
        if (drive === cam) continue; // only one 20T, one 10T, one 16T, one 12T in the tray
        const r = run(WELL, { ...WELL.intended, drive_gear: gear(drive), cam_gear: gear(cam) });
        if (r.status === 'runs') fits.push(`${drive}/${cam}`);
      }
    }
    expect(fits).toEqual(['20/10']);
  });

  it('is incomplete without its pawl or any other required socket, naming what is missing', () => {
    for (const s of WELL.sockets) {
      const assembly: Record<string, string> = { ...WELL.intended };
      delete assembly[s.id];
      const r = run(WELL, assembly);
      expect(r.status, s.id).toBe('incomplete');
      expect(r.missingSockets, s.id).toEqual([s.id]);
    }
  });

  it('lifts the follower by the pump profile: 0 to 5.5 mm, the slow rise first, the drop in under a second (section 3.2)', () => {
    expect(WELL_PROFILE.samples).toHaveLength(72);
    expect(Math.min(...WELL_PROFILE.samples)).toBe(0);
    expect(Math.max(...WELL_PROFILE.samples)).toBeCloseTo(WELL_STROKE_M, 12);
    expect(WELL_STROKE_M).toBeCloseTo(0.0055, 12);
    // mm above rest at the cam's turn in degrees, clockwise (the doc's table, computed by the committed solver)
    const doc: Record<number, number> = { 0: 0, 30: 0, 60: 0, 90: 0.15, 120: 0.89, 150: 2.07, 180: 3.43, 210: 4.61, 240: 5.35, 270: 5.5, 300: 4.46, 330: 1.04 };
    for (const [deg, mm] of Object.entries(doc)) {
      const r = run(WELL, WELL.intended, MAX_WIND_UNITS, { cam: -(Number(deg) * Math.PI) / 180 });
      expect(r.followerPose.follower * 1000, `${deg} degrees`).toBeCloseTo(mm, 2);
    }
    // Periodic and continuous: the sample before the start meets the first.
    const first = run(WELL, WELL.intended, MAX_WIND_UNITS, { cam: 0 }).followerPose.follower;
    const lap = run(WELL, WELL.intended, MAX_WIND_UNITS, { cam: -2 * Math.PI }).followerPose.follower;
    expect(lap).toBeCloseTo(first, 12);
  });

  it('runs with the worn spring (no run time target): the repair of the Well is a gear, not a spring', () => {
    const r = run(WELL, swapped(WELL, 'spring', 'spring_worn_brass'));
    expect(r.status).toBe('runs');
    expect(r.runSeconds).toBeCloseTo(1.5, 9);
  });

  it('starts the slow pump repair from the build with a 16-tooth gear in the cam gear socket, and the 10-tooth gear is the whole tray', () => {
    const start = repairStart(REPAIRS.slow_pump)!;
    expect(start.faultySocket).toBe('cam_gear');
    expect(start.assembly.cam_gear).toBe(gear(16));
    expect(start.tray).toEqual([{ partId: gear(10), quantity: 1 }]);
    const faulty = run(WELL, start.assembly);
    expect(faulty.status).toBe('runs_wrong');
    expect(Math.abs(faulty.angularVelocity.cam)).toBeCloseTo(1.0, 9);
    expect(Math.abs(faulty.angularVelocity.cam) / 1.6).toBeCloseTo(REPAIRS.slow_pump.symptom.kind === 'speed_ratio' ? REPAIRS.slow_pump.symptom.ratio : NaN, 9);
    expect(run(WELL, { ...start.assembly, cam_gear: gear(10) }).status).toBe('runs');
  });

  it('holds the placement order: the pawl waits for the ratchet, the idle pulley for the bearing and the drive pulley, and the spring cannot leave under the key', () => {
    const none: Assembly = {};
    expect(unmetDependencies(WELL, none, 'pawl')).toEqual(['ratchet']);
    expect(unmetDependencies(WELL, none, 'pulley_idle').sort()).toEqual(['bearing_top', 'pulley_drive']);
    expect(unmetDependencies(WELL, WELL.intended, 'pawl')).toEqual([]);
    expect(filledDependents(WELL, WELL.intended, 'spring')).toEqual(['key']);
    expect(filledDependents(WELL, WELL.intended, 'cam_gear')).toEqual(['cam']);
  });
});

describe('the Belfry (BELFRY_BLUEPRINT)', () => {
  const RX_PLUS = [0.7071068, 0, 0, 0.7071068];
  const turnedSockets = ['bevel_b', 'bearing_foot', 'flywheel', 'shaft', 'vane'];

  it('has the sockets of section 7.1: ids, families, positions to 0.1 mm, Rx+ on the vertical axis, and the dependencies', () => {
    const table: Array<[id: string, family: string, position: [number, number, number], dependsOn: string[]]> = [
      ['pinion', 'spur_gear', [-0.005, 0.059, -0.0144], []],
      ['spring', 'spring', [-0.005, 0.059, -0.0008], ['pinion']],
      ['key', 'winding_key', [-0.005, 0.059, 0.0062], ['spring']],
      ['drive_gear', 'spur_gear', [-0.005, 0.1, -0.0144], ['pinion']],
      ['bevel_b', 'bevel_gear', [-0.005, 0.11, 0.0117], []],
      ['bevel_a', 'bevel_gear', [-0.005, 0.1, 0.0017], ['drive_gear', 'bevel_b']],
      ['bearing_foot', 'structural', [-0.005, 0.128, 0.0117], []],
      ['flywheel', 'flywheel', [-0.005, 0.175, 0.0117], []],
      ['shaft', 'shaft', [-0.005, 0.194, 0.0117], ['bevel_b', 'bearing_foot', 'flywheel']],
      ['vane', 'vane', [-0.005, 0.28, 0.0117], ['shaft']],
      ['bell', 'structural', [0.02, 0.27, 0], []],
    ];
    expect(BELFRY.sockets.map((s) => s.id)).toEqual(table.map(([id]) => id));
    for (const [id, family, position, dependsOn] of table) {
      const s = BELFRY.sockets.find((x) => x.id === id)!;
      expect(s.family, id).toBe(family);
      s.position!.forEach((v, k) => expect(Math.abs(v - position[k]), `${id} position ${k}`).toBeLessThan(1e-4));
      expect(s.dependencies, id).toEqual(dependsOn);
      const want = turnedSockets.includes(id) ? RX_PLUS : [0, 0, 0, 1];
      expect(Math.abs(s.rotation!.reduce((sum, v, k) => sum + v * want[k], 0)), `${id} rotation`).toBeGreaterThan(1 - 1e-6);
    }
  });

  it('holds the sign rule of section 1 over the socket table: shaft edges share an axis, spur meshes are parallel, both bevel cones meet at one apex', () => {
    const socket = (id: string) => BELFRY.sockets.find((s) => s.id === id)!;
    /** The direction of the socket's local +Z in the machine frame. */
    const zOf = (id: string): number[] => {
      const [x, y, z, w] = socket(id).rotation!;
      return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
    };
    const near = (a: number[], b: number[]): void => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], 5));
    for (const c of BELFRY.connections.filter((x) => x.type === 'shaft')) near(zOf(c.from), zOf(c.to));
    near(zOf('pinion'), zOf('drive_gear')); // the spur mesh: parallel axes
    // Bevel gear: the cone's apex is 10 mm ahead of the origin along local +Z (gen_bevel_gear.py).
    const apex = (id: string): number[] => socket(id).position!.map((p, k) => p + 0.01 * zOf(id)[k]);
    near(apex('bevel_a'), apex('bevel_b'));
    expect(apex('bevel_a')[2]).toBeCloseTo(0.0117, 6); // the shaft's z
    // The vertical axis points down: turning +0.48 about local +Z is turning the vane about -Y.
    expect(zOf('shaft')[1]).toBeCloseTo(-1, 6);
  });

  it('runs at the target: the vane at +0.48 rad/s, the reduction at -0.48 below the bevel, 15.708 s at eight units', () => {
    const r = run(BELFRY, BELFRY.intended);
    expect(r.status).toBe('runs');
    for (const id of ['spring', 'pinion']) expect(r.angularVelocity[id], id).toBeCloseTo(0.8, 12);
    for (const id of ['drive_gear', 'bevel_a']) expect(r.angularVelocity[id], id).toBeCloseTo(-0.48, 12);
    for (const id of ['bevel_b', 'shaft', 'flywheel', 'vane']) expect(r.angularVelocity[id], id).toBeCloseTo(0.48, 12);
    expect(r.runSeconds).toBeCloseTo(15.708, 3);
    expect((2 * Math.PI) / 0.48).toBeCloseTo(13.09, 2); // a turn of the vane
    expect(r.runSeconds * 0.48 / (2 * Math.PI)).toBeCloseTo(1.2, 2); // 1.20 turns of the vane to a full wind
  });

  it('refuses every wrong gear with the speeds of section 3.2, all runs_wrong, and no pair of the tray gets the vane in the band', () => {
    const pinion: Array<[number, number]> = [[10, 0.4], [16, 0.64], [20, 0.8], [24, 0.96]];
    const drive: Array<[number, number]> = [[10, 0.96], [12, 0.8], [16, 0.6], [24, 0.4]];
    for (const [t, v] of pinion) {
      const r = run(BELFRY, swapped(BELFRY, 'pinion', gear(t)));
      expect(r.status, `pinion ${t}T`).toBe('runs_wrong');
      expect(r.angularVelocity.vane, `pinion ${t}T`).toBeCloseTo(v, 9);
    }
    for (const [t, v] of drive) {
      const r = run(BELFRY, swapped(BELFRY, 'drive_gear', gear(t)));
      expect(r.status, `drive ${t}T`).toBe('runs_wrong');
      expect(r.angularVelocity.vane, `drive ${t}T`).toBeCloseTo(v, 9);
    }
    const tray = [12, 20, 16, 24];
    const fits: string[] = [];
    let closest = Infinity;
    for (const a of tray) {
      for (const b of tray) {
        if (a === b) continue;
        const r = run(BELFRY, { ...BELFRY.intended, pinion: gear(a), drive_gear: gear(b) });
        if (r.status === 'runs') fits.push(`${a}/${b}`);
        else closest = Math.min(closest, Math.abs(r.angularVelocity.vane - 0.48));
      }
    }
    expect(fits).toEqual(['12/20']);
    expect(0.48 + closest).toBeCloseTo(0.533, 3); // the best wrong pair, 16T to 24T: 0.533 rad/s, 11.1 percent too fast
  });

  it('judges the worn spring runs_wrong on the run time and the standard spring wound a little still runs', () => {
    const worn = run(BELFRY, swapped(BELFRY, 'spring', 'spring_worn_brass'));
    expect(worn.status).toBe('runs_wrong');
    expect(worn.wrongTargets).toEqual(['runSeconds']);
    expect(worn.runSeconds).toBeCloseTo(1.5, 9);
    const light = run(BELFRY, BELFRY.intended, 3); // capacity is checked, not the wind
    expect(light.status).toBe('runs');
    expect(light.runSeconds).toBeCloseTo(5.89, 2);
  });

  it('starts the silent bell repair from the worn spring in the spring socket', () => {
    const start = repairStart(REPAIRS.silent_bell)!;
    expect(start.faultySocket).toBe('spring');
    expect(start.tray).toEqual([{ partId: 'spring_standard_brass', quantity: 1 }]);
    expect(run(BELFRY, start.assembly).wrongTargets).toEqual(['runSeconds']);
    expect(run(BELFRY, { ...start.assembly, spring: 'spring_standard_brass' }).status).toBe('runs');
  });

  it('rocks the bell 0.12 rad either side, six rocks to a turn of the shaft (section 3.1)', () => {
    expect(BELFRY_BELL_PROFILE.samples).toHaveLength(72);
    expect(Math.max(...BELFRY_BELL_PROFILE.samples)).toBeCloseTo(0.12, 12);
    expect(Math.min(...BELFRY_BELL_PROFILE.samples)).toBeCloseTo(-0.12, 12);
    const at = (deg: number): number => run(BELFRY, BELFRY.intended, MAX_WIND_UNITS, { shaft: (deg * Math.PI) / 180 }).followerPose.bell;
    expect(at(0)).toBeCloseTo(0, 12);
    expect(at(15)).toBeCloseTo(0.12, 12); // the first right extreme, a quarter of the first rock
    expect(at(30)).toBeCloseTo(0, 9);
    expect(at(45)).toBeCloseTo(-0.12, 12);
    expect(at(60)).toBeCloseTo(0, 9); // one rock every 60 degrees
    expect(at(375)).toBeCloseTo(at(15), 12); // and the profile is periodic
  });

  it('is incomplete without its flywheel or any other required socket, naming what is missing', () => {
    for (const s of BELFRY.sockets) {
      const assembly: Record<string, string> = { ...BELFRY.intended };
      delete assembly[s.id];
      const r = run(BELFRY, assembly);
      expect(r.status, s.id).toBe('incomplete');
      expect(r.missingSockets, s.id).toEqual([s.id]);
    }
  });

  it('holds the placement order: the shaft goes in last but for the vane, the bell takes no other part', () => {
    expect(unmetDependencies(BELFRY, {}, 'shaft').sort()).toEqual(['bearing_foot', 'bevel_b', 'flywheel']);
    expect(unmetDependencies(BELFRY, BELFRY.intended, 'vane')).toEqual([]);
    expect(unmetDependencies(BELFRY, { ...BELFRY.intended, shaft: undefined as never }, 'vane')).toEqual(['shaft']);
    expect(filledDependents(BELFRY, BELFRY.intended, 'shaft')).toEqual(['vane']);
    expect(BELFRY.sockets.find((s) => s.id === 'bell')?.dependencies).toEqual([]);
  });
});
