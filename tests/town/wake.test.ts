import { describe, expect, it } from 'vitest';
import type { PlotId } from '../../src/game/content';
import { MAX_WAKE_SOURCES, WAKE_SOURCES } from '../../src/town/layout';
import { FROZEN_SATURATION, FROZEN_TINT, freezeColor, rippleGlow, rippleRadius, WAKE_RIPPLE_S, WakeField } from '../../src/town/wake';
import { fs, repoUrl } from './helpers';

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

  it('freezes the shared library colours to about 0.15 displayed saturation, cool, without changing brightness (CLAUDE.md section 8)', () => {
    const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const toSrgb = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
    const luma = (c: readonly number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const saturation = (c: readonly number[]): number => (Math.max(...c) === 0 ? 0 : (Math.max(...c) - Math.min(...c)) / Math.max(...c));
    const library = JSON.parse(new TextDecoder().decode(fs.readFileSync(repoUrl('public/assets/materials/library.json')))) as {
      materials: Record<string, { color: string; proxy?: { baseColor: string } }>;
    };
    const lit = 0.8; // roughly how bright lit scenery is in the lamp-lit town
    const sats: number[] = [];
    for (const def of Object.values(library.materials)) {
      const hex = def.proxy?.baseColor ?? def.color;
      const linear = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255) * lit) as [number, number, number];
      const frozen = freezeColor(linear);
      expect(Math.abs(luma(frozen) / luma(linear) - 1)).toBeLessThan(0.03); // brightness kept
      expect(frozen[2]).toBeGreaterThanOrEqual(frozen[0]); // cool: blue at least as strong as red
      sats.push(saturation(frozen.map((v) => toSrgb(Math.max(0, v)))));
    }
    expect(sats.reduce((a, b) => a + b, 0) / sats.length).toBeGreaterThan(0.12);
    expect(sats.reduce((a, b) => a + b, 0) / sats.length).toBeLessThan(0.18);
    expect(Math.min(...sats)).toBeGreaterThan(0.07);
    expect(Math.max(...sats)).toBeLessThan(0.26);
    expect(FROZEN_SATURATION).toBeCloseTo(0.15, 2);
    expect(luma(FROZEN_TINT)).toBeCloseTo(1, 6);
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
