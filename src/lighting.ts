/**
 * Tone mapping of the whole picture (CLAUDE.md §8: warm, restrained, no extra passes). The lights and the gradient environment are
 * authored in public/scenes/main.iwsdk.scene.json (IWSDK's LightSystem and EnvironmentSystem read them); this is the one thing the
 * scene file cannot say, because its `environment.toneMapping` only knows none, linear, reinhard, cineon and aces.
 *
 * AgX, not the file's ACES: ACES crushes the shadows of dark walnut and the inside of a case to black and pushes every saturated
 * colour towards orange, and the town is mostly dark wood, brass and teal. AgX keeps the darks readable, keeps cream as cream and
 * brass as brass, and is applied inside each material's shader, so it costs no render pass. Measured on the 2D page: the share of
 * crushed pixels (luminance below 12 of 255) in the demo views fell from 22 to 26 % to under 1 % in the tower view.
 *
 * Exposure is the one brightness knob that is not a light: 1.35 is for the passthrough room of a Quest (a lit room behind the town makes
 * a dim town look transparent). The night look is made by the lights (src/town/night.ts), so it follows from this.
 * The scene file's `toneMapping: "aces"` stays as the fallback and is replaced here once the level has loaded (`World.create`
 * resolves after the level has applied its environment).
 */
import { AgXToneMapping } from '@iwsdk/core';

export const TONE_MAPPING = AgXToneMapping;
export const TONE_EXPOSURE = 1.35;

/** The part of the renderer this touches (a `WebGLRenderer` is one). */
export interface ToneMappable {
  toneMapping: number;
  toneMappingExposure: number;
}

/** Sets the picture's tone mapping and exposure. Call once, after `World.create`. */
export function installToneMapping(renderer: ToneMappable): void {
  renderer.toneMapping = TONE_MAPPING;
  renderer.toneMappingExposure = TONE_EXPOSURE;
}
