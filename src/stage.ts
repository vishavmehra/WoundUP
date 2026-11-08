import { createSystem, Matrix4, Object3D, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { standPose } from './placement.js';
import { TablePlacementMachine, type PlacementPhase, type StandReason } from './table/machine.js';
import { WebXrSpatial } from './table/webxr.js';

/** Scene node id of the stage root in public/scenes/main.iwsdk.scene.json. */
export const STAGE_NODE_ID = 'stage';
/** The velvet stand under the stage root. Hidden while the town stands on a real table (PRODUCT_SPEC §3.2). */
export const STAND_NODE_ID = 'stand';
/**
 * The town group under the stage root. Its scale is the table placement's town scale (INTERACTION_SPEC §3). The node does
 * not exist yet: the town work adds it, or reads `StageSystem.townScale` when it builds the town.
 */
export const TOWN_NODE_ID = 'town';

/**
 * Owns the stage root's pose for the session: on the detected table when one is suitable, otherwise on the floating stand
 * (PRODUCT_SPEC §3.2, ADR-019, ADR-026). The decision is `TablePlacementMachine`; this system feeds it the XR frame and
 * applies what it says.
 *
 * - The choice is made once per session, from the real viewer pose. The stage stays hidden until it is made (about 2
 *   seconds in mixed reality, at once otherwise) so the town never jumps.
 * - The stand is placed once and again when the player recentres, which is how they correct it after changing posture.
 *   A town anchored to a table stays on its table through a recentre, the headset menu, tracking loss and plane updates.
 * - The authored pose and visibility come back for the 2D preview when the session ends.
 */
export class StageSystem extends createSystem({}) {
  private readonly machine = new TablePlacementMachine<XRAnchor>();
  private readonly spatial = new WebXrSpatial();
  private readonly head = new Vector3();
  private readonly forward = new Vector3();
  private readonly tablePosition = new Vector3();
  private readonly tableOrientation = new Quaternion();
  private readonly unitScale = new Vector3(1, 1, 1);
  private readonly droppedScale = new Vector3();
  private readonly referenceMatrix = new Matrix4();
  private readonly worldMatrix = new Matrix4();
  private immersive = false;
  private watchedSpace: XRReferenceSpace | null = null;
  private stageNode: Object3D | undefined;
  private authored: { position: Vector3; yaw: number; visible: boolean } | null = null;
  private readonly recentred = (): void => this.machine.recentre();

  /** Where the placement is: 'table' or 'stand' once decided. For the town work and for QA. */
  get placement(): PlacementPhase {
    return this.machine.phase;
  }
  /** Town scale for the session: 0.75 to 1 on a table, 1 on the stand. Apply it to the town group, not the stage root. */
  get townScale(): number {
    return this.machine.townScale;
  }
  /** Why the stand is showing, or null on a table or before the choice. Never shown to the player. */
  get standReason(): StandReason | null {
    return this.machine.standReason;
  }

  init(): void {
    this.stage(); // captures the authored pose
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        const immersive = state !== VisibilityState.NonImmersive;
        if (immersive === this.immersive) return; // visible <-> blurred is the system menu, not a new session
        this.immersive = immersive;
        if (immersive) this.beginSession();
        else this.endSession();
      }),
    );
  }

  update(_delta: number, time: number): void {
    if (this.machine.phase === 'idle') return;
    const stage = this.stage();
    if (!stage) return;

    // xrFrame is typed non-null but is null outside an XR frame.
    const frame = this.xrFrame as XRFrame | null;
    const space = this.xrManager.getReferenceSpace();
    const session = this.world.session;
    if (!frame || !space || !session) return; // try again next frame
    if (space !== this.watchedSpace) {
      this.watchedSpace?.removeEventListener('reset', this.recentred);
      this.watchedSpace = space;
      space.addEventListener('reset', this.recentred);
    }

    this.spatial.setFrame(frame, space, session);
    switch (this.machine.update(time, this.spatial)) {
      case 'stand':
        this.showStand(stage);
        break;
      case 'table-start':
        this.showTable(stage);
        break;
      case 'table':
        this.followTable(stage);
        break;
      default:
        break;
    }
  }

  /** The stage root, found once and remembered; looked up again only if the level replaced it. */
  private stage(): Object3D | undefined {
    if (!this.stageNode?.parent) {
      this.stageNode = this.world.getSceneObject(STAGE_NODE_ID);
      if (this.stageNode && !this.authored) {
        this.authored = { position: this.stageNode.position.clone(), yaw: this.stageNode.rotation.y, visible: this.stageNode.visible };
      }
    }
    return this.stageNode;
  }

  private beginSession(): void {
    const stage = this.stage();
    if (stage) stage.visible = false; // shown once placed, so nothing jumps
    this.machine.begin();
  }

  private showStand(stage: Object3D): void {
    this.player.head.updateWorldMatrix(true, false);
    this.head.setFromMatrixPosition(this.player.head.matrixWorld);
    this.forward.set(0, 0, -1).transformDirection(this.player.head.matrixWorld);
    const pose = standPose(this.head, this.forward);
    stage.position.set(pose.x, pose.y, pose.z);
    stage.rotation.set(0, pose.yaw, 0);
    this.setStandVisible(true);
    this.setTownScale(1);
    stage.visible = true;
  }

  private showTable(stage: Object3D): void {
    this.setStandVisible(false);
    this.setTownScale(this.machine.townScale);
    this.followTable(stage);
    stage.visible = true;
  }

  /** The stage root takes the anchor's pose. The anchor is in reference space, the stage in world space. */
  private followTable(stage: Object3D): void {
    const p = this.machine.pose;
    this.tablePosition.set(p.x, p.y, p.z);
    this.tableOrientation.set(p.qx, p.qy, p.qz, p.qw);
    this.referenceMatrix.compose(this.tablePosition, this.tableOrientation, this.unitScale);
    this.player.updateWorldMatrix(true, false);
    this.worldMatrix.multiplyMatrices(this.player.matrixWorld, this.referenceMatrix);
    this.worldMatrix.decompose(stage.position, stage.quaternion, this.droppedScale);
  }

  private setStandVisible(visible: boolean): void {
    const stand = this.world.getSceneObject(STAND_NODE_ID);
    if (stand) stand.visible = visible;
  }

  private setTownScale(scale: number): void {
    this.world.getSceneObject(TOWN_NODE_ID)?.scale.setScalar(scale);
  }

  private endSession(): void {
    this.machine.end();
    this.watchedSpace?.removeEventListener('reset', this.recentred);
    this.watchedSpace = null;
    this.setStandVisible(true);
    this.setTownScale(1);
    const stage = this.stage();
    if (!stage || !this.authored) return;
    stage.position.copy(this.authored.position);
    stage.rotation.set(0, this.authored.yaw, 0);
    stage.visible = this.authored.visible;
  }
}
