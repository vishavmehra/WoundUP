/**
 * The director of an intricate build (INTRICATE_ASSEMBLY_DESIGN §3, §6, §7, ADR-050): the one object that turns "what is seated now" into what the bench shows
 * and what the Helper points at. It decides nothing about correctness (the solver does) or about what a hand may do (the interaction layer does); it holds no
 * scene objects. It reads the step engine (`stepState`, rule R4) after every seating or removal and tells a small host what changed:
 *
 *   stage bags      the tray holds the current stage's big parts, the caddy its hardware; the next stage's bag opens when a stage closes (Master: every big part at once)
 *   armed sockets   the sockets that may take a part now, for the interaction layer's `pickSocket`
 *   the caddy       which bin is live: the first armed piece of hardware (Standard, Relaxed), the stage's kinds (Master)
 *   the step list   stage rows, the current step and the next two, for the blueprint sheet and its dial
 *   stage beats     one call when a stage closes (the glint, the chord, the dial tick of src/assembly/feedback.ts)
 *   Relaxed         hardware that arrives with its carrier is seated by the game, 120 ms apart, through the host
 *   the Helper      the ladder and the offers of helper.ts, pointed at the step engine's next move
 *
 * Pure TypeScript: no Three.js, no IWSDK. Everything it touches goes through `DirectorHost`, `HelperScene` and `GhostHands`, which `src/gameplay.ts` implements
 * over the real scene and which the tests implement with fakes. `begin`, `end`, `snapped`, `unsnapped`, `wrong`, `unitOnStand`, `helperPressed`,
 * `setDifficulty` and `update` are the hooks the game loop calls; nothing here subscribes to anything.
 *
 * Wiring (the lead's, in `src/gameplay.ts`; `needsDirector(blueprint, plan)` says whether a build has a director at all):
 *   startBuild, after the parts are made   director.begin(this.assembly())            then reveal only what `openTray` / `openCaddy` ask for
 *   disposeBuild, reset, run finished       director.end()
 *   intent `snapped` (accepted)             director.snapped(socketId, this.assembly())    also for what `seatAuto` and a Helper flight seat
 *   intent `snapped` bounced (dependencies) director.wrong()
 *   intent `unsnapped`                      director.unsnapped(socketId, this.assembly())
 *   intent `rejected`, or an `order` drop   director.wrong()
 *   unit seated in the stand's cradle       director.unitOnStand(carrierSocketId, true, this.assembly())
 *   FlowEvent `helper`                      director.helperPressed(event.long, !gazeOrRay)
 *   FlowEvent `difficulty`                  director.setDifficulty(event.value, this.assembly())
 *   GameplaySystem.update                   director.update(dt, { held, panelOpen })
 * and the director's outputs go to the UI (`DirectorHost.setView` to `FlowUi.setAssembly`, `setHelper` to `FlowUi.setHelper`), the interaction layer
 * (`setArmed`), the dispensers (`setCaddy`), the tray and caddy reveal (`openTray`, `openCaddy`), the feedback (`stageClosed`) and `seatAuto`.
 */
import { planStages, stepState } from '../content/blueprints';
import type { Assembly, MachineBlueprint, SocketDefinition, StagePlan, StagesPlan, StepState } from '../content/blueprints';
import type { Difficulty } from '../game/content';
import { Helper } from './helper';
import type { GhostHands, HelperCopy, HelperFrame, HelperPress, HelperScene, HelperState, HelperTarget } from './helper';

/** One piece of hardware seated by the game after the one before it (design §6.1: "fly-in, one soft click each, 120 ms apart"), seconds. */
export const AUTO_SEAT_GAP_S = 0.12;
/** The step list shows the step to do now and the next two (design §7.4). */
export const UPCOMING_STEPS = 3;

/** One stage row of the blueprint sheet. Structurally the UI's `AssemblyStage`. */
export interface StepListStage {
  readonly id: string;
  readonly name: string;
  /** The player's placements in the stage, and how many are done. */
  readonly steps: number;
  readonly done: number;
}

