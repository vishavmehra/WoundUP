/**
 * The Helper's press ladder and its gentle offers (INTRICATE_ASSEMBLY_DESIGN §7, §6.1; ADR-050). Pure: no Three.js, no ECS and no clock of its own
 * (`tick` is told how long a frame took), so a test can run a whole build's worth of mistakes and silences in microseconds.
 *
 *   press 1  Show         the next part glows where it lies and its socket pulses in lamp light
 *   press 2  Demonstrate  the ghost hands play that exact move (a ghost part at the socket when the hands are not there)
 *   press 3  Place        one part flies to its socket and seats; or a long press (hands mode) goes straight to this
 *
 * Never the whole machine: there is no "finish the stage". The wind step is a Show and a Demonstrate only (the third press cycles back to Show), and
 * nothing here runs the machine. The ladder is per step: any seating or removal (`progress`) starts it again. After a press the Helper is inert for
 * `HELPER_COOLDOWN_S`, so the next piece is the player's own choice and never a held key.
 *
 * It offers itself, as a glow and never a pop-up, after enough wrong attempts or enough quiet (`OFFER_RULES`), never in Master. It records nothing:
 * the counters are in memory, start again on progress and on a panel, and nothing here is saved or counted for anyone (CLAUDE.md §14, ADR-028).
 */
import type { Difficulty } from '../game/content';

/** After a press the Helper ignores the next one for this long (the UI medallion is inert for the same time; design §7.1, §7.2). */
export const HELPER_COOLDOWN_S = 1.2;
/** A press continues the ladder only within this many seconds of the one before it (design §7.2); later, it starts again at Show. */
export const LADDER_WINDOW_S = 20;
/** After an offer was answered, or withdrawn unanswered, the next offer for the same step waits this long (design §7.3). */
export const REOFFER_WAIT_S = 60;
/** How long the line a press put above the medallion stays up, seconds. */
export const SLIP_S = 6;

export interface OfferRule {
  /** Wrong attempts since the last progress that start an offer. */
  readonly wrong: number;
  /** Seconds without progress, with the hands free, that start an offer. */
  readonly idleS: number;
}

/** Design §6.1 and §7.3. Master never offers: it answers only when asked. */
export const OFFER_RULES: Readonly<Record<Difficulty, OfferRule | null>> = {
  relaxed: { wrong: 2, idleS: 20 },
  standard: { wrong: 3, idleS: 35 },
  master: null,
};

/** The silent idle pulse on the current socket (INTERACTION_SPEC §17, design §6.1): seconds without progress, or null for never. */
export const IDLE_PULSE_S: Readonly<Record<Difficulty, number | null>> = { relaxed: 12, standard: 20, master: null };

/** One move of the build, as the Helper sees it. */
export interface HelperTarget {
  /** `place`: one part from the tray or a bin into a socket. `carry`: a finished unit from the stand into the housing. `wind`: turn the key (Show and Demonstrate only). */
  readonly kind: 'place' | 'carry' | 'wind';
  /** The socket the move ends at (for `wind`, the key's socket; for `carry`, the housing socket the unit goes to). */
  readonly socketId: string;
  /** The part of that socket in the correct build. */
  readonly partId: string;
  /** In the player's words, for the slip: "left bracket". */
  readonly label: string;
  /** The piece comes from a bin of the caddy, not the tray. */
  readonly hardware: boolean;
}

/** The words the Helper puts on its slip. Pass `HELPER_COPY` from `src/ui/copy.ts`: the strings live in one place. */
export interface HelperCopy {
  readonly offer: string;
  readonly demo: string;
  readonly place: string;
  readonly wind: string;
  readonly next: (what: string) => string;
}

/** What the medallion shows (the shape of the UI's `HelperView`): a glow, and one line above it. */
export interface HelperState {
  readonly offer: boolean;
  readonly slip: string | null;
}

export const HELPER_QUIET: HelperState = Object.freeze({ offer: false, slip: null });

