import { describe, expect, it } from 'vitest';
import {
  AIM_AHEAD_M,
  REACH_HALF_ANGLE_RAD,
  REACH_MAX_M,
  REACH_MIN_M,
  TOWN_FOOTPRINT,
  chooseSurface,
  type SurfaceInfo,
  type TableChoice,
  type Vec3Like,
} from '../../src/placement';
import { footprintFitsOutline, type Point2 } from '../../src/table/geometry';
import { FORWARD, HEAD, goodTable, rectSurface } from './fixtures';

const choose = (surfaces: SurfaceInfo[], head: Vec3Like = HEAD, forward: Vec3Like = FORWARD) => chooseSurface(surfaces, head, forward);

/** The four corners of the scaled, turned footprint at a choice, in world XZ. */
function footprintCorners(c: TableChoice): Point2[] {
  const s = Math.sin(c.yaw);
  const k = Math.cos(c.yaw);
  const { xMin, xMax, zMin, zMax } = TOWN_FOOTPRINT;
  return [
    [xMin, zMin],
    [xMax, zMin],
    [xMax, zMax],
    [xMin, zMax],
  ].map(([lx, lz]) => ({ x: c.x + (lx! * k + lz! * s) * c.scale, z: c.z + (-lx! * s + lz! * k) * c.scale }));
}

const insideRect = (p: Point2, r: { cx: number; cz: number; width: number; depth: number }, eps = 1e-9) =>
  Math.abs(p.x - r.cx) <= r.width / 2 + eps && Math.abs(p.z - r.cz) <= r.depth / 2 + eps;

describe('TBL-01: one suitable surface', () => {
  it('is chosen at full size, centred on the aim point, front towards the player', () => {
    const c = choose([goodTable()])!;
    expect(c).not.toBeNull();
    expect(c.scale).toBe(1);
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.z).toBeCloseTo(-AIM_AHEAD_M, 6);
    expect(c.y).toBeCloseTo(0.8, 6); // stands on the surface: neither floats nor sinks
    expect(Math.cos(c.yaw)).toBeCloseTo(1, 6); // local +Z points back at the eyes
    expect(c.preferred).toBe(false);
  });

  it('measures table height from the eyes, so every eye height gets the same view', () => {
    for (const eyeY of [0.9, 1.05, 1.2, 1.45, 1.8]) {
      const c = choose([goodTable({ y: eyeY - 0.4 })], { x: 0, y: eyeY, z: 0 })!;
      expect(c.y).toBeCloseTo(eyeY - 0.4, 6);
      expect(c.scale).toBe(1);
    }
  });

  it('follows the head position and yaw: stands 55 cm ahead and turns to face the eyes', () => {
    const head = { x: 1, y: 1.3, z: 2 };
    const forward = { x: 1, y: -0.4, z: 0 }; // looking along +X, tilted down: pitch is ignored
    const c = choose([goodTable({ cx: 1.55, cz: 2, y: 0.9 })], head, forward)!;
    expect(c.x).toBeCloseTo(1.55, 6);
    expect(c.z).toBeCloseTo(2, 6);
    expect(Math.sin(c.yaw)).toBeCloseTo(-1, 6); // local +Z -> world -X, back towards the player
    expect(Math.cos(c.yaw)).toBeCloseTo(0, 6);
  });

  it('works when the player looks straight down (gaze has no horizontal part)', () => {
    const c = choose([goodTable()], HEAD, { x: 0, y: -1, z: 0 })!;
    expect(c.z).toBeCloseTo(-AIM_AHEAD_M, 6);
    expect(Number.isFinite(c.yaw)).toBe(true);
  });

  it('accepts surfaces whose runtime reports no orientation, judged by the normal', () => {
    expect(choose([goodTable({ orientation: undefined as unknown as 'horizontal' })])).not.toBeNull();
  });
});

