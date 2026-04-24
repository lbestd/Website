// mesher.js — Marching Cubes smooth terrain with voxel-type colours
// Vertex layout: position(3f), normal(3f), color(3f), ao(1f) = 10 floats

import { CS, VT } from './world.js';

const CS2 = CS * CS;

// Sub-voxel resolution for Marching Cubes (2 = 4× more surface triangles)
const SUBDIV = 1;
const STEP   = 1 / SUBDIV;
const ICS    = CS * SUBDIV;  // inner loop count

const CV = [
  [0,0,0],[STEP,0,0],[STEP,STEP,0],[0,STEP,0],
  [0,0,STEP],[STEP,0,STEP],[STEP,STEP,STEP],[0,STEP,STEP],
];
const CE = [
  [0,1],[1,2],[2,3],[3,0],
  [4,5],[5,6],[6,7],[7,4],
  [0,4],[1,5],[2,6],[3,7],
];

// prettier-ignore
const TRI_RAW = [
  [],[0,8,3],[0,1,9],[1,8,3,9,8,1],[1,2,10],[0,8,3,1,2,10],[9,2,10,0,2,9],[2,8,3,2,10,8,10,9,8],
  [3,11,2],[0,11,2,8,11,0],[1,9,0,2,3,11],[1,11,2,1,9,11,9,8,11],[3,10,1,11,10,3],
  [0,10,1,0,8,10,8,11,10],[3,9,0,3,11,9,11,10,9],[9,8,10,10,8,11],
  [4,7,8],[4,3,0,7,3,4],[0,1,9,8,4,7],[4,1,9,4,7,1,7,3,1],[1,2,10,8,4,7],
  [3,4,7,3,0,4,1,2,10],[9,2,10,9,0,2,8,4,7],[2,10,9,2,9,7,2,7,3,7,9,4],
  [8,4,7,3,11,2],[11,4,7,11,2,4,2,0,4],[9,0,1,8,4,7,2,3,11],
  [4,7,11,9,4,11,9,11,2,9,2,1],[3,10,1,3,11,10,7,8,4],
  [1,11,10,1,4,11,1,0,4,7,11,4],[4,7,8,9,0,11,9,11,10,11,0,3],[4,7,11,4,11,9,9,11,10],
  [9,5,4],[9,5,4,0,8,3],[0,5,4,1,5,0],[8,5,4,8,3,5,3,1,5],[1,2,10,9,5,4],
  [3,0,8,1,2,10,4,9,5],[5,2,10,5,4,2,4,0,2],[2,10,5,3,2,5,3,5,4,3,4,8],
  [9,5,4,2,3,11],[0,11,2,0,8,11,4,9,5],[0,5,4,0,1,5,2,3,11],[2,1,5,2,5,8,2,8,11,4,8,5],
  [10,3,11,10,1,3,9,5,4],[4,9,5,0,8,1,8,10,1,8,11,10],[5,4,0,5,0,11,5,11,10,11,0,3],
  [5,4,8,5,8,10,10,8,11],[9,7,8,5,7,9],[9,3,0,9,5,3,5,7,3],[0,7,8,0,1,7,1,5,7],
  [1,5,3,3,5,7],[9,7,8,9,5,7,10,1,2],[10,1,2,9,5,0,5,3,0,5,7,3],[8,0,2,8,2,5,8,5,7,10,5,2],
  [2,10,5,2,5,3,3,5,7],[7,9,5,7,8,9,3,11,2],[9,5,7,9,7,2,9,2,0,2,7,11],
  [2,3,11,0,1,8,1,7,8,1,5,7],[11,2,1,11,1,7,7,1,5],[9,5,8,8,5,7,10,1,3,10,3,11],
  [5,7,0,5,0,9,7,11,0,1,0,10,11,10,0],[11,10,0,11,0,3,10,5,0,8,0,7,5,7,0],[11,10,5,7,11,5],
  [10,6,5],[0,8,3,5,10,6],[9,0,1,5,10,6],[1,8,3,1,9,8,5,10,6],[1,6,5,2,6,1],
  [1,6,5,1,2,6,3,0,8],[9,6,5,9,0,6,0,2,6],[5,9,8,5,8,2,5,2,6,3,2,8],
  [2,3,11,10,6,5],[11,0,8,11,2,0,10,6,5],[0,1,9,2,3,11,5,10,6],
  [5,10,6,1,9,2,9,11,2,9,8,11],[6,3,11,6,5,3,5,1,3],[0,8,11,0,11,5,0,5,1,5,11,6],
  [3,11,6,0,3,6,0,6,5,0,5,9],[6,5,9,6,9,11,11,9,8],[5,10,6,4,7,8],
  [4,3,0,4,7,3,6,5,10],[1,9,0,5,10,6,8,4,7],[10,6,5,1,9,7,1,7,3,7,9,4],
  [6,1,2,6,5,1,4,7,8],[1,2,5,5,2,6,3,0,4,3,4,7],[8,4,7,9,0,5,0,6,5,0,2,6],
  [7,3,9,7,9,4,3,2,9,5,9,6,2,6,9],[3,11,2,7,8,4,10,6,5],
  [5,10,6,4,7,2,4,2,0,2,7,11],[0,1,9,4,7,8,2,3,11,5,10,6],
  [9,2,1,9,11,2,9,4,11,7,11,4,5,10,6],[8,4,7,3,11,5,3,5,1,5,11,6],
  [5,1,11,5,11,6,1,0,11,7,11,4,0,4,11],[0,5,9,0,6,5,0,3,6,11,6,3,8,4,7],
  [6,5,9,6,9,11,4,7,9,7,11,9],[10,4,9,6,4,10],[4,10,6,4,9,10,0,8,3],
  [10,0,1,10,6,0,6,4,0],[8,3,1,8,1,6,8,6,4,6,1,10],[1,4,9,1,2,4,2,6,4],
  [3,0,8,1,2,9,2,4,9,2,6,4],[0,2,4,4,2,6],[8,3,2,8,2,4,4,2,6],
  [10,4,9,10,6,4,11,2,3],[0,8,2,2,8,11,4,9,10,4,10,6],[3,11,2,0,1,6,0,6,4,6,1,10],
  [6,4,1,6,1,10,4,8,1,2,1,11,8,11,1],[9,6,4,9,3,6,9,1,3,11,6,3],
  [8,11,1,8,1,0,11,6,1,9,1,4,6,4,1],[3,11,6,3,6,0,0,6,4],[6,4,8,11,6,8],
  [7,10,6,7,8,10,8,9,10],[0,7,3,0,10,7,0,9,10,6,7,10],[10,6,7,1,10,7,1,7,8,1,8,0],
  [10,6,7,10,7,1,1,7,3],[1,2,6,1,6,8,1,8,9,8,6,7],[2,6,9,2,9,1,6,7,9,0,9,3,7,3,9],
  [7,8,0,7,0,6,6,0,2],[7,3,2,6,7,2],[2,3,11,10,6,8,10,8,9,8,6,7],
  [2,0,7,2,7,11,0,9,7,6,7,10,9,10,7],[1,8,0,1,7,8,1,10,7,6,7,10,2,3,11],
  [11,2,1,11,1,7,10,6,1,6,7,1],[8,9,6,8,6,7,9,1,6,11,6,3,1,3,6],
  [0,9,1,11,6,7],[7,8,0,7,0,6,3,11,0,11,6,0],[7,11,6],[7,6,11],[3,0,8,11,7,6],
  [0,1,9,11,7,6],[8,1,9,8,3,1,11,7,6],[10,1,2,6,11,7],[1,2,10,3,0,8,6,11,7],
  [2,9,0,2,10,9,6,11,7],[6,11,7,2,10,3,10,8,3,10,9,8],[7,2,3,6,2,7],
  [7,0,8,7,6,0,6,2,0],[2,7,6,2,3,7,0,1,9],[1,6,2,1,8,6,1,9,8,8,7,6],
  [10,7,6,10,1,7,1,3,7],[10,7,6,1,7,10,1,8,7,1,0,8],[0,3,7,0,7,10,0,10,9,6,10,7],
  [7,6,10,7,10,8,8,10,9],[6,8,4,11,8,6],[3,6,11,3,0,6,0,4,6],
  [8,6,11,8,4,6,9,0,1],[9,4,6,9,6,3,9,3,1,11,3,6],[6,8,4,6,11,8,2,10,1],
  [1,2,10,3,0,11,0,6,11,0,4,6],[4,11,8,4,6,11,0,2,9,2,10,9],
  [10,9,3,10,3,2,9,4,3,11,3,6,4,6,3],[8,2,3,8,4,2,4,6,2],[0,4,2,4,6,2],
  [1,9,0,2,3,4,2,4,6,4,3,8],[1,9,4,1,4,2,2,4,6],[8,1,3,8,6,1,8,4,6,6,10,1],
  [10,1,0,10,0,6,6,0,4],[4,6,3,4,3,8,6,10,3,0,3,9,10,9,3],[10,9,4,6,10,4],
  [4,9,5,7,6,11],[0,8,3,4,9,5,11,7,6],[5,0,1,5,4,0,7,6,11],
  [11,7,6,8,3,4,3,5,4,3,1,5],[9,5,4,10,1,2,7,6,11],[6,11,7,1,2,10,0,8,3,4,9,5],
  [7,6,11,5,4,10,4,2,10,4,0,2],[3,4,8,3,5,4,3,2,5,10,5,2,11,7,6],
  [7,2,3,7,6,2,5,4,9],[9,5,4,0,8,6,0,6,2,6,8,7],[3,6,2,3,7,6,1,5,0,5,4,0],
  [6,2,8,6,8,7,2,1,8,4,8,5,1,5,8],[9,5,4,10,1,6,1,7,6,1,3,7],
  [1,6,10,1,7,6,1,0,7,8,7,0,9,5,4],[4,0,10,4,10,5,0,3,10,6,10,7,3,7,10],
  [7,6,10,7,10,8,5,4,10,4,8,10],[6,9,5,6,11,9,11,8,9],[3,6,11,0,6,3,0,5,6,0,9,5],
  [0,11,8,0,5,11,0,1,5,5,6,11],[6,11,3,6,3,5,5,3,1],[1,2,10,9,5,11,9,11,8,11,5,6],
  [0,11,3,0,6,11,0,9,6,5,6,9,1,2,10],[11,8,5,11,5,6,8,0,5,10,5,2,0,2,5],
  [6,11,3,6,3,5,2,10,3,10,5,3],[5,8,9,5,2,8,5,6,2,3,8,2],[9,5,6,9,6,0,0,6,2],
  [1,5,8,1,8,0,5,6,8,3,8,2,6,2,8],[1,5,6,2,1,6],[1,3,6,1,6,10,3,8,6,5,6,9,8,9,6],
  [10,1,0,10,0,6,9,5,0,5,6,0],[0,3,8,5,6,10],[10,5,6],[11,5,10,7,5,11],
  [11,5,10,11,7,5,8,3,0],[5,11,7,5,10,11,1,9,0],[10,7,5,10,11,7,9,8,1,8,3,1],
  [11,1,2,11,7,1,7,5,1],[0,8,3,1,2,7,1,7,5,7,2,11],[9,7,5,9,2,7,9,0,2,2,11,7],
  [7,5,2,7,2,11,5,9,2,3,2,8,9,8,2],[2,5,10,2,3,5,3,7,5],[8,2,0,8,5,2,8,7,5,10,2,5],
  [9,0,1,5,10,3,5,3,7,3,10,2],[9,8,2,9,2,1,8,7,2,10,2,5,7,5,2],[1,3,5,3,7,5],
  [0,8,7,0,7,1,1,7,5],[9,0,3,9,3,5,5,3,7],[9,8,7,5,9,7],[5,8,4,5,10,8,10,11,8],
  [5,0,4,5,11,0,5,10,11,11,3,0],[0,1,9,8,4,10,8,10,11,10,4,5],
  [10,11,4,10,4,5,11,3,4,9,4,1,3,1,4],[2,5,1,2,8,5,2,11,8,4,5,8],
  [0,4,11,0,11,3,4,5,11,2,11,1,5,1,11],[0,2,5,0,5,9,2,11,5,4,5,8,11,8,5],
  [9,4,5,2,11,3],[2,5,10,3,5,2,3,4,5,3,8,4],[5,10,2,5,2,4,4,2,0],
  [3,10,2,3,5,10,3,8,5,4,5,8,0,1,9],[5,10,2,5,2,4,1,9,2,9,4,2],
  [8,4,5,8,5,3,3,5,1],[0,4,5,1,0,5],[8,4,5,8,5,3,9,0,5,0,3,5],[9,4,5],
  [4,11,7,4,9,11,9,10,11],[0,8,3,4,9,7,9,11,7,9,10,11],[1,10,11,1,11,4,1,4,0,7,4,11],
  [3,1,4,3,4,8,1,10,4,7,4,11,10,11,4],[4,11,7,9,11,4,9,2,11,9,1,2],
  [9,7,4,9,11,7,9,1,11,2,11,1,0,8,3],[11,7,4,11,4,2,2,4,0],[11,7,4,11,4,2,8,3,4,3,2,4],
  [2,9,10,2,7,9,2,3,7,7,4,9],[9,10,7,9,7,4,10,2,7,8,7,0,2,0,7],
  [3,7,10,3,10,2,7,4,10,1,10,0,4,0,10],[1,10,2,8,7,4],[4,9,1,4,1,7,7,1,3],
  [4,9,1,4,1,7,0,8,1,8,7,1],[4,0,3,7,4,3],[4,8,7],[9,10,8,10,11,8],
  [3,0,9,3,9,11,11,9,10],[0,1,10,0,10,8,8,10,11],[3,1,10,11,3,10],
  [1,2,11,1,11,9,9,11,8],[3,0,9,3,9,11,1,2,9,2,11,9],[0,2,11,8,0,11],[3,2,11],
  [2,3,8,2,8,10,10,8,9],[9,10,2,0,9,2],[2,3,8,2,8,10,0,1,8,1,10,8],[1,10,2],
  [1,3,8,9,1,8],[0,9,1],[0,3,8],[],
];

