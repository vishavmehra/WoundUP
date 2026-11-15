import { describe, expect, it } from 'vitest';
import {
  ALL_LETTER_IDS,
  CLOSING_CARD,
  LETTER_IDS,
  LETTERS,
  REPAIRS,
  SIDE_LETTER_IDS,
  type LetterId,
  type MachineId,
  type PlotId,
  type SideLetterId,
} from '../../src/game/content';
import { DAILY_POOL, dailyOffer } from '../../src/game/daily';
import {
  acceptLetter,
  activeLetter,
  closingCard,
  DEFAULT_PROGRESSION,
  letterSequence,
  optionalLetter,
  repairVerified,
  settle,
  storyComplete,
  trunkOpened,
  type ProgressionOptions,
} from '../../src/game/progression';
import { freshSave, parseSave, serializeSave, validateSave, type SaveV1 } from '../../src/game/save';
import { GameSession } from '../../src/game/session';
import { viewFor, freshLocal, type ViewContext } from '../../src/ui/view';
import { modeState } from '../../src/game/modes';
import { deepFreeze, FakeStorage, playStory } from './helpers';

// The three optional letters (owner-approved polish, 2026-11-14): repairs of machines already in the town, outside the story chain.

const OUT: ProgressionOptions = { clockTower: false };

/** The story is done: every chain letter completed, so the optional letters have been made available by `settle`. */
const afterStory = (options?: ProgressionOptions): SaveV1 => playStory(options);

describe('the optional letters as content', () => {
  const expected: Array<[SideLetterId, string, string, LetterId, string]> = [
    ['repair_music_box_drag', 'Mira', 'It plays right through now! But the tune drags, like it is humming in its sleep. Could you wake it a little?', 'letter_1', 'dragging_tune'],
    ['repair_windmill_crawl', 'Otto', 'The sails turn, but the millstone only crawls. A spoonful of flour an hour! Something inside is too small.', 'letter_4', 'crawling_mill'],
    ['repair_music_box_race', 'Schoolteacher', 'The children sing along to the music box, but the tune races ahead and they cannot keep up. Could you slow it down?', 'letter_3', 'racing_tune'],
  ];

  it.each(expected)('%s has its sender, its text, the chain letter it follows and its repair', (id, sender, message, after, repair) => {
    const letter = LETTERS[id];
    expect(letter.id).toBe(id);
    expect(letter.sender).toBe(sender);
    expect(letter.message).toBe(message);
    expect(letter.optional).toBe(true);
    expect(letter.unlock).toEqual({ type: 'letter_completed', letterId: after });
    expect(letter.objective).toEqual({ type: 'repair_fault', repairId: repair });
    expect(REPAIRS[repair as keyof typeof REPAIRS].letterId).toBe(id);
  });

  it('lists them in SIDE_LETTER_IDS after the story\'s letters, with ids that carry no letter number', () => {
    expect([...SIDE_LETTER_IDS]).toEqual(expected.map(([id]) => id));
    expect([...ALL_LETTER_IDS]).toEqual([...LETTER_IDS, ...SIDE_LETTER_IDS]);
    for (const id of SIDE_LETTER_IDS) expect(id).not.toMatch(/^letter_\d+$/);
  });

  it('use only the senders of the story (roles, Mira and Otto: no new character) and short, plain text', () => {
    const story = new Set(LETTER_IDS.map((id) => LETTERS[id].sender));
    for (const id of SIDE_LETTER_IDS) {
      expect(story.has(LETTERS[id].sender), id).toBe(true);
      expect(LETTERS[id].message.length, id).toBeLessThanOrEqual(125);
    }
  });

  it('leave the story\'s letters alone: none is optional, none unlocks from an optional letter, no optional repair belongs to a chain letter', () => {
    for (const id of LETTER_IDS) {
      expect(LETTERS[id].optional, id).toBeUndefined();
      const rule = LETTERS[id].unlock;
      if (rule.type === 'letter_completed') expect(LETTER_IDS as readonly string[], id).toContain(rule.letterId);
    }
    for (const id of SIDE_LETTER_IDS) {
      const rule = LETTERS[id].unlock;
      expect(rule.type === 'letter_completed' && (LETTER_IDS as readonly string[]).includes(rule.letterId), id).toBe(true);
    }
  });
});

