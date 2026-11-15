import { LESSON_IDS } from '../game/content';
import type { LessonId } from '../game/content';

/**
 * The ghost-hand lessons (PRODUCT_SPEC F15, §15; COMPETITION_REQUIREMENTS §5.1): what each one shows, in which gesture family, and for
 * how long. The ids are the content layer's (`LESSON_IDS`, persisted in the save as `learned`). Pure data.
 *
 *   latch   poke   the brass latch of the trunk                      the player opens the trunk
 *   letter  poke   the sealed letter                                 the player takes the letter
 *   parcel  poke   the parcel on the bench                           the player opens the parcel
 *   grab    carry  a tray part to the socket it belongs in           a hand seats a part
 *   wind    twist  the seated key, a full turn of the wrist          a hand winds the key
 *   run     poke   the Run plaque                                    the player presses Run
 *   place   carry  the finished machine to its glowing plot          the machine is placed
 *   xray    palm   a flat palm over the machine                      X-ray comes on (gesture or lens)
 */
export { LESSON_IDS };
export type { LessonId };

export type Gesture = 'poke' | 'carry' | 'twist' | 'palm';

export const LESSON_GESTURE: Readonly<Record<LessonId, Gesture>> = {
  latch: 'poke',
  letter: 'poke',
  parcel: 'poke',
  grab: 'carry',
  wind: 'twist',
  run: 'poke',
  place: 'carry',
  xray: 'palm',
};

/** How long one demonstration of each gesture family plays, seconds (the script in scripts.ts is built to exactly this length). */
export const GESTURE_SECONDS: Readonly<Record<Gesture, number>> = { poke: 3.4, carry: 5.2, twist: 5.0, palm: 4.2 };

export const lessonSeconds = (lesson: LessonId): number => GESTURE_SECONDS[LESSON_GESTURE[lesson]];

/** A lesson whose target is a socket: the socket pulses (the "next required socket" of INTERACTION_SPEC §17). */
export const hasSocketPulse = (lesson: LessonId): boolean => lesson === 'grab';
