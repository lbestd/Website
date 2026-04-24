// vehicles.js — High-polygon Car (spring suspension, spinning/turning wheels) + Plane

import { v3, V3 } from './math.js';

const DEG = Math.PI / 180;

// ── Mesh helpers ───────────────────────────────────────────────────────────────
export function buildBoxMesh(x0,y0,z0, x1,y1,z1, r,g,b) {
  const verts=[], idxs=[];
  const faces = [
    [[0,0,-1], [[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],[x0,y0,z0]]],
    [[0,0, 1], [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]]],
    [[-1,0,0], [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]]],
    [[ 1,0,0], [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]]],
    [[0,-1,0], [[x0,y0,z1],[x0,y0,z0],[x1,y0,z0],[x1,y0,z1]]],
    [[0, 1,0], [[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]]],
  ];
  for (const [[nx,ny,nz], corners] of faces) {
    const base = verts.length / 10;
    for (const [px,py,pz] of corners) verts.push(px,py,pz, nx,ny,nz, r,g,b, 1.0);
    idxs.push(base,base+1,base+2, base,base+2,base+3);
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idxs) };
}

// Cylinder wheel: axis along X, centered at origin
// Tread = dark rubber, hub = silver disc, spokes = silver
function buildWheelMesh(radius, hw, segments = 24) {
  const verts = [], idxs = [];
  const TR=0.12,TG=0.12,TB=0.13;   // tread (rubber)
  const HR=0.60,HG=0.62,HB=0.65;   // hub (silver)
  const SR=0.52,SG=0.52,SB=0.55;   // spokes
  const hubHW   = hw - 0.04;        // hub face inset
  const rimR    = radius * 0.70;    // inner rim radius (sidewall boundary)
  const hubR    = 0.13;             // center hub cylinder radius
  const numSpokes = 6;

  // ── Outer tread surface (cylinder) ──────────────────────────────────────────
  for (let i = 0; i < segments; i++) {
    const a0 = i       * 2*Math.PI / segments;
    const a1 = (i + 1) * 2*Math.PI / segments;
    const y0 = Math.cos(a0)*radius, z0 = Math.sin(a0)*radius;
    const y1 = Math.cos(a1)*radius, z1 = Math.sin(a1)*radius;
    const my = (y0+y1)*0.5, mz = (z0+z1)*0.5;
    const ml = Math.sqrt(my*my + mz*mz);
    const ny = my/ml, nz = mz/ml;
    const base = verts.length / 10;
    verts.push(-hw,y0,z0, 0,ny,nz, TR,TG,TB, 1.0);
    verts.push( hw,y0,z0, 0,ny,nz, TR,TG,TB, 1.0);
    verts.push( hw,y1,z1, 0,ny,nz, TR,TG,TB, 1.0);
    verts.push(-hw,y1,z1, 0,ny,nz, TR,TG,TB, 1.0);
    idxs.push(base,base+1,base+2, base,base+2,base+3);
  }

  // ── Sidewalls (tread edge → rim) ─────────────────────────────────────────────
  for (const [xOuter, xInner, sideSign] of [[-hw,-hubHW,-1],[hubHW,hw,1]]) {
    for (let i = 0; i < segments; i++) {
      const a0 = i       * 2*Math.PI / segments;
      const a1 = (i + 1) * 2*Math.PI / segments;
      const yo0=Math.cos(a0)*radius, zo0=Math.sin(a0)*radius;
      const yo1=Math.cos(a1)*radius, zo1=Math.sin(a1)*radius;
      const yi0=Math.cos(a0)*rimR,   zi0=Math.sin(a0)*rimR;
      const yi1=Math.cos(a1)*rimR,   zi1=Math.sin(a1)*rimR;
      const mx = sideSign * 0.38;
      const my = (yo0+yo1+yi0+yi1)*0.25, mz = (zo0+zo1+zi0+zi1)*0.25;
      const ml = Math.sqrt(my*my+mz*mz);
      const ny = ml > 1e-9 ? my/ml : 0, nz = ml > 1e-9 ? mz/ml : 0;
      const base = verts.length / 10;
      if (sideSign < 0) {
        verts.push(xInner,yi0,zi0, mx,ny,nz, HR,HG,HB, 1.0);
        verts.push(xOuter,yo0,zo0, mx,ny,nz, TR,TG,TB, 1.0);
        verts.push(xOuter,yo1,zo1, mx,ny,nz, TR,TG,TB, 1.0);
        verts.push(xInner,yi1,zi1, mx,ny,nz, HR,HG,HB, 1.0);
      } else {
        verts.push(xOuter,yo0,zo0, mx,ny,nz, TR,TG,TB, 1.0);
        verts.push(xInner,yi0,zi0, mx,ny,nz, HR,HG,HB, 1.0);
        verts.push(xInner,yi1,zi1, mx,ny,nz, HR,HG,HB, 1.0);
        verts.push(xOuter,yo1,zo1, mx,ny,nz, TR,TG,TB, 1.0);
      }
      idxs.push(base,base+1,base+2, base,base+2,base+3);
    }
  }

  // ── Hub disc faces (left & right) ────────────────────────────────────────────
  for (const [side, nx] of [[-1,-1],[1,1]]) {
    const xHub   = side * hubHW;
    const ctr    = verts.length / 10;
    verts.push(xHub,0,0, nx,0,0, HR,HG,HB, 1.0);
    const rimStart = verts.length / 10;
    for (let i = 0; i < segments; i++) {
      const a = i * 2*Math.PI / segments;
      verts.push(xHub, Math.cos(a)*rimR, Math.sin(a)*rimR, nx,0,0, HR,HG,HB, 1.0);
    }
    for (let i = 0; i < segments; i++) {
      const v1 = rimStart + i, v2 = rimStart + (i+1) % segments;
      if (nx > 0) idxs.push(ctr,v1,v2); else idxs.push(ctr,v2,v1);
    }
  }

  // ── Spokes (flat plates from hub centre to rim) ───────────────────────────────
  const sx0 = -hubHW + 0.06, sx1 = hubHW - 0.06;
  for (let i = 0; i < numSpokes; i++) {
    const a  = i * 2*Math.PI / numSpokes;
    const cy = Math.cos(a), cz = Math.sin(a);   // radial direction
    const py = -Math.sin(a), pz = Math.cos(a);  // tangential (perpendicular)
    const sw  = 0.07;   // spoke half-width
    const y00 = cy*hubR + py*sw, z00 = cz*hubR + pz*sw;
    const y01 = cy*hubR - py*sw, z01 = cz*hubR - pz*sw;
    const y10 = cy*rimR + py*sw, z10 = cz*rimR + pz*sw;
    const y11 = cy*rimR - py*sw, z11 = cz*rimR - pz*sw;
    const sny = py, snz = pz; // normal = tangential direction (faces the spoke face)

    // Front face
    let base = verts.length / 10;
    verts.push(sx1,y00,z00, 0,sny,snz, SR,SG,SB, 1.0);
    verts.push(sx1,y01,z01, 0,sny,snz, SR,SG,SB, 1.0);
    verts.push(sx1,y11,z11, 0,sny,snz, SR,SG,SB, 1.0);
    verts.push(sx1,y10,z10, 0,sny,snz, SR,SG,SB, 1.0);
    idxs.push(base,base+1,base+2, base,base+2,base+3);
    // Back face
    base = verts.length / 10;
    verts.push(sx0,y00,z00, 0,-sny,-snz, SR,SG,SB, 1.0);
    verts.push(sx0,y10,z10, 0,-sny,-snz, SR,SG,SB, 1.0);
    verts.push(sx0,y11,z11, 0,-sny,-snz, SR,SG,SB, 1.0);
    verts.push(sx0,y01,z01, 0,-sny,-snz, SR,SG,SB, 1.0);
    idxs.push(base,base+1,base+2, base,base+2,base+3);
  }

  // ── Centre hub cylinder ───────────────────────────────────────────────────────
  const HUB_SEG = 10;
  for (let i = 0; i < HUB_SEG; i++) {
    const a0 = i       * 2*Math.PI / HUB_SEG;
    const a1 = (i + 1) * 2*Math.PI / HUB_SEG;
    const y0h = Math.cos(a0)*hubR, z0h = Math.sin(a0)*hubR;
    const y1h = Math.cos(a1)*hubR, z1h = Math.sin(a1)*hubR;
    const my  = (y0h+y1h)*0.5, mz = (z0h+z1h)*0.5;
    const ml  = Math.sqrt(my*my + mz*mz);
    const base = verts.length / 10;
    verts.push(sx0,y0h,z0h, 0,my/ml,mz/ml, HR,HG,HB, 1.0);
    verts.push(sx1,y0h,z0h, 0,my/ml,mz/ml, HR,HG,HB, 1.0);
    verts.push(sx1,y1h,z1h, 0,my/ml,mz/ml, HR,HG,HB, 1.0);
    verts.push(sx0,y1h,z1h, 0,my/ml,mz/ml, HR,HG,HB, 1.0);
    idxs.push(base,base+1,base+2, base,base+2,base+3);
  }

  return { vertices: new Float32Array(verts), indices: new Uint32Array(idxs) };
}

