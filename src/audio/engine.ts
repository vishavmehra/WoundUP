/**
 * The game's one AudioContext and its small mixer (TECHNICAL_ARCHITECTURE §18). Nothing is created or played until a user
 * gesture unlocks it, so nothing sounds at startup (ACCEPTANCE_TESTS §14). Until then every call is a silent no-op, which also
 * makes the engine safe to use headless and in tests.
 *
 *   voices -> bus (music / sfx / chime) -> master -> compressor -> destination
 */
import type { PlotId } from '../game/content';
import { WAKE_CHIMES } from './notes';
import { bonkVoice, chimeVoice, makeNoise, pluckVoice, snapVoice, windVoice } from './voices';

/** What the town and the interaction layer need from the audio. `AudioEngine` implements it; tests pass a recorder. */
export interface TownAudio {
  pluck(midi: number, velocity?: number, level?: number): void;
  chime(plot: PlotId): void;
}

export interface AudioEngineOptions {
  /** Defaults to `new AudioContext()`; returns null when the browser has none. Injected in tests. */
  createContext?: () => AudioContext | null;
  /** Master volume 0 to 1. */
  volume?: number;
}

/** At most this many comb tines ring at once; further notes are dropped rather than stacking up. */
export const MAX_PLUCK_VOICES = 12;
const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

function browserContext(): AudioContext | null {
  const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export class AudioEngine implements TownAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private bells: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private plucking = 0;
  private volume: number;
  private readonly create: () => AudioContext | null;
  private readonly endPluck = (): void => {
    this.plucking = Math.max(0, this.plucking - 1);
  };

  constructor(options: AudioEngineOptions = {}) {
    this.create = options.createContext ?? browserContext;
    this.volume = options.volume ?? 0.8;
  }

  /** True once a context exists, that is after the first successful `unlock`. */
  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /**
   * Creates the context on the first call and resumes it on every call. Call it from a user gesture (a click, a pinch that
   * the page sees as pointer input, the "Enter VR" button). Returns false when the browser has no Web Audio.
   */
  unlock(): boolean {
    if (!this.ctx) {
      try {
        this.build();
      } catch (error) {
        console.warn('[wound-up] Web Audio is not available; the game stays silent.', error);
        this.ctx = null;
        return false;
      }
    }
    const ctx = this.ctx;
    if (!ctx) return false;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return true;
  }

  /** Unlocks on the first gesture on `target`, then stops listening. Returns the function that removes the listeners early. */
  installGestureUnlock(target: EventTarget = window): () => void {
    const off = (): void => GESTURE_EVENTS.forEach((e) => target.removeEventListener(e, onGesture, true));
    const onGesture = (): void => {
      if (this.unlock()) off();
    };
    GESTURE_EVENTS.forEach((e) => target.addEventListener(e, onGesture, true));
    return off;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume * 0.7, this.ctx.currentTime, 0.02);
  }

  /** A music-box tine (the comb). `level` scales it for a second tune sharing the mix. */
  pluck(midi: number, velocity = 0.8, level = 1): void {
    const ctx = this.ready();
    if (!ctx || !this.music || this.plucking >= MAX_PLUCK_VOICES) return;
    this.plucking++;
    pluckVoice(ctx, this.music, midi, velocity * level, this.endPluck);
  }

  /** One wind unit gained: the ratchet. */
  wind(units: number): void {
    const ctx = this.ready();
    if (ctx && this.sfx && this.noise) windVoice(ctx, this.sfx, this.noise, units);
  }

  /** A part seated. */
  snap(): void {
    const ctx = this.ready();
    if (ctx && this.sfx && this.noise) snapVoice(ctx, this.sfx, this.noise);
  }

  /** A part refused. */
  bonk(): void {
    const ctx = this.ready();
    if (ctx && this.sfx) bonkVoice(ctx, this.sfx);
  }

  /** The soft chime of a plot waking. */
  chime(plot: PlotId): void {
    const ctx = this.ready();
    if (ctx && this.bells) chimeVoice(ctx, this.bells, WAKE_CHIMES[plot]);
  }

  /** The context, resumed if the browser suspended it again, or null while locked. */
  private ready(): AudioContext | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  }

  private build(): void {
    const ctx = this.create();
    if (!ctx) throw new Error('no AudioContext');
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, ctx.currentTime);
    compressor.ratio.setValueAtTime(3, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.25, ctx.currentTime);
    compressor.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.setValueAtTime(this.volume * 0.7, ctx.currentTime);
    master.connect(compressor);
    const bus = (level: number): GainNode => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(level, ctx.currentTime);
      g.connect(master);
      return g;
    };
    this.music = bus(0.55);
    this.sfx = bus(0.8);
    this.bells = bus(0.6);
    this.master = master;
    this.noise = makeNoise(ctx);
    this.ctx = ctx;
  }
}
