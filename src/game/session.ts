/**
 * GameSession: the single object the rest of the game talks to. It owns the current save and mode, applies a
 * progression change together with its matching mode change, and writes to storage exactly when the save changed
 * (SAVE_PERSISTENCE_SPEC §6): never per frame, and never twice for the same state.
 *
 * It is a thin shell. The rules live in modes.ts, progression.ts and daily.ts, each pure and tested on its own. Every
 * command returns true when it was accepted and false when it was refused; a refused command changes nothing.
 * No rendering, no IWSDK. The caller turns the results into scene changes.
 *
 * Frame budget: `mode`, `modeState`, `save`, `persisted` and `can` allocate nothing and may be read every frame. `letter`,
 * `closing`, `giftAvailable` and `dailyRepair` compute from the save: read them when a command was accepted, not per frame.
 */

import type { LetterDef, LetterId, MachineId, PlotId, RepairDef, RepairId } from './content';
import { completeDaily, dailyOffer } from './daily';
import { canTransition, modeState, transition, type Mode, type ModeAction, type ModeState } from './modes';
import {
  acceptLetter,
  activeLetter,
  canAcceptLetter,
  canGift,
  canPlaceMachine,
  closingCard,
  DEFAULT_PROGRESSION,
  machineBuilt,
  machinePlaced,
  repairVerified,
  settle,
  trunkOpened,
  type ProgressionOptions,
} from './progression';
import { freshSave, serializeSave, type LoadStatus, type SaveV1, type Settings } from './save';
import { browserStorage, createSaveStore, type SaveStore, type StorageLike } from './store';

export interface GameSessionInit {
  /** Defaults to `localStorage`, or memory only when that is unavailable. Pass null to stay in memory. */
  readonly storage?: StorageLike | null;
  readonly progression?: ProgressionOptions;
}

export class GameSession {
  private readonly store: SaveStore;
  private readonly options: ProgressionOptions;
  private currentSave: SaveV1;
  private currentMode: ModeState;
  private lastPersisted = true;
  /** How the stored save loaded. `newer-version` means saving is off until a confirmed restart. */
  readonly loadStatus: LoadStatus;

  constructor(init: GameSessionInit = {}) {
    this.options = init.progression ?? DEFAULT_PROGRESSION;
    this.store = createSaveStore(init.storage === undefined ? browserStorage() : init.storage);
    const loaded = this.store.load();
    this.loadStatus = loaded.status;
    this.currentSave = settle(loaded.save, this.options);
    // A player who already opened the trunk starts in the town: the introduction plays once (PRODUCT_SPEC §3.2).
    this.currentMode = modeState(this.currentSave.letters.letter_1 === 'locked' ? 'intro' : 'town');
  }

  // ---- Read side -------------------------------------------------------------------------------------------------

  get save(): SaveV1 {
    return this.currentSave;
  }
  get mode(): Mode {
    return this.currentMode.mode;
  }
  /** The mode state, including whether Restart is waiting for its confirmation. */
  get modeState(): ModeState {
    return this.currentMode;
  }
  /** False after a write failed or was blocked: the game runs on memory and the UI may show a subtle warning (SAVE §11). */
  get persisted(): boolean {
    return this.lastPersisted;
  }
  /** The letter the player should work on now, or null. */
  get letter(): LetterDef | null {
    return activeLetter(this.currentSave, this.options);
  }
  /** The closing card text once the story is complete, else null. */
  get closing(): string | null {
    return closingCard(this.currentSave, this.options);
  }
  /** Whether the ribbon icon shows on finished machines (and the Gift mode can open). */
  get giftAvailable(): boolean {
    return canGift(this.currentSave);
  }
  /** Today's daily repair if it can be started now, else null. `today` is the local `YYYY-MM-DD` date. */
  dailyRepair(today: string): RepairDef | null {
    return dailyOffer(this.currentSave, today);
  }
  can(action: ModeAction): boolean {
    return canTransition(this.currentMode, action);
  }

  // ---- Commands --------------------------------------------------------------------------------------------------

  /** The town was placed on the table or stand (a save trigger, SAVE §6). */
  townPlaced(): boolean {
    if (this.currentSave.townPlaced) return false;
    return this.commit({ ...this.currentSave, townPlaced: true });
  }

  /** The trunk opened: the introduction ends and Letter 1 arrives. */
  openTrunk(): boolean {
    return this.go('open-trunk', (s) => trunkOpened(s, this.options));
  }

