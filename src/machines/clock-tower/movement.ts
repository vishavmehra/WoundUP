// Where the Clock Tower's movement sits inside the tower, and how fast each part turns with the escapement (ADR-047).
// Pure numbers, no Three.js: build.ts seats the parts from `MOVEMENT_PARTS`, rig.ts turns them with `trainRatios()`, and the tests hold
// both to the real GLBs. Metres, in the base frame of build.ts (origin at the floor-contact centre of the base, +Y up, +Z to the viewer).
//
// What is drawn: the going train of CLOCK_TOWER_CONNECTIONS, back to front behind the escape wheel:
//
//   escape wheel ══ inter_gear_3 (24T) ──mesh── inter_gear_2 (10T) ══ large_gear (24T) ──mesh── inter_gear_1 (10T) ══ barrel ══ spring
//
// `══` is one axle. The drive shaft and the hourly cam stand apart, on a rod in the front left corner that rises from the floor to the
// bell. The brackets and the winding key are not drawn: the machine comes wound and no hand reaches them.
//
// Why the movement is smaller than the library parts. The 24T gear is 64.3 mm across (module 2.5 mm) and the escape wheel's axle,
// which inter_gear_3 shares, is where the pendulum puts it (MOVEMENT): 54.4 mm up, inside the 54 mm opening of the base's capstone
// and the 60 mm opening of the shell's floor. A full-size disc cannot pass through them and cannot go above them either (the
// bell hangs at the middle of the belfry), and the 49 mm base cavity is shorter than the gear is wide. So the gears, the barrel,
// the spring, the shaft and the cam are drawn at `MOVEMENT_SCALE` of their size. Uniformly, so a tooth is a tooth: the module and
// the centre distance (module * (z1 + z2) / 2 + 1 mm of backlash) scale with it, and the teeth mesh.

import { clockTowerCorrectAssembly, solveClockTower } from '../../content/blueprints/clock-tower';

const mm = (v: number): number => v * 0.001;

/** Size of the gears, barrel, spring, shaft and cam relative to their GLBs. See the note above for why it is not 1. */
export const MOVEMENT_SCALE = 0.65;

/** Module of the library gears (`gear_spur_*_m1.glb`: `wu.moduleMm`) and the extra centre distance the blueprint's meshes get, millimetres at full size. */
export const GEAR_MODULE_MM = 2.5;
export const GEAR_BACKLASH_MM = 1;

/** Distance between the axles of two meshing library gears as drawn: scale * (module * (z1 + z2) / 2 + 1 mm). */
export const centreDistance = (teethA: number, teethB: number): number => mm(MOVEMENT_SCALE * (GEAR_MODULE_MM * ((teethA + teethB) / 2) + GEAR_BACKLASH_MM));

/**
 * The escapement, measured from its GLBs (not scaled).
 *  - `arborY`: the anchor's arbor, which is also the pendulum's suspension point (both turn about the same +Z axis, `pendulumZ`). 75 mm
 *    puts the bob's lowest point 8 mm above the floor (platform top 4.6 mm; the rod ends 70 mm under the arbor) and the swing of 8 degrees
 *    moves it 8 mm, well inside the 32 mm entrance arch.
 *  - the wheel's centre is `arborToWheel` under the arbor (manifest: 20.6 mm); it rises through the 54 mm capstone opening.
 *  - `escapementZ`: the plane of the wheel and the anchor. 12 mm in front of the middle, which leaves the room behind them for the train
 *    (the three gears and the barrel stack are about 30 mm deep) and still clears the 53 mm opening of the capstone.
 *  - `pendulumZ`: the rod hangs 5 mm in front of that plane; the wheel and the anchor are 4 mm thick, so nothing touches.
 */
export const MOVEMENT = { arborY: 0.075, arborToWheel: 0.0206, escapementZ: 0.012, pendulumZ: 0.005 } as const;

/** Solver socket ids of the parts the going train turns. The escape wheel is the reference: it is driven by the escapement itself. */
export type TrainSocket = 'spring' | 'barrel' | 'inter_gear_1' | 'large_gear' | 'inter_gear_2' | 'inter_gear_3' | 'drive_shaft';

/** Library part files the movement uses (`CLOCK_TOWER_MODEL` in build.ts maps each to its path). */
export type MovementModel = 'gear24' | 'gear10' | 'barrel' | 'spring' | 'shaft' | 'cam';

