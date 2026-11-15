import { mountLanding, type Landing, type LandingOptions } from './landing/landing.js';

/**
 * The landing page, mounted the moment the entry module runs (src/main.ts), long before the 3D world exists: it is plain HTML and CSS,
 * so it paints at once, and the heavy module (src/index.ts: IWSDK, three.js, the game) fills in the actions behind it. Until it does
 * the buttons stay disabled (`setSupport('checking')` and `setLoading(0)` below), so these placeholders only answer a call that
 * should not happen.
 */
const unpacking = (): never => {
  throw new Error('The workshop is still unpacking. Try again in a moment.');
};

export const landingOptions: LandingOptions = { onEnterXR: unpacking, onPreview: unpacking };

export const landing: Landing = mountLanding(document.getElementById('landing-root') as HTMLElement, landingOptions);

landing.setSupport('checking');
landing.setLoading(0);
