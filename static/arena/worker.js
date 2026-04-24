// worker.js — Terrain patch generation in Web Worker
// Receives: { px, pz, seed, cfg }
// Returns:  { px, pz, vertices, indices, yMin, yMax }  (transferable)

import { World, WorldConfig } from './world.js';
import { generatePatch }      from './terrain.js';

const cache = new Map();

self.onmessage = function({ data: { px, pz, seed, cfg } }) {
  let world = cache.get(seed);
  if (!world) {
    world = new World(seed, new WorldConfig(cfg));
    cache.set(seed, world);
  }

  const { vertices, indices, yMin, yMax } =
    generatePatch(px, pz, (wx, wz) => world._heightAt(wx, wz));

  self.postMessage(
    { px, pz, vertices, indices, yMin, yMax },
    [vertices.buffer, indices.buffer]
  );
};
