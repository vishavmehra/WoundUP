import type { SurfaceInfo, Vec3Like } from '../placement.js';
import type { HeadPose, RefPose, SpatialFrame } from './machine.js';

/**
 * The raw WebXR half of table placement (audit D §4.2 and §4.3; SPATIAL_WORLD_SYSTEM §3 and §6).
 *
 * IWSDK's SceneUnderstandingSystem is not used: it keeps one entity per plane and calls getPose for every plane every
 * frame, and its anchor sits at the reference-space origin, which cannot hold a table pose (audit D §4.3). The calls here
 * are the WebXR Plane Detection and Anchors modules as typed by @types/webxr: `frame.detectedPlanes` (valid only inside an
 * active frame), `XRPlane.planeSpace / polygon / orientation / semanticLabel`, `frame.createAnchor`, `XRAnchor.anchorSpace`.
 */

interface PointLike {
  x: number;
  y: number;
  z: number;
}

/** The direction a head with this orientation faces: the quaternion applied to -Z. Writes into and returns `out`. */
export function forwardFromQuaternion(q: { x: number; y: number; z: number; w: number }, out: Vec3Like): Vec3Like {
  out.x = -2 * (q.x * q.z + q.w * q.y);
  out.y = -2 * (q.y * q.z - q.w * q.x);
  out.z = -(1 - 2 * (q.x * q.x + q.y * q.y));
  return out;
}

/**
 * Turns one XRPlane's data into the pure `SurfaceInfo` the choice works on.
 * `matrix` is the plane's pose in reference space (column-major 4x4, `XRRigidTransform.matrix`). A plane's polygon lies in
 * its own XZ plane with the normal along its +Y, so the outline is each vertex pushed through the matrix and flattened.
 */
export function surfaceFromPlane(
  matrix: ArrayLike<number>,
  polygon: ReadonlyArray<PointLike>,
  orientation: 'horizontal' | 'vertical' | undefined,
  label: string | undefined,
): SurfaceInfo {
  const m = (i: number) => matrix[i] ?? 0;
  const nx = m(4);
  const ny = m(5);
  const nz = m(6);
  const length = Math.hypot(nx, ny, nz);
  return {
    orientation,
    label,
    origin: { x: m(12), y: m(13), z: m(14) },
    // A zero-length axis cannot be level: leave the normal flat so the surface is rejected, never divided by zero.
    normal: length > 1e-9 ? { x: nx / length, y: ny / length, z: nz / length } : { x: 0, y: 0, z: 0 },
    outline: polygon.map((p) => ({ x: m(0) * p.x + m(4) * p.y + m(8) * p.z + m(12), z: m(2) * p.x + m(6) * p.y + m(10) * p.z + m(14) })),
  };
}

/** `SpatialFrame` over the current XR frame. One instance is reused for the whole session: call `setFrame` first each frame. */
export class WebXrSpatial implements SpatialFrame<XRAnchor> {
  private frame: XRFrame | null = null;
  private space: XRReferenceSpace | null = null;
  private session: XRSession | undefined;
  private readonly headPose: HeadPose = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };

  setFrame(frame: XRFrame | null, space: XRReferenceSpace | null, session: XRSession | undefined): void {
    this.frame = frame;
    this.space = space;
    this.session = session;
  }

  /**
   * Plane detection and anchors were both granted, the frame has the calls, and the session is mixed reality. A session
   * without them (not granted, declined, immersive-vr, a browser without the modules) uses the stand (TBL-06, TBL-12).
   */
  canPlaceOnTable(): boolean {
    const { frame, session } = this;
    if (!frame || !session) return false;
    const granted = session.enabledFeatures;
    return (
      session.environmentBlendMode !== 'opaque' &&
      granted !== undefined &&
      granted.includes('plane-detection') &&
      granted.includes('anchors') &&
      'detectedPlanes' in frame &&
      typeof frame.createAnchor === 'function'
    );
  }

  head(): HeadPose | null {
    const pose = this.frame && this.space ? this.frame.getViewerPose(this.space) : undefined;
    if (!pose) return null;
    const { position, orientation } = pose.transform;
    this.headPose.position.x = position.x;
    this.headPose.position.y = position.y;
    this.headPose.position.z = position.z;
    forwardFromQuaternion(orientation, this.headPose.forward);
    return this.headPose;
  }

  surfaces(): SurfaceInfo[] | null {
    const { frame, space } = this;
    if (!frame || !space) return null;
    let planes: XRPlaneSet | undefined;
    try {
      planes = frame.detectedPlanes; // throws InvalidStateError outside an active frame
    } catch {
      return null;
    }
    if (!planes) return null;
    const out: SurfaceInfo[] = [];
    planes.forEach((plane) => {
      const pose = frame.getPose(plane.planeSpace, space);
      if (pose) out.push(surfaceFromPlane(pose.transform.matrix, plane.polygon, plane.orientation, plane.semanticLabel));
    });
    return out;
  }

  createAnchor(pose: RefPose): Promise<XRAnchor> | null {
    const { frame, space } = this;
    if (!frame || !space || typeof frame.createAnchor !== 'function') return null;
    return frame.createAnchor(
      new XRRigidTransform({ x: pose.x, y: pose.y, z: pose.z }, { x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw }),
      space,
    );
  }

  readAnchor(anchor: XRAnchor, out: RefPose): boolean {
    const { frame, space } = this;
    const pose = frame && space ? frame.getPose(anchor.anchorSpace, space) : undefined;
    if (!pose) return false; // not tracked right now: the caller keeps the last pose
    const { position, orientation } = pose.transform;
    out.x = position.x;
    out.y = position.y;
    out.z = position.z;
    out.qx = orientation.x;
    out.qy = orientation.y;
    out.qz = orientation.z;
    out.qw = orientation.w;
    return true;
  }
}
