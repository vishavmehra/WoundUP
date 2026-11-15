// Blueprint validation (DATA_AND_BLUEPRINT_SPEC §13): everything that can be wrong with the data alone, before any part is placed.
// Returns messages instead of throwing, so a test (or a dev-only startup check) can print every problem at once.
import { validateBlueprint } from '../../sim';
import { getPart } from '../parts/catalogue';
import { modelPath } from '../parts/models';
import type { MachineBlueprint, SocketDefinition } from './types';

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
    // A piece of hardware sits on the empty of the part that carries it, and every part of an asset has the same empties (each gear has a `Pin`),
    // so its node only has to be unique among that carrier's sockets. A big part's node is the housing's, and unique there.
    const nodeKey = s.node === undefined ? undefined : `${s.family === 'fastener' ? (s.carrier ?? '') : ''}|${s.node}`;
    if (nodeKey !== undefined && nodes.has(nodeKey)) bad(`socket node "${s.node}" is used twice`);
    if (nodeKey !== undefined) nodes.add(nodeKey);
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

  validateStages(bp, bad);

  // The tray must be able to supply the intended build (the solver, not the tray, decides what is correct, DATA §9). Hardware is not in a tray: it is
  // the stage bag's and the caddy's (INTRICATE_ASSEMBLY_DESIGN §3.5), and `validateStages` checks that every piece of it is in a stage.
  const supplied = new Map<string, number>();
  for (const t of bp.tray) {
    if (!getPart(t.partId)) bad(`tray holds unknown part "${t.partId}"`);
    if (getPart(t.partId)?.family === 'fastener') bad(`tray holds hardware "${t.partId}": hardware comes in the stage bags`);
    if (!Number.isInteger(t.quantity) || t.quantity < 1) bad(`tray quantity of "${t.partId}" must be a positive integer`);
    if (t.decoy !== true) supplied.set(t.partId, (supplied.get(t.partId) ?? 0) + t.quantity);
  }
  const needed = new Map<string, number>();
  for (const id of Object.values(bp.intended)) if (getPart(id)?.family !== 'fastener') needed.set(id, (needed.get(id) ?? 0) + 1);
  for (const [id, count] of needed) if ((supplied.get(id) ?? 0) < count) bad(`tray supplies ${supplied.get(id) ?? 0} of "${id}", the build needs ${count}`);

  if (modelPath(bp.housing.assetId) === undefined) bad(`housing asset "${bp.housing.assetId}" has no model path`);
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

/** At most this many kinds of hardware in one stage: the caddy has four bins (INTRICATE_ASSEMBLY_DESIGN §3.5). */
export const MAX_HARDWARE_KINDS_PER_STAGE = 4;

