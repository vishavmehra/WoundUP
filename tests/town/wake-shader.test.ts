import { MeshStandardMaterial, ShaderLib } from '@iwsdk/core';
import type { WebGLProgramParametersWithUniforms } from '@iwsdk/core';
import { describe, expect, it, vi } from 'vitest';
import { dressingGrid } from '../../src/town/dressing-table';
import { DRESS_GRID, MAX_SCENERY_BOXES, MAX_WAKE_SOURCES, SCENERY_BOXES, WAKE_SOURCES } from '../../src/town/layout';
import { FROZEN_RESIDUAL, FROZEN_TINT } from '../../src/town/wake';
import { constants, createWakeUniforms, installWakeShading, NIGHT_GLOW, patchMaterial, patchWakeShader, WAKE_PROGRAM_KEY } from '../../src/town/wake-shader';
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
    expect(fragmentShader).toContain(`mix( vec3( wuLum ), outgoingLight, ${FROZEN_RESIDUAL.toFixed(5)} ) * vec3( ${FROZEN_TINT.map((t) => t.toFixed(5)).join(', ')} )`);
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

  it('declares every constant and uniform it uses: an undeclared name is a shader that does not compile, and Node cannot compile it', () => {
    const used = new Set(fragmentShader.match(/\b(?:WU_[A-Z_]+|uWu[A-Za-z]+|vWu[A-Za-z]+)\b/g));
    expect(used.size).toBeGreaterThan(10);
    for (const name of used) {
      const declared = new RegExp(`(#define ${name}\\b|\\b(?:const [A-Za-z0-9]+|uniform [A-Za-z0-9]+|varying [A-Za-z0-9]+) ${name}\\b)`);
      expect(declared.test(fragmentShader), name).toBe(true);
    }
    for (const name of vertexShader.match(/\b(?:uWu[A-Za-z]+|vWu[A-Za-z]+)\b/g) ?? []) expect(vertexShader, name).toMatch(new RegExp(`(uniform|varying) [a-z0-9]+ ${name}`));
  });

  it('reads the dressing grid above the paving only, and strengthens the scenery emissive at night', () => {
    expect(fragmentShader).toContain('uniform sampler2D uWuDress;');
    expect(fragmentShader).toContain('if ( wuP.y > WU_DRESS_Y )');
    expect(fragmentShader).toContain('texture2D( uWuDress, wuUv ).rg * 255.0 + 0.5');
    expect(fragmentShader).toContain('wuGroups |= int( wuBits.x ) | ( int( wuBits.y ) << 8 )'); // sixteen groups: room for the two new plots' pads
    expect(fragmentShader).toContain(`totalEmissiveRadiance *= 1.0 + uWuNight * ${NIGHT_GLOW.toFixed(5)} * wuScenery;`);
    expect(fragmentShader.indexOf('totalEmissiveRadiance *= 1.0 - wuFrozen;')).toBeLessThan(fragmentShader.indexOf('uWuNight *')); // a frozen window is dark at night too
    const text = constants(SCENERY_BOXES, WAKE_SOURCES);
    expect(text).toContain(`vec2( ${DRESS_GRID.x0.toFixed(5)}, ${DRESS_GRID.z0.toFixed(5)} )`);
    expect(text).toContain(`vec2( ${(DRESS_GRID.w * DRESS_GRID.cell).toFixed(5)}, ${(DRESS_GRID.h * DRESS_GRID.cell).toFixed(5)} )`);
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

  it('shares one dressing grid texture and one night value, byte for byte the table of dressing-table.ts', () => {
    const u = createWakeUniforms();
    const texture = u.uWuDress.value;
    expect(texture.image.width).toBe(DRESS_GRID.w);
    expect(texture.image.height).toBe(DRESS_GRID.h);
    const bytes = texture.image.data as Uint8Array;
    expect(bytes.length).toBe(DRESS_GRID.w * DRESS_GRID.h * 2);
    expect(Array.from(dressingGrid(), (_, i) => bytes[i * 2] | (bytes[i * 2 + 1] << 8))).toEqual(Array.from(dressingGrid()));
    expect(texture.generateMipmaps).toBe(false);
    expect(u.uWuNight.value).toBe(0);
    const a = new MeshStandardMaterial();
    patchMaterial(a, u);
    const shader = fakeShader();
    a.onBeforeCompile(shader, undefined as never);
    expect(shader.uniforms.uWuDress).toBe(u.uWuDress);
    expect(shader.uniforms.uWuNight).toBe(u.uWuNight);
  });

  it('is not inherited by a clone: GrabFeedbackSystem clones the materials of a carried machine, which are never frozen', () => {
    const patched = new MeshStandardMaterial();
    patchMaterial(patched, createWakeUniforms());
    const clone = patched.clone();
    const shader = fakeShader();
    clone.onBeforeCompile(shader, undefined as never);
    expect(shader.fragmentShader).not.toContain('wuFrozen');
    expect(clone.customProgramCacheKey()).not.toBe(WAKE_PROGRAM_KEY);
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
