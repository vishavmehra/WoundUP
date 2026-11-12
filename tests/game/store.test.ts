import { describe, expect, it } from 'vitest';
import { freshSave, SAVE_KEY, serializeSave, type SaveV1 } from '../../src/game/save';
import { browserStorage, createSaveStore } from '../../src/game/store';
import { FakeStorage, playStory } from './helpers';

const played = () => playStory();
const changed = (): SaveV1 => ({ ...freshSave(), townPlaced: true });

describe('save store', () => {
  it('loads a new player when nothing is stored', () => {
    const r = createSaveStore(new FakeStorage()).load();
    expect(r.status).toBe('fresh');
    expect(r.save).toEqual(freshSave());
  });

  it('saves under woundup.save and loads the same state back', () => {
    const storage = new FakeStorage();
    expect(createSaveStore(storage).save(played())).toBe('saved');
    expect([...storage.data.keys()]).toEqual([SAVE_KEY]);
    const r = createSaveStore(storage).load();
    expect(r.status).toBe('loaded');
    expect(r.save).toEqual(played());
  });

  it('never writes the same state twice, so a per-frame call cannot hammer storage (SAVE §6, §15)', () => {
    const storage = new FakeStorage();
    const store = createSaveStore(storage);
    expect(store.save(changed())).toBe('saved');
    for (let frame = 0; frame < 200; frame++) expect(store.save(changed())).toBe('unchanged');
    expect(storage.writes).toBe(1);
    expect(store.save(played())).toBe('saved');
    expect(storage.writes).toBe(2);
  });

  it('does not rewrite what it just loaded', () => {
    const storage = new FakeStorage({ [SAVE_KEY]: serializeSave(played()) });
    const store = createSaveStore(storage);
    expect(store.load().status).toBe('loaded');
    expect(store.save(played())).toBe('unchanged');
    expect(storage.writes).toBe(0);
  });

  it('refuses to write data that fails validation', () => {
    const storage = new FakeStorage();
    const store = createSaveStore(storage);
    expect(store.save({ ...freshSave(), dailyDone: 'tomorrow' })).toBe('invalid');
    expect(store.save({ nonsense: true } as unknown as SaveV1)).toBe('invalid');
    expect(storage.writes).toBe(0);
  });

  describe('when storage fails (SAVE §11)', () => {
    it('starts fresh when reading throws', () => {
      const storage = new FakeStorage();
      storage.failGet = true;
      const r = createSaveStore(storage).load();
      expect(r.status).toBe('fresh');
    });

    it('keeps going in memory when writing throws, and tries again on the next real change', () => {
      const storage = new FakeStorage();
      storage.failSet = true;
      const store = createSaveStore(storage);
      expect(store.save(changed())).toBe('memory-only');
      expect(storage.writes).toBe(1);
      storage.failSet = false;
      expect(store.save(played())).toBe('saved');
      expect(storage.data.get(SAVE_KEY)).toBe(serializeSave(played()));
    });

    it('works with no storage at all and keeps a memory copy', () => {
      const store = createSaveStore(null);
      expect(store.save(played())).toBe('memory-only');
      expect(store.load().save).toEqual(played());
      expect(store.reset()).toBe(true);
      expect(store.load().status).toBe('fresh');
    });

    it('reads the memory copy when reading later throws', () => {
      const storage = new FakeStorage();
      const store = createSaveStore(storage);
      store.save(played());
      storage.failGet = true;
      expect(store.load().save).toEqual(played());
    });

    it('never throws, whatever storage does', () => {
      const storage = new FakeStorage();
      storage.failGet = storage.failSet = storage.failRemove = true;
      const store = createSaveStore(storage);
      expect(() => store.load()).not.toThrow();
      expect(() => store.save(played())).not.toThrow();
      expect(() => store.reset()).not.toThrow();
      expect(store.reset()).toBe(false);
    });

    it('survives a missing or blocked window.localStorage', () => {
      expect(() => browserStorage()).not.toThrow();
    });
  });

  describe('corrupt and newer data', () => {
    it('replaces a corrupt save with a fresh one and may overwrite it', () => {
      const storage = new FakeStorage({ [SAVE_KEY]: '{"version":1,' });
      const store = createSaveStore(storage);
      expect(store.load().status).toBe('corrupt');
      expect(store.save(played())).toBe('saved');
    });

    it('leaves a newer build\'s save alone until a confirmed restart', () => {
      const newer = JSON.stringify({ version: 2, shiny: 'new things' });
      const storage = new FakeStorage({ [SAVE_KEY]: newer });
      const store = createSaveStore(storage);
      expect(store.load().status).toBe('newer-version');
      expect(store.save(played())).toBe('blocked');
      expect(storage.data.get(SAVE_KEY)).toBe(newer);
      expect(store.reset()).toBe(true);
      expect(storage.data.has(SAVE_KEY)).toBe(false);
      expect(store.save(played())).toBe('saved');
    });
  });

  it('reset removes the key', () => {
    const storage = new FakeStorage();
    const store = createSaveStore(storage);
    store.save(played());
    expect(store.reset()).toBe(true);
    expect(storage.data.has(SAVE_KEY)).toBe(false);
    expect(store.load().status).toBe('fresh');
  });
});
