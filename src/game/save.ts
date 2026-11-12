/**
 * SaveV1: the versioned shape stored under `woundup.save` (PRODUCT_SPEC §14; SAVE_PERSISTENCE_SPEC §3, §8 to §10), and
 * the validation that makes stored JSON safe to trust. Pure: no storage access here (that is store.ts).
 *
 * Where TECHNICAL_ARCHITECTURE §16 and SAVE_PERSISTENCE_SPEC §3 disagree on the shape, this follows
 * SAVE_PERSISTENCE_SPEC (machines as records, one `letters` map) and the daily repair field `dailyDone: string | null`
 * (ADR-027). The save holds ids and flags only: no coordinates, anchors, runtime objects or solver output (§5).
 */

import {
  isOneOf,
  LETTER_IDS,
  LETTER_STATUSES,
  MACHINE_IDS,
  MACHINE_PLOT,
  PLOT_IDS,
  type LetterId,
  type LetterStatus,
  type MachineId,
  type PlotId,
} from './content';
import { isDateKey } from './date';

export const SAVE_KEY = 'woundup.save';
export const SAVE_VERSION = 1;
/** A real save is a few hundred bytes. Anything near this size is not ours, so it is not even parsed. */
export const MAX_SAVE_CHARS = 16_384;

export interface MachineRecord {
  readonly blueprintId: MachineId;
  readonly built: boolean;
  readonly placed: boolean;
  /** Present exactly when `placed`, and always the machine's own plot. */
  readonly plotId?: PlotId;
}

export interface Settings {
  readonly easySnap: boolean;
  readonly gazeMode: boolean;
  readonly xrayHint: boolean;
  readonly night: boolean;
}

export interface SaveV1 {
  readonly version: 1;
  /** Whether the town has been placed on the table or stand. Never coordinates (SAVE §4.1). */
  readonly townPlaced: boolean;
  readonly letters: Readonly<Record<LetterId, LetterStatus>>;
  readonly machines: readonly MachineRecord[];
  /** Local date of the last completed daily repair, or null (ADR-027). */
  readonly dailyDone: string | null;
  readonly settings: Settings;
}

/**
 * Starting values for a missing or reset setting. The specifications list the four settings but not their defaults;
 * the X-ray hint starts on so it can teach the gesture before the player turns it off (PRODUCT_SPEC §17).
 */
export const DEFAULT_SETTINGS: Settings = { easySnap: false, gazeMode: false, xrayHint: true, night: false };

/** A new player's save: every letter locked, nothing built. A new object on every call. */
export function freshSave(): SaveV1 {
  const letters = {} as Record<LetterId, LetterStatus>;
  for (const id of LETTER_IDS) letters[id] = 'locked';
  return { version: SAVE_VERSION, townPlaced: false, letters, machines: [], dailyDone: null, settings: { ...DEFAULT_SETTINGS } };
}

