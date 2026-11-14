// Machine blueprint contract (DATA_AND_BLUEPRINT_SPEC §5 to §9). Plain data, serialisable, no scene objects (DATA §1).
// A blueprint is a `SolverBlueprint` (what the solver reads) plus what the game and the loader need around it.

import type { SolverBlueprint, SolverSocket } from '../../sim';
import type { PartFamily } from '../parts/types';

/** DATA §6. Position and rotation are optional: only the Music Box has them so far (see `positioned` in music-box.ts). */
export interface SocketDefinition extends SolverSocket {
  readonly family: PartFamily;
  /**
   * Name of the `SOCKET_<node>` empty in the housing or part GLB that is this socket (BLENDER_PRODUCTION_GUIDELINES §9).
   * The interaction layer reports a snap by this name (`snapped.socketName`). Absent while no GLB carries the empty yet.
   */
  readonly node?: string;
  /** Sockets that must be filled first, and may not be emptied while this one is filled (MUSIC_BOX_BLUEPRINT §7.1 "Removal"). */
  readonly dependencies?: readonly string[];
  /**
   * Metres in the machine's frame (origin at the centre of the floor-contact face, +Y up, +Z towards the player, ADR-020).
   * When present they win over the GLB empty: the loader moves the empty here before the interaction layer reads it.
   */
  readonly position?: readonly [number, number, number];
  /** Quaternion `[x, y, z, w]`; the socket's +Z is the mating axis. */
  readonly rotation?: readonly [number, number, number, number];
}

/** One line of a tray (DATA §9). The tray never decides what is correct: the solver does. */
export interface TrayEntry {
  readonly partId: string;
  readonly quantity: number;
  /** A part that does not belong in the machine (DATA §9.1). */
  readonly decoy?: true;
}

export interface MachineBlueprint extends SolverBlueprint {
  /** Stable id: a `MachineId` of the game core (`music_box`, `carousel`, `windmill`). Persisted in saves and gift links. */
  readonly id: string;
  readonly name: string;
  /** Bumped when the blueprint changes in a way an old save or gift link cannot mean (DATA §16). */
  readonly version: number;
  readonly sockets: readonly SocketDefinition[];
  /** The static housing GLB the sockets sit in (ADR-030 item 4). Sockets of nested parts (a canopy's lamps) are found when that part is spawned. */
  readonly housing: {
    readonly assetId: string;
    /** Palm hover zone of the X-ray gesture in the housing's own metres (INTERACTION_SPEC §11): radius from the origin, height of the top. From the machine's COL_Case. */
    readonly xray: { readonly radius: number; readonly top: number };
  };
  /** The correct build: socket id to part id, every socket. The solver runs it at the target (asserted by tests). */
  readonly intended: Readonly<Record<string, string>>;
  /** The first build's tray: the intended parts, plus the decoys of DATA §9.1 where the letter has them. */
  readonly tray: readonly TrayEntry[];
}
