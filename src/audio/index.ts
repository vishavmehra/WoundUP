/**
 * Procedural audio (Web Audio API only, no files): the Music Box melody, winding ratchet, snap click (plus the per-material snaps,
 * stage chords, dial tick and lid sounds of the intricate assembly), bonk, the wake chime, and the Clock Tower's tick and bell.
 * Create one `AudioEngine`, call `installGestureUnlock()` once at startup, and `bindInteractionAudio(engine)`; the town takes the
 * engine as its `TownAudio`.
 */
export { AudioEngine, MAX_PLUCK_VOICES } from './engine';
export type { AudioEngineOptions, TownAudio } from './engine';
export { bindClockTowerAudio } from './clock-tower';
export { bindInteractionAudio } from './interaction';
export {
  MAX_SNAP_STEP,
  MELODY,
  SNAP_STEP_SEMITONES,
  STEPS_PER_TURN,
  WAKE_CHIMES,
  midiToHz,
  notesBetween,
  stageChord,
  stepLift,
} from './notes';
export type { MelodyNote } from './notes';
export { SNAP_VOICES, isSnapVoice } from './voices';
export type { SnapVoice } from './voices';
