/**
 * Authored Tockton game content: the closed id lists, the six letters and the closing card, the two story repairs and
 * the eight gift engravings. Plain data only, no engine types (DATA_AND_BLUEPRINT_SPEC §11, §14; CLAUDE.md §11).
 *
 * Every id here is stable and is persisted in saves and gift links, so none may be renamed without a migration
 * (DATA_AND_BLUEPRINT_SPEC §4.1). Text on screen comes only from authored tables like these, never from a payload.
 */

/** True when `value` is one of the strings in `list`. The one place the closed-list checks are written. */
export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

// ---- Machines and plots (PRODUCT_SPEC §6, §11; TOCKTON_DIMENSIONS §3.4) --------------------------------------------

/**
 * Blueprint ids of the Tockton machines. The specifications name the machines but never fix the blueprint ids,
 * so these follow the plot-id pattern (`plot_music_box`); the content layer must use the same ids (see the gaps list).
 * The Well and the Belfry are the fifth and sixth (ADR-048).
 */
export const MACHINE_IDS = ['music_box', 'carousel', 'windmill', 'clock_tower', 'well', 'belfry'] as const;
export type MachineId = (typeof MACHINE_IDS)[number];

/** The machine plots of the town (TOCKTON_DIMENSIONS §3.4; the last two are ADR-048's). The Bakery is not a plot: the Windmill wakes it too. */
export const PLOT_IDS = ['plot_music_box', 'plot_carousel', 'plot_windmill', 'plot_clock_tower', 'plot_well', 'plot_belfry'] as const;
export type PlotId = (typeof PLOT_IDS)[number];

/** Each machine has exactly one plot and only its own plot accepts it (TOCKTON_DIMENSIONS §3.4). */
export const MACHINE_PLOT: Readonly<Record<MachineId, PlotId>> = {
  music_box: 'plot_music_box',
  carousel: 'plot_carousel',
  windmill: 'plot_windmill',
  clock_tower: 'plot_clock_tower',
  well: 'plot_well',
  belfry: 'plot_belfry',
};

// ---- Story repairs (PRODUCT_SPEC §8; GAMEPLAY_SYSTEMS §12) ---------------------------------------------------------

export const REPAIR_IDS = ['worn_spring', 'wrong_gear', 'slow_pump', 'silent_bell'] as const;
export type RepairId = (typeof REPAIR_IDS)[number];

/** What the player sees when the fault is present (units: seconds, and a multiple of the intended speed). */
export type RepairSymptom =
  | { readonly kind: 'short_runtime'; readonly seconds: number }
  | { readonly kind: 'speed_ratio'; readonly ratio: number };

export interface RepairDef {
  readonly id: RepairId;
  readonly blueprintId: MachineId;
  /** The story letter that introduces this repair. */
  readonly letterId: LetterId;
  /** Part ids follow DATA_AND_BLUEPRINT_SPEC §4.1 (`<asset id>_<finish>`). */
  readonly faultyPartId: string;
  readonly correctPartId: string;
  readonly symptom: RepairSymptom;
}

export const REPAIRS: Readonly<Record<RepairId, RepairDef>> = {
  // PRODUCT_SPEC §8: the worn spring runs for about 1.5 s and stops. Replace it with the standard spring.
  worn_spring: {
    id: 'worn_spring',
    blueprintId: 'music_box',
    letterId: 'letter_2',
    faultyPartId: 'spring_worn_brass',
    correctPartId: 'spring_standard_brass',
    symptom: { kind: 'short_runtime', seconds: 1.5 },
  },
  // PRODUCT_SPEC §8: a 12-tooth spur gear where a 24-tooth gear is required, so the millstone turns about twice as fast.
  wrong_gear: {
    id: 'wrong_gear',
    blueprintId: 'windmill',
    letterId: 'letter_5',
    faultyPartId: 'gear_spur_12_m1_brass',
    correctPartId: 'gear_spur_24_m1_brass',
    symptom: { kind: 'speed_ratio', ratio: 24 / 12 },
  },
  // WELL_FOUNTAIN_BLUEPRINT §10.3: a 16-tooth gear where the 10-tooth one belongs, so the cam turns at 1.0 rad/s instead of 1.6 and the
  // pump dribbles. Daily repair only (ADR-048): `letterId` names the Well's letter, which is a build letter, so no letter ever
  // completes it.
  slow_pump: {
    id: 'slow_pump',
    blueprintId: 'well',
    letterId: 'letter_7',
    faultyPartId: 'gear_spur_16_m1_brass',
    correctPartId: 'gear_spur_10_m1_brass',
    symptom: { kind: 'speed_ratio', ratio: 10 / 16 },
  },
  // BELFRY_BLUEPRINT §10.3: the worn spring of Letter 2 in a machine the player has not met it in: the bell stirs once, the vane turns a
  // few degrees and everything stops. Daily repair only (ADR-048).
  silent_bell: {
    id: 'silent_bell',
    blueprintId: 'belfry',
    letterId: 'letter_8',
    faultyPartId: 'spring_worn_brass',
    correctPartId: 'spring_standard_brass',
    symptom: { kind: 'short_runtime', seconds: 1.5 },
  },
};

// ---- Letters (PRODUCT_SPEC §7; GAMEPLAY_SYSTEMS §5) ----------------------------------------------------------------

