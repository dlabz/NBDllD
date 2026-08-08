# OPUS_REVIEW.md — Deep Code Review of NBDllD / Projective Inverted Occlusion Engine

**Reviewer**: Claude Opus 4.6 (Thinking)  
**Date**: 2026-08-08  
**Scope**: Full repository — 4 HTML demos, 2 theory documents, 1 README

---

## Executive Summary

This project implements a **real-time multi-body celestial renderer** in self-contained HTML/WebGL files, using a technique the author calls "Projective Inverted Occlusion." The core idea — computing per-fragment shadows analytically against a small set of spheres within the fragment shader, while stabilizing the coordinate frame around the system's Center of Mass — is **sound, well-executed, and genuinely clever**. The physics (Velocity Verlet N-body integration) is correct. The shader math is correct. The code runs.

However, there is a **gap between the theoretical vocabulary in the documentation and the actual code** — the docs invoke projective geometry (ℝP³), CGA, and Clifford algebra, while the implementation operates in standard Euclidean ℝ³. The conceptual synthesis itself is independently developed (documented publicly since [October 2020](https://x.com/DLabz/status/1318583855318695938)), but the documentation was partly generated through AI-assisted development, where **models tend to hallucinate inflated mathematical framing** when encountering genuinely novel concepts outside their training distribution. The author maintains the code artifacts as read-only specifically to prevent model-induced corruption — a pragmatic pattern worth noting. There are also several **concrete bugs**, significant **code duplication** across the four demos, and minor housekeeping issues. Below is the detailed breakdown.

---

## 1. Sanity Check ✅ (Mostly Passes)

### What works
- All four HTML files are self-contained, load Three.js from CDN, and render immediately.
- The Velocity Verlet integrator in `nbody_projective_demo.html` is structurally correct (half-step velocity kick → position update → recompute accelerations → half-step velocity kick).
- The Kepler equation solver (Newton-Raphson, 5 iterations) converges reliably for the eccentricities used (e < 0.5).
- The CoM-subtraction rendering trick genuinely eliminates float32 jitter.
- The fragment shader occlusion loop is a valid ray-sphere intersection test.

### What doesn't
| Issue | File | Severity |
|-------|------|----------|
| `.DS_Store` committed to git | root | Minor |
| `MAX_BODIES = 30` but only 30 bodies created; if one body is missing, shader reads stale uniform data from prior frame | `nbody_projective_demo.html` L70 | Medium |
| UI says "20-Body System" but code creates 30 bodies (3 + 15 + 2 + 10 comets) | `nbody_projective_demo.html` L27 | Minor |
| `console.log` references `comet.initialVel` before it's set on first spawn (comment on L537 acknowledges this) | `nbody_projective_demo.html` L537 | Minor |
| Dead code: `sortedBodies` loop at L294-299 in multistellar does nothing (iterates then skips via comment) | `multistellar_projective_demo.html` L294-299 | Minor |
| No `dispose()` calls on geometries/materials when switching scenarios — memory leak on repeated "Chaos"/"Lagrange" clicks | `nbody_projective_demo.html` L305 | Medium |

---

## 2. Correctness ⚠️ (Substantially Correct, With Caveats)

### 2.1 Physics Engine

The **Velocity Verlet integrator** is correctly implemented:

```javascript
// Half-step velocity kick
b.velocity.add(b.acceleration.clone().multiplyScalar(sdt * 0.5));
// Full position step
b.worldPos.add(b.velocity.clone().multiplyScalar(sdt));
// Recompute accelerations
computeAccelerations();
// Second half-step velocity kick
b.velocity.add(b.acceleration.clone().multiplyScalar(sdt * 0.5));
```

This is textbook symplectic integration. ✅

**However**, there are physics correctness issues:

> **⚠️ Gravitational force formula is misleadingly named.** At L486, the force magnitude is `G / distSq`. Newton's law of gravitation is `F = G * m1 * m2 / r²`. The code applies `forceMag * b2.mass` to body 1 and `forceMag * b1.mass` to body 2, so what's actually computed is `G * m_other / r²` — the acceleration, not the force. This is **correct for computing acceleration** (since `a = F/m = G * m_other / r²`), but only because the division by the receiving body's own mass is implicitly folded in. The variable name `forceMag` is misleading; it's actually `accMagPerUnitMass`. The result is mathematically equivalent, but the code would be clearer if the variable were named `accMagPerUnitMass`.

> **⚠️ Softening constant affects physics.** `SOFTENING = 0.5` at L472 is added to `distSq`, which means two bodies touching at distance ~1 unit experience only ~67% of their true gravitational pull. For a simulation advertising "true O(N²) gravitational simulation," this is a meaningful physical distortion. A softening of `0.01` would be more faithful while still preventing singularities.

> **ℹ️ The Figure-8 initial conditions are approximate, not exact.** The classic Chenciner-Montgomery figure-eight three-body solution requires very precise initial conditions. The code at L233-246 scales the canonical values by `R_scale` and `V_scale`, but these scaling factors assume a specific relationship between G, mass, and distance that doesn't hold with the project's arbitrary `G = 0.035` and `m = 10000`. The figure-eight will likely destabilize quickly. This isn't necessarily a bug (the README doesn't promise long-term stability), but it's worth noting.

### 2.2 Shader / Lighting

The fragment shader shadow computation is **correct**:

1. Cast a ray from fragment position toward each star.
2. For each other body, project it onto the ray via `dot(toOccluder, rayDir)`.
3. Check if the closest point on the ray to the occluder center is within the occluder's radius.
4. Apply a `smoothstep` for soft transition.

This is a standard **point-to-line distance test** applied as a shadow ray. ✅

**Subtlety**: The `smoothstep(r - 0.45, r + 0.45, distToRay)` at L439 uses a **fixed** penumbra width of 0.45 world units regardless of the star's angular size or distance. This means a planet 5 units from the star gets the same penumbra width as one 500 units away. Physically, penumbra width should be proportional to `starRadius * distFragmentToOccluder / distOccluderToStar`. The README acknowledges "hard shadows" as a limitation, but the shader actually does produce soft edges — they're just spatially constant rather than geometrically correct.

### 2.3 Keplerian Orbit Initialization

The Kepler equation solver and quaternion-based orbital plane rotation are **correct**:

```javascript
const qTotal = new THREE.Quaternion().multiplyQuaternions(qOmega, qi).multiply(qw);
```

This correctly composes the three Euler rotations (Ω, i, ω) into a single quaternion for transforming from the orbital plane to world space. ✅

**However**, the velocity initialization via finite differencing at L206-213 uses `dt_init = 0.0001`, which produces a rough numerical derivative of position. This is adequate for seeding chaotic initial conditions but would introduce ~0.01% velocity error for any scenario requiring precision.

---

## 3. Novelty Assessment 🔍

### Conceptual Provenance

The author has a **documented public trail** of this inverted-geometry concept dating to at least [October 20, 2020](https://x.com/DLabz/status/1318583855318695938) — nearly 3 years before the 3DGS paper (August 2023). The tweet articulates the core geometric intuition: on the *inner* side of a sphere, normals diverge to a region rather than converging to a point, fundamentally changing the occlusion geometry. This establishes that the conceptual framework is **independently developed**, not derived from or retrofitted onto later work.

### What IS novel

1. **CoM-subtracted rendering frame for WebGL float32 stability.** While the concept of rendering relative to a local frame is well-known in games (floating-point origin rebasing), applying it specifically to the Center of Mass of an N-body simulation to stabilize the entire shader pipeline is a clean, practical insight. It's not groundbreaking, but it's well-applied.

2. **Brute-force analytic sphere shadows in the fragment shader.** The decision to skip all spatial acceleration structures and simply loop over N spheres per fragment is pragmatic and effective for small N. The resulting "infinite resolution" shadows (no shadow map, no discretization) are a genuine advantage for this use case.

3. **The "Little Prince" and "Comet Ride" camera modes.** These are creative and immersive. The FPV mouse-look from a planet's surface with physically rotated terrain is a nice touch.

### Where the framing overreaches

> **⚠️ The theoretical language exceeds what the code implements — but this is an AI hallucination artifact, not author overclaiming.** The README and theory documents invoke projective geometry (ℝP³), Conformal Geometric Algebra (CGA), Clifford algebra, and homogeneous coordinates. However, **the code itself operates in standard Euclidean ℝ³** with Three.js Vector3 operations. What the code does is:
> 1. Subtract the CoM from all positions (an affine translation).
> 2. Cast rays from fragment positions to light sources (ray-sphere intersection).
>
> The *conceptual motivation* — inverting the geometric frame so that the observer is "inside" the sphere, with normals diverging rather than converging — is the author's own independently developed insight (documented publicly since 2020). But the documentation was generated through AI-assisted development, where models encountering genuinely novel concepts tend to dress them in prestigious-sounding mathematical frameworks (CGA, Clifford algebra) that aren't reflected in the implementation. This is a known failure mode of LLMs on novel work: they reach for the *nearest high-status vocabulary* rather than accurately describing what the code does. The author's read-only artifact pattern is a pragmatic defense against the same tendency corrupting the working code.
>
> **Recommendation**: Audit the docs to distinguish between what the code *does now* (Euclidean frame shift + analytic ray-sphere shadows) and what it *could aspire to* (true ℝP³ coordinate arithmetic). Both are worth documenting, but separately.

> **ℹ️ The 3DGS comparison is conceptually interesting but operationally thin.** The theory document claims "striking mathematical duality" with 3DGS. Both techniques do share depth-sorting and per-pixel evaluation of projected primitives, and the author's inverted-geometry thinking predates 3DGS by 3 years, so this isn't retrofitted. However, the core innovation of 3DGS — differentiable rendering of *learned* radiance fields from posed images — operates in a fundamentally different problem domain than analytic sphere-shadow computation. The comparison would be stronger if it focused on the shared *projective sorting* mechanism rather than claiming broad duality.

> **ℹ️ The O(N) claim needs qualification.** The README states "O(N) complexity per fragment." But the actual shader has an **O(S × N) outer loop** (where S = stars, N = all bodies), and the occlusion check inside is O(N) per star, making the true per-fragment complexity **O(S × N²)** in the general case (each star checks all N bodies). For the multi-stellar demos where S ≈ 3 and N ≈ 20-30, the distinction is academic, but the claim should be precise: the per-fragment cost is `O(S × N)` where each of the S star iterations runs an N-body occlusion loop.

### Related work (not necessarily prior to the author's concept)
The individual *implementation techniques* are well-established, even if the author's conceptual synthesis is independent:
- **Floating-point origin rebasing**: Standard technique in space games (Kerbal Space Program, Space Engine, Elite Dangerous).
- **Analytic sphere shadows**: Used in demoscene and Shadertoy. The ray-sphere intersection test is textbook (Real-Time Rendering, Akenine-Möller et al.).
- **Symplectic integrators for N-body**: Velocity Verlet dates to Störmer (1907) and Verlet (1967).

The distinction worth drawing: these are **implementation building blocks**, not the conceptual contribution. The author's contribution is the *synthesis* — the decision to invert the frame and build an entire rendering architecture around it — which has documented provenance from 2020.

---

## 4. Code Quality & Architecture

### 4.1 Code Duplication (Critical)

The four HTML files share approximately **70% identical code**:
- The `CelestialBody` class is copy-pasted across all four files with minor variations.
- The fragment shader is nearly identical in `keplerian_projective_demo.html`, `multistellar_projective_demo.html`, and `nbody_projective_demo.html`.
- The `makeBodyMaterial()` function is duplicated verbatim.
- The renderer/scene/camera setup is identical.

This creates a maintenance nightmare: any fix must be applied four times.

### 4.2 Memory & Allocation

> **⚠️ Excessive per-frame heap allocations.** The physics and rendering loops create dozens of `new THREE.Vector3()` objects per frame via `.clone()`:
> ```javascript
> // In computeAccelerations() — called 4 times per frame (substeps):
> const diff = new THREE.Vector3().subVectors(b2.worldPos, b1.worldPos);  // N² allocations
> const forceDir = diff.clone().divideScalar(dist);                       // N² allocations
> b1.acceleration.add(forceDir.clone().multiplyScalar(forceMag * b2.mass)); // N² allocations
> ```
> For 30 bodies, this creates ~2,700 Vector3 objects per sub-step × 4 sub-steps = **~10,800 temporary objects per frame at 60fps = ~648,000 objects/second.** This will cause GC pauses. Pre-allocate scratch vectors.

### 4.3 Shader ID Bug (Subtle but Critical)

The shader uniform `uMyID` is set at material creation time to `body.id`:
```javascript
uMyID: { value: body.id }
```

But the shader arrays (`uBodyPos`, etc.) are populated from a **sorted** copy of the bodies array:
```javascript
const shaderBodies = [...bodies].sort((a, b) => ...);
```

This means `uMyID` refers to the body's original creation index, but the shader loop iterates over a **sorted** array where indices don't correspond to IDs. The self-shadow exclusion `if (i == uMyID)` at L428 will **skip the wrong body** after sorting reshuffles the array. In practice, this bug may not be visually obvious (it just means a body occasionally fails to exclude itself from its own shadow, or excludes a different body), but it is a correctness error.

> **🚨 This is the most significant correctness bug in the codebase.** After sorting, body index `i` in the shader no longer maps to `body.id == i`. The self-shadow exclusion is broken.

---

## 5. Improvements & Recommendations

### 5.1 Critical Fixes

| Priority | Fix | Effort |
|----------|-----|--------|
| 🔴 P0 | **Fix the uMyID / sorted-array mismatch.** Either stop sorting the shader arrays, or pass each body a remapped ID that reflects its position in the sorted array. | 1 hour |
| 🔴 P0 | **Pre-allocate scratch vectors** in `computeAccelerations()` to eliminate ~650K allocations/sec. | 30 min |
| 🟡 P1 | **Fix comet `initialVel` reference before assignment** on first crash. Store initial values at spawn time, not after crash detection. | 10 min |
| 🟡 P1 | **Remove dead sorting code** in `multistellar_projective_demo.html` L294-299. | 5 min |
| 🟢 P2 | **Add `.gitignore`** with `.DS_Store`. | 1 min |

### 5.2 Architectural Improvements

1. **Extract shared code into a module.** Create a `shared/engine.js` with `CelestialBody`, `makeBodyMaterial()`, the physics integrator, and the CoM update logic. Each demo imports and configures it differently. This reduces 4×700 lines to 1×500 + 4×200.

2. **Use a uniform buffer or texture for body data.** Instead of N separate uniform arrays (`uBodyPos[30]`, `uBodyRadius[30]`, etc.), pack all body data into a `DataTexture` or `THREE.UniformsGroup`. This scales better and avoids the `MAX_BODIES` compile-time constant.

3. **Physically correct penumbra.** Replace the fixed `soft = 0.45` with:
   ```glsl
   float soft = starRadius * t / distToStar;  // Angular penumbra width
   ```
   This gives geometrically accurate penumbra scaling with distance.

4. **Energy monitoring.** For a simulation claiming "true N-body," display the total system energy (kinetic + potential) in the status bar. In a symplectic integrator, total energy should oscillate around a constant. If it diverges, the timestep is too large or softening is wrong.

5. **Tone mapping consistency.** The renderer has `THREE.ACESFilmicToneMapping` set, but the fragment shader also does its own Reinhard tonemapping (`col / (col + 1.0)`) and gamma correction (`pow(col, 1/2.2)`). This means the output is **double-tonemapped and double-gamma-corrected**. Either disable the Three.js tonemapping or remove the shader's own.

### 5.3 Documentation & Framing

> **💡 Recalibrate the theoretical language.** The technique is genuinely useful and well-implemented. It doesn't need to be dressed up in projective geometry / CGA / Clifford algebra terminology that isn't reflected in the code. A more accurate description would be:
>
> *"A real-time N-body celestial renderer that computes per-fragment analytic sphere shadows directly in the fragment shader, stabilized by rendering in the Center-of-Mass frame to avoid float32 precision loss."*
>
> This is honest, searchable, and still sounds impressive — because it is.

### 5.4 Feature Suggestions

1. **Orbit trails.** Use a `THREE.BufferGeometry` line with a ring buffer to show the last N positions of each body. This would dramatically improve the visual understanding of the chaotic dynamics.

2. **Collision detection and merging.** When two bodies overlap significantly, merge their masses, conserve momentum, and flash the merged body. This would add physical realism and visual drama.

3. **Starfield background.** A simple skybox or particle field of distant stars would massively improve the visual quality with minimal effort.

4. **GitHub Pages deployment.** The HTML files are self-contained — deploying them to GitHub Pages would let people interact with the demos directly from the repository.

---

## 6. Summary Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Sanity** | 7/10 | Runs correctly, but has UI text mismatches, dead code, and a committed `.DS_Store` |
| **Correctness** | 6/10 | Physics integrator is correct, but the shader ID bug after sorting breaks self-shadow exclusion; double tonemapping; fixed penumbra width |
| **Novelty** | 5.5/10 | The conceptual synthesis (inverted-frame rendering architecture) is independently developed with documented 2020 provenance. The individual code techniques are standard. The theoretical vocabulary (CGA/Clifford) exceeds what the code implements |
| **Code Quality** | 5/10 | Massive duplication across 4 files; excessive heap allocations; no modularity; no tests |
| **Visual Impact** | 8/10 | The demos are genuinely impressive to watch — chaotic multi-stellar systems with real-time shadows running in a browser |
| **Documentation** | 6/10 | Thorough but overfit to theoretical claims that don't match the implementation |

### Bottom Line

The **implementation is good**; the **framing needs grounding**. The core rendering trick (brute-force analytic sphere shadows in the fragment shader + CoM frame stabilization) is effective, practical, and produces visually compelling results. The project would be significantly strengthened by fixing the shader ID bug, reducing code duplication, and reframing the theoretical contributions to match what the code actually does.

---

*Review generated by Claude Opus 4.6 (Thinking) at the request of the project author.*
