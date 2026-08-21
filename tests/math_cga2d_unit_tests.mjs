// @ts-check
/**
 * @file Automated Unit Test Suite for 2D Inversive Geometry & 4D CGA Mathematical Invariants
 * @project 3DGSIL
 */

import {
    EPSILON,
    invertPoint,
    invertCircle,
    invertLine,
    getOrthogonalCircleRadius,
    getInversionJacobian,
    invertGaussianCovariance,
    covarianceToSvgEllipse,
    evaluateFourierChain2D,
    angleBetweenCircles,
    clampToExterior,
    clampToInterior,
    reflectAtHorizon,
    invertCosmicBox,
    evaluatePlanetarySystem2D,
    invertCircleInHost,
    evaluateRecursivePlanetarySystem2D,
    getCommonExternalTangents,
    getUmbraPenumbraCones,
    getSecondaryAlbedoReflection,
    evaluateLagrangePoints2D,
    evaluateRocheLobeContours2D,
    evaluateLagrangeProjectionsInHost,
    evaluateFourCommonTangents2D,
    evaluateDualReachInversion2D
} from './math_cga2d.mjs';

/**
 * @typedef {Object} TestResult
 * @property {string} name
 * @property {boolean} passed
 * @property {string} [error]
 */

/** @type {TestResult[]} */
const results = [];

/**
 * @param {any} condition
 * @param {string} [message]
 */
function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} [eps=1e-4]
 * @param {string} [message='']
 */
function assertClose(a, b, eps = 1e-4, message = '') {
    if (Math.abs(a - b) > eps) {
        throw new Error(`Expected ${a} to be close to ${b} (diff: ${Math.abs(a - b)}, eps: ${eps}). ${message}`);
    }
}

/**
 * @param {string} name
 * @param {() => void} fn
 */
function test(name, fn) {
    try {
        fn();
        results.push({ name, passed: true });
        console.log(`✅ [PASS] ${name}`);
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        results.push({ name, passed: false, error });
        console.error(`❌ [FAIL] ${name}: ${error}`);
    }
}

console.log('🔮 Running 2D Inversive Geometry & 4D CGA Unit Tests...\n');

// 1. Involution Identity
test('Involution Identity: (x*)* = x across arbitrary 2D points', () => {
    const R = 15.0;
    const testPoints = [
        [3.0, 4.0],
        [-12.0, 8.5],
        [0.0, 22.0],
        [-30.0, -40.0],
        [15.0, 0.0],
        [0.5, 0.5]
    ];

    for (const pt of testPoints) {
        /** @type {[number, number]} */
        const typedPt = [pt[0], pt[1]];
        const star = invertPoint(typedPt, R);
        const doubleStar = invertPoint(star, R);
        assertClose(doubleStar[0], typedPt[0], 1e-4, `X-coord mismatch at [${pt}]`);
        assertClose(doubleStar[1], typedPt[1], 1e-4, `Y-coord mismatch at [${pt}]`);
    }
});

// 2. Fixed Horizon Invariant
test('Fixed Horizon Invariant: ||p|| = R implies p* = p', () => {
    const R = 20.0;
    const angles = [0, Math.PI / 4, Math.PI / 2, Math.PI, 3 * Math.PI / 2, 1.234];

    for (const theta of angles) {
        /** @type {[number, number]} */
        const pt = [R * Math.cos(theta), R * Math.sin(theta)];
        const star = invertPoint(pt, R);
        assertClose(star[0], pt[0], 1e-5, `Horizon point x mismatch at theta=${theta}`);
        assertClose(star[1], pt[1], 1e-5, `Horizon point y mismatch at theta=${theta}`);
    }
});