/** Story order. Each letter unlocks when the one before it is completed (see progression.ts). */
export const LETTER_IDS = ['letter_1', 'letter_2', 'letter_3', 'letter_4', 'letter_5', 'letter_6', 'letter_7', 'letter_8'] as const;
export type LetterId = (typeof LETTER_IDS)[number];

/** Locked < available < accepted < completed. Persisted, so never store any other string (SAVE_PERSISTENCE_SPEC §4.2). */
export const LETTER_STATUSES = ['locked', 'available', 'accepted', 'completed'] as const;
export type LetterStatus = (typeof LETTER_STATUSES)[number];

/** The closed list of objective types (STORY_AND_QUEST_ENGINE §4.3, the two the G0 letters use). */
export type LetterObjective =
  | { readonly type: 'build_and_run'; readonly blueprintId: MachineId }
  | { readonly type: 'repair_fault'; readonly repairId: RepairId };

/**
 * What makes a locked letter available (DATA_AND_BLUEPRINT_SPEC §11, §12). A closed list: a new kind needs a spec change
 * and a validator update, never a string in content. Completion is the objective's own rule (see progression.ts).
 */
export type LetterUnlock =
  | { readonly type: 'trunk_opened' }
  | { readonly type: 'letter_completed'; readonly letterId: LetterId };

export interface LetterDef {
  readonly id: LetterId;
  /** As written in the specification. The schoolteacher and the theatre keeper are roles with no figure (ADR-039). */
  readonly sender: string;
  /** The message without the typographic quotation marks the specification wraps around it. */
  readonly message: string;
  readonly unlock: LetterUnlock;
  readonly objective: LetterObjective;
}

export const LETTERS: Readonly<Record<LetterId, LetterDef>> = {
  letter_1: {
    id: 'letter_1',
    sender: 'Mira',
    message: "My grandmother's music box went quiet the night the clock stopped. Could you make it sing again?",
    unlock: { type: 'trunk_opened' },
    objective: { type: 'build_and_run', blueprintId: 'music_box' },
  },
  letter_2: {
    id: 'letter_2',
    sender: 'Mira',
    message: 'It plays! But only for a moment, then it sighs and stops. Is it tired?',
    unlock: { type: 'letter_completed', letterId: 'letter_1' },
    objective: { type: 'repair_fault', repairId: 'worn_spring' },
  },
  letter_3: {
    id: 'letter_3',
    sender: 'Schoolteacher',
    message: 'The children press their noses to the carousel every morning. Could you make it turn again?',
    unlock: { type: 'letter_completed', letterId: 'letter_2' },
    objective: { type: 'build_and_run', blueprintId: 'carousel' },
  },
  letter_4: {
    id: 'letter_4',
    sender: 'Otto',
    message: 'No wind, no windmill. No windmill, no flour. No flour, no bread. Please help.',
    unlock: { type: 'letter_completed', letterId: 'letter_3' },
    objective: { type: 'build_and_run', blueprintId: 'windmill' },
  },
  letter_5: {
    id: 'letter_5',
    sender: 'Otto',
    message: "The windmill spins like it's late for something! Flour everywhere. Something's not right inside.",
    unlock: { type: 'letter_completed', letterId: 'letter_4' },
    objective: { type: 'repair_fault', repairId: 'wrong_gear' },
  },
  letter_6: {
    id: 'letter_6',
    sender: 'Theatre keeper',
    message: "The theatre doors only open when the clock tower rings. Tockton hasn't heard it in years.",
    unlock: { type: 'letter_completed', letterId: 'letter_5' },
    objective: { type: 'build_and_run', blueprintId: 'clock_tower' },
  },
  // Letters 7 and 8 (ADR-048): the Gardener and the Bell-ringer, roles with no figure (ADR-039).
  letter_7: {
    id: 'letter_7',
    sender: 'Gardener',
    message: 'The planters on the street are drooping, and the old fountain has stood dry since the night the clock stopped. Could you get the water running again?',
    unlock: { type: 'letter_completed', letterId: 'letter_6' },
    objective: { type: 'build_and_run', blueprintId: 'well' },
  },
  letter_8: {
    id: 'letter_8',
    sender: 'Bell-ringer',
    message: "The belfry bell hasn't rung since the night the clock stopped, and the weathervane has forgotten how to turn. Could you wake them both?",
    unlock: { type: 'letter_completed', letterId: 'letter_7' },
    objective: { type: 'build_and_run', blueprintId: 'belfry' },
  },
};

/** The closing card. It has no sender (TOCKTON_CHARACTERS §2). */
export const CLOSING_CARD = 'Tockton is waking up. The show is coming soon.';

// ---- Gift engravings (PRODUCT_SPEC §13; GAMEPLAY_SYSTEMS §16.2) ----------------------------------------------------

/** The eight presets, in specification order. No keyboard, no free text. */
export const ENGRAVINGS = [
  { id: 'for_you', text: 'For you' },
  { id: 'happy_birthday', text: 'Happy birthday' },
  { id: 'thinking_of_you', text: 'Thinking of you' },
  { id: 'thank_you', text: 'Thank you' },
  { id: 'with_love', text: 'With love' },
  { id: 'congratulations', text: 'Congratulations' },
  { id: 'made_this_for_you', text: 'Made this for you' },
  { id: 'wind_me_up', text: 'Wind me up' },
] as const;
export type EngravingId = (typeof ENGRAVINGS)[number]['id'];
export const ENGRAVING_IDS: readonly EngravingId[] = ENGRAVINGS.map((e) => e.id);
