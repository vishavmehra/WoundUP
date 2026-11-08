// Input and blueprint validation (SOLVER §9 steps 1, 2, 4; §14 step 1; DATA §13). Failures are typed errors with a
// path, never silent: "Do not silently ignore invalid references" (DATA §13).

import { CONNECTION_TYPES, MAX_WIND_UNITS, POWER_SOURCES } from './constants';
import type {
  MechanicalConnection,
  PartParameterName,
  SolverBlueprint,
  SolverErrorCode,
  SolverInput,
  SolverValidationError,
} from './types';

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Valid range of each mechanical parameter (SOLVER §12: "validate input ranges"). */
const PARAMETER_RULES = new Map<string, (v: number) => boolean>([
  ['toothCount', (v) => Number.isInteger(v) && v >= 1],
  ['module', (v) => v > 0],
  ['radius', (v) => v > 0],
  ['angularVelocity', () => true],
  ['energyPerUnit', (v) => v >= 0],
  ['drainRate', (v) => v > 0], // T = E / D
]);

/** True for a finite number inside the range of the named parameter. An unknown name only needs to be finite. */
export function isValidParameter(name: string, value: unknown): value is number {
  if (!isNumber(value)) return false;
  const rule = PARAMETER_RULES.get(name);
  return rule === undefined || rule(value);
}

/** Connection parameter that carries a part parameter's value, and the rule it must satisfy. */
const CONNECTION_PARAMETER_RULES: readonly (readonly [string, PartParameterName])[] = [
  ['fromTeeth', 'toothCount'],
  ['toTeeth', 'toothCount'],
  ['fromRadius', 'radius'],
  ['toRadius', 'radius'],
  ['module', 'module'],
];

const has = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

function validateConnection(c: MechanicalConnection, i: number, sockets: ReadonlySet<string>, errors: SolverValidationError[]): void {
  const path = `connections[${i}]`;
  const fail = (code: SolverErrorCode, sub: string): void => void errors.push({ code, path: `${path}${sub}`, id: c.id });

  if (!(CONNECTION_TYPES as readonly string[]).includes(c.type)) fail('unknown_connection_type', '.type');
  if (!sockets.has(c.from)) fail('unknown_connection_endpoint', '.from');
  if (!sockets.has(c.to)) fail('unknown_connection_endpoint', '.to');
  if (c.from === c.to) fail('self_connection', '');

  const p = c.parameters ?? {};
  for (const [key, rule] of CONNECTION_PARAMETER_RULES) {
    const v = (p as Record<string, unknown>)[key];
    if (v !== undefined && !isValidParameter(rule, v)) fail('invalid_parameter', `.parameters.${key}`);
  }

  // Direction (SOLVER §8): a belt must say it, a shaft is rigid, an external mesh always reverses. Never inferred.
  const direction = p.direction;
  if (c.type === 'belt') {
    if (direction === undefined) fail('missing_parameter', '.parameters.direction');
    else if (direction !== 1 && direction !== -1) fail('invalid_parameter', '.parameters.direction');
  } else if (direction !== undefined && direction !== (c.type === 'mesh' ? -1 : 1)) {
    fail('invalid_parameter', '.parameters.direction');
  }

  if (c.type === 'pin') {
    const samples = p.profile?.samples;
    if (samples === undefined) fail('missing_parameter', '.parameters.profile');
    else if (!Array.isArray(samples) || samples.length < 2 || !samples.every(isNumber)) fail('invalid_parameter', '.parameters.profile.samples');
  }
}

/**
 * Checks everything about a blueprint that does not depend on which parts are installed: unique ids, connection
 * endpoints and types, parameters the blueprint itself supplies, power definition and targets. Call it when loading
 * content (DATA §13: invalid blueprints fail early); `solve` calls it again, it is cheap.
 */
