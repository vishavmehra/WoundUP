// Where each loose part lies in the parts tray. Pure Three.js (no ECS, no IWSDK), so it runs in Node tests.
//
// parts_tray.glb has twelve compartments, one for each loose part of the Music Box (the `SOCKET_Slot01..12` empties, numbered in the order
// of the Music Box tray). Each is sized from the real part GLB with at least 3 mm to every wall. A part goes to the compartment that is for
// its asset (a repair tray holds one part, so the slot cannot be the part's index in the list), in the pose of `TRAY_POSE`: flat for a
// disc, as authored for the rest, turned about +Y so a long part runs along its compartment, and offset so that the middle of its bounding
// box stands over the compartment's centre with its underside on the velvet. A part with no compartment (the Windmill's 24T gear) lies on
// top of the dividers along the tray's middle.
//
// The pose is final when the part is spawned: ReturnsToRest records the pose it sees then, and a part that is let go returns to it. So the
// offsets are data here (measured from the GLBs), not computed after the spawn. tests/assets/tray-fit.test.ts holds this table to the
// real part files and to the compartments in parts_tray.glb, and checks the 3 mm.
import { Quaternion, Vector3 } from 'three';

/** Disc-shaped parts lie flat in the tray; long ones (shafts, the cylinder, the comb, brackets) keep their own orientation. */
export const FLAT_FAMILIES: ReadonlySet<string> = new Set(['spur_gear', 'bevel_gear', 'pulley', 'spring', 'cam', 'escapement', 'governor', 'winding_key', 'ratchet', 'pawl', 'flywheel', 'follower']);

/**
 * The Belfry's weathervane is modelled finial-down (its local -Z), so it lies with that axis turned up: Rx(+90 degrees), which carries local -Z to
 * +Y. A family listed here takes this pose instead of the flat one.
 */
export const FINIAL_UP_FAMILIES: ReadonlySet<string> = new Set(['vane']);
const FINIAL_UP: readonly [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];

