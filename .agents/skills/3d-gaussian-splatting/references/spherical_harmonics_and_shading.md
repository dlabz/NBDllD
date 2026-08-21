# Spherical Harmonics, Color Radiance & Volumetric Alpha Compositing

This reference details the view-dependent color calculation using Spherical Harmonics (SH) and the front-to-back volume rendering equation in 3D Gaussian Splatting.

---

## 1. Spherical Harmonics (SH) Radiance

In 3DGS, the directional appearance (color) of each Gaussian is parameterized by coefficients of real Spherical Harmonics $Y_l^m(\mathbf{d})$ evaluated along the unit ray direction $\mathbf{d} = \frac{\boldsymbol{\mu} - \mathbf{c}_{\text{cam}}}{\|\boldsymbol{\mu} - \mathbf{c}_{\text{cam}}\|}$ (pointing from camera to Gaussian mean):

$$\mathbf{C}(\mathbf{d}) = \sum_{l=0}^{D} \sum_{m=-l}^l \mathbf{k}_l^m Y_l^m(\mathbf{d})$$

where $\mathbf{k}_l^m = (k_r, k_g, k_b) \in \mathbb{R}^3$ are the RGB spherical harmonic coefficients.

### Basis Constants and Functions

#### Degree 0 ($l=0$, 1 coefficient per RGB channel):
$$Y_0^0 = \frac{1}{2}\sqrt{\frac{1}{\pi}} \approx 0.28209479177387814$$
$$\mathbf{C}_0 = 0.5 + Y_0^0 \mathbf{k}_0^0$$

#### Degree 1 ($l=1$, 3 additional coefficients):
Let $\mathbf{d} = (x, y, z)$:
$$Y_1^{-1} = -\sqrt{\frac{3}{4\pi}} y \approx -0.4886025119029199 y$$
$$Y_1^0 = \sqrt{\frac{3}{4\pi}} z \approx 0.4886025119029199 z$$
$$Y_1^1 = -\sqrt{\frac{3}{4\pi}} x \approx -0.4886025119029199 x$$

#### Degree 2 ($l=2$, 5 additional coefficients):
$$Y_2^{-2} = \frac{1}{2}\sqrt{\frac{15}{\pi}} x y \approx 1.0925484305920792 x y$$
$$Y_2^{-1} = -\frac{1}{2}\sqrt{\frac{15}{\pi}} y z \approx -1.0925484305920792 y z$$
$$Y_2^0 = \frac{1}{4}\sqrt{\frac{5}{\pi}} (2 z^2 - x^2 - y^2) \approx 0.31539156525252005 (2 z^2 - x^2 - y^2)$$
$$Y_2^1 = -\frac{1}{2}\sqrt{\frac{15}{\pi}} x z \approx -1.0925484305920792 x z$$
$$Y_2^2 = \frac{1}{4}\sqrt{\frac{15}{\pi}} (x^2 - y^2) \approx 0.5462742152960396 (x^2 - y^2)$$

### Total Coefficients per Degree:
| Max Degree $D$ | Basis Functions $(D+1)^2$ | Total Floats per Gaussian ($3 \times$) |
| :--- | :--- | :--- |
| **0** (Diffuse only) | 1 | 3 floats |
| **1** | 4 | 12 floats |
| **2** | 9 | 27 floats |
| **3** | 16 | 48 floats |

---

## 2. Volumetric Front-to-Back $\alpha$-Compositing

Given $N$ depth-sorted Gaussians (ordered from closest to farthest from the camera $z_1 \le z_2 \le \dots \le z_N$), the accumulated color $\mathbf{C}(\mathbf{p})$ at pixel $\mathbf{p} = (x, y)$ is:

$$\mathbf{C}(\mathbf{p}) = \sum_{i=1}^N \mathbf{c}_i \alpha_i T_i$$

where:
- $\mathbf{c}_i$: Color of Gaussian $i$ evaluated via SH.
- $\alpha_i$: Effective opacity of Gaussian $i$ at pixel $\mathbf{p}$:
  $$\alpha_i = o_i \cdot \exp\left(-\frac{1}{2}(\mathbf{p} - \boldsymbol{\mu}_{2D, i})^\top \boldsymbol{\Sigma}_{\text{screen}, i}^{-1} (\mathbf{p} - \boldsymbol{\mu}_{2D, i})\right)$$
  where $o_i = \text{sigmoid}(\text{raw\_opacity}_i) \in [0, 1]$.
- $T_i$: Accumulated transmittance (visibility) of the light ray reaching Gaussian $i$:
  $$T_1 = 1.0, \quad T_i = \prod_{j=1}^{i-1} (1 - \alpha_j) = T_{i-1}(1 - \alpha_{i-1})$$

---

## 3. Early Ray Termination (Transmittance Thresholding)

In tile-based rasterization, if the accumulated transmittance drops below a small threshold $\epsilon$:

$$T_i < 0.0001 \implies \text{Terminate thread early}$$

This eliminates evaluating occluded background Gaussians, drastically accelerating rasterization on dense scenes.
