/**
 * Renderer settings for Quest, applied once at start-up (docs/evidence/PERF_2026-11-15.md has what is verified and what is not).
 *
 * What IWSDK 1.1 and super-three 0.185 already do (read from node_modules, not from a headset):
 *  - multiview: IWSDK creates the renderer with `multiviewStereo: true`. In a session three uses it when the browser offers
 *    `OCULUS_multiview` and projection layers, and then draws both eyes in ONE pass into a texture array; otherwise it draws each eye in
 *    turn. So the fallback needs no code here, and a desktop or IWER session (no extension) takes it.
 *  - antialiasing: `antialias: true`, which in a session is a 4-sample render target. There is no option to change it.
 *  - foveation: three sets 1.0 (the most) at session start; framebuffer scale 1.0.
 *  - shadows: off (`"shadows": false` in the scene file; no light or mesh in src casts one).
 * What this adds: the target frame rate (72 where the headset offers it: the budgets are written for 72 Hz and a device left at 90 or 120
 * Hz would ask for more than the budget allows), and four query switches for a tester with a headset, because none of them can be tuned
 * without one:
 *   ?foveation=0..1   fixed foveation (default 1: strongest, cheapest; lower is sharper at the edges and costs fill rate)
 *   ?xrscale=0.5..2   framebuffer scale before the session starts (default 1; 0.8 is the first thing to try if a frame misses)
 *   ?xrfps=72|80|90|120   the frame rate asked for (default 72)
 *   ?multiview=0      do not use multiview even where the headset has it (to compare, or if the picture is wrong in one eye)
 * No setting is stored and none is read from anything but the URL.
 */

export const DEFAULT_FOVEATION = 1;
export const DEFAULT_FRAMEBUFFER_SCALE = 1;
export const TARGET_FRAME_RATE = 72;

export interface XrTuning {
  foveation: number;
  framebufferScale: number;
  frameRate: number;
  multiview: boolean;
}

const number = (raw: string | null): number | null => {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** The tuning a URL asks for. Unreadable or out-of-range values fall back to the default or the nearest limit. */
export function parseXrTuning(search: string): XrTuning {
  const params = new URLSearchParams(search);
  const foveation = number(params.get('foveation'));
  const scale = number(params.get('xrscale'));
  const rate = number(params.get('xrfps'));
  return {
    foveation: foveation === null ? DEFAULT_FOVEATION : clamp(foveation, 0, 1),
    framebufferScale: scale === null ? DEFAULT_FRAMEBUFFER_SCALE : clamp(scale, 0.5, 2),
    frameRate: rate !== null && rate > 0 ? Math.round(rate) : TARGET_FRAME_RATE,
    multiview: params.get('multiview') !== '0',
  };
}

/** The slice of an XRSession that frame-rate selection touches (kept narrow so it can be faked in tests). */
export interface FrameRateSession {
  readonly frameRate?: number;
  readonly supportedFrameRates?: ArrayLike<number>;
  updateTargetFrameRate(rate: number): Promise<void>;
}

/** The slice of IWSDK's World that the tuning touches (kept narrow so it can be faked in tests). */
export interface XrTunable {
  readonly renderer: {
    readonly extensions: { has(name: string): boolean };
    readonly xr: {
      setFoveation(value: number): void;
      setFramebufferScaleFactor(value: number): void;
      getSession(): FrameRateSession | null;
      addEventListener(type: 'sessionstart', listener: () => void): void;
    };
  };
}

/**
 * Asks the session for `rate` when the headset lists it. Never throws: a browser without `updateTargetFrameRate`, a rate it does not offer or
 * a refusal leaves the frame rate as the system chose it. Resolves with the rate asked for, or null when nothing was asked.
 */
export async function requestFrameRate(session: FrameRateSession | null, rate: number): Promise<number | null> {
  if (!session || typeof session.updateTargetFrameRate !== 'function') return null;
  const offered = session.supportedFrameRates;
  if (!offered || !Array.from(offered).includes(rate) || session.frameRate === rate) return null;
  try {
    await session.updateTargetFrameRate(rate);
    return rate;
  } catch (error) {
    console.warn(`[wound-up] The headset did not switch to ${rate} Hz; it stays at ${session.frameRate ?? 'its own'} Hz.`, error);
    return null;
  }
}

/** Applies the tuning to a world's renderer. Call it once, right after `World.create`, before any session can start. */
export function installXrTuning(world: XrTunable, search: string): XrTuning {
  const tuning = parseXrTuning(search);
  const { renderer } = world;
  // The extension is looked up when a session starts, so hiding it here is enough to make three draw each eye in turn.
  if (!tuning.multiview) {
    const has = renderer.extensions.has.bind(renderer.extensions);
    renderer.extensions.has = (name: string): boolean => name !== 'OCULUS_multiview' && has(name);
  }
  renderer.xr.setFramebufferScaleFactor(tuning.framebufferScale);
  renderer.xr.setFoveation(tuning.foveation); // three applies the stored value when the session starts
  renderer.xr.addEventListener('sessionstart', () => void requestFrameRate(renderer.xr.getSession(), tuning.frameRate));
  return tuning;
}
