/**
 * Every word the flow UI shows that is not authored letter content (UI_UX_SPEC §13: short labels, no solver terms). Pure.
 * Text from outside, a gift link, never reaches the screen: only these tables and the closed content lists do.
 */
import type { MachineId, EngravingId } from '../game/content.js';
import type { GiftError } from '../game/gift.js';
import type { Settings } from '../game/save.js';
import type { SolveResult, SolveStatus } from '../sim/index.js';

export const MACHINE_NAMES: Readonly<Record<MachineId, string>> = {
  music_box: 'Music Box',
  carousel: 'Carousel',
  windmill: 'Windmill',
  clock_tower: 'Clock Tower',
};

export const HINTS = {
  latch: 'Pinch the brass latch',
  envelope: 'Pinch the letter',
  parcel: 'Pinch the parcel to open it',
  place: 'Carry it to the glowing plot',
  wind: 'Pinch the key and turn your wrist',
  windMore: 'Wind it, then press Run',
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
  return `Wound ${Math.max(0, Math.min(units, max))} of ${max}`;
}

export interface SettingRow {
  key: keyof Pick<Settings, 'easySnap' | 'gazeMode' | 'xrayHint'>;
  label: string;
}

/** The accessibility rows of the pause menu, in order. `night` belongs to the day/night feature, not to accessibility. */
export const SETTING_ROWS: readonly SettingRow[] = [
  { key: 'easySnap', label: 'Easy Snap' },
  { key: 'gazeMode', label: 'Gaze and pinch' },
  { key: 'xrayHint', label: 'X-ray hint' },
];

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

export function engravingText(id: EngravingId, table: readonly { id: EngravingId; text: string }[]): string {
  return table.find((e) => e.id === id)?.text ?? '';
}
