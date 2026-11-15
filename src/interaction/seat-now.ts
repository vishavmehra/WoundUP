import { RayInteractable } from '@iwsdk/core';
import type { Entity, Mesh, Object3D, World } from '@iwsdk/core';
import { Socket } from './components.js';
import type { Dispenser } from './dispenser.js';
import { isGazeModeOn, onGazeModeChange } from './gaze-state.js';
import { createHitProxy } from './glb-reader.js';
import { SocketSnapSystem } from './socket-snap-system.js';

/**
 * Placement by the game, and the tap-to-fasten path (INTRICATE_ASSEMBLY_DESIGN §5.5, §7.2, ADR-050).
 *
 * `seatNow` is how the game puts a part in a socket without a hand: the Helper's Place, Relaxed's hardware, tap-to-fasten. It is the very
 * commit a hand's release makes (SocketSnapSystem.seatNow), so the `snapped` intent, `SnappedTo`, `Socket.occupant`, the flight and the settle
 * are the same, and gameplay, audio and `checkComplete` cannot tell the two apart.
 */

/** Seats `part` in `socket` as a hand would, whether or not the socket is armed. False, and nothing changed, when it cannot be seated (see `SocketSnapSystem.seatNow`). */
export function seatNow(world: World, part: Entity, socket: Entity): boolean {
  return world.getSystem(SocketSnapSystem)?.seatNow(part, socket) ?? false;
}

/** The ring is a 1.5 cm sphere (design §5.5): big enough for a pinch from the head's aim, as small as the pieces it stands for. */
export const TAP_RING_RADIUS_M = 0.015;

interface Ring {
  mesh: Mesh;
  entity: Entity;
  onClick: () => void;
}

/**
 * Gaze mode, and ray mode when the game says so through `enabled`: pinching an armed hardware socket's ring seats the piece that is live in the
 * caddy for it, in one pinch instead of a pick and a place. Hands do not get it: it is an accessibility path, not a difficulty setting.
 * A ring is an invisible 1.5 cm sphere under the socket's empty (so it follows a carrier) with `RayInteractable` and a `click` listener; the gaze
 * pointer and the ray act on it through the same pointer events as the UI's plaques. The visible pulse ring is the director's; this is its collider.
 *
 * The director calls `sync` when the armed set changes. It also re-syncs by itself when gaze mode changes.
 */
export class TapToFasten {
  private readonly rings = new Map<Entity, Ring>();
  private lastSockets: ReadonlyMap<string, Entity> = new Map();
  private lastIds: readonly string[] = [];
  private readonly unsubscribe: () => void;

  constructor(
    private readonly world: World,
    private readonly dispenser: Dispenser,
    private readonly enabled: () => boolean = isGazeModeOn,
  ) {
    this.unsubscribe = onGazeModeChange(() => this.sync(this.lastSockets, this.lastIds));
  }

  /** Rings exactly on the sockets named in `armedHardware` (ids in `sockets`), and none while tap-to-fasten is off. Rings that stay are kept. */
  sync(sockets: ReadonlyMap<string, Entity>, armedHardware: Iterable<string>): void {
    this.lastSockets = sockets;
    this.lastIds = [...armedHardware];
    const want = new Set<Entity>();
    if (this.enabled()) {
      for (const id of this.lastIds) {
        const entity = sockets.get(id);
        if (entity) want.add(entity);
      }
    }
    for (const [socket, ring] of this.rings) {
      if (want.has(socket)) continue;
      this.remove(ring);
      this.rings.delete(socket);
    }
    for (const socket of want) if (!this.rings.has(socket)) this.add(socket);
  }

  /** Seats the piece waiting in the caddy for `socket`. True when it was seated. This is what a pinch on the ring calls. */
  fasten(socket: Entity): boolean {
    if (!this.enabled() || !socket.getValue(Socket, 'armed') || socket.getValue(Socket, 'occupant') !== null) return false;
    const piece = this.dispenser.liveFor((socket.getValue(Socket, 'accepts') as string[] | undefined) ?? []);
    return piece !== undefined && seatNow(this.world, piece, socket);
  }

  dispose(): void {
    this.unsubscribe();
    for (const ring of this.rings.values()) this.remove(ring);
    this.rings.clear();
  }

  private add(socket: Entity): void {
    const node = socket.getValue(Socket, 'node') as Object3D | undefined;
    if (!node) return;
    const mesh = createHitProxy(node, TAP_RING_RADIUS_M, 'TapRing');
    const entity = this.world.createEntity();
    entity.object3D = mesh;
    entity.addComponent(RayInteractable, {});
    const onClick = (): void => void this.fasten(socket);
    mesh.addEventListener('click', onClick);
    this.rings.set(socket, { mesh, entity, onClick });
  }

  private remove(ring: Ring): void {
    ring.mesh.removeEventListener('click', ring.onClick);
    ring.mesh.removeFromParent();
    ring.entity.destroy();
  }
}
