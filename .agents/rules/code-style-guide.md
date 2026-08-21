---
trigger: always_on
glob: "**/*"
description: "Coding style guide, architectural constraints, mathematical invariants, WebGPU/WGSL stability rules, JSDoc type checking, and WebMCP telemetry standards for the 3DGSIL repository."
---

# 🪐 3DGSIL — Code Style Guide & Engineering Standards

This document establishes the mandatory coding standards, architectural invariants, type safety protocols, and GPU numerical stability rules for the **3DGSIL (Projective Inverted Occlusion & 5D CGA Raytracer)** repository.

---

## 1. Core Architecture & Philosophy

1. **Zero-Build Vanilla Architecture**:
   - Use standard modern ECMAScript (ES modules, `.mjs`, `<script type="module">`, pure HTML/CSS/JS).
   - **Zero runtime npm dependencies** and **zero required build steps** (no Webpack, Rollup, or Vite required for core demos).
   - All code must run natively in modern evergreen browsers supporting WebGPU via local HTTP server (e.g., Live Server at `http://127.0.0.1:5500`).
2. **Mesh-Free Analytic Rendering**:
   - Geometry is defined mathematically (exact spheres, projective cones, conformal dual inverses) rather than discretized polygonal meshes.
   - Intersections are evaluated analytically in WebGPU compute/fragment shaders using exact quadratic discriminants.
3. **Symplectic Physics & Energy Conservation**:
   - Use symplectic integrators (Velocity Verlet or Symplectic Euler) for orbital mechanics to conserve energy over extended runtimes.
   - Dynamically rebase coordinates relative to the Center of Mass (CoM) to prevent float32 precision degradation far from the origin.
4. **Zero-Allocation Hot Loops**:
   - Never instantiate objects, arrays, or vectors (`new THREE.Vector3()`, `new Float32Array()`, `{}`) inside the per-frame `requestAnimationFrame` loop or physics sub-steps.
   - Pre-allocate all scratch buffers, typed arrays, and transformation matrices during initialization.

---

## 2. Type Safety & JSDoc Standards

All JavaScript and HTML embedded scripts must pass strict type checking without a build step:

1. **`// @ts-check` Mandatory**:
   - Place `// @ts-check` as the first line in every `.js`, `.mjs`, and inside the `<script type="module">` tag of `.html` files.
2. **Comprehensive JSDoc Annotations**:
   - Annotate all functions, parameters, return values, and module state using explicit JSDoc tags (`@typedef`, `@param`, `@returns`, `@type`, `@property`).
   - Specify tuple types for vectors (e.g., `[number, number, number]` for 3D coordinates).
