const TAU = Math.PI * 2;

/**
 * Pose of a pin-driven follower for a cam at `angle` radians (SOLVER §8.4): the predefined profile, sampled at equal
 * angles over one revolution, linearly interpolated, periodic. Not a collision simulation.
 *
 * Pure and allocation-free, so the runtime can call it every frame with the angles it integrates itself
 * (SIMULATION_SPEC §9.1) instead of re-solving the graph (SOLVER §18). `samples` must hold at least 2 finite numbers
 * (`solve` validates the blueprint's profiles).
 */
export function sampleFollowerProfile(samples: readonly number[], angle: number): number {
  const n = samples.length;
  const turns = angle / TAU;
  const position = (turns - Math.floor(turns)) * n; // [0, n), wraps for negative and multi-turn angles
  const index = Math.floor(position);
  const fraction = position - index;
  const a = samples[index % n]; // % n: rounding may land exactly on n, which is sample 0 again
  const b = samples[(index + 1) % n];
  return a + (b - a) * fraction;
}