// Lookup voxel data; unloaded chunks → 0/AIR (prevents sky-grid artifacts)
// Vertex AO: sample 8 diagonal neighbours
function computeAO(chunk, world, px, py, pz) {
  let blocked = 0;
  for (let dx = -1; dx <= 1; dx += 2)
    for (let dy = -1; dy <= 1; dy += 2)
      for (let dz = -1; dz <= 1; dz += 2) {
        const vx=Math.floor(px+dx*0.45), vy=Math.floor(py+dy*0.45), vz=Math.floor(pz+dz*0.45);
        const lx2=vx-chunk.ox, ly2=vy-chunk.oy, lz2=vz-chunk.oz;
        const t = (lx2>=0&&lx2<CS&&ly2>=0&&ly2<CS&&lz2>=0&&lz2<CS)
          ? chunk.data[lx2+ly2*CS+lz2*CS2]
          : world.getVoxel(vx, vy, vz);
        if (t!==0) blocked++;
      }
  return Math.max(0.25, 1.0 - blocked * 0.09);
}

// Height cache: filled once per buildChunkMesh call.
// Covers chunk.ox-1 … chunk.ox+CS  and  chunk.oz-1 … chunk.oz+CS  (18×18 columns).
// _hOx/_hOz are the minimum wx/wz in the cache (= chunk.ox - 1).
let _hCache = null, _hOx = 0, _hOz = 0;
function _cachedHeight(world, wx, wz) {
  const dx = wx - _hOx, dz = wz - _hOz;   // both in [0, 17]
  const idx = dx * 18 + dz;
  if (_hCache[idx] === -1e9) _hCache[idx] = world._heightAt(wx, wz);
  return _hCache[idx];
}

