import { describe, expect, it } from 'vitest';
import { HELPER_COOLDOWN_S, Helper, IDLE_PULSE_S, LADDER_WINDOW_S, OFFER_RULES, REOFFER_WAIT_S, SLIP_S } from '../../src/assembly/helper';
import type { GhostHands, HelperCopy, HelperFrame, HelperScene, HelperTarget } from '../../src/assembly/helper';
import type { Difficulty } from '../../src/game/content';

// The press ladder and the offers of the Helper (design §7, §6.1, ADR-050): pure, so every case runs on a fake scene and a hand-turned clock.

const COPY: HelperCopy = { offer: 'Need a hand?', demo: 'Watch my hands', place: 'Here, let me.', wind: 'Wind it, then press Run', next: (what) => `Next: ${what}` };

const PLACE: HelperTarget = { kind: 'place', socketId: 'bracket_left', partId: 'bracket_support_brass', label: 'left bracket', hardware: false };
const OTHER: HelperTarget = { kind: 'place', socketId: 'bush_left', partId: 'bush_split_8_brass', label: 'left bracket bush', hardware: true };
const CARRY: HelperTarget = { kind: 'carry', socketId: 'arbor', partId: 'shaft_short_brass', label: 'arbor', hardware: false };
const WIND: HelperTarget = { kind: 'wind', socketId: 'winding_key', partId: 'winding_key_brass', label: 'winding key', hardware: false };

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
  count(prefix: string): number {
    return this.calls.filter((c) => c === prefix || c.startsWith(`${prefix}:`)).length;
  }
}

class FakeHands implements GhostHands {
  readonly played: string[] = [];
  stops = 0;
  canShow = true;
  demonstrate(t: HelperTarget): boolean {
    this.played.push(t.socketId);
    return this.canShow;
  }
  stop(): void {
    this.stops++;
  }
}

const last = <T,>(list: readonly T[]): T | undefined => list[list.length - 1];

const FREE: HelperFrame = { held: false, panelOpen: false };
const HELD: HelperFrame = { held: true, panelOpen: false };
const PANEL: HelperFrame = { held: false, panelOpen: true };

function make(level: Difficulty = 'standard', withHands = false) {
  const scene = new FakeScene();
  const hands = withHands ? new FakeHands() : undefined;
  const helper = new Helper(scene, COPY, level, hands);
  helper.setTarget(PLACE);
  /** Runs `seconds` of free frames, a second at a time (the clock is turned by hand). */
  const wait = (seconds: number, frame: HelperFrame = FREE): void => {
    for (let left = seconds; left > 0; left -= 1) helper.tick(Math.min(1, left), frame);
  };
  return { scene, hands, helper, wait };
}

