import { AnimatedHand } from '@iwsdk/core';
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

export function useSelfHostedHands(world: World): void {
  const { left, right } = world.input.xr.visualAdapters.hand;
  left.updateVisualImplementation(LeftHand);
  right.updateVisualImplementation(RightHand);
}
