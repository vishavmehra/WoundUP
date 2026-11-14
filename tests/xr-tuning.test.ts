import { describe, expect, it, vi } from 'vitest';
import { installXrTuning, parseXrTuning, requestFrameRate, type FrameRateSession, type XrTunable } from '../src/xr-tuning';

const session = (over: Partial<FrameRateSession> = {}): FrameRateSession => ({
  frameRate: 90,
  supportedFrameRates: [72, 80, 90, 120],
  updateTargetFrameRate: vi.fn(() => Promise.resolve()),
  ...over,
});

function fakeWorld(active: FrameRateSession | null, offered = new Set(['OCULUS_multiview', 'OTHER'])) {
  const listeners: Array<() => void> = [];
  const calls: string[] = [];
  const extensions = { has: (name: string): boolean => offered.has(name) };
  const world: XrTunable = {
    renderer: {
      extensions,
      xr: {
        setFoveation: (v) => void calls.push(`foveation ${v}`),
        setFramebufferScaleFactor: (v) => void calls.push(`scale ${v}`),
        getSession: () => active,
        addEventListener: (_type, listener) => void listeners.push(listener),
      },
    },
  };
  return { world, calls, extensions, startSession: () => listeners.forEach((l) => l()) };
}

describe('parseXrTuning', () => {
  it('defaults to the settings the budgets assume: foveation 1, scale 1, 72 Hz, multiview on', () => {
    expect(parseXrTuning('')).toEqual({ foveation: 1, framebufferScale: 1, frameRate: 72, multiview: true });
    expect(parseXrTuning('?debug&demo=carousel')).toEqual(parseXrTuning(''));
  });

  it('reads the four switches and clamps what is out of range', () => {
    expect(parseXrTuning('?foveation=0.5&xrscale=0.8&xrfps=90&multiview=0')).toEqual({ foveation: 0.5, framebufferScale: 0.8, frameRate: 90, multiview: false });
    expect(parseXrTuning('?foveation=7&xrscale=0.01')).toMatchObject({ foveation: 1, framebufferScale: 0.5 });
    expect(parseXrTuning('?foveation=-3&xrscale=99')).toMatchObject({ foveation: 0, framebufferScale: 2 });
  });

  it('falls back to the defaults for anything unreadable', () => {
    expect(parseXrTuning('?foveation=abc&xrscale=&xrfps=NaN&multiview=maybe')).toEqual(parseXrTuning(''));
    expect(parseXrTuning('?xrfps=-72')).toMatchObject({ frameRate: 72 });
  });
});

describe('requestFrameRate', () => {
  it('asks for the rate when the headset lists it and is not already there', async () => {
    const s = session();
    await expect(requestFrameRate(s, 72)).resolves.toBe(72);
    expect(s.updateTargetFrameRate).toHaveBeenCalledWith(72);
  });

  it('asks for nothing when the rate is unlisted, already set, or the API is missing', async () => {
    const unlisted = session({ supportedFrameRates: [90, 120] });
    expect(await requestFrameRate(unlisted, 72)).toBeNull();
    expect(unlisted.updateTargetFrameRate).not.toHaveBeenCalled();
    const there = session({ frameRate: 72 });
    expect(await requestFrameRate(there, 72)).toBeNull();
    expect(there.updateTargetFrameRate).not.toHaveBeenCalled();
    expect(await requestFrameRate(session({ supportedFrameRates: undefined }), 72)).toBeNull();
    expect(await requestFrameRate({ frameRate: 90, supportedFrameRates: [72] } as unknown as FrameRateSession, 72)).toBeNull();
    expect(await requestFrameRate(null, 72)).toBeNull();
  });

  it('survives a refusal: the frame rate stays as the system chose it, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const refusing = session({ updateTargetFrameRate: vi.fn(() => Promise.reject(new Error('no'))) });
    await expect(requestFrameRate(refusing, 72)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('installXrTuning', () => {
  it('sets scale and foveation before any session, and asks for 72 Hz when one starts', async () => {
    const s = session();
    const { world, calls, startSession } = fakeWorld(s);
    const tuning = installXrTuning(world, '');
    expect(tuning.frameRate).toBe(72);
    expect(calls).toEqual(['scale 1', 'foveation 1']);
    expect(s.updateTargetFrameRate).not.toHaveBeenCalled();
    startSession();
    await Promise.resolve();
    expect(s.updateTargetFrameRate).toHaveBeenCalledWith(72);
  });

  it('leaves multiview to the extension by default, and hides the extension on ?multiview=0 only', () => {
    const on = fakeWorld(null);
    installXrTuning(on.world, '');
    expect(on.extensions.has('OCULUS_multiview')).toBe(true);
    const off = fakeWorld(null);
    installXrTuning(off.world, '?multiview=0');
    expect(off.extensions.has('OCULUS_multiview')).toBe(false);
    expect(off.extensions.has('OTHER')).toBe(true);
  });

  it('applies the switches it is given', () => {
    const { world, calls } = fakeWorld(null);
    installXrTuning(world, '?foveation=0.25&xrscale=0.9');
    expect(calls).toEqual(['scale 0.9', 'foveation 0.25']);
  });
});
