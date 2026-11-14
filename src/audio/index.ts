/**
 * Procedural audio (Web Audio API only, no files): the Music Box melody, winding ratchet, snap click, bonk and the wake chime.
 * Create one `AudioEngine`, call `installGestureUnlock()` once at startup, and `bindInteractionAudio(engine)`; the town takes the
 * engine as its `TownAudio`.
 */
export { AudioEngine, MAX_PLUCK_VOICES } from './engine';
export type { AudioEngineOptions, TownAudio } from './engine';
export { bindInteractionAudio } from './interaction';
export { MELODY, STEPS_PER_TURN, WAKE_CHIMES, midiToHz, notesBetween } from './notes';
export type { MelodyNote } from './notes';