/** Rotation of `[x, y, z, w]` that turns a flat part's local +Z (its axis) up. */
const FLAT: readonly [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

/** Index = slot number - 1 (`SOCKET_Slot01` is index 0), the order of the Music Box tray (MUSIC_BOX_BLUEPRINT §9.2, `trayOf`). Asset ids (`PartDefinition.visual.assetId`). */
export const TRAY_SLOTS: ReadonlyArray<readonly string[]> = [
  ['bracket_support'],
  ['bracket_support'],
  ['shaft_short'],
  ['cylinder_music_box'],
  ['comb_music_box'],
  ['gear_spur_20_m1'],
  ['gear_spur_16_m1'],
  ['spring_standard', 'spring_worn'],
  ['gear_spur_10_m1'],
  ['governor_standard'],
  ['gear_spur_12_m1'],
  ['winding_key'],
];

interface TrayPose {
  /** Turn about +Y in the tray, degrees (after the flat pose of a disc). */
  readonly yawDeg: number;
  /** Where the part's origin is relative to the middle of the underside of its bounding box in that pose, metres. */
  readonly offset: readonly [number, number, number];
  /** Width (x) and depth (z) of the part's footprint in that pose, millimetres: what packing a crowded tray needs. Absent: 30 x 30. */
  readonly size?: readonly [number, number];
}

/** Measured from the part GLBs in their tray pose (tools/validate-glb.mjs sizes, bounding boxes of the meshes). Held to the files by the test. */
export const TRAY_POSE: Readonly<Record<string, TrayPose>> = {
  bracket_support: { yawDeg: 0, offset: [0, 0.029, 0] },
  shaft_short: { yawDeg: 0, offset: [0, 0.004, 0] },
  cylinder_music_box: { yawDeg: 0, offset: [0, 0.016, 0] },
  comb_music_box: { yawDeg: 90, offset: [-0.013, 0.01, 0] },
  gear_spur_20_m1: { yawDeg: 0, offset: [0, 0.0076, 0] },
  gear_spur_16_m1: { yawDeg: 0, offset: [0, 0.0076, 0] },
  spring_standard: { yawDeg: 0, offset: [-0.0004952, 0.0212, -0.0002364] },
  spring_worn: { yawDeg: 0, offset: [-0.0002154, 0.0212, -0.0009425] },
  gear_spur_10_m1: { yawDeg: 0, offset: [0, 0.0076, 0] },
  governor_standard: { yawDeg: 90, offset: [0, 0.0222, -0.0001756] },
  gear_spur_12_m1: { yawDeg: 0, offset: [0, 0.0076, 0] },
  winding_key: { yawDeg: 0, offset: [0, 0.004, 0] },
  // no compartment: the Windmill's designated gear (Letter 5) lies on the dividers
  gear_spur_24_m1: { yawDeg: 0, offset: [0, 0.0076, 0], size: [64.3, 64.3] },
  // The Well's and the Belfry's parts (ADR-048), none with a compartment of its own: they lie on the dividers. Measured from the GLBs in their
  // tray pose (bounding boxes): a flat part has its origin `-zmin` above its underside, and (-x centre, +y centre) off the middle of it.
  cam_eccentric: { yawDeg: 0, offset: [-0.00265, 0.004, -0.001855], size: [24.7, 22.4] },
  follower_roller: { yawDeg: 0, offset: [0, 0.00402, 0.009], size: [12, 30] },
  pulley_standard: { yawDeg: 0, offset: [0, 0.00502, 0], size: [30, 30] },
  ratchet_wheel: { yawDeg: 0, offset: [0, 0.00312, 0], size: [40, 40] },
  pawl_standard: { yawDeg: 0, offset: [-0.0103, 0.0026, -0.0005], size: [32.6, 13] },
  flywheel_standard: { yawDeg: 0, offset: [0, 0.00662, 0], size: [52, 52] },
  gear_bevel_12: { yawDeg: 0, offset: [0, 0.006, 0], size: [32.2, 32.2] },
  bearing_pillow_block: { yawDeg: 0, offset: [0, 0.01, 0], size: [30, 12] }, // stands as authored, base plate down
  belfry_vane: { yawDeg: 90, offset: [0, 0.004, 0], size: [16.1, 63.8] }, // finial up; turned a quarter so its 6.4 cm arrow runs along the tray
  shaft_long: { yawDeg: 0, offset: [0, 0.004, 0], size: [8, 180] }, // 18 cm, along the tray's 20 cm length, down the middle
};
/** An asset that is not in the table: its origin is taken to be 1 cm over the underside (a disc or a flat part). */
const DEFAULT_POSE: TrayPose = { yawDeg: 0, offset: [0, 0.01, 0] };

/** More loose parts than this and they are packed in rows over the whole tray instead of strung along its middle (the Well's and the Belfry's). */
const MAX_STRUNG = 5;
/** The tray's interior in its own frame, metres, and where its centre lies relative to the middle of its twelve compartment centres (parts_tray.glb). */
const TRAY_INTERIOR_M = { w: 0.115, d: 0.2 } as const;
const TRAY_CENTRE_FROM_SLOT_MID_M = { x: -0.00365, z: -0.00955 } as const;
/** Space left to the walls and between packed parts, metres. */
const PACK_MARGIN_M = 0.004;
/** A part that lies the whole way down the tray (the Belfry's 18 cm shaft) keeps to the left wall, and the rest are packed beside it. */
const SPINE_ASSETS: ReadonlySet<string> = new Set(['shaft_long']);
const DEFAULT_SIZE_MM: readonly [number, number] = [30, 30];

/** A rectangle on the tray's floor plan, metres, in the tray's own frame (origin at the middle of the tray). */
interface Rect {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/** Parts that stand taller than the dividers, so nothing lies over them: the spring and the winding key (the Well's and the Belfry's compartment parts). */
const TALL_ASSETS: ReadonlySet<string> = new Set(['spring_standard', 'spring_worn', 'winding_key']);
const TALL_FOOTPRINT_MM: Readonly<Record<string, readonly [number, number]>> = { spring_standard: [30, 30], spring_worn: [30, 30], winding_key: [30, 6] };

/**
 * Packs footprints (millimetres), biggest first, into the region from `x0` to `x1` and from `z0` towards the front: each goes to the first place,
 * looking row by row from the back left in 2 mm steps, where it keeps 4 mm from the walls of the region, from the `obstacles` and from the parts
 * already placed. Returns each one's centre in the order given, metres, in the tray's frame; a part that finds no place goes where the search ended.
 */
function packRows(sizes: ReadonlyArray<readonly [number, number]>, x0: number, x1: number, z0: number, z1: number, obstacles: readonly Rect[]): Array<[number, number]> {
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b][0] * sizes[b][1] - sizes[a][0] * sizes[a][1] || a - b);
  const taken: Rect[] = [...obstacles];
  const at: Array<[number, number]> = sizes.map(() => [0, 0]);
  const step = 0.002;
  for (const i of order) {
    const w = sizes[i][0] / 1000;
    const d = sizes[i][1] / 1000;
    let placed: Rect | null = null;
    for (let z = z0; placed === null && z + d <= z1 + 1e-9; z += step) {
      for (let x = x0; x + w <= x1 + 1e-9; x += step) {
        const fits = !taken.some((o) => x < o.x1 + PACK_MARGIN_M && x + w > o.x0 - PACK_MARGIN_M && z < o.z1 + PACK_MARGIN_M && z + d > o.z0 - PACK_MARGIN_M);
        if (fits) {
          placed = { x0: x, x1: x + w, z0: z, z1: z + d };
          break;
        }
      }
    }
    const spot = placed ?? { x0, x1: x0 + w, z0: z1 - d, z1 };
    taken.push(spot);
    at[i] = [(spot.x0 + spot.x1) / 2, (spot.z0 + spot.z1) / 2];
  }
  return at;
}

