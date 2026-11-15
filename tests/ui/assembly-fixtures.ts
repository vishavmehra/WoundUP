import type { AssemblyView } from '../../src/ui/assembly';

/** The Music Box's stages as the design's §8.1 counts them (6 + 5 + 4 + 3 + 5 + 4 + 7 placements), with names of the length the sheet is set for. */
export const STAGES = [
  ['frame', 'Frame', 6],
  ['governor_end', 'Governor end', 5],
  ['cylinder', 'Melody cylinder', 4],
  ['drive_end', 'Drive end', 3],
  ['comb', 'Comb', 5],
  ['governor', 'Governor', 4],
  ['power', 'Power unit', 7],
] as const;

/** A build in progress: `done` placements made, in order, across the whole machine. */
export function viewAt(done: number): AssemblyView {
  let left = done;
  let step = 0;
  const stages = STAGES.map(([id, name, steps]) => {
    const d = Math.min(steps, Math.max(0, left));
    left -= steps;
    step += steps;
    return { id, name, steps, done: d };
  });
  const current = stages.findIndex((s) => s.done < s.steps);
  const labels = ['Left bracket', 'Bush', 'Screw', 'Right bracket', 'Bush', 'Screw', 'Arbor', 'Governor wheel'];
  const upcoming = current < 0 ? [] : [0, 1, 2].filter((k) => done + k < step).map((k) => ({ n: done + k + 1, label: labels[(done + k) % labels.length] }));
  return { stages, current, upcoming };
}

