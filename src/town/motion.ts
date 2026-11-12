/**
 * Machine motion in the town (SIMULATION_SPEC §9: "presentation follows the solver"). Nodes are turned by integrating the
 * solver's angular velocities, `theta += omega * dt`, never by baked clips. The functions here are pure or allocation-free;
 * `TownSystem` calls them once per frame.
 */
import { Quaternion, Vector3 } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';
import type { SolveResult } from '../sim';
import type { MachineId } from '../game/content';

export type Axis = 'x' | 'y' | 'z';

const AXES: Readonly<Record<Axis, Vector3>> = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };
const _spin = new Quaternion();

/**
 * A node that turns with one solver socket. Rotating parts spin about their local +Z (ADR-020, BLENDER_PRODUCTION_GUIDELINES
 * §5); a few GLBs state another axis in `wu.rotationAxis`, which `axisOfGlb` reads.
 *  - `absolute`: the node's orientation is `rest` turned by the angle. For nodes nothing else positions.
 *  - `overlay`: the angle is applied on top of whatever the owner wrote this frame. For parts that SocketSnapSystem holds on a
 *    socket, which rewrites the orientation every frame: run TownSystem after it (priority 11).
 */
export interface Rotor {
  readonly node: Object3D;
  readonly socketId: string;
  readonly axis: Axis;
  /** 1 or -1: the sign a mesh gives the part relative to the solver's counter-clockwise-from-+Z convention. */
  readonly sign: 1 | -1;
  readonly mode: 'absolute' | 'overlay';
  readonly rest: Quaternion;
  /** Unwrapped angle in radians since the rig was built; the melody reads it to know which pin is under the comb. */
  theta: number;
}

export function createRotor(
  node: Object3D,
  socketId: string,
  options: { axis?: Axis; sign?: 1 | -1; mode?: 'absolute' | 'overlay' } = {},
): Rotor {
  return {
    node,
    socketId,
    axis: options.axis ?? 'z',
    sign: options.sign ?? 1,
    mode: options.mode ?? 'absolute',
    rest: node.quaternion.clone(),
    theta: 0,
  };
}

/** One carousel horse, rising and falling as a follower of a rotor (MACHINE_SLOT_MAPPINGS §3.5: one cycle per platform turn). */
export interface Bobber {
  readonly node: Object3D;
  readonly driver: Rotor;
  readonly baseY: number;
  readonly phase: number;
  readonly amplitude: number;
}

/** A lamp that twinkles by breathing in size. */
export interface Pulser {
  readonly node: Object3D;
  readonly phase: number;
  readonly amplitude: number;
  readonly speed: number;
  readonly baseScale: number;
}

/** The Music Box lid: opens while the machine runs so the turning cylinder shows, closes when it stops. Positive angle opens. */
export interface LidHinge {
  readonly pivot: Object3D;
  readonly rest: Quaternion;
  readonly openRad: number;
  angle: number;
}

/** What the town needs to animate one finished machine. Built by `rigFromGlb` or by the machine assembly of the build mode. */
export interface MachineRig {
  readonly machineId: MachineId;
  readonly root: Object3D;
  readonly rotors: Rotor[];
  readonly bobbers: Bobber[];
  readonly pulsers: Pulser[];
  lid: LidHinge | null;
  /** Latest solver result, set by the game layer after each solve. Only `angularVelocity` is read. */
  result: Pick<SolveResult, 'angularVelocity'> | null;
  /** False while the machine is stopped (energy spent, or not yet wound). The speed eases to 0 and back. */
  running: boolean;
  /** Eased run factor 0 to 1 that scales every omega. */
  speed: number;
  /** The rotor whose angle plays the melody (Music Box cylinder, Carousel platform), or null. */
  melody: Rotor | null;
  /** Unwrapped turns of `melody` already played, so only the pins that passed since are sounded. */
  melodyAt: number;
}

/**
 * A node easing to a uniform scale: a finished machine goes from 1 (the workbench) to the town scale on its plot and back
 * (TOCKTON_DIMENSIONS §1). Its parent must carry no scale of its own.
 */
export interface Scaler {
  readonly node: Object3D;
  target: number;
}

