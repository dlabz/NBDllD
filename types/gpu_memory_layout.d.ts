/**
 * @file gpu_memory_layout.d.ts
 * Memory layout specifications, byte offsets, and struct alignments for WebGPU Buffers.
 */

declare namespace GPUMemoryLayout {
    /**
     * Body entity storage buffer memory layout:
     * Contiguous array of 16 32-bit floats (64 bytes total per body).
     *
     * | Offset (Floats) | Offset (Bytes) | Field Name | Type | Description |
     * | :--- | :--- | :--- | :--- | :--- |
     * | `0..2` | `0..11` | `pos.xyz` | `vec3f` | 3D Cartesian coordinates |
     * | `3` | `12..15` | `radius` | `f32` | Bounding sphere physical radius |
     * | `4..6` | `16..27` | `dual.xyz` | `vec3f` | 5D CGA dual inverted position |
     * | `7` | `28..31` | `mass` | `f32` | Gravitational mass |
     * | `8..10` | `32..43` | `vel.xyz` | `vec3f` | 3D linear velocity vector |
     * | `11` | `44..47` | `life` | `f32` | Luminescence / vitality decay factor |
     * | `12` | `48..51` | `type_` | `f32` | Entity type (0: Star, 1: Planet, 2: Moon, 3: Asteroid) |
     * | `13..15` | `52..63` | `pad[3]` | `vec3f` | Padding to preserve 64-byte alignment |
     */
    export interface GPUBodyStructOffsets {
        POS_X: 0;
        POS_Y: 1;
        POS_Z: 2;
        RADIUS: 3;
        DUAL_X: 4;
        DUAL_Y: 5;
        DUAL_Z: 6;
        MASS: 7;
        VEL_X: 8;
        VEL_Y: 9;
        VEL_Z: 10;
        LIFE: 11;
        TYPE: 12;
        PAD_0: 13;
        PAD_1: 14;
        PAD_2: 15;
        FLOATS_PER_BODY: 16;
        BYTES_PER_BODY: 64;
    }

    /**
     * Compute pass uniform buffer layout (16 bytes aligned):
     * `vec4f(simTime, dt, pad0, pad1)`
     */
    export interface GPUComputeUniformOffsets {
        SIM_TIME: 0;
        DT: 1;
        PAD_0: 2;
        PAD_1: 3;
        FLOATS_TOTAL: 4;
        BYTES_TOTAL: 16;
    }

    /**
     * Render pass uniform buffer layout (128 bytes aligned):
     * - `invVP`: 4x4 matrix (16 floats, floats 0..15)
     * - `eye`: `vec3f` (3 floats, floats 16..18)
     * - `time`: `f32` (1 float, float 19)
     * - `res`: `vec2f` (2 floats, floats 20..21)
     * - `pad`: `vec2f` (2 floats, floats 22..23)
     * - `extra`: 8 floats padding to 128 bytes
     */
    export interface GPURenderUniformOffsets {
        INV_VP_MATRIX: [0, 15];
        EYE_POS: [16, 18];
        TIME: 19;
        RESOLUTION: [20, 21];
        PAD: [22, 23];
        FLOATS_TOTAL: 32;
        BYTES_TOTAL: 128;
    }
}
