/**
 * Progression: the one authority over letter statuses and machine records (DATA_AND_BLUEPRINT_SPEC §12, "Do not create a
 * second independent progression system inside the UI"). Pure functions over SaveV1.
 *
 * Convention for every transition below: an illegal or redundant request returns the input save unchanged (the same
 * reference), so a caller detects "nothing happened" with `next === save` and hostile or out-of-order calls cannot
 * corrupt state. A legal one returns a new save and never mutates its input.
 *
 * Rules (PRODUCT_SPEC §7, §8; GAMEPLAY_SYSTEMS §4.1; DATA_AND_BLUEPRINT_SPEC §12), the unlock ones held as data in
 * content.ts:
 *  - Letter 1 becomes available when the trunk opens. Every later letter becomes available when the one before it is
 *    completed, so the story is a single chain.
 *  - Opening a letter never completes it (§4). A build letter completes when its machine is placed in its plot, which
 *    settles the two wordings of the Letter 2 trigger ("first Music Box is placed" and "first Music Box completion").
 *    A repair letter completes when the repair is verified.
 */

import {
  CLOSING_CARD,
  LETTER_IDS,
  LETTERS,
  MACHINE_PLOT,
  REPAIRS,
  type LetterDef,
  type LetterId,
  type LetterStatus,
  type MachineId,
  type PlotId,
  type RepairId,
} from './content';
import type { MachineRecord, SaveV1 } from './save';

export interface ProgressionOptions {
  /**
   * Whether the Clock Tower is in the build. It is the first feature cut (CLAUDE.md §2). When it is out, Letter 6 never
   * unlocks and the story ends, with the closing card, when Letter 5 is completed. The specifications do not say what
   * happens to Letter 6 and the closing card when the Tower is cut (STORY_AND_QUEST_ENGINE §3.3); this is the default
   * until the owner rules, and the one switch to flip when the Tower is built.
   */
  readonly clockTower: boolean;
}
export const DEFAULT_PROGRESSION: ProgressionOptions = { clockTower: false };

/**
 * Where the specifications leave "after Letter N" open (STORY_AND_QUEST_ENGINE §3.3), one rule applies to both uses:
 * "after Letter N" means Letter N is completed. Gifting follows Letter 2, so a gifted Music Box has had its worn spring
 * replaced; the daily repair follows Letter 5, so the player has done both repairs it draws on. Change a `status` here
 * (for example to 'available' to gift as soon as Letter 2 arrives) if the owner rules otherwise.
 */
export const GATES = {
  gift: { letterId: 'letter_2', status: 'completed' },
  daily: { letterId: 'letter_5', status: 'completed' },
} as const satisfies Record<string, { letterId: LetterId; status: LetterStatus }>;

const RANK: Readonly<Record<LetterStatus, number>> = { locked: 0, available: 1, accepted: 2, completed: 3 };

const WITHOUT_TOWER: readonly LetterId[] = LETTER_IDS.filter((id) => id !== 'letter_6');

/** The letters of this build in story order. */
export function letterSequence(options: ProgressionOptions = DEFAULT_PROGRESSION): readonly LetterId[] {
  return options.clockTower ? LETTER_IDS : WITHOUT_TOWER;
}

/** True when the letter has reached `status` or beyond. */
export function letterReached(save: SaveV1, letterId: LetterId, status: LetterStatus): boolean {
  return RANK[save.letters[letterId]] >= RANK[status];
}

function withLetter(save: SaveV1, id: LetterId, status: LetterStatus): SaveV1 {
  return { ...save, letters: { ...save.letters, [id]: status } };
}

/** The letter whose objective is to build this machine, if any. */
function buildLetterOf(blueprintId: MachineId): LetterId | undefined {
  return LETTER_IDS.find((id) => {
    const o = LETTERS[id].objective;
    return o.type === 'build_and_run' && o.blueprintId === blueprintId;
  });
}

function machineOf(save: SaveV1, blueprintId: MachineId): MachineRecord | undefined {
  return save.machines.find((m) => m.blueprintId === blueprintId);
}

function withMachine(save: SaveV1, record: MachineRecord): SaveV1 {
  const rest = save.machines.filter((m) => m.blueprintId !== record.blueprintId);
  return { ...save, machines: [...rest, record] };
}

/**
 * Applies each letter's unlock rule (`LETTERS[id].unlock`): a locked letter becomes available once the letter it names
 * is completed. Idempotent. Runs inside every transition that can complete a letter, and once after loading a save (for
 * instance when the Clock Tower has been switched on since the save was written). One pass in story order is enough,
 * because a rule reads "completed" and this only ever writes "available".
 */
export function settle(save: SaveV1, options: ProgressionOptions = DEFAULT_PROGRESSION): SaveV1 {
  let next = save;
  for (const id of letterSequence(options)) {
    const rule = LETTERS[id].unlock;
    if (next.letters[id] === 'locked' && rule.type === 'letter_completed' && next.letters[rule.letterId] === 'completed') {
      next = withLetter(next, id, 'available');
    }
  }
  return next;
}

