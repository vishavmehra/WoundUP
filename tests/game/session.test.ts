import { describe, expect, it } from 'vitest';
import { CLOSING_CARD } from '../../src/game/content';
import { dateKey } from '../../src/game/date';
import { GameSession } from '../../src/game/session';
import { parseSave, SAVE_KEY } from '../../src/game/save';
import { FakeStorage } from './helpers';

const TODAY = '2026-11-14';

/** One accepted command: it must return true. */
function ok(accepted: boolean, what: string): void {
  expect(accepted, what).toBe(true);
}

/** Letter 1 to Letter n done through the real commands. */
function playUntil(game: GameSession, lastLetter: 1 | 2 | 3 | 4 | 5): void {
  const build = (n: number, machine: 'music_box' | 'carousel' | 'windmill', plot: 'plot_music_box' | 'plot_carousel' | 'plot_windmill') => {
    ok(game.acceptLetter(`letter_${n}` as 'letter_1'), `accept ${n}`);
    ok(game.assemblyComplete(), `assembled ${n}`);
    ok(game.machineRanCorrectly(machine), `ran ${n}`);
    ok(game.machinePlaced(machine, plot), `placed ${n}`);
  };
  const repair = (n: number, id: 'worn_spring' | 'wrong_gear', machine: 'music_box' | 'windmill', plot: 'plot_music_box' | 'plot_windmill') => {
    ok(game.acceptLetter(`letter_${n}` as 'letter_2'), `accept ${n}`);
    ok(game.assemblyComplete(), `assembled ${n}`);
    ok(game.repairVerified(id), `repaired ${n}`);
    ok(game.machineRanCorrectly(machine), `ran ${n}`);
    ok(game.machinePlaced(machine, plot), `placed ${n}`);
  };
  ok(game.openTrunk(), 'trunk');
  build(1, 'music_box', 'plot_music_box');
  if (lastLetter >= 2) repair(2, 'worn_spring', 'music_box', 'plot_music_box');
  if (lastLetter >= 3) build(3, 'carousel', 'plot_carousel');
  if (lastLetter >= 4) build(4, 'windmill', 'plot_windmill');
  if (lastLetter >= 5) repair(5, 'wrong_gear', 'windmill', 'plot_windmill');
}

