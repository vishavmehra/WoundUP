/**
 * Desktop demo view (debug only): `/?debug&demo=music_box` (or `carousel`, `windmill`) skips the flow and shows that finished
 * machine running, so the way its parts work together can be watched in a plain browser window.
 *
 * It is not an animation of its own. The machine is the one the game builds (`buildMachine`), the speeds are the solver's
 * (`solveAssembly` at eight wind units), and the rig is stepped by the town runtime exactly as in play (`stepRig`). All this file
 * adds is what a headset does for the player: it winds the spring, winds it again when it has run down, and moves the camera.
 *
 * Without `?debug` nothing here is reached (`demoRequest` returns null). It never creates a GameSession, so it reads and writes no
 * save. The Music Box stands on the workbench where the game puts the machine it has just finished; the Carousel and the Windmill
 * stand on their plots, awake. The Clock Tower has no finished machine in this build (`buildMachine` returns null), so it is not offered.
 */
import { Box3, createSystem, Vector3 } from '@iwsdk/core';
import type { Object3D, World } from '@iwsdk/core';
import { AudioEngine } from '../audio';
import { getBlueprint, solveAssembly } from '../content/blueprints';
import { MACHINE_PLOT } from '../game/content';
import type { MaterialRegistry } from '../materials';
import { applyLibraryMaterials } from '../materials';
import type { RenderBudget } from '../render-budget';
import { MAX_WIND_UNITS } from '../sim';
import type { SolveResult } from '../sim';
import { STAGE_NODE_ID } from '../stage';
import { BLUEPRINT_SOCKET_IDS, buildMachine, installTown, loadModel } from '../town';
import type { MachineRig, TownRuntime } from '../town';
import { stepRig } from '../town/motion';
import { BENCH, benchPoint, benchZ } from '../ui/layout';

/** The finished machines `buildMachine` makes. */
export const DEMO_MACHINES = ['music_box', 'carousel', 'windmill'] as const;
export type DemoMachine = (typeof DEMO_MACHINES)[number];

export const DEMO_HINT = 'Debug demo: the real solver is turning this machine. Drag to look around, scroll to zoom.';

/** The machine `?debug&demo=<machine>` asks for, or null. Without `debug` the demo does not exist. */
export function demoRequest(search: string): DemoMachine | null {
  const params = new URLSearchParams(search);
  const wanted = params.get('demo');
  if (!params.has('debug') || wanted === null) return null;
  if ((DEMO_MACHINES as readonly string[]).includes(wanted)) return wanted as DemoMachine;
  console.warn(`[wound-up] demo "${wanted}" has no finished machine in this build (try ${DEMO_MACHINES.join(', ')}); starting the game.`);
  return null;
}

// ---- Winding ------------------------------------------------------------------------------------------------------------

/** The machine counts as stopped (and is wound again) once its eased speed is below this fraction of full speed. */
const STOPPED_SPEED = 0.02;

/**
 * The spring's run, as Gameplay does it for a finished machine: the machine runs for the solver's `runSeconds` (all of them for
 * a wind-driven one), then `running` goes false and the rig eases to a stop. Here it is then wound again, for ever.
 */
export class Winding {
  /** Seconds of spring left; Infinity for a machine that has the wind. */
  left = 0;
  /** How many times it has been wound. */
  windings = 0;

  constructor(
    readonly rig: MachineRig,
    readonly result: SolveResult,
  ) {
    rig.result = result;
    this.windUp();
  }

  windUp(): void {
    this.rig.running = true;
    this.left = this.result.continuous ? Infinity : this.result.runSeconds;
    this.windings += 1;
  }

  update(dt: number): void {
    if (this.rig.running) {
      this.left -= dt;
      if (this.left <= 0) {
        this.left = 0;
        this.rig.running = false;
      }
    } else if (this.rig.speed < STOPPED_SPEED) {
      this.windUp();
    }
  }
}

// ---- Camera -------------------------------------------------------------------------------------------------------------

const _eye = new Vector3();

/** A point `distance` from `target`, `azimuth` radians round it (0 is straight in front, on +Z) and `elevation` above the horizon. */
export function orbitPosition(out: Vector3, target: Vector3, distance: number, azimuth: number, elevation: number): Vector3 {
  const flat = distance * Math.cos(elevation);
  return out.set(target.x + flat * Math.sin(azimuth), target.y + distance * Math.sin(elevation), target.z + flat * Math.cos(azimuth));
}

