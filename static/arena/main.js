// main.js — Game loop, world init, vehicles, grenades, UI

import { Renderer }                 from './renderer.js';
import { World, WorldConfig }       from './world.js';
import { TerrainManager, PATCH_SIZE } from './terrain.js';
import { planCity, buildCityMesh }  from './city.js';
import { Camera }                   from './camera.js';
import { Physics, raycast }         from './physics.js';
import { Input }                    from './input.js';
import { Car, Plane }               from './vehicles.js';

const DEG2RAD   = Math.PI / 180;
const SEED      = 0xDEAD_BEEF | 0;
const SPAWN_WX  = 600;       // world-space spawn X
const SPAWN_WZ  = 600;       // world-space spawn Z
const CITY_OX   = 420;       // city origin X (≈ 2 PATCH_SIZE west of spawn)
const CITY_OZ   = 420;       // city origin Z

const _sd = [-0.4, -0.9, -0.3];
const _sl = Math.sqrt(_sd.reduce((s,v)=>s+v*v,0));
const SUN_DIR = new Float32Array(_sd.map(v=>v/_sl));

const settings = {
  mountainPct : 40,
  plainHeight : 50,
  mountainMax : 100,
  fogDensity  : 0.005,
  flyMode     : true,
};

// ── Worker pool ───────────────────────────────────────────────────────────────
class WorkerPool {
  constructor(n = Math.min(navigator.hardwareConcurrency || 4, 8)) {
    this.workers = [];
    this.idle    = [];
    this.queue   = [];
    this.pending = new Map();
    for (let i = 0; i < n; i++) {
      const w = new Worker('/static/arena/worker.js', { type: 'module' });
      w.onmessage = e => this._done(w, e.data);
      w.onerror   = e => console.error('Worker error:', e);
      this.workers.push(w); this.idle.push(w);
    }
  }
  generate(px, pz, seed, cfg) {
    return new Promise(resolve => {
      const job = { px, pz, seed, cfg, resolve };
      if (this.idle.length) this._run(this.idle.pop(), job);
      else this.queue.push(job);
    });
  }
  _run(w, job) {
    this.pending.set(w, job.resolve);
    w.postMessage({ px: job.px, pz: job.pz, seed: job.seed, cfg: job.cfg });
  }
  _done(w, data) {
    const resolve = this.pending.get(w);
    this.pending.delete(w);
    resolve(data);
    if (this.queue.length) this._run(w, this.queue.shift());
    else this.idle.push(w);
  }
}

// ── Grenade ───────────────────────────────────────────────────────────────────
class Grenade {
  constructor(pos, vel) {
    this.pos  = [...pos];
    this.vel  = [...vel];
    this.fuse = 2.8;
    this.dead = false;
  }
  update(world, dt) {
    if (this.dead) return false;
    this.vel[1] -= 22 * dt;
    this.pos[0] += this.vel[0] * dt;
    this.pos[1] += this.vel[1] * dt;
    this.pos[2] += this.vel[2] * dt;
    if (this.pos[1] < world.surfaceAt(this.pos[0], this.pos[2])) {
      this.dead = true; return true;
    }
    this.fuse -= dt;
    if (this.fuse <= 0) { this.dead = true; return true; }
    return false;
  }
}