/** Top of the dividers above the velvet, metres (parts_tray.glb `wu.dividerTopMm` minus `floorTopMm`): where a part with no compartment rests. */
export const TRAY_DIVIDER_RISE_M = 0.014;
/** Largest spacing of the parts lying on top, metres, and the length of the tray they may spread over. */
const TOP_PITCH_M = 0.05;
const TOP_SPAN_M = 0.15;

const Y_AXIS = new Vector3(0, 1, 0);
const _yaw = new Quaternion();

/** The pose a part takes in the tray: flat for a disc, as authored for the rest, then turned by `yawDeg` about +Y. `[x, y, z, w]`. */
export function trayQuaternion(family: string, yawDeg: number): [number, number, number, number] {
  _yaw.setFromAxisAngle(Y_AXIS, (yawDeg * Math.PI) / 180);
  if (FLAT_FAMILIES.has(family)) _yaw.multiply(new Quaternion(...FLAT));
  else if (FINIAL_UP_FAMILIES.has(family)) _yaw.multiply(new Quaternion(...FINIAL_UP));
  return [_yaw.x, _yaw.y, _yaw.z, _yaw.w];
}

/**
 * The compartment index of each part, in order: the first free compartment that is for the part's asset, or -1. Two parts of one asset
 * (the Carousel's decoy 12T beside its intended 12T) take two compartments only if there are two; the rest get -1.
 * `slotCount` is how many compartments the loaded tray has (a tray model with fewer compartments leaves the others without).
 */
export function assignSlots(assets: readonly string[], slotCount: number = TRAY_SLOTS.length): number[] {
  const taken = new Set<number>();
  return assets.map((asset) => {
    const index = TRAY_SLOTS.findIndex((accepts, i) => i < slotCount && !taken.has(i) && accepts.includes(asset));
    if (index >= 0) taken.add(index);
    return index;
  });
}

/**
 * Takes out of `trayIds`, in place, one entry for each part in `fixed` (the parts the game seats itself: their sockets are in no GLB yet, so no
 * hand can take them). They would only lie in the tray, unusable: the Windmill's sails (16 cm across) on a 12.5 cm tray, bearings, bevels.
 * Call it for a first build only; a repair's tray holds exactly the parts a hand has to place.
 */
export function dropSeatedByGame(trayIds: string[], fixed: Readonly<Record<string, string>>): void {
  for (const partId of Object.values(fixed)) {
    const index = trayIds.indexOf(partId);
    if (index >= 0) trayIds.splice(index, 1);
  }
}

export interface TrayPart {
  readonly assetId: string;
  readonly family: string;
}

export interface TrayPlacement {
  /** The compartment index, or -1 when the part lies on top of the dividers. */
  readonly slot: number;
  /** Where the part's origin goes, in the space of `slots`. */
  readonly position: [number, number, number];
  readonly quaternion: [number, number, number, number];
}

