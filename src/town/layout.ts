/**
 * Tockton's layout (TOCKTON_DIMENSIONS §3.3, option A), in metres and town space at scale 1: origin at the town centre on the
 * surface, +X to the player's right, +Z towards the player, +Y up. The town group applies the town scale on top. Pure data and
 * small functions: no three, no IWSDK, so the tests and the wake shader's generated constants share one source.
 */
import { MACHINE_IDS, MACHINE_PLOT, PLOT_IDS, type MachineId, type PlotId } from '../game/content';

/** Top of the plot pads and of the street paving (town_ground.glb: pads 0.60 cm, street 0.46 cm). */
export const PAD_TOP_M = 0.006;
export const STREET_TOP_M = 0.0046;

export interface PlotLayout {
  readonly id: PlotId;
  /** Name of the `SOCKET_` empty in town_ground.glb that takes the machine, without the prefix. */
  readonly socket: string;
  /** Pad centre, also the socket position (the machine base origin lands here). */
  readonly x: number;
  readonly z: number;
  readonly halfW: number;
  readonly halfD: number;
}

export const PLOTS: Readonly<Record<PlotId, PlotLayout>> = {
  plot_clock_tower: { id: 'plot_clock_tower', socket: 'PlotClockTower', x: -0.2425, z: 0.0825, halfW: 0.0525, halfD: 0.0525 },
  plot_music_box: { id: 'plot_music_box', socket: 'PlotMusicBox', x: -0.11, z: 0.08, halfW: 0.07, halfD: 0.055 },
  plot_carousel: { id: 'plot_carousel', socket: 'PlotCarousel', x: 0.11, z: 0.065, halfW: 0.07, halfD: 0.07 },
  plot_windmill: { id: 'plot_windmill', socket: 'PlotWindmill', x: 0.2425, z: 0.0825, halfW: 0.0525, halfD: 0.0525 },
};

/** Where each building group's origin (floor-contact centre) stands. */
export const BAKERY_AT = { x: 0.07, z: -0.0925 } as const;
export const THEATRE_AT = { x: -0.1, z: -0.0725 } as const;
/** Mira's feet: in the aisle beside the Music Box plot (TOCKTON_DIMENSIONS §7), on the street paving, facing +Z. */
export const MIRA_AT = { x: 0.012, y: STREET_TOP_M, z: 0.11 } as const;
export const BAKER_SOCKET = 'SOCKET_Baker';

/**
 * What a ripple can wake. Every frozen volume of the town (SCENERY_BOXES) carries one group bit, every ripple source a mask of
 * the groups it may wake (see WAKE_SOURCES), so what a plot wakes beyond its own pad is data, not shader code: a circle on the
 * plan would otherwise wake half of the Bakery when the Clock Tower wakes.
 */
export const WAKE_GROUP = {
  street: 1,
  padMusicBox: 2,
  padCarousel: 4,
  padWindmill: 8,
  padClockTower: 16,
  bakery: 32,
  theatre: 64,
  mira: 128,
} as const;

/**
 * A ripple source: the wake spreads from (x, z) up to `radius` when `plot` is woken, and only through the groups in `wakes`.
 * The Windmill wakes the Bakery and Otto, the Clock Tower the theatre, the Music Box Mira (PRODUCT_SPEC §6, TOCKTON_DIMENSIONS
 * §3.4). tests/town/layout.test.ts holds the distances: every plot's targets lie within its radius, and with all four plots
 * awake nothing is left frozen.
 */
export interface WakeSource {
  readonly plot: PlotId;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly wakes: number;
}

export const WAKE_SOURCES: readonly WakeSource[] = [
  { plot: 'plot_music_box', x: -0.11, z: 0.08, radius: 0.18, wakes: WAKE_GROUP.street | WAKE_GROUP.padMusicBox | WAKE_GROUP.mira },
  { plot: 'plot_carousel', x: 0.11, z: 0.065, radius: 0.16, wakes: WAKE_GROUP.street | WAKE_GROUP.padCarousel },
  { plot: 'plot_windmill', x: 0.2425, z: 0.0825, radius: 0.36, wakes: WAKE_GROUP.street | WAKE_GROUP.padWindmill | WAKE_GROUP.bakery },
  { plot: 'plot_clock_tower', x: -0.2425, z: 0.0825, radius: 0.34, wakes: WAKE_GROUP.street | WAKE_GROUP.padClockTower | WAKE_GROUP.theatre },
];
/** Fixed size of the shader's uniform array; unused slots stay frozen. */
export const MAX_WAKE_SOURCES = 6;

/**
 * Volumes of the frozen scenery in town space. A fragment inside one is scenery and frozen until a ripple that wakes its group
 * has reached it; everything else sharing the same library materials (machines, workbench, trunk, hands) is untouched.
 * Machines stand on the pads, above `PAD_TOP_M`, so they never fall inside the ground boxes.
 */
export interface Box {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly group: number;
}
const EPS = 1e-5;
const padBox = (p: PlotLayout, group: number): Box => ({
  min: [p.x - p.halfW, -0.01, p.z - p.halfD],
  max: [p.x + p.halfW, PAD_TOP_M + EPS, p.z + p.halfD],
  group,
});
export const SCENERY_BOXES: readonly Box[] = [
  { min: [-0.3, -0.01, -0.15], max: [0.3, STREET_TOP_M + EPS, 0.15], group: WAKE_GROUP.street }, // street paving and slab
  padBox(PLOTS.plot_music_box, WAKE_GROUP.padMusicBox),
  padBox(PLOTS.plot_carousel, WAKE_GROUP.padCarousel),
  padBox(PLOTS.plot_windmill, WAKE_GROUP.padWindmill),
  padBox(PLOTS.plot_clock_tower, WAKE_GROUP.padClockTower),
  { min: [BAKERY_AT.x - 0.065, -0.01, BAKERY_AT.z - 0.0478], max: [BAKERY_AT.x + 0.065, 0.2, BAKERY_AT.z + 0.0478], group: WAKE_GROUP.bakery }, // Otto inside it
  { min: [THEATRE_AT.x - 0.1, -0.01, THEATRE_AT.z - 0.0275], max: [THEATRE_AT.x + 0.1, 0.19, THEATRE_AT.z + 0.0275], group: WAKE_GROUP.theatre },
  { min: [MIRA_AT.x - 0.0075, STREET_TOP_M - 0.0005, MIRA_AT.z - 0.0055], max: [MIRA_AT.x + 0.0075, 0.037, MIRA_AT.z + 0.0055], group: WAKE_GROUP.mira },
];
export const MAX_SCENERY_BOXES = 10;

/** `SOCKET_PlotMusicBox` -> `plot_music_box`; null for any other name. */
export function plotIdFromSocketName(name: string): PlotId | null {
  if (!name.startsWith('Plot')) return null;
  const id = `plot_${name.slice(4).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`;
  return (PLOT_IDS as readonly string[]).includes(id) ? (id as PlotId) : null;
}

/** The machine whose own plot this is (TOCKTON_DIMENSIONS §3.4: only a machine's own plot accepts it). */
export function machineOfPlot(plot: PlotId): MachineId {
  return MACHINE_IDS.find((m) => MACHINE_PLOT[m] === plot) as MachineId;
}

/** The part id a machine's root carries in `SnapPart.partId`, matching the `accepts` list of its plot socket in town_ground.glb. */
export const MACHINE_SNAP_PART: Readonly<Record<MachineId, string>> = {
  music_box: 'music_box_case',
  carousel: 'carousel_base',
  windmill: 'windmill_base',
  clock_tower: 'clock_tower_base',
};
