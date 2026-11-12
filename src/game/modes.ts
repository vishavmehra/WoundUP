/**
 * The mode state machine: the trunk introduction and the six game modes (PRODUCT_SPEC §3.2, §4;
 * GAMEPLAY_SYSTEMS §3; TECHNICAL_ARCHITECTURE §7). Pure and table-driven: the current mode is state, never inferred
 * from what is visible in the scene ("must not be inferred from arbitrary visual object visibility").
 *
 * Only the transitions in TABLE exist. `transition` returns the same state object for anything else, so callers detect a
 * refused transition with `next === state` (the same convention as progression.ts).
 *
 *   intro --open-trunk--> town
 *   town  --begin-build--> build --assembly-complete--> wind --machine-ran--> place --machine-placed--> town
 *   wind  --back-to-build--> build        (the machine ran wrong, jammed, or the player wants to adjust it)
 *   town  --open-gift--> gift --close-gift--> town
 *   any active mode --pause--> pause --resume--> where it was
 *   pause --request-restart--> (armed) --confirm-restart--> intro      (restart needs a second, deliberate step)
 */

export type Mode = 'intro' | 'town' | 'build' | 'wind' | 'place' | 'gift' | 'pause';

export const MODES: readonly Mode[] = ['intro', 'town', 'build', 'wind', 'place', 'gift', 'pause'];

export type ModeAction =
  | 'open-trunk'
  | 'begin-build'
  | 'assembly-complete'
  | 'back-to-build'
  | 'machine-ran'
  | 'machine-placed'
  | 'open-gift'
  | 'close-gift'
  | 'pause'
  | 'resume'
  | 'request-restart'
  | 'cancel-restart'
  | 'confirm-restart';

export const MODE_ACTIONS: readonly ModeAction[] = [
  'open-trunk',
  'begin-build',
  'assembly-complete',
  'back-to-build',
  'machine-ran',
  'machine-placed',
  'open-gift',
  'close-gift',
  'pause',
  'resume',
  'request-restart',
  'cancel-restart',
  'confirm-restart',
];

export interface ModeState {
  readonly mode: Mode;
  /** The mode Pause returns to. Null outside Pause. */
  readonly resume: Mode | null;
  /** True after "Restart" was chosen once; only `confirm-restart` while armed deletes progress (SAVE §12). */
  readonly restartArmed: boolean;
}

/** A fresh session starts at the trunk introduction; a returning player starts in the town (see session.ts). */
export function modeState(mode: Mode): ModeState {
  return { mode, resume: null, restartArmed: false };
}

/** Plain mode-to-mode transitions. Pause and restart are handled separately because they carry extra state. */
const TABLE: Readonly<Partial<Record<Mode, Partial<Record<ModeAction, Mode>>>>> = {
  intro: { 'open-trunk': 'town' },
  town: { 'begin-build': 'build', 'open-gift': 'gift' },
  build: { 'assembly-complete': 'wind' },
  wind: { 'machine-ran': 'place', 'back-to-build': 'build' },
  place: { 'machine-placed': 'town' },
  gift: { 'close-gift': 'town' },
};

export function transition(state: ModeState, action: ModeAction): ModeState {
  if (state.mode === 'pause') {
    switch (action) {
      case 'resume':
        return modeState(state.resume ?? 'town');
      case 'request-restart':
        return state.restartArmed ? state : { ...state, restartArmed: true };
      case 'cancel-restart':
        return state.restartArmed ? { ...state, restartArmed: false } : state;
      case 'confirm-restart':
        return state.restartArmed ? modeState('intro') : state;
      default:
        return state;
    }
  }
  if (action === 'pause') return { mode: 'pause', resume: state.mode, restartArmed: false };
  const to = TABLE[state.mode]?.[action];
  return to === undefined ? state : modeState(to);
}

/**
 * True when `transition` would change the state. Written out separately so it allocates nothing and is safe to call
 * every frame to light up a button; tests prove it always agrees with `transition`.
 */
export function canTransition(state: ModeState, action: ModeAction): boolean {
  if (state.mode === 'pause') {
    switch (action) {
      case 'resume':
        return true;
      case 'request-restart':
        return !state.restartArmed;
      case 'cancel-restart':
      case 'confirm-restart':
        return state.restartArmed;
      default:
        return false;
    }
  }
  return action === 'pause' || TABLE[state.mode]?.[action] !== undefined;
}
