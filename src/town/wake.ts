/**
 * Wake state of the town (GAMEPLAY_SYSTEMS §14): which plots are awake and how far each ripple has spread. Pure and
 * allocation-free per frame: `update` fills two preallocated arrays that the shader uniforms are copied from.
 */
import { PLOT_IDS, type PlotId } from '../game/content';
import { MAX_WAKE_SOURCES, WAKE_SOURCES, type WakeSource } from './layout';

/** The wake ripple lasts about 1.5 seconds (CLAUDE.md §8). */
export const WAKE_RIPPLE_S = 1.5;
/**
 * Saturation of frozen scenery as the player sees it (CLAUDE.md §8: "approximately 0.15"). Two constants reach it: a trace of
 * each material's own colour (`FROZEN_RESIDUAL`, so brass and walnut still differ) and a cool tint that adds the rest. The
 * tint is divided by its own luminance so freezing never changes brightness. The pair was tuned over the shared library's
 * colours: displayed (sRGB) HSV saturation averages 0.15 and stays between 0.10 and 0.23 (tests/town/wake.test.ts).
 */
export const FROZEN_SATURATION = 0.15;
export const FROZEN_RESIDUAL = 0.1;
const RAW_TINT = [0.74, 0.9, 1.1] as const;
const TINT_LUMA = 0.2126 * RAW_TINT[0] + 0.7152 * RAW_TINT[1] + 0.0722 * RAW_TINT[2];
export const FROZEN_TINT: readonly [number, number, number] = [RAW_TINT[0] / TINT_LUMA, RAW_TINT[1] / TINT_LUMA, RAW_TINT[2] / TINT_LUMA];

/** The shader's freeze on one linear RGB colour (`out` may be `rgb`). */
export function freezeColor(rgb: readonly [number, number, number], out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  for (let i = 0; i < 3; i++) out[i] = (lum + (rgb[i] - lum) * FROZEN_RESIDUAL) * FROZEN_TINT[i];
  return out;
}

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Radius of the ripple front `elapsed` seconds after the wake started: eased out, exactly `maxRadius` once it has finished. */
export function rippleRadius(elapsed: number, maxRadius: number): number {
  return maxRadius * easeOutCubic(clamp01(elapsed / WAKE_RIPPLE_S));
}

/** Brightness of the ripple's glow band: a smooth bump while the front travels, 0 before it starts and after it ends. */
export function rippleGlow(elapsed: number): number {
  if (!(elapsed > 0) || elapsed >= WAKE_RIPPLE_S) return 0;
  return Math.sin(Math.PI * (elapsed / WAKE_RIPPLE_S));
}

const FROZEN = -1;
const INSTANT = Number.POSITIVE_INFINITY;

export class WakeField {
  /** Per source: ripple radius in metres (town space, scale 1), -1 while the plot is frozen. */
  readonly radius = new Float32Array(MAX_WAKE_SOURCES).fill(-1);
  /** Per source: glow-band brightness 0 to 1. */
  readonly glow = new Float32Array(MAX_WAKE_SOURCES);
  private readonly elapsed: number[] = PLOT_IDS.map(() => FROZEN);
  private readonly plotOfSource: number[];
  private running = 0;

  constructor(private readonly sources: readonly WakeSource[] = WAKE_SOURCES) {
    if (sources.length > MAX_WAKE_SOURCES) throw new Error(`too many wake sources: ${sources.length} > ${MAX_WAKE_SOURCES}`);
    this.plotOfSource = sources.map((s) => PLOT_IDS.indexOf(s.plot));
  }

  isAwake(plot: PlotId): boolean {
    return this.elapsed[PLOT_IDS.indexOf(plot)] !== FROZEN;
  }

  /** Awake plots in `PLOT_IDS` order. Allocates: call it for saves and tests, not per frame. */
  awakePlots(): PlotId[] {
    return PLOT_IDS.filter((p) => this.isAwake(p));
  }

  /** True once a plot's ripple has finished (or it was restored). The Bakery's baker keeps kneading on `isAwake`. */
  isSettled(plot: PlotId): boolean {
    return this.elapsed[PLOT_IDS.indexOf(plot)] >= WAKE_RIPPLE_S;
  }

  /**
   * Starts the ripple of `plot`. `instant` skips it (restoring a save: the town is simply awake). Returns true when this
   * woke the plot, false when it was already awake: a machine pulled out for repair and put back wakes nothing twice.
   */
  wake(plot: PlotId, instant = false): boolean {
    const i = PLOT_IDS.indexOf(plot);
    if (i < 0 || this.elapsed[i] !== FROZEN) return false;
    this.elapsed[i] = instant ? INSTANT : 0;
    if (!instant) this.running++;
    this.fill(i);
    return true;
  }

  /** Back to frozen, for a restart. */
  reset(): void {
    this.elapsed.fill(FROZEN);
    this.running = 0;
    this.radius.fill(-1);
    this.glow.fill(0);
  }

  /** Advances the running ripples. Returns true when the arrays changed, so the caller refreshes its uniforms only then. */
  update(dt: number): boolean {
    if (this.running === 0) return false;
    let changed = false;
    for (let i = 0; i < this.elapsed.length; i++) {
      const t = this.elapsed[i];
      if (t === FROZEN || t >= WAKE_RIPPLE_S) continue;
      this.elapsed[i] = t + dt;
      if (this.elapsed[i] >= WAKE_RIPPLE_S) this.running--;
      this.fill(i);
      changed = true;
    }
    return changed;
  }

  private fill(plotIndex: number): void {
    const t = this.elapsed[plotIndex];
    for (let s = 0; s < this.sources.length; s++) {
      if (this.plotOfSource[s] !== plotIndex) continue;
      this.radius[s] = rippleRadius(t, this.sources[s].radius);
      this.glow[s] = rippleGlow(t);
    }
  }
}
