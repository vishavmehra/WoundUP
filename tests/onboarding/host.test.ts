import { describe, expect, it } from 'vitest';
import type { LessonId } from '../../src/game/content';
import { createGuideHost } from '../../src/onboarding/host';
import type { BuildView, CarriedView, GameplayView } from '../../src/onboarding/host';

/**
 * Which lesson the situation calls for (PRODUCT_SPEC F15, §15; COMPETITION_REQUIREMENTS §5.1): the trunk, the letter, the parcel, the part to
 * its socket, the key, Run, the machine to its plot, and X-ray after a run that failed. Read from the game's own state, never from a timer.
 */

interface Situation {
  presenting?: boolean;
  mode?: string;
  panel?: string;
  trunk?: string;
  envelope?: string;
  parcel?: string;
  tray?: boolean;
  result?: unknown;
  xrayHint?: boolean;
  keyByHand?: boolean;
  units?: number;
  build?: boolean;
  carried?: boolean;
}

const lessonOf = (s: Situation): LessonId | null => {
  const build = (s.build ?? true)
    ? ({ blueprint: { sockets: [{ id: 'SOCKET_Key', family: s.keyByHand === false ? 'other' : 'winding_key' }] }, fixed: {} } as unknown as BuildView)
    : null;
  const game = {
    presenting: () => s.presenting ?? true,
    session: { mode: s.mode ?? 'build' },
    ui: {
      currentView: { panel: s.panel ?? 'none', envelope: s.envelope ?? 'hidden', parcel: s.parcel ?? 'open', tray: s.tray ?? true, xrayHint: s.xrayHint ?? false },
      localFlow: { trunk: s.trunk ?? 'gone', result: s.result ?? null },
    },
    build: () => build,
    carried: () => ((s.carried ?? false) ? ({} as CarriedView) : null),
    windUnits: () => s.units ?? 0,
  } as unknown as GameplayView;
  return createGuideHost(game).lesson();
};

describe('which lesson the situation calls for', () => {
  it('the introduction teaches the latch until the trunk is open', () => {
    expect(lessonOf({ mode: 'intro', trunk: 'closed' })).toBe('latch');
    expect(lessonOf({ mode: 'intro', trunk: 'opening' })).toBeNull();
  });

  it('the town teaches the letter while it is sealed', () => {
    expect(lessonOf({ mode: 'town', envelope: 'sealed' })).toBe('letter');
    expect(lessonOf({ mode: 'town', envelope: 'open' })).toBeNull();
  });

  it('the bench teaches the parcel, then the pinch that carries a part to its socket', () => {
    expect(lessonOf({ mode: 'build', parcel: 'closed' })).toBe('parcel');
    expect(lessonOf({ mode: 'build', parcel: 'open', tray: true })).toBe('grab');
    expect(lessonOf({ mode: 'build', parcel: 'open', tray: false })).toBeNull();
    expect(lessonOf({ mode: 'build', parcel: 'open', tray: true, build: false })).toBeNull(); // nothing built yet: no socket to point at
  });

  it('winding teaches the wrist twist on a key a hand turns, then Run once a unit is wound', () => {
    expect(lessonOf({ mode: 'wind', units: 0 })).toBe('wind');
    expect(lessonOf({ mode: 'wind', units: 3 })).toBe('run');
    expect(lessonOf({ mode: 'wind', units: 0, keyByHand: false })).toBe('run'); // a machine with no key to turn goes straight to Run
    expect(lessonOf({ mode: 'wind', build: false })).toBeNull();
  });

  it('a run that did not work shows the X-ray lesson only while the lens slip is up', () => {
    const failed = { status: 'jam' };
    expect(lessonOf({ mode: 'wind', result: failed, xrayHint: true })).toBe('xray');
    expect(lessonOf({ mode: 'wind', result: failed, xrayHint: false })).toBeNull(); // the player switched the hint off
  });

  it('placing teaches the carry to the plot while the machine waits to be carried', () => {
    expect(lessonOf({ mode: 'place', carried: true })).toBe('place');
    expect(lessonOf({ mode: 'place', carried: false })).toBeNull();
  });

  it('teaches nothing under a panel (pause, restart, gift), nor before the session shows the stage, nor in the gift viewer', () => {
    expect(lessonOf({ mode: 'intro', trunk: 'closed', panel: 'pause' })).toBeNull();
    expect(lessonOf({ mode: 'build', panel: 'restart' })).toBeNull();
    expect(lessonOf({ mode: 'intro', trunk: 'closed', presenting: false })).toBeNull();
    expect(lessonOf({ mode: 'gift' })).toBeNull();
  });
});
