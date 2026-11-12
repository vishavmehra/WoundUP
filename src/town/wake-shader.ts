/**
 * The frozen and awake looks (CLAUDE.md §8) and the wake ripple, done once in the shared library materials (ADR-032).
 *
 * The registry owns one material per library name. This patches those instances through `onBeforeCompile`, so no material is
 * cloned per object and the cost is one program variant per material type. Two shared uniforms drive it:
 *  - `uWuToTown`: world -> town-local matrix. The vertex shader turns each vertex into town space, where the scenery volumes
 *    and the ripple sources (layout.ts) are constants at scale 1, whatever the town scale or the table's pose.
 *  - `uWuWake[i]`: (ripple radius, glow) of source i, from `WakeField`.
 * A fragment inside a scenery volume is frozen (saturation 0.15, cool tint, emissive off) until a ripple has reached it; the
 * ripple's front carries a thin warm glow. Fragments outside every volume (machines, workbench, trunk, hands) are untouched.
 * Nothing allocates per frame: the system copies numbers into these uniforms.
 */
import { Matrix4, Vector2 } from '@iwsdk/core';
import type { Material, WebGLProgramParametersWithUniforms } from '@iwsdk/core';
import type { MaterialRegistry } from '../materials';
import { MAX_SCENERY_BOXES, MAX_WAKE_SOURCES, SCENERY_BOXES, WAKE_SOURCES, type Box } from './layout';
import { FROZEN_SATURATION } from './wake';

export interface WakeUniforms {
  uWuToTown: { value: Matrix4 };
  uWuWake: { value: Vector2[] };
}

export function createWakeUniforms(): WakeUniforms {
  return {
    uWuToTown: { value: new Matrix4() },
    uWuWake: { value: Array.from({ length: MAX_WAKE_SOURCES }, () => new Vector2(-1, 0)) },
  };
}

const f = (n: number): string => n.toFixed(5);
const vec3 = (v: readonly [number, number, number]): string => `vec3( ${f(v[0])}, ${f(v[1])}, ${f(v[2])} )`;

/** GLSL constants for the volumes and sources. Unused box slots are empty (min above max); unused sources sit at the origin. */
function constants(boxes: readonly Box[], sources: readonly { x: number; z: number }[]): string {
  const empty: Box = { min: [1, 1, 1], max: [-1, -1, -1] };
  const b = Array.from({ length: MAX_SCENERY_BOXES }, (_, i) => boxes[i] ?? empty);
  const s = Array.from({ length: MAX_WAKE_SOURCES }, (_, i) => sources[i] ?? { x: 0, z: 0 });
  return [
    `#define WU_BOXES ${MAX_SCENERY_BOXES}`,
    `#define WU_SOURCES ${MAX_WAKE_SOURCES}`,
    `const vec3 WU_BOX_MIN[ WU_BOXES ] = vec3[ WU_BOXES ]( ${b.map((x) => vec3(x.min)).join(', ')} );`,
    `const vec3 WU_BOX_MAX[ WU_BOXES ] = vec3[ WU_BOXES ]( ${b.map((x) => vec3(x.max)).join(', ')} );`,
    `const vec2 WU_SRC_POS[ WU_SOURCES ] = vec2[ WU_SOURCES ]( ${s.map((x) => `vec2( ${f(x.x)}, ${f(x.z)} )`).join(', ')} );`,
  ].join('\n');
}

const VERTEX_DECL = 'uniform mat4 uWuToTown;\nvarying vec3 vWuTown;';
const VERTEX_BODY = `
	vec4 wuW = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
		wuW = instanceMatrix * wuW;
	#endif
	vWuTown = ( uWuToTown * ( modelMatrix * wuW ) ).xyz;`;

