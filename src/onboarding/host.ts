import { GrabSystem, Grabbed, Vector3 } from '@iwsdk/core';
import type { Entity, Object3D, World } from '@iwsdk/core';
import { unmetDependencies } from '../content/blueprints';
import type { Assembly, MachineBlueprint } from '../content/blueprints';
import { MACHINE_PLOT } from '../game/content';
import type { LessonId } from '../game/content';
import type { GameSession } from '../game/session';
import { isGazeAiming, isRayModeOn } from '../interaction/gaze-state';
import { SnappedTo, Socket } from '../interaction';
import type { MachineInstance, PartInstance } from '../parts';
import { PLOTS } from '../town';
import type { MachineRig, TownRuntime } from '../town';
import { PAD_TOP_M } from '../town/layout';
import type { FlowUi } from '../ui';
import { BENCH, benchPoint, LETTER_SPOT, latchSpot } from '../ui/layout';
import type { GuideHost, GuideTargets } from './ghost-guide';
import type { Variant } from './scripts';

/**
 * Everything the onboarding guide needs to know about the game, read from the game's own state: which lesson the situation calls for, whether a
 * hand is busy, and where to point the hand. The game loop (`Gameplay.guideView`) hands over read-only windows onto its build and its carried
 * machine; nothing here changes the game. `lesson` and `busy` run every frame and allocate nothing; `resolve` runs when a showing starts.
 */

/** What `Gameplay` shows of a build in progress. */
export interface BuildView {
  readonly blueprint: MachineBlueprint;
  readonly machine: MachineInstance;
  readonly parts: readonly PartInstance[];
  readonly fixed: Assembly;
  readonly key: Entity | null;
}

/** What `Gameplay` shows of the machine in the player's hands (or waiting to be carried). */
export interface CarriedView {
  readonly rig: MachineRig;
  readonly entity: Entity;
}

export interface GameplayView {
  readonly world: World;
  readonly session: GameSession;
  readonly ui: FlowUi;
  readonly town: TownRuntime;
  /** The stage root: the UI's spots (the latch, the letter, the bench) are in its frame. */
  readonly stage: Object3D;
  townScale(): number;
  build(): BuildView | null;
  carried(): CarriedView | null;
  windUnits(): number;
  /** Socket id to part id, with the parts the game seats itself. Allocates: not for the frame loop. */
  assembly(): Assembly;
}

/** Gaze mode and ray mode have their own demonstration (the hand stays still and only pinches); the player's own hands reach. */
export const variantNow = (): Variant => (isRayModeOn() ? 'ray' : isGazeAiming() ? 'gaze' : 'hands');

