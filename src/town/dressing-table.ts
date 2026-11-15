/**
 * Tockton's dressing: the houses, street props and lamp posts that make the paving read as a town (TOCKTON_EXTRA_ASSET_SPECS
 * §2, §3 and the `lamp_post` entry). Pure data and small functions, no three: `DRESSING` below is the ONE table. Moving a piece,
 * turning it or changing the plot that wakes it is an edit of its row, nothing else; tests/town/dressing.test.ts checks every row
 * (inside the ground, clear of the pads, the new plots' area, the aisle and the buildings, inside its plot's ripple).
 *
 * Units of a row: x and z in centimetres in town space at scale 1 (origin at the town centre, +X to the player's right, +Z towards
 * the player), the floor-contact centre of the piece; `yawDeg` turns it about +Y (0 faces +Z, the street; 90 faces +X).
 * `wakes` is the plot whose ripple brings the piece's colour back (and its lit windows, for houses and lamps).
 */
import type { PlotId } from '../game/content';
import { DRESS_GRID, PLOT_WAKE_GROUP } from './layout';

/** GLB files of the dressing (relative to `assets/models/`). */
export const DRESSING_MODEL_PATHS = {
  houses: 'tockton/environment/town_houses.glb',
  props: 'tockton/environment/town_props_set.glb',
  lamp: 'tockton/environment/lamp_post.glb',
} as const;
export type DressingFile = keyof typeof DRESSING_MODEL_PATHS;

/** One placeable piece: where it lives, and its footprint and height at scale 1 (the spec tables; the tests compare them with the GLBs). */
export interface DressingNode {
  readonly file: DressingFile;
  readonly kind: 'house' | 'prop' | 'lamp';
  readonly widthCm: number;
  readonly depthCm: number;
  readonly heightCm: number;
}
const node = (file: DressingFile, kind: DressingNode['kind'], widthCm: number, depthCm: number, heightCm: number): DressingNode => ({ file, kind, widthCm, depthCm, heightCm });

export const DRESSING_NODES = {
  TownHouse_Tall: node('houses', 'house', 4.62, 6.58, 18.94),
  TownHouse_Corner: node('houses', 'house', 4.82, 6.71, 15.3),
  TownHouse_Cottage: node('houses', 'house', 7.62, 7.07, 14.09),
  TownHouse_Jetty: node('houses', 'house', 7.22, 7.27, 15.06),
  TownProp_Bench: node('props', 'prop', 4.24, 1.85, 2.57),
  TownProp_Fence: node('props', 'prop', 6.15, 0.45, 2.14),
  TownProp_Tree: node('props', 'prop', 5.06, 4.86, 7.9),
  TownProp_Shrub: node('props', 'prop', 3.3, 2.7, 1.87),
  TownProp_Planter: node('props', 'prop', 4.06, 1.36, 2.34),
  TownProp_Signboard: node('props', 'prop', 3.23, 0.95, 4.88),
  TownProp_PathEdging: node('props', 'prop', 5.86, 0.8, 0.46),
  // lamp_post.glb has no `originM`: its origin is the base centre. Footprint is the housing's base plate.
  LampPost: node('lamp', 'lamp', 2.22, 1.8, 6.5),
} as const satisfies Record<string, DressingNode>;
export type DressingNodeName = keyof typeof DRESSING_NODES;

export interface DressingItem {
  readonly id: string;
  readonly node: DressingNodeName;
  /** Centimetres, town space at scale 1. */
  readonly x: number;
  readonly z: number;
  readonly yawDeg: number;
  readonly wakes: PlotId;
}

const CT: PlotId = 'plot_clock_tower';
const MB: PlotId = 'plot_music_box';
const CA: PlotId = 'plot_carousel';
const WM: PlotId = 'plot_windmill';
const WL: PlotId = 'plot_well';
const BF: PlotId = 'plot_belfry';
const row = (id: string, nodeName: DressingNodeName, x: number, z: number, wakes: PlotId, yawDeg = 0): DressingItem => ({ id, node: nodeName, x, z, yawDeg, wakes });

/**
 * THE TABLE. Edit a row to move, turn or re-assign a piece; nothing else changes (tests/town/dressing.test.ts checks every row).
 *
 * The lead's layout (2026-11-14): the two new plots, the Well and the Belfry, stand side by side in the RIGHT dressing zone's front
 * half, which extends forward to z -1.6 cm (x 14.3 to 29.6, z -7.6 to -1.6; WELL_FOUNTAIN_BLUEPRINT, BELFRY_BLUEPRINT). Nothing
 * stands there (`NEW_PLOTS` below, checked by the tests): the right houses stand behind it against the ground's back edge (fronts at z -7.93 and -7.73, as the blueprints say), and
 * the lamps and props of that side stand beside it. The LEFT zone (behind the Clock Tower plot) is all houses and garden.
 *
 * Props never stand on a pad, in the aisle (|x| < 6.5 cm, the sight lines to the theatre doors, Otto and Mira), on the new plots
 * or beyond the 60 x 30 cm ground. At most 24 prop rows (ADR-034), and no piece more than five times (EXTRA_ASSET_SPECS §3);
 * lamps are counted apart. `wakes` is the plot whose pad centre is nearest (§3), a house's its zone's, and every piece lies inside
 * that plot's ripple. The first lamp of each plot that has one (in this order) also carries a night point light (night.ts).
 */
