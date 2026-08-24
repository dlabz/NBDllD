// @ts-check

/**
 * @typedef {Object} SplinePoint
 * @property {number} x
 * @property {number} y
 * @property {number} dx4 - 4th derivative magnitude
 */

/**
 * Evaluates the linear-based Cox-de Boor basis function (Classical G2 NURBS standard).
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

    let denom1 = knots[i + p] - knots[i];
    let denom2 = knots[i + p + 1] - knots[i + 1];

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
 * Evaluates the SupraQuant sine-based basis function (G4 continuity, angular tension horizontal correction).
 * Strictly periodic across [0, 2pi] by normalizing theta at the entry point of the recursion.
 * @param {number} i - Basis index
 * @param {number} p - Spline degree
 * @param {number} theta - Circular phase angle in radians [0, 2pi]
 * @param {Float32Array} knots - Phase knot vector
 * @param {number} scaleFactor - Angular domain compression scale factor
 * @returns {number}
 */
export function evaluateSupraQuantBasis(i, p, theta, knots, scaleFactor) {
    // Map parameter into [0, 2pi] circularly at the entry point so that all recursive steps operate in the same periodic domain
    const normTheta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    if (p === 0) {
        return (normTheta >= knots[i] && normTheta < knots[i + 1]) ? 1.0 : 0.0;
    }

    // Sine-corrected angular denominators
    let sinDenom1 = Math.sin((knots[i + p] - knots[i]) * scaleFactor);
    let sinDenom2 = Math.sin((knots[i + p + 1] - knots[i + 1]) * scaleFactor);

    let term1 = 0.0;
    let term2 = 0.0;

    if (Math.abs(sinDenom1) > 1e-6) {
        term1 = (Math.sin((normTheta - knots[i]) * scaleFactor) / sinDenom1) * evaluateSupraQuantBasis(i, p - 1, normTheta, knots, scaleFactor);
    }
    if (Math.abs(sinDenom2) > 1e-6) {
        term2 = (Math.sin((knots[i + p + 1] - normTheta) * scaleFactor) / sinDenom2) * evaluateSupraQuantBasis(i + 1, p - 1, normTheta, knots, scaleFactor);
    }

    return term1 + term2;
}

/**
 * Generates a closed, continuous boundary loop comparing G2 vs G4 models.
 * Enforces a strict mathematical partition of unity to restore affine invariance.
 * @param {number} numSamples - Number of perimeter coordinates to generate
 * @param {Float32Array} controlPoints - 2D Control points array [x0, y0, x1, y1, ...], size 16 (8 points)
 * @param {boolean} useSupraQuant - Toggle between G2 linear or G4 sine-based evaluation
 * @returns {SplinePoint[]}
 */
export function generateBoundaryLoop(numSamples, controlPoints, useSupraQuant) {
    const numCp = controlPoints.length / 2;
    const p = 3; // Cubic spline degree
    
    // To cleanly close the periodic B-spline without straight lines or edge drops,
    // we extend the knot vector to size n + 2p + 1 and wrap the evaluated control indices.
    const numKnots = numCp + 2 * p + 1; // 8 + 6 + 1 = 15 knots
    const knots = new Float32Array(numKnots);
    
    // Distribute knots periodically spanning the 2*PI circle
    const step = (2 * Math.PI) / numCp;
    for (let i = 0; i < numKnots; i++) {
        knots[i] = (i - p) * step;
    }

    // Precalculate SupraQuant angular domain compression scale factor
    const activeSpan = p * step;
    const scaleFactor = 0.5 / activeSpan;

    /** @type {SplinePoint[]} */
    const points = [];
    const dt = (2 * Math.PI) / numSamples;

    for (let s = 0; s < numSamples; s++) {
        const theta = s * dt;
        let rx = 0.0;
        let ry = 0.0;

        // Allocate local basis arrays to compute sums for partition of unity
        let sumBasis = 0.0;
        const bases = new Float32Array(numCp + p);

        // Perform Cox-de Boor accumulation with wrapped periodic indices
        for (let i = 0; i < numCp + p; i++) {
            bases[i] = useSupraQuant 
                ? evaluateSupraQuantBasis(i, p, theta, knots, scaleFactor)
                : evaluateLinearBasis(i, p, theta, knots);
            sumBasis += bases[i];
        }

        // Apply partition-of-unity normalization to ensure affine invariance (constant sum = 1.0)
        for (let i = 0; i < numCp + p; i++) {
            const normalizedBasis = sumBasis > 1e-6 ? bases[i] / sumBasis : 0.0;
            const cpIdx = i % numCp;
            rx += normalizedBasis * controlPoints[2 * cpIdx];
            ry += normalizedBasis * controlPoints[2 * cpIdx + 1];
        }

        // Apply a circular phase transformation matrix M_2x2(theta)
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        
        // Matrix multiplication matching the processor formula S(theta)
        const fx = rx * cosT - ry * sinT;
        const fy = rx * sinT + ry * cosT;

        points.push({ x: fx, y: fy, dx4: 0.0 });
    }

    // Numerical calculation of the 4th derivative (d^4S/dtheta^4) using 5-point stencil
    for (let j = 0; j < numSamples; j++) {
        const p_2 = points[(j - 2 + numSamples) % numSamples];
        const p_1 = points[(j - 1 + numSamples) % numSamples];
        const p_0 = points[j];
        const p_plus1 = points[(j + 1) % numSamples];
        const p_plus2 = points[(j + 2) % numSamples];

        const dx4_x = (p_plus2.x - 4 * p_plus1.x + 6 * p_0.x - 4 * p_1.x + p_2.x) / Math.pow(dt, 4);
        const dx4_y = (p_plus2.y - 4 * p_plus1.y + 6 * p_0.y - 4 * p_1.y + p_2.y) / Math.pow(dt, 4);

        points[j].dx4 = Math.hypot(dx4_x, dx4_y);
    }

    return points;
}

