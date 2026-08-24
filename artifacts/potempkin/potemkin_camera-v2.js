// @ts-check

/**
 * @typedef {Object} CameraState
 * @property {Float32Array} target - 3D vector representing T_cam [x, y, z]
 * @property {number} distance - Orbital radius (D)
 * @property {number} azimuth - Legacy Euler azimuth (Camera A)
 * @property {number} elevation - Legacy Euler elevation, clamped (Camera A)
 * @property {Float32Array} rotation - Quaternion representing the camera rotation
 * @property {'xyzw' | 'wxyz'} quaternionLayout - Active quaternion memory layout
 * @property {'A' | 'B'} activeCamera - The hot-swap toggle state
 */

/**
 * @typedef {Object} CameraOutput
 * @property {Float32Array} viewMatrix - 16-element view matrix for WebGPU
 * @property {Float32Array} right - Normalized X basis vector (camRight)
 * @property {Float32Array} up - Normalized Y basis vector (camUp)
 * @property {Float32Array} forward - Normalized Z basis vector (zCam, pointing out of screen)
 * @property {Float32Array} eye - World space position of the camera
 */

/**
 * Generates the legacy Euler-based view state (Maximum G2 continuity, clamped elevation).
 * @param {CameraState} state
 * @returns {CameraOutput}
 */
export function updateCameraA(state) {
    const el = Math.max(0.02, Math.min(Math.PI / 2 - 0.02, state.elevation));
    const az = state.azimuth;
    
    // Calculate eye position in spherical coordinates relative to target
    const eye = new Float32Array([
        state.target[0] + state.distance * Math.cos(el) * Math.sin(az),
        state.target[1] + state.distance * Math.sin(el),
        state.target[2] + state.distance * Math.cos(el) * Math.cos(az)
    ]);

    // Construct basis vectors manually for legacy camera
    // zCam points from target to eye
    const zCamX = eye[0] - state.target[0];
    const zCamY = eye[1] - state.target[1];
    const zCamZ = eye[2] - state.target[2];
    const lenZ = Math.hypot(zCamX, zCamY, zCamZ);
    
    const forward = new Float32Array([
        lenZ > 1e-6 ? zCamX / lenZ : 0,
        lenZ > 1e-6 ? zCamY / lenZ : 1,
        lenZ > 1e-6 ? zCamZ / lenZ : 0
    ]);

    // Temporary world-up vector [0, 1, 0] for cross products
    const upX = 0, upY = 1, upZ = 0;
    
    // Right = cross(Up, forward)
    let rightX = upY * forward[2] - upZ * forward[1];
    let rightY = upZ * forward[0] - upX * forward[2];
    let rightZ = upX * forward[1] - upY * forward[0];
    const lenR = Math.hypot(rightX, rightY, rightZ);
    
    const right = new Float32Array([
        lenR > 1e-6 ? rightX / lenR : 1,
        lenR > 1e-6 ? rightY / lenR : 0,
        lenR > 1e-6 ? rightZ / lenR : 0
    ]);

    // Up = cross(forward, Right) to ensure orthonormality
    const up = new Float32Array([
        forward[1] * right[2] - forward[2] * right[1],
        forward[2] * right[0] - forward[0] * right[2],
        forward[0] * right[1] - forward[1] * right[0]
    ]);

    // Construct view matrix
    const tx = -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]);
    const ty = -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]);
    const tz = -(forward[0] * eye[0] + forward[1] * eye[1] + forward[2] * eye[2]);

    const viewMatrix = new Float32Array([
        right[0],   up[0],      forward[0],   0.0,
        right[1],   up[1],      forward[1],   0.0,
        right[2],   up[2],      forward[2],   0.0,
        tx,         ty,         tz,           1.0
    ]);

    return { viewMatrix, right, up, forward, eye };
}

/**
 * Generates the SupraQuant phase-based view state using Rotor/Quaternion extraction (G4 continuity).
 * Supports both xyzw and wxyz memory layouts.
 * @param {CameraState} state
 * @returns {CameraOutput}
 */
export function updateCameraB(state) {
    const q = state.rotation;
    let x = 0, y = 0, z = 0, w = 1;

    if (state.quaternionLayout === 'xyzw') {
        x = q[0]; y = q[1]; z = q[2]; w = q[3];
    } else {
        w = q[0]; x = q[1]; y = q[2]; z = q[3];
    }

    // Normalize quaternion to protect against drift over long-running frames
    const lenQ = Math.hypot(x, y, z, w);
    if (lenQ > 1e-6) {
        x /= lenQ; y /= lenQ; z /= lenQ; w /= lenQ;
    }

    // Standard quaternion-to-matrix elements (double multiplications factored out)
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    // Basis vectors extracted directly from the columns of the rotation matrix
    const right = new Float32Array([
        1.0 - (yy + zz),
        xy + wz,
        xz - wy
    ]);

    const up = new Float32Array([
        xy - wz,
        1.0 - (xx + zz),
        yz + wx
    ]);

    const forward = new Float32Array([
        xz + wy,
        yz - wx,
        1.0 - (xx + yy)
    ]);

    // Position the camera by pushing outward from the target along the forward basis vector
    const eye = new Float32Array([
        state.target[0] + forward[0] * state.distance,
        state.target[1] + forward[1] * state.distance,
        state.target[2] + forward[2] * state.distance
    ]);

    // Calculate translation terms
    const tx = -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]);
    const ty = -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]);
    const tz = -(forward[0] * eye[0] + forward[1] * eye[1] + forward[2] * eye[2]);

    const viewMatrix = new Float32Array([
        right[0],   up[0],      forward[0],   0.0,
        right[1],   up[1],      forward[1],   0.0,
        right[2],   up[2],      forward[2],   0.0,
        tx,         ty,         tz,           1.0
    ]);

    return { viewMatrix, right, up, forward, eye };
}

