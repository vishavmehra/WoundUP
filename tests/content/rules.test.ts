import { describe, expect, it } from 'vitest';
import { filledDependents, MUSIC_BOX, unmetDependencies } from '../../src/content/blueprints';

describe('socket dependency rules (MUSIC_BOX_BLUEPRINT §7.1 Removal)', () => {
  it('say which sockets must be filled first, and only those still empty', () => {
    expect(unmetDependencies(MUSIC_BOX, {}, 'bracket_left')).toEqual([]);
    expect(unmetDependencies(MUSIC_BOX, {}, 'arbor')).toEqual(['bracket_left', 'bracket_right']);
    expect(unmetDependencies(MUSIC_BOX, { bracket_left: 'bracket_support_brass' }, 'arbor')).toEqual(['bracket_right']);
    expect(unmetDependencies(MUSIC_BOX, MUSIC_BOX.intended, 'arbor')).toEqual([]);
    expect(unmetDependencies(MUSIC_BOX, {}, 'no_such_socket')).toEqual([]);
  });

  it('forbid removing a part while something that depends on it is installed: Letter 2 takes the key and pinion off before the spring', () => {
    expect(filledDependents(MUSIC_BOX, MUSIC_BOX.intended, 'main_spring').sort()).toEqual(['spring_pinion', 'winding_key']);
    const { winding_key: _key, spring_pinion: _pinion, ...rest } = MUSIC_BOX.intended;
    expect(filledDependents(MUSIC_BOX, rest, 'main_spring')).toEqual([]);
    expect(filledDependents(MUSIC_BOX, {}, 'arbor')).toEqual([]);
  });
});
