// WebGPU Demo — spinning cube (ported from Rust/wgpu, same WGSL shaders)

// ── WGSL ─────────────────────────────────────────────────────────────────────
const WGSL = /* wgsl */`
struct Uniforms {
    mvp   : mat4x4<f32>,   // offset   0, 64 bytes
    model : mat4x4<f32>,   // offset  64, 64 bytes
    time  : vec4<f32>,     // offset 128, 16 bytes  (.x = seconds)
}
@group(0) @binding(0) var<uniform> u : Uniforms;

struct VertIn {
    @location(0) pos   : vec3<f32>,
    @location(1) color : vec3<f32>,
    @location(2) norm  : vec3<f32>,
}
struct VertOut {
    @builtin(position) clip : vec4<f32>,
    @location(0)       col  : vec3<f32>,
    @location(1)       norm : vec3<f32>,
}

@vertex
fn vs_main(v : VertIn) -> VertOut {
    var out : VertOut;
    out.clip = u.mvp   * vec4<f32>(v.pos,  1.0);
    out.norm = (u.model * vec4<f32>(v.norm, 0.0)).xyz;
    out.col  = v.color;
    return out;
}

@fragment
fn fs_main(in : VertOut) -> @location(0) vec4<f32> {
    let light = normalize(vec3<f32>(0.6, 1.0, 0.8));
    let diff  = max(dot(normalize(in.norm), light), 0.0);
    let pulse = 0.5 + 0.5 * sin(u.time.x * 1.2);
    let col   = in.col * (0.25 + diff * (0.75 + pulse * 0.25));
    return vec4<f32>(col, 1.0);
}
`;

// ── Math (column-major mat4, matches glam layout) ─────────────────────────────
const dot3   = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const sub3   = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const cross3 = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm3  = v => { const l = Math.hypot(...v); return [v[0]/l, v[1]/l, v[2]/l]; };

function m4mul(a, b) {
    const c = new Float32Array(16);
    for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += a[k*4+i] * b[j*4+k];
            c[j*4+i] = s;
        }
    return c;
}

// Right-handed perspective, Z in [0, 1] — matches glam::Mat4::perspective_rh
function m4persp(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const r = far / (near - far);
    return new Float32Array([
        f/aspect, 0,  0,  0,
        0,        f,  0,  0,
        0,        0,  r, -1,
        0,        0,  r*near, 0,
    ]);
}

// Right-handed look-at — matches glam::Mat4::look_at_rh
function m4lookat(eye, at, up) {
    const f = norm3(sub3(at, eye));
    const r = norm3(cross3(f, up));
    const u = cross3(r, f);
    return new Float32Array([
        r[0], u[0], -f[0], 0,
        r[1], u[1], -f[1], 0,
        r[2], u[2], -f[2], 0,
        -dot3(r,eye), -dot3(u,eye), dot3(f,eye), 1,
    ]);
}

// Matches glam::Mat4::from_rotation_y / from_rotation_x
function m4rotY(t) {
    const [c, s] = [Math.cos(t), Math.sin(t)];
    return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
}
function m4rotX(t) {
    const [c, s] = [Math.cos(t), Math.sin(t)];
    return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
}

// ── Cube geometry ─────────────────────────────────────────────────────────────
// Each vertex: pos[3] color[3] norm[3] = 9 floats = 36 bytes, stride 36
function makeCube() {
    const faces = [
        { n:[0,0,1],  c:[1.0,0.35,0.1], v:[[-0.5,-0.5,0.5],[0.5,-0.5,0.5],[0.5,0.5,0.5],[-0.5,0.5,0.5]]   },
        { n:[0,0,-1], c:[0.1,0.8,0.9],  v:[[0.5,-0.5,-0.5],[-0.5,-0.5,-0.5],[-0.5,0.5,-0.5],[0.5,0.5,-0.5]] },
        { n:[1,0,0],  c:[0.2,0.9,0.3],  v:[[0.5,-0.5,0.5],[0.5,-0.5,-0.5],[0.5,0.5,-0.5],[0.5,0.5,0.5]]    },
        { n:[-1,0,0], c:[0.9,0.2,0.8],  v:[[-0.5,-0.5,-0.5],[-0.5,-0.5,0.5],[-0.5,0.5,0.5],[-0.5,0.5,-0.5]] },
        { n:[0,1,0],  c:[1.0,0.95,0.2], v:[[-0.5,0.5,0.5],[0.5,0.5,0.5],[0.5,0.5,-0.5],[-0.5,0.5,-0.5]]    },
        { n:[0,-1,0], c:[0.2,0.4,1.0],  v:[[-0.5,-0.5,-0.5],[0.5,-0.5,-0.5],[0.5,-0.5,0.5],[-0.5,-0.5,0.5]] },
    ];
    const vd = [], id = [];
    faces.forEach((f, fi) => {
        const b = fi * 4;
        f.v.forEach(p => vd.push(...p, ...f.c, ...f.n));
        id.push(b,b+1,b+2, b,b+2,b+3);
    });
    return { vertices: new Float32Array(vd), indices: new Uint16Array(id) };
}

