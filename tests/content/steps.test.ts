import { describe, expect, it } from 'vitest';
import {
  armedSockets,
  CAROUSEL,
  filledDependents,
  groupMembers,
  MUSIC_BOX,
  movesWith,
  planStages,
  socketIdOfNode,
  stageOf,
  stagesOf,
  stepState,
  unmetDependencies,
  WINDMILL,
} from '../../src/content/blueprints';
import type { Assembly, MachineBlueprint, StagesPlan } from '../../src/content/blueprints';
import { partVoice } from '../../src/content/parts';

// The rules of the intricate assembly (INTRICATE_ASSEMBLY_DESIGN §3, §4.3, §8, ADR-050) on the real Music Box: pure data in, pure data out.

const STAGE_IDS = ['frame', 'governor_end', 'cylinder', 'drive_end', 'comb', 'governor', 'power'];
const standard = (stand = false): StagesPlan => planStages(MUSIC_BOX, 'standard', { intricate: true, stand });
const relaxed = (stand = false): StagesPlan => planStages(MUSIC_BOX, 'relaxed', { intricate: true, stand });

/** What stands once the sockets of the first `n` stages are filled, as the intended build. */
function built(bp: MachineBlueprint, stages: number, ...extra: string[]): Assembly {
  const ids = [...stagesOf(bp).slice(0, stages).flatMap((st) => st.sockets), ...extra];
  return Object.fromEntries(ids.map((id) => [id, bp.intended[id]] as const));
}

describe('the Music Box stages (design §8.1)', () => {
  it('are seven, of 6, 5, 4, 3, 5, 4 and 7 placements: 34 in all, every socket in exactly one', () => {
    const stages = stagesOf(MUSIC_BOX);
    expect(stages.map((st) => st.id)).toEqual(STAGE_IDS);
    expect(stages.map((st) => st.sockets.length)).toEqual([6, 5, 4, 3, 5, 4, 7]);
    const listed = stages.flatMap((st) => st.sockets);
    expect(listed).toHaveLength(34);
    expect([...listed].sort()).toEqual(MUSIC_BOX.sockets.map((s) => s.id).sort());
    expect(MUSIC_BOX.sockets.map((s) => s.stage)).toEqual(MUSIC_BOX.sockets.map((s) => stageOf(MUSIC_BOX, s.id)));
  });

  it('are listed in an order that every socket allows, so the repair can seat the intended build in order', () => {
    const seen = new Set<string>();
    for (const s of MUSIC_BOX.sockets) {
      for (const need of [...(s.dependencies ?? []), ...(s.carrier === undefined ? [] : [s.carrier])]) expect(seen.has(need), `${s.id} needs ${need}`).toBe(true);
      seen.add(s.id);
    }
    expect(Object.keys(MUSIC_BOX.intended)).toEqual(MUSIC_BOX.sockets.map((s) => s.id));
  });

  it('use at most four kinds of hardware each, so the four bins of the caddy are enough', () => {
    for (const st of stagesOf(MUSIC_BOX)) {
      const kinds = new Set(st.sockets.filter((id) => MUSIC_BOX.sockets.find((s) => s.id === id)?.family === 'fastener').map((id) => MUSIC_BOX.intended[id]));
      expect(kinds.size, st.id).toBeLessThanOrEqual(4);
    }
  });

  it('count 22 pieces of hardware of 7 kinds: 4 pins, 5 washers, 2 bushes, 6 screws, 2 clips, 1 dowel, 2 collars', () => {
    const count = new Map<string, number>();
    for (const s of MUSIC_BOX.sockets.filter((x) => x.family === 'fastener')) count.set(MUSIC_BOX.intended[s.id], (count.get(MUSIC_BOX.intended[s.id]) ?? 0) + 1);
    expect(Object.fromEntries(count)).toEqual({
      bush_split_8_brass: 2,
      screw_slot_m3_polished_brass: 6,
      pin_taper_2_polished_brass: 4,
      washer_plain_8_brass: 5,
      collar_set_8_brass: 2,
      clip_angle_small_brass: 2,
      pin_dowel_3_polished_brass: 1,
    });
    expect([...count.keys()].map(partVoice).sort()).toEqual(['bush', 'clip', 'collar', 'pin', 'pin', 'screw', 'washer']);
  });
});