/** What the blueprint sheet paints. Structurally the UI's `AssemblyView`: pass it to `FlowUi.setAssembly` as it is. */
export interface StepListView {
  readonly stages: readonly StepListStage[];
  /** The stage being built, an index into `stages`, or -1 when every stage is closed. */
  readonly current: number;
  /** The step to do now, then the next one or two; empty when every stage is closed. `n` counts the player's placements across the whole machine, from 1. */
  readonly upcoming: ReadonlyArray<{ readonly n: number; readonly label: string }>;
}

/** What the bench must do for the director. Implemented in `src/gameplay.ts` over the tray, the dispensers, the interaction layer, the UI and the feedback. */
export interface DirectorHost {
  /** The big parts of this stage's bag go out into the tray's compartments (one per placement, in `stage.bag.big` order). `first`: the build is just starting, no arrival rustle. */
  openTray(index: number, stage: StagePlan, first: boolean): void;
  /** The hardware of this stage's bag goes into the caddy (`stage.bag.hardware`, one entry per placement, grouped by bin). Empty in Relaxed. */
  openCaddy(index: number, stage: StagePlan): void;
  /** The sockets that may take a part now (everything else rejects as `order`). `level` lets the host draw the rings: dim in Standard, off in Master. */
  setArmed(armed: readonly string[], level: Difficulty): void;
  /** The part ids whose bin has a live piece at its mouth now, and whether the bin of the first one shows its lamp (not in Master). Empty: every bin is dormant. */
  setCaddy(live: readonly string[], lamp: boolean): void;
  /** The blueprint sheet's stage list and dial. Called when what the sheet shows changes. */
  setView(view: StepListView): void;
  /** The Helper medallion's glow and slip. Called when they change. */
  setHelper(state: HelperState): void;
  /** A stage closed (not called in a repair): its beat. `stage.sockets` are the stage's sockets in step order. */
  stageClosed(index: number, stage: StagePlan): void;
  /** Seats the part of `socketId` for the player: a piece flies in from its bin and seats as a hand would, so `snapped` follows. False: it cannot be seated now (its carrier is gone). */
  seatAuto(socketId: string): boolean;
}

export interface DirectorOptions {
  readonly blueprint: MachineBlueprint;
  /** `planBuild(...).stages`: the plan for the player's level, with `stand` as the build was made. */
  readonly plan: StagesPlan;
  readonly host: DirectorHost;
  readonly scene: HelperScene;
  /** `HELPER_COPY` of `src/ui/copy.ts`. */
  readonly copy: HelperCopy;
  /** The F15 ghost hands, once `src/onboarding` is on this branch. Absent: Demonstrate falls back to the socket pulse and a ghost of the part. */
  readonly ghost?: GhostHands;
  /** A repair (the machine starts built): no bags and no stage beats, the Helper and the offers work as in a build. */
  readonly repair?: boolean;
  /**
   * A repair's wrong part. While `partId` stands in `socketId` the Helper points at that socket for the correct part (Show glows it in the tray; Place falls
   * back to Show, since the socket is taken), instead of at the wind step of a machine that is, to the step engine, complete.
   */
  readonly faulty?: { readonly socketId: string; readonly partId: string };
  /** The words for a socket on the step list and the Helper's slip. Default: `defaultLabel`. */
  readonly labelOf?: (socket: SocketDefinition) => string;
}

/** What the game tells the director each frame. */
export type DirectorFrame = HelperFrame;

const WORD_SIDES: ReadonlySet<string> = new Set(['left', 'right']);

/** "left_bracket_bush" is "left bracket bush", "cylinder_collar_left" is "left cylinder collar": the side comes first. A socket with neither role nor id words falls back to its part's id. */
export function defaultLabel(socket: SocketDefinition): string {
  const words = (socket.role ?? socket.id).split('_').filter((w) => w.length > 0);
  const side = words.findIndex((w) => WORD_SIDES.has(w));
  if (side > 0) words.unshift(...words.splice(side, 1));
  return words.join(' ');
}