  /**
   * The player took a letter: the workbench and parcel appear and Build starts. An already accepted letter is taken up
   * again the same way (progression is unchanged), so a player who reloads mid-build, when nothing but the save
   * survives, can start that letter's build again from the town instead of being stuck.
   */
  acceptLetter(letterId: LetterId): boolean {
    const status = this.currentSave.letters[letterId];
    if (status !== 'available' && status !== 'accepted') return false;
    return this.go('begin-build', (s) => (canAcceptLetter(s, letterId) ? acceptLetter(s, letterId) : s));
  }

  /** The player started today's daily repair. Build starts. Completion is `dailyRepairVerified`. */
  beginDailyRepair(today: string): boolean {
    if (dailyOffer(this.currentSave, today) === null) return false;
    return this.go('begin-build');
  }

  /** Every required socket holds a part, so the solver can be asked: Wind starts. */
  assemblyComplete(): boolean {
    return this.go('assembly-complete');
  }

  /** The machine ran wrong, jammed, or the player wants to change a part: back to Build. */
  backToBuild(): boolean {
    return this.go('back-to-build');
  }

  /** The solver says the machine runs correctly. It counts as built; Place starts. */
  machineRanCorrectly(blueprintId: MachineId): boolean {
    // Place is left only by a built machine, so refuse here rather than strand the player in it (a machine whose letter
    // is not accepted, or that is not in this build, cannot count as built).
    if (!machineBuilt(this.currentSave, blueprintId).machines.some((m) => m.blueprintId === blueprintId && m.built)) return false;
    return this.go('machine-ran', (s) => machineBuilt(s, blueprintId));
  }

  /** The player committed a built machine to its plot: the town wakes and the next letter may arrive. */
  machinePlaced(blueprintId: MachineId, plotId: PlotId): boolean {
    if (!canPlaceMachine(this.currentSave, blueprintId, plotId)) return false;
    return this.go('machine-placed', (s) => machinePlaced(s, blueprintId, plotId, this.options));
  }

  /** A story repair ran correctly with the right part (Wind or Place). Completes its letter. */
  repairVerified(repairId: RepairId): boolean {
    if (this.currentMode.mode !== 'wind' && this.currentMode.mode !== 'place') return false;
    return this.commit(repairVerified(this.currentSave, repairId, this.options));
  }

  /** Today's daily repair ran correctly (Wind or Place). Records the date; one completion per date. */
  dailyRepairVerified(today: string): boolean {
    if (this.currentMode.mode !== 'wind' && this.currentMode.mode !== 'place') return false;
    return this.commit(completeDaily(this.currentSave, today));
  }

  /** Opens the gift panel from the town, once gifting is unlocked and a finished machine stands in the town. */
  openGift(): boolean {
    return canGift(this.currentSave) && this.go('open-gift');
  }
  closeGift(): boolean {
    return this.go('close-gift');
  }

  pause(): boolean {
    return this.go('pause');
  }
  resume(): boolean {
    return this.go('resume');
  }
  /** The first of the two steps that delete progress. Nothing is deleted yet. */
  requestRestart(): boolean {
    return this.go('request-restart');
  }
  cancelRestart(): boolean {
    return this.go('cancel-restart');
  }

  /**
   * The second, deliberate step: deletes progress and returns to the trunk introduction (SAVE §12). Accessibility
   * settings are kept: a player who needs gaze mode should not lose it by restarting the story.
   */
  confirmRestart(): boolean {
    const next = transition(this.currentMode, 'confirm-restart');
    if (next === this.currentMode) return false;
    const settings = this.currentSave.settings;
    this.lastPersisted = this.store.reset();
    this.currentMode = next;
    this.currentSave = { ...freshSave(), settings };
    if (serializeSave(this.currentSave) !== serializeSave(freshSave())) this.write(this.currentSave);
    return true;
  }

  /** Changes one setting (a save trigger). */
  setSetting(key: keyof Settings, value: boolean): boolean {
    if (this.currentSave.settings[key] === value) return false;
    return this.commit({ ...this.currentSave, settings: { ...this.currentSave.settings, [key]: value } });
  }

  // ---- Internals -------------------------------------------------------------------------------------------------

  /** Takes a mode transition and, when it is legal, applies the progression change that goes with it. */
  private go(action: ModeAction, update?: (save: SaveV1) => SaveV1): boolean {
    const next = transition(this.currentMode, action);
    if (next === this.currentMode) return false;
    this.currentMode = next;
    if (update) this.commit(update(this.currentSave));
    return true;
  }

  /** Adopts a changed save and writes it. An unchanged save (same reference) writes nothing. */
  private commit(next: SaveV1): boolean {
    if (next === this.currentSave) return false;
    this.currentSave = next;
    this.write(next);
    return true;
  }

  private write(save: SaveV1): void {
    const outcome = this.store.save(save);
    this.lastPersisted = outcome === 'saved' || outcome === 'unchanged';
  }
}