/** What the scene does for the Helper. Implemented over Three.js by `SceneHelper` (helper-cues.ts), and by fakes in tests. */
export interface HelperScene {
  /** Show: the part glows where it lies (its tray compartment or its bin). */
  glowPart(target: HelperTarget): void;
  /** Show and the idle pulse: the target's socket pulses in lamp light; null puts the pulse out. */
  pulseSocket(target: HelperTarget | null): void;
  /** The fallback of Demonstrate when the ghost hands are not there: a ghost of the part at its socket. */
  ghostPart(target: HelperTarget): void;
  /** Place: lift that one part and fly it to its socket, then seat it as a hand would. False when there is nothing to fly (no live part, no socket). */
  fly(target: HelperTarget): boolean;
  /** Takes every cue away: glow, ghost part, pulse. A flight in the air is left to land. */
  clear(): void;
  /** One soft chime, the first time the Helper offers itself in a build. */
  chime(): void;
  /** Per frame, if the scene side animates anything. */
  update?(dt: number): void;
}

/** The F15 ghost hands (src/onboarding, branch sprint/w7-onboard), seen through the one call the Helper needs. Absent until that branch merges. */
export interface GhostHands {
  /** Plays the move for `target` (a carry of the part to its socket, or the wind). False: it cannot show it now. */
  demonstrate(target: HelperTarget): boolean;
  /** Takes the hands away. */
  stop(): void;
}

export type HelperPress = 'show' | 'demo' | 'place' | 'none';

/** What the game tells the Helper each frame. */
export interface HelperFrame {
  /** A hand holds a part (or the key). The idle clock waits. */
  readonly held: boolean;
  /** A panel is on screen, or the session is not building or winding: the Helper is quiet and its counters start again. */
  readonly panelOpen: boolean;
}

export class Helper {
  private level: Difficulty;
  private target: HelperTarget | null = null;
  private t = 0;
  private rung: 0 | 1 | 2 = 0;
  private rungAt = 0;
  private wrongs = 0;
  private idle = 0;
  private offer = false;
  private quietUntil = 0;
  private cooldownUntil = 0;
  private slip: string | null = null;
  private slipUntil = 0;
  private panelWas = false;
  private chimed = false;
  private pulsed: string | null = null;
  private state: HelperState = HELPER_QUIET;

  constructor(
    private readonly scene: HelperScene,
    private readonly copy: HelperCopy,
    level: Difficulty,
    private readonly ghost?: GhostHands,
  ) {
    this.level = level;
  }

  /** What the medallion shows now. The same object until it changes, so the caller can compare by identity. */
  get view(): HelperState {
    return this.state;
  }

  get wrongAttempts(): number {
    return this.wrongs;
  }

  get idleSeconds(): number {
    return this.idle;
  }

  get offering(): boolean {
    return this.offer;
  }

  /** The step the ladder is on, or the rung 0 to 2 it has reached (0: not started). For tests and the debug state. */
  get rungReached(): 0 | 1 | 2 {
    return this.rung;
  }

  setLevel(level: Difficulty): void {
    this.level = level;
    if (OFFER_RULES[level] === null && this.offer) this.offer = false;
    if (IDLE_PULSE_S[level] === null && this.pulsed !== null && this.rung === 0) this.putPulseOut();
    this.publish();
  }

  /** The step the Helper points at changed (or went away). A different socket starts the ladder again. */
  setTarget(target: HelperTarget | null): void {
    const changed = this.target?.socketId !== target?.socketId || this.target?.kind !== target?.kind;
    this.target = target;
    if (changed) this.restartLadder();
    this.publish();
  }

  /** Something was seated or taken out: the ladder, the counters, the offer and the quiet all start again. The cooldown does not. */
  progress(): void {
    this.wrongs = 0;
    this.idle = 0;
    this.offer = false;
    this.quietUntil = 0;
    this.restartLadder();
    this.publish();
  }

  /** A wrong attempt: a part rejected by a socket, dropped on one that was not ready, or bounced for what it stands on. */
  wrong(): void {
    this.wrongs++;
  }

  /** A new build, or none: everything starts again, including the one chime a build gets. */
  reset(): void {
    this.target = null;
    this.t = 0;
    this.wrongs = 0;
    this.idle = 0;
    this.offer = false;
    this.quietUntil = 0;
    this.cooldownUntil = 0;
    this.panelWas = false;
    this.chimed = false;
    this.restartLadder();
    this.publish();
  }

