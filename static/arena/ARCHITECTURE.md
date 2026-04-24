# Arena — Game Architecture

## Stack

- **Rendering**: WebGPU (reverse-Z depth, ACES tone mapping, Blinn-Phong + hemisphere ambient)
- **Terrain**: Heightmap mesh (patch-based streaming, procedural material shader)
- **City**: Box-primitive geometry, window pattern in fragment shader
- **Physics**: Heightmap floor + building AABB collision
- **Threading**: Web Worker pool for parallel terrain patch generation

---

## File Map

```
main.js       — game loop, world regen, vehicles, grenades, UI
renderer.js   — WebGPU pipelines: terrain + city + vehicles + sky
world.js      — heightmap (World._heightAt) + city AABB list for physics
terrain.js    — patch mesh generation + TerrainManager streaming
city.js       — city building layout (planCity) + box mesh (buildCityMesh)
worker.js     — off-thread terrain patch generation
shaders.js    — WGSL: terrain (procedural), city (windows), sky, vehicles, highlight
vehicles.js   — Car (spring suspension) + Plane (aerodynamics)
camera.js     — first-person camera, fly mode
physics.js    — player physics (heightmap floor), DDA-style terrain raycast
input.js      — keyboard/mouse input, scroll
noise.js      — Perlin/FBM noise
math.js       — Vec3, Mat4, frustum culling
```

---

## Threading Model

```
Main thread
  ├── Game loop (physics, input, vehicle update)
  ├── Renderer (WebGPU command encoding, GPU upload)
  └── WorkerPool (N cores)
        ├── Worker 0 ─── generatePatch(px, pz, heightAt) → {vertices, indices, yMin, yMax}
        ├── Worker 1 ─── ...
        └── Worker N ─── ...

TerrainManager.tick() requests patches closest-first.
Main thread receives transferable Float32Array/Uint32Array.
Renderer.uploadTerrainPatch() uploads to GPU on next frame.
```

---

## Terrain

```
PATCH_SIZE = 128  world units per patch
PATCH_RES  = 64   quads per side  →  vertex spacing = 2 units
Vertex: pos(3f) + normal(3f) = 6 floats, stride = 24 bytes
Normals: central finite differences (eps = step = 2 units)
AABB: [ox, yMin, oz] → [ox+128, yMax, oz+128]  (frustum cull per patch)

Height generation (World._heightAt):
  biome blend → plains FBM or mountain warp-FBM → float surface height
  No Math.floor → smooth continuous SDF gradient

TerrainManager (radius = 5):
  tick() unloads patches beyond radius+1, requests missing ones via WorkerPool
  Closest-ring-first ordering → center loads before horizon
```

---

## City

```
planCity(world, ox, oz, bW=8, bD=8):
  ROAD_W=14, BLOCK=30, STRIDE=44
  Each block → 1 building AABB {x,y,z,w,h,d,r,g,b}
  baseY = max terrain height in footprint  (flat city floor)
  Random: floors (2–14), margin, material (brick / concrete / metal)
  Tall buildings get setback crown + optional rooftop antenna

buildCityMesh(buildings):
  6-face box per building → single Float32Array/Uint32Array
  Vertex: pos(3f) + normal(3f) + color(3f) = 9 floats, stride = 36 bytes
  One draw call for entire city

City shader (CITY_SHADER):
  Window grid: fract(wallU*0.5) × fract(wallV/3.0)
  Random lit/dark per cell via fract(sin(cellX*127.1 + cellY*311.7)*43758.5)
  No texture files needed
```

---

## Terrain Shader (procedural material)

```
TERRAIN_SHADER — vertex: pos(3f)+normal(3f), stride=24
Multi-scale value noise (fbm × 3 scales):
  ~2 m grain:   fine surface variation
  ~8 m patches: medium soil/vegetation variation
  ~40 m zones:  large-scale brightness (cloud shadow simulation)

Material blending:
  slope = 1 - |N.y|   (0=flat, 1=vertical)
  flat  →  grass (low) → sand (beach, h<48)
  slope →  dirt (mid) → rock (steep)
  high  →  snow (h>82, flat areas)
```

---

## Rendering Pipeline

```
Uniform buffer (112 bytes):
  viewProj(mat4) + lightDir(vec3) + time(f32)
  + camPos(vec3) + fogDensity(f32)
  + skyColor(vec3) + pad(f32)

Pipelines:
  skyPipeline     — fullscreen triangle, Rayleigh+Mie+clouds
  terrainPipeline — heightmap patches, back-face cull, depth write
  cityPipeline    — box buildings, back-face cull, depth write
  vehPipeline     — vehicles (CPU transform each frame)
  hlPipeline      — highlight wireframe (line-list)

Depth: depth32float, reverse-Z (depthClear=0.0, compare=greater)
Tone mapping: ACES filmic + gamma(2.2)
Fog: exponential-squared + height fog layer
```

---

## Physics

```
Player AABB: 0.28×1.78 m, eye at 1.62 m
Fly mode (F): free-camera, no collision
Walk mode:
  Horizontal: blocked only by building AABBs (world.insideBuilding)
  Vertical: floor = world.surfaceAt(x,z)  (heightmap — no voxels needed)
  Gravity -26 m/s², jump 8.5 m/s
Raycast: step-based terrain intersection (0.5 m steps + 8-step binary search)
```

---

## Controls

| Key | Action |
|-----|--------|
| WASD | Move / drive / fly |
| Mouse | Look / pitch-roll (vehicle) |
| Space | Jump / brake (car) |
| Shift | Sprint / throttle up (plane) |
| Ctrl | Throttle down (plane) |
| F | Toggle fly mode |
| E | Enter / exit vehicle |
| G | Throw grenade |
| LMB | Shoot (visual hit effect) |
| Scroll | FOV adjust |
| Esc | Settings menu |