describe('the optional letters in progression', () => {
  it('start locked, and become available when the chain letter that placed their machine is completed', () => {
    let seen = false;
    const end = playStory(undefined, (s) => {
      for (const id of SIDE_LETTER_IDS) {
        const rule = LETTERS[id].unlock;
        const wanted = rule.type === 'letter_completed' ? s.letters[rule.letterId] === 'completed' : false;
        expect(s.letters[id] === 'locked', `${id} after ${JSON.stringify(rule)}`).toBe(!wanted);
        seen ||= s.letters[id] === 'available';
      }
    });
    expect(seen).toBe(true);
    for (const id of SIDE_LETTER_IDS) expect(end.letters[id]).toBe('available');
    expect(freshSave().letters.repair_music_box_drag).toBe('locked');
  });

  it('never delay the story: while a chain letter is open it is the one shown, at every step of the whole story', () => {
    playStory(undefined, (s) => {
      const story = activeLetter(s);
      if (story !== null) expect(optionalLetter(s)).toBeNull();
      expect(LETTER_IDS as readonly string[]).toContain(story?.id ?? 'letter_1');
    });
  });

  it('do not change when the story ends: storyComplete and the closing card are the chain\'s, with or without the Clock Tower', () => {
    for (const options of [undefined, OUT]) {
      const end = afterStory(options);
      expect(storyComplete(end, options)).toBe(true);
      expect(closingCard(end, options)).toBe(CLOSING_CARD);
      expect(activeLetter(end, options)).toBeNull();
      expect(letterSequence(options ?? DEFAULT_PROGRESSION).every((id) => (LETTER_IDS as readonly string[]).includes(id))).toBe(true);
      expect(optionalLetter(end, options)?.id).toBe('repair_music_box_drag');
    }
    // A save that has not finished the story has no closing card, and the optional letters are still waiting behind the chain.
    let atLetter5Done: SaveV1 | undefined;
    playStory(undefined, (s) => {
      if (s.letters.letter_5 === 'completed' && !atLetter5Done) atLetter5Done = s;
    });
    expect(closingCard(atLetter5Done as SaveV1)).toBeNull();
    expect(SIDE_LETTER_IDS.every((id) => (atLetter5Done as SaveV1).letters[id] === 'available')).toBe(true);
    expect(optionalLetter(atLetter5Done as SaveV1)).toBeNull();
  });

  it('are done one after the other: accept, repair, and the next one is shown; the order is SIDE_LETTER_IDS', () => {
    let s = afterStory();
    const order: string[] = [];
    for (;;) {
      const letter = optionalLetter(s);
      if (!letter) break;
      order.push(letter.id);
      const objective = letter.objective;
      expect(objective.type).toBe('repair_fault');
      if (objective.type !== 'repair_fault') return;
      const accepted = acceptLetter(s, letter.id);
      expect(accepted).not.toBe(s);
      expect(optionalLetter(accepted)?.id, 'an accepted letter stays the one shown').toBe(letter.id);
      s = repairVerified(accepted, objective.repairId);
      expect(s.letters[letter.id]).toBe('completed');
    }
    expect(order).toEqual([...SIDE_LETTER_IDS]);
    expect(optionalLetter(s)).toBeNull();
    expect(activeLetter(s)).toBeNull();
    expect(closingCard(s)).toBe(CLOSING_CARD); // the ending stays
  });

  it('cannot be accepted before they are available, nor completed by the wrong repair or without being accepted', () => {
    const s = trunkOpened(freshSave());
    for (const id of SIDE_LETTER_IDS) expect(acceptLetter(s, id)).toBe(s);
    const end = afterStory();
    expect(repairVerified(end, 'dragging_tune')).toBe(end); // available is not accepted
    const accepted = acceptLetter(end, 'repair_music_box_drag');
    expect(repairVerified(accepted, 'crawling_mill')).toBe(accepted); // another letter's repair
    expect(repairVerified(accepted, 'wrong_gear')).toBe(accepted);
    const done = repairVerified(accepted, 'dragging_tune');
    expect(repairVerified(done, 'dragging_tune')).toBe(done); // once
  });

  it('settle is idempotent, never mutates, and never goes backwards for a letter already past available', () => {
    const end = deepFreeze(structuredClone(afterStory()));
    expect(settle(end)).toBe(end);
    const accepted = acceptLetter(end, 'repair_music_box_drag');
    expect(settle(accepted)).toBe(accepted);
    expect(accepted.letters.repair_music_box_drag).toBe('accepted');
  });

  it('are independent of the daily repair: neither waits for the other', () => {
    const end = afterStory();
    expect(end.dailyDone).toBeNull();
    expect(dailyOffer(end, '2026-11-14')).not.toBeNull();
    const done = repairVerified(acceptLetter(end, 'repair_music_box_drag'), 'dragging_tune');
    expect(done.dailyDone).toBeNull();
    expect(dailyOffer(done, '2026-11-14')).not.toBeNull();
    for (const id of SIDE_LETTER_IDS) expect(DAILY_POOL).toContain(REPAIRS[(LETTERS[id].objective as { repairId: keyof typeof REPAIRS }).repairId].id);
  });
});

