import { describe, expect, it } from 'vitest';
import { planBuild } from '../../src/build-plan';
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

  it('is the build as it was while no GLB carries the hardware sockets yet: the game seats the 21 it cannot reach and the player places the 12 parts', () => {
    const plan = planBuild(MUSIC_BOX, null, housing.size, (id) => housing.has(id));
    const carried = hardware.filter((id) => !housing.has(id));
    expect(Object.keys(plan.fixed).sort()).toEqual([...carried].sort());
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
