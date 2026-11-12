// The Clock Tower blueprint against the solver: the correct assembly runs, missing and wrong parts give the right states.
// Slot counts and board rows are the mapping's (MACHINE_SLOT_MAPPINGS §5.4).

import { describe, expect, it } from 'vitest';
import type { InstalledPart, SolveResult } from '../../../src/sim';
import {
  CLOCK_TOWER_BLUEPRINT,
  CLOCK_TOWER_DECOYS,
  CLOCK_TOWER_PART_CATALOGUE,
  CLOCK_TOWER_SLOTS,
  CLOCK_TOWER_SOCKETS,
  ESCAPE_WHEEL_RAD_PER_S,
  SPUR_GEAR_IDS,
  clockTowerBlueprint,
  clockTowerCorrectAssembly,
  socketsOfSlot,
  solveClockTower,
} from '../../../src/machines/clock-tower';

function runOf(parts: readonly InstalledPart[], windUnits = 8, escapeTarget = false): SolveResult {
  const out = solveClockTower(parts, windUnits, escapeTarget ? clockTowerBlueprint({ escapeTarget }) : CLOCK_TOWER_BLUEPRINT);
  if (!out.ok) throw new Error(`validation failed: ${JSON.stringify(out.errors)}`);
  return out.result;
}
const withPart = (socketId: string, partId: string, parameters?: Record<string, number>): InstalledPart[] =>
  clockTowerCorrectAssembly().map((p) => (p.socketId === socketId ? { socketId, partId, ...(parameters ? { parameters } : {}) } : p));

