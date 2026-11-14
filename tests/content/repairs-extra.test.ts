import { describe, expect, it } from 'vitest';
import { getBlueprint, repairStart, solveAssembly } from '../../src/content/blueprints';
import { requirePart } from '../../src/content/parts';
import { REPAIR_IDS, REPAIRS, type RepairDef, type RepairId } from '../../src/game/content';
import { DAILY_POOL } from '../../src/game/daily';

// The three optional repairs (owner-approved polish, 2026-11-14) and, with them, every repair of the daily pool: each is a real fault
// the solver reports, that a hand can fix, and that its symptom text and ratio describe truthfully.

const OPTIONAL: readonly RepairId[] = ['dragging_tune', 'crawling_mill', 'racing_tune'];

/** Solves the machine of `repair` with the faulty part in (`faulty`) or the correct one back in. */
function solved(repair: RepairDef, faulty: boolean) {
  const blueprint = getBlueprint(repair.blueprintId);
  const start = repairStart(repair);
  if (!blueprint || !start) throw new Error(`${repair.id} has no start`);
  const assembly = faulty ? start.assembly : { ...start.assembly, [start.faultySocket]: repair.correctPartId };
  const outcome = solveAssembly(blueprint, assembly);
  if (!outcome.ok) throw new Error(`${repair.id} was rejected by the solver: ${JSON.stringify(outcome.errors)}`);
  return { blueprint, start, result: outcome.result };
}

/** The speed of the machine's one speed-target node over the target itself: what the player sees as too fast or too slow. */
function speedOverTarget(repair: RepairDef): number {
  const { blueprint, result } = solved(repair, true);
  const [node, target] = Object.entries(blueprint.targets.angularVelocity ?? {})[0];
  return Math.abs(result.angularVelocity[node]) / Math.abs(target);
}

describe('every repair of the daily pool', () => {
  it('is in the pool, and the pool is the repairs of the game', () => {
    expect([...DAILY_POOL].sort()).toEqual([...REPAIR_IDS].sort());
    for (const id of OPTIONAL) expect(DAILY_POOL).toContain(id);
  });

  it.each(REPAIR_IDS.map((id) => [id] as const))('%s: starts from the correct build with one wrong part, and the tray holds only the right one', (id) => {
    const repair = REPAIRS[id];
    const blueprint = getBlueprint(repair.blueprintId);
    const start = repairStart(repair);
    expect(blueprint).toBeDefined();
    expect(start).toBeDefined();
    expect(blueprint?.intended[start!.faultySocket]).toBe(repair.correctPartId);
    expect(start!.assembly[start!.faultySocket]).toBe(repair.faultyPartId);
    const changed = Object.entries(start!.assembly).filter(([socket, part]) => blueprint!.intended[socket] !== part);
    expect(changed).toHaveLength(1);
    expect(start!.tray).toEqual([{ partId: repair.correctPartId, quantity: 1 }]);
    expect(repair.faultyPartId).not.toBe(repair.correctPartId);
  });

  it.each(REPAIR_IDS.map((id) => [id] as const))('%s: can be fixed by hand (the socket has a GLB empty and both parts can be pinched), so no player is stranded', (id) => {
    const repair = REPAIRS[id];
    const blueprint = getBlueprint(repair.blueprintId)!;
    const socket = blueprint.sockets.find((s) => s.id === repairStart(repair)!.faultySocket)!;
    expect(socket.node, `${blueprint.id}.${socket.id} has no SOCKET_ empty: the game would seat the wrong part itself and it could never be replaced`).toBeDefined();
    expect(socket.acceptedPartIds).toContain(repair.faultyPartId);
    expect(socket.acceptedPartIds).toContain(repair.correctPartId);
    expect(requirePart(repair.faultyPartId).grab.enabled).toBe(true);
    expect(requirePart(repair.correctPartId).grab.enabled).toBe(true);
  });

  it.each(REPAIR_IDS.map((id) => [id] as const))('%s: the wrong part is the solver\'s `runs_wrong` and the right part makes the machine `runs`', (id) => {
    const repair = REPAIRS[id];
    const wrong = solved(repair, true).result;
    expect(wrong.status).toBe('runs_wrong');
    expect(wrong.wrongTargets?.length).toBeGreaterThan(0);
    expect(solved(repair, false).result.status).toBe('runs');
  });
});

describe('the optional repairs', () => {
  it('drag: a 24-tooth gear on the 20-tooth cylinder wheel turns the cylinder at 0.333 instead of 0.4 rad/s, which the Music Box target does not accept', () => {
    const repair = REPAIRS.dragging_tune;
    const { start, result } = solved(repair, true);
    expect(start.faultySocket).toBe('cylinder_wheel');
    expect(Math.abs(result.angularVelocity.cylinder)).toBeCloseTo(0.8 * (10 / 24), 12);
    expect(result.wrongTargets).toEqual(['cylinder']);
    expect(speedOverTarget(repair)).toBeCloseTo(5 / 6, 12);
  });

  it('crawl: a 10-tooth gear on the 12-tooth windmill pinion turns the millstone at 0.5 instead of 0.6 rad/s, outside the 15 percent band', () => {
    const repair = REPAIRS.crawling_mill;
    const { start, result } = solved(repair, true);
    expect(start.faultySocket).toBe('pinion');
    expect(Math.abs(result.angularVelocity.millstone)).toBeCloseTo(1.2 * (10 / 24), 12);
    expect(result.wrongTargets).toEqual(['millstone']);
    expect(speedOverTarget(repair)).toBeCloseTo(5 / 6, 12);
  });

  it('race: a 12-tooth gear on the 10-tooth spring pinion turns the cylinder at 0.48 instead of 0.4 rad/s, which the Music Box target does not accept', () => {
    const repair = REPAIRS.racing_tune;
    const { start, result } = solved(repair, true);
    expect(start.faultySocket).toBe('spring_pinion');
    expect(Math.abs(result.angularVelocity.cylinder)).toBeCloseTo(0.8 * (12 / 20), 12);
    expect(result.wrongTargets).toEqual(['cylinder']);
    expect(speedOverTarget(repair)).toBeCloseTo(1.2, 12);
  });

  it.each(OPTIONAL.map((id) => [id] as const))('%s: its symptom is the speed ratio the solver gives, and a slow fault reads below 1 and a fast one above', (id) => {
    const repair = REPAIRS[id];
    expect(repair.symptom.kind).toBe('speed_ratio');
    if (repair.symptom.kind !== 'speed_ratio') return;
    expect(speedOverTarget(repair)).toBeCloseTo(repair.symptom.ratio, 12);
  });

  it('are three different faults on two machines, and none repeats a part pair of the documented repairs on the same socket', () => {
    const keys = [...OPTIONAL, 'worn_spring', 'wrong_gear'].map((id) => {
      const r = REPAIRS[id as RepairId];
      return `${r.blueprintId}:${repairStart(r)!.faultySocket}:${r.faultyPartId}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(OPTIONAL.map((id) => REPAIRS[id].blueprintId))).toEqual(new Set(['music_box', 'windmill']));
  });
});