// 3. Line to Circle Duality Theorem
test('Line to Circle Duality: Line not through origin inverts to Circle through origin', () => {
    const R = 10.0;
    // Line: x = 5 (i.e. nx=1, ny=0, d=5)
    const line = { nx: 1, ny: 0, d: 5 };
    const dual = invertLine(line, R);

    assert(dual.type === 'circle', 'Dual of line not through origin must be a circle');
    if (dual.type === 'circle') {
        // Center should be at (R^2 / (2*d), 0) = (100 / 10, 0) = (10, 0)
        assertClose(dual.cx, 10.0, 1e-4, 'Circle center X');
        assertClose(dual.cy, 0.0, 1e-4, 'Circle center Y');
        assertClose(dual.r, 10.0, 1e-4, 'Circle radius');
        // Check that origin (0,0) lies on this circle: distance to center == radius
        const distToOrigin = Math.hypot(dual.cx, dual.cy);
        assertClose(distToOrigin, dual.r, 1e-4, 'Dual circle must pass through origin (0,0)');
    }
});

// 4. Circle to Line Duality Theorem
test('Circle to Line Duality: Circle through origin inverts to Line not through origin', () => {
    const R = 10.0;
    // Circle passing through origin: center at (10, 0), radius = 10
    const circle = { cx: 10, cy: 0, r: 10 };
    const dual = invertCircle(circle, R);

    assert(dual.type === 'line', 'Dual of circle through origin must be a line');
    if (dual.type === 'line') {
        // Line should be at x = R^2 / (2*r) = 100 / 20 = 5
        assertClose(dual.d, 5.0, 1e-4, 'Dual line distance');
        assertClose(dual.nx, 1.0, 1e-4, 'Dual line normal X');
        assertClose(dual.ny, 0.0, 1e-4, 'Dual line normal Y');
    }
});

// 5. Orthogonal Circle Self-Invariance Theorem
test('Orthogonal Circle Theorem: Circle orthogonal to inversion circle is self-invariant (C* = C)', () => {
    const R = 12.0;
    const cx = 15.0;
    const cy = 9.0;
    const rOrtho = getOrthogonalCircleRadius(cx, cy, R);
    assert(rOrtho !== null, 'Orthogonal radius must exist for center outside horizon');

    if (rOrtho !== null) {
        const circle = { cx, cy, r: rOrtho };
        const dual = invertCircle(circle, R);

        assert(dual.type === 'circle', 'Dual must be a circle');
        if (dual.type === 'circle') {
            assertClose(dual.cx, cx, 1e-4, 'Orthogonal circle center X must be self-invariant');
            assertClose(dual.cy, cy, 1e-4, 'Orthogonal circle center Y must be self-invariant');
            assertClose(dual.r, rOrtho, 1e-4, 'Orthogonal circle radius must be self-invariant');
        }
    }
});

// 6. Conformal Angle Preservation Theorem
test('Conformality Theorem: Angles between intersecting curves are preserved under inversion', () => {
    const R = 10.0;
    // Define two circles that intersect at point p = (4, 3) (distance = 5 from origin)
    const p = [4.0, 3.0];
    const c1 = { cx: 1.0, cy: 3.0, r: 3.0 }; // (4-1)^2 + (3-3)^2 = 9
    const c2 = { cx: 4.0, cy: 0.0, r: 3.0 }; // (4-4)^2 + (3-0)^2 = 9

    /** @type {[number, number]} */
    const pTyped = [p[0], p[1]];
    const cosTheta = angleBetweenCircles(c1, c2, pTyped);

    // Invert both circles and the intersection point
    const dual1 = invertCircle(c1, R);
    const dual2 = invertCircle(c2, R);
    const pStar = invertPoint(pTyped, R);

    assert(dual1.type === 'circle' && dual2.type === 'circle', 'Duals must be circles');
    if (dual1.type === 'circle' && dual2.type === 'circle') {
        const cosThetaStar = angleBetweenCircles(dual1, dual2, pStar);
        // Conformality states cosTheta = cosThetaStar (up to sign / reflection orientation)
        assertClose(Math.abs(cosThetaStar), Math.abs(cosTheta), 1e-3, 'Intersection angle must be preserved');
    }
});