describe('GameSession: the core loop', () => {
  it('starts a new player at the trunk introduction with no letter', () => {
    const game = new GameSession({ storage: new FakeStorage() });
    expect(game.mode).toBe('intro');
    expect(game.loadStatus).toBe('fresh');
    expect(game.letter).toBeNull();
    expect(game.closing).toBeNull();
  });

  it('walks the first machine from the trunk to a woken plot, one legal step at a time', () => {
    const game = new GameSession({ storage: new FakeStorage() });
    ok(game.openTrunk(), 'open the trunk');
    expect([game.mode, game.letter?.id, game.save.letters.letter_1]).toEqual(['town', 'letter_1', 'available']);
    ok(game.acceptLetter('letter_1'), 'accept');
    expect([game.mode, game.save.letters.letter_1]).toEqual(['build', 'accepted']);
    ok(game.assemblyComplete(), 'assembly complete');
    expect(game.mode).toBe('wind');
    ok(game.machineRanCorrectly('music_box'), 'machine ran');
    expect(game.mode).toBe('place');
    expect(game.save.machines).toEqual([{ blueprintId: 'music_box', built: true, placed: false }]);
    expect(game.save.letters.letter_1).toBe('accepted'); // run, but not placed yet
    ok(game.machinePlaced('music_box', 'plot_music_box'), 'placed');
    expect(game.mode).toBe('town');
    expect(game.save.letters).toMatchObject({ letter_1: 'completed', letter_2: 'available' });
    expect(game.letter?.id).toBe('letter_2');
  });

  it('refuses commands that are not legal right now, and changes nothing', () => {
    const storage = new FakeStorage();
    const game = new GameSession({ storage });
    expect(game.acceptLetter('letter_1')).toBe(false); // intro, letter locked
    expect(game.assemblyComplete()).toBe(false);
    expect(game.machineRanCorrectly('music_box')).toBe(false);
    expect(game.machinePlaced('music_box', 'plot_music_box')).toBe(false);
    expect(game.openGift()).toBe(false);
    expect(game.resume()).toBe(false);
    ok(game.openTrunk(), 'trunk');
    expect(game.openTrunk()).toBe(false); // twice
    expect(game.acceptLetter('letter_2')).toBe(false); // locked
    expect(game.machinePlaced('music_box', 'plot_music_box')).toBe(false); // never built
    ok(game.acceptLetter('letter_1'), 'accept');
    expect(game.acceptLetter('letter_1')).toBe(false); // already building
    ok(game.assemblyComplete(), 'assembled');
    ok(game.machineRanCorrectly('music_box'), 'ran');
    expect(game.machinePlaced('music_box', 'plot_carousel')).toBe(false); // someone else's plot
    expect(game.mode).toBe('place');
    expect(game.save.letters.letter_1).toBe('accepted');
    expect(storage.writes).toBe(3); // trunk, accept, built. The refusals wrote nothing.
  });

  it('sends a wrong or jammed machine back to Build and lets the player try again', () => {
    const game = new GameSession({ storage: null });
    ok(game.openTrunk(), 'trunk');
    ok(game.acceptLetter('letter_1'), 'accept');
    ok(game.assemblyComplete(), 'assembled');
    ok(game.backToBuild(), 'back');
    expect(game.mode).toBe('build');
    ok(game.assemblyComplete(), 'assembled again');
    expect(game.mode).toBe('wind');
  });

  it('plays the whole story to the closing card without the daily repair (DAILY-05)', () => {
    const game = new GameSession({ storage: null });
    playUntil(game, 5);
    expect(game.save.dailyDone).toBeNull();
    expect(game.closing).toBe(CLOSING_CARD);
    expect(game.letter).toBeNull();
    expect(game.mode).toBe('town');
  });

  it('shows Letter 6 and moves the closing card behind it when the Clock Tower is on', () => {
    const game = new GameSession({ storage: null, progression: { clockTower: true } });
    playUntil(game, 5);
    expect(game.closing).toBeNull();
    expect(game.letter?.id).toBe('letter_6');
    ok(game.acceptLetter('letter_6'), 'accept 6');
    ok(game.assemblyComplete(), 'assembled');
    ok(game.machineRanCorrectly('clock_tower'), 'ran');
    ok(game.machinePlaced('clock_tower', 'plot_clock_tower'), 'placed');
    expect(game.closing).toBe(CLOSING_CARD);
  });
});

