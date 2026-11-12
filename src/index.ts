import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { GrabFeedbackSystem } from './grab-feedback.js';
import { GrabModeSystem } from './grab-mode.js';
import { useSelfHostedHands } from './hands.js';
import { mountLanding, type LandingOptions } from './landing/landing.js';
import { applyLibraryMaterials, createMaterialRegistry } from './materials/index.js';
import { installRenderBudget, type RenderBudget } from './render-budget.js';
import { StageSystem } from './stage.js';
import { standZoom } from './stage-framing.js';
import { detectXrSupport, enterXR } from './xr-entry.js';

const sceneContainer = document.getElementById('scene-container') as HTMLDivElement;
const landingRoot = document.getElementById('landing-root') as HTMLElement;

let world: World | undefined;
/** What the 2D page shows while no immersive session is running. */
let idleMode: 'landing' | 'preview' = 'landing';
let renderBudget: RenderBudget | undefined;

const landingOptions: LandingOptions = {
  // Called synchronously from the click handler: WebXR needs the user gesture.
  onEnterXR: (mode) => {
    if (!world) throw new Error('The workshop is still unpacking. Try again in a moment.');
    return enterXR(world, mode);
  },
  onPreview: () => {
    // Without a world the preview would be an empty page with a hint about a gear that is not there.
    if (!world) throw new Error('The 3D view did not start.');
    idleMode = 'preview';
    renderBudget?.setMode('live');
  },
  onBack: () => {
    idleMode = 'landing';
    renderBudget?.setMode('still');
  },
};
const landing = mountLanding(landingRoot, landingOptions);

landing.setSupport('checking');
landing.setLoading(0);

function fitStand(): void {
  if (!world) return;
  world.camera.zoom = standZoom(window.innerWidth, window.innerHeight);
  world.camera.updateProjectionMatrix();
}

try {
  const [created, support] = await Promise.all([
    World.create(sceneContainer, projectOptions),
    detectXrSupport(),
  ]);
  world = created;
  // Landing actions stay disabled until setSupport below, so the preview cannot have started yet.
  const budget = (renderBudget = installRenderBudget(world));
  // Shared library materials (ADR-032) go only on GLBs built with the library profile; the M0 stand still carries its
  // own baked textures and no 0.1 m UVs. Swap before the grab feedback system copies the part's materials.
  const materials = await createMaterialRegistry();
  await materials.loadTextures(['Mat_AgedBrass']);
  const gear = world.getSceneObject('gear-16');
  if (gear) {
    const report = applyLibraryMaterials(gear, materials);
    if (report.unknown.length) console.warn('[wound-up] Not in the material library:', report.unknown);
  }
  useSelfHostedHands(world);
  world
    .registerSystem(StageSystem)
    .registerSystem(GrabModeSystem, { configData: { hands: support !== 'none' } })
    .registerSystem(GrabFeedbackSystem);
  // Opt-in QA hook (?debug): browser tests read scene state through it. Nothing is exposed otherwise.
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __world: world });
  fitStand();
  window.addEventListener('resize', fitStand);
  world.visibilityState.subscribe((state) => {
    landing.setMode(state === VisibilityState.NonImmersive ? idleMode : 'xr');
    budget.wake(); // the scene moved while the session ran, so redraw what the landing shows
  });
  // With WebXR available parts answer to hands, not the mouse (ADR-024), so the default "drag it" hint would be untrue.
  if (support !== 'none') {
    const enter = support === 'vr' ? 'Enter VR' : 'Enter mixed reality';
    landingOptions.previewHint = `This preview is for looking. ${enter} to pick up the gear with your hands.`;
  }
  landing.setSupport(support);
} catch (error) {
  console.error('[wound-up] Could not start the 3D view:', error);
  landing.setSupport('none');
  landing.showError('This browser could not start the 3D view. Try a recent Chrome, Edge or Meta Quest Browser.');
} finally {
  landing.setLoading(null);
}
