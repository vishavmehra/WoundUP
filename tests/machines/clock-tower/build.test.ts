// The finished Clock Tower built from the real GLBs, parsed in Node: every mount it uses exists, the parts land where the files say
// they belong, the movement fits the tower and stays inside it while the pendulum swings, and every node ClockTowerNodes turns is there.
// Set WU_MODELS_DIR to a models folder to run it against another checkout; it is skipped when the Clock Tower GLBs are not in the tree.

import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildClockTower, CLOCK_TOWER_BASE_HEIGHT_M, CLOCK_TOWER_MODEL, CLOCK_TOWER_MODEL_PATHS, ClockTowerNodes, ClockTowerRuntime, MOVEMENT, PENDULUM_AMPLITUDE_RAD } from '../../../src/machines/clock-tower';
import { buildMachine } from '../../../src/town/machines';
import type { ModelSource } from '../../../src/town/scene';
import { fs, libraryRegistry, repoUrl } from '../../town/helpers';

const override = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.WU_MODELS_DIR;
const dir = override ? new URL(`file:///${override.replace(/\\/g, '/').replace(/\/?$/, '/')}`) : repoUrl('public/assets/models/');
const present = CLOCK_TOWER_MODEL_PATHS.every((path) => fs.existsSync(new URL(path, dir)));

const loaded: string[] = [];
const source: ModelSource = async (path) => {
  loaded.push(path);
  const bytes = fs.readFileSync(new URL(path, dir));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  return { scene: gltf.scene, animations: gltf.animations };
};

const worldBox = (object: { updateWorldMatrix(parents: boolean, children: boolean): void }): Box3 => new Box3().setFromObject(object as never, true);
const MM = 0.001;

