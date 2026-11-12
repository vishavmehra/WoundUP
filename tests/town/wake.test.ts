import { describe, expect, it } from 'vitest';
import type { PlotId } from '../../src/game/content';
import { MAX_WAKE_SOURCES, WAKE_SOURCES } from '../../src/town/layout';
import { FROZEN_SATURATION, rippleGlow, rippleRadius, WAKE_RIPPLE_S, WakeField } from '../../src/town/wake';

const sourceIndex = (plot: PlotId): number => WAKE_SOURCES.findIndex((s) => s.plot === plot);
const run = (field: WakeField, seconds: number, step = 1 / 72): void => {
  for (let t = 0; t < seconds; t += step) field.update(step);
};

describe('the ripple', () => {
  it('lasts 1.5 seconds and spreads from nothing to the full radius, monotonically', () => {
    expect(WAKE_RIPPLE_S).toBe(1.5);
    expect(rippleRadius(0, 0.3)).toBe(0);
    expect(rippleRadius(WAKE_RIPPLE_S, 0.3)).toBeCloseTo(0.3, 10);
    expect(rippleRadius(99, 0.3)).toBeCloseTo(0.3, 10);
    expect(rippleRadius(-1, 0.3)).toBe(0);
    let last = -1;
    for (let t = 0; t <= WAKE_RIPPLE_S; t += 0.05) {
      const r = rippleRadius(t, 0.3);
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });

  it('glows only while the front travels', () => {
    expect(rippleGlow(0)).toBe(0);
    expect(rippleGlow(WAKE_RIPPLE_S)).toBe(0);
    expect(rippleGlow(5)).toBe(0);
    expect(rippleGlow(WAKE_RIPPLE_S / 2)).toBeCloseTo(1, 10);
    expect(rippleGlow(0.3)).toBeGreaterThan(0);
  });

  it('freezes scenery to about 0.15 saturation (CLAUDE.md section 8)', () => {
    expect(FROZEN_SATURATION).toBeCloseTo(0.15, 2);
  });
});

describe('WakeField', () => {
  it('starts frozen: radius -1 everywhere, nothing awake', () => {
    const f = new WakeField();
    expect([...f.radius]).toEqual(new Array(MAX_WAKE_SOURCES).fill(-1));
    expect(f.awakePlots()).toEqual([]);
    expect(f.update(0.1)).toBe(false);
  });

  it('spreads the ripple from the woken plot over 1.5 s and then settles', () => {
    const f = new WakeField();
    const i = sourceIndex('plot_windmill');
    expect(f.wake('plot_windmill')).toBe(true);
    expect(f.isAwake('plot_windmill')).toBe(true);
    expect(f.isSettled('plot_windmill')).toBe(false);
    expect(f.radius[i]).toBe(0);
    run(f, 0.75);
    expect(f.radius[i]).toBeGreaterThan(0.1);
    expect(f.radius[i]).toBeLessThan(WAKE_SOURCES[i].radius);
    expect(f.glow[i]).toBeGreaterThan(0.5);
    run(f, 1);
    expect(f.radius[i]).toBeCloseTo(WAKE_SOURCES[i].radius, 5);
    expect(f.glow[i]).toBe(0);
    expect(f.isSettled('plot_windmill')).toBe(true);
    expect(f.update(1 / 72)).toBe(false); // finished: nothing left to refresh
  });

  it('wakes only its own sources, and wakes a plot once', () => {
    const f = new WakeField();
    f.wake('plot_carousel');
    for (const plot of ['plot_music_box', 'plot_windmill', 'plot_clock_tower'] as const) {
      expect(f.radius[sourceIndex(plot)]).toBe(-1);
      expect(f.isAwake(plot)).toBe(false);
    }
    expect(f.wake('plot_carousel')).toBe(false);
    expect(f.awakePlots()).toEqual(['plot_carousel']);
  });

  it('restores a save without a ripple: awake, settled and at full radius at once', () => {
    const f = new WakeField();
    const i = sourceIndex('plot_music_box');
    f.wake('plot_music_box', true);
    expect(f.isSettled('plot_music_box')).toBe(true);
    expect(f.radius[i]).toBeCloseTo(WAKE_SOURCES[i].radius, 6);
    expect(f.glow[i]).toBe(0);
    expect(f.update(0.5)).toBe(false);
  });

  it('runs two ripples at once and resets to frozen', () => {
    const f = new WakeField();
    f.wake('plot_music_box');
    run(f, 0.5);
    f.wake('plot_windmill');
    expect(f.update(1 / 72)).toBe(true);
    run(f, 2);
    expect(f.isSettled('plot_music_box') && f.isSettled('plot_windmill')).toBe(true);
    f.reset();
    expect(f.awakePlots()).toEqual([]);
    expect([...f.radius]).toEqual(new Array(MAX_WAKE_SOURCES).fill(-1));
    expect([...f.glow]).toEqual(new Array(MAX_WAKE_SOURCES).fill(0));
    expect(f.update(1)).toBe(false);
  });

  it('rejects more sources than the shader has room for', () => {
    const many = Array.from({ length: MAX_WAKE_SOURCES + 1 }, () => WAKE_SOURCES[0]);
    expect(() => new WakeField(many)).toThrow(/too many/);
  });
});
