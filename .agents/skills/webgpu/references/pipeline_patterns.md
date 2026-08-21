# WebGPU Pipeline Patterns: Compute, Render & Zero-Allocation Hot Loops

This reference provides architecture patterns for orchestrating compute passes, fullscreen render passes, ping-pong storage buffers, and zero-allocation frame loops.

---

## 1. WebGPU Initialization Boilerplate

```javascript
/**
 * Initializes the WebGPU device, canvas context, and preferred swapchain format.
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<{ device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat }>}
 */
export async function initWebGPU(canvas) {
    if (!navigator.gpu) {
        throw new Error('WebGPU is not supported by this browser.');
    }
    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
    });
    if (!adapter) {
        throw new Error('Failed to acquire WebGPU adapter.');
    }
    const device = await adapter.requestDevice();
    const context = /** @type {GPUCanvasContext} */ (canvas.getContext('webgpu'));
    const format = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device,
        format,
        alphaMode: 'premultiplied'
    });

    return { device, context, format };
}
```

---

## 2. Compute Pipeline & Workgroup Dispatch Pattern

### Compute Shader Structure (`compute.wgsl`)
```wgsl
struct Body {
    pos: vec3f,
    radius: f32,
    dual: vec3f,
    mass: f32,
    vel: vec3f,
    life: f32,
    type_: f32,
    pad0: f32,
    pad1: f32,
    pad2: f32
};

struct ComputeUniforms {
    simTime: f32,
    dt: f32,
    pad0: f32,
    pad1: f32
};

@group(0) @binding(0) var<storage, read_write> bodies: array<Body>;
@group(0) @binding(1) var<uniform> params: ComputeUniforms;

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let idx = global_id.x;
    if (idx >= arrayLength(&bodies)) {
        return;
    }

    // Kinematic / Symplectic update
    var b = bodies[idx];
    b.pos += b.vel * params.dt;
    
    // Inversion update
    let RsSq = 625.0;
    let r2 = dot(b.pos, b.pos);
    b.dual = (RsSq / (r2 + 1e-4)) * b.pos;

    bodies[idx] = b;
}
```

### JS Compute Pipeline Setup & Dispatch
```javascript
// Pipeline Layout & Pipeline Creation
const computePipeline = device.createComputePipeline({
    label: 'nbody_compute_pipeline',
    layout: 'auto',
    compute: {
        module: device.createShaderModule({ code: computeShaderSource }),
        entryPoint: 'main'
    }
});

const computeBindGroup = device.createBindGroup({
    label: 'compute_bind_group',
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
        { binding: 0, resource: { buffer: bodyStorageBuffer } },
        { binding: 1, resource: { buffer: computeUniformBuffer } }
    ]
});

// Inside frame dispatch:
const commandEncoder = device.createCommandEncoder();
const computePass = commandEncoder.beginComputePass({ label: 'physics_pass' });
computePass.setPipeline(computePipeline);
computePass.setBindGroup(0, computeBindGroup);
computePass.dispatchWorkgroups(Math.ceil(bodyCount / 64));
computePass.end();
```

---

## 3. Mesh-Free Fullscreen Render Pipeline

Instead of allocating vertex and index buffers, generate a fullscreen triangle directly from `@builtin(vertex_index)` in the vertex shader:

### Vertex Shader (`raytrace.vert.wgsl`)
```wgsl
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;
    // Generate fullscreen triangle: (0,0)->(-1,-1), (1,0)->(3,-1), (2,0)->(-1,3)
    let x = f32((vertexIndex << 1u) & 2u);
    let y = f32(vertexIndex & 2u);
    out.position = vec4f(x * 2.0 - 1.0, y * -2.0 + 1.0, 0.0, 1.0);
    out.uv = vec2f(x, y);
    return out;
}
```

---

## 4. Zero-Allocation Render Loop Pattern

```javascript
// Pre-allocate scratch typed arrays at initialization time
const renderUniformScratch = new Float32Array(32); // 128 bytes
const computeUniformScratch = new Float32Array(4);  // 16 bytes

function renderFrame(time) {
    const dt = (time - lastTime) * 0.001;
    lastTime = time;

    // 1. Pack compute uniforms without allocation
    computeUniformScratch[0] = simTime;
    computeUniformScratch[1] = dt;
    device.queue.writeBuffer(computeUniformBuffer, 0, computeUniformScratch);

    // 2. Pack render uniforms without allocation
    // Copy 16 floats of invVP matrix into scratch 0..15
    for (let i = 0; i < 16; i++) renderUniformScratch[i] = invVP[i];
    renderUniformScratch[16] = camera.eye[0];
    renderUniformScratch[17] = camera.eye[1];
    renderUniformScratch[18] = camera.eye[2];
    renderUniformScratch[19] = simTime;
    renderUniformScratch[20] = canvas.width;
    renderUniformScratch[21] = canvas.height;
    device.queue.writeBuffer(renderUniformBuffer, 0, renderUniformScratch);

    // 3. Encode Commands
    const encoder = device.createCommandEncoder();

    // Compute Pass
    const cPass = encoder.beginComputePass();
    cPass.setPipeline(computePipeline);
    cPass.setBindGroup(0, computeBindGroup);
    cPass.dispatchWorkgroups(Math.ceil(bodyCount / 64));
    cPass.end();

    // Render Pass
    const rPass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: 'clear',
            clearValue: { r: 0.01, g: 0.01, b: 0.03, a: 1.0 },
            storeOp: 'store'
        }]
    });
    rPass.setPipeline(renderPipeline);
    rPass.setBindGroup(0, renderBindGroup);
    rPass.draw(3); // 3 vertices for fullscreen triangle
    rPass.end();

    device.queue.submit([encoder.finish()]);

    if (!isPaused) requestAnimationFrame(renderFrame);
}
```