describe('TBL-02: each unsuitable surface alone gives no table (the stand is used)', () => {
  it('rejects a vertical surface (a wall)', () => {
    const wall = goodTable({ orientation: 'vertical', normal: { x: 0, y: 0, z: 1 } });
    expect(choose([wall])).toBeNull();
  });

  it('rejects a surface that is not level, or that faces down', () => {
    const tilt = (deg: number) => ({ x: Math.sin((deg * Math.PI) / 180), y: Math.cos((deg * Math.PI) / 180), z: 0 });
    expect(choose([goodTable({ normal: tilt(10) })])).toBeNull();
    expect(choose([goodTable({ normal: tilt(3) })])).not.toBeNull(); // control: a slightly tilted table still counts
    expect(choose([goodTable({ normal: { x: 0, y: -1, z: 0 } })])).toBeNull(); // a ceiling's underside
  });

  it('rejects the floor, by its label even at table height', () => {
    expect(choose([goodTable({ label: 'floor' })])).toBeNull();
    expect(choose([goodTable({ label: '  Floor ' })])).toBeNull();
    expect(choose([goodTable({ label: 'carpet' })])).not.toBeNull(); // other labels do not reject (SPATIAL §5.2)
  });

  it('rejects the floor by its height', () => {
    expect(choose([goodTable({ y: 0 })])).toBeNull();
  });

  it('rejects a surface above the eyes, level with them, or less than 20 cm below them', () => {
    expect(choose([goodTable({ y: 2.4 })])).toBeNull(); // ceiling
    expect(choose([goodTable({ y: 1.4 })])).toBeNull(); // above the eyes
    expect(choose([goodTable({ y: 1.2 })])).toBeNull(); // eye level
    expect(choose([goodTable({ y: 1.01 })])).toBeNull(); // 19 cm below
    expect(choose([goodTable({ y: 0.99 })])).not.toBeNull(); // 21 cm below
  });

  it('rejects a surface more than 60 cm below the eyes (a low coffee table or a seat)', () => {
    expect(choose([goodTable({ y: 0.59 })])).toBeNull(); // 61 cm below
    expect(choose([goodTable({ y: 0.61 })])).not.toBeNull(); // 59 cm below
    expect(choose([goodTable({ y: 0.45 })])).toBeNull();
  });

  it('rejects a surface out of reach (too far ahead)', () => {
    expect(choose([goodTable({ cz: -1.6 })])).toBeNull(); // spans z -2.05 to -1.15
    expect(choose([goodTable({ cz: -1.2, depth: 0.5 })])).toBeNull(); // spans z -1.45 to -0.95
  });

  it('rejects a surface behind the player', () => {
    expect(choose([goodTable({ cz: 0.55 })])).toBeNull();
  });

  it('rejects a surface beside the player, outside the 35 degree cone', () => {
    const beside = { cx: 1.0, cz: -0.45, width: 0.9, depth: 0.9 }; // x 0.55 to 1.45
    expect(choose([goodTable(beside)])).toBeNull();
    // Control: the same table moved left until it reaches into the cone.
    expect(choose([goodTable({ ...beside, cx: 0.5 })])).not.toBeNull();
  });

  it('rejects a surface too small for the footprint even at 75%', () => {
    expect(choose([goodTable({ width: 0.44, depth: 0.3 })])).toBeNull(); // 45 x 30 does not fit in 44 wide
    expect(choose([goodTable({ width: 0.45, depth: 0.29 })])).toBeNull();
    expect(choose([goodTable({ width: 0.45, depth: 0.3 })])).not.toBeNull(); // control: exactly 45 x 30
  });

  it('returns nothing for an empty or degenerate surface list', () => {
    expect(choose([])).toBeNull();
    expect(choose([{ ...goodTable(), outline: [] }])).toBeNull();
    expect(choose([{ ...goodTable(), outline: [{ x: 0, z: -0.5 }, { x: 0.1, z: -0.5 }] }])).toBeNull();
  });
});

