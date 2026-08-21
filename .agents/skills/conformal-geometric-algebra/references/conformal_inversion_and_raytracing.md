# Conformal Dual Inversion, Raytracing & GPU Shader Patterns

This reference details the practical computational workflows for Conformal Dual Spherical Inversion, mesh-free analytic raytracing, and GPU shader implementation in WebGPU / WGSL.

---

## 1. Conformal Dual Spherical Inversion

In 5D Conformal Geometric Algebra, reflection in an inversion sphere $S_{\text{inv}} = e_0 - \frac{1}{2}R_s^2 e_\infty$ of radius $R_s$ centered at the origin transforms any conformal point $P(\mathbf{x})$:

$$P(\mathbf{x}^*) = -S_{\text{inv}} P(\mathbf{x}) S_{\text{inv}}^{-1}$$

### Coordinate Map
Evaluating this sandwich product yields the 3D coordinate transformation:

$$\mathbf{x}^* = \frac{R_s^2 \mathbf{x}}{\|\mathbf{x}\|^2 + \epsilon}$$

### Fundamental Mathematical Invariants
1. **Exact Involution**:
   Applying the transformation twice returns the original point identically:
   $$(\mathbf{x}^*)^* = \frac{R_s^2 \left(\frac{R_s^2 \mathbf{x}}{\|\mathbf{x}\|^2}\right)}{\left\|\frac{R_s^2 \mathbf{x}}{\|\mathbf{x}\|^2}\right\|^2} = \frac{R_s^4 \mathbf{x} / \|\mathbf{x}\|^2}{R_s^4 / \|\mathbf{x}\|^2} = \mathbf{x}$$
2. **Fixed Horizon Invariant**:
   Any point lying on the inversion sphere of radius $R_s$ maps to itself:
   $$\|\mathbf{p}\| = R_s \implies \|\mathbf{p}^*\| = \frac{R_s^2 R_s}{R_s^2} = R_s$$
3. **Conformal Sphere Radius Transformation**:
   A sphere with center $\mathbf{c}$ and radius $r$ transforms into an inverted dual sphere with radius:
   $$r^* = \text{clamp}\left(\frac{r \cdot R_s^2}{|\|\mathbf{c}\|^2 - r^2| + \epsilon},\, r_{\text{min}},\, r_{\text{max}}\right)$$

---

## 2. Analytic Raytracing via CGA Intersection

### Ray Representation
A ray starting at $\mathbf{r}_0$ with unit direction $\mathbf{d}$ is parameterized by $t \ge 0$:
$$\mathbf{r}(t) = \mathbf{r}_0 + t \mathbf{d}$$

### Half-$b$ Formulation for Ray-Sphere Intersection
For a sphere with center $\mathbf{c}$ and radius $r$:
- Vector to origin: $\mathbf{oc} = \mathbf{r}_0 - \mathbf{c}$
- Half-$b$: $b = \mathbf{oc} \cdot \mathbf{d}$
- Scalar $c$: $c = \|\mathbf{oc}\|^2 - r^2$
- Discriminant: $\Delta = b^2 - c$

#### Root Evaluation:
$$\Delta < 0 \implies \text{Miss (no real intersection)}$$
$$\Delta \ge 0 \implies t = -b - \sqrt{\Delta} \quad (\text{if } t < 0.001, \text{ fallback to } t = -b + \sqrt{\Delta})$$

Surface normal at hit point $\mathbf{p} = \mathbf{r}_0 + t \mathbf{d}$:
$$\mathbf{N} = \frac{\mathbf{p} - \mathbf{c}}{\|\mathbf{p} - \mathbf{c}\|}$$

---

## 3. GPU / WGSL Implementation Patterns

### Compact Vector Representation (Memory Friendly)
Instead of storing 32 multivector coefficients on the GPU, pack geometric primitives into aligned `vec4f` vectors:

```wgsl
struct CGASphere {
    center: vec3f, // x, y, z
    radius: f32    // r (IPNS vector: center.xyz, 0.5*(||center||^2 - r^2), 1.0)
};

// WGSL Dual Inversion Functions:
fn cgaInvertPoint(p: vec3f, RsSq: f32, eps: f32) -> vec3f {
    let r2 = dot(p, p);
    return (RsSq / (r2 + eps)) * p;
}

fn cgaInvertRadius(center: vec3f, r: f32, RsSq: f32, eps: f32) -> f32 {
    let r2 = dot(center, center);
    let denom = abs(r2 - r * r) + eps;
    return clamp((r * RsSq) / denom, 0.4, 12.0);
}
```

### Soft Projective Shadow Penumbra
To compute physically-motivated soft penumbras across $S$ light sources and $N$ occluders:

```wgsl
fn computeShadow(fragmentPos: vec3f, starPos: vec3f, starRadius: f32, occluderPos: vec3f, occluderRadius: f32) -> f32 {
    let toStar = starPos - fragmentPos;
    let distStar = length(toStar);
    let rayDir = toStar / max(distStar, 1e-4);

    let toOcc = occluderPos - fragmentPos;
    let proj = dot(toOcc, rayDir);

    // Occluder is behind fragment or beyond the star
    if (proj <= 0.0 || proj >= distStar) {
        return 1.0;
    }

    let perpDistSq = dot(toOcc, toOcc) - proj * proj;
    let perpDist = sqrt(max(perpDistSq, 0.0));

    // Dynamic penumbra width proportional to distance and star angular size
    let penumbra = (starRadius * proj) / max(distStar - proj, 1.0) + occluderRadius;
    return smoothstep(occluderRadius * 0.8, penumbra, perpDist);
}
```
