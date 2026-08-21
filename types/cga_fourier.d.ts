/**
 * @file cga_fourier.d.ts
 * Type definitions, AST schemas, and JSDoc documentation snippets for
 * 5D Conformal Geometric Algebra (CGA), Fourier Kinematic Chain, and Analytic Raytracing.
 */

declare namespace CGA5D {
    /** 3D Euclidean spatial coordinate vector [x, y, z] */
    export type Vec3 = [number, number, number];

    /** 4D Homogeneous coordinate vector [x, y, z, w] */
    export type Vec4 = [number, number, number, number];

    /**
     * 5D Conformal Geometric Algebra multivector representation:
     * P = x*e1 + y*e2 + z*e3 + e0 + 0.5*||x||^2*e_inf
     * where:
     * - e0 is the point at the origin (null vector, e0^2 = 0)
     * - e_inf is the point at infinity (null vector, e_inf^2 = 0)
     * - e0 . e_inf = -1
     */
    export interface ConformalPoint5D {
        x: number;
        y: number;
        z: number;
        e0: number;
        e_inf: number;
    }

    /**
     * 5D Conformal Dual Spherical Inversion mapping:
     * x* = (Rs^2 * x) / (||x||^2 + eps)
     */
    export interface DualInversionMapping {
        /** Inversion sphere radius Rs (default: 25.0) */
        Rs: number;
        /** Inversion sphere squared radius Rs^2 (default: 625.0) */
        RsSq: number;
        /** Singularity regularization parameter */
        epsilon: number;
        /**
         * Transforms a primal Euclidean 3D coordinate to its conformal dual location.
         * @param p - Primal coordinate vector [x, y, z]
         * @returns Inverted dual vector [x*, y*, z*]
         */
        invertPoint(p: Vec3): Vec3;
        /**
         * Computes the conformal radius of an inverted sphere.
         * r* = clamp( (r * Rs^2) / (| ||p||^2 - r^2 | + eps), minR, maxR )
         * @param p - Physical sphere center
         * @param r - Physical sphere radius
         * @returns Conformal dual sphere radius
         */
        invertRadius(p: Vec3, r: number): number;
        /**
         * Computes the conformal spatial metric scaling factor lambda(x) = Rs^2 / ||x||^2.
         * @param p - Point in space
         * @returns Local metric scale factor
         */
        metricScale(p: Vec3): number;
    }
}

declare namespace FourierChain {
    /**
     * Synthetic diagnostic kinematic chain definition:
     * Used to construct a deterministic graph of body instances in the scene
     * to probe, communicate, and test edge-cases where mathematical transforms break.
     * v_k(t) = R_k * [cos(w_k * t), sin(w_k * t), 0] oriented on a given plane.
     */
    export interface FourierHarmonicNode {
        /** Orbital radius R_k */
        radius: number;
        /** Orbital angular frequency w_k (rad/s) */
        frequency: number;
        /** Initial phase offset (radians) */
        phaseOffset?: number;
        /** Plane of rotation normal ('XZ' for horizontal, 'XY' for vertical elevation) */
        plane: 'XZ' | 'XY' | 'YZ';
    }

    /**
     * Evaluated kinematic chain state at time t.
     */
    export interface KinematicChainState {
        /** Simulation time t */
        time: number;
        /** Sun (Joint 0 / Center of Mass) position */
        sunPos: CGA5D.Vec3;
        /** Vector 1 (Sun -> Planet) horizontal offset */
        v1: CGA5D.Vec3;
        /** Planet (Joint 1) world position */
        planetPos: CGA5D.Vec3;
        /** Vector 2 (Planet -> Moon) vertical elevation offset */
        v2: CGA5D.Vec3;
        /** Moon (Joint 2) world position */
        moonPos: CGA5D.Vec3;
        /** Vector 1 angle theta_1 = w1 * t */
        theta1: number;
        /** Vector 2 angle theta_2 = w2 * t */
        theta2: number;
    }
}

declare namespace AnalyticRaytracing {
    /** 3D Ray definition: P(t) = origin + t * direction */
    export interface Ray3D {
        origin: CGA5D.Vec3;
        direction: CGA5D.Vec3;
    }

    /** Analytic Ray-Sphere quadratic intersection result */
    export interface SphereHitResult {
        /** Whether the ray intersects the sphere with t > 0 */
        hit: boolean;
        /** Ray parameter distance to closest surface intersection */
        t: number;
        /** 3D World coordinates of the hit point */
        hitPos: CGA5D.Vec3;
        /** Normalized outward surface normal vector at the hit point */
        normal: CGA5D.Vec3;
    }

    /** Closest distance between a 3D ray and a 3D line segment */
    export interface RaySegmentDistResult {
        /** Minimum Euclidean distance from ray to segment */
        distance: number;
        /** Parametric coordinate on the line segment [0, 1] */
        segmentParam: number;
        /** Parametric coordinate on the ray (t >= 0) */
        rayParam: number;
    }
}

declare namespace MathAST {
    /** 4x4 Column-Major Matrix utilities */
    export interface Matrix4x4Ops {
        lookAt(eye: CGA5D.Vec3, target: CGA5D.Vec3, up?: CGA5D.Vec3): Float32Array;
        perspective(fov: number, aspect: number, near: number, far: number): Float32Array;
        mul4(a: Float32Array | number[], b: Float32Array | number[]): Float32Array;
        invert4(m: Float32Array | number[]): Float32Array;
    }
}
