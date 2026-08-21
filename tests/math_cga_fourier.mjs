// @ts-check

/**
 * @file math_cga_fourier.mjs
 * Pure Vanilla JavaScript implementation of 5D CGA Dual Inversion,
 * 2-Vector Fourier Kinematic Chain, Matrix Algebra, and Analytic Raytracing Math.
 */

// ==========================================
// 1. Vector3 Operations
// ==========================================

/**
 * @typedef {[number, number, number]} Vec3
 */

/**
 * Creates a 3D vector.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {Vec3}
 */
export function vec3(x, y, z) {
    return [x, y, z];
}

/**
 * Vector addition (a + b).
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {Vec3}
 */
export function add3(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Vector subtraction (a - b).
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {Vec3}
 */
export function sub3(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Vector scaling (a * s).
 * @param {Vec3} a
 * @param {number} s
 * @returns {Vec3}
 */
export function scale3(a, s) {
    return [a[0] * s, a[1] * s, a[2] * s];
}

/**
 * Dot product of two vectors (a · b).
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {number}
 */
export function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Squared length of a vector (||a||^2).
 * @param {Vec3} a
 * @returns {number}
 */
export function lengthSq3(a) {
    return a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
}

/**
 * Euclidean length of a vector (||a||).
 * @param {Vec3} a
 * @returns {number}
 */
export function length3(a) {
    return Math.hypot(a[0], a[1], a[2]);
}

/**
 * Safe normalization of a vector with fallback to prevent NaN on AMD 5500M / Metal.
 * @param {Vec3} a
 * @param {Vec3} [fallback=[0, 0, 1]]
 * @returns {Vec3}
 */
export function normalize3(a, fallback = [0, 0, 1]) {
    const len = length3(a);
    if (len < 1e-6 || !Number.isFinite(len)) {
        return [...fallback];
    }
    return [a[0] / len, a[1] / len, a[2] / len];
}

/**
 * Cross product of two vectors (a × b).
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {Vec3}
 */
export function cross3(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

// ==========================================
// 2. 5D CGA Dual Inversion Math
// ==========================================

/**
 * 5D Conformal Geometric Algebra dual coordinate spherical inversion.
 * Maps point x in 3D Euclidean space to dual space x* = (Rs^2 * x) / (||x||^2 + eps).
 *
 * @param {Vec3} p - Euclidean 3D position
 * @param {number} [Rs=25.0] - Inversion radius
 * @param {number} [eps=1e-6] - Regularization epsilon to avoid singularity at origin
 * @returns {Vec3} Inverted dual position
 */
export function cgaInvertPoint(p, Rs = 25.0, eps = 1e-6) {
    const r2 = lengthSq3(p) + eps;
    const scale = (Rs * Rs) / r2;
    return scale3(p, scale);
}

/**
 * Maps physical sphere radius r at center p to conformal dual radius r*.
 * r* = clamp( (r * Rs^2) / (| ||p||^2 - r^2 | + eps), minR, maxR )
 *
 * @param {Vec3} p - Physical sphere center
 * @param {number} r - Physical radius
 * @param {number} [Rs=25.0] - Inversion radius
 * @param {number} [minR=0.4] - Minimum dual clamp radius
 * @param {number} [maxR=12.0] - Maximum dual clamp radius
 * @returns {number} Conformal dual radius
 */
export function cgaInvertRadius(p, r, Rs = 25.0, minR = 0.4, maxR = 12.0) {
    const pSq = lengthSq3(p);
    const denom = Math.max(Math.abs(pSq - r * r), 1e-4);
    const dualR = (r * Rs * Rs) / denom;
    return Math.max(minR, Math.min(maxR, dualR));
}

// ==========================================
// 3. 2-Vector Fourier Kinematic Chain
// ==========================================

/**
 * Evaluates the 2-vector Fourier series kinematic chain at time t.
 *
 * @param {number} t - Simulation time in seconds
 * @param {Object} [params]
 * @param {number} [params.R1=25.0] - Primary horizontal orbital radius (X-Z plane)
 * @param {number} [params.w1=0.25] - Primary orbital angular frequency (rad/s)
 * @param {number} [params.r2=3.0] - Secondary vertical orbital radius (X-Y plane)
 * @param {number} [params.w2=1.4] - Secondary orbital angular frequency (rad/s)
 * @param {Vec3} [params.sunPos=[0, 0, 0]] - Solar origin position
 * @returns {{ sunPos: Vec3, planetPos: Vec3, moonPos: Vec3, v1: Vec3, v2: Vec3, theta1: number, theta2: number }}
 */
export function evaluateFourierKinematicChain(t, params = {}) {
    const {
        R1 = 25.0,
        w1 = 0.25,
        r2 = 3.0,
        w2 = 1.4,
        sunPos = [0, 0, 0]
    } = params;

    const theta1 = t * w1;
    const theta2 = t * w2;

    // Vector 1 (Sun -> Planet) in horizontal X-Z plane
    const v1 = vec3(R1 * Math.cos(theta1), 0.0, R1 * Math.sin(theta1));
    const planetPos = add3(sunPos, v1);

    // Vector 2 (Planet -> Moon) in vertical elevation X-Y plane (prevents planar overlap)
    const v2 = vec3(r2 * Math.cos(theta2), r2 * Math.sin(theta2), 0.0);
    const moonPos = add3(planetPos, v2);

    return {
        sunPos,
        planetPos,
        moonPos,
        v1,
        v2,
        theta1,
        theta2
    };
}

// ==========================================
// 4. Matrix Algebra (4x4 Column-Major)
// ==========================================

/**
 * Computes a 4x4 right-handed view matrix looking from eye towards target.
 * @param {Vec3} eye - Camera eye position
 * @param {Vec3} target - Camera target focus
 * @param {Vec3} [up=[0, 1, 0]] - Up direction
 * @returns {Float32Array}
 */
export function lookAt(eye, target, up = [0, 1, 0]) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;

    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    let xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;

    let yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
        xx, yx, zx, 0,
        xy, yy, zy, 0,
        xz, yz, zz, 0,
        -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
        -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
        -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
    ]);
}

