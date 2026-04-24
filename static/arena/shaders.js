// shaders.js — WGSL shaders: terrain, city, sky, vehicles, highlight

// ── Shared uniform block + common functions ───────────────────────────────────
const GLOBALS = /* wgsl */`
struct Globals {
  viewProj   : mat4x4<f32>,
  lightDir   : vec3<f32>,
  time       : f32,
  camPos     : vec3<f32>,
  fogDensity : f32,
  skyColor   : vec3<f32>,
  _pad0      : f32,
};
@group(0) @binding(0) var<uniform> g : Globals;

fn aces(x: vec3<f32>) -> vec3<f32> {
  let a=2.51; let b=0.03; let c=2.43; let d=0.59; let e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), vec3<f32>(0.0), vec3<f32>(1.0));
}
fn gamma(c: vec3<f32>) -> vec3<f32> {
  return pow(max(c, vec3<f32>(0.0)), vec3<f32>(1.0/2.2));
}
fn applyFog(c: vec3<f32>, wpos: vec3<f32>) -> vec3<f32> {
  let hFog = exp(-max(wpos.y, 0.0) * 0.007);
  let fogD = g.fogDensity * (1.0 + hFog * 0.6);
  let dist = length(wpos - g.camPos);
  let fog  = 1.0 - exp2(-fogD * fogD * dist * dist * 1.4427);
  return mix(c, g.skyColor, clamp(fog, 0.0, 1.0));
}
fn doLight(N: vec3<f32>, wpos: vec3<f32>, col: vec3<f32>, specPow: f32, specAmt: f32) -> vec3<f32> {
  let toEye = normalize(g.camPos - wpos);
  var Nn = normalize(N);
  if (dot(Nn, toEye) < 0.0) { Nn = -Nn; }
  let L    = normalize(-g.lightDir);
  let H    = normalize(L + toEye);
  let diff = max(dot(Nn, L), 0.0);
  let spec = pow(max(dot(Nn, H), 0.0), specPow) * specAmt;
  let hemi = 0.5 + 0.5 * Nn.y;
  let amb  = mix(vec3<f32>(0.09,0.07,0.05), vec3<f32>(0.22,0.30,0.43), hemi);
  let sun  = vec3<f32>(1.02, 0.93, 0.76);
  return col * (amb + diff * sun) + spec * sun;
}
`;

// ── Terrain shader ────────────────────────────────────────────────────────────
// Vertex: pos(3f) + normal(3f), stride = 24
// Procedural material: slope+height drive grass/dirt/rock/snow/sand blends
export const TERRAIN_SHADER = /* wgsl */`
${GLOBALS}

fn hash2f(p: vec2<f32>) -> f32 {
  var q = fract(p * vec2<f32>(0.1031, 0.1030));
  q += dot(q, q.yx + 33.33);
  return fract((q.x + q.y) * q.x);
}
fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2f(i),              hash2f(i + vec2<f32>(1,0)), u.x),
             mix(hash2f(i+vec2<f32>(0,1)), hash2f(i+vec2<f32>(1,1)), u.x), u.y);
}
fn fbm(pin: vec2<f32>) -> f32 {
  var v = 0.0; var amp = 0.5; var p = pin;
  v += amp * vnoise(p); p = p * 2.1 + vec2<f32>(1.3, 0.7); amp *= 0.5;
  v += amp * vnoise(p); p = p * 2.1 + vec2<f32>(1.3, 0.7); amp *= 0.5;
  v += amp * vnoise(p); p = p * 2.1 + vec2<f32>(1.3, 0.7); amp *= 0.5;
  v += amp * vnoise(p);
  return v;
}

fn terrainColor(wpos: vec3<f32>, N: vec3<f32>) -> vec3<f32> {
  let h     = wpos.y;
  let slope = 1.0 - abs(N.y);            // 0 = flat, 1 = vertical

  // Multi-scale noise: fine grain, medium patches, large brightness variation
  let n1 = fbm(wpos.xz * 0.50) * 2.0 - 1.0;         // ~2 m grain    [-1, 1]
  let n2 = fbm(wpos.xz * 0.12 + vec2<f32>(5.3, 3.1)); // ~8 m variation [0, 1]
  let n3 = fbm(wpos.xz * 0.025 + vec2<f32>(12.7,8.4));// ~40 m patches  [0, 1]

  let grass = vec3<f32>(0.14 + n1*0.05, 0.38 + n1*0.07 + n2*0.05, 0.08 + n1*0.02);
  let dirt  = vec3<f32>(0.44 + n1*0.07, 0.28 + n1*0.05, 0.14 + n1*0.02);
  let rock  = vec3<f32>(0.40 + n2*0.12, 0.37 + n2*0.10, 0.34 + n2*0.08);
  let snow  = vec3<f32>(0.88 + n1*0.06, 0.92 + n1*0.04, 0.98);
  let sand  = vec3<f32>(0.74 + n1*0.06, 0.63 + n1*0.05, 0.38 + n1*0.02);

  // Slope blending: flat=grass → mid=dirt → steep=rock
  var c = mix(grass, dirt, smoothstep(0.18, 0.45, slope));
  c     = mix(c,    rock,  smoothstep(0.55, 0.82, slope));
  // Altitude: high → snow, low+flat → sand/beach
  c = mix(c, snow, smoothstep(82.0, 94.0, h) * (1.0 - slope * 0.5));
  c = mix(c, sand, smoothstep(52.0, 46.0, h) * (1.0 - slope));
  // Large-scale brightness (simulates cloud shadows + soil variation)
  c *= 0.84 + n3 * 0.32;
  return clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
}

struct VIn  { @location(0) pos: vec3<f32>, @location(1) nor: vec3<f32> }
struct VOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) wpos: vec3<f32>,
  @location(1) nor:  vec3<f32>,
}

@vertex fn vs_terrain(v: VIn) -> VOut {
  return VOut(g.viewProj * vec4<f32>(v.pos, 1.0), v.pos, v.nor);
}
@fragment fn fs_terrain(in: VOut) -> @location(0) vec4<f32> {
  let col = terrainColor(in.wpos, in.nor);
  var c   = doLight(in.nor, in.wpos, col, 32.0, 0.04);
  c = applyFog(c, in.wpos);
  return vec4<f32>(gamma(aces(c)), 1.0);
}
`;

