// physics.js — Player physics on heightmap terrain + building AABB collision

import { v3 } from './math.js';

const GRAVITY   = -26;
const JUMP_VEL  =  8.5;
const WALK_SPD  =  6;
const RUN_SPD   =  10;
const AIR_ACCEL =  30;
const FRICTION  =  14;
const HW        =  0.28;   // player AABB half-width
const HH        =  1.78;   // player height
const EYE_H     =  1.62;   // camera eye above feet

export class Physics {
  constructor() {
    this.pos      = v3(0, 80, 0);
    this.vel      = v3();
    this.onGround = false;
    this.flyMode  = true;
  }

  setFlyMode(enabled, camera) {
    this.flyMode = enabled;
    if (!enabled) {
      this.pos[0] = camera.pos[0];
      this.pos[1] = camera.pos[1] - EYE_H;
      this.pos[2] = camera.pos[2];
      this.vel[0] = this.vel[1] = this.vel[2] = 0;
      this.onGround = false;
    }
  }

  update(world, input, camera, dt) {
    if (this.flyMode) {
      camera.updateFly(input, dt);
      this.pos[0] = camera.pos[0];
      this.pos[1] = camera.pos[1] - EYE_H;
      this.pos[2] = camera.pos[2];
    } else {
      this._walkUpdate(world, input, camera, dt);
    }
  }

  _walkUpdate(world, input, camera, dt) {
    camera.updateLook(input);

    const yaw  = camera.yaw;
    const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
    const rgtX =  Math.cos(yaw), rgtZ = -Math.sin(yaw);

    const mz = input.axis('KeyS', 'KeyW');
    const mx = input.axis('KeyA', 'KeyD');
    let wx = fwdX*mz + rgtX*mx;
    let wz = fwdZ*mz + rgtZ*mx;
    const l = Math.sqrt(wx*wx + wz*wz);

    const targetSpd = (input.is('ShiftLeft') || input.is('ShiftRight')) ? RUN_SPD : WALK_SPD;

    if (this.onGround) {
      if (l > 0) { wx = wx/l * targetSpd; wz = wz/l * targetSpd; }
      else { wx = 0; wz = 0; }
      const a = Math.min(1, FRICTION * dt);
      this.vel[0] += (wx - this.vel[0]) * a;
      this.vel[2] += (wz - this.vel[2]) * a;
    } else {
      if (l > 0) {
        this.vel[0] += (wx/l) * AIR_ACCEL * dt;
        this.vel[2] += (wz/l) * AIR_ACCEL * dt;
        const hs = Math.sqrt(this.vel[0]**2 + this.vel[2]**2);
        if (hs > targetSpd) { this.vel[0] = this.vel[0]/hs*targetSpd; this.vel[2] = this.vel[2]/hs*targetSpd; }
      }
    }

    if (!this.onGround) this.vel[1] += GRAVITY * dt;
    else                this.vel[1] = Math.max(this.vel[1], 0);

    if (input.is('Space') && this.onGround) { this.vel[1] = JUMP_VEL; this.onGround = false; }

    let [px, py, pz] = this.pos;

    // Horizontal movement: only blocked by buildings (terrain is walked on via floor)
    const nx = px + this.vel[0] * dt;
    if (!this._blockedBuilding(world, nx, py, pz)) px = nx;
    else this.vel[0] = 0;

    const nz = pz + this.vel[2] * dt;
    if (!this._blockedBuilding(world, px, py, nz)) pz = nz;
    else this.vel[2] = 0;

    // Vertical: gravity + heightmap floor
    const ny      = py + this.vel[1] * dt;
    const surfaceY = world.surfaceAt(px, pz);

    this.onGround = false;
    if (ny <= surfaceY) {
      py = surfaceY;
      if (this.vel[1] < 0) this.onGround = true;
      this.vel[1] = 0;
    } else {
      py = ny;
    }

    this.pos[0] = px; this.pos[1] = py; this.pos[2] = pz;
    camera.pos[0] = px;
    camera.pos[1] = py + EYE_H;
    camera.pos[2] = pz;
  }

  _blockedBuilding(world, px, py, pz) {
    return world.insideBuilding(px, py, HW, pz, HH);
  }
}

// Simple heightmap raycast: step along ray, return first point where y < surfaceAt(x,z).
export function raycast(world, origin, dir, maxDist = 14) {
  const STEP = 0.5;
  let t = STEP;
  let prev = null;
  while (t <= maxDist) {
    const x = origin[0] + dir[0] * t;
    const y = origin[1] + dir[1] * t;
    const z = origin[2] + dir[2] * t;
    const surf = world.surfaceAt(x, z);
    if (y < surf) {
      // Binary search for more accurate hit
      let lo = t - STEP, hi = t;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) * 0.5;
        const mx  = origin[0] + dir[0] * mid;
        const my  = origin[1] + dir[1] * mid;
        const mz  = origin[2] + dir[2] * mid;
        if (my < world.surfaceAt(mx, mz)) hi = mid; else lo = mid;
      }
      const hx = origin[0] + dir[0] * hi;
      const hy = origin[1] + dir[1] * hi;
      const hz = origin[2] + dir[2] * hi;
      return { pos: [Math.floor(hx), Math.floor(hy), Math.floor(hz)],
               wpos: [hx, hy, hz], face: [0,1,0], dist: hi };
    }
    t += STEP;
  }
  return null;
}
