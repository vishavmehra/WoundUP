import { metaQuest3 } from 'iwer';
import { describe, expect, it } from 'vitest';
import { isHeadsetBrowser } from '../../src/emulator/guard.js';
import { HELP_LEDE, HELP_STEPS, HELP_TITLE } from '../../src/emulator/help-card.js';

describe('isHeadsetBrowser: the emulator never installs on a headset', () => {
  it('knows Meta Quest Browser, on every Quest', () => {
    const quest3 = 'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/33.0.0.x.x.x Chrome/126.0.6478.122 VR Safari/537.36';
    expect(isHeadsetBrowser(quest3)).toBe(true);
    expect(isHeadsetBrowser(metaQuest3.userAgent)).toBe(true); // the user agent IWER sets: a second install attempt after ours is refused too
  });

  it('lets desktop and phone browsers through', () => {
    expect(isHeadsetBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')).toBe(false);
    expect(isHeadsetBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(isHeadsetBrowser('')).toBe(false);
  });
});

describe('the help card names the controls IWER really has', () => {
  const text = [HELP_LEDE, ...HELP_STEPS.map((s) => `${s.term} ${s.text}`)].join(' ');

  it('labels the mode honestly: an emulated headset, simulated in the browser', () => {
    expect(HELP_TITLE).toMatch(/emulated/i);
    expect(HELP_LEDE).toMatch(/not a real one/i);
  });

  it('matches @iwer/devui 2.8.0: pinch on the mouse buttons, WASD, Pinch bar and play button', async () => {
    // The package's source of truth for key bindings; the card must change when an upgrade changes them.
    const { DEFAULT_KEYMAP } = await import('@iwer/devui');
    const { left, right } = DEFAULT_KEYMAP;
    expect(left?.pinch).toBe('MouseLeft');
    expect(right?.pinch).toBe('MouseRight');
    expect([left?.['thumbstick-up'], left?.['thumbstick-left'], left?.['thumbstick-down'], left?.['thumbstick-right']]).toEqual(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
    expect(text).toMatch(/left click to pinch with the left hand, right click for the right/);
    expect(text).toMatch(/Shift \+ W A S D walks/);
    expect(text).toMatch(/Pinch bar/);
    expect(text).toMatch(/play button/);
  });

  it('stays short enough to read at a glance', () => {
    expect(HELP_STEPS.length).toBeLessThanOrEqual(4);
    expect(text.split(/\s+/).length).toBeLessThan(120);
  });
});
