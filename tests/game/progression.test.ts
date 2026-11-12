import { describe, expect, it } from 'vitest';
import { CLOSING_CARD, LETTER_IDS, LETTERS } from '../../src/game/content';
import {
  acceptLetter,
  activeLetter,
  canGift,
  closingCard,
  DEFAULT_PROGRESSION,
  giftableMachines,
  letterReached,
  letterSequence,
  machineBuilt,
  machinePlaced,
  repairVerified,
  settle,
  storyComplete,
  trunkOpened,
} from '../../src/game/progression';
import { freshSave, validateSave, type SaveV1 } from '../../src/game/save';
import { acceptAndRepair, advance, buildAndPlace, deepFreeze, playStory } from './helpers';

const TOWER = { clockTower: true } as const;

/** A save frozen at some point of the story, to prove nothing mutates its input. */
const frozen = (save: SaveV1) => deepFreeze(structuredClone(save));

describe('trunk and Letter 1 (GAMEPLAY_SYSTEMS §4.1)', () => {
  it('starts with every letter locked and nothing built', () => {
    const s = freshSave();
    expect(LETTER_IDS.every((id) => s.letters[id] === 'locked')).toBe(true);
    expect(s.machines).toEqual([]);
    expect(activeLetter(s)).toBeNull();
  });

  it('makes only Letter 1 available when the trunk opens', () => {
    const s = trunkOpened(frozen(freshSave()));
    expect(s.letters).toMatchObject({ letter_1: 'available', letter_2: 'locked', letter_3: 'locked' });
    expect(activeLetter(s)?.id).toBe('letter_1');
  });

  it('ignores a second trunk opening', () => {
    const s = trunkOpened(freshSave());
    expect(trunkOpened(s)).toBe(s);
  });
});

describe('accepting letters', () => {
  it('moves an available letter to accepted, and nothing else', () => {
    const s = trunkOpened(freshSave());
    const next = acceptLetter(frozen(s), 'letter_1');
    expect(next.letters.letter_1).toBe('accepted');
    expect(next.letters.letter_2).toBe('locked');
  });

  it('does not complete a letter just because it was opened (GAMEPLAY_SYSTEMS §4)', () => {
    const s = acceptLetter(trunkOpened(freshSave()), 'letter_1');
    expect(s.letters.letter_1).not.toBe('completed');
    expect(s.letters.letter_2).toBe('locked');
  });

  it('refuses a locked, an already accepted and a completed letter', () => {
    const fresh = freshSave();
    expect(acceptLetter(fresh, 'letter_1')).toBe(fresh); // locked
    expect(acceptLetter(fresh, 'letter_3')).toBe(fresh); // locked, later in the chain
    const accepted = acceptLetter(trunkOpened(fresh), 'letter_1');
    expect(acceptLetter(accepted, 'letter_1')).toBe(accepted);
    const done = buildAndPlace(trunkOpened(fresh), 'letter_1', 'music_box');
    expect(acceptLetter(done, 'letter_1')).toBe(done);
  });
});

describe('building and placing a machine', () => {
  const accepted = () => acceptLetter(trunkOpened(freshSave()), 'letter_1');

  it('refuses to build a machine whose letter has not been accepted', () => {
    const s = trunkOpened(freshSave());
    expect(machineBuilt(s, 'music_box')).toBe(s); // available, not accepted
    const a = accepted();
    expect(machineBuilt(a, 'carousel')).toBe(a); // a later machine
    expect(machineBuilt(a, 'clock_tower')).toBe(a);
  });

  it('records a built machine and ignores building it again', () => {
    const built = machineBuilt(frozen(accepted()), 'music_box');
    expect(built.machines).toEqual([{ blueprintId: 'music_box', built: true, placed: false }]);
    expect(machineBuilt(built, 'music_box')).toBe(built);
  });

  it('refuses to place a machine that was not built, or onto a plot that is not its own', () => {
    const a = accepted();
    expect(machinePlaced(a, 'music_box', 'plot_music_box')).toBe(a);
    const built = machineBuilt(a, 'music_box');
    expect(machinePlaced(built, 'music_box', 'plot_carousel')).toBe(built);
    expect(machinePlaced(built, 'music_box', 'plot_windmill')).toBe(built);
  });

  it('completes the letter on placement and unlocks the next one (DATA_AND_BLUEPRINT_SPEC §12)', () => {
    const built = machineBuilt(accepted(), 'music_box');
    expect(built.letters.letter_1).toBe('accepted'); // built and run, not yet placed
    const placed = machinePlaced(frozen(built), 'music_box', 'plot_music_box');
    expect(placed.machines).toEqual([{ blueprintId: 'music_box', built: true, placed: true, plotId: 'plot_music_box' }]);
    expect(placed.letters).toMatchObject({ letter_1: 'completed', letter_2: 'available', letter_3: 'locked' });
  });

  it('ignores placing the same machine twice (a repaired machine goes back to its plot)', () => {
    const placed = buildAndPlace(trunkOpened(freshSave()), 'letter_1', 'music_box');
    expect(machinePlaced(placed, 'music_box', 'plot_music_box')).toBe(placed);
  });
});

describe('story repairs (PRODUCT_SPEC §8)', () => {
  const afterLetter1 = () => buildAndPlace(trunkOpened(freshSave()), 'letter_1', 'music_box');

  it('completes Letter 2 only once the worn spring repair is verified, and then unlocks Letter 3', () => {
    const s = afterLetter1();
    expect(s.letters.letter_2).toBe('available');
    expect(repairVerified(s, 'worn_spring')).toBe(s); // not accepted yet
    const accepted = acceptLetter(s, 'letter_2');
    expect(accepted.letters.letter_2).toBe('accepted');
    const fixed = repairVerified(frozen(accepted), 'worn_spring');
    expect(fixed.letters).toMatchObject({ letter_2: 'completed', letter_3: 'available' });
  });

  it('ignores the wrong repair and a repeated one', () => {
    const accepted = acceptLetter(afterLetter1(), 'letter_2');
    expect(repairVerified(accepted, 'wrong_gear')).toBe(accepted);
    const fixed = repairVerified(accepted, 'worn_spring');
    expect(repairVerified(fixed, 'worn_spring')).toBe(fixed);
  });
});

