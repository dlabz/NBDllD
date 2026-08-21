# WebGPU & WGSL Memory Layout and Buffer Alignment Guide

This reference details the memory layout specifications, struct alignments, byte offset calculations, and typed array packing patterns for WebGPU buffers.

---

## 1. WGSL Memory Alignment & Size Rules

In WGSL, buffer data must adhere to strict alignment rules defined by the WebGPU specification:

| WGSL Type | Size (Bytes) | Alignment (Bytes) | Notes |
| :--- | :--- | :--- | :--- |
| `f32`, `i32`, `u32` | 4 | 4 | Scalar 32-bit values |
| `vec2<f32>` / `vec2f` | 8 | 8 | 2-component vector (8-byte aligned) |
| `vec3<f32>` / `vec3f` | 12 | **16** | 3-component vector requires **16-byte alignment** |
| `vec4<f32>` / `vec4f` | 16 | 16 | 4-component vector (16-byte aligned) |
| `mat4x4<f32>` / `mat4x4f` | 64 | 16 | Array of 4 `vec4f` column vectors |
| `struct` | Sum of fields + padding | Max alignment of its members | Rounded up to multiple of max alignment |

> [!IMPORTANT]
> A `vec3f` in WGSL is 12 bytes in size but requires **16-byte alignment**. If placed inside a struct without an accompanying 4-byte scalar immediately following it, the compiler inserts 4 bytes of implicit padding.

---

## 2. Standard Buffer Specifications in 3DGSIL

### A. Body Storage Buffer (64 Bytes Per Entity)

Every celestial body occupies exactly 16 `f32` floats (64 bytes), perfectly aligned to a 16-byte boundary:

```wgsl
struct Body {
    pos: vec3f,       // bytes 0..11  (offset 0 floats)
    radius: f32,      // bytes 12..15 (offset 3 floats) - packs with pos into 16 bytes
    dual: vec3f,      // bytes 16..27 (offset 4 floats)
    mass: f32,        // bytes 28..31 (offset 7 floats) - packs with dual into 16 bytes
    vel: vec3f,       // bytes 32..43 (offset 8 floats)
    life: f32,        // bytes 44..47 (offset 11 floats) - packs with vel into 16 bytes
    type_: f32,       // bytes 48..51 (offset 12 floats)
    pad0: f32,        // bytes 52..55 (offset 13 floats)
    pad1: f32,        // bytes 56..59 (offset 14 floats)
    pad2: f32         // bytes 60..63 (offset 15 floats)
};

@group(0) @binding(0) var<storage, read_write> bodies: array<Body>;
```

#### JavaScript Float32 Packing Helper:
```javascript
const PARTICLE_FLOATS = 16; // 64 bytes

/**
 * Packs body properties into a contiguous Float32Array slice.
 * @param {Float32Array} data - Target staging buffer
 * @param {number} idx - Body entity index
 * @param {Object} config - Body configuration with explicit defaults
 */
const setBodyData = (data, idx, {
    pos = [0, 0, 0],
    dual = [0, 0, 0],
    vel = [0, 0, 0],
    mass = 1.0,
    life = 1.0,
    radius = 0.05,
    type = 1
}) => {
    const base = idx * PARTICLE_FLOATS;
    data[base + 0] = pos[0]; data[base + 1] = pos[1]; data[base + 2] = pos[2];
    data[base + 3] = radius;
    data[base + 4] = dual[0]; data[base + 5] = dual[1]; data[base + 6] = dual[2];
    data[base + 7] = mass;
    data[base + 8] = vel[0]; data[base + 9] = vel[1]; data[base + 10] = vel[2];
    data[base + 11] = life;
    data[base + 12] = type;
    data[base + 13] = 0.0; data[base + 14] = 0.0; data[base + 15] = 0.0;
};
```

---

### B. Compute Uniform Buffer (16 Bytes Aligned)

```wgsl
struct ComputeUniforms {
    simTime: f32,     // offset 0
    dt: f32,          // offset 1
    pad0: f32,        // offset 2
    pad1: f32         // offset 3
};

@group(0) @binding(1) var<uniform> computeParams: ComputeUniforms;
```

---

### C. Render Pass Uniform Buffer (128 Bytes Aligned)

```wgsl
struct RenderUniforms {
    invVP: mat4x4f,   // floats 0..15  (bytes 0..63)
    eye: vec3f,       // floats 16..18 (bytes 64..75)
    time: f32,        // float 19      (bytes 76..79) - packs with eye
    res: vec2f,       // floats 20..21 (bytes 80..87)
    pad: vec2f,       // floats 22..23 (bytes 88..95)
    extra: vec4f,     // floats 24..27 (bytes 96..111)
    extra2: vec4f     // floats 28..31 (bytes 112..127)
};

@group(0) @binding(1) var<uniform> uniforms: RenderUniforms;
```

---

## 3. Buffer Allocation & Usage Flags

Always allocate buffers with explicit minimum required size and bitwise OR flags:

```javascript
// Body storage buffer (read_write compute + read fragment)
const bodyBuffer = device.createBuffer({
    label: 'body_storage_buffer',
    size: bodyCount * 64,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
});

// Render uniform buffer (128 bytes)
const renderUniformBuffer = device.createBuffer({
    label: 'render_uniform_buffer',
    size: 128,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});
```
