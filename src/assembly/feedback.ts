/**
 * The feedback of the intricate assembly (INTRICATE_ASSEMBLY_DESIGN §10, ADR-050): what the player hears and sees as the Music Box is
 * built, stage by stage. One small API for the director (a game layer that knows when a part seated, a stage closed, the machine first
 * ran and the box is done):
 *
 *   onSnap(voice, node, travel?)   a part seated: the sound of its material, a 0.3 s brass glint, a 90 ms settle (a screw turns a quarter)
 *   onStage(index, parts?)         a stage closed: its rising chord, the dial tick, a glint down the stage's parts in mechanical order
 *   onFirstRun(graph)              the machine first ran: a glint walks the solver's own graph from the power source, 150 ms a node
 *   onReveal(then?)                the box closes its lid with a thump and lifts it open again as the melody starts (about 4 s)
 *   update(dt, camera)             every frame, after SocketSnapSystem (priority 10): the glints, settles, reveal and timers
 *
 * Presentation only. Nothing here decides anything, touches the solver, saves anything or counts anything.
 *
 * The glints are one `InstancedMesh` of 8 camera-facing additive quads (one draw call while any is alive, none when idle). It is not a
 * material change, so the shared library materials never flash together; it is warm lamp glow (#FFC66D) and never brighter than 0.6.
 * `update` allocates nothing: every scratch object is module-level and every pool is fixed. The timeline holds 48 pending events;
 * past that an event is dropped rather than queued without bound.
 */