// ── Depth texture ─────────────────────────────────────────────────────────────
function makeDepth(device, w, h) {
    return device.createTexture({
        size: [w, h], format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }).createView();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const canvas = document.getElementById('canvas');
    const errEl  = document.getElementById('err');

    function showErr(msg) {
        errEl.textContent = msg;
        errEl.hidden = false;
    }

    if (!navigator.gpu) return showErr('WebGPU не поддерживается. Нужен Chrome 113+ или Edge 113+.');

    // featureLevel:'compatibility' нужен в Chrome 121+ для широкого набора GPU
    const adapter = await navigator.gpu.requestAdapter({ featureLevel: 'compatibility' })
                 ?? await navigator.gpu.requestAdapter();
    if (!adapter) return showErr('WebGPU адаптер не найден. Проверьте chrome://gpu');

    const device  = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    const format  = navigator.gpu.getPreferredCanvasFormat();

    // Pixel-perfect resize
    const resize = () => {
        // Буфер — в физических пикселях; CSS-размер — в логических (viewport)
        // Без style.width/height canvas отображается в буферных пикселях →
        // на devicePixelRatio=2 центр куба оказывается за краем экрана.
        canvas.width        = window.innerWidth  * devicePixelRatio | 0;
        canvas.height       = window.innerHeight * devicePixelRatio | 0;
        canvas.style.width  = window.innerWidth  + 'px';
        canvas.style.height = window.innerHeight + 'px';
    };
    resize();
    window.addEventListener('resize', resize);

    context.configure({ device, format, alphaMode: 'opaque' });

    // Shader
    const shader = device.createShaderModule({ code: WGSL });

    // Geometry
    const cube = makeCube();
    const vbuf = device.createBuffer({ size: cube.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const ibuf = device.createBuffer({ size: cube.indices.byteLength,  usage: GPUBufferUsage.INDEX  | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vbuf, 0, cube.vertices);
    device.queue.writeBuffer(ibuf, 0, cube.indices);

    // Uniform buffer: mvp(64) + model(64) + time_vec4(16) = 144 bytes
    const ubuf     = device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const uniforms = new Float32Array(36);  // 144 / 4

    // Bind group
    const bgl = device.createBindGroupLayout({ entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
    }]});
    const bg = device.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: ubuf } }] });

    // Pipeline
    const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
        vertex: {
            module: shader, entryPoint: 'vs_main',
            buffers: [{ arrayStride: 36, attributes: [
                { shaderLocation: 0, offset:  0, format: 'float32x3' },  // pos
                { shaderLocation: 1, offset: 12, format: 'float32x3' },  // color
                { shaderLocation: 2, offset: 24, format: 'float32x3' },  // norm
            ]}],
        },
        fragment: { module: shader, entryPoint: 'fs_main', targets: [{ format }] },
        primitive:    { topology: 'triangle-list', cullMode: 'back' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });

    // Render loop
    const fpsEl  = document.getElementById('fps');
    const start  = performance.now();
    let frames = 0, fpsLast = start;
    let lastW = 0, lastH = 0;
    let depthView = null;

    // Ловим WebGPU-ошибки устройства (валидация, OOM и т.д.)
    // В compatibility-mode GPUDevice может не реализовывать EventTarget → guard
    try {
        device.addEventListener('uncapturederror', e => {
            showErr('WebGPU device error: ' + e.error.message);
        });
    } catch (_) {}

    function frame() {
        // Recreate depth texture on resize
        if (canvas.width !== lastW || canvas.height !== lastH) {
            lastW = canvas.width; lastH = canvas.height;
            depthView = makeDepth(device, lastW, lastH);
        }

        // FPS counter
        frames++;
        const now = performance.now();
        if (now - fpsLast >= 1000) {
            fpsEl.textContent = frames + ' fps';
            frames = 0; fpsLast = now;
        }

        const t      = (now - start) / 1000;
        const aspect = canvas.width / canvas.height;
        const proj   = m4persp(Math.PI / 4, aspect, 0.1, 100);
        const view   = m4lookat([2.5, 1.8, 2.5], [0,0,0], [0,1,0]);
        const model  = m4mul(m4rotY(t * 0.8), m4rotX(t * 0.3));
        const mvp    = m4mul(m4mul(proj, view), model);

        uniforms.set(mvp,   0);   // bytes   0-63
        uniforms.set(model, 16);  // bytes  64-127
        uniforms[32] = t;         // bytes 128-131 (time.x)
        device.queue.writeBuffer(ubuf, 0, uniforms);

        const colorTex = context.getCurrentTexture().createView();
        const enc      = device.createCommandEncoder();
        const rp       = enc.beginRenderPass({
            colorAttachments: [{ view: colorTex, clearValue: {r:0.03,g:0.03,b:0.06,a:1}, loadOp:'clear', storeOp:'store' }],
            depthStencilAttachment: { view: depthView, depthClearValue:1.0, depthLoadOp:'clear', depthStoreOp:'store' },
        });

        rp.setPipeline(pipeline);
        rp.setBindGroup(0, bg);
        rp.setVertexBuffer(0, vbuf);
        rp.setIndexBuffer(ibuf, 'uint16');
        rp.drawIndexed(36);
        rp.end();

        device.queue.submit([enc.finish()]);
        requestAnimationFrame(frame);
    }

    // Оборачиваем первый вызов чтобы поймать синхронные ошибки
    try { frame(); } catch(e) { showErr('Render error: ' + e); }
}

main();
