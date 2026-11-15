/**
 * The sound recipes, all synthesised with the Web Audio API (no files, no network). Each function schedules one sound on the
 * given context starting now and cleans itself up: every oscillator and noise source is stopped, so nothing is left running.
 * Peak levels are small on purpose; the engine's buses and compressor keep the mix quiet (UI_UX_SPEC §22: "audio should
 * support the interaction rather than compete with it").
 */
import { midiToHz, stageChord, stepLift } from './notes';

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

/** Partials of the tower bell as multiples of its prime: hum, prime, minor third, fifth, nominal, then two upper ones (a cast bell is not harmonic). */
const BELL_PARTIALS: ReadonlyArray<readonly [ratio: number, peak: number, seconds: number]> = [
  [0.5, 0.1, 3.8],
  [1, 0.16, 3.4],
  [1.2, 0.08, 2.4],
  [1.5, 0.06, 2.0],
  [2, 0.06, 1.6],
  [2.5, 0.03, 1.0],
  [3, 0.02, 0.7],
];
const BELL_PRIME_HZ = 196; // G3
/** The Belfry's smaller bell (ADR-048), a fourth above the tower's so the two can ring together: C4. */
export const BELFRY_BELL_PRIME_HZ = 262;

/** One strike of the Clock Tower bell: a clapper tick over the partials, ringing a little longer on the last strike of the hour. */
export function bellVoice(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, last: boolean, primeHz: number = BELL_PRIME_HZ, ringSeconds = 1): void {
  const t = ctx.currentTime + 0.02;
  noiseClick(ctx, out, noise, t, 1800, 3, 0.25, 0.03);
  const ring = (last ? 1.3 : 1) * ringSeconds;
  for (const [ratio, peak, seconds] of BELL_PARTIALS) toneVoice(ctx, out, t, primeHz * ratio, primeHz * ratio, peak, seconds * ring);
}

/** The pendulum's tick and tock: one dry click, a little lower and softer on the tock. */
export function tickVoice(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, parity: 0 | 1): void {
  noiseClick(ctx, out, noise, ctx.currentTime, parity === 0 ? 2600 : 2000, 8, parity === 0 ? 0.1 : 0.07, 0.014);
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

/**
 * The sound of each kind of hardware and part as it seats (INTRICATE_ASSEMBLY_DESIGN §10.1). A part's catalogue `feedback.voice`
 * is one of these. `brass` is today's snap (gears, springs, anything without a voice of its own).
 */
export const SNAP_VOICES = ['brass', 'pin', 'washer', 'bush', 'collar', 'screw', 'wood', 'clip'] as const;
export type SnapVoice = (typeof SNAP_VOICES)[number];

export function isSnapVoice(value: unknown): value is SnapVoice {
  return typeof value === 'string' && (SNAP_VOICES as readonly string[]).includes(value);
}

/**
 * One part seating, by material. `step` is how many placements of the current stage came before (0 first): every pitch rises
 * along a pentatonic run, so a stage climbs a short scale. Each recipe is a few noise clicks and tones, all stopped by themselves.
 */
export function materialSnapVoice(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, voice: SnapVoice, step: number): void {
  const t = ctx.currentTime;
  const k = stepLift(step);
  switch (voice) {
    case 'pin': // a high short tink
      noiseClick(ctx, out, noise, t, 5200 * k, 9, 0.22, 0.008);
      toneVoice(ctx, out, t, 4200 * k, 3900 * k, 0.12, 0.09);
      break;
    case 'washer': // a small ring that dies in 80 ms
      noiseClick(ctx, out, noise, t, 3400 * k, 6, 0.25, 0.01);
      toneVoice(ctx, out, t, 3100 * k, 3000 * k, 0.1, 0.08);
      toneVoice(ctx, out, t, 4650 * k, 4500 * k, 0.05, 0.06);
      break;
    case 'bush': // a soft double click
      noiseClick(ctx, out, noise, t, 1800 * k, 4, 0.3, 0.016);
      noiseClick(ctx, out, noise, t + 0.045, 1800 * k, 4, 0.22, 0.016);
      toneVoice(ctx, out, t, 260 * k, 200 * k, 0.06, 0.06);
      break;
    case 'collar': // a thunk with a click behind it
      noiseClick(ctx, out, noise, t, 900 * k, 3, 0.3, 0.03);
      toneVoice(ctx, out, t, 150 * k, 90 * k, 0.2, 0.09, 'triangle');
      noiseClick(ctx, out, noise, t + 0.05, 2200 * k, 5, 0.12, 0.012);
      break;
    case 'screw': // three quick ratchet ticks over about 0.35 s as it drives itself in, then it seats
      for (let i = 0; i < 3; i++) noiseClick(ctx, out, noise, t + i * 0.14, (2300 + i * 220) * k, 6, 0.3 - i * 0.04, 0.018);
      toneVoice(ctx, out, t + 0.31, 1900 * k, 1500 * k, 0.07, 0.04);
      break;
    case 'wood': // a low tok
      noiseClick(ctx, out, noise, t, 700 * k, 2.5, 0.25, 0.02);
      toneVoice(ctx, out, t, 320 * k, 180 * k, 0.22, 0.07);
      break;
    case 'clip': // a spring snick
      noiseClick(ctx, out, noise, t, 4800 * k, 8, 0.35, 0.008);
      noiseClick(ctx, out, noise, t + 0.022, 2900 * k, 6, 0.25, 0.01);
      toneVoice(ctx, out, t, 3400 * k, 2400 * k, 0.05, 0.03);
      break;
    default: // brass: today's snap, climbing with the stage
      noiseClick(ctx, out, noise, t, 3600 * k, 7, 0.45, 0.02);
      toneVoice(ctx, out, t, 2100 * k, 1700 * k, 0.1, 0.05);
  }
}

/** The chord that closes a stage: a quick bell arpeggio on the stage's rung of the rising scale, ringing longest on the home chord. */
export function stageChordVoice(ctx: AudioContext, out: AudioNode, index: number, total: number): void {
  const notes = stageChord(index, total);
  const home = index >= total - 1;
  const t = ctx.currentTime + 0.02;
  for (let i = 0; i < notes.length; i++) {
    const at = t + i * 0.045;
    const hz = midiToHz(notes[i]);
    toneVoice(ctx, out, at, hz, hz, 0.13 - i * 0.012, home ? 2.4 : 1.1);
    toneVoice(ctx, out, at, hz * 2.01, hz * 2.01, 0.04, home ? 0.9 : 0.4);
  }
}

/** The progress dial advancing one tick: a small dry brass click, just after the chord begins. */
export function dialTickVoice(ctx: AudioContext, out: AudioNode, noise: AudioBuffer): void {
  const at = ctx.currentTime + 0.09;
  noiseClick(ctx, out, noise, at, 2400, 8, 0.2, 0.012);
  toneVoice(ctx, out, at, 1800, 1500, 0.05, 0.03);
}

/** The lid shutting: a soft low thump. */
export function lidThumpVoice(ctx: AudioContext, out: AudioNode, noise: AudioBuffer): void {
  const t = ctx.currentTime;
  noiseClick(ctx, out, noise, t, 500, 1.5, 0.25, 0.05);
  toneVoice(ctx, out, t, 95, 55, 0.32, 0.18);
}

/** The lid lifting as the melody is about to start: one soft rising sweep. */
export function revealRiseVoice(ctx: AudioContext, out: AudioNode): void {
  const t = ctx.currentTime;
  toneVoice(ctx, out, t, 392, 784, 0.06, 1.5);
  toneVoice(ctx, out, t + 0.1, 588, 1176, 0.03, 1.3);
}