  /** Advance by one frame: the idle clock, the silent pulse, the offer and the slip. Allocates nothing unless what the medallion shows changed. */
  tick(dt: number, frame: HelperFrame): void {
    this.t += dt;
    if (frame.panelOpen) {
      if (!this.panelWas) {
        // A panel and the Helper never overlap: the offer is put away, and what had built up starts again (design §7.3).
        if (this.offer) this.quietUntil = this.t + REOFFER_WAIT_S;
        this.offer = false;
        this.wrongs = 0;
        this.idle = 0;
      }
      this.panelWas = true;
      this.publish();
      return;
    }
    this.panelWas = false;
    const target = this.target;
    if (target !== null && !frame.held) this.idle += dt;
    if (this.slip !== null && this.t >= this.slipUntil) this.slip = null;

    const after = IDLE_PULSE_S[this.level];
    if (target !== null && target.kind !== 'wind' && after !== null && this.idle >= after && this.pulsed !== target.socketId) {
      this.scene.pulseSocket(target);
      this.pulsed = target.socketId;
    }
    const rule = OFFER_RULES[this.level];
    if (rule !== null && target !== null && !this.offer && this.t >= this.quietUntil && (this.wrongs >= rule.wrong || this.idle >= rule.idleS)) {
      this.offer = true;
      if (!this.chimed) {
        this.chimed = true;
        this.scene.chime();
      }
    }
    this.publish();
  }

  /**
   * The medallion was pressed. `long` is the hold of design §7.2 (hands mode only; the UI reports it that way), `hands` whether the player is in hands mode.
   * Returns which rung ran, or `none` when it was ignored (cooling down, or there is nothing to point at).
   */
  press(long: boolean, hands: boolean): HelperPress {
    const target = this.target;
    if (target === null || this.t < this.cooldownUntil) return 'none';
    this.cooldownUntil = this.t + HELPER_COOLDOWN_S;
    // Answered: the offer is put away, the clock starts again and the next offer for this step waits (design §7.3).
    this.offer = false;
    this.idle = 0;
    this.quietUntil = this.t + REOFFER_WAIT_S;

    const wind = target.kind === 'wind';
    const live = this.t - this.rungAt <= LADDER_WINDOW_S;
    let rung: 1 | 2 | 3;
    if (long && hands && !wind) rung = 3;
    else if (this.rung === 1 && live) rung = 2;
    else if (this.rung === 2 && live && !wind) rung = 3;
    else rung = 1; // a first press, a late one, or the third press of the wind step: back to Show

    let did: HelperPress;
    if (rung === 3 && this.place(target)) did = 'place';
    else if (rung === 2) did = this.demonstrate(target);
    else did = this.show(target);
    this.slip = did === 'place' ? this.copy.place : did === 'demo' ? this.copy.demo : wind ? this.copy.wind : this.copy.next(`the ${target.label}`);
    this.slipUntil = this.t + SLIP_S;
    this.rung = did === 'show' ? 1 : did === 'demo' ? 2 : 0; // a place is followed by progress; the ladder starts again either way
    this.rungAt = this.t;
    this.publish();
    return did;
  }

  private show(target: HelperTarget): HelperPress {
    this.stopCues();
    this.scene.glowPart(target);
    this.scene.pulseSocket(target);
    this.pulsed = target.socketId;
    return 'show';
  }

  private demonstrate(target: HelperTarget): HelperPress {
    this.stopCues();
    // The ghost hands when they are there; otherwise the socket pulses and a ghost of the part waits at it (design §7.5 "Dependency").
    if (this.ghost?.demonstrate(target) !== true) {
      this.scene.glowPart(target);
      this.scene.ghostPart(target);
    }
    this.scene.pulseSocket(target);
    this.pulsed = target.socketId;
    return 'demo';
  }

  /** False when there was nothing to fly: the press then falls back to Show. */
  private place(target: HelperTarget): boolean {
    this.stopCues();
    return this.scene.fly(target);
  }

  private stopCues(): void {
    this.ghost?.stop();
    this.scene.clear();
    this.pulsed = null;
  }

  private putPulseOut(): void {
    this.scene.pulseSocket(null);
    this.pulsed = null;
  }

  private restartLadder(): void {
    this.rung = 0;
    this.rungAt = 0;
    const cued = this.pulsed !== null || this.slip !== null;
    this.slip = null;
    if (cued) this.stopCues();
  }

  private publish(): void {
    const slip = this.slip ?? (this.offer ? this.copy.offer : null);
    if (slip === this.state.slip && this.offer === this.state.offer) return;
    this.state = Object.freeze({ offer: this.offer, slip });
  }
}