describe('GameSession: saving (SAVE_PERSISTENCE_SPEC §6)', () => {
  it('writes once per meaningful change and never otherwise', () => {
    const storage = new FakeStorage();
    const game = new GameSession({ storage });
    ok(game.townPlaced(), 'town placed');
    expect(game.townPlaced()).toBe(false); // already placed: no write
    ok(game.openTrunk(), 'trunk');
    ok(game.acceptLetter('letter_1'), 'accept');
    ok(game.assemblyComplete(), 'assembled'); // a mode change only
    ok(game.machineRanCorrectly('music_box'), 'ran'); // built
    ok(game.pause(), 'pause');
    ok(game.resume(), 'resume');
    ok(game.machinePlaced('music_box', 'plot_music_box'), 'placed'); // placed and letter completed in one write
    expect(storage.writes).toBe(5);
    ok(game.setSetting('easySnap', true), 'setting');
    expect(game.setSetting('easySnap', true)).toBe(false); // unchanged
    expect(storage.writes).toBe(6);
    for (let frame = 0; frame < 500; frame++) game.can('pause'); // reading state is free
    expect(storage.writes).toBe(6);
  });

  it('restores progress after a reload', () => {
    const storage = new FakeStorage();
    const first = new GameSession({ storage });
    playUntil(first, 3);
    first.townPlaced();
    first.setSetting('gazeMode', true);

    const second = new GameSession({ storage });
    expect(second.loadStatus).toBe('loaded');
    expect(second.save).toEqual(first.save);
    expect(second.mode).toBe('town'); // the trunk plays once
    expect(second.letter?.id).toBe('letter_4');
    expect(second.save.townPlaced).toBe(true);
    expect(second.save.settings.gazeMode).toBe(true);
    ok(second.acceptLetter('letter_4'), 'carry on');
  });

  it('resumes a half-finished letter from the town, not from a half-built machine', () => {
    const storage = new FakeStorage();
    const first = new GameSession({ storage });
    ok(first.openTrunk(), 'trunk');
    ok(first.acceptLetter('letter_1'), 'accept');
    const second = new GameSession({ storage });
    expect(second.mode).toBe('town');
    expect(second.save.letters.letter_1).toBe('accepted');
    expect(second.letter?.id).toBe('letter_1');
  });

  it('lets a reloaded player start the accepted letter again, writing nothing and finishing it normally', () => {
    const storage = new FakeStorage();
    const first = new GameSession({ storage });
    ok(first.openTrunk(), 'trunk');
    ok(first.acceptLetter('letter_1'), 'accept');
    const second = new GameSession({ storage });
    const writes = storage.writes;
    ok(second.acceptLetter('letter_1'), 'take it up again');
    expect([second.mode, second.save.letters.letter_1]).toEqual(['build', 'accepted']);
    expect(storage.writes).toBe(writes); // progression did not change, so nothing is saved
    expect(second.acceptLetter('letter_1')).toBe(false); // already building
    expect(second.acceptLetter('letter_3')).toBe(false); // locked letters stay locked
    ok(second.assemblyComplete(), 'assembled');
    ok(second.machineRanCorrectly('music_box'), 'ran');
    ok(second.machinePlaced('music_box', 'plot_music_box'), 'placed');
    expect(second.save.letters).toMatchObject({ letter_1: 'completed', letter_2: 'available' });
  });

  it('does not reopen a completed letter', () => {
    const game = new GameSession({ storage: null });
    playUntil(game, 1);
    expect(game.acceptLetter('letter_1')).toBe(false);
    expect(game.mode).toBe('town');
  });

  it('keeps running on memory when storage fails, and says so', () => {
    const storage = new FakeStorage();
    storage.failSet = true;
    const game = new GameSession({ storage });
    expect(game.persisted).toBe(true); // nothing has failed yet
    ok(game.openTrunk(), 'trunk');
    expect(game.persisted).toBe(false);
    expect(game.save.letters.letter_1).toBe('available');
    storage.failSet = false;
    ok(game.acceptLetter('letter_1'), 'accept');
    expect(game.persisted).toBe(true);
    expect(parseSave(storage.data.get(SAVE_KEY) ?? null).save.letters.letter_1).toBe('accepted');
  });

  it('survives storage that cannot even be read', () => {
    const storage = new FakeStorage();
    storage.failGet = storage.failSet = storage.failRemove = true;
    const game = new GameSession({ storage });
    expect(game.mode).toBe('intro');
    ok(game.openTrunk(), 'trunk');
    ok(game.pause(), 'pause');
    ok(game.requestRestart(), 'request');
    ok(game.confirmRestart(), 'confirm');
    expect(game.mode).toBe('intro');
  });

  it('starts fresh from corrupt data and leaves a newer save untouched until a confirmed restart', () => {
    const corrupt = new GameSession({ storage: new FakeStorage({ [SAVE_KEY]: '{oops' }) });
    expect(corrupt.loadStatus).toBe('corrupt');
    expect(corrupt.mode).toBe('intro');

    const newer = JSON.stringify({ version: 2, future: true });
    const storage = new FakeStorage({ [SAVE_KEY]: newer });
    const game = new GameSession({ storage });
    expect(game.loadStatus).toBe('newer-version');
    ok(game.openTrunk(), 'play on in memory');
    expect(game.persisted).toBe(false);
    expect(storage.data.get(SAVE_KEY)).toBe(newer);
    ok(game.pause(), 'pause');
    ok(game.requestRestart(), 'request');
    ok(game.confirmRestart(), 'confirm');
    expect(storage.data.has(SAVE_KEY)).toBe(false);
    ok(game.openTrunk(), 'trunk again');
    expect(game.persisted).toBe(true);
  });
});