function mergeMeshes(meshes) {
  let tv = 0, ti = 0;
  for (const m of meshes) { tv += m.vertices.length; ti += m.indices.length; }
  const vertices = new Float32Array(tv);
  const indices  = new Uint32Array(ti);
  let vOff=0, iOff=0, vBase=0;
  for (const m of meshes) {
    vertices.set(m.vertices, vOff);
    for (let i = 0; i < m.indices.length; i++) indices[iOff+i] = m.indices[i] + vBase;
    vBase += m.vertices.length / 10;
    vOff  += m.vertices.length;
    iOff  += m.indices.length;
  }
  return { vertices, indices };
}

// ── Rotation helpers ───────────────────────────────────────────────────────────
function rotX(x,y,z,a) { const c=Math.cos(a),s=Math.sin(a); return [x, c*y-s*z, s*y+c*z]; }
function rotY(x,y,z,a) { const c=Math.cos(a),s=Math.sin(a); return [c*x+s*z, y, -s*x+c*z]; }
function rotZ(x,y,z,a) { const c=Math.cos(a),s=Math.sin(a); return [c*x-s*y, s*x+c*y, z]; }

// Roll → pitch → yaw
function rot3(x,y,z, yaw,pitch,roll) {
  const cr=Math.cos(roll),  sr=Math.sin(roll);
  const cp=Math.cos(pitch), sp=Math.sin(pitch);
  const cy=Math.cos(yaw),   sy=Math.sin(yaw);
  let rx=x,             ry=cr*y-sr*z, rz=sr*y+cr*z;
  let px=cp*rx+sp*rz,   py=ry,        pz=-sp*rx+cp*rz;
  return [cy*px+sy*pz, py, -sy*px+cy*pz];
}

// v3-returning version for compatibility with physics code
function rotVec(x,y,z, yaw,pitch,roll) {
  const [rx,ry,rz] = rot3(x,y,z,yaw,pitch,roll);
  return v3(rx,ry,rz);
}

// Apply uniform yaw/pitch/roll + world position to an entire mesh template
function applyTransform(tpl, pos, yaw, pitch, roll) {
  const src = tpl.vertices, nv = src.length / 10;
  const dst = new Float32Array(src.length);
  for (let i = 0; i < nv; i++) {
    const o = i*10;
    const [px,py,pz] = rot3(src[o],src[o+1],src[o+2], yaw,pitch,roll);
    const [nx,ny,nz] = rot3(src[o+3],src[o+4],src[o+5], yaw,pitch,roll);
    dst[o]  =pos[0]+px; dst[o+1]=pos[1]+py; dst[o+2]=pos[2]+pz;
    dst[o+3]=nx; dst[o+4]=ny; dst[o+5]=nz;
    dst[o+6]=src[o+6]; dst[o+7]=src[o+7]; dst[o+8]=src[o+8]; dst[o+9]=1.0;
  }
  return { vertices: dst, indices: tpl.indices };
}

// Wheel transform: spin(X) → steer(Y) → local offset → car rotation → world pos
function applyWheelTransform(wTpl, carPos, carYaw, carPitch, carRoll,
                              lx, ly, lz, spinAngle, steerAngle) {
  const src = wTpl.vertices, nv = src.length / 10;
  const dst = new Float32Array(src.length);
  for (let i = 0; i < nv; i++) {
    const o = i*10;
    let [px,py,pz] = rotX(src[o],src[o+1],src[o+2], spinAngle);
    let [nx,ny,nz] = rotX(src[o+3],src[o+4],src[o+5], spinAngle);
    if (Math.abs(steerAngle) > 5e-4) {
      [px,py,pz] = rotY(px,py,pz, steerAngle);
      [nx,ny,nz] = rotY(nx,ny,nz, steerAngle);
    }
    px += lx; py += ly; pz += lz;
    const [wpx,wpy,wpz] = rot3(px,py,pz, carYaw,carPitch,carRoll);
    const [wnx,wny,wnz] = rot3(nx,ny,nz, carYaw,carPitch,carRoll);
    dst[o]  =carPos[0]+wpx; dst[o+1]=carPos[1]+wpy; dst[o+2]=carPos[2]+wpz;
    dst[o+3]=wnx; dst[o+4]=wny; dst[o+5]=wnz;
    dst[o+6]=src[o+6]; dst[o+7]=src[o+7]; dst[o+8]=src[o+8]; dst[o+9]=1.0;
  }
  return { vertices: dst, indices: wTpl.indices };
}

