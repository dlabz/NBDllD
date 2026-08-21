// @ts-check

/**
 * @file math_unit_tests.mjs
 * Comprehensive Unit Test Suite for CGA Dual Inversion, Fourier Kinematic Chain,
 * Matrix Transforms, and Numerical Edge-Cases (AMD 5500M / Metal compatibility).
 */

import {
    vec3,
    add3,
    sub3,
    scale3,
    dot3,
    length3,
    lengthSq3,
    normalize3,
    cross3,
    cgaInvertPoint,
    cgaInvertRadius,
    evaluateFourierKinematicChain,
    lookAt,
    perspective,
    mul4,
    invert4,
    hitSphere,
    raySegmentDist
} from './math_cga_fourier.mjs';

/**
 * @typedef {Object} TestResult
 * @property {string} name
 * @property {boolean} passed
 * @property {string} [details]
 * @property {number} [error]
 */

/**
 * Asserts float closeness within a given absolute tolerance.
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-4]
 * @returns {boolean}
 */
function isClose(actual, expected, tol = 1e-4) {
    return Math.abs(actual - expected) <= tol;
}

/**
 * Asserts vector closeness.
 * @param {import('./math_cga_fourier.mjs').Vec3} actual
 * @param {import('./math_cga_fourier.mjs').Vec3} expected
 * @param {number} [tol=1e-4]
 * @returns {boolean}
 */
function isVecClose(actual, expected, tol = 1e-4) {
    return isClose(actual[0], expected[0], tol) &&
           isClose(actual[1], expected[1], tol) &&
           isClose(actual[2], expected[2], tol);
}

/**
 * Runs the complete test suite.
 * @returns {{ total: number, passed: number, failed: number, results: TestResult[] }}
 */
