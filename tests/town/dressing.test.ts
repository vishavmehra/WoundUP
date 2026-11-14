import { describe, expect, it } from 'vitest';
import { PLOT_IDS } from '../../src/game/content';
import { DRESSING, DRESSING_NODES, dressingGrid, footprintOf, MAX_PROP_INSTANCES, NEW_PLOTS } from '../../src/town/dressing-table';
import type { DressingItem, Footprint } from '../../src/town/dressing-table';
import { BAKERY_AT, DRESS_GRID, PLOT_WAKE_GROUP, PLOTS, THEATRE_AT, WAKE_SOURCES } from '../../src/town/layout';

const EPS = 1e-9;
const overlaps = (a: Footprint, b: Footprint): boolean => a.minX < b.maxX - EPS && b.minX < a.maxX - EPS && a.minZ < b.maxZ - EPS && b.minZ < a.maxZ - EPS;
const box = (minX: number, maxX: number, minZ: number, maxZ: number): Footprint => ({ minX, maxX, minZ, maxZ });
const feet = (i: DressingItem): Footprint => footprintOf(i);

/** What no piece may stand on: the pads, the central aisle, the theatre, the Bakery and Mira's spot (TOCKTON_DIMENSIONS §3.3, §3.6). */
const KEEP_CLEAR: ReadonlyArray<readonly [string, Footprint]> = [
  ...PLOT_IDS.map((id): readonly [string, Footprint] => [
    id,
    box(PLOTS[id].x - PLOTS[id].halfW, PLOTS[id].x + PLOTS[id].halfW, PLOTS[id].z - PLOTS[id].halfD, PLOTS[id].z + PLOTS[id].halfD),
  ]),
  ['aisle', box(-0.04, 0.04, -0.015, 0.15)],
  ['theatre', box(THEATRE_AT.x - 0.1, THEATRE_AT.x + 0.1, THEATRE_AT.z - 0.0275, THEATRE_AT.z + 0.0275)],
  ['bakery', box(BAKERY_AT.x - 0.065, BAKERY_AT.x + 0.065, BAKERY_AT.z - 0.0478, BAKERY_AT.z + 0.0478)],
  ['mira', box(0.004, 0.02, 0.1045, 0.1155)],
  ['the Well and Belfry plots', box(NEW_PLOTS.minX / 100, NEW_PLOTS.maxX / 100, NEW_PLOTS.minZ / 100, NEW_PLOTS.maxZ / 100)],
];
/** The view from the stand to the theatre doors (x -5 to -0.5), Otto's window (x 1 to 4) and Mira runs through here. */
const SIGHT_CORRIDOR = box(-0.065, 0.065, -0.045, 0.15);

