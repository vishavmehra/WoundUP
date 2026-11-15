import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../../src/audio/engine';
import { bindInteractionAudio } from '../../src/audio/interaction';
import { interactionIntents } from '../../src/interaction/intents';
import type { InteractionIntent } from '../../src/interaction/intents';
import { MAX_SNAP_STEP, SNAP_STEP_SEMITONES, midiToHz, stageChord, stepLift } from '../../src/audio/notes';
import { SNAP_VOICES, isSnapVoice } from '../../src/audio/voices';
import type { SnapVoice } from '../../src/audio/voices';
import { asContext, FakeAudioContext } from './fake-context';

function engine() {
  const ctx = new FakeAudioContext();
  const audio = new AudioEngine({ createContext: () => asContext(ctx) });
  audio.unlock();
  return { ctx, audio };
}

/** The nodes one call adds to a fresh engine, so a voice can be inspected on its own. */
function played(call: (audio: AudioEngine) => void) {
  const { ctx, audio } = engine();
  const before = ctx.nodes.length;
  call(audio);
  const added = ctx.nodes.slice(before);
  return {
    ctx,
    oscillators: added.filter((n) => n.kind === 'oscillator'),
    sources: added.filter((n) => n.kind === 'source'),
  };
}

describe('snap voices by material', () => {
  it('names the eight voices of the design and recognises only them', () => {
    expect([...SNAP_VOICES].sort()).toEqual(['brass', 'bush', 'clip', 'collar', 'pin', 'screw', 'washer', 'wood']);
    for (const v of SNAP_VOICES) expect(isSnapVoice(v)).toBe(true);
    for (const bad of ['', 'Brass', 'gear', 7, null, undefined]) expect(isSnapVoice(bad)).toBe(false);
  });

  it.each(SNAP_VOICES)('%s sounds, and stops every oscillator and noise source it starts', (voice) => {
    const { ctx, oscillators, sources } = played((a) => a.snapMaterial(voice, 0));
    expect(oscillators.length + sources.length).toBeGreaterThan(0);
    expect(ctx.leaks()).toEqual([]);
  });

  it('gives the voices different sounds: no two share the same recipe', () => {
    const recipe = (voice: SnapVoice): string => {
      const { oscillators, sources } = played((a) => a.snapMaterial(voice, 0));
      return [
        sources.length,
        ...sources.map((n) => (n.startedAt ?? 0).toFixed(3)),
        ...oscillators.map((n) => `${n.frequency.value.toFixed(0)}@${(n.startedAt ?? 0).toFixed(3)}`),
      ].join('|');
    };
    expect(new Set(SNAP_VOICES.map(recipe)).size).toBe(SNAP_VOICES.length);
  });

  it('screws tick three times over about 0.35 s, ahead of the seat tone', () => {
    const { sources, oscillators } = played((a) => a.snapMaterial('screw', 0));
    const starts = sources.map((n) => n.startedAt ?? -1);
    expect(starts).toHaveLength(3);
    expect(starts[2] - starts[0]).toBeGreaterThan(0.2);
    expect(starts[2] - starts[0]).toBeLessThan(0.35);
    expect(oscillators[0].startedAt).toBeLessThan(0.35);
  });

  it('washers die in about 80 ms', () => {
    const { oscillators } = played((a) => a.snapMaterial('washer', 0));
    for (const o of oscillators) expect((o.stoppedAt ?? 0) - (o.startedAt ?? 0)).toBeLessThan(0.12);
  });

  it('climbs in pitch along a stage and holds the top rung', () => {
    const tone = (step: number): number => played((a) => a.snapMaterial('pin', step)).oscillators[0].frequency.value;
    for (let step = 1; step <= MAX_SNAP_STEP; step++) expect(tone(step)).toBeGreaterThan(tone(step - 1));
    expect(tone(MAX_SNAP_STEP + 5)).toBe(tone(MAX_SNAP_STEP));
  });

  it('is a silent no-op before the first gesture', () => {
    const ctx = new FakeAudioContext();
    const audio = new AudioEngine({ createContext: () => asContext(ctx) });
    expect(() => {
      for (const v of SNAP_VOICES) audio.snapMaterial(v, 3);
      audio.stageChord(2, 7);
      audio.dialTick();
      audio.lidThump();
      audio.revealRise();
    }).not.toThrow();
    expect(ctx.nodes).toHaveLength(0);
  });
});

describe('stepLift', () => {
  it('starts at 1, follows the pentatonic run and is safe for any number', () => {
    expect(stepLift(0)).toBe(1);
    expect(stepLift(5)).toBeCloseTo(2, 10); // an octave on the sixth placement
    SNAP_STEP_SEMITONES.forEach((s, i) => expect(stepLift(i)).toBeCloseTo(2 ** (s / 12), 10));
    expect(stepLift(-3)).toBe(1);
    expect(stepLift(99)).toBe(stepLift(MAX_SNAP_STEP));
    expect(stepLift(Number.NaN)).toBe(1);
  });
});

