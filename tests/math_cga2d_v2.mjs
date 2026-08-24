// @ts-check
/// <reference path="../types/cga2d.d.ts" />
/**
 * @file Pure JavaScript Mathematical Reference Module for 2D Inversive Geometry & 4D CGA
 * @project 3DGSIL
 * @module math_cga2d
 */

/** Regularization constant to avoid division-by-zero singularities */
export const EPSILON = 1e-7;

/**
 * Invert a 2D point with respect to a circle of radius R centered at (cx, cy).
 * Formula: p* = c + (R^2 / (||p - c||^2 + eps)) * (p - c)
 * 
 * @param {[number, number]} p - Point [x, y] to invert
 * @param {number} R - Inversion radius
 * @param {[number, number]} [center=[0, 0]] - Center of inversion circle
 * @returns {[number, number]} Inverted point [x*, y*]
 */
export function invertPoint(p, R, center = [0, 0]) {
    const vx = p[0] - center[0];
    const vy = p[1] - center[1];
    const distSq = vx * vx + vy * vy;
    const factor = (R * R) / (distSq + EPSILON);
    return [
        center[0] + vx * factor,
        center[1] + vy * factor
    ];
}

/**
 * Invert a 2D circle with respect to the inversion circle (origin center, radius R).
 * 
 * @param {{ cx: number, cy: number, r: number }} circle - Circle to invert
 * @param {number} R - Inversion radius
 * @returns {{ type: 'circle', cx: number, cy: number, r: number } | { type: 'line', nx: number, ny: number, d: number }}
 */
export function invertCircle(circle, R) {
    const dSq = circle.cx * circle.cx + circle.cy * circle.cy;
    const rSq = circle.r * circle.r;
    const denom = dSq - rSq;

    // If the circle passes through the origin (denom ≈ 0), it inverts to a straight line
    if (Math.abs(denom) < 1e-4) {
        const d = Math.sqrt(dSq);
        const nx = d > 1e-6 ? circle.cx / d : 1;
        const ny = d > 1e-6 ? circle.cy / d : 0;
        const lineDist = (R * R) / (2 * circle.r);
        return {
            type: 'line',
            nx,
            ny,
            d: lineDist
        };
    }

    // Otherwise it inverts to another circle
    const factor = (R * R) / denom;
    const newCx = circle.cx * factor;
    const newCy = circle.cy * factor;
    const newR = (R * R * circle.r) / Math.abs(denom);

    return {
        type: 'circle',
        cx: newCx,
        cy: newCy,
        r: newR
    };
}

/**
 * Invert a 2D line (nx * x + ny * y = d) with respect to the inversion circle (origin, radius R).
 * 
 * @param {{ nx: number, ny: number, d: number }} line - Line with unit normal (nx, ny) and distance d
 * @param {number} R - Inversion radius
 * @returns {{ type: 'line', nx: number, ny: number, d: number } | { type: 'circle', cx: number, cy: number, r: number }}
 */
export function invertLine(line, R) {
    // If the line passes through the origin (d ≈ 0), it inverts to itself
    if (Math.abs(line.d) < 1e-5) {
        return {
            type: 'line',
            nx: line.nx,
            ny: line.ny,
            d: 0
        };
    }

    // Otherwise it inverts to a circle passing through the origin
    const radius = (R * R) / (2 * Math.abs(line.d));
    const factor = (R * R) / (2 * line.d);
    return {
        type: 'circle',
        cx: line.nx * factor,
        cy: line.ny * factor,
        r: radius
    };
}

/**
 * Compute the radius for a circle centered at (cx, cy) to be orthogonal to the inversion circle.
 * Condition for orthogonality: ||c||^2 = R^2 + r^2  =>  r = sqrt(||c||^2 - R^2)
 * 
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} R - Inversion radius
 * @returns {number | null} Orthogonal radius, or null if center is inside the inversion circle
 */
export function getOrthogonalCircleRadius(cx, cy, R) {
    const dSq = cx * cx + cy * cy;
    if (dSq <= R * R) {
        return null;
    }
    return Math.sqrt(dSq - R * R);
}

/**
 * Compute the 2x2 Jacobian matrix of circle inversion at point x.
 * J(x) = (R^2 / ||x||^2) * (I - 2 * (x * x^T) / ||x||^2)
 * 
 * @param {[number, number]} pos - Position [x, y]
 * @param {number} R - Inversion radius
 * @returns {[number, number, number, number]} 2x2 Jacobian [j00, j01, j10, j11]
 */
export function getInversionJacobian(pos, R) {
    const x = pos[0];
    const y = pos[1];
    const rSq = x * x + y * y + EPSILON;
    const scale = (R * R) / rSq;

    const j00 = scale * (1.0 - (2.0 * x * x) / rSq);
    const j01 = scale * (-2.0 * x * y / rSq);
    const j10 = j01; // Symmetric
    const j11 = scale * (1.0 - (2.0 * y * y) / rSq);

    return [j00, j01, j10, j11];
}

/**
 * Transform a 2D Gaussian covariance matrix under circle inversion: Sigma* = J * Sigma * J^T
 * 
 * @param {[number, number]} pos - Center of the Gaussian [x, y]
 * @param {[number, number, number]} sigma - Covariance components [sigmaXX, sigmaXY, sigmaYY]
 * @param {number} R - Inversion radius
 * @returns {{
 *   posStar: [number, number],
 *   sigmaStar: [number, number, number],
 *   ellipseParams: { cx: number, cy: number, rx: number, ry: number, angleDeg: number }
 * }}
 */
export function invertGaussianCovariance(pos, sigma, R) {
    const posStar = invertPoint(pos, R);
    const J = getInversionJacobian(pos, R);

    const [j00, j01, j10, j11] = J;
    const [sXX, sXY, sYY] = sigma;

    // A = J * Sigma
    const a00 = j00 * sXX + j01 * sXY;
    const a01 = j00 * sXY + j01 * sYY;
    const a10 = j10 * sXX + j11 * sXY;
    const a11 = j10 * sXY + j11 * sYY;

    // Sigma* = A * J^T = A * J (since J is symmetric)
    const starXX = a00 * j00 + a01 * j01;
    const starXY = a00 * j10 + a01 * j11;
    const starYY = a10 * j10 + a11 * j11;

    // Extract SVG ellipse parameters from covariance Sigma*
    const ellipseParams = covarianceToSvgEllipse(posStar[0], posStar[1], starXX, starXY, starYY);

    return {
        posStar,
        sigmaStar: [starXX, starXY, starYY],
        ellipseParams
    };
}

/**
 * Extract SVG ellipse geometry (rx, ry, rotation in degrees) from a 2D covariance matrix.
 * 
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} sXX - Covariance xx
 * @param {number} sXY - Covariance xy
 * @param {number} sYY - Covariance yy
 * @returns {{ cx: number, cy: number, rx: number, ry: number, angleDeg: number }}
 */
export function covarianceToSvgEllipse(cx, cy, sXX, sXY, sYY) {
    const trace = sXX + sYY;
    const det = sXX * sYY - sXY * sXY;
    const diff = sXX - sYY;
    const disc = Math.sqrt(Math.max(0, diff * diff + 4 * sXY * sXY));

    const lambda1 = Math.max(1e-4, (trace + disc) * 0.5);
    const lambda2 = Math.max(1e-4, (trace - disc) * 0.5);

    const rx = Math.sqrt(lambda1);
    const ry = Math.sqrt(lambda2);

    const angleRad = 0.5 * Math.atan2(2 * sXY, diff);
    const angleDeg = (angleRad * 180) / Math.PI;

    return {
        cx,
        cy,
        rx,
        ry,
        angleDeg
    };
}

/**
 * Evaluate the 2D 2-Vector Fourier kinematic chain and its dual space trajectory.
 * 
 * @param {number} t - Time in seconds
 * @param {{ r1: number, w1: number, phi1?: number }} v1 - Sun -> Planet harmonic
 * @param {{ r2: number, w2: number, phi2?: number }} v2 - Planet -> Moon harmonic
 * @param {number} R - Inversion radius
 * @returns {{
 *   sun: [number, number],
 *   planet: [number, number],
 *   moon: [number, number],
 *   sunStar: [number, number],
 *   planetStar: [number, number],
 *   moonStar: [number, number]
 * }}
 */
