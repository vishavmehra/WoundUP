/**
 * The room lights at night (PRODUCT_SPEC F16, CLAUDE.md §8). The scene file (public/scenes/main.iwsdk.scene.json) lights the
 * stand with one hemisphere light, one directional light and a gradient environment, all IWSDK components that its `LightSystem`
 * and `EnvironmentSystem` copy into three.js every frame, so the night is written into the components, never into the three.js
 * lights (they would be overwritten): the hemisphere dims and cools, the key light turns to a pale moon, the environment's
 * intensity drops. Colours are blended from whatever the scene authored, so a change of the day look needs no change here.
 * The windows and lamp posts that carry the dark town are the wake shader's (`uWuNight`) and dressing.ts's four lamp lights.
 * No shadows and no extra passes: this only changes numbers on components that already exist.
 */
import { DirectionalLightComponent, HemisphereLightComponent, IBLGradient } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';

/** How each light stands at full night: a fraction of its day intensity, and the colour it moves towards (linear RGB). */
export const NIGHT_LOOK = {
  hemisphere: { intensity: 0.55, sky: [0.3, 0.4, 0.66], ground: [0.035, 0.03, 0.06] },
  directional: { intensity: 0.3, color: [0.55, 0.68, 1.0] },
  environment: { intensity: 0.45 },
} as const;

interface Day {
  intensity: number;
  a: [number, number, number];
  b: [number, number, number];
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Blends the lights between the look the scene authored (day) and the night look. Not allocation-free: call it when the amount changes. */
export class NightLights {
  private readonly day = new Map<Entity, Day>();

  /** Returns true when it found at least one light to write (the level may still be loading on the first frames). */
  apply(amount: number, hemispheres: Iterable<Entity>, directionals: Iterable<Entity>, environments: Iterable<Entity>): boolean {
    let found = false;
    for (const e of hemispheres) {
      found = true;
      const day = this.dayOf(e, () => this.read(e, HemisphereLightComponent, 'skyColor', 'groundColor'));
      e.setValue(HemisphereLightComponent, 'intensity', lerp(day.intensity, day.intensity * NIGHT_LOOK.hemisphere.intensity, amount));
      this.blend(e.getVectorView(HemisphereLightComponent, 'skyColor'), day.a, NIGHT_LOOK.hemisphere.sky, amount);
      this.blend(e.getVectorView(HemisphereLightComponent, 'groundColor'), day.b, NIGHT_LOOK.hemisphere.ground, amount);
    }
    for (const e of directionals) {
      found = true;
      const day = this.dayOf(e, () => this.read(e, DirectionalLightComponent, 'color', 'color'));
      e.setValue(DirectionalLightComponent, 'intensity', lerp(day.intensity, day.intensity * NIGHT_LOOK.directional.intensity, amount));
      this.blend(e.getVectorView(DirectionalLightComponent, 'color'), day.a, NIGHT_LOOK.directional.color, amount);
    }
    for (const e of environments) {
      found = true;
      const day = this.dayOf(e, () => ({ intensity: Number(e.getValue(IBLGradient, 'intensity')), a: [0, 0, 0], b: [0, 0, 0] }));
      e.setValue(IBLGradient, 'intensity', lerp(day.intensity, day.intensity * NIGHT_LOOK.environment.intensity, amount)); // intensity only: no PMREM rebuild
    }
    return found;
  }

  private dayOf(e: Entity, capture: () => Day): Day {
    let day = this.day.get(e);
    if (!day) {
      day = capture();
      this.day.set(e, day);
    }
    return day;
  }

  private read(
    e: Entity,
    component: typeof HemisphereLightComponent | typeof DirectionalLightComponent,
    first: 'skyColor' | 'color',
    second: 'groundColor' | 'color',
  ): Day {
    const view = (key: string): [number, number, number] => {
      const v = e.getVectorView(component as typeof HemisphereLightComponent, key as 'skyColor');
      return [v[0], v[1], v[2]];
    };
    return { intensity: Number(e.getValue(component as typeof HemisphereLightComponent, 'intensity')), a: view(first), b: view(second) };
  }

  private blend(out: ArrayLike<number> & { [i: number]: number }, day: readonly number[], night: readonly number[], t: number): void {
    for (let i = 0; i < 3; i++) out[i] = lerp(day[i], night[i], t);
  }
}
