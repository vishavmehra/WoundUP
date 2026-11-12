import { createComponent, Types } from '@iwsdk/core';

// Declared in a system-free module so the IWSDK editor can author them, like src/returns-to-rest-component.ts.

/**
 * On a part the player can snap into a socket. Ids come from the part catalogue (DATA_AND_BLUEPRINT_SPEC §4):
 * `partId` is the stable part id, `family` its part family. A socket accepts either (`Socket.accepts`).
 * The part also needs a grab component, which GrabModeSystem adds to entities carrying ReturnsToRest.
 */
export const SnapPart = createComponent('SnapPart', {
  partId: { type: Types.String, default: '' },
  family: { type: Types.String, default: '' },
});

/**
 * One socket, read from a `SOCKET_` empty in a GLB (see glb-reader.ts). Created by `setupGlbInteraction`, one entity per
 * socket. `occupant` is written by SocketSnapSystem; the game layer may read it.
 */
export const Socket = createComponent('Socket', {
  /** Node name without the `SOCKET_` prefix. */
  name: { type: Types.String, default: '' },
  /** string[]: accepted part ids or families. Always pass a fresh array. */
  accepts: { type: Types.Object, default: undefined },
  /** Object3D: the empty. Its world position is the snap point and its +Z the mating axis. */
  node: { type: Types.Object, default: undefined },
  /** Only the mating axis is fixed on snap and the roll stays as the player left it (glb-reader.ts `wu.orient`). */
  axisOnly: { type: Types.Boolean, default: false },
  occupant: { type: Types.Entity, default: null },
});

/** Tag-with-data set on a part while it sits in a socket. Added and removed by SocketSnapSystem; removing it frees the socket. */
export const SnappedTo = createComponent('SnappedTo', {
  socket: { type: Types.Entity, default: null },
});

/**
 * The winding key of a machine (INTERACTION_SPEC §10). Put it on the key's own entity, whose object3D turns about
 * `axis` while the player winds. `units` is the count wound so far: WindSystem raises it, the game layer sets it back
 * to 0 when the machine has spent its energy.
 */
export const WindKey = createComponent('WindKey', {
  /** Turning axis in the key's local space. +Z is the rotation axis of Blender parts (BLENDER_PRODUCTION_GUIDELINES §5). */
  axis: { type: Types.Vec3, default: [0, 0, 1] },
  maxUnits: { type: Types.Int8, default: 8 },
  units: { type: Types.Int8, default: 0 },
  /** How close the index fingertip must be to the key's origin for a pinch to take it, metres. At least the 1.2 cm minimum target (INTERACTION_SPEC §7.2). */
  grabRadius: { type: Types.Float32, default: 0.03 },
});

/**
 * A machine X-ray can open (INTERACTION_SPEC §11). The palm has to be 5-20 cm above `top` and within `radius`
 * horizontally of the entity's origin. Both are in the entity's own units and scale with it.
 */
export const XRayTarget = createComponent('XRayTarget', {
  radius: { type: Types.Float32, default: 0.15 },
  top: { type: Types.Float32, default: 0.1 },
});
