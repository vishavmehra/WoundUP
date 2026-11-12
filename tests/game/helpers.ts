import { acceptLetter, machineBuilt, machinePlaced, repairVerified, trunkOpened, type ProgressionOptions } from '../../src/game/progression';
import { freshSave, type SaveV1 } from '../../src/game/save';
import { MACHINE_PLOT, type LetterId, type MachineId, type RepairId } from '../../src/game/content';
import type { StorageLike } from '../../src/game/store';

/** A fake Web Storage that counts what it is asked to do and can be told to fail. */
export class FakeStorage implements StorageLike {
  data = new Map<string, string>();
  reads = 0;
  writes = 0;
  removes = 0;
  failGet = false;
  failSet = false;
  failRemove = false;

  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.data.set(k, v);
  }
  getItem(key: string): string | null {
    this.reads++;
    if (this.failGet) throw new Error('SecurityError');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes++;
    if (this.failSet) throw new Error('QuotaExceededError');
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.removes++;
    if (this.failRemove) throw new Error('SecurityError');
    this.data.delete(key);
  }
}

/** Freezes a value and everything inside it, so any mutation by the code under test throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/** Each step must change the save; returns the new one. */
export function advance(save: SaveV1, next: SaveV1): SaveV1 {
  if (next === save) throw new Error('expected the step to change the save');
  return next;
}

/** Accept a build letter, build its machine and place it on its plot. Every intermediate save is passed to `onStep`. */
export function buildAndPlace(save: SaveV1, letterId: LetterId, machine: MachineId, options?: ProgressionOptions, onStep?: (s: SaveV1) => void): SaveV1 {
  let s = save;
  for (const next of [
    (x: SaveV1) => acceptLetter(x, letterId),
    (x: SaveV1) => machineBuilt(x, machine),
    (x: SaveV1) => machinePlaced(x, machine, MACHINE_PLOT[machine], options),
  ]) {
    s = advance(s, next(s));
    onStep?.(s);
  }
  return s;
}

export function acceptAndRepair(save: SaveV1, letterId: LetterId, repairId: RepairId, options?: ProgressionOptions, onStep?: (s: SaveV1) => void): SaveV1 {
  let s = advance(save, acceptLetter(save, letterId));
  onStep?.(s);
  s = advance(s, repairVerified(s, repairId, options));
  onStep?.(s);
  return s;
}

/** The whole Tockton story through Letter 5 (and Letter 6 when the Clock Tower is on), with every intermediate save reported. */
export function playStory(options?: ProgressionOptions, onStep: (s: SaveV1) => void = () => undefined): SaveV1 {
  let s = freshSave();
  s = advance(s, trunkOpened(s, options));
  onStep(s);
  s = buildAndPlace(s, 'letter_1', 'music_box', options, onStep);
  s = acceptAndRepair(s, 'letter_2', 'worn_spring', options, onStep);
  s = buildAndPlace(s, 'letter_3', 'carousel', options, onStep);
  s = buildAndPlace(s, 'letter_4', 'windmill', options, onStep);
  s = acceptAndRepair(s, 'letter_5', 'wrong_gear', options, onStep);
  if (options?.clockTower) s = buildAndPlace(s, 'letter_6', 'clock_tower', options, onStep);
  return s;
}