/** True when a build of `blueprint` at `plan` is run by a director: the intricate assembly is on and the blueprint tells its build in stages. Every other build is as it was. */
export const needsDirector = (blueprint: MachineBlueprint, plan: StagesPlan): boolean => plan.intricate && blueprint.stages !== undefined;

/**
 * The plan after the player changed the level mid-build (design §6.1: "down to Relaxed turns the stages not yet opened into Relaxed stages and leaves what is
 * built; up from Relaxed affects only stages not yet opened"). Stages up to and including `openIndex` keep the plan they were opened with.
 */
export function mergePlans(blueprint: MachineBlueprint, old: StagesPlan, next: StagesPlan, openIndex: number): StagesPlan {
  const kept = new Set(old.stages.slice(0, openIndex + 1).flatMap((st) => st.sockets));
  const oldAuto = new Set(old.auto);
  const nextAuto = new Set(next.auto);
  const owns = (id: string): boolean => (kept.has(id) ? oldAuto.has(id) : nextAuto.has(id));
  const order = new Map(blueprint.sockets.map((s, i) => [s.id, i] as const));
  const byOrder = (a: string, b: string): number => (order.get(a) ?? 0) - (order.get(b) ?? 0);
  const auto = blueprint.sockets.map((s) => s.id).filter(owns);
  const bundles: Record<string, readonly string[]> = {};
  for (const carrier of new Set([...Object.keys(old.bundles), ...Object.keys(next.bundles)])) {
    const ids = [...(old.bundles[carrier] ?? []).filter((id) => kept.has(id)), ...(next.bundles[carrier] ?? []).filter((id) => !kept.has(id))].sort(byOrder);
    if (ids.length > 0) bundles[carrier] = ids;
  }
  const atStart = [...old.atStart.filter((id) => kept.has(id)), ...next.atStart.filter((id) => !kept.has(id))].sort(byOrder);
  return { ...next, stages: next.stages.map((st, i) => (i <= openIndex ? old.stages[i] : st)), auto, bundles, atStart };
}

export class AssemblyDirector {
  private plan: StagesPlan;
  private level: Difficulty;
  private readonly helper: Helper;
  private readonly bags: boolean;
  private assembly: Assembly = {};
  private onStand: ReadonlySet<string> = new Set();
  private state: StepState | null = null;
  /** Which stages are closed as far as the beats know (so a stage beats once as it closes, and again if it is taken apart and closed again). */
  private closed: boolean[] = [];
  private traysOpen = 0;
  private caddiesOpen = 0;
  private running = false;
  private t = 0;
  private readonly queue: Array<{ readonly socketId: string; readonly at: number }> = [];
  private queueFree = 0;
  private shown = { armed: '', caddy: '', view: '' };
  private shownHelper: HelperState | null = null;
  private readonly socketById: ReadonlyMap<string, SocketDefinition>;
  private readonly labelOf: (socket: SocketDefinition) => string;

  constructor(private readonly opt: DirectorOptions) {
    this.plan = opt.plan;
    this.level = opt.plan.difficulty;
    this.bags = opt.repair !== true;
    this.socketById = new Map(opt.blueprint.sockets.map((s) => [s.id, s] as const));
    this.labelOf = opt.labelOf ?? defaultLabel;
    this.helper = new Helper(opt.scene, opt.copy, this.level, opt.ghost);
  }

  /** The level the build is at now. */
  get difficulty(): Difficulty {
    return this.level;
  }

  /** The plan in force (it changes when the level does). */
  get currentPlan(): StagesPlan {
    return this.plan;
  }

  /** Where the build stands after the last hook: the step engine's own answer. Null before `begin`. */
  get steps(): StepState | null {
    return this.state;
  }

  /** The Helper's ladder, for the debug state and the tests. */
  get ladder(): Helper {
    return this.helper;
  }

  /** True while hardware the game seats is still waiting its turn. */
  get seatingAuto(): boolean {
    return this.queue.length > 0;
  }

  // ---- The hooks of the game loop -----------------------------------------------------------------------------------