describe('the dressing table', () => {
  const props = DRESSING.filter((d) => DRESSING_NODES[d.node].kind === 'prop');
  const houses = DRESSING.filter((d) => DRESSING_NODES[d.node].kind === 'house');
  const lamps = DRESSING.filter((d) => DRESSING_NODES[d.node].kind === 'lamp');

  it('has the four houses once each, the lamp posts, and at most 24 prop instances (ADR-034)', () => {
    expect(houses.map((h) => h.node).sort()).toEqual(['TownHouse_Corner', 'TownHouse_Cottage', 'TownHouse_Jetty', 'TownHouse_Tall']);
    expect(lamps.length).toBeGreaterThanOrEqual(4);
    expect(props.length).toBeGreaterThan(0);
    expect(props.length).toBeLessThanOrEqual(MAX_PROP_INSTANCES);
    expect(new Set(DRESSING.map((d) => d.id)).size).toBe(DRESSING.length);
  });

  it('stands the houses in their two zones, facing the street, the right ones behind the new plots (lead, 2026-11-14)', () => {
    const zone = { left: box(-0.3, -0.205, -0.15, 0.03), right: box(0.14, 0.3, -0.15, NEW_PLOTS.minZ / 100) };
    for (const h of houses) {
      expect(h.yawDeg).toBe(0);
      const left = h.node === 'TownHouse_Tall' || h.node === 'TownHouse_Corner';
      const z = left ? zone.left : zone.right;
      const f = feet(h);
      expect(f.minX, h.id).toBeGreaterThanOrEqual(z.minX - 1e-9);
      expect(f.maxX, h.id).toBeLessThanOrEqual(z.maxX + 1e-9);
      expect(f.minZ, h.id).toBeGreaterThanOrEqual(z.minZ - 1e-9);
      expect(f.maxZ, `${h.id} reaches the Well and Belfry plots`).toBeLessThanOrEqual(z.maxZ + 1e-9);
      expect(h.wakes, h.id).toBe(left ? 'plot_clock_tower' : 'plot_windmill'); // the zone's plot (§2 "Wake group")
    }
  });

  it('keeps every piece inside the ground and off the pads, the new plots, the aisle and the buildings', () => {
    for (const d of DRESSING) {
      const f = feet(d);
      expect(f.minX, d.id).toBeGreaterThanOrEqual(-0.3 - EPS);
      expect(f.maxX, d.id).toBeLessThanOrEqual(0.3 + EPS);
      expect(f.minZ, d.id).toBeGreaterThanOrEqual(-0.15 - EPS);
      expect(f.maxZ, d.id).toBeLessThanOrEqual(0.15 + EPS);
      for (const [name, area] of KEEP_CLEAR) expect(overlaps(f, area), `${d.id} stands on ${name}`).toBe(false);
    }
  });

  it('repeats no prop more than five times (EXTRA_ASSET_SPECS §3) and keeps lamps to the six of the manifest', () => {
    for (const name of Object.keys(DRESSING_NODES)) {
      const n = DRESSING.filter((d) => d.node === name).length;
      expect(n, name).toBeLessThanOrEqual(name === 'LampPost' ? 6 : 5);
    }
  });

  it('keeps the sight corridor to the theatre doors, Otto and Mira clear', () => {
    for (const d of DRESSING) expect(overlaps(feet(d), SIGHT_CORRIDOR), `${d.id} blocks the corridor`).toBe(false);
  });

  it('never overlaps one piece with another', () => {
    for (let i = 0; i < DRESSING.length; i++) {
      for (let j = i + 1; j < DRESSING.length; j++) {
        expect(overlaps(feet(DRESSING[i]), feet(DRESSING[j])), `${DRESSING[i].id} and ${DRESSING[j].id}`).toBe(false);
      }
    }
  });

  it('keeps every piece inside the ripple of the plot that wakes it, so it can never stay frozen', () => {
    for (const d of DRESSING) {
      const src = WAKE_SOURCES.find((s) => s.plot === d.wakes)!;
      expect(src.wakes & PLOT_WAKE_GROUP[d.wakes], `${d.wakes} wakes its own group`).not.toBe(0);
      const f = feet(d);
      const far = Math.max(
        Math.hypot(f.minX - src.x, f.minZ - src.z),
        Math.hypot(f.maxX - src.x, f.minZ - src.z),
        Math.hypot(f.minX - src.x, f.maxZ - src.z),
        Math.hypot(f.maxX - src.x, f.maxZ - src.z),
      );
      expect(far, d.id).toBeLessThan(src.radius - 0.01);
    }
  });

  it('wakes with every plot: each of the four wakes something', () => {
    for (const id of PLOT_IDS) expect(DRESSING.some((d) => d.wakes === id), id).toBe(true);
  });
});

describe('dressingGrid', () => {
  const grid = dressingGrid();
  const cellAt = (xCm: number, zCm: number): number => {
    const { x0, z0, cell, w } = DRESS_GRID;
    return grid[Math.floor((zCm / 100 - z0) / cell) * w + Math.floor((xCm / 100 - x0) / cell)];
  };

  it('marks the cells under a piece with the group of the plot that wakes it, and nothing else', () => {
    expect(cellAt(-27.69, -11.56)).toBe(PLOT_WAKE_GROUP.plot_clock_tower); // the Tall house
    expect(cellAt(18.11, -11.4)).toBe(PLOT_WAKE_GROUP.plot_windmill); // the Cottage
    expect(cellAt(11.4, -3.0)).toBe(PLOT_WAKE_GROUP.plot_carousel); // the right bench
    expect(cellAt(0, 0)).toBe(0); // the aisle
    expect(cellAt(-11, 8)).toBe(0); // the Music Box pad
    expect(cellAt(7, -9)).toBe(0); // the Bakery
  });

  it('marks even the thinnest piece (a 4.5 mm fence) on at least one row of cells', () => {
    expect(cellAt(-26.9, -7.4)).toBe(PLOT_WAKE_GROUP.plot_clock_tower);
  });

  it('turns a piece with its yaw', () => {
    const turned = dressingGrid([{ id: 't', node: 'TownProp_Fence', x: -10, z: 0, yawDeg: 90, wakes: 'plot_music_box' }]);
    const at = (xCm: number, zCm: number): number => turned[Math.floor((zCm / 100 - DRESS_GRID.z0) / DRESS_GRID.cell) * DRESS_GRID.w + Math.floor((xCm / 100 + 0.3) / DRESS_GRID.cell)];
    expect(at(-10, 2.5)).not.toBe(0); // a fence turned 90 degrees runs along z
    expect(at(-7, 0)).toBe(0); // and no longer along x
  });

  it('fits the texture and uses only the four plot groups', () => {
    expect(grid.length).toBe(DRESS_GRID.w * DRESS_GRID.h);
    const allowed = Object.values(PLOT_WAKE_GROUP).reduce((a, b) => a | b, 0);
    for (const v of grid) expect(v & ~allowed).toBe(0);
  });
});
