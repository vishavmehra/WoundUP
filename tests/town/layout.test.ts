import { describe, expect, it } from 'vitest';
import { MACHINE_IDS, MACHINE_PLOT, PLOT_IDS } from '../../src/game/content';
import {
  BAKERY_AT,
  machineOfPlot,
  MACHINE_SNAP_PART,
  MAX_SCENERY_BOXES,
  MAX_WAKE_SOURCES,
  MIRA_AT,
  plotIdFromSocketName,
  PLOT_CAPTURE_M,
  PLOT_WAKE_GROUP,
  PLOTS,
  SCENERY_BOXES,
  THEATRE_AT,
  WAKE_GROUP,
  WAKE_SOURCES,
} from '../../src/town/layout';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);
const source = (plot: string) => WAKE_SOURCES.find((s) => s.plot === plot);
const groupBox = (group: number) => SCENERY_BOXES.filter((b) => b.group === group);

/** The farthest point of a box's footprint from (x, z). */
function farthest(box: { min: readonly number[]; max: readonly number[] }, x: number, z: number): number {
  const fx = Math.max(Math.abs(box.min[0] - x), Math.abs(box.max[0] - x));
  const fz = Math.max(Math.abs(box.min[2] - z), Math.abs(box.max[2] - z));
  return Math.hypot(fx, fz);
}

describe('plots (TOCKTON_DIMENSIONS §3.3)', () => {
  it('has the four pad centres of the dimensions table', () => {
    expect(PLOTS.plot_clock_tower).toMatchObject({ x: -0.2425, z: 0.0825 });
    expect(PLOTS.plot_music_box).toMatchObject({ x: -0.11, z: 0.08 });
    expect(PLOTS.plot_carousel).toMatchObject({ x: 0.11, z: 0.065 });
    expect(PLOTS.plot_windmill).toMatchObject({ x: 0.2425, z: 0.0647 });
  });

  it('puts the Well and the Belfry side by side in the right zone behind the Windmill, at the pads of their blueprints (ADR-048)', () => {
    // WELL_FOUNTAIN_BLUEPRINT §9.1: pad x 14.3 to 21.1, z -7.6 to -1.6; BELFRY_BLUEPRINT §9.1: pad x 21.6 to 29.6, same z.
    const edges = (id: 'plot_well' | 'plot_belfry') => ({
      x: [PLOTS[id].x - PLOTS[id].halfW, PLOTS[id].x + PLOTS[id].halfW].map((v) => Math.round(v * 1e4) / 100),
      z: [PLOTS[id].z - PLOTS[id].halfD, PLOTS[id].z + PLOTS[id].halfD].map((v) => Math.round(v * 1e4) / 100),
    });
    expect(edges('plot_well')).toEqual({ x: [14.3, 21.1], z: [-7.6, -1.6] });
    expect(edges('plot_belfry')).toEqual({ x: [21.6, 29.6], z: [-7.6, -1.6] });
    expect(PLOTS.plot_well).toMatchObject({ x: 0.177, z: -0.046, socket: 'PlotWell' });
    expect(PLOTS.plot_belfry).toMatchObject({ x: 0.256, z: -0.046, socket: 'PlotBelfry' });
    // 0.5 cm apart, behind the Windmill pad (its back edge is z -0.56 cm), clear of the Bakery (right edge x 13.5 cm).
    expect(PLOTS.plot_belfry.x - PLOTS.plot_belfry.halfW - (PLOTS.plot_well.x + PLOTS.plot_well.halfW)).toBeCloseTo(0.005, 9);
    expect(PLOTS.plot_well.z + PLOTS.plot_well.halfD).toBeLessThan(PLOTS.plot_windmill.z - PLOTS.plot_windmill.halfD);
    expect(PLOTS.plot_well.x - PLOTS.plot_well.halfW).toBeGreaterThan(BAKERY_AT.x + 0.065);
  });

  it('gives the Well and the Belfry alone a 9 cm capture radius, 11 cm with Easy Snap (ADR-048), and no other plot one', () => {
    expect(PLOT_CAPTURE_M).toEqual({ plot_well: { radius: 0.09, easyRadius: 0.11 }, plot_belfry: { radius: 0.09, easyRadius: 0.11 } });
    // Only a machine's own plot accepts it, and the two pads are 7.9 cm apart, so a wider radius cannot take the wrong machine.
    expect(dist(PLOTS.plot_well, PLOTS.plot_belfry)).toBeCloseTo(0.079, 9);
    expect(MACHINE_SNAP_PART.well).toBe('well_base');
    expect(MACHINE_SNAP_PART.belfry).toBe('belfry_base');
  });

  it('keeps every pad inside the 60 x 30 cm town and clear of the others', () => {
    const pads = PLOT_IDS.map((id) => PLOTS[id]);
    for (const p of pads) {
      expect(Math.abs(p.x) + p.halfW).toBeLessThanOrEqual(0.3);
      expect(Math.abs(p.z) + p.halfD).toBeLessThanOrEqual(0.15);
    }
    for (const a of pads) {
      for (const b of pads) {
        if (a === b) continue;
        const apart = Math.abs(a.x - b.x) >= a.halfW + b.halfW || Math.abs(a.z - b.z) >= a.halfD + b.halfD;
        expect(apart, `${a.id} and ${b.id} overlap`).toBe(true);
      }
    }
  });

  it('reads a plot id from the socket name of town_ground.glb', () => {
    expect(plotIdFromSocketName('PlotMusicBox')).toBe('plot_music_box');
    expect(plotIdFromSocketName('PlotClockTower')).toBe('plot_clock_tower');
    expect(plotIdFromSocketName('PlotCarousel')).toBe('plot_carousel');
    expect(plotIdFromSocketName('PlotWindmill')).toBe('plot_windmill');
    expect(plotIdFromSocketName('PlotWell')).toBe('plot_well');
    expect(plotIdFromSocketName('PlotBelfry')).toBe('plot_belfry');
    for (const id of PLOT_IDS) expect(plotIdFromSocketName(PLOTS[id].socket)).toBe(id);
    for (const other of ['Baker', 'Key', 'PlotNothing', 'Plot', '', 'plotmusicbox']) expect(plotIdFromSocketName(other)).toBeNull();
  });

  it('pairs every machine with its own plot and its own base part id', () => {
    for (const m of MACHINE_IDS) expect(machineOfPlot(MACHINE_PLOT[m])).toBe(m);
    expect(new Set(MACHINE_IDS.map((m) => MACHINE_SNAP_PART[m])).size).toBe(MACHINE_IDS.length);
    expect(MACHINE_SNAP_PART.music_box).toBe('music_box_case');
  });
});