// Prop transform: spin around local Z (forward), then car rotation + world pos
function applyPropTransform(pTpl, carPos, carYaw, carPitch, carRoll, propSpin) {
  const src = pTpl.vertices, nv = src.length / 10;
  const dst = new Float32Array(src.length);
  for (let i = 0; i < nv; i++) {
    const o = i*10;
    let [px,py,pz] = rotZ(src[o],src[o+1],src[o+2], propSpin);
    let [nx,ny,nz] = rotZ(src[o+3],src[o+4],src[o+5], propSpin);
    const [wpx,wpy,wpz] = rot3(px,py,pz, carYaw,carPitch,carRoll);
    const [wnx,wny,wnz] = rot3(nx,ny,nz, carYaw,carPitch,carRoll);
    dst[o]  =carPos[0]+wpx; dst[o+1]=carPos[1]+wpy; dst[o+2]=carPos[2]+wpz;
    dst[o+3]=wnx; dst[o+4]=wny; dst[o+5]=wnz;
    dst[o+6]=src[o+6]; dst[o+7]=src[o+7]; dst[o+8]=src[o+8]; dst[o+9]=1.0;
  }
  return { vertices: dst, indices: pTpl.indices };
}

// ─── CAR ──────────────────────────────────────────────────────────────────────
const WHEEL_RADIUS  = 0.45;
const WHEEL_HW      = 0.19;           // wheel half-width
const RIDE_HEIGHT   = 1.0;            // chassis centre above ground at rest
const WHEEL_REST_Y  = WHEEL_RADIUS - RIDE_HEIGHT;  // = -0.55
const WHEEL_BASE    = 3.4;            // front–rear axle distance
const WHEEL_TRACK   = 2.4;           // left–right axle distance
const MAX_SUSP      = 0.32;           // max suspension stroke (each direction)
const SPRING_SEARCH = 1.6;           // how far above attachment to start ray scan
const SPRING_K      = 30;            // spring stiffness  (accel / m)
const SPRING_C      = 7.5;           // damper coefficient (damp on vel[1])
const CHASSIS_ATT   = 6.0;           // pitch/roll attitude spring (1/s)
const LATERAL_GRIP  = 20;            // lateral friction decay rate (1/s)
const CAR_DRIVE_FORCE = 34;
const CAR_BRAKE_FORCE = 65;
const CAR_DRAG        = 1.0;
const CAR_GRAVITY     = -26;
const CAR_STEER_MAX   = 36 * DEG;
const CAR_STEER_SPEED = 2.8;

// Local wheel centre positions at rest (in car space)
const WHEEL_LOCAL = [
  v3(-WHEEL_TRACK/2, WHEEL_REST_Y,  WHEEL_BASE/2),  // FL
  v3( WHEEL_TRACK/2, WHEEL_REST_Y,  WHEEL_BASE/2),  // FR
  v3(-WHEEL_TRACK/2, WHEEL_REST_Y, -WHEEL_BASE/2),  // RL
  v3( WHEEL_TRACK/2, WHEEL_REST_Y, -WHEEL_BASE/2),  // RR
];

export class Car {
  constructor(x, y, z) {
    this.pos   = v3(x, y, z);
    this.vel   = v3();
    this.yaw   = 0; this.pitch = 0; this.roll = 0;
    this.steer     = 0;
    this.wheelSpin = 0;
    this.wheelOffY = [0, 0, 0, 0];  // visual suspension displacement per wheel
    this.occupied  = false;
    this.bodyTemplate  = this._buildBody();
    this.wheelTemplate = buildWheelMesh(WHEEL_RADIUS, WHEEL_HW, 24);
    this.meshTemplate  = this._buildFullMesh(0, [0,0,0,0]);
    this.vb = null; this.ib = null; this.indexCount = 0;
  }

