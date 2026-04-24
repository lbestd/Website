// world.js — Heightmap world: terrain generation + city physics data

import { Noise } from './noise.js';

export class WorldConfig {
  constructor({ mountainPct = 40, plainHeight = 50, mountainMax = 100 } = {}) {
    this.mountainPct = mountainPct;
    this.plainHeight = plainHeight;
    this.mountainMax = mountainMax;
  }
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export class World {
  constructor(seed = 42, config = new WorldConfig()) {
    this.seed      = seed;
    this.config    = config;
    this.noise     = new Noise(seed);
    this.buildings = []; // AABB list {x,y,z,w,h,d} — set by city after generation
  }

  _heightAt(wx, wz) {
    const n = this.noise, cfg = this.config;
    const br    = (n.sample2D(wx * 0.0006, wz * 0.0006) + 1) * 0.5;
    const thr   = 1 - cfg.mountainPct / 100;
    const mtnT  = smoothstep(thr, Math.min(1, thr + 0.18), br);
    const flatH = cfg.plainHeight + n.fbm2D(wx * 0.008, wz * 0.008, { octaves: 4, gain: 0.4 }) * 5;
    const mtnN  = Math.pow(Math.max(0,
      (n.fbm2D(wx * 0.003, wz * 0.003,
               { octaves: 7, lacunarity: 2.1, gain: 0.45, warpAmt: 1.2 }) + 1) * 0.5
    ), 1.5);
    const mtnH = cfg.plainHeight + mtnN * (cfg.mountainMax - cfg.plainHeight);
    return Math.max(4, flatH + mtnT * (mtnH - flatH));
  }

  surfaceAt(wx, wz) { return this._heightAt(wx, wz); }

  // Physics helper: is (x, y, z) inside any city building?
  // hw = horizontal half-width of the query box (for player AABB collision).
  insideBuilding(x, y, hw, z, playerH = 1.78) {
    for (const b of this.buildings) {
      if (x - hw < b.x + b.w && x + hw > b.x &&
          y       < b.y + b.h && y + playerH > b.y &&
          z - hw < b.z + b.d && z + hw > b.z) return true;
    }
    return false;
  }
}
