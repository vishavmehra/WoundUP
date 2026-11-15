import { Object3D, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { LessonId } from '../../src/game/content';
import { GhostGuide } from '../../src/onboarding/ghost-guide';
import type { GuideHost, GuideTargets } from '../../src/onboarding/ghost-guide';
import { createGuideHost } from '../../src/onboarding/host';
import type { GameplayView } from '../../src/onboarding/host';
import { FIRST_DELAY_S, OnboardingTracker } from '../../src/onboarding/tracker';

/**
 * The guide's two promises about WHERE it points (PRODUCT_SPEC F15): it follows the stage when the stage moves (the table anchor is followed
 * every frame, a recentre moves the stand), and it never starts before the stage is placed in an immersive session.
 */

function setup(lesson: LessonId | null) {
  const scene = new Scene();
  const stage = new Object3D();
  scene.add(stage);
  const head = new Vector3(0, 1.4, 0.4);
  // The target is 10 cm above the stage origin: found once, in world space, as the host does.
  let resolved = 0;
  const host: GuideHost = {
    lesson: () => lesson,
    busy: () => false,
    resolve: (_lesson, _variant, out: GuideTargets) => {
      resolved++;
      stage.updateWorldMatrix(true, false);
      out.from.set(0, 0.1, 0).applyMatrix4(stage.matrixWorld);
      out.to.copy(out.from);
      out.ghostSource = null;
      return true;
    },
  };
  const guide = new GhostGuide({ scene, frame: stage, host, tracker: new OnboardingTracker(), head: (out) => out.copy(head), variant: () => 'hands', onLearned: () => undefined });
  const pulses = (): Object3D[] => scene.children.filter((c) => c.name === 'GhostPulse' && c.visible);
  const run = (seconds: number): void => {
    for (let t = 0; t < seconds; t += 0.05) guide.update(0.05);
  };
  return { stage, guide, pulses, run, resolved: () => resolved };
}

describe('the guide follows the stage', () => {
  it('keeps pointing at the same spot of the town when the stage is moved and turned mid-showing', () => {
    const { stage, pulses, run, resolved } = setup('latch');
    stage.position.set(0.5, 1.2, -0.5);
    run(FIRST_DELAY_S + 1.8); // the showing began, and the pulse is lit
    expect(resolved()).toBe(1);
    expect(pulses()).toHaveLength(1);
    expect(pulses()[0].position.distanceTo(new Vector3(0.5, 1.3, -0.5))).toBeLessThan(1e-6);

    stage.position.set(-0.3, 1.1, -0.8); // the player recentres
    stage.rotation.y = Math.PI / 2;
    stage.updateWorldMatrix(true, false);
    run(0.3);
    expect(resolved()).toBe(1); // not looked for again: it is carried along
    expect(pulses()[0].position.distanceTo(new Vector3(-0.3, 1.2, -0.8))).toBeLessThan(1e-6);
  });
});

describe('the lesson host before the stage is placed', () => {
  it('names no lesson while the session is not immersive or the stage is hidden, and does not look at anything else', () => {
    const game = { presenting: () => false } as unknown as GameplayView; // any other read would throw
    expect(createGuideHost(game).lesson()).toBeNull();
  });
});