  /**
   * The bench is set: the housing is up, the parts are made. `assembly` is what already stands (the game-seated parts; a repair's whole machine). Opens the
   * first bag (Master: every tray at once), seats what the plan seats at the start and puts the first step on the sheet and the Helper.
   */
  begin(assembly: Assembly, onStand: ReadonlySet<string> = new Set()): void {
    this.assembly = assembly;
    this.onStand = onStand;
    this.running = true;
    this.t = 0;
    this.queue.length = 0;
    this.queueFree = 0;
    this.traysOpen = 0;
    this.caddiesOpen = 0;
    this.shown = { armed: '', caddy: '', view: '' };
    this.helper.reset();
    const state = stepState(this.opt.blueprint, this.plan, assembly, onStand);
    this.closed = state.stages.map((st) => st.complete); // what already stands has been celebrated, or is not to be
    if (this.plan.seat === 'with-carrier') this.queueAtStart();
    this.refresh();
  }

  /** The build is over (the machine ran, the parcel was cleared, the story restarted): put every cue away and stop asking the host for anything. */
  end(): void {
    if (!this.running) return;
    this.running = false;
    this.queue.length = 0;
    this.state = null;
    this.helper.reset();
    this.opt.scene.clear();
    this.opt.host.setArmed([], this.level);
    this.opt.host.setCaddy([], false);
    this.shownHelper = null;
    this.pushHelper();
  }

  /** A part was seated (a `snapped` intent the game accepted, whether a hand or the game seated it). `assembly` is the build as it stands now. */
  snapped(socketId: string, assembly: Assembly): void {
    if (!this.running) return;
    this.assembly = assembly;
    if (this.onStand.has(socketId)) {
      // A unit carried into the case is the case's now: it was on the stand's books for the whole carry, so its stages did not fall open in the hand.
      const stand = new Set(this.onStand);
      stand.delete(socketId);
      this.onStand = stand;
    }
    if (!this.plan.auto.includes(socketId)) this.helper.progress(); // the game's own seating is not the player making progress
    this.queueBundle(socketId);
    this.refresh();
  }

  /**
   * A part was taken out of a socket. `assembly` is the build as it stands now. A socket the director never saw filled (the game loop's dependency bounce
   * removes `SnappedTo` from a part it had not accepted) changes nothing: it is a wrong attempt, not progress.
   */
  unsnapped(socketId: string, assembly: Assembly): void {
    if (!this.running) return;
    const had = this.assembly[socketId] !== undefined;
    this.assembly = assembly;
    if (!had) return;
    for (let i = this.queue.length - 1; i >= 0; i--) if (this.carriedBy(this.queue[i].socketId, socketId)) this.queue.splice(i, 1); // its hardware leaves with it
    if (!this.plan.auto.includes(socketId)) this.helper.progress();
    this.refresh();
  }

  /** A wrong attempt: a `rejected` intent, a part dropped on a socket that was not armed (`order`), or the dependency bounce of the game loop. */
  wrong(): void {
    if (this.running) this.helper.wrong();
  }

  /**
   * A unit built on the shaft stand (P1) was put on it (`on`), or is gone from it for good: `carrier` is the socket of the unit's carrier part (`arbor`).
   * Call it with `on` true when the carrier is seated in the stand's cradle. Do not call it when the unit is lifted off to be carried: it stays on the stand's
   * books until `snapped` reports it in the case, so its stages do not fall open in the player's hand. `assembly` is the build as it stands.
   */
  unitOnStand(carrier: string, on: boolean, assembly: Assembly): void {
    if (!this.running) return;
    const stand = new Set(this.onStand);
    if (on) stand.add(carrier);
    else stand.delete(carrier);
    this.onStand = stand;
    this.assembly = assembly;
    this.helper.progress();
    this.refresh();
  }

  /** The Helper medallion was pressed (`FlowEvent` `helper`). `hands` is whether the player is in hands mode (a long press places only there). */
  helperPressed(long: boolean, hands: boolean): HelperPress {
    if (!this.running) return 'none';
    const did = this.helper.press(long, hands);
    this.opt.host.setHelper(this.helper.view);
    return did;
  }