// 7. 2D Gaussian Covariance Inversion
test('Gaussian Splat Inversion: Covariance Sigma* = J * Sigma * J^T retains positive definiteness', () => {
    const R = 15.0;
    /** @type {[number, number]} */
    const pos = [20.0, 10.0];
    /** @type {[number, number, number]} */
    const sigma = [4.0, 1.5, 3.0]; // Positive definite: 4*3 - 1.5^2 = 12 - 2.25 = 9.75 > 0

    const { posStar, sigmaStar, ellipseParams } = invertGaussianCovariance(pos, sigma, R);

    const [sXX, sXY, sYY] = sigmaStar;
    const det = sXX * sYY - sXY * sXY;
    assert(det > 0, `Dual covariance determinant must be strictly positive (det=${det})`);
    assert(ellipseParams.rx > 0, 'SVG ellipse rx must be positive');
    assert(ellipseParams.ry > 0, 'SVG ellipse ry must be positive');
    assertClose(posStar[0], ellipseParams.cx, 1e-4, 'Ellipse center matches inverted pos');
    assertClose(posStar[1], ellipseParams.cy, 1e-4, 'Ellipse center matches inverted pos');
});

// 8. 2D Fourier Kinematic Chain
test('2D Fourier Kinematic Chain: Evaluates continuous finite orbital trajectories', () => {
    const R = 25.0;
    const v1 = { r1: 30.0, w1: 1.0 };
    const v2 = { r2: 5.0, w2: 5.0 };

    for (let t = 0; t <= 6.28; t += 0.5) {
        const state = evaluateFourierChain2D(t, v1, v2, R);
        assert(!isNaN(state.planet[0]) && !isNaN(state.planet[1]), 'Planet position must be finite');
        assert(!isNaN(state.moon[0]) && !isNaN(state.moon[1]), 'Moon position must be finite');
        assert(!isNaN(state.planetStar[0]) && !isNaN(state.planetStar[1]), 'Planet dual must be finite');
        assert(!isNaN(state.moonStar[0]) && !isNaN(state.moonStar[1]), 'Moon dual must be finite');

        // Verify that because primal planet is outside horizon (r1=30 > R=25), dual planet is inside horizon (r* < 25)
        const planetDist = Math.hypot(state.planet[0], state.planet[1]);
        const planetStarDist = Math.hypot(state.planetStar[0], state.planetStar[1]);
        assert(planetDist > R, 'Primal planet outside horizon');
        assert(planetStarDist < R, 'Dual planet inside horizon');
    }
});

// 9. Uncrossable Horizon Barrier Clamping & Reflection
test('Uncrossable Horizon: Clamping & elastic reflection at barrier r = R', () => {
    const R = 100.0;
    /** @type {[number, number]} */
    const insidePoint = [50.0, 50.0];
    const clampedExterior = clampToExterior(insidePoint, R, 2.0);
    const exteriorDist = Math.hypot(clampedExterior[0], clampedExterior[1]);
    assert(exteriorDist >= R + 1.99, 'Clamped exterior must be >= R + margin');

    /** @type {[number, number]} */
    const outsidePoint = [150.0, 150.0];
    const clampedInterior = clampToInterior(outsidePoint, R, 2.0);
    const interiorDist = Math.hypot(clampedInterior[0], clampedInterior[1]);
    assert(interiorDist <= R - 1.99, 'Clamped interior must be <= R - margin');

    // Elastic reflection
    /** @type {[number, number]} */
    const penetratingPos = [98.0, 0.0]; // Inside barrier r=100
    /** @type {[number, number]} */
    const inwardVel = [-10.0, 0.0]; // Moving inward
    const reflectRes = reflectAtHorizon(penetratingPos, inwardVel, R, 0);
    assert(reflectRes.bounced, 'Barrier must register a collision/bounce');
    assert(reflectRes.pos[0] >= 100.0, 'Repositioned outside barrier');
    assert(reflectRes.vel[0] > 0, 'Velocity reflected outward (+vx)');
});