export function createGuideHost(game: GameplayView): GuideHost {
  const pressable = (name: string): Object3D | undefined => game.ui.pressables().find((p) => p.name === name && p.active)?.object;

  /** The loose tray part to pick up next and the socket it goes in, or null. Sockets are taken in blueprint order, once what they stand on is seated. */
  const nextStep = (build: BuildView): { part: Object3D; socket: Object3D } | null => {
    const assembly = game.assembly();
    for (const socket of build.blueprint.sockets) {
      if (!socket.required || socket.id in build.fixed || assembly[socket.id] !== undefined) continue;
      const entity = build.machine.sockets.get(socket.id);
      const node = entity?.getValue(Socket, 'node') as Object3D | undefined;
      if (!node || unmetDependencies(build.blueprint, assembly, socket.id).length > 0) continue;
      const wanted = build.blueprint.intended[socket.id];
      const part = build.parts.find((p) => p.partId === wanted && !p.entity.hasComponent(SnappedTo));
      if (part) return { part: part.object, socket: node };
    }
    return null;
  };

  return {
    lesson(): LessonId | null {
      const view = game.ui.currentView;
      if (!view || view.panel !== 'none') return null; // a panel is up (pause, restart, gift): nothing is taught under it
      const local = game.ui.localFlow;
      switch (game.session.mode) {
        case 'intro':
          return local.trunk === 'closed' ? 'latch' : null;
        case 'town':
          return view.envelope === 'sealed' ? 'letter' : null;
        case 'build':
          if (view.parcel === 'closed') return 'parcel';
          return view.tray && game.build() ? 'grab' : null;
        case 'wind': {
          if (local.result) return view.xrayHint ? 'xray' : null; // a run that did not work out: the lens slip is up, so is the palm lesson
          const build = game.build();
          if (!build) return null;
          const byHand = build.blueprint.sockets.some((s) => s.family === 'winding_key' && !(s.id in build.fixed));
          return byHand && game.windUnits() === 0 ? 'wind' : 'run';
        }
        case 'place':
          return game.carried() ? 'place' : null;
        default:
          return null;
      }
    },

    busy(): boolean {
      const grab = game.world.getSystem(GrabSystem);
      if (!grab) return false;
      const held = (entity: Entity | undefined): boolean => entity !== undefined && entity.hasComponent(Grabbed) && grab.getHolderHand(entity) !== null;
      const build = game.build();
      if (build) for (const part of build.parts) if (held(part.entity)) return true;
      return held(game.carried()?.entity);
    },

    resolve(lesson: LessonId, variant: Variant, out: GuideTargets): boolean {
      const scale = game.townScale();
      const stageAt = (local: { x: number; y: number; z: number }, to: Vector3): Vector3 => game.stage.localToWorld(to.set(local.x, local.y, local.z));
      out.ghostSource = null;
      out.radius = 0.03;
      switch (lesson) {
        case 'latch':
          stageAt(latchSpot(scale), out.from);
          break;
        case 'letter':
          stageAt({ x: LETTER_SPOT.x, y: LETTER_SPOT.y + 0.01, z: LETTER_SPOT.z }, out.from);
          break;
        case 'parcel': {
          const spot = benchPoint(scale, BENCH.blueprint);
          stageAt({ x: spot.x, y: spot.y + 0.02, z: spot.z }, out.from);
          break;
        }
        case 'run': {
          const plaque = pressable('UI_Run');
          if (!plaque) return false;
          plaque.getWorldPosition(out.from);
          out.radius = 0.04;
          break;
        }
        case 'grab': {
          const build = game.build();
          const step = build ? nextStep(build) : null;
          if (!step) return false;
          step.part.updateWorldMatrix(true, false);
          step.part.getWorldPosition(out.from);
          step.socket.getWorldPosition(out.to);
          out.ghostSource = step.part;
          out.radius = 0.016;
          out.toRadius = 0.018;
          return finish(out, true);
        }
        case 'wind': {
          const key = game.build()?.key;
          const object = key?.object3D;
          if (!key || !object) return false;
          object.updateWorldMatrix(true, false);
          object.getWorldPosition(out.from);
          out.axis.set(0, 0, 1).transformDirection(object.matrixWorld);
          out.radius = 0.03;
          break;
        }
        case 'place': {
          const carried = game.carried();
          if (!carried) return false;
          const plot = PLOTS[MACHINE_PLOT[carried.rig.machineId]];
          carried.rig.root.getWorldPosition(out.from);
          game.town.town.group.localToWorld(out.to.set(plot.x, PAD_TOP_M, plot.z));
          out.radius = 0.035;
          return finish(out, true);
        }
        case 'xray': {
          if (variant !== 'hands') {
            // Gaze and ray mode have no palm gesture to teach: the lens button is the way.
            const lens = pressable('UI_Lens');
            if (!lens) return false;
            lens.getWorldPosition(out.from);
            out.radius = 0.035;
            break;
          }
          const build = game.build();
          if (!build) return false;
          build.machine.object.getWorldPosition(out.from);
          out.from.y += build.blueprint.housing.xray.top;
          out.radius = 0.035;
          break;
        }
      }
      return finish(out, false);
    },
  };

  /** The end point of a gesture that goes nowhere is its start. False when a position came out as nonsense (a part that was disposed under us). */
  function finish(out: GuideTargets, carries: boolean): boolean {
    if (!carries) {
      out.to.copy(out.from);
      out.toRadius = out.radius;
    }
    return Number.isFinite(out.from.x + out.from.y + out.from.z + out.to.x + out.to.y + out.to.z);
  }
}
