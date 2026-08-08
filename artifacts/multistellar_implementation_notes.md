# Multistellar Projective Implementation Notes

This document describes the computational model driving the 20-body multistellar simulation (`multistellar_projective_demo.html`), and compares it with state-of-the-art rendering techniques.

## 1. Implementation Overview

The multistellar implementation scales the previously defined conformal mapping model into a dynamic, $N$-body celestial environment containing multiple light-emitting stars and non-emitting planets/moons.

### Key Algorithmic Mechanics:
- **Dynamic Center of Mass**: The system calculates the barycenter of all 20 bodies on the CPU per frame, constantly shifting the origin of the coordinate space so that $[0,0,0]$ remains locked to the system's center of mass.
- **Sorted Volumetric Raymarching**: Bodies are sorted on the CPU based on their distance from the origin (ascending $R$). This guarantees a strict back-to-front ordering for any rays evaluating light passing between the origin and the outer limits of the system.
- **Directional Raycasting**: To compute correct illumination, the shader evaluates each emitting star natively. Instead of a single funneling ray to $\Omega$, the fragment casts a projective ray directly to each star. The sorted array enables a perfectly stable $O(S \times N)$ order-independent occlusion blending pass without a spatial BVH.

## 2. Comparison to Standard Rendering Techniques

### Standard Raytracing (Path Tracing)
- **Standard**: Evaluates light by casting primary rays from the camera, and secondary rays from surfaces toward light sources, checking intersections against a Bounding Volume Hierarchy (BVH).
- **Our Model**: Drops the BVH entirely. By exploiting the spherical geometry of celestial bodies, it computes soft shadows algebraically via a `smoothstep` on the perpendicular distance from the projective line. 
- **Advantage**: $O(N)$ execution time. No hierarchical acceleration structure needs to be rebuilt on the CPU when bodies orbit.
- **Disadvantage**: It is highly specific to spherical bodies. It cannot easily render arbitrary polygon meshes (like spaceships or asteroid terrain) without falling back to a BVH.

### 3D Gaussian Splatting (3DGS)
- **3DGS**: Sorts 3D ellipsoids by depth and projects them onto a 2D image plane using $\alpha$-blending to form an image.
- **Our Model**: Sorts spherical bodies by depth (relative to the system origin) and projects them into the 1D ray path between the fragment and the star.
- **Advantage**: The occlusion calculation (`maxOcclusion = max(..., occ)`) acts as a volumetric splat along the 1D shadow ray. It computes smooth penumbras mathematically identically to how 3DGS blends Gaussian distributions, but entirely analytically without needing a dense point cloud.

### Sparse Voxel Octrees (SVO)
- **SVO**: Partitions space into a hierarchical grid, tracing rays step-by-step through occupied voxels to find occlusions.
- **Our Model**: Because the scene is strictly defined by 20 distinct, mathematically pure spheres rather than rasterized volume density, we bypass spatial traversal.
- **Advantage**: In a sparse environment like a solar system, an SVO would waste immense memory mapping empty space. Our model operates solely on the topological parameters of the bodies, rendering it drastically more memory-efficient.

## 3. Computational Advantages and Disadvantages

### Advantages
1. **Zero Spatial Structures**: No BVH or Octrees to build or traverse. 
2. **Deterministic Divergence**: All fragments run an identical, unrolled loop through the exact same 20-body array in the fragment shader. This guarantees 100% warp coherency on the GPU.
3. **Analytic Soft Shadows**: Calculating penumbras via `smoothstep` requires only a single sample per occluder, saving hundreds of stochastic ray samples typically required for soft lighting.
4. **Infinite Precision Resilience**: Evaluating the bodies relative to the dynamic center of mass reduces extreme floating-point offsets, ensuring precision holds even when simulating multi-AU distances.

### Disadvantages
1. **Geometric Limitation**: It is strictly limited to spheres. Any complex, non-spherical occlusion geometry would break the analytic projection map.
2. **Computational Scaling**: While $O(N)$ is fast for $N=20$, if the galaxy scaled to $N=1,000,000$ (e.g., an asteroid belt), evaluating the entire loop per-pixel would decimate the framerate. At massive scales, a radial hierarchical structure (like a spherical SVO) would become mandatory.
