import { MeshStandardMaterial, ShaderLib } from '@iwsdk/core';
import type { WebGLProgramParametersWithUniforms } from '@iwsdk/core';
import { describe, expect, it, vi } from 'vitest';
import { MAX_SCENERY_BOXES, MAX_WAKE_SOURCES, SCENERY_BOXES, WAKE_SOURCES } from '../../src/town/layout';
import { FROZEN_SATURATION } from '../../src/town/wake';
import { constants, createWakeUniforms, installWakeShading, patchMaterial, patchWakeShader, WAKE_PROGRAM_KEY } from '../../src/town/wake-shader';
import { libraryRegistry } from './helpers';

const physical = ShaderLib.physical;

describe('patchWakeShader', () => {
  const { vertexShader, fragmentShader } = patchWakeShader(physical.vertexShader, physical.fragmentShader);

  it('takes each vertex into town space, with and without instancing', () => {
    expect(vertexShader).toContain('uniform mat4 uWuToTown;');
    expect(vertexShader).toContain('varying vec3 vWuTown;');
    expect(vertexShader).toContain('vWuTown = ( uWuToTown * ( modelMatrix * wuW ) ).xyz;');
    expect(vertexShader).toContain('instanceMatrix');
    expect(vertexShader.indexOf('#include <project_vertex>')).toBeLessThan(vertexShader.indexOf('vWuTown ='));
  });

  it('hooks the fragment where the emissive and the final colour are known, in the right order', () => {
    const at = (s: string): number => fragmentShader.indexOf(s);
    expect(at('#include <emissivemap_fragment>')).toBeGreaterThan(-1);
    expect(at('totalEmissiveRadiance *= 1.0 - wuFrozen;')).toBeGreaterThan(at('#include <emissivemap_fragment>'));
    expect(at('outgoingLight = mix( outgoingLight, wuCold, wuFrozen );')).toBeLessThan(at('#include <opaque_fragment>'));
    expect(at('outgoingLight = mix( outgoingLight, wuCold, wuFrozen );')).toBeGreaterThan(at('vec3 outgoingLight'));
  });

  it('freezes to 0.15 saturation with a cool tint, and only inside scenery', () => {
    expect(fragmentShader).toContain(`mix( vec3( wuLum ), outgoingLight, ${FROZEN_SATURATION.toFixed(5)} )`);
    expect(fragmentShader).toContain('vec3( 0.86, 0.95, 1.08 )');
    expect(fragmentShader).toContain('if ( wuScenery > 0.0 )');
  });

  it('writes the layout as constants: boxes, groups, sources and what each source wakes', () => {
    expect(fragmentShader).toContain(`#define WU_BOXES ${MAX_SCENERY_BOXES}`);
    expect(fragmentShader).toContain(`#define WU_SOURCES ${MAX_WAKE_SOURCES}`);
    const text = constants(SCENERY_BOXES, WAKE_SOURCES);
    const count = (name: string): number => {
      const line = text.split('\n').find((l) => l.includes(`${name}[`))!;
      return (line.slice(line.indexOf('(', line.indexOf('='))).match(/,/g) ?? []).length + 1;
    };
    expect(count('WU_BOX_GROUP')).toBe(MAX_SCENERY_BOXES);
    expect(count('WU_SRC_WAKES')).toBe(MAX_WAKE_SOURCES);
    for (const s of WAKE_SOURCES) expect(text).toContain(String(s.wakes));
    for (const b of SCENERY_BOXES) expect(text).toContain(`${b.group}`);
  });

  it('works on the standard material program too, and throws on a program it cannot hook', () => {
    expect(() => patchWakeShader(ShaderLib.standard.vertexShader, ShaderLib.standard.fragmentShader)).not.toThrow();
    expect(() => patchWakeShader('void main() {}', 'void main() {}')).toThrow(/not found/);
  });
});

describe('patchMaterial and installWakeShading', () => {
  const fakeShader = (): WebGLProgramParametersWithUniforms =>
    ({ vertexShader: physical.vertexShader, fragmentShader: physical.fragmentShader, uniforms: {} }) as unknown as WebGLProgramParametersWithUniforms;

  it('patches the material in place and shares the uniforms with every material', () => {
    const uniforms = createWakeUniforms();
    const a = new MeshStandardMaterial();
    const b = new MeshStandardMaterial();
    patchMaterial(a, uniforms);
    patchMaterial(b, uniforms);
    const sa = fakeShader();
    const sb = fakeShader();
    a.onBeforeCompile(sa, undefined as never);
    b.onBeforeCompile(sb, undefined as never);
    expect(sa.fragmentShader).toContain('wuFrozen');
    expect(sa.uniforms.uWuToTown).toBe(uniforms.uWuToTown);
    expect(sa.uniforms.uWuWake).toBe(sb.uniforms.uWuWake);
    expect(a.customProgramCacheKey()).toBe(WAKE_PROGRAM_KEY);
  });

  it('leaves a program it cannot patch as it was, and says so', () => {
    const m = new MeshStandardMaterial();
    patchMaterial(m, createWakeUniforms());
    const shader = { vertexShader: 'void main() {}', fragmentShader: 'void main() {}', uniforms: {} } as unknown as WebGLProgramParametersWithUniforms;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => m.onBeforeCompile(shader, undefined as never)).not.toThrow();
    expect(shader.fragmentShader).toBe('void main() {}');
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('patches both variants of every shared library material, creating no new materials per object', () => {
    const registry = libraryRegistry();
    const uniforms = createWakeUniforms();
    expect(installWakeShading(registry, uniforms)).toBe(registry.names().length * 2);
    for (const name of registry.names()) {
      for (const vc of [false, true]) {
        const m = registry.get(name, vc);
        expect(m.customProgramCacheKey()).toBe(WAKE_PROGRAM_KEY);
        expect(registry.get(name, vc)).toBe(m); // still one instance per name and variant
      }
    }
  });

  it('starts with every source frozen (radius -1) and an identity matrix', () => {
    const u = createWakeUniforms();
    expect(u.uWuWake.value).toHaveLength(MAX_WAKE_SOURCES);
    for (const v of u.uWuWake.value) expect(v.toArray()).toEqual([-1, 0]);
    expect(u.uWuToTown.value.elements[0]).toBe(1);
  });
});