import { AdditiveBlending, Color, DataTexture, InstancedMesh, LinearFilter, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, RGBAFormat, UnsignedByteType, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { AudioEngine } from '../audio/engine';
import { MAX_SNAP_STEP } from '../audio/notes';
import type { SnapVoice } from '../audio/voices';
import { SNAP_TWEEN_S } from '../interaction/snap';

// ---- Tuning (seconds and bench metres; presentation values, nothing else depends on them) ----

/** The settle after the 120 ms seat tween (design §10.1: "a 90 ms settle, a 0.4 mm overshoot back to rest"). */
export const SETTLE_S = 0.09;
export const SETTLE_OVERSHOOT_M = 0.0004;
/** A screw turns a quarter turn about its own +Z as it seats. */
export const SCREW_TURN_RAD = Math.PI / 2;
/** One brass glint: it flares in 20 % of its life and fades out. */
export const GLINT_S = 0.3;
export const GLINT_PEAK = 0.6;
export const GLINT_POOL = 8;
/** Side of a glint's quad and how far it sweeps across the part, in the units of the parent frame (the bench, metres). */
export const GLINT_SIZE_M = 0.022;
export const GLINT_SWEEP_M = 0.008;
/** A stage's parts glint 60 ms apart; the power path takes 150 ms a node (design §10.2, §10.4). */
export const BEAT_GAP_S = 0.06;
export const POWER_NODE_S = 0.15;
/** The reveal: the lid shuts (thump), a held breath, then lifts as the melody starts. */
export const REVEAL_CLOSE_S = 0.5;
export const REVEAL_HOLD_S = 1.4;
export const REVEAL_OPEN_S = 1.9;
/** Seconds from `onReveal` to the lid starting to lift: the moment the melody should start. */
export const REVEAL_OPEN_AT_S = REVEAL_CLOSE_S + REVEAL_HOLD_S;
export const REVEAL_S = REVEAL_OPEN_AT_S + REVEAL_OPEN_S;
/** Stages of the Music Box. */
export const MUSIC_BOX_STAGES = 7;

const GLINT_RISE = 0.2;
const SETTLE_SLOTS = 4;
const QUEUE = 48;
/** Warm lamp glow, CLAUDE.md §8. */
const GLINT_COLOR = new Color(0xffc66d);

// ---- Pure maths (exported for the tests; nothing here touches a scene) ----

/** 0 at both ends, 1 at a third of the way: the shape of the 0.4 mm overshoot that comes back to rest. */
export function settleCurve(t: number): number {
  if (!(t > 0) || t >= 1) return 0;
  return (27 / 4) * t * (1 - t) * (1 - t);
}

/** Brightness (0 to `GLINT_PEAK`) of a glint `age` seconds old. */
export function glintEnvelope(age: number): number {
  if (!(age > 0) || age >= GLINT_S) return 0;
  const u = age / GLINT_S;
  return GLINT_PEAK * (u < GLINT_RISE ? u / GLINT_RISE : ((1 - u) / (1 - GLINT_RISE)) ** 2);
}

/**
 * The lid's angle `t` seconds into the reveal: it shuts from `from` (accelerating, so it lands with the thump at `REVEAL_CLOSE_S`),
 * stays shut for a held breath, then opens smoothly to `openRad` by `REVEAL_S`. Radians, 0 closed, positive opens.
 */
export function revealLidAngle(t: number, from: number, openRad: number): number {
  if (t < REVEAL_CLOSE_S) {
    const u = Math.max(0, t) / REVEAL_CLOSE_S;
    return from * (1 - u * u * u);
  }
  if (t < REVEAL_OPEN_AT_S) return 0;
  if (t < REVEAL_S) {
    const u = (t - REVEAL_OPEN_AT_S) / REVEAL_OPEN_S;
    return openRad * (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
  }
  return openRad;
}

/** What the power path needs of a blueprint: a full `MachineBlueprint` is assignable. */
export interface PowerGraph {
  readonly power: { readonly socketId: string };
  readonly connections: ReadonlyArray<{ readonly from: string; readonly to: string; readonly type: string }>;
}

/**
 * The sockets power reaches, in the order it reaches them: a breadth-first walk of the solver's own connections from the power
 * socket. Shaft, mesh and belt connections carry it both ways (they are symmetric in the solver); a pin or trigger connection only
 * from its `from` to its `to`. For the Music Box: spring, spring pinion, drive wheel, arbor, cylinder, governor wheel, governor
 * pinion, governor.
 */
export function powerPath(graph: PowerGraph): string[] {
  const order = [graph.power.socketId];
  const seen = new Set(order);
  for (let head = 0; head < order.length; head++) {
    const at = order[head];
    for (const c of graph.connections) {
      let next: string | null = null;
      if (c.from === at) next = c.to;
      else if (c.to === at && c.type !== 'pin' && c.type !== 'trigger') next = c.from;
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        order.push(next);
      }
    }
  }
  return order;
}

// ---- What the director hands over ----

/** The part of `AudioEngine` the feedback plays on; tests pass a recorder. */
export type FeedbackAudio = Pick<AudioEngine, 'snapMaterial' | 'stageChord' | 'dialTick' | 'lidThump' | 'revealRise'>;

/** The Music Box lid: a `LidHinge` of src/town/motion.ts is assignable. Positive angle opens, about the pivot's +Z. */
export interface RevealHinge {
  readonly pivot: Object3D;
  readonly rest: Quaternion;
  readonly openRad: number;
  angle: number;
}

export interface FeedbackHost {
  /** Writes the world position of the part seated in solver socket `socketId` into `out`; false when nothing is seated there. */
  locate(socketId: string, out: Vector3): boolean;
  /** The bench machine's lid, or null/absent when there is none (the sounds still play). */
  lid?(): RevealHinge | null;
}

export interface AssemblyFeedbackOptions {
  /** Stages of the machine being built, for the rising scale (the last one resolves on the home chord). Default 7. */
  readonly stages?: number;
}

// ---- Scratch (module level: `update` allocates nothing) ----

const Z_AXIS = new Vector3(0, 0, 1);
const DEFAULT_TRAVEL = new Vector3(0, -1, 0);
const _p = new Vector3();
const _pos = new Vector3();
const _scale = new Vector3();
const _right = new Vector3();
const _cam = new Quaternion();
const _par = new Quaternion();
const _spin = new Quaternion();
const _m = new Matrix4();
const _c = new Color();

const FREE = 0;
const GLINT_AT_NODE = 1;
const GLINT_AT_SOCKET = 2;
const LID_THUMP = 3;
const REVEAL_RISE = 4;
const CALL = 5;

interface Pending {
  at: number;
  kind: number;
  node: Object3D | null;
  socket: string;
  call: (() => void) | null;
}

/** A soft brass-lamp star, 32 by 32: a bright core with four faint spikes, in the alpha channel only (white rgb). */
function glintTexture(): DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size * 2 - 1;
      const v = (y + 0.5) / size * 2 - 1;
      const r2 = u * u + v * v;
      const core = Math.exp(-r2 * 9);
      const spikes = Math.exp(-u * u * 60 - Math.abs(v) * 3.2) + Math.exp(-v * v * 60 - Math.abs(u) * 3.2);
      const a = Math.min(1, core + 0.7 * spikes) * Math.max(0, 1 - r2);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class AssemblyFeedback {
  /** The glint pool. Its parent is the frame the parts live in; it is invisible (no draw call) while no glint is alive. */
  readonly glints: InstancedMesh;
  private readonly texture = glintTexture();
  private readonly stages: number;
  private clock = 0;
  private step = 0;
  private ranOnce = false;

  private readonly gPos = new Float32Array(GLINT_POOL * 3);
  private readonly gBorn = new Float64Array(GLINT_POOL);
  private readonly gAlive = new Uint8Array(GLINT_POOL);
  private live = 0;

  private readonly sNode: Array<Object3D | null> = new Array<Object3D | null>(SETTLE_SLOTS).fill(null);
  private readonly sBorn = new Float64Array(SETTLE_SLOTS);
  private readonly sTravel = new Float32Array(SETTLE_SLOTS * 3);
  private readonly sSpin = new Uint8Array(SETTLE_SLOTS);

  private readonly queue: Pending[] = Array.from({ length: QUEUE }, () => ({ at: 0, kind: FREE, node: null, socket: '', call: null }));

  private lid: RevealHinge | null = null;
  private lidFrom = 0;
  private revealStart = 0;
  private revealEnd = 0;

  constructor(
    private readonly parent: Object3D,
    private readonly audio: FeedbackAudio,
    private readonly host: FeedbackHost,
    options: AssemblyFeedbackOptions = {},
  ) {
    this.stages = Math.max(1, Math.floor(options.stages ?? MUSIC_BOX_STAGES));
    const material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false, // a glint on a gear inside the case still shows; it lasts 0.3 s
      toneMapped: false,
      fog: false,
    });
    const mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, GLINT_POOL);
    mesh.name = 'AssemblyGlints';
    mesh.frustumCulled = false;
    mesh.renderOrder = 20;
    mesh.visible = false;
    mesh.raycast = () => undefined; // never a target for a ray or a hand
    _c.setScalar(0);
    for (let i = 0; i < GLINT_POOL; i++) mesh.setColorAt(i, _c);
    this.glints = mesh;
    parent.add(mesh);
  }

  /** Glints alive right now (at most `GLINT_POOL`). */
  get liveGlints(): number {
    return this.live;
  }

  /** Placements of the current stage so far: the rung the next snap climbs to. */
  get stageStep(): number {
    return this.step;
  }

  /**
   * A part seated. Plays its material's voice at the next rung of the stage's climb, flares a glint on it and starts the settle.
   * `node` is the part's own Object3D, the one `SocketSnapSystem.lock` writes. `travel` is the way it came in, a unit vector in
   * the node's parent space (default: straight down); the overshoot is 0.4 mm along it.
   */
  onSnap(voice: SnapVoice, node: Object3D, travel?: Vector3): void {
    this.audio.snapMaterial(voice, this.step);
    if (this.step < MAX_SNAP_STEP) this.step++;
    this.glintAtNode(node, this.clock);
    this.startSettle(node, voice === 'screw', travel);
  }

  /**
   * Stage `index` (0 first) just closed: its chord and the dial tick sound at once, and a glint runs down `parts` in the order given
   * (the director passes them in mechanical order, left to right along the axle). The next stage's climb starts from the bottom.
   */
  onStage(index: number, parts: readonly Object3D[] = []): void {
    this.audio.stageChord(index, this.stages);
    this.audio.dialTick();
    this.step = 0;
    for (let i = 0; i < parts.length; i++) this.schedule(i * BEAT_GAP_S, GLINT_AT_NODE, parts[i], '', null);
  }

  /**
   * The machine ran for the first time: a glint walks the solver's own connections from the power socket, `POWER_NODE_S` a node,
   * so the player watches power reach every piece they placed. Only the first call counts until `reset`.
   */
  onFirstRun(graph: PowerGraph): void {
    if (this.ranOnce) return;
    this.ranOnce = true;
    const path = powerPath(graph);
    for (let i = 0; i < path.length; i++) this.schedule(i * POWER_NODE_S, GLINT_AT_SOCKET, null, path[i], null);
  }

  /**
   * The box is done: the lid shuts (a soft thump at `REVEAL_CLOSE_S`), holds a breath, then lifts open again (a soft rise at
   * `REVEAL_OPEN_AT_S`) and is fully open at `REVEAL_S`. `then` runs the moment the lid starts to lift: start the melody there.
   * A second call while a reveal is running is ignored.
   */
  onReveal(then?: () => void): void {
    if (this.clock < this.revealEnd) return;
    const lid = this.host.lid?.() ?? null;
    this.lid = lid;
    this.lidFrom = lid ? lid.angle : 0;
    this.revealStart = this.clock;
    this.revealEnd = this.clock + REVEAL_S;
    if (!lid || lid.angle > 0.05) this.schedule(REVEAL_CLOSE_S, LID_THUMP, null, '', null); // already shut: nothing to thump
    this.schedule(REVEAL_OPEN_AT_S, REVEAL_RISE, null, '', null);
    if (then) this.schedule(REVEAL_OPEN_AT_S, CALL, null, '', then);
  }

  /** A new build: forgets the stage climb and the first-run flag, drops everything pending and every glint. The lid stays where it is. */
  reset(): void {
    this.step = 0;
    this.ranOnce = false;
    this.lid = null;
    this.revealEnd = 0;
    for (let i = 0; i < QUEUE; i++) this.free(this.queue[i]);
    this.gAlive.fill(0);
    this.live = 0;
    this.glints.visible = false;
    this.sNode.fill(null);
  }

  /** Call once a frame, after the interaction systems that seat parts (`SocketSnapSystem` is priority 10), with the head or camera. */
  update(dt: number, camera: Object3D | null): void {
    if (dt > 0) this.clock += dt;
    this.runQueue();
    this.runLid();
    this.runSettle();
    this.runGlints(camera);
  }

  dispose(): void {
    this.reset();
    this.parent.remove(this.glints);
    this.glints.geometry.dispose();
    (this.glints.material as MeshBasicMaterial).dispose();
    this.glints.dispose();
    this.texture.dispose();
  }

  // ---- Timeline ----

  private schedule(delay: number, kind: number, node: Object3D | null, socket: string, call: (() => void) | null): void {
    for (let i = 0; i < QUEUE; i++) {
      const p = this.queue[i];
      if (p.kind !== FREE) continue;
      p.at = this.clock + delay;
      p.kind = kind;
      p.node = node;
      p.socket = socket;
      p.call = call;
      return;
    }
    call?.(); // full: a dropped glint is invisible, a dropped callback would stall the director
  }

  private free(p: Pending): void {
    p.kind = FREE;
    p.node = null;
    p.call = null;
  }

  private runQueue(): void {
    for (let i = 0; i < QUEUE; i++) {
      const p = this.queue[i];
      if (p.kind === FREE || p.at > this.clock) continue;
      const { kind, node, socket, call, at } = p;
      this.free(p);
      switch (kind) {
        case GLINT_AT_NODE:
          if (node) this.glintAtNode(node, at);
          break;
        case GLINT_AT_SOCKET:
          if (this.host.locate(socket, _p)) {
            this.parent.worldToLocal(_p);
            this.spawn(_p.x, _p.y, _p.z, at);
          }
          break;
        case LID_THUMP:
          this.audio.lidThump();
          break;
        case REVEAL_RISE:
          this.audio.revealRise();
          break;
        default:
          call?.();
      }
    }
  }

  // ---- Lid ----

  private runLid(): void {
    const lid = this.lid;
    if (!lid) return;
    const t = this.clock - this.revealStart;
    const angle = revealLidAngle(t, this.lidFrom, lid.openRad);
    lid.angle = angle;
    lid.pivot.quaternion.copy(lid.rest).multiply(_spin.setFromAxisAngle(Z_AXIS, angle));
    if (t >= REVEAL_S) this.lid = null;
  }

  // ---- Settle ----

  private startSettle(node: Object3D, screw: boolean, travel?: Vector3): void {
    let slot = this.sNode.indexOf(node);
    if (slot < 0) slot = this.sNode.indexOf(null);
    if (slot < 0) {
      slot = 0; // all busy: the oldest-started slot is the first one found here, close enough for a 0.2 s effect
      for (let i = 1; i < SETTLE_SLOTS; i++) if (this.sBorn[i] < this.sBorn[slot]) slot = i;
    }
    const v = travel && travel.lengthSq() > 0 ? travel : DEFAULT_TRAVEL;
    const len = v.length();
    this.sNode[slot] = node;
    this.sBorn[slot] = this.clock;
    this.sSpin[slot] = screw ? 1 : 0;
    this.sTravel[slot * 3] = v.x / len;
    this.sTravel[slot * 3 + 1] = v.y / len;
    this.sTravel[slot * 3 + 2] = v.z / len;
  }

  /**
   * `SocketSnapSystem.lock` rewrites a seated part's pose every frame from its socket, so an offset added here after it is never
   * cumulative: it shows for this frame only. After the 120 ms seat tween the part overshoots 0.4 mm along its travel and comes
   * back over 90 ms; a screw also unwinds a quarter turn over the whole 210 ms.
   */
  private runSettle(): void {
    const total = SNAP_TWEEN_S + SETTLE_S;
    for (let i = 0; i < SETTLE_SLOTS; i++) {
      const node = this.sNode[i];
      if (!node) continue;
      const age = this.clock - this.sBorn[i];
      if (age >= total) {
        this.sNode[i] = null;
        continue;
      }
      const slide = age - SNAP_TWEEN_S;
      if (slide > 0) {
        const k = SETTLE_OVERSHOOT_M * settleCurve(slide / SETTLE_S);
        node.position.x += this.sTravel[i * 3] * k;
        node.position.y += this.sTravel[i * 3 + 1] * k;
        node.position.z += this.sTravel[i * 3 + 2] * k;
      }
      if (this.sSpin[i]) {
        const u = age / total;
        const left = (1 - u) ** 3; // 1 - easeOutCubic(u): the turn is mostly done early, then it settles
        node.quaternion.multiply(_spin.setFromAxisAngle(Z_AXIS, SCREW_TURN_RAD * left));
      }
    }
  }

  // ---- Glints ----

  private glintAtNode(node: Object3D, born: number): void {
    node.getWorldPosition(_p);
    this.parent.worldToLocal(_p);
    this.spawn(_p.x, _p.y, _p.z, born);
  }

  /** Takes a free slot, or recycles the oldest glint when all 8 are alive. */
  private spawn(x: number, y: number, z: number, born: number): void {
    let slot = -1;
    let oldest = 0;
    for (let i = 0; i < GLINT_POOL; i++) {
      if (!this.gAlive[i]) {
        slot = i;
        break;
      }
      if (this.gBorn[i] < this.gBorn[oldest]) oldest = i;
    }
    if (slot < 0) slot = oldest;
    this.gPos[slot * 3] = x;
    this.gPos[slot * 3 + 1] = y;
    this.gPos[slot * 3 + 2] = z;
    this.gBorn[slot] = born;
    this.gAlive[slot] = 1;
  }

  private runGlints(camera: Object3D | null): void {
    let live = 0;
    for (let i = 0; i < GLINT_POOL; i++) {
      if (this.gAlive[i] && this.clock - this.gBorn[i] >= GLINT_S) this.gAlive[i] = 0;
      live += this.gAlive[i];
    }
    this.live = live;
    const mesh = this.glints;
    if (live === 0) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    if (camera) {
      camera.getWorldQuaternion(_cam);
      this.parent.getWorldQuaternion(_par).invert();
      _cam.premultiply(_par);
    } else {
      _cam.identity();
    }
    _right.set(1, 0, 0).applyQuaternion(_cam);
    for (let i = 0; i < GLINT_POOL; i++) {
      if (this.gAlive[i]) {
        const age = this.clock - this.gBorn[i];
        const env = glintEnvelope(age);
        _pos.set(this.gPos[i * 3], this.gPos[i * 3 + 1], this.gPos[i * 3 + 2]).addScaledVector(_right, (age / GLINT_S - 0.5) * 2 * GLINT_SWEEP_M);
        _scale.setScalar(GLINT_SIZE_M * (0.7 + (0.3 * env) / GLINT_PEAK));
        _c.copy(GLINT_COLOR).multiplyScalar(env);
      } else {
        _pos.set(0, 0, 0);
        _scale.setScalar(0);
        _c.setScalar(0);
      }
      _m.compose(_pos, _cam, _scale);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