describe('the press ladder (design §7.2)', () => {
  it('shows on the first press, demonstrates on the second and places on the third', () => {
    const { scene, helper, wait } = make('standard', true);
    expect(helper.press(false, true)).toBe('show');
    expect(scene.calls).toEqual(['clear', 'glow:bracket_left', 'pulse:bracket_left']);
    wait(HELPER_COOLDOWN_S + 0.1);
    expect(helper.press(false, true)).toBe('demo');
    wait(HELPER_COOLDOWN_S + 0.1);
    expect(scene.count('fly')).toBe(0);
    expect(helper.press(false, true)).toBe('place');
    expect(scene.count('fly')).toBe(1);
    expect(last(scene.calls)).toBe('fly:bracket_left');
  });

  it('plays the ghost hands for the exact move on the second press, and a ghost of the part at the socket when they are not there', () => {
    const withHands = make('standard', true);
    withHands.helper.press(false, true);
    withHands.wait(2);
    withHands.helper.press(false, true);
    expect(withHands.hands?.played).toEqual(['bracket_left']);
    expect(withHands.scene.count('ghost')).toBe(0);

    const without = make('standard');
    without.helper.press(false, true);
    without.wait(2);
    expect(without.helper.press(false, true)).toBe('demo');
    expect(without.scene.calls).toContain('ghost:bracket_left');
    expect(last(without.scene.calls)).toBe('pulse:bracket_left');

    const refused = make('standard', true);
    if (refused.hands) refused.hands.canShow = false;
    refused.helper.press(false, true);
    refused.wait(2);
    refused.helper.press(false, true);
    expect(refused.scene.calls).toContain('ghost:bracket_left'); // the hands could not show it: the fallback stands in
  });

  it('is inert for 1.2 s after a press: a second press inside the cooldown does nothing and the ladder does not move', () => {
    const { scene, helper, wait } = make('standard', true);
    expect(helper.press(false, true)).toBe('show');
    wait(0.5);
    expect(helper.press(false, true)).toBe('none');
    expect(helper.rungReached).toBe(1);
    wait(HELPER_COOLDOWN_S);
    expect(helper.press(false, true)).toBe('demo');
    expect(scene.count('glow')).toBe(1);
  });

  it('starts again at Show when the next press comes more than 20 s after the one before', () => {
    const { helper, wait } = make();
    helper.press(false, true);
    wait(LADDER_WINDOW_S + 1);
    expect(helper.press(false, true)).toBe('show');
    wait(HELPER_COOLDOWN_S + 0.1);
    wait(LADDER_WINDOW_S - 2);
    expect(helper.press(false, true)).toBe('demo'); // inside the window it continues
  });

  it('goes straight to Place on a long press in hands mode, and treats a long press elsewhere as a press', () => {
    const hands = make();
    expect(hands.helper.press(true, true)).toBe('place');
    const gaze = make();
    expect(gaze.helper.press(true, false)).toBe('show');
  });

  it('falls back to Show when there is nothing to fly (no live part, no free socket)', () => {
    const { scene, helper, wait } = make();
    scene.flies = false;
    helper.press(false, true);
    wait(2);
    helper.press(false, true);
    wait(2);
    expect(helper.press(false, true)).toBe('show');
    expect(helper.rungReached).toBe(1);
  });

  it('never places the wind step: a Show, a Demonstrate, and the third press cycles back to Show', () => {
    const { scene, helper, wait } = make();
    helper.setTarget(WIND);
    expect(helper.press(false, true)).toBe('show');
    wait(2);
    expect(helper.press(false, true)).toBe('demo');
    wait(2);
    expect(helper.press(false, true)).toBe('show');
    wait(2);
    expect(helper.press(true, true)).toBe('demo'); // a long press is only a press here: it never goes to Place
    expect(scene.count('fly')).toBe(0);
  });

  it('flies a carry like a placement', () => {
    const { scene, helper } = make();
    helper.setTarget(CARRY);
    expect(helper.press(true, true)).toBe('place');
    expect(last(scene.calls)).toBe('fly:arbor');
  });

  it('has nothing to point at when there is no target: the press is ignored and costs no cooldown', () => {
    const { helper, wait } = make();
    helper.setTarget(null);
    expect(helper.press(false, true)).toBe('none');
    helper.setTarget(PLACE);
    wait(0.1);
    expect(helper.press(false, true)).toBe('show');
  });

  it('starts the ladder again on progress, but not the cooldown', () => {
    const { scene, helper, wait } = make();
    helper.press(false, true);
    wait(0.3);
    helper.progress();
    expect(helper.rungReached).toBe(0);
    expect(last(scene.calls)).toBe('clear'); // the cues go with the step they were for
    expect(helper.press(false, true)).toBe('none'); // still cooling down: the next piece is the player's choice
    wait(HELPER_COOLDOWN_S);
    expect(helper.press(false, true)).toBe('show'); // and it is Show again, not Demonstrate
  });

  it('starts the ladder again when the step it points at changes', () => {
    const { helper, wait } = make();
    helper.press(false, true);
    wait(2);
    helper.setTarget(OTHER);
    expect(helper.press(false, true)).toBe('show');
  });
});

