---
name: conformal-geometric-algebra
description: >-
  Comprehensive engineering workflows, mathematical foundations, and shader implementations for nD Conformal Geometric Algebra (CGA) and 5D CGA (G(4,1)). Covers null bases (e0, e_inf), conformal point embeddings, geometric primitives (spheres, planes, circles, lines), versor transformations (rotors, motors, dilators, spherical inversions), analytic ray-primitive intersections, and dual-space projective rendering on WebGPU/WGSL. Activate when developing, refactoring, or verifying CGA multivector math, dual spherical inversions, or analytic geometric raytracing.
---

# 🔮 nD Conformal Geometric Algebra (CGA) Skill

This skill provides mathematical specifications, multivector algebras, algebraic primitive representations, versor transformation pipelines, and GPU shader implementations for **Conformal Geometric Algebra** in $n$ dimensions ($\mathcal{G}(n+1, 1)$), specializing in 5D CGA ($\mathcal{G}(4, 1)$).

---

## 1. Quick Reference & Mathematical Guides

- [Mathematical Foundations of CGA ($\mathbb{R}^{n+1, 1}$ Embedding & Null Bases)](./references/cga_math_foundations.md)
- [Geometric Primitives (Spheres, Planes, Circles, Lines, Point Pairs)](./references/geometric_primitives.md)
- [Conformal Dual Inversion, Raytracing & GPU Shader Patterns](./references/conformal_inversion_and_raytracing.md)

---

## 2. Core CGA Algebraic Rules & Representations

### Conformal Point Embedding ($\mathbb{R}^n \to \mathbb{R}^{n+1, 1}$)
Every Euclidean coordinate $\mathbf{x} \in \mathbb{R}^n$ maps to a null vector $P(\mathbf{x})$:

$$P(\mathbf{x}) = \mathbf{x} + \frac{1}{2}\|\mathbf{x}\|^2 e_\infty + e_0$$

- **Null Invariant**: $P(\mathbf{x})^2 = 0$.
- **Metric Distance**: $P(\mathbf{x}) \cdot P(\mathbf{y}) = -\frac{1}{2}\|\mathbf{x} - \mathbf{y}\|^2$.
- **Null Bases**: $e_0^2 = 0$, $e_\infty^2 = 0$, $e_0 \cdot e_\infty = -1$.

### Primitive Representations in IPNS (Inner Product Null Space)
A point $X = P(\mathbf{x})$ lies on entity $G$ if $X \cdot G = 0$:

| Primitive | Algebraic Formula | IPNS Grade |
| :--- | :--- | :--- |
| **Point** | $P(\mathbf{x}) = \mathbf{x} + \frac{1}{2}\|\mathbf{x}\|^2 e_\infty + e_0$ | 4 (Dual Point) |
| **Sphere** | $S = P(\mathbf{c}) - \frac{1}{2}r^2 e_\infty = \mathbf{c} + \frac{1}{2}(\|\mathbf{c}\|^2 - r^2) e_\infty + e_0$ | 1 (Vector) |
| **Plane** | $\pi = \mathbf{n} + d\, e_\infty$ | 1 (Vector) |
| **Circle** | $C^* = S_1 \wedge S_2$ | 2 (Bivector) |
| **Line** | $L^* = \mathbf{d} I_3 + (\mathbf{p} \times \mathbf{d}) I_3 e_\infty$ | 2 (Bivector) |
| **Point Pair** | $P_p^* = S_1 \wedge S_2 \wedge S_3$ | 3 (Trivector) |

---

## 3. Conformal Transformations (Versor Algebra)

Transformations are executed as sandwich products $X' = V X V^{-1}$:

- **Translator**: $T = 1 - \frac{1}{2}\mathbf{t} e_\infty$
- **Rotor (Rotation)**: $R = \cos\left(\frac{\theta}{2}\right) - B \sin\left(\frac{\theta}{2}\right)$
- **Motor (Rigid Body Motion)**: $M = T R$
- **Dilator (Scaling by $\gamma$)**: $D = \frac{1+\gamma}{2\sqrt{\gamma}} + \frac{1-\gamma}{2\sqrt{\gamma}} (e_\infty \wedge e_0)$
- **Spherical Inversion**: $X^* = -S_{\text{inv}} X S_{\text{inv}}^{-1}$
  $$\mathbf{x}^* = \frac{R_s^2 \mathbf{x}}{\|\mathbf{x}\|^2 + \epsilon}$$

---

## 4. WebGPU & WGSL Implementation Workflows

When deploying CGA math to WebGPU shaders:

1. **Avoid 32-Float Bloat**: Pack 5D geometric entities into compact GPU struct layouts (`vec4f` / `vec3f` + scalar pairs) rather than generating full $2^5$ multivectors.
2. **Safely Regularize Origins**: Always guard inversion denominators with $\epsilon \ge 1e-4$ to eliminate division-by-zero at $\mathbf{x} \to \mathbf{0}$.
3. **Analytic Half-$b$ Intersections**:
   Use discriminant $\Delta = b^2 - c$ with $b = \mathbf{oc} \cdot \mathbf{d}$ and $c = \|\mathbf{oc}\|^2 - r^2$.

---

## 5. Verification Checklist

1. **Involution Verification**: Verify $(\mathbf{x}^*)^* = \mathbf{x}$ for arbitrary points $\mathbf{x}$.
2. **Fixed Horizon Verification**: Check that points on $\|\mathbf{p}\| = R_s$ map to themselves $\|\mathbf{p}^*\| = R_s$.
3. **Browser Test Suite**: Run [`tests/test_runner.html`](file:///Users/dlabz/Workspace_AI/3DGSIL/tests/test_runner.html) and verify 100% green pass on all CGA inversion tests.
