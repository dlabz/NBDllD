# Projective Inverted Occlusion: A Novel Illumination Architecture

This document outlines the theoretical and practical underpinnings of the projective light and shadow model implemented in `inverted_occlusion_demo.html`. By formulating the N-body lighting problem in a projective space built around a shared omnidirectional infinity, this approach offers a radical departure from traditional raytracing.

## 1. The Implementation: Homogeneous Projective Raycasting

In the demo, orbital mechanics and lighting do not operate independently in a standard Euclidean void. Instead:
- **Projective Space**: The system embeds ordinary Euclidean space into the projective space $\mathbb{RP}^3$ using homogeneous coordinates $[x:y:z:w]$.
- **Inversion to Origin**: A global inversion is applied such that a preferred point at infinity—the "omnidirectional infinity" ($\Omega$)—is mapped precisely to the origin $[0:0:0:1]$. Importantly, $\Omega$ does *not* have to be the Sun. Any celestial body (or an arbitrary systemic point) can be inverted such that its center aligns with $\Omega$. While anchoring $\Omega$ to the primary star in a simple 3-body system is intuitive, keeping $\Omega$ decoupled as a systemic abstraction preserves computational benefits for complex, multi-stellar galaxy models.
- **Central Projection ($\Phi$)**: Shadows are not formed by casting parallel rays from a distant light source, nor by iterating across complex solid angles. Instead, shadowing is determined by a simple map $\Phi$ that sends points along projective lines connecting any fragment directly through the origin $\Omega$. 

In the fragment shader, this reduces the occlusion test to checking if any other sphere intersects the line segment between the fragment's world position and the origin. Because all light emanates from (or is evaluated with respect to) this inverted origin, the mathematics of intersection and projection are drastically simplified.

## 2. Comparison to Standard Raytracing

### Traditional Raytracing
Standard raytracing evaluates light transport by casting rays from the camera into the scene, bouncing them off surfaces, and explicitly tracing shadow rays toward bounding volumes of light sources.
- **Computational Cost**: High. Each bounce requires traversing spatial acceleration structures (BVH) and performing complex ray-primitive intersection tests.
- **Divergence**: Secondary rays (like those for diffuse inter-reflection or soft shadows) diverge wildly, breaking cache coherency and causing performance bottlenecks on parallel hardware (GPUs).

### Projective Inverted Occlusion
In our model, the "light source" is mathematically relocated to the origin of the coordinate space.
- **O(N) Complexity per Fragment**: Because all direct shadow rays share the exact same destination (the origin), occlusion is resolved by a strictly linear, bounded evaluation against the $N$ bodies in the system. 
- **Implicit Soft Shadows**: By utilizing the perpendicular distance from the occluder's center to the central projective ray, we approximate the penumbra via a `smoothstep` function—achieving soft shadowing without needing stochastic multi-sampling or noise-reduction algorithms.
- **Phase-Gated Mutual Reflection**: Reflected light (e.g., Earthshine) is evaluated using a fast 2-bounce check against the same origin-centric geometry. We evaluate the dayside phase of the reflector natively, bypassing recursive integral evaluations.

## 3. Benefits of Shared Omnidirectional Infinity

Mapping the primary light source to a shared omnidirectional infinity $\Omega$ provides profound systemic advantages:
- **Geometric Elegance**: It unifies all celestial bodies into a shared conformal geometric algebra (CGA) framework. The distinction between the "light side" and "dark side" of any sphere is strictly defined by its Clifford algebra orientation relative to $\Omega$.
- **Precision at Scale**: In standard floating-point Euclidean coordinates, dealing with astronomical distances (e.g., 1 AU) alongside human-scale planetary features leads to catastrophic precision loss (Z-fighting, shadow acne). Projective coordinates inherently compress these infinite scales into a normalized range, completely resolving precision issues.

## 4. Similarity to 3D Gaussian Splatting (3DGS)

There is a striking mathematical duality between this implementation and the rendering techniques used in 3D Gaussian Splatting:
- **Projection to 2D**: In 3DGS, 3D covariance ellipsoids are projected onto a 2D image plane based on a camera viewpoint. The 3D splats are flattened into 2D ellipses.
- **Our Model**: In our system, the 3D celestial spheres (which are special cases of ellipsoids) are projected onto the spherical sensory horizon of the Sun ($\Omega$). The mathematics of projecting the overlapping spherical profiles (the Hesse-normal-form rings) is the exact inverse of a camera projection.
- **Sorting and Blending**: Just as 3DGS sorts Gaussians by depth (Z-order) to $\alpha$-blend them into a final pixel color, our model evaluates the depth of occluders along the projective ray. The "shadow" is effectively an $\alpha$-blended splat projected onto the receiving body.

## 5. Parallelization and Sparse Voxel Octrees (SVO)

Perhaps the most powerful implication of the omnidirectional infinity model is its potential for extreme parallelization.

Because every shadow ray in the system points toward a single, unified origin $\Omega$, the spatial data structure does not need to support arbitrary ray traversal. 
- **Radial Octrees**: The space around $\Omega$ can be partitioned into a radial / spherical octree (similar to a Sparse Voxel Octree, but defined in spherical coordinates where depth is $1/r$).
- **Deterministic Traversal**: Since all primary light rays travel radially inward to the origin, traversing this SVO becomes deterministic and identical for all fragments sharing the same solid angle. 
- **GPU Warp Coherency**: Threads in a GPU warp processing adjacent fragments on a planet will traverse the exact same nodes of the radial SVO in lockstep. This completely eliminates the divergent branching that plagues traditional raytracing.
- **Hierarchical Culling**: Entire branches of the SVO can be culled with a single bitwise check if they do not intersect the narrow projective cone of the fragment, allowing the system to scale to thousands of bodies (asteroids, rings, debris) with minimal performance impact.
