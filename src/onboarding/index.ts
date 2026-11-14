import { GhostGuide, loadGhostHand } from './ghost-guide';
import { createGuideHost, variantNow } from './host';
import type { GameplayView } from './host';
import { OnboardingTracker } from './tracker';

export { GhostGuide } from './ghost-guide';
export type { GuideHost, GuideTargets } from './ghost-guide';
export type { BuildView, CarriedView, GameplayView } from './host';
export { OnboardingTracker, FIRST_DELAY_S, IDLE_S } from './tracker';

/**
 * Starts the ghost-hand onboarding (PRODUCT_SPEC F15): the tracker from the saved lessons, the guide that draws the hands, and the hand model
 * loading in the background (until it arrives a showing is only the pulse). The game loop steps it every frame (`guide.update`) and tells it
 * which gestures the player has done (`guide.complete`); it saves a lesson through `GameSession.learn`.
 */
export function installOnboarding(game: GameplayView, keepAwake: () => void): GhostGuide {
  const tracker = new OnboardingTracker(game.session.save.learned);
  const guide = new GhostGuide({
    scene: game.world.scene,
    host: createGuideHost(game),
    tracker,
    head: (out) => game.world.player.head.getWorldPosition(out),
    variant: variantNow,
    onLearned: (lesson) => void game.session.learn(lesson),
    keepAwake,
  });
  void loadGhostHand().then((rig) => {
    if (rig) guide.setHand(rig);
  });
  return guide;
}
