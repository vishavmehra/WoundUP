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
 *
 * Two more uniforms serve the dressing and the night (ADR-045, PRODUCT_SPEC F16): `uWuDress` is the byte grid of dressing.ts
 * (the wake group bits of every house, prop and lamp post, read above the paving), and `uWuNight` (0 day, 1 night) strengthens
 * the emissive windows and lamp bulbs of the scenery, which carry the town at night.
 */
import { DataTexture, Matrix4, NearestFilter, RGFormat, UnsignedByteType, Vector2 } from '@iwsdk/core';
import type { Material, WebGLProgramParametersWithUniforms } from '@iwsdk/core';
import type { MaterialRegistry } from '../materials';
import { dressingGrid } from './dressing-table';
import { DRESS_GRID, DRESS_READ_Y_M, MAX_SCENERY_BOXES, MAX_WAKE_SOURCES, SCENERY_BOXES, WAKE_SOURCES, type Box, type WakeSource } from './layout';
import { FROZEN_RESIDUAL, FROZEN_TINT } from './wake';

export interface WakeUniforms {
  uWuToTown: { value: Matrix4 };
  uWuWake: { value: Vector2[] };
  uWuDress: { value: DataTexture };
  uWuNight: { value: number };
}

/** How much brighter the scenery's emissive surfaces are at full night: windows and lamp bulbs carry the dark town. */
export const NIGHT_GLOW = 1.2;

/**
 * The dressing's wake groups as a 120 x 60 texture of two bytes a cell (red the low byte of the group bits, green the high byte:
 * sixteen groups), nearest, no mips, built once from the table in dressing-table.ts.
 */
