---
name: webgpu
description: >-
  Comprehensive engineering workflows for WebGPU development, WGSL shader authoring, compute and render pipeline lifecycles, memory layout alignment, zero-allocation hot loops, and hardware numerical stability (Metal/AMD/Apple Silicon). Activate when developing, refactoring, or debugging WebGPU compute/render passes, WGSL shaders, buffer memory layouts, or WebMCP GPU bridges.
---

# 🚀 WebGPU & WGSL Engineering Skill

This skill provides mandatory engineering workflows, hardware safety rules, struct memory alignment patterns, and zero-allocation execution protocols for building and debugging WebGPU compute and raytracing applications.

---

## 1. Quick Reference & Architectural Guides

- [Memory Layout & Buffer Alignment Guide](./references/memory_layouts.md)
- [WGSL Numerical Stability & Hardware Hazards Guide](./references/wgsl_stability.md)
- [Compute & Render Pipeline Lifecycle Patterns](./references/pipeline_patterns.md)

---

## 2. Core WebGPU Development Workflow

### Step 1: Device Initialization & Canvas Setup
Always acquire the adapter with explicit power preference and configure the swapchain context:
```javascript
const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
if (!adapter) throw new Error('WebGPU adapter acquisition failed');
const device = await adapter.requestDevice();
const context = /** @type {GPUCanvasContext} */ (canvas.getContext('webgpu'));
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format, alphaMode: 'premultiplied' });
```

### Step 2: Buffer Allocation & Strict Alignment
- Ensure all uniform buffers are sized to a multiple of **16 bytes**.
- Maintain **16-byte alignment** for `vec3f` and `vec4f` struct members in WGSL.
- In 3DGSIL, celestial bodies follow the 64-byte layout: `pos.xyz` (3) + `radius` (1) | `dual.xyz` (3) + `mass` (1) | `vel.xyz` (3) + `life` (1) | `type_` (1) + `pad[3]` (3).
- See detailed memory layouts in [./references/memory_layouts.md](./references/memory_layouts.md).

### Step 3: Compute & Render Pipeline Creation
- Use `@compute @workgroup_size(64, 1, 1)` for parallel particle/body updates.
- Use mesh-free fullscreen vertex generation via `@builtin(vertex_index)` (`vs_main` with 3 vertices) for analytic raytracing shaders.
- See pipeline recipes in [./references/pipeline_patterns.md](./references/pipeline_patterns.md).

### Step 4: Zero-Allocation Hot Loops
- **Never** instantiate `new Float32Array()`, `new Vector3()`, or `{}` objects inside `requestAnimationFrame` or physics sub-steps.
- Pre-allocate scratch typed arrays during initialization and upload via `device.queue.writeBuffer(buffer, 0, scratchArray)`.

---

## 3. Hardware Numerical Stability Rules (macOS Metal / AMD / Apple Silicon)

To prevent GPU panics, device loss, or `vec3(NaN)` visual corruption:

1. **Zero-Length Normalization Guard**:
   ```wgsl
   let len = length(v);
   let n = select(fallbackVec, v / len, len > 1e-5);
   ```
2. **Exponentiation Base Clamping**:
   ```wgsl
   let fresnel = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 3.0);
   ```
3. **Analytic Half-$b$ Ray-Sphere Intersection**:
   $$b = \mathbf{oc} \cdot \mathbf{d}, \quad c = \|\mathbf{oc}\|^2 - r^2, \quad \Delta = b^2 - c$$
   Check $\Delta \ge 0.0$ and clamp before `sqrt(max(discriminant, 0.0))`.
4. See full hardware hazard checklist in [./references/wgsl_stability.md](./references/wgsl_stability.md).

---

## 4. Verification & Testing Runbook

1. **Browser Test Suite**:
   - Open and run the standalone browser test dashboard at [`tests/test_runner.html`](file:///Users/dlabz/Workspace_AI/3DGSIL/tests/test_runner.html).
   - Ensure all 14 invariant math unit tests are 100% green before deploying GPU shader modifications.
2. **WebMCP Telemetry & Diagnostics**:
   - Inspect simulation state live in browser console via `window.__WEBMCP__.getState()`.
   - Run automated numerical diagnostics: `window.__WEBMCP__.runDiagnostics()`.
   - Check that all body positions, velocities, and matrix entries are finite (`!isNaN` and `isFinite`).
3. **Resource Lifecycle**:
   - Call `.destroy()` on obsolete `GPUBuffer` instances when swapping scenes or reconfiguring pipelines to prevent VRAM memory leaks.