describe('TBL-03: scale to fit, never below 75% or above 100%', () => {
  it('scales evenly to the largest size that fits and keeps the whole footprint on the surface', () => {
    const t = { cx: 0, cz: -0.55, width: 0.5, depth: 0.5 };
    const c = choose([goodTable(t)])!;
    expect(c.scale).toBe(0.83); // 0.6 * 0.83 = 49.8 cm in a 50 cm wide table; 0.84 would not fit
    for (const corner of footprintCorners(c)) expect(insideRect(corner, t)).toBe(true);
    // One more percent would not fit anywhere.
    const outline = goodTable(t).outline;
    for (let r = 0.4; r <= 0.6; r += 0.005) {
      for (let deg = -35; deg <= 35; deg += 0.5) {
        const x = r * Math.sin((deg * Math.PI) / 180);
        const z = -r * Math.cos((deg * Math.PI) / 180);
        const yaw = Math.atan2(-x, -z);
        expect(footprintFitsOutline(outline, x, z, yaw, 0.84, TOWN_FOOTPRINT)).toBe(false);
      }
    }
  });

  it('goes to exactly 75% on a surface exactly 45 x 30 cm, and to 100% on a big one', () => {
    expect(choose([goodTable({ width: 0.45, depth: 0.3 })])!.scale).toBe(0.75);
    expect(choose([goodTable({ width: 3, depth: 2 })])!.scale).toBe(1);
    expect(choose([goodTable({ width: 0.6, depth: 0.4 })])!.scale).toBe(1);
  });

  it('never leaves the 75% to 100% range, whatever the table', () => {
    for (let w = 0.4; w <= 1.4; w += 0.03) {
      for (let d = 0.25; d <= 0.9; d += 0.05) {
        const c = choose([goodTable({ width: w, depth: d })]);
        if (c) {
          expect(c.scale).toBeGreaterThanOrEqual(0.75);
          expect(c.scale).toBeLessThanOrEqual(1);
          expect(Math.round(c.scale * 100)).toBeCloseTo(c.scale * 100, 9); // whole percents: no jitter
        }
      }
    }
  });

  it('puts the town where an off-centre surface can hold it, not at the aim point it cannot', () => {
    // The surface starts 5 cm to the left of the player's line of sight, so the aim point (x = 0) cannot hold the town.
    const strip = { cx: 0.3, cz: -0.55, width: 0.7, depth: 0.7 };
    const c = choose([goodTable(strip)])!;
    expect(c.x).toBeGreaterThan(0.1);
    expect(c.scale).toBeGreaterThanOrEqual(0.75);
    for (const corner of footprintCorners(c)) expect(insideRect(corner, strip)).toBe(true);
  });
});

describe('TBL-04: several suitable surfaces give the same choice in any report order', () => {
  const surfaces = [
    goodTable({ cx: -0.1, cz: -0.5, width: 0.9, depth: 0.7, y: 0.8, label: 'couch' }),
    goodTable({ cx: 0.3, cz: -0.45, width: 0.8, depth: 0.7, y: 0.75 }),
    goodTable({ cx: -0.4, cz: -0.6, width: 0.7, depth: 0.7, y: 0.85, label: 'Table' }),
    goodTable({ cx: 0.05, cz: -0.6, width: 1.1, depth: 0.8, y: 0.8 }),
  ];

  const permutations = <T,>(xs: T[]): T[][] =>
    xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));

  it('is identical for every permutation of the list', () => {
    const first = choose(surfaces);
    expect(first).not.toBeNull();
    for (const order of permutations(surfaces)) expect(choose(order)).toEqual(first);
  });

  it('is identical across repeated calls', () => {
    expect(choose(surfaces)).toEqual(choose(surfaces));
  });

  it('prefers a surface labelled table or desk over a closer one, case-insensitively', () => {
    const closer = goodTable({ cx: 0, cz: -0.55 }); // sits right on the aim point
    for (const label of ['table', 'desk', 'TABLE', ' Desk ']) {
      const labelled = goodTable({ cx: 0.4, cz: -0.5, width: 1.0, depth: 0.8, label }); // town sits 26 cm to the right
      const c = choose([closer, labelled])!;
      expect(c.preferred).toBe(true);
      expect(c.x).toBeGreaterThan(0.2);
    }
  });

  it('does not prefer other labels: then the centre nearest the aim point wins', () => {
    const atAim = goodTable({ cx: 0, cz: -0.55, label: 'couch' });
    const offAim = goodTable({ cx: 0.4, cz: -0.5, width: 1.0, depth: 0.8, label: 'shelf' });
    expect(choose([offAim])!.x).toBeGreaterThan(0.2); // control: the off-aim surface is suitable on its own
    const c = choose([offAim, atAim])!;
    expect(c.preferred).toBe(false);
    expect(c.x).toBeCloseTo(0, 6);
  });

  it('breaks ties between identical surfaces by coordinates, not by order', () => {
    const a = goodTable({ y: 0.8 });
    const b = goodTable({ y: 0.8 });
    expect(choose([a, b])).toEqual(choose([b, a]));
    // Two surfaces that only differ in height: the lower one wins whichever is listed first.
    const low = goodTable({ y: 0.7 });
    const high = goodTable({ y: 0.9 });
    expect(choose([low, high])).toEqual(choose([high, low]));
  });

  it('shuffling a larger random set never changes the choice', () => {
    const rng = lcg(7);
    const many = Array.from({ length: 12 }, () =>
      goodTable({
        cx: (rng() - 0.5) * 1.6,
        cz: -0.2 - rng() * 0.9,
        width: 0.4 + rng() * 0.9,
        depth: 0.3 + rng() * 0.7,
        y: 0.55 + rng() * 0.3,
      }),
    );
    const base = choose(many);
    for (let i = 0; i < 10; i++) expect(choose(shuffle(many, rng))).toEqual(base);
  });
});