// SDF density: smooth for natural terrain, binary for city voxels, respects dug-out AIR
function getVoxelData(chunk, world, flx, fly, flz) {
  const lx = Math.floor(flx), ly = Math.floor(fly), lz = Math.floor(flz);
  const wx = chunk.ox + lx, wy = chunk.oy + ly, wz = chunk.oz + lz;
  let type;
  if (lx >= 0 && lx < CS && ly >= 0 && ly < CS && lz >= 0 && lz < CS) {
    type = chunk.data[lx + ly*CS + lz*CS2];
  } else {
    if (wy < 0) return { d: 2.0, type: 1 };
    const nc = world.getChunk(Math.floor(wx/CS), Math.floor(wy/CS), Math.floor(wz/CS));
    if (!nc) {
      // Unloaded neighbour: estimate via SDF to prevent sky-grid artifacts
      const surfH = _cachedHeight(world, wx, wz);
      const d = surfH - wy + 0.5;
      return { d, type: d > 0.5 ? 2 : 0 };
    }
    const nlx = wx - nc.ox, nly = wy - nc.oy, nlz = wz - nc.oz;
    type = nc.data[nlx + nly*CS + nlz*CS2];
  }
  if (wy < 0)     return { d: 2.0, type: 1 };
  // City/structural voxels: binary solid → sharp building edges
  if (type >= 10) return { d: 1.0, type };

  // Natural terrain: continuous SDF — vertex placed at exact float surfaceHeight
  // density = surfH - wy + 0.5  →  isosurface at d=0.5 lies exactly at y=surfH
  const surfH = _cachedHeight(world, wx, wz);
  const sdf   = surfH - wy + 0.5;

  if (type === 0) {
    // Natural above-surface air: use SDF (will be < 0.5) for smooth interpolation.
    // Player-dug air below surface: SDF would say solid, override to -1 (force air).
    return { d: sdf < 0.5 ? sdf : -1.0, type: 0 };
  }
  // Solid natural voxel: full SDF density
  return { d: sdf, type };
}

