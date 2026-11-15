import type { Entity } from '@iwsdk/core';
import { Socket } from './components.js';
import { FIRM_UNSNAP_DISTANCE_M, UNSNAP_DISTANCE_M } from './snap.js';

/**
 * The game layer's two switches on the sockets of one machine (INTRICATE_ASSEMBLY_DESIGN §3.4, §5.3, ADR-050). Both write plain
 * `Socket` data that SocketSnapSystem reads; neither knows what a stage is. The game decides what is armed (`stepState(...).armed`
 * in src/content/blueprints/steps.ts) and what is firm, and calls these when that changes: on `snapped`, on `unsnapped` and when a stage closes.
 * `sockets` is the blueprint socket id to Socket entity map the loader returns (`MachineInstance.sockets`).
 */

/**
 * Arms exactly the sockets named in `armed` and disarms the rest of `sockets`. `null` arms every socket: a machine with no stages is built
 * as it always was. Only sockets that change are written. Returns how many changed.
 */
export function applyArming(sockets: ReadonlyMap<string, Entity>, armed: Iterable<string> | null): number {
  const set = armed === null ? null : new Set(armed);
  let changed = 0;
  for (const [id, entity] of sockets) {
    const on = set === null || set.has(id);
    if (entity.getValue(Socket, 'armed') === on) continue;
    entity.setValue(Socket, 'armed', on);
    changed++;
  }
  return changed;
}

/** The blueprint ids of the sockets that are armed now, in `sockets` order: what the idle pulse and the Helper point at. */
export function armedIds(sockets: ReadonlyMap<string, Entity>): string[] {
  const out: string[] = [];
  for (const [id, entity] of sockets) if (entity.getValue(Socket, 'armed')) out.push(id);
  return out;
}

/**
 * Makes the parts seated in `firm` sockets take a deliberate pull (6 cm) to come out, and every other socket the usual 3 cm. Call it with the
 * sockets of a finished unit's children, so that grabbing the unit by its carrier never pulls a gear out by mistake (design §5.3). Returns how many changed.
 */
export function applyFirmness(sockets: ReadonlyMap<string, Entity>, firm: Iterable<string>): number {
  const set = new Set(firm);
  let changed = 0;
  for (const [id, entity] of sockets) {
    const limit = set.has(id) ? FIRM_UNSNAP_DISTANCE_M : UNSNAP_DISTANCE_M;
    if (entity.getValue(Socket, 'unsnapM') === limit) continue;
    entity.setValue(Socket, 'unsnapM', limit);
    changed++;
  }
  return changed;
}