  _buildBody() {
    // Body colours
    const cr=0.78, cg=0.13, cb=0.13;   // crimson body
    const dc=0.52, dg2=0.52, db2=0.55; // dark cabin top
    const sl=0.48, slg=0.48, slb=0.50; // silver (chrome/sills)
    const gr=0.15, gg=0.15, gb=0.17;   // grill dark
    const GL=0.48, GG=0.72, GB=0.90;   // glass blue
    const lh=0.95, lhg=0.95, lhb=0.80; // headlight warm white
    const tl=0.90, tlg=0.08, tlb=0.05; // taillight red
    const bl=0.10, blg=0.10, blb=0.11; // wheel arch black
    const ex=0.38, exg=0.38, exb=0.40; // exhaust

    // ── Chassis / lower body ──────────────────────────────────────────────────
    const flr   = buildBoxMesh(-1.15,-0.55,-2.25, 1.15,-0.46, 2.25, cr,cg,cb);
    const sillL = buildBoxMesh(-1.22,-0.55,-2.10,-1.10, 0.05, 2.10, sl,dg2,db2);
    const sillR = buildBoxMesh( 1.10,-0.55,-2.10, 1.22, 0.05, 2.10, sl,dg2,db2);
    const bodML = buildBoxMesh(-1.10,-0.46,-2.20,-0.78, 0.55, 2.20, cr,cg,cb);
    const bodMR = buildBoxMesh( 0.78,-0.46,-2.20, 1.10, 0.55, 2.20, cr,cg,cb);
    const bodMM = buildBoxMesh(-0.78,-0.46,-2.20, 0.78, 0.58, 2.20, cr,cg,cb);

    // ── Hood (stepped taper toward grille) ────────────────────────────────────
    const hood1 = buildBoxMesh(-1.08, 0.55, 0.60, 1.08, 0.62, 2.22, cr,cg,cb);
    const hood2 = buildBoxMesh(-1.05, 0.58, 1.00, 1.05, 0.72, 2.10, cr,cg,cb);
    const hood3 = buildBoxMesh(-0.95, 0.68, 1.50, 0.95, 0.76, 2.00, cr,cg,cb);
    const hoodE = buildBoxMesh(-0.85, 0.74, 1.90, 0.85, 0.80, 2.20, cr,cg,cb); // front lip

    // ── Trunk / rear deck ────────────────────────────────────────────────────
    const trk1  = buildBoxMesh(-1.08, 0.55,-2.20, 1.08, 0.60,-0.75, cr,cg,cb);
    const trk2  = buildBoxMesh(-1.02, 0.58,-1.90, 1.02, 0.68,-0.78, cr,cg,cb);
    const trk3  = buildBoxMesh(-0.95, 0.65,-1.60, 0.95, 0.72,-0.82, cr,cg,cb);

    // ── Fender bulges ─────────────────────────────────────────────────────────
    const fFL   = buildBoxMesh(-1.22, 0.06, 0.82,-0.88, 0.42, 2.12, cr,cg,cb);
    const fFR   = buildBoxMesh( 0.88, 0.06, 0.82, 1.22, 0.42, 2.12, cr,cg,cb);
    const fRL   = buildBoxMesh(-1.22, 0.06,-2.12,-0.88, 0.38,-0.82, cr,cg,cb);
    const fRR   = buildBoxMesh( 0.88, 0.06,-2.12, 1.22, 0.38,-0.82, cr,cg,cb);

    // Fender top caps
    const fFLt  = buildBoxMesh(-1.18, 0.42, 0.85,-0.90, 0.52, 2.08, cr,cg,cb);
    const fFRt  = buildBoxMesh( 0.90, 0.42, 0.85, 1.18, 0.52, 2.08, cr,cg,cb);
    const fRLt  = buildBoxMesh(-1.18, 0.38,-2.08,-0.90, 0.48,-0.86, cr,cg,cb);
    const fRRt  = buildBoxMesh( 0.90, 0.38,-2.08, 1.18, 0.48,-0.86, cr,cg,cb);

    // ── Wheel arch liners (black) ──────────────────────────────────────────────
    const aFL   = buildBoxMesh(-1.21,-0.05, 0.85,-1.08, 0.42, 2.08, bl,blg,blb);
    const aFR   = buildBoxMesh( 1.08,-0.05, 0.85, 1.21, 0.42, 2.08, bl,blg,blb);
    const aRL   = buildBoxMesh(-1.21,-0.05,-2.08,-1.08, 0.38,-0.86, bl,blg,blb);
    const aRR   = buildBoxMesh( 1.08,-0.05,-2.08, 1.21, 0.38,-0.86, bl,blg,blb);

    // ── Cabin pillars ─────────────────────────────────────────────────────────
    const pAL   = buildBoxMesh(-1.08, 0.55, 0.87,-0.94, 1.52, 1.14, cr,cg,cb);
    const pAR   = buildBoxMesh( 0.94, 0.55, 0.87, 1.08, 1.52, 1.14, cr,cg,cb);
    const pBL   = buildBoxMesh(-1.08, 0.55,-0.38,-0.94, 1.55,-0.14, cr,cg,cb);
    const pBR   = buildBoxMesh( 0.94, 0.55,-0.38, 1.08, 1.55,-0.14, cr,cg,cb);
    const pCL   = buildBoxMesh(-1.08, 0.55,-1.55,-0.94, 1.44,-1.32, cr,cg,cb);
    const pCR   = buildBoxMesh( 0.94, 0.55,-1.55, 1.08, 1.44,-1.32, cr,cg,cb);

    // ── Roof ──────────────────────────────────────────────────────────────────
    const roofL = buildBoxMesh(-1.08, 1.44,-1.48,-0.94, 1.58, 1.12, dc,dg2,db2);
    const roofR = buildBoxMesh( 0.94, 1.44,-1.48, 1.08, 1.58, 1.12, dc,dg2,db2);
    const roofT = buildBoxMesh(-0.94, 1.53,-1.48, 0.94, 1.60, 1.12, dc,dg2,db2);
    const roofF = buildBoxMesh(-1.00, 1.52, 0.88, 1.00, 1.60, 1.14, dc,dg2,db2); // front rail
    const roofR2= buildBoxMesh(-1.00, 1.42,-1.55, 1.00, 1.50,-1.32, dc,dg2,db2); // rear rail

    // ── Glazing ───────────────────────────────────────────────────────────────
    const wshd  = buildBoxMesh(-0.94, 0.68, 0.89, 0.94, 1.53, 1.12, GL,GG,GB);
    const rGls  = buildBoxMesh(-0.94, 0.68,-1.54, 0.94, 1.44,-1.33, GL,GG,GB);
    const wFwL  = buildBoxMesh(-1.08, 0.68,-0.36,-0.94, 1.52, 0.85, GL,GG,GB);
    const wFwR  = buildBoxMesh( 0.94, 0.68,-0.36, 1.08, 1.52, 0.85, GL,GG,GB);
    const wRwL  = buildBoxMesh(-1.08, 0.68,-1.30,-0.94, 1.45,-0.40, GL,GG,GB);
    const wRwR  = buildBoxMesh( 0.94, 0.68,-1.30, 1.08, 1.45,-0.40, GL,GG,GB);

    // ── Bumpers ────────────────────────────────────────────────────────────────
    const bmpF  = buildBoxMesh(-1.10,-0.46, 2.20, 1.10, 0.10, 2.52, sl,dg2,db2);
    const bmpR  = buildBoxMesh(-1.10,-0.46,-2.52, 1.10, 0.10,-2.20, sl,dg2,db2);
    const bmpFU = buildBoxMesh(-0.88, 0.08, 2.22, 0.88, 0.22, 2.48, sl,dg2,db2);
    const bmpRU = buildBoxMesh(-0.88, 0.06,-2.48, 0.88, 0.20,-2.22, sl,dg2,db2);

    // ── Front grill & vents ────────────────────────────────────────────────────
    const grill = buildBoxMesh(-0.72,-0.02, 2.22, 0.72, 0.30, 2.44, gr,gg,gb);
    const grSL  = buildBoxMesh(-1.00,-0.12, 2.22,-0.73, 0.24, 2.44, gr,gg,gb);
    const grSR  = buildBoxMesh( 0.73,-0.12, 2.22, 1.00, 0.24, 2.44, gr,gg,gb);
    const grHB  = buildBoxMesh(-0.68, 0.28, 2.24, 0.68, 0.34, 2.42, sl,dg2,db2); // grille bar

    // ── Lights ─────────────────────────────────────────────────────────────────
    const hlL   = buildBoxMesh(-1.10, 0.18, 2.22,-0.78, 0.44, 2.46, lh,lhg,lhb);
    const hlR   = buildBoxMesh( 0.78, 0.18, 2.22, 1.10, 0.44, 2.46, lh,lhg,lhb);
    const drlL  = buildBoxMesh(-0.76, 0.30, 2.24,-0.60, 0.37, 2.42, lh,lhg,lhb);
    const drlR  = buildBoxMesh( 0.60, 0.30, 2.24, 0.76, 0.37, 2.42, lh,lhg,lhb);
    const tlL   = buildBoxMesh(-1.10, 0.08,-2.46,-0.78, 0.40,-2.22, tl,tlg,tlb);
    const tlR   = buildBoxMesh( 0.78, 0.08,-2.46, 1.10, 0.40,-2.22, tl,tlg,tlb);
    const tlBar = buildBoxMesh(-0.78, 0.30,-2.46, 0.78, 0.36,-2.24, tl,tlg,tlb);

    // ── Rear spoiler ──────────────────────────────────────────────────────────
    const spBase= buildBoxMesh(-1.00,-0.02,-2.28, 1.00, 0.06,-2.18, sl,dg2,db2);
    const spWing= buildBoxMesh(-0.96, 0.38,-2.30, 0.96, 0.60,-2.10, sl,dg2,db2);
    const spEndL= buildBoxMesh(-1.02, 0.36,-2.32,-0.88, 0.62,-2.08, sl,dg2,db2);
    const spEndR= buildBoxMesh( 0.88, 0.36,-2.32, 1.02, 0.62,-2.08, sl,dg2,db2);

    // ── Mirrors ───────────────────────────────────────────────────────────────
    const mirL  = buildBoxMesh(-1.30, 0.92, 0.38,-1.14, 1.12, 0.88, sl,dg2,db2);
    const mirR  = buildBoxMesh( 1.14, 0.92, 0.38, 1.30, 1.12, 0.88, sl,dg2,db2);
    const mirLg = buildBoxMesh(-1.32, 0.94, 0.40,-1.28, 1.10, 0.86, GL,GG,GB);
    const mirRg = buildBoxMesh( 1.28, 0.94, 0.40, 1.32, 1.10, 0.86, GL,GG,GB);

    // ── Exhaust tips ──────────────────────────────────────────────────────────
    const exhL  = buildBoxMesh(-0.68,-0.50,-2.52,-0.42,-0.32,-2.22, ex,exg,exb);
    const exhR  = buildBoxMesh( 0.42,-0.50,-2.52, 0.68,-0.32,-2.22, ex,exg,exb);
    const exhLi = buildBoxMesh(-0.64,-0.48,-2.54,-0.46,-0.34,-2.50, 0.22,0.22,0.22);
    const exhRi = buildBoxMesh( 0.46,-0.48,-2.54, 0.64,-0.34,-2.50, 0.22,0.22,0.22);

    // ── Suspension arms (visible geometry) ───────────────────────────────────
    const suAFL = buildBoxMesh(-1.10,-0.48, 1.55,-0.85,-0.42, 1.85, 0.35,0.35,0.38);
    const suAFR = buildBoxMesh( 0.85,-0.48, 1.55, 1.10,-0.42, 1.85, 0.35,0.35,0.38);
    const suARL = buildBoxMesh(-1.10,-0.48,-1.85,-0.85,-0.42,-1.55, 0.35,0.35,0.38);
    const suARR = buildBoxMesh( 0.85,-0.48,-1.85, 1.10,-0.42,-1.55, 0.35,0.35,0.38);

    return mergeMeshes([
      flr, sillL, sillR, bodML, bodMR, bodMM,
      hood1, hood2, hood3, hoodE,
      trk1, trk2, trk3,
      fFL, fFR, fRL, fRR, fFLt, fFRt, fRLt, fRRt,
      aFL, aFR, aRL, aRR,
      pAL, pAR, pBL, pBR, pCL, pCR,
      roofL, roofR, roofT, roofF, roofR2,
      wshd, rGls, wFwL, wFwR, wRwL, wRwR,
      bmpF, bmpR, bmpFU, bmpRU,
      grill, grSL, grSR, grHB,
      hlL, hlR, drlL, drlR, tlL, tlR, tlBar,
      spBase, spWing, spEndL, spEndR,
      mirL, mirR, mirLg, mirRg,
      exhL, exhR, exhLi, exhRi,
      suAFL, suAFR, suARL, suARR,
    ]);
  }