/** Slow turn of the auto-orbit, radians per second. */
const AUTO_ORBIT_RAD_S = 0.18;
const MIN_ELEVATION = (5 * Math.PI) / 180;
const MAX_ELEVATION = (80 * Math.PI) / 180;
const DRAG_RAD_PER_PX = 0.007;
const ZOOM_PER_WHEEL = 0.0012;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.2;
/** A frame longer than this (a hidden tab, a hitch) is cut. */
const MAX_FRAME_S = 0.1;

class OrbitView {
  azimuth = 0.35;
  private zoom = 1;
  private dragging = false;

  constructor(
    private readonly world: World,
    private readonly target: Vector3,
    private readonly radius: number,
    private elevation: number,
  ) {
    const el = window;
    el.addEventListener('pointerdown', (e) => {
      if (!(e.target as Element | null)?.closest('button, a, input, select, textarea')) this.dragging = true;
    });
    const stop = (): void => void (this.dragging = false);
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('blur', stop);
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.azimuth -= e.movementX * DRAG_RAD_PER_PX;
      this.elevation = Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, this.elevation + e.movementY * DRAG_RAD_PER_PX));
    });
    el.addEventListener(
      'wheel',
      (e) => {
        this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * (1 + e.deltaY * ZOOM_PER_WHEEL)));
      },
      { passive: true },
    );
  }

  /** Distance at which a sphere of the machine's radius fills the narrower of the two fields of view. */
  private distance(): number {
    const camera = this.world.camera;
    const vertical = (camera.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    return (this.radius / Math.sin(Math.min(vertical, horizontal) / 2)) * this.zoom;
  }

  update(dt: number): void {
    if (!this.dragging) this.azimuth += AUTO_ORBIT_RAD_S * dt;
    const camera = this.world.camera;
    orbitPosition(_eye, this.target, this.distance(), this.azimuth, this.elevation);
    camera.parent?.worldToLocal(_eye);
    camera.position.copy(_eye);
    camera.updateWorldMatrix(true, false);
    camera.lookAt(this.target);
  }
}

// ---- The demo -----------------------------------------------------------------------------------------------------------

const HUD_PERIOD_S = 0.25;

interface DemoLook {
  /** Camera height above the horizon, degrees. */
  elevationDeg: number;
  /** How much of the field of view the machine fills; below 1 is closer. */
  closeness: number;
}
const LOOKS: Readonly<Record<DemoMachine, DemoLook>> = {
  music_box: { elevationDeg: 38, closeness: 0.8 },
  carousel: { elevationDeg: 18, closeness: 0.95 },
  windmill: { elevationDeg: 14, closeness: 0.95 },
};

class Demo {
  private hudClock = HUD_PERIOD_S;

  constructor(
    readonly machine: DemoMachine,
    readonly rig: MachineRig,
    readonly winding: Winding,
    private readonly view: OrbitView,
    private readonly hud: HTMLElement,
    private readonly budget: RenderBudget,
  ) {}

  update(rawDt: number): void {
    const dt = rawDt < MAX_FRAME_S ? rawDt : MAX_FRAME_S;
    this.winding.update(dt);
    this.view.update(dt);
    this.budget.wake(); // the camera moves every frame, so the 2D page draws every frame
    this.hudClock += dt;
    if (this.hudClock >= HUD_PERIOD_S) {
      this.hudClock = 0;
      this.hud.textContent = this.text();
    }
  }

  /** Solver values only: what the machine is being driven with right now. */
  private text(): string {
    const { result, rig } = this.winding;
    const lines = [`${this.machine}: solver says "${result.status}"${result.continuous ? '' : `, wound to ${MAX_WIND_UNITS}/${MAX_WIND_UNITS}`}`];
    lines.push(result.continuous ? 'driven by the wind' : `spring: ${this.winding.left.toFixed(1)} of ${result.runSeconds.toFixed(1)} s left${rig.running ? '' : ' (run down)'}`);
    for (const [socket, omega] of Object.entries(result.angularVelocity)) {
      if (rig.rotors.some((r) => r.socketId === socket)) lines.push(`${socket}: ${(omega * rig.speed).toFixed(2)} rad/s`);
    }
    return lines.join('\n');
  }

