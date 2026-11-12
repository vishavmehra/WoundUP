import type { LetterDef } from '../game/content.js';
import type { Mode, ModeState } from '../game/modes.js';
import type { ResultView } from './copy.js';

/** What the player has done inside a mode, which the mode state machine does not record. */
export interface LocalFlow {
  /** The trunk lid and its withdrawal. `gone` for a returning player, whose town is already out. */
  trunk: 'closed' | 'opening' | 'withdrawing' | 'gone';
  envelope: 'sealed' | 'open';
  parcel: 'closed' | 'open';
  /** The last Run's verdict, cleared when the player goes back to Build. */
  result: ResultView | null;
}

export const freshLocal = (): LocalFlow => ({ trunk: 'closed', envelope: 'sealed', parcel: 'closed', result: null });

export interface ViewContext {
  letter: LetterDef | null;
  closing: string | null;
  giftAvailable: boolean;
}

export interface View {
  trunk: boolean;
  envelope: 'hidden' | 'sealed' | 'open';
  closingCard: boolean;
  bench: boolean;
  parcel: 'hidden' | 'closed' | 'open';
  /** Tray and blueprint appear when the parcel opens. */
  tray: boolean;
  blueprint: boolean;
  runSign: boolean;
  /** `Place` hint label above the bench. */
  placeHint: boolean;
  pauseButton: boolean;
  giftButton: boolean;
  panel: 'none' | 'pause' | 'restart' | 'gift';
}

const BENCH_MODES: readonly Mode[] = ['build', 'wind', 'place'];

/**
 * The single place that says which props exist in which mode (UI_UX_SPEC §6 to §17; GAMEPLAY_SYSTEMS §3). Pure: the same mode state
 * and local progress always give the same view, so a returning player and a continuing one see the same thing.
 * Pause shows the view of the mode it will return to, with its panel over it.
 */
export function viewFor(state: ModeState, local: LocalFlow, ctx: ViewContext): View {
  const paused = state.mode === 'pause';
  const mode: Mode = paused ? (state.resume ?? 'town') : state.mode;
  const bench = BENCH_MODES.includes(mode);
  const parcelOpen = bench && local.parcel === 'open';
  const inTown = mode === 'town';
  return {
    trunk: mode === 'intro' || local.trunk === 'opening' || local.trunk === 'withdrawing',
    envelope: inTown && ctx.letter !== null ? (local.envelope === 'open' ? 'open' : 'sealed') : 'hidden',
    closingCard: inTown && ctx.letter === null && ctx.closing !== null,
    bench,
    parcel: !bench ? 'hidden' : parcelOpen ? 'open' : 'closed',
    tray: parcelOpen,
    blueprint: parcelOpen,
    runSign: mode === 'wind',
    placeHint: mode === 'place',
    pauseButton: !paused && mode !== 'gift',
    giftButton: inTown && ctx.giftAvailable && !paused,
    panel: paused ? (state.restartArmed ? 'restart' : 'pause') : mode === 'gift' ? 'gift' : 'none',
  };
}