/**
 * Where every tray part is spawned. `slots` are the compartment centres on the velvet, in the space the parts are spawned in (the tray's
 * `SOCKET_SlotNN` empties in order). Parts without a compartment lie on the dividers along the middle of the tray, spread out so a pile
 * of them does not hide one another. Empty `slots` (no tray model) gives every part the position `fallback`.
 */
export function placeTrayParts(parts: readonly TrayPart[], slots: readonly Vector3[], fallback: Vector3): TrayPlacement[] {
  const slotOf = assignSlots(parts.map((p) => p.assetId), slots.length);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let floor = Infinity;
  for (const s of slots) {
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x);
    minZ = Math.min(minZ, s.z);
    maxZ = Math.max(maxZ, s.z);
    floor = Math.min(floor, s.y);
  }
  // Parts with no compartment lie on the dividers: strung along the middle when there are few (the Windmill's 24T), packed in rows over the whole tray
  // when there are many (the Well's and the Belfry's), with a part that lies the whole way down it (the Belfry's shaft) along the left wall.
  const spine = parts.map((p, i) => (slotOf[i] < 0 && SPINE_ASSETS.has(p.assetId) ? i : -1)).filter((i) => i >= 0);
  const rest = slotOf.map((slot, i) => (slot < 0 && !spine.includes(i) ? i : -1)).filter((i) => i >= 0);
  const pitch = rest.length > 1 ? Math.min(TOP_PITCH_M, TOP_SPAN_M / (rest.length - 1)) : 0;
  const midX = 0.5 * (minX + maxX);
  const midZ = 0.5 * (minZ + maxZ);
  const top = floor + TRAY_DIVIDER_RISE_M;
  const crowded = rest.length > MAX_STRUNG;
  const sizeOf = (i: number): readonly [number, number] => (TRAY_POSE[parts[i].assetId] ?? DEFAULT_POSE).size ?? DEFAULT_SIZE_MM;
  const centreX = midX + TRAY_CENTRE_FROM_SLOT_MID_M.x;
  const centreZ = midZ + TRAY_CENTRE_FROM_SLOT_MID_M.z;
  const left = centreX - TRAY_INTERIOR_M.w / 2 + PACK_MARGIN_M;
  const spineWidth = spine.length > 0 ? Math.max(...spine.map((i) => sizeOf(i)[0])) / 1000 + PACK_MARGIN_M : 0;
  let packed: Array<[number, number]> | null = null;
  if (crowded) {
    // Over the compartments that hold a spring or a key nothing lies: they stand up through the dividers' plane.
    const tall: Rect[] = [];
    parts.forEach((p, i) => {
      const slot = slots[slotOf[i]];
      const size = TALL_FOOTPRINT_MM[p.assetId];
      if (!slot || !size || !TALL_ASSETS.has(p.assetId)) return;
      const [w, d] = [size[0] / 2000, size[1] / 2000];
      tall.push({ x0: slot.x - centreX - w, x1: slot.x - centreX + w, z0: slot.z - centreZ - d, z1: slot.z - centreZ + d });
    });
    const half = TRAY_INTERIOR_M.w / 2 - PACK_MARGIN_M;
    packed = packRows(rest.map(sizeOf), -half + spineWidth, half, -TRAY_INTERIOR_M.d / 2 + PACK_MARGIN_M, TRAY_INTERIOR_M.d / 2 - PACK_MARGIN_M, tall);
  }
  return parts.map((part, i) => {
    const pose = TRAY_POSE[part.assetId] ?? DEFAULT_POSE;
    const quaternion = trayQuaternion(part.family, pose.yawDeg);
    const slot = slots[slotOf[i]];
    if (slot) return { slot: slotOf[i], position: [slot.x + pose.offset[0], slot.y + pose.offset[1], slot.z + pose.offset[2]], quaternion };
    if (slots.length === 0) return { slot: -1, position: [fallback.x, fallback.y, fallback.z], quaternion };
    const k = rest.indexOf(i);
    // the spine lies against the left wall, the whole way down; the packed parts where the packer put them; the few along the middle
    const x = k < 0 ? left + sizeOf(i)[0] / 2000 : packed ? centreX + packed[k][0] : midX;
    const z = k < 0 ? centreZ : packed ? centreZ + packed[k][1] : midZ + (k - 0.5 * (rest.length - 1)) * pitch;
    return { slot: -1, position: [x + pose.offset[0], top + pose.offset[1], z + pose.offset[2]], quaternion };
  });
}
