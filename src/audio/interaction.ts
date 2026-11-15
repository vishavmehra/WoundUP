import { interactionIntents } from '../interaction/intents';
import type { AudioEngine } from './engine';

/**
 * Plays the interaction sounds from the interaction layer's intents (the one place that knows which sound goes with which
 * intent): a snap click when a part seats, a soft bonk when one is refused, the ratchet for each wind unit. Returns the
 * unsubscribe function. The wake chime and the melody belong to the town, not to a single intent.
 *
 * `snaps: false` leaves the `snapped` intent silent here, for a game layer that plays every snap itself with the sound of the
 * part's material (`AssemblyFeedback.onSnap`, src/assembly/feedback.ts): binding both would sound each snap twice.
 */
export function bindInteractionAudio(audio: AudioEngine, options: { readonly snaps?: boolean } = {}): () => void {
  const snaps = options.snaps ?? true;
  return interactionIntents.subscribe((intent) => {
    switch (intent.type) {
      case 'snapped':
        if (snaps) audio.snap();
        break;
      case 'rejected':
        audio.bonk();
        break;
      case 'wind':
        audio.wind(intent.units);
        break;
      default:
        break;
    }
  });
}