describe('GameSession: pause and restart (PRODUCT_SPEC §17, SAVE §12)', () => {
  it('pauses from Build and resumes to Build', () => {
    const game = new GameSession({ storage: null });
    ok(game.openTrunk(), 'trunk');
    ok(game.acceptLetter('letter_1'), 'accept');
    ok(game.pause(), 'pause');
    expect(game.mode).toBe('pause');
    expect(game.pause()).toBe(false);
    expect(game.acceptLetter('letter_1')).toBe(false);
    ok(game.resume(), 'resume');
    expect(game.mode).toBe('build');
  });

  it('deletes nothing until the second, deliberate step', () => {
    const storage = new FakeStorage();
    const game = new GameSession({ storage });
    playUntil(game, 2);
    const progress = game.save;
    expect(game.requestRestart()).toBe(false); // not paused
    expect(game.confirmRestart()).toBe(false);
    ok(game.pause(), 'pause');
    expect(game.confirmRestart()).toBe(false); // not requested
    ok(game.requestRestart(), 'request');
    expect(game.modeState.restartArmed).toBe(true);
    expect(game.save).toBe(progress);
    expect(storage.data.has(SAVE_KEY)).toBe(true);
    ok(game.cancelRestart(), 'cancel');
    expect(game.confirmRestart()).toBe(false);
    expect(storage.data.has(SAVE_KEY)).toBe(true);
    ok(game.requestRestart(), 'request again');
    ok(game.confirmRestart(), 'confirm');
    expect(game.mode).toBe('intro');
    expect(game.save.letters.letter_1).toBe('locked');
    expect(game.save.machines).toEqual([]);
    expect(storage.data.has(SAVE_KEY)).toBe(false);
  });

  it('keeps accessibility settings through a restart', () => {
    const storage = new FakeStorage();
    const game = new GameSession({ storage });
    playUntil(game, 1);
    game.setSetting('gazeMode', true);
    game.setSetting('easySnap', true);
    ok(game.pause(), 'pause');
    ok(game.requestRestart(), 'request');
    ok(game.confirmRestart(), 'confirm');
    expect(game.save.settings).toMatchObject({ gazeMode: true, easySnap: true });
    expect(game.save.letters.letter_1).toBe('locked');
    const reloaded = new GameSession({ storage });
    expect(reloaded.save.settings).toMatchObject({ gazeMode: true, easySnap: true });
    expect(reloaded.mode).toBe('intro');
  });
});

describe('GameSession: the gift gate', () => {
  it('opens the gift panel only from the town, after Letter 2 is completed (PRODUCT_SPEC §13)', () => {
    const game = new GameSession({ storage: null });
    playUntil(game, 1);
    expect(game.giftAvailable).toBe(false);
    expect(game.openGift()).toBe(false);
    ok(game.acceptLetter('letter_2'), 'accept 2');
    ok(game.assemblyComplete(), 'assembled');
    ok(game.repairVerified('worn_spring'), 'repaired');
    expect(game.openGift()).toBe(false); // Wind is not the town
    ok(game.machineRanCorrectly('music_box'), 'ran');
    ok(game.machinePlaced('music_box', 'plot_music_box'), 'placed back');
    expect(game.giftAvailable).toBe(true);
    ok(game.openGift(), 'open gift');
    expect(game.mode).toBe('gift');
    expect(game.acceptLetter('letter_3')).toBe(false);
    ok(game.closeGift(), 'close gift');
    expect(game.mode).toBe('town');
  });

  it('does not change the save when a gift is opened and closed', () => {
    const storage = new FakeStorage();
    const game = new GameSession({ storage });
    playUntil(game, 2);
    const writes = storage.writes;
    const before = game.save;
    ok(game.openGift(), 'open');
    ok(game.closeGift(), 'close');
    expect(game.save).toBe(before);
    expect(storage.writes).toBe(writes);
  });
});

