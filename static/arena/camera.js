// camera.js — First-person camera (fly mode + physics look-only mode)

import { v3, V3, M4 } from './math.js';

const DEG2RAD = Math.PI / 180;
const PI2     = Math.PI * 2;

export class Camera {
  constructor() {
    this.pos   = v3(128, 80, 128);
    this.yaw   = 0;
    this.pitch = 0;

    this.fovY        = 80 * DEG2RAD;
    this.near        = 0.05;
    this.far         = 2000;
    this.sensitivity = 0.0015;
    this.flySpeed    = 20;
    this.flySpeedFast= 80;
  }

  look(dx, dy) {
    this.yaw   = (this.yaw + dx * this.sensitivity) % PI2;
    this.pitch = Math.max(-89*DEG2RAD, Math.min(89*DEG2RAD,
                   this.pitch - dy * this.sensitivity));
  }

  // Mouse look only — used by physics mode
  updateLook(input) {
    this.look(input.dx, input.dy);
  }

  forward() {
    const cy=Math.cos(this.yaw), sy=Math.sin(this.yaw);
    const cp=Math.cos(this.pitch), sp=Math.sin(this.pitch);
    return v3(-sy*cp, sp, -cy*cp);
  }

  right() { return v3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  up()    { return v3(0, 1, 0); }

  // Fly mode: move + look
  updateFly(input, dt) {
    const speed = input.is('ShiftLeft')||input.is('ShiftRight')
      ? this.flySpeedFast : this.flySpeed;

    const fwd = this.forward(), rgt = this.right(), upv = this.up();
    const mx  = input.axis('KeyA', 'KeyD');
    const mz  = input.axis('KeyS', 'KeyW');
    const my  = input.axis('KeyQ', 'KeyE')
              + (input.is('Space') ? 1 : 0)
              - (input.is('ControlLeft') ? 1 : 0);

    const vel = V3.add(V3.add(V3.scale(fwd,mz), V3.scale(rgt,mx)), V3.scale(upv,my));
    const l   = V3.len(vel);
    if (l > 0) V3.addTo(this.pos, V3.scale(vel, speed*dt/l));

    this.look(input.dx, input.dy);
  }

  viewMatrix() {
    return M4.lookAt(this.pos, V3.add(this.pos, this.forward()), this.up());
  }
  projMatrix(aspect) {
    return M4.perspectiveReverseZ(this.fovY, aspect, this.near, this.far);
  }
  viewProj(aspect) {
    return M4.multiply(this.projMatrix(aspect), this.viewMatrix());
  }
}
