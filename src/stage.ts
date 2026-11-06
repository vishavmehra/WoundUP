import { createSystem, Vector3, VisibilityState } from '@iwsdk/core';
import { standPose } from './placement.js';

/** Scene node id of the stand root in public/scenes/main.iwsdk.scene.json. */
export const STAGE_NODE_ID = 'stage';

/**
 * Puts the floating stand where PRODUCT_SPEC §3.2's fallback wants it, measured from the player's own eyes so it suits
 * any height or seat. It is placed once per session and again when the player recentres their view, which is how they
 * correct it after changing posture. Opening the system menu must not move it. The authored pose comes back for the
 * 2D preview when the session ends.
 * ponytail: always the fallback for now; the table placement task tries the detected table first and keeps this path.
 */
export class StageSystem extends createSystem({}) {
  private readonly head = new Vector3();
  private readonly forward = new Vector3();
  private immersive = false;
  private awaitingPose = false;
  private watchedSpace: XRReferenceSpace | null = null;
  private readonly placeAgain = (): void => {
    this.awaitingPose = true;
  };
  private authoredPosition = new Vector3();
  private authoredYaw = 0;

  init(): void {
    const stage = this.world.getSceneObject(STAGE_NODE_ID);
    if (stage) {
      this.authoredPosition.copy(stage.position);
      this.authoredYaw = stage.rotation.y;
    }
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        const immersive = state !== VisibilityState.NonImmersive;
        if (immersive === this.immersive) return; // visible <-> blurred is the system menu, not a new session
        this.immersive = immersive;
        this.awaitingPose = immersive;
        if (!immersive) this.endSession();
      }),
    );
  }

  update(): void {
    if (!this.awaitingPose) return;
    const stage = this.world.getSceneObject(STAGE_NODE_ID);
    if (!stage) return;

    // xrFrame is typed non-null but is null outside an XR frame.
    const frame = this.xrFrame as XRFrame | null;
    const space = this.xrManager.getReferenceSpace();
    if (!frame || !space || !frame.getViewerPose(space)) return; // no tracked pose yet; try again next frame
    if (space !== this.watchedSpace) {
      this.watchedSpace = space;
      space.addEventListener('reset', this.placeAgain);
    }

    this.player.head.updateWorldMatrix(true, false);
    this.head.setFromMatrixPosition(this.player.head.matrixWorld);
    this.forward.set(0, 0, -1).transformDirection(this.player.head.matrixWorld);
    const pose = standPose(this.head, this.forward);
    stage.position.set(pose.x, pose.y, pose.z);
    stage.rotation.set(0, pose.yaw, 0);
    this.awaitingPose = false;
  }

  private endSession(): void {
    this.watchedSpace?.removeEventListener('reset', this.placeAgain);
    this.watchedSpace = null;
    const stage = this.world.getSceneObject(STAGE_NODE_ID);
    if (!stage) return;
    stage.position.copy(this.authoredPosition);
    stage.rotation.set(0, this.authoredYaw, 0);
  }
}
