/**
 * The Helper's cues over Three.js (INTRICATE_ASSEMBLY_DESIGN §7.2, §7.5): the part that glows where it lies (Show), the socket that pulses in lamp light
 * (Show and the idle pulse), a ghost of the part at its socket (Demonstrate, when the ghost hands are not there), and `SceneHelper`, which joins them with
 * the flight (helper-flight.ts) into the `HelperScene` that `Helper` (helper.ts) speaks to. The game loop supplies a `HelperWorld`: four lookups and a seat.
 *
 * Nothing here moves a part but the flight, nothing decides, nothing is saved. The glow is made of the part's own geometry with two private materials, so the
 * shared library materials never pulse with it, and it lives beside the part in the scene (following its pose every frame), never inside it: the interaction
 * layer's ghost of a held part is built from the part's own meshes and must not pick the glow up. Cost while a cue is up: the part's meshes drawn twice more,
 * one small sphere; nothing when idle. `update` allocates nothing.
 */
import { AdditiveBlending, BackSide, Color, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import type { Object3D } from 'three';
import { GhostPreview } from '../interaction/ghost';
import { HelperFlight } from './helper-flight';
import type { HelperScene, HelperTarget } from './helper';

/** Seconds for one breath of the glow and the pulse. */
export const CUE_PERIOD_S = 1.2;
/** Pulse radius for a big part and for a piece of hardware, metres. */
export const PULSE_RADIUS_M = 0.03;
export const PULSE_RADIUS_HARDWARE_M = 0.012;

const LAMP = 0xffc66d; // warm lamp glow, CLAUDE.md §8
const HULL_SCALE = 1.08;

/** 0 to 1 and back, once per `CUE_PERIOD_S`: the breath of the cues. */
export const breath = (seconds: number): number => 0.5 - 0.5 * Math.cos((seconds / CUE_PERIOD_S) * Math.PI * 2);

/** What the Helper needs to know about the live scene. `src/gameplay.ts` implements it over the tray, the caddy, the sockets and the interaction layer. */
export interface HelperWorld {
  /** The piece the target is about: its part in the tray, the live piece at its bin's mouth, the unit's carrier for a `carry`, the key for `wind`. Null: none. */
  part(target: HelperTarget): Object3D | null;
  /** The target's socket: the `SOCKET_` empty. Null: not there. */
  socket(target: HelperTarget): Object3D | null;
  /** The socket can take a part now (it is armed and empty). A flight starts only then. */
  free(target: HelperTarget): boolean;
  /** Seats `part` in the target's socket as a hand's release would (`seatNow`). If it refuses, it must send the part home to its place. */
  seat(target: HelperTarget, part: Object3D): boolean;
  /** A hand holds `part`: a flight in the air gives way to it. */
  held(part: Object3D): boolean;
  /** The one soft chime of the first offer of a build. */
  chime(): void;
}

const _inverse = new Matrix4();
const _relative = new Matrix4();
const _position = new Vector3();
const _quaternion = new Quaternion();

export class HelperCues {
  private readonly fillMaterial = new MeshBasicMaterial({ color: new Color(LAMP), transparent: true, opacity: 0.1, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  private readonly hullMaterial = new MeshBasicMaterial({ color: new Color(LAMP), side: BackSide, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false });
  private readonly pulseGeometry = new SphereGeometry(1, 14, 10);
  private readonly pulseMaterial = new MeshBasicMaterial({ color: new Color(LAMP), transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: AdditiveBlending });
  private readonly pulseMesh: Mesh;
  private readonly glowRoot = new Group();
  private glowOn: Object3D | null = null;
  private pulseAt: Object3D | null = null;
  private pulseRadius = PULSE_RADIUS_M;
  private ghost: GhostPreview | null = null;
  private ghostNode: Object3D | null = null;
  private clock = 0;

  constructor(private readonly scene: Object3D) {
    this.pulseMesh = new Mesh(this.pulseGeometry, this.pulseMaterial);
    this.pulseMesh.name = 'HelperPulse';
    this.pulseMesh.renderOrder = 12;
    this.pulseMesh.raycast = () => {}; // a cue is never a pointer target
    this.pulseMesh.visible = false;
    scene.add(this.pulseMesh);
    this.glowRoot.name = 'HelperGlow';
    this.glowRoot.visible = false;
    scene.add(this.glowRoot);
  }

  /** The part glows: a warm outline and a faint fill made from its own meshes, kept on its pose every frame. Null puts the glow out. */
  glow(part: Object3D | null): void {
    this.unglow();
    if (part === null) return;
    part.updateWorldMatrix(true, true);
    _inverse.copy(part.matrixWorld).invert();
    part.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh || node.userData.wuProxy || !node.visible) return; // the invisible collider proxies are not part of how it looks
      _relative.multiplyMatrices(_inverse, mesh.matrixWorld);
      const fill = new Mesh(mesh.geometry, this.fillMaterial);
      const hull = new Mesh(mesh.geometry, this.hullMaterial);
      for (const piece of [fill, hull]) {
        _relative.decompose(piece.position, piece.quaternion, piece.scale);
        piece.raycast = () => {};
        piece.renderOrder = 10;
        this.glowRoot.add(piece);
      }
      hull.scale.multiplyScalar(HULL_SCALE);
    });
    this.glowOn = part;
    this.glowRoot.visible = true;
    this.followGlow(part);
  }

  /** The socket pulses in lamp light, following its empty. Null puts the pulse out. */
  pulse(node: Object3D | null, radius: number = PULSE_RADIUS_M): void {
    this.pulseAt = node;
    this.pulseRadius = radius;
    this.pulseMesh.visible = node !== null;
    if (node === null) this.pulseMaterial.opacity = 0;
  }

  /** A ghost of the part waits at the socket, warm: where it will go. */
  showGhost(part: Object3D, node: Object3D): void {
    this.unghost();
    this.ghost = new GhostPreview(part, this.scene);
    this.ghostNode = node;
    this.placeGhost();
  }

  /** Glow, pulse and ghost all away. */
  clear(): void {
    this.unglow();
    this.unghost();
    this.pulse(null);
  }

  /** The breath of the glow and the pulse, and the pulse's place. */
  update(dt: number): void {
    if (this.glowOn === null && this.pulseAt === null && this.ghost === null) return;
    this.clock += dt;
    const p = breath(this.clock);
    if (this.glowOn !== null) {
      this.followGlow(this.glowOn);
      this.hullMaterial.opacity = 0.35 + 0.6 * p;
      this.fillMaterial.opacity = 0.06 + 0.14 * p;
    }
    if (this.pulseAt !== null) {
      this.pulseAt.getWorldPosition(_position);
      this.pulseMesh.position.copy(_position);
      this.pulseMesh.scale.setScalar(this.pulseRadius * (0.85 + 0.3 * p));
      this.pulseMaterial.opacity = 0.2 + 0.3 * p;
    }
    if (this.ghost !== null) this.placeGhost();
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.pulseMesh);
    this.scene.remove(this.glowRoot);
    this.pulseGeometry.dispose();
    this.pulseMaterial.dispose();
    this.fillMaterial.dispose();
    this.hullMaterial.dispose();
  }

  private placeGhost(): void {
    const node = this.ghostNode;
    if (this.ghost === null || node === null) return;
    node.getWorldPosition(_position);
    node.getWorldQuaternion(_quaternion);
    this.ghost.show(_position, _quaternion, true);
  }

  /** The glow stands where the part stands, at its size (a part on a scaled town plot is scaled with it). */
  private followGlow(part: Object3D): void {
    part.updateWorldMatrix(true, false);
    part.matrixWorld.decompose(this.glowRoot.position, this.glowRoot.quaternion, this.glowRoot.scale);
  }

  private unglow(): void {
    this.glowRoot.clear(); // the geometry belongs to the part and the materials are ours, freed in dispose
    this.glowRoot.visible = false;
    this.glowOn = null;
  }

  private unghost(): void {
    this.ghost?.dispose();
    this.ghost = null;
    this.ghostNode = null;
  }
}