describe('GameSession: the daily repair', () => {
  it('is offered once Letter 5 is done, runs through Build, Wind and Place, and is done for the date', () => {
    const storage = new FakeStorage();
    const game = new GameSession({ storage });
    playUntil(game, 4);
    expect(game.dailyRepair(TODAY)).toBeNull();
    expect(game.beginDailyRepair(TODAY)).toBe(false);
    ok(game.acceptLetter('letter_5'), 'accept 5');
    ok(game.assemblyComplete(), 'assembled');
    ok(game.repairVerified('wrong_gear'), 'repaired');
    ok(game.machineRanCorrectly('windmill'), 'ran');
    ok(game.machinePlaced('windmill', 'plot_windmill'), 'placed');

    const repair = game.dailyRepair(TODAY);
    expect(repair).not.toBeNull();
    expect(game.dailyRepair(TODAY)).toBe(repair);
    ok(game.beginDailyRepair(TODAY), 'begin');
    expect(game.mode).toBe('build');
    ok(game.assemblyComplete(), 'assembled');
    ok(game.dailyRepairVerified(TODAY), 'daily verified');
    expect(game.save.dailyDone).toBe(TODAY);
    expect(game.dailyRepairVerified(TODAY)).toBe(false); // once per date
    ok(game.machineRanCorrectly('windmill'), 'ran');
    ok(game.machinePlaced('windmill', 'plot_windmill'), 'back in place');
    expect(game.mode).toBe('town');
    expect(game.dailyRepair(TODAY)).toBeNull();
    expect(game.beginDailyRepair(TODAY)).toBe(false);

    expect(new GameSession({ storage }).dailyRepair(TODAY)).toBeNull(); // survives a reload
    expect(new GameSession({ storage }).dailyRepair('2026-11-15')).not.toBeNull();
  });

  it('cannot be completed outside Wind or Place, or before it was offered', () => {
    const game = new GameSession({ storage: null });
    playUntil(game, 5);
    expect(game.dailyRepairVerified(TODAY)).toBe(false); // in the town
    const early = new GameSession({ storage: null });
    ok(early.openTrunk(), 'trunk');
    ok(early.acceptLetter('letter_1'), 'accept');
    ok(early.assemblyComplete(), 'assembled');
    expect(early.dailyRepairVerified(TODAY)).toBe(false); // not offered yet
    expect(early.save.dailyDone).toBeNull();
  });

  it('reads the date from the caller: the local date helper agrees with the saved value', () => {
    const game = new GameSession({ storage: null });
    playUntil(game, 5);
    const today = dateKey(new Date(2026, 10, 14, 23, 59));
    ok(game.beginDailyRepair(today), 'begin');
    ok(game.assemblyComplete(), 'assembled');
    ok(game.dailyRepairVerified(today), 'verified');
    expect(game.save.dailyDone).toBe('2026-11-14');
  });
});

// ---- Architecture rules from CLAUDE.md §11 and SAVE_PERSISTENCE_SPEC §2, §13 ---------------------------------------------

describe('module boundaries', () => {
  // Vite inlines each source file as text, so this needs no Node typings.
  const raw = import.meta.glob('../../src/game/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const sources = Object.entries(raw).map(([path, code]) => ({ name: path.slice(path.lastIndexOf('/') + 1), code }));
  const importsOf = (code: string) => [...code.matchAll(/^\s*(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);

  it('has the files this test expects, so the scan below is not vacuous', () => {
    expect(sources.map((s) => s.name).sort()).toEqual(['content.ts', 'daily.ts', 'date.ts', 'gift.ts', 'index.ts', 'modes.ts', 'progression.ts', 'save.ts', 'session.ts', 'store.ts']);
  });

  it('imports no rendering, no three and no IWSDK, and nothing outside the game folder', () => {
    for (const { name, code } of sources) {
      for (const from of importsOf(code)) {
        expect(from.startsWith('./'), `${name} imports ${from}`).toBe(true);
      }
    }
  });

  it('touches localStorage only in the save store', () => {
    for (const { name, code } of sources) {
      const stripped = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(/\b(localStorage|sessionStorage|indexedDB)\b/.test(stripped), name).toBe(name === 'store.ts');
    }
  });

  it('keeps the gift codec away from the save, so a gift can never alter the recipient\'s progress', () => {
    const gift = sources.find((s) => s.name === 'gift.ts')?.code ?? '';
    expect(importsOf(gift)).toEqual(['./content']);
    expect(gift).not.toMatch(/localStorage|SAVE_KEY|woundup\.save/);
  });

  it('keeps the pure rules free of storage and the clock', () => {
    for (const name of ['content.ts', 'daily.ts', 'date.ts', 'modes.ts', 'progression.ts', 'save.ts']) {
      const code = (sources.find((s) => s.name === name)?.code ?? '').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, name).not.toMatch(/Date\.now|new Date\(\)|performance\.now|Math\.random|setTimeout/);
    }
  });
});
