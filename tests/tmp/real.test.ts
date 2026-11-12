import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { it } from 'vitest';
const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
it('parses', async () => {
  const buf = fs.readFileSync('D:/Development/AI ML/WoundUp/public/assets/models/tockton/carousel/carousel_platform.glb');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf: any = await new GLTFLoader().parseAsync(ab, '');
  console.log('scene', gltf.scene.type, gltf.scene.name, JSON.stringify(gltf.scene.userData), gltf.scene.children.map((c: any) => c.name + ':' + c.type + ':' + JSON.stringify(c.userData).slice(0, 80)));
});