describe('the chosen centre respects the reach rules', () => {
  it('is 40 to 60 cm from the eyes and within 35 degrees of the facing direction', () => {
    const rng = lcg(11);
    let chosen = 0;
    for (let i = 0; i < 60; i++) {
      const table = goodTable({
        cx: (rng() - 0.5) * 2,
        cz: -rng() * 1.4,
        width: 0.5 + rng() * 0.9,
        depth: 0.35 + rng() * 0.8,
        y: 0.6 + rng() * 0.25,
      });
      const c = choose([table]);
      if (!c) continue;
      chosen++;
      const dist = Math.hypot(c.x - HEAD.x, c.z - HEAD.z);
      const bearing = Math.atan2(Math.abs(c.x - HEAD.x), -(c.z - HEAD.z));
      expect(dist).toBeGreaterThanOrEqual(REACH_MIN_M - 1e-9);
      expect(dist).toBeLessThanOrEqual(REACH_MAX_M + 1e-9);
      expect(bearing).toBeLessThanOrEqual(REACH_HALF_ANGLE_RAD + 1e-9);
      for (const corner of footprintCorners(c)) expect(insideRect(corner, { cx: table.origin.x, cz: table.origin.z, width: rectWidth(table), depth: rectDepth(table) })).toBe(true);
    }
    expect(chosen).toBeGreaterThan(10); // the sweep must actually exercise the rule
  });
});

describe('tilted and unusual surfaces', () => {
  it('puts the town on the plane, not at the plane origin height', () => {
    // 4 degrees about Z: the surface climbs towards +X. Its origin is under the aim point's left.
    const a = (4 * Math.PI) / 180;
    const table = rectSurface({ cx: -0.5, cz: -0.55, width: 1.6, depth: 0.9, y: 0.8, normal: { x: -Math.sin(a), y: Math.cos(a), z: 0 } });
    const c = choose([table])!;
    const planeY = 0.8 + Math.tan(a) * (c.x - -0.5);
    expect(c.y).toBeCloseTo(planeY, 6);
    expect(Math.abs(c.y - 0.8)).toBeGreaterThan(0.01); // so the origin height really would have been wrong
  });

  it('rejects an L-shaped surface whose bounding box is big enough but whose arms are too thin', () => {
    const thinL: SurfaceInfo = {
      ...goodTable(),
      outline: [
        { x: -0.45, z: -1.0 },
        { x: -0.2, z: -1.0 },
        { x: -0.2, z: -0.35 },
        { x: 0.45, z: -0.35 },
        { x: 0.45, z: -0.1 },
        { x: -0.45, z: -0.1 },
      ],
    };
    expect(choose([thinL])).toBeNull();
    const thickL: SurfaceInfo = {
      ...goodTable(),
      outline: [
        { x: -0.45, z: -1.0 },
        { x: 0.05, z: -1.0 },
        { x: 0.05, z: -0.6 },
        { x: 0.45, z: -0.6 },
        { x: 0.45, z: -0.1 },
        { x: -0.45, z: -0.1 },
      ],
    };
    expect(choose([thickL])).not.toBeNull();
  });

  it('accepts either winding order of the outline', () => {
    const t = goodTable();
    expect(choose([{ ...t, outline: [...t.outline].reverse() }])).toEqual(choose([t]));
  });
});

