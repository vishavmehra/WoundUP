import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  ASSIST_REACH,
  ASSIST_WINDOW_S,
  assistedRelease,
  createPick,
  EASY_SNAP_RADIUS_M,
  easeOutCubic,
  FIRM_UNSNAP_DISTANCE_M,
  isCompatible,
  isTinyFamily,
  NO_PART,
  pickSocket,
  RELAXED_EASY_SNAP_RADIUS_M,
  RELAXED_SNAP_RADIUS_M,
  SETTLE_OVERSHOOT_M,
  SNAP_RADIUS_M,
  seatedRelative,
  settleBump,
  shouldUnsnap,
  snapRadius,
  statusOf,
  swingZToAxis,
  UNSNAP_DISTANCE_M,
} from '../../src/interaction/snap';
import type { PartSample, SocketSample } from '../../src/interaction/snap';

const part = (x: number, y = 0, z = 0, id = 'gear_16', family = 'gear', key = 1): PartSample => ({ x, y, z, id, family, key });
const socket = (x: number, accepts: string[] = ['gear'], occupant = NO_PART, y = 0, z = 0, armed = true): SocketSample => ({
  x,
  y,
  z,
  accepts,
  occupant,
  armed,
});

describe('radii (INTERACTION_SPEC §8, §9)', () => {
  it('uses 4 cm, 7 cm in Easy Snap, and unsnaps beyond 3 cm', () => {
    expect(SNAP_RADIUS_M).toBe(0.04);
    expect(EASY_SNAP_RADIUS_M).toBe(0.07);
    expect(UNSNAP_DISTANCE_M).toBe(0.03);
    expect(snapRadius(false)).toBe(0.04);
    expect(snapRadius(true)).toBe(0.07);
  });

  it('unsnap has hysteresis: 3 cm still holds, just over lets go', () => {
    expect(shouldUnsnap(0.029)).toBe(false);
    expect(shouldUnsnap(0.03)).toBe(false);
    expect(shouldUnsnap(0.031)).toBe(true);
  });
});

describe('isCompatible', () => {
  it('matches a part id or a family, and nothing else', () => {
    expect(isCompatible(['gear'], 'gear_16', 'gear')).toBe(true);
    expect(isCompatible(['gear_16'], 'gear_16', 'gear')).toBe(true);
    expect(isCompatible(['shaft'], 'gear_16', 'gear')).toBe(false);
    expect(isCompatible(['gear_20'], 'gear_16', 'gear')).toBe(false);
  });

  it('an empty family never matches an empty entry, and an empty list accepts nothing', () => {
    expect(isCompatible([], 'gear_16', 'gear')).toBe(false);
    expect(isCompatible(['gear'], 'gear_16', '')).toBe(false);
  });
});