/** INTRICATE_ASSEMBLY_DESIGN §4.3 R1: what can be wrong with `carrier`, `stage`, `group`, `implied` and `stages`. Nothing is checked when none is used. */
function validateStages(bp: MachineBlueprint, bad: (message: string) => void): void {
  const byId = new Map(bp.sockets.map((s) => [s.id, s] as const));
  const hardware = bp.sockets.filter((s) => s.family === 'fastener');

  // Carriers: known, not themselves, and acyclic. Hardware is carried by a part or seated in the housing, and always has an empty to sit on.
  for (const s of bp.sockets) {
    if (s.carrier !== undefined && !byId.has(s.carrier)) bad(`socket "${s.id}" is carried by unknown socket "${s.carrier}"`);
    if (s.carrier === s.id) bad(`socket "${s.id}" carries itself`);
    if (s.unitNode !== undefined && s.carrier === undefined) bad(`socket "${s.id}" has a unitNode but no carrier`);
  }
  for (const s of bp.sockets) {
    const seen = new Set<string>([s.id]);
    for (let c = s.carrier; c !== undefined && byId.has(c); c = byId.get(c)?.carrier) {
      if (seen.has(c)) {
        bad(`socket carriers form a cycle at "${s.id}"`);
        break;
      }
      seen.add(c);
    }
  }
  for (const s of hardware) {
    if (!s.required) bad(`hardware socket "${s.id}" must be required: a missing piece leaves the machine incomplete`);
    if (s.node === undefined) bad(`hardware socket "${s.id}" has no node: there is no empty for it to seat on`);
    if ((s.acceptedPartIds ?? []).length !== 1) bad(`hardware socket "${s.id}" must accept exactly one part: acceptance is by exact part id`);
  }
  for (const s of bp.sockets) if (s.implied === true && s.family !== 'fastener') bad(`socket "${s.id}" is implied but is not hardware`);

  // Groups are interchangeable: one carrier, one set of accepted parts, one set of dependencies.
  const groups = new Map<string, SocketDefinition[]>();
  for (const s of bp.sockets) if (s.group !== undefined) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
  const key = (ids: readonly string[] | undefined): string => [...(ids ?? [])].sort().join(',');
  for (const [group, members] of groups) {
    const [first, ...rest] = members;
    for (const m of rest) {
      if (m.carrier !== first.carrier) bad(`group "${group}": "${m.id}" and "${first.id}" have different carriers`);
      if (key(m.acceptedPartIds) !== key(first.acceptedPartIds)) bad(`group "${group}": "${m.id}" and "${first.id}" accept different parts`);
      if (key(m.dependencies) !== key(first.dependencies)) bad(`group "${group}": "${m.id}" and "${first.id}" have different dependencies`);
    }
  }

  if (bp.stages === undefined) {
    if (hardware.length > 0) bad('hardware needs stages: its bag arrives with the stage that places it');
    for (const s of bp.sockets) if (s.stage !== undefined) bad(`socket "${s.id}" names stage "${s.stage}" but the blueprint has no stages`);
    return;
  }

  // Stages: unique ids, known sockets, each socket once, every required socket in one, and sockets agree with the stage that lists them.
  const stageOf = new Map<string, string>();
  const stageIds = new Set<string>();
  for (const st of bp.stages) {
    if (!ID_PATTERN.test(st.id)) bad(`stage "${st.id}" is not lowercase snake_case`);
    if (stageIds.has(st.id)) bad(`stage "${st.id}" is listed twice`);
    stageIds.add(st.id);
    if (st.sockets.length === 0) bad(`stage "${st.id}" has no sockets`);
    if (st.name.length === 0) bad(`stage "${st.id}" has no name`);
    if ((st.site === 'stand') !== (st.unit !== undefined)) bad(`stage "${st.id}": a stand stage has a unit, and only a stand stage does`);
    if (st.unit !== undefined) {
      if (!byId.has(st.unit.carrier)) bad(`stage "${st.id}" builds a unit on unknown socket "${st.unit.carrier}"`);
      if (st.unit.grip.length === 0) bad(`stage "${st.id}" has a unit with no grip node`);
    }
    for (const id of st.sockets) {
      if (!byId.has(id)) bad(`stage "${st.id}" lists unknown socket "${id}"`);
      else if (stageOf.has(id)) bad(`socket "${id}" is in stages "${stageOf.get(id)}" and "${st.id}"`);
      else stageOf.set(id, st.id);
    }
    const kinds = new Set(st.sockets.filter((id) => byId.get(id)?.family === 'fastener').map((id) => bp.intended[id]));
    if (kinds.size > MAX_HARDWARE_KINDS_PER_STAGE) bad(`stage "${st.id}" needs ${kinds.size} kinds of hardware, the caddy has ${MAX_HARDWARE_KINDS_PER_STAGE} bins`);
  }
  const order = new Map(bp.stages.map((st, i) => [st.id, i] as const));
  for (const s of bp.sockets) {
    const stage = stageOf.get(s.id);
    if (s.required && stage === undefined) bad(`required socket "${s.id}" is in no stage`);
    if (s.stage !== undefined && s.stage !== stage) bad(`socket "${s.id}" says stage "${s.stage}" but is listed in "${stage ?? 'none'}"`);
    if (stage === undefined) continue;
    // A stage only builds on what an earlier stage (or itself) placed, so the build can be played in stage order.
    for (const need of [...(s.dependencies ?? []), ...(s.carrier === undefined ? [] : [s.carrier])]) {
      const from = stageOf.get(need);
      if (from !== undefined && (order.get(from) ?? 0) > (order.get(stage) ?? 0)) bad(`socket "${s.id}" needs "${need}", which is placed in a later stage`);
    }
  }
}
