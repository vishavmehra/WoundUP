import { describe, expect, it } from 'vitest';
import { standZoom } from '../src/stage-framing';

describe('standZoom', () => {
  it('leaves landscape windows at zoom 1', () => {
    expect(standZoom(1440, 900)).toBe(1);
    expect(standZoom(844, 390)).toBe(1);
  });

  it('zooms out on portrait phones so the whole stand fits the width', () => {
    const zoom = standZoom(390, 844);
    expect(zoom).toBeLessThan(0.55);
    expect(zoom * 0.82 * 844).toBeLessThanOrEqual(390); // projected stand width stays inside the window
  });

  it('never drops below the floor, even in a degenerate window', () => {
    expect(standZoom(10, 2000)).toBe(0.3);
  });
});