  _buildFullMesh(spin, offY) {
    const parts = [this.bodyTemplate];
    for (let i = 0; i < 4; i++) {
      const lx = WHEEL_LOCAL[i][0];
      const ly = WHEEL_LOCAL[i][1] + (offY ? offY[i] : 0);
      const lz = WHEEL_LOCAL[i][2];
      parts.push(applyWheelTransform(this.wheelTemplate, [0,0,0], 0,0,0, lx,ly,lz, spin,0));
    }
    return mergeMeshes(parts);
  }

  worldSpaceMesh() {
    const parts = [applyTransform(this.bodyTemplate, this.pos, this.yaw, this.pitch, this.roll)];
    for (let i = 0; i < 4; i++) {
      const lx   = WHEEL_LOCAL[i][0];
      const ly   = WHEEL_LOCAL[i][1] + this.wheelOffY[i];
      const lz   = WHEEL_LOCAL[i][2];
      const steer = i < 2 ? this.steer : 0;
      parts.push(applyWheelTransform(
        this.wheelTemplate, this.pos, this.yaw, this.pitch, this.roll,
        lx, ly, lz, this.wheelSpin, steer
      ));
    }
    return mergeMeshes(parts);
  }

  update(world, input, camera, dt) {
    const fX = Math.sin(this.yaw), fZ = Math.cos(this.yaw);
    const rX = Math.cos(this.yaw), rZ = -Math.sin(this.yaw);

    // ── Steering ──────────────────────────────────────────────────────────────
    const steerTgt = input.axis('KeyA','KeyD') * CAR_STEER_MAX;
    this.steer += (steerTgt - this.steer) * Math.min(1, CAR_STEER_SPEED * dt);

    // ── Per-wheel suspension scan ─────────────────────────────────────────────
    let groundedCount = 0;
    let avgTargetY = 0;
    let frontY=0, rearY=0, frontN=0, rearN=0;
    let leftY=0,  rightY=0, leftN=0, rightN=0;

    for (let i = 0; i < 4; i++) {
      const lp = WHEEL_LOCAL[i];
      // Rotate wheel attachment by yaw only (avoid pitch/roll feedback loop)
      const wr = rotVec(lp[0], lp[1], lp[2], this.yaw, 0, 0);
      const wx = this.pos[0] + wr[0];
      const wz = this.pos[2] + wr[2];
      const searchFrom = this.pos[1] + wr[1] + SPRING_SEARCH;
      const gnd = this._groundAt(world, wx, searchFrom, wz);

      if (gnd !== null) {
        const targetCarY = gnd + RIDE_HEIGHT;
        avgTargetY += targetCarY;
        groundedCount++;
        if (i < 2) { frontY += targetCarY; frontN++; } else { rearY += targetCarY; rearN++; }
        if (i % 2 === 0) { leftY += targetCarY; leftN++; } else { rightY += targetCarY; rightN++; }

        // Visual suspension: how far wheel deviates from neutral position
        const neutralWheelY  = this.pos[1] + WHEEL_REST_Y;
        const groundedWheelY = gnd + WHEEL_RADIUS;
        this.wheelOffY[i] = Math.max(-MAX_SUSP, Math.min(MAX_SUSP, groundedWheelY - neutralWheelY));
      } else {
        // Airborne: let wheel droop down to max extension
        this.wheelOffY[i] = Math.max(-MAX_SUSP, this.wheelOffY[i] - 2.8 * dt);
      }
    }

    if (groundedCount > 0) {
      // ── Chassis height spring ────────────────────────────────────────────────
      const avgTarget = avgTargetY / groundedCount;
      const err = avgTarget - this.pos[1];
      this.vel[1] += (SPRING_K * err - SPRING_C * this.vel[1]) * dt;
      if (err < -0.06) this.vel[1] = Math.min(0, this.vel[1]); // don't fly off bumps

      // ── Chassis pitch from front/rear height ─────────────────────────────────
      if (frontN > 0 && rearN > 0) {
        const tPitch = Math.atan2(rearY/rearN - frontY/frontN, WHEEL_BASE);
        this.pitch += (tPitch - this.pitch) * Math.min(1, CHASSIS_ATT * dt);
      } else {
        this.pitch *= Math.exp(-CHASSIS_ATT * dt);
      }
      // ── Chassis roll from left/right height ──────────────────────────────────
      if (leftN > 0 && rightN > 0) {
        const tRoll = Math.atan2(rightY/rightN - leftY/leftN, WHEEL_TRACK);
        this.roll += (tRoll - this.roll) * Math.min(1, CHASSIS_ATT * dt);
      } else {
        this.roll *= Math.exp(-CHASSIS_ATT * dt);
      }

      // ── Drive ─────────────────────────────────────────────────────────────────
      const throttle = input.axis('KeyS','KeyW');
      this.vel[0] += fX * throttle * CAR_DRIVE_FORCE * dt;
      this.vel[2] += fZ * throttle * CAR_DRIVE_FORCE * dt;

      // ── Brake / handbrake ─────────────────────────────────────────────────────
      if (input.is('Space')) {
        const spd = Math.sqrt(this.vel[0]**2 + this.vel[2]**2);
        if (spd > 0.1) {
          const b = Math.min(spd, CAR_BRAKE_FORCE * dt);
          this.vel[0] -= (this.vel[0]/spd) * b;
          this.vel[2] -= (this.vel[2]/spd) * b;
        }
      }

      // ── Steer → yaw (Ackermann-style) ────────────────────────────────────────
      const spd = Math.sqrt(this.vel[0]**2 + this.vel[2]**2);
      if (spd > 0.3) {
        this.yaw += (spd / WHEEL_BASE) * Math.tan(this.steer) * dt;
      }

      // ── Lateral grip (prevents unrealistic side-sliding) ──────────────────────
      const latVel   = this.vel[0]*rX + this.vel[2]*rZ;
      const latDecay = Math.exp(-LATERAL_GRIP * dt);
      this.vel[0] -= rX * latVel * (1 - latDecay);
      this.vel[2] -= rZ * latVel * (1 - latDecay);

    } else {
      // ── Airborne ──────────────────────────────────────────────────────────────
      this.vel[1] += CAR_GRAVITY * dt;
      this.pitch  *= Math.exp(-2.0 * dt);
      this.roll   *= Math.exp(-2.0 * dt);
    }

    // ── Longitudinal drag ──────────────────────────────────────────────────────
    const drag = Math.exp(-CAR_DRAG * dt);
    this.vel[0] *= drag; this.vel[2] *= drag;

    // ── Integrate position ─────────────────────────────────────────────────────
    this.pos[0] += this.vel[0] * dt;
    this.pos[1] += this.vel[1] * dt;
    this.pos[2] += this.vel[2] * dt;

    // ── Wheel spin from forward speed ─────────────────────────────────────────
    const fwdSpd = this.vel[0]*fX + this.vel[2]*fZ;
    this.wheelSpin += (fwdSpd / WHEEL_RADIUS) * dt;

    // ── Chase camera ──────────────────────────────────────────────────────────
    const back    = rotVec(0, 0, -13, this.yaw, 0, 0);
    camera.pos[0] = this.pos[0] + back[0];
    camera.pos[1] = this.pos[1] + 5.2;
    camera.pos[2] = this.pos[2] + back[2];
    camera.yaw    = this.yaw + Math.PI;
    camera.pitch  = -0.17;
  }