describe('the optional letters and the save (SaveV1 is unchanged: older saves load, newer ones are checked as strictly)', () => {
  /** What a save from before the optional letters held: the eight chain letters and nothing else. */
  const OLD = {
    version: 1,
    townPlaced: true,
    letters: {
      letter_1: 'completed',
      letter_2: 'completed',
      letter_3: 'completed',
      letter_4: 'completed',
      letter_5: 'completed',
      letter_6: 'completed',
      letter_7: 'completed',
      letter_8: 'completed',
    },
    machines: [
      { blueprintId: 'music_box', built: true, placed: true, plotId: 'plot_music_box' },
      { blueprintId: 'carousel', built: true, placed: true, plotId: 'plot_carousel' },
      { blueprintId: 'windmill', built: true, placed: true, plotId: 'plot_windmill' },
      { blueprintId: 'clock_tower', built: true, placed: true, plotId: 'plot_clock_tower' },
      { blueprintId: 'well', built: true, placed: true, plotId: 'plot_well' },
      { blueprintId: 'belfry', built: true, placed: true, plotId: 'plot_belfry' },
    ],
    dailyDone: null,
    settings: { easySnap: false, gazeMode: false, xrayHint: true, night: false },
    // no `rayMode` and no `learned`: the save is older than both (the loader gives them their defaults)
  };

  it('a save written before them loads untouched, with them locked; the session then settles them, so a returning player finds the letters waiting', () => {
    const loaded = parseSave(JSON.stringify(OLD));
    expect(loaded.status).toBe('loaded');
    for (const id of SIDE_LETTER_IDS) expect(loaded.save.letters[id]).toBe('locked');
    for (const id of LETTER_IDS) expect(loaded.save.letters[id]).toBe('completed');
    const storage = new FakeStorage({ 'woundup.save': JSON.stringify(OLD) });
    const game = new GameSession({ storage });
    expect(game.loadStatus).toBe('loaded');
    expect(game.save.letters.repair_music_box_drag).toBe('available');
    expect(game.save.letters.repair_windmill_crawl).toBe('available');
    expect(game.save.letters.repair_music_box_race).toBe('available');
    expect(game.closing).toBe(CLOSING_CARD);
    expect(game.letter?.id).toBe('repair_music_box_drag');
  });

  it('a save from the middle of the story shows the story\'s letter, not an optional one, and its optional letters follow the machines already placed', () => {
    const early = { ...OLD, letters: { letter_1: 'completed', letter_2: 'available' }, machines: [OLD.machines[0]] };
    const game = new GameSession({ storage: new FakeStorage({ 'woundup.save': JSON.stringify(early) }) });
    expect(game.save.letters.letter_2).toBe('available');
    expect(game.save.letters.repair_music_box_drag).toBe('available'); // the Music Box stands in its plot
    expect(game.save.letters.repair_windmill_crawl).toBe('locked'); // the Windmill has not been built
    expect(game.save.letters.repair_music_box_race).toBe('locked'); // nor has Letter 3 been done
    expect(game.letter?.id).toBe('letter_2');
    expect(game.closing).toBeNull();
  });

  it('every state of the optional letters survives a save and a load, and the whole file stays far under the size limit', () => {
    for (const status of ['locked', 'available', 'accepted', 'completed'] as const) {
      const s: SaveV1 = { ...afterStory(), letters: { ...afterStory().letters, repair_music_box_drag: status } };
      const loaded = parseSave(serializeSave(s));
      expect(loaded.status, status).toBe('loaded');
      expect(loaded.save).toEqual(s);
    }
    expect(serializeSave(afterStory()).length).toBeLessThan(1200);
  });

  it('rejects an optional letter that is past locked before the letter it follows is completed, and any letter id it does not know', () => {
    const early = { ...OLD, letters: { letter_1: 'completed', letter_2: 'accepted', repair_windmill_crawl: 'accepted' } };
    expect(validateSave(early)).toEqual({ ok: false, reason: 'letters out of order' });
    expect(validateSave({ ...OLD, letters: { ...OLD.letters, repair_carousel_jam: 'available' } })).toEqual({ ok: false, reason: 'letters has an unknown id' });
    expect(validateSave({ ...OLD, letters: { ...OLD.letters, repair_music_box_drag: 'done' } })).toEqual({ ok: false, reason: 'letters has an invalid status' });
    expect(parseSave(JSON.stringify(early)).status).toBe('corrupt');
  });

  it('keeps the letters of a save in the order of ALL_LETTER_IDS, so the file reads the same every time', () => {
    expect(Object.keys(parseSave(JSON.stringify(OLD)).save.letters)).toEqual([...ALL_LETTER_IDS]);
  });
});

