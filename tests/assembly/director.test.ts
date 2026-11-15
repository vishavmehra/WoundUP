import { describe, expect, it } from 'vitest';
import { AssemblyDirector, AUTO_SEAT_GAP_S, defaultLabel, mergePlans, needsDirector } from '../../src/assembly/director';
import type { DirectorFrame, DirectorHost, StepListView } from '../../src/assembly/director';
import type { HelperCopy, HelperScene, HelperState, HelperTarget } from '../../src/assembly/helper';
import { MUSIC_BOX, planStages, repairStart, stagesOf, WINDMILL } from '../../src/content/blueprints';
import type { Assembly, StagePlan, StagesPlan } from '../../src/content/blueprints';
import type { Difficulty } from '../../src/game/content';
import { withoutCaddy } from '../../src/build-plan';

// The director on the real Music Box (design §8.1, ADR-050): stage by stage, bag by bag, with a fake bench that records what it was asked and seats what
// it is told to, the way the interaction layer would (a seating comes back as `snapped`).

const COPY: HelperCopy = { offer: 'Need a hand?', demo: 'Watch my hands', place: 'Here, let me.', wind: 'Wind it, then press Run', next: (what) => `Next: ${what}` };
const last = <T,>(list: readonly T[]): T | undefined => list[list.length - 1];
const FREE: DirectorFrame = { held: false, panelOpen: false };
const intended = MUSIC_BOX.intended;
const hardware = (id: string): boolean => MUSIC_BOX.sockets.find((s) => s.id === id)?.family === 'fastener';

class FakeScene implements HelperScene {
  readonly calls: string[] = [];
  flies = true;
  glowPart(t: HelperTarget): void {
    this.calls.push(`glow:${t.socketId}`);
  }
  pulseSocket(t: HelperTarget | null): void {
    this.calls.push(`pulse:${t === null ? 'off' : t.socketId}`);
  }
  ghostPart(t: HelperTarget): void {
    this.calls.push(`ghost:${t.socketId}`);
  }
  fly(t: HelperTarget): boolean {
    this.calls.push(`fly:${t.socketId}`);
    return this.flies;
  }
  clear(): void {
    this.calls.push('clear');
  }
  chime(): void {
    this.calls.push('chime');
  }
}

interface Event {
  readonly what: string;
  readonly at: number;
}

class Bench implements DirectorHost {
  readonly scene = new FakeScene();
  readonly events: Event[] = [];
  readonly seats: Array<{ socketId: string; at: number }> = [];
  assembly: Record<string, string> = {};
  views: StepListView[] = [];
  helperViews: HelperState[] = [];
  armed: readonly string[] = [];
  caddy: { live: readonly string[]; lamp: boolean } = { live: [], lamp: true };
  now = 0;
  director!: AssemblyDirector;
  /** Sockets `seatAuto` refuses (its carrier is gone). */
  refuse = new Set<string>();

  constructor(
    readonly level: Difficulty,
    options: { stand?: boolean; plan?: StagesPlan; repair?: boolean; faulty?: { socketId: string; partId: string } } = {},
  ) {
    const plan = options.plan ?? planStages(MUSIC_BOX, level, { intricate: true, stand: options.stand === true });
    this.director = new AssemblyDirector({
      blueprint: MUSIC_BOX,
      plan,
      host: this,
      scene: this.scene,
      copy: COPY,
      repair: options.repair,
      faulty: options.faulty,
    });
  }

  private log(what: string): void {
    this.events.push({ what, at: this.now });
  }
  openTray(index: number, _stage: StagePlan, first: boolean): void {
    this.log(`tray:${index}${first ? ':first' : ''}`);
  }
  openCaddy(index: number): void {
    this.log(`caddy:${index}`);
  }
  setArmed(armed: readonly string[], level: Difficulty): void {
    this.armed = armed;
    this.log(`armed:${level}:${armed.length}`);
  }
  setCaddy(live: readonly string[], lamp: boolean): void {
    this.caddy = { live, lamp };
  }
  setView(view: StepListView): void {
    this.views.push(view);
  }
  setHelper(state: HelperState): void {
    this.helperViews.push(state);
  }
  stageClosed(index: number): void {
    this.log(`beat:${index}`);
  }
  seatAuto(socketId: string): boolean {
    if (this.refuse.has(socketId)) return false;
    this.seats.push({ socketId, at: this.now });
    this.assembly[socketId] = intended[socketId];
    this.director.snapped(socketId, { ...this.assembly });
    return true;
  }

