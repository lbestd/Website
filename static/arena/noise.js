// noise.js — OpenSimplex2S (2D/3D) + FBM + domain warping
// Ported from KdotJPG/OpenSimplex2 (public domain)

const PRIME_X = 0x5205402B;
const PRIME_Y = 0x598CD327;
const PRIME_Z = 0x5BCC226E;
const HASH_MULTIPLIER = 0x53A3F72DEEC546F5n; // BigInt for 64-bit

// Gradient table for 2D
const GRAD2 = new Float32Array([
   0.38268343236509,  0.923879532511287,
   0.923879532511287, 0.38268343236509,
   0.923879532511287,-0.38268343236509,
   0.38268343236509, -0.923879532511287,
  -0.38268343236509, -0.923879532511287,
  -0.923879532511287,-0.38268343236509,
  -0.923879532511287, 0.38268343236509,
  -0.38268343236509,  0.923879532511287,
]);

// Gradient table for 3D
const GRAD3 = new Float32Array([
  -2.22474487139, -2.22474487139, -1.0,
  -2.22474487139, -2.22474487139,  1.0,
  -2.22474487139, -1.0, -2.22474487139,
  -2.22474487139, -1.0,  2.22474487139,
  -2.22474487139,  1.0, -2.22474487139,
  -2.22474487139,  1.0,  2.22474487139,
  -2.22474487139,  2.22474487139, -1.0,
  -2.22474487139,  2.22474487139,  1.0,
  -1.0, -2.22474487139, -2.22474487139,
  -1.0, -2.22474487139,  2.22474487139,
  -1.0,  2.22474487139, -2.22474487139,
  -1.0,  2.22474487139,  2.22474487139,
   1.0, -2.22474487139, -2.22474487139,
   1.0, -2.22474487139,  2.22474487139,
   1.0,  2.22474487139, -2.22474487139,
   1.0,  2.22474487139,  2.22474487139,
   2.22474487139, -2.22474487139, -1.0,
   2.22474487139, -2.22474487139,  1.0,
   2.22474487139, -1.0, -2.22474487139,
   2.22474487139, -1.0,  2.22474487139,
   2.22474487139,  1.0, -2.22474487139,
   2.22474487139,  1.0,  2.22474487139,
   2.22474487139,  2.22474487139, -1.0,
   2.22474487139,  2.22474487139,  1.0,
]);
const N_GRADS_2D = 8;
const N_GRADS_3D = 24;

