import { describe, expect, it } from 'vitest';
import { LESSON_GESTURE, LESSON_IDS, lessonSeconds } from '../../src/onboarding/lessons';
import { FIRST_DELAY_S, IDLE_S, OnboardingTracker, RETRY_S } from '../../src/onboarding/tracker';

/** When the ghost hands show (PRODUCT_SPEC F15, §15; INTERACTION_SPEC §17): first encounter, the 20 s idle replay, dismissal and learning. */

const DT = 0.1;

/** Runs the tracker for `seconds` in one situation and returns what the cue was at each step (a copy of kind and t, or null). */
function run(tracker: OnboardingTracker, seconds: number, lesson: Parameters<OnboardingTracker['update']>[1], busy = false) {
  const seen: Array<{ kind: string; t: number; lesson: string; fresh: boolean } | null> = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    const cue = tracker.update(DT, lesson, busy);
    seen.push(cue ? { kind: cue.kind, t: cue.t, lesson: cue.lesson, fresh: cue.fresh } : null);
  }
  return seen;
}
const shown = (seen: ReturnType<typeof run>): boolean => seen.some((s) => s !== null);
const starts = (seen: ReturnType<typeof run>): string[] => seen.filter((s) => s?.fresh).map((s) => (s as { kind: string }).kind);

describe('the lessons', () => {
  it('has a gesture and a length for every lesson, in the order a first session meets them', () => {
    expect(LESSON_IDS).toEqual(['latch', 'letter', 'parcel', 'grab', 'wind', 'run', 'place', 'xray']);
    for (const id of LESSON_IDS) {
      expect(LESSON_GESTURE[id]).toBeDefined();
      expect(lessonSeconds(id)).toBeGreaterThan(2);
    }
  });
});

describe('first encounter', () => {
  it('shows nothing before the first delay, then one demonstration, flagged fresh on its first frame only', () => {
    const tracker = new OnboardingTracker();
    const early = run(tracker, FIRST_DELAY_S - 0.3, 'grab');
    expect(shown(early)).toBe(false);
    const seen = run(tracker, lessonSeconds('grab') + 1, 'grab');
    expect(starts(seen)).toEqual(['first']);
    const cues = seen.filter(Boolean) as Array<{ t: number }>;
    expect(cues[0].t).toBeLessThan(0.3);
    expect(cues.length * DT).toBeCloseTo(lessonSeconds('grab'), 0);
  });

  it('plays once: the demonstration ends and nothing follows until the idle time', () => {
    const tracker = new OnboardingTracker();
    run(tracker, FIRST_DELAY_S + lessonSeconds('grab') + 0.5, 'grab');
    expect(tracker.cue).toBeNull();
    expect(shown(run(tracker, IDLE_S - 1, 'grab'))).toBe(false);
  });

  it('shows nothing when the situation has no lesson, or while paused (null)', () => {
    const tracker = new OnboardingTracker();
    expect(shown(run(tracker, 60, null))).toBe(false);
  });

  it('does not show an already learned lesson on first encounter (an old save, a second build)', () => {
    const tracker = new OnboardingTracker(['grab']);
    expect(shown(run(tracker, IDLE_S - 1, 'grab'))).toBe(false);
  });

  it('starts over for each lesson: a new situation owes its own first showing', () => {
    const tracker = new OnboardingTracker();
    run(tracker, FIRST_DELAY_S + lessonSeconds('latch') + 1, 'latch');
    const next = run(tracker, FIRST_DELAY_S + 0.5, 'letter');
    expect(starts(next)).toEqual(['first']);
    expect((next.find(Boolean) as { lesson: string }).lesson).toBe('letter');
  });
});

