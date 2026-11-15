import { Vector3 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { allJointNames, HandRig } from '../../src/onboarding/hand-rig';

/** The ghost hand's rig on the REAL hand model the game serves (public/assets/xr/generic-hand/right.glb). */

interface NodeFs {
  readFileSync(path: URL): Uint8Array;
}
const fs = (await import('node:fs' as string)) as NodeFs;

async function load(): Promise<{ rig: HandRig; at: (name: string) => Vector3 }> {
  const bytes = fs.readFileSync(new URL('../../public/assets/xr/generic-hand/right.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
  const rig = new HandRig(gltf.scene);
  const at = (name: string): Vector3 => {
    rig.root.updateMatrixWorld(true);
    return (gltf.scene.getObjectByName(name) as Object3D).getWorldPosition(new Vector3());
  };
  return { rig, at };
}

describe('HandRig on the real hand model', () => {
  it('finds all 25 joints', async () => {
    const { rig } = await load();
    expect(allJointNames()).toHaveLength(25);
    expect(rig.missing).toEqual([]);
    expect(rig.ready).toBe(true);
  });

  it('reports a model without the joints as not ready instead of throwing', async () => {
    const { Group } = await import('three');
    const rig = new HandRig(new Group());
    expect(rig.ready).toBe(false);
    expect(rig.missing).toHaveLength(25);
  });

  it('is framed for the demonstrations: fingers point along -Z, the thumb is on the -X side, the palm faces down', async () => {
    const { rig, at } = await load();
    rig.pose({ index: 0, thumb: 0, rest: 0 });
    expect(at('middle-finger-tip').z).toBeLessThan(at('wrist').z - 0.1); // fingers away from the wrist, forward
    expect(at('thumb-metacarpal').x).toBeLessThan(at('pinky-finger-metacarpal').x - 0.03); // right hand, palm down: the thumb is on the left
    // Curling a finger brings its tip down (-Y): the palm is on the underside.
    const flatY = at('middle-finger-tip').y;
    rig.pose({ index: 0, thumb: 0, rest: 1 });
    expect(at('middle-finger-tip').y).toBeLessThan(flatY - 0.025);
  });

  it('closes the pinch: the thumb tip meets the index tip', async () => {
    const { rig, at } = await load();
    rig.pose({ index: 1, thumb: 1, rest: 0.5 });
    expect(at('thumb-tip').distanceTo(at('index-finger-tip'))).toBeLessThan(0.012);
    rig.pose({ index: 0.15, thumb: 0.12, rest: 0.5 });
    expect(at('thumb-tip').distanceTo(at('index-finger-tip'))).toBeGreaterThan(0.06); // open, it is a hand about to pinch, not one pinching
  });

  it('points: the index finger is out and the others are curled', async () => {
    const { rig, at } = await load();
    rig.pose({ index: 0, thumb: 0.5, rest: 1 });
    expect(at('index-finger-tip').z).toBeLessThan(at('middle-finger-tip').z - 0.06);
  });

  it('opens flat: every fingertip is out in front of the palm and in one plane', async () => {
    const { rig, at } = await load();
    rig.pose({ index: 0, thumb: 0, rest: 0 });
    const tips = ['index', 'middle', 'ring', 'pinky'].map((f) => at(`${f}-finger-tip`));
    for (const tip of tips) {
      expect(tip.z).toBeLessThan(rig.anchorOf('palm').z - 0.05);
      expect(Math.abs(tip.y - tips[0].y)).toBeLessThan(0.02);
    }
  });

  it('gives three sensible grasp points', async () => {
    const { rig, at } = await load();
    rig.pose({ index: 1, thumb: 1, rest: 0.5 });
    const pinch = rig.anchorOf('pinch');
    expect(pinch.distanceTo(at('index-finger-tip'))).toBeLessThan(0.01); // between the two tips
    expect(rig.anchorOf('point').z).toBeLessThan(pinch.z - 0.05); // the straight fingertip is further out than the pinch
    const palm = rig.anchorOf('palm');
    expect(palm.z).toBeLessThan(at('wrist').z); // the palm is in front of the wrist
    expect(palm.z).toBeGreaterThan(at('middle-finger-tip').z + 0.05); // and well behind the fingertips
  });

  it('never produces a non-finite joint over the whole range of shapes', async () => {
    const { rig } = await load();
    for (const index of [0, 0.5, 1, 1.5, 2]) {
      for (const thumb of [0, 0.5, 1]) {
        for (const rest of [0, 0.5, 1]) {
          rig.pose({ index, thumb, rest });
          rig.root.updateMatrixWorld(true);
          for (const name of allJointNames()) {
            const bone = rig.root.getObjectByName(name) as Object3D;
            expect(bone.position.toArray().every(Number.isFinite), name).toBe(true);
            expect(bone.quaternion.toArray().every(Number.isFinite), name).toBe(true);
          }
        }
      }
    }
  });
});