describe('the whole story', () => {
  it('unlocks one letter at a time and ends with the closing card after Letter 5 when the Clock Tower is out', () => {
    const seen: SaveV1[] = [];
    const end = playStory(undefined, (s) => seen.push(deepFreeze(structuredClone(s))));
    expect(LETTER_IDS.filter((id) => end.letters[id] === 'completed')).toEqual(['letter_1', 'letter_2', 'letter_3', 'letter_4', 'letter_5']);
    expect(end.letters.letter_6).toBe('locked');
    expect(storyComplete(end)).toBe(true);
    expect(closingCard(end)).toBe(CLOSING_CARD);
    expect(activeLetter(end)).toBeNull();
    // At most one letter is ever open at a time, and every intermediate save is one the loader accepts.
    for (const s of seen) {
      expect(LETTER_IDS.filter((id) => s.letters[id] === 'available' || s.letters[id] === 'accepted').length).toBeLessThanOrEqual(1);
      expect(validateSave(s).ok).toBe(true);
    }
    expect(end.machines.map((m) => m.blueprintId).sort()).toEqual(['carousel', 'music_box', 'windmill']);
  });

  it('does not show the closing card early', () => {
    let s: SaveV1 = freshSave();
    expect(closingCard(s)).toBeNull();
    playStory(undefined, (step) => {
      s = step;
      if (step.letters.letter_5 !== 'completed') expect(closingCard(step)).toBeNull();
    });
    expect(closingCard(s)).toBe(CLOSING_CARD);
  });

  it('adds Letter 6 and moves the closing card after it when the Clock Tower is in', () => {
    expect(letterSequence(TOWER)).toEqual(LETTER_IDS);
    expect(letterSequence(DEFAULT_PROGRESSION)).toEqual(LETTER_IDS.slice(0, 5));
    let atLetter5Done: SaveV1 | undefined;
    const end = playStory(TOWER, (s) => {
      if (s.letters.letter_5 === 'completed' && !atLetter5Done) atLetter5Done = s;
    });
    expect(atLetter5Done?.letters.letter_6).toBe('available');
    expect(closingCard(atLetter5Done as SaveV1, TOWER)).toBeNull();
    expect(end.letters.letter_6).toBe('completed');
    expect(closingCard(end, TOWER)).toBe(CLOSING_CARD);
  });

  it('keeps Letter 6 locked while the Clock Tower is out, and unlocks it when settle runs with the Tower on', () => {
    const end = playStory();
    expect(settle(end)).toBe(end);
    const unlocked = settle(end, TOWER);
    expect(unlocked.letters.letter_6).toBe('available');
    expect(settle(unlocked, TOWER)).toBe(unlocked); // idempotent
  });

  it('is not blocked by the daily repair: the story finishes without it (DAILY-05)', () => {
    const end = playStory();
    expect(end.dailyDone).toBeNull();
    expect(storyComplete(end)).toBe(true);
  });

  it('never lets the player skip ahead of the chain', () => {
    let s = trunkOpened(freshSave());
    for (const id of LETTER_IDS.slice(1)) expect(acceptLetter(s, id)).toBe(s);
    s = buildAndPlace(s, 'letter_1', 'music_box');
    expect(acceptLetter(s, 'letter_3')).toBe(s);
    s = acceptAndRepair(s, 'letter_2', 'worn_spring');
    expect(acceptLetter(s, 'letter_3')).not.toBe(s);
  });
});

describe('letters and objectives', () => {
  it('shows the active letter in order', () => {
    const order: string[] = [];
    playStory(undefined, (s) => {
      const id = activeLetter(s)?.id;
      if (id && order[order.length - 1] !== id) order.push(id);
    });
    expect(order).toEqual(['letter_1', 'letter_2', 'letter_3', 'letter_4', 'letter_5']);
    expect(LETTERS[order[0] as 'letter_1'].sender).toBe('Mira');
  });

  it('compares letter statuses by order', () => {
    const s = acceptLetter(trunkOpened(freshSave()), 'letter_1');
    expect(letterReached(s, 'letter_1', 'available')).toBe(true);
    expect(letterReached(s, 'letter_1', 'accepted')).toBe(true);
    expect(letterReached(s, 'letter_1', 'completed')).toBe(false);
    expect(letterReached(s, 'letter_2', 'available')).toBe(false);
  });
});

describe('gifting gate (PRODUCT_SPEC §13: after Letter 2)', () => {
  it('opens when Letter 2 is completed and a finished machine stands in the town', () => {
    let s = trunkOpened(freshSave());
    expect(canGift(s)).toBe(false);
    s = buildAndPlace(s, 'letter_1', 'music_box');
    expect(giftableMachines(s)).toEqual(['music_box']);
    expect(canGift(s)).toBe(false); // Letter 2 has arrived but is not completed
    s = acceptLetter(s, 'letter_2');
    expect(canGift(s)).toBe(false);
    s = advance(s, repairVerified(s, 'worn_spring'));
    expect(canGift(s)).toBe(true);
  });

  it('does not count a built machine that is not yet placed', () => {
    const accepted = acceptLetter(trunkOpened(freshSave()), 'letter_1');
    expect(giftableMachines(machineBuilt(accepted, 'music_box'))).toEqual([]);
  });
});