// Height-based colour for natural voxels
function heightColor(wy) {
  if (wy < 5)  return [0.22, 0.22, 0.22];
  if (wy < 30) return [0.45, 0.45, 0.48];
  if (wy < 55) return [0.38, 0.24, 0.11];
  if (wy < 70) return [0.28, 0.56, 0.17];
  if (wy < 88) return [0.50, 0.50, 0.46];
  return [0.88, 0.93, 0.98];
}

// Per-voxel type colour — gives city structures their proper look
function typeColor(type, py) {
  switch (type) {
    case 10: return [0.22, 0.22, 0.24]; // ROAD  — dark asphalt
    case 11: return [0.64, 0.64, 0.66]; // CONCRETE
    case 12: return [0.68, 0.32, 0.22]; // BRICK
    case 13: return [0.50, 0.56, 0.62]; // METAL
    case 14: return [0.55, 0.78, 0.90]; // GLASS — light blue
    default: return heightColor(py);
  }
}

export function buildChunkMesh(chunk, world) {
  // Initialise 18×18 height cache for this chunk (chunk columns + 1-voxel border)
  _hCache = new Float64Array(18 * 18).fill(-1e9);
  _hOx = chunk.ox - 1;
  _hOz = chunk.oz - 1;

  // Early-exit for fully empty chunks (above surface, pure air)
  // Use SDF: if bottom of chunk is above surface everywhere → skip
  if (chunk.oy > 0) {
    const surfMid = _cachedHeight(world, chunk.ox + 8, chunk.oz + 8);
    if (chunk.oy > surfMid + 2) return { vertices: new Float32Array(0), indices: new Uint32Array(0) };
  }

  // Vertex de-duplication map: quantised key → vertex index
  const vertexMap = new Map();
  const positions  = [];  // x,y,z ...
  const voxColors  = [];  // r,g,b ...
  const normAccum  = [];  // nx,ny,nz ...
  const aoValues   = [];  // per-vertex AO
  const idxs       = [];

  for (let iz = 0; iz < ICS; iz++) { const lz = iz * STEP;
    for (let iy = 0; iy < ICS; iy++) { const ly = iy * STEP;
      for (let ix = 0; ix < ICS; ix++) { const lx = ix * STEP;

        let caseIdx = 0;
        const d    = new Float32Array(8);
        const types= new Uint8Array(8);
        for (let i = 0; i < 8; i++) {
          const [vx, vy, vz] = CV[i];
          const { d: di, type: ti } = getVoxelData(chunk, world, lx+vx, ly+vy, lz+vz);
          d[i] = di; types[i] = ti;
          if (di > 0.5) caseIdx |= (1 << i);
        }

        const tris = TRI_RAW[caseIdx];
        if (!tris || tris.length === 0) continue;

        const edgeVtx = new Array(12).fill(-1);
        const needed  = new Set(tris);

        for (const e of needed) {
          const [a, b] = CE[e];
          if ((d[a] > 0.5) === (d[b] > 0.5)) continue;
          const t = (0.5 - d[a]) / (d[b] - d[a]);
          const [ax, ay, az] = CV[a];
          const [bx, by, bz] = CV[b];
          const px = chunk.ox + lx + ax + t*(bx-ax);
          const py = chunk.oy + ly + ay + t*(by-ay);
          const pz = chunk.oz + lz + az + t*(bz-az);

          const kx = Math.round(px*SUBDIV*2), ky = Math.round(py*SUBDIV*2), kz = Math.round(pz*SUBDIV*2);
          const key = `${kx},${ky},${kz}`;

          if (vertexMap.has(key)) {
            edgeVtx[e] = vertexMap.get(key);
          } else {
            const vi = positions.length / 3;
            vertexMap.set(key, vi);
            edgeVtx[e] = vi;
            // Colour from the SOLID side of the edge
            const solidType = d[a] > 0.5 ? types[a] : types[b];
            positions.push(px, py, pz);
            voxColors.push(...typeColor(solidType, py));
            normAccum.push(0, 0, 0);
            aoValues.push(computeAO(chunk, world, px, py, pz));
          }
        }

        for (let i = 0; i < tris.length; i += 3) {
          const v0 = edgeVtx[tris[i]], v1 = edgeVtx[tris[i+1]], v2 = edgeVtx[tris[i+2]];
          if (v0 < 0 || v1 < 0 || v2 < 0) continue;

          const p0=v0*3, p1=v1*3, p2=v2*3;
          const ax=positions[p1]-positions[p0], ay=positions[p1+1]-positions[p0+1], az=positions[p1+2]-positions[p0+2];
          const bx=positions[p2]-positions[p0], by=positions[p2+1]-positions[p0+1], bz=positions[p2+2]-positions[p0+2];
          let nx=ay*bz-az*by, ny=az*bx-ax*bz, nz=ax*by-ay*bx;
          const nl=Math.sqrt(nx*nx+ny*ny+nz*nz);
          if (nl < 1e-8) continue;
          nx/=nl; ny/=nl; nz/=nl;

          for (const vi of [v0, v1, v2]) {
            normAccum[vi*3]   += nx;
            normAccum[vi*3+1] += ny;
            normAccum[vi*3+2] += nz;
          }
          idxs.push(v0, v1, v2);
        }
      }
    }
  }

  if (idxs.length === 0) return { vertices: new Float32Array(0), indices: new Uint32Array(0) };

  const nv    = positions.length / 3;
  const verts = new Float32Array(nv * 10);
  for (let i = 0; i < nv; i++) {
    const p = i*3;
    let nx=normAccum[p], ny=normAccum[p+1], nz=normAccum[p+2];
    const nl=Math.sqrt(nx*nx+ny*ny+nz*nz);
    if (nl > 1e-9) { nx/=nl; ny/=nl; nz/=nl; }
    const o = i*10;
    verts[o]   = positions[p];   verts[o+1] = positions[p+1]; verts[o+2] = positions[p+2];
    verts[o+3] = nx; verts[o+4] = ny; verts[o+5] = nz;
    verts[o+6] = voxColors[p]; verts[o+7] = voxColors[p+1]; verts[o+8] = voxColors[p+2];
    verts[o+9] = aoValues[i];
  }

  return { vertices: verts, indices: new Uint32Array(idxs) };
}
