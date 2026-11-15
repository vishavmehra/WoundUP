/**
 * Every word the flow UI shows that is not authored letter content (UI_UX_SPEC §13: short labels, no solver terms). Pure.
 * Text from outside, a gift link, never reaches the screen: only these tables and the closed content lists do.
 */
import type { MachineId, EngravingId } from '../game/content.js';
import type { GiftError } from '../game/gift.js';
import type { BooleanSettingKey, Difficulty } from '../game/save.js';
import type { SolveResult, SolveStatus } from '../sim/index.js';

export const MACHINE_NAMES: Readonly<Record<MachineId, string>> = {
  music_box: 'Music Box',
  carousel: 'Carousel',
  windmill: 'Windmill',
  clock_tower: 'Clock Tower',
  well: 'Well',
  belfry: 'Belfry',
};

export const HINTS = {
  latch: 'Pinch the brass latch',
  envelope: 'Pinch the letter',
  parcel: 'Pinch the parcel to open it',
  place: 'Carry it to the glowing plot',
  wind: 'Pinch the key and turn your wrist',
  windMore: 'Wind it, then press Run',
} as const;

/**
 * The slip over the town while its models are still arriving after the trunk has opened (`View.townCue`). No percentage: the loader reports
 * none for the town as a whole, and a made-up one would not be honest. The failed card says what to do and the plaque below it does it.
 */
export const TOWN_WAIT = {
  waiting: { title: 'Waking Tockton…', hint: 'The town is still unpacking.' },
  failed: { title: 'Tockton would not wake.', hint: 'Check your connection.' },
  retry: 'Try again',
} as const;

/** The X-ray hint slip (UI_UX_SPEC §14), by how the player acts: an open palm over the machine, or the lens button with gaze and pinch or with the hand's ray. */
export const XRAY_HINT = {
  title: 'Look inside',
  hands: { hint: 'Palm down over the machine, or press the lens.' },
  gaze: { hint: 'Look at the lens, then pinch.' },
  ray: { hint: 'Point at the lens, then pinch.' },
} as const;

export type Tone = 'good' | 'warn' | 'bad';

export interface ResultView {
  status: SolveStatus;
  tone: Tone;
  title: string;
  hint: string;
  /** Only a machine that runs correctly goes on to Place; the others offer Adjust (back to Build). */
  canContinue: boolean;
}

export interface ResultHints {
  /** Measured speed divided by the intended speed, supplied by the caller when it knows (speed targets). */
  speedRatio?: number;
}

type ResultInput = Pick<SolveResult, 'status' | 'jamReason' | 'wrongTargets' | 'missingSockets'>;

/** Turns a solver verdict into the small label under the machine. Never shows node ids, rates or reasons by their code names. */
export function describeResult(r: ResultInput, hints: ResultHints = {}): ResultView {
  switch (r.status) {
    case 'runs':
      return { status: r.status, tone: 'good', title: 'It works!', hint: HINTS.place, canContinue: true };
    case 'runs_wrong': {
      if (r.wrongTargets?.includes('runSeconds')) {
        return { status: r.status, tone: 'warn', title: 'It stops too soon.', hint: 'Look at the part that holds its power.', canContinue: false };
      }
      const ratio = hints.speedRatio;
      if (ratio !== undefined && ratio > 1.15) return { status: r.status, tone: 'warn', title: 'It turns too fast.', hint: 'A gear may be the wrong size.', canContinue: false };
      if (ratio !== undefined && ratio < 0.85) return { status: r.status, tone: 'warn', title: 'It turns too slowly.', hint: 'A gear may be the wrong size.', canContinue: false };
      return { status: r.status, tone: 'warn', title: 'It runs, but not right.', hint: 'One part may be the wrong one.', canContinue: false };
    }
    case 'jams': {
      if (r.jamReason === 'module_mismatch') return { status: r.status, tone: 'bad', title: 'The gears jam.', hint: 'Their teeth do not match. Try another gear.', canContinue: false };
      if (r.jamReason === 'velocity_contradiction') return { status: r.status, tone: 'bad', title: 'Two parts fight.', hint: 'Check how they are linked.', canContinue: false };
      return { status: r.status, tone: 'bad', title: 'Something is jammed.', hint: 'Check the gears.', canContinue: false };
    }
    case 'incomplete': {
      const n = r.missingSockets?.length ?? 0;
      const hint = n === 1 ? 'One slot is still empty.' : n > 1 ? `${n} slots are still empty.` : 'Some slots are still empty.';
      return { status: r.status, tone: 'warn', title: 'A part is missing.', hint, canContinue: false };
    }
  }
}

export function windLabel(units: number, max: number): string {
  return `Wound ${Math.max(0, Math.min(Math.floor(units), max))} of ${max}`;
}

export interface SettingRow {
  key: BooleanSettingKey;
  label: string;
  /** One plain sentence under the row (UI_UX_SPEC section 20: explain Easy Snap and gaze mode in plain language). */
  hint: string;
}

