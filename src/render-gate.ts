import { Object3D } from '@iwsdk/core';
import type { Camera, Scene, World } from '@iwsdk/core';

/**
 * Holds back every 2D draw until the shader programs of the finished scene are built, so the page never draws (and so never compiles
 * a program) in the middle of loading. A synchronous compile blocks the main thread until the GPU has linked the program: 8 to 13
 * programs were 1 to 4 seconds of a frozen page on a desktop GPU (docs/evidence/WEBPERF_2026-11-15.md). Immersive frames are never held.
 *
 * Install it BEFORE `installRenderBudget`: the budget keeps the `renderer.render` it finds, so this gate sits under it.
 */
export interface RenderGate {
  /** Lets draws through. Call `RenderBudget.wake()` afterwards so the first picture is drawn. */
  open(): void;
}

export function installRenderGate(world: World): RenderGate {
  const renderer = world.renderer;
  const draw = renderer.render.bind(renderer);
  let held = true;
  renderer.render = (scene, camera): void => {
    if (held && !renderer.xr.isPresenting) return;
    draw(scene, camera);
  };
  return {
    open() {
      held = false;
    },
  };
}

/** The slice of the renderer `compileBehindLanding` uses (three's `compileAsync`: materials of `scene`, lights of `target`). */
export interface ShaderCompiler {
  compileAsync(scene: Object3D, camera: Camera, target?: Scene | null): Promise<unknown>;
}

/** Longest the page waits for the GPU to finish compiling before it draws anyway (a hidden tab, or a driver that never answers). */
export const COMPILE_GIVE_UP_MS = 10_000;

/**
 * A stand-in root whose children are the meshes of `scene` that are shown right now, so `compileAsync(root, camera, scene)` builds those and
 * nothing hidden. The meshes keep their real parents (nothing is moved): three only walks `root.children` and each mesh's own subtree.
 */
export function visibleMeshesRoot(scene: Object3D): Object3D {
  const root = new Object3D();
  scene.traverseVisible((object) => {
    const kind = object as Object3D & { isMesh?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean };
    if (kind.isMesh || kind.isLine || kind.isPoints || kind.isSprite) root.children.push(object);
  });
  return root;
}

export interface CompileOptions {
  /** Build only what is shown now (a gift page never shows the town, so its hidden shaders are not worth the GPU's time). Default: everything, hidden objects included. */
  visibleOnly?: boolean;
  giveUpMs?: number;
}

/**
 * Builds the program of every material in the scene on the GPU's own threads (`KHR_parallel_shader_compile` where the browser has it), so the
 * main thread keeps running and the first draw finds them ready. By default hidden objects are built too: the town is hidden until the
 * trunk opens, and a program built then would be a hitch in the middle of the story. Call it once everything the page shows exists and the
 * library textures are in: a texture that arrives later is another program. Never rejects.
 */
export async function compileBehindLanding(renderer: ShaderCompiler, scene: Object3D, camera: Camera, options: CompileOptions = {}): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, options.giveUpMs ?? COMPILE_GIVE_UP_MS);
  });
  try {
    const compiled = options.visibleOnly ? renderer.compileAsync(visibleMeshesRoot(scene), camera, scene as Scene) : renderer.compileAsync(scene, camera);
    await Promise.race([compiled.then(() => undefined), timeout]);
  } catch (error) {
    console.warn('[wound-up] could not build the shaders ahead of the first frame; the first frame will:', error);
  } finally {
    clearTimeout(timer);
  }
}
