// terrain.js — Heightmap terrain: patch mesh generation + streaming
// Vertex: pos(3f) + normal(3f) = 6 floats, stride = 24 bytes

export const PATCH_SIZE = 128;  // world units per patch side
export const PATCH_RES  = 64;   // quads per side  →  vertex spacing = 2 units

export function generatePatch(px, pz, heightAt) {
  const ox   = px * PATCH_SIZE;
  const oz   = pz * PATCH_SIZE;
  const N    = PATCH_RES;
  const VN   = N + 1;             // vertices per side
  const step = PATCH_SIZE / N;    // 2.0 world units
  const eps  = step;

  const verts = new Float32Array(VN * VN * 6);
  const idxs  = new Uint32Array(N * N * 6);
  let yMin = Infinity, yMax = -Infinity;

  for (let iz = 0; iz <= N; iz++) {
    for (let ix = 0; ix <= N; ix++) {
      const wx = ox + ix * step;
      const wz = oz + iz * step;
      const wy = heightAt(wx, wz);
      if (wy < yMin) yMin = wy;
      if (wy > yMax) yMax = wy;

      // Central-difference surface normal
      const hl = heightAt(wx - eps, wz), hr = heightAt(wx + eps, wz);
      const hd = heightAt(wx, wz - eps), hu = heightAt(wx, wz + eps);
      let nx = hl - hr, ny = 2 * eps, nz = hd - hu;
      const nl = Math.sqrt(nx*nx + ny*ny + nz*nz);
      nx /= nl; ny /= nl; nz /= nl;

      const vi = (iz * VN + ix) * 6;
      verts[vi]   = wx; verts[vi+1] = wy; verts[vi+2] = wz;
      verts[vi+3] = nx; verts[vi+4] = ny; verts[vi+5] = nz;
    }
  }

  let ii = 0;
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const a = iz * VN + ix, b = a + 1, c = a + VN, d = c + 1;
      idxs[ii++] = a; idxs[ii++] = c; idxs[ii++] = b;
      idxs[ii++] = b; idxs[ii++] = c; idxs[ii++] = d;
    }
  }

  return { vertices: verts, indices: idxs, yMin, yMax };
}

// Streams terrain patches around the camera using a worker pool.
export class TerrainManager {
  constructor(radius = 5) {
    this.patches  = new Map();   // key → patch object
    this.radius   = radius;
    this._pending = new Set();   // keys currently in-flight
  }

  _key(px, pz) { return `${px},${pz}`; }

  // Call every frame; requests missing patches from pool, unloads distant ones.
  tick(camX, camZ, pool, seed, cfg) {
    const cpx = Math.floor(camX / PATCH_SIZE);
    const cpz = Math.floor(camZ / PATCH_SIZE);
    const r   = this.radius;

    // Unload patches outside radius + 1
    for (const [key, p] of this.patches) {
      if (Math.abs(p.px - cpx) > r + 1 || Math.abs(p.pz - cpz) > r + 1) {
        if (p.vb) p.vb.destroy();
        if (p.ib) p.ib.destroy();
        this.patches.delete(key);
        this._pending.delete(key);
      }
    }

    // Request missing patches, closest ring first
    for (let dd = 0; dd <= r; dd++) {
      for (let dx = -dd; dx <= dd; dx++) {
        for (let dz = -dd; dz <= dd; dz++) {
          if (Math.abs(dx) !== dd && Math.abs(dz) !== dd) continue; // ring only
          const px = cpx + dx, pz = cpz + dz;
          const key = this._key(px, pz);
          if (this.patches.has(key) || this._pending.has(key)) continue;
          this._pending.add(key);
          pool.generate(px, pz, seed, cfg).then(data => {
            this._pending.delete(key);
            if (!this.patches.has(key)) {
              this.patches.set(key, {
                px: data.px, pz: data.pz,
                ox: data.px * PATCH_SIZE, oz: data.pz * PATCH_SIZE,
                vb: null, ib: null, indexCount: 0,
                yMin: data.yMin, yMax: data.yMax,
                vertices: data.vertices, indices: data.indices,
              });
            }
          });
        }
      }
    }
  }

  destroy() {
    for (const p of this.patches.values()) {
      if (p.vb) p.vb.destroy();
      if (p.ib) p.ib.destroy();
    }
    this.patches.clear();
    this._pending.clear();
  }
}
