/**
 * The save service: the only code that touches localStorage (SAVE_PERSISTENCE_SPEC §2, §7, §11).
 *
 * Every storage access is wrapped in try/catch. If storage is missing, blocked or full, the game keeps running on its
 * in-memory state and the store keeps a memory copy (TECHNICAL_ARCHITECTURE §16). Writes happen only when a caller
 * asks, and an identical state is never written twice, so a per-frame call cannot hammer storage (SAVE §6, §15).
 */

import { parseSave, SAVE_KEY, serializeSave, validateSave, type LoadResult, type SaveV1 } from './save';

/** The slice of the Web Storage API the store uses, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** `window.localStorage`, or null. Even reading the property can throw (blocked cookies, sandboxed frames). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export type SaveOutcome =
  /** Written to storage. */
  | 'saved'
  /** Identical to what is already stored: nothing written. */
  | 'unchanged'
  /** Storage failed or is absent: the state lives in memory only. The UI may show a subtle warning (SAVE §11). */
  | 'memory-only'
  /** A newer build's save is stored; it is left alone until the player restarts on purpose. */
  | 'blocked'
  /** The data failed validation, which is a bug in the caller. Nothing was written. */
  | 'invalid';

export interface SaveStore {
  /** Reads and validates the stored save. Falls back to a fresh save and never throws. */
  load(): LoadResult;
  save(data: SaveV1): SaveOutcome;
  /** Clears the stored save. True when no stale data can remain. Callers confirm with the player first (SAVE §12). */
  reset(): boolean;
}

export function createSaveStore(storage: StorageLike | null = browserStorage()): SaveStore {
  let memory: string | null = null; // the latest state, kept even when storage fails
  let lastWritten: string | null = null; // the latest text known to be in storage
  let blocked = false;

  return {
    load() {
      let raw: string | null = memory;
      if (storage) {
        try {
          raw = storage.getItem(SAVE_KEY);
        } catch {
          raw = memory;
        }
      }
      const result = parseSave(raw);
      blocked = result.status === 'newer-version';
      lastWritten = result.status === 'loaded' ? raw : null;
      return result;
    },

    save(data) {
      if (blocked) return 'blocked';
      const checked = validateSave(data);
      if (!checked.ok) return 'invalid';
      const text = serializeSave(checked.save);
      if (text === lastWritten) return 'unchanged';
      memory = text;
      if (!storage) return 'memory-only';
      try {
        storage.setItem(SAVE_KEY, text);
      } catch {
        return 'memory-only'; // quota or privacy mode; the next real change tries again
      }
      lastWritten = text;
      return 'saved';
    },

    reset() {
      blocked = false;
      memory = null;
      lastWritten = null;
      if (!storage) return true;
      try {
        storage.removeItem(SAVE_KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
}
