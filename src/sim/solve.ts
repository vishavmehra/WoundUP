// The mechanical solver (MECHANICAL_SOLVER_SPEC.md): the mechanical authority of Wound Up.
// Pure TypeScript. No Three.js, IWSDK, DOM, timers or randomness (ADR-008, SOLVER §2). Run it when the assembly or
// the wind units change, never per frame (SOLVER §18): `sampleFollowerProfile` is the per-frame part.
//
// Evaluation order (SOLVER §14):
//   1. invalid input, blueprint or part data -> `{ ok: false }`
//   2. a required socket (or the power socket) is empty -> `incomplete`
//   3. a gear module mismatch or a contradictory loop -> `jams`
//   4. a missed target -> `runs_wrong`
//   5. otherwise `runs`
//
// Determinism (same input, same output, whatever the order of the input arrays): sockets and connections are visited in
// plain code-unit order of their ids, only basic arithmetic decides a status, and output keys are inserted in sorted order.

import {
  CONTINUOUS_RUN_SECONDS,
  LOOP_TOLERANCE,
  MAX_WIND_UNITS,
  MODULE_EPSILON,
  OMEGA_EPSILON,
  RUN_SECONDS_TARGET_ID,
  TARGET_EPSILON,
} from './constants';
import { sampleFollowerProfile } from './follower';
import { springRunSeconds } from './power';
import type {
  ConnectionType,
  InstalledPart,
  JamReason,
  PartParameterName,
  SolveOutcome,
  SolveResult,
  SolveStatus,
  SolverInput,
  SolverValidationError,
} from './types';
import { isValidParameter, validateBlueprint, validateInput } from './validate';

/** A connection between two installed parts, with its speed factors resolved from the installed parts. */
interface Edge {
  readonly id: string;
  readonly type: ConnectionType;
  readonly from: string;
  readonly to: string;
  /** omega_to = kForward * omega_from (shaft, mesh, belt). */
  readonly kForward: number;
  /** omega_from = kBackward * omega_to. Written out rather than 1 / kForward so each direction is the spec formula. */
  readonly kBackward: number;
  readonly moduleMismatch: boolean;
  readonly profile?: readonly number[];
}

interface Neighbour {
  readonly edge: Edge;
  readonly other: string;
  readonly k: number;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The result of a machine that cannot run: no valid operating values exist (SOLVER §11, §14). */
const idle = (status: SolveStatus): SolveResult => ({
  status,
  angularVelocity: {},
  followerPose: {},
  runSeconds: 0,
  triggered: {},
  continuous: false,
});

const jammed = (jamAt: string, jamReason: JamReason): SolveOutcome => ({
  ok: true,
  result: { ...idle('jams'), jamAt, jamReason },
});

/** Relative disagreement of two speeds that reached one node (SOLVER §10). */
const contradicts = (a: number, b: number): boolean =>
  Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), OMEGA_EPSILON) > LOOP_TOLERANCE;

/** Inclusive band `expected * tolerance` around `expected`, with float slack at the edge. */
const withinTolerance = (actual: number, expected: number, tolerance: number): boolean =>
  Math.abs(actual - expected) <= tolerance * Math.abs(expected) * (1 + TARGET_EPSILON);

