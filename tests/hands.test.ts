import { DEFAULT_PROFILES_PATH } from '@iwsdk/core';
import { describe, expect, it } from 'vitest';
import { selfHostedControllerUrl } from '../src/hands.js';

// The project has no @types/node; this is the one call used.
const fs = (await import('node:fs' as string)) as { existsSync(path: string): boolean };

const plus = (side: string) => `/assets/xr/profiles/meta-quest-touch-plus/${side}.glb`; // import.meta.env.BASE_URL is "/" under vitest

describe('ADR-025: controller models come from our own origin', () => {
  it('sends the Quest 3/3S profile, and every other one IWSDK may ask for, to the Touch Plus model we ship', () => {
    for (const profile of ['meta-quest-touch-plus', 'meta-quest-touch-plus-v2', 'meta-quest-touch-pro', 'oculus-touch-v3', 'generic-trigger']) {
      expect(selfHostedControllerUrl(`${DEFAULT_PROFILES_PATH}/${profile}/left.glb`)).toBe(plus('left'));
      expect(selfHostedControllerUrl(`${DEFAULT_PROFILES_PATH}/${profile}/right.glb`)).toBe(plus('right'));
    }
    expect(selfHostedControllerUrl(`${DEFAULT_PROFILES_PATH}/generic-trigger/none.glb`)).toBe(plus('right'));
  });

  it('leaves every other request alone', () => {
    for (const url of [
      './assets/xr/generic-hand/left.glb',
      '/assets/models/shared/gear/gear.glb',
      `${DEFAULT_PROFILES_PATH}X/meta-quest-touch-plus/left.glb`, // a longer path is not the profiles folder
      'https://example.com/left.glb',
    ]) {
      expect(selfHostedControllerUrl(url)).toBe(url);
    }
  });

  it('points at files that exist in public/', () => {
    for (const side of ['left', 'right']) {
      expect(fs.existsSync(`public${selfHostedControllerUrl(`${DEFAULT_PROFILES_PATH}/x/${side}.glb`)}`)).toBe(true);
    }
  });
});
