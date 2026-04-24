// math.js — Vec3, Mat4 (column-major, WebGPU convention)

// --- Vec3 ---
export function v3(x = 0, y = 0, z = 0) {
  return new Float32Array([x, y, z]);
}

export const V3 = {
  add:   (a, b) => v3(a[0]+b[0], a[1]+b[1], a[2]+b[2]),
  sub:   (a, b) => v3(a[0]-b[0], a[1]-b[1], a[2]-b[2]),
  mul:   (a, b) => v3(a[0]*b[0], a[1]*b[1], a[2]*b[2]),
  scale: (a, s) => v3(a[0]*s, a[1]*s, a[2]*s),
  dot:   (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
  len2:  (a)    => a[0]*a[0] + a[1]*a[1] + a[2]*a[2],
  len:   (a)    => Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]),
  norm:  (a)    => { const l = Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]); return l > 1e-9 ? v3(a[0]/l, a[1]/l, a[2]/l) : v3(); },
  cross: (a, b) => v3(a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]),
  copy:  (a)    => v3(a[0], a[1], a[2]),
  neg:   (a)    => v3(-a[0], -a[1], -a[2]),
  lerp:  (a, b, t) => v3(a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t),
  // in-place add to dst
  addTo: (dst, a) => { dst[0]+=a[0]; dst[1]+=a[1]; dst[2]+=a[2]; },
};

// --- Mat4 (column-major: m[col*4 + row]) ---
export function m4identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export const M4 = {
  identity: m4identity,

  multiply(a, b) {
    const m = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k];
        m[c*4+r] = s;
      }
    return m;
  },

  // WebGPU clip space: z in [0,1]. Reverse-Z: near->1, far->0
  // Pass depthNear=far, depthFar=near for reverse-Z
  perspectiveReverseZ(fovY, aspect, near, far) {
    const f = 1.0 / Math.tan(fovY * 0.5);
    const m = new Float32Array(16);
    m[0]  = f / aspect;
    m[5]  = f;
    // Reverse-Z: map near->1, far->0
    m[10] = near / (far - near);          // was: -far/(far-near)
    m[11] = -1;
    m[14] = near * far / (far - near);    // was: -near*far/(far-near)
    return m;
  },

  lookAt(eye, center, up) {
    const f = V3.norm(V3.sub(center, eye));
    const s = V3.norm(V3.cross(f, up));
    const u = V3.cross(s, f);
    const m = new Float32Array(16);
    // col 0
    m[0] = s[0]; m[1] = u[0]; m[2] = -f[0]; m[3] = 0;
    // col 1
    m[4] = s[1]; m[5] = u[1]; m[6] = -f[1]; m[7] = 0;
    // col 2
    m[8]  = s[2]; m[9]  = u[2]; m[10] = -f[2]; m[11] = 0;
    // col 3 (translation)
    m[12] = -V3.dot(s, eye);
    m[13] = -V3.dot(u, eye);
    m[14] =  V3.dot(f, eye);
    m[15] = 1;
    return m;
  },

  translation(x, y, z) {
    const m = m4identity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  },
};

// --- Frustum culling (6 planes from viewProj) ---
export function extractFrustumPlanes(vp) {
  // planes: [a,b,c,d] where ax+by+cz+d > 0 = inside
  // Gribb/Hartmann method for column-major matrix
  // Each plane = row combination of vp
  // vp[c*4+r] = element at row r, col c
  const planes = [];
  const row = (r) => [vp[r], vp[4+r], vp[8+r], vp[12+r]]; // row r of vp

  const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  // left:   row3 + row0
  // right:  row3 - row0
  // bottom: row3 + row1
  // top:    row3 - row1
  // near:   row2        (reverse-Z: row3 - row2)
  // far:    row3 - row2 (reverse-Z: row2)
  const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2], a[3]+b[3]];
  const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2], a[3]-b[3]];
  planes.push(add(r3, r0));  // left
  planes.push(sub(r3, r0));  // right
  planes.push(add(r3, r1));  // bottom
  planes.push(sub(r3, r1));  // top
  planes.push(r2);           // near  (reverse-Z near = row2)
  planes.push(sub(r3, r2));  // far   (reverse-Z far = row3-row2)
  // normalize
  return planes.map(p => {
    const l = Math.sqrt(p[0]*p[0]+p[1]*p[1]+p[2]*p[2]);
    return l > 0 ? [p[0]/l, p[1]/l, p[2]/l, p[3]/l] : p;
  });
}

// AABB vs frustum: returns false if fully outside any plane
export function aabbInFrustum(planes, minX, minY, minZ, maxX, maxY, maxZ) {
  for (const [a, b, c, d] of planes) {
    // Pick the positive vertex (furthest along plane normal)
    const px = a > 0 ? maxX : minX;
    const py = b > 0 ? maxY : minY;
    const pz = c > 0 ? maxZ : minZ;
    if (a*px + b*py + c*pz + d < 0) return false;
  }
  return true;
}
