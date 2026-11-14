/**
 * Builds Tockton's scenery under one `town` group: the ground with its four plot sockets, the Bakery with Otto at its baker
 * socket, the theatre facade and Mira (TOCKTON_DIMENSIONS §3.3, §7), and the dressing of houses, props and lamp posts
 * (dressing.ts). Pure scene-graph work on loaded models, so Node tests can run it on real GLBs; the app's loader is `loadModel`.
 */
import { AnimationMixer, AssetManager, Group, Object3D as Node3D } from '@iwsdk/core';
import type { AnimationAction, AnimationClip, Object3D } from '@iwsdk/core';
import type { MaterialRegistry } from '../materials';
import { applyLibraryMaterials } from '../materials';
import { TOWN_NODE_ID } from '../stage';
import type { PlotId } from '../game/content';
import { buildDressing, loadDressingModels } from './dressing';
import type { Dressing, DressingModels } from './dressing';
import { BAKER_SOCKET, BAKERY_AT, machineOfPlot, MACHINE_SNAP_PART, MIRA_AT, PAD_TOP_M, PLOT_CAPTURE_M, PLOTS, THEATRE_AT } from './layout';
import type { PlotLayout } from './layout';

/** A loaded GLB: its scene graph and animation clips. */
export interface TownModel {
  scene: Object3D;
  animations: readonly AnimationClip[];
}

/** Returns a fresh instance of the GLB at `path` (relative to `assets/models/`) each time it is called. */
export type ModelSource = (path: string) => Promise<TownModel>;

export const KNEAD_CLIP = 'Otto_Knead';

export const TOWN_MODEL_PATHS = {
  ground: 'tockton/environment/town_ground.glb',
  bakery: 'tockton/bakery/bakery_building.glb',
  theatre: 'tockton/theatre/theatre_facade.glb',
  otto: 'tockton/characters/figure_otto.glb',
  mira: 'tockton/characters/figure_mira.glb',
} as const;

export interface Town {
  /** The `town` group (scene node id `TOWN_NODE_ID`); StageSystem scales it with the table placement. */
  readonly group: Group;
  readonly ground: Object3D;
  readonly bakery: Object3D;
  readonly theatre: Object3D;
  readonly otto: Object3D;
  readonly mira: Object3D;
  /** Otto's kneading on its own mixer, held on its first frame (timeScale 0) while the Bakery is frozen. Null when the clip is missing. */
  readonly knead: { readonly mixer: AnimationMixer; readonly action: AnimationAction } | null;
  /** The houses, props and lamp posts. Null when their files did not load (the town is then bare but plays). */
  readonly dressing: Dressing | null;
}

/** The app's loader: IWSDK's AssetManager caches the file and hands out a clone (shared geometry and materials) per call. */
export const loadModel: ModelSource = async (path) => {
  const url = `${import.meta.env.BASE_URL}assets/models/${path}`;
  const key = `wu-model-${path}`;
  await AssetManager.loadGLTF(url, key);
  const gltf = AssetManager.getGLTF(key);
  if (!gltf) throw new Error(`model ${path} did not load`);
  return { scene: gltf.scene, animations: gltf.animations };
};

/** Loads and assembles the town. `source` is `loadModel` in the app; `withDressing` false skips the houses, props and lamps (the gift page hides the town). */
export async function loadTown(source: ModelSource, registry: MaterialRegistry, withDressing = true): Promise<Town> {
  const dressing = (withDressing ? loadDressingModels(source) : Promise.resolve(undefined)).catch((error: unknown) => {
    console.warn('[wound-up] The town dressing did not load; Tockton stays bare.', error);
    return undefined;
  });
  const [ground, bakery, theatre, otto, mira] = await Promise.all(
    Object.values(TOWN_MODEL_PATHS).map((path) => source(path)),
  );
  return buildTown({ ground, bakery, theatre, otto, mira, dressing: await dressing }, registry);
}