describe('idle guidance (INTERACTION_SPEC §17)', () => {
  it('replays the demonstration after 20 s without progress, whether or not the lesson was learned', () => {
    for (const learned of [[], ['grab' as const]]) {
      const tracker = new OnboardingTracker(learned);
      const seen = run(tracker, IDLE_S + lessonSeconds('grab') + FIRST_DELAY_S + 3, 'grab');
      const all = starts(seen);
      expect(all[all.length - 1], `learned: ${learned.length > 0}`).toBe('idle');
    }
  });

  it('counts the 20 s from the end of the last demonstration, and from the last progress', () => {
    const tracker = new OnboardingTracker(['grab']);
    expect(shown(run(tracker, IDLE_S - 0.5, 'grab'))).toBe(false);
    tracker.progress(); // a part was seated: the count starts again
    expect(shown(run(tracker, IDLE_S - 0.5, 'grab'))).toBe(false);
    expect(starts(run(tracker, 1.5, 'grab'))).toEqual(['idle']);
  });

  it('keeps the socket pulse standing after an idle demonstration, until the player acts', () => {
    const tracker = new OnboardingTracker(['grab']);
    run(tracker, IDLE_S + 0.5, 'grab');
    expect(tracker.cue?.kind).toBe('idle');
    run(tracker, lessonSeconds('grab') + 5, 'grab');
    expect(tracker.cue).not.toBeNull(); // the hand is gone (t past the script), the pulse is not
    expect(tracker.cue!.t).toBeGreaterThan(lessonSeconds('grab'));
    tracker.progress();
    expect(tracker.cue).toBeNull();
  });

  it('shows the hand again if the pulse stood for another 20 s with no response', () => {
    const tracker = new OnboardingTracker(['grab']);
    const seen = run(tracker, IDLE_S + lessonSeconds('grab') + IDLE_S + 2, 'grab');
    expect(starts(seen)).toEqual(['idle', 'idle']);
  });
});

describe('dismissal', () => {
  it('a busy hand takes the cue away at once and restarts the idle count: an active grab is never interrupted', () => {
    const tracker = new OnboardingTracker();
    run(tracker, FIRST_DELAY_S + 1, 'grab');
    expect(tracker.cue).not.toBeNull();
    expect(tracker.update(DT, 'grab', true)).toBeNull();
    expect(tracker.cue).toBeNull();
    expect(shown(run(tracker, IDLE_S - 1, 'grab', true))).toBe(false);
    // The hand lets go: 20 s of nothing, then the idle replay (the first showing was spent by the grab itself).
    expect(shown(run(tracker, IDLE_S - 0.5, 'grab'))).toBe(false);
    expect(starts(run(tracker, 1, 'grab'))).toEqual(['idle']);
  });

  it('a grab before the first delay means no first demonstration is needed', () => {
    const tracker = new OnboardingTracker();
    run(tracker, 0.5, 'grab', true);
    expect(shown(run(tracker, FIRST_DELAY_S + 1, 'grab'))).toBe(false);
  });

  it('progress takes the cue away', () => {
    const tracker = new OnboardingTracker();
    run(tracker, FIRST_DELAY_S + 1, 'grab');
    tracker.progress();
    expect(tracker.cue).toBeNull();
    expect(shown(run(tracker, 3, 'grab'))).toBe(false);
  });

  it('complete() learns the lesson once, takes its cue away and reports whether it was new (the caller saves it)', () => {
    const tracker = new OnboardingTracker();
    run(tracker, FIRST_DELAY_S + 1, 'grab');
    expect(tracker.complete('grab')).toBe(true);
    expect(tracker.cue).toBeNull();
    expect(tracker.isLearned('grab')).toBe(true);
    expect(tracker.complete('grab')).toBe(false);
    expect(tracker.complete('wind')).toBe(true); // a lesson that is not on show can be learned too
  });

  it('a learned lesson is not shown again on first encounter after a reset to the saved list', () => {
    const tracker = new OnboardingTracker();
    tracker.complete('latch');
    tracker.reset(['latch']);
    expect(shown(run(tracker, IDLE_S - 1, 'latch'))).toBe(false);
    tracker.reset([]); // a restart clears the save
    expect(starts(run(tracker, FIRST_DELAY_S + 1, 'latch'))).toEqual(['first']);
  });

  it('ignores names that are not lessons', () => {
    const tracker = new OnboardingTracker(['grab', 'nonsense' as 'grab']);
    expect(tracker.isLearned('grab')).toBe(true);
    expect(tracker.isLearned('nonsense' as 'grab')).toBe(false);
  });
});

describe('abort (the game had nothing to point the hand at)', () => {
  it('waits before trying again, and an unlearned lesson still gets its first showing', () => {
    const tracker = new OnboardingTracker();
    const first = run(tracker, FIRST_DELAY_S + 0.3, 'grab');
    expect(starts(first)).toEqual(['first']);
    tracker.abort();
    expect(tracker.cue).toBeNull();
    expect(shown(run(tracker, RETRY_S - 0.5, 'grab'))).toBe(false);
    expect(starts(run(tracker, 1, 'grab'))).toEqual(['first']);
  });
});