export type ValidateResult = { readonly ok: true; readonly save: SaveV1 } | { readonly ok: false; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const bad = (reason: string): ValidateResult => ({ ok: false, reason });

/**
 * Checks untrusted data against SaveV1 and returns a fresh, canonical copy of it, or the first problem found.
 * Never throws and never returns the input object: known fields are copied one by one, so unknown keys (and
 * `__proto__` tricks) cannot reach the game. Reasons are fixed strings for developers, not player text.
 *
 * Whole-save rejection is deliberate: a record that cannot be restored safely means the data is corrupt or foreign
 * (SAVE_PERSISTENCE_SPEC §9), so the caller falls back to a fresh save rather than guessing.
 */
export function validateSave(data: unknown): ValidateResult {
  if (!isRecord(data)) return bad('not an object');
  if (data.version !== SAVE_VERSION) return bad('unsupported version');
  const townPlaced = data.townPlaced;
  if (typeof townPlaced !== 'boolean') return bad('townPlaced is not a boolean');

  // Letters: only known ids and statuses. A letter missing from the map is simply still locked.
  if (!isRecord(data.letters)) return bad('letters is not an object');
  const letters = freshSave().letters as Record<LetterId, LetterStatus>;
  for (const key of Object.keys(data.letters)) {
    if (!isOneOf(LETTER_IDS, key)) return bad('letters has an unknown id');
    const status = data.letters[key];
    if (!isOneOf(LETTER_STATUSES, status)) return bad('letters has an invalid status');
    letters[key] = status;
  }
  // Letters unlock one after another, so a letter past `locked` needs the one before it completed.
  for (let i = 1; i < LETTER_IDS.length; i++) {
    if (letters[LETTER_IDS[i]] !== 'locked' && letters[LETTER_IDS[i - 1]] !== 'completed') return bad('letters out of order');
  }

  // Machines: known blueprints, no duplicates, placed means built and on its own plot.
  if (!Array.isArray(data.machines) || data.machines.length > MACHINE_IDS.length) return bad('machines is not a short array');
  const machines: MachineRecord[] = [];
  for (const raw of data.machines as unknown[]) {
    if (!isRecord(raw)) return bad('machine is not an object');
    const { blueprintId, built, placed, plotId } = raw;
    if (!isOneOf(MACHINE_IDS, blueprintId)) return bad('machine has an unknown blueprint');
    if (machines.some((m) => m.blueprintId === blueprintId)) return bad('machine is listed twice');
    if (typeof built !== 'boolean' || typeof placed !== 'boolean') return bad('machine flags are not booleans');
    if (plotId !== undefined && !isOneOf(PLOT_IDS, plotId)) return bad('machine has an unknown plot');
    if (placed) {
      if (!built) return bad('machine is placed but not built');
      if (plotId !== MACHINE_PLOT[blueprintId]) return bad('machine is on the wrong plot');
      machines.push({ blueprintId, built, placed, plotId });
    } else {
      if (plotId !== undefined) return bad('machine has a plot but is not placed');
      machines.push({ blueprintId, built, placed });
    }
  }

  const dailyDone = data.dailyDone;
  if (dailyDone !== null && !isDateKey(dailyDone)) return bad('dailyDone is not a date or null');

  // Settings are defaulted when missing (SAVE §4.5) but a present value of the wrong type is corruption.
  const rawSettings = data.settings === undefined ? {} : data.settings;
  if (!isRecord(rawSettings)) return bad('settings is not an object');
  const settings: { -readonly [K in keyof Settings]: boolean } = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = rawSettings[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') return bad('a setting is not a boolean');
    settings[key] = value;
  }

  return { ok: true, save: { version: SAVE_VERSION, townPlaced, letters, machines, dailyDone, settings } };
}

/** The exact text stored under the save key. Callers validate first (store.ts does). */
export function serializeSave(save: SaveV1): string {
  return JSON.stringify(save);
}

export type LoadStatus =
  /** Nothing stored: a new player. */
  | 'fresh'
  | 'loaded'
  /** Malformed, foreign or invalid data: replaced by a fresh save in memory. Safe to overwrite. */
  | 'corrupt'
  /** Written by a newer build. Not reinterpreted, and the store will not overwrite it (SAVE §10). */
  | 'newer-version';

export interface LoadResult {
  readonly save: SaveV1;
  readonly status: LoadStatus;
  /** Developer diagnostic for `corrupt`. */
  readonly reason?: string;
}

/**
 * The one place a save from any version enters the game. SaveV1 is the only version so far, so there is nothing to
 * migrate yet; a future SaveV2 adds its upgrade step here, ahead of validation (SAVE_PERSISTENCE_SPEC §10).
 * "Migration from nothing" is the `fresh` result.
 */
export function migrateSave(data: unknown): LoadResult {
  if (isRecord(data) && typeof data.version === 'number' && Number.isInteger(data.version) && data.version > SAVE_VERSION) {
    return { save: freshSave(), status: 'newer-version' };
  }
  const checked = validateSave(data);
  return checked.ok ? { save: checked.save, status: 'loaded' } : { save: freshSave(), status: 'corrupt', reason: checked.reason };
}

/** Raw stored text (or null when absent) to a usable save. Never throws. */
export function parseSave(raw: string | null): LoadResult {
  if (raw === null) return { save: freshSave(), status: 'fresh' };
  if (typeof raw !== 'string' || raw.length > MAX_SAVE_CHARS) return { save: freshSave(), status: 'corrupt', reason: 'too large' };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { save: freshSave(), status: 'corrupt', reason: 'malformed JSON' };
  }
  return migrateSave(data);
}