const FRAGMENT_DECL = 'uniform vec2 uWuWake[ WU_SOURCES ];\nvarying vec3 vWuTown;';
const FRAGMENT_SCENERY = `
	float wuScenery = 0.0;
	float wuAwake = 0.0;
	float wuRing = 0.0;
	vec3 wuP = vWuTown;
	if ( wuP.y < 0.21 && abs( wuP.x ) < 0.31 && abs( wuP.z ) < 0.16 ) {
		for ( int i = 0; i < WU_BOXES; i ++ ) {
			vec3 a = step( WU_BOX_MIN[ i ], wuP ) * step( wuP, WU_BOX_MAX[ i ] );
			wuScenery = max( wuScenery, a.x * a.y * a.z );
		}
		if ( wuScenery > 0.0 ) {
			for ( int i = 0; i < WU_SOURCES; i ++ ) {
				float d = distance( wuP.xz, WU_SRC_POS[ i ] );
				float r = uWuWake[ i ].x;
				wuAwake = max( wuAwake, 1.0 - smoothstep( r - 0.008, r, d ) );
				wuRing += uWuWake[ i ].y * ( 1.0 - smoothstep( 0.0, 0.012, abs( d - r ) ) );
			}
		}
	}
	float wuFrozen = wuScenery * ( 1.0 - clamp( wuAwake, 0.0, 1.0 ) );
	totalEmissiveRadiance *= 1.0 - wuFrozen;`;
const FRAGMENT_GRADE = `
	if ( wuScenery > 0.0 ) {
		float wuLum = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
		vec3 wuCold = mix( vec3( wuLum ), outgoingLight, ${f(FROZEN_SATURATION)} ) * vec3( 0.86, 0.95, 1.08 );
		outgoingLight = mix( outgoingLight, wuCold, wuFrozen );
		outgoingLight += vec3( 1.0, 0.78, 0.43 ) * ( wuRing * 0.32 );
	}`;

function insert(src: string, anchor: string, text: string, before = false): string {
  if (!src.includes(anchor)) throw new Error(`wake shader: anchor "${anchor}" not found`);
  return src.replace(anchor, before ? `${text}\n${anchor}` : `${anchor}\n${text}`);
}

/** The patched sources of a MeshStandardMaterial or MeshPhysicalMaterial program. Throws when a chunk it hooks into is missing. */
export function patchWakeShader(vertex: string, fragment: string): { vertexShader: string; fragmentShader: string } {
  const defs = constants(SCENERY_BOXES, WAKE_SOURCES);
  let v = insert(vertex, '#include <common>', VERTEX_DECL);
  v = insert(v, '#include <project_vertex>', VERTEX_BODY);
  let fs = insert(fragment, '#include <common>', `${defs}\n${FRAGMENT_DECL}`);
  fs = insert(fs, '#include <emissivemap_fragment>', FRAGMENT_SCENERY);
  fs = insert(fs, '#include <opaque_fragment>', FRAGMENT_GRADE, true);
  return { vertexShader: v, fragmentShader: fs };
}

/** `customProgramCacheKey` of every patched material: a patched and a plain program never share a cache entry. */
export const WAKE_PROGRAM_KEY = 'wu-wake-1';

/** Patches one material in place. */
export function patchMaterial(material: Material, uniforms: WakeUniforms): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    try {
      const patched = patchWakeShader(shader.vertexShader, shader.fragmentShader);
      shader.vertexShader = patched.vertexShader;
      shader.fragmentShader = patched.fragmentShader;
      shader.uniforms.uWuToTown = uniforms.uWuToTown;
      shader.uniforms.uWuWake = uniforms.uWuWake;
    } catch (error) {
      console.error('[wound-up] The wake shading could not be applied; the town stays unshaded.', error);
    }
  };
  material.customProgramCacheKey = () => WAKE_PROGRAM_KEY;
  material.needsUpdate = true;
}

/**
 * Patches every shared library material (both variants, with and without vertex colours). Call it once, after
 * `createMaterialRegistry` and before the first frame that draws the town. Returns the number of materials patched.
 */
export function installWakeShading(registry: MaterialRegistry, uniforms: WakeUniforms): number {
  let count = 0;
  for (const name of registry.names()) {
    for (const vertexColors of [false, true]) {
      patchMaterial(registry.get(name, vertexColors), uniforms);
      count++;
    }
  }
  return count;
}
