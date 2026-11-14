import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ModelSource } from '../../src/town/scene';
import { fs, repoUrl } from './helpers';

/**
 * The real GLBs parsed in Node, for the tests that need the actual frames, names and `wu` data of the shipped files. Set
 * WU_MODELS_DIR to another checkout's `public/assets/models` to run against that folder (the worktrees share one set of assets).
 */
const override = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.WU_MODELS_DIR;
const dir = override ? new URL(`file:///${override.replace(/\\/g, '/').replace(/\/?$/, '/')}`) : repoUrl('public/assets/models/');

/** True when the Tockton GLBs this suite needs are in the working tree. */
export const modelsPresent =
  fs.existsSync(new URL('tockton/environment/town_ground.glb', dir)) &&
  fs.existsSync(new URL('tockton/windmill/windmill_base.glb', dir)) &&
  fs.existsSync(new URL('tockton/music_box/music_box_case.glb', dir)) &&
  fs.existsSync(new URL('shared/governor/governor_standard.glb', dir));

export const realSource: ModelSource = async (path) => {
  const bytes = fs.readFileSync(new URL(path, dir));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  return { scene: gltf.scene, animations: gltf.animations };
};
