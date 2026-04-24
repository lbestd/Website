// renderer.js — WebGPU renderer: terrain + city + vehicles + sky

import { M4, extractFrustumPlanes, aabbInFrustum } from './math.js';
import { TERRAIN_SHADER, CITY_SHADER, SKY_SHADER,
         VEHICLE_SHADER, HIGHLIGHT_SHADER }          from './shaders.js';
import { PATCH_SIZE }                                from './terrain.js';

const UNIFORM_SIZE    = 112;
const TERRAIN_STRIDE  = 24;   // pos(3f) + normal(3f)
const CITY_STRIDE     = 36;   // pos(3f) + normal(3f) + color(3f)
const VEHICLE_STRIDE  = 40;   // pos(3f) + normal(3f) + color(3f) + ao(1f)

export class Renderer {
  constructor() {
    this.device = null; this.context = null; this.canvas = null; this.format = null;
    this.terrainPipeline = null; this.cityPipeline = null;
    this.skyPipeline = null; this.vehPipeline = null; this.hlPipeline = null;
    this.uniformBuffer = null; this.bindGroup0 = null; this.bgl = null;
    this.depthTexture = null; this.depthView = null;
    this.cityVB = null; this.cityIB = null; this.cityIndexCount = 0;
    this.hlVB = null; this.hlTarget = null;
    this.drawCalls = 0; this.totalTri = 0;
  }

  async init(canvas) {
    this.canvas = canvas;
    if (!navigator.gpu) throw new Error('WebGPU not supported');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter found');
    this.device  = await adapter.requestDevice();
    this.context = canvas.getContext('webgpu');
    this.format  = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    this._createUniforms();
    this._createPipelines();
    this._updateDepth();
  }

