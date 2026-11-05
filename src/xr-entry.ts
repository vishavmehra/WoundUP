import type { SessionMode } from '@iwsdk/core';

/** What the current browser/device can start. 'ar' = mixed reality (preferred), 'vr' = VR only. */
export type XrSupport = 'ar' | 'vr' | 'none';
export type XrMode = 'immersive-ar' | 'immersive-vr';

export interface XrProbe {
  isSessionSupported(mode: XrMode): Promise<boolean>;
}

/** The slice of IWSDK's World that entering a session touches (kept narrow so it can be faked in tests). */
export interface XrLaunchable {
  launchXR(options: { sessionMode: SessionMode }): void;
  readonly session: unknown;
  readonly sessionRequestPending: boolean;
}

const hasNavigator = typeof navigator !== 'undefined';

/**
 * PRODUCT_SPEC §3.1 entry order: immersive-ar when supported, else immersive-vr, else desktop preview.
 * Probing never throws: any failure counts as "not supported".
 */
export async function detectXrSupport(
  xr: XrProbe | undefined = hasNavigator ? navigator.xr : undefined,
): Promise<XrSupport> {
  if (!xr) return 'none';
  const supports = (mode: XrMode) => xr.isSessionSupported(mode).catch(() => false);
  const [ar, vr] = await Promise.all([supports('immersive-ar'), supports('immersive-vr')]);
  return ar ? 'ar' : vr ? 'vr' : 'none';
}

const POLL_MS = 50;
const GIVE_UP_MS = 20_000;

/**
 * Start an immersive session through IWSDK's own flow (no parallel session manager, TECH_ARCH §5).
 *
 * MUST be called synchronously from a click handler: WebXR requires a user gesture.
 * `World.launchXR` only logs failures, so this resolves once the session is adopted and rejects
 * when the request settles without one (denied permission, unsupported features, device busy).
 */
export function enterXR(world: XrLaunchable, mode: XrMode): Promise<void> {
  // The enum's runtime values are exactly 'immersive-ar' / 'immersive-vr'; a type-only import keeps this file free of the heavy runtime.
  world.launchXR({ sessionMode: mode as unknown as SessionMode });
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const poll = () => {
      if (world.session != null) return resolve();
      if (!world.sessionRequestPending) {
        return reject(new Error('The headset did not start the session.'));
      }
      if (Date.now() - startedAt > GIVE_UP_MS) {
        return reject(new Error('The headset took too long to answer.'));
      }
      setTimeout(poll, POLL_MS);
    };
    poll();
  });
}
