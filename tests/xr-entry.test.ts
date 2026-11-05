import { describe, expect, it, vi } from 'vitest';
import { detectXrSupport, enterXR, type XrLaunchable, type XrMode } from '../src/xr-entry';

const probe = (supported: XrMode[]) => ({
  isSessionSupported: async (mode: XrMode) => supported.includes(mode),
});

describe('detectXrSupport', () => {
  it('prefers mixed reality when both modes exist', async () => {
    expect(await detectXrSupport(probe(['immersive-ar', 'immersive-vr']))).toBe('ar');
  });
  it('falls back to VR, then to none', async () => {
    expect(await detectXrSupport(probe(['immersive-vr']))).toBe('vr');
    expect(await detectXrSupport(probe([]))).toBe('none');
  });
  it('treats a missing navigator.xr as none', async () => {
    expect(await detectXrSupport(undefined)).toBe('none');
  });
  it('treats a throwing probe as unsupported instead of failing', async () => {
    const broken = { isSessionSupported: () => Promise.reject(new Error('SecurityError')) };
    expect(await detectXrSupport(broken)).toBe('none');
  });
});

/** Fake of the World slice, mimicking IWSDK: pending is set synchronously, the session lands later. */
function fakeWorld(outcome: 'adopt' | 'fail'): XrLaunchable & { launched: unknown[] } {
  const world = {
    launched: [] as unknown[],
    session: undefined as unknown,
    sessionRequestPending: false,
    launchXR(options: unknown) {
      world.launched.push(options);
      world.sessionRequestPending = true;
      setTimeout(() => {
        if (outcome === 'adopt') world.session = {};
        world.sessionRequestPending = false;
      }, 120);
    },
  };
  return world;
}

describe('enterXR', () => {
  it('requests the chosen mode synchronously and resolves when the session is adopted', async () => {
    const world = fakeWorld('adopt');
    const done = enterXR(world, 'immersive-ar');
    expect(world.launched).toEqual([{ sessionMode: 'immersive-ar' }]); // before any await: still inside the user gesture
    await expect(done).resolves.toBeUndefined();
  });
  it('rejects with a readable error when the request settles without a session', async () => {
    const world = fakeWorld('fail');
    await expect(enterXR(world, 'immersive-vr')).rejects.toThrow(/did not start/);
  });
  it('propagates a synchronous launch failure', () => {
    const world: XrLaunchable = {
      launchXR: vi.fn(() => {
        throw new Error('XR is disabled for this world.');
      }),
      session: undefined,
      sessionRequestPending: false,
    };
    expect(() => enterXR(world, 'immersive-ar')).toThrow(/disabled/);
  });
});