/** The trunk opened: the letters that unlock on it become available (PRODUCT_SPEC §3.3; GAMEPLAY_SYSTEMS §4.1). */
export function trunkOpened(save: SaveV1, options: ProgressionOptions = DEFAULT_PROGRESSION): SaveV1 {
  let next = save;
  for (const id of letterSequence(options)) {
    if (LETTERS[id].unlock.type === 'trunk_opened' && next.letters[id] === 'locked') next = withLetter(next, id, 'available');
  }
  return next === save ? save : settle(next, options);
}

export function canAcceptLetter(save: SaveV1, letterId: LetterId): boolean {
  return save.letters[letterId] === 'available';
}

/** The player accepted an available letter (PRODUCT_SPEC §3.4). Starts the build or repair. */
export function acceptLetter(save: SaveV1, letterId: LetterId): SaveV1 {
  return canAcceptLetter(save, letterId) ? withLetter(save, letterId, 'accepted') : save;
}

/**
 * A machine was built and ran correctly (GAMEPLAY_SYSTEMS §13 "built and run"). Only a machine whose letter the player
 * has taken can be built, so a placement can never get ahead of its letter and strand it.
 */
export function machineBuilt(save: SaveV1, blueprintId: MachineId): SaveV1 {
  const letterId = buildLetterOf(blueprintId);
  if (letterId === undefined || !letterReached(save, letterId, 'accepted')) return save;
  const existing = machineOf(save, blueprintId);
  if (existing?.built) return save;
  return withMachine(save, existing ? { ...existing, built: true } : { blueprintId, built: true, placed: false });
}

export function canPlaceMachine(save: SaveV1, blueprintId: MachineId, plotId: PlotId): boolean {
  return MACHINE_PLOT[blueprintId] === plotId && machineOf(save, blueprintId)?.built === true;
}

/**
 * A built machine was committed to a plot (GAMEPLAY_SYSTEMS §13: "not placed until a valid placement is committed").
 * Only the machine's own plot accepts it (TOCKTON_DIMENSIONS §3.4). Completes its build letter and unlocks the next.
 * Placing an already placed machine again, as after a repair, changes nothing.
 */
export function machinePlaced(save: SaveV1, blueprintId: MachineId, plotId: PlotId, options: ProgressionOptions = DEFAULT_PROGRESSION): SaveV1 {
  if (!canPlaceMachine(save, blueprintId, plotId)) return save;
  const existing = machineOf(save, blueprintId);
  if (!existing || existing.placed) return save;
  let next = withMachine(save, { ...existing, placed: true, plotId });
  const letterId = buildLetterOf(blueprintId);
  if (letterId !== undefined && next.letters[letterId] === 'accepted') next = withLetter(next, letterId, 'completed');
  return settle(next, options);
}

/** A story repair ran correctly with the right part (GAMEPLAY_SYSTEMS §12). Completes its letter and unlocks the next. */
export function repairVerified(save: SaveV1, repairId: RepairId, options: ProgressionOptions = DEFAULT_PROGRESSION): SaveV1 {
  const repair = REPAIRS[repairId];
  if (repair === undefined || save.letters[repair.letterId] !== 'accepted') return save;
  return settle(withLetter(save, repair.letterId, 'completed'), options);
}

/** The letter the player should be working on: the first one that is available or accepted. */
export function activeLetter(save: SaveV1, options: ProgressionOptions = DEFAULT_PROGRESSION): LetterDef | null {
  const id = letterSequence(options).find((l) => save.letters[l] === 'available' || save.letters[l] === 'accepted');
  return id === undefined ? null : LETTERS[id];
}

/** True once every letter of this build is completed. */
export function storyComplete(save: SaveV1, options: ProgressionOptions = DEFAULT_PROGRESSION): boolean {
  const sequence = letterSequence(options);
  return save.letters[sequence[sequence.length - 1]] === 'completed';
}

/** The closing card text once the story is complete, otherwise null (PRODUCT_SPEC §7). */
export function closingCard(save: SaveV1, options: ProgressionOptions = DEFAULT_PROGRESSION): string | null {
  return storyComplete(save, options) ? CLOSING_CARD : null;
}

/** Machines standing in the town. Gifting starts from the town (see modes.ts), so these are what can be gifted. */
export function giftableMachines(save: SaveV1): readonly MachineId[] {
  return save.machines.filter((m) => m.placed).map((m) => m.blueprintId);
}

/** The ribbon icon shows only when this is true (PRODUCT_SPEC §13; GAMEPLAY_SYSTEMS §16.1). */
export function canGift(save: SaveV1): boolean {
  return letterReached(save, GATES.gift.letterId, GATES.gift.status) && giftableMachines(save).length > 0;
}
