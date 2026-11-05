import {
  Color,
  createSystem,
  Grabbed,
  Material,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { ReturnsToRest } from './returns-to-rest-component.js';

/** Warm lamp glow (#FFC66D) while a part is held: "highlight the part, confirm selection" (INTERACTION_SPEC §7.1). */
const GLOW_COLOR = new Color(0xffc66d);
const GLOW_MAX_INTENSITY = 0.3;
/** Exponential approach rate (1/s) for the glow. */
const GLOW_RATE = 14;
/** Seconds for a released part to settle back to its rest pose. */
const RETURN_SECONDS = 0.35;

interface RestPose {
  position: Vector3;
  quaternion: Quaternion;
}

interface Settling {
  entity: Entity;
  fromPosition: Vector3;
  fromQuaternion: Quaternion;
  t: number;
}

/**
 * Feedback for grabbable parts: glow while held, ease back to the rest pose after release.
 * IWSDK's GrabSystem owns the grab itself; this only reads its transient `Grabbed` tag.
 */
export class GrabFeedbackSystem extends createSystem({
  parts: { required: [ReturnsToRest] },
  held: { required: [ReturnsToRest, Grabbed] },
}) {
  private readonly rest = new Map<Entity, RestPose>();
  private readonly glow = new Map<Entity, number>();
  private readonly materials = new Map<Entity, MeshStandardMaterial[]>();
  private settling: Settling[] = [];

  init(): void {
    this.queries.parts.subscribe('qualify', (entity) => this.register(entity));
    // The scene is loaded before systems register, so its entities never fire 'qualify': pick them up now.
    this.queries.parts.entities.forEach((entity) => this.register(entity));
    this.queries.held.subscribe('qualify', (entity) => {
      this.settling = this.settling.filter((s) => s.entity !== entity);
    });
    this.queries.held.subscribe('disqualify', (entity) => this.beginSettling(entity));
  }

  update(delta: number): void {
    this.queries.parts.entities.forEach((entity) => this.updateGlow(entity, delta));

    for (let i = this.settling.length - 1; i >= 0; i--) {
      const s = this.settling[i];
      const rest = this.rest.get(s.entity);
      const object = s.entity.object3D;
      if (!rest || !object) {
        this.settling.splice(i, 1);
        continue;
      }
      s.t = Math.min(1, s.t + delta / RETURN_SECONDS);
      const eased = 1 - (1 - s.t) ** 3; // cubic ease-out
      object.position.lerpVectors(s.fromPosition, rest.position, eased);
      object.quaternion.slerpQuaternions(s.fromQuaternion, rest.quaternion, eased);
      if (s.t >= 1) this.settling.splice(i, 1);
    }
  }

  private register(entity: Entity): void {
    const object = entity.object3D;
    if (!object || this.rest.has(entity)) return;
    this.rest.set(entity, { position: object.position.clone(), quaternion: object.quaternion.clone() });

    // Materials are shared between clones of an asset: give this part its own so its glow is its own.
    const own: MeshStandardMaterial[] = [];
    object.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      const clone = (m: Material): Material => {
        const copy = m.clone();
        if (copy instanceof MeshStandardMaterial) {
          copy.emissive.copy(GLOW_COLOR);
          copy.emissiveIntensity = 0;
          own.push(copy);
        }
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
    });
    this.materials.set(entity, own);
    this.glow.set(entity, 0);
  }

  private beginSettling(entity: Entity): void {
    const object = entity.object3D;
    if (!object || !this.rest.has(entity)) return;
    this.settling.push({
      entity,
      fromPosition: object.position.clone(),
      fromQuaternion: object.quaternion.clone(),
      t: 0,
    });
  }

  private updateGlow(entity: Entity, delta: number): void {
    const current = this.glow.get(entity);
    const materials = this.materials.get(entity);
    if (current === undefined || !materials) return;
    const target = this.queries.held.entities.has(entity) ? 1 : 0;
    if (current === target) return;
    let next = current + (target - current) * (1 - Math.exp(-GLOW_RATE * delta));
    if (Math.abs(target - next) < 0.002) next = target;
    this.glow.set(entity, next);
    for (const material of materials) material.emissiveIntensity = next * GLOW_MAX_INTENSITY;
  }
}
