/**
 * @file webmcp.d.ts
 * Type definitions and AST schemas for the WebMCP developer bridge and agentic telemetry interface.
 */

declare namespace WebMCP {
    /**
     * Entity state in the N-body gravitational / Fourier simulation.
     */
    export interface BodyEntity {
        index: number;
        type: number; // 0: Star, 1: Planet, 2: Moon, 3: Asteroid
        name: string;
        pos: [number, number, number];
        radius: number;
        mass: number;
        vel: [number, number, number];
        life: number;
    }

    /**
     * Camera spherical orbital parameters.
     */
    export interface CameraSnapshot {
        target: [number, number, number];
        distance: number;
        azimuth: number;
        elevation: number;
        eye: [number, number, number];
    }

    /**
     * Numerical stability and physics health diagnostic report.
     */
    export interface DiagnosticReport {
        valid: boolean;
        bodyCount: number;
        maxSpeed: number;
        totalKineticEnergy: number;
        warnings: string[];
        errors: string[];
    }

    /**
     * Comprehensive snapshot of the simulation state returned by `getState()`.
     */
    export interface StateSnapshot {
        time: number;
        dt: number;
        fps: number;
        isPaused: boolean;
        timeScale: number;
        frameCount: number;
        camera: CameraSnapshot;
        bodies: BodyEntity[];
        diagnostics: DiagnosticReport;
    }

    /**
     * WebMCP Developer Bridge interface exposed on `window.__WEBMCP__` and `window.__3DGSIL__`.
     */
    export interface BridgeAPI {
        /**
         * Returns a full JSON-serializable snapshot of the simulation state.
         */
        getState(): StateSnapshot;

        /**
         * Pauses physics time integration.
         */
        pause(): void;

        /**
         * Resumes physics time integration.
         */
        resume(): void;

        /**
         * Toggles pause/resume state. Returns updated isPaused value.
         */
        togglePause(): boolean;

        /**
         * Advances simulation by a discrete step dt in seconds.
         * @param dt - Delta time step (default: 0.033)
         */
        step(dt?: number): void;

        /**
         * Sets simulation speed scaling multiplier (0.01x to 10.0x).
         * @param scale - Speed multiplier
         */
        setTimeScale(scale: number): void;

        /**
         * Snaps camera to a designated preset viewpoint.
         * @param mode - Preset view ('system' | 'planet' | 'moon' | 'core')
         */
        setCameraPreset(mode: 'system' | 'planet' | 'moon' | 'core'): void;

        /**
         * Configures camera spherical orbit directly.
         * @param azimuth - Horizontal azimuth in radians
         * @param elevation - Vertical inclination in radians
         * @param distance - Radial distance from target
         */
        setCameraOrbit(azimuth: number, elevation: number, distance: number): void;

        /**
         * Executes complete numerical sanity diagnostics and logs results.
         */
        runDiagnostics(): DiagnosticReport;

        /**
         * Generic command dispatcher for remote MCP agent execution.
         * @param cmd - Command name
         * @param args - Arguments array
         */
        exec(cmd: string, ...args: any[]): any;
    }
}

interface Window {
    __WEBMCP__?: WebMCP.BridgeAPI;
    __3DGSIL__?: WebMCP.BridgeAPI;
}