3. **Ambient Declaration Synchronization (`types/`)**:
   - Maintain ambient type declarations in the [`types/`](file:///Users/dlabz/Workspace_AI/3DGSIL/types) directory:
     - [`types/webgpu.d.ts`](file:///Users/dlabz/Workspace_AI/3DGSIL/types/webgpu.d.ts): Ambient WebGPU interfaces.
     - [`types/cga_fourier.d.ts`](file:///Users/dlabz/Workspace_AI/3DGSIL/types/cga_fourier.d.ts): CGA multivectors, Fourier chain AST, and ray structures.
     - [`types/gpu_memory_layout.d.ts`](file:///Users/dlabz/Workspace_AI/3DGSIL/types/gpu_memory_layout.d.ts): Struct memory layouts and byte offsets.
     - [`types/webmcp.d.ts`](file:///Users/dlabz/Workspace_AI/3DGSIL/types/webmcp.d.ts): WebMCP bridge, telemetry, and diagnostics schemas.
   - Ensure [`jsconfig.json`](file:///Users/dlabz/Workspace_AI/3DGSIL/jsconfig.json) includes `"checkJs": true` and `"typeRoots": ["./types"]`.
4. **WebGPU Bitflag Constants**:
   - In standalone HTML contexts where ambient WebGPU types might not be natively injected by every virtual editor, define local fallback bitflags:
     ```javascript
     const GPUBufferUsageFlags = {
         MAP_READ: 0x01, MAP_WRITE: 0x02, COPY_SRC: 0x04, COPY_DST: 0x08,
         INDEX: 0x10, VERTEX: 0x20, UNIFORM: 0x40, STORAGE: 0x80,
         INDIRECT: 0x100, QUERY_RESOLVE: 0x200
     };
     const GPUShaderStageFlags = { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 };
     ```
   - Cast `navigator.gpu` safely via JSDoc `/** @type {any} */ (navigator).gpu`.

---

## 3. Mathematical Specifications & Invariants

1. **Synthetic Kinematic Scaffolding & Degeneracy Probe (2-Vector Fourier Chain)**:
   - **Role & Intent**: This harmonic chain was introduced as a **diagnostic / debug scaffolding** (not the native simulation architecture) to construct a deterministic graph of body instances across the scene graph. This enables developers and agents to probe, isolate, and communicate the exact geometrical points at which math or shaders break (e.g. major axis traps, coordinate singularities, or grazing inversion horizons).
   - **Formulation**:
     $$\mathbf{r}_{\text{moon}}(t) = \mathbf{r}_{\text{sun}} + \mathbf{v}_1(\theta_1) + \mathbf{v}_2(\theta_2)$$
   - **Vector 1 ($\mathbf{v}_1$, Sun $\to$ Planet)**: Confined to the horizontal ecliptic plane ($X-Z$):
     $$\mathbf{v}_1(\theta_1) = [R_1 \cos(\theta_1),\, 0,\, R_1 \sin(\theta_1)]^\top$$
   - **Vector 2 ($\mathbf{v}_2$, Planet $\to$ Moon)**: Decoupled into the vertical elevation plane ($X-Y$):
     $$\mathbf{v}_2(\theta_2) = [r_2 \cos(\theta_2),\, r_2 \sin(\theta_2),\, 0]^\top$$
   - **Degeneracy & Trap Testing**: Use this controlled instance graph to test orthogonal alignments ($\theta_1 = 90^\circ, 180^\circ, 270^\circ$) to guarantee immunity against division-by-zero or non-invertible matrix states.

2. **5D Conformal Geometric Algebra (CGA) Dual Spherical Inversion**:
   - **Inversion Coordinate Transform**:
     $$\mathbf{x}^* = \frac{R_s^2 \mathbf{x}}{\|\mathbf{x}\|^2 + \epsilon}$$
   - **Involution Identity**: The transformation must be an exact involution: $(\mathbf{x}^*)^* = \mathbf{x}$.
   - **Fixed Horizon Invariant**: Any point on the inversion sphere $\|\mathbf{p}\| = R_s$ maps to itself: $\|\mathbf{p}^*\| = R_s$.
   - **Dual Radius Mapping**:
     $$r^* = \text{clamp}\left(\frac{r \cdot R_s^2}{|\|\mathbf{x}\|^2 - r^2| + \epsilon},\, r_{\text{min}},\, r_{\text{max}}\right)$$

3. **Analytic Ray-Sphere Intersection (Half-$b$ Formulation)**:
   - Ray: $\mathbf{r}(t) = \mathbf{r}_0 + t \mathbf{d}$, Sphere center: $\mathbf{c}$, Radius: $r$.
   - Compute: $\mathbf{oc} = \mathbf{r}_0 - \mathbf{c}$, $b = \mathbf{oc} \cdot \mathbf{d}$, $c = \|\mathbf{oc}\|^2 - r^2$, discriminant $\Delta = b^2 - c$.
   - If $\Delta < 0$, no intersection. Otherwise: $t = -b - \sqrt{\Delta}$. Reject intersections where $t < 0$.

---

## 4. WebGPU & WGSL Hardware Stability Rules (Metal / AMD Radeon)

To prevent GPU panics, device loss, or `vec3(NaN)` visual corruption on macOS Metal and AMD/Apple Silicon hardware:

1. **Zero-Length Vector Normalization Guards**:
   - **Never** normalize a vector without guarding against division by zero:
     ```wgsl
     // WGSL Guard:
     let len = length(v);
     let n = select(vec3f(0.0, 1.0, 0.0), v / len, len > 1e-5);
     ```
     ```javascript
     // JavaScript Guard:
     const len = Math.hypot(x, y, z);
     const norm = len > 1e-6 ? [x / len, y / len, z / len] : [0, 1, 0];
     ```
2. **Clamped Exponentiation**:
   - Always clamp bases into $[0.0, 1.0]$ before passing to `pow()` to avoid negative base NaN outputs at grazing incident angles:
     ```wgsl
     let fresnel = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 3.0);
     ```
3. **Strict Buffer Alignment & Padding**:
   - **Body Storage Buffer**: 64 bytes per body (16 floats). Follow [`types/gpu_memory_layout.d.ts`](file:///Users/dlabz/Workspace_AI/3DGSIL/types/gpu_memory_layout.d.ts):
     `pos.xyz` (3), `radius` (1), `dual.xyz` (3), `mass` (1), `vel.xyz` (3), `life` (1), `type_` (1), `pad[3]` (3).
   - **Compute Uniform Buffer**: 16 bytes (4 floats): `simTime`, `dt`, `pad0`, `pad1`.
   - **Render Uniform Buffer**: 128 bytes (32 floats): `invVP` (16 floats), `eye` (3 floats), `time` (1 float), `res` (2 floats), `pad` (2 floats), `extra` (8 floats).

---

## 5. WebMCP Developer Bridge & Telemetry Protocol

All primary rendering entry points must expose a live developer bridge on `window.__WEBMCP__` and `window.__3DGSIL__`:

1. **Standard Interface Methods**:
   - `getState()`: Returns a full JSON-serializable snapshot of simulation time, FPS, frame count, camera orbital state, body entities, and diagnostics.
   - `pause()`, `resume()`, `togglePause()`: Controls physics integration state.
   - `step(dt)`: Advances the simulation by a discrete delta time.
   - `setTimeScale(scale)`: Sets the speed scaling factor ($0.01\times$ to $10.0\times$).
   - `setCameraPreset(mode)`: Snaps view to `'system'`, `'planet'`, `'moon'`, or `'core'`.
   - `setCameraOrbit(azimuth, elevation, distance)`: Configures spherical orbit angles and distance.
   - `runDiagnostics()`: Runs numerical sanity checks and dumps structured tables.
   - `exec(cmd, ...args)`: Dispatches arbitrary automation commands.
2. **Diagnostic Invariant Checks**:
   - Verify all positions, velocities, and matrix entries are finite (`!isNaN(v) && isFinite(v)`).
   - Monitor total kinetic energy ($E_k = \sum \frac{1}{2} m v^2$) and warn on unphysical energy drift or escape velocity boundary violations.
3. **Standard Interactive Hotkeys**:
   - `Space`: Toggle Pause/Resume.
   - `.`: Discrete Step.
   - `1` - `4`: Camera Presets (`system`, `planet`, `moon`, `core`).
   - `[` / `]`: Decrease / Increase time scale.
   - `D`: Run and log numerical diagnostics.

---

## 6. Testing & Mathematical Verification

1. **Browser-First Testing Philosophy**:
   - This project is a client-side Web application and WebGPU raytracer. The primary testing environment is the **Browser Runtime** via [`tests/test_runner.html`](file:///Users/dlabz/Workspace_AI/3DGSIL/tests/test_runner.html) and automated browser inspection (e.g. `chrome-devtools-mcp` or WebMCP telemetry).
   - Do **NOT** rely on Node.js runtime assumptions or legacy Node shims for browser APIs. If running headless CLI tests or scripts, prefer browser-aligned environments (such as **Deno** or native Web Standards runtimes) that natively support modern Web standards, ES modules, WebGPU, and web APIs.
2. **Dual Implementation Verification**:
   - Maintain pure JavaScript reference math implementations in [`tests/math_cga_fourier.mjs`](file:///Users/dlabz/Workspace_AI/3DGSIL/tests/math_cga_fourier.mjs) mirroring shader logic.
3. **Automated Invariant Test Suite**:
   - All 14 invariants in [`tests/math_unit_tests.mjs`](file:///Users/dlabz/Workspace_AI/3DGSIL/tests/math_unit_tests.mjs) must pass ($100\%$ green).
   - The interactive test dashboard in [`tests/test_runner.html`](file:///Users/dlabz/Workspace_AI/3DGSIL/tests/test_runner.html) must remain operational for browser-based regression testing and visual debugging.
4. **Adding New Features**:
   - When introducing new geometric transforms, coordinate maps, or integrators, add corresponding unit test assertions in `tests/math_unit_tests.mjs` before committing GPU shader implementations.

---

## 7. Naming Conventions & Code Cleanliness

1. **Physics Terminology Accuracy**:
   - Avoid calling acceleration per unit mass "force". Distinguish clearly between gravitational acceleration ($\mathbf{a} = G \frac{m_2}{r^2} \hat{\mathbf{r}}$) and total force ($\mathbf{F} = m_1 \mathbf{a}$).
2. **Resource Lifecycle & Cleanup**:
   - Always invoke `.destroy()` on WebGPU buffers and release canvas contexts/event listeners when switching modes or re-initializing scenes to prevent memory leaks.
3. **Explicit Parameter Decomposition & Defaults**:
   - When passing configuration objects or initialization parameters to functions (e.g. buffer packing helpers), **never** pass generic opaque object arguments like `(data, idx, o) => { ... }`.
   - Always use explicit parameter destructuring with sensible default values:
     ```javascript
     const setBodyData = (data, idx, {
         pos = [0, 0, 0],
         dual = [0, 0, 0],
         vel = [0, 0, 0],
         mass = 1,
         life = 1,
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
         data[base + 13] = 0; data[base + 14] = 0; data[base + 15] = 0;
     };
     ```
   - This ensures self-documenting signatures, clean JSDoc inference, and guards against `undefined` field access.
4. **Formatting & Structure**:
   - Use 4-space indentation for JavaScript, HTML, and WGSL.
   - Organize files logically: Constants $\to$ Types/JSDoc $\to$ Math Reference $\to$ GPU Pipeline Setup $\to$ Frame Loop $\to$ WebMCP Bridge $\to$ Event Listeners.