export function evaluateFourierChain2D(t, v1, v2, R) {
    const phi1 = v1.phi1 || 0;
    const phi2 = v2.phi2 || 0;

    const th1 = v1.w1 * t + phi1;
    const th2 = v2.w2 * t + phi2;

    const sun = [0, 0];
    const planet = [
        v1.r1 * Math.cos(th1),
        v1.r1 * Math.sin(th1)
    ];
    const moon = [
        planet[0] + v2.r2 * Math.cos(th2),
        planet[1] + v2.r2 * Math.sin(th2)
    ];

    /** @type {[number, number]} */
    const sunTyped = [sun[0], sun[1]];
    /** @type {[number, number]} */
    const planetTyped = [planet[0], planet[1]];
    /** @type {[number, number]} */
    const moonTyped = [moon[0], moon[1]];

    const sunStar = invertPoint(sunTyped, R);
    const planetStar = invertPoint(planetTyped, R);
    const moonStar = invertPoint(moonTyped, R);

    return {
        sun: sunTyped,
        planet: planetTyped,
        moon: moonTyped,
        sunStar,
        planetStar,
        moonStar
    };
}

/**
 * Calculate the cosine of the angle between two intersecting circles at intersection point p.
 * 
 * @param {{ cx: number, cy: number, r: number }} c1
 * @param {{ cx: number, cy: number, r: number }} c2
 * @param {[number, number]} p - Intersection point
 * @returns {number} cos(theta)
 */
export function angleBetweenCircles(c1, c2, p) {
    const v1x = p[0] - c1.cx;
    const v1y = p[1] - c1.cy;
    const v2x = p[0] - c2.cx;
    const v2y = p[1] - c2.cy;

    const dot = v1x * v2x + v1y * v2y;
    return dot / (c1.r * c2.r);
}

/**
 * Clamp a 2D position to remain strictly in the exterior world (||p|| >= R + margin).
 * 
 * @param {[number, number]} p - Position [x, y]
 * @param {number} R - Inversion radius
 * @param {number} [margin=1.0] - Minimum distance from horizon
 * @returns {[number, number]} Clamped position
 */
export function clampToExterior(p, R, margin = 1.0) {
    const dist = Math.hypot(p[0], p[1]);
    const minR = R + margin;
    if (dist < minR) {
        const factor = minR / (dist || 1e-6);
        return [p[0] * factor, p[1] * factor];
    }
    return [p[0], p[1]];
}

/**
 * Clamp a 2D position to remain strictly in the interior mirror world (eps <= ||p|| <= R - margin).
 * 
 * @param {[number, number]} p - Position [x, y]
 * @param {number} R - Inversion radius
 * @param {number} [margin=1.0] - Margin from horizon
 * @returns {[number, number]} Clamped position
 */
export function clampToInterior(p, R, margin = 1.0) {
    const dist = Math.hypot(p[0], p[1]);
    const maxR = Math.max(1.0, R - margin);
    if (dist > maxR) {
        const factor = maxR / (dist || 1e-6);
        return [p[0] * factor, p[1] * factor];
    }
    return [p[0], p[1]];
}

/**
 * Reflect particle velocity and position off the uncrossable horizon barrier (r = R).
 * 
 * @param {[number, number]} pos - Particle position
 * @param {[number, number]} vel - Particle velocity
 * @param {number} R - Horizon radius
 * @param {number} [particleRadius=0] - Collision margin
 * @returns {{ pos: [number, number], vel: [number, number], bounced: boolean }}
 */
export function reflectAtHorizon(pos, vel, R, particleRadius = 0) {
    const dist = Math.hypot(pos[0], pos[1]);
    const barrierR = R + particleRadius;

    if (dist < barrierR) {
        // Normal pointing outwards from center
        const nx = dist > 1e-6 ? pos[0] / dist : 1;
        const ny = dist > 1e-6 ? pos[1] / dist : 0;

        // Reposition strictly outside
        const correctedPos = [nx * barrierR, ny * barrierR];

        // Velocity reflection: v' = v - 2(v . n)n
        const vDotN = vel[0] * nx + vel[1] * ny;
        if (vDotN < 0) {
            const correctedVel = [
                vel[0] - 2 * vDotN * nx,
                vel[1] - 2 * vDotN * ny
            ];
            /** @type {[number, number]} */
            const typedPos = [correctedPos[0], correctedPos[1]];
            /** @type {[number, number]} */
            const typedVel = [correctedVel[0], correctedVel[1]];
            return { pos: typedPos, vel: typedVel, bounced: true };
        }
    }

    return { pos: [pos[0], pos[1]], vel: [vel[0], vel[1]], bounced: false };
}

/**
 * Compute the conformal dual 4-lobed interior curve of a cosmic bounding box (X = ±L, Y = ±L).
 * As L -> infinity, the inverted curve converges to the central origin singularity O(0,0).
 * 
 * @param {number} halfL - Half-width of the outer cosmic bounding box
 * @param {number} R - Inversion radius
 * @param {number} [samplesPerSide=32] - Number of sample points per side
 * @returns {Array<[number, number]>} Inverted polygon vertices inside the circle
 */
export function invertCosmicBox(halfL, R, samplesPerSide = 32) {
    /** @type {Array<[number, number]>} */
    const outerPts = [];

    // Top side: x from -L to L, y = L
    for (let i = 0; i <= samplesPerSide; i++) {
        const x = -halfL + (2 * halfL * i) / samplesPerSide;
        outerPts.push([x, halfL]);
    }
    // Right side: x = L, y from L to -L
    for (let i = 1; i <= samplesPerSide; i++) {
        const y = halfL - (2 * halfL * i) / samplesPerSide;
        outerPts.push([halfL, y]);
    }
    // Bottom side: x from L to -L, y = -L
    for (let i = 1; i <= samplesPerSide; i++) {
        const x = halfL - (2 * halfL * i) / samplesPerSide;
        outerPts.push([x, -halfL]);
    }
    // Left side: x = -L, y from -L to L
    for (let i = 1; i < samplesPerSide; i++) {
        const y = -halfL + (2 * halfL * i) / samplesPerSide;
        outerPts.push([-halfL, y]);
    }

    return outerPts.map(pt => invertPoint(pt, R));
}

/**
 * @typedef {Object} PlanetaryParams2D
 * @property {[number, number]} [sunPos] - Position of Sun
 * @property {number} [sunRadius] - Radius of Sun disk
 * @property {number} [planetDist] - Distance from Sun to Planet
 * @property {number} [planetRadius] - Radius of Planet disk
 * @property {number} [planetSpeed] - Orbital frequency of Planet (rad/s)
 * @property {number} [planetPhase] - Initial phase of Planet
 * @property {number} [moonDist] - Distance from Planet to Moon
 * @property {number} [moonRadius] - Radius of Moon disk
 * @property {number} [moonSpeed] - Orbital frequency of Moon (rad/s)
 * @property {number} [moonPhase] - Initial phase of Moon
 * @property {number} [hyperbolicWarp] - Hyperbolic metric exponent gamma (1.0 = raw Euclidean, < 1.0 = hyperbolic expansion)
 */

/**
 * Evaluate a 2D Flat Planetary System (Sun, Planet, Moon) and its Conformal Dual Inversion.
 * 
 * @param {number} t - Time in seconds
 * @param {PlanetaryParams2D} [params={}] - Orbital configuration
 * @param {number} [R=120.0] - Inversion radius
 * @returns {CGA2D.PlanetarySystem2D}
 */
