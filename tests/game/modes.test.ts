import { describe, expect, it } from 'vitest';
import { canTransition, MODE_ACTIONS, MODES, modeState, transition, type Mode, type ModeAction } from '../../src/game/modes';

/** Every legal plain transition, written out independently of the implementation's table. */
const LEGAL: ReadonlyArray<readonly [Mode, ModeAction, Mode]> = [
  ['intro', 'open-trunk', 'town'],
  ['town', 'begin-build', 'build'],
  ['town', 'open-gift', 'gift'],
  ['build', 'assembly-complete', 'wind'],
  ['wind', 'machine-ran', 'place'],
  ['wind', 'back-to-build', 'build'],
  ['place', 'machine-placed', 'town'],
  ['gift', 'close-gift', 'town'],
];

const NON_PAUSE = MODES.filter((m) => m !== 'pause');

describe('mode state machine', () => {
  it('starts with no pause bookkeeping', () => {
    expect(modeState('intro')).toEqual({ mode: 'intro', resume: null, restartArmed: false });
  });

  it.each(LEGAL)('%s --%s--> %s', (from, action, to) => {
    const next = transition(modeState(from), action);
    expect(next.mode).toBe(to);
    expect(next.resume).toBeNull();
    expect(canTransition(modeState(from), action)).toBe(true);
  });

  it('refuses every other plain transition by returning the same state object', () => {
    const legal = new Set(LEGAL.map(([from, action]) => `${from}:${action}`));
    for (const from of NON_PAUSE) {
      for (const action of MODE_ACTIONS) {
        if (legal.has(`${from}:${action}`) || action === 'pause') continue;
        const state = modeState(from);
        expect(transition(state, action), `${from} + ${action}`).toBe(state);
        expect(canTransition(state, action)).toBe(false);
      }
    }
  });

  it('canTransition always agrees with transition, for every state and action', () => {
    const states = [
      ...NON_PAUSE.map(modeState),
      ...NON_PAUSE.flatMap((m) => [transition(modeState(m), 'pause'), transition(transition(modeState(m), 'pause'), 'request-restart')]),
    ];
    expect(states).toHaveLength(NON_PAUSE.length * 3);
    for (const state of states) {
      for (const action of MODE_ACTIONS) {
        expect(canTransition(state, action), `${state.mode} armed=${state.restartArmed} + ${action}`).toBe(transition(state, action) !== state);
      }
    }
  });

  it('walks the whole core loop in order', () => {
    let s = modeState('intro');
    for (const action of ['open-trunk', 'begin-build', 'assembly-complete', 'machine-ran', 'machine-placed'] as const) {
      const next = transition(s, action);
      expect(next, action).not.toBe(s);
      s = next;
    }
    expect(s.mode).toBe('town');
  });

  it('lets a wrong or jammed machine go back to Build and try again', () => {
    let s = modeState('wind');
    s = transition(s, 'back-to-build');
    expect(s.mode).toBe('build');
    expect(transition(s, 'assembly-complete').mode).toBe('wind');
  });

  describe('pause', () => {
    it.each(NON_PAUSE)('pauses from %s and resumes exactly there', (from) => {
      const paused = transition(modeState(from), 'pause');
      expect(paused).toEqual({ mode: 'pause', resume: from, restartArmed: false });
      expect(transition(paused, 'resume')).toEqual(modeState(from));
    });

    it('cannot pause twice', () => {
      const paused = transition(modeState('build'), 'pause');
      expect(transition(paused, 'pause')).toBe(paused);
    });

    it('allows nothing but resume and the restart steps while paused', () => {
      const paused = transition(modeState('wind'), 'pause');
      const allowed = new Set<ModeAction>(['resume', 'request-restart']);
      for (const action of MODE_ACTIONS) {
        if (allowed.has(action)) continue;
        expect(transition(paused, action), action).toBe(paused);
      }
    });

    it('cannot resume when not paused', () => {
      for (const from of NON_PAUSE) expect(canTransition(modeState(from), 'resume')).toBe(false);
    });
  });

  describe('restart needs two deliberate steps (SAVE_PERSISTENCE_SPEC §12)', () => {
    const paused = transition(modeState('build'), 'pause');

    it('does nothing when confirmed without being requested first', () => {
      expect(transition(paused, 'confirm-restart')).toBe(paused);
    });

    it('arms on the first request and goes to the introduction on the second step', () => {
      const armed = transition(paused, 'request-restart');
      expect(armed.mode).toBe('pause');
      expect(armed.restartArmed).toBe(true);
      expect(transition(armed, 'request-restart')).toBe(armed);
      expect(transition(armed, 'confirm-restart')).toEqual(modeState('intro'));
    });

    it('can be cancelled', () => {
      const armed = transition(paused, 'request-restart');
      const cancelled = transition(armed, 'cancel-restart');
      expect(cancelled.restartArmed).toBe(false);
      expect(transition(cancelled, 'confirm-restart')).toBe(cancelled);
      expect(transition(paused, 'cancel-restart')).toBe(paused);
    });

    it('disarms when the player resumes, so a later pause starts clean', () => {
      const armed = transition(paused, 'request-restart');
      const back = transition(armed, 'resume');
      expect(back).toEqual(modeState('build'));
      expect(transition(back, 'pause').restartArmed).toBe(false);
    });

    it('cannot be requested or confirmed outside Pause', () => {
      for (const from of NON_PAUSE) {
        expect(canTransition(modeState(from), 'request-restart')).toBe(false);
        expect(canTransition(modeState(from), 'confirm-restart')).toBe(false);
      }
    });
  });
});
