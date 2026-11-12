import { describe, expect, it } from 'vitest';
import {
  CLOSING_CARD,
  ENGRAVINGS,
  LETTER_IDS,
  LETTERS,
  MACHINE_IDS,
  MACHINE_PLOT,
  PLOT_IDS,
  REPAIR_IDS,
  REPAIRS,
} from '../../src/game/content';

// The strings below are typed out from PRODUCT_SPEC §7 on purpose: a copy-paste slip in content.ts must fail here.
describe('letters (PRODUCT_SPEC §7)', () => {
  const expected: [string, string, string][] = [
    ['letter_1', 'Mira', "My grandmother's music box went quiet the night the clock stopped. Could you make it sing again?"],
    ['letter_2', 'Mira', 'It plays! But only for a moment, then it sighs and stops. Is it tired?'],
    ['letter_3', 'Schoolteacher', 'The children press their noses to the carousel every morning. Could you make it turn again?'],
    ['letter_4', 'Otto', 'No wind, no windmill. No windmill, no flour. No flour, no bread. Please help.'],
    ['letter_5', 'Otto', "The windmill spins like it's late for something! Flour everywhere. Something's not right inside."],
    ['letter_6', 'Theatre keeper', "The theatre doors only open when the clock tower rings. Tockton hasn't heard it in years."],
  ];

  it.each(expected)('%s has the exact sender and text', (id, sender, message) => {
    expect(LETTERS[id as keyof typeof LETTERS].sender).toBe(sender);
    expect(LETTERS[id as keyof typeof LETTERS].message).toBe(message);
  });

  it('lists the six letters in story order, each under its own id', () => {
    expect(LETTER_IDS).toEqual(expected.map(([id]) => id));
    for (const id of LETTER_IDS) expect(LETTERS[id].id).toBe(id);
  });

  it('has the exact closing card', () => {
    expect(CLOSING_CARD).toBe('Tockton is waking up. The show is coming soon.');
  });

  it('gives each letter the objective its purpose names', () => {
    expect(LETTERS.letter_1.objective).toEqual({ type: 'build_and_run', blueprintId: 'music_box' });
    expect(LETTERS.letter_2.objective).toEqual({ type: 'repair_fault', repairId: 'worn_spring' });
    expect(LETTERS.letter_3.objective).toEqual({ type: 'build_and_run', blueprintId: 'carousel' });
    expect(LETTERS.letter_4.objective).toEqual({ type: 'build_and_run', blueprintId: 'windmill' });
    expect(LETTERS.letter_5.objective).toEqual({ type: 'repair_fault', repairId: 'wrong_gear' });
    expect(LETTERS.letter_6.objective).toEqual({ type: 'build_and_run', blueprintId: 'clock_tower' });
  });

  it('unlocks Letter 1 from the trunk and every later letter from the one before it being completed (DATA §12)', () => {
    expect(LETTERS.letter_1.unlock).toEqual({ type: 'trunk_opened' });
    LETTER_IDS.slice(1).forEach((id, i) => expect(LETTERS[id].unlock, id).toEqual({ type: 'letter_completed', letterId: LETTER_IDS[i] }));
  });

  it('writes every machine through exactly one build letter', () => {
    for (const id of MACHINE_IDS) {
      const builders = LETTER_IDS.filter((l) => {
        const o = LETTERS[l].objective;
        return o.type === 'build_and_run' && o.blueprintId === id;
      });
      expect(builders).toHaveLength(1);
    }
  });
});

describe('story repairs (PRODUCT_SPEC §8)', () => {
  it('has the worn spring: about 1.5 s of runtime, fixed by the standard spring', () => {
    expect(REPAIRS.worn_spring).toMatchObject({
      blueprintId: 'music_box',
      letterId: 'letter_2',
      faultyPartId: 'spring_worn_brass',
      correctPartId: 'spring_standard_brass',
      symptom: { kind: 'short_runtime', seconds: 1.5 },
    });
  });

  it('has the wrong gear: 12 teeth where 24 are needed, so twice the speed', () => {
    expect(REPAIRS.wrong_gear).toMatchObject({
      blueprintId: 'windmill',
      letterId: 'letter_5',
      faultyPartId: 'gear_spur_12_m1_brass',
      correctPartId: 'gear_spur_24_m1_brass',
      symptom: { kind: 'speed_ratio', ratio: 2 },
    });
  });

  it('points each repair at the letter whose objective is that repair', () => {
    for (const id of REPAIR_IDS) {
      const o = LETTERS[REPAIRS[id].letterId].objective;
      expect(o).toEqual({ type: 'repair_fault', repairId: id });
      expect(REPAIRS[id].id).toBe(id);
    }
  });
});

describe('machines and plots', () => {
  it('gives each machine its own plot (TOCKTON_DIMENSIONS §3.4)', () => {
    expect(MACHINE_PLOT).toEqual({
      music_box: 'plot_music_box',
      carousel: 'plot_carousel',
      windmill: 'plot_windmill',
      clock_tower: 'plot_clock_tower',
    });
    expect(new Set(Object.values(MACHINE_PLOT)).size).toBe(MACHINE_IDS.length);
    expect([...PLOT_IDS].sort()).toEqual(Object.values(MACHINE_PLOT).sort());
  });
});

describe('engravings (PRODUCT_SPEC §13)', () => {
  it('are the eight presets, in order, with unique ids', () => {
    expect(ENGRAVINGS.map((e) => e.text)).toEqual([
      'For you',
      'Happy birthday',
      'Thinking of you',
      'Thank you',
      'With love',
      'Congratulations',
      'Made this for you',
      'Wind me up',
    ]);
    expect(new Set(ENGRAVINGS.map((e) => e.id)).size).toBe(8);
  });
});
