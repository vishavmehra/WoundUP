/**
 * What the director tells the UI about a build with stages (ADR-050, INTRICATE_ASSEMBLY_DESIGN §7). Plain data and pure functions: the
 * UI paints it and never decides it. The director (or the step engine, rule R4) fills it as parts seat and are removed, and the UI
 * repaints the sheet when it changes; nothing here knows Three.js, IWSDK or the blueprint types.
 */

/** One stage of the build: a row on the sheet with one pip per placement. */
export interface AssemblyStage {
  readonly id: string;
  /** Short, in the player's words ("Frame", "Melody cylinder"). */
  readonly name: string;
  /** Placements in the stage, and how many are done. */
  readonly steps: number;
  readonly done: number;
}

/** One step the player may do now or next: its number across the whole machine (1 to 34 for the Music Box) and what it is. */
export interface AssemblyStep {
  readonly n: number;
  /** "Right bracket", "Washer". The first letter is capitalised by the caller. */
  readonly label: string;
}

export interface AssemblyView {
  readonly stages: readonly AssemblyStage[];
  /** The stage being built, an index into `stages`, or -1 when every stage is closed. */
  readonly current: number;
  /** The step to do now, then the next one or two; empty when every stage is closed. */
  readonly upcoming: readonly AssemblyStep[];
}

/** The Helper medallion's state: the director raises `offer` after mistakes or idle time and lowers it on progress. */
export interface HelperView {
  /** A glow on the medallion (never a pop-up): a slow breath for `HELPER_BREATH_S`, then a dim steady glow until the player acts. */
  readonly offer: boolean;
  /** One line above the medallion ("Need a hand?", "Next: the left bracket"), or null for none. */
  readonly slip: string | null;
}

export const NO_HELPER: HelperView = { offer: false, slip: null };

/** How long the offer breathes before it settles to a dim steady glow, and the breath's period (design §7.1). */
export const HELPER_BREATH_S = 12;
export const HELPER_PERIOD_S = 2;
/** After every press the medallion is inert for this long, so a double poke cannot skip a rung of the ladder (design §7.1, §7.2). */
export const HELPER_COOLDOWN_S = 1.2;
/** A press this long, in hands mode, is the third rung at once (design §7.2). */
export const HELPER_HOLD_S = 0.8;
/** The Master "?" shows the current step this long (design §6.1). */
export const STEP_REVEAL_S = 8;

export const stageClosed = (s: AssemblyStage): boolean => s.done >= s.steps;

/** Placements done and total over all stages, and the fraction (0 for an empty build). */
export function assemblyProgress(view: AssemblyView): { done: number; total: number; fraction: number } {
  let done = 0;
  let total = 0;
  for (const s of view.stages) {
    done += Math.min(s.done, s.steps);
    total += s.steps;
  }
  return { done, total, fraction: total > 0 ? done / total : 0 };
}

/** The glow's strength at `age` seconds into an offer: a breath for `HELPER_BREATH_S`, then a dim steady glow (0.3). Pure, so a test can check the curve. */
export function offerGlow(age: number): number {
  if (age >= HELPER_BREATH_S) return 0.3;
  const phase = (age % HELPER_PERIOD_S) / HELPER_PERIOD_S;
  return 0.3 + 0.7 * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
}

/** A string that changes exactly when what the sheet shows changes, so an unchanged view is never repainted. */
export function assemblyKey(view: AssemblyView, titlesOnly: boolean): string {
  return `${titlesOnly ? 'T' : 'S'}|${view.current}|${view.stages.map((s) => `${s.id}:${s.done}/${s.steps}`).join(',')}|${view.upcoming.map((u) => `${u.n}:${u.label}`).join(',')}`;
}

/** The dial: ticks along an arc, the needle at the share of placements done. Angles in radians, 0 at the right, y down (canvas). */
export const DIAL = { start: Math.PI * 0.8, sweep: Math.PI * 1.4 } as const;

/** Angle of tick `i` of `n` (centred in its share of the arc). */
export const tickAngle = (i: number, n: number): number => DIAL.start + ((i + 0.5) / Math.max(1, n)) * DIAL.sweep;

/** Angle of the needle at `fraction` (0 to 1) of the whole build. */
export const needleAngle = (fraction: number): number => DIAL.start + Math.min(1, Math.max(0, fraction)) * DIAL.sweep;
