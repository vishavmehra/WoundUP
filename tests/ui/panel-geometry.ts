import { Matrix4, Quaternion, Vector3 } from 'three';
import { SETTING_ROWS } from '../../src/ui/copy';
import type { V3 } from '../../src/ui/comfort';
import { PANEL_BUTTON, PAUSE_BUTTON_ROW_Y, PAUSE_PANEL_BASE, PAUSE_PANEL_SCALE, PAUSE_PANEL_SPOT, SETTING_PLAQUE, SETTING_ROW_STEP, SETTING_ROW_Y } from '../../src/ui/layout';

/** Where the pause panel's plaques stand in the stage, the way flow-ui poses them (shared by tests/ui/layout.test.ts and tests/ui/hot-zones.test.ts). */

/** A flat rectangle on the panel: centre (x, y) from the panel's centre and size, metres, before the panel's scale. */
export interface PanelItem {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Everything the player presses on the pause panel: the five setting plaques (one per `SETTING_ROWS`), then Resume and Restart chapter. */
export const PAUSE_PLAQUES: readonly PanelItem[] = [
  ...SETTING_ROWS.map((row, i): PanelItem => ({ name: row.label, x: 0, y: SETTING_ROW_Y - i * SETTING_ROW_STEP, ...SETTING_PLAQUE })),
  { name: 'Resume', x: -PANEL_BUTTON.x, y: PAUSE_BUTTON_ROW_Y, w: PANEL_BUTTON.w, h: PANEL_BUTTON.h },
  { name: 'Restart chapter', x: PANEL_BUTTON.x, y: PAUSE_BUTTON_ROW_Y, w: PANEL_BUTTON.w, h: PANEL_BUTTON.h },
];
/** The walnut base the plaques stand on. */
export const PAUSE_BASE: PanelItem = { name: 'panel base', x: 0, y: 0, ...PAUSE_PANEL_BASE };

export interface PlacedItem {
  readonly name: string;
  readonly centre: V3;
  /** The four corners, in the stage's frame. */
  readonly corners: readonly V3[];
  /** A point of the rectangle by fractions of its half width and half height (0, 0 is the centre; 1, -1 the right bottom corner), in the stage's frame. */
  readonly at: (fx: number, fy: number) => V3;
}

const UP = new Vector3(0, 1, 0);

/**
 * `items` on a panel at `spot`, drawn at `scale`, turned to face `eye`: flow-ui's `faceHead` is `Object3D.lookAt(head)`, whose +Z points at the head
 * with the up axis kept as near +Y as it can (so the top of the panel leans away from a head that is above it).
 */
export function placePanel(eye: V3, items: readonly PanelItem[], spot: V3 = PAUSE_PANEL_SPOT, scale = PAUSE_PANEL_SCALE): PlacedItem[] {
  const position = new Vector3(spot.x, spot.y, spot.z);
  const facing = new Matrix4().lookAt(new Vector3(eye.x, eye.y, eye.z), position, UP);
  const world = new Matrix4().compose(position, new Quaternion().setFromRotationMatrix(facing), new Vector3(scale, scale, scale));
  return items.map((item) => {
    const at = (fx: number, fy: number): V3 => {
      const p = new Vector3(item.x + (fx * item.w) / 2, item.y + (fy * item.h) / 2, 0).applyMatrix4(world);
      return { x: p.x, y: p.y, z: p.z };
    };
    return { name: item.name, centre: at(0, 0), corners: [-1, 1].flatMap((fx) => [-1, 1].map((fy) => at(fx, fy))), at };
  });
}