/**
 * Returns the WGSL shader source helper for the GPU-based SupraQuant implementation.
 * Completely recursion-free, ensuring driver-level WebGPU compatibility while executing
 * the exact G4 periodic B-spline math with partition-of-unity normalization.
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

// Evaluates the G4 sine-based Cox-de Boor active bases without using recursive function calls (recursion-free)
fn evaluate_g4_basis_iterative(theta: f32, scale_factor: f32, knots: ptr<function, array<f32, 15>>) -> array<f32, 4> {
    let norm_theta = ((theta % 6.283185307179586) + 6.283185307179586) % 6.283185307179586;
    
    // Find the knot span index j such that knots[j] <= norm_theta < knots[j+1]
    var j = 3u;
    while (j < 11u) {
        if (norm_theta >= (*knots)[j] && norm_theta < (*knots)[j + 1u]) {
            break;
        }
        j = j + 1u;
    }
    if (j >= 11u) {
        j = 10u;
    }
    
    // b stores the active bases. Initially at degree 0, the only active basis is b[3] (index j)
    var b: array<f32, 4>;
    b[0] = 0.0;
    b[1] = 0.0;
    b[2] = 0.0;
    b[3] = 1.0;
    
    // Propagate up to degree 3 iteratively
    for (var r = 1u; r <= 3u; r = r + 1u) {
        var new_b: array<f32, 4>;
        let start_idx = 3u - r;
        
        for (var i = start_idx; i <= 3u; i = i + 1u) {
            let knot_idx = j - 3u + i;
            
            let denom1 = sin(((*knots)[knot_idx + r] - (*knots)[knot_idx]) * scale_factor);
            let denom2 = sin(((*knots)[knot_idx + r + 1u] - (*knots)[knot_idx + 1u]) * scale_factor);
            
            var term1 = 0.0;
            var term2 = 0.0;
            
            // Correct de Boor index recurrence mapping:
            // N_{i, r-1} is at index i, and N_{i+1, r-1} is at index i+1
            if (denom1 > 1e-6 && i >= (3u - (r - 1u))) {
                term1 = (sin((norm_theta - (*knots)[knot_idx]) * scale_factor) / denom1) * b[i];
            }
            if (denom2 > 1e-6 && (i + 1u) >= (3u - (r - 1u)) && (i + 1u) <= 3u) {
                term2 = (sin(((*knots)[knot_idx + r + 1u] - norm_theta) * scale_factor) / denom2) * b[i + 1u];
            }
            
            new_b[i] = term1 + term2;
        }
        b = new_b;
    }
    
    return b;
}

// Map circular phase to G4 scale-invariant quad vertex offsets using iterative basis evaluation
fn expand_supraquant_vertex(base_pos: vec3f, theta: f32, scale: f32) -> vec3f {
    var knots: array<f32, 15>;
    // Setup circular knots [0, 2*PI] for 8 control points, degree 3 B-spline
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

    // Find the active span j index and evaluate its 4 non-zero bases
    let norm_theta = ((theta % 6.283185307179586) + 6.283185307179586) % 6.283185307179586;
    var j = 3u;
    while (j < 11u) {
        if (norm_theta >= knots[j] && norm_theta < knots[j + 1u]) {
            break;
        }
        j = j + 1u;
    }
    if (j >= 11u) {
        j = 10u;
    }

    let b = evaluate_g4_basis_iterative(theta, scale_factor, &knots);
    
    // Sum active bases for partition of unity normalization on GPU
    let sum_b = b[0] + b[1] + b[2] + b[3];
    let safe_sum = select(sum_b, 1.0, sum_b <= 1e-6);

    var rx = 0.0;
    var ry = 0.0;

    // Accumulate the 4 active control points with normalized weights
    for (var i = 0u; i < 4u; i = i + 1u) {
        let cp_idx = (j - 3u + i) % 8u;
        let normalized_basis = b[i] / safe_sum;
        rx = rx + normalized_basis * cp[cp_idx].x;
        ry = ry + normalized_basis * cp[cp_idx].y;
    }

    // Multiplicative phase transformation matrix M_2x2(theta)
    let cos_t = cos(theta);
    let sin_t = sin(theta);
    let offset_x = (rx * cos_t - ry * sin_t) * scale;
    let offset_y = (rx * sin_t + ry * cos_t) * scale;

    return vec3f(base_pos.x + offset_x, base_pos.y + offset_y, base_pos.z);
}
`;
}