  _groundAt(world, wx, fromY, wz) {
    return world.surfaceAt(wx, wz);
  }
}

// ─── PLANE ─────────────────────────────────────────────────────────────────────
const PLANE_GRAVITY  = -12;
const MAX_THRUST     = 42;
const THROTTLE_RATE  = 0.5;
const WING_AREA      = 18;
const AIR_RHO        = 0.018;
const LIFT_SLOPE     = 6.2;
const STALL_AOA      = 18 * DEG;
const BASE_DRAG      = 0.032;
const INDUCED_K      = 0.08;
const PITCH_RATE     = 2.2;
const ROLL_RATE      = 3.0;
const PITCH_DAMP     = 3.8;
const ROLL_DAMP      = 4.2;
const AUTO_LEVEL     = 0.45;  // auto-level tendency (rad/s per rad of attitude)

export class Plane {
  constructor(x, y, z) {
    this.pos      = v3(x, y, z);
    this.vel      = v3(0, 0, 10);
    this.yaw      = 0; this.pitch = 2*DEG; this.roll = 0;
    this.pitchVel = 0; this.rollVel = 0;
    this.throttle = 0.58;
    this.propSpin = 0;
    this.onGround = false;
    this.occupied = false;
    this.bodyTemplate = this._buildMesh();
    this.propTemplate = this._buildPropeller();
    this.meshTemplate = this._buildFullMesh(0);
    this.vb = null; this.ib = null; this.indexCount = 0;
  }