// 10. Omnidirectional Infinity -> Central Origin Singularity Convergence
test('Omnidirectional Infinity: Cosmic boundary X,Y = ±L converges to origin O(0,0) as L -> infinity', () => {
    const R = 120.0;
    const box1000 = invertCosmicBox(1000.0, R, 8);
    const box10000 = invertCosmicBox(10000.0, R, 8);

    // Max distance to origin for L=1000 should be R^2 / 1000 = 14400 / 1000 = 14.4
    const maxDist1000 = Math.max(...box1000.map(pt => Math.hypot(pt[0], pt[1])));
    assertClose(maxDist1000, 14.4, 0.1, 'L=1000 dual size');

    // Max distance for L=10000 should be R^2 / 10000 = 14400 / 10000 = 1.44
    const maxDist10000 = Math.max(...box10000.map(pt => Math.hypot(pt[0], pt[1])));
    assertClose(maxDist10000, 1.44, 0.01, 'L=10000 dual size');
    assert(maxDist10000 < maxDist1000, 'Dual size strictly decreases as L increases');
});

// 11. Four Cardinal Spatial Infinities
test('Cardinal Infinities (+X, -X, +Y, -Y = ±inf) collapse to center O(0,0)', () => {
    const R = 100.0;
    const big = 1e8;
    const posXInf = invertPoint([big, 0], R);
    const negXInf = invertPoint([-big, 0], R);
    const posYInf = invertPoint([0, big], R);
    const negYInf = invertPoint([0, -big], R);

    assertClose(posXInf[0], 0, 1e-4, '+X_inf -> 0');
    assertClose(posYInf[1], 0, 1e-4, '+Y_inf -> 0');
    assertClose(negYInf[1], 0, 1e-4, '-Y_inf -> 0');
});

// 12. Flat Planetary System (Sun, Planet, Moon) Evaluation
test('2D Flat Planetary System: Computes Sun, Planet, Moon and dual conformal circles', () => {
    const R = 120.0;
    const sys = evaluatePlanetarySystem2D(0.0, {
        sunPos: [200.0, 0.0],
        sunRadius: 20.0,
        planetDist: 100.0,
        planetRadius: 10.0,
        moonDist: 25.0,
        moonRadius: 4.0
    }, R);

    assert(sys.sun.pos[0] === 200.0, 'Sun X position');
    assert(sys.planet.pos[0] === 300.0, 'Planet X position at t=0');
    assert(sys.moon.pos[0] === 325.0, 'Moon X position at t=0');

    // Dual entities inside the circle (r < R = 120)
    assert(sys.sunStar.pos[0] < R, 'Sun* inside circle');
    assert(sys.planetStar.pos[0] < R, 'Planet* inside circle');
    assert(sys.moonStar.pos[0] < R, 'Moon* inside circle');

    // Ordering: In primal space Sun (200) < Planet (300) < Moon (325).
    // In dual mirror space, order is reversed: Moon* (<45) < Planet* (48) < Sun* (72)!
    const sunStarDist = Math.hypot(sys.sunStar.pos[0], sys.sunStar.pos[1]);
    const planetStarDist = Math.hypot(sys.planetStar.pos[0], sys.planetStar.pos[1]);
    const moonStarDist = Math.hypot(sys.moonStar.pos[0], sys.moonStar.pos[1]);

    assert(moonStarDist < planetStarDist, 'Inverted radial order: Moon* is closer to center than Planet*');
    assert(planetStarDist < sunStarDist, 'Inverted radial order: Planet* is closer to center than Sun*');
});

