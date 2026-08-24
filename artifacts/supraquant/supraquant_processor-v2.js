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
 * Evaluates the SupraQuant sine-based basis function (G4 continuity).
 * @param {number} i - Basis index
 * @param {number} p - Spline degree
 * @param {number} theta - Pre-scaled circular phase angle
 * @param {Float32Array} knots - Pre-scaled phase knot vector
 * @param {number} scaleFactor - Active scaling factor applied to the angular domain
 * @returns {number}
 */
export function evaluateSupraQuantBasis(i, p, theta, knots, scaleFactor) {
    if (p === 0) {
        // Map pre-scaled parameter into [0, 2pi * scaleFactor] circularly
        const period = 2 * Math.PI * scaleFactor;
        const normTheta = ((theta % period) + period) % period;
        return (normTheta >= knots[i] && normTheta < knots[i + 1]) ? 1.0 : 0.0;
    }

    // Sine-corrected angular denominators
    let sinDenom1 = Math.sin(knots[i + p] - knots[i]);
    let sinDenom2 = Math.sin(knots[i + p + 1] - knots[i + 1]);

    let term1 = 0.0;
    let term2 = 0.0;

    if (Math.abs(sinDenom1) > 1e-6) {
        term1 = (Math.sin(theta - knots[i]) / sinDenom1) * evaluateSupraQuantBasis(i, p - 1, theta, knots, scaleFactor);
    }
    if (Math.abs(sinDenom2) > 1e-6) {
        term2 = (Math.sin(knots[i + p + 1] - theta) / sinDenom2) * evaluateSupraQuantBasis(i + 1, p - 1, theta, knots, scaleFactor);
    }

    return term1 + term2;
}

/**
 * Generates a closed, continuous boundary loop comparing G2 vs G4 models.
 * @param {number} numSamples - Number of perimeter coordinates to generate
 * @param {Float32Array} controlPoints - 2D Control points array [x0, y0, x1, y1, ...]
 * @param {boolean} useSupraQuant - Toggle between G2 linear or G4 sine-based evaluation
 * @returns {SplinePoint[]}
 */
export function generateBoundaryLoop(numSamples, controlPoints, useSupraQuant) {
    const numCp = controlPoints.length / 2;
    const p = 3;
    const numKnots = numCp + p + 1;
    const knots = new Float32Array(numKnots);
    
    // Distribute knots evenly in [0, 2*PI]
    const step = (2 * Math.PI) / (numCp - p + 1);
    for (let i = 0; i < numKnots; i++) {
        knots[i] = (i - p) * step;
    }

    // Calculate scaling factor to compress the angular knot-span safely below PI.
    // This resolves the sin(PI) = 0 division singularity completely.
    const targetSpan = 0.5; // Target knot span in radians
    const scaleFactor = targetSpan / (p * step);
    
    // Pre-scale knots and parameter domain if using SupraQuant G4
    const evalKnots = useSupraQuant 
        ? knots.map(k => k * scaleFactor)
        : knots;

    /** @type {SplinePoint[]} */
    const points = [];
    const dt = (2 * Math.PI) / numSamples;

    for (let s = 0; s < numSamples; s++) {
        const theta = s * dt;
        const evalTheta = useSupraQuant ? theta * scaleFactor : theta;
        let rx = 0.0;
        let ry = 0.0;

        // Perform Cox-de Boor accumulation
        for (let i = 0; i < numCp; i++) {
            const basis = useSupraQuant 
                ? evaluateSupraQuantBasis(i, p, evalTheta, evalKnots, scaleFactor)
                : evaluateLinearBasis(i, p, evalTheta, evalKnots);
            
            rx += basis * controlPoints[2 * i];
            ry += basis * controlPoints[2 * i + 1];
        }

        // Apply circular phase transformation matrix M_2x2(theta)
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        
        const fx = rx * cosT - ry * sinT;
        const fy = rx * sinT + ry * cosT;

        points.push({ x: fx, y: fy, dx4: 0.0 });
    }

    // Numerical calculation of the 4th derivative (d^4S/dtheta^4) to expose the G2 fracture vs G4 continuity.
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
 * Ensures the GPU can compute G4 continuous coordinate transformations per vertex or fragment.
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

// Evaluates the G4 sine-based Cox-de Boor basis on the GPU
fn evaluate_g4_basis(i: u32, p: u32, theta: f32, knots: ptr<function, array<f32, 12>>, scale_factor: f32) -> f32 {
    if (p == 0u) {
        let period = 6.2831853 * scale_factor;
        let norm_theta = ((theta % period) + period) % period;
        if (norm_theta >= (*knots)[i] && norm_theta < (*knots)[i + 1u]) {
            return 1.0;
        }
        return 0.0;
    }

    let sin_denom1 = sin((*knots)[i + p] - (*knots)[i]);
    let sin_denom2 = sin((*knots)[i + p + 1u] - (*knots)[i + 1u]);

    var term1 = 0.0;
    var term2 = 0.0;

    if (abs(sin_denom1) > 1e-6) {
        term1 = (sin(theta - (*knots)[i]) / sin_denom1) * evaluate_g4_basis(i, p - 1u, theta, knots, scale_factor);
    }
    if (abs(sin_denom2) > 1e-6) {
        term2 = (sin((*knots)[i + p + 1u] - theta) / sin_denom2) * evaluate_g4_basis(i + 1u, p - 1u, theta, knots, scale_factor);
    }

    return term1 + term2;
}

// Map circular phase to G4 scale-invariant quad vertex offsets
fn expand_supraquant_vertex(base_pos: vec3f, theta: f32, scale: f32) -> vec3f {
    var knots: array<f32, 12>;
    let step_val = 6.2831853 / 6.0; // 8 control points, degree 3 B-spline: step = 2PI / 6
    
    // Scale factor to compress knot spacing below PI
    let target_span = 0.5;
    let scale_factor = target_span / (3.0 * step_val);

    for (var k = 0u; k < 12u; k = k + 1u) {
        knots[k] = (f32(k) - 3.0) * step_val * scale_factor;
    }

    let eval_theta = theta * scale_factor;

    // Static 2D control points outlining a unit star impostor shell
    var cp = array<vec2f, 8>(\n        vec2f(0.5, 0.0),  vec2f(0.35, 0.35),\n        vec2f(0.0, 0.5),  vec2f(-0.35, 0.35),\n        vec2f(-0.5, 0.0), vec2f(-0.35, -0.35),\n        vec2f(0.0, -0.5), vec2f(0.35, -0.35)\n    );

    var rx = 0.0;
    var ry = 0.0;

    for (var i = 0u; i < 8u; i = i + 1u) {
        let basis = evaluate_g4_basis(i, 3u, eval_theta, &knots, scale_factor);
        rx = rx + basis * cp[i].x;
        ry = ry + basis * cp[i].y;
    }

    let cos_t = cos(theta);
    let sin_t = sin(theta);
    let offset_x = (rx * cos_t - ry * sin_t) * scale;
    let offset_y = (rx * sin_t + ry * cos_t) * scale;

    return vec3f(base_pos.x + offset_x, base_pos.y + offset_y, base_pos.z);
}
`;
}
