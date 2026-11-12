import { describe, expect, it } from 'vitest';
import { LETTER_IDS } from '../../src/game/content';
import {
  DEFAULT_SETTINGS,
  freshSave,
  MAX_SAVE_CHARS,
  migrateSave,
  parseSave,
  SAVE_KEY,
  SAVE_VERSION,
  serializeSave,
  validateSave,
} from '../../src/game/save';
import { deepFreeze, playStory } from './helpers';

/** A valid save as raw JSON-ish data, to be broken one field at a time. */
const valid = (): Record<string, unknown> => JSON.parse(serializeSave(playStory()));
const withField = (key: string, value: unknown) => ({ ...valid(), [key]: value });
const reject = (data: unknown) => {
  const r = parseSave(typeof data === 'string' ? data : JSON.stringify(data));
  expect(r.status).toBe('corrupt');
  expect(r.save).toEqual(freshSave());
  expect(typeof r.reason).toBe('string');
};

describe('SaveV1 basics', () => {
  it('uses the specified key and version', () => {
    expect(SAVE_KEY).toBe('woundup.save');
    expect(SAVE_VERSION).toBe(1);
    expect(freshSave().version).toBe(1);
  });

  it('creates a valid fresh save for a new player, as a new object each time', () => {
    const a = freshSave();
    expect(validateSave(a).ok).toBe(true);
    expect(a.townPlaced).toBe(false);
    expect(a.dailyDone).toBeNull();
    expect(a.machines).toEqual([]);
    expect(Object.keys(a.letters)).toEqual([...LETTER_IDS]);
    expect(a.settings).toEqual(DEFAULT_SETTINGS);
    expect(freshSave()).not.toBe(a);
    expect(freshSave().settings).not.toBe(a.settings);
  });

  it('has exactly the fields PRODUCT_SPEC §14 requires', () => {
    expect(Object.keys(freshSave()).sort()).toEqual(['dailyDone', 'letters', 'machines', 'settings', 'townPlaced', 'version']);
    expect(Object.keys(freshSave().settings).sort()).toEqual(['easySnap', 'gazeMode', 'night', 'xrayHint']);
  });
});

describe('loading', () => {
  it('treats nothing stored as a new player ("migration from nothing")', () => {
    const r = parseSave(null);
    expect(r.status).toBe('fresh');
    expect(r.save).toEqual(freshSave());
  });

  it('round-trips a played save exactly', () => {
    const played = playStory();
    const r = parseSave(serializeSave(played));
    expect(r.status).toBe('loaded');
    expect(r.save).toEqual(played);
  });

  it('keeps letters, built and placed machines, daily completion and settings across a reload', () => {
    const played = {
      ...playStory(),
      townPlaced: true,
      dailyDone: '2026-11-14',
      settings: { easySnap: true, gazeMode: true, xrayHint: false, night: true },
    };
    const r = parseSave(serializeSave(played));
    expect(r.status).toBe('loaded');
    expect(r.save.townPlaced).toBe(true);
    expect(r.save.dailyDone).toBe('2026-11-14');
    expect(r.save.settings).toEqual({ easySnap: true, gazeMode: true, xrayHint: false, night: true });
    expect(r.save.letters.letter_5).toBe('completed');
    expect(r.save.machines.find((m) => m.blueprintId === 'windmill')).toEqual({ blueprintId: 'windmill', built: true, placed: true, plotId: 'plot_windmill' });
  });

  it('defaults a missing settings object and missing individual settings (SAVE §4.5)', () => {
    const noSettings = valid();
    delete noSettings.settings;
    expect(parseSave(JSON.stringify(noSettings)).save.settings).toEqual(DEFAULT_SETTINGS);
    const partial = { ...valid(), settings: { gazeMode: true } };
    expect(parseSave(JSON.stringify(partial)).save.settings).toEqual({ ...DEFAULT_SETTINGS, gazeMode: true });
  });

  it('treats a letter missing from the map as still locked', () => {
    const data = { ...valid(), letters: { letter_1: 'available' } };
    const r = parseSave(JSON.stringify(data));
    expect(r.status).toBe('loaded');
    expect(r.save.letters.letter_1).toBe('available');
    expect(r.save.letters.letter_2).toBe('locked');
  });
});