/**
 * Computes a 4x4 perspective projection matrix with WebGPU [0, 1] clip depth.
 * @param {number} fov - Vertical FOV in radians
 * @param {number} aspect - Aspect ratio (width / height)
 * @param {number} near - Near plane
 * @param {number} far - Far plane
 * @returns {Float32Array}
 */
export function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) * nf;
    m[11] = -1;
    m[14] = 2 * far * near * nf;
    return m;
}

/**
 * Multiplies two 4x4 column-major matrices (a * b).
 * @param {Float32Array | number[]} a
 * @param {Float32Array | number[]} b
 * @returns {Float32Array}
 */
export function mul4(a, b) {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
        }
    }
    return o;
}

/**
 * Inverts a 4x4 column-major matrix analytically.
 * @param {Float32Array | number[]} m
 * @returns {Float32Array}
 */
export function invert4(m) {
    const out = new Float32Array(16);
    const [m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33] = m;
    const b00 = m00 * m11 - m01 * m10, b01 = m00 * m12 - m02 * m10, b02 = m00 * m13 - m03 * m10;
    const b03 = m01 * m12 - m02 * m11, b04 = m01 * m13 - m03 * m11, b05 = m02 * m13 - m03 * m12;
    const b06 = m20 * m31 - m21 * m30, b07 = m20 * m32 - m22 * m30, b08 = m20 * m33 - m23 * m30;
    const b09 = m21 * m32 - m22 * m31, b10 = m21 * m33 - m23 * m31, b11 = m22 * m33 - m23 * m32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < 1e-12) return out;
    det = 1 / det;
    out[0] = (m11 * b11 - m12 * b10 + m13 * b09) * det;
    out[1] = (-m01 * b11 + m02 * b10 - m03 * b09) * det;
    out[2] = (m31 * b05 - m32 * b04 + m33 * b03) * det;
    out[3] = (-m21 * b05 + m22 * b04 - m23 * b03) * det;
    out[4] = (-m10 * b11 + m12 * b08 - m13 * b07) * det;
    out[5] = (m00 * b11 - m02 * b08 + m03 * b07) * det;
    out[6] = (-m30 * b05 + m32 * b02 - m33 * b01) * det;
    out[7] = (m20 * b05 - m22 * b02 + m23 * b01) * det;
    out[8] = (m10 * b10 - m11 * b08 + m13 * b06) * det;
    out[9] = (-m00 * b10 + m01 * b08 - m03 * b06) * det;
    out[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det;
    out[11] = (-m20 * b04 + m21 * b02 - m23 * b00) * det;
    out[12] = (-m10 * b09 + m11 * b07 - m12 * b06) * det;
    out[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det;
    out[14] = (-m30 * b03 + m31 * b01 - m32 * b00) * det;
    out[15] = (m20 * b03 - m21 * b01 + m22 * b00) * det;
    return out;
}

// ==========================================
// 5. Analytic Ray-Sphere Intersection
// ==========================================

/**
 * Analytic ray-sphere intersection using half-b quadratic discriminant.
 * Ray equation: P(t) = rayOrig + t * rayDir
 *
 * @param {Vec3} rayOrig - Ray origin position
 * @param {Vec3} rayDir - Ray unit direction
 * @param {Vec3} center - Sphere center position
 * @param {number} radius - Sphere radius
 * @returns {{ hit: boolean, t: number, hitPos: Vec3, normal: Vec3 }}
 */
export function hitSphere(rayOrig, rayDir, center, radius) {
    const oc = sub3(rayOrig, center);
    const b = dot3(oc, rayDir);
    const c = dot3(oc, oc) - radius * radius;
    const disc = b * b - c;

    if (disc < 0.0) {
        return { hit: false, t: -1, hitPos: [0, 0, 0], normal: [0, 0, 0] };
    }

    const s = Math.sqrt(disc);
    let t = -b - s;
    if (t < 0.001) {
        t = -b + s;
    }

    if (t < 0.001) {
        return { hit: false, t: -1, hitPos: [0, 0, 0], normal: [0, 0, 0] };
    }

    const hitPos = add3(rayOrig, scale3(rayDir, t));
    const normal = normalize3(sub3(hitPos, center));

    return { hit: true, t, hitPos, normal };
}

/**
 * Minimum distance between a ray and a 3D line segment (a -> b).
 * @param {Vec3} ro - Ray origin
 * @param {Vec3} rd - Ray direction
 * @param {Vec3} a - Line segment start
 * @param {Vec3} b - Line segment end
 * @returns {number} Minimum distance
 */
export function raySegmentDist(ro, rd, a, b) {
    const u = sub3(b, a);
    const v = rd;
    const w = sub3(a, ro);

    const a0 = dot3(u, u);
    const b0 = dot3(u, v);
    const c0 = dot3(v, v);
    const d0 = dot3(u, w);
    const e0 = dot3(v, w);

    const denom = a0 * c0 - b0 * b0;
    if (Math.abs(denom) < 1e-6) {
        // Parallel lines
        const t1 = Math.max(0.0, Math.min(1.0, -d0 / (a0 + 1e-6)));
        const p1 = add3(a, scale3(u, t1));
        const proj = dot3(sub3(p1, ro), rd);
        const p2 = add3(ro, scale3(rd, Math.max(0.0, proj)));
        return length3(sub3(p1, p2));
    }

    let s = (b0 * e0 - c0 * d0) / denom;
    s = Math.max(0.0, Math.min(1.0, s));

    const t = (b0 * s + e0) / c0;
    const p1 = add3(a, scale3(u, s));
    const p2 = add3(ro, scale3(rd, Math.max(0.0, t)));

    return length3(sub3(p1, p2));
}