  _buildMesh() {
    const FS=0.68, FG=0.68, FB=0.72;   // fuselage grey
    const FD=0.62, FD2=0.62, FD3=0.65; // fuselage dark
    const WS=0.66, WG=0.66, WB=0.70;   // wing silver
    const WD=0.60, WD2=0.60, WD3=0.64; // wing dark (ailerons/flaps)
    const GL=0.38, GLG=0.70, GLB=0.90; // canopy glass
    const MT=0.28, MTG=0.28, MTB=0.30; // metal dark (engine cowl)
    const EX=0.22, EXG=0.22, EXB=0.24; // exhaust
    const RD=0.90, RDG=0.12, RDB=0.10; // nav light red
    const GN=0.10, GNG=0.90, GNB=0.10; // nav light green
    const WH=0.90, WHG=0.90, WHB=0.90; // nav light white

    // ── Fuselage sections (stepped, tapered) ─────────────────────────────────
    const fn    = buildBoxMesh(-0.50,-0.50, 4.5,  0.50, 0.50, 5.5, FD,FD2,FD3); // nose cap
    const f1    = buildBoxMesh(-0.68,-0.66, 3.0,  0.68, 0.66, 4.5, FS,FG,FB);
    const f2    = buildBoxMesh(-0.72,-0.70, 0.5,  0.72, 0.70, 3.0, FS,FG,FB);
    const f3    = buildBoxMesh(-0.70,-0.68,-1.5,  0.70, 0.68, 0.5, FS,FG,FB);
    const f4    = buildBoxMesh(-0.58,-0.56,-3.0,  0.58, 0.58,-1.5, FD,FD2,FD3);
    const f5    = buildBoxMesh(-0.38,-0.38,-4.5,  0.38, 0.40,-3.0, FD,FD2,FD3);
    const f6    = buildBoxMesh(-0.22,-0.22,-5.6,  0.22, 0.24,-4.5, FD,FD2,FD3);
    // Belly fairing (bottom bump for gear / internal volume)
    const belly = buildBoxMesh(-0.55,-0.75,-0.5,  0.55,-0.68, 2.5, FD,FD2,FD3);

    // ── Cockpit ───────────────────────────────────────────────────────────────
    const cFrame= buildBoxMesh(-0.60, 0.62, 0.4,  0.60, 1.38, 2.3, FS,FG,FB);
    const canopy= buildBoxMesh(-0.54, 0.68, 0.5,  0.54, 1.32, 2.2, GL,GLG,GLB);
    const cockR = buildBoxMesh(-0.58, 1.30, 0.5,  0.58, 1.40, 2.2, FS,FG,FB); // canopy rail

    // ── Wings (tapered in chord and thickness) ────────────────────────────────
    const wL1   = buildBoxMesh(-2.4,-0.24,-0.5, -0.72, 0.24, 1.6, WS,WG,WB);
    const wL2   = buildBoxMesh(-4.8,-0.20,-0.3, -2.4,  0.20, 1.4, WS,WG,WB);
    const wL3   = buildBoxMesh(-7.0,-0.14,-0.1, -4.8,  0.14, 1.2, WS,WG,WB);
    const wL4   = buildBoxMesh(-7.8,-0.09, 0.0, -7.0,  0.09, 0.9, WS,WG,WB);
    const wR1   = buildBoxMesh( 0.72,-0.24,-0.5,  2.4,  0.24, 1.6, WS,WG,WB);
    const wR2   = buildBoxMesh( 2.4, -0.20,-0.3,  4.8,  0.20, 1.4, WS,WG,WB);
    const wR3   = buildBoxMesh( 4.8, -0.14,-0.1,  7.0,  0.14, 1.2, WS,WG,WB);
    const wR4   = buildBoxMesh( 7.0, -0.09, 0.0,  7.8,  0.09, 0.9, WS,WG,WB);

    // Wing root fillet (blends wing into fuselage)
    const wRFL  = buildBoxMesh(-0.74,-0.22,-0.4, -0.60, 0.22, 1.5, FS,FG,FB);
    const wRFR  = buildBoxMesh( 0.60,-0.22,-0.4,  0.74, 0.22, 1.5, FS,FG,FB);

    // Winglets (vertical tips)
    const wltL  = buildBoxMesh(-7.95,-0.08, 0.0, -7.60, 0.70, 0.7, WD,WD2,WD3);
    const wltR  = buildBoxMesh( 7.60,-0.08, 0.0,  7.95, 0.70, 0.7, WD,WD2,WD3);

    // Ailerons (trailing edge, different colour)
    const ailL  = buildBoxMesh(-7.0,-0.12, 0.9, -2.5, 0.12, 1.6, WD,WD2,WD3);
    const ailR  = buildBoxMesh( 2.5,-0.12, 0.9,  7.0, 0.12, 1.6, WD,WD2,WD3);

    // Flaps (inboard trailing edge)
    const flpL  = buildBoxMesh(-2.4,-0.12, 0.8, -0.74, 0.12, 1.5, WD,WD2,WD3);
    const flpR  = buildBoxMesh( 0.74,-0.12, 0.8,  2.4, 0.12, 1.5, WD,WD2,WD3);

    // ── Horizontal stabilizer & elevator ──────────────────────────────────────
    const stH_L = buildBoxMesh(-3.2,-0.11,-5.0, -0.42, 0.11,-3.0, FD,FD2,FD3);
    const stH_R = buildBoxMesh( 0.42,-0.11,-5.0,  3.2, 0.11,-3.0, FD,FD2,FD3);
    const elvL  = buildBoxMesh(-3.2,-0.09,-5.5, -0.42, 0.09,-5.0, WD,WD2,WD3);
    const elvR  = buildBoxMesh( 0.42,-0.09,-5.5,  3.2, 0.09,-5.0, WD,WD2,WD3);

    // ── Vertical stabilizer & rudder ──────────────────────────────────────────
    const stV_1 = buildBoxMesh(-0.13,-0.12,-5.2, 0.13, 1.60,-3.5, FD,FD2,FD3);
    const stV_2 = buildBoxMesh(-0.11, 1.60,-5.0, 0.11, 2.20,-3.8, FD,FD2,FD3);
    const rudd  = buildBoxMesh(-0.10,-0.10,-5.7, 0.10, 1.55,-5.2, WD,WD2,WD3);

    // ── Engine cowl (nose) ────────────────────────────────────────────────────
    const cwlC  = buildBoxMesh(-0.38,-0.38, 4.5,  0.38, 0.38, 5.0, MT,MTG,MTB);
    const cwlR  = buildBoxMesh(-0.42,-0.08, 4.5, -0.32, 0.08, 5.1, MT,MTG,MTB);
    const cwlL  = buildBoxMesh( 0.32,-0.08, 4.5,  0.42, 0.08, 5.1, MT,MTG,MTB);
    const intake= buildBoxMesh(-0.28,-0.40, 4.6,  0.28,-0.30, 5.0, 0.15,0.15,0.17);

    // ── Exhaust stacks ────────────────────────────────────────────────────────
    const exhL  = buildBoxMesh(-0.42,-0.52, 1.5, -0.22,-0.32, 3.2, EX,EXG,EXB);
    const exhR  = buildBoxMesh( 0.22,-0.52, 1.5,  0.42,-0.32, 3.2, EX,EXG,EXB);

    // ── Landing gear ─────────────────────────────────────────────────────────
    const lgSL  = buildBoxMesh(-0.52,-0.70,-0.2, -0.36, 0.00, 0.0, 0.38,0.38,0.40);
    const lgSR  = buildBoxMesh( 0.36,-0.70,-0.2,  0.52, 0.00, 0.0, 0.38,0.38,0.40);
    const lgWL  = buildBoxMesh(-0.60,-0.92,-0.3, -0.30,-0.68, 0.1, 0.12,0.12,0.13);
    const lgWR  = buildBoxMesh( 0.30,-0.92,-0.3,  0.60,-0.68, 0.1, 0.12,0.12,0.13);
    const nwS   = buildBoxMesh(-0.12,-0.72, 3.9,  0.12, 0.00, 4.2, 0.38,0.38,0.40);
    const nwW   = buildBoxMesh(-0.20,-0.94, 3.85, 0.20,-0.70, 4.2, 0.12,0.12,0.13);

    // ── Antenna & pitot tube ──────────────────────────────────────────────────
    const ant   = buildBoxMesh(-0.02, 0.68,-2.0,  0.02, 1.12,-1.9, 0.38,0.38,0.40);
    const pitot = buildBoxMesh(-0.03,-0.70, 4.9,  0.03,-0.62, 5.6, 0.38,0.38,0.40);

    // ── Navigation lights ─────────────────────────────────────────────────────
    const navL  = buildBoxMesh(-7.90,-0.08, 0.2, -7.55, 0.08, 0.6, RD,RDG,RDB);
    const navR  = buildBoxMesh( 7.55,-0.08, 0.2,  7.90, 0.08, 0.6, GN,GNG,GNB);
    const navT  = buildBoxMesh(-0.10, 2.18,-4.9,  0.10, 2.25,-4.7, WH,WHG,WHB);

    return mergeMeshes([
      fn, f1, f2, f3, f4, f5, f6, belly,
      cFrame, canopy, cockR,
      wL1, wL2, wL3, wL4, wR1, wR2, wR3, wR4,
      wRFL, wRFR, wltL, wltR,
      ailL, ailR, flpL, flpR,
      stH_L, stH_R, elvL, elvR,
      stV_1, stV_2, rudd,
      cwlC, cwlR, cwlL, intake,
      exhL, exhR,
      lgSL, lgSR, lgWL, lgWR, nwS, nwW,
      ant, pitot,
      navL, navR, navT,
    ]);
  }

