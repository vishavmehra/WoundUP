// Stages, arming and step state of the intricate assembly (INTRICATE_ASSEMBLY_DESIGN §3, §4.3 R2 R4 R5, ADR-050). Pure functions over plain data: no
// Three.js, no ECS, no clock. One engine drives the step list, the progress dial, the idle pulse and the Helper (design §2 item 7), so they never disagree.
//
//   planStages  - what the game seats (hardware in Relaxed), what the player places, and what each stage's bag holds, for a difficulty
//   armedSockets - the sockets that may take a part now: stage open, carrier present, dependencies present
//   stepState   - the current stage, the armed sockets, the next one to point at, per-stage progress
//
// A blueprint without `stages` is one stage holding every socket, so machines that keep today's build need no special case.
import type { Difficulty } from '../../game/content';
import { carrierOf } from './rules';
import type { Assembly } from './solve';
import type { MachineBlueprint, SocketDefinition, StageDefinition } from './types';

export interface PlanOptions {
  /** `INTRICATE_ASSEMBLY` (design §12.4). False is the fallback: Relaxed, hardware seated by the game at the start. Required so no caller can forget it. */
  readonly intricate: boolean;
  /** Build units on the shaft stand (P1). False (P0): every stage is built in the housing and no unit is carried. */
  readonly stand?: boolean;
  /** No caddy on the bench (its file did not load): no bin can hand out hardware, so the game seats it as in Relaxed whatever the level. */
  readonly noCaddy?: boolean;
}

/** One stage of a plan: its sockets split into what the player places and what the game seats, and the parts of its bag. */
export interface StagePlan {
  readonly id: string;
  readonly name: string;
  readonly site: 'case' | 'stand';
  readonly unit?: StageDefinition['unit'];
  /** Set on the last stand stage of a unit: the carrier socket whose unit is carried into the housing before the stage is done. */
  readonly carryAfter?: string;
  /** Every socket of the stage, in step order. */
  readonly sockets: readonly string[];
  /** The player's placements, in step order. */
  readonly byHand: readonly string[];
  /** Sockets the game seats (hardware in Relaxed). */
  readonly auto: readonly string[];
  /** Part ids that arrive for the player when the stage opens: big parts for the tray, hardware for the caddy (one entry per placement). */
  readonly bag: { readonly big: readonly string[]; readonly hardware: readonly string[] };
}

export interface StagesPlan {
  /** The level the plan was made for; `relaxed` whatever was asked when `intricate` is false. */
  readonly difficulty: Difficulty;
  readonly intricate: boolean;
  readonly stand: boolean;
  /** `PlanOptions.noCaddy`, kept so a plan remade for another level (Pause) still has the game seat the hardware. */
  readonly noCaddy: boolean;
  /** `with-carrier`: the game seats a piece of hardware as its carrier lands. `at-start`: before the first placement (the fallback). */
  readonly seat: 'with-carrier' | 'at-start';
  readonly stages: readonly StagePlan[];
  /** Every socket the game seats, in blueprint order. */
  readonly auto: readonly string[];
  /** Carrier socket to the auto sockets that arrive seated on it when it lands (its hardware, and the hardware of that hardware). */
  readonly bundles: Readonly<Record<string, readonly string[]>>;
  /** Auto sockets with no carrier to wait for (seated in the housing): the game seats them before the first placement. */
  readonly atStart: readonly string[];
}

const socketById = (bp: MachineBlueprint): ReadonlyMap<string, SocketDefinition> => new Map(bp.sockets.map((s) => [s.id, s] as const));

/** The stages of a blueprint, or the one stage that holds every socket when it has none. */
export const stagesOf = (bp: MachineBlueprint): readonly StageDefinition[] =>
  bp.stages ?? [{ id: 'build', name: bp.name, sockets: bp.sockets.map((s) => s.id), site: 'case' }];

/** The id of the stage that lists `socketId`, or undefined. */
export const stageOf = (bp: MachineBlueprint, socketId: string): string | undefined => stagesOf(bp).find((st) => st.sockets.includes(socketId))?.id;

/** The sockets of the same group on the same carrier as `socketId` (itself included): the pieces that are interchangeable. Just itself when it has no group. */
export function groupMembers(bp: MachineBlueprint, socketId: string): string[] {
  const s = bp.sockets.find((x) => x.id === socketId);
  if (s === undefined) return [];
  if (s.group === undefined) return [s.id];
  return bp.sockets.filter((x) => x.group === s.group && x.carrier === s.carrier).map((x) => x.id);
}

/**
 * R5. What the game seats and what the player places at `difficulty`. Relaxed seats every piece of hardware; Standard and Master seat none (Master differs
 * only in what is shown, which is the UI's business). `intricate: false` plans Relaxed with the hardware seated at the start (design §12.4).
 */
