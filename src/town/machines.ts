/**
 * Finished machines for the town: assembles a Windmill, Carousel or Music Box from its GLBs by their `SOCKET_` empties and
 * returns the `MachineRig` the town animates. This is how a saved machine reappears when the game loads, and it is the
 * reference for which node turns with which solver socket. The build mode seats the same parts by hand; it can hand its own
 * finished machine to the town the same way (`createRig`, `createRotor`).
 *
 * Which node turns with which socket (MACHINE_SLOT_MAPPINGS): Windmill sails and millstone; Carousel platform, and with it the
 * poles, horses, column, canopy and lamps; Music Box cylinder, arbor, gears, governor, spring and key.
 */
import { Quaternion } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';
import type { MachineId } from '../game/content';
import type { MaterialRegistry } from '../materials';
import { applyLibraryMaterials } from '../materials';
import { axisOfGlb, createRig, createRotor, horsePhase, type MachineRig, type Rotor } from './motion';
import type { ModelSource } from './scene';

/**
 * Solver socket ids of the nodes that turn when the blueprint does not say otherwise. The Music Box takes its socket ids
 * from the case GLB (`wu.slot`, MUSIC_BOX_BLUEPRINT §7.1). Override them when the content layer names the sockets differently.
 */
export const DEFAULT_SOCKET_IDS = { sails: 'sails', millstone: 'millstone', platform: 'platform' } as const;
export type SocketIds = Readonly<Record<keyof typeof DEFAULT_SOCKET_IDS, string>>;

const MODELS = 'tockton/';
const SHARED = 'shared/';
const HANDLE = `${SHARED}interaction/machine_base_handle.glb`;

/** Carousel layout, from the platform GLB (`poleRadiusCm`, `poleAnglesDeg`, `poleBaseY`) and TOCKTON_DIMENSIONS §6. */
const CAROUSEL = {
  platformY: 0.03,
  columnY: 0,
  canopyY: 0.09,
  poleRadius: 0.042,
  poleAngles: [Math.PI, Math.PI / 3, -Math.PI / 3],
  horseY: 0.006,
  horseTravel: 0.006,
} as const;

const MUSIC_BOX_PARTS: ReadonlyArray<readonly [socket: string, path: string, turns: boolean]> = [
  ['Arbor', `${SHARED}shaft/shaft_short.glb`, true],
  ['BracketL', `${SHARED}structural/bracket_support.glb`, false],
  ['BracketR', `${SHARED}structural/bracket_support.glb`, false],
  ['Comb', `${SHARED}comb/comb_music_box.glb`, false],
  ['Cylinder', `${SHARED}cylinder/cylinder_music_box.glb`, true],
  ['GearA', `${SHARED}spur_gear/gear_spur_10_m1.glb`, true],
  ['GearB', `${SHARED}spur_gear/gear_spur_20_m1.glb`, true],
  ['GearC', `${SHARED}spur_gear/gear_spur_16_m1.glb`, true],
  ['GearD', `${SHARED}spur_gear/gear_spur_12_m1.glb`, true],
  ['Governor', `${SHARED}governor/governor_standard.glb`, true],
  ['Key', `${SHARED}winding_key/winding_key.glb`, true],
  ['Spring', `${SHARED}spring/spring_standard.glb`, true],
];

function find(root: Object3D, name: string): Object3D | null {
  return root.getObjectByName(name) ?? null;
}

/** Puts `part` at `socket`, inside the socket's parent. `socket` orientation: the exact socket frame, or upright (the part keeps its own up). */
function seat(socket: Object3D, part: Object3D, orient: 'socket' | 'upright' = 'socket'): void {
  part.position.copy(socket.position);
  if (orient === 'socket') part.quaternion.copy(socket.quaternion);
  (socket.parent ?? socket).add(part);
}

class Assembler {
  constructor(
    private readonly source: ModelSource,
    private readonly registry: MaterialRegistry,
  ) {}

  async load(path: string): Promise<Object3D> {
    const model = await this.source(path);
    applyLibraryMaterials(model.scene, this.registry);
    return model.scene;
  }

  /** Loads `path` and seats it at `socketName` of `host`. Returns null (and warns) when the host has no such socket. */
  async seatAt(host: Object3D, socketName: string, path: string, orient: 'socket' | 'upright' = 'socket'): Promise<Object3D | null> {
    const socket = find(host, `SOCKET_${socketName}`);
    const part = await this.load(path);
    if (!socket) {
      console.warn(`[wound-up] ${host.name} has no SOCKET_${socketName}; ${path} not seated.`);
      return null;
    }
    seat(socket, part, orient);
    return part;
  }
}

/** The brass base handle every machine base carries (TOCKTON_DIMENSIONS §5.2). */
async function addHandle(a: Assembler, base: Object3D): Promise<void> {
  await a.seatAt(base, 'BaseHandle', HANDLE);
}

