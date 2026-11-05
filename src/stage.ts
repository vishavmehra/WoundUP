import { createSystem, Vector3, VisibilityState } from '@iwsdk/core';
import { standPose } from './placement.js';

/** Scene node id of the stand root in public/scenes/main.iwsdk.scene.json. */
export const STAGE_NODE_ID = 'stage';

/** Before the first tracked pose the head sits at the origin; anything lower than this is not a real seated eye height. */
const MIN_TRACKED_HEAD_Y = 0.3;

/**
 * Puts the stand where PRODUCT_SPEC §3.2's fallback wants it each time an immersive session starts,
 * and restores the authored pose for the 2D preview afterwards.
 * ponytail: table-plane detection (best effort in the spec) will replace the floating fallback in the placement task.
 */
export class StageSystem extends createSystem({}) {
  private readonly head = new Vector3();
  private readonly forward = new Vector3();
  private awaitingPose = false;
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
        this.awaitingPose = immersive;
        if (!immersive) this.restoreAuthoredPose();
      }),
    );
  }

  update(): void {
    if (!this.awaitingPose) return;
    const stage = this.world.getSceneObject(STAGE_NODE_ID);
    if (!stage) return;

    this.player.head.updateWorldMatrix(true, false);
    this.head.setFromMatrixPosition(this.player.head.matrixWorld);
    if (this.head.y < MIN_TRACKED_HEAD_Y) return; // no tracked pose yet; try again next frame

    this.forward.set(0, 0, -1).transformDirection(this.player.head.matrixWorld);
    const pose = standPose(this.head, this.forward);
    stage.position.set(pose.x, pose.y, pose.z);
    stage.rotation.set(0, pose.yaw, 0);
    this.awaitingPose = false;
  }

  private restoreAuthoredPose(): void {
    const stage = this.world.getSceneObject(STAGE_NODE_ID);
    if (!stage) return;
    stage.position.copy(this.authoredPosition);
    stage.rotation.set(0, this.authoredYaw, 0);
  }
}
