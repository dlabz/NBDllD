// @ts-check

/**
 * @typedef {Object} PhysicsConfig
 * @property {number} dt - Time step
 * @property {number} gamma - Interstellar Brownian damping coefficient
 * @property {number} epsilon - Softening core radius (gravity stabilizer)
 */

/**
 * Packs chaotic initial conditions for a stable 3-body system (e.g., figure-8 or nested resonance)
 * into a flat Float32Array suitable for WebGPU storage buffers.
 * Each body has: 4 floats pos (x,y,z,padding), 4 floats vel (vx,vy,vz,padding), 4 floats acc (ax,ay,az,padding), 4 floats params (mass, radius, type, padding)
 * Total: 16 floats (64 bytes) per body.
 * @returns {Float32Array}
 */
export function getInitialPhysicsState() {
    const bodies = new Float32Array(16 * 3); // 3 bodies
    
    // Body 0: "Central Star" (Massive)
    bodies[0]  = 0.0;  bodies[1]  = 0.0;  bodies[2]  = 0.0;  bodies[3]  = 1.0;  // Position
    bodies[4]  = 0.0;  bodies[5]  = -0.05; bodies[6]  = 0.0;  bodies[7]  = 0.0;  // Velocity
    bodies[8]  = 0.0;  bodies[9]  = 0.0;  bodies[10] = 0.0;  bodies[11] = 0.0;  // Acceleration
    bodies[12] = 500.0; bodies[13] = 2.0;  bodies[14] = 1.0;  bodies[15] = 0.0;  // Mass, Radius, Type, Padding

    // Body 1: Inner Planet
    bodies[16] = 12.0; bodies[17] = 0.0;  bodies[18] = 0.0;  bodies[19] = 1.0;
    bodies[20] = 0.0;  bodies[21] = 6.2;  bodies[22] = 0.0;  bodies[23] = 0.0;
    bodies[24] = 0.0;  bodies[25] = 0.0;  bodies[26] = 0.0;  bodies[27] = 0.0;
    bodies[28] = 1.0;  bodies[29] = 0.5;  bodies[30] = 0.0;  bodies[31] = 0.0;

    // Body 2: Outer Planet
    bodies[32] = -24.0; bodies[33] = 0.0;  bodies[34] = 0.0;  bodies[35] = 1.0;
    bodies[36] = 0.0;   bodies[37] = -4.5;  bodies[38] = 0.0;  bodies[39] = 0.0;
    bodies[40] = 0.0;   bodies[41] = 0.0;   bodies[42] = 0.0;  bodies[43] = 0.0;
    bodies[44] = 2.0;   bodies[45] = 0.8;   bodies[46] = 0.0;  bodies[47] = 0.0;

    return bodies;
}

/**
 * WGSL code implementing the single-pass vs. double-pass execution models.
 */
export const WGSL_COMPUTE_CODE = `
struct Body {
    pos: vec4f,
    vel: vec4f,
    acc: vec4f,
    params: vec4f, // x: mass, y: radius, z: type, w: padding
};

struct PhysicsConfig {
    dt: f32,
    gamma: f32,
    epsilon: f32,
    padding: f32,
};

@group(0) @binding(0) var<uniform> config: PhysicsConfig;
@group(0) @binding(1) var<storage, read_write> bodies: array<Body>;

// Helper: Calculate gravitational acceleration exerted on target body by all other bodies
fn get_gravitational_acceleration(pos: vec3f, self_id: u32, num_bodies: u32) -> vec3f {
    var acc_accum = vec3f(0.0);
    let G = 1.0; // Normalized gravitational constant

    for (var i = 0u; i < num_bodies; i = i + 1u) {
        if (i == self_id) { continue; }
        
        let other_pos = bodies[i].pos.xyz;
        let other_mass = bodies[i].params.x;
        
        let diff = other_pos - pos;
        let dist_sq = dot(diff, diff) + config.epsilon;
        let dist = sqrt(dist_sq);
        
        if (dist > 1e-4) {
            acc_accum += (G * other_mass / (dist_sq * dist)) * diff;
        }
    }
    return acc_accum;
}

// ==========================================
// PIPELINE A: THE MATHEMATICALLY FRACTURED SINGLE-PASS
// ==========================================
@compute @workgroup_size(64)
fn main_single_pass(
    @builtin(global_invocation_id) global_id: vec3u,
    @builtin(num_workgroups) num_groups: vec3u
) {
    let id = global_id.x;
    let num_bodies = arrayLength(&bodies);
    if (id >= num_bodies) { return; }

    var b = bodies[id];

    // Compute new acceleration based on existing/half-written positions (race conditions occur here!)
    let a_spatial = get_gravitational_acceleration(b.pos.xyz, id, num_bodies);

    // Naive Verlet Update with no implicit velocity-damping separation
    let next_pos = b.pos.xyz + b.vel.xyz * config.dt + 0.5 * b.acc.xyz * config.dt * config.dt;
    let next_vel = b.vel.xyz + 0.5 * (b.acc.xyz + a_spatial) * config.dt - config.gamma * b.vel.xyz * config.dt;
    
    b.pos = vec4f(next_pos, 1.0);
    b.vel = vec4f(next_vel, 0.0);
    b.acc = vec4f(a_spatial, 0.0);

    bodies[id] = b;
}

// ==========================================
// PIPELINE B: THE SYMPLECTIC DOUBLE-PASS (STAGES 1 & 2)
// ==========================================

// Pass 1: Kinematic Position Integration
@compute @workgroup_size(64)
fn main_double_pass_stage1(
    @builtin(global_invocation_id) global_id: vec3u
) {
    let id = global_id.x;
    let num_bodies = arrayLength(&bodies);
    if (id >= num_bodies) { return; }

    var b = bodies[id];

    // True Symplectic Update of coordinates before force calculation
    b.pos = vec4f(b.pos.xyz + b.vel.xyz * config.dt + 0.5 * b.acc.xyz * config.dt * config.dt, 1.0);

    bodies[id] = b;
}

// Pass 2: Force & Velocity Integration via Exact Analytic Damping
@compute @workgroup_size(64)
fn main_double_pass_stage2(
    @builtin(global_invocation_id) global_id: vec3u
) {
    let id = global_id.x;
    let num_bodies = arrayLength(&bodies);
    if (id >= num_bodies) { return; }

    var b = bodies[id];

    // Step 1: Calculate forces on the completely synchronized post-step position canvas
    let a_spatial = get_gravitational_acceleration(b.pos.xyz, id, num_bodies);

    // Step 2: Solve the implicit velocity damping equation algebraically (no fractions, no iterations)
    let damping_factor = 1.0 / (1.0 + 0.5 * config.gamma * config.dt);
    let next_vel = (b.vel.xyz + 0.5 * (b.acc.xyz + a_spatial) * config.dt) * damping_factor;

    b.vel = vec4f(next_vel, 0.0);
    b.acc = vec4f(a_spatial - config.gamma * next_vel, 0.0); // Retain dampened acceleration

    bodies[id] = b;
}
`;
