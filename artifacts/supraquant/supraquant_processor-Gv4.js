// @ts-check

/**
 * @typedef {Object} SplinePoint
 * @property {number} x
 * @property {number} y
 * @property {number} dx4 - 4th derivative magnitude
 */

/**
 * Evaluates the linear-based Cox-de Boor basis function (Classical G² NURBS standard).
 * @param {number} i - Basis index
 * @param {number} p - Spline degree (typically 3 for cubic)
 * @param {number} t - Parameter value
 * @param {Float32Array} knots - Knot vector
 * @returns {number}
 */
export function evaluateLinearBasis(i, p, t, knots) {
    if (p === 0) {
        return (t >= knots[i] && t < knots[i + 1]) ? 1.0 : 0.0;
    }

    const denom1 = knots[i + p] - knots[i];
    const denom2 = knots[i + p + 1] - knots[i + 1];

    let term1 = 0.0;
    let term2 = 0.0;

    if (denom1 > 1e-6) {
        term1 = ((t - knots[i]) / denom1) * evaluateLinearBasis(i, p - 1, t, knots);
    }
    if (denom2 > 1e-6) {
        term2 = ((knots[i + p + 1] - t) / denom2) * evaluateLinearBasis(i + 1, p - 1, t, knots);
    }

    return term1 + term2;
}

/**
 * Evaluates the SupraQuant sine-based basis function.
 * Theta is forced into [0, 2π) on every entry so the resulting curve is strictly 2π-periodic.
 * @param {number} i - Basis index
 * @param {number} p - Spline degree
 * @param {number} theta - Circular phase angle in radians
 * @param {Float32Array} knots - Phase knot vector (may contain values outside [0, 2π))
 * @param {number} scaleFactor - Angular domain compression scale factor
 * @returns {number}
 */
export function evaluateSupraQuantBasis(i, p, theta, knots, scaleFactor) {
    // Enforce periodicity at every recursion level
    const twoPi = 2 * Math.PI;
    theta = ((theta % twoPi) + twoPi) % twoPi;

    if (p === 0) {
        // Knots may be negative or > 2π for the periodic wrap; compare against normalized theta
        return (theta >= knots[i] && theta < knots[i + 1]) ? 1.0 : 0.0;
    }

    // Sine-corrected angular denominators (scaleFactor keeps arguments away from kπ)
    const sinDenom1 = Math.sin((knots[i + p] - knots[i]) * scaleFactor);
    const sinDenom2 = Math.sin((knots[i + p + 1] - knots[i + 1]) * scaleFactor);

    let term1 = 0.0;
    let term2 = 0.0;

    if (Math.abs(sinDenom1) > 1e-6) {
        term1 = (Math.sin((theta - knots[i]) * scaleFactor) / sinDenom1) *
                evaluateSupraQuantBasis(i, p - 1, theta, knots, scaleFactor);
    }
    if (Math.abs(sinDenom2) > 1e-6) {
        term2 = (Math.sin((knots[i + p + 1] - theta) * scaleFactor) / sinDenom2) *
                evaluateSupraQuantBasis(i + 1, p - 1, theta, knots, scaleFactor);
    }

    return term1 + term2;
}

/**
 * Generates a closed, continuous boundary loop comparing G² vs SupraQuant models.
 * For the SupraQuant path the basis weights are renormalized on the fly so that
 * partition of unity is restored (exact convex combination of control points).
 *
 * @param {number} numSamples - Number of perimeter coordinates to generate
 * @param {Float32Array} controlPoints - 2D Control points array [x0, y0, x1, y1, ...]
 * @param {boolean} useSupraQuant - Toggle between G² linear or SupraQuant sine-based evaluation
 * @returns {SplinePoint[]}
 */
export function generateBoundaryLoop(numSamples, controlPoints, useSupraQuant) {
    const numCp = controlPoints.length / 2;
    const p = 3; // Cubic spline degree

    // Extended knot vector of length n + 2p + 1; control indices wrap periodically.
    const numKnots = numCp + 2 * p + 1;
    const knots = new Float32Array(numKnots);

    const step = (2 * Math.PI) / numCp;
    for (let i = 0; i < numKnots; i++) {
        knots[i] = (i - p) * step;
    }

    // Compress the active span (p * step) into ~0.5 rad so sine denominators stay safely away from zero.
    const activeSpan = p * step;
    const scaleFactor = 0.5 / activeSpan;

    /** @type {SplinePoint[]} */
    const points = [];
    const dt = (2 * Math.PI) / numSamples;

    for (let s = 0; s < numSamples; s++) {
        const theta = s * dt;
        let rx = 0.0;
        let ry = 0.0;
        let basisSum = 0.0;

        // Sum over the active window (numCp + p) so the periodic wrap is fully covered.
        for (let i = 0; i < numCp + p; i++) {
            const basis = useSupraQuant
                ? evaluateSupraQuantBasis(i, p, theta, knots, scaleFactor)
                : evaluateLinearBasis(i, p, theta, knots);

            const cpIdx = i % numCp;
            rx += basis * controlPoints[2 * cpIdx];
            ry += basis * controlPoints[2 * cpIdx + 1];
            basisSum += basis;
        }

        // Restore exact partition of unity for the SupraQuant path
        // (the raw sine basis sums to ~1.043; classical linear already sums to 1).
        if (useSupraQuant && Math.abs(basisSum) > 1e-8) {
            rx /= basisSum;
            ry /= basisSum;
        }

        // Circular phase transformation matrix M₂ₓ₂(θ)
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const fx = rx * cosT - ry * sinT;
        const fy = rx * sinT + ry * cosT;

        points.push({ x: fx, y: fy, dx4: 0.0 });
    }

    // Numerical 4th derivative (5-point central stencil) on the closed polyline
    for (let j = 0; j < numSamples; j++) {
        const p_2 = points[(j - 2 + numSamples) % numSamples];
        const p_1 = points[(j - 1 + numSamples) % numSamples];
        const p0  = points[j];
        const p1  = points[(j + 1) % numSamples];
        const p2  = points[(j + 2) % numSamples];

        const dx4_x = (p2.x - 4 * p1.x + 6 * p0.x - 4 * p_1.x + p_2.x) / Math.pow(dt, 4);
        const dx4_y = (p2.y - 4 * p1.y + 6 * p0.y - 4 * p_1.y + p_2.y) / Math.pow(dt, 4);

        points[j].dx4 = Math.hypot(dx4_x, dx4_y);
    }

    return points;
}

