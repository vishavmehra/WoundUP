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
export const FLAT_FAMILIES: ReadonlySet<string> = new Set(['spur_gear', 'bevel_gear', 'pulley', 'spring', 'cam', 'escapement', 'governor', 'winding_key']);

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
  governor_standard: { yawDeg: 90, offset: [0, 0.0222, -0.0024218] },
  gear_spur_12_m1: { yawDeg: 0, offset: [0, 0.0076, 0] },
  winding_key: { yawDeg: 0, offset: [0, 0.004, 0] },
  // no compartment: the Windmill's designated gear (Letter 5) lies on the dividers
  gear_spur_24_m1: { yawDeg: 0, offset: [0, 0.0076, 0] },
};
/** An asset that is not in the table: its origin is taken to be 1 cm over the underside (a disc or a flat part). */
const DEFAULT_POSE: TrayPose = { yawDeg: 0, offset: [0, 0.01, 0] };

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
  const loose = slotOf.filter((s) => s < 0).length;
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
  const pitch = loose > 1 ? Math.min(TOP_PITCH_M, TOP_SPAN_M / (loose - 1)) : 0;
  let next = 0;
  return parts.map((part, i) => {
    const pose = TRAY_POSE[part.assetId] ?? DEFAULT_POSE;
    const quaternion = trayQuaternion(part.family, pose.yawDeg);
    const slot = slots[slotOf[i]];
    if (slot) return { slot: slotOf[i], position: [slot.x + pose.offset[0], slot.y + pose.offset[1], slot.z + pose.offset[2]], quaternion };
    if (slots.length === 0) return { slot: -1, position: [fallback.x, fallback.y, fallback.z], quaternion };
    const z = 0.5 * (minZ + maxZ) + (next++ - 0.5 * (loose - 1)) * pitch;
    return {
      slot: -1,
      position: [0.5 * (minX + maxX) + pose.offset[0], floor + TRAY_DIVIDER_RISE_M + pose.offset[1], z + pose.offset[2]],
      quaternion,
    };
  });
}
