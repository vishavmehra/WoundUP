// The Clock Tower blueprint (ADR-047) against the catalogue and the solver: the correct assembly runs, missing and wrong parts give the
// right states, and Letter 6 plays through the session. Slot counts and board rows are the mapping's (MACHINE_SLOT_MAPPINGS §5.4).

import { describe, expect, it } from 'vitest';
import {
  BLUEPRINTS,
  CLOCK_TOWER,
  CLOCK_TOWER_DECOYS,
  CLOCK_TOWER_SLOTS,
  CLOCK_TOWER_SOCKETS,
  clockTowerBlueprint,
  clockTowerCorrectAssembly,
  filledDependents,
  getBlueprint,
  socketsOfSlot,
  solveAssembly,
  solveClockTower,
  unmetDependencies,
  giftCatalogue,
  validateMachineBlueprint,
  verifyGift,
} from '../../src/content/blueprints';
import { SPUR_GEAR_IDS } from '../../src/content/blueprints/shared';
import { getPart, hasPart, MODEL_PATHS, requirePart, SOLVER_CATALOGUE } from '../../src/content/parts';
import { CLOCK_TOWER_MODEL_PATHS, ESCAPE_WHEEL_RAD_PER_S } from '../../src/machines/clock-tower';
import { LETTERS, MACHINE_IDS, MACHINE_PLOT } from '../../src/game/content';
import { decodeGift, encodeGift, GIFT_URL_TARGET_CHARS } from '../../src/game/gift';
import { GameSession } from '../../src/game/session';
import { FakeStorage } from '../game/helpers';
import { MAX_WIND_UNITS } from '../../src/sim';
import type { InstalledPart, SolveResult } from '../../src/sim';

function runOf(parts: readonly InstalledPart[], windUnits = 8, escapeTarget = false): SolveResult {
  const out = solveClockTower(parts, windUnits, escapeTarget ? clockTowerBlueprint({ escapeTarget }) : CLOCK_TOWER);
  if (!out.ok) throw new Error(`validation failed: ${JSON.stringify(out.errors)}`);
  return out.result;
}
const withPart = (socketId: string, partId: string, parameters?: Record<string, number>): InstalledPart[] =>
  clockTowerCorrectAssembly().map((p) => (p.socketId === socketId ? { socketId, partId, ...(parameters ? { parameters } : {}) } : p));