export async function buildWindmill(source: ModelSource, registry: MaterialRegistry, ids: SocketIds = DEFAULT_SOCKET_IDS): Promise<MachineRig> {
  const a = new Assembler(source, registry);
  const base = await a.load(`${MODELS}windmill/windmill_base.glb`);
  const tower = await a.seatAt(base, 'Tower', `${MODELS}windmill/windmill_tower.glb`, 'upright');
  const sails = tower && (await a.seatAt(tower, 'Rotor', `${MODELS}windmill/windmill_sails.glb`));
  const stone = await a.seatAt(base, 'Millstone', `${MODELS}windmill/windmill_millstone.glb`);
  await addHandle(a, base);
  const rig = createRig('windmill', base);
  if (sails) rig.rotors.push(createRotor(sails, ids.sails, { axis: axisOfGlb(sails) }));
  if (stone) rig.rotors.push(createRotor(stone, ids.millstone, { axis: axisOfGlb(stone) }));
  return rig;
}

export async function buildCarousel(source: ModelSource, registry: MaterialRegistry, ids: SocketIds = DEFAULT_SOCKET_IDS): Promise<MachineRig> {
  const a = new Assembler(source, registry);
  const base = await a.load(`${MODELS}carousel/carousel_base.glb`);
  const platform = await a.load(`${MODELS}carousel/carousel_platform.glb`);
  platform.position.set(0, CAROUSEL.platformY, 0);
  base.add(platform);
  const column = await a.load(`${MODELS}carousel/carousel_column.glb`);
  column.position.set(0, CAROUSEL.columnY, 0);
  platform.add(column);
  const canopy = await a.load(`${MODELS}carousel/carousel_canopy.glb`);
  canopy.position.set(0, CAROUSEL.canopyY, 0);
  platform.add(canopy);
  await addHandle(a, base);

  const rig = createRig('carousel', base);
  const rotor: Rotor = createRotor(platform, ids.platform, { axis: axisOfGlb(platform) });
  rig.rotors.push(rotor);
  rig.melody = rotor;

  // Horses on the three poles, facing the way the platform turns, rising and falling a third of a turn apart.
  const count = CAROUSEL.poleAngles.length;
  for (let i = 0; i < count; i++) {
    const angle = CAROUSEL.poleAngles[i];
    const horse = await a.load(`${MODELS}carousel/carousel_horse.glb`);
    horse.position.set(CAROUSEL.poleRadius * Math.sin(angle), CAROUSEL.horseY, CAROUSEL.poleRadius * Math.cos(angle));
    horse.rotation.y = angle + Math.PI / 2;
    platform.add(horse);
    rig.bobbers.push({ node: horse, driver: rotor, baseY: CAROUSEL.horseY, phase: horsePhase(i, count), amplitude: CAROUSEL.horseTravel });
  }

  // Six lamps on the canopy rim; they twinkle out of step with one another.
  for (let i = 0; i < 6; i++) {
    const lamp = await a.seatAt(canopy, `Lamp${i}`, `${MODELS}carousel/carousel_lamp.glb`);
    if (lamp) rig.pulsers.push({ node: lamp, phase: i * 1.7, amplitude: 0.18, speed: 5.5, baseScale: 1 });
  }
  return rig;
}

export async function buildMusicBox(source: ModelSource, registry: MaterialRegistry): Promise<MachineRig> {
  const a = new Assembler(source, registry);
  const box = await a.load(`${MODELS}music_box/music_box_case.glb`);
  box.updateMatrixWorld(true);
  const rig = createRig('music_box', box);

  const turning: Array<{ node: Object3D; slot: string }> = [];
  for (const [socketName, path, turns] of MUSIC_BOX_PARTS) {
    const socket = find(box, `SOCKET_${socketName}`);
    const part = await a.seatAt(box, socketName, path);
    if (!part || !socket || !turns) continue;
    const slot = (socket.userData.wu as { slot?: string } | undefined)?.slot ?? socketName.toLowerCase();
    turning.push({ node: part, slot });
  }
  await addHandle(a, box);

  for (const { node, slot } of turning) {
    const rotor = createRotor(node, slot);
    rig.rotors.push(rotor);
    if (slot === 'cylinder') rig.melody = rotor;
  }

  // The lid swings on its hinge while the box plays, so the cylinder shows. The lid mesh moves under the hinge empty.
  const pivot = find(box, 'PIV_Lid');
  const lid = find(box, 'MusicBoxCase_Lid');
  if (pivot && lid) {
    pivot.attach(lid);
    const openDeg = (pivot.userData.wu as { openDeg?: number } | undefined)?.openDeg ?? 100;
    rig.lid = { pivot, rest: new Quaternion().copy(pivot.quaternion), openRad: (openDeg * Math.PI) / 180, angle: 0 };
  }
  return rig;
}

/** Builds the finished machine of `id`, or null for a machine this build does not have (the Clock Tower is cut first). */
export function buildMachine(id: MachineId, source: ModelSource, registry: MaterialRegistry, ids?: SocketIds): Promise<MachineRig | null> {
  switch (id) {
    case 'windmill':
      return buildWindmill(source, registry, ids);
    case 'carousel':
      return buildCarousel(source, registry, ids);
    case 'music_box':
      return buildMusicBox(source, registry);
    default:
      return Promise.resolve(null);
  }
}
