import { describe, expect, it } from 'vitest';
import { MUSIC_BOX, solveAssembly, validateMachineBlueprint } from '../../src/content/blueprints';
import type { Assembly } from '../../src/content/blueprints';
import { getPart, partIdsOfFamily, requirePart } from '../../src/content/parts';
import { MAX_WIND_UNITS } from '../../src/sim';

// ADR-050: the Music Box gained 22 pieces of hardware and seven stages, and the solver did not change. Hardware is checked by required sockets
// (`incomplete`) and never adds an edge, a jam or a target (INTRICATE_ASSEMBLY_DESIGN §4.2).

const run = (assembly: Assembly, windUnits: number = MAX_WIND_UNITS) => {
  const outcome = solveAssembly(MUSIC_BOX, assembly, windUnits);
  if (!outcome.ok) throw new Error(`invalid input: ${JSON.stringify(outcome.errors)}`);
  return outcome.result;
};
const without = (...ids: string[]): Assembly => Object.fromEntries(Object.entries(MUSIC_BOX.intended).filter(([id]) => !ids.includes(id)));
const hardwareIds = MUSIC_BOX.sockets.filter((s) => s.family === 'fastener').map((s) => s.id);

describe('the Music Box with its hardware', () => {
  it('passes validation', () => {
    expect(validateMachineBlueprint(MUSIC_BOX)).toEqual([]);
  });

  it('runs at 0.4 rad/s and plays one cylinder turn, exactly as before the hardware', () => {
    const r = run(MUSIC_BOX.intended);
    expect(r.status).toBe('runs');
    expect(Math.abs(r.angularVelocity.cylinder)).toBeCloseTo(0.4, 12);
    expect(r.runSeconds).toBeCloseTo((2 * Math.PI) / 0.4, 9);
  });

  it('has the same seven connections between the same twelve big parts: hardware adds no edge', () => {
    expect(MUSIC_BOX.connections).toHaveLength(7);
    const big = new Set(MUSIC_BOX.sockets.filter((s) => s.family !== 'fastener').map((s) => s.id));
    for (const c of MUSIC_BOX.connections) {
      expect(big.has(c.from), c.id).toBe(true);
      expect(big.has(c.to), c.id).toBe(true);
    }
    expect(Object.keys(MUSIC_BOX.targets.angularVelocity ?? {})).toEqual(['cylinder']);
  });

  it('is incomplete, naming the socket, when any one piece of hardware is missing: 22 ways, none a jam', () => {
    expect(hardwareIds).toHaveLength(22);
    for (const id of hardwareIds) {
      const r = run(without(id));
      expect(r.status, id).toBe('incomplete');
      expect(r.missingSockets, id).toEqual([id]);
    }
  });

  it('names every missing piece when a stage is left out, sorted, so the player-facing reason can say which', () => {
    expect(run(without('pin_governor_wheel', 'washer_arbor_r1', 'screw_key')).missingSockets).toEqual(['pin_governor_wheel', 'screw_key', 'washer_arbor_r1']);
  });

  it('is still the worn spring that runs wrong, never the hardware: 1.5 s, `runs_wrong`', () => {
    const r = run({ ...MUSIC_BOX.intended, main_spring: 'spring_worn_brass' });
    expect(r.status).toBe('runs_wrong');
    expect(r.runSeconds).toBeCloseTo(1.5, 9);
  });

  it('still lets a wrong gear run wrong: the ratio is the lesson, and its pin changes nothing', () => {
    const r = run({ ...MUSIC_BOX.intended, cylinder_wheel: 'gear_spur_24_m1_brass' });
    expect(r.status).toBe('runs_wrong');
    expect(r.wrongTargets).toEqual(['cylinder']);
  });

  it('refuses a piece of hardware in the wrong socket, by exact part id: a screw is not a pin, a washer is not a bush', () => {
    for (const [socket, wrong] of [
      ['pin_governor_wheel', 'screw_slot_m3_polished_brass'],
      ['washer_arbor_l1', 'bush_split_8_brass'],
      ['anchor_spring', 'pin_taper_2_polished_brass'], // a taper pin is not the dowel
      ['screw_key', 'gear_spur_10_m1_brass'],
    ] as const) {
      const outcome = solveAssembly(MUSIC_BOX, { ...MUSIC_BOX.intended, [socket]: wrong });
      expect(outcome.ok, `${socket} <- ${wrong}`).toBe(false);
    }
  });

  it('takes one exact part per hardware socket, and hardware only in hardware sockets', () => {
    for (const s of MUSIC_BOX.sockets) {
      if (s.family === 'fastener') {
        expect(s.acceptedPartIds, s.id).toHaveLength(1);
        expect(requirePart(s.acceptedPartIds![0]).family, s.id).toBe('fastener');
        expect(s.implied, s.id).toBe(true);
      } else {
        for (const id of s.acceptedPartIds ?? []) expect(getPart(id)?.family, `${s.id} <- ${id}`).not.toBe('fastener');
        expect(s.implied, s.id).toBeUndefined();
      }
    }
    expect(partIdsOfFamily('fastener')).toHaveLength(7); // the P0 subset of the nine ids
  });

  it('keeps the poses of the 12 big sockets: hardware has none, the empty on its carrier is the pose', () => {
    for (const s of MUSIC_BOX.sockets) {
      if (s.family === 'fastener') expect(s.position, s.id).toBeUndefined();
      else expect(s.position, s.id).toBeDefined();
    }
    expect(MUSIC_BOX.version).toBe(1); // an old gift link or save still means this machine (design §11.5)
  });

  it('keeps the tray at the 12 big parts of Letter 1: the hardware comes in the stage bags and the caddy', () => {
    expect(MUSIC_BOX.tray.reduce((n, t) => n + t.quantity, 0)).toBe(12);
    expect(MUSIC_BOX.tray.map((t) => t.partId)).toEqual([
      'bracket_support_brass',
      'shaft_short_brass',
      'cylinder_music_box_brass',
      'comb_music_box_polished_brass',
      'gear_spur_20_m1_brass',
      'gear_spur_16_m1_brass',
      'spring_standard_brass',
      'gear_spur_10_m1_brass',
      'governor_standard_brass',
      'gear_spur_12_m1_brass',
      'winding_key_polished_brass',
    ]); // the tray order of src/tray-layout.ts
  });
});
