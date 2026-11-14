import type { ClockTowerEvents } from '../machines/clock-tower/runtime';
import type { AudioEngine } from './engine';

/**
 * Plays the Clock Tower's sounds from its events (the one place that knows which sound goes with which event): the pendulum's tick
 * and tock on every beat, and the bell on every strike of the hour. Returns the unsubscribe function. The wake chime of its plot
 * belongs to the town.
 */
export function bindClockTowerAudio(audio: Pick<AudioEngine, 'tick' | 'bell'>, events: ClockTowerEvents): () => void {
  return events.subscribe({
    tick: (parity) => audio.tick(parity),
    strike: (index, total) => audio.bell(index, total),
  });
}