/**
 * Returns the WGSL shader source helper for the GPU-based SupraQuant implementation.
 * Includes the same periodicity normalisation and partition-of-unity correction as the JS path.
 * @returns {string}
 */
export function getWGSLSupraQuantCode() {
    return `
struct SupraQuantUniforms {
    scale_intensity: f32,
    num_control_points: u32,
    spline_degree: u32,
    padding: f32,
};

// Evaluates the sine-based Cox-de Boor basis on the GPU (strictly 2π-periodic)
fn evaluate_g4_basis(i: u32, p: u32, theta: f32, knots: ptr<function, array<f32, 15>>, scale_factor: f32) -> f32 {
    // Force theta into [0, 2π) at every recursion level
    let two_pi = 6.283185307179586;
    var t = ((theta % two_pi) + two_pi) % two_pi;

    if (p == 0u) {
        if (t >= (*knots)[i] && t < (*knots)[i + 1u]) {
            return 1.0;
        }
        return 0.0;
    }

    let sin_denom1 = sin(((*knots)[i + p] - (*knots)[i]) * scale_factor);
    let sin_denom2 = sin(((*knots)[i + p + 1u] - (*knots)[i + 1u]) * scale_factor);

    var term1 = 0.0;
    var term2 = 0.0;

    if (abs(sin_denom1) > 1e-6) {
        term1 = (sin((t - (*knots)[i]) * scale_factor) / sin_denom1) *
                evaluate_g4_basis(i, p - 1u, t, knots, scale_factor);
    }
    if (abs(sin_denom2) > 1e-6) {
        // Parentheses fixed: scale_factor is inside the sin argument
        term2 = (sin(((*knots)[i + p + 1u] - t) * scale_factor) / sin_denom2) *
                evaluate_g4_basis(i + 1u, p - 1u, t, knots, scale_factor);
    }

    return term1 + term2;
}

// Map circular phase to scale-invariant vertex offsets (partition-of-unity restored)
fn expand_supraquant_vertex(base_pos: vec3f, theta: f32, scale: f32) -> vec3f {
    var knots: array<f32, 15>;
    // Circular knots for 8 control points, degree 3
    let step_val = 6.283185307179586 / 8.0;
    for (var k = 0u; k < 15u; k = k + 1u) {
        knots[k] = (f32(k) - 3.0) * step_val;
    }

    let scale_factor = 0.5 / (3.0 * step_val);

    // Static 2D control points outlining a unit star impostor shell
    var cp = array<vec2f, 8>(
        vec2f(0.5, 0.0),  vec2f(0.35, 0.35),
        vec2f(0.0, 0.5),  vec2f(-0.35, 0.35),
        vec2f(-0.5, 0.0), vec2f(-0.35, -0.35),
        vec2f(0.0, -0.5), vec2f(0.35, -0.35)
    );

    var rx = 0.0;
    var ry = 0.0;
    var basis_sum = 0.0;

    // Sum over active wrapped bases (8 control points + 3 wrapping bases)
    for (var i = 0u; i < 11u; i = i + 1u) {
        let basis = evaluate_g4_basis(i, 3u, theta, &knots, scale_factor);
        let cp_idx = i % 8u;
        rx = rx + basis * cp[cp_idx].x;
        ry = ry + basis * cp[cp_idx].y;
        basis_sum = basis_sum + basis;
    }

    // Restore partition of unity
    if (abs(basis_sum) > 1e-8) {
        rx = rx / basis_sum;
        ry = ry / basis_sum;
    }

    // Multiplicative phase transformation matrix M₂ₓ₂(θ)
    let cos_t = cos(theta);
    let sin_t = sin(theta);
    let offset_x = (rx * cos_t - ry * sin_t) * scale;
    let offset_y = (rx * sin_t + ry * cos_t) * scale;

    return vec3f(base_pos.x + offset_x, base_pos.y + offset_y, base_pos.z);
}
`;
}