export function planStages(bp: MachineBlueprint, difficulty: Difficulty, options: PlanOptions): StagesPlan {
  const { intricate } = options;
  const stand = options.stand === true;
  const noCaddy = options.noCaddy === true;
  const level: Difficulty = intricate ? difficulty : 'relaxed';
  const byId = socketById(bp);
  const autoIds = level === 'relaxed' || noCaddy ? bp.sockets.filter((s) => s.family === 'fastener').map((s) => s.id) : [];
  const auto = new Set(autoIds);
  const bundles: Record<string, string[]> = {};
  const atStart: string[] = [];
  for (const id of autoIds) {
    // The first carrier up the chain that the player places; hardware on hardware (a screw on a clip on the comb) is in the bundle of the comb.
    let anchor = byId.get(id)?.carrier;
    while (anchor !== undefined && auto.has(anchor)) anchor = byId.get(anchor)?.carrier;
    if (!intricate || anchor === undefined) atStart.push(id);
    else (bundles[anchor] ??= []).push(id);
  }
  const defs = stagesOf(bp);
  const stages = defs.map((def, i): StagePlan => {
    const onStand = stand && def.site === 'stand' && def.unit !== undefined;
    const carrier = onStand ? def.unit?.carrier : undefined;
    const next = defs[i + 1];
    const last = carrier !== undefined && !(stand && next?.site === 'stand' && next.unit?.carrier === carrier);
    const part = (id: string): string => bp.intended[id];
    const hand = def.sockets.filter((id) => !auto.has(id));
    const isHardware = (id: string): boolean => byId.get(id)?.family === 'fastener';
    return {
      id: def.id,
      name: def.name,
      site: onStand ? 'stand' : 'case',
      ...(onStand ? { unit: def.unit } : {}),
      ...(last ? { carryAfter: carrier } : {}),
      sockets: def.sockets,
      byHand: hand,
      auto: def.sockets.filter((id) => auto.has(id)),
      bag: { big: hand.filter((id) => !isHardware(id)).map(part), hardware: hand.filter(isHardware).map(part) },
    };
  });
  return { difficulty: level, intricate, stand, noCaddy, seat: intricate ? 'with-carrier' : 'at-start', stages, auto: autoIds, bundles, atStart };
}

/** One stage's progress for the step list and the dial. Counts the player's placements only. */
export interface StageProgress {
  readonly id: string;
  readonly name: string;
  readonly site: 'case' | 'stand';
  readonly total: number;
  readonly done: number;
  readonly complete: boolean;
}

export interface StepState {
  readonly stages: readonly StageProgress[];
  /** Index of the current stage: the first that is not complete. `stages.length` when every stage is. */
  readonly stage: number;
  /** The sockets that may take a part now, in step order. Group members are all here together. */
  readonly armed: readonly string[];
  /** The one the Helper, the idle pulse and the step list point at: the first armed socket. */
  readonly next: string | undefined;
  /** A finished unit on a stand that can now be carried into this housing socket. */
  readonly carry: string | undefined;
  /** Every required socket is filled (the machine can be solved). */
  readonly complete: boolean;
}

const NONE: ReadonlySet<string> = new Set();

/**
 * R2 and R4. Where the build stands. `onStand` are carrier sockets whose part sits on a stand: present for arming and for the stage's pips though their
 * housing socket is empty. Sockets the plan seats with their carrier (Relaxed) count as present while the carrier is, so arming never waits on a flight.
 */
export function stepState(bp: MachineBlueprint, plan: StagesPlan, assembly: Assembly, onStand: ReadonlySet<string> = NONE): StepState {
  const byId = socketById(bp);
  const auto = new Set(plan.auto);
  const present = (id: string): boolean => {
    if (assembly[id] !== undefined || onStand.has(id)) return true;
    const s = byId.get(id);
    if (s === undefined || !auto.has(id) || plan.seat !== 'with-carrier') return false;
    const carrier = carrierOf(s, plan.stand);
    return carrier !== undefined && present(carrier);
  };
  const stages = plan.stages.map((st): StageProgress & { readonly handDone: boolean } => {
    const done = st.byHand.filter(present).length;
    const handDone = done === st.byHand.length;
    // The carry is part of the stage that ends a unit: it is not done until the unit is in the housing.
    const carried = st.carryAfter === undefined || assembly[st.carryAfter] !== undefined;
    return { id: st.id, name: st.name, site: st.site, total: st.byHand.length, done, complete: handDone && carried, handDone };
  });
  const index = stages.findIndex((st) => !st.complete);
  const current = index < 0 ? undefined : plan.stages[index];

  const armed: string[] = [];
  if (current !== undefined) {
    for (const id of current.byHand) {
      const s = byId.get(id);
      if (s === undefined || present(id)) continue;
      const carrier = carrierOf(s, plan.stand);
      if (carrier !== undefined && !present(carrier)) continue;
      if ((s.dependencies ?? []).some((d) => !present(d))) continue;
      armed.push(id);
    }
  }

  let carry: string | undefined;
  const c = current?.carryAfter;
  if (current !== undefined && c !== undefined && stages[index].handDone && onStand.has(c) && assembly[c] === undefined) {
    const deps = byId.get(c)?.dependencies ?? [];
    if (deps.every((d) => assembly[d] !== undefined)) carry = c;
  }

  return {
    stages: stages.map(({ handDone: _handDone, ...progress }) => progress),
    stage: index < 0 ? plan.stages.length : index,
    armed,
    next: armed[0],
    carry,
    complete: bp.sockets.every((s) => !s.required || assembly[s.id] !== undefined),
  };
}

/** R2 alone: the armed sockets for an assembly. */
export const armedSockets = (bp: MachineBlueprint, plan: StagesPlan, assembly: Assembly, onStand?: ReadonlySet<string>): readonly string[] =>
  stepState(bp, plan, assembly, onStand).armed;
