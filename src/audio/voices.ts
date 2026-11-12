/**
 * The sound recipes, all synthesised with the Web Audio API (no files, no network). Each function schedules one sound on the
 * given context starting now and cleans itself up: every oscillator and noise source is stopped, so nothing is left running.
 * Peak levels are small on purpose; the engine's buses and compressor keep the mix quiet (UI_UX_SPEC §22: "audio should
 * support the interaction rather than compete with it").
 */
import { midiToHz } from './notes';

const SILENT = 0.0001;
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** A comb tine: a bright, instant attack on a pure tone with a bell-like overtone two octaves up, ringing longer when low. */
export function pluckVoice(ctx: AudioContext, out: AudioNode, midi: number, velocity: number, onEnd: () => void): void {
  const t = ctx.currentTime;
  const hz = midiToHz(midi);
  const decay = clamp(2.6 - (midi - 48) * 0.035, 0.45, 2.4);
  const env = ctx.createGain();
  env.gain.setValueAtTime(SILENT, t);
  env.gain.linearRampToValueAtTime(0.32 * velocity, t + 0.004);
  env.gain.exponentialRampToValueAtTime(SILENT, t + decay);
  env.connect(out);

  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(hz, t);
  body.connect(env);

  const spark = ctx.createOscillator();
  spark.type = 'sine';
  spark.frequency.setValueAtTime(hz * 4, t);
  const sparkEnv = ctx.createGain();
  sparkEnv.gain.setValueAtTime(SILENT, t);
  sparkEnv.gain.linearRampToValueAtTime(0.1 * velocity, t + 0.003);
  sparkEnv.gain.exponentialRampToValueAtTime(SILENT, t + decay * 0.2);
  spark.connect(sparkEnv);
  sparkEnv.connect(env);

  body.onended = onEnd;
  body.start(t);
  spark.start(t);
  body.stop(t + decay + 0.05);
  spark.stop(t + decay * 0.2 + 0.05);
}

/** A short burst of band-passed noise: the sound of a pawl, a latch or brass meeting brass. */
export function noiseClick(
  ctx: AudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  at: number,
  hz: number,
  q: number,
  peak: number,
  duration: number,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(hz, at);
  filter.Q.setValueAtTime(q, at);
  const env = ctx.createGain();
  env.gain.setValueAtTime(peak, at);
  env.gain.exponentialRampToValueAtTime(SILENT, at + duration);
  src.connect(filter);
  filter.connect(env);
  env.connect(out);
  src.start(at);
  src.stop(at + duration + 0.01);
}

/** One tone that glides from `hzFrom` to `hzTo` and fades out. */
export function toneVoice(
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  hzFrom: number,
  hzTo: number,
  peak: number,
  duration: number,
  type: OscillatorType = 'sine',
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(hzFrom, at);
  if (hzTo !== hzFrom) osc.frequency.exponentialRampToValueAtTime(hzTo, at + duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(SILENT, at);
  env.gain.linearRampToValueAtTime(peak, at + 0.004);
  env.gain.exponentialRampToValueAtTime(SILENT, at + duration);
  osc.connect(env);
  env.connect(out);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** The winding ratchet: three quick pawl clicks over a soft thunk, a little higher for each unit already wound. */
export function windVoice(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, units: number): void {
  const t = ctx.currentTime;
  const hz = 1700 + clamp(units, 0, 8) * 160;
  for (let i = 0; i < 3; i++) noiseClick(ctx, out, noise, t + i * 0.034, hz, 6, 0.3 - i * 0.05, 0.022);
  toneVoice(ctx, out, t, 110, 70, 0.1, 0.05);
}

/** A part seating: one crisp brass tick. */
export function snapVoice(ctx: AudioContext, out: AudioNode, noise: AudioBuffer): void {
  const t = ctx.currentTime;
  noiseClick(ctx, out, noise, t, 3600, 7, 0.45, 0.02);
  toneVoice(ctx, out, t, 2100, 1700, 0.1, 0.05);
}

/** A part refused: a soft low bonk. */
export function bonkVoice(ctx: AudioContext, out: AudioNode): void {
  toneVoice(ctx, out, ctx.currentTime, 190, 120, 0.28, 0.16, 'triangle');
}

/** The town waking: a quiet bell arpeggio, each note a sine with a slightly sharp overtone and a long fade. */
export function chimeVoice(ctx: AudioContext, out: AudioNode, notes: readonly number[]): void {
  const t = ctx.currentTime + 0.05;
  notes.forEach((midi, i) => {
    const at = t + i * 0.11;
    const hz = midiToHz(midi);
    toneVoice(ctx, out, at, hz, hz, 0.16 - i * 0.012, 1.7);
    toneVoice(ctx, out, at, hz * 2.01, hz * 2.01, 0.05, 0.7);
  });
}

/** Mono white noise from a seeded generator, so every run sounds the same. */
export function makeNoise(ctx: AudioContext, seconds = 0.06): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2545f491;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = (seed / 0x80000000) - 1;
  }
  return buffer;
}
