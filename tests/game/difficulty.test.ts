import { describe, expect, it } from 'vitest';
import { SAVE_KEY, parseSave } from '../../src/game/save';
import { GameSession } from '../../src/game/session';
import { FakeStorage } from './helpers';

// The build difficulty (ADR-050) is the one setting that is not a flag: chosen at the first build, changed in Pause, kept across a reload and a restart.

describe('GameSession.setDifficulty', () => {
  it('starts unchosen, saves a level and refuses the level it already has', () => {
    const storage = new FakeStorage();
    const game = new GameSession({ storage });
    expect(game.save.settings.difficulty).toBeNull();
    expect(game.setDifficulty('standard')).toBe(true);
    expect(game.save.settings.difficulty).toBe('standard');
    expect(parseSave(storage.data.get(SAVE_KEY) ?? null).save.settings.difficulty).toBe('standard');
    const writes = storage.writes;
    expect(game.setDifficulty('standard')).toBe(false); // unchanged: nothing written
    expect(storage.writes).toBe(writes);
  });

  it('changes level and leaves the other settings alone', () => {
    const game = new GameSession({ storage: new FakeStorage() });
    game.setSetting('easySnap', true);
    game.setDifficulty('relaxed');
    game.setDifficulty('master');
    expect(game.save.settings).toEqual({ easySnap: true, gazeMode: false, rayMode: false, xrayHint: true, night: false, difficulty: 'master' });
  });

  it('is there after a reload', () => {
    const storage = new FakeStorage();
    new GameSession({ storage }).setDifficulty('relaxed');
    expect(new GameSession({ storage }).save.settings.difficulty).toBe('relaxed');
  });

  it('survives a restart of the chapter, like the accessibility settings', () => {
    const storage = new FakeStorage();
    const game = new GameSession({ storage });
    game.setDifficulty('master');
    game.setSetting('gazeMode', true);
    expect(game.pause()).toBe(true);
    expect(game.requestRestart()).toBe(true);
    expect(game.confirmRestart()).toBe(true);
    expect(game.save.settings).toMatchObject({ difficulty: 'master', gazeMode: true });
    expect(new GameSession({ storage }).save.settings.difficulty).toBe('master');
  });

  it('is saved even when storage fails: the session keeps it in memory', () => {
    const storage = new FakeStorage();
    storage.failSet = true;
    const game = new GameSession({ storage });
    expect(game.setDifficulty('standard')).toBe(true);
    expect(game.save.settings.difficulty).toBe('standard');
    expect(game.persisted).toBe(false);
  });
});
