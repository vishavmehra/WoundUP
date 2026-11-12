import { interactionIntents } from '../interaction/intents';
import type { AudioEngine } from './engine';

/**
 * Plays the interaction sounds from the interaction layer's intents (the one place that knows which sound goes with which
 * intent): a snap click when a part seats, a soft bonk when one is refused, the ratchet for each wind unit. Returns the
 * unsubscribe function. The wake chime and the melody belong to the town, not to a single intent.
 */
export function bindInteractionAudio(audio: AudioEngine): () => void {
  return interactionIntents.subscribe((intent) => {
    switch (intent.type) {
      case 'snapped':
        audio.snap();
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