describe('frozen scenery and wake sources', () => {
  it('fits the shader constants', () => {
    expect(SCENERY_BOXES.length).toBeLessThanOrEqual(MAX_SCENERY_BOXES);
    expect(WAKE_SOURCES.length).toBeLessThanOrEqual(MAX_WAKE_SOURCES);
    const groups = Object.values(WAKE_GROUP);
    expect(new Set(groups).size).toBe(groups.length);
    for (const g of groups) expect(g & (g - 1), `group ${g} is not a single bit`).toBe(0);
  });

  it('has one source per plot, at its own pad centre', () => {
    for (const id of PLOT_IDS) {
      const s = source(id);
      expect(s, id).toBeDefined();
      expect(s).toMatchObject({ x: PLOTS[id].x, z: PLOTS[id].z });
    }
  });

  it('wakes what the specification says each plot wakes (PRODUCT_SPEC §6)', () => {
    const windmill = source('plot_windmill')!;
    const clock = source('plot_clock_tower')!;
    const music = source('plot_music_box')!;
    const carousel = source('plot_carousel')!;
    // The Windmill wakes the Bakery (and Otto inside it); the Clock Tower the theatre; the Music Box Mira.
    expect(windmill.wakes & WAKE_GROUP.bakery).toBeTruthy();
    expect(clock.wakes & WAKE_GROUP.theatre).toBeTruthy();
    expect(music.wakes & WAKE_GROUP.mira).toBeTruthy();
    // And nothing else wakes them.
    for (const s of [music, carousel, clock]) expect(s.wakes & WAKE_GROUP.bakery, s.plot).toBe(0);
    for (const s of [music, carousel, windmill]) expect(s.wakes & WAKE_GROUP.theatre, s.plot).toBe(0);
    for (const s of [carousel, windmill, clock]) expect(s.wakes & WAKE_GROUP.mira, s.plot).toBe(0);
    // The Well and the Belfry wake the street and their own pad, and nothing else (the dressing beside them wakes through its table rows).
    for (const id of ['plot_well', 'plot_belfry'] as const) {
      const s = source(id)!;
      for (const group of [WAKE_GROUP.bakery, WAKE_GROUP.theatre, WAKE_GROUP.mira]) expect(s.wakes & group, id).toBe(0);
    }
    // A plot wakes its own pad and no other pad.
    for (const id of PLOT_IDS) {
      const pad = PLOT_WAKE_GROUP[id];
      const pads = Object.values(PLOT_WAKE_GROUP).reduce((a, b) => a | b, 0);
      expect(source(id)!.wakes & pads, id).toBe(pad);
    }
  });

  it("lets each ripple reach the far corner of everything it wakes", () => {
    for (const s of WAKE_SOURCES) {
      for (const box of SCENERY_BOXES) {
        if (!(s.wakes & box.group)) continue;
        if (box.group === WAKE_GROUP.street) continue; // the street is covered together, below
        expect(farthest(box, s.x, s.z), `${s.plot} -> group ${box.group}`).toBeLessThanOrEqual(s.radius);
      }
    }
  });

  it('wakes no part of the street twice over: every street point is reached by some plot once all four are awake', () => {
    const street = groupBox(WAKE_GROUP.street)[0];
    for (let x = street.min[0]; x <= street.max[0]; x += 0.01) {
      for (let z = street.min[2]; z <= street.max[2]; z += 0.01) {
        const reached = WAKE_SOURCES.some((s) => s.wakes & WAKE_GROUP.street && dist(s, { x, z }) <= s.radius);
        expect(reached, `street point ${x.toFixed(2)}, ${z.toFixed(2)}`).toBe(true);
      }
    }
  });

  it('keeps Bakery, theatre and Mira where the dimensions table puts them', () => {
    expect(BAKERY_AT).toEqual({ x: 0.07, z: -0.0925 });
    expect(THEATRE_AT).toEqual({ x: -0.1, z: -0.0725 });
    const mira = groupBox(WAKE_GROUP.mira)[0];
    expect(MIRA_AT.x).toBeGreaterThan(mira.min[0]);
    expect(MIRA_AT.x).toBeLessThan(mira.max[0]);
    // Mira stands in the aisle beside the Music Box plot, 2.1 cm clear of the key.
    expect(dist(MIRA_AT, PLOTS.plot_music_box)).toBeLessThan(0.14);
    // Machines stand above the pads, so no pad box reaches up into them.
    for (const id of PLOT_IDS) {
      const pad = SCENERY_BOXES.find((b) => b.min[0] === PLOTS[id].x - PLOTS[id].halfW && b.min[2] === PLOTS[id].z - PLOTS[id].halfD)!;
      expect(pad.max[1]).toBeLessThan(0.0061);
    }
  });
});