export function createDressTexture(): DataTexture {
  const bits = dressingGrid();
  const bytes = new Uint8Array(bits.length * 2);
  for (let i = 0; i < bits.length; i++) {
    bytes[i * 2] = bits[i] & 0xff;
    bytes[i * 2 + 1] = bits[i] >> 8;
  }
  const texture = new DataTexture(bytes, DRESS_GRID.w, DRESS_GRID.h, RGFormat, UnsignedByteType);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export function createWakeUniforms(): WakeUniforms {
  return {
    uWuToTown: { value: new Matrix4() },
    uWuWake: { value: Array.from({ length: MAX_WAKE_SOURCES }, () => new Vector2(-1, 0)) },
    uWuDress: { value: createDressTexture() },
    uWuNight: { value: 0 },
  };
}

const f = (n: number): string => n.toFixed(5);
const vec3 = (v: readonly [number, number, number]): string => `vec3( ${f(v[0])}, ${f(v[1])}, ${f(v[2])} )`;

/** GLSL constants for the volumes and sources. Unused box slots are empty (min above max); unused sources sit at the origin. */
export function constants(boxes: readonly Box[], sources: readonly WakeSource[]): string {
  const empty: Box = { min: [1, 1, 1], max: [-1, -1, -1], group: 0 };
  const b = Array.from({ length: MAX_SCENERY_BOXES }, (_, i) => boxes[i] ?? empty);
  const s = Array.from({ length: MAX_WAKE_SOURCES }, (_, i) => sources[i] ?? { x: 0, z: 0, wakes: 0 });
  return [
    `#define WU_BOXES ${MAX_SCENERY_BOXES}`,
    `#define WU_SOURCES ${MAX_WAKE_SOURCES}`,
    `const vec3 WU_BOX_MIN[ WU_BOXES ] = vec3[ WU_BOXES ]( ${b.map((x) => vec3(x.min)).join(', ')} );`,
    `const vec3 WU_BOX_MAX[ WU_BOXES ] = vec3[ WU_BOXES ]( ${b.map((x) => vec3(x.max)).join(', ')} );`,
    `const int WU_BOX_GROUP[ WU_BOXES ] = int[ WU_BOXES ]( ${b.map((x) => x.group).join(', ')} );`,
    `const vec2 WU_SRC_POS[ WU_SOURCES ] = vec2[ WU_SOURCES ]( ${s.map((x) => `vec2( ${f(x.x)}, ${f(x.z)} )`).join(', ')} );`,
    `const int WU_SRC_WAKES[ WU_SOURCES ] = int[ WU_SOURCES ]( ${s.map((x) => x.wakes).join(', ')} );`,
    `#define WU_DRESS_Y ${f(DRESS_READ_Y_M)}`,
    `const vec2 WU_DRESS_ORIGIN = vec2( ${f(DRESS_GRID.x0)}, ${f(DRESS_GRID.z0)} );`,
    `const vec2 WU_DRESS_SIZE = vec2( ${f(DRESS_GRID.w * DRESS_GRID.cell)}, ${f(DRESS_GRID.h * DRESS_GRID.cell)} );`,
  ].join('\n');
}

const VERTEX_DECL = 'uniform mat4 uWuToTown;\nvarying vec3 vWuTown;';
const VERTEX_BODY = `
	vec4 wuW = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
		wuW = instanceMatrix * wuW;
	#endif
	vWuTown = ( uWuToTown * ( modelMatrix * wuW ) ).xyz;`;

const FRAGMENT_DECL = 'uniform vec2 uWuWake[ WU_SOURCES ];\nuniform sampler2D uWuDress;\nuniform float uWuNight;\nvarying vec3 vWuTown;';
const FRAGMENT_SCENERY = `
	float wuScenery = 0.0;
	float wuAwake = 0.0;
	float wuRing = 0.0;
	vec3 wuP = vWuTown;
	if ( wuP.y < 0.21 && abs( wuP.x ) < 0.31 && abs( wuP.z ) < 0.16 ) {
		int wuGroups = 0;
		for ( int i = 0; i < WU_BOXES; i ++ ) {
			vec3 a = step( WU_BOX_MIN[ i ], wuP ) * step( wuP, WU_BOX_MAX[ i ] );
			if ( a.x * a.y * a.z > 0.0 ) wuGroups |= WU_BOX_GROUP[ i ];
		}
		if ( wuP.y > WU_DRESS_Y ) {
			vec2 wuUv = ( wuP.xz - WU_DRESS_ORIGIN ) / WU_DRESS_SIZE;
			if ( wuUv.x >= 0.0 && wuUv.x < 1.0 && wuUv.y >= 0.0 && wuUv.y < 1.0 ) { vec2 wuBits = texture2D( uWuDress, wuUv ).rg * 255.0 + 0.5; wuGroups |= int( wuBits.x ) | ( int( wuBits.y ) << 8 ); }
		}
		if ( wuGroups != 0 ) {
			wuScenery = 1.0;
			for ( int i = 0; i < WU_SOURCES; i ++ ) {
				if ( ( WU_SRC_WAKES[ i ] & wuGroups ) == 0 ) continue;
				float d = distance( wuP.xz, WU_SRC_POS[ i ] );
				float r = uWuWake[ i ].x;
				wuAwake = max( wuAwake, 1.0 - smoothstep( r - 0.008, r, d ) );
				wuRing += uWuWake[ i ].y * ( 1.0 - smoothstep( 0.0, 0.012, abs( d - r ) ) );
			}
		}
	}
	float wuFrozen = wuScenery * ( 1.0 - clamp( wuAwake, 0.0, 1.0 ) );
	totalEmissiveRadiance *= 1.0 - wuFrozen;
	totalEmissiveRadiance *= 1.0 + uWuNight * ${f(NIGHT_GLOW)} * wuScenery;`;
const FRAGMENT_GRADE = `
	if ( wuScenery > 0.0 ) {
		float wuLum = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
		vec3 wuCold = mix( vec3( wuLum ), outgoingLight, ${f(FROZEN_RESIDUAL)} ) * ${vec3(FROZEN_TINT)};
		outgoingLight = mix( outgoingLight, wuCold, wuFrozen );
		outgoingLight += vec3( 1.0, 0.78, 0.43 ) * ( wuRing * 0.32 );
	}`;

/**
 * Baked vertex ambient occlusion (COLOR_0, blender/scripts/lib/vertex_ao.py). three.js multiplies COLOR_0 into the base colour, which
 * darkens direct light and the metals' reflections too, and the baked values of the town and the tower are low (mean 0.14 to 0.45,
 * a tenth of the vertices exactly 0; the gears are 0.77): that alone made the whole scene read black. So the multiply is dropped and
 * the value is used as what it is, occlusion: a floor and a mix, on the indirect light (hemisphere light and environment) and, less,
 * on the direct light (the town has no real-time shadows, so the baked occlusion is its only contact shading).
 */
export const AO_INDIRECT_FLOOR = 0.4;
export const AO_DIRECT_FLOOR = 0.75;
const FRAGMENT_AO = `
	#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
		float wuOccl = vColor.r;
		float wuOcclIndirect = mix( ${f(AO_INDIRECT_FLOOR)}, 1.0, wuOccl );
		float wuOcclDirect = mix( ${f(AO_DIRECT_FLOOR)}, 1.0, wuOccl );
		reflectedLight.indirectDiffuse *= wuOcclIndirect;
		reflectedLight.indirectSpecular *= wuOcclIndirect;
		reflectedLight.directDiffuse *= wuOcclDirect;
		reflectedLight.directSpecular *= wuOcclDirect;
	#endif`;

function insert(src: string, anchor: string, text: string, before = false): string {
  if (!src.includes(anchor)) throw new Error(`wake shader: anchor "${anchor}" not found`);
  return src.replace(anchor, before ? `${text}\n${anchor}` : `${anchor}\n${text}`);
}

/** Replaces the chunk include `anchor` by `text` (an empty text drops the chunk). */
function swap(src: string, anchor: string, text: string): string {
  if (!src.includes(anchor)) throw new Error(`wake shader: anchor "${anchor}" not found`);
  return src.replace(anchor, text);
}

/** The patched sources of a MeshStandardMaterial or MeshPhysicalMaterial program. Throws when a chunk it hooks into is missing. */
export function patchWakeShader(vertex: string, fragment: string): { vertexShader: string; fragmentShader: string } {
  const defs = constants(SCENERY_BOXES, WAKE_SOURCES);
  let v = insert(vertex, '#include <common>', VERTEX_DECL);
  v = insert(v, '#include <project_vertex>', VERTEX_BODY);
  let fs = insert(fragment, '#include <common>', `${defs}\n${FRAGMENT_DECL}`);
  fs = swap(fs, '#include <color_fragment>', ''); // the vertex colour is occlusion, not paint (FRAGMENT_AO)
  fs = insert(fs, '#include <emissivemap_fragment>', FRAGMENT_SCENERY);
  fs = insert(fs, '#include <aomap_fragment>', FRAGMENT_AO);
  fs = insert(fs, '#include <opaque_fragment>', FRAGMENT_GRADE, true);
  return { vertexShader: v, fragmentShader: fs };
}

/** `customProgramCacheKey` of every patched material: a patched and a plain program never share a cache entry. */
export const WAKE_PROGRAM_KEY = 'wu-wake-3';

/** Patches one material in place. */
export function patchMaterial(material: Material, uniforms: WakeUniforms): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    try {
      const patched = patchWakeShader(shader.vertexShader, shader.fragmentShader);
      shader.vertexShader = patched.vertexShader;
      shader.fragmentShader = patched.fragmentShader;
      shader.uniforms.uWuToTown = uniforms.uWuToTown;
      shader.uniforms.uWuWake = uniforms.uWuWake;
      shader.uniforms.uWuDress = uniforms.uWuDress;
      shader.uniforms.uWuNight = uniforms.uWuNight;
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