export const DRESSING: readonly DressingItem[] = [
  // Houses: left zone behind the Clock Tower plot, right zone behind the new plots (the zone rule of EXTRA_ASSET_SPECS §2).
  row('house_tall', 'TownHouse_Tall', -27.69, -11.56, CT),
  row('house_corner', 'TownHouse_Corner', -22.91, -11.495, CT),
  row('house_cottage', 'TownHouse_Cottage', 18.11, -11.465, WM),
  row('house_jetty', 'TownHouse_Jetty', 26.09, -11.365, WM),

  // Lamp posts along the street.
  row('lamp_1', 'LampPost', -23.0, -2.6, CT),
  row('lamp_2', 'LampPost', -13.5, -2.6, MB),
  row('lamp_3', 'LampPost', 7.9, -2.6, CA),
  row('lamp_4', 'LampPost', -8.4, -2.6, MB),

  // Left front garden (in front of the left houses) and the street on the left.
  row('fence_left', 'TownProp_Fence', -26.9, -7.4, CT),
  row('shrub_left', 'TownProp_Shrub', -22.0, -6.7, CT),
  row('tree_left', 'TownProp_Tree', -27.3, -4.7, CT),
  row('planter_garden', 'TownProp_Planter', -22.4, -4.4, CT),
  row('bench_left', 'TownProp_Bench', -18.0, -3.0, MB),

  // The street beside the new plots.
  row('bench_right', 'TownProp_Bench', 11.4, -3.0, CA),
  // The strip in front of the Well and Belfry pads (z -1.6 to -0.56, 1.04 cm deep) takes only the thin pieces: a signboard and a fence,
  // and the right-hand path edging below. They wake with the Well and the Belfry, so the street beside each machine comes to life with it.
  row('sign_well', 'TownProp_Signboard', 20.9, -1.08, WL),
  row('fence_belfry', 'TownProp_Fence', 26.0, -1.1, BF),

  // Path edging along the front edge of the street (five runs: the most one piece may repeat).
  row('edging_l1', 'TownProp_PathEdging', -27.0, -1.1, CT),
  row('edging_l2', 'TownProp_PathEdging', -21.0, -1.1, MB),
  row('edging_l3', 'TownProp_PathEdging', -15.0, -1.1, MB),
  row('edging_r1', 'TownProp_PathEdging', 10.0, -1.1, CA),
  row('edging_r2', 'TownProp_PathEdging', 16.1, -1.1, WL),
];

/** Where the Well and the Belfry plots go (cm, town space): the right zone's front half, to z -1.6. Nothing in the table stands here. */
export const NEW_PLOTS = { minX: 14.3, maxX: 29.6, minZ: -7.6, maxZ: -1.6 } as const;

export const MAX_PROP_INSTANCES = 24;

export interface Footprint {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const CM = 0.01;
const rad = (deg: number): number => (deg * Math.PI) / 180;

/** The axis-aligned footprint in town metres of an item (the box around it when it is turned). */
export function footprintOf(item: DressingItem): Footprint {
  const n = DRESSING_NODES[item.node];
  const c = Math.abs(Math.cos(rad(item.yawDeg)));
  const s = Math.abs(Math.sin(rad(item.yawDeg)));
  const halfW = ((n.widthCm * c + n.depthCm * s) / 2) * CM;
  const halfD = ((n.widthCm * s + n.depthCm * c) / 2) * CM;
  const x = item.x * CM;
  const z = item.z * CM;
  return { minX: x - halfW, maxX: x + halfW, minZ: z - halfD, maxZ: z + halfD };
}

/**
 * The wake-group grid (DRESS_GRID): the group bit of each item's `wakes` plot on every 5 mm cell its footprint touches. Built once
 * when the town is installed, from the table. Cells of different pieces that touch OR their bits.
 */
export function dressingGrid(items: readonly DressingItem[] = DRESSING): Uint16Array {
  const { x0, z0, cell, w, h } = DRESS_GRID;
  const grid = new Uint16Array(w * h);
  for (const item of items) {
    const n = DRESSING_NODES[item.node];
    const bit = PLOT_WAKE_GROUP[item.wakes];
    const yaw = rad(item.yawDeg);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const halfW = (n.widthCm * CM) / 2 + cell / 2;
    const halfD = (n.depthCm * CM) / 2 + cell / 2;
    const box = footprintOf(item);
    const i0 = Math.max(0, Math.floor((box.minX - cell - x0) / cell));
    const i1 = Math.min(w - 1, Math.ceil((box.maxX + cell - x0) / cell));
    const j0 = Math.max(0, Math.floor((box.minZ - cell - z0) / cell));
    const j1 = Math.min(h - 1, Math.ceil((box.maxZ + cell - z0) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + (i + 0.5) * cell - item.x * CM;
        const dz = z0 + (j + 0.5) * cell - item.z * CM;
        // into the piece's own frame (yaw turns the piece counter-clockwise seen from above: +Z towards +X at 90 degrees)
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        if (Math.abs(lx) <= halfW && Math.abs(lz) <= halfD) grid[j * w + i] |= bit;
      }
    }
  }
  return grid;
}
