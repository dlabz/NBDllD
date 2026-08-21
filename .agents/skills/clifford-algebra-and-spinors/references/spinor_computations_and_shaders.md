# Spinor Computations, SLERP & WGSL Shader Patterns

This reference details fast algebraic algorithms for rotor composition, interpolation (SLERP), matrix conversion, and GPU shader implementations in WebGPU / WGSL.

---

## 1. 3D Rotor Algebra & Quaternion Equivalence

In 3D Euclidean space $\mathcal{Cl}(3, 0)$, a rotor $R \in \mathcal{Cl}^+(3, 0)$ is represented by 4 real numbers:

$$R = \alpha + \beta_{12} e_1 e_2 + \beta_{23} e_2 e_3 + \beta_{31} e_3 e_1$$

### Bivector Dual & Quaternion Mapping
Using the 3D unit pseudoscalar $I_3 = e_1 e_2 e_3$ ($I_3^2 = -1$):
- $e_2 e_3 = I_3 e_1 \leftrightarrow \mathbf{i}$
- $e_3 e_1 = I_3 e_2 \leftrightarrow \mathbf{j}$
- $e_1 e_2 = I_3 e_3 \leftrightarrow \mathbf{k}$

A rotor $R = \cos(\theta/2) - \hat{\mathbf{n}} I_3 \sin(\theta/2)$ maps identically to unit quaternion $q = [\cos(\theta/2), \hat{\mathbf{n}} \sin(\theta/2)]$.

### Fast Geometric Sandwich Evaluation (Direct Vector Formula)
Instead of constructing full multivectors, evaluate $R \mathbf{v} \tilde{R}$ using vector products ($s = \alpha$, $\mathbf{b} = [\beta_{23}, \beta_{31}, \beta_{12}]$):

$$\mathbf{v}' = \mathbf{v} + 2 s (\mathbf{b} \times \mathbf{v}) + 2 (\mathbf{b} \times (\mathbf{b} \times \mathbf{v}))$$

---

## 2. Rotor SLERP (Spherical Linear Interpolation) in $n\text{D}$

To smoothly interpolate between two rotors $R_0$ and $R_1$ with constant angular velocity:

### 1. Relative Rotor Computation:
$$\Delta R = R_1 \tilde{R}_0$$

### 2. Logarithm / Bivector Extraction:
Write $\Delta R = \cos(\phi) + \hat{B} \sin(\phi) \implies \phi = \arccos(\langle \Delta R \rangle_0)$, $\hat{B} = \frac{\langle \Delta R \rangle_2}{\sin(\phi)}$.

### 3. Interpolated Rotor:
$$R(t) = \exp(t \phi \hat{B}) R_0 = \left(\cos(t \phi) + \hat{B} \sin(t \phi)\right) R_0$$

#### Shortest Path Guard:
If $\langle R_0 \tilde{R}_1 \rangle_0 < 0$, negate $R_1 \to -R_1$ before computing the interpolation to preserve the shortest geodesic on the $\text{Spin}(n)$ manifold.

---

## 3. Rotor to $\text{SO}(n)$ Matrix Conversion

To convert a rotor $R$ into an orthogonal matrix $M \in \text{SO}(n)$ (for standard rendering pipelines):

$$M_{ij} = \langle e_i (R e_j \tilde{R}) \rangle_0 = (R e_j \tilde{R}) \cdot e_i$$

### 3D Explicit Matrix:
For $R = s + b_x e_2 e_3 + b_y e_3 e_1 + b_z e_1 e_2$:

$$M = \begin{pmatrix} 
1 - 2(b_y^2 + b_z^2) & 2(b_x b_y - s b_z) & 2(b_x b_z + s b_y) \\
2(b_x b_y + s b_z) & 1 - 2(b_x^2 + b_z^2) & 2(b_y b_z - s b_x) \\
2(b_x b_z - s b_y) & 2(b_y b_z + s b_x) & 1 - 2(b_x^2 + b_y^2)
\end{pmatrix}$$

---

## 4. WebGPU & WGSL Shader Implementations

### WGSL Rotor Type & Vector Rotation
```wgsl
// 3D Rotor packed as vec4f(bx, by, bz, scalar)
struct Rotor3D {
    b: vec3f,  // bivector components (yz, zx, xy)
    s: f32     // scalar component cos(theta/2)
};

// Applies rotor transformation v' = R v ~R
fn rotateWithRotor(v: vec3f, r: Rotor3D) -> vec3f {
    let t = 2.0 * cross(r.b, v);
    return v + r.s * t + cross(r.b, t);
}

// Constructs a rotor from rotation axis and angle
fn makeRotor(axis: vec3f, angleRad: f32) -> Rotor3D {
    let halfAngle = angleRad * 0.5;
    let len = length(axis);
    let normAxis = select(vec3f(0.0, 1.0, 0.0), axis / len, len > 1e-5);
    
    var r: Rotor3D;
    r.b = -normAxis * sin(halfAngle);
    r.s = cos(halfAngle);
    return r;
}

// Composes two rotors: R_total = R2 * R1
fn composeRotors(r2: Rotor3D, r1: Rotor3D) -> Rotor3D {
    var out: Rotor3D;
    out.s = r2.s * r1.s - dot(r2.b, r1.b);
    out.b = r2.s * r1.b + r1.s * r2.b + cross(r2.b, r1.b);
    return out;
}
```