// 13. Conformal Disk Scaling (Dilation & Contraction)
test('Planetary Conformal Dilation: Dual disk radius scales inversely with square distance', () => {
    const R = 100.0;
    const nearPlanetCircle = { cx: 120.0, cy: 0.0, r: 10.0 }; // Near horizon (r=120)
    const farPlanetCircle = { cx: 500.0, cy: 0.0, r: 10.0 };  // Far away (r=500)

    const nearDual = invertCircle(nearPlanetCircle, R);
    const farDual = invertCircle(farPlanetCircle, R);

    assert(nearDual.type === 'circle' && farDual.type === 'circle', 'Both duals are circles');
    if (nearDual.type === 'circle' && farDual.type === 'circle') {
        assert(nearDual.r > farDual.r, `Near dual (${nearDual.r.toFixed(2)}) must be larger than far dual (${farDual.r.toFixed(2)})`);
    }
});

// 14. Relative Host Circle Inversion
test('Host Body Inversion: Target circle inverts accurately inside arbitrary host sphere', () => {
    const host = { cx: 200.0, cy: 100.0, r: 30.0 }; // Host sphere (e.g. Sun)
    const target = { cx: 350.0, cy: 100.0, r: 10.0 }; // External body (e.g. Planet, dist=150)

    const dual = invertCircleInHost(target, host);
    assert(dual.type === 'circle', 'Dual must be a circle');
    // Distance from host center: dx = 150, dSq - r^2 = 22500 - 100 = 22400. Factor = 900 / 22400 = 0.040178.
    // dualCx = 200 + 150 * 0.040178 = 206.026.
    assertClose(dual.cx, 206.026, 0.01, 'Dual center inside host');
    assertClose(dual.cy, 100.0, 1e-4, 'Dual center Y on axis');
    assert(dual.r < host.r, 'Dual radius must be strictly smaller than host radius');
    assert(Math.hypot(dual.cx - host.cx, dual.cy - host.cy) < host.r, 'Dual must reside strictly inside host sphere');
});

// 15. Recursive Holographic Planetary Universes (Sun, Planet, Moon)
test('Recursive Holographic Universes: Every body contains internal mirror universe with infinity at center', () => {
    const sys = evaluateRecursivePlanetarySystem2D(0.0, {
        sunPos: [200.0, 0.0],
        sunRadius: 30.0,
        planetDist: 150.0,
        planetRadius: 15.0,
        moonDist: 40.0,
        moonRadius: 6.0
    });

    // 1. Inside Sun: Planet* and Moon* inside Sun radius
    const sunC = sys.sunUniverse.singularityCenter;
    for (const b of sys.sunUniverse.internalBodies) {
        const d = Math.hypot(b.pos[0] - sunC[0], b.pos[1] - sunC[1]);
        assert(d < sys.sunUniverse.host.radius, `${b.name} must be inside Sun`);
    }

    // 2. Inside Planet: Sun* and Moon* inside Planet radius
    const planetC = sys.planetUniverse.singularityCenter;
    for (const b of sys.planetUniverse.internalBodies) {
        const d = Math.hypot(b.pos[0] - planetC[0], b.pos[1] - planetC[1]);
        assert(d < sys.planetUniverse.host.radius, `${b.name} must be inside Planet`);
    }

    // 3. Inside Moon: Sun* and Planet* inside Moon radius
    const moonC = sys.moonUniverse.singularityCenter;
    for (const b of sys.moonUniverse.internalBodies) {
        const d = Math.hypot(b.pos[0] - moonC[0], b.pos[1] - moonC[1]);
        assert(d < sys.moonUniverse.host.radius, `${b.name} must be inside Moon`);
    }
});