describe('pickSocket', () => {
  const out = createPick();

  it('snaps within 4 cm and not beyond', () => {
    expect(pickSocket(part(0.039), [socket(0)], SNAP_RADIUS_M, out)).toBe(true);
    expect(out.index).toBe(0);
    expect(out.status).toBe('valid');
    expect(out.distance).toBeCloseTo(0.039);
    expect(pickSocket(part(0.041), [socket(0)], SNAP_RADIUS_M, out)).toBe(false);
    expect(out.index).toBe(-1);
  });

  it('Easy Snap reaches 7 cm', () => {
    const p = part(0.065);
    expect(pickSocket(p, [socket(0)], snapRadius(false), out)).toBe(false);
    expect(pickSocket(p, [socket(0)], snapRadius(true), out)).toBe(true);
  });

  it('measures distance in three dimensions', () => {
    expect(pickSocket(part(0, 0.03, 0.03), [socket(0)], SNAP_RADIUS_M, out)).toBe(false); // 4.24 cm
    expect(pickSocket(part(0, 0.02, 0.02), [socket(0)], SNAP_RADIUS_M, out)).toBe(true); // 2.83 cm
  });

  it('picks the nearest of several valid sockets', () => {
    pickSocket(part(0.05), [socket(0), socket(0.1), socket(0.06)], EASY_SNAP_RADIUS_M, out);
    expect(out.index).toBe(2);
  });

  it('a wrong family is reported as such, so the preview goes red', () => {
    expect(pickSocket(part(0.01), [socket(0, ['shaft'])], SNAP_RADIUS_M, out)).toBe(true);
    expect(out.status).toBe('family');
  });

  it('an occupied socket is reported, and the same part counts as free in its own socket', () => {
    pickSocket(part(0.01, 0, 0, 'gear_16', 'gear', 1), [socket(0, ['gear'], 7)], SNAP_RADIUS_M, out);
    expect(out.status).toBe('occupied');
    pickSocket(part(0.01, 0, 0, 'gear_16', 'gear', 7), [socket(0, ['gear'], 7)], SNAP_RADIUS_M, out);
    expect(out.status).toBe('valid');
  });

  it('prefers a farther socket that takes the part over a nearer one that rejects it', () => {
    pickSocket(part(0.02), [socket(0.02, ['shaft']), socket(0.0, ['gear'])], SNAP_RADIUS_M, out);
    expect(out.index).toBe(1);
    expect(out.status).toBe('valid');
  });

  it('among rejecting sockets it reports the nearest', () => {
    pickSocket(part(0.02), [socket(0.035, ['shaft']), socket(0.01, ['axle'], 3)], SNAP_RADIUS_M, out);
    expect(out.index).toBe(1);
    expect(out.status).toBe('family');
  });

  it('reuses its output and handles an empty socket list', () => {
    expect(pickSocket(part(0), [], SNAP_RADIUS_M, out)).toBe(false);
    expect(out.index).toBe(-1);
    expect(out.distance).toBe(Infinity);
  });
});

describe('easeOutCubic', () => {
  it('runs from 0 to 1 and decelerates', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe('axis alignment (+Z onto the socket axis)', () => {
  const z = new Vector3(0, 0, 1);
  const zOf = (q: Quaternion): Vector3 => z.clone().applyQuaternion(q);

  it('turns a tilted part so its +Z lies on the axis', () => {
    const tilted = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.7);
    const axis = new Vector3(0, 1, 0);
    const out = swingZToAxis(tilted, axis, new Quaternion());
    expect(zOf(out).distanceTo(axis)).toBeLessThan(1e-6);
  });

  it('keeps the roll about the axis: a part already on the axis does not move', () => {
    const rolled = new Quaternion().setFromAxisAngle(z, 1.1);
    const out = swingZToAxis(rolled, z, new Quaternion());
    expect(out.angleTo(rolled)).toBeLessThan(1e-6);
  });

  it('handles a part pointing the opposite way', () => {
    const flipped = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
    const out = swingZToAxis(flipped, z, new Quaternion());
    expect(zOf(out).distanceTo(z)).toBeLessThan(1e-6);
  });

  it('seatedRelative: exact mode takes the socket orientation', () => {
    const socketQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.4);
    const partQ = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1.2);
    const rel = seatedRelative(partQ, socketQ, false, new Quaternion());
    expect(rel.angleTo(new Quaternion())).toBeLessThan(1e-9);
    // world = socket * relative
    expect(socketQ.clone().multiply(rel).angleTo(socketQ)).toBeLessThan(1e-9);
  });

  it('seatedRelative: axis-only mode puts the part on the socket axis and keeps the player roll', () => {
    const socketQ = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2); // socket +Z points along +Y
    const partQ = new Quaternion().setFromAxisAngle(new Vector3(1, 0.3, 0).normalize(), 0.5);
    const rel = seatedRelative(partQ, socketQ, true, new Quaternion());
    const world = socketQ.clone().multiply(rel);
    expect(zOf(world).distanceTo(zOf(socketQ))).toBeLessThan(1e-6);
    // The remaining difference from the socket is a pure roll about its own +Z.
    const spin = rel.clone();
    const twist = 2 * Math.atan2(spin.z, spin.w);
    const pureRoll = new Quaternion().setFromAxisAngle(z, twist);
    expect(spin.angleTo(pureRoll)).toBeLessThan(1e-6);
  });
});