describe('planStages (R5)', () => {
  it('Standard: the player places all 34, the game seats nothing, and each bag holds its stage', () => {
    const plan = standard();
    expect(plan).toMatchObject({ difficulty: 'standard', intricate: true, stand: false, seat: 'with-carrier', auto: [], atStart: [], bundles: {} });
    expect(plan.stages.map((st) => st.byHand.length)).toEqual([6, 5, 4, 3, 5, 4, 7]);
    expect(plan.stages[0].bag).toEqual({
      big: ['bracket_support_brass', 'bracket_support_brass'],
      hardware: ['bush_split_8_brass', 'screw_slot_m3_polished_brass', 'bush_split_8_brass', 'screw_slot_m3_polished_brass'],
    });
    expect(plan.stages.flatMap((st) => st.bag.big)).toHaveLength(12);
    expect(plan.stages.flatMap((st) => st.bag.hardware)).toHaveLength(22);
  });

  it('Master plans the same build as Standard: it differs in what is shown, which is the interface\'s business', () => {
    expect({ ...planStages(MUSIC_BOX, 'master', { intricate: true }), difficulty: 'standard' }).toEqual(standard());
  });

  it('Relaxed: the game seats all 22 pieces of hardware, the player places the 12 big parts, and a part lands with its hardware', () => {
    const plan = relaxed();
    expect(plan.auto).toHaveLength(22);
    expect(plan.stages.flatMap((st) => st.byHand)).toHaveLength(12);
    expect(plan.stages.flatMap((st) => st.bag.hardware)).toEqual([]);
    expect(plan.atStart).toEqual(['anchor_spring']); // seated in the case: there is no part to wait for
    expect(plan.bundles).toEqual({
      bracket_left: ['bush_left', 'screw_bracket_left'],
      bracket_right: ['bush_right', 'screw_bracket_right'],
      governor_wheel: ['pin_governor_wheel'],
      arbor: ['washer_arbor_l1', 'washer_arbor_l2', 'washer_arbor_r1', 'washer_arbor_r2'],
      cylinder: ['collar_cylinder_l', 'collar_cylinder_r'],
      cylinder_wheel: ['pin_cylinder_wheel'],
      comb: ['clip_comb_l', 'screw_clip_l', 'clip_comb_r', 'screw_clip_r'], // a screw on a clip on the comb arrives with the comb
      governor_pinion: ['pin_governor_pinion'],
      governor: ['screw_governor_frame'],
      main_spring: ['washer_spring'],
      spring_pinion: ['pin_spring_pinion'],
      winding_key: ['screw_key'],
    });
    expect(Object.values(plan.bundles).flat().length + plan.atStart.length).toBe(22);
  });

  it('keeps every gear in the player\'s hands at every level: the ratio is the lesson (design §6.1)', () => {
    for (const level of ['relaxed', 'standard', 'master'] as const) {
      const plan = planStages(MUSIC_BOX, level, { intricate: true });
      for (const id of ['cylinder_wheel', 'governor_wheel', 'spring_pinion', 'governor_pinion']) expect(plan.stages.flatMap((st) => st.byHand), `${level} ${id}`).toContain(id);
    }
  });

  it('INTRICATE_ASSEMBLY off is the fallback: Relaxed, with all the hardware seated at the start, whatever level was asked', () => {
    const plan = planStages(MUSIC_BOX, 'master', { intricate: false });
    expect(plan).toMatchObject({ difficulty: 'relaxed', intricate: false, seat: 'at-start', bundles: {} });
    expect(plan.atStart).toHaveLength(22);
    expect(plan.auto).toEqual(plan.atStart);
  });

  it('puts the stand stages on the stand only when asked: the arbor unit over three stages, carried after the third; the governor unit after its one', () => {
    expect(standard(false).stages.map((st) => st.site)).toEqual(Array(7).fill('case'));
    expect(standard(false).stages.every((st) => st.unit === undefined && st.carryAfter === undefined)).toBe(true);
    const stand = standard(true);
    expect(stand.stages.map((st) => st.site)).toEqual(['case', 'stand', 'stand', 'stand', 'case', 'stand', 'case']);
    expect(stand.stages.map((st) => st.carryAfter)).toEqual([undefined, undefined, undefined, 'arbor', undefined, 'governor', undefined]);
    expect(stand.stages[1].unit).toEqual({ carrier: 'arbor', grip: 'COL_Grip' });
  });

  it('gives a machine without stages one stage that holds every socket, so it needs no special case', () => {
    for (const bp of [CAROUSEL, WINDMILL]) {
      expect(bp.stages).toBeUndefined();
      const plan = planStages(bp, 'standard', { intricate: true });
      expect(plan.stages).toHaveLength(1);
      expect(plan.stages[0].byHand).toEqual(bp.sockets.map((s) => s.id));
      expect(plan.auto).toEqual([]);
    }
  });
});