/** Moves `scaler.node` towards its target. Returns true once it has arrived, so the caller can drop it. Allocation-free. */
export function stepScaler(scaler: Scaler, dt: number): boolean {
  const now = scaler.node.scale.x;
  const next = approach(now, scaler.target, dt, SCALE_EASE_S);
  const arrived = Math.abs(next - scaler.target) < 1e-4;
  scaler.node.scale.setScalar(arrived ? scaler.target : next);
  return arrived;
}

export function createRig(machineId: MachineId, root: Object3D): MachineRig {
  return { machineId, root, rotors: [], bobbers: [], pulsers: [], lid: null, result: null, running: true, speed: 0, melody: null, melodyAt: 0 };
}

/** Time constant of the spin-up and spin-down, in seconds. */
export const SPIN_EASE_S = 0.6;
/** Time constant of the Music Box lid, in seconds. */
export const LID_EASE_S = 0.35;
/** Time constant of a machine taking the town's scale as it settles on its plot (or giving it up when lifted), in seconds. */
export const SCALE_EASE_S = 0.12;

/** Moves `value` towards `target` exponentially: about 63 % of the way in `tau` seconds, whatever the frame time. */
export function approach(value: number, target: number, dt: number, tau: number): number {
  return value + (target - value) * (1 - Math.exp(-dt / tau));
}

/** `theta + omega * dt`: the one line the whole motion layer is built on. */
export const advance = (theta: number, omega: number, dt: number): number => theta + omega * dt;

/** Phase of horse `index` of `count`: phases evenly apart (120 degrees for three). */
export const horsePhase = (index: number, count: number): number => (index * 2 * Math.PI) / count;

/** Height offset of a horse: one rise and fall per platform turn, ±amplitude. */
export function horseBob(theta: number, phase: number, amplitude: number): number {
  return amplitude * Math.sin(theta + phase);
}

/** Scale factor of a twinkling lamp: 1 ± amplitude. */
export function twinkle(time: number, phase: number, speed: number, amplitude: number): number {
  return 1 + amplitude * Math.sin(time * speed + phase);
}

/** Writes the rotor's orientation. `absolute` sets it from `rest`; `overlay` turns what is already there. */
export function applyRotor(rotor: Rotor): void {
  _spin.setFromAxisAngle(AXES[rotor.axis], rotor.sign * rotor.theta);
  if (rotor.mode === 'absolute') rotor.node.quaternion.copy(rotor.rest).multiply(_spin);
  else rotor.node.quaternion.multiply(_spin);
}

/** Advances one rig by `dt` seconds. Allocation-free. */
export function stepRig(rig: MachineRig, dt: number, time: number): void {
  rig.speed = approach(rig.speed, rig.running ? 1 : 0, dt, SPIN_EASE_S);
  if (rig.speed < 1e-4) rig.speed = 0;
  const speeds = rig.result?.angularVelocity;
  for (let i = 0; i < rig.rotors.length; i++) {
    const rotor = rig.rotors[i];
    const omega = speeds ? (speeds[rotor.socketId] ?? 0) * rig.speed : 0;
    rotor.theta = advance(rotor.theta, omega, dt);
    applyRotor(rotor);
  }
  for (let i = 0; i < rig.bobbers.length; i++) {
    const b = rig.bobbers[i];
    b.node.position.y = b.baseY + horseBob(b.driver.theta, b.phase, b.amplitude);
  }
  const lid = rig.lid;
  if (lid) {
    lid.angle = approach(lid.angle, rig.running ? lid.openRad : 0, dt, LID_EASE_S);
    _spin.setFromAxisAngle(AXES.z, lid.angle);
    lid.pivot.quaternion.copy(lid.rest).multiply(_spin);
  }
  for (let i = 0; i < rig.pulsers.length; i++) {
    const p = rig.pulsers[i];
    p.node.scale.setScalar(p.baseScale * twinkle(time, p.phase, p.speed, p.amplitude * rig.speed));
  }
}

/** The axis a GLB states in `userData.wu.rotationAxis` ("+Z", "+Y"), default Z. */
export function axisOfGlb(node: Object3D): Axis {
  const raw = (node.userData.wu as { rotationAxis?: unknown } | undefined)?.rotationAxis;
  if (typeof raw !== 'string') return 'z';
  const letter = raw.replace(/^[+-]/, '').toLowerCase();
  return letter === 'x' || letter === 'y' || letter === 'z' ? letter : 'z';
}