// 16. Extended Source Common External Tangents & Illuminated Daytime Arc
test('Extended Source Optics: Computes exact external tangents and lit arc > 180 deg', () => {
    const sun = { cx: 0.0, cy: 0.0, r: 100.0 };
    const planet = { cx: 300.0, cy: 0.0, r: 20.0 };

    const optics = getCommonExternalTangents(sun, planet, 7);

    // Tangent points must lie exactly on circle boundaries
    const d1Top = Math.hypot(optics.p1Top[0] - sun.cx, optics.p1Top[1] - sun.cy);
    const d2Top = Math.hypot(optics.p2Top[0] - planet.cx, optics.p2Top[1] - planet.cy);

    assertClose(d1Top, 100.0, 1e-4, 'Sun tangent contact point on boundary');
    assertClose(d2Top, 20.0, 1e-4, 'Planet tangent contact point on boundary');

    // Because Sun (100) > Planet (20), the lit daytime arc on the planet spans > 180 degrees
    assert(optics.targetLitArc.spanDeg > 180.0, `Daytime arc must span > 180 deg (span = ${optics.targetLitArc.spanDeg.toFixed(2)} deg)`);
    assert(optics.sampleRays.length === 7, 'Generates 7 streaming light rays');
});

// 17. Umbra & Penumbra Shadow Cones
test('Umbra / Penumbra Shadows: Computes converging focal apex for target smaller than Sun', () => {
    const sun = { cx: 0.0, cy: 0.0, r: 100.0 };
    const planet = { cx: 300.0, cy: 0.0, r: 20.0 };

    const shadows = getUmbraPenumbraCones(sun, planet, 500);

    assert(shadows.umbraApex !== undefined, 'Umbra apex must exist');
    if (shadows.umbraApex) {
        // Apex distance from planet = (R_planet * d) / (R_sun - R_planet) = (20 * 300) / 80 = 75 px.
        // Apex X = 300 + 75 = 375 px.
        assertClose(shadows.umbraApex[0], 375.0, 0.1, 'Umbra apex X coordinate');
        assertClose(shadows.umbraApex[1], 0.0, 1e-4, 'Umbra apex Y coordinate');
    }
    assert(shadows.umbraPoly.length === 3, 'Umbra polygon is a converging triangle');
    assert(shadows.penumbraPoly.length === 4, 'Penumbra polygon is a diverging quad');
});

// 18. Secondary Albedo Reflection (Planetshine & Moonshine)
test('Secondary Albedo Reflection: Planetshine illuminates facing arc of Moon', () => {
    const sun = { cx: 0.0, cy: 0.0, r: 100.0 };
    const planet = { cx: 300.0, cy: 0.0, r: 20.0, name: 'Planet' };
    const moonInFront = { cx: 260.0, cy: 0.0, r: 6.0, name: 'Moon' }; // Moon on sunlit side of planet

    const reflection = getSecondaryAlbedoReflection(planet, moonInFront, sun, 0.39);
    assert(reflection.isVisible, 'Planetshine must be visible when Moon faces sunlit side of Planet');
    assert(reflection.reflectionRays.length > 0, 'Planetshine reflection rays generated');
    assert(reflection.intensity > 0, 'Planetshine intensity > 0');
});

// 19. Lagrangian Equilibrium Points (L1 - L5)
test('Lagrangian Points: L4 and L5 form equilateral triangles with primary & secondary', () => {
    const sun = { cx: 0.0, cy: 0.0, r: 100.0, name: 'Sun' };
    const planet = { cx: 300.0, cy: 0.0, r: 20.0, name: 'Planet' };

    const lagrange = evaluateLagrangePoints2D(sun, planet, 0.03);

    // Distance between Sun and Planet is 300 px.
    const dL4Sun = Math.hypot(lagrange.L4.pos[0] - sun.cx, lagrange.L4.pos[1] - sun.cy);
    const dL4Planet = Math.hypot(lagrange.L4.pos[0] - planet.cx, lagrange.L4.pos[1] - planet.cy);

    assertClose(dL4Sun, 300.0, 1e-4, 'L4 distance to Sun == orbital distance');
    assertClose(dL4Planet, 300.0, 1e-4, 'L4 distance to Planet == orbital distance');

    // L1 is between Sun and Planet (0 < L1.x < 300)
    assert(lagrange.L1.pos[0] > 0 && lagrange.L1.pos[0] < 300, 'L1 is between Sun and Planet');
    // L2 is beyond Planet (L2.x > 300)
    assert(lagrange.L2.pos[0] > 300, 'L2 is beyond Planet');
    // L3 is on opposite side (L3.x < 0)
    assert(lagrange.L3.pos[0] < 0, 'L3 is on opposite side of Sun');
});

