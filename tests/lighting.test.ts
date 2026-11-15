import { AgXToneMapping } from '@iwsdk/core';
import { describe, expect, it } from 'vitest';
import { installToneMapping, TONE_EXPOSURE, TONE_MAPPING } from '../src/lighting';

describe('installToneMapping', () => {
  it('sets AgX and a lifted exposure on the renderer (the scene file can only name ACES)', () => {
    const renderer = { toneMapping: 4, toneMappingExposure: 1 }; // what the scene file leaves: ACES at 1
    installToneMapping(renderer);
    expect(renderer.toneMapping).toBe(AgXToneMapping);
    expect(TONE_MAPPING).toBe(AgXToneMapping);
    expect(renderer.toneMappingExposure).toBe(TONE_EXPOSURE);
    expect(TONE_EXPOSURE).toBeGreaterThanOrEqual(1);
    expect(TONE_EXPOSURE).toBeLessThanOrEqual(1.6); // brighter than this and the cream is blown, not read
  });
});
