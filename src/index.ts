import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { GrabFeedbackSystem } from './grab-feedback.js';
import { GrabModeSystem } from './grab-mode.js';
import { useSelfHostedHands } from './hands.js';
import { mountLanding } from './landing/landing.js';
import { StageSystem } from './stage.js';
import { detectXrSupport, enterXR } from './xr-entry.js';

const sceneContainer = document.getElementById('scene-container') as HTMLDivElement;
const landingRoot = document.getElementById('landing-root') as HTMLElement;

let world: World | undefined;
/** What the 2D page shows while no immersive session is running. */
let idleMode: 'landing' | 'preview' = 'landing';

const landing = mountLanding(landingRoot, {
  // Called synchronously from the click handler: WebXR needs the user gesture.
  onEnterXR: (mode) => {
    if (!world) throw new Error('The workshop is still unpacking. Try again in a moment.');
    return enterXR(world, mode);
  },
  onPreview: () => {
    idleMode = 'preview';
  },
  onBack: () => {
    idleMode = 'landing';
  },
});

landing.setSupport('checking');
landing.setLoading(0);

try {
  const [created, support] = await Promise.all([
    World.create(sceneContainer, projectOptions),
    detectXrSupport(),
  ]);
  world = created;
  useSelfHostedHands(world);
  world
    .registerSystem(StageSystem)
    .registerSystem(GrabModeSystem, { configData: { hands: support !== 'none' } })
    .registerSystem(GrabFeedbackSystem);
  // Opt-in QA hook (?debug): browser tests read scene state through it. Nothing is exposed otherwise.
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __world: world });
  world.visibilityState.subscribe((state) => {
    landing.setMode(state === VisibilityState.NonImmersive ? idleMode : 'xr');
  });
  landing.setSupport(support);
} catch (error) {
  console.error('[wound-up] Could not start the 3D view:', error);
  landing.setSupport('none');
  landing.showError('This browser could not start the 3D view. Try a recent Chrome, Edge or Meta Quest Browser.');
} finally {
  landing.setLoading(null);
}
