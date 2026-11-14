/**
 * Framing of the 2D page (the desktop preview and the gift viewer): which zoom and which shift of the authored preview camera
 * keep the whole stage, or one machine, inside the part of the window that no panel covers. Pure maths, no three.js: the
 * camera is the one authored in iwsdk.config.json and the stage root the one in public/scenes/main.iwsdk.scene.json
 * (tests/stage-framing.test.ts reads both files, so a change to either fails there instead of silently mis-framing).
 * Immersive sessions ignore all of it: the headset owns the projection.
 */

export type V3 = readonly [number, number, number];

/** An axis-aligned box in stage-local metres (stage root = the velvet top, +Y up, +Z towards the player). */
export interface StageBox {
  readonly min: V3;
  readonly max: V3;
}

/** Pixels of the window that something else covers: a panel, a button bar, a card. */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** What `fitStand` applies: `camera.zoom`, and `camera.setViewOffset(w, h, offsetX, offsetY, w, h)`. */
export interface StageFrame {
  readonly zoom: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

// The authored preview camera (iwsdk.config.json `world.render`) and the stage root (the scene's `stage` node).
export const PREVIEW_CAMERA = { position: [0, 1.2, 0], lookAt: [0, 0.85, -0.55], fovDeg: 45 } as const;
/**
 * Where the stage root stands in the 2D page. Immersive sessions place it themselves (table anchor or stand), so this is the
 * authored pose only: about a metre along the camera's line of sight, so the near edge of the stage is not under the lens (the
 * stand is 64 x 59 cm and the workbench reaches its front edge) and the town reads from the front, from above.
 */
export const STAGE_ORIGIN: V3 = [0, 0.6, -0.95];

/** Everything that can stand on the stage, in stage-local metres (TOCKTON_DIMENSIONS §3, §4, §5, §9). */
export const STAND_BOX: StageBox = { min: [-0.32, -0.045, -0.17], max: [0.32, 0, 0.42] };
/** The town's 60 x 30 cm footprint and the tallest thing on it (the Clock Tower, or the trunk with its lid open). */
export const TOWN_BOX: StageBox = { min: [-0.3, 0, -0.15], max: [0.3, 0.3, 0.15] };
/** The workbench (45 x 25 cm, 3 cm top) and the run sign that stands on it. */
export const BENCH_BOX: StageBox = { min: [-0.225, 0, 0.15], max: [0.225, 0.17, 0.4] };
export const STAGE_BOXES: readonly StageBox[] = [STAND_BOX, TOWN_BOX, BENCH_BOX];

/** The window around the stage that stays empty, as a fraction of the free area. */
const MARGIN = 0.94;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
/** The preview's own buttons (Back to start, Enter XR above; the hint below) keep this much of the window. */
export const PREVIEW_INSETS: Insets = { top: 64, right: 0, bottom: 72, left: 0 };

const tanHalfFov = Math.tan((PREVIEW_CAMERA.fovDeg * Math.PI) / 360);
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const FORWARD = unit(sub(PREVIEW_CAMERA.lookAt, PREVIEW_CAMERA.position));
const RIGHT = unit(cross(FORWARD, [0, 1, 0]));
const UP = cross(RIGHT, FORWARD);

/** Corners of every box. */
function corners(boxes: readonly StageBox[]): V3[] {
  const out: V3[] = [];
  for (const { min, max } of boxes) {
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  }
  return out;
}

/**
 * Where the boxes land on screen with zoom 1, in units where the window is two units tall (y up) and `W / H` times two wide.
 * Every corner is in front of the camera: the stage is half a metre away and the camera looks at it.
 */
export function projectedBounds(boxes: readonly StageBox[]): { xmin: number; xmax: number; ymin: number; ymax: number } {
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const q of corners(boxes)) {
    const d = sub([STAGE_ORIGIN[0] + q[0], STAGE_ORIGIN[1] + q[1], STAGE_ORIGIN[2] + q[2]], PREVIEW_CAMERA.position);
    const depth = dot(d, FORWARD) * tanHalfFov;
    const x = dot(d, RIGHT) / depth;
    const y = dot(d, UP) / depth;
    xmin = Math.min(xmin, x);
    xmax = Math.max(xmax, x);
    ymin = Math.min(ymin, y);
    ymax = Math.max(ymax, y);
  }
  return { xmin, xmax, ymin, ymax };
}

/**
 * The zoom and the shift that put `boxes` in the middle of the window minus `insets`, as large as fits (never beyond
 * `maxZoom`). A degenerate window gives the floor zoom and no shift.
 */
export function frameBoxes(viewW: number, viewH: number, boxes: readonly StageBox[], insets: Insets = PREVIEW_INSETS, maxZoom = MAX_ZOOM, margin = MARGIN): StageFrame {
  const freeW = viewW - insets.left - insets.right;
  const freeH = viewH - insets.top - insets.bottom;
  if (!(viewW > 0 && viewH > 0 && freeW > 0 && freeH > 0)) return { zoom: MIN_ZOOM, offsetX: 0, offsetY: 0 };
  const b = projectedBounds(boxes);
  const halfW = (b.xmax - b.xmin) / 2;
  const halfH = (b.ymax - b.ymin) / 2;
  const zoom = Math.max(MIN_ZOOM, Math.min(maxZoom, (margin * freeW) / viewH / halfW, (margin * freeH) / viewH / halfH));
  // Centre of the free area and of the content, in the same units (two per window height).
  const cx = (insets.left - insets.right) / viewH;
  const cy = (insets.bottom - insets.top) / viewH;
  const shiftX = cx - (zoom * (b.xmin + b.xmax)) / 2;
  const shiftY = cy - (zoom * (b.ymin + b.ymax)) / 2;
  // Content moving right is the view window moving left, hence the sign; content moving up is the window moving down.
  return { zoom, offsetX: (-shiftX * viewH) / 2, offsetY: (shiftY * viewH) / 2 };
}

/** The whole stage: stand, town and workbench, clear of the preview's own buttons. */
export const stageFrame = (viewW: number, viewH: number, insets: Insets = PREVIEW_INSETS): StageFrame => frameBoxes(viewW, viewH, STAGE_BOXES, insets, 1.4);

/** A margin of velvet round a machine, so it does not touch the edge of the frame. */
const SKIRT_M = 0.03;
/** A machine gets more air than the whole stage: the card and the preview's buttons sit close by. */
const MACHINE_MARGIN = 0.84;

/** One machine (its box in stage-local metres) with a margin of velvet round it, for the gift viewer. */
export function machineFrame(viewW: number, viewH: number, machine: StageBox, insets: Insets): StageFrame {
  const skirt: StageBox = {
    min: [machine.min[0] - SKIRT_M, machine.min[1], machine.min[2] - SKIRT_M],
    max: [machine.max[0] + SKIRT_M, machine.max[1], machine.max[2] + SKIRT_M],
  };
  return frameBoxes(viewW, viewH, [skirt], insets, MAX_ZOOM, MACHINE_MARGIN);
}

/** The zoom alone, for callers that do not shift the view. */
export const standZoom = (viewW: number, viewH: number): number => stageFrame(viewW, viewH).zoom;
