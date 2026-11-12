import { describe, expect, it } from 'vitest';
import { Group, Mesh, Object3D, Vector3 } from 'three';
import {
  attachColliderProxies,
  colliderBoost,
  detachColliderProxies,
  MIN_GRAB_RADIUS_M,
  parseWu,
  readInteractionNodes,
  refreshColliderFloor,
} from '../../src/interaction/glb-reader';

function node(name: string, wu?: unknown, scale: [number, number, number] = [1, 1, 1]): Object3D {
  const o = new Object3D();
  o.name = name;
  if (wu !== undefined) o.userData.wu = wu;
  o.scale.set(...scale);
  return o;
}

const socketWu = { type: 'socket', accepts: ['gear', 'gear_16'] };
const colliderWu = { type: 'collider', shape: 'box', purpose: 'grab' };

describe('parseWu', () => {
  it('reads a socket and a collider', () => {
    expect(parseWu(socketWu)).toEqual({ data: { type: 'socket', accepts: ['gear', 'gear_16'], axisOnly: false } });
    expect(parseWu({ ...socketWu, orient: 'axis' })).toEqual({ data: { type: 'socket', accepts: ['gear', 'gear_16'], axisOnly: true } });
    expect(parseWu(colliderWu)).toEqual({ data: { type: 'collider', shape: 'box', purpose: 'grab' } });
    expect(parseWu({ type: 'collider', shape: 'sphere', purpose: 'poke' })).toEqual({
      data: { type: 'collider', shape: 'sphere', purpose: 'poke' },
    });
  });

  it('copies the accepts list instead of sharing it', () => {
    const accepts = ['gear'];
    const parsed = parseWu({ type: 'socket', accepts });
    accepts.push('shaft');
    expect('data' in parsed && parsed.data.type === 'socket' && parsed.data.accepts).toEqual(['gear']);
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'socket'],
    ['an array', [1]],
    ['an unknown type', { type: 'pivot', kind: 'rotation_axis' }],
    ['a socket without accepts', { type: 'socket' }],
    ['a socket with an empty accepts', { type: 'socket', accepts: [] }],
    ['a socket with a non-string accept', { type: 'socket', accepts: ['gear', 3] }],
    ['a socket with an empty-string accept', { type: 'socket', accepts: [''] }],
    ['a socket with far too many accepts', { type: 'socket', accepts: Array.from({ length: 65 }, (_, i) => `p${i}`) }],
    ['a collider with a bad shape', { type: 'collider', shape: 'cone', purpose: 'grab' }],
    ['a collider without purpose', { type: 'collider', shape: 'box' }],
  ])('rejects %s', (_label, raw) => {
    expect('error' in parseWu(raw)).toBe(true);
  });
});

describe('readInteractionNodes', () => {
  it('finds sockets and colliders anywhere under the root', () => {
    const root = new Group();
    const inner = new Group();
    root.add(inner, node('Housing'));
    inner.add(node('SOCKET_Drive', socketWu), node('COL_Grab', colliderWu), node('PIV_Axis', { type: 'pivot' }));
    const found = readInteractionNodes(root);
    expect(found.warnings).toEqual([]);
    expect(found.sockets.map((s) => [s.id, s.accepts])).toEqual([['Drive', ['gear', 'gear_16']]]);
    expect(found.colliders.map((c) => [c.id, c.shape, c.purpose])).toEqual([['Grab', 'box', 'grab']]);
    expect(found.sockets[0].node).toBe(inner.children[0]);
  });

  it('reports a malformed or mismatched empty and skips it', () => {
    const root = new Group();
    root.add(
      node('SOCKET_NoData'),
      node('SOCKET_WrongType', colliderWu),
      node('COL_WrongType', socketWu),
      node('COL_Bad', { type: 'collider', shape: 'cone', purpose: 'grab' }),
      node('SOCKET_Good', socketWu),
    );
    const found = readInteractionNodes(root);
    expect(found.sockets.map((s) => s.id)).toEqual(['Good']);
    expect(found.colliders).toEqual([]);
    expect(found.warnings).toHaveLength(4);
    expect(found.warnings[0]).toContain('SOCKET_NoData');
  });

  it('ignores nodes whose names merely contain the prefix', () => {
    const root = new Group();
    root.add(node('My_SOCKET_Thing', socketWu), node('Group.COL_X', colliderWu));
    const found = readInteractionNodes(root);
    expect(found.sockets).toEqual([]);
    expect(found.colliders).toEqual([]);
    expect(found.warnings).toEqual([]);
  });
});