export interface MovementPart {
  /** The solver's socket id. The node that turns is named `movementNodeName(socket)`. */
  readonly socket: TrainSocket | 'hourly_cam';
  readonly model: MovementModel;
  /** Where the part's origin (its axle, mid-thickness) is, base frame. */
  readonly position: readonly [x: number, y: number, z: number];
  /** Orientation of the part: identity for an axle along +Z, which every part of the train has. `[x, y, z, w]`. */
  readonly quaternion: readonly [x: number, y: number, z: number, w: number];
  /** Turn about the part's own +Z at rest, radians: the tooth phase of a gear, so it meshes with its neighbour. */
  readonly phase: number;
  /**
   * +1, or -1 for a part whose +Z points to the back of the tower. The solver's angles are counter-clockwise seen from +Z of the
   * tower, so the part turns by `sign` times the solver's angle.
   */
  readonly sign: 1 | -1;
}

/** Name of the node a movement part turns, so the rig finds it (two gears share a file, so the file's own node names cannot be used). */
export const movementNodeName = (socket: string): string => `Movement_${socket}`;

// ---- Layout -------------------------------------------------------------------------------------------------------------------

/** Thickness of a library gear with its hub bosses (GLB bounding box: 15.2 mm), the barrel (12 mm) and the spring's coil with its hubs (10 mm). */
const GEAR_T = mm(15.2) * MOVEMENT_SCALE;
const BARREL_T = mm(12) * MOVEMENT_SCALE;
const COIL_T = mm(10) * MOVEMENT_SCALE;
/** Room left between the parts of one axle and between the two stages. */
const GAP = mm(0.3);
const STAGE_GAP = mm(0.4);
const WHEEL_T = mm(4);

/** The escape wheel's axle and inter_gear_3 share it. */
const WHEEL = { x: 0, y: MOVEMENT.arborY - MOVEMENT.arborToWheel };
const STAGE = centreDistance(24, 10);
/**
 * The second axle (inter_gear_2 and the large gear) in the base cavity: as high as the 24T disc, 41.8 mm across, can stand under the
 * capstone (its top 3 mm under it) and still clear the floor. Its distance to the wheel's axle is that of a 24T and a 10T, so it
 * lies to the right of the wheel at the height where that distance puts it.
 */
const SECOND_Y = mm(29.8);
const SECOND = { x: Math.sqrt(STAGE ** 2 - (WHEEL.y - SECOND_Y) ** 2), y: SECOND_Y };
/** The barrel's axle (inter_gear_1) is a stage to the left of the second axle, level with it. */
const FIRST = { x: SECOND.x - STAGE, y: SECOND.y };

/** Mid-thickness of the layers: inter_gear_3 and inter_gear_2 mesh in one plane, the large gear and inter_gear_1 in the plane behind it. */
const Z_THIRD = MOVEMENT.escapementZ - WHEEL_T / 2 - GAP - GEAR_T / 2;
const Z_SECOND = Z_THIRD - GEAR_T - STAGE_GAP;
/** The barrel stack behind inter_gear_1, back to front: spring coil, barrel, pinion. The spring is turned about and its long arbor points forward through the barrel's bore into the pinion's. */
const Z_BARREL = Z_SECOND - GEAR_T / 2 - GAP - BARREL_T / 2;
const Z_SPRING = Z_BARREL - BARREL_T / 2 - GAP - COIL_T / 2;

/** The rod of the drive shaft and the cam: in the front left corner, clear of the pendulum's swing, inside the capstone's opening. */
const ROD = { x: -0.0215, z: 0.021, bottom: mm(5) };
const SHAFT_LENGTH = mm(180) * MOVEMENT_SCALE;
/** Height of the cam on the rod: level with the bell, which hangs from 88 to 116 mm. */
const CAM_Y = mm(100);