describe('stage chords', () => {
  it('rises a rung per stage and the seventh resolves on the home chord', () => {
    const roots = Array.from({ length: 7 }, (_, i) => stageChord(i, 7)[0]);
    for (let i = 1; i < 6; i++) expect(roots[i]).toBeGreaterThan(roots[i - 1]);
    expect(stageChord(6, 7)).toEqual([84, 88, 91, 96]);
    expect(roots[6]).toBeGreaterThan(roots[0]);
    expect(stageChord(6, 7)[0] - stageChord(0, 7)[0]).toBe(12); // the home chord is the first rung an octave up
  });

  it('keeps every stage chord inside C major', () => {
    const major = new Set([0, 2, 4, 5, 7, 9, 11]);
    for (let total = 2; total <= 7; total++) {
      for (let i = 0; i < total; i++) for (const note of stageChord(i, total)) expect(major.has(note % 12)).toBe(true);
    }
  });

  it('spreads the rungs for fewer stages, still rising and ending home', () => {
    for (const total of [2, 3, 4, 5, 6]) {
      const roots = Array.from({ length: total }, (_, i) => stageChord(i, total)[0]);
      for (let i = 1; i < total - 1; i++) expect(roots[i]).toBeGreaterThan(roots[i - 1]);
      expect(stageChord(total - 1, total)).toEqual([84, 88, 91, 96]);
    }
  });

  it('is total: a bad index or count still gives a chord, and never allocates a new table', () => {
    expect(stageChord(-4, 7)).toBe(stageChord(0, 7));
    expect(stageChord(99, 7)).toBe(stageChord(6, 7));
    expect(stageChord(0, 1)).toEqual([84, 88, 91, 96]);
    expect(stageChord(0, Number.NaN)).toEqual([84, 88, 91, 96]);
    expect(stageChord(3, 7)).toBe(stageChord(3, 7));
  });

  it('sounds one bell pair per note, longer on the home chord, and stops everything', () => {
    const rung = played((a) => a.stageChord(2, 7));
    const home = played((a) => a.stageChord(6, 7));
    expect(rung.oscillators).toHaveLength(stageChord(2, 7).length * 2);
    expect(home.oscillators).toHaveLength(stageChord(6, 7).length * 2);
    expect(rung.ctx.leaks()).toEqual([]);
    expect(home.ctx.leaks()).toEqual([]);
    const ring = (o: { startedAt: number | null; stoppedAt: number | null }): number => (o.stoppedAt ?? 0) - (o.startedAt ?? 0);
    expect(ring(home.oscillators[0])).toBeGreaterThan(ring(rung.oscillators[0]));
    expect(rung.oscillators[0].frequency.value).toBeCloseTo(midiToHz(stageChord(2, 7)[0]), 6);
  });
});

describe('dial tick, lid thump and reveal rise', () => {
  it('each sounds once and leaves nothing running', () => {
    for (const call of [(a: AudioEngine) => a.dialTick(), (a: AudioEngine) => a.lidThump(), (a: AudioEngine) => a.revealRise()]) {
      const { ctx, oscillators, sources } = played(call);
      expect(oscillators.length + sources.length).toBeGreaterThan(0);
      expect(ctx.leaks()).toEqual([]);
    }
  });

  it('the thump is low and the rise sweeps upward', () => {
    const thump = played((a) => a.lidThump());
    expect(thump.oscillators[0].frequency.value).toBeLessThan(120);
    const rise = played((a) => a.revealRise());
    expect(rise.oscillators.length).toBeGreaterThanOrEqual(1);
    expect(rise.oscillators[0].frequency.ramps.length).toBeGreaterThan(0);
    expect(rise.oscillators[0].frequency.ramps[0]).toBeGreaterThan(rise.oscillators[0].frequency.value);
  });
});

describe('bindInteractionAudio snaps option', () => {
  const part = {} as never;
  const snapped: InteractionIntent = { type: 'snapped', part, socket: part, socketName: 'Seat', partId: 'x' };

  it('plays the plain snap by default and stays silent on snapped with snaps: false (the feedback layer owns it)', () => {
    const calls: string[] = [];
    const audio = { snap: () => calls.push('snap'), bonk: () => calls.push('bonk'), wind: () => calls.push('wind') } as unknown as AudioEngine;
    const off1 = bindInteractionAudio(audio);
    interactionIntents.emit(snapped);
    off1();
    expect(calls).toEqual(['snap']);

    calls.length = 0;
    const off2 = bindInteractionAudio(audio, { snaps: false });
    interactionIntents.emit(snapped);
    interactionIntents.emit({ type: 'rejected', part, socket: part, socketName: 'Seat', partId: 'x', reason: 'family' });
    off2();
    expect(calls).toEqual(['bonk']);
  });
});
