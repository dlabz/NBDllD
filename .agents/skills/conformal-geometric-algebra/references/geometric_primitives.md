# CGA Geometric Primitives & Representations

In Conformal Geometric Algebra (5D CGA / $\mathcal{G}(4,1)$), geometric primitives (spheres, planes, circles, lines, point pairs, points) are represented directly as homogenous blades (multivectors) with unified algebraic operations.

---

## 1. Summary of 5D CGA Geometric Primitives

| Primitive | Grade (OPNS $\wedge$) | Grade (IPNS $\cdot$) | Direct Representation Formula |
| :--- | :--- | :--- | :--- |
| **Point** | 1 (Vector) | 4 (4-Vector) | $P(\mathbf{x}) = \mathbf{x} + \frac{1}{2}\|\mathbf{x}\|^2 e_\infty + e_0$ |
| **Point Pair** | 2 (Bivector) | 3 (Trivector) | $P_1 \wedge P_2$ (two intersection points) |
| **Circle** | 3 (Trivector) | 2 (Bivector) | $P_1 \wedge P_2 \wedge P_3 = S_1 \wedge S_2$ |
| **Sphere** | 4 (4-Vector) | 1 (Vector) | $P(\mathbf{c}) - \frac{1}{2}r^2 e_\infty = \mathbf{c} + \frac{1}{2}(\|\mathbf{c}\|^2 - r^2) e_\infty + e_0$ |
| **Line** (Flat Circle) | 3 (Trivector) | 2 (Bivector) | $P_1 \wedge P_2 \wedge e_\infty$ |
| **Plane** (Flat Sphere)| 4 (4-Vector) | 1 (Vector) | $P_1 \wedge P_2 \wedge P_3 \wedge e_\infty = \mathbf{n} + d\, e_\infty$ |

---

## 2. IPNS (Inner Product Null Space) Representations

In IPNS representation, a point $X = P(\mathbf{x})$ lies on the geometric primitive $G$ if and only if $X \cdot G = 0$.

### A. Spheres
A sphere with center $\mathbf{c} \in \mathbb{R}^3$ and radius $r > 0$:
$$S = P(\mathbf{c}) - \frac{1}{2}r^2 e_\infty = \mathbf{c} + \frac{1}{2}(\|\mathbf{c}\|^2 - r^2) e_\infty + e_0$$

#### Point-Sphere Distance / Relation:
$$P(\mathbf{x}) \cdot S = -\frac{1}{2}(\|\mathbf{x} - \mathbf{c}\|^2 - r^2)$$
- $P(\mathbf{x}) \cdot S < 0 \implies \mathbf{x}$ is **inside** the sphere.
- $P(\mathbf{x}) \cdot S = 0 \implies \mathbf{x}$ is **on the surface** of the sphere.
- $P(\mathbf{x}) \cdot S > 0 \implies \mathbf{x}$ is **outside** the sphere.

### B. Planes
A plane with unit normal $\mathbf{n}$ and signed distance $d$ from the origin ($\mathbf{n} \cdot \mathbf{x} = d$):
$$\pi = \mathbf{n} + d\, e_\infty$$

#### Point-Plane Distance:
$$P(\mathbf{x}) \cdot \pi = \mathbf{x} \cdot \mathbf{n} - d = \text{signed distance to plane}$$

### C. Lines
A line passing through points $\mathbf{p}_1, \mathbf{p}_2$ with direction $\mathbf{d} = \mathbf{p}_2 - \mathbf{p}_1$ and moment $\mathbf{m} = \mathbf{p}_1 \times \mathbf{d}$:
$$L^* = \mathbf{d} I_3 + \mathbf{m} I_3 e_\infty + \dots$$

### D. Circles
A circle represented as the intersection of two spheres $S_1, S_2$ (or a sphere and a plane $S \wedge \pi$):
$$C^* = S_1 \wedge S_2$$

---

## 3. OPNS (Outer Product Null Space) Representations

In OPNS representation, an entity is constructed directly by wedging points that define it:

- **Point Pair**: $P_1 \wedge P_2$
- **Circle**: $P_1 \wedge P_2 \wedge P_3$ (circle through 3 non-collinear points)
- **Line**: $P_1 \wedge P_2 \wedge e_\infty$ (line through 2 points and infinity)
- **Sphere**: $P_1 \wedge P_2 \wedge P_3 \wedge P_4$ (sphere through 4 non-coplanar points)
- **Plane**: $P_1 \wedge P_2 \wedge P_3 \wedge e_\infty$ (plane through 3 non-collinear points and infinity)

---

## 4. Intersection & Distance Evaluation

Because intersection is the algebraic outer product in the dual space (the Meet operator), intersecting any two primitives $A$ and $B$ is completely uniform:

$$G_{\text{intersection}}^* = A^* \wedge B^*$$

- **Line-Sphere Intersection $\to$ Point Pair**:
  $$(L^* \wedge S)^* = \text{Point Pair (2 roots if intersecting, 0 if missing, 1 if tangent)}$$
- **Sphere-Sphere Intersection $\to$ Circle**:
  $$(S_1^* \wedge S_2^*)^* = \text{Circle}$$
- **Plane-Sphere Intersection $\to$ Circle**:
  $$(\pi^* \wedge S^*)^* = \text{Circle}$$
