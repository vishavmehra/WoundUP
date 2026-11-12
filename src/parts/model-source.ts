// Where model files come from. The loader depends on this interface so Vitest can run it without WebGL or the network;
// the real implementation is IWSDK's AssetManager (installed 1.1.0-rc.2: asset/asset-manager.d.ts, asset/cache-manager.d.ts).
import { AssetManager, CacheManager } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';

export interface ModelSource {
  /** Fetch and cache one GLB under `key`. Resolves when it is parsed; a second call for the same key is answered from the cache. */
  load(key: string, url: string): Promise<void>;
  /** The cached scene itself, not a copy: the one place the shared library materials are applied. */
  shared(key: string): Object3D | undefined;
  /** A fresh hierarchy that shares the cached geometry and materials, so every spawn can sit in its own place. */
  clone(key: string): Object3D | undefined;
  /** Forget the cached file (its geometry is disposed by the loader first). */
  drop(key: string): void;
}

/**
 * AssetManager.loadGLTF(url, key) caches the parsed GLTF; getGLTF(key) clones its scene with geometry and materials shared
 * by reference; `{ shared: true }` returns the cached scene. Needs the World to exist (AssetManager.init runs in World.create),
 * so it is exercised in the browser, not in Vitest.
 */
export const iwsdkModelSource: ModelSource = {
  async load(key, url) {
    await AssetManager.loadGLTF(url, key);
  },
  shared: (key) => AssetManager.getGLTF(key, { shared: true })?.scene,
  clone: (key) => AssetManager.getGLTF(key)?.scene,
  drop: (key) => void CacheManager.deleteAsset(key),
};
