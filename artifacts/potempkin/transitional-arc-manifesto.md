# Transitional Arc Manifesto: Continuous $G^4$ Geometry and WebGPU Foundations

## I. Philosophy of Design
- **Dialectical Process:** Code is a living timeline of mutual adaptation and logical iteration, rather than a static final product. Each piece is crafted to fit perfectly with the next.
- **Love for the Future Self:** Designing with future readability and automated agent assist in mind. This is encapsulated in type safety via strict JSDoc (`// @ts-check`), zero-build vanilla ES modules, and explicit `.agents` guidance rules.
- **Escaping "Linear Crutches":** Rejecting classical representation models (like Rational NURBS and standard 4x4 affine matrices) where a linear parameter $t \in [0, 1]$ and artificial weights $w_i$ are used to force curved space. Division operations introduce angular acceleration and fracture the higher derivatives (specifically breaking the fourth derivative $G^4$ at the knots), locking continuity to $G^2$.
- **The Circle as Zero State:** Parametrizing space strictly through a circular phase angle $\theta \in [0, 2\pi]$ and total intensity $\Sigma I$. Trigonometric/transcendent sine recurrences internally "iron" the bases, eliminating division fractions. The circle remains the natural, frictionless zero state in $G^4$ continuity.
- **Nested Infinity ("Outer-er" Space):** Treating the 3D universe as merely the inner space of an even larger, outer-er model. In Conformal Geometric Algebra (CGA), this is achieved through conformal spherical inversion ($x^* = R_s^2 (x - c) / |x - c|^2 + c$), which maps the infinite cosmic macro to the micro-inner origin of a body. Transitions across scales are continuous and phase-shifted rather than bounded by rigid linear coordinates.
- **Heisenberg Uncertainty Loop:** Replacing discrete, localized coordinates with the core wave properties of phase ($\theta$) and amplitude ($\Sigma I$). When spatial coordinates are navigated via non-commutative operators (quaternions/rotors in $Cl(3,0)$ or conformal versors in $G(4,1)$), the order of evaluation alters the spatial state. The Uncertainty Principle is thus not a simulated noise layer, but an inherent, algebraic property of the geometry.

---

## II. Agreed Communication Style
- **Down-to-Earth Terminology:** Zero hype, no snake oil, no artificial marketing language, and no self-deception. Every mathematical, physics, and GPU term is used strictly for its literal engineering mechanism.
- **Honest Epistemology:** Ruthless honesty about separating the known and the unknown. If a constraint or convention (e.g., quaternion layout) is not explicitly defined, it is classified as an unknown until isolated and verified.
- **"Wax On, Wax Off" Discipline:** Embracing repetitive, clean, manual practice and basic mechanics. Identifying a mistake is a welcomed opportunity to learn and iterate. Identifying a repeating mistake is an opportunity to halt, step back, and systematically correct the underlying model.

---

## III. Transitional Arc Plan (v1.0)
1. **Apply the Essence of Algebra (Separate Knowns & Unknowns):**
   - **Placeholders (Scaffolding):** Affine 4x4 matrices, Euler angles for orbiting, linear parameters ($t$), and the current single-pass Verlet compute pass.
   - **True Pieces (Invariants):** 5D Conformal Geometric Algebra (CGA) bivectors, quaternions/rotors, the dual-tangent ray projective collapse, and the Eddington Gray-Atmosphere Radiance.
2. **Classify Pieces & Placeholders:** Audit the main rendering pipeline (e.g., `webgpu_star_clusters.html`) to identify where linear placeholders are acting as temporary "gaskets" for the true geometric components.
3. **Build the Arc Incrementally (One Piece at a Time):**
   - **Stage A (Camera & Controls):** Swap CPU-side camera logic to use quaternions/rotors. Build a temporary CPU-side conversion layer that translates the quaternion state back to standard 4x4 view matrices to keep WebGPU shaders and quad expansion from breaking.
   - **Stage B (Physics Update / Verlet Split):** Break the single-pass GPGPU Verlet integrator into two distinct WebGPU compute dispatches separated by a strict memory barrier. Solve the implicit step created by velocity-dependent interstellar Brownian damping.
   - **Stage C (Shader Shading / SupraQuant Covariance):** Replace 4x4 affine matrices in WGSL vertex shaders with direct spinor/rotor view-space expansions, maintaining perfect scale-invariant circular symmetry.
4. **Avoid Mutually Exclusive Decisions:** Ensure that our representations always support dual scales (infinite cosmic macro and local thermodynamic micro) and conjugate physical variables (position and momentum) without forcing the system into artificial state boundaries.

---

## IV. The Potemkin Village (Isolated Testbed)
To develop and test the Stage A camera, we construct an isolated environment (`potemkin_camera_test.html`) with calibration props specifically designed to stress-test the transition:

- **Calibration Props (The Scenery):**
  - *Checkered tiled floor & facade:* Rigid linear grid lines to instantly flag any non-conformal perspective warping or spatial distortion.
  - *Billboard cutout people:* Serve as the ultimate test of scale-invariant view-space quad expansion. Any math errors will skew or tear the billboarding.
  - *Simplified Point Light:* Visual diagnostic for the camera's orthonormal basis vectors (`camRight`, `camUp`, `zCam`). If the specular reflections flicker or break, the basis vectors are misaligned.
- **The Dual-Camera Setup:**
  - *Camera A (Legacy Reference):* Matrix-based spherical Euler coordinates with clamped elevation to act as a visual ground truth.
  - *Camera B (Novel Rotor Camera):* Quaternion-based navigation. Position is tracked by rotating an offset vector, and the orthonormal basis is extracted directly from the quaternion.
  - *The Hot-Swap Toggle:* Real-time toggle feeding the legacy 256-byte WebGPU Uniform Buffer to compare stability at the zenith.
- **Critical Verification Checkpoint:** Identify the specific layout convention of the engine's quaternions: native WebGPU hardware native `xyzw` alignment vs. traditional Clifford/3DGS bivector algebraic purity `wxyz`.