describe.skipIf(!present)('the finished Clock Tower from the real GLBs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    loaded.length = 0;
  });

  it('is built without a warning, from the files the catalogue and the town know, with the base handle on its base', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rig = await buildClockTower(source, libraryRegistry());
    expect(warn).not.toHaveBeenCalled();
    expect(rig.machineId).toBe('clock_tower');
    expect(rig.rotors).toEqual([]); // the nodes are turned by ClockTowerSystem, not by solver rotors
    expect([...loaded].sort()).toEqual([...CLOCK_TOWER_MODEL_PATHS].sort());
    const handle = rig.root.getObjectByName('SOCKET_BaseHandle');
    expect(handle?.parent?.children.length).toBeGreaterThan(1); // the handle model is a sibling of its socket
    const viaTown = await buildMachine('clock_tower', source, libraryRegistry());
    expect(viaTown?.machineId).toBe('clock_tower'); // what the game, the restore and the gift viewer call
  });

  it('stands the shell on the base and the dial and bell where the shell says: 19 cm up, 3.8 cm to the front; the bell under the middle ring', async () => {
    const rig = await buildClockTower(source, libraryRegistry());
    rig.root.updateMatrixWorld(true);
    const at = (name: string): Vector3 => (rig.root.getObjectByName(name) as NonNullable<ReturnType<typeof rig.root.getObjectByName>>).getWorldPosition(new Vector3());
    const shell = worldBox(rig.root.getObjectByName('ClockTower_LowerRing') as never);
    expect(shell.min.y).toBeCloseTo(CLOCK_TOWER_BASE_HEIGHT_M, 4);
    const hands = at('ClockHands_Hour');
    expect(hands.y).toBeCloseTo(0.19, 3); // TOCKTON_DIMENSIONS §11: face centred 19.0 cm high
    expect(hands.z).toBeCloseTo(0.0389, 3); // the dial is on the front of the shell, the hands just before it
    expect(hands.x).toBeCloseTo(0, 6);
    const bell = worldBox(rig.root.getObjectByName('ClockBell_Bell') as never);
    expect(bell.max.y).toBeCloseTo(0.116, 3); // hangs from the underside of the middle ring (shell y 56 mm)
    expect(bell.min.y).toBeCloseTo(0.088, 3);
    const whole = worldBox(rig.root);
    expect(whole.max.y).toBeGreaterThan(0.27); // base 6 cm, shell and spire to 28 cm (TOCKTON_DIMENSIONS §11)
    expect(whole.max.y).toBeLessThan(0.29);
    expect(Math.max(whole.max.x, -whole.min.x)).toBeLessThan(0.0476); // the footprint is the 9.5 cm base
  });

  it('has every node ClockTowerNodes turns, except the hourly cam, which is solved but not drawn (no mount in any GLB)', async () => {
    const rig = await buildClockTower(source, libraryRegistry());
    expect(new ClockTowerNodes().resolve(rig.root)).toEqual(['Cam_HourlyChime']);
  });

  it('puts the movement inside the tower: the pendulum clears the floor and the arch through its whole swing, the wheel and anchor fit the openings above', async () => {
    const rig = await buildClockTower(source, libraryRegistry());
    const nodes = new ClockTowerNodes();
    nodes.resolve(rig.root);
    const pendulum = rig.root.getObjectByName('Pendulum_Rod');
    expect(pendulum).toBeDefined();

    // Run the real behaviour for a few seconds: the pendulum builds to full amplitude and the box of the swinging part is measured every frame.
    let now = 0;
    const runtime = new ClockTowerRuntime(() => now);
    runtime.powered = true;
    let lowest = Infinity;
    let widest = 0;
    let strongest = 0;
    for (let i = 0; i < 400; i++) {
      runtime.update();
      nodes.apply(runtime);
      rig.root.updateMatrixWorld(true);
      const box = worldBox(pendulum as never);
      lowest = Math.min(lowest, box.min.y);
      widest = Math.max(widest, box.max.x, -box.min.x);
      strongest = Math.max(strongest, Math.abs(runtime.pendulumZ));
      now += 16;
    }
    expect(strongest).toBeCloseTo(PENDULUM_AMPLITUDE_RAD, 2); // it really swung
    expect(lowest).toBeGreaterThan(4.6 * MM); // above the platform top, never through the floor
    expect(widest).toBeLessThan(0.0415); // inside the 83 mm interior
    expect(widest).toBeGreaterThan(0.012); // and it does swing sideways, a few centimetres

    rig.root.updateMatrixWorld(true);
    const wheel = worldBox(rig.root.getObjectByName('EscapeWheel') as never);
    expect(wheel.max.x - wheel.min.x).toBeCloseTo(0.035, 3);
    expect(Math.max(wheel.max.x, -wheel.min.x)).toBeLessThan(0.027); // the 54 mm capstone opening
    expect((wheel.min.y + wheel.max.y) / 2).toBeCloseTo(MOVEMENT.arborY - MOVEMENT.arborToWheel, 3);
    const anchor = worldBox(rig.root.getObjectByName('EscapementAnchor') as never);
    expect(Math.max(anchor.max.x, -anchor.min.x)).toBeLessThan(0.03); // the 60 mm opening of the shell's floor
    expect(anchor.min.y).toBeGreaterThan(wheel.min.y); // the anchor is above the wheel's centre, its pallets reach down to the teeth
  });

  it('keeps the rod in front of the wheel and anchor plane, so nothing swings through them', async () => {
    const rig = await buildClockTower(source, libraryRegistry());
    rig.root.updateMatrixWorld(true);
    const rod = worldBox(rig.root.getObjectByName('Pendulum_Rod') as never);
    const wheel = worldBox(rig.root.getObjectByName('EscapeWheel') as never);
    const anchor = worldBox(rig.root.getObjectByName('EscapementAnchor') as never);
    expect(rod.min.z).toBeGreaterThanOrEqual(wheel.max.z - 1e-6);
    expect(rod.min.z).toBeGreaterThanOrEqual(anchor.max.z - 1e-6);
  });

  it('uses only files named once, in the order the loader knows (the base is the housing the blueprint names)', () => {
    expect(new Set(CLOCK_TOWER_MODEL_PATHS).size).toBe(CLOCK_TOWER_MODEL_PATHS.length);
    expect(CLOCK_TOWER_MODEL.base).toBe('tockton/clock_tower/clock_tower_base.glb');
  });
});