// 20. Roche Lobe Gravitational Contours
test('Roche Lobe Separatrix: Contours form closed loops around primary and secondary', () => {
    const sun = { cx: 0.0, cy: 0.0, r: 100.0, name: 'Sun' };
    const planet = { cx: 300.0, cy: 0.0, r: 20.0, name: 'Planet' };
    const lagrange = evaluateLagrangePoints2D(sun, planet, 0.03);

    const roche = evaluateRocheLobeContours2D(sun, planet, lagrange, 24);

    assert(roche.primaryLobePath.length > 20, 'Primary Roche lobe path generated');
    assert(roche.secondaryLobePath.length > 20, 'Secondary Roche lobe path generated');
});

// 21. Inner Universe Lagrange Projections
test('Holographic Lagrange Inversion: Inverted Lagrange points reside strictly inside host body', () => {
    const sun = { cx: 0.0, cy: 0.0, r: 100.0, name: 'Sun' };
    const planet = { cx: 300.0, cy: 0.0, r: 20.0, name: 'Planet' };
    const lagrange = evaluateLagrangePoints2D(sun, planet, 0.03);

    const projectedInSun = evaluateLagrangeProjectionsInHost(lagrange.allPoints, sun);

    assert(projectedInSun.length === 5, 'All 5 Lagrange points projected inside Sun');
    for (const pt of projectedInSun) {
        const d = Math.hypot(pt.pos[0] - sun.cx, pt.pos[1] - sun.cy);
        assert(d < sun.r, `${pt.name} must reside strictly inside Sun interior (d=${d.toFixed(2)} < R=${sun.r})`);
    }
});

// 22. Four Common Tangents & Exact 360 Deg Illumination Zone Partition
test('4-Tangent Optics: Partitions receiver into Day, Dawn, Dusk, and Night summing to 360 deg', () => {
    const sun = { cx: 0.0, cy: 0.0, r: 100.0 };
    const planet = { cx: 300.0, cy: 0.0, r: 20.0 };

    const tangents = evaluateFourCommonTangents2D(sun, planet);

    assert(tangents.direct1 !== undefined && tangents.direct2 !== undefined, '2 direct tangents exist');
    assert(tangents.transverse1 !== undefined && tangents.transverse2 !== undefined, '2 transverse crossed tangents exist');

    const zones = tangents.zones;
    const totalSpan = zones.fullDay.spanDeg + zones.dawnTwilight.spanDeg + zones.duskTwilight.spanDeg + zones.fullNight.spanDeg;
    assertClose(totalSpan, 360.0, 1e-4, 'All 4 illumination zones sum exactly to 360 deg');

    assert(zones.fullDay.spanDeg > 0, 'Full day span > 0');
    assert(zones.dawnTwilight.spanDeg > 0, 'Dawn twilight span > 0');
    assert(zones.duskTwilight.spanDeg > 0, 'Dusk twilight span > 0');
    assert(zones.fullNight.spanDeg > 0, 'Full night span > 0');
});

