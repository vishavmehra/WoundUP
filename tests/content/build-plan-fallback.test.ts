import { describe, expect, it, vi } from 'vitest';

// INTRICATE_ASSEMBLY off (design §12.4, ADR-050 item 7): the one-line fallback ships Relaxed with the hardware seated by the game at the start.
vi.mock('../../src/content/blueprints', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/content/blueprints')>()), INTRICATE_ASSEMBLY: false }));

const { planBuild } = await import('../../src/build-plan');
const { MUSIC_BOX } = await import('../../src/content/blueprints');
const { REPAIRS } = await import('../../src/game/content');

const hardware = MUSIC_BOX.sockets.filter((s) => s.family === 'fastener').map((s) => s.id);

describe('planBuild with INTRICATE_ASSEMBLY off', () => {
  it('seats all 22 pieces of hardware before the first placement, whatever level was chosen and even when every socket can be reached', () => {
    for (const level of ['relaxed', 'standard', 'master', undefined] as const) {
      const plan = planBuild(MUSIC_BOX, null, 34, () => true, level);
      expect(Object.keys(plan.fixed).sort(), String(level)).toEqual([...hardware].sort());
      for (const id of hardware) expect(plan.fixed[id]).toBe(MUSIC_BOX.intended[id]);
      expect(plan.trayIds).toHaveLength(12);
      expect(plan.stages).toMatchObject({ difficulty: 'relaxed', intricate: false, seat: 'at-start' });
      expect(plan.stages.stages.flatMap((st) => st.bag.hardware)).toEqual([]);
    }
  });

  it('leaves the player the 12 big parts, which is the build as it was before ADR-050', () => {
    const plan = planBuild(MUSIC_BOX, null, 34, () => true, 'standard');
    expect(plan.stages.stages.flatMap((st) => st.byHand)).toHaveLength(12);
    expect(plan.seatNow).toEqual([]);
  });

  it('starts a repair with the hardware seated and only the 12 big parts brought to the bench', () => {
    const plan = planBuild(MUSIC_BOX, REPAIRS.worn_spring, 34, () => true);
    expect(Object.keys(plan.fixed).sort()).toEqual([...hardware].sort());
    expect(plan.seatNow).toHaveLength(12);
    expect(plan.trayIds).toEqual(['spring_standard_brass']);
  });
});