// Permutation table
function buildPerm(seed) {
  const perm = new Uint8Array(2048);
  // Simple LCG to fill permutation
  let s = (seed ^ 0x12345678) >>> 0;
  const tmp = new Uint8Array(256);
  for (let i = 0; i < 256; i++) tmp[i] = i;
  for (let i = 255; i > 0; i--) {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    const j = s % (i + 1);
    [tmp[i], tmp[j]] = [tmp[j], tmp[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = tmp[i & 255];
  return perm;
}

// Simpler approach: use a hash-based gradient lookup
function hash2D(perm, xsb, ysb) {
  return perm[(perm[xsb & 255] + ysb) & 255] % N_GRADS_2D;
}
function hash3D(perm, xsb, ysb, zsb) {
  return perm[(perm[(perm[xsb & 255] + ysb) & 255] + zsb) & 255] % N_GRADS_3D;
}

export class Noise {
  constructor(seed = 12345) {
    this.perm = buildPerm(seed);
  }

  // 2D simplex-style noise, returns [-1, 1]
  sample2D(x, y) {
    const perm = this.perm;
    const F = 0.366025403784439;  // (sqrt(3)-1)/2
    const G = 0.211324865405187;  // (3-sqrt(3))/6

    const s = (x + y) * F;
    const xs = x + s, ys = y + s;
    const xsb = Math.floor(xs), ysb = Math.floor(ys);
    const xsi = xs - xsb, ysi = ys - ysb;

    const t = (xsi + ysi) * G;
    const x0 = x - (xsb - xsb * (-2 * G) - xsb * 0) + t; // simplified

    // Standard 2D simplex
    const xi = x - xsb + (xsb + ysb) * G;
    const yi = y - ysb + (xsb + ysb) * G;

    let n = 0;
    // Contribution from vertex (xsb, ysb)
    let t0 = 0.5 - xi*xi - yi*yi;
    if (t0 > 0) {
      const gi = hash2D(perm, xsb, ysb) * 2;
      t0 *= t0;
      n += t0 * t0 * (GRAD2[gi] * xi + GRAD2[gi+1] * yi);
    }
    // Determine which simplex we're in
    const i1 = xsi >= ysi ? 1 : 0;
    const j1 = xsi < ysi ? 1 : 0;
    const xi1 = xi - i1 + G, yi1 = yi - j1 + G;
    let t1 = 0.5 - xi1*xi1 - yi1*yi1;
    if (t1 > 0) {
      const gi = hash2D(perm, xsb+i1, ysb+j1) * 2;
      t1 *= t1;
      n += t1 * t1 * (GRAD2[gi] * xi1 + GRAD2[gi+1] * yi1);
    }
    const xi2 = xi - 1 + 2*G, yi2 = yi - 1 + 2*G;
    let t2 = 0.5 - xi2*xi2 - yi2*yi2;
    if (t2 > 0) {
      const gi = hash2D(perm, xsb+1, ysb+1) * 2;
      t2 *= t2;
      n += t2 * t2 * (GRAD2[gi] * xi2 + GRAD2[gi+1] * yi2);
    }
    return n * 70; // scale to approx [-1,1]
  }

  // 3D simplex noise, returns [-1, 1]
  sample3D(x, y, z) {
    const perm = this.perm;
    const F3 = 1/3, G3 = 1/6;
    const s = (x + y + z) * F3;
    const i = Math.floor(x+s), j = Math.floor(y+s), k = Math.floor(z+s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);

    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0)      { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
      else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
      else               { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
    } else {
      if (y0 < z0)       { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
      else if (x0 < z0)  { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
      else               { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
    }

    const x1=x0-i1+G3, y1=y0-j1+G3, z1=z0-k1+G3;
    const x2=x0-i2+2*G3, y2=y0-j2+2*G3, z2=z0-k2+2*G3;
    const x3=x0-1+3*G3, y3=y0-1+3*G3, z3=z0-1+3*G3;

    let n = 0;
    const contrib = (xi, yi, zi, ii, ji, ki) => {
      let t = 0.6 - xi*xi - yi*yi - zi*zi;
      if (t <= 0) return 0;
      const gi = hash3D(perm, i+ii, j+ji, k+ki) * 3;
      t *= t;
      return t * t * (GRAD3[gi]*xi + GRAD3[gi+1]*yi + GRAD3[gi+2]*zi);
    };
    n += contrib(x0,y0,z0, 0,0,0);
    n += contrib(x1,y1,z1, i1,j1,k1);
    n += contrib(x2,y2,z2, i2,j2,k2);
    n += contrib(x3,y3,z3, 1,1,1);
    return n * 32;
  }

  // FBM 2D with domain warping
  fbm2D(x, y, { octaves=6, lacunarity=2.0, gain=0.5, warpAmt=0 } = {}) {
    if (warpAmt > 0) {
      // Domain warping: offset input by another fbm sample
      const wx = this.fbm2D(x, y, { octaves: 3, lacunarity, gain, warpAmt: 0 });
      const wy = this.fbm2D(x + 5.2, y + 1.3, { octaves: 3, lacunarity, gain, warpAmt: 0 });
      x += wx * warpAmt;
      y += wy * warpAmt;
    }
    let val = 0, amp = 0.5, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      val += this.sample2D(x * freq, y * freq) * amp;
      max += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return val / max; // [-1, 1]
  }

  // FBM 3D
  fbm3D(x, y, z, { octaves=4, lacunarity=2.0, gain=0.5 } = {}) {
    let val = 0, amp = 0.5, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      val += this.sample3D(x * freq, y * freq, z * freq) * amp;
      max += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return val / max;
  }
}
