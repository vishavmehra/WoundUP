/**
 * A town with nothing in it, for a page that never shows the town: a gift link (`installTown(..., { source: emptyTownSource, dressing: false })`).
 * The gift page needs `TownRuntime` (it steps the machine on the stand: motion, melody, wake shader), but its town group stays hidden, so
 * downloading, parsing and merging the ground, the Bakery, the theatre and the two figures (3 MB of a 6.4 MB page) is wasted. Each model is an
 * empty group; the Bakery keeps the baker's socket so `buildTown` finds it and has nothing to warn about.
 */
import { Group } from '@iwsdk/core';
import { BAKER_SOCKET } from './layout';
import type { ModelSource } from './scene';
import { TOWN_MODEL_PATHS } from './scene';

export const emptyTownSource: ModelSource = (path) => {
  const scene = new Group();
  scene.name = `Empty:${path}`;
  if (path === TOWN_MODEL_PATHS.bakery) {
    const socket = new Group();
    socket.name = BAKER_SOCKET;
    scene.add(socket);
  }
  return Promise.resolve({ scene, animations: [] });
};
