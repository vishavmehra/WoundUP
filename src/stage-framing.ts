// Projected width of the stand at zoom 1, as a fraction of viewport height, with the authored preview camera
// (measured at 1440x900: 740 px). Vertical FOV is fixed, so this holds at any window size.
const STAND_WIDTH_PER_HEIGHT = 0.82;
const MARGIN = 0.9;
const MIN_ZOOM = 0.3;

/**
 * Camera zoom that keeps the whole stand inside the window: 1 on landscape windows, lower on narrow portrait ones.
 * Immersive sessions ignore it (the headset owns the projection).
 */
export function standZoom(viewW: number, viewH: number): number {
  return Math.max(MIN_ZOOM, Math.min(1, (MARGIN * viewW) / (STAND_WIDTH_PER_HEIGHT * viewH)));
}
