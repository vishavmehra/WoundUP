import { LESSON_IDS, lessonSeconds } from './lessons';
import type { LessonId } from './lessons';

/**
 * When a ghost-hand lesson is shown (PRODUCT_SPEC F15, §15; INTERACTION_SPEC §17; GAMEPLAY_SYSTEMS §8.3, §18). Pure and allocation-free per
 * frame: the game tells it each frame which lesson the situation calls for and whether a hand is busy, and it answers with the cue to show.
 *
 *  - First encounter: a lesson the player has not learned is shown once, `FIRST_DELAY_S` after its situation begins.
 *  - Idle: after `IDLE_S` without progress the lesson is shown again, whether or not it was learned (INTERACTION_SPEC §17: a player who has
 *    stopped is helped, not lectured; the cue is one hand and one pulse). An idle cue's socket pulse then stays until the player acts.
 *  - A busy hand (the player is holding a part or the machine) takes the cue away at once and restarts the idle count: the guidance never
 *    interrupts an active grab and never moves anything for the player.
 *  - Progress (a part seated or removed, the key wound) restarts the idle count and takes the cue away.
 *  - `complete(lesson)` is the player doing the gesture: the lesson is learned and its cue goes. The caller saves it.
 */

/** Seconds a situation must have lasted before its lesson is first shown, so the scene is in place before a hand appears. */
export const FIRST_DELAY_S = 1.5;
/** Seconds without progress before the lesson is shown again (INTERACTION_SPEC §17: "approximately 20 seconds"). */
export const IDLE_S = 20;
/** Seconds before the next try when the game could not point the hand at anything (nothing to pick up yet). */
export const RETRY_S = 3;

export type CueKind = 'first' | 'idle';

export interface Cue {
  lesson: LessonId;
  kind: CueKind;
  /** Seconds since this showing began. Past `lessonSeconds(lesson)` the hand is gone and only an idle cue's pulse remains. */
  t: number;
  /** True for the first update of a showing: the moment to find what the hand should point at. */
  fresh: boolean;
}

export class OnboardingTracker {
  private readonly done = new Set<LessonId>();
  private lesson: LessonId | null = null;
  private sinceStart = 0;
  private idle = 0;
  private shownFirst = false;
  /** Seconds left before another showing may start (after `abort`). */
  private wait = 0;
  private active: Cue | null = null;

  constructor(learned: Iterable<LessonId> = []) {
    this.reset(learned);
  }

  /** Forgets everything and starts from `learned` (a new session, or a restart that cleared the save). */
  reset(learned: Iterable<LessonId> = []): void {
    this.done.clear();
    for (const lesson of learned) if (LESSON_IDS.includes(lesson)) this.done.add(lesson);
    this.lesson = null;
    this.sinceStart = 0;
    this.idle = 0;
    this.shownFirst = false;
    this.wait = 0;
    this.active = null;
  }

  isLearned(lesson: LessonId): boolean {
    return this.done.has(lesson);
  }

  /** The cue being shown, or null. */
  get cue(): Cue | null {
    return this.active;
  }

  /**
   * Advances by `dt` seconds. `lesson` is what the situation calls for now (null when none, or while paused); `busy` is whether a hand is
   * holding something. Returns the cue to show, or null. The returned object is reused: read it, do not keep it.
   */
  update(dt: number, lesson: LessonId | null, busy: boolean): Cue | null {
    if (lesson !== this.lesson) {
      this.lesson = lesson;
      this.sinceStart = 0;
      this.idle = 0;
      this.shownFirst = false;
      this.active = null;
    }
    if (lesson === null) return null;
    if (busy) {
      // A hand already has hold of something: no demonstration is needed for this situation, and none may interrupt it.
      this.active = null;
      this.idle = 0;
      this.shownFirst = true;
      return null;
    }
    this.sinceStart += dt;
    if (this.wait > 0) {
      this.wait -= dt;
      return null;
    }
    const cue = this.active;
    if (cue) {
      cue.fresh = false;
      cue.t += dt;
      const length = lessonSeconds(lesson);
      if (cue.kind === 'first' && cue.t >= length) {
        this.active = null;
        this.idle = 0;
      } else if (cue.kind === 'idle' && cue.t >= length + IDLE_S) {
        this.start(lesson, 'idle'); // the pulse has stood for a while with no response: show the hand again
      }
      return this.active;
    }
    this.idle += dt;
    if (!this.shownFirst && !this.done.has(lesson) && this.sinceStart >= FIRST_DELAY_S) this.start(lesson, 'first');
    else if (this.idle >= IDLE_S) this.start(lesson, 'idle');
    return this.active;
  }

  /** Assembly progress: the idle count starts again and any cue goes (a part was seated or taken out, the key was turned). */
  progress(): void {
    this.idle = 0;
    this.active = null;
  }

  /** The game could not point the hand at anything: drop the cue and try again in `RETRY_S`, not on the next frame (an unlearned lesson still owes its first showing). */
  abort(): void {
    this.active = null;
    this.idle = 0;
    this.wait = RETRY_S;
    if (this.lesson !== null && !this.done.has(this.lesson)) this.shownFirst = false; // an unlearned lesson still owes its first showing
  }

  /** The player did what `lesson` shows. Returns true the first time (the caller saves it). */
  complete(lesson: LessonId): boolean {
    const fresh = !this.done.has(lesson);
    this.done.add(lesson);
    if (this.lesson === lesson) this.progress();
    return fresh;
  }

  private start(lesson: LessonId, kind: CueKind): void {
    this.shownFirst = true;
    this.idle = 0;
    this.active = { lesson, kind, t: 0, fresh: true };
  }
}
