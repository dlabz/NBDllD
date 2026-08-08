# Architectural Analysis: N-Body Projective Inverted Occlusion

This document provides a grounded technical analysis of the implementation in `nbody_projective_v2.html`, comparing it against established rendering and simulation techniques, evaluating its efficiency, and outlining paths for generalization.

## 1. Comparison to Existing Approaches

### N-Body Simulations
- **Current Approach**: The v2 implementation uses a direct O(N²) summation for gravity, integrated via a 4-substep Velocity Verlet symplectic integrator.
- **Comparison**: Standard astrophysical N-body codes (like REBOUND) use similar symplectic integrators because they conserve energy over long periods (as verified by the demo's drift monitor). However, direct O(N²) summation is typically abandoned for N > 10³ in favor of tree codes (Barnes-Hut, O(N log N)) or Fast Multipole Methods (FMM, O(N)). For N=30, the brute-force approach is actually *faster* than tree codes due to the lack of tree-building overhead and branching prediction penalties.

### Raytracing Approaches
- **Current Approach**: Forward rasterization combined with analytic ray-sphere intersections evaluated entirely within the fragment shader. For each fragment on a body, it casts rays to $S$ stars and checks for intersections against all $N$ bodies to compute a physically-motivated soft penumbra.
- **Comparison**: Traditional raytracing builds a Bounding Volume Hierarchy (BVH) to reduce intersection tests from O(N) to O(log N). This implementation brute-forces the O(N) intersections per fragment. Because there is no recursive bouncing (only direct shadow rays) and N is small, it avoids the memory and control-flow divergence overhead of traversing a BVH on the GPU. It behaves closer to Shadertoy-style analytic raymarching than traditional path tracing.

### 3D Gaussian Splatting (3DGS)
- **Conceptual Duality**: The author's 2020 concept of "inclusive normals" on the inner side of a sphere shares a philosophical lineage with projecting volumetric regions (splats) to a 2D plane. Both move away from the "hard" exclusive surface normal of traditional rasterization towards a probabilistic or regional contribution to the pixel.
- **Operational Differences**: 3DGS is an optimization algorithm that differentiably renders millions of learned 3D Gaussians to reconstruct scenes from photographs. This implementation is an analytic, forward-simulated physics engine rendering discrete spheres. Where 3DGS sorts primitives to blend them (α-compositing), this implementation uses a commutative `max()` operator for occlusion, completely bypassing the need for depth sorting.

### Sparse Voxel Octrees (SVOs)
- **Structure**: SVOs discretize space into a hierarchical grid, allowing rapid skipping of empty space during ray traversal.
- **Comparison**: This implementation maintains continuous analytic geometry (exact spheres). An SVO would introduce discretization artifacts (voxel "blockiness") unless heavily refined, consuming significant memory. For small N, the O(N) analytic check is vastly more cache-coherent and mathematically precise than walking a sparse octree. SVOs excel at static, highly complex topology; they struggle with dynamic N-body systems where the tree must be rebuilt every frame.

---

## 2. Overall Efficiency Evaluation

*Evaluated on the optimized `nbody_projective_v2.html` implementation.*

- **Physics CPU (O(N²))**: With the v2 memory fixes (0 heap allocations per frame via pre-allocated scratch vectors), the CPU effortlessly handles N=30. The JS thread limit for this brute-force approach will be hit around N ≈ 1,000–2,000.
- **Rendering GPU (O(S × N) per fragment)**: The fragment shader iterates $S$ stars and $N$ bodies for every pixel of every celestial body. For S=3, N=30, this is 90 iterations per fragment. Modern GPUs easily dispatch this. However, this O(S×N) complexity places a hard cap on scalability; at N=1000, 3000 iterations per fragment would severely bottleneck fill-rate.
- **Coordinate Stability**: Subtracting the Center of Mass (CoM) on the CPU and sending local coordinates to the GPU is a highly efficient, standard aerospace technique (floating-point rebasing) that prevents float32 jitter far from the origin.

---

## 3. Next Steps & Generalizations

While the current implementation is an excellent, stable proof-of-concept for small N-body systems, scaling it requires bridging the gap to the theoretical frameworks described in the project's documentation.

### Step 1: Scale the Physics (Compute Shaders)
To move beyond N=30 to N=10,000, the O(N²) gravity summation must be moved off the CPU. Porting the Velocity Verlet integrator to a WebGPU Compute Shader would allow the GPU to simulate the physics in parallel, keeping the position data on the GPU entirely.

### Step 2: Scale the Shadows (Spatial Partitioning or Shadow Maps)
The O(S×N) fragment shader loop will fail at large N. Generalizing this requires:
- **Classic approach**: Cascaded Shadow Maps (CSM) for the stars, dropping analytic precision for performance.
- **Projective approach**: Rendering the spheres into a G-Buffer, and using a projective light volume pass to calculate shadows only where they intersect fragments, rather than checking every fragment against every body.

### Step 3: The Clifford Algebra / CGA Bridge
To realize the true "Projective Inverted Occlusion" theory, the next major architectural iteration should implement actual Conformal Geometric Algebra (CGA) representations in the shader. 
- Currently, the code operates in standard Euclidean $\mathbb{R}^3$.
- In CGA, spheres and rays become vectors in a higher-dimensional space (e.g., 5D conformal space $\mathbb{R}^{4,1}$).
- Intersections, reflections, and shadowing can be computed via geometric products rather than Euclidean dot products and distance checks. This would unify the "inverted normal" concept into a single mathematical framework, aligning the implementation with the theoretical documentation and potentially uncovering novel optimization pathways for rendering analytic geometry.
