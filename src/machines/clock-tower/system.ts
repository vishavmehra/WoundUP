import { createSystem } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { ClockTowerRig } from './components.js';
import { ClockTowerNodes } from './rig.js';
import { ClockTowerEvents, ClockTowerRuntime } from './runtime.js';

/** The one bus the Clock Tower emits on: `tick`, `hour`, `strike`, `doorsOpen`, `doorsClose`. The audio and town layers subscribe to it. */
export const clockTowerEvents = new ClockTowerEvents();

let clockSource: () => number = Date.now;
/** Replaces the time source (epoch milliseconds). For tests and the demo video; the game uses `Date.now`. Affects towers created afterwards. */
export function setClockTowerClock(clock: () => number): void {
  clockSource = clock;
}

/**
 * Thin system: every frame it hands the tower's `powered` flag to a ClockTowerRuntime (the behaviour is in runtime.ts, the node
 * binding in rig.ts) and writes the result to the nodes. One Clock Tower exists (one plot); with several entities only the first
 * is driven.
 */
export class ClockTowerSystem extends createSystem({ towers: { required: [ClockTowerRig] } }) {
  /** The running tower's behaviour: read `doorsAmount`, call `triggerStrikes()`. Null while there is no tower. */
  runtime: ClockTowerRuntime | null = null;

  private tower: Entity | null = null;
  private nodes = new ClockTowerNodes();
  private wasPowered = false;
  private first: Entity | null = null;
  private readonly pick = (entity: Entity): void => {
    if (this.first === null) this.first = entity;
  };

  update(): void {
    this.first = null;
    this.queries.towers.entities.forEach(this.pick);
    const entity = this.first as Entity | null; // assigned inside the callback, which narrowing cannot see
    const object = entity?.object3D;
    if (!entity || !object) {
      this.tower = null;
      this.runtime = null;
      return;
    }
    if (entity !== this.tower) {
      this.tower = entity;
      this.runtime = new ClockTowerRuntime(() => clockSource(), clockTowerEvents);
      this.nodes = new ClockTowerNodes();
      this.wasPowered = false;
    }
    const runtime = this.runtime as ClockTowerRuntime;
    const powered = entity.getValue(ClockTowerRig, 'powered') === true;
    // The nodes exist once their parts are installed, which is before the tower first runs: look them up when it starts.
    if (powered && !this.wasPowered) this.nodes.resolve(object);
    this.wasPowered = powered;
    runtime.powered = powered;
    runtime.update();
    this.nodes.apply(runtime);
  }
}
