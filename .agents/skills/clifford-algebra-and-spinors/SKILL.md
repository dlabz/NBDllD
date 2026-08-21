---
name: clifford-algebra-and-spinors
description: >-
  Comprehensive engineering workflows, mathematical foundations, and shader implementations for nD Clifford Algebras Cl(p,q,r), Spinors, Rotors, and Spin groups Spin(p,q). Covers geometric products, grade decomposition, bivector Lie algebras so(p,q), spinor spaces as minimal left ideals, multi-rotor Euler-Cartan decompositions, rotor SLERP interpolation, and WGSL shader algorithms. Activate when developing, refactoring, or verifying Clifford algebra multivector math, spinor rotations, or geometric transformations.
---

# 🌀 $n\text{D}$ Clifford Algebra & Spinors Skill

This skill provides mathematical foundations, multivector algebras, spinor spaces, rotor transformations, and GPU shader implementations for **Clifford Algebras** $\mathcal{Cl}(p, q, r)$ across arbitrary dimensions $n = p + q + r$.

---

## 1. Quick Reference & Mathematical Guides

- [Mathematical Foundations of Clifford Algebras $\mathcal{Cl}(p, q, r)$](./references/clifford_algebra_foundations.md)
- [Spinors, Rotors & The Spin Group $\text{Spin}(p, q)$](./references/spinors_and_rotors.md)
- [Spinor Computations, SLERP & WGSL Shader Patterns](./references/spinor_computations_and_shaders.md)

---

## 2. Core Clifford Algebra Operations

### Fundamental Relations
For an orthogonal basis $\{e_1, \dots, e_n\}$ with signature $(p, q, r)$:

$$e_i e_j + e_j e_i = 2 \eta_{ij} \mathbf{1}, \quad u v = u \cdot v + u \wedge v$$

- **Grade Decomposition**: $A = \sum_{k=0}^n \langle A \rangle_k$ (total dimension $2^n$).
- **Reversion**: $\widetilde{e_{i_1} \dots e_{i_k}} = (-1)^{\frac{k(k-1)}{2}} e_{i_1} \dots e_{i_k}$.
- **Grade Involution**: $\hat{A} = \sum_{k=0}^n (-1)^k \langle A \rangle_k$.
- **Even Subalgebra $\mathcal{Cl}^+$**: Closed subalgebra of even grade blades, dimension $2^{n-1}$.

---

## 3. Spinors, Rotors & Transformation Sandwiches

### Rotor Definition & Action
A rotor $R \in \text{Spin}(p, q)$ satisfies $R \tilde{R} = 1$:

$$R = \exp\left(-\frac{\theta}{2} B\right) = \cos\left(\frac{\theta}{2}\right) - B \sin\left(\frac{\theta}{2}\right)$$

where $B$ is a unit bivector in the plane of rotation ($B^2 = -1$).

- **Vector Transformation**: $\mathbf{v}' = R \mathbf{v} \tilde{R} = R \mathbf{v} R^{-1}$.
- **Lie Algebra Connection**: Commutator of bivectors $\mathcal{Cl}^2(p, q) \cong \mathfrak{so}(p, q)$.
- **Multi-Rotor Decomposition**: In $n\text{D}$, every rotation factors into $\lfloor n/2 \rfloor$ commuting simple planar rotations.

---

## 4. WebGPU & WGSL Implementation Workflows

When implementing Clifford Algebra and Spinors on WebGPU:

1. **Avoid Generic Multivector Overhead**:
   - In 3D ($\mathcal{Cl}(3,0)$), pack rotors into `vec4f` ($s = \cos(\theta/2)$, $\mathbf{b} = [b_{yz}, b_{zx}, b_{xy}]$).
   - Use direct vector sandwich formulas:
     $$\mathbf{v}' = \mathbf{v} + 2 s (\mathbf{b} \times \mathbf{v}) + 2 (\mathbf{b} \times (\mathbf{b} \times \mathbf{v}))$$
2. **Shortest Geodesic SLERP**:
   - When interpolating rotors, check $\langle R_0 \tilde{R}_1 \rangle_0 \ge 0$. If negative, flip sign $R_1 \to -R_1$ to guarantee shortest path on $\text{Spin}(n)$.
3. **Safe Normalization**:
   - Always guard bivector and rotation axis normalization against zero-length vectors using `select()`.

---

## 5. Verification Checklist

1. **Normalization Invariant**: Verify $R \tilde{R} = 1$ for all constructed rotors.
2. **Isometry Invariant**: Verify $\|R \mathbf{v} \tilde{R}\| = \|\mathbf{v}\|$ for arbitrary vectors $\mathbf{v}$.
3. **Algebraic Inversion**: Verify $(R_1 R_2)^{-1} = \tilde{R}_2 \tilde{R}_1$.
4. **Browser Test Suite**: Run [`tests/test_runner.html`](file:///Users/dlabz/Workspace_AI/3DGSIL/tests/test_runner.html) to verify matrix inverses and orthogonal orientation transforms.