  /** What `window.__wuDemo` shows (QA): the machine, the winding and each rotor's unwrapped angle. */
  state() {
    return {
      machine: this.machine,
      status: this.winding.result.status,
      running: this.rig.running,
      speed: this.rig.speed,
      left: this.winding.left,
      windings: this.winding.windings,
      lidAngle: this.rig.lid?.angle ?? null,
      rotors: this.rig.rotors.map((r) => ({ socketId: r.socketId, theta: r.theta })),
      horses: this.rig.bobbers.map((b) => b.node.position.y),
    };
  }
}

const running = new WeakMap<World, Demo>();

/** Steps the demo every frame, after the town (11) has stepped the machine. */
export class DemoSystem extends createSystem({}) {
  update(dt: number): void {
    running.get(this.world)?.update(dt);
  }
}

function makeHud(): HTMLElement {
  const hud = document.createElement('pre');
  hud.id = 'wu-demo-hud';
  hud.setAttribute('aria-hidden', 'true');
  hud.style.cssText =
    'position:fixed;left:12px;bottom:12px;margin:0;padding:8px 10px;max-width:70vw;z-index:50;pointer-events:none;' +
    'font:12px/1.35 ui-monospace,Consolas,monospace;color:#f2e6cf;background:rgba(43,26,15,0.72);border-radius:4px;white-space:pre-wrap';
  document.body.append(hud);
  return hud;
}

/** Sits the finished machine where the game would, and returns the point the camera looks at and how big the machine is. */
async function place(world: World, town: TownRuntime, materials: MaterialRegistry, rig: MachineRig, machine: DemoMachine): Promise<Object3D> {
  const stage = world.getSceneObject(STAGE_NODE_ID);
  if (!stage) throw new Error(`Scene node "${STAGE_NODE_ID}" is missing.`);
  if (machine === 'music_box') {
    const bench = (await loadModel('tockton/workshop/workbench.glb')).scene;
    applyLibraryMaterials(bench, materials);
    bench.position.set(0, 0, benchZ(town.townScale));
    stage.add(bench);
    const at = benchPoint(town.townScale, BENCH.build);
    rig.root.position.set(at.x, at.y, at.z);
    stage.add(rig.root);
    town.addRig(rig);
  } else {
    town.placeRig(rig);
    town.restore([MACHINE_PLOT[machine]]);
  }
  return rig.root;
}

/**
 * Builds the finished machine, puts it where the game does, winds it with the real solver's result and starts the camera.
 * The caller (src/index.ts) switches the page to its preview mode.
 */
export async function installDemo(world: World, materials: MaterialRegistry, texturesReady: Promise<void>, budget: RenderBudget, machine: DemoMachine): Promise<void> {
  const audio = new AudioEngine();
  audio.installGestureUnlock(); // the melody sounds after the first click or key press
  const town = await installTown(world, { registry: materials, audio, keepAwake: () => budget.wake() });
  await texturesReady;
  const blueprint = getBlueprint(machine);
  const rig = await buildMachine(machine, loadModel, materials, BLUEPRINT_SOCKET_IDS);
  if (!blueprint || !rig) throw new Error(`There is no finished ${machine} to show.`);
  const outcome = solveAssembly(blueprint, blueprint.intended, MAX_WIND_UNITS);
  if (!outcome.ok) throw new Error(`The solver rejected the ${machine}: ${JSON.stringify(outcome.errors)}`);

  const root = await place(world, town, materials, rig, machine);
  const winding = new Winding(rig, outcome.result);
  if (rig.lid) rig.lid.angle = rig.lid.openRad; // open from the first frame: the mechanism is what there is to see
  stepRig(rig, 0, 0); // poses the open lid before the machine is measured and drawn
  world.scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  const look = LOOKS[machine];
  const view = new OrbitView(world, box.getCenter(new Vector3()), (box.getSize(new Vector3()).length() / 2) * look.closeness, (look.elevationDeg * Math.PI) / 180);

  const demo = new Demo(machine, rig, winding, view, makeHud(), budget);
  running.set(world, demo);
  world.registerSystem(DemoSystem, { priority: 12 });
  Object.assign(window, { __wuDemo: demo });
  budget.wake();
}