async function main() {
  const canvas  = document.getElementById('c');
  const fpsEl   = document.getElementById('fps');
  const posEl   = document.getElementById('pos');
  const dcEl    = document.getElementById('dc');
  const errEl   = document.getElementById('err');
  const loadEl  = document.getElementById('loading');
  const hint    = document.getElementById('hint');
  const escMenu = document.getElementById('esc-menu');

  canvas.width  = window.innerWidth  * devicePixelRatio | 0;
  canvas.height = window.innerHeight * devicePixelRatio | 0;

  let renderer, world, camera, input, physics, terrain;
  let vehicles = [], activeVehicle = null, grenades = [];
  let shakeAmt = 0, flashAmt = 0;
  const pool = new WorkerPool();

  // ── UI ────────────────────────────────────────────────────────────────────
  const bind = (id, key, transform) => {
    const el = document.getElementById(id);
    const sp = document.getElementById(id + '-val');
    el.value = settings[key];
    if (sp) sp.textContent = el.value;
    el.addEventListener('input', () => {
      settings[key] = transform ? transform(+el.value) : +el.value;
      if (sp) sp.textContent = el.value;
    });
  };
  bind('sl-mtn',   'mountainPct');
  bind('sl-plain', 'plainHeight');
  bind('sl-mh',    'mountainMax');
  bind('sl-fog',   'fogDensity', v => v / 1000);
  document.getElementById('sl-fog').value = Math.round(settings.fogDensity * 1000);
  document.getElementById('sl-fog-val').textContent = document.getElementById('sl-fog').value;

  const flyCheck = document.getElementById('ck-fly');
  flyCheck.checked = settings.flyMode;
  flyCheck.addEventListener('change', () => {
    settings.flyMode = flyCheck.checked;
    if (physics && camera) physics.setFlyMode(settings.flyMode, camera);
  });

  document.getElementById('btn-regen').addEventListener('click', async () => {
    escMenu.style.display = 'none'; document.exitPointerLock(); await regen();
  });
  document.getElementById('btn-resume').addEventListener('click', () => {
    escMenu.style.display = 'none'; canvas.requestPointerLock();
  });

  document.addEventListener('keydown', e => {
    if (e.code === 'Escape') {
      escMenu.style.display = escMenu.style.display === 'flex' ? 'none' : 'flex';
      if (escMenu.style.display === 'none') canvas.requestPointerLock();
      else document.exitPointerLock();
    }
    if (e.code === 'KeyF' && document.pointerLockElement === canvas) {
      settings.flyMode = !settings.flyMode;
      flyCheck.checked = settings.flyMode;
      if (physics && camera) physics.setFlyMode(settings.flyMode, camera);
    }
    if (e.code === 'KeyE' && document.pointerLockElement === canvas) {
      if (activeVehicle) exitVehicle(); else tryEnterVehicle();
    }
    if (e.code === 'KeyG' && document.pointerLockElement === canvas && !activeVehicle) {
      throwGrenade();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) hint.style.display = 'none';
  });

  try {
    renderer = new Renderer();
    await renderer.init(canvas);
    camera  = new Camera();
    input   = new Input(canvas);
    physics = new Physics();
    physics.flyMode = settings.flyMode;

    await regen();

    let prev = performance.now(), frames = 0, fpsTimer = 0;

    function loop(now) {
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now; frames++; fpsTimer += dt;

      if (fpsTimer >= 0.5) {
        fpsEl.textContent = `FPS: ${(frames/fpsTimer)|0}`;
        dcEl.textContent  = `DC: ${renderer.drawCalls}  Tri: ${(renderer.totalTri/1000).toFixed(1)}k`;
        frames = 0; fpsTimer = 0;
      }

      const scroll = input.poll();
      if (scroll) camera.fovY = Math.max(40*DEG2RAD, Math.min(110*DEG2RAD, camera.fovY + scroll*0.001));

      if (escMenu.style.display !== 'flex') {
        if (activeVehicle) activeVehicle.update(world, input, camera, dt);
        else physics.update(world, input, camera, dt);
      }

      for (const g of grenades) {
        if (g.update(world, dt)) { shakeAmt = 0.8; flashAmt = 1.0; }
      }
      grenades = grenades.filter(g => !g.dead);

      if (shakeAmt > 0) {
        shakeAmt = Math.max(0, shakeAmt - dt * 5);
        camera.pos[0] += (Math.random()-0.5) * shakeAmt * 0.4;
        camera.pos[1] += (Math.random()-0.5) * shakeAmt * 0.4;
        camera.pos[2] += (Math.random()-0.5) * shakeAmt * 0.4;
      }
      flashAmt = Math.max(0, flashAmt - dt * 4);

      const p = camera.pos;
      posEl.textContent = `${p[0].toFixed(0)}, ${p[1].toFixed(0)}, ${p[2].toFixed(0)}`;
      if (!activeVehicle) {
        const nv = findNearVehicle(p, 5);
        if (nv) posEl.textContent += `  [E] ${nv.constructor.name}`;
      } else {
        posEl.textContent += '  [E] Exit  [G] Grenade';
      }

      // Terrain streaming
      terrain.tick(p[0], p[2], pool, SEED, serCfg());

      const fogWithFlash = settings.fogDensity * (1 + flashAmt * 2);
      renderer.frame(terrain, camera.viewProj(canvas.width/canvas.height),
                     SUN_DIR, now/1000, p, fogWithFlash, vehicles);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

  } catch(e) {
    loadEl.style.display = 'none';
    errEl.style.display  = 'flex';
    errEl.querySelector('.msg').textContent = e.message;
    console.error(e);
  }

  canvas.addEventListener('mousedown', e => {
    if (e.button === 0 && document.pointerLockElement === canvas) {
      const fwd = camera.forward();
      const hit = raycast(world, camera.pos, fwd, 14);
      if (hit) { shakeAmt = Math.max(shakeAmt, 0.15); flashAmt = Math.max(flashAmt, 0.3); }
    }
  });

  function throwGrenade() {
    const fwd = camera.forward();
    const spd = 22;
    grenades.push(new Grenade(
      [camera.pos[0]+fwd[0]*1.5, camera.pos[1]+fwd[1]*1.5-0.3, camera.pos[2]+fwd[2]*1.5],
      [fwd[0]*spd, fwd[1]*spd+5, fwd[2]*spd]
    ));
  }

  function findNearVehicle(pos, d) {
    for (const v of vehicles) {
      const dx=v.pos[0]-pos[0], dy=v.pos[1]-pos[1], dz=v.pos[2]-pos[2];
      if (dx*dx+dy*dy+dz*dz < d*d) return v;
    }
    return null;
  }

  function tryEnterVehicle()  { const v=findNearVehicle(camera.pos,6); if(v){activeVehicle=v;v.occupied=true;} }
  function exitVehicle()       {
    if (!activeVehicle) return;
    camera.pos[0]=activeVehicle.pos[0]+4; camera.pos[1]=activeVehicle.pos[1]+4; camera.pos[2]=activeVehicle.pos[2];
    if (physics) { physics.pos[0]=camera.pos[0]; physics.pos[1]=camera.pos[1]; physics.pos[2]=camera.pos[2]; physics.vel[0]=physics.vel[1]=physics.vel[2]=0; }
    activeVehicle.occupied=false; activeVehicle=null;
  }

  function serCfg() {
    return { mountainPct: settings.mountainPct, plainHeight: settings.plainHeight, mountainMax: settings.mountainMax };
  }

  // ── World regen ───────────────────────────────────────────────────────────
  async function regen() {
    if (terrain) terrain.destroy();
    vehicles = []; activeVehicle = null; grenades = [];

    loadEl.textContent = 'Generating world...';
    loadEl.style.display = 'flex';

    const cfg = new WorldConfig({
      mountainPct: settings.mountainPct,
      plainHeight:  settings.plainHeight,
      mountainMax:  settings.mountainMax,
    });
    world   = new World(SEED, cfg);
    terrain = new TerrainManager(5);

    // Initial patch load: generate first ring synchronously via workers
    const promises = [];
    const cpx = Math.floor(SPAWN_WX / PATCH_SIZE);
    const cpz = Math.floor(SPAWN_WZ / PATCH_SIZE);
    const r = 4;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        promises.push(pool.generate(cpx+dx, cpz+dz, SEED, serCfg()).then(data => {
          terrain.patches.set(`${data.px},${data.pz}`, {
            px: data.px, pz: data.pz,
            ox: data.px * PATCH_SIZE, oz: data.pz * PATCH_SIZE,
            vb: null, ib: null, indexCount: 0,
            yMin: data.yMin, yMax: data.yMax,
            vertices: data.vertices, indices: data.indices,
          });
        }));
      }
    }
    let done = 0;
    for (const p of promises) {
      await p;
      loadEl.textContent = `Generating terrain... ${Math.round(++done/promises.length*100)}%  (${pool.workers.length} cores)`;
    }

    // Upload all patches to GPU
    for (const p of terrain.patches.values()) renderer.uploadTerrainPatch(p);

    // City
    loadEl.textContent = 'Building city...';
    await new Promise(r => setTimeout(r, 0));
    const buildings = planCity(world, CITY_OX, CITY_OZ, 8, 8);
    world.buildings = buildings;
    const { vertices: cv, indices: ci } = buildCityMesh(buildings);
    renderer.uploadCityMesh(cv, ci);

    // Spawn
    const spawnY = world.surfaceAt(SPAWN_WX, SPAWN_WZ);
    camera.pos = [SPAWN_WX, spawnY + 6, SPAWN_WZ];
    if (physics) {
      physics.pos[0] = SPAWN_WX; physics.pos[1] = spawnY + 2; physics.pos[2] = SPAWN_WZ;
      physics.vel[0] = physics.vel[1] = physics.vel[2] = 0;
      physics.flyMode = settings.flyMode;
    }

    // Vehicles
    const carX = SPAWN_WX + 30, carZ = SPAWN_WZ + 10;
    const car = new Car(carX, world.surfaceAt(carX, carZ) + 2, carZ);
    renderer.buildVehicleMesh(car);
    vehicles.push(car);

    const plX = SPAWN_WX + 70, plZ = SPAWN_WZ + 30;
    const plane = new Plane(plX, world.surfaceAt(plX, plZ) + 6, plZ);
    renderer.buildVehicleMesh(plane);
    vehicles.push(plane);

    loadEl.style.display = 'none';
  }
}

main();