/** Quarter turn about X: the part's +Z axis points up, +Y. */
const UPRIGHT: readonly [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
/** Half turn about Y: the part's +Z axis points to the back. */
const ABOUT_FACE: readonly [number, number, number, number] = [0, 1, 0, 0];
const IDENTITY: readonly [number, number, number, number] = [0, 0, 0, 1];

/**
 * Rest turn that makes a gear (z2 teeth, at `to`) mesh with a gear (z1 teeth, turned by phase1, at `from`): when the line of centres
 * has the first gear's tooth fraction f1 and the second's f2, meshing means f1 + f2 = 1/2 (a tooth faces a gap). Tooth 0 of a library
 * gear is on its +X (generator `blender/scripts/gen_gear_spur.py`), so its teeth are at phase + 2 PI k / z.
 */
function meshPhase(z1: number, phase1: number, from: { x: number; y: number }, z2: number, to: { x: number; y: number }): number {
  const along = Math.atan2(to.y - from.y, to.x - from.x);
  return (z1 * (along - phase1) + z2 * (along + Math.PI) - Math.PI) / z2;
}

const PHASE_THIRD = 0;
const PHASE_PINION_2 = meshPhase(24, PHASE_THIRD, WHEEL, 10, SECOND);
const PHASE_LARGE = PHASE_PINION_2;
const PHASE_PINION_1 = meshPhase(24, PHASE_LARGE, SECOND, 10, FIRST);

const at = (x: number, y: number, z: number): readonly [number, number, number] => [x, y, z];

/** Everything the movement adds to the tower, back to front, then the rod. */
export const MOVEMENT_PARTS: readonly MovementPart[] = [
  { socket: 'spring', model: 'spring', position: at(FIRST.x, FIRST.y, Z_SPRING), quaternion: ABOUT_FACE, phase: 0, sign: -1 },
  { socket: 'barrel', model: 'barrel', position: at(FIRST.x, FIRST.y, Z_BARREL), quaternion: IDENTITY, phase: 0, sign: 1 },
  { socket: 'inter_gear_1', model: 'gear10', position: at(FIRST.x, FIRST.y, Z_SECOND), quaternion: IDENTITY, phase: PHASE_PINION_1, sign: 1 },
  { socket: 'large_gear', model: 'gear24', position: at(SECOND.x, SECOND.y, Z_SECOND), quaternion: IDENTITY, phase: PHASE_LARGE, sign: 1 },
  { socket: 'inter_gear_2', model: 'gear10', position: at(SECOND.x, SECOND.y, Z_THIRD), quaternion: IDENTITY, phase: PHASE_PINION_2, sign: 1 },
  { socket: 'inter_gear_3', model: 'gear24', position: at(WHEEL.x, WHEEL.y, Z_THIRD), quaternion: IDENTITY, phase: PHASE_THIRD, sign: 1 },
  { socket: 'drive_shaft', model: 'shaft', position: at(ROD.x, ROD.bottom + SHAFT_LENGTH / 2, ROD.z), quaternion: UPRIGHT, phase: 0, sign: 1 },
  { socket: 'hourly_cam', model: 'cam', position: at(ROD.x, CAM_Y, ROD.z), quaternion: UPRIGHT, phase: 0, sign: 1 },
];

/** The two meshes of the train, driver first: inter_gear_3 turns inter_gear_2, the large gear turns inter_gear_1 (both reverse). */
export const MESHES: ReadonlyArray<readonly [driver: TrainSocket, driven: TrainSocket]> = [
  ['inter_gear_3', 'inter_gear_2'],
  ['large_gear', 'inter_gear_1'],
];

// ---- Speeds -------------------------------------------------------------------------------------------------------------------

let ratios: Readonly<Record<TrainSocket, number>> | null = null;

/**
 * How many turns each part of the train makes for one turn of the escape wheel, signed, from the solver's angular velocities for
 * the intended assembly (`angularVelocity[socket] / angularVelocity.escape_wheel`). The escapement is what regulates a clock: the
 * wheel advances one half tooth per swing of the pendulum (runtime.ts), and the whole train advances with it, so the barrel
 * ticks round 5.76 times as far as the wheel, the mesh reverses direction, and the teeth of every mesh stay in step. The mean
 * speed is the pendulum's (0.131 rad/s at the wheel); the solver's own (0.139) differs by the 6 percent the blueprint documents.
 */
export function trainRatios(): Readonly<Record<TrainSocket, number>> {
  if (ratios) return ratios;
  const outcome = solveClockTower(clockTowerCorrectAssembly());
  if (!outcome.ok) throw new Error(`The Clock Tower's intended assembly does not solve: ${JSON.stringify(outcome.errors)}`);
  const speed = outcome.result.angularVelocity;
  const wheel = speed.escape_wheel;
  if (!wheel) throw new Error('The Clock Tower solves without turning its escape wheel.');
  const ratio = (socket: TrainSocket): number => speed[socket] / wheel;
  return (ratios = {
    spring: ratio('spring'),
    barrel: ratio('barrel'),
    inter_gear_1: ratio('inter_gear_1'),
    large_gear: ratio('large_gear'),
    inter_gear_2: ratio('inter_gear_2'),
    inter_gear_3: ratio('inter_gear_3'),
    drive_shaft: ratio('drive_shaft'),
  });
}

/** What the tests and the rig need of the layout, by solver socket. */
export const movementPart = (socket: string): MovementPart | undefined => MOVEMENT_PARTS.find((p) => p.socket === socket);