describe('Clock Tower slots (mapping §5.4)', () => {
  it('has 32 slots, T01 to T32 in order, and one required socket per piece: 64', () => {
    expect(CLOCK_TOWER_SLOTS.map((s) => s.id)).toEqual(Array.from({ length: 32 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`));
    expect(CLOCK_TOWER_SOCKETS).toHaveLength(64);
    expect(new Set(CLOCK_TOWER_SOCKETS.map((s) => s.id)).size).toBe(64);
    expect(CLOCK_TOWER_SOCKETS.every((s) => s.required)).toBe(true);
  });

  it('places the pieces per slot as the table says', () => {
    const pieces = Object.fromEntries(CLOCK_TOWER_SLOTS.map((s) => [s.id, s.intended.length]));
    expect(pieces).toMatchObject({ T01: 1, T02: 4, T03: 4, T04: 4, T06: 2, T09: 4, T10: 4, T11: 8, T12: 2, T17: 3, T25: 4, T31: 4, T32: 1 });
    expect(socketsOfSlot('T17').map((s) => s.id)).toEqual(['inter_gear_1', 'inter_gear_2', 'inter_gear_3']);
    expect(socketsOfSlot('T11')).toHaveLength(8);
  });

  it('uses 30 board rows once each (rows 1 and 25 merge into the roof and the bell) and adds the hands and the key', () => {
    const rows = CLOCK_TOWER_SLOTS.map((s) => s.boardRow).filter((r): r is number => r !== null);
    const expected = Array.from({ length: 32 }, (_, i) => i + 1).filter((r) => r !== 1 && r !== 25);
    expect([...rows].sort((a, b) => a - b)).toEqual(expected);
    expect(CLOCK_TOWER_SLOTS.filter((s) => s.boardRow === null).map((s) => s.id)).toEqual(['T27', 'T32']);
  });

  it('only depends on earlier slots, so the assembly order is a real order', () => {
    const seen = new Set<string>();
    for (const s of CLOCK_TOWER_SLOTS) {
      for (const d of s.dependsOn) expect(seen.has(d), `${s.id} needs ${d}`).toBe(true);
      seen.add(s.id);
    }
  });

  it('gear sockets take any library spur gear of the fitting set, so a wrong size is allowed; no other socket does', () => {
    for (const s of CLOCK_TOWER_SOCKETS) {
      const gear = s.slot === 'T16' || s.slot === 'T17';
      expect(s.acceptedPartIds).toEqual(gear ? SPUR_GEAR_IDS : [s.intendedPartId]);
    }
    expect(SPUR_GEAR_IDS).not.toContain('gear_spur_36_m1'); // 94 mm across: does not fit the 83 mm interior
  });

  it('describes every part it uses, and the decoys, in the part catalogue', () => {
    for (const p of clockTowerCorrectAssembly()) expect(CLOCK_TOWER_PART_CATALOGUE).toHaveProperty(p.partId);
    for (const id of CLOCK_TOWER_DECOYS) expect(CLOCK_TOWER_PART_CATALOGUE).toHaveProperty(id);
  });
});

describe('correct assembly', () => {
  const r = runOf(clockTowerCorrectAssembly());

  it('runs', () => {
    expect(r.status).toBe('runs');
    expect(r.wrongTargets).toBeUndefined();
    expect(r.continuous).toBe(false);
  });

  it('turns the train: 0.8 rad/s at the spring, 5.76 times slower at the escape wheel, about 6 percent above the escapement beat', () => {
    expect(r.angularVelocity.spring).toBeCloseTo(0.8, 12);
    expect(r.angularVelocity.barrel).toBeCloseTo(0.8, 12);
    expect(r.angularVelocity.drive_shaft).toBeCloseTo(0.8, 12);
    expect(Math.abs(r.angularVelocity.large_gear)).toBeCloseTo(0.8 * (10 / 24), 12);
    expect(Math.abs(r.angularVelocity.escape_wheel)).toBeCloseTo(0.8 / 5.76, 12);
    const ratio = Math.abs(r.angularVelocity.escape_wheel) / ESCAPE_WHEEL_RAD_PER_S;
    expect(ratio).toBeGreaterThan(1.05);
    expect(ratio).toBeLessThan(1.07);
  });

  it('brings the bell, the hands and the pendulum alive, and leaves the structure still', () => {
    expect(r.triggered).toEqual({ anchor: true, bell: true, clock_hands: true, pendulum_bob: true, pendulum_rod: true });
    expect(r.angularVelocity.step_1).toBe(0);
    expect(r.angularVelocity.clock_face).toBe(0);
  });

  it('runs 15.71 s at eight wind units, like the Music Box spring, and not at all unwound', () => {
    expect(r.runSeconds).toBeCloseTo(Math.PI / 0.2, 3); // 8 * 0.1 J / (0.1 * 0.8 / (PI / 2)) W
    expect(runOf(clockTowerCorrectAssembly(), 0).runSeconds).toBe(0);
  });
});

describe('missing parts', () => {
  it('every socket is required: leaving out any one gives incomplete and names it', () => {
    for (const s of CLOCK_TOWER_SOCKETS) {
      const r = runOf(clockTowerCorrectAssembly().filter((p) => p.socketId !== s.id));
      expect(r.status, s.id).toBe('incomplete');
      expect(r.missingSockets, s.id).toEqual([s.id]);
      expect(r.angularVelocity).toEqual({});
    }
  });

  it('an empty tower names all 64 sockets, and a half-built train is incomplete, not a stopped train', () => {
    expect(runOf([]).missingSockets).toHaveLength(64);
    const train = ['large_gear', 'inter_gear_1', 'inter_gear_2', 'inter_gear_3', 'escape_wheel'];
    const noTrain = clockTowerCorrectAssembly().filter((p) => !train.includes(p.socketId));
    expect(runOf(noTrain)).toMatchObject({ status: 'incomplete', missingSockets: [...train].sort() });
  });
});

describe('wrong parts', () => {
  it('a gear of another module jams the mesh it sits in', () => {
    expect(runOf(withPart('inter_gear_1', 'gear_spur_10_m1', { module: 1.5 }))).toMatchObject({
      status: 'jams',
      jamReason: 'module_mismatch',
      jamAt: 'c_stage1',
    });
    expect(runOf(withPart('inter_gear_3', 'gear_spur_24_m1', { module: 2 }))).toMatchObject({ jamAt: 'c_stage2', jamReason: 'module_mismatch' });
  });

  it('a part a socket does not accept is rejected before the solver runs, so it never reaches a status', () => {
    const out = solveClockTower(withPart('spring', 'spring_worn'));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors).toEqual([expect.objectContaining({ code: 'part_not_accepted', id: 'spring_worn' })]);
    for (const [socket, wrong] of [['large_gear', 'gear_bevel_12'], ['bell', 'gear_spur_10_m1'], ['step_1', 'clock_bell']] as const) {
      const bad = solveClockTower(withPart(socket, wrong));
      expect(bad.ok, `${wrong} in ${socket}`).toBe(false);
      if (!bad.ok) expect(bad.errors.map((e) => e.code)).toEqual(['part_not_accepted']);
    }
  });

  it('both Letter 6 decoys are refused by every socket', () => {
    for (const decoy of CLOCK_TOWER_DECOYS) {
      for (const s of CLOCK_TOWER_SOCKETS) expect(s.acceptedPartIds, `${decoy} in ${s.id}`).not.toContain(decoy);
    }
  });

  it('by default (no target, mapping 5.3) a wrong gear size still runs, only at another speed', () => {
    const r = runOf(withPart('large_gear', 'gear_spur_20_m1'));
    expect(r.status).toBe('runs');
    expect(Math.abs(r.angularVelocity.escape_wheel)).toBeCloseTo(0.8 * (10 / 20) * (10 / 24), 12);
  });
});

describe('optional escape-wheel target (owner question Q11)', () => {
  const gearSockets = ['large_gear', 'inter_gear_1', 'inter_gear_2', 'inter_gear_3'] as const;

  it('is off by default, and the correct train meets it when on', () => {
    expect(CLOCK_TOWER_BLUEPRINT.targets).toEqual({});
    expect(clockTowerBlueprint({ escapeTarget: true }).targets.angularVelocity).toEqual({ escape_wheel: ESCAPE_WHEEL_RAD_PER_S });
    expect(runOf(clockTowerCorrectAssembly(), 8, true).status).toBe('runs');
  });

  it('every single wrong gear in the four gear sockets runs wrong and names the escape wheel', () => {
    for (const socket of gearSockets) {
      const intended = CLOCK_TOWER_SOCKETS.find((s) => s.id === socket)?.intendedPartId;
      for (const id of SPUR_GEAR_IDS.filter((g) => g !== intended)) {
        const r = runOf(withPart(socket, id), 8, true);
        expect(r.status, `${id} in ${socket}`).toBe('runs_wrong');
        expect(r.wrongTargets).toEqual(['escape_wheel']);
      }
    }
  });

  it('the train is the only two-stage one of the fitting gears inside the band', () => {
    const teeth = [10, 12, 16, 20, 24];
    const fits: string[] = [];
    for (const a of teeth) for (const b of teeth) for (const c of teeth) for (const d of teeth) {
      if (Math.abs(0.8 * (a / b) * (c / d) - ESCAPE_WHEEL_RAD_PER_S) <= 0.1 * ESCAPE_WHEEL_RAD_PER_S) fits.push(`${a}/${b} ${c}/${d}`);
    }
    expect(fits).toEqual(['10/24 10/24']);
  });
});
