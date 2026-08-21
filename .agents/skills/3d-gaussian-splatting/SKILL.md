---
name: 3d-gaussian-splatting
description: >-
  Comprehensive workflows, mathematical foundations, and WebGPU/WGSL shader implementations for 3D Gaussian Splatting (3DGS). Covers 3D covariance parameterization (Sigma = R S S^T R^T), 2D EWA projective Jacobian (J), screen-space conic inversion, spherical harmonics radiance, tile-based compute rasterization, front-to-back alpha compositing, and comparisons with projective inverted occlusion. Activate when developing, refactoring, or optimizing 3D Gaussian Splatting pipelines or hybrid volumetric splatting shaders.
---

# 🎆 3D Gaussian Splatting (3DGS) Skill

This skill provides mathematical foundations, projective transformation algorithms, Spherical Harmonics color evaluators, and WebGPU/WGSL tile-based rasterization pipelines for **3D Gaussian Splatting**.

---

## 1. Quick Reference & Architectural Guides

- [Mathematical Foundations & 2D EWA Projection](./references/gaussian_math_and_projection.md)
- [Spherical Harmonics & Volumetric $\alpha$-Compositing](./references/spherical_harmonics_and_shading.md)
- [WebGPU 3DGS Preprocessing & Tile Rasterizer Pipeline](./references/webgpu_rasterization_pipeline.md)

---

## 2. Core 3DGS Mathematical Formulations

### 3D Covariance Decomposition
A 3D Gaussian centered at $\boldsymbol{\mu} \in \mathbb{R}^3$ has covariance:

$$\boldsymbol{\Sigma} = \mathbf{R} \mathbf{S} \mathbf{S}^\top \mathbf{R}^\top$$

where $\mathbf{S} = \text{diag}(s_x, s_y, s_z)$ and $\mathbf{R} = \mathbf{R}(\mathbf{q})$ from unit quaternion $\mathbf{q}$.

### 2D Screen Projection (EWA Filter)
With viewing transformation $\mathbf{W}$ and projective Jacobian $\mathbf{J}$:

$$\boldsymbol{\Sigma}' = \mathbf{J} \mathbf{W} \boldsymbol{\Sigma} \mathbf{W}^\top \mathbf{J}^\top, \quad \boldsymbol{\Sigma}_{\text{screen}} = \boldsymbol{\Sigma}' + 0.3 \mathbf{I}_{2 \times 2}$$

### Screen-Space Conic Representation
The inverse 2D covariance $\boldsymbol{\Sigma}_{\text{screen}}^{-1} = \begin{bmatrix} A & B \\ B & C \end{bmatrix}$ defines the pixel density:

$$G_{2D}(\mathbf{p}) = \exp\left(-\frac{1}{2}\left(A (x - \mu_x)^2 + 2 B (x - \mu_x)(y - \mu_y) + C (y - \mu_y)^2\right)\right)$$

### Front-to-Back Volumetric $\alpha$-Compositing
For depth-sorted Gaussians $1 \dots N$:

$$\mathbf{C} = \sum_{i=1}^N \mathbf{c}_i \alpha_i \prod_{j=1}^{i-1}(1 - \alpha_j), \quad \alpha_i = o_i G_{2D, i}(\mathbf{p})$$

---

## 3. WebGPU Compute & Rasterization Architecture

1. **Stage 1 (Compute Preprocessing)**:
   - Evaluates $\boldsymbol{\Sigma}$, frustum culling, $\mathbf{J}$, screen conic $(A, B, C)$, and Spherical Harmonics color.
2. **Stage 2 (GPU Radix Sort)**:
   - Sorts Gaussians by 64-bit keys: `[32-bit tile_id | 32-bit view_depth]`.
3. **Stage 3 (Tile-Based Compute Rasterizer)**:
   - Uses $16 \times 16$ pixel workgroups.
   - Cooperatively loads batches of sorted Gaussians into `var<workgroup>` shared memory.
   - Accumulates color $\mathbf{C}$ and exits early when transmittance $T < 0.001$.

---

## 4. Conceptual Lineage & 3DGSIL Duality

- **Provenance**: The concept of "inclusive normals" on the inner side of a sphere (documented since Oct 2020) shares philosophical roots with 3DGS volumetric regional projections.
- **Sorting vs Commutative Max**: Where 3DGS requires explicit depth sorting ($O(N \log N)$), 3DGSIL uses a commutative $\max()$ operator and 5D CGA conformal dual spherical inversions ($\mathbf{x}^* = \frac{R_s^2 \mathbf{x}}{\|\mathbf{x}\|^2 + \epsilon}$) to render continuous analytic shadows without sorting.
