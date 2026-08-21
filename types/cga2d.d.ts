// @ts-check
/**
 * @file Ambient Type Definitions for 2D Inversive Geometry & 4D Conformal Geometric Algebra (G(3,1))
 * @project 3DGSIL
 */

declare namespace CGA2D {
    /** 2D point coordinate tuple [x, y] */
    export type Point2D = [number, number];

    /** 2D vector tuple [x, y] */
    export type Vector2D = [number, number];

    /** 2x2 Matrix tuple [m00, m01, m10, m11] in row-major order */
    export type Matrix2x2 = [number, number, number, number];

    /** 4D Conformal Null Vector [e1, e2, einf, e0] */
    export type Multivector4D = [number, number, number, number];

    /** Analytic 2D Circle */
    export interface Circle {
        type?: 'circle';
        id?: string;
        cx: number;
        cy: number;
        r: number;
        isOrthogonal?: boolean;
        color?: string;
        label?: string;
    }

    /** Analytic 2D Line: nx * x + ny * y = d (where nx^2 + ny^2 = 1) */
    export interface Line {
        type?: 'line';
        id?: string;
        nx: number;
        ny: number;
        d: number;
        p1?: Point2D;
        p2?: Point2D;
        color?: string;
        label?: string;
    }

    /** Inversion Horizon Circle */
    export interface InversionHorizon {
        cx: number;
        cy: number;
        r: number;
    }

    /** 2D Gaussian Splat Covariance & Position */
    export interface GaussianSplat {
        id?: string;
        x: number;
        y: number;
        sigmaXX: number;
        sigmaXY: number;
        sigmaYY: number;
        opacity: number;
        color?: string;
    }

    /** SVG Ellipse Parameters extracted from Covariance */
    export interface SvgEllipseParams {
        cx: number;
        cy: number;
        rx: number;
        ry: number;
        angleDeg: number;
    }

    /** Harmonic Vector node in 2D Fourier Chain */
    export interface FourierHarmonic {
        radius: number;
        speed: number;
        phase: number;
        color?: string;
        name?: string;
    }

    /** State of the SVG Viewport and Pan/Zoom matrix */
    export interface ViewportState {
        viewBoxX: number;
        viewBoxY: number;
        viewBoxWidth: number;
        viewBoxHeight: number;
        zoom: number;
        isDragging: boolean;
        dragStartX: number;
        dragStartY: number;
    }

    /** Diagnostics report schema */
    export interface DiagnosticReport {
        timestamp: number;
        inversionRadius: number;
        involutionMaxError: number;
        fixedHorizonMaxError: number;
        orthogonalInvarianceMaxError: number;
        isNumericallyStable: boolean;
        entityCounts: {
            primalPoints: number;
            dualPoints: number;
            primalCircles: number;
            dualCircles: number;
            primalLines: number;
            dualLines: number;
            splats: number;
        };
    }

    /** Celestial Body in 2D Planetary System */
    export interface CelestialBody2D {
        name: string;
        pos: Point2D;
        radius: number;
        color: string;
        dualCircle?: Circle;
    }

    /** Flat Planetary System State */
    export interface PlanetarySystem2D {
        sun: CelestialBody2D;
        planet: CelestialBody2D;
        moon: CelestialBody2D;
        sunStar: CelestialBody2D;
        planetStar: CelestialBody2D;
        moonStar: CelestialBody2D;
        shadowUmbra?: Array<Point2D>;
    }

    /** Host Body with Internal Inverted Universe */
    export interface HostBodyUniverse2D {
        host: CelestialBody2D;
        singularityCenter: Point2D;
        internalBodies: Array<CelestialBody2D>;
        internalLagrangePoints?: Array<LagrangePoint2D>;
        internalConformalOptics?: Array<Circle>;
    }

    /** 2D Lagrangian Equilibrium Point */
    export interface LagrangePoint2D {
        id: string;
        name: string;
        pos: Point2D;
        type: 'collinear' | 'triangular';
        stability: 'unstable' | 'stable';
        color?: string;
    }

    /** Pairwise Lagrangian Equilibrium System */
    export interface LagrangeSystem2D {
        primaryName: string;
        secondaryName: string;
        systemColor: string;
        L1: LagrangePoint2D;
        L2: LagrangePoint2D;
        L3: LagrangePoint2D;
        L4: LagrangePoint2D;
        L5: LagrangePoint2D;
        allPoints: Array<LagrangePoint2D>;
        axisLine: [Point2D, Point2D];
        triangleLines: Array<[Point2D, Point2D]>;
        guideCircleRadius: number;
    }

    /** Roche Lobe Gravitational Equipotential Curves */
    export interface RocheLobeContours2D {
        primaryLobePath: Array<Point2D>;
        secondaryLobePath: Array<Point2D>;
        outerEquipotentialPath?: Array<Point2D>;
    }

    /** Illuminated Arc on a Circular Body */
    export interface IlluminatedArc2D {
        startAngle: number;
        endAngle: number;
        pStart: Point2D;
        pEnd: Point2D;
        spanDeg: number;
    }