describe('rejecting corrupt or foreign data (SAVE §9)', () => {
  it.each([
    ['empty string', ''],
    ['not JSON', 'not json at all'],
    ['truncated JSON', '{"version":1,"townPla'],
    ['a JSON string', '"woundup"'],
    ['a number', '42'],
    ['null', 'null'],
    ['an array', '[1,2,3]'],
    ['an empty object', '{}'],
    ['another app\'s object', '{"theme":"dark","user":{"name":"x"}}'],
  ])('falls back to a fresh save for %s', (_name, raw) => reject(raw));

  it.each([
    ['version 0', withField('version', 0)],
    ['version as text', withField('version', '1')],
    ['fractional version', withField('version', 1.5)],
    ['negative version', withField('version', -1)],
    ['missing version', (() => { const d = valid(); delete d.version; return d; })()],
    ['townPlaced as text', withField('townPlaced', 'yes')],
    ['letters as array', withField('letters', ['letter_1'])],
    ['letters as null', withField('letters', null)],
    ['unknown letter id', withField('letters', { ...(valid().letters as object), letter_99: 'completed' })],
    ['invalid letter status', withField('letters', { ...(valid().letters as object), letter_1: 'done' })],
    ['letter status as number', withField('letters', { ...(valid().letters as object), letter_1: 3 })],
    ['letters out of order', withField('letters', { letter_1: 'locked', letter_2: 'accepted' })],
    ['machines as object', withField('machines', {})],
    ['too many machines', withField('machines', Array.from({ length: 5 }, () => ({ blueprintId: 'music_box', built: true, placed: false })))],
    ['machine as string', withField('machines', ['music_box'])],
    ['unknown blueprint', withField('machines', [{ blueprintId: 'steam_engine', built: true, placed: false }])],
    ['duplicate machine', withField('machines', [{ blueprintId: 'music_box', built: true, placed: false }, { blueprintId: 'music_box', built: true, placed: false }])],
    ['machine flags as text', withField('machines', [{ blueprintId: 'music_box', built: 'true', placed: false }])],
    ['placed but not built', withField('machines', [{ blueprintId: 'music_box', built: false, placed: true, plotId: 'plot_music_box' }])],
    ['placed without a plot', withField('machines', [{ blueprintId: 'music_box', built: true, placed: true }])],
    ['unknown plot', withField('machines', [{ blueprintId: 'music_box', built: true, placed: true, plotId: 'plot_moon' }])],
    ['machine on another machine\'s plot', withField('machines', [{ blueprintId: 'music_box', built: true, placed: true, plotId: 'plot_carousel' }])],
    ['plot without placement', withField('machines', [{ blueprintId: 'music_box', built: true, placed: false, plotId: 'plot_music_box' }])],
    ['dailyDone as number', withField('dailyDone', 20261114)],
    ['dailyDone as undefined', (() => { const d = valid(); delete d.dailyDone; return d; })()],
    ['dailyDone not a date', withField('dailyDone', 'yesterday')],
    ['dailyDone impossible date', withField('dailyDone', '2026-02-30')],
    ['dailyDone unpadded', withField('dailyDone', '2026-1-5')],
    ['settings as array', withField('settings', [])],
    ['setting as text', withField('settings', { ...DEFAULT_SETTINGS, easySnap: 'on' })],
  ])('rejects a save with %s', (_name, data) => reject(data));

  it('rejects an oversized value without parsing it', () => {
    const huge = JSON.stringify({ ...valid(), pad: 'x'.repeat(MAX_SAVE_CHARS) });
    const r = parseSave(huge);
    expect(r.status).toBe('corrupt');
    expect(r.reason).toBe('too large');
  });

  it('is not fooled by __proto__ or constructor keys, and pollutes nothing', () => {
    const raw = `{"__proto__":{"polluted":true},"version":1,"townPlaced":false,"letters":{"__proto__":"completed"},"machines":[],"dailyDone":null}`;
    expect(parseSave(raw).status).toBe('corrupt'); // an unknown letter id
    const raw2 = `{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"version":1,"townPlaced":false,"letters":{},"machines":[],"dailyDone":null}`;
    const r = parseSave(raw2);
    expect(r.status).toBe('loaded'); // unknown top-level keys are dropped, not interpreted
    expect(Object.keys(r.save).sort()).toEqual(['dailyDone', 'letters', 'machines', 'settings', 'townPlaced', 'version']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((r.save as unknown as Record<string, unknown>).polluted).toBeUndefined();
    reject(`{"version":1,"townPlaced":false,"letters":{},"machines":[{"__proto__":{"blueprintId":"music_box"}}],"dailyDone":null}`);
  });
});

describe('versions (SAVE §10)', () => {
  it('does not reinterpret a newer save: it reports it and starts fresh in memory', () => {
    const r = parseSave(JSON.stringify({ ...valid(), version: 2, somethingNew: true }));
    expect(r.status).toBe('newer-version');
    expect(r.save).toEqual(freshSave());
  });

  it('treats an older or unknown version number as unreadable, not newer', () => {
    expect(migrateSave({ ...valid(), version: 0 }).status).toBe('corrupt');
    expect(migrateSave({ ...valid(), version: 'two' }).status).toBe('corrupt');
  });
});

describe('validateSave', () => {
  it('returns a canonical copy and never the input, and does not mutate the input', () => {
    const input = deepFreeze({ ...valid(), extra: { nested: true } });
    const out = validateSave(input);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.save).not.toBe(input);
      expect('extra' in out.save).toBe(false);
    }
  });

  it('never throws on arbitrary input', () => {
    for (const junk of [undefined, null, 0, NaN, '', 'x', true, [], {}, () => 1, Symbol('s'), { version: 1 }, { version: 1, townPlaced: true, letters: null }]) {
      expect(() => validateSave(junk)).not.toThrow();
      expect(validateSave(junk).ok).toBe(false);
    }
  });
});