export function solve(input: SolverInput): SolveOutcome {
  const { blueprint, installedParts, power, partCatalogue, nodeAngles } = input;

  // 1. Validation (SOLVER §9 steps 1, 2).
  const errors: SolverValidationError[] = [...validateBlueprint(blueprint), ...validateInput(input)];
  if (errors.length > 0) return { ok: false, errors };

  const installed = new Map<string, InstalledPart>(installedParts.map((p) => [p.socketId, p] as const));
  const powerSocket = blueprint.power.socketId;

  // Part values are resolved before the missing-socket check, so invalid part data is a validation failure even on a
  // half-built machine (SOLVER §14: invalid input before `incomplete`).

  // Mechanical value of an installed socket: its own parameters, then the catalogue, then the blueprint's authored fallback.
  const lookup = (socketId: string, name: PartParameterName, fallback: number | undefined, path: string): number | undefined => {
    const part = installed.get(socketId) as InstalledPart;
    const value = part.parameters?.[name] ?? partCatalogue?.[part.partId]?.mechanical?.[name] ?? fallback;
    if (value === undefined) errors.push({ code: 'missing_parameter', path, id: socketId });
    else if (!isValidParameter(name, value)) errors.push({ code: 'invalid_parameter', path, id: socketId });
    else return value;
    return undefined;
  };

  // Power source (SOLVER §12, §12.2).
  const pw = blueprint.power;
  let omega0 = 0;
  let runSeconds = 0;
  /** Run time at full wind: what `minRunSeconds` checks, so the status never depends on how far the player wound. */
  let capacitySeconds = 0;
  let continuous = false;
  if (pw.source === 'ambient_wind') {
    omega0 = pw.angularVelocity;
    runSeconds = CONTINUOUS_RUN_SECONDS;
    capacitySeconds = CONTINUOUS_RUN_SECONDS;
    continuous = true;
  } else if (installed.has(powerSocket)) { // an empty power socket is reported as `incomplete` below
    const w = lookup(powerSocket, 'angularVelocity', pw.angularVelocity, 'power.angularVelocity');
    const energyPerUnit = lookup(powerSocket, 'energyPerUnit', undefined, 'power.energyPerUnit');
    const drainRate = lookup(powerSocket, 'drainRate', pw.drainRate, 'power.drainRate');
    if (w !== undefined && energyPerUnit !== undefined && drainRate !== undefined) {
      omega0 = w;
      runSeconds = springRunSeconds(power.windUnits ?? 0, energyPerUnit, drainRate);
      capacitySeconds = springRunSeconds(MAX_WIND_UNITS, energyPerUnit, drainRate);
    }
  }

  // 3a. Build the graph from the connections whose two ends hold a part (SOLVER §9 steps 3, 4). A connection to an empty
  // optional socket transmits nothing. Connections are taken in id order so the traversal is canonical.
  const ordered = blueprint.connections.map((c, index) => ({ c, index })).sort((a, b) => compare(a.c.id, b.c.id));
  const edges: Edge[] = [];
  for (const { c, index } of ordered) {
    if (!installed.has(c.from) || !installed.has(c.to)) continue;
    const p = c.parameters;
    const at = (name: string): string => `connections[${index}].parameters.${name}`;
    const base = { id: c.id, type: c.type, from: c.from, to: c.to, moduleMismatch: false };
    switch (c.type) {
      case 'shaft': // rigid coupling: omega_b = omega_a (SOLVER §8.1)
        edges.push({ ...base, kForward: 1, kBackward: 1 });
        break;
      case 'mesh': { // omega_b = -omega_a * Na / Nb, modules must agree (SOLVER §8.2)
        const nf = lookup(c.from, 'toothCount', p?.fromTeeth, at('fromTeeth'));
        const nt = lookup(c.to, 'toothCount', p?.toTeeth, at('toTeeth'));
        const mf = lookup(c.from, 'module', p?.module, at('module'));
        const mt = lookup(c.to, 'module', p?.module, at('module'));
        if (nf !== undefined && nt !== undefined && mf !== undefined && mt !== undefined) {
          edges.push({
            ...base,
            kForward: -(nf / nt),
            kBackward: -(nt / nf),
            moduleMismatch: Math.abs(mf - mt) > MODULE_EPSILON * Math.max(mf, mt),
          });
        }
        break;
      }
      case 'belt': { // omega_b = omega_a * ra / rb, sense from the authored direction (SOLVER §8.3)
        const rf = lookup(c.from, 'radius', p?.fromRadius, at('fromRadius'));
        const rt = lookup(c.to, 'radius', p?.toRadius, at('toRadius'));
        if (rf !== undefined && rt !== undefined) {
          const d = p?.direction as number; // validated to be 1 or -1
          edges.push({ ...base, kForward: d * (rf / rt), kBackward: d * (rt / rf) });
        }
        break;
      }
      case 'pin': // cam to follower: a pose from profile data, no speed ratio (SOLVER §8.4)
        edges.push({ ...base, kForward: 0, kBackward: 0, profile: p?.profile?.samples });
        break;
      case 'trigger': // activation only, no speed ratio (SOLVER §8.5)
        edges.push({ ...base, kForward: 0, kBackward: 0 });
        break;
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  // 2. Missing parts (SOLVER §11). An absent part is never a zero-speed component.
  const missingSockets = blueprint.sockets
    .filter((s) => (s.required || s.id === powerSocket) && !installed.has(s.id))
    .map((s) => s.id)
    .sort();
  if (missingSockets.length > 0) return { ok: true, result: { ...idle('incomplete'), missingSockets } };

  // 3b. A mesh of unequal modules cannot turn. Checked for every installed mesh, driven or not.
  const mismatch = edges.find((e) => e.moduleMismatch);
  if (mismatch !== undefined) return jammed(mismatch.id, 'module_mismatch');

  // 3c. Propagate speed breadth-first from the power source (SOLVER §9). Each edge is crossed once; a node reached again
  // must agree with its first value (SOLVER §10).
  const adjacency = new Map<string, Neighbour[]>();
  const link = (from: string, n: Neighbour): void => {
    const list = adjacency.get(from);
    if (list === undefined) adjacency.set(from, [n]);
    else list.push(n);
  };
  for (const e of edges) {
    if (e.type !== 'shaft' && e.type !== 'mesh' && e.type !== 'belt') continue;
    link(e.from, { edge: e, other: e.to, k: e.kForward });
    link(e.to, { edge: e, other: e.from, k: e.kBackward });
  }
  const omega = new Map<string, number>([[powerSocket, omega0]]);
  const crossed = new Set<Edge>();
  const queue = [powerSocket];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head];
    const wu = omega.get(u) as number;
    for (const { edge, other, k } of adjacency.get(u) ?? []) {
      if (crossed.has(edge)) continue;
      crossed.add(edge);
      const w = k * wu;
      const known = omega.get(other);
      if (known === undefined) {
        omega.set(other, w);
        queue.push(other);
      } else if (contradicts(known, w)) {
        return jammed(other, 'velocity_contradiction');
      }
    }
  }

  // Outputs, keys in sorted order. `+ 0` turns -0 into 0.
  const nodeIds = [...installed.keys()].sort();
  const angularVelocity: Record<string, number> = {};
  for (const id of nodeIds) angularVelocity[id] = (omega.get(id) ?? 0) + 0;

  // Followers: profile at the cam's current angle (SOLVER §8.4). Keys sorted by follower id (one driver per follower).
  const followerPose: Record<string, number> = {};
  for (const e of edges.filter((x) => x.type === 'pin').sort((a, b) => compare(a.to, b.to))) {
    if (e.profile !== undefined) followerPose[e.to] = sampleFollowerProfile(e.profile, nodeAngles?.[e.from] ?? 0);
  }

  // Triggers: a node is activated by a trigger from a moving or already activated node (SOLVER §8.5). Fixed point over a
  // handful of edges; it ends after at most one pass per trigger.
  const triggerEdges = edges.filter((e) => e.type === 'trigger');
  const activated = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of triggerEdges) {
      const sourceActive = Math.abs(angularVelocity[e.from]) > OMEGA_EPSILON || activated.has(e.from);
      if (sourceActive && !activated.has(e.to)) {
        activated.add(e.to);
        changed = true;
      }
    }
  }
  const triggered: Record<string, boolean> = {};
  for (const id of [...new Set(triggerEdges.map((e) => e.to))].sort()) triggered[id] = activated.has(id);

  // 4. Targets (SOLVER §13). Speeds compare as magnitudes; the band is a fraction of the expected value.
  const { targets } = blueprint;
  const tolerance = targets.tolerance ?? {};
  const wrongTargets: string[] = [];
  for (const [id, expected] of Object.entries(targets.angularVelocity ?? {})) {
    if (!withinTolerance(Math.abs(angularVelocity[id] ?? 0), Math.abs(expected), tolerance[id])) wrongTargets.push(id);
  }
  for (const [id, expected] of Object.entries(targets.followerPose ?? {})) {
    const actual = followerPose[id];
    if (actual === undefined || !withinTolerance(actual, expected, tolerance[id])) wrongTargets.push(id);
  }
  if (targets.minRunSeconds !== undefined && capacitySeconds < targets.minRunSeconds) wrongTargets.push(RUN_SECONDS_TARGET_ID);
  wrongTargets.sort();

  const result: SolveResult = {
    status: wrongTargets.length > 0 ? 'runs_wrong' : 'runs',
    angularVelocity,
    followerPose,
    runSeconds,
    triggered,
    continuous,
  };
  if (wrongTargets.length > 0) result.wrongTargets = wrongTargets;
  return { ok: true, result };
}
