# 3DGSIL: Projective Inverted Occlusion & N-Body Simulation

This repository implements a real-time, multi-body celestial renderer using a concept called **Projective Inverted Occlusion**. It couples a symplectic N-body physics engine with an analytic forward-rendering pipeline, exploring the geometric concept of "inclusive normals" on the inner side of spheres (a conceptual precursor to volumetric projecting techniques like 3D Gaussian Splatting, with provenance dating back to 2020).

## Core Architecture

The implementation relies on three foundational pillars:
1.  **Symplectic Integration**: Velocity Verlet (or Symplectic Euler in GPGPU) is used for the physics, preserving orbital energy over long timescales without severe drift.
2.  **Floating-Point Rebasing**: The coordinate system is dynamically shifted to the Center of Mass (CoM) to prevent float32 jitter and stability issues far from the origin.
3.  **Analytic Per-Fragment Shadows**: Instead of shadow maps, the fragment shader casts rays toward $S$ light sources and computes exact ray-sphere intersections against all $N$ occluders to generate physically-motivated soft penumbras based on the star's angular radius.

---

## Architectural Comparisons

### vs. Traditional N-Body Simulations
Standard astrophysical N-body codes (e.g., REBOUND) rely on tree algorithms like Barnes-Hut $O(N \log N)$ or Fast Multipole Methods $O(N)$ for scalability. 
*   **This implementation**: Uses a brute-force $O(N^2)$ direct summation. While asymptotically inferior, for small $N$ ($N \le 1024$), direct summation on a GPU (as seen in the GPGPU `v3` implementation) is often faster due to the lack of tree-building overhead and zero branching/divergence penalties.

### vs. Traditional Raytracing
Traditional raytracing builds a Bounding Volume Hierarchy (BVH) to reduce intersection tests from $O(N)$ to $O(\log N)$.
*   **This implementation**: Uses a hybrid forward-rasterization approach. It rasterizes the spheres normally, but the fragment shader brute-forces $O(N)$ analytic shadow intersections. Because there are no recursive bounces and $N$ is small, it avoids the massive memory and control-flow overhead of GPU BVH traversal, functioning closer to Shadertoy-style raymarching.

### vs. 3D Gaussian Splatting (3DGS)
3DGS is an optimization algorithm that differentiably renders millions of learned 3D Gaussians (sorted by depth) to reconstruct scenes from photographs.
*   **This implementation**: Shares a philosophical lineage with 3DGS — specifically the concept of "inclusive normals" that project regions rather than hard surface intersections. However, operationally, this is an analytic, forward-simulated physics engine rendering discrete spheres. It uses a commutative `max()` operator for occlusion rather than $\alpha$-compositing, completely bypassing the need for depth sorting.

### vs. Sparse Voxel Octrees (SVOs)
SVOs discretize space into a hierarchical grid, allowing rapid skipping of empty space during ray traversal.
*   **This implementation**: Maintains continuous analytic geometry (exact spheres). SVOs introduce discretization artifacts ("blockiness") unless heavily refined, consuming significant memory. For dynamic, chaotic N-body systems, rebuilding an SVO every frame is prohibitively expensive compared to this implementation's stateless $O(N)$ continuous checks.

---

## Bottlenecks & Limitations

1.  **The $O(S \times N)$ Fragment Shader Loop**: For every pixel of every celestial body on screen, the fragment shader iterates over all $S$ stars, and inside that, iterates over all $N$ bodies to check occlusion. If $N=1024$ and $S=3$, that is 3,072 loops per fragment. This places a massive burden on GPU fill-rate and is the primary bottleneck for visual scaling.
2.  **The $O(N^2)$ Gravity Pairs**: Even on a GPU, brute-force gravity scales poorly. At $N=16,384$, a single step requires 268 million pair evaluations. Memory bandwidth (reading positions) becomes the limiting factor before pure compute.

---

## Next Steps, Improvements, and Generalizations

### 1. Solving the $O(N^2)$ Pair Bottleneck (Parallelization)
To scale beyond $N=1024$, the physics engine must be moved from WebGL2 GPGPU textures to **WebGPU Compute Shaders**.
*   **Shared Memory Tiling**: In WebGPU, we can use threadgroup shared memory to load a "tile" of positions into fast on-chip cache. Threads can then compute gravity against the cached tile before loading the next one. This dramatically reduces VRAM bandwidth, making $O(N^2)$ viable up to $N \approx 16k$.
*   **Spatial Hashing**: For $N > 16k$, moving to a GPU-based spatial hash grid (similar to fluid simulations) can cull distant interactions, effectively reducing the complexity toward $O(N)$.

### 2. Generalizing the Rendering (Deferred Shadow Volumes)
To fix the $O(S \times N)$ fragment bottleneck, the rendering pipeline must be generalized from forward to deferred:
*   Render the spheres to a G-Buffer (Position, Normal, Albedo).
*   Instead of checking every fragment against every body, render the shadows as **projective light volumes** (cones projecting away from the stars). Only fragments inside the volume compute the analytic penumbra, decoupling $N$ from the screen resolution.

### 3. The Clifford Algebra / CGA Bridge
The ultimate theoretical goal of this project is to implement true "Projective Inverted Occlusion" using Conformal Geometric Algebra (CGA).
*   Currently, the code operates in standard Euclidean $\mathbb{R}^3$.
*   By migrating the shader math to 5D conformal space ($\mathbb{R}^{4,1}$), spheres, points, and rays unify into vectors. Intersections and reflections become simple geometric products. This would align the implementation directly with the theoretical documentation and could unlock novel optimization pathways for analytic geometric rendering.
