import { describe, expect, it } from 'vitest';
import { planBuild, withoutCaddy } from '../../src/build-plan';
import { MUSIC_BOX } from '../../src/content/blueprints';
import { REPAIRS } from '../../src/game/content';

// planBuild with the hardware of ADR-050 (the INTRICATE_ASSEMBLY fallback is in build-plan-fallback.test.ts).

const housing = new Set(MUSIC_BOX.sockets.filter((s) => s.family !== 'fastener' || s.carrier === undefined).map((s) => s.id)); // what the case GLB gives today
const hardware = MUSIC_BOX.sockets.filter((s) => s.family === 'fastener').map((s) => s.id);

describe('planBuild with hardware', () => {
  it('seats nothing itself and holds the tray to the 12 big parts when every socket can be reached (the build as the director will run it)', () => {
    const plan = planBuild(MUSIC_BOX, null, 34, () => true, 'standard');
    expect(plan.fixed).toEqual({});
    expect(plan.trayIds).toHaveLength(12);
    expect(plan.spawnIds).toHaveLength(12); // the hardware comes with its stage's bag, not in the tray
    expect(plan.seatNow).toEqual([]);
    expect(plan.handBuilt).toBe(true);
    expect(plan.stages).toMatchObject({ difficulty: 'standard', intricate: true, seat: 'with-carrier' });
    expect(plan.stages.stages.flatMap((st) => st.bag.hardware)).toHaveLength(22);
  });

  it('is the build as it was when no director hands out hardware (a repair, the fallback): the game seats all 22 pieces and the player places the 12 parts', () => {
    const plan = planBuild(MUSIC_BOX, null, housing.size, (id) => housing.has(id));
    expect(Object.keys(plan.fixed).sort()).toEqual([...hardware].sort()); // the spring's anchor too, though the case has an empty for it
    expect(plan.trayIds).toHaveLength(12);
    expect(plan.handBuilt).toBe(true);
  });

  it('with a difficulty leaves the hardware to the director even when the housing has no socket for it: it sits on the empty of its own part', () => {
    const plan = planBuild(MUSIC_BOX, null, housing.size, (id) => housing.has(id), 'standard');
    expect(plan.fixed).toEqual({}); // nothing is seated by the game: the carried pins and screws come in the bags
    expect(plan.trayIds).toHaveLength(12);
    const repair = planBuild(MUSIC_BOX, REPAIRS.worn_spring, housing.size, (id) => housing.has(id), 'standard');
    expect(repair.fixed).toEqual({});
    expect(repair.seatNow.map(([id]) => id)).toEqual(Object.keys(MUSIC_BOX.intended)); // the machine as it stood, hardware too
  });

  it('plans Relaxed with the hardware to arrive with its parts, and Master as Standard', () => {
    const relaxed = planBuild(MUSIC_BOX, null, 34, () => true, 'relaxed').stages;
    expect(relaxed.auto).toHaveLength(22);
    expect(relaxed.atStart).toEqual(['anchor_spring']);
    expect(planBuild(MUSIC_BOX, null, 34, () => true, 'master').stages.auto).toEqual([]);
  });

  it('starts the worn-spring repair from the whole machine, hardware included, and a one-piece tray', () => {
    const plan = planBuild(MUSIC_BOX, REPAIRS.worn_spring, 34, () => true, 'standard');
    expect(plan.trayIds).toEqual(['spring_standard_brass']);
    expect(plan.seatNow).toHaveLength(34);
    expect(plan.seatNow.map(([id]) => id)).toEqual(Object.keys(MUSIC_BOX.intended)); // an order every dependency allows
    expect(plan.spawnIds).toHaveLength(35);
  });
});

describe('withoutCaddy: the bench with no fastener caddy', () => {
  it('makes Standard and Master seat every piece of hardware as Relaxed does, and keeps the level', () => {
    const relaxed = planBuild(MUSIC_BOX, null, 34, () => true, 'relaxed').stages;
    for (const level of ['standard', 'master'] as const) {
      const plan = withoutCaddy(MUSIC_BOX, planBuild(MUSIC_BOX, null, 34, () => true, level).stages);
      expect(plan.difficulty).toBe(level);
      expect(plan.noCaddy).toBe(true);
      expect(plan.stages.flatMap((st) => st.bag.hardware)).toEqual([]);
      expect([...plan.auto].sort()).toEqual([...hardware].sort());
      expect(plan.bundles).toEqual(relaxed.bundles);
      expect(plan.atStart).toEqual(relaxed.atStart);
      expect(plan.stages.map((st) => st.bag.big)).toEqual(relaxed.stages.map((st) => st.bag.big));
    }
  });

  it('leaves a plan with no hardware for the hands as it is', () => {
    const relaxed = planBuild(MUSIC_BOX, null, 34, () => true, 'relaxed').stages;
    expect(withoutCaddy(MUSIC_BOX, relaxed)).toBe(relaxed);
  });
});
