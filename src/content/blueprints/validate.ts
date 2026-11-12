// Blueprint validation (DATA_AND_BLUEPRINT_SPEC §13): everything that can be wrong with the data alone, before any part is placed.
// Returns messages instead of throwing, so a test (or a dev-only startup check) can print every problem at once.
import { validateBlueprint } from '../../sim';
import { getPart } from '../parts/catalogue';
import { MODEL_PATHS } from '../parts/models';
import type { MachineBlueprint } from './types';

const ID_PATTERN = /^[a-z0-9_]{1,64}$/; // the gift codec's pattern: every id here may end up in a link

const finite = (values: readonly number[]): boolean => values.every((v) => Number.isFinite(v));

export function validateMachineBlueprint(bp: MachineBlueprint): string[] {
  const errors: string[] = [];
  const bad = (message: string): void => void errors.push(`${bp.id}: ${message}`);

  if (!ID_PATTERN.test(bp.id)) bad('id is not lowercase snake_case');
  if (!Number.isInteger(bp.version) || bp.version < 1) bad('version must be a positive integer');
  for (const e of validateBlueprint(bp)) bad(`solver ${e.code} at ${e.path}`);

  const socketIds = new Set(bp.sockets.map((s) => s.id));
  const nodes = new Set<string>();
  for (const s of bp.sockets) {
    if (!ID_PATTERN.test(s.id)) bad(`socket "${s.id}" is not lowercase snake_case`);
    if (s.node !== undefined && nodes.has(s.node)) bad(`socket node "${s.node}" is used twice`);
    if (s.node !== undefined) nodes.add(s.node);
    if (s.acceptedPartIds === undefined || s.acceptedPartIds.length === 0) bad(`socket "${s.id}" accepts no part (acceptance is explicit, DATA §6)`);
    for (const id of s.acceptedPartIds ?? []) {
      const part = getPart(id);
      if (!part) bad(`socket "${s.id}" accepts unknown part "${id}"`);
      else if (part.family !== s.family) bad(`socket "${s.id}" (${s.family}) accepts "${id}" of family ${part.family}`);
    }
    for (const d of s.dependencies ?? []) {
      if (!socketIds.has(d)) bad(`socket "${s.id}" depends on unknown socket "${d}"`);
      if (d === s.id) bad(`socket "${s.id}" depends on itself`);
    }
    if (s.position !== undefined && !finite(s.position)) bad(`socket "${s.id}" has a non-finite position`);
    if (s.rotation !== undefined && (!finite(s.rotation) || Math.abs(Math.hypot(...s.rotation) - 1) > 1e-4)) bad(`socket "${s.id}" rotation is not a unit quaternion`);
  }
  if (hasDependencyCycle(bp)) bad('socket dependencies form a cycle');

  // The intended build: every socket, with a part the socket accepts, and nothing else.
  for (const s of bp.sockets) {
    const id = bp.intended[s.id];
    if (id === undefined) bad(`intended build has nothing for socket "${s.id}"`);
    else if (!s.acceptedPartIds?.includes(id)) bad(`intended part "${id}" is not accepted by socket "${s.id}"`);
  }
  for (const key of Object.keys(bp.intended)) if (!socketIds.has(key)) bad(`intended build fills unknown socket "${key}"`);

  // The tray must be able to supply the intended build (the solver, not the tray, decides what is correct, DATA §9).
  const supplied = new Map<string, number>();
  for (const t of bp.tray) {
    if (!getPart(t.partId)) bad(`tray holds unknown part "${t.partId}"`);
    if (!Number.isInteger(t.quantity) || t.quantity < 1) bad(`tray quantity of "${t.partId}" must be a positive integer`);
    if (t.decoy !== true) supplied.set(t.partId, (supplied.get(t.partId) ?? 0) + t.quantity);
  }
  const needed = new Map<string, number>();
  for (const id of Object.values(bp.intended)) needed.set(id, (needed.get(id) ?? 0) + 1);
  for (const [id, count] of needed) if ((supplied.get(id) ?? 0) < count) bad(`tray supplies ${supplied.get(id) ?? 0} of "${id}", the build needs ${count}`);

  if (!Object.prototype.hasOwnProperty.call(MODEL_PATHS, bp.housing.assetId)) bad(`housing asset "${bp.housing.assetId}" has no model path`);
  if (!(bp.housing.xray.radius > 0) || !(bp.housing.xray.top > 0)) bad('housing xray zone must be positive');
  return errors;
}

function hasDependencyCycle(bp: MachineBlueprint): boolean {
  const deps = new Map(bp.sockets.map((s) => [s.id, s.dependencies ?? []] as const));
  const state = new Map<string, 1 | 2>(); // 1 on the current path, 2 finished
  const visit = (id: string): boolean => {
    if (state.get(id) === 2) return false;
    if (state.get(id) === 1) return true;
    state.set(id, 1);
    for (const d of deps.get(id) ?? []) if (deps.has(d) && visit(d)) return true;
    state.set(id, 2);
    return false;
  };
  return [...deps.keys()].some(visit);
}