export function evaluatePlanetarySystem2D(t, params = {}, R = 120.0) {
    const sunPos = params.sunPos || [0, 0];
    const sunRadius = params.sunRadius || 24;
    const planetDist = params.planetDist || 180;
    const planetRadius = params.planetRadius || 12;
    const planetSpeed = params.planetSpeed || 0.5;
    const planetPhase = params.planetPhase || 0;
    const moonDist = params.moonDist || 36;
    const moonRadius = params.moonRadius || 5;
    const moonSpeed = params.moonSpeed || 2.8;
    const moonPhase = params.moonPhase || 0;

    // 1. Primal Coordinates
    const thetaPlanet = planetSpeed * t + planetPhase;
    const planetPos = [
        sunPos[0] + planetDist * Math.cos(thetaPlanet),
        sunPos[1] + planetDist * Math.sin(thetaPlanet)
    ];

    const thetaMoon = moonSpeed * t + moonPhase;
    const moonPos = [
        planetPos[0] + moonDist * Math.cos(thetaMoon),
        planetPos[1] + moonDist * Math.sin(thetaMoon)
    ];

    /** @type {[number, number]} */
    const sunPosTyped = [sunPos[0], sunPos[1]];
    /** @type {[number, number]} */
    const planetPosTyped = [planetPos[0], planetPos[1]];
    /** @type {[number, number]} */
    const moonPosTyped = [moonPos[0], moonPos[1]];

    // 2. Dual Inversive Circles
    const sunCircle = { cx: sunPosTyped[0], cy: sunPosTyped[1], r: sunRadius };
    const planetCircle = { cx: planetPosTyped[0], cy: planetPosTyped[1], r: planetRadius };
    const moonCircle = { cx: moonPosTyped[0], cy: moonPosTyped[1], r: moonRadius };

    const dualSun = invertCircle(sunCircle, R);
    const dualPlanet = invertCircle(planetCircle, R);
    const dualMoon = invertCircle(moonCircle, R);

    /** @type {CGA2D.CelestialBody2D} */
    const sun = {
        name: 'Sun',
        pos: sunPosTyped,
        radius: sunRadius,
        color: '#ffd700',
        dualCircle: dualSun.type === 'circle' ? { cx: dualSun.cx, cy: dualSun.cy, r: dualSun.r } : undefined
    };

    /** @type {CGA2D.CelestialBody2D} */
    const planet = {
        name: 'Planet',
        pos: planetPosTyped,
        radius: planetRadius,
        color: '#00ff9d',
        dualCircle: dualPlanet.type === 'circle' ? { cx: dualPlanet.cx, cy: dualPlanet.cy, r: dualPlanet.r } : undefined
    };

    /** @type {CGA2D.CelestialBody2D} */
    const moon = {
        name: 'Moon',
        pos: moonPosTyped,
        radius: moonRadius,
        color: '#00f0ff',
        dualCircle: dualMoon.type === 'circle' ? { cx: dualMoon.cx, cy: dualMoon.cy, r: dualMoon.r } : undefined
    };

    /** @type {CGA2D.CelestialBody2D} */
    const sunStar = {
        name: 'Sun*',
        pos: dualSun.type === 'circle' ? [dualSun.cx, dualSun.cy] : invertPoint(sunPosTyped, R),
        radius: dualSun.type === 'circle' ? dualSun.r : 5,
        color: '#ff9900'
    };

    /** @type {CGA2D.CelestialBody2D} */
    const planetStar = {
        name: 'Planet*',
        pos: dualPlanet.type === 'circle' ? [dualPlanet.cx, dualPlanet.cy] : invertPoint(planetPosTyped, R),
        radius: dualPlanet.type === 'circle' ? dualPlanet.r : 4,
        color: '#ff007f'
    };

    /** @type {CGA2D.CelestialBody2D} */
    const moonStar = {
        name: 'Moon*',
        pos: dualMoon.type === 'circle' ? [dualMoon.cx, dualMoon.cy] : invertPoint(moonPosTyped, R),
        radius: dualMoon.type === 'circle' ? dualMoon.r : 2,
        color: '#b056ff'
    };

    // 3. Shadow Cone (Umbra) from Sun to Planet
    const dx = planetPosTyped[0] - sunPosTyped[0];
    const dy = planetPosTyped[1] - sunPosTyped[1];
    const distSunPlanet = Math.hypot(dx, dy) || 1;
    const nx = -dy / distSunPlanet;
    const ny = dx / distSunPlanet;

    const shadowLength = 200;
    /** @type {Array<[number, number]>} */
    const shadowUmbra = [
        [planetPosTyped[0] + nx * planetRadius, planetPosTyped[1] + ny * planetRadius],
        [planetPosTyped[0] + (dx / distSunPlanet) * shadowLength + nx * (planetRadius * 1.5), planetPosTyped[1] + (dy / distSunPlanet) * shadowLength + ny * (planetRadius * 1.5)],
        [planetPosTyped[0] + (dx / distSunPlanet) * shadowLength - nx * (planetRadius * 1.5), planetPosTyped[1] + (dy / distSunPlanet) * shadowLength - ny * (planetRadius * 1.5)],
        [planetPosTyped[0] - nx * planetRadius, planetPosTyped[1] - ny * planetRadius]
    ];

    return {
        sun,
        planet,
        moon,
        sunStar,
        planetStar,
        moonStar,
        shadowUmbra
    };
}

/**
 * Invert a target circle into the interior mirror universe of an arbitrary host body (host center c_h, host radius R_h),
 * optionally applying an angle-preserving hyperbolic / logarithmic conformal radial metric warp to prevent cramming at the central singularity.
 * 
 * @param {{ cx: number, cy: number, r: number }} targetCircle - External body circle
 * @param {{ cx: number, cy: number, r: number }} hostCircle - Host body horizon circle
 * @param {number} [warpGamma=1.0] - Hyperbolic exponent gamma (1.0 = raw Euclidean inversion, < 1.0 = hyperbolic metric expansion)
 * @returns {CGA2D.Circle}
 */
export function invertCircleInHost(targetCircle, hostCircle, warpGamma = 1.0) {
    const dx = targetCircle.cx - hostCircle.cx;
    const dy = targetCircle.cy - hostCircle.cy;
    const distSq = dx * dx + dy * dy;
    const denom = distSq - targetCircle.r * targetCircle.r;
    const R_hSq = hostCircle.r * hostCircle.r;

    if (Math.abs(denom) < 1e-6) {
        // Grazing horizon condition
        return {
            type: 'circle',
            cx: hostCircle.cx + (R_hSq * dx) / (distSq + 1e-6),
            cy: hostCircle.cy + (R_hSq * dy) / (distSq + 1e-6),
            r: hostCircle.r
        };
    }

    const factor = R_hSq / denom;
    let dualCx = hostCircle.cx + dx * factor;
    let dualCy = hostCircle.cy + dy * factor;
    let dualR = (R_hSq * targetCircle.r) / Math.abs(denom);

    if (warpGamma > 0 && warpGamma < 0.999) {
        const offsetDist = Math.hypot(dualCx - hostCircle.cx, dualCy - hostCircle.cy);
        const u = Math.min(1.0, offsetDist / hostCircle.r);
        if (u > 1e-5) {
            const uHyp = Math.pow(u, warpGamma);
            const scale = (uHyp * hostCircle.r) / (offsetDist || 1);
            dualCx = hostCircle.cx + (dualCx - hostCircle.cx) * scale;
            dualCy = hostCircle.cy + (dualCy - hostCircle.cy) * scale;
            const rScale = uHyp / u;
            dualR = Math.min(dualR * rScale, hostCircle.r * Math.max(0.01, 1.0 - uHyp) * 0.48);
        }
    }

    return {
        type: 'circle',
        cx: dualCx,
        cy: dualCy,
        r: dualR
    };
}

/**
 * Convert array of 2D points to SVG polygon/path string 'd="M x0 y0 L x1 y1 ... Z"'
 * @param {Array<CGA2D.Point2D>} points
 * @returns {string}
 */