    /** 4 Illumination Zones on Receiver Body (Full Day, Dawn, Dusk, Full Night) */
    export interface IlluminationZoneArcs2D {
        fullDay: IlluminatedArc2D;
        dawnTwilight: IlluminatedArc2D;
        duskTwilight: IlluminatedArc2D;
        fullNight: IlluminatedArc2D;
    }

    /** The 4 Common Tangents Between Two Circles */
    export interface FourTangents2D {
        direct1: { p1: Point2D, p2: Point2D };
        direct2: { p1: Point2D, p2: Point2D };
        transverse1: { p1: Point2D, p2: Point2D };
        transverse2: { p1: Point2D, p2: Point2D };
        umbraApex: Point2D;
        penumbraVertex: Point2D;
        zones: IlluminationZoneArcs2D;
        extendedLines: Array<[Point2D, Point2D]>;
        dualConformalCircles?: Array<Circle>;
    }

    /** Common External Tangents & Radiant Beam */
    export interface TangentRayBundle2D {
        p1Top: Point2D;
        p1Bottom: Point2D;
        p2Top: Point2D;
        p2Bottom: Point2D;
        sourceArc: IlluminatedArc2D;
        targetLitArc: IlluminatedArc2D;
        sampleRays: Array<{ from: Point2D, to: Point2D }>;
        fourTangents?: FourTangents2D;
    }

    /** Umbra & Penumbra Shadow Cones */
    export interface ShadowCones2D {
        umbraPoly: Array<Point2D>;
        penumbraPoly: Array<Point2D>;
        umbraApex?: Point2D;
        isEclipseOccurring?: boolean;
    }

    /** Secondary Albedo Reflection (Planetshine / Moonshine) */
    export interface AlbedoReflection2D {
        isVisible: boolean;
        sourceBody: string;
        targetBody: string;
        reflectionRays: Array<{ from: Point2D, to: Point2D }>;
        targetSecondaryLitArc: IlluminatedArc2D;
        intensity: number;
    }

    /** Recursive Multi-Horizon Planetary System State */
    export interface RecursivePlanetarySystem2D {
        sunUniverse: HostBodyUniverse2D;
        planetUniverse: HostBodyUniverse2D;
        moonUniverse: HostBodyUniverse2D;
        sunPlanetLagrange?: LagrangeSystem2D;
        planetMoonLagrange?: LagrangeSystem2D;
        sunPlanetRoche?: RocheLobeContours2D;
        planetMoonRoche?: RocheLobeContours2D;
        sunToPlanetOptics?: TangentRayBundle2D;
        sunToMoonOptics?: TangentRayBundle2D;
        planetToMoonOptics?: FourTangents2D;
        planetShadow?: ShadowCones2D;
        moonShadow?: ShadowCones2D;
        planetshine?: AlbedoReflection2D;
        moonshine?: AlbedoReflection2D;
    }

    /** Dual-Reach Inversion System (Hill Horizon & L1 Boundary Inversion) */
    export interface DualReachSystem2D {
        bodyA: CelestialBody2D;
        bodyB: CelestialBody2D;
        distance: number;
        L1: Point2D;
        reachRadiusA: number;
        reachRadiusB: number;
        dualBodyAInB: Circle;
        dualBodyBInA: Circle;
    }

    /** Active Visual Mode enum */
    export type VisualMode = 'wikipedia' | 'conformal_grid' | 'fourier_orbits' | 'planetary_system' | 'gaussian_splats' | 'mirror_infinity';

    /** Mirror Particle in 2D Space */
    export interface MirrorParticle {
        pos: Point2D;
        vel: Vector2D;
        radius: number;
        color?: string;
    }

    /** Cosmic Boundary Box */
    export interface CosmicBox {
        halfWidth: number;
        halfHeight: number;
        color?: string;
    }

    /** WebMCP Developer Bridge State */
    export interface WebMCPState {
        appName: string;
        version: string;
        mode: VisualMode;
        time: number;
        isPaused: boolean;
        timeScale: number;
        inversionRadius: number;
        viewport: ViewportState;
        diagnostics: DiagnosticReport;
    }

    /** WebMCP Developer Bridge API */
    export interface WebMCPBridge {
        getState: () => WebMCPState;
        setMode: (mode: VisualMode) => void;
        togglePause: () => void;
        pause: () => void;
        resume: () => void;
        step: (dt?: number) => void;
        setTimeScale: (scale: number) => void;
        setInversionRadius: (r: number) => void;
        setZoom: (zoom: number) => void;
        panTo: (x: number, y: number) => void;
        resetView: () => void;
        runDiagnostics: () => DiagnosticReport;
        exec: (cmd: string, ...args: any[]) => any;
    }
}

declare interface Window {
    __WEBMCP__?: CGA2D.WebMCPBridge;
    __2DCGA__?: CGA2D.WebMCPBridge;
    __3DGSIL__?: any;
}