export function runMathUnitTests() {
    /** @type {TestResult[]} */
    const results = [];

    /**
     * @param {string} name
     * @param {() => boolean | { passed: boolean, details?: string }} fn
     */
    function test(name, fn) {
        try {
            const res = fn();
            if (res === false || (typeof res === 'object' && res.passed === false)) {
                results.push({ name, passed: false, details: (typeof res === 'object' && res?.details) ? res.details : 'Assertion failed' });
            } else {
                results.push({ name, passed: true, details: (typeof res === 'object' && res?.details) ? res.details : 'Passed' });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push({ name, passed: false, details: `Exception: ${msg}` });
        }
    }

    // ==========================================
    // 1. Vector Operations & Safe Normalization
    // ==========================================
    test('Vector3: safe normalization on zero-length vector (prevents AMD 5500M NaN)', () => {
        const zeroVec = vec3(0, 0, 0);
        const norm = normalize3(zeroVec, [0, 1, 0]);
        return isVecClose(norm, [0, 1, 0]) && !Number.isNaN(norm[0]);
    });

    test('Vector3: cross product right-hand rule', () => {
        const x = vec3(1, 0, 0);
        const y = vec3(0, 1, 0);
        const z = cross3(x, y);
        return isVecClose(z, [0, 0, 1]);
    });

    // ==========================================
    // 2. 5D CGA Dual Inversion Involution
    // ==========================================
    test('5D CGA: Involution Identity (x*)* == x on arbitrary 3D points', () => {
        const Rs = 25.0;
        const testPoints = [
            vec3(12.5, 0.0, 0.0),
            vec3(0.0, -18.2, 5.4),
            vec3(25.0, 0.0, 0.0), // On inversion horizon
            vec3(1.2, 3.4, -5.6),
            vec3(50.0, 50.0, 50.0)
        ];

        for (const p of testPoints) {
            const dual1 = cgaInvertPoint(p, Rs, 0.0);
            const dual2 = cgaInvertPoint(dual1, Rs, 0.0);
            if (!isVecClose(dual2, p, 1e-3)) {
                return { passed: false, details: `Failed for point ${JSON.stringify(p)} -> dual2: ${JSON.stringify(dual2)}` };
            }
        }
        return true;
    });

    test('5D CGA: Fixed horizon invariant ||p|| = Rs => ||p*|| = Rs', () => {
        const Rs = 25.0;
        const horizonPoint = vec3(Rs, 0, 0);
        const dual = cgaInvertPoint(horizonPoint, Rs, 0.0);
        return isVecClose(dual, horizonPoint, 1e-4);
    });

    test('5D CGA: Dual radius transformation clamping', () => {
        const Rs = 25.0;
        const planetPos = vec3(25.0, 0.0, 0.0);
        const physicalR = 0.9;
        const dualR = cgaInvertRadius(planetPos, physicalR, Rs, 0.4, 12.0);
        return dualR >= 0.4 && dualR <= 12.0 && Number.isFinite(dualR);
    });

    // ==========================================
    // 3. 2-Vector Fourier Series Kinematic Chain
    // ==========================================
    test('Fourier Chain: Vector 1 (Sun -> Planet) planar confinement to X-Z (y == 0)', () => {
        for (let t = 0; t <= 10; t += 0.5) {
            const state = evaluateFourierKinematicChain(t, { R1: 25.0, r2: 3.0 });
            if (Math.abs(state.v1[1]) > 1e-6 || Math.abs(state.planetPos[1]) > 1e-6) {
                return { passed: false, details: `Planet y != 0 at t=${t}` };
            }
            const dist = length3(state.v1);
            if (!isClose(dist, 25.0, 1e-4)) {
                return { passed: false, details: `Planet orbit radius != 25.0 at t=${t} (got ${dist})` };
            }
        }
        return true;
    });

    test('Fourier Chain: Vector 2 (Planet -> Moon) vertical plane decoupling (z_relative == 0)', () => {
        for (let t = 0; t <= 10; t += 0.5) {
            const state = evaluateFourierKinematicChain(t, { R1: 25.0, r2: 3.0 });
            if (Math.abs(state.v2[2]) > 1e-6) {
                return { passed: false, details: `Moon relative z != 0 at t=${t}` };
            }
            const dist = length3(state.v2);
            if (!isClose(dist, 3.0, 1e-4)) {
                return { passed: false, details: `Moon orbit radius != 3.0 at t=${t} (got ${dist})` };
            }
        }
        return true;
    });

    test('Fourier Chain: Major Axis Trap stability (theta1 at 90 deg / 180 deg / 270 deg)', () => {
        const w1 = 0.25;
        // theta1 = pi/2 => t = pi / (2 * w1)
        const t90 = Math.PI / (2 * w1);
        const state90 = evaluateFourierKinematicChain(t90, { R1: 25.0, w1 });
        const p = state90.planetPos;
        // At 90 deg, x ~ 0, z ~ 25
        const valid90 = isClose(p[0], 0.0, 1e-4) && isClose(p[2], 25.0, 1e-4);
        if (!valid90) return { passed: false, details: `Failed at 90 deg: ${JSON.stringify(p)}` };

        // theta1 = pi => t = pi / w1
        const t180 = Math.PI / w1;
        const state180 = evaluateFourierKinematicChain(t180, { R1: 25.0, w1 });
        const p180 = state180.planetPos;
        // At 180 deg, x ~ -25, z ~ 0
        const valid180 = isClose(p180[0], -25.0, 1e-4) && isClose(p180[2], 0.0, 1e-4);
        if (!valid180) return { passed: false, details: `Failed at 180 deg: ${JSON.stringify(p180)}` };

        return true;
    });

    // ==========================================
    // 4. Matrix Transforms & Analytic Inverses
    // ==========================================
    test('Matrix: View Matrix * Inverse View Matrix == Identity (4x4)', () => {
        const eye = vec3(0, 10, 30);
        const target = vec3(0, 0, 0);
        const V = lookAt(eye, target, [0, 1, 0]);
        const invV = invert4(V);
        const identity = mul4(V, invV);

        // Check diagonal == 1, off-diagonal == 0
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const expected = (i === j) ? 1.0 : 0.0;
                const actual = identity[j * 4 + i];
                if (!isClose(actual, expected, 1e-3)) {
                    return { passed: false, details: `Matrix elem [${i},${j}] = ${actual}, expected ${expected}` };
                }
            }
        }
        return true;
    });

    test('Matrix: Combined Perspective * View inversion (InvVP)', () => {
        const V = lookAt([0, 5, 20], [0, 0, 0]);
        const P = perspective(45 * Math.PI / 180, 16 / 9, 0.1, 100);
        const VP = mul4(P, V);
        const invVP = invert4(VP);
        const check = mul4(VP, invVP);

        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const expected = (i === j) ? 1.0 : 0.0;
                if (!isClose(check[j * 4 + i], expected, 1e-2)) {
                    return { passed: false, details: `InvVP mismatch at [${i},${j}] = ${check[j * 4 + i]}` };
                }
            }
        }
        return true;
    });

    // ==========================================
    // 5. Analytic Ray-Sphere Quadratic Intersection
    // ==========================================
    test('Ray-Sphere: Direct frontal hit on origin sphere', () => {
        const ro = vec3(0, 0, 10);
        const rd = vec3(0, 0, -1);
        const center = vec3(0, 0, 0);
        const radius = 2.5;

        const res = hitSphere(ro, rd, center, radius);
        if (!res.hit) return { passed: false, details: 'Expected hit, got miss' };
        if (!isClose(res.t, 7.5, 1e-4)) return { passed: false, details: `Expected t=7.5, got ${res.t}` };
        if (!isVecClose(res.normal, [0, 0, 1], 1e-4)) return { passed: false, details: `Expected normal [0,0,1], got ${JSON.stringify(res.normal)}` };
        return true;
    });

    test('Ray-Sphere: Tangent grazing ray (discriminant == 0 boundary)', () => {
        const radius = 2.5;
        const ro = vec3(radius, 0, 10);
        const rd = vec3(0, 0, -1);
        const center = vec3(0, 0, 0);

        const res = hitSphere(ro, rd, center, radius);
        if (!res.hit) return { passed: false, details: 'Tangent ray should register a hit' };
        if (!isClose(res.t, 10.0, 1e-3)) return { passed: false, details: `Expected t=10.0, got ${res.t}` };
        return true;
    });

    test('Ray-Sphere: Sphere behind ray origin correctly rejected', () => {
        const ro = vec3(0, 0, 10);
        const rd = vec3(0, 0, 1); // Pointing away from origin
        const center = vec3(0, 0, 0);
        const radius = 2.5;

        const res = hitSphere(ro, rd, center, radius);
        return !res.hit;
    });

    // ==========================================
    // 6. Ray-Segment Distance (Vector visualization)
    // ==========================================
    test('Ray-Segment: Orthogonal closest distance', () => {
        const ro = vec3(0, 5, 0);
        const rd = vec3(1, 0, 0);
        const a = vec3(10, 0, 0);
        const b = vec3(10, 10, 0);

        const dist = raySegmentDist(ro, rd, a, b);
        return isClose(dist, 0.0, 1e-4); // Ray passes through [10, 5, 0] which lies on segment a-b
    });

    const passedCount = results.filter(r => r.passed).length;
    return {
        total: results.length,
        passed: passedCount,
        failed: results.length - passedCount,
        results
    };
}
