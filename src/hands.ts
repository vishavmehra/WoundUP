import { AnimatedHand, AssetManager, DEFAULT_PROFILES_PATH } from '@iwsdk/core';
import type { World } from '@iwsdk/core';

const handUrl = (side: 'left' | 'right'): string =>
  `${import.meta.env.BASE_URL}assets/xr/generic-hand/${side}.glb`;

// IWSDK downloads its default hand models from a public CDN when hand tracking starts.
// Serve the same models (WebXR Input Profiles 1.0.20, MIT; see docs/CREDITS.md) from our own origin instead,
// so the game needs no third-party request (CLAUDE.md §16) and works offline.
class LeftHand extends AnimatedHand {
  static assetPath = handUrl('left');
  static assetKeyPrefix = 'wound-up-left-hand';
}

class RightHand extends AnimatedHand {
  static assetPath = handUrl('right');
  static assetKeyPrefix = 'wound-up-right-hand';
}

const controllerUrl = (side: 'left' | 'right'): string =>
  `${import.meta.env.BASE_URL}assets/xr/profiles/meta-quest-touch-plus/${side}.glb`;

/**
 * Where a request for a controller model goes. IWSDK resolves the input profile from its own bundled table and then always
 * requests `<DEFAULT_PROFILES_PATH>/<profile>/<hand>.glb` (jsDelivr); the per-class `assetPath` hook used for the hands is
 * ignored for controllers and the adapter's loader is protected, so the URL is the only place left to redirect.
 * Every profile gets the Quest 3/3S Touch Plus model (the controllers the game targets). A profile IWSDK does not recognise
 * falls back to `generic-trigger`, whose models we do not ship; AnimatedController skips nodes the model does not have, so the
 * Touch Plus model works under any layout. Anything outside DEFAULT_PROFILES_PATH is left alone.
 */
export function selfHostedControllerUrl(url: string): string {
  if (!url.startsWith(`${DEFAULT_PROFILES_PATH}/`)) return url;
  return controllerUrl(url.endsWith('/left.glb') ? 'left' : 'right'); // right also serves `none.glb`, a handedness no Quest reports
}

export function useSelfHostedHands(world: World): void {
  const { left, right } = world.input.xr.visualAdapters.hand;
  left.updateVisualImplementation(LeftHand);
  right.updateVisualImplementation(RightHand);
  // The shared LoadingManager every IWSDK GLTF load goes through (created in World.create, so after it): its URL modifier is
  // the one hook that sees the controller request.
  AssetManager.loadingManager.setURLModifier(selfHostedControllerUrl);
}