describe('colliderBoost (INTERACTION_SPEC §7.2: at least 1.2 cm, visible mesh untouched)', () => {
  it('lifts only the axes below the minimum for a box', () => {
    const out = colliderBoost(new Vector3(0.032, 0.032, 0.0076), 'box', MIN_GRAB_RADIUS_M, new Vector3());
    expect(out.x).toBe(1);
    expect(out.y).toBe(1);
    expect(out.z).toBeCloseTo(MIN_GRAB_RADIUS_M / 0.0076);
  });

  it('lifts a sphere uniformly', () => {
    const out = colliderBoost(new Vector3(0.006, 0.006, 0.006), 'sphere', MIN_GRAB_RADIUS_M, new Vector3());
    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(2);
    expect(out.z).toBeCloseTo(2);
  });

  it('leaves a big enough collider alone and survives a zero scale', () => {
    expect(colliderBoost(new Vector3(0.05, 0.05, 0.05), 'sphere', MIN_GRAB_RADIUS_M, new Vector3()).toArray()).toEqual([1, 1, 1]);
    const out = colliderBoost(new Vector3(0, 0.05, 0.05), 'box', MIN_GRAB_RADIUS_M, new Vector3());
    expect(Number.isFinite(out.x)).toBe(true);
  });
});

describe('attachColliderProxies', () => {
  function setup(scale: [number, number, number], purpose = 'grab', shape: 'box' | 'sphere' = 'box') {
    const root = new Group();
    const col = node('COL_Grab', { type: 'collider', shape, purpose }, scale);
    root.add(col);
    const found = readInteractionNodes(root);
    const proxies = attachColliderProxies(found.colliders);
    return { root, col, proxies };
  }

  it('adds an invisible mesh under the collider and never hides a node', () => {
    const { root, col, proxies } = setup([0.03, 0.03, 0.03]);
    expect(proxies).toHaveLength(1);
    const proxy = proxies[0] as Mesh;
    expect(proxy.parent).toBe(col);
    expect(proxy.isMesh).toBe(true);
    expect((proxy.material as { visible: boolean }).visible).toBe(false);
    // The node and its ancestors stay visible: IWSDK ignores objects under a hidden ancestor.
    expect(proxy.visible).toBe(true);
    expect(col.visible).toBe(true);
    expect(root.visible).toBe(true);
  });

  it('a grab collider below 1.2 cm is lifted, measured in the world', () => {
    const { root, col, proxies } = setup([0.005, 0.005, 0.005]);
    const world = new Vector3();
    root.updateWorldMatrix(true, true);
    col.getWorldScale(world);
    expect(world.x * proxies[0].scale.x).toBeGreaterThanOrEqual(MIN_GRAB_RADIUS_M - 1e-9);
  });

  it('a town scale of 75% does not push a grab collider under the minimum', () => {
    const { root, col, proxies } = setup([0.02, 0.02, 0.02]);
    expect(proxies[0].scale.x).toBe(1); // 2 cm is fine at full size
    root.scale.setScalar(0.75); // the machine takes the town's scale
    refreshColliderFloor(root);
    expect(proxies[0].scale.x).toBe(1); // 1.5 cm still fine
    root.scale.setScalar(0.5);
    refreshColliderFloor(root);
    const world = new Vector3();
    root.updateWorldMatrix(true, true);
    col.getWorldScale(world);
    expect(world.x * proxies[0].scale.x).toBeGreaterThanOrEqual(MIN_GRAB_RADIUS_M - 1e-9);
  });

  it('only grab colliders are lifted', () => {
    const { proxies } = setup([0.002, 0.002, 0.002], 'poke');
    expect(proxies[0].scale.toArray()).toEqual([1, 1, 1]);
  });

  it('shares geometry and material between proxies, and detach removes them', () => {
    const root = new Group();
    root.add(node('COL_A', colliderWu, [0.03, 0.03, 0.03]), node('COL_B', colliderWu, [0.04, 0.04, 0.04]));
    const proxies = attachColliderProxies(readInteractionNodes(root).colliders) as Mesh[];
    expect(proxies[0].geometry).toBe(proxies[1].geometry);
    expect(proxies[0].material).toBe(proxies[1].material);
    detachColliderProxies(proxies);
    expect(proxies[0].parent).toBeNull();
    expect(root.children.every((c) => c.children.length === 0)).toBe(true);
  });
});
