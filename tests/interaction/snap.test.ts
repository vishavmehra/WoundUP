import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  createPick,
  EASY_SNAP_RADIUS_M,
  easeOutCubic,
  isCompatible,
  NO_PART,
  pickSocket,
  SNAP_RADIUS_M,
  seatedRelative,
  shouldUnsnap,
  snapRadius,
  swingZToAxis,
  UNSNAP_DISTANCE_M,
} from '../../src/interaction/snap';
import type { PartSample, SocketSample } from '../../src/interaction/snap';

const part = (x: number, y = 0, z = 0, id = 'gear_16', family = 'gear', key = 1): PartSample => ({ x, y, z, id, family, key });
const socket = (x: number, accepts: string[] = ['gear'], occupant = NO_PART, y = 0, z = 0): SocketSample => ({
  x,
  y,
  z,
  accepts,
  occupant,
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