export function pointsToSvgPath(points) {
    if (!points || points.length === 0) return '';
    return points.reduce((acc, [x, y], idx) => {
        return idx === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `${acc} L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }, '') + ' Z';
}

/**
 * Sample a circle under spherical inversion and optional hyperbolic depth warp,
 * returning a closed polygon / path of 2D points.
 * Under general non-affine or hyperbolic transforms, an inverted circle deforms from
 * a Euclidean circle into an exact pear/egg/teardrop shaped contour.
 * 
 * @param {{ cx: number, cy: number, r: number }} targetCircle - Target body circle
 * @param {{ cx: number, cy: number, r: number }} hostCircle - Host body horizon
 * @param {number} [warpGamma=1.0] - Hyperbolic exponent gamma
 * @param {number} [numSamples=64] - Number of boundary sample points
 * @returns {Array<CGA2D.Point2D>}
 */
export function sampleInvertedCirclePath(targetCircle, hostCircle, warpGamma = 1.0, numSamples = 64) {
    /** @type {Array<CGA2D.Point2D>} */
    const path = [];
    for (let i = 0; i < numSamples; i++) {
        const theta = (i / numSamples) * 2 * Math.PI;
        const px = targetCircle.cx + targetCircle.r * Math.cos(theta);
        const py = targetCircle.cy + targetCircle.r * Math.sin(theta);

        const dx = px - hostCircle.cx;
        const dy = py - hostCircle.cy;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        if (dist < 1e-6) {
            path.push([hostCircle.cx, hostCircle.cy]);
            continue;
        }

        const rawInvDist = (hostCircle.r * hostCircle.r) / dist;
        let finalDist = rawInvDist;

        if (warpGamma > 0 && warpGamma < 0.999) {
            const u = Math.min(1.0, rawInvDist / hostCircle.r);
            finalDist = hostCircle.r * Math.pow(u, warpGamma);
        }

        const invX = hostCircle.cx + (dx / dist) * finalDist;
        const invY = hostCircle.cy + (dy / dist) * finalDist;
        path.push([invX, invY]);
    }
    return path;
}

/**
 * Evaluate the Recursive Holographic Multi-Horizon Planetary System:
 * Every body (Sun, Planet, Moon) contains an internal mirror universe with its center as infinity,
 * hosting the other 2 bodies orbiting within its interior disk.
 * 
 * @param {number} t - Time in seconds
 * @param {PlanetaryParams2D} [params={}] - Planetary orbit configuration
 * @returns {CGA2D.RecursivePlanetarySystem2D}
 */
export function evaluateRecursivePlanetarySystem2D(t, params = {}) {
    const sunPos = params.sunPos || [0, 0];
    const sunRadius = params.sunRadius || 24;
    const planetDist = params.planetDist || 180;
    const planetRadius = params.planetRadius || 12;
    const planetSpeed = params.planetSpeed || 0.5;
    const planetPhase = params.planetPhase || 0;
    const moonDist = params.moonDist || 36;
    const moonRadius = params.moonRadius || 5;
    const moonSpeed = params.moonSpeed || 2.8;
    const moonPhase = params.moonPhase || 0;
    const warpGamma = params.hyperbolicWarp || 1.0;

    // Primal Celestial Coordinates
    const thetaPlanet = planetSpeed * t + planetPhase;
    const planetPos = [
        sunPos[0] + planetDist * Math.cos(thetaPlanet),
        sunPos[1] + planetDist * Math.sin(thetaPlanet)
    ];

    const thetaMoon = moonSpeed * t + moonPhase;
    const moonPos = [
        planetPos[0] + moonDist * Math.cos(thetaMoon),
        planetPos[1] + moonDist * Math.sin(thetaMoon)
    ];

    /** @type {[number, number]} */
    const sunPosTyped = [sunPos[0], sunPos[1]];
    /** @type {[number, number]} */
    const planetPosTyped = [planetPos[0], planetPos[1]];
    /** @type {[number, number]} */
    const moonPosTyped = [moonPos[0], moonPos[1]];

    const sunCircle = { cx: sunPosTyped[0], cy: sunPosTyped[1], r: sunRadius };
    const planetCircle = { cx: planetPosTyped[0], cy: planetPosTyped[1], r: planetRadius };
    const moonCircle = { cx: moonPosTyped[0], cy: moonPosTyped[1], r: moonRadius };

    // 1. Inside the Sun (Host: Sun, Horizon R_sun, Center = Infinity_sun)
    // Hosts: Planet*(sun), Moon*(sun)
    const planetInSun = invertCircleInHost(planetCircle, sunCircle, warpGamma);
    const moonInSun = invertCircleInHost(moonCircle, sunCircle, warpGamma);
    const planetInSunPath = sampleInvertedCirclePath(planetCircle, sunCircle, warpGamma, 48);
    const moonInSunPath = sampleInvertedCirclePath(moonCircle, sunCircle, warpGamma, 48);

    /** @type {CGA2D.HostBodyUniverse2D} */
    const sunUniverse = {
        host: { name: 'Sun', pos: sunPosTyped, radius: sunRadius, color: '#ffd700' },
        singularityCenter: sunPosTyped,
        internalBodies: [
            { name: 'Planet* (in Sun)', pos: [planetInSun.cx, planetInSun.cy], radius: planetInSun.r, color: '#00f0ff', path: planetInSunPath, svgPath: pointsToSvgPath(planetInSunPath) },
            { name: 'Moon* (in Sun)', pos: [moonInSun.cx, moonInSun.cy], radius: moonInSun.r, color: '#ff007f', path: moonInSunPath, svgPath: pointsToSvgPath(moonInSunPath) }
        ]
    };

    // 2. Inside the Planet (Host: Planet, Horizon R_planet, Center = Infinity_planet)
    // Hosts: Sun*(planet), Moon*(planet)
    const sunInPlanet = invertCircleInHost(sunCircle, planetCircle, warpGamma);
    const moonInPlanet = invertCircleInHost(moonCircle, planetCircle, warpGamma);
    const sunInPlanetPath = sampleInvertedCirclePath(sunCircle, planetCircle, warpGamma, 64);
    const moonInPlanetPath = sampleInvertedCirclePath(moonCircle, planetCircle, warpGamma, 48);

    /** @type {CGA2D.HostBodyUniverse2D} */
    const planetUniverse = {
        host: { name: 'Planet', pos: planetPosTyped, radius: planetRadius, color: '#00f0ff' },
        singularityCenter: planetPosTyped,
        internalBodies: [
            { name: 'Sun* (in Planet)', pos: [sunInPlanet.cx, sunInPlanet.cy], radius: sunInPlanet.r, color: '#ffd700', path: sunInPlanetPath, svgPath: pointsToSvgPath(sunInPlanetPath) },
            { name: 'Moon* (in Planet)', pos: [moonInPlanet.cx, moonInPlanet.cy], radius: moonInPlanet.r, color: '#ff007f', path: moonInPlanetPath, svgPath: pointsToSvgPath(moonInPlanetPath) }
        ]
    };

    // 3. Inside the Moon (Host: Moon, Horizon R_moon, Center = Infinity_moon)
    // Hosts: Sun*(moon), Planet*(moon)
    const sunInMoon = invertCircleInHost(sunCircle, moonCircle, warpGamma);
    const planetInMoon = invertCircleInHost(planetCircle, moonCircle, warpGamma);
    const sunInMoonPath = sampleInvertedCirclePath(sunCircle, moonCircle, warpGamma, 64);
    const planetInMoonPath = sampleInvertedCirclePath(planetCircle, moonCircle, warpGamma, 48);

    /** @type {CGA2D.HostBodyUniverse2D} */
    const moonUniverse = {
        host: { name: 'Moon', pos: moonPosTyped, radius: moonRadius, color: '#ff007f' },
        singularityCenter: moonPosTyped,
        internalBodies: [
            { name: 'Sun* (in Moon)', pos: [sunInMoon.cx, sunInMoon.cy], radius: sunInMoon.r, color: '#ffd700', path: sunInMoonPath, svgPath: pointsToSvgPath(sunInMoonPath) },
            { name: 'Planet* (in Moon)', pos: [planetInMoon.cx, planetInMoon.cy], radius: planetInMoon.r, color: '#00f0ff', path: planetInMoonPath, svgPath: pointsToSvgPath(planetInMoonPath) }
        ]
    };

    // 4. Lagrangian Points & Gravitational Pools (Sun-Planet = RED, Planet-Moon = GREEN)
    const sunPlanetLagrange = evaluateLagrangePoints2D(
        { ...sunCircle, name: 'Sun' },
        { ...planetCircle, name: 'Planet' },
        0.04,
        '#ff3344'
    );
    const planetMoonLagrange = evaluateLagrangePoints2D(
        { ...planetCircle, name: 'Planet' },
        { ...moonCircle, name: 'Moon' },
        0.08,
        '#00ff66'
    );

    const sunPlanetRoche = evaluateRocheLobeContours2D(sunCircle, planetCircle, sunPlanetLagrange, 36);
    const planetMoonRoche = evaluateRocheLobeContours2D(planetCircle, moonCircle, planetMoonLagrange, 32);

    // 5. Invert Lagrange points cleanly into each body's local universe
    // Inside Sun: Sun-Planet L1..L5
    sunUniverse.internalLagrangePoints = evaluateLagrangeProjectionsInHost(
        sunPlanetLagrange.allPoints,
        sunCircle,
        warpGamma
    );

    // Inside Planet:
    // 1. Sun-Planet collinear equilibrium points L1 (day side) and L2 (night side) on the day/night axis
    // 2. Planet-Moon lunar system points L1..L5 (orbiting the planet with the Moon)
    planetUniverse.internalLagrangePoints = evaluateLagrangeProjectionsInHost(
        [sunPlanetLagrange.L1, sunPlanetLagrange.L2, ...planetMoonLagrange.allPoints],
        planetCircle,
        warpGamma
    );

    // Inside Moon:
    // Collinear Planet-Moon equilibrium points L1 (sub-planet) and L2 (anti-planet) that define the Moon's Hill reach
    moonUniverse.internalLagrangePoints = evaluateLagrangeProjectionsInHost(
        [planetMoonLagrange.L1, planetMoonLagrange.L2],
        moonCircle,
        warpGamma
    );

    // 6. Extended Source 4-Tangent Optics (Sun -> Planet, Sun -> Moon, Planet -> Moon)
    const sunToPlanetOptics = getCommonExternalTangents(sunCircle, planetCircle, 7);
    const sunToMoonOptics = getCommonExternalTangents(sunCircle, moonCircle, 5);
    const planetToMoonOptics = evaluateFourCommonTangents2D(planetCircle, moonCircle);

    // Conformal Dual Optics in Inner Universes (Inverting the 4 tangent lines into 4 circles)
    const sunOpticsInSun = evaluateFourCommonTangents2D(sunCircle, planetCircle, sunCircle);
    const planetOpticsInPlanet = evaluateFourCommonTangents2D(sunCircle, planetCircle, planetCircle);
    const moonOpticsInMoon = evaluateFourCommonTangents2D(planetCircle, moonCircle, moonCircle);

    sunUniverse.internalConformalOptics = sunOpticsInSun.dualConformalCircles;
    planetUniverse.internalConformalOptics = planetOpticsInPlanet.dualConformalCircles;
    moonUniverse.internalConformalOptics = moonOpticsInMoon.dualConformalCircles;

    // 7. Dual Umbra & Penumbra Shadows (Planet & Moon)
    const planetShadow = getUmbraPenumbraCones(sunCircle, planetCircle, 600);
    const moonShadow = getUmbraPenumbraCones(sunCircle, moonCircle, 400);

    // 8. Secondary Albedo Reflections (Planetshine onto Moon & Moonshine onto Planet)
    const planetshine = getSecondaryAlbedoReflection({ ...planetCircle, name: 'Planet' }, { ...moonCircle, name: 'Moon' }, sunCircle, 0.39);
    const moonshine = getSecondaryAlbedoReflection({ ...moonCircle, name: 'Moon' }, { ...planetCircle, name: 'Planet' }, sunCircle, 0.12);

    return {
        sunUniverse,
        planetUniverse,
        moonUniverse,
        sunPlanetLagrange,
        planetMoonLagrange,
        sunPlanetRoche,
        planetMoonRoche,
        sunToPlanetOptics,
        sunToMoonOptics,
        planetToMoonOptics,
        planetShadow,
        moonShadow,
        planetshine,
        moonshine
    };
}

/**
 * Compute the 4 Common Tangent Lines (2 Direct, 2 Transverse), Vertices, 4 Illumination Zones,
 * and optional Conformal Dual Circles in an Inverted Host Universe.
 * 
 * @param {{ cx: number, cy: number, r: number }} c1 - Primary / Emitter (e.g. Sun)
 * @param {{ cx: number, cy: number, r: number }} c2 - Secondary / Target (e.g. Planet or Moon)
 * @param {{ cx: number, cy: number, r: number } | null} [hostCircle=null] - Optional host circle for inner universe duals
 * @returns {CGA2D.FourTangents2D}
 */
export function evaluateFourCommonTangents2D(c1, c2, hostCircle = null) {
    const dx = c2.cx - c1.cx;
    const dy = c2.cy - c1.cy;
    const d = Math.hypot(dx, dy) || 1e-5;
    const theta = Math.atan2(dy, dx);
    const thetaToSun = theta + Math.PI;

    // 1. Direct / External Tangents (same-side)
    const rDiff = c1.r - c2.r;
    const sinAlphaExt = Math.max(-0.9999, Math.min(0.9999, rDiff / d));
    const alphaExt = Math.asin(sinAlphaExt);

    const phi1ExtTop = theta + Math.PI / 2 - alphaExt;
    const phi1ExtBot = theta - Math.PI / 2 + alphaExt;
    const phi2ExtTop = theta + Math.PI / 2 - alphaExt;
    const phi2ExtBot = theta - Math.PI / 2 + alphaExt;

    /** @type {[number, number]} */
    const p1ExtTop = [c1.cx + c1.r * Math.cos(phi1ExtTop), c1.cy + c1.r * Math.sin(phi1ExtTop)];
    /** @type {[number, number]} */
    const p1ExtBot = [c1.cx + c1.r * Math.cos(phi1ExtBot), c1.cy + c1.r * Math.sin(phi1ExtBot)];
    /** @type {[number, number]} */
    const p2ExtTop = [c2.cx + c2.r * Math.cos(phi2ExtTop), c2.cy + c2.r * Math.sin(phi2ExtTop)];
    /** @type {[number, number]} */
    const p2ExtBot = [c2.cx + c2.r * Math.cos(phi2ExtBot), c2.cy + c2.r * Math.sin(phi2ExtBot)];

    // Umbra Apex
    const dApex = Math.abs(rDiff) > 1e-4 ? (c1.r * d) / rDiff : 1e6;
    /** @type {[number, number]} */
    const umbraApex = [c1.cx + dApex * Math.cos(theta), c1.cy + dApex * Math.sin(theta)];

    // 2. Transverse / Internal Crossed Tangents
    const rSum = c1.r + c2.r;
    const sinAlphaInt = Math.max(-0.9999, Math.min(0.9999, rSum / d));
    const alphaInt = Math.asin(sinAlphaInt);

    const phi1IntTop = theta + Math.PI / 2 + alphaInt;
    const phi1IntBot = theta - Math.PI / 2 - alphaInt;
    const phi2IntBot = theta - Math.PI / 2 + alphaInt;
    const phi2IntTop = theta + Math.PI / 2 - alphaInt;

    /** @type {[number, number]} */
    const p1IntTop = [c1.cx + c1.r * Math.cos(phi1IntTop), c1.cy + c1.r * Math.sin(phi1IntTop)];
    /** @type {[number, number]} */
    const p1IntBot = [c1.cx + c1.r * Math.cos(phi1IntBot), c1.cy + c1.r * Math.sin(phi1IntBot)];
    /** @type {[number, number]} */
    const p2IntBot = [c2.cx + c2.r * Math.cos(phi2IntBot), c2.cy + c2.r * Math.sin(phi2IntBot)];
    /** @type {[number, number]} */
    const p2IntTop = [c2.cx + c2.r * Math.cos(phi2IntTop), c2.cy + c2.r * Math.sin(phi2IntTop)];

    // Penumbra Vertex
    const dPen = (c1.r * d) / rSum;
    /** @type {[number, number]} */
    const penumbraVertex = [c1.cx + dPen * Math.cos(theta), c1.cy + dPen * Math.sin(theta)];

    // 3. Four Illumination Zones on Receiver (c2)
    const angleDayStart = thetaToSun - (Math.PI / 2 - alphaInt);
    const angleDayEnd = thetaToSun + (Math.PI / 2 - alphaInt);
    const spanDayDeg = ((Math.PI - 2 * alphaInt) * 180) / Math.PI;

    /** @type {CGA2D.IlluminatedArc2D} */
    const fullDay = {
        startAngle: angleDayStart,
        endAngle: angleDayEnd,
        pStart: [c2.cx + c2.r * Math.cos(angleDayStart), c2.cy + c2.r * Math.sin(angleDayStart)],
        pEnd: [c2.cx + c2.r * Math.cos(angleDayEnd), c2.cy + c2.r * Math.sin(angleDayEnd)],
        spanDeg: spanDayDeg
    };

    const angleExtTop = thetaToSun - (Math.PI / 2 + alphaExt);
    const spanDawnDeg = ((alphaExt + alphaInt) * 180) / Math.PI;
    /** @type {CGA2D.IlluminatedArc2D} */
    const dawnTwilight = {
        startAngle: angleExtTop,
        endAngle: angleDayStart,
        pStart: [c2.cx + c2.r * Math.cos(angleExtTop), c2.cy + c2.r * Math.sin(angleExtTop)],
        pEnd: fullDay.pStart,
        spanDeg: spanDawnDeg
    };

    const angleExtBot = thetaToSun + (Math.PI / 2 + alphaExt);
    const spanDuskDeg = ((alphaExt + alphaInt) * 180) / Math.PI;
    /** @type {CGA2D.IlluminatedArc2D} */
    const duskTwilight = {
        startAngle: angleDayEnd,
        endAngle: angleExtBot,
        pStart: fullDay.pEnd,
        pEnd: [c2.cx + c2.r * Math.cos(angleExtBot), c2.cy + c2.r * Math.sin(angleExtBot)],
        spanDeg: spanDuskDeg
    };

    const spanNightDeg = ((Math.PI - 2 * alphaExt) * 180) / Math.PI;
    /** @type {CGA2D.IlluminatedArc2D} */
    const fullNight = {
        startAngle: angleExtBot,
        endAngle: angleExtTop + 2 * Math.PI,
        pStart: duskTwilight.pEnd,
        pEnd: dawnTwilight.pStart,
        spanDeg: spanNightDeg
    };

    // Compute continuous extended lines across the universe
    const rawLines = [
        [p1ExtTop, p2ExtTop],
        [p1ExtBot, p2ExtBot],
        [p1IntTop, p2IntBot],
        [p1IntBot, p2IntTop]
    ];

    /** @type {Array<[[number, number], [number, number]]>} */
    const extendedLines = rawLines.map(([pA, pB]) => {
        const vX = pB[0] - pA[0];
        const vY = pB[1] - pA[1];
        const len = Math.hypot(vX, vY) || 1;
        const uX = vX / len;
        const uY = vY / len;
        /** @type {[number, number]} */
        const start = [pA[0] - uX * 600, pA[1] - uY * 600];
        /** @type {[number, number]} */
        const end = [pB[0] + uX * 1200, pB[1] + uY * 1200];
        return [start, end];
    });

    /** @type {CGA2D.FourTangents2D} */
    const result = {
        direct1: { p1: p1ExtTop, p2: p2ExtTop },
        direct2: { p1: p1ExtBot, p2: p2ExtBot },
        transverse1: { p1: p1IntTop, p2: p2IntBot },
        transverse2: { p1: p1IntBot, p2: p2IntTop },
        umbraApex,
        penumbraVertex,
        zones: {
            fullDay,
            dawnTwilight,
            duskTwilight,
            fullNight
        },
        extendedLines
    };

    // 4. Optional Dual Conformal Circles in Host Universe
    if (hostCircle) {
        /** @type {Array<CGA2D.Circle>} */
        const dualConformalCircles = [];
        const lines = [
            [p1ExtTop, p2ExtTop],
            [p1ExtBot, p2ExtBot],
            [p1IntTop, p2IntBot],
            [p1IntBot, p2IntTop]
        ];

        lines.forEach(([pA, pB]) => {
            const xA = pA[0] - hostCircle.cx;
            const yA = pA[1] - hostCircle.cy;
            const xB = pB[0] - hostCircle.cx;
            const yB = pB[1] - hostCircle.cy;

            const dLx = xB - xA;
            const dLy = yB - yA;
            const lenL = Math.hypot(dLx, dLy) || 1;
            const nx = -dLy / lenL;
            const ny = dLx / lenL;
            const distO = nx * xA + ny * yA;

            const dual = invertLine({ nx, ny, d: distO }, hostCircle.r);
            if (dual.type === 'circle') {
                dualConformalCircles.push({
                    type: 'circle',
                    cx: hostCircle.cx + dual.cx,
                    cy: hostCircle.cy + dual.cy,
                    r: dual.r
                });
            }
        });
        result.dualConformalCircles = dualConformalCircles;
    }

    return result;
}

/**
 * Compute common external tangents, 4-tangent system, and radiant ray bundle between an emitter circle (e.g. Sun) and target circle.
 * 
 * @param {{ cx: number, cy: number, r: number }} c1 - Emitter (Sun)
 * @param {{ cx: number, cy: number, r: number }} c2 - Target (Planet / Moon)
 * @param {number} [numSampleRays=7] - Number of streaming light rays to generate
 * @returns {CGA2D.TangentRayBundle2D}
 */
export function getCommonExternalTangents(c1, c2, numSampleRays = 7) {
    const fourTangents = evaluateFourCommonTangents2D(c1, c2);

    const p1Top = fourTangents.direct1.p1;
    const p1Bottom = fourTangents.direct2.p1;
    const p2Top = fourTangents.direct1.p2;
    const p2Bottom = fourTangents.direct2.p2;

    const sourceSpanDeg = fourTangents.zones.fullDay.spanDeg + 2 * fourTangents.zones.dawnTwilight.spanDeg;
    /** @type {CGA2D.IlluminatedArc2D} */
    const sourceArc = {
        startAngle: fourTangents.direct2.p1[1],
        endAngle: fourTangents.direct1.p1[1],
        pStart: p1Bottom,
        pEnd: p1Top,
        spanDeg: sourceSpanDeg
    };

    /** @type {CGA2D.IlluminatedArc2D} */
    const targetLitArc = {
        startAngle: fourTangents.zones.dawnTwilight.startAngle,
        endAngle: fourTangents.zones.duskTwilight.endAngle,
        pStart: fourTangents.zones.dawnTwilight.pStart,
        pEnd: fourTangents.zones.duskTwilight.pEnd,
        spanDeg: sourceSpanDeg
    };

    // Generate streaming rays across the illuminated arc
    /** @type {Array<{ from: [number, number], to: [number, number] }>} */
    const sampleRays = [];
    for (let i = 0; i < numSampleRays; i++) {
        const u = numSampleRays > 1 ? i / (numSampleRays - 1) : 0.5;
        const angle1 = Math.atan2(p1Bottom[1] - c1.cy, p1Bottom[0] - c1.cx) + u * ((sourceSpanDeg * Math.PI) / 180);
        const angle2 = targetLitArc.startAngle + u * ((sourceSpanDeg * Math.PI) / 180);

        /** @type {[number, number]} */
        const fromPt = [c1.cx + c1.r * Math.cos(angle1), c1.cy + c1.r * Math.sin(angle1)];
        /** @type {[number, number]} */
        const toPt = [c2.cx + c2.r * Math.cos(angle2), c2.cy + c2.r * Math.sin(angle2)];
        sampleRays.push({ from: fromPt, to: toPt });
    }

    return {
        p1Top,
        p1Bottom,
        p2Top,
        p2Bottom,
        sourceArc,
        targetLitArc,
        sampleRays,
        fourTangents
    };
}

/**
 * Compute the Umbra and Penumbra shadow cones cast by a target body (e.g. Planet or Moon) when illuminated by the Sun.
 * 
 * @param {{ cx: number, cy: number, r: number }} sunCircle
 * @param {{ cx: number, cy: number, r: number }} targetCircle
 * @param {number} [maxDistance=600]
 * @returns {CGA2D.ShadowCones2D}
 */
export function getUmbraPenumbraCones(sunCircle, targetCircle, maxDistance = 600) {
    const dx = targetCircle.cx - sunCircle.cx;
    const dy = targetCircle.cy - sunCircle.cy;
    const d = Math.hypot(dx, dy) || 1e-5;
    const ux = dx / d;
    const uy = dy / d;

    const fourTangents = evaluateFourCommonTangents2D(sunCircle, targetCircle);
    const rDiff = sunCircle.r - targetCircle.r;

    // 1. Umbra Cone (Converging to apex from direct tangents)
    /** @type {Array<[number, number]>} */
    let umbraPoly = [];
    /** @type {[number, number] | undefined} */
    let umbraApex;

    const p2Top = fourTangents.direct1.p2;
    const p2Bottom = fourTangents.direct2.p2;

    if (rDiff > 0.1) {
        umbraApex = fourTangents.umbraApex;
        umbraPoly = [
            [p2Top[0], p2Top[1]],
            [umbraApex[0], umbraApex[1]],
            [p2Bottom[0], p2Bottom[1]]
        ];
    } else {
        umbraPoly = [
            [p2Top[0], p2Top[1]],
            [p2Top[0] + ux * maxDistance, p2Top[1] + uy * maxDistance],
            [p2Bottom[0] + ux * maxDistance, p2Bottom[0] + uy * maxDistance],
            [p2Bottom[0], p2Bottom[1]]
        ];
    }

    // 2. Penumbra Cone (Diverging from transverse tangents)
    const penVertex = fourTangents.penumbraVertex;
    const pTransTop = fourTangents.transverse2.p2; // contact at top
    const pTransBot = fourTangents.transverse1.p2; // contact at bottom

    const dirPenTopX = (pTransTop[0] - penVertex[0]);
    const dirPenTopY = (pTransTop[1] - penVertex[1]);
    const lenPenTop = Math.hypot(dirPenTopX, dirPenTopY) || 1;

    const dirPenBotX = (pTransBot[0] - penVertex[0]);
    const dirPenBotY = (pTransBot[1] - penVertex[1]);
    const lenPenBot = Math.hypot(dirPenBotX, dirPenBotY) || 1;

    const penFarTop = [pTransTop[0] + (dirPenTopX / lenPenTop) * maxDistance, pTransTop[1] + (dirPenTopY / lenPenTop) * maxDistance];
    const penFarBottom = [pTransBot[0] + (dirPenBotX / lenPenBot) * maxDistance, pTransBot[1] + (dirPenBotY / lenPenBot) * maxDistance];

    /** @type {Array<[number, number]>} */
    const penumbraPoly = [
        [pTransTop[0], pTransTop[1]],
        [penFarTop[0], penFarTop[1]],
        [penFarBottom[0], penFarBottom[1]],
        [pTransBot[0], pTransBot[1]]
    ];

    return {
        umbraPoly,
        penumbraPoly,
        umbraApex,
        isEclipseOccurring: false
    };
}

/**
 * Compute Secondary Albedo Reflection (Planetshine onto Moon, or Moonshine onto Planet).
 * 
 * @param {{ cx: number, cy: number, r: number, name: string }} emitter - Primary Reflector (e.g. Planet)
 * @param {{ cx: number, cy: number, r: number, name: string }} receiver - Secondary Receiver (e.g. Moon)
 * @param {{ cx: number, cy: number, r: number }} sun - Primary Light Source
 * @param {number} [albedo=0.35] - Body surface albedo
 * @returns {CGA2D.AlbedoReflection2D}
 */
export function getSecondaryAlbedoReflection(emitter, receiver, sun, albedo = 0.35) {
    const sunDx = emitter.cx - sun.cx;
    const sunDy = emitter.cy - sun.cy;
    const sunDist = Math.hypot(sunDx, sunDy) || 1;
    const sunDir = [sunDx / sunDist, sunDy / sunDist];

    const relDx = receiver.cx - emitter.cx;
    const relDy = receiver.cy - emitter.cy;
    const relDist = Math.hypot(relDx, relDy) || 1;
    const relDir = [relDx / relDist, relDy / relDist];

    const sunDotRel = -sunDir[0] * relDir[0] - sunDir[1] * relDir[1];
    const isVisible = sunDotRel > -0.3;

    /** @type {Array<{ from: [number, number], to: [number, number] }>} */
    const reflectionRays = [];

    const angleEmit = Math.atan2(relDy, relDx);
    const pEmit1 = [emitter.cx + emitter.r * Math.cos(angleEmit - 0.7), emitter.cy + emitter.r * Math.sin(angleEmit - 0.7)];
    const pEmit2 = [emitter.cx + emitter.r * Math.cos(angleEmit + 0.7), emitter.cy + emitter.r * Math.sin(angleEmit + 0.7)];

    const angleRecv = angleEmit + Math.PI;
    const pRecv1 = [receiver.cx + receiver.r * Math.cos(angleRecv + 0.8), receiver.cy + receiver.r * Math.sin(angleRecv + 0.8)];
    const pRecv2 = [receiver.cx + receiver.r * Math.cos(angleRecv - 0.8), receiver.cy + receiver.r * Math.sin(angleRecv - 0.8)];

    if (isVisible) {
        for (let i = 0; i < 5; i++) {
            const u = i / 4;
            const fromA = (angleEmit - 0.7) + u * 1.4;
            const toA = (angleRecv - 0.8) + (1 - u) * 1.6;
            reflectionRays.push({
                from: [emitter.cx + emitter.r * Math.cos(fromA), emitter.cy + emitter.r * Math.sin(fromA)],
                to: [receiver.cx + receiver.r * Math.cos(toA), receiver.cy + receiver.r * Math.sin(toA)]
            });
        }
    }

    const intensity = Math.max(0, (albedo * Math.max(0, sunDotRel + 0.3)) / (1 + (relDist / 100)));

    return {
        isVisible,
        sourceBody: emitter.name,
        targetBody: receiver.name,
        reflectionRays,
        targetSecondaryLitArc: {
            startAngle: angleRecv - 0.8,
            endAngle: angleRecv + 0.8,
            pStart: [pRecv1[0], pRecv1[1]],
            pEnd: [pRecv2[0], pRecv2[1]],
            spanDeg: (1.6 * 180) / Math.PI
        },
        intensity
    };
}

/**
 * Compute the 5 Lagrangian Equilibrium Points (L1 - L5) for a pair of celestial bodies in CR3BP.
 * 
 * @param {{ cx: number, cy: number, r: number, name: string }} primary - Main mass (e.g. Sun or Planet)
 * @param {{ cx: number, cy: number, r: number, name: string }} secondary - Secondary mass (e.g. Planet or Moon)
 * @param {number} [massRatio=0.03] - Mass ratio mu = M2 / (M1 + M2)
 * @param {string} [systemColor='#ff3344'] - Color for this Lagrangian system (Red for Sun-Planet, Green for Planet-Moon)
 * @returns {CGA2D.LagrangeSystem2D}
 */
export function evaluateLagrangePoints2D(primary, secondary, massRatio = 0.03, systemColor = '#ff3344') {
    const dx = secondary.cx - primary.cx;
    const dy = secondary.cy - primary.cy;
    const d = Math.hypot(dx, dy) || 1e-5;
    const theta = Math.atan2(dy, dx);

    const mu = Math.max(1e-5, Math.min(0.5, massRatio));
    // Hill radius / displacement ratio rho = (mu / 3)^(1/3)
    const rho = Math.cbrt(mu / 3);

    // 1. Collinear Points along primary-secondary axis
    // L1: Between primary and secondary
    const dL1 = d * (1 - rho);
    /** @type {[number, number]} */
    const posL1 = [primary.cx + dL1 * Math.cos(theta), primary.cy + dL1 * Math.sin(theta)];

    // L2: Beyond secondary
    const dL2 = d * (1 + rho);
    /** @type {[number, number]} */
    const posL2 = [primary.cx + dL2 * Math.cos(theta), primary.cy + dL2 * Math.sin(theta)];

    // L3: Beyond primary on opposite side
    const dL3 = d * (1 + (5 / 12) * mu);
    /** @type {[number, number]} */
    const posL3 = [primary.cx - dL3 * Math.cos(theta), primary.cy - dL3 * Math.sin(theta)];

    // 2. Triangular Trojan Points (L4 at +60 deg, L5 at -60 deg forming equilateral triangles)
    const thetaL4 = theta + Math.PI / 3;
    const thetaL5 = theta - Math.PI / 3;

    /** @type {[number, number]} */
    const posL4 = [primary.cx + d * Math.cos(thetaL4), primary.cy + d * Math.sin(thetaL4)];
    /** @type {[number, number]} */
    const posL5 = [primary.cx + d * Math.cos(thetaL5), primary.cy + d * Math.sin(thetaL5)];

    /** @type {CGA2D.LagrangePoint2D} */
    const L1 = { id: `${primary.name}-${secondary.name}-L1`, name: 'L₁', pos: posL1, type: 'collinear', stability: 'unstable', color: systemColor };
    /** @type {CGA2D.LagrangePoint2D} */
    const L2 = { id: `${primary.name}-${secondary.name}-L2`, name: 'L₂', pos: posL2, type: 'collinear', stability: 'unstable', color: systemColor };
    /** @type {CGA2D.LagrangePoint2D} */
    const L3 = { id: `${primary.name}-${secondary.name}-L3`, name: 'L₃', pos: posL3, type: 'collinear', stability: 'unstable', color: systemColor };
    /** @type {CGA2D.LagrangePoint2D} */
    const L4 = { id: `${primary.name}-${secondary.name}-L4`, name: 'L₄', pos: posL4, type: 'triangular', stability: 'stable', color: systemColor };
    /** @type {CGA2D.LagrangePoint2D} */
    const L5 = { id: `${primary.name}-${secondary.name}-L5`, name: 'L₅', pos: posL5, type: 'triangular', stability: 'stable', color: systemColor };

    /** @type {[[number, number], [number, number]]} */
    const axisLine = [posL3, posL2];

    /** @type {Array<[[number, number], [number, number]]>} */
    const triangleLines = [
        [[primary.cx, primary.cy], posL4],
        [posL4, [secondary.cx, secondary.cy]],
        [[primary.cx, primary.cy], posL5],
        [posL5, [secondary.cx, secondary.cy]]
    ];

    return {
        primaryName: primary.name,
        secondaryName: secondary.name,
        systemColor,
        L1,
        L2,
        L3,
        L4,
        L5,
        allPoints: [L1, L2, L3, L4, L5],
        axisLine,
        triangleLines,
        guideCircleRadius: d
    };
}

/**
 * Compute the Roche Lobe gravitational separatrix contours meeting at L1.
 * 
 * @param {{ cx: number, cy: number, r: number }} primary
 * @param {{ cx: number, cy: number, r: number }} secondary
 * @param {CGA2D.LagrangeSystem2D} lagrange
 * @param {number} [numPoints=32]
 * @returns {CGA2D.RocheLobeContours2D}
 */
export function evaluateRocheLobeContours2D(primary, secondary, lagrange, numPoints = 32) {
    const dx = secondary.cx - primary.cx;
    const dy = secondary.cy - primary.cy;
    const theta = Math.atan2(dy, dx);

    const L1Pos = lagrange.L1.pos;
    const r1 = Math.hypot(L1Pos[0] - primary.cx, L1Pos[1] - primary.cy);
    const r2 = Math.hypot(L1Pos[0] - secondary.cx, L1Pos[1] - secondary.cy);

    // 1. Primary Roche Lobe Loop
    /** @type {Array<[number, number]>} */
    const primaryLobePath = [];
    const a1 = r1 * 0.96;
    const b1 = r1 * 0.72;

    for (let i = 0; i <= numPoints; i++) {
        const phi = (i / numPoints) * 2 * Math.PI;
        const rEgg = a1 * (1 - 0.18 * Math.cos(phi));
        const localX = rEgg * Math.cos(phi);
        const localY = b1 * Math.sin(phi);

        const rotX = localX * Math.cos(theta) - localY * Math.sin(theta);
        const rotY = localX * Math.sin(theta) + localY * Math.cos(theta);

        primaryLobePath.push([primary.cx + rotX, primary.cy + rotY]);
    }

    // 2. Secondary Roche Lobe Loop (Teardrop meeting at L1)
    /** @type {Array<[number, number]>} */
    const secondaryLobePath = [];
    const a2 = r2 * 0.95;
    const b2 = r2 * 0.75;

    for (let i = 0; i <= numPoints; i++) {
        const phi = (i / numPoints) * 2 * Math.PI;
        const rEgg = a2 * (1 + 0.22 * Math.cos(phi));
        const localX = rEgg * Math.cos(phi);
        const localY = b2 * Math.sin(phi);

        const rotX = localX * Math.cos(theta) - localY * Math.sin(theta);
        const rotY = localX * Math.sin(theta) + localY * Math.cos(theta);

        secondaryLobePath.push([secondary.cx + rotX, secondary.cy + rotY]);
    }

    return {
        primaryLobePath,
        secondaryLobePath
    };
}

/**
 * Invert all 5 Lagrange points of a system into the interior universe of a host body,
 * with optional hyperbolic metric warp.
 * 
 * @param {Array<CGA2D.LagrangePoint2D>} points
 * @param {{ cx: number, cy: number, r: number }} host
 * @param {number} [warpGamma=1.0]
 * @returns {Array<CGA2D.LagrangePoint2D>}
 */
export function evaluateLagrangeProjectionsInHost(points, host, warpGamma = 1.0) {
    return points.map(pt => {
        const dx = pt.pos[0] - host.cx;
        const dy = pt.pos[1] - host.cy;
        const distSq = dx * dx + dy * dy;
        const factor = distSq > 1e-6 ? (host.r * host.r) / distSq : 0;

        let px = host.cx + dx * factor;
        let py = host.cy + dy * factor;

        if (warpGamma > 0 && warpGamma < 0.999) {
            const offsetDist = Math.hypot(px - host.cx, py - host.cy);
            const u = Math.min(1.0, offsetDist / host.r);
            if (u > 1e-5) {
                const uHyp = Math.pow(u, warpGamma);
                const scale = (uHyp * host.r) / (offsetDist || 1);
                px = host.cx + (px - host.cx) * scale;
                py = host.cy + (py - host.cy) * scale;
            }
        }

        /** @type {[number, number]} */
        const invertedPos = [px, py];

        return {
            id: `${pt.id}*(in-${host.r})`,
            name: `${pt.name}*`,
            pos: invertedPos,
            type: pt.type,
            stability: pt.stability,
            color: pt.color || '#ff007f'
        };
    });
}

/**
 * Evaluate the Dual-Reach Inversion System:
 * Both bodies define a sphere of reach (bounded by L1 / Hill sphere) where points on the boundary are invariant,
 * all space between the boundary and infinity in any direction collapses into the interior dual,
 * and infinity converges to the center.
 * 
 * @param {CGA2D.CelestialBody2D} bodyA - Secondary body (e.g. Planet)
 * @param {CGA2D.CelestialBody2D} bodyB - Primary body (e.g. Star)
 * @param {number} massRatio - q = massA / massB
 * @returns {CGA2D.DualReachSystem2D}
 */
export function evaluateDualReachInversion2D(bodyA, bodyB, massRatio) {
    const dx = bodyA.pos[0] - bodyB.pos[0];
    const dy = bodyA.pos[1] - bodyB.pos[1];
    const d = Math.hypot(dx, dy) || 1.0;
    const ux = dx / d;
    const uy = dy / d;

    // Hill sphere reach for body A
    const qNorm = massRatio / (1 + massRatio);
    const rHill = d * Math.cbrt(qNorm / 3.0);

    const reachRadiusA = rHill;
    const reachRadiusB = d - rHill;

    // L1 is the tangential contact point between both reach spheres
    /** @type {[number, number]} */
    const L1 = [
        bodyB.pos[0] + ux * reachRadiusB,
        bodyB.pos[1] + uy * reachRadiusB
    ];

    // Invert Body A into Body B's reach horizon
    const dualBodyAInB = invertCircleInHost(
        { cx: bodyA.pos[0], cy: bodyA.pos[1], r: bodyA.radius },
        { cx: bodyB.pos[0], cy: bodyB.pos[1], r: reachRadiusB }
    );

    // Invert Body B into Body A's reach horizon
    const dualBodyBInA = invertCircleInHost(
        { cx: bodyB.pos[0], cy: bodyB.pos[1], r: bodyB.radius },
        { cx: bodyA.pos[0], cy: bodyA.pos[1], r: reachRadiusA }
    );

    return {
        bodyA,
        bodyB,
        distance: d,
        L1,
        reachRadiusA,
        reachRadiusB,
        dualBodyAInB,
        dualBodyBInA
    };
}






