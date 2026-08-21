# WebGPU 3DGS Pipeline: Preprocessing, Sorting & Tile Rasterization

This reference outlines the full GPU pipeline architecture for rendering 3D Gaussian Splats on WebGPU.

---

## 1. High-Level Pipeline Stages

```text
[3D Gaussian Data (VRAM)]
         │
         ▼
┌─────────────────────────────────┐
│ Stage 1: Preprocess (Compute)   │
│ - Frustum culling & depth z     │
│ - 3D Covariance Σ = R S S^T R^T │
│ - 2D EWA Projection Σ' = J W Σ..│
│ - Screen Conic (A, B, C) & Box  │
│ - Spherical Harmonics Color     │
│ - Tile key generation           │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Stage 2: GPU Sort / Binning     │
│ - 64-bit Radix Sort:            │
│   [32-bit tile_id | 32-bit depth]│
│ - Generates Tile Ranges [start, │
│   end] per 16x16 pixel tile     │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Stage 3: Tile Rasterize (Render)│
│ - 16x16 workgroup per tile      │
│ - Shared memory Gaussian caching│
│ - Front-to-back α-compositing   │
│ - Early transmittance exit      │
└─────────────────────────────────┘
```

---

## 2. WGSL Compute Stage 1: Preprocess & Project

```wgsl
struct Gaussian3D {
    pos: vec3f,
    opacity: f32,
    rot: vec4f,       // unit quaternion (w, x, y, z)
    scale: vec3f,     // log-scale or linear scale
    sh0: vec3f        // Degree 0 SH base color (RGB)
};

struct Splat2D {
    screenPos: vec2f, // (u, v) in pixels
    conic: vec3f,     // (A, B, C) inverse screen covariance
    color: vec4f,     // (r, g, b, alpha)
    radius: f32       // screen bounding radius in pixels
};

@group(0) @binding(0) var<storage, read> gaussians: array<Gaussian3D>;
@group(0) @binding(1) var<storage, read_write> splats: array<Splat2D>;

@compute @workgroup_size(64, 1, 1)
fn preprocess_main(@builtin(global_invocation_id) global_id: vec3u) {
    let idx = global_id.x;
    if (idx >= arrayLength(&gaussians)) { return; }

    let g = gaussians[idx];
    
    // 1. Transform position to camera space
    // ... camera matrix multiplication ...
    // 2. Compute 3D Covariance Matrix Sigma
    // ... Sigma = R * S * S^T * R^T ...
    // 3. Compute 2D Screen Covariance Sigma_screen = J * W * Sigma * W^T * J^T + 0.3 I
    // 4. Compute Conic components (A, B, C) and radius
    // 5. Evaluate SH color + sigmoid opacity
}
```

---

## 3. WGSL Stage 3: Tile-Based Rasterizer

```wgsl
struct TileData {
    splatStart: u32,
    splatEnd: u32
};

@group(0) @binding(0) var<storage, read> splats: array<Splat2D>;
@group(0) @binding(1) var<storage, read> tileRanges: array<TileData>;
@group(0) @binding(2) var outTexture: texture_storage_2d<rgba8unorm, write>;

var<workgroup> tileSplatCache: array<Splat2D, 256>;

@compute @workgroup_size(16, 16, 1)
fn rasterize_tile(
    @builtin(workgroup_id) workgroup_id: vec3u,
    @builtin(local_invocation_id) local_id: vec3u,
    @builtin(global_invocation_id) global_id: vec3u
) {
    let pixelCoord = vec2i(global_id.xy);
    let tileIndex = workgroup_id.y * (screenWidth / 16u) + workgroup_id.x;
    let range = tileRanges[tileIndex];
    let threadLinearIdx = local_id.y * 16u + local_id.x;

    var colorAccum = vec3f(0.0);
    var T = 1.0; // Transmittance

    let totalSplats = range.splatEnd - range.splatStart;
    let numBatches = (totalSplats + 255u) / 256u;

    for (var b = 0u; b < numBatches; b++) {
        // Cooperatively load 256 splats into shared workgroup memory
        let loadIdx = range.splatStart + b * 256u + threadLinearIdx;
        if (loadIdx < range.splatEnd) {
            tileSplatCache[threadLinearIdx] = splats[loadIdx];
        }
        workgroupBarrier();

        let batchCount = min(256u, range.splatEnd - (range.splatStart + b * 256u));
        for (var i = 0u; i < batchCount; i++) {
            if (T < 0.001) { break; }

            let s = tileSplatCache[i];
            let d = vec2f(pixelCoord) - s.screenPos;
            let power = -0.5 * (s.conic.x * d.x * d.x + 2.0 * s.conic.y * d.x * d.y + s.conic.z * d.y * d.y);

            if (power <= 0.0 && power > -4.5) {
                let alpha = min(0.99, s.color.a * exp(power));
                let weight = alpha * T;
                colorAccum += s.color.rgb * weight;
                T *= (1.0 - alpha);
            }
        }
        workgroupBarrier();
    }

    textureStore(outTexture, pixelCoord, vec4f(colorAccum, 1.0 - T));
}
```

---

## 4. Comparison: 3DGS vs. 3DGSIL Projective Inverted Occlusion

| Feature | 3D Gaussian Splatting (3DGS) | 3DGSIL Projective Inverted Occlusion |
| :--- | :--- | :--- |
| **Geometry** | Discretized point cloud of millions of Gaussians | Analytic continuous spheres & Conformal duals |
| **Occlusion** | Volumetric $\alpha$-blending (requires depth sorting $O(N \log N)$) | Commutative `max()` shadow operator (sorting-free) |
| **Transform** | Affine Jacobian $\mathbf{J}$ to screen plane | 5D CGA Dual Spherical Inversion $\mathbf{x}^* = \frac{R_s^2 \mathbf{x}}{\|\mathbf{x}\|^2}$ |
| **Fill Cost** | Tile-based rasterization with early ray exit | Analytic per-fragment ray-sphere intersection loop |