/** The setting rows of the pause menu, in order: the accessibility rows (Easy Snap, gaze and pinch, ray mode), the X-ray hint, then the day/night setting (PRODUCT_SPEC F16, F17). */
export const SETTING_ROWS: readonly SettingRow[] = [
  { key: 'easySnap', label: 'Easy Snap', hint: 'Parts snap into place from further away.' },
  { key: 'gazeMode', label: 'Gaze and pinch', hint: 'Look at a target, then pinch anywhere to press it.' },
  { key: 'rayMode', label: 'Ray mode', hint: 'Point with your hand and pinch to take things from afar.' },
  { key: 'xrayHint', label: 'X-ray hint', hint: 'Shows a hint when looking inside a machine can help.' },
  { key: 'night', label: 'Night', hint: 'Dims the room. Lamps and windows light the town.' },
];

// ---- Intricate assembly (ADR-050): difficulty, the Helper, the step sheet ----------------------------------------------------

export interface DifficultyCopy {
  readonly name: string;
  /** One line on the choice card (design §6.1). */
  readonly line: string;
  /** The time, honestly (design §6.1: "about 2 minutes" and "about 5 minutes"). */
  readonly time: string;
}

export const DIFFICULTY_COPY: Readonly<Record<Difficulty, DifficultyCopy>> = {
  relaxed: { name: 'Relaxed', line: 'Pieces come ready-made. Quick.', time: 'about 2 minutes' },
  standard: { name: 'Standard', line: 'The full workshop. Every pin and washer.', time: 'about 5 minutes' },
  master: { name: 'Master', line: 'No hints unless you ask.', time: '5 minutes or more' },
};

/** The order the card lists them and the Pause row cycles through them. */
export const DIFFICULTY_ORDER: readonly Difficulty[] = ['relaxed', 'standard', 'master'];
/** The level the card highlights as the recommended one (owner decision, ADR-050). */
export const RECOMMENDED_DIFFICULTY: Difficulty = 'standard';
/**
 * Master ships only if the 3.8 cm bin-pitch spacing test passes (ADR-050 item 3, risk R5). The test has not run, so the flag starts on; if it fails,
 * the integrator passes `masterAvailable: false` (or calls `FlowUi.setMasterAvailable(false)`) and the card greys Master out with the note below.
 */
export const MASTER_AVAILABLE = true;

export const DIFFICULTY_CARD = {
  title: 'How do you want to build?',
  recommended: 'Recommended',
  masterUnavailable: 'Not ready yet. Try Standard.',
  note: 'You can change this in the pause menu.',
} as const;

/** The Pause menu's difficulty row and the sentence under it (UI_UX_SPEC section 20: one plain sentence per setting). */
export const DIFFICULTY_ROW = {
  label: 'Difficulty',
  hint: 'How much help the workshop gives while you build.',
} as const;

export const difficultyRowLabel = (d: Difficulty): string => `${DIFFICULTY_ROW.label}: ${DIFFICULTY_COPY[d].name}`;

/** The next level in the Pause row's cycle; Master is skipped while it is not available. */
export function nextDifficulty(current: Difficulty, masterAvailable: boolean): Difficulty {
  const order = masterAvailable ? DIFFICULTY_ORDER : DIFFICULTY_ORDER.filter((d) => d !== 'master');
  const at = order.indexOf(current);
  return order[(at + 1) % order.length] ?? 'standard';
}

/** One-line slips for the Helper (design §7.1, §7.2). The director picks which; the UI only paints it. */
export const HELPER_COPY = {
  label: 'Help',
  offer: 'Need a hand?',
  demo: 'It goes right here.', // the F15 ghost hands are not on this branch: Demonstrate shows a ghost of the part at its socket, so the line must not promise hands
  place: 'Here, let me.',
  wind: 'Wind it, then press Run',
  next: (what: string): string => `Next: ${what}`,
} as const;

/** The step sheet's words (design §7.4). */
export const STEP_SHEET = {
  done: 'Every stage is built.',
  doneHint: 'Wind it, then press Run.',
  helpLabel: '?',
  masterNote: 'Stage names only',
} as const;

export interface GiftErrorText {
  title: string;
  body: string;
}

/** The viewer's error card. Every code gets its own plain sentence; none of the link's own text is ever echoed. */
export function giftErrorText(error: GiftError): GiftErrorText {
  switch (error) {
    case 'not-a-gift':
      return { title: 'No gift here', body: 'This page has no gift in its link.' };
    case 'unsupported':
      return { title: 'This browser cannot open it', body: 'Try a recent Chrome, Edge, Safari or Meta Quest Browser.' };
    case 'blueprint-version':
    case 'unknown-blueprint':
    case 'unknown-part':
      return { title: 'This gift is from another version', body: 'It was made with parts this version of Wound Up does not have.' };
    case 'solver-rejected':
    case 'bad-assembly':
      return { title: 'This machine does not run', body: 'The gift was put together in a way that does not work.' };
    default:
      return { title: 'This link looks damaged', body: 'It may have been cut short when it was copied. Ask for it again.' };
  }
}

/** What the sender sees when the link could not be made (the viewer's cards above are worded for the person who received it). */
export function giftMakeErrorText(error: GiftError | 'no-machine'): string {
  if (error === 'no-machine') return 'That machine is not on the table.';
  if (error === 'unsupported') return 'This browser cannot make a link.';
  return 'The link could not be made.';
}

export function engravingText(id: EngravingId, table: readonly { id: EngravingId; text: string }[]): string {
  return table.find((e) => e.id === id)?.text ?? '';
}