describe('the binary search over the scale agrees with a plain scan', () => {
  /** Test-side reference: scan every whole-percent scale from 100% down, centres in the documented order. */
  function reference(surface: SurfaceInfo): { percent: number; x: number; z: number } | null {
    const centres: { x: number; z: number; yaw: number; d: number; xk: number; zk: number }[] = [];
    for (let ri = 0; ri <= 20; ri++) {
      const r = REACH_MIN_M + ri * 0.01;
      for (let bi = -14; bi <= 14; bi++) {
        const b = bi * (REACH_HALF_ANGLE_RAD / 14);
        const x = HEAD.x + r * Math.sin(b);
        const z = HEAD.z - r * Math.cos(b);
        centres.push({
          x,
          z,
          yaw: Math.atan2(HEAD.x - x, HEAD.z - z),
          d: Math.round(Math.hypot(x - 0, z + AIM_AHEAD_M) * 1000),
          xk: Math.round(x * 1e4),
          zk: Math.round(z * 1e4),
        });
      }
    }
    centres.sort((p, q) => p.d - q.d || p.xk - q.xk || p.zk - q.zk);
    const below = HEAD.y - surface.origin.y;
    const usable = below >= 0.2 && below <= 0.6 ? centres : [];
    for (let percent = 100; percent >= 75; percent--) {
      const hit = usable.find((c) => footprintFitsOutline(surface.outline, c.x, c.z, c.yaw, percent / 100, TOWN_FOOTPRINT));
      if (hit) return { percent, x: hit.x, z: hit.z };
    }
    return null;
  }

  it('matches on random rectangles and L shapes', () => {
    const rng = lcg(2026);
    let hits = 0;
    for (let i = 0; i < 80; i++) {
      const base = goodTable({
        cx: (rng() - 0.5) * 1.2,
        cz: -0.25 - rng() * 0.8,
        width: 0.4 + rng() * 0.8,
        depth: 0.28 + rng() * 0.7,
        y: 0.7 + rng() * 0.1,
      });
      const surface = i % 2 === 0 ? base : notchCorner(base, rng);
      const got = choose([surface]);
      const want = reference(surface);
      if (want === null) {
        expect(got).toBeNull();
      } else {
        hits++;
        expect(got).not.toBeNull();
        expect(Math.round(got!.scale * 100)).toBe(want.percent);
        expect(got!.x).toBeCloseTo(want.x, 9);
        expect(got!.z).toBeCloseTo(want.z, 9);
      }
    }
    expect(hits).toBeGreaterThan(10); // the comparison must actually exercise both outcomes
  });
});

// --- helpers ---------------------------------------------------------------------------------------------------------

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const rectWidth = (s: SurfaceInfo) => Math.max(...s.outline.map((p) => p.x)) - Math.min(...s.outline.map((p) => p.x));
const rectDepth = (s: SurfaceInfo) => Math.max(...s.outline.map((p) => p.z)) - Math.min(...s.outline.map((p) => p.z));

/** Cuts a random rectangular bite out of one corner of a rectangular surface, making an L. */
function notchCorner(s: SurfaceInfo, rng: () => number): SurfaceInfo {
  const xs = s.outline.map((p) => p.x);
  const zs = s.outline.map((p) => p.z);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const bx = x0 + (x1 - x0) * (0.3 + rng() * 0.4);
  const bz = z0 + (z1 - z0) * (0.3 + rng() * 0.4);
  return {
    ...s,
    outline: [
      { x: x0, z: z0 },
      { x: bx, z: z0 },
      { x: bx, z: bz },
      { x: x1, z: bz },
      { x: x1, z: z1 },
      { x: x0, z: z1 },
    ],
  };
}
