import { describe, expect, it } from 'vitest';
import { REPAIR_IDS, REPAIRS } from '../../src/game/content';
import { completeDaily, DAILY_POOL, dailyOffer, dailyRepairFor } from '../../src/game/daily';
import { dateKey, dayNumber, isDateKey } from '../../src/game/date';
import { acceptLetter, trunkOpened } from '../../src/game/progression';
import { freshSave, parseSave, serializeSave, type SaveV1 } from '../../src/game/save';
import { acceptAndRepair, buildAndPlace, deepFreeze, playStory } from './helpers';

/** Saves on either side of Letter 5 (the gate), with Letters 1 to 4 done. */
function untilLetter5(): { accepted: SaveV1; completed: SaveV1 } {
  let s = trunkOpened(freshSave());
  s = buildAndPlace(s, 'letter_1', 'music_box');
  s = acceptAndRepair(s, 'letter_2', 'worn_spring');
  s = buildAndPlace(s, 'letter_3', 'carousel');
  s = buildAndPlace(s, 'letter_4', 'windmill');
  const accepted = acceptLetter(s, 'letter_5');
  return { accepted, completed: playStory() };
}

describe('daily repair (ADR-027, ACCEPTANCE_TESTS §5.1)', () => {
  const today = '2026-11-14';

  it('DAILY-01: is not offered before Letter 5 is done, and is offered after it', () => {
    const { accepted, completed } = untilLetter5();
    expect(dailyOffer(freshSave(), today)).toBeNull();
    expect(dailyOffer(trunkOpened(freshSave()), today)).toBeNull();
    expect(accepted.letters.letter_5).toBe('accepted');
    expect(dailyOffer(accepted, today)).toBeNull(); // Letter 5 reached but its repair not done
    expect(completed.letters.letter_5).toBe('completed');
    expect(dailyOffer(completed, today)).not.toBeNull();
  });

  it('DAILY-02: gives the same repair every time it is asked for the same date', () => {
    const { completed } = untilLetter5();
    const first = dailyOffer(completed, today);
    for (let i = 0; i < 5; i++) expect(dailyOffer(completed, today)).toBe(first);
    expect(dailyRepairFor(today)).toBe(first);
  });

  it('DAILY-03: is not offered again that date after completion, and is offered the next date', () => {
    const { completed } = untilLetter5();
    const done = completeDaily(deepFreeze(structuredClone(completed)), today);
    expect(done.dailyDone).toBe(today);
    expect(dailyOffer(done, today)).toBeNull();
    expect(completeDaily(done, today)).toBe(done); // one completion per date
    expect(dailyOffer(done, '2026-11-15')).not.toBeNull();
    expect(completeDaily(done, '2026-11-15').dailyDone).toBe('2026-11-15');
  });

  it('DAILY-04: completion survives a reload and dailyDone holds that local date', () => {
    const { completed } = untilLetter5();
    const done = completeDaily(completed, today);
    const reloaded = parseSave(serializeSave(done));
    expect(reloaded.status).toBe('loaded');
    expect(reloaded.save.dailyDone).toBe(today);
    expect(dailyOffer(reloaded.save, today)).toBeNull();
    expect(dailyOffer(reloaded.save, '2026-11-15')).not.toBeNull();
  });

  it('DAILY-05: nothing in the story waits for it', () => {
    const end = playStory();
    expect(end.dailyDone).toBeNull();
    expect(end.letters.letter_5).toBe('completed');
  });

  it('does not complete a daily repair that is not on offer', () => {
    const { accepted, completed } = untilLetter5();
    expect(completeDaily(accepted, today)).toBe(accepted); // before Letter 5 is done
    expect(completeDaily(completed, 'not a date')).toBe(completed);
  });

  it('draws only from the two documented repairs, which already exist in the game', () => {
    expect(DAILY_POOL).toEqual(REPAIR_IDS);
    for (let day = 1; day <= 31; day++) {
      const repair = dailyRepairFor(`2026-12-${String(day).padStart(2, '0')}`);
      expect(repair).not.toBeNull();
      expect(Object.values(REPAIRS)).toContain(repair);
    }
  });

  it('steps through the pool day by day, so neighbouring days differ', () => {
    for (let day = 1; day < 28; day++) {
      const a = dailyRepairFor(`2027-02-${String(day).padStart(2, '0')}`);
      const b = dailyRepairFor(`2027-02-${String(day + 1).padStart(2, '0')}`);
      expect(a).not.toBe(b);
    }
    expect(dailyRepairFor('2027-02-01')).toBe(dailyRepairFor('2027-02-03'));
  });

  it('steps correctly across month, year and leap-day boundaries and before 1970', () => {
    expect(dailyRepairFor('2026-12-31')).not.toBe(dailyRepairFor('2027-01-01'));
    expect(dailyRepairFor('2028-02-28')).not.toBe(dailyRepairFor('2028-02-29'));
    expect(dailyRepairFor('2028-02-29')).not.toBe(dailyRepairFor('2028-03-01'));
    expect(dailyRepairFor('1969-12-31')).not.toBeNull();
    expect(dailyRepairFor('1969-12-31')).not.toBe(dailyRepairFor('1970-01-01'));
  });

  it('answers nothing for a date that is not a real YYYY-MM-DD date', () => {
    for (const bad of ['', 'today', '2026-13-01', '2026-02-30', '2026-1-5', '26-11-14', '2026-11-14T10:00', ' 2026-11-14', '2026-11-14\n']) {
      expect(dailyRepairFor(bad)).toBeNull();
      expect(dailyOffer(untilLetter5().completed, bad)).toBeNull();
    }
  });
});

describe('local dates', () => {
  it('uses the local calendar date, which rolls over at local midnight', () => {
    expect(dateKey(new Date(2026, 10, 14, 23, 59, 59))).toBe('2026-11-14');
    expect(dateKey(new Date(2026, 10, 15, 0, 0, 0))).toBe('2026-11-15');
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('accepts real dates and rejects impossible ones', () => {
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2027-02-29')).toBe(false);
    expect(isDateKey('2026-04-31')).toBe(false);
    expect(isDateKey('2026-00-10')).toBe(false);
    expect(isDateKey(20261114)).toBe(false);
    expect(isDateKey(null)).toBe(false);
  });

  it('numbers consecutive days consecutively', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2027-01-01') - dayNumber('2026-12-31')).toBe(1);
    expect(dayNumber('2028-03-01') - dayNumber('2028-02-28')).toBe(2);
    expect(() => dayNumber('nope')).toThrow(RangeError);
  });
});
