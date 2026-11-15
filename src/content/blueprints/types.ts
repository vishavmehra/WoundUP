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
  /**
   * The intricate assembly (INTRICATE_ASSEMBLY_DESIGN §3, ADR-050), all optional: a blueprint that uses none of it behaves as it always did.
   *
   * Socket id of the part whose own GLB carries this socket's `SOCKET_<node>` empty. Hardware is always carried by the part it retains
   * (a pin by its gear, a bush by its bracket); a socket with no carrier is seated in the housing. A big part's `carrier` takes effect only
   * when a unit is built on a stand (see `StageDefinition.unit`): in place it seats in the housing's empty (`node`). Not `dependencies`:
   * when the carrier is pulled out its carried sockets stay on it, while sockets that merely depend on it still come loose (rules.ts).
   */
  readonly carrier?: string;
  /** The empty on the carrier's GLB when a big part is seated on a unit built on a stand (`node` is then the housing's legacy empty). */
  readonly unitNode?: string;
  /** Id of the stage that lists this socket (the stage's `sockets` is the source of truth; the validator holds them to each other). */
  readonly stage?: string;
  /** Sockets of one group on one carrier are interchangeable: the four washers of one arbor. They share a carrier, dependencies and accepted parts. */
  readonly group?: string;
  /** Hardware the player never shares: a gift omits the socket and the receiving side fills it from `intended` (design §11.5). */
  readonly implied?: true;
  /** What the part here does, in a few words, for the step list and the Helper ("left bracket washer"); the copy table maps it to text. */
  readonly role?: string;
}

/** A numbered bag of the build (design §3): 3 to 8 placements that end in a beat. */
export interface StageDefinition {
  readonly id: string;
  readonly name: string;
  /** Socket ids in step order. Order is advice: the sockets' `dependencies` and `carrier` decide what can be placed when. */
  readonly sockets: readonly string[];
  /** Where the stage is built: in the housing, or on the shaft stand as a sub-assembly that is carried into the housing afterwards (P1). */
  readonly site: 'case' | 'stand';
  /** A stand stage builds the unit of this carrier socket; consecutive stand stages of one carrier build one unit, carried after the last. `grip` is its COL_Grip node. */
  readonly unit?: { readonly carrier: string; readonly grip: string };
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
  /**
   * The build in numbered stages (design §3, ADR-050). Absent: the machine is built as before, in any order its dependencies allow.
   * Every `required` socket is in exactly one stage. Hardware (family `fastener`) is never in `tray`: it is the stage's bag and the caddy's.
   */
  readonly stages?: readonly StageDefinition[];
}
