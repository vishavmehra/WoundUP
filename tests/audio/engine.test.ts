import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, MAX_PLUCK_VOICES } from '../../src/audio/engine';
import { bindInteractionAudio } from '../../src/audio/interaction';
import { interactionIntents } from '../../src/interaction/intents';
import type { InteractionIntent } from '../../src/interaction/intents';
import { PLOT_IDS } from '../../src/game/content';
import { asContext, FakeAudioContext } from './fake-context';

function engine() {
  const ctx = new FakeAudioContext();
  const create = vi.fn(() => asContext(ctx));
  const audio = new AudioEngine({ createContext: create });
  return { ctx, create, audio };
}

/** Plays every sound the game has. */
function playAll(audio: AudioEngine): void {
  audio.pluck(76);
  audio.wind(3);
  audio.snap();
  audio.bonk();
  audio.tick(0);
  audio.tick(1);
  audio.bell(1, 3);
  audio.bell(3, 3);
  audio.toll();
  for (const plot of PLOT_IDS) audio.chime(plot);
}

afterEach(() => vi.restoreAllMocks());

describe('AudioEngine before a gesture', () => {
  it('creates nothing and sounds nothing: every call is a silent no-op', () => {
    const { create, audio } = engine();
    expect(audio.unlocked).toBe(false);
    expect(() => playAll(audio)).not.toThrow();
    audio.setVolume(0.5);
    expect(create).not.toHaveBeenCalled();
    expect(audio.unlocked).toBe(false);
  });

  it('unlocks on the first gesture on its target, once, and then stops listening', () => {
    const { create, audio } = engine();
    const target = new EventTarget();
    audio.installGestureUnlock(target);
    target.dispatchEvent(new Event('pointerdown'));
    expect(audio.unlocked).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    target.dispatchEvent(new Event('keydown'));
    target.dispatchEvent(new Event('pointerdown'));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps listening while the context is still suspended (a key that is no user activation), and unlocks on the next gesture', () => {
    const ctx = new FakeAudioContext();
    let allow = false;
    ctx.resume = () => {
      ctx.resumed++;
      if (allow) ctx.state = 'running';
      return Promise.resolve();
    };
    const audio = new AudioEngine({ createContext: () => asContext(ctx) });
    const target = new EventTarget();
    audio.installGestureUnlock(target);
    target.dispatchEvent(new Event('keydown')); // Shift: creates the context, which stays suspended
    expect(audio.unlocked).toBe(true);
    expect(ctx.state).toBe('suspended');
    allow = true;
    target.dispatchEvent(new Event('pointerdown'));
    expect(ctx.state).toBe('running');
    const resumes = ctx.resumed;
    target.dispatchEvent(new Event('pointerdown')); // running now: the listeners are gone
    expect(ctx.resumed).toBe(resumes);
  });

  it('lets the listeners be removed early', () => {
    const { create, audio } = engine();
    const target = new EventTarget();
    audio.installGestureUnlock(target)();
    target.dispatchEvent(new Event('pointerdown'));
    expect(create).not.toHaveBeenCalled();
  });

  it('stays silent, with a warning, when the browser has no Web Audio or it throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const none = new AudioEngine({ createContext: () => null });
    expect(none.unlock()).toBe(false);
    const broken = new AudioEngine({
      createContext: () => {
        throw new Error('boom');
      },
    });
    expect(broken.unlock()).toBe(false);
    expect(() => playAll(broken)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('AudioEngine after unlock', () => {
  it('builds one graph (voices to buses to master to a compressor to the output) and resumes the context', () => {
    const { ctx, create, audio } = engine();
    expect(audio.unlock()).toBe(true);
    expect(audio.unlock()).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(ctx.resumed).toBeGreaterThanOrEqual(1);
    const [compressor] = ctx.ofKind('compressor');
    expect(compressor.outputs).toContain(ctx.destination);
    expect(ctx.ofKind('gain')).toHaveLength(4); // master and three buses
  });

  it('keeps the mix quiet: master below 0.6, no voice louder than 0.35 before the buses', () => {
    const { ctx, audio } = engine();
    audio.unlock();
    const master = ctx.ofKind('gain')[0];
    expect(master.gain.value).toBeLessThan(0.6);
    playAll(audio);
    const peaks = ctx.ofKind('gain').flatMap((g) => g.gain.ramps);
    expect(Math.max(...peaks)).toBeLessThanOrEqual(0.35);
  });

  it('clamps the volume to 0 to 1', () => {
    const { ctx, audio } = engine();
    audio.unlock();
    const master = ctx.ofKind('gain')[0];
    audio.setVolume(5);
    expect(master.gain.value).toBeCloseTo(0.7, 6);
    audio.setVolume(-3);
    expect(master.gain.value).toBe(0);
  });

  it('stops every oscillator and noise burst it starts, so nothing keeps running', () => {
    const { ctx, audio } = engine();
    audio.unlock();
    playAll(audio);
    expect(ctx.ofKind('oscillator').length).toBeGreaterThan(10);
    expect(ctx.ofKind('source').length).toBeGreaterThanOrEqual(4);
    expect(ctx.leaks()).toEqual([]);
  });

  it('schedules each sound at or after now, never in the past', () => {
    const { ctx, audio } = engine();
    audio.unlock();
    ctx.currentTime = 12.5;
    audio.chime('plot_windmill');
    audio.wind(1);
    const started = ctx.nodes.filter((n) => n.startedAt !== null);
    expect(started.length).toBeGreaterThan(0);
    for (const node of started) expect(node.startedAt).toBeGreaterThanOrEqual(12.5);
  });

  it('rings at most MAX_PLUCK_VOICES tines at once, and frees a slot as each tine ends', () => {
    const { ctx, audio } = engine();
    audio.unlock();
    for (let i = 0; i < MAX_PLUCK_VOICES + 8; i++) audio.pluck(72 + (i % 12));
    const bodies = ctx.ofKind('oscillator').filter((n) => n.onended);
    expect(bodies).toHaveLength(MAX_PLUCK_VOICES);
    bodies[0].onended?.();
    audio.pluck(80);
    expect(ctx.ofKind('oscillator').filter((n) => n.onended)).toHaveLength(MAX_PLUCK_VOICES + 1);
  });

  it('plays a second tune quieter through `level`', () => {
    const { ctx, audio } = engine();
    audio.unlock();
    audio.pluck(76, 0.8, 1);
    audio.pluck(76, 0.8, 0.5);
    const peaks = ctx
      .ofKind('gain')
      .filter((g) => g.gain.ramps.length === 2 && g.gain.ramps[0] >= 0.1)
      .map((g) => g.gain.ramps[0]);
    expect(peaks).toHaveLength(2);
    expect(peaks[1]).toBeCloseTo(peaks[0] / 2, 9);
  });

  it("tolls the Belfry bell at a pitch of its own, a fourth above the tower's, with the same partials (ADR-048)", () => {
    const { ctx, audio } = engine();
    audio.unlock();
    audio.bell(1, 3);
    const tower = ctx.ofKind('oscillator').map((n) => n.frequency.value);
    const before = ctx.ofKind('oscillator').length;
    audio.toll();
    const belfry = ctx.ofKind('oscillator').slice(before).map((n) => n.frequency.value);
    expect(belfry).toHaveLength(tower.length); // one oscillator for each partial of the bell
    belfry.forEach((hz, i) => expect(hz / tower[i], `partial ${i}`).toBeCloseTo(262 / 196, 9));
    expect(ctx.leaks()).toEqual([]);
  });

  it('resumes a context the browser suspended again', () => {
    const { ctx, audio } = engine();
    audio.unlock();
    const before = ctx.resumed;
    ctx.state = 'suspended';
    audio.snap();
    expect(ctx.resumed).toBe(before + 1);
  });
});

describe('bindInteractionAudio', () => {
  const intent = (i: { type: InteractionIntent['type']; units?: number }): InteractionIntent => i as InteractionIntent;

  it('plays the snap, the bonk and the ratchet for their intents, and nothing for the rest', () => {
    const { audio } = engine();
    const snap = vi.spyOn(audio, 'snap');
    const bonk = vi.spyOn(audio, 'bonk');
    const wind = vi.spyOn(audio, 'wind');
    const off = bindInteractionAudio(audio);
    interactionIntents.emit(intent({ type: 'snapped' }));
    interactionIntents.emit(intent({ type: 'rejected' }));
    interactionIntents.emit(intent({ type: 'wind', units: 4 }));
    interactionIntents.emit(intent({ type: 'unsnapped' }));
    interactionIntents.emit(intent({ type: 'windEnd' }));
    interactionIntents.emit(intent({ type: 'xray' }));
    expect(snap).toHaveBeenCalledTimes(1);
    expect(bonk).toHaveBeenCalledTimes(1);
    expect(wind).toHaveBeenCalledWith(4);
    off();
    interactionIntents.emit(intent({ type: 'snapped' }));
    expect(snap).toHaveBeenCalledTimes(1);
  });
});