// 23. Conformal Dual Optics in Inner Universes
test('Conformal Dual Optics: Tangent lines invert to 4 circles through host singularity', () => {
    const sun = { cx: 0.0, cy: 0.0, r: 100.0 };
    const planet = { cx: 300.0, cy: 0.0, r: 20.0 };

    const dualOpticsInPlanet = evaluateFourCommonTangents2D(sun, planet, planet);

    assert(dualOpticsInPlanet.dualConformalCircles !== undefined, 'Dual conformal circles computed');
    if (dualOpticsInPlanet.dualConformalCircles) {
        assert(dualOpticsInPlanet.dualConformalCircles.length === 4, 'Exactly 4 dual conformal circles generated');
        for (const c of dualOpticsInPlanet.dualConformalCircles) {
            // Each dual circle must pass through planet center (singularity origin)
            // Distance from circle center to planet center should equal circle radius!
            const distToPlanet = Math.hypot(c.cx - planet.cx, c.cy - planet.cy);
            assertClose(distToPlanet, c.r, 1e-4, 'Dual circle passes through host singularity center');
        }
    }
});

// 24. Dual-Reach Boundary Horizons & L1 Tangential Contact Invariance
test('Dual-Reach Horizons: Reach radii sum exactly to orbital separation and touch at L1', () => {
    /** @type {CGA2D.CelestialBody2D} */
    const planet = { name: 'Planet', pos: [300.0, 0.0], radius: 15.0, color: '#4ade80' };
    /** @type {CGA2D.CelestialBody2D} */
    const sun = { name: 'Sun', pos: [0.0, 0.0], radius: 60.0, color: '#38bdf8' };
    const massRatio = 1.0 / 9.0; // Planet / Sun

    const dualReach = evaluateDualReachInversion2D(planet, sun, massRatio);

    assertClose(dualReach.reachRadiusA + dualReach.reachRadiusB, dualReach.distance, 1e-4, 'Reach radii sum to separation distance d');
    assertClose(dualReach.L1[0], dualReach.reachRadiusB, 1e-4, 'L1 X coordinate matches Sun reach boundary');
    assertClose(dualReach.L1[1], 0.0, 1e-4, 'L1 Y coordinate sits on axis of centers');

    // Dual bodies must reside strictly inside host reach horizons
    const distDualPlanetInSun = Math.hypot(dualReach.dualBodyAInB.cx - sun.pos[0], dualReach.dualBodyAInB.cy - sun.pos[1]);
    assert(distDualPlanetInSun < dualReach.reachRadiusB, 'Dual planet lies strictly inside Sun reach domain');

    const distDualSunInPlanet = Math.hypot(dualReach.dualBodyBInA.cx - planet.pos[0], dualReach.dualBodyBInA.cy - planet.pos[1]);
    assert(distDualSunInPlanet < dualReach.reachRadiusA, 'Dual Sun lies strictly inside Planet reach domain');
});

// 25. Boundary Reach to Infinity Compactification Invariant
test('Boundary Reach Inversion: Points at boundary are invariant, while infinity collapses to center', () => {
    const sunPos = [0.0, 0.0];
    const reachR = 240.0;

    // Test fixed boundary horizon
    const pBoundary = [reachR, 0.0];
    const pInvBoundary = invertPoint([pBoundary[0], pBoundary[1]], reachR);
    assertClose(pInvBoundary[0], pBoundary[0], 1e-4, 'Boundary point maps to itself (fixed horizon)');
    assertClose(pInvBoundary[1], pBoundary[1], 1e-4, 'Boundary point Y invariant');

    // Test infinite distance collapse to center (asymptotic convergence)
    const pFar = [1e9, 1e9];
    const pInvFar = invertPoint([pFar[0], pFar[1]], reachR);
    assertClose(pInvFar[0], sunPos[0], 1e-4, 'Infinity X collapses to center');
    assertClose(pInvFar[1], sunPos[1], 1e-4, 'Infinity Y collapses to center');
});

// Summary
const total = results.length;
const passed = results.filter(r => r.passed).length;
console.log(`\n========================================`);
console.log(`Unit Test Summary: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
console.log(`========================================\n`);

if (passed !== total) {
    console.error('❌ Some unit tests failed!');
    process.exit(1);
} else {
    console.log('✨ All 2D Inversive CGA, Extended Optics, Lagrange Points & Projections Tests Passed!');
}




