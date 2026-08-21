# WGSL Numerical Stability & Hardware Hazards (macOS Metal / AMD / Apple Silicon)

This reference documents known hardware-specific shader hazards, IEEE-754 floating-point edge cases, and mandatory WGSL defensive coding patterns to prevent GPU panics, device loss, or `vec3(NaN)` visual corruption.

---

## 1. Zero-Length Vector Normalization Guards

### The Hazard
On Metal and AMD Radeon backends, dividing by zero in `normalize(v)` or `v / length(v)` does not always produce silent zeros; it produces `vec3(NaN)` or `vec3(Inf)` that rapidly propagates through the entire lighting equation, turning entire tiles or frames black or white.

### The Mandatory WGSL Pattern
Always compute length, test against a conservative threshold (e.g. `1e-5`), and use `select()`:

```wgsl
// SAFE WGSL Normalization:
fn safeNormalize(v: vec3f, fallback: vec3f) -> vec3f {
    let len = length(v);
    return select(fallback, v / len, len > 1e-5);
}

// Example usage on surface normals:
let N = safeNormalize(hitPos - sphereCenter, vec3f(0.0, 1.0, 0.0));
```

#### JavaScript Equivalent:
```javascript
function normalize3(v, fallback = [0, 1, 0]) {
    const len = Math.hypot(v[0], v[1], v[2]);
    return len > 1e-6 ? [v[0] / len, v[1] / len, v[2] / len] : fallback;
}
```

---

## 2. Exponentiation (`pow`) Base Clamping

### The Hazard
In WGSL / Metal shaders, `pow(x, y)` where $x < 0$ or $x > 1$ with fractional powers produces undefined behavior or `NaN`. Grazing angle dot products `dot(N, V)` can produce negative numbers due to floating-point imprecision even when the angle is mathematically $\ge 90^\circ$.

### The Mandatory WGSL Pattern
Always clamp the base operand into $[0.0, 1.0]$:

```wgsl
// SAFE Fresnel Exponentiation:
let NdotV = clamp(dot(N, V), 0.0, 1.0);
let fresnel = pow(clamp(1.0 - NdotV, 0.0, 1.0), 3.0);

// SAFE Specular Exponentiation:
let NdotH = clamp(dot(N, H), 0.0, 1.0);
let specular = pow(clamp(NdotH, 0.0, 1.0), 32.0);
```

---

## 3. Analytic Quadratic Ray-Sphere Intersection (Half-$b$ Formulation)

### The Math & Shader Formulation
Ray: $\mathbf{r}(t) = \mathbf{r}_0 + t \mathbf{d}$, Sphere center: $\mathbf{c}$, Radius: $r$.

Using the half-$b$ optimization eliminates two multiplications and prevents internal numerical cancellation:

```wgsl
struct RayHit {
    hit: bool,
    t: f32,
    normal: vec3f
};

fn intersectSphere(ro: vec3f, rd: vec3f, center: vec3f, radius: f32) -> RayHit {
    var result: RayHit;
    result.hit = false;
    result.t = 1e6;
    result.normal = vec3f(0.0);

    let oc = ro - center;
    let b = dot(oc, rd);
    let c = dot(oc, oc) - radius * radius;
    let discriminant = b * b - c;

    if (discriminant < 0.0) {
        return result;
    }

    let sqrtDisc = sqrt(max(discriminant, 0.0));
    var t = -b - sqrtDisc;

    // If intersection is behind ray origin, check second root
    if (t < 0.001) {
        t = -b + sqrtDisc;
    }

    if (t > 0.001) {
        result.hit = true;
        result.t = t;
        let hitPos = ro + rd * t;
        result.normal = safeNormalize(hitPos - center, vec3f(0.0, 1.0, 0.0));
    }

    return result;
}
```

---

## 4. 5D CGA Dual Inversion Singularity Regularization

In 5D Conformal Geometric Algebra dual space, coordinates are mapped via:
$$\mathbf{x}^* = \frac{R_s^2 \mathbf{x}}{\|\mathbf{x}\|^2 + \epsilon}$$

To prevent catastrophic division-by-zero when a body approaches the coordinate origin $\mathbf{x} \to \mathbf{0}$:
1. Always inject a non-zero regularization $\epsilon \ge 1e-4$.
2. Model the core as an omnidirectional radiant singularity with bounded potential falloff.

```wgsl
fn cgaInvertPoint(p: vec3f, RsSq: f32, eps: f32) -> vec3f {
    let r2 = dot(p, p);
    return (RsSq / (r2 + eps)) * p;
}

fn cgaInvertRadius(p: vec3f, r: f32, RsSq: f32, eps: f32) -> f32 {
    let r2 = dot(p, p);
    let denom = abs(r2 - r * r) + eps;
    return clamp((r * RsSq) / denom, 0.4, 12.0);
}
```