  /** The level changed (`FlowEvent` `difficulty`; it is already saved): stages not yet opened follow it, what is open and what is built stays. */
  setDifficulty(level: Difficulty, assembly: Assembly): void {
    if (!this.running) {
      this.level = level;
      this.helper.setLevel(level);
      return;
    }
    this.assembly = assembly;
    const current = stepState(this.opt.blueprint, this.plan, assembly, this.onStand).stage;
    const open = Math.min(current, this.plan.stages.length - 1);
    const next = planStages(this.opt.blueprint, level, { intricate: this.plan.intricate, stand: this.plan.stand, noCaddy: this.plan.noCaddy });
    this.plan = mergePlans(this.opt.blueprint, this.plan, next, open);
    this.level = level;
    this.helper.setLevel(level);
    if (this.plan.seat === 'with-carrier') this.queueAtStart();
    this.shown = { armed: '', caddy: '', view: '' };
    this.refresh();
  }

  /** Every frame, after the interaction systems. Seats due hardware, runs the Helper's clock and cues. Allocates nothing unless something changed. */
  update(dt: number, frame: DirectorFrame): void {
    if (!this.running) return;
    this.t += dt;
    while (this.queue.length > 0 && this.queue[0].at <= this.t) {
      const due = this.queue.shift();
      if (due !== undefined && this.assembly[due.socketId] === undefined) this.opt.host.seatAuto(due.socketId);
    }
    this.helper.tick(dt, frame);
    this.opt.scene.update?.(dt);
    this.pushHelper();
  }

  // ---- Reading the step engine --------------------------------------------------------------------------------------

  private refresh(): void {
    const { blueprint, host } = this.opt;
    const state = stepState(blueprint, this.plan, this.assembly, this.onStand);
    this.state = state;

    for (let i = 0; i < state.stages.length; i++) {
      if (!state.stages[i].complete) this.closed[i] = false;
      else if (!this.closed[i]) {
        this.closed[i] = true;
        if (this.bags) host.stageClosed(i, this.plan.stages[i]);
      }
    }
    if (this.bags) this.openBags(state);

    const armedKey = `${this.level}|${state.armed.join(',')}`;
    if (armedKey !== this.shown.armed) {
      this.shown.armed = armedKey;
      host.setArmed(state.armed, this.level);
    }
    const live = this.liveBins(state);
    const caddyKey = `${live.lamp ? 'L' : 'd'}|${live.parts.join(',')}`;
    if (caddyKey !== this.shown.caddy) {
      this.shown.caddy = caddyKey;
      host.setCaddy(live.parts, live.lamp);
    }
    const view = this.stepList(state);
    const viewKey = `${view.current}|${view.stages.map((s) => `${s.done}/${s.steps}`).join(',')}|${view.upcoming.map((u) => `${u.n}:${u.label}`).join(',')}`;
    if (viewKey !== this.shown.view) {
      this.shown.view = viewKey;
      host.setView(view);
    }
    this.helper.setTarget(this.targetOf(state));
    this.pushHelper();
  }

  /** Standard and Relaxed open a stage's bag when the stage before it closes; Master puts every tray out at the start and keeps only the caddy per stage. */
  private openBags(state: StepState): void {
    const { host } = this.opt;
    const last = this.plan.stages.length - 1;
    const upTo = Math.min(state.stage, last);
    const trays = this.level === 'master' ? last : upTo;
    for (let i = this.traysOpen; i <= trays; i++) host.openTray(i, this.plan.stages[i], i === 0);
    this.traysOpen = Math.max(this.traysOpen, trays + 1);
    for (let i = this.caddiesOpen; i <= upTo; i++) host.openCaddy(i, this.plan.stages[i]);
    this.caddiesOpen = Math.max(this.caddiesOpen, upTo + 1);
  }