  get names(): string[] {
    return this.events.map((e) => e.what);
  }
  get beats(): number[] {
    return this.names.filter((n) => n.startsWith('beat:')).map((n) => Number(n.slice(5)));
  }
  get view(): StepListView {
    return this.views[this.views.length - 1];
  }
  get helperView(): HelperState {
    return this.helperViews[this.helperViews.length - 1];
  }
  begin(assembly: Assembly = {}): void {
    this.assembly = { ...assembly };
    this.director.begin({ ...this.assembly });
  }
  /** A hand seats the intended part of `socketId`. */
  place(socketId: string): void {
    this.assembly[socketId] = intended[socketId];
    this.director.snapped(socketId, { ...this.assembly });
  }
  pull(socketId: string): void {
    delete this.assembly[socketId];
    this.director.unsnapped(socketId, { ...this.assembly });
  }
  tick(seconds: number, frame: DirectorFrame = FREE, step = 0.05): void {
    for (let left = seconds; left > 1e-9; ) {
      const dt = Math.min(step, left);
      this.now += dt;
      this.director.update(dt, frame);
      left -= dt;
    }
  }
  /** The next step the engine points at, placed. False when there is none. */
  next(): boolean {
    const next = this.director.steps?.next;
    if (next === undefined) return false;
    this.place(next);
    this.tick(0.5); // the game's own seatings land
    return true;
  }
  buildAll(): number {
    let placed = 0;
    while (this.next()) placed++;
    return placed;
  }
}