describe('the optional letters through the session', () => {
  /** Plays the whole story with the real commands (the Clock Tower is in by default). */
  function playStoryThroughSession(game: GameSession): void {
    const steps: Array<[string, () => boolean]> = [['trunk', () => game.openTrunk()]];
    const build = (letter: LetterId, machine: MachineId, plot: PlotId): void => {
      steps.push([`accept ${letter}`, () => game.acceptLetter(letter)], ['assemble', () => game.assemblyComplete()], ['run', () => game.machineRanCorrectly(machine)], ['place', () => game.machinePlaced(machine, plot)]);
    };
    const repair = (letter: LetterId, id: keyof typeof REPAIRS, machine: 'music_box' | 'windmill', plot: 'plot_music_box' | 'plot_windmill'): void => {
      steps.push([`accept ${letter}`, () => game.acceptLetter(letter)], ['assemble', () => game.assemblyComplete()], ['verify', () => game.repairVerified(id)], ['run', () => game.machineRanCorrectly(machine)], ['place', () => game.machinePlaced(machine, plot)]);
    };
    build('letter_1', 'music_box', 'plot_music_box');
    repair('letter_2', 'worn_spring', 'music_box', 'plot_music_box');
    build('letter_3', 'carousel', 'plot_carousel');
    build('letter_4', 'windmill', 'plot_windmill');
    repair('letter_5', 'wrong_gear', 'windmill', 'plot_windmill');
    build('letter_6', 'clock_tower', 'plot_clock_tower');
    build('letter_7', 'well', 'plot_well');
    build('letter_8', 'belfry', 'plot_belfry');
    for (const [what, step] of steps) expect(step(), what).toBe(true);
  }

  it('shows the story\'s letters first, then the optional ones, each through the same envelope, and keeps the closing card up throughout', () => {
    const game = new GameSession({ storage: null });
    expect(game.letter).toBeNull();
    playStoryThroughSession(game);
    expect(game.closing).toBe(CLOSING_CARD);
    const order: string[] = [];
    const pairs: Array<[SideLetterId, keyof typeof REPAIRS, 'music_box' | 'windmill', 'plot_music_box' | 'plot_windmill']> = [
      ['repair_music_box_drag', 'dragging_tune', 'music_box', 'plot_music_box'],
      ['repair_windmill_crawl', 'crawling_mill', 'windmill', 'plot_windmill'],
      ['repair_music_box_race', 'racing_tune', 'music_box', 'plot_music_box'],
    ];
    for (const [letter, repairId, machine, plot] of pairs) {
      expect(game.letter?.id).toBe(letter);
      order.push(letter);
      expect(game.acceptLetter(letter), `accept ${letter}`).toBe(true);
      expect(game.mode).toBe('build');
      expect(game.assemblyComplete()).toBe(true);
      expect(game.repairVerified(repairId), `repair ${repairId}`).toBe(true);
      expect(game.machineRanCorrectly(machine)).toBe(true);
      expect(game.machinePlaced(machine, plot)).toBe(true);
      expect(game.mode).toBe('town');
      expect(game.save.letters[letter]).toBe('completed');
      expect(game.closing).toBe(CLOSING_CARD);
    }
    expect(order).toEqual([...SIDE_LETTER_IDS]);
    expect(game.letter).toBeNull();
    expect(game.closing).toBe(CLOSING_CARD);
  });

  it('remembers an accepted optional letter across a reload, and takes it up again from the town (as a story letter is)', () => {
    const storage = new FakeStorage();
    const game = new GameSession({ storage });
    playStoryThroughSession(game);
    expect(game.acceptLetter('repair_music_box_drag')).toBe(true);
    const again = new GameSession({ storage });
    expect(again.save.letters.repair_music_box_drag).toBe('accepted');
    expect(again.letter?.id).toBe('repair_music_box_drag');
    expect(again.mode).toBe('town');
    expect(again.acceptLetter('repair_music_box_drag')).toBe(true);
    expect(again.mode).toBe('build');
  });

  it('does not show an optional letter to a player who is mid-story: `letter` stays the story letter while one is open', () => {
    const game = new GameSession({ storage: null });
    expect(game.openTrunk()).toBe(true);
    expect(game.acceptLetter('letter_1')).toBe(true);
    expect(game.assemblyComplete()).toBe(true);
    expect(game.machineRanCorrectly('music_box')).toBe(true);
    expect(game.machinePlaced('music_box', 'plot_music_box')).toBe(true);
    expect(game.save.letters.repair_music_box_drag).toBe('available'); // the Music Box is in its plot
    expect(game.letter?.id).toBe('letter_2'); // but the story comes first
  });
});