  /** The part ids of the live bins. Standard and Relaxed: the first armed piece of hardware, lamp on. Master: the kinds the current stage still needs, no lamp. */
  private liveBins(state: StepState): { parts: string[]; lamp: boolean } {
    const hardware = (id: string): boolean => this.socketById.get(id)?.family === 'fastener';
    const part = (id: string): string => this.opt.blueprint.intended[id];
    if (this.level === 'master') {
      const stage = this.plan.stages[state.stage];
      if (stage === undefined) return { parts: [], lamp: false };
      const missing = stage.byHand.filter((id) => hardware(id) && this.assembly[id] === undefined).map(part);
      return { parts: [...new Set(missing)], lamp: false };
    }
    const first = state.armed.find(hardware);
    return { parts: first === undefined ? [] : [part(first)], lamp: true };
  }

  private stepList(state: StepState): StepListView {
    const order = this.plan.stages.flatMap((st) => st.byHand);
    const number = (id: string): number => order.indexOf(id) + 1;
    const upcoming: Array<{ n: number; label: string }> = [];
    const stage = this.plan.stages[state.stage];
    if (stage !== undefined) {
      if (state.carry !== undefined) upcoming.push({ n: number(state.carry), label: `${this.labelOfId(state.carry)}, into the case` });
      const todo = stage.byHand.filter((id) => this.assembly[id] === undefined && !this.onStand.has(id));
      const head = state.next === undefined ? [] : [state.next];
      for (const id of [...head, ...todo.filter((x) => x !== state.next)]) {
        if (upcoming.length >= UPCOMING_STEPS) break;
        upcoming.push({ n: number(id), label: this.labelOfId(id) });
      }
    }
    return {
      stages: state.stages.map((st) => ({ id: st.id, name: st.name, steps: st.total, done: st.done })),
      current: state.stage >= state.stages.length ? -1 : state.stage,
      upcoming,
    };
  }

  /** The step engine's next move as the Helper sees it: the carry of a finished unit, the first armed socket, then (when everything stands) the key. */
  private targetOf(state: StepState): HelperTarget | null {
    const intended = this.opt.blueprint.intended;
    const place = (kind: HelperTarget['kind'], id: string): HelperTarget => ({
      kind,
      socketId: id,
      partId: intended[id],
      label: this.labelOfId(id),
      hardware: this.socketById.get(id)?.family === 'fastener',
    });
    const faulty = this.opt.faulty;
    if (faulty !== undefined && this.assembly[faulty.socketId] === faulty.partId) return place('place', faulty.socketId);
    if (state.carry !== undefined) return place('carry', state.carry);
    if (state.next !== undefined) return place('place', state.next);
    if (!state.complete) return null;
    const key = this.opt.blueprint.sockets.find((s) => s.family === 'winding_key');
    return key === undefined ? null : place('wind', key.id);
  }

  private labelOfId(id: string): string {
    const socket = this.socketById.get(id);
    return socket === undefined ? id : this.labelOf(socket);
  }

  /** True when `socketId` is carried by `carrier`, directly or through the hardware between them (a screw on a clip on the comb). */
  private carriedBy(socketId: string, carrier: string): boolean {
    for (let at = this.socketById.get(socketId)?.carrier, guard = 0; at !== undefined && guard < 8; at = this.socketById.get(at)?.carrier, guard++) if (at === carrier) return true;
    return false;
  }

  private pushHelper(): void {
    const view = this.helper.view;
    if (view !== this.shownHelper) {
      this.shownHelper = view;
      this.opt.host.setHelper(view);
    }
  }

  // ---- Relaxed: the hardware the game seats ------------------------------------------------------------------------

  /** Hardware with no carrier to wait for (the spring's anchor in the housing) is seated before the first placement. */
  private queueAtStart(): void {
    for (const id of this.plan.atStart) this.enqueue(id);
  }

  /** The hardware of a part that just landed arrives with it, one piece after another. */
  private queueBundle(carrier: string): void {
    for (const id of this.plan.bundles[carrier] ?? []) this.enqueue(id);
  }

  private enqueue(socketId: string): void {
    if (this.assembly[socketId] !== undefined || this.queue.some((q) => q.socketId === socketId)) return;
    const at = Math.max(this.t, this.queueFree);
    this.queue.push({ socketId, at });
    this.queueFree = at + AUTO_SEAT_GAP_S;
  }
}