  _createUniforms() {
    const dev = this.device;
    this.uniformBuffer = dev.createBuffer({
      size: UNIFORM_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bgl = dev.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                  buffer: { type: 'uniform' } }],
    });
    this.bindGroup0 = dev.createBindGroup({
      layout: this.bgl,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  _createPipelines() {
    const dev    = this.device;
    const layout = dev.createPipelineLayout({ bindGroupLayouts: [this.bgl] });
    const depth  = (write, compare) =>
      ({ format: 'depth32float', depthWriteEnabled: write, depthCompare: compare });

    // Terrain: pos(3f) + normal(3f)
    const terrainBufs = [{
      arrayStride: TERRAIN_STRIDE,
      attributes: [
        { shaderLocation: 0, offset:  0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
      ],
    }];
    const terrMod = dev.createShaderModule({ code: TERRAIN_SHADER });
    this.terrainPipeline = dev.createRenderPipeline({
      layout,
      vertex:   { module: terrMod, entryPoint: 'vs_terrain', buffers: terrainBufs },
      fragment: { module: terrMod, entryPoint: 'fs_terrain', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: depth(true, 'greater'),
    });

    // City: pos(3f) + normal(3f) + color(3f)
    const cityBufs = [{
      arrayStride: CITY_STRIDE,
      attributes: [
        { shaderLocation: 0, offset:  0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x3' },
      ],
    }];
    const cityMod = dev.createShaderModule({ code: CITY_SHADER });
    this.cityPipeline = dev.createRenderPipeline({
      layout,
      vertex:   { module: cityMod, entryPoint: 'vs_city', buffers: cityBufs },
      fragment: { module: cityMod, entryPoint: 'fs_city', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: depth(true, 'greater'),
    });

    // Sky
    const skyMod = dev.createShaderModule({ code: SKY_SHADER });
    this.skyPipeline = dev.createRenderPipeline({
      layout,
      vertex:   { module: skyMod, entryPoint: 'vs_sky' },
      fragment: { module: skyMod, entryPoint: 'fs_sky', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depth(false, 'always'),
    });

    // Vehicles: pos(3f) + normal(3f) + color(3f) + ao(1f)
    const vehBufs = [{
      arrayStride: VEHICLE_STRIDE,
      attributes: [
        { shaderLocation: 0, offset:  0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x3' },
        { shaderLocation: 3, offset: 36, format: 'float32'   },
      ],
    }];
    const vehMod = dev.createShaderModule({ code: VEHICLE_SHADER });
    this.vehPipeline = dev.createRenderPipeline({
      layout,
      vertex:   { module: vehMod, entryPoint: 'vs_veh', buffers: vehBufs },
      fragment: { module: vehMod, entryPoint: 'fs_veh', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depth(true, 'greater'),
    });

    // Highlight wireframe
    const hlMod = dev.createShaderModule({ code: HIGHLIGHT_SHADER });
    this.hlPipeline = dev.createRenderPipeline({
      layout,
      vertex: {
        module: hlMod, entryPoint: 'vs_hl',
        buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
      },
      fragment: { module: hlMod, entryPoint: 'fs_hl', targets: [{ format: this.format }] },
      primitive: { topology: 'line-list', cullMode: 'none' },
      depthStencil: depth(false, 'greater'),
    });
  }

  _updateDepth() {
    if (this.depthTexture) this.depthTexture.destroy();
    this.depthTexture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthView = this.depthTexture.createView();
  }

  resize() {
    const w = this.canvas.clientWidth  * devicePixelRatio | 0;
    const h = this.canvas.clientHeight * devicePixelRatio | 0;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this._updateDepth();
    }
  }

  uploadUniforms(viewProj, lightDir, time, camPos, fogDensity) {
    const buf = new Float32Array(28);
    buf.set(viewProj, 0);
    buf.set(lightDir, 16); buf[19] = time;
    buf.set(camPos,  20); buf[23] = fogDensity;
    buf[24] = 0.75; buf[25] = 0.85; buf[26] = 0.97; buf[27] = 0; // skyColor approx
    this.device.queue.writeBuffer(this.uniformBuffer, 0, buf);
  }

  // Upload terrain patch: creates VB/IB from patch.vertices/indices, clears them.
  uploadTerrainPatch(patch) {
    if (!patch.vertices || patch.vb) return;
    const dev = this.device;
    patch.indexCount = patch.indices.length;
    patch.vb = dev.createBuffer({
      size: patch.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(patch.vb.getMappedRange()).set(patch.vertices);
    patch.vb.unmap();
    patch.ib = dev.createBuffer({
      size: patch.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(patch.ib.getMappedRange()).set(patch.indices);
    patch.ib.unmap();
    patch.vertices = null;
    patch.indices  = null;
  }

  // Upload (or re-upload) city mesh — call once after generation.
  uploadCityMesh(vertices, indices) {
    const dev = this.device;
    if (this.cityVB) this.cityVB.destroy();
    if (this.cityIB) this.cityIB.destroy();
    this.cityIndexCount = indices.length;
    this.cityVB = dev.createBuffer({
      size: vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.cityVB.getMappedRange()).set(vertices);
    this.cityVB.unmap();
    this.cityIB = dev.createBuffer({
      size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.cityIB.getMappedRange()).set(indices);
    this.cityIB.unmap();
  }

  buildVehicleMesh(vehicle) {
    const { vertices, indices } = vehicle.meshTemplate;
    vehicle.indexCount = indices.length;
    const dev = this.device;
    if (vehicle.vb) vehicle.vb.destroy();
    if (vehicle.ib) vehicle.ib.destroy();
    vehicle.vb = dev.createBuffer({ size: vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    vehicle.ib = dev.createBuffer({ size: indices.byteLength,  usage: GPUBufferUsage.INDEX  | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(vehicle.vb, 0, vertices);
    dev.queue.writeBuffer(vehicle.ib, 0, indices);
  }

  _updateVehicleGPU(vehicle) {
    const { vertices } = vehicle.worldSpaceMesh();
    this.device.queue.writeBuffer(vehicle.vb, 0, vertices);
  }

  setHighlight(target) {
    this.hlTarget = target;
    if (!target) return;
    const e = 0.02;
    const [bx, by, bz] = target;
    const [x0,y0,z0] = [bx-e,by-e,bz-e], [x1,y1,z1] = [bx+1+e,by+1+e,bz+1+e];
    const verts = new Float32Array([
      x0,y0,z0, x1,y0,z0,  x1,y0,z0, x1,y0,z1,
      x1,y0,z1, x0,y0,z1,  x0,y0,z1, x0,y0,z0,
      x0,y1,z0, x1,y1,z0,  x1,y1,z0, x1,y1,z1,
      x1,y1,z1, x0,y1,z1,  x0,y1,z1, x0,y1,z0,
      x0,y0,z0, x0,y1,z0,  x1,y0,z0, x1,y1,z0,
      x1,y0,z1, x1,y1,z1,  x0,y0,z1, x0,y1,z1,
    ]);
    if (!this.hlVB || this.hlVB.size < verts.byteLength) {
      if (this.hlVB) this.hlVB.destroy();
      this.hlVB = this.device.createBuffer({ size: verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    this.device.queue.writeBuffer(this.hlVB, 0, verts);
  }

  frame(terrain, viewProj, lightDir, time, camPos, fogDensity, vehicles = []) {
    this.resize();
    this.uploadUniforms(viewProj, lightDir, time, camPos, fogDensity);

    // Upload any newly-arrived terrain patches
    for (const p of terrain.patches.values()) {
      if (p.vertices && !p.vb) this.uploadTerrainPatch(p);
    }

    // Update vehicle GPU buffers
    for (const v of vehicles) { if (v.vb) this._updateVehicleGPU(v); }

    const planes = extractFrustumPlanes(viewProj);
    const enc    = this.device.createCommandEncoder();
    const pass   = enc.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0.75, g: 0.85, b: 0.97, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: this.depthView,
        depthClearValue: 0.0, depthLoadOp: 'clear', depthStoreOp: 'store',
      },
    });

    // Sky
    pass.setPipeline(this.skyPipeline);
    pass.setBindGroup(0, this.bindGroup0);
    pass.draw(3);

    // Terrain patches
    this.drawCalls = 0; this.totalTri = 0;
    pass.setPipeline(this.terrainPipeline);
    pass.setBindGroup(0, this.bindGroup0);
    for (const p of terrain.patches.values()) {
      if (!p.vb || p.indexCount === 0) continue;
      if (!aabbInFrustum(planes, p.ox, p.yMin, p.oz, p.ox + PATCH_SIZE, p.yMax, p.oz + PATCH_SIZE)) continue;
      pass.setVertexBuffer(0, p.vb);
      pass.setIndexBuffer(p.ib, 'uint32');
      pass.drawIndexed(p.indexCount);
      this.drawCalls++;
      this.totalTri += p.indexCount / 3 | 0;
    }

    // City
    if (this.cityVB && this.cityIndexCount > 0) {
      pass.setPipeline(this.cityPipeline);
      pass.setBindGroup(0, this.bindGroup0);
      pass.setVertexBuffer(0, this.cityVB);
      pass.setIndexBuffer(this.cityIB, 'uint32');
      pass.drawIndexed(this.cityIndexCount);
      this.drawCalls++;
      this.totalTri += this.cityIndexCount / 3 | 0;
    }

    // Vehicles
    pass.setPipeline(this.vehPipeline);
    pass.setBindGroup(0, this.bindGroup0);
    for (const v of vehicles) {
      if (!v.vb || v.indexCount === 0) continue;
      pass.setVertexBuffer(0, v.vb);
      pass.setIndexBuffer(v.ib, 'uint32');
      pass.drawIndexed(v.indexCount);
      this.drawCalls++;
      this.totalTri += v.indexCount / 3 | 0;
    }

    // Highlight
    if (this.hlTarget && this.hlVB) {
      pass.setPipeline(this.hlPipeline);
      pass.setBindGroup(0, this.bindGroup0);
      pass.setVertexBuffer(0, this.hlVB);
      pass.draw(24);
    }

    pass.end();
    this.device.queue.submit([enc.finish()]);
  }
}