export function validateBlueprint(blueprint: SolverBlueprint): SolverValidationError[] {
  const errors: SolverValidationError[] = [];
  const sockets = new Set<string>();
  blueprint.sockets.forEach((s, i) => {
    if (sockets.has(s.id)) errors.push({ code: 'duplicate_socket_id', path: `sockets[${i}].id`, id: s.id });
    sockets.add(s.id);
  });

  const connectionIds = new Set<string>();
  const pinFollowers = new Set<string>();
  blueprint.connections.forEach((c, i) => {
    if (connectionIds.has(c.id)) errors.push({ code: 'duplicate_connection_id', path: `connections[${i}].id`, id: c.id });
    connectionIds.add(c.id);
    validateConnection(c, i, sockets, errors);
    if (c.type === 'pin') {
      // One follower has one driver: two would need a rule for combining them, which no spec defines.
      if (pinFollowers.has(c.to)) errors.push({ code: 'multiple_pin_drivers', path: `connections[${i}].to`, id: c.id });
      pinFollowers.add(c.to);
    }
  });

  const power = blueprint.power;
  if (!(POWER_SOURCES as readonly string[]).includes(power.source)) {
    errors.push({ code: 'invalid_parameter', path: 'power.source' });
  }
  if (!sockets.has(power.socketId)) errors.push({ code: 'unknown_power_socket', path: 'power.socketId', id: power.socketId });
  if (power.source === 'ambient_wind') {
    if (!isNumber(power.angularVelocity)) errors.push({ code: 'invalid_parameter', path: 'power.angularVelocity' });
  } else {
    if (power.angularVelocity !== undefined && !isValidParameter('angularVelocity', power.angularVelocity)) {
      errors.push({ code: 'invalid_parameter', path: 'power.angularVelocity' });
    }
    if (power.drainRate !== undefined && !isValidParameter('drainRate', power.drainRate)) {
      errors.push({ code: 'invalid_parameter', path: 'power.drainRate' });
    }
  }

  const { angularVelocity, followerPose, tolerance, minRunSeconds } = blueprint.targets;
  for (const [group, map] of [['angularVelocity', angularVelocity], ['followerPose', followerPose]] as const) {
    for (const id of Object.keys(map ?? {})) {
      const path = `targets.${group}.${id}`;
      if (!sockets.has(id)) errors.push({ code: 'unknown_target_node', path, id });
      if (!isNumber(map?.[id])) errors.push({ code: 'invalid_parameter', path, id });
      const tol = tolerance !== undefined && has(tolerance, id) ? tolerance[id] : undefined;
      if (tol === undefined) errors.push({ code: 'missing_target_tolerance', path: `targets.tolerance.${id}`, id });
      else if (!isNumber(tol) || tol < 0) errors.push({ code: 'invalid_parameter', path: `targets.tolerance.${id}`, id });
    }
  }
  if (minRunSeconds !== undefined && !(isNumber(minRunSeconds) && minRunSeconds >= 0)) {
    errors.push({ code: 'invalid_parameter', path: 'targets.minRunSeconds' });
  }
  return errors;
}

/** Checks the installed parts, power and angles against the blueprint (SOLVER §9 steps 1, 2; §16 invalid part identifier). */
export function validateInput(input: SolverInput): SolverValidationError[] {
  const { blueprint, installedParts, power, partCatalogue, nodeAngles } = input;
  const errors: SolverValidationError[] = [];
  const sockets = new Map(blueprint.sockets.map((s) => [s.id, s] as const));

  if (power.source !== blueprint.power.source) {
    errors.push({ code: 'power_source_mismatch', path: 'power.source' });
  }
  if (power.windUnits === undefined) {
    if (blueprint.power.source === 'mainspring') errors.push({ code: 'missing_parameter', path: 'power.windUnits' });
  } else if (!isNumber(power.windUnits) || power.windUnits < 0 || power.windUnits > MAX_WIND_UNITS) {
    errors.push({ code: 'invalid_parameter', path: 'power.windUnits' });
  }

  const seen = new Set<string>();
  installedParts.forEach((part, i) => {
    const path = `installedParts[${i}]`;
    const socket = sockets.get(part.socketId);
    if (socket === undefined) errors.push({ code: 'unknown_socket', path: `${path}.socketId`, id: part.socketId });
    if (seen.has(part.socketId)) errors.push({ code: 'duplicate_installed_socket', path: `${path}.socketId`, id: part.socketId });
    seen.add(part.socketId);

    if (typeof part.partId !== 'string' || part.partId === '') {
      errors.push({ code: 'invalid_part_id', path: `${path}.partId`, id: part.socketId });
    } else if (partCatalogue !== undefined && !has(partCatalogue, part.partId)) {
      errors.push({ code: 'unknown_part', path: `${path}.partId`, id: part.partId });
    } else if (socket?.acceptedPartIds !== undefined && !socket.acceptedPartIds.includes(part.partId)) {
      errors.push({ code: 'part_not_accepted', path: `${path}.partId`, id: part.partId });
    }

    const params = part.parameters ?? {};
    for (const key of Object.keys(params)) {
      if (!isValidParameter(key, params[key])) errors.push({ code: 'invalid_parameter', path: `${path}.parameters.${key}`, id: part.socketId });
    }
  });

  for (const key of Object.keys(nodeAngles ?? {})) {
    if (!sockets.has(key)) errors.push({ code: 'unknown_socket', path: `nodeAngles.${key}`, id: key });
    else if (!isNumber(nodeAngles?.[key])) errors.push({ code: 'invalid_parameter', path: `nodeAngles.${key}`, id: key });
  }
  return errors;
}