// ── City shader ───────────────────────────────────────────────────────────────
// Vertex: pos(3f) + normal(3f) + color(3f), stride = 36
// Adds procedural window grid on vertical faces (some lit, some dark)
export const CITY_SHADER = /* wgsl */`
${GLOBALS}

fn cityColor(wpos: vec3<f32>, N: vec3<f32>, base: vec3<f32>) -> vec3<f32> {
  // Windows only on vertical faces
  if (abs(N.y) > 0.1) { return base; }

  // Project world pos onto wall plane
  let wallU = select(wpos.x, wpos.z, abs(N.z) > 0.5);
  let wallV = wpos.y;

  // Window grid: 2 m wide, 3 m floor height
  let wu = fract(wallU * 0.5);
  let wv = fract((wallV - 0.5) / 3.0);

  if (wu > 0.10 && wu < 0.90 && wv > 0.22 && wv < 0.86) {
    let cellX = floor(wallU * 0.5);
    let cellY = floor((wallV - 0.5) / 3.0);
    // Pseudo-random lit state per window cell
    let lit = fract(sin(cellX * 127.1 + cellY * 311.7 + 53.2) * 43758.5) > 0.38;
    return select(vec3<f32>(0.04, 0.07, 0.15),   // dark glass
                  vec3<f32>(0.88, 0.76, 0.34),   // warm lit window
                  lit);
  }
  return base;
}

struct CVIn {
  @location(0) pos:   vec3<f32>,
  @location(1) nor:   vec3<f32>,
  @location(2) color: vec3<f32>,
}
struct CVOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) wpos:  vec3<f32>,
  @location(1) nor:   vec3<f32>,
  @location(2) color: vec3<f32>,
}

@vertex fn vs_city(v: CVIn) -> CVOut {
  return CVOut(g.viewProj * vec4<f32>(v.pos, 1.0), v.pos, v.nor, v.color);
}
@fragment fn fs_city(in: CVOut) -> @location(0) vec4<f32> {
  let col = cityColor(in.wpos, in.nor, in.color);
  var c   = doLight(in.nor, in.wpos, col, 64.0, 0.12);
  c = applyFog(c, in.wpos);
  return vec4<f32>(gamma(aces(c)), 1.0);
}
`;

