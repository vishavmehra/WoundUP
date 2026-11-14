import { Group, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MUSIC_BOX } from '../../src/content/blueprints';
import { applyBlueprintSockets, placeInFrame } from '../../src/parts';

function socketEmpty(node: string, wu: Record<string, unknown>): Object3D {
  const o = new Object3D();
  o.name = `SOCKET_${node}`;
  o.userData.wu = { type: 'socket', accepts: ['spur_gear'], ...wu };
  return o;
}

/** Pose of `node` in the frame of `root`, the way the blueprint states it. */
function poseIn(root: Object3D, node: Object3D): { position: Vector3; quaternion: Quaternion } {
  root.updateWorldMatrix(true, true);
  const m = new Matrix4().copy(root.matrixWorld).invert().multiply(node.matrixWorld);
  const position = new Vector3();
  const quaternion = new Quaternion();
  m.decompose(position, quaternion, new Vector3()); // a scaled group above the node scales it too: only the pose is compared
  return { position, quaternion };
}

describe('placeInFrame', () => {
  it('puts a node at a pose of the root frame however deep it sits and however the groups above it are placed, turned and scaled', () => {
    const root = new Group();
    root.position.set(3, -1, 2); // where the machine stands does not matter: the pose is in its own frame
    root.rotation.set(0.4, -0.7, 0.2);
    const middle = new Group();
    middle.position.set(0.1, 0.2, 0.3);
    middle.rotation.set(0.3, 0.5, -0.9);
    middle.scale.setScalar(2);
    const inner = new Group();
    inner.position.set(-0.05, 0.01, 0.02);
    inner.rotation.set(-0.2, 0.1, 0.6);
    const node = new Object3D();
    inner.add(node);
    middle.add(inner);
    root.add(middle);

    const wantPosition = new Vector3(0.0394, 0.0532, 0.0223);
    const wantQuaternion = new Quaternion(0, 0.7071068, 0, 0.7071068).normalize();
    placeInFrame(node, root, [wantPosition.x, wantPosition.y, wantPosition.z], [wantQuaternion.x, wantQuaternion.y, wantQuaternion.z, wantQuaternion.w]);

    const got = poseIn(root, node);
    expect(got.position.distanceTo(wantPosition)).toBeLessThan(1e-9);
    expect(Math.abs(got.quaternion.dot(wantQuaternion))).toBeGreaterThan(1 - 1e-9);
  });

  it('defaults the rotation to identity and leaves a node without a parent alone', () => {
    const root = new Group();
    const holder = new Group();
    holder.rotation.y = 1;
    const node = new Object3D();
    holder.add(node);
    root.add(holder);
    placeInFrame(node, root, [0, 0.1, 0]);
    expect(Math.abs(poseIn(root, node).quaternion.w)).toBeGreaterThan(1 - 1e-9);

    const orphan = new Object3D();
    orphan.position.set(7, 8, 9);
    placeInFrame(orphan, root, [0, 0, 0]);
    expect(orphan.position.toArray()).toEqual([7, 8, 9]);
  });
});

describe('applyBlueprintSockets', () => {
  const sockets = (): { root: Group; gearA: Object3D; handle: Object3D; comb: Object3D } => {
    const root = new Group();
    const gearA = socketEmpty('GearA', { orient: 'axis', lampAxis: '+Y' });
    const handle = socketEmpty('BaseHandle', { accepts: ['machine_base_handle'] });
    const comb = socketEmpty('Comb', {});
    const stray = new Object3D();
    stray.name = 'Body';
    root.add(gearA, handle, comb, stray);
    return { root, gearA, handle, comb };
  };
  const spring_pinion = MUSIC_BOX.sockets.find((s) => s.id === 'spring_pinion')!;

  it('replaces the accepted ids of the sockets the blueprint names, with a copy, and keeps everything else the GLB says', () => {
    const { root, gearA } = sockets();
    const bound = applyBlueprintSockets(MUSIC_BOX, root);
    expect(bound.sort()).toEqual(['comb', 'spring_pinion']);
    const wu = gearA.userData.wu as { type: string; accepts: string[]; orient: string; lampAxis: string };
    expect(wu.accepts).toEqual(spring_pinion.acceptedPartIds);
    expect(wu.accepts).not.toBe(spring_pinion.acceptedPartIds);
    wu.accepts.pop();
    expect(spring_pinion.acceptedPartIds).toHaveLength(5); // the blueprint is never touched through a scene
    expect(wu.type).toBe('socket');
    expect(wu.orient).toBe('axis');
    expect(wu.lampAxis).toBe('+Y');
  });

  it('leaves a socket the blueprint does not name (the base handle) exactly as it was', () => {
    const { root, handle } = sockets();
    handle.position.set(1, 2, 3);
    applyBlueprintSockets(MUSIC_BOX, root);
    expect((handle.userData.wu as { accepts: string[] }).accepts).toEqual(['machine_base_handle']);
    expect(handle.position.toArray()).toEqual([1, 2, 3]);
  });

  it('moves the bound sockets to the blueprint poses only when asked: a part is not the housing, so its empties stay put', () => {
    const withPoses = sockets();
    applyBlueprintSockets(MUSIC_BOX, withPoses.root);
    expect(withPoses.gearA.position.toArray()).toEqual(spring_pinion.position!.map((v) => expect.closeTo(v, 9)));

    const without = sockets();
    without.gearA.position.set(0.5, 0.5, 0.5);
    applyBlueprintSockets(MUSIC_BOX, without.root, false);
    expect(without.gearA.position.toArray()).toEqual([0.5, 0.5, 0.5]);
    expect((without.gearA.userData.wu as { accepts: string[] }).accepts).toEqual(spring_pinion.acceptedPartIds); // the ids are still bound
  });
});