  _buildPropeller() {
    // 3-blade propeller in the XY plane; spins around Z (forward axis)
    const r=0.18, g=0.18, b=0.20;
    const b1 = buildBoxMesh(-0.07,-2.2, 4.90,  0.07, 0.0, 5.30, r,g,b);
    const b2 = buildBoxMesh(-0.07, 0.0, 4.90,  0.07, 2.2, 5.30, r,g,b);
    // Third blade at -120° (rotated in XY plane):  x direction offset
    const b3 = buildBoxMesh(-1.90,-0.07, 4.90, -0.0, 0.07, 5.30, r,g,b);
    const hub = buildBoxMesh(-0.16,-0.16, 4.88, 0.16, 0.16, 5.10, 0.32,0.32,0.35);
    const spinner = buildBoxMesh(-0.10,-0.10, 5.10, 0.10, 0.10, 5.40, 0.28,0.28,0.30);
    return mergeMeshes([b1, b2, b3, hub, spinner]);
  }

  _buildFullMesh(propSpin) {
    const prop = applyPropTransform(this.propTemplate, [0,0,0], 0,0,0, propSpin);
    return mergeMeshes([this.bodyTemplate, prop]);
  }

  worldSpaceMesh() {
    const body = applyTransform(this.bodyTemplate, this.pos, this.yaw, this.pitch, this.roll);
    const prop = applyPropTransform(this.propTemplate, this.pos, this.yaw, this.pitch, this.roll, this.propSpin);
    return mergeMeshes([body, prop]);
  }

  update(world, input, camera, dt) {
    // ── Throttle ──────────────────────────────────────────────────────────────
    if (input.is('ShiftLeft'))   this.throttle = Math.min(1, this.throttle + THROTTLE_RATE*dt);
    if (input.is('ControlLeft')) this.throttle = Math.max(0, this.throttle - THROTTLE_RATE*dt);

    // ── Propeller spin ────────────────────────────────────────────────────────
    this.propSpin += this.throttle * 30 * dt;

    // ── Control inputs (mouse primary, WASD secondary) ───────────────────────
    const mousePitch = -input.dy * 0.006 / Math.max(0.01, dt);
    const mouseRoll  =  input.dx * 0.005 / Math.max(0.01, dt);
    const keyPitch   =  input.axis('KeyS','KeyW') * PITCH_RATE;
    const keyRoll    =  input.axis('KeyA','KeyD') * ROLL_RATE;

    // Auto-level: gentle tendency to return to wings-level when no input
    const autoP = -this.pitch * AUTO_LEVEL;
    const autoR = -this.roll  * AUTO_LEVEL;

    const pitchTarget = mousePitch + keyPitch + autoP;
    const rollTarget  = mouseRoll  + keyRoll  + autoR;

    this.pitchVel += (pitchTarget - this.pitchVel) * Math.min(1, PITCH_DAMP * dt);
    this.rollVel  += (rollTarget  - this.rollVel)  * Math.min(1, ROLL_DAMP  * dt);

    this.pitch += this.pitchVel * dt;
    this.roll  += this.rollVel  * dt;
    this.pitch  = Math.max(-80*DEG, Math.min(80*DEG, this.pitch));
    this.roll   = Math.max(-85*DEG, Math.min(85*DEG, this.roll));

    // ── Coordinated turn: bank angle drives yaw rate ─────────────────────────
    const spd = V3.len(this.vel);
    this.yaw += Math.tan(this.roll) * spd / 24 * dt;

    // ── Aerodynamic forces ────────────────────────────────────────────────────
    const fwd   = rotVec(0,0,1, this.yaw, this.pitch, this.roll);
    const upVec = rotVec(0,1,0, this.yaw, this.pitch, this.roll);

    let aoa = 0;
    if (spd > 0.5) {
      const vn   = V3.scale(this.vel, 1/spd);
      const fdot = Math.max(-1, Math.min(1, V3.dot(fwd, vn)));
      const udot = Math.max(-1, Math.min(1, V3.dot(upVec, vn)));
      aoa = Math.atan2(udot, fdot);
    }

    const dynQ  = 0.5 * AIR_RHO * spd * spd;
    const clPre = LIFT_SLOPE * aoa;
    const stall = Math.abs(aoa) > STALL_AOA;
    const cl    = stall
      ? LIFT_SLOPE * STALL_AOA * Math.sign(aoa) * Math.max(0, 1 - (Math.abs(aoa) - STALL_AOA)*3)
      : clPre;
    const cd    = BASE_DRAG + INDUCED_K * cl * cl;

    const thrust  = this.throttle * MAX_THRUST;
    const liftMag = cl * dynQ * WING_AREA;
    const dragMag = cd * dynQ * WING_AREA;

    // Lift perpendicular to velocity in up direction
    let lx=0, ly=0, lz=0;
    if (spd > 0.5) {
      const vn   = V3.scale(this.vel, 1/spd);
      const proj = V3.dot(upVec, vn);
      lx = upVec[0] - proj*vn[0];
      ly = upVec[1] - proj*vn[1];
      lz = upVec[2] - proj*vn[2];
      const ll = Math.sqrt(lx*lx + ly*ly + lz*lz);
      if (ll > 1e-6) { lx/=ll; ly/=ll; lz/=ll; }
    } else { lx=upVec[0]; ly=upVec[1]; lz=upVec[2]; }

    const drX = spd > 0.01 ? -this.vel[0]/spd * dragMag : 0;
    const drY = spd > 0.01 ? -this.vel[1]/spd * dragMag : 0;
    const drZ = spd > 0.01 ? -this.vel[2]/spd * dragMag : 0;

    this.vel[0] += (fwd[0]*thrust + lx*liftMag + drX) * dt;
    this.vel[1] += (fwd[1]*thrust + ly*liftMag + drY + PLANE_GRAVITY) * dt;
    this.vel[2] += (fwd[2]*thrust + lz*liftMag + drZ) * dt;

    // ── Ground constraint ─────────────────────────────────────────────────────
    const gnd = this._groundAt(world, this.pos[0], this.pos[1]+2, this.pos[2]);
    if (gnd !== null && this.pos[1] < gnd + 0.9) {
      this.pos[1] = gnd + 0.9;
      if (this.vel[1] < 0) this.vel[1] *= -0.08;
      this.vel[0] *= 0.97; this.vel[2] *= 0.97;
      this.pitch *= 0.85; this.roll  *= 0.85;
      this.pitchVel = 0;   this.rollVel  = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    this.pos[0] += this.vel[0] * dt;
    this.pos[1] += this.vel[1] * dt;
    this.pos[2] += this.vel[2] * dt;

    // ── Chase camera (smooth, following pitch) ────────────────────────────────
    const back    = rotVec(0, 3.8, -17, this.yaw, this.pitch * 0.4, this.roll * 0.3);
    camera.pos[0] = this.pos[0] + back[0];
    camera.pos[1] = this.pos[1] + back[1];
    camera.pos[2] = this.pos[2] + back[2];
    camera.yaw    = this.yaw + Math.PI;
    camera.pitch  = this.pitch * 0.4 - 0.10;
  }

  _groundAt(world, wx, fromY, wz) {
    return world.surfaceAt(wx, wz);
  }
}
