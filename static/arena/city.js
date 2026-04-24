// city.js — City: procedural building layout + box mesh generation
// Vertex: pos(3f) + normal(3f) + color(3f) = 9 floats, stride = 36 bytes

const FACE_NORMALS = [
  [ 0, 1, 0], [ 0,-1, 0],
  [ 1, 0, 0], [-1, 0, 0],
  [ 0, 0, 1], [ 0, 0,-1],
];
const FACE_CORNERS = [
  [[0,1,0],[1,1,0],[1,1,1],[0,1,1]], // top    +Y
  [[0,0,1],[1,0,1],[1,0,0],[0,0,0]], // bottom −Y
  [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], // right  +X
  [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], // left   −X
  [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], // front  +Z
  [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], // back   −Z
];

function pushBox(verts, idxs, x, y, z, w, h, d, r, g, b) {
  for (let f = 0; f < 6; f++) {
    const [nx, ny, nz] = FACE_NORMALS[f];
    const base = verts.length / 9;
    for (const [vx, vy, vz] of FACE_CORNERS[f])
      verts.push(x + vx*w, y + vy*h, z + vz*d, nx, ny, nz, r, g, b);
    idxs.push(base, base+1, base+2, base, base+2, base+3);
  }
}

function rng(x, z, s = 0) {
  let h = (x * 1234567 + z * 7654321 + s * 999983) | 0;
  h ^= h >>> 13; h = Math.imul(h, 0x9e3779b9 | 0); h ^= h >>> 17;
  return (h & 0x7fffffff) / 0x7fffffff;
}

// Plan city: returns building AABB list + road rects.
// All buildings share the same base height (flattened to max terrain height in footprint).
export function planCity(world, originX, originZ, bW = 8, bD = 8) {
  const ROAD_W = 14, BLOCK = 30, STRIDE = ROAD_W + BLOCK;
  const buildings = [];

  for (let bx = 0; bx < bW; bx++) {
    for (let bz = 0; bz < bD; bz++) {
      const blkX = originX + bx * STRIDE + ROAD_W;
      const blkZ = originZ + bz * STRIDE + ROAD_W;

      // Find max terrain height in block footprint → flat city floor
      let baseY = -Infinity;
      for (let sx = 0; sx <= BLOCK; sx += 4)
        for (let sz = 0; sz <= BLOCK; sz += 4) {
          const h = world._heightAt(blkX + sx, blkZ + sz);
          if (h > baseY) baseY = h;
        }
      baseY = Math.floor(baseY) + 1;

      const r0 = rng(bx, bz);
      const floors = 2 + (rng(bx, bz, 1) * 12 | 0);
      const H = floors * 3;
      const margin = 1 + (rng(bx, bz, 2) * 2 | 0);
      const bw = BLOCK - margin * 2;
      const bd = BLOCK - margin * 2;

      // Material colour
      let cr, cg, cb;
      if (r0 < 0.30)      { cr = 0.60; cg = 0.25; cb = 0.14; } // brick
      else if (r0 < 0.60) { cr = 0.58; cg = 0.58; cb = 0.60; } // concrete
      else                 { cr = 0.40; cg = 0.48; cb = 0.56; } // metal

      buildings.push({ x: blkX + margin, y: baseY, z: blkZ + margin,
                       w: bw, h: H, d: bd, r: cr, g: cg, b: cb });

      // Setback top crown for taller buildings
      if (H > 18 && bw > 8 && bd > 8) {
        buildings.push({ x: blkX + margin + 2, y: baseY + H, z: blkZ + margin + 2,
                         w: bw - 4, h: 6, d: bd - 4,
                         r: 0.40, g: 0.48, b: 0.56 });
      }

      // Rooftop detail: antenna / water tower for some buildings
      if (rng(bx, bz, 3) > 0.7) {
        const cx = blkX + margin + bw / 2 | 0, cz = blkZ + margin + bd / 2 | 0;
        buildings.push({ x: cx - 0.3, y: baseY + H, z: cz - 0.3,
                         w: 0.6, h: 8, d: 0.6, r: 0.35, g: 0.35, b: 0.38 });
      }
    }
  }
  return buildings;
}

// Build single GPU mesh from building AABB list.
export function buildCityMesh(buildings) {
  const verts = [], idxs = [];
  for (const b of buildings)
    pushBox(verts, idxs, b.x, b.y, b.z, b.w, b.h, b.d, b.r, b.g, b.b);
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idxs) };
}

// City total bounding box (for spawn placement)
export function cityBounds(originX, originZ, bW = 8, bD = 8) {
  const ROAD_W = 14, BLOCK = 30, STRIDE = ROAD_W + BLOCK;
  return { x: originX, z: originZ, w: bW * STRIDE, d: bD * STRIDE };
}