/** The Helper's scene: the cues and the flight over a `HelperWorld`. Give it to `new AssemblyDirector({ scene })`, call `dispose` with the game. */
export class SceneHelper implements HelperScene {
  readonly cues: HelperCues;
  readonly flight: HelperFlight;

  constructor(
    scene: Object3D,
    private readonly world: HelperWorld,
  ) {
    this.cues = new HelperCues(scene);
    this.flight = new HelperFlight(scene);
  }

  glowPart(target: HelperTarget): void {
    this.cues.glow(this.world.part(target));
  }

  pulseSocket(target: HelperTarget | null): void {
    this.cues.pulse(target === null ? null : this.world.socket(target), target?.hardware === true ? PULSE_RADIUS_HARDWARE_M : PULSE_RADIUS_M);
  }

  ghostPart(target: HelperTarget): void {
    const part = this.world.part(target);
    const node = this.world.socket(target);
    if (part !== null && node !== null) this.cues.showGhost(part, node);
  }

  fly(target: HelperTarget): boolean {
    if (target.kind === 'wind' || this.flight.active) return false; // the Helper never winds; one flight at a time
    const part = this.world.part(target);
    const node = this.world.socket(target);
    if (part === null || node === null || !this.world.free(target)) return false;
    this.flight.start(
      part,
      node,
      () => {
        this.world.seat(target, part);
      },
      () => this.world.held(part),
    );
    return true;
  }

  clear(): void {
    this.cues.clear();
  }

  chime(): void {
    this.world.chime();
  }

  update(dt: number): void {
    this.cues.update(dt);
    this.flight.update(dt);
  }

  dispose(): void {
    this.cues.dispose();
    this.flight.dispose();
  }
}
