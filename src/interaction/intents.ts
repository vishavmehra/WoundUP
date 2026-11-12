import type { Entity } from '@iwsdk/core';

/**
 * What hand input asks the game to do (TECHNICAL_ARCHITECTURE §12, MASTER_SYSTEM_ARCHITECTURE §4.1: L3 emits intents,
 * L2 decides). Plain data; the interaction layer holds no machine or town state beyond the pose of what the hand moves.
 */
export type InteractionIntent =
  /** A part was released into a socket and is being seated. */
  | { type: 'snapped'; part: Entity; socket: Entity; socketName: string; partId: string }
  /** A seated part was pulled more than 3 cm out, so its socket is free again. */
  | { type: 'unsnapped'; part: Entity; socket: Entity; socketName: string; partId: string }
  /** A part was released next to a socket that cannot take it (wrong family or already occupied). It returns to its tray. Play the soft bonk. */
  | { type: 'rejected'; part: Entity; socket: Entity; socketName: string; partId: string; reason: 'family' | 'occupied' }
  /** Wind units were added. `units` is the new total, `gained` the units added by this event (1). */
  | { type: 'wind'; key: Entity; units: number; gained: number; hand: 'left' | 'right' }
  /** The player let go of the key. `gained` is the total added during that grab. */
  | { type: 'windEnd'; key: Entity; units: number; gained: number; hand: 'left' | 'right' }
  /** X-ray switched on or off. The flag in xray-state.ts holds the same value. */
  | { type: 'xray'; active: boolean };

export type IntentListener = (intent: InteractionIntent) => void;

/** A minimal synchronous event bus. Listeners run inside the emitting system's update, so they must be quick. */
export class IntentBus {
  private readonly listeners = new Set<IntentListener>();

  subscribe(listener: IntentListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(intent: InteractionIntent): void {
    for (const listener of this.listeners) listener(intent);
  }
}

/** The one bus the interaction systems emit on. The game layer subscribes to it. */
export const interactionIntents = new IntentBus();