describe('stepState and armed sockets (R2, R4)', () => {
  it('starts at the frame: only the brackets are armed, and the first is next', () => {
    const state = stepState(MUSIC_BOX, standard(), {});
    expect(state.stage).toBe(0);
    expect(state.armed).toEqual(['bracket_left', 'bracket_right']);
    expect(state.next).toBe('bracket_left');
    expect(state.carry).toBeUndefined();
    expect(state.complete).toBe(false);
    expect(state.stages.map((st) => [st.done, st.total])).toEqual([[0, 6], [0, 5], [0, 4], [0, 3], [0, 5], [0, 4], [0, 7]]);
  });

  it('arms a piece of hardware only once the part that carries it is there', () => {
    const plan = standard();
    expect(armedSockets(MUSIC_BOX, plan, { bracket_left: 'bracket_support_brass' })).toEqual(['bush_left', 'screw_bracket_left', 'bracket_right']);
    expect(armedSockets(MUSIC_BOX, plan, built(MUSIC_BOX, 0, 'bracket_left', 'bracket_right'))).toEqual(['bush_left', 'screw_bracket_left', 'bush_right', 'screw_bracket_right']);
  });

  it('opens a stage only when the one before is done: the arbor waits for the whole frame, not only for its dependencies', () => {
    const plan = standard();
    const almost = built(MUSIC_BOX, 1);
    delete (almost as Record<string, string>).screw_bracket_right;
    const frame = stepState(MUSIC_BOX, plan, almost);
    expect(frame.stage).toBe(0);
    expect(frame.armed).toEqual(['screw_bracket_right']);
    const second = stepState(MUSIC_BOX, plan, built(MUSIC_BOX, 1));
    expect(second.stage).toBe(1);
    expect(second.armed).toEqual(['arbor']);
  });

  it('arms a group together: both washers of the governor end at once, with the wheel, in any order', () => {
    const state = stepState(MUSIC_BOX, standard(), built(MUSIC_BOX, 1, 'arbor'));
    expect(state.armed).toEqual(['governor_wheel', 'washer_arbor_l1', 'washer_arbor_l2']);
    expect(groupMembers(MUSIC_BOX, 'washer_arbor_l1')).toEqual(['washer_arbor_l1', 'washer_arbor_l2', 'washer_arbor_r1', 'washer_arbor_r2']);
    expect(groupMembers(MUSIC_BOX, 'arbor')).toEqual(['arbor']);
    expect(groupMembers(MUSIC_BOX, 'nope')).toEqual([]);
    // the pin waits for its gear, and filling a washer first or second changes nothing for the other
    expect(stepState(MUSIC_BOX, standard(), built(MUSIC_BOX, 1, 'arbor', 'governor_wheel')).armed).toEqual(['pin_governor_wheel', 'washer_arbor_l1', 'washer_arbor_l2']);
    expect(stepState(MUSIC_BOX, standard(), built(MUSIC_BOX, 1, 'arbor', 'washer_arbor_l2')).armed).toEqual(['governor_wheel', 'washer_arbor_l1']);
  });

  it('counts the placements of each stage, closes a stage when its last is in, and ends with every stage done and the machine complete', () => {
    const plan = standard();
    const mid = stepState(MUSIC_BOX, plan, built(MUSIC_BOX, 2, 'cylinder'));
    expect(mid.stage).toBe(2);
    expect(mid.stages.map((st) => st.complete)).toEqual([true, true, false, false, false, false, false]);
    expect(mid.stages[2]).toMatchObject({ id: 'cylinder', done: 1, total: 4, complete: false });
    expect(mid.armed).toEqual(['collar_cylinder_l', 'collar_cylinder_r', 'washer_arbor_r1']);
    const all = stepState(MUSIC_BOX, plan, MUSIC_BOX.intended);
    expect(all).toMatchObject({ stage: 7, armed: [], next: undefined, carry: undefined, complete: true });
    expect(all.stages.every((st) => st.complete && st.done === st.total)).toBe(true);
  });

  it('is complete only when every required socket is filled, whatever the stages say', () => {
    const { screw_key: _screw, ...rest } = MUSIC_BOX.intended;
    expect(stepState(MUSIC_BOX, standard(), rest).complete).toBe(false);
    expect(stepState(MUSIC_BOX, standard(), rest).armed).toEqual(['screw_key']);
  });

  it('Relaxed: a hardware socket counts as present while its part is, so nothing waits for a flight; progress counts the 12 big parts only', () => {
    const plan = relaxed();
    const frame = stepState(MUSIC_BOX, plan, { bracket_left: 'bracket_support_brass', bracket_right: 'bracket_support_brass' });
    expect(frame.stages[0]).toMatchObject({ done: 2, total: 2, complete: true });
    expect(frame.stage).toBe(1);
    // the bushes are not in the assembly yet, but the arbor (which depends on them) is armed: they come with the brackets
    expect(frame.armed).toEqual(['arbor']);
    expect(stepState(MUSIC_BOX, plan, {}).armed).toEqual(['bracket_left', 'bracket_right']);
  });

  it('Relaxed at the start of a fallback build waits for the game to seat the hardware, then asks nothing of the player but the 12 parts', () => {
    const plan = planStages(MUSIC_BOX, 'relaxed', { intricate: false });
    const state = stepState(MUSIC_BOX, plan, {});
    expect(state.armed).toEqual(['bracket_left', 'bracket_right']);
    const seated = Object.fromEntries(plan.atStart.map((id) => [id, MUSIC_BOX.intended[id]] as const));
    expect(stepState(MUSIC_BOX, plan, { ...seated, bracket_left: 'bracket_support_brass', bracket_right: 'bracket_support_brass' }).stage).toBe(1);
  });

  it('works for a machine without stages: the first socket whose dependencies are met is next', () => {
    const plan = planStages(WINDMILL, 'standard', { intricate: true });
    const first = stepState(WINDMILL, plan, {});
    expect(first.stages).toHaveLength(1);
    expect(first.armed.every((id) => unmetDependencies(WINDMILL, {}, id).length === 0)).toBe(true);
    expect(first.armed.length).toBeGreaterThan(0);
    expect(first.next).toBe(first.armed[0]);
    expect(stepState(WINDMILL, plan, WINDMILL.intended)).toMatchObject({ stage: 1, armed: [], complete: true });
  });

  describe('with units built on a stand (P1)', () => {
    const plan = standard(true);
    const frame = built(MUSIC_BOX, 1);

    it('arms the arbor for the stand first; the gears, washers and cylinder wait until it is on a cradle', () => {
      expect(stepState(MUSIC_BOX, plan, frame, new Set()).armed).toEqual(['arbor']);
      const onStand = new Set(['arbor']);
      expect(stepState(MUSIC_BOX, plan, frame, onStand)).toMatchObject({
        stage: 1,
        armed: ['governor_wheel', 'washer_arbor_l1', 'washer_arbor_l2'],
        carry: undefined,
      });
    });

    it('holds the carry until the three stand stages are done, then offers it, and closes the stage only when the arbor is in the case', () => {
      const onStand = new Set(['arbor']);
      const unit = { ...frame, ...built(MUSIC_BOX, 4) };
      delete (unit as Record<string, string>).arbor; // on the stand, not in the case
      const ready = stepState(MUSIC_BOX, plan, unit, onStand);
      expect(ready.stage).toBe(3); // the drive end: its three placements are in, but its carry is not done
      expect(ready.stages[3]).toMatchObject({ done: 3, total: 3, complete: false });
      expect(ready.armed).toEqual([]);
      expect(ready.carry).toBe('arbor');
      const carried = stepState(MUSIC_BOX, plan, { ...unit, arbor: 'shaft_short_brass' }, new Set());
      expect(carried.stage).toBe(4);
      expect(carried.carry).toBeUndefined();
      expect(carried.armed).toEqual(['comb']);
    });

    it('does not offer the carry before the unit is finished, or when the arbor is not on a stand', () => {
      const partial = { ...frame, governor_wheel: 'gear_spur_16_m1_brass' };
      expect(stepState(MUSIC_BOX, plan, partial, new Set(['arbor'])).carry).toBeUndefined();
      expect(stepState(MUSIC_BOX, plan, built(MUSIC_BOX, 4), new Set()).carry).toBeUndefined();
    });

    it('lets the unit stand without its case socket: dependencies count the arbor on the stand as present', () => {
      expect(unmetDependencies(MUSIC_BOX, {}, 'cylinder')).toEqual(['arbor']);
      expect(unmetDependencies(MUSIC_BOX, {}, 'cylinder', new Set(['arbor']))).toEqual([]);
    });
  });
});