describe('the slip above the medallion (design §7.1)', () => {
  it('names the step on Show, says what is happening on Demonstrate and Place, and goes after a few seconds', () => {
    const { helper, wait } = make('standard', true);
    helper.press(false, true);
    expect(helper.view.slip).toBe('Next: the left bracket');
    wait(2);
    helper.press(false, true);
    expect(helper.view.slip).toBe('Watch my hands');
    wait(2);
    helper.press(false, true);
    expect(helper.view.slip).toBe('Here, let me.');
    wait(SLIP_S + 1);
    expect(helper.view.slip).toBeNull();
  });

  it('says how to wind on the wind step', () => {
    const { helper } = make();
    helper.setTarget(WIND);
    helper.press(false, true);
    expect(helper.view.slip).toBe('Wind it, then press Run');
  });

  it('is the same object until something changes, so a frame loop allocates nothing', () => {
    const { helper, wait } = make();
    const first = helper.view;
    wait(5);
    expect(helper.view).toBe(first);
    helper.press(false, true);
    expect(helper.view).not.toBe(first);
    const shown = helper.view;
    helper.tick(0.016, FREE);
    expect(helper.view).toBe(shown);
  });
});

describe('the offers (design §6.1, §7.3)', () => {
  it('table: 3 wrong or 35 s in Standard, 2 or 20 in Relaxed, never in Master', () => {
    expect(OFFER_RULES.standard).toEqual({ wrong: 3, idleS: 35 });
    expect(OFFER_RULES.relaxed).toEqual({ wrong: 2, idleS: 20 });
    expect(OFFER_RULES.master).toBeNull();
    expect(IDLE_PULSE_S).toEqual({ relaxed: 12, standard: 20, master: null });
  });

  it('offers itself in Standard after 3 wrong attempts, as a glow and the line "Need a hand?"', () => {
    const { helper } = make('standard');
    helper.wrong();
    helper.wrong();
    helper.tick(0.016, FREE);
    expect(helper.view.offer).toBe(false);
    helper.wrong();
    helper.tick(0.016, FREE);
    expect(helper.view).toEqual({ offer: true, slip: 'Need a hand?' });
  });

  it('offers itself after 35 s without progress in Standard, and 20 s in Relaxed', () => {
    const standard = make('standard');
    standard.wait(34);
    expect(standard.helper.view.offer).toBe(false);
    standard.wait(2);
    expect(standard.helper.view.offer).toBe(true);

    const relaxed = make('relaxed');
    relaxed.wait(19);
    expect(relaxed.helper.view.offer).toBe(false);
    relaxed.wait(2);
    expect(relaxed.helper.view.offer).toBe(true);
  });

  it('offers after 2 wrong attempts in Relaxed', () => {
    const { helper } = make('relaxed');
    helper.wrong();
    helper.wrong();
    helper.tick(0.016, FREE);
    expect(helper.view.offer).toBe(true);
  });

  it('never offers in Master, however many mistakes or how long the silence; it still answers a press', () => {
    const { helper, wait } = make('master');
    for (let i = 0; i < 20; i++) helper.wrong();
    wait(600);
    expect(helper.view).toEqual({ offer: false, slip: null });
    expect(helper.press(false, true)).toBe('show');
  });

  it('waits while a hand holds a part: a held part pauses the idle clock', () => {
    const { helper, wait } = make('standard');
    wait(30);
    wait(60, HELD);
    expect(helper.idleSeconds).toBe(30);
    expect(helper.view.offer).toBe(false);
    wait(6);
    expect(helper.view.offer).toBe(true);
  });

  it('is put away by progress, which also clears the counters', () => {
    const { helper, wait } = make('standard');
    for (let i = 0; i < 3; i++) helper.wrong();
    wait(1);
    expect(helper.view.offer).toBe(true);
    helper.progress();
    expect(helper.view).toEqual({ offer: false, slip: null });
    expect(helper.wrongAttempts).toBe(0);
    expect(helper.idleSeconds).toBe(0);
    wait(30);
    expect(helper.view.offer).toBe(false);
  });

  it('is answered by a press, and the next offer for the same step waits 60 s', () => {
    const { helper, wait } = make('standard');
    for (let i = 0; i < 3; i++) helper.wrong();
    wait(1);
    expect(helper.view.offer).toBe(true);
    helper.press(false, true);
    expect(helper.view.offer).toBe(false);
    wait(REOFFER_WAIT_S - 5);
    expect(helper.view.offer).toBe(false); // wrong attempts are still 3, but it is quiet
    wait(10);
    expect(helper.view.offer).toBe(true);
  });

  it('is put away by a panel, which starts the counters again and holds the offer back 60 s', () => {
    const { helper, wait } = make('standard');
    for (let i = 0; i < 3; i++) helper.wrong();
    wait(1);
    expect(helper.view.offer).toBe(true);
    wait(1, PANEL);
    expect(helper.view.offer).toBe(false);
    expect(helper.wrongAttempts).toBe(0);
    wait(30);
    expect(helper.view.offer).toBe(false);
    for (let i = 0; i < 3; i++) helper.wrong();
    wait(10);
    expect(helper.view.offer).toBe(false); // the new mistakes are still inside the 60 s
    wait(REOFFER_WAIT_S);
    expect(helper.view.offer).toBe(true);
  });

  it('does not count time while a panel is up', () => {
    const { helper, wait } = make('standard');
    wait(10);
    wait(100, PANEL);
    expect(helper.idleSeconds).toBe(0);
  });

  it('chimes once, on the first offer of a build, and again only after a reset', () => {
    const { scene, helper, wait } = make('relaxed');
    wait(25);
    expect(scene.count('chime')).toBe(1);
    helper.progress();
    wait(25);
    expect(helper.view.offer).toBe(true);
    expect(scene.count('chime')).toBe(1);
    helper.reset();
    helper.setTarget(PLACE);
    wait(25);
    expect(scene.count('chime')).toBe(2);
  });

  it('has nothing to offer help with when there is no step to point at', () => {
    const { helper, wait } = make('standard');
    helper.setTarget(null);
    for (let i = 0; i < 5; i++) helper.wrong();
    wait(100);
    expect(helper.view.offer).toBe(false);
  });

  it('drops the offer when the level changes to Master', () => {
    const { helper, wait } = make('standard');
    wait(40);
    expect(helper.view.offer).toBe(true);
    helper.setLevel('master');
    expect(helper.view.offer).toBe(false);
    wait(100);
    expect(helper.view.offer).toBe(false);
  });
});