// ── Cinematic sky (Rayleigh + Mie + moving clouds) ────────────────────────────
export const SKY_SHADER = /* wgsl */`
${GLOBALS}

struct SVOut { @builtin(position) clip: vec4<f32>, @location(0) uv: vec2<f32> }

@vertex fn vs_sky(@builtin(vertex_index) vid: u32) -> SVOut {
  var pos = array<vec2<f32>,3>(vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
  let p = pos[vid];
  return SVOut(vec4<f32>(p, 0.0, 1.0), p);
}

fn hash2(p: vec2<f32>) -> f32 {
  var q = fract(p * vec2<f32>(127.1,311.7));
  q += dot(q, q + vec2<f32>(19.19,23.57));
  return fract(q.x * q.y);
}
fn vnoise2(p: vec2<f32>) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f*f*(3.0-2.0*f);
  return mix(mix(hash2(i),            hash2(i+vec2(1.0,0.0)), u.x),
             mix(hash2(i+vec2(0.0,1.0)), hash2(i+vec2(1.0,1.0)), u.x), u.y);
}
fn fbmC(p: vec2<f32>) -> f32 {
  var v=0.0; var a=0.5; var q=p;
  for(var i=0;i<6;i++){ v+=a*vnoise2(q); q=q*2.1+vec2(1.7,9.2); a*=0.5; }
  return v;
}

@fragment fn fs_sky(in: SVOut) -> @location(0) vec4<f32> {
  let dir    = normalize(vec3<f32>(in.uv.x, in.uv.y * 0.55 + 0.05, 1.0));
  let y      = dir.y;
  let sunDir = normalize(-g.lightDir);

  let zenith  = vec3<f32>(0.04, 0.13, 0.37);
  let horizon = vec3<f32>(0.62, 0.79, 0.97);
  let haze    = vec3<f32>(0.90, 0.82, 0.68);
  var sky: vec3<f32>;
  sky = mix(horizon, zenith, sqrt(max(y, 0.0)));
  sky = mix(sky, haze, smoothstep(0.06, 0.0, y));

  let cosT = dot(dir, sunDir);
  let mie  = max(cosT, 0.0);
  sky += vec3<f32>(1.6,1.3,0.9) * pow(mie,  6.0) * 0.35;
  sky += vec3<f32>(1.8,1.5,1.0) * pow(mie, 64.0) * 0.60;
  sky += vec3<f32>(2.0,1.9,1.7) * pow(mie,512.0) * 1.20;
  sky  = mix(sky, vec3<f32>(2.2,2.0,1.8), smoothstep(0.9992, 0.9997, cosT));

  if (y > -0.05) {
    let sc    = g.time * 0.012;
    let cp    = dir.xz / max(y + 0.12, 0.04) * 1.8;
    let cloud = fbmC(cp + vec2<f32>(sc, 0.0));
    let cMask = smoothstep(0.50, 0.66, cloud);
    let cAlpha= cMask * smoothstep(-0.05, 0.15, y);
    let lit   = 0.65 + 0.35 * smoothstep(0.50, 0.62, cloud);
    let cCol  = mix(vec3<f32>(0.68,0.70,0.78), vec3<f32>(0.96,0.97,1.0), lit);
    sky       = mix(sky, cCol, cAlpha * 0.88);
  }
  return vec4<f32>(gamma(aces(sky)), 1.0);
}
`;

// ── Vehicle shader (pos+normal+color+ao) ─────────────────────────────────────
export const VEHICLE_SHADER = /* wgsl */`
${GLOBALS}

struct VIn {
  @location(0) pos:    vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color:  vec3<f32>,
  @location(3) ao:     f32,
}
struct VOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) wpos: vec3<f32>,
  @location(1) nor:  vec3<f32>,
  @location(2) col:  vec3<f32>,
}

@vertex fn vs_veh(v: VIn) -> VOut {
  return VOut(g.viewProj * vec4(v.pos,1.0), v.pos, v.normal, v.color);
}
@fragment fn fs_veh(in: VOut) -> @location(0) vec4<f32> {
  var c = doLight(in.nor, in.wpos, in.col, 80.0, 0.30);
  let dist = length(in.wpos - g.camPos);
  let fog  = 1.0 - exp2(-g.fogDensity * g.fogDensity * dist * dist * 1.4427);
  c = mix(c, g.skyColor, clamp(fog, 0.0, 1.0));
  return vec4<f32>(gamma(aces(c)), 1.0);
}
`;

// ── Highlight wireframe ───────────────────────────────────────────────────────
export const HIGHLIGHT_SHADER = /* wgsl */`
${GLOBALS}
struct HIn  { @location(0) pos: vec3<f32> }
struct HOut { @builtin(position) clip: vec4<f32> }
@vertex   fn vs_hl(v: HIn)  -> HOut { return HOut(g.viewProj * vec4(v.pos, 1.0)); }
@fragment fn fs_hl(in: HOut) -> @location(0) vec4<f32> { return vec4(1.0,1.0,0.2,1.0); }
`;