describe('the radius table of the intricate assembly (design §5.2, ADR-050)', () => {
  it('is 4 and 7 cm for Standard and Master, 7 and 9 cm for Relaxed, and Standard when no level is given', () => {
    expect(snapRadius(false, 'standard')).toBe(SNAP_RADIUS_M);
    expect(snapRadius(true, 'standard')).toBe(EASY_SNAP_RADIUS_M);
    expect(snapRadius(false, 'master')).toBe(0.04);
    expect(snapRadius(true, 'master')).toBe(0.07);
    expect(snapRadius(false, 'relaxed')).toBe(RELAXED_SNAP_RADIUS_M);
    expect(snapRadius(true, 'relaxed')).toBe(RELAXED_EASY_SNAP_RADIUS_M);
    expect([RELAXED_SNAP_RADIUS_M, RELAXED_EASY_SNAP_RADIUS_M]).toEqual([0.07, 0.09]);
    expect(snapRadius(true)).toBe(0.07);
  });

  it('asks 6 cm of a part inside a finished unit and 3 cm of every other', () => {
    expect(FIRM_UNSNAP_DISTANCE_M).toBe(0.06);
    expect(shouldUnsnap(0.05)).toBe(true);
    expect(shouldUnsnap(0.05, FIRM_UNSNAP_DISTANCE_M)).toBe(false);
    expect(shouldUnsnap(0.061, FIRM_UNSNAP_DISTANCE_M)).toBe(true);
  });
});

describe('arming (design §3.4)', () => {
  it('rates the right part at an unarmed socket as order, after family and occupied', () => {
    const p = part(0);
    expect(statusOf(socket(0), p)).toBe('valid');
    expect(statusOf(socket(0, ['gear'], NO_PART, 0, 0, false), p)).toBe('order');
    expect(statusOf(socket(0, ['shaft'], NO_PART, 0, 0, false), p)).toBe('family'); // the wrong part says so first
    expect(statusOf(socket(0, ['gear'], 7, 0, 0, false), p)).toBe('occupied');
  });

  it('never snaps to an unarmed socket: an armed one farther away wins, and the unarmed one alone is a reject', () => {
    const out = createPick();
    const unarmedNear = socket(0.005, ['gear'], NO_PART, 0, 0, false);
    const armedFar = socket(0.03);
    expect(pickSocket(part(0), [unarmedNear, armedFar], 0.04, out)).toBe(true);
    expect(out).toMatchObject({ index: 1, status: 'valid' });
    expect(pickSocket(part(0), [unarmedNear], 0.04, out)).toBe(true);
    expect(out).toMatchObject({ index: 0, status: 'order' });
  });

  it('lets a part return to the socket it already occupies even when it is not armed', () => {
    const out = createPick();
    pickSocket(part(0, 0, 0, 'g', 'gear', 5), [socket(0, ['gear'], 5, 0, 0, false)], 0.04, out);
    expect(out.status).toBe('valid');
  });
});

describe('settle and release assist (design §5.2, §10.1)', () => {
  it('pushes 0.4 mm past home in the middle of the settle and nothing at either end', () => {
    expect(SETTLE_OVERSHOOT_M).toBe(0.0004);
    expect(settleBump(0)).toBeCloseTo(0, 12);
    expect(settleBump(0.5)).toBeCloseTo(1, 12);
    expect(settleBump(1)).toBeCloseTo(0, 12);
    expect(settleBump(-1)).toBe(0);
    expect(settleBump(2)).toBeCloseTo(0, 12);
  });

  it('is for tiny parts only, and rescues a release up to 1.5 radii away within 0.15 s of a valid preview', () => {
    expect(isTinyFamily('fastener')).toBe(true);
    expect(isTinyFamily('spur_gear')).toBe(false);
    expect([ASSIST_WINDOW_S, ASSIST_REACH]).toEqual([0.15, 1.5]);
    expect(assistedRelease(0.1, 0.05, 0.04)).toBe(true);
    expect(assistedRelease(0.15, 0.06, 0.04)).toBe(true);
    expect(assistedRelease(0.16, 0.05, 0.04)).toBe(false); // the preview is too old
    expect(assistedRelease(0.1, 0.061, 0.04)).toBe(false); // the hand drifted too far
  });
});