describe('carriers: what travels with a part and what comes loose (R3)', () => {
  const full = MUSIC_BOX.intended;

  it('a piece of hardware travels with the part that carries it, the sockets of a unit with the unit', () => {
    expect([...movesWith(MUSIC_BOX, 'bracket_left')].sort()).toEqual(['bracket_left', 'bush_left', 'screw_bracket_left']);
    expect([...movesWith(MUSIC_BOX, 'comb')].sort()).toEqual(['clip_comb_l', 'clip_comb_r', 'comb', 'screw_clip_l', 'screw_clip_r']);
    // in place the gears are seated in the case's own empties, so the arbor carries only its washers
    expect([...movesWith(MUSIC_BOX, 'arbor')].sort()).toEqual(['arbor', 'washer_arbor_l1', 'washer_arbor_l2', 'washer_arbor_r1', 'washer_arbor_r2']);
    // on a stand the whole unit moves: gears, cylinder, their pins and collars
    expect([...movesWith(MUSIC_BOX, 'arbor', true)].sort()).toEqual(
      ['arbor', 'collar_cylinder_l', 'collar_cylinder_r', 'cylinder', 'cylinder_wheel', 'governor_wheel', 'pin_cylinder_wheel', 'pin_governor_wheel', 'washer_arbor_l1', 'washer_arbor_l2', 'washer_arbor_r1', 'washer_arbor_r2'],
    );
    expect([...movesWith(MUSIC_BOX, 'nope')]).toEqual(['nope']);
  });

  it('pulling a part in place takes with it what depends on it, never the hardware it carries (which goes with it)', () => {
    expect(filledDependents(MUSIC_BOX, full, 'arbor').sort()).toEqual(['cylinder', 'cylinder_wheel', 'governor_wheel']);
    expect(filledDependents(MUSIC_BOX, full, 'main_spring').sort()).toEqual(['spring_pinion', 'winding_key']);
    expect(filledDependents(MUSIC_BOX, full, 'governor')).toEqual(['governor_pinion']);
    expect(filledDependents(MUSIC_BOX, full, 'cylinder_wheel')).toEqual([]); // its pin goes with it
  });

  it('pulling a bracket also takes the arbor: the arbor sat in the bush that goes with the bracket', () => {
    expect(filledDependents(MUSIC_BOX, full, 'bracket_left')).toEqual(['arbor']);
    const { arbor: _arbor, ...withoutArbor } = full;
    expect(filledDependents(MUSIC_BOX, withoutArbor, 'bracket_left')).toEqual([]);
  });

  it('on a stand a unit keeps its children: nothing comes loose when the arbor, the spring or the governor is lifted', () => {
    expect(filledDependents(MUSIC_BOX, full, 'arbor', true)).toEqual([]);
    expect(filledDependents(MUSIC_BOX, full, 'main_spring', true)).toEqual([]);
    expect(filledDependents(MUSIC_BOX, full, 'governor', true)).toEqual([]);
    expect(filledDependents(MUSIC_BOX, full, 'bracket_left', true)).toEqual(['arbor']); // the bracket is not a unit
  });

  it('names hardware empties by the part they are on, since every gear has a Pin', () => {
    expect(socketIdOfNode(MUSIC_BOX, 'Pin', 'governor_wheel')).toBe('pin_governor_wheel');
    expect(socketIdOfNode(MUSIC_BOX, 'Pin', 'spring_pinion')).toBe('pin_spring_pinion');
    expect(socketIdOfNode(MUSIC_BOX, 'Pin')).toBeUndefined(); // four sockets: no answer without the carrier
    expect(socketIdOfNode(MUSIC_BOX, 'Pin', 'bracket_left')).toBeUndefined();
    expect(socketIdOfNode(MUSIC_BOX, 'WheelR', 'arbor')).toBe('cylinder_wheel'); // a stand unit's seat for a big part
    expect(socketIdOfNode(MUSIC_BOX, 'GearB')).toBe('cylinder_wheel'); // the case's own empty
    expect(socketIdOfNode(MUSIC_BOX, 'SpringAnchor')).toBe('anchor_spring');
    expect(socketIdOfNode(MUSIC_BOX, 'BaseHandle')).toBeUndefined();
    expect(socketIdOfNode(WINDMILL, 'Rotor')).toBe('rotor');
  });
});
