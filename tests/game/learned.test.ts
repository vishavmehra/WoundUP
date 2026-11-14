import { describe, expect, it } from 'vitest';
import { LESSON_IDS } from '../../src/game/content';
import { DEFAULT_SETTINGS, freshSave, parseSave, SAVE_KEY, serializeSave } from '../../src/game/save';
import { GameSession } from '../../src/game/session';
import { FakeStorage } from './helpers';

/** The ghost-hand lessons the player has done (PRODUCT_SPEC F15, §15) and the ray-mode setting (F17, §16) in the save. */

const OLD_SAVE = { version: 1, townPlaced: true, letters: { letter_1: 'completed', letter_2: 'available' }, machines: [], dailyDone: null, settings: { easySnap: true, gazeMode: false, xrayHint: true, night: false } };

describe('learned lessons and ray mode in the save', () => {
  it('a new player has learned nothing and ray mode is off', () => {
    expect(freshSave().learned).toEqual([]);
    expect(DEFAULT_SETTINGS.rayMode).toBe(false);
  });

  it('a save from before the ghost hands and ray mode loads untouched, with both at their defaults', () => {
    const loaded = parseSave(JSON.stringify(OLD_SAVE));
    expect(loaded.status).toBe('loaded');
    expect(loaded.save.learned).toEqual([]);
    expect(loaded.save.settings).toEqual({ ...DEFAULT_SETTINGS, easySnap: true });
    expect(loaded.save.letters.letter_2).toBe('available');
  });

  it('round-trips the learned list and the ray setting', () => {
    const save = { ...freshSave(), learned: ['latch', 'grab'] as const, settings: { ...DEFAULT_SETTINGS, rayMode: true } };
    const back = parseSave(serializeSave(save));
    expect(back.status).toBe('loaded');
    expect(back.save.learned).toEqual(['latch', 'grab']);
    expect(back.save.settings.rayMode).toBe(true);
  });

  it('keeps the lessons in the canonical order, once each, and drops names this build does not know', () => {
    const raw = JSON.stringify({ ...OLD_SAVE, learned: ['xray', 'grab', 'grab', 'a_lesson_from_a_newer_build', 'latch'] });
    const loaded = parseSave(raw);
    expect(loaded.status).toBe('loaded');
    expect(loaded.save.learned).toEqual(['latch', 'grab', 'xray']);
  });

  it.each([
    ['a string', 'grab'],
    ['an object', { grab: true }],
    ['a number', 3],
    ['null', null],
    ['an enormous list', Array.from({ length: 1000 }, () => 'grab')],
  ])('rejects a learned list that is %s', (_name, value) => {
    expect(parseSave(JSON.stringify({ ...OLD_SAVE, learned: value })).status).toBe('corrupt');
  });

  it('rejects a ray setting that is not a boolean', () => {
    expect(parseSave(JSON.stringify({ ...OLD_SAVE, settings: { ...OLD_SAVE.settings, rayMode: 'yes' } })).status).toBe('corrupt');
  });
});

describe('GameSession.learn', () => {
  it('records a lesson once, persists it and survives a reload', () => {
    const storage = new FakeStorage();
    const game = new GameSession({ storage });
    expect(game.learn('grab')).toBe(true);
    expect(game.learn('grab')).toBe(false); // already learned: nothing is written again
    expect(game.save.learned).toEqual(['grab']);
    expect(parseSave(storage.data.get(SAVE_KEY) ?? null).save.learned).toEqual(['grab']);
    const writes = storage.writes;
    game.learn('grab');
    expect(storage.writes).toBe(writes);
    expect(new GameSession({ storage }).save.learned).toEqual(['grab']);
  });

  it('keeps the canonical order whatever order the lessons are learned in', () => {
    const game = new GameSession({ storage: null });
    for (const lesson of ['xray', 'latch', 'wind']) game.learn(lesson as 'xray');
    expect(game.save.learned).toEqual(LESSON_IDS.filter((id) => ['xray', 'latch', 'wind'].includes(id)));
  });

  it('works in memory when storage is unavailable', () => {
    const game = new GameSession({ storage: null });
    expect(game.learn('latch')).toBe(true);
    expect(game.save.learned).toEqual(['latch']);
    expect(game.persisted).toBe(false);
  });

  it('a confirmed restart forgets the lessons (the introduction plays again) but keeps the settings', () => {
    const game = new GameSession({ storage: new FakeStorage() });
    game.setSetting('rayMode', true);
    game.learn('latch');
    expect(game.openTrunk()).toBe(true);
    expect(game.pause() && game.requestRestart() && game.confirmRestart()).toBe(true);
    expect(game.save.learned).toEqual([]);
    expect(game.save.settings.rayMode).toBe(true);
  });
});