describe('the idle pulse (INTERACTION_SPEC §17, design §6.1)', () => {
  it('lights the current socket silently after 20 s in Standard, 12 s in Relaxed, and never in Master', () => {
    const standard = make('standard');
    standard.wait(19);
    expect(standard.scene.count('pulse')).toBe(0);
    standard.wait(2);
    expect(standard.scene.calls).toContain('pulse:bracket_left');

    const relaxed = make('relaxed');
    relaxed.wait(13);
    expect(relaxed.scene.calls).toContain('pulse:bracket_left');

    const master = make('master');
    master.wait(300);
    expect(master.scene.count('pulse')).toBe(0);
  });

  it('pulses a step once, and not the wind step (its cue is the key and the hands)', () => {
    const { scene, helper, wait } = make('standard');
    wait(40);
    expect(scene.count('pulse')).toBe(1);
    helper.setTarget(WIND);
    wait(40);
    expect(scene.count('pulse')).toBe(1);
  });
});

describe('what it keeps', () => {
  it('keeps nothing between builds: reset forgets the counters, the ladder and the quiet', () => {
    const { helper, wait } = make('standard');
    for (let i = 0; i < 3; i++) helper.wrong();
    helper.press(false, true);
    wait(5);
    helper.reset();
    helper.setTarget(PLACE);
    expect(helper.wrongAttempts).toBe(0);
    expect(helper.idleSeconds).toBe(0);
    expect(helper.rungReached).toBe(0);
    expect(helper.view).toEqual({ offer: false, slip: null });
    expect(helper.press(false, true)).toBe('show'); // no cooldown carried over
  });

  it('has no persistent fields: it never touches storage, a save or a counter outside itself', () => {
    const source = Object.keys(new Helper(new FakeScene(), COPY, 'standard')).join(' ');
    expect(source).not.toMatch(/save|storage|telemetry|analytics|score|tally/i);
  });
});