describe('a Standard build in place (design §8.1)', () => {
  it('walks the seven stages: one beat each, in order, with every one of the 34 placements by hand', () => {
    const bench = new Bench('standard');
    bench.begin();
    expect(bench.buildAll()).toBe(34);
    expect(bench.beats).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(bench.director.steps?.complete).toBe(true);
    expect(bench.seats).toHaveLength(0); // nothing is seated for the player
    expect(Object.keys(bench.assembly)).toHaveLength(34);
  });

  it('opens a stage\'s bag when the one before it closes: the tray gets its big parts, the caddy its hardware, never early', () => {
    const bench = new Bench('standard');
    bench.begin();
    expect(bench.names.filter((n) => n.startsWith('tray:') || n.startsWith('caddy:'))).toEqual(['tray:0:first', 'caddy:0']);
    for (const id of stagesOf(MUSIC_BOX)[0].sockets) {
      expect(bench.names).not.toContain('tray:1');
      bench.place(id);
    }
    // The beat of stage 0 comes first, then stage 1's bag.
    const order = bench.names.filter((n) => n === 'beat:0' || n === 'tray:1' || n === 'caddy:1');
    expect(order).toEqual(['beat:0', 'tray:1', 'caddy:1']);
  });

  it('puts the step list on the sheet: seven rows with their counts, the current stage, and the step to do now and the next two', () => {
    const bench = new Bench('standard');
    bench.begin();
    expect(bench.view.stages.map((s) => s.steps)).toEqual([6, 5, 4, 3, 5, 4, 7]);
    expect(bench.view.stages.map((s) => s.done)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(bench.view.current).toBe(0);
    expect(bench.view.upcoming.map((u) => u.n)).toEqual([1, 2, 3]);
    expect(bench.view.upcoming[0].label).toBe('left bracket');
    bench.place('bracket_left');
    expect(bench.view.stages[0].done).toBe(1);
    expect(bench.view.upcoming.map((u) => u.n)).toEqual([2, 3, 4]); // the bush, the screw, the right bracket
    bench.buildAll();
    expect(bench.view.current).toBe(-1);
    expect(bench.view.upcoming).toEqual([]);
    expect(bench.view.stages.map((s) => s.done)).toEqual([6, 5, 4, 3, 5, 4, 7]);
  });

  it('numbers the steps across the machine, 1 to 34', () => {
    const bench = new Bench('standard');
    bench.begin();
    const seen: number[] = [];
    while (bench.director.steps?.next !== undefined) {
      seen.push(bench.view.upcoming[0].n);
      bench.next();
    }
    expect(seen).toEqual(Array.from({ length: 34 }, (_, i) => i + 1));
  });

  it('arms only what may take a part now', () => {
    const bench = new Bench('standard');
    bench.begin();
    expect(bench.armed).toEqual(['bracket_left', 'bracket_right']); // not the bushes: their bracket is not there yet
    bench.place('bracket_left');
    expect(bench.armed).toEqual(['bracket_left', 'bush_left', 'screw_bracket_left', 'bracket_right'].filter((id) => id !== 'bracket_left'));
    expect(bench.director.steps?.next).toBe('bush_left');
  });

  it('lights one bin at a time, the one of the first armed piece of hardware, with its lamp', () => {
    const bench = new Bench('standard');
    bench.begin();
    expect(bench.caddy).toEqual({ live: [], lamp: true }); // the first armed sockets are big parts
    bench.place('bracket_left');
    expect(bench.caddy).toEqual({ live: [intended.bush_left], lamp: true });
    bench.place('bush_left');
    expect(bench.caddy.live).toEqual([intended.screw_bracket_left]);
    // A player who does the right bracket first is not stuck: the bin follows the first armed piece of hardware, whatever the step order.
    bench.place('bracket_right');
    expect(bench.caddy.live).toEqual([intended.screw_bracket_left]);
    bench.place('screw_bracket_left');
    expect(bench.caddy.live).toEqual([intended.bush_right]);
  });

  it('opens the next stage\'s sockets only when it opens: the arbor waits for its bushes', () => {
    const bench = new Bench('standard');
    bench.begin();
    bench.place('bracket_left');
    bench.place('bracket_right');
    expect(bench.armed).not.toContain('arbor');
    for (const id of ['bush_left', 'screw_bracket_left', 'bush_right', 'screw_bracket_right']) bench.place(id);
    expect(bench.armed).toContain('arbor');
  });

  it('beats a stage again when it is taken apart and closed again, and not before it closes', () => {
    const bench = new Bench('standard');
    bench.begin();
    for (const id of stagesOf(MUSIC_BOX)[0].sockets.slice(0, 5)) bench.place(id);
    expect(bench.beats).toEqual([]);
    bench.place('screw_bracket_right');
    expect(bench.beats).toEqual([0]);
    bench.pull('screw_bracket_right');
    expect(bench.beats).toEqual([0]);
    bench.place('screw_bracket_right');
    expect(bench.beats).toEqual([0, 0]);
  });
});

describe('the Helper pointed by the step engine', () => {
  it('points at the first armed socket, then at the key when everything stands', () => {
    const bench = new Bench('standard');
    bench.begin();
    expect(bench.director.helperPressed(false, true)).toBe('show');
    expect(bench.scene.calls).toContain('glow:bracket_left');
    expect(bench.helperView.slip).toBe('Next: the left bracket');
    bench.buildAll();
    bench.tick(2);
    expect(bench.director.helperPressed(false, true)).toBe('show');
    expect(bench.scene.calls).toContain('glow:winding_key');
    expect(bench.helperView.slip).toBe('Wind it, then press Run');
  });

  it('runs the whole ladder through the director hook, and places one part only', () => {
    const bench = new Bench('standard');
    bench.begin();
    expect(bench.director.helperPressed(false, true)).toBe('show');
    bench.tick(2);
    expect(bench.director.helperPressed(false, true)).toBe('demo');
    bench.tick(2);
    expect(bench.director.helperPressed(false, true)).toBe('place');
    expect(bench.scene.calls.filter((c) => c.startsWith('fly:'))).toEqual(['fly:bracket_left']);
    // The flight lands as a hand's seating does: progress, and the ladder starts again on the next step.
    bench.place('bracket_left');
    bench.tick(2);
    expect(bench.director.helperPressed(false, true)).toBe('show');
    expect(bench.scene.calls.filter((c) => c.startsWith('fly:'))).toHaveLength(1);
  });

  it('does not mistake the dependency bounce for progress: a socket it never saw filled changes nothing', () => {
    const bench = new Bench('standard');
    bench.begin();
    bench.director.wrong();
    bench.director.wrong();
    bench.director.unsnapped('arbor', {}); // the game loop took SnappedTo off a part it had not accepted
    expect(bench.director.ladder.wrongAttempts).toBe(2);
    bench.director.wrong();
    bench.tick(0.1);
    expect(bench.helperView.offer).toBe(true);
  });

  it('is told of wrong attempts and offers itself after three in Standard, and after progress takes the offer back', () => {
    const bench = new Bench('standard');
    bench.begin();
    for (let i = 0; i < 3; i++) bench.director.wrong();
    bench.tick(0.1);
    expect(bench.helperView).toEqual({ offer: true, slip: 'Need a hand?' });
    bench.place('bracket_left');
    expect(bench.helperView).toEqual({ offer: false, slip: null });
  });

  it('offers after 35 s of quiet, not while a hand holds a part, and never in Master', () => {
    const quiet = new Bench('standard');
    quiet.begin();
    quiet.tick(34);
    expect(quiet.helperView.offer).toBe(false);
    quiet.tick(2);
    expect(quiet.helperView.offer).toBe(true);

    const holding = new Bench('standard');
    holding.begin();
    holding.tick(120, { held: true, panelOpen: false });
    expect(holding.helperView.offer).toBe(false);

    const master = new Bench('master');
    master.begin();
    for (let i = 0; i < 10; i++) master.director.wrong();
    master.tick(200);
    expect(master.helperView.offer).toBe(false);
  });

  it('points at the faulty socket of a repair for the correct part, not at the wind step of a machine that is complete', () => {
    const repair = repairStart({ blueprintId: 'music_box', faultyPartId: 'spring_worn_brass', correctPartId: 'spring_standard_brass' });
    expect(repair).toBeDefined();
    const start = repair?.assembly ?? {};
    const bench = new Bench('standard', { repair: true, faulty: { socketId: 'main_spring', partId: 'spring_worn_brass' } });
    bench.assembly = { ...start };
    bench.director.begin({ ...start });
    // No bags, no stage beats: the machine starts built.
    expect(bench.names.filter((n) => n.startsWith('tray:') || n.startsWith('caddy:') || n.startsWith('beat:'))).toEqual([]);
    bench.director.helperPressed(false, true);
    expect(bench.scene.calls).toContain('glow:main_spring');
    expect(bench.helperView.slip).toBe('Next: the main spring');
    // The unit comes out as one (a spring takes its washer, pinion, pin, key and key screw), and the engine now arms the spring's socket.
    const unit = repair?.unlocked ?? [];
    expect(unit).toContain('winding_key');
    for (const id of [...unit].reverse()) {
      delete bench.assembly[id];
    }
    bench.director.unsnapped('main_spring', { ...bench.assembly });
    expect(bench.director.steps?.next).toBe('main_spring');
    expect(bench.director.steps?.complete).toBe(false);
    // The correct unit goes back (the bundle arrives seated), and the step is the winding.
    for (const id of unit) bench.assembly[id] = intended[id];
    bench.director.snapped('main_spring', { ...bench.assembly });
    expect(bench.director.steps?.complete).toBe(true);
    bench.tick(2);
    bench.director.helperPressed(false, true);
    expect(bench.scene.calls).toContain('glow:winding_key');
    expect(bench.beats).toEqual([]);
  });
});

describe('Master (design §6.1, §3.5)', () => {
  it('puts every tray out at the start and only the current stage\'s bins in the caddy, with no lamp', () => {
    const bench = new Bench('master');
    bench.begin();
    expect(bench.names.filter((n) => n.startsWith('tray:'))).toEqual(['tray:0:first', 'tray:1', 'tray:2', 'tray:3', 'tray:4', 'tray:5', 'tray:6']);
    expect(bench.names.filter((n) => n.startsWith('caddy:'))).toEqual(['caddy:0']);
    // Stage 1 needs bushes and screws: both bins are live at once, unlit.
    expect(bench.caddy).toEqual({ live: [intended.bush_left, intended.screw_bracket_left], lamp: false });
    expect(bench.armed).toHaveLength(2); // arming still gates, invisibly
    expect(bench.names).toContain('armed:master:2');
  });

  it('still answers a press', () => {
    const bench = new Bench('master');
    bench.begin();
    expect(bench.director.helperPressed(false, true)).toBe('show');
  });

  it('opens the rest of the trays when the player switches up to Master mid-build', () => {
    const bench = new Bench('standard');
    bench.begin();
    bench.place('bracket_left');
    expect(bench.names.filter((n) => n.startsWith('tray:'))).toEqual(['tray:0:first']);
    bench.director.setDifficulty('master', { ...bench.assembly });
    expect(bench.names.filter((n) => n.startsWith('tray:'))).toEqual(['tray:0:first', 'tray:1', 'tray:2', 'tray:3', 'tray:4', 'tray:5', 'tray:6']);
    expect(bench.caddy.lamp).toBe(false);
  });
});

describe('Relaxed: the game seats the hardware (design §6.1)', () => {
  it('seats the anchor at the start, then the hardware of each part as it lands, 120 ms apart, and never lights a bin', () => {
    const bench = new Bench('relaxed');
    bench.begin();
    bench.tick(0.2, FREE, 0.01);
    expect(bench.seats.map((s) => s.socketId)).toEqual(['anchor_spring']);
    bench.place('bracket_left');
    bench.tick(1, FREE, 0.01);
    expect(bench.seats.map((s) => s.socketId)).toEqual(['anchor_spring', 'bush_left', 'screw_bracket_left']);
    const gap = bench.seats[2].at - bench.seats[1].at;
    expect(gap).toBeGreaterThan(AUTO_SEAT_GAP_S - 0.015); // 120 ms in the director's time, to the frame (10 ms here)
    expect(gap).toBeLessThan(AUTO_SEAT_GAP_S + 0.015);
    expect(bench.caddy).toEqual({ live: [], lamp: true });
  });

  it('builds the whole box in 12 placements, with the 22 pieces of hardware seated by the game, and beats every stage', () => {
    const bench = new Bench('relaxed');
    bench.begin();
    bench.tick(0.5);
    expect(bench.buildAll()).toBe(12);
    expect(bench.seats).toHaveLength(22);
    expect(Object.keys(bench.assembly)).toHaveLength(34);
    expect(bench.beats).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(bench.view.stages.map((s) => s.steps)).toEqual([2, 2, 1, 1, 1, 2, 3]);
    expect(bench.view.upcoming).toEqual([]);
    expect(bench.director.seatingAuto).toBe(false);
  });

  it('seats a piece of hardware once, in order: a screw on a clip on the comb waits for its clip', () => {
    const bench = new Bench('relaxed');
    bench.begin();
    bench.tick(0.5);
    for (const id of ['bracket_left', 'bracket_right', 'arbor', 'governor_wheel', 'cylinder', 'cylinder_wheel']) {
      bench.place(id);
      bench.tick(2);
    }
    bench.place('comb');
    bench.tick(2);
    const seated = bench.seats.map((s) => s.socketId);
    expect(seated.indexOf('clip_comb_l')).toBeLessThan(seated.indexOf('screw_clip_l'));
    expect(seated.indexOf('clip_comb_r')).toBeLessThan(seated.indexOf('screw_clip_r'));
    expect(new Set(seated).size).toBe(seated.length);
  });

  it('takes a part\'s queued hardware back when the part is pulled before it was seated', () => {
    const bench = new Bench('relaxed');
    bench.begin();
    bench.tick(0.5);
    bench.place('bracket_left');
    bench.pull('bracket_left'); // before a single frame ran
    bench.tick(1);
    expect(bench.seats.map((s) => s.socketId)).toEqual(['anchor_spring']);
  });

  it('drops a seating the host refuses, without stalling the rest', () => {
    const bench = new Bench('relaxed');
    bench.refuse.add('bush_left');
    bench.begin();
    bench.tick(0.5);
    bench.place('bracket_left');
    bench.tick(1);
    expect(bench.seats.map((s) => s.socketId)).toEqual(['anchor_spring', 'screw_bracket_left']);
  });

  it('is not made progress by its own seatings: a Show cue survives the game seating a screw', () => {
    const bench = new Bench('relaxed');
    bench.begin();
    bench.tick(0.5);
    bench.place('bracket_left');
    bench.director.helperPressed(false, true);
    const clears = bench.scene.calls.filter((c) => c === 'clear').length;
    bench.tick(1); // the bush and the screw land
    expect(bench.seats.map((s) => s.socketId)).toContain('screw_bracket_left');
    expect(bench.scene.calls.filter((c) => c === 'clear').length).toBe(clears);
    expect(bench.director.ladder.rungReached).toBe(1);
  });
});

describe('changing the level mid-build (design §6.1)', () => {
  it('down to Relaxed turns the stages not yet opened into Relaxed stages and leaves the one that is open', () => {
    const bench = new Bench('standard');
    bench.begin();
    bench.place('bracket_left');
    bench.director.setDifficulty('relaxed', { ...bench.assembly });
    const plan = bench.director.currentPlan;
    expect(plan.stages[0].byHand).toHaveLength(6); // stage 1 is open: its hardware is still the player's
    expect(plan.stages[1].byHand.some(hardware)).toBe(false);
    expect(plan.stages[6].byHand.some(hardware)).toBe(false);
    expect(plan.auto).not.toContain('bush_left');
    expect(plan.auto).toContain('pin_governor_wheel');
    expect(bench.director.difficulty).toBe('relaxed');
    // It carries on and finishes: 6 by hand in stage 1, then the 12 - 2 = 10 big parts, hardware seated by the game.
    bench.tick(0.5);
    expect(bench.buildAll()).toBe(5 + 10);
    expect(bench.director.steps?.complete).toBe(true);
    expect(bench.beats).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('up from Relaxed affects only the stages not yet opened', () => {
    const bench = new Bench('relaxed');
    bench.begin();
    bench.tick(0.5);
    bench.place('bracket_left');
    bench.place('bracket_right');
    bench.tick(1);
    expect(bench.director.steps?.stage).toBe(1);
    bench.director.setDifficulty('standard', { ...bench.assembly });
    const plan = bench.director.currentPlan;
    expect(plan.stages[0].byHand).toHaveLength(2); // what was built stays built
    expect(plan.stages[1].byHand.some(hardware)).toBe(false); // stage 2 is open: it stays the Relaxed stage it was opened as
    expect(plan.stages[2].byHand.some(hardware)).toBe(true); // the stages after it follow the new level
    expect(plan.stages[6].byHand.filter(hardware)).toHaveLength(4);
    expect(plan.auto).toContain('pin_governor_wheel');
    expect(plan.auto).not.toContain('collar_cylinder_l');
  });

  it('mergePlans: opened stages keep their plan and the rest follow the new one', () => {
    const standard = planStages(MUSIC_BOX, 'standard', { intricate: true });
    const relaxed = planStages(MUSIC_BOX, 'relaxed', { intricate: true });
    const merged = mergePlans(MUSIC_BOX, standard, relaxed, 2);
    expect(merged.stages.slice(0, 3).map((s) => s.byHand.length)).toEqual([6, 5, 4]);
    expect(merged.stages.slice(3).map((s) => s.byHand.length)).toEqual([1, 1, 2, 3]);
    expect(merged.auto.every((id) => merged.stages.slice(3).some((s) => s.auto.includes(id)))).toBe(true);
    expect(merged.difficulty).toBe('relaxed');
    // The bundles of a carrier are in blueprint order, so a clip lands before its screw.
    expect(merged.bundles.comb).toEqual(['clip_comb_l', 'screw_clip_l', 'clip_comb_r', 'screw_clip_r']);
  });
});

describe('a build on the shaft stand (P1, design §3.3, §8.1)', () => {
  it('points at the carry when a unit is finished, and the stage closes when the unit is in the case', () => {
    const bench = new Bench('standard', { stand: true });
    bench.begin();
    for (const id of stagesOf(MUSIC_BOX)[0].sockets) bench.place(id);
    // The arbor goes on the stand: present for the sockets it carries, though the case's socket is empty.
    bench.director.unitOnStand('arbor', true, { ...bench.assembly });
    expect(bench.director.steps?.next).toBe('governor_wheel');
    const unitSockets = ['governor_wheel', 'pin_governor_wheel', 'washer_arbor_l1', 'washer_arbor_l2', 'cylinder', 'collar_cylinder_l', 'collar_cylinder_r', 'washer_arbor_r1', 'washer_arbor_r2', 'cylinder_wheel', 'pin_cylinder_wheel'];
    for (const id of unitSockets) {
      expect(bench.director.steps?.armed).toContain(id);
      bench.place(id);
    }
    expect(bench.director.steps?.carry).toBe('arbor');
    expect(bench.view.upcoming[0].label).toContain('arbor');
    expect(bench.beats).toEqual([0, 1, 2]); // the last stage of the unit is not closed until the unit is carried
    expect(bench.director.ladder.rungReached).toBe(0);
    expect(bench.director.helperPressed(true, true)).toBe('place');
    expect(last(bench.scene.calls)).toBe('fly:arbor'); // the Helper carries the unit into the case
    // Lifted off the stand and carried: nothing to tell the director, the unit is still on the stand's books and its stages stay closed in the hand.
    bench.tick(3);
    expect(bench.beats).toEqual([0, 1, 2]);
    bench.place('arbor');
    expect(bench.beats).toEqual([0, 1, 2, 3]);
    expect(bench.director.steps?.carry).toBeUndefined();
    expect(bench.director.steps?.next).toBe('comb');
  });
});

describe('the lifecycle', () => {
  it('puts everything away on end and ignores the hooks after it', () => {
    const bench = new Bench('standard');
    bench.begin();
    bench.place('bracket_left');
    bench.director.end();
    expect(bench.armed).toEqual([]);
    expect(bench.caddy).toEqual({ live: [], lamp: false });
    expect(bench.helperView).toEqual({ offer: false, slip: null });
    expect(last(bench.scene.calls)).toBe('clear');
    const events = bench.events.length;
    bench.place('bush_left');
    bench.director.wrong();
    bench.tick(100);
    expect(bench.events).toHaveLength(events);
    expect(bench.director.helperPressed(false, true)).toBe('none');
  });

  it('starts a second build from nothing', () => {
    const bench = new Bench('standard');
    bench.begin();
    for (let i = 0; i < 3; i++) bench.director.wrong();
    bench.place('bracket_left');
    bench.director.end();
    bench.begin();
    expect(bench.director.steps?.next).toBe('bracket_left');
    expect(bench.director.ladder.wrongAttempts).toBe(0);
    expect(bench.names.filter((n) => n === 'tray:0:first')).toHaveLength(2);
  });

  it('pushes the sheet, the armed set and the caddy only when they change', () => {
    const bench = new Bench('standard');
    bench.begin();
    const views = bench.views.length;
    const armed = bench.names.filter((n) => n.startsWith('armed:')).length;
    bench.tick(5);
    bench.director.wrong();
    bench.director.unsnapped('bracket_left', {}); // nothing was seated: the engine's answer is the same
    expect(bench.views).toHaveLength(views);
    expect(bench.names.filter((n) => n.startsWith('armed:'))).toHaveLength(armed);
  });

  it('knows which builds it directs: the Music Box in the intricate assembly, nothing else', () => {
    expect(needsDirector(MUSIC_BOX, planStages(MUSIC_BOX, 'standard', { intricate: true }))).toBe(true);
    expect(needsDirector(MUSIC_BOX, planStages(MUSIC_BOX, 'standard', { intricate: false }))).toBe(false); // INTRICATE_ASSEMBLY false: today's build
    expect(needsDirector(WINDMILL, planStages(WINDMILL, 'standard', { intricate: true }))).toBe(false); // no stages: built as it always was
  });

  it('words a socket as the player would: the side first, the role for hardware', () => {
    const byId = (id: string) => MUSIC_BOX.sockets.find((s) => s.id === id) ?? MUSIC_BOX.sockets[0];
    expect(defaultLabel(byId('bracket_left'))).toBe('left bracket');
    expect(defaultLabel(byId('bush_right'))).toBe('right bracket bush');
    expect(defaultLabel(byId('collar_cylinder_l'))).toBe('left cylinder collar');
    expect(defaultLabel(byId('clip_comb_l'))).toBe('left comb clip');
    expect(defaultLabel(byId('screw_clip_r'))).toBe('right comb clip screw');
    expect(defaultLabel(byId('governor_wheel'))).toBe('governor wheel');
  });
});

describe('a bench whose caddy did not load (withoutCaddy)', () => {
  for (const level of ['standard', 'master'] as const) {
    it(`finishes at ${level}: the player places the 12 big parts and the game seats the hardware, as in Relaxed, even after a level change in Pause`, () => {
      const bench = new Bench(level, { plan: withoutCaddy(MUSIC_BOX, planStages(MUSIC_BOX, level, { intricate: true })) });
      bench.begin();
      bench.tick(0.5);
      expect(bench.director.difficulty).toBe(level); // the Helper and the rings keep the level
      expect(bench.director.currentPlan.stages.some((st) => st.bag.hardware.length > 0)).toBe(false); // no bin is asked for a pin
      bench.place('bracket_left');
      bench.tick(0.5);
      bench.director.setDifficulty(level === 'master' ? 'standard' : 'master', { ...bench.assembly }); // Pause, mid-build
      expect(bench.director.currentPlan.stages.some((st) => st.byHand.some(hardware))).toBe(false); // still the game's hardware
      expect(1 + bench.buildAll()).toBe(12);
      expect(bench.director.steps?.complete).toBe(true);
    });
  }

  it('would have left a Standard build unfinishable: the plan with a caddy asks a bin for 22 pieces of hardware', () => {
    expect(planStages(MUSIC_BOX, 'standard', { intricate: true }).stages.flatMap((st) => st.bag.hardware)).toHaveLength(22);
  });
});
