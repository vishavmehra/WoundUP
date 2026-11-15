import { describe, expect, it } from 'vitest';
import { getBlueprint, repairStart, solveAssembly } from '../../src/content/blueprints';
import { REPAIR_IDS, REPAIRS } from '../../src/game/content';

// INTRICATE_ASSEMBLY_DESIGN §8.3, §9.3, R6: a repair stays short. The power unit swaps as a bundle; a wrong gear is a pull, a placement and its pin.

describe('repair start states with hardware', () => {
  it('Letter 2: the worn spring comes out with everything it carries and the standard spring goes back as one bundle: 2 placements', () => {
    const start = repairStart(REPAIRS.worn_spring)!;
    expect(start.faultySocket).toBe('main_spring');
    expect(start.unlocked).toEqual(['main_spring', 'washer_spring', 'spring_pinion', 'pin_spring_pinion', 'winding_key', 'screw_key']);
    expect(start.bundle).toEqual({
      washer_spring: 'washer_plain_8_brass',
      spring_pinion: 'gear_spur_10_m1_brass',
      pin_spring_pinion: 'pin_taper_2_polished_brass',
      winding_key: 'winding_key_polished_brass',
      screw_key: 'screw_slot_m3_polished_brass',
    });
    expect(start.reseat).toEqual([]);
    expect(start.tray).toEqual([{ partId: 'spring_standard_brass', quantity: 1 }]); // one pull, one placement
  });

  it('is the whole machine as it stood, hardware included, with the worn spring in and nothing else wrong', () => {
    const start = repairStart(REPAIRS.worn_spring)!;
    const bp = getBlueprint('music_box')!;
    expect(Object.keys(start.assembly)).toEqual(Object.keys(bp.intended));
    expect(Object.keys(start.assembly)).toHaveLength(34);
    expect(Object.entries(start.assembly).filter(([id, part]) => bp.intended[id] !== part)).toEqual([['main_spring', 'spring_worn_brass']]);
    const worn = solveAssembly(bp, start.assembly);
    expect(worn.ok && worn.result.status).toBe('runs_wrong');
    expect(worn.ok && worn.result.runSeconds).toBeCloseTo(1.5, 9);
    const fixed = solveAssembly(bp, { ...start.assembly, main_spring: 'spring_standard_brass' });
    expect(fixed.ok && fixed.result.status).toBe('runs');
  });

  it('a wrong gear leaves with its pin and comes back bare: the pin is seated again, by hand (Standard) or by the game (Relaxed)', () => {
    const drag = repairStart(REPAIRS.dragging_tune)!;
    expect(drag.faultySocket).toBe('cylinder_wheel');
    expect(drag.unlocked).toEqual(['cylinder_wheel', 'pin_cylinder_wheel']);
    expect(drag.bundle).toEqual({});
    expect(drag.reseat).toEqual(['pin_cylinder_wheel']);
    const race = repairStart(REPAIRS.racing_tune)!;
    expect(race.faultySocket).toBe('spring_pinion');
    expect(race.unlocked).toEqual(['spring_pinion', 'pin_spring_pinion']);
    expect(race.reseat).toEqual(['pin_spring_pinion']);
  });

  it('a machine without hardware repairs as it always did: only the faulty socket is unlocked, nothing bundled or reseated', () => {
    for (const id of ['wrong_gear', 'crawling_mill'] as const) {
      const start = repairStart(REPAIRS[id])!;
      expect(start.unlocked, id).toEqual([start.faultySocket]);
      expect(start.bundle, id).toEqual({});
      expect(start.reseat, id).toEqual([]);
    }
  });

  it.each(REPAIR_IDS.map((id) => [id] as const))('%s: everything the unit needs back is either bundled or reseated, and the faulty socket leads', (id) => {
    const start = repairStart(REPAIRS[id])!;
    const bp = getBlueprint(REPAIRS[id].blueprintId)!;
    expect(start.unlocked[0]).toBe(start.faultySocket);
    const back = [...Object.keys(start.bundle), ...start.reseat].sort();
    expect(back).toEqual(start.unlocked.slice(1).sort());
    for (const socket of start.unlocked) expect(bp.sockets.some((s) => s.id === socket)).toBe(true);
  });
});