describe('Clock Tower slots (mapping §5.4)', () => {
  it('has 32 slots, T01 to T32 in order; the 17 sockets are the slots with a GLB part, one per piece, all required', () => {
    expect(CLOCK_TOWER_SLOTS.map((s) => s.id)).toEqual(Array.from({ length: 32 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`));
    expect(CLOCK_TOWER_SOCKETS).toHaveLength(17);
    expect(new Set(CLOCK_TOWER_SOCKETS.map((s) => s.id)).size).toBe(17);
    expect(CLOCK_TOWER_SOCKETS.every((s) => s.required)).toBe(true);
    for (const s of CLOCK_TOWER_SLOTS) expect(socketsOfSlot(s.id), s.id).toHaveLength(s.assets.length);
  });

  it('keeps the structural slots (the pieces of the base and shell GLBs) as board data without a part or a socket', () => {
    const structural = CLOCK_TOWER_SLOTS.filter((s) => s.assets.length === 0);
    expect(structural.map((s) => s.id)).toEqual(['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T21', 'T24', 'T25', 'T28', 'T29', 'T30', 'T31']);
    expect(structural.reduce((n, s) => n + s.pieces, 0)).toBe(46); // pieces the asset agents modelled as meshes of the base and shell files
    for (const s of structural) expect(socketsOfSlot(s.id), s.id).toEqual([]);
  });

  it('places the pieces per slot as the table says', () => {
    const pieces = Object.fromEntries(CLOCK_TOWER_SLOTS.map((s) => [s.id, s.pieces]));
    expect(pieces).toMatchObject({ T01: 1, T02: 4, T03: 4, T04: 4, T06: 2, T09: 4, T10: 4, T11: 8, T12: 2, T17: 3, T21: 0, T25: 4, T31: 4, T32: 1 });
    expect(socketsOfSlot('T17').map((s) => s.id)).toEqual(['inter_gear_1', 'inter_gear_2', 'inter_gear_3']);
    expect(socketsOfSlot('T12').map((s) => s.id)).toEqual(['bracket_1', 'bracket_2']);
    expect(socketsOfSlot('T20').map((s) => s.id)).toEqual(['pendulum']); // rod and bob are one file
  });

  it('uses 30 board rows once each (rows 1 and 25 merge into the roof and the bell, row 23 into the pendulum) and adds the hands and the key', () => {
    const rows = CLOCK_TOWER_SLOTS.map((s) => s.boardRow).filter((r): r is number => r !== null);
    const expected = Array.from({ length: 32 }, (_, i) => i + 1).filter((r) => r !== 1 && r !== 25);
    expect([...rows].sort((a, b) => a - b)).toEqual(expected);
    expect(CLOCK_TOWER_SLOTS.filter((s) => s.boardRow === null).map((s) => s.id)).toEqual(['T27', 'T32']);
  });

  it('only depends on earlier slots, so the assembly order is a real order, and its sockets depend only on earlier sockets', () => {
    const seen = new Set<string>();
    for (const s of CLOCK_TOWER_SLOTS) {
      for (const d of s.dependsOn) expect(seen.has(d), `${s.id} needs ${d}`).toBe(true);
      seen.add(s.id);
    }
    const placed = new Set<string>();
    for (const s of CLOCK_TOWER_SOCKETS) {
      for (const d of s.dependencies ?? []) expect(placed.has(d), `${s.id} needs ${d}`).toBe(true);
      placed.add(s.id);
    }
  });

  it('gear sockets take any library spur gear of the fitting set, so a wrong size is allowed; no other socket does', () => {
    for (const s of CLOCK_TOWER_SOCKETS) {
      const gear = s.slot === 'T16' || s.slot === 'T17';
      expect(s.acceptedPartIds).toEqual(gear ? SPUR_GEAR_IDS : [CLOCK_TOWER.intended[s.id]]);
    }
    expect(SPUR_GEAR_IDS).not.toContain('gear_spur_36_m1_brass'); // 94 mm across: does not fit the 83 mm interior
  });
});

describe('Clock Tower in the part catalogue (finish-suffixed ids, resolved in one place)', () => {
  it('names every part of the correct build, every accepted part and the decoys by a catalogue id, with a GLB', () => {
    const ids = new Set<string>([...Object.values(CLOCK_TOWER.intended), ...CLOCK_TOWER_DECOYS, ...CLOCK_TOWER_SOCKETS.flatMap((s) => [...(s.acceptedPartIds ?? [])])]);
    for (const id of ids) {
      expect(hasPart(id), id).toBe(true);
      expect(MODEL_PATHS[requirePart(id).visual.assetId], id).toBeDefined();
      expect(SOLVER_CATALOGUE[id], id).toBe(requirePart(id));
    }
    expect(CLOCK_TOWER.intended).toMatchObject({
      spring: 'spring_standard_brass',
      barrel: 'spring_barrel_brass',
      bracket_1: 'bracket_support_brass',
      drive_shaft: 'shaft_long_brass',
      large_gear: 'gear_spur_24_m1_brass',
      inter_gear_1: 'gear_spur_10_m1_brass',
      inter_gear_3: 'gear_spur_24_m1_brass',
      escape_wheel: 'escapement_wheel_brass',
      anchor: 'escapement_anchor_brass',
      pendulum: 'pendulum_clock_brass',
      hourly_cam: 'cam_hourly_chime_brass',
      bell: 'clock_bell_polished_brass',
      clock_face: 'clock_face_cream_enamel',
      clock_hands: 'clock_hands_walnut',
      winding_key: 'winding_key_polished_brass',
    });
    expect(CLOCK_TOWER_DECOYS).toEqual(['spring_worn_brass', 'gear_bevel_12_brass']);
  });

  it('loads the files of the finished tower from paths the catalogue also knows, so the town and the loader read the same GLBs', () => {
    const known = new Set(Object.values(MODEL_PATHS));
    for (const path of CLOCK_TOWER_MODEL_PATHS) if (!path.includes('machine_base_handle')) expect(known.has(path), path).toBe(true);
    expect(MODEL_PATHS.clock_tower_shell).toBe('tockton/clock_tower/clock_tower_shell.glb');
  });

  it('gives only the gears and the springs mechanical data, as the other machines do; the barrel is not a spring', () => {
    expect(getPart('spring_barrel_brass')?.mechanical).toBeUndefined();
    expect(getPart('spring_barrel_brass')?.family).toBe('structural');
    expect(requirePart('spring_standard_brass').mechanical?.angularVelocity).toBe(0.8);
    expect(requirePart('gear_spur_24_m1_brass').mechanical).toEqual({ toothCount: 24, module: 1 });
  });

  it('is registered as the fourth blueprint, valid, with the machine id the game core uses', () => {
    expect(BLUEPRINTS.map((b) => b.id).slice(0, 4)).toEqual(['music_box', 'carousel', 'windmill', 'clock_tower']); // the Well and the Belfry follow (ADR-048)
    expect(getBlueprint('clock_tower')).toBe(CLOCK_TOWER);
    expect(MACHINE_IDS).toContain(CLOCK_TOWER.id);
    expect(validateMachineBlueprint(CLOCK_TOWER)).toEqual([]);
    expect(validateMachineBlueprint(clockTowerBlueprint({ escapeTarget: true }))).toEqual([]);
  });

  it('has a tray that supplies the build exactly and the two Letter 6 decoys, which no socket accepts', () => {
    expect(CLOCK_TOWER.tray.filter((t) => !t.decoy).reduce((n, t) => n + t.quantity, 0)).toBe(17);
    expect(CLOCK_TOWER.tray.filter((t) => t.decoy).map((t) => t.partId)).toEqual(CLOCK_TOWER_DECOYS);
    for (const decoy of CLOCK_TOWER_DECOYS) {
      for (const s of CLOCK_TOWER_SOCKETS) expect(s.acceptedPartIds, `${decoy} in ${s.id}`).not.toContain(decoy);
    }
  });

  it('has no hand-reachable socket in its housing yet: no socket names a GLB empty, so the game seats the movement (asset gap)', () => {
    expect(CLOCK_TOWER_SOCKETS.every((s) => s.node === undefined)).toBe(true);
    expect(CLOCK_TOWER.housing.assetId).toBe('clock_tower_base');
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

  it('brings the bell, the hands and the pendulum alive, and leaves the dial still', () => {
    expect(r.triggered).toEqual({ anchor: true, bell: true, clock_hands: true, pendulum: true });
    expect(r.angularVelocity.clock_face).toBe(0);
  });

  it('runs 15.71 s at eight wind units, like the Music Box spring, and not at all unwound', () => {
    expect(r.runSeconds).toBeCloseTo(Math.PI / 0.2, 3); // 8 * 0.1 J / (0.1 * 0.8 / (PI / 2)) W
    expect(runOf(clockTowerCorrectAssembly(), 0).runSeconds).toBe(0);
  });

  it('is what the generic solver entry point gives for the intended build, and what a gift of it is verified by', () => {
    const outcome = solveAssembly(CLOCK_TOWER, CLOCK_TOWER.intended, MAX_WIND_UNITS);
    expect(outcome.ok && outcome.result.status).toBe('runs');
    const placements = Object.entries(CLOCK_TOWER.intended).map(([socketId, partId]) => ({ socketId, partId }));
    expect(verifyGift({ blueprintId: 'clock_tower', blueprintVersion: 1, placements, engraving: 'for_you' })).toBe(true);
    expect(verifyGift({ blueprintId: 'clock_tower', blueprintVersion: 1, placements: placements.slice(1), engraving: 'for_you' })).toBe(false);
  });
});

describe('a gift of the Clock Tower (17 placements, the largest machine)', () => {
  const options = { catalogue: giftCatalogue, verify: verifyGift };
  const gift = {
    blueprintId: 'clock_tower',
    blueprintVersion: 1,
    placements: Object.entries(CLOCK_TOWER.intended).map(([socketId, partId]) => ({ socketId, partId })),
    engraving: 'wind_me_up',
  } as const;

  it('encodes to a link short enough to share, and the viewer decodes the same tower from it', async () => {
    const encoded = await encodeGift(gift, options);
    if (!encoded.ok) throw new Error(`encode failed: ${encoded.error}`);
    expect(encoded.data.length).toBeLessThanOrEqual(GIFT_URL_TARGET_CHARS);
    const decoded = await decodeGift(encoded.hash, options);
    if (!decoded.ok) throw new Error(`decode failed: ${decoded.error}`);
    expect(decoded.gift.blueprintId).toBe('clock_tower');
    expect(decoded.gift.placements).toHaveLength(17);
    expect(Object.fromEntries(decoded.gift.placements.map((p) => [p.socketId, p.partId]))).toEqual(CLOCK_TOWER.intended);
  });

  it('is refused when a socket is left empty or holds a part it does not take', async () => {
    expect((await encodeGift({ ...gift, placements: gift.placements.slice(1) }, options)).ok).toBe(false);
    const swapped = gift.placements.map((p) => (p.socketId === 'spring' ? { ...p, partId: 'spring_worn_brass' } : p));
    expect((await encodeGift({ ...gift, placements: swapped }, options)).ok).toBe(false);
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

  it('an empty tower names all 17 sockets, and a half-built train is incomplete, not a stopped train', () => {
    expect(runOf([]).missingSockets).toHaveLength(17);
    const train = ['large_gear', 'inter_gear_1', 'inter_gear_2', 'inter_gear_3', 'escape_wheel'];
    const noTrain = clockTowerCorrectAssembly().filter((p) => !train.includes(p.socketId));
    expect(runOf(noTrain)).toMatchObject({ status: 'incomplete', missingSockets: [...train].sort() });
  });
});

describe('wrong parts', () => {
  it('a gear of another module jams the mesh it sits in', () => {
    expect(runOf(withPart('inter_gear_1', 'gear_spur_10_m1_brass', { module: 1.5 }))).toMatchObject({
      status: 'jams',
      jamReason: 'module_mismatch',
      jamAt: 'c_stage1',
    });
    expect(runOf(withPart('inter_gear_3', 'gear_spur_24_m1_brass', { module: 2 }))).toMatchObject({ jamAt: 'c_stage2', jamReason: 'module_mismatch' });
  });

  it('a part a socket does not accept is rejected before the solver runs, so it never reaches a status', () => {
    const out = solveClockTower(withPart('spring', 'spring_worn_brass'));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors).toEqual([expect.objectContaining({ code: 'part_not_accepted', id: 'spring_worn_brass' })]);
    for (const [socket, wrong] of [['large_gear', 'gear_bevel_12_brass'], ['bell', 'gear_spur_10_m1_brass'], ['bracket_1', 'clock_bell_polished_brass']] as const) {
      const bad = solveClockTower(withPart(socket, wrong));
      expect(bad.ok, `${wrong} in ${socket}`).toBe(false);
      if (!bad.ok) expect(bad.errors.map((e) => e.code)).toEqual(['part_not_accepted']);
    }
  });

  it('by default (no target, mapping 5.3) a wrong gear size still runs, only at another speed', () => {
    const r = runOf(withPart('large_gear', 'gear_spur_20_m1_brass'));
    expect(r.status).toBe('runs');
    expect(Math.abs(r.angularVelocity.escape_wheel)).toBeCloseTo(0.8 * (10 / 20) * (10 / 24), 12);
  });
});

describe('optional escape-wheel target (owner question Q11)', () => {
  const gearSockets = ['large_gear', 'inter_gear_1', 'inter_gear_2', 'inter_gear_3'] as const;

  it('is off by default, and the correct train meets it when on', () => {
    expect(CLOCK_TOWER.targets).toEqual({});
    expect(clockTowerBlueprint({ escapeTarget: true }).targets.angularVelocity).toEqual({ escape_wheel: ESCAPE_WHEEL_RAD_PER_S });
    expect(runOf(clockTowerCorrectAssembly(), 8, true).status).toBe('runs');
  });

  it('every single wrong gear in the four gear sockets runs wrong and names the escape wheel', () => {
    for (const socket of gearSockets) {
      const intended = CLOCK_TOWER.intended[socket];
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

describe('placement order (the rules the game checks when a part is seated)', () => {
  it('lets the whole build be seated in blueprint order, each socket ready when its turn comes, and nothing be pulled out from under its dependents', () => {
    const seated: Record<string, string> = {};
    for (const s of CLOCK_TOWER.sockets) {
      expect(unmetDependencies(CLOCK_TOWER, seated, s.id), s.id).toEqual([]);
      seated[s.id] = CLOCK_TOWER.intended[s.id];
    }
    expect(unmetDependencies(CLOCK_TOWER, {}, 'escape_wheel')).toEqual(['inter_gear_1', 'inter_gear_2', 'inter_gear_3']);
    expect(filledDependents(CLOCK_TOWER, seated, 'bracket_1')).toEqual(['barrel', 'drive_shaft']);
    expect(filledDependents(CLOCK_TOWER, seated, 'pendulum')).toEqual([]);
  });
});

describe('Letter 6 through the session (theatre keeper, ADR-047)', () => {
  /** Letters 1 to 5 done with the real commands, the Clock Tower on (the default of the game). */
  function untilLetter6(game: GameSession): void {
    const steps: Array<[string, () => boolean]> = [];
    const build = (letter: 'letter_1' | 'letter_3' | 'letter_4', machine: 'music_box' | 'carousel' | 'windmill'): void => {
      steps.push([`accept ${letter}`, () => game.acceptLetter(letter)], ['assemble', () => game.assemblyComplete()], ['run', () => game.machineRanCorrectly(machine)], ['place', () => game.machinePlaced(machine, MACHINE_PLOT[machine])]);
    };
    const repair = (letter: 'letter_2' | 'letter_5', id: 'worn_spring' | 'wrong_gear', machine: 'music_box' | 'windmill'): void => {
      steps.push([`accept ${letter}`, () => game.acceptLetter(letter)], ['assemble', () => game.assemblyComplete()], ['verify', () => game.repairVerified(id)], ['run', () => game.machineRanCorrectly(machine)], ['place', () => game.machinePlaced(machine, MACHINE_PLOT[machine])]);
    };
    steps.push(['trunk', () => game.openTrunk()]);
    build('letter_1', 'music_box');
    repair('letter_2', 'worn_spring', 'music_box');
    build('letter_3', 'carousel');
    build('letter_4', 'windmill');
    repair('letter_5', 'wrong_gear', 'windmill');
    for (const [what, step] of steps) expect(step(), what).toBe(true);
  }

  it('unlocks when Letter 5 is completed, and ends the story with the closing card only after the tower stands on its plot', () => {
    const game = new GameSession({ storage: null });
    untilLetter6(game);
    expect(game.save.letters.letter_6).toBe('available');
    expect(game.letter).toBe(LETTERS.letter_6);
    expect(game.closing).toBeNull();
    expect(LETTERS.letter_6.objective).toEqual({ type: 'build_and_run', blueprintId: 'clock_tower' });
  });

  it('is built, run and placed on plot_clock_tower: the solver says runs, the session completes the letter only at the placement', () => {
    const game = new GameSession({ storage: null });
    untilLetter6(game);
    expect(game.acceptLetter('letter_6')).toBe(true);
    expect(game.mode).toBe('build');
    // The game seats every socket (no hand can reach one): all 17 are filled, the sheet shows them ticked, and Wind starts.
    const assembly = CLOCK_TOWER.intended;
    expect(CLOCK_TOWER.sockets.every((s) => assembly[s.id] !== undefined)).toBe(true);
    expect(game.assemblyComplete()).toBe(true);
    const outcome = solveAssembly(CLOCK_TOWER, assembly, MAX_WIND_UNITS);
    expect(outcome.ok && outcome.result.status).toBe('runs');
    expect(game.machineRanCorrectly('clock_tower')).toBe(true);
    expect(game.mode).toBe('place');
    expect(game.save.letters.letter_6).toBe('accepted'); // run, but not placed yet
    expect(game.machinePlaced('clock_tower', 'plot_music_box')).toBe(false); // only its own plot takes it
    expect(game.machinePlaced('clock_tower', 'plot_clock_tower')).toBe(true);
    expect(game.save.letters.letter_6).toBe('completed');
    expect(game.save.machines.find((m) => m.blueprintId === 'clock_tower')).toEqual({ blueprintId: 'clock_tower', built: true, placed: true, plotId: 'plot_clock_tower' });
    expect(game.closing).toBeNull(); // Letters 7 and 8 follow (ADR-048): the closing card waits for the Belfry
    expect(game.letter?.id).toBe('letter_7');
  });

  it('does not complete on a build the solver does not run: an unfinished tower is incomplete, not run', () => {
    const outcome = solveAssembly(CLOCK_TOWER, Object.fromEntries(Object.entries(CLOCK_TOWER.intended).filter(([id]) => id !== 'pendulum')), MAX_WIND_UNITS);
    expect(outcome.ok && outcome.result.status).toBe('incomplete');
  });

  it('survives a reload: a placed tower is restored as standing, Letter 6 stays completed', () => {
    const storage = new FakeStorage();
    const game = new GameSession({ storage });
    untilLetter6(game);
    game.acceptLetter('letter_6');
    game.assemblyComplete();
    game.machineRanCorrectly('clock_tower');
    game.machinePlaced('clock_tower', 'plot_clock_tower');
    const again = new GameSession({ storage });
    expect(again.save.letters.letter_6).toBe('completed');
    expect(again.save.machines.filter((m) => m.placed).map((m) => m.blueprintId)).toContain('clock_tower');
    expect(again.mode).toBe('town');
  });
});