export function buildTown(
  models: { ground: TownModel; bakery: TownModel; theatre: TownModel; otto: TownModel; mira: TownModel; dressing?: DressingModels },
  registry: MaterialRegistry,
): Town {
  for (const model of [models.ground, models.bakery, models.theatre, models.otto, models.mira]) applyLibraryMaterials(model.scene, registry);

  const group = new Group();
  group.name = 'Tockton';
  group.userData.iwsdkSceneNodeId = TOWN_NODE_ID;

  const ground = models.ground.scene;
  const bakery = models.bakery.scene;
  const theatre = models.theatre.scene;
  const otto = models.otto.scene;
  const mira = models.mira.scene;

  // town_ground.glb gives its plot sockets a Z-up frame (mating axis +Z, pointing up). A machine base is a Y-up model, and a
  // part seated in a socket takes the socket's orientation, so it would be tipped onto its back. A plot is where the base
  // origin lands, upright and facing the way the stage does: take the tilt out of the socket.
  for (const plot of Object.values(PLOTS)) {
    const node = ground.getObjectByName(`SOCKET_${plot.socket}`) ?? addPlotSocket(ground, plot);
    node.quaternion.identity();
    // The Well's and the Belfry's plots take a held machine from further away than the others (ADR-048): the radii are layout data.
    const capture = PLOT_CAPTURE_M[plot.id];
    if (capture) node.userData.wu = { ...(node.userData.wu as object | undefined), captureRadius: capture.radius, captureRadiusEasy: capture.easyRadius };
  }

  bakery.position.set(BAKERY_AT.x, 0, BAKERY_AT.z);
  theatre.position.set(THEATRE_AT.x, 0, THEATRE_AT.z);
  mira.position.set(MIRA_AT.x, MIRA_AT.y, MIRA_AT.z);

  // Otto's feet are at the Bakery's baker socket, in the Bakery's own frame, facing +Z.
  const socket = bakery.getObjectByName(BAKER_SOCKET);
  if (socket) {
    otto.position.copy(socket.position);
    otto.quaternion.copy(socket.quaternion);
    bakery.add(otto);
  } else {
    console.warn(`[wound-up] ${BAKER_SOCKET} is missing from the Bakery; Otto stands at the Bakery's origin.`);
    otto.position.set(-0.045, 0.004, 0.0275); // where bakery_building.glb puts it (TOCKTON_DIMENSIONS §11)
    bakery.add(otto);
  }

  group.add(ground, bakery, theatre, mira);
  const dressing = models.dressing ? buildDressing(models.dressing, registry) : null;
  if (dressing) group.add(dressing.group);

  const clip = models.otto.animations.find((c) => c.name === KNEAD_CLIP);
  let knead: Town['knead'] = null;
  if (clip) {
    const mixer = new AnimationMixer(otto);
    const action = mixer.clipAction(clip);
    action.play();
    action.timeScale = 0; // frozen on the first frame until the Windmill wakes the Bakery
    mixer.update(0); // applies that first frame
    knead = { mixer, action };
  }
  return { group, ground, bakery, theatre, otto, mira, knead, dressing };
}

/**
 * A plot's socket empty made from the layout, for a town_ground.glb that does not carry one (an older file: the Well's and the Belfry's
 * pads were added to it with ADR-048). Only the empty is made, never a pad: without the GLB's pad the machine stands on the paving. Say so.
 */
function addPlotSocket(ground: Object3D, plot: PlotLayout): Object3D {
  console.warn(`[wound-up] town_ground.glb has no SOCKET_${plot.socket}; the socket is made from the layout and the plot has no pad.`);
  const node = new Node3D();
  node.name = `SOCKET_${plot.socket}`;
  node.position.set(plot.x, PAD_TOP_M, plot.z);
  node.userData.wu = { type: 'socket', accepts: [MACHINE_SNAP_PART[machineOfPlot(plot.id)]], plot: plot.id };
  ground.add(node);
  return node;
}

/** The `SOCKET_Plot...` empty of a plot in the town ground: where a machine's base origin lands. Null when the GLB lacks it. */
export function plotSocket(town: Town, plot: PlotId): Object3D | null {
  return town.ground.getObjectByName(`SOCKET_${PLOTS[plot].socket}`) ?? null;
}