describe('the closing card beside an optional letter (UI view)', () => {
  const town = modeState('town');
  const ctx = (over: Partial<ViewContext>): ViewContext => ({ letter: null, closing: CLOSING_CARD, giftAvailable: false, xrayHint: true, ...over });

  it('stays up with the sealed envelope of an optional letter, and gives the reading spot to it once it is open', () => {
    const optional = LETTERS.repair_music_box_drag;
    expect(viewFor(town, freshLocal(), ctx({ letter: optional }))).toMatchObject({ envelope: 'sealed', closingCard: true });
    expect(viewFor(town, { ...freshLocal(), envelope: 'open' }, ctx({ letter: optional }))).toMatchObject({ envelope: 'open', closingCard: false });
  });

  it('is exactly as before for the story: up when no letter is waiting, down while a story letter is', () => {
    expect(viewFor(town, freshLocal(), ctx({}))).toMatchObject({ envelope: 'hidden', closingCard: true });
    expect(viewFor(town, freshLocal(), ctx({ letter: LETTERS.letter_6, closing: null }))).toMatchObject({ envelope: 'sealed', closingCard: false });
    expect(viewFor(town, freshLocal(), ctx({ letter: LETTERS.letter_6 }))).toMatchObject({ closingCard: false }); // a story letter never shares the card
    expect(viewFor(town, freshLocal(), ctx({ closing: null }))).toMatchObject({ closingCard: false });
  });

  it('is not shown away from the town, or under the pause panel', () => {
    const optional = LETTERS.repair_music_box_drag;
    expect(viewFor(modeState('build'), freshLocal(), ctx({ letter: optional })).closingCard).toBe(false);
    expect(viewFor({ ...town, mode: 'pause', resume: 'town' }, freshLocal(), ctx({ letter: optional })).closingCard).toBe(false);
  });
});
