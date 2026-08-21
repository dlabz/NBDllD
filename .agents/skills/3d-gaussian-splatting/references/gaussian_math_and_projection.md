# 3D Gaussian Splatting: Mathematical Foundations & 2D Projection

This reference details the mathematical formulation of 3D Gaussians, the 3D-to-2D projective transformation via the Elliptical Weighted Average (EWA) filter, and the screen-space conic representation.

---

## 1. 3D Gaussian Formulation

A 3D Gaussian is defined in world space $\mathbb{R}^3$ by its mean position $\boldsymbol{\mu} \in \mathbb{R}^3$ and positive semi-definite $3 \times 3$ covariance matrix $\boldsymbol{\Sigma}$:

$$G(\mathbf{x}) = \exp\left(-\frac{1}{2}(\mathbf{x} - \boldsymbol{\mu})^\top \boldsymbol{\Sigma}^{-1}(\mathbf{x} - \boldsymbol{\mu})\right)$$

### Parameterization: Scale & Rotation
To guarantee that $\boldsymbol{\Sigma}$ is symmetric and positive semi-definite during optimization/rendering, it is factorized into a rotation matrix $\mathbf{R} \in \text{SO}(3)$ and diagonal scale matrix $\mathbf{S} = \text{diag}(s_x, s_y, s_z)$:

$$\boldsymbol{\Sigma} = \mathbf{R} \mathbf{S} \mathbf{S}^\top \mathbf{R}^\top$$

- **Scale Vector**: $\mathbf{s} = (s_x, s_y, s_z) \in \mathbb{R}^3$ (often stored as $\log(\mathbf{s})$).
- **Rotation**: Unit quaternion $\mathbf{q} = (w, x, y, z)$ normalized to $\|\mathbf{q}\| = 1$:
  $$\mathbf{R}(\mathbf{q}) = \begin{bmatrix}
  1 - 2(y^2 + z^2) & 2(xy - wz) & 2(xz + wy) \\
  2(xy + wz) & 1 - 2(x^2 + z^2) & 2(yz - wx) \\
  2(xz - wy) & 2(yz + wx) & 1 - 2(x^2 + y^2)
  \end{bmatrix}$$

---

## 2. 2D Projective Transformation (EWA Splatting)

Let $\mathbf{W} \in \mathbb{R}^{3 \times 3}$ be the viewing transformation (world-to-camera rotation) and $\mathbf{t} \in \mathbb{R}^3$ be the translation:

$$\mathbf{t}_{\text{cam}} = \mathbf{W} \boldsymbol{\mu} + \mathbf{t} = (t_x, t_y, t_z)^\top$$

The non-linear perspective projection $\phi(\mathbf{t}_{\text{cam}})$ maps camera coordinates to screen pixel coordinates $(u, v)$:

$$u = \frac{f_x t_x}{t_z} + c_x, \quad v = \frac{f_y t_y}{t_z} + c_y$$

### The Projective Jacobian Matrix $\mathbf{J}$
The Jacobian matrix $\mathbf{J} \in \mathbb{R}^{2 \times 3}$ of the affine perspective approximation at $\mathbf{t}_{\text{cam}}$ is:

$$\mathbf{J} = \begin{bmatrix}
\frac{\partial u}{\partial t_x} & \frac{\partial u}{\partial t_y} & \frac{\partial u}{\partial t_z} \\
\frac{\partial v}{\partial t_x} & \frac{\partial v}{\partial t_y} & \frac{\partial v}{\partial t_z}
\end{bmatrix} = \begin{bmatrix}
\frac{f_x}{t_z} & 0 & -\frac{f_x t_x}{t_z^2} \\
0 & \frac{f_y}{t_z} & -\frac{f_y t_y}{t_z^2}
\end{bmatrix}$$

### 2D Screen Covariance $\boldsymbol{\Sigma}'$
Applying the transformation law of Gaussian random variables:

$$\boldsymbol{\Sigma}' = \mathbf{J} \mathbf{W} \boldsymbol{\Sigma} \mathbf{W}^\top \mathbf{J}^\top$$

### Anti-Aliasing Low-Pass Filter
To prevent aliasing when a Gaussian is smaller than a single pixel, add a small 2D identity smoothing term $\nu \mathbf{I}_{2 \times 2}$ (typically $\nu = 0.3$ pixel$^2$):

$$\boldsymbol{\Sigma}_{\text{screen}} = \boldsymbol{\Sigma}' + \begin{bmatrix} 0.3 & 0 \\ 0 & 0.3 \end{bmatrix} = \begin{bmatrix} a & b \\ b & c \end{bmatrix}$$

---

## 3. Conic Representation & Screen Bounding Box

The screen-space Gaussian equation is:

$$G_{2D}(\mathbf{p}) = \exp\left(-\frac{1}{2}(\mathbf{p} - \boldsymbol{\mu}_{2D})^\top \boldsymbol{\Sigma}_{\text{screen}}^{-1}(\mathbf{p} - \boldsymbol{\mu}_{2D})\right)$$

### Inverse Covariance (Conic Form)
Let $\det(\boldsymbol{\Sigma}_{\text{screen}}) = a c - b^2$. The inverse matrix is:

$$\boldsymbol{\Sigma}_{\text{screen}}^{-1} = \frac{1}{a c - b^2} \begin{bmatrix} c & -b \\ -b & a \end{bmatrix} = \begin{bmatrix} A & B \\ B & C \end{bmatrix}$$

where:
$$A = \frac{c}{a c - b^2}, \quad B = \frac{-b}{a c - b^2}, \quad C = \frac{a}{a c - b^2}$$

For any pixel $\mathbf{p} = (x, y)$ with offset $\mathbf{d} = (x - \mu_x, y - \mu_y)$:
$$\text{power} = -\frac{1}{2} (A d_x^2 + 2 B d_x d_y + C d_y^2)$$
$$G_{2D}(\mathbf{p}) = \exp(\text{power})$$

### 2D Screen Bounding Box Radius
To bound the rasterization extent to a $3\sigma$ ($99.7\%$) confidence ellipse:
1. Compute eigenvalues of $\boldsymbol{\Sigma}_{\text{screen}}$:
   $$\lambda_{1, 2} = \frac{(a + c) \pm \sqrt{(a - c)^2 + 4 b^2}}{2}$$
2. Maximum radius in screen pixels:
   $$R_{\text{screen}} = \lceil 3.0 \sqrt{\max(\lambda_1, \lambda_2)} \rceil$$
3. Bounding box in pixels:
   $$[\mu_x - R_{\text{screen}}, \; \mu_x + R_{\text{screen}}] \times [\mu_y - R_{\text{screen}}, \; \mu_y + R_{\text{screen}}]$$