/**
 * Converts an orthonormal basis (3x3 rotation columns) directly to a normalized quaternion.
 * @param {Float32Array} right 
 * @param {Float32Array} up 
 * @param {Float32Array} forward 
 * @param {'xyzw' | 'wxyz'} layout 
 * @returns {Float32Array}
 */
export function basisToQuaternion(right, up, forward, layout) {
    const m00 = right[0], m01 = up[0], m02 = forward[0];
    const m10 = right[1], m11 = up[1], m12 = forward[1];
    const m20 = right[2], m21 = up[2], m22 = forward[2];

    const tr = m00 + m11 + m22;
    let x = 0, y = 0, z = 0, w = 1;

    if (tr > 0) {
        const s = Math.sqrt(tr + 1.0) * 2;
        w = 0.25 * s;
        x = (m21 - m12) / s;
        y = (m02 - m20) / s;
        z = (m10 - m01) / s;
    } else if ((m00 > m11) && (m00 > m22)) {
        const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
        w = (m21 - m12) / s;
        x = 0.25 * s;
        y = (m01 + m10) / s;
        z = (m02 + m20) / s;
    } else if (m11 > m22) {
        const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
        w = (m02 - m20) / s;
        x = (m01 + m10) / s;
        y = 0.25 * s;
        z = (m12 + m21) / s;
    } else {
        const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
        w = (m10 - m01) / s;
        x = (m02 + m20) / s;
        y = (m12 + m21) / s;
        z = 0.25 * s;
    }

    // Normalize
    const len = Math.hypot(x, y, z, w);
    if (len > 1e-6) {
        x /= len; y /= len; z /= len; w /= len;
    }

    if (layout === 'xyzw') {
        return new Float32Array([x, y, z, w]);
    } else {
        return new Float32Array([w, x, y, z]);
    }
}

/**
 * Synchronizes Camera B (Rotor/Quaternion) to match Camera A (Euler).
 * @param {CameraState} state 
 */
export function synchronizeAtoB(state) {
    const outA = updateCameraA(state);
    state.rotation = basisToQuaternion(outA.right, outA.up, outA.forward, state.quaternionLayout);
}

/**
 * Synchronizes Camera A (Euler) to match Camera B (Rotor/Quaternion).
 * @param {CameraState} state 
 */
export function synchronizeBtoA(state) {
    const outB = updateCameraB(state);
    const fx = outB.forward[0];
    const fy = outB.forward[1];
    const fz = outB.forward[2];

    // Elevation is arcsin(fy), clamped to A's stable domain to avoid gimbal singularity
    state.elevation = Math.max(0.02, Math.min(Math.PI / 2 - 0.02, Math.asin(fy)));
    
    // Azimuth is atan2(fx, fz)
    state.azimuth = Math.atan2(fx, fz);
}

/**
 * Multiplication of two quaternions: r = a * b
 * @param {Float32Array} a 
 * @param {Float32Array} b 
 * @param {'xyzw' | 'wxyz'} layout 
 * @returns {Float32Array}
 */
export function multiplyQuaternions(a, b, layout) {
    let ax = 0, ay = 0, az = 0, aw = 1;
    let bx = 0, by = 0, bz = 0, bw = 1;

    if (layout === 'xyzw') {
        ax = a[0]; ay = a[1]; az = a[2]; aw = a[3];
        bx = b[0]; by = b[1]; bz = b[2]; bw = b[3];
    } else {
        aw = a[0]; ax = a[1]; ay = a[2]; az = a[3];
        bw = b[0]; bx = b[1]; by = b[2]; bz = b[3];
    }

    const rw = aw * bw - ax * bx - ay * by - az * bz;
    const rx = aw * bx + ax * bw + ay * bz - az * by;
    const ry = aw * by - ax * bz + ay * bw + az * bx;
    const rz = aw * bz + ax * by - ay * bx + az * bw;

    if (layout === 'xyzw') {
        return new Float32Array([rx, ry, rz, rw]);
    } else {
        return new Float32Array([rw, rx, ry, rz]);
    }
}

/**
 * Creates a quaternion from axis and angle.
 * @param {Float32Array} axis 
 * @param {number} angle 
 * @param {'xyzw' | 'wxyz'} layout 
 * @returns {Float32Array}
 */
export function quaternionFromAxisAngle(axis, angle, layout) {
    const halfAngle = angle * 0.5;
    const s = Math.sin(halfAngle);
    const c = Math.cos(halfAngle);

    const x = axis[0] * s;
    const y = axis[1] * s;
    const z = axis[2] * s;
    const w = c;

    if (layout === 'xyzw') {
        return new Float32Array([x, y, z, w]);
    } else {
        return new Float32Array([w, x, y, z]);
    }
}
