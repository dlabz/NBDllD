// @ts-check

/**
 * @module sparse_star_octree-v7.js
 */

/**
 * @typedef {Object} Star
 * @property {number} x - 3D position X
 * @property {number} y - 3D position Y
 * @property {number} z - 3D position Z
 * @property {number} radius - Conformal physical radius
 * @property {number} mass - Gravitational mass
 * @property {number} r - Light intensity Red
 * @property {number} g - Light intensity Green
 * @property {number} b - Light intensity Blue
 */

/**
 * @typedef {Object} OctreeNode
 * @property {number} cx - Center X
 * @property {number} cy - Center Y
 * @property {number} cz - Center Z
 * @property {number} radius - Bounding macro-sphere radius
 * @property {number} mass - Combined gravitational mass
 * @property {number} r - Combined light intensity Red
 * @property {number} g - Combined light intensity Green
 * @property {number} b - Combined light intensity Blue
 * @property {number} childrenPtr - Index of the first of 8 contiguous child nodes in the flat buffer (0 if leaf)
 * @property {boolean} isLeaf - True if the node is a leaf
 */

/**
 * Representing a physical tree node in memory for safe two-stage flattening.
 */
class TreeNode {
    /**
     * @param {number} cx 
     * @param {number} cy 
     * @param {number} cz 
     * @param {number} radius 
     */
    constructor(cx, cy, cz, radius) {
        this.cx = cx;
        this.cy = cy;
        this.cz = cz;
        this.radius = radius;
        this.mass = 0;
        this.r = 0;
        this.g = 0;
        this.b = 0;
        this.childrenPtr = 0;
        this.isLeaf = true;
        /** @type {TreeNode[] | null} */
        this.children = null;
    }
}

/**
 * A highly optimized, robust CPU-side builder for the Conformal Sparse Star Octree (SSO).
 * It builds a standard pointer tree first and then flattens it safely into a flat Float32Array.
 */
export class SparseStarOctreeBuilder {
    /**
     * @param {Star[]} stars - Array of input star emitters
     * @param {number} [maxStarsPerLeaf=4] - Threshold before subdividing
     * @param {number} [maxDepth=8] - Maximum subdivision depth
     */
    constructor(stars, maxStarsPerLeaf = 4, maxDepth = 8) {
        this.stars = stars;
        this.maxStarsPerLeaf = maxStarsPerLeaf;
        this.maxDepth = maxDepth;

        /** @type {OctreeNode[]} */
        this.flatNodes = [];
    }

    /**
     * Builds the octree and returns the packed Float32Array ready for GPU upload.
     * @returns {Float32Array}
     */
    build() {
        if (this.stars.length === 0) {
            this.flatNodes = [];
            return new Float32Array(0);
        }

        // 1. Calculate bounding box of all stars to establish the root boundary
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const s of this.stars) {
            minX = Math.min(minX, s.x);
            minY = Math.min(minY, s.y);
            minZ = Math.min(minZ, s.z);
            maxX = Math.max(maxX, s.x);
            maxY = Math.max(maxY, s.y);
            maxZ = Math.max(maxZ, s.z);
        }

        const sizeX = maxX - minX;
        const sizeY = maxY - minY;
        const sizeZ = maxZ - minZ;
        const maxExtent = Math.max(sizeX, sizeY, sizeZ, 1e-4);

        const cx = minX + sizeX * 0.5;
        const cy = minY + sizeY * 0.5;
        const cz = minZ + sizeZ * 0.5;
        const halfSize = maxExtent * 0.5;

        // Stage 1: Build standard pointer tree structure recursively
        const root = this._buildSubtree(this.stars, cx, cy, cz, halfSize, 0);

        // Stage 2: Flatten the pointer tree safely without pop mutations
        this.flatNodes = [];
        this._flattenTree(root);

        return this._pack();
    }

    /**
     * Internal recursive pointer-tree builder.
     * @private
     * @param {Star[]} nodeStars
     * @param {number} cx
     * @param {number} cy
     * @param {number} cz
     * @param {number} halfSize
     * @param {number} depth
     * @returns {TreeNode}
     */
    _buildSubtree(nodeStars, cx, cy, cz, halfSize, depth) {
        const node = new TreeNode(cx, cy, cz, halfSize * Math.sqrt(3));

        // Leaf condition: reached limit or max depth
        if (nodeStars.length <= this.maxStarsPerLeaf || depth >= this.maxDepth) {
            this._computeLeafMacroSphere(node, nodeStars);
            return node;
        }

        // Subdivide into 8 children
        node.isLeaf = false;
        node.children = [];

        /** @type {Star[][]} */
        const childOctants = Array.from({ length: 8 }, () => []);

        for (const s of nodeStars) {
            const ix = s.x >= cx ? 1 : 0;
            const iy = s.y >= cy ? 1 : 0;
            const iz = s.z >= cz ? 1 : 0;
            const octantIdx = ix | (iy << 1) | (iz << 2);
            childOctants[octantIdx].push(s);
        }

        const h = halfSize * 0.5;
        for (let i = 0; i < 8; i++) {
            const childCx = cx + ((i & 1) ? h : -h);
            const childCy = cy + ((i & 2) ? h : -h);
            const childCz = cz + ((i & 4) ? h : -h);

            const childNode = this._buildSubtree(childOctants[i], childCx, childCy, childCz, h, depth + 1);
            node.children.push(childNode);
        }

        this._computeParentMacroSphere(node);
        return node;
    }

    /**
     * Stage 2: Breadth-First-Search flattening guarantees that each internal node's 8 children
     * are stored contiguously in memory at indices [childrenPtr ... childrenPtr + 7].
     * @private
     * @param {TreeNode} root
     */
    _flattenTree(root) {
        this.flatNodes = [];
        /** @type {TreeNode[]} */
        const queue = [root];
        let nextChildPtr = 1;

        while (queue.length > 0) {
            const node = /** @type {TreeNode} */ (queue.shift());

            /** @type {OctreeNode} */
            const flatNode = {
                cx: node.cx,
                cy: node.cy,
                cz: node.cz,
                radius: node.radius,
                mass: node.mass,
                r: node.r,
                g: node.g,
                b: node.b,
                childrenPtr: 0,
                isLeaf: node.isLeaf
            };

            if (!node.isLeaf && node.children) {
                flatNode.childrenPtr = nextChildPtr;
                nextChildPtr += 8;
                for (let i = 0; i < 8; i++) {
                    queue.push(node.children[i]);
                }
            }

            this.flatNodes.push(flatNode);
        }
    }

    /**
     * @private
     * @param {TreeNode} node
     * @param {Star[]} stars
     */
    _computeLeafMacroSphere(node, stars) {
        if (stars.length === 0) {
            node.mass = 0;
            node.radius = 0;
            node.r = 0; node.g = 0; node.b = 0;
            return;
        }

        let totalMass = 0;
        let weightedX = 0, weightedY = 0, weightedZ = 0;
        let totalR = 0, totalG = 0, totalB = 0;

        for (const s of stars) {
            totalMass += s.mass;
            weightedX += s.x * s.mass;
            weightedY += s.y * s.mass;
            weightedZ += s.z * s.mass;

            totalR += s.r;
            totalG += s.g;
            totalB += s.b;
        }

        node.mass = totalMass;
        node.r = totalR;
        node.g = totalG;
        node.b = totalB;

        if (totalMass > 1e-6) {
            node.cx = weightedX / totalMass;
            node.cy = weightedY / totalMass;
            node.cz = weightedZ / totalMass;
        }

        let maxRad = 0;
        for (const s of stars) {
            const dist = Math.hypot(s.x - node.cx, s.y - node.cy, s.z - node.cz);
            maxRad = Math.max(maxRad, dist + s.radius);
        }
        node.radius = maxRad;
    }

    /**
     * @private
     * @param {TreeNode} parent
     */
    _computeParentMacroSphere(parent) {
        if (!parent.children) return;

        let totalMass = 0;
        let weightedX = 0, weightedY = 0, weightedZ = 0;
        let totalR = 0, totalG = 0, totalB = 0;

        for (let i = 0; i < 8; i++) {
            const child = parent.children[i];
            totalMass += child.mass;
            weightedX += child.cx * child.mass;
            weightedY += child.cy * child.mass;
            weightedZ += child.cz * child.mass;

            totalR += child.r;
            totalG += child.g;
            totalB += child.b;
        }

        parent.mass = totalMass;
        parent.r = totalR;
        parent.g = totalG;
        parent.b = totalB;

        if (totalMass > 1e-6) {
            parent.cx = weightedX / totalMass;
            parent.cy = weightedY / totalMass;
            parent.cz = weightedZ / totalMass;
        }

        let maxRad = 0;
        for (let i = 0; i < 8; i++) {
            const child = parent.children[i];
            if (child.mass > 1e-6 || child.r > 1e-6) {
                const dist = Math.hypot(child.cx - parent.cx, child.cy - parent.cy, child.cz - parent.cz);
                maxRad = Math.max(maxRad, dist + child.radius);
            }
        }
        parent.radius = maxRad;
    }

    /**
     * Packs flat nodes into WebGPU-aligned Float32Array buffers.
     * @private
     * @returns {Float32Array}
     */
    _pack() {
        const packed = new Float32Array(this.flatNodes.length * 12);

        for (let i = 0; i < this.flatNodes.length; i++) {
            const node = this.flatNodes[i];
            const offset = i * 12;

            packed[offset + 0] = node.cx;
            packed[offset + 1] = node.cy;
            packed[offset + 2] = node.cz;
            packed[offset + 3] = node.radius;

            packed[offset + 4] = node.r;
            packed[offset + 5] = node.g;
            packed[offset + 6] = node.b;
            packed[offset + 7] = node.mass;

            packed[offset + 8] = node.childrenPtr;
            packed[offset + 9] = node.isLeaf ? 1.0 : 0.0;
            packed[offset + 10] = 0.0; // padding
            packed[offset + 11] = 0.0; // padding
        }

        return packed;
    }
}

/**
 * Returns the mathematically complete, production-grade WGSL code for physical simulation passes.
 * @returns {string}
 */
export function getWGSLOctreeShaderCode() {
    return `
struct OctreeNode {
    cga_sphere: vec4f,      // xyz: center of mass, w: bounding radius
    light_mass: vec4f,      // xyz: total intensity RGB, w: total mass
    children_ptr: f32,      // Index offset of 8 contiguous children in the buffer
    is_leaf: f32,           // 1.0f if leaf, 0.0f if internal node
    padding1: f32,
    padding2: f32,
};

struct Particle {
    pos: vec3f, radius: f32,   // radius preserved for render path
    vel: vec3f, life: f32,     // life preserved for render / fade
    acc: vec3f, mass: f32,     // acc required by symplectic split
    color: vec3f, type_: f32,  // type_ 1=sister, 0=swarm
};

struct SimulationParams {
    dt: f32,
    gamma: f32,              // Interstellar molecular cloud damping coefficient
    theta_cutoff: f32,       // Octree opening angle cutoff threshold (r / d)
    num_particles: u32,
    num_octree_nodes: u32,
    time: f32,
    active_camera: u32,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> octree: array<OctreeNode>;
@group(0) @binding(2) var<uniform> params: SimulationParams;

// Direct gravity acceleration from a node
fn evaluate_node_gravity(pos: vec3f, node: OctreeNode) -> vec3f {
    let r_vec = node.cga_sphere.xyz - pos;
    let dist_sq = dot(r_vec, r_vec);
    let dist = sqrt(dist_sq);
    
    let soft_eps = 4.0;
    if (dist > 1e-4) {
        let force_mag = node.light_mass.w / (dist_sq + soft_eps);
        return (r_vec / dist) * force_mag;
    }
    return vec3f(0.0);
}

// Direct light flux from a node
fn evaluate_node_light(pos: vec3f, node: OctreeNode) -> vec3f {
    let r_vec = node.cga_sphere.xyz - pos;
    let dist_sq = dot(r_vec, r_vec);
    let dist = sqrt(dist_sq);
    
    if (dist > 1e-4) {
        let node_rad_sq = node.cga_sphere.w * node.cga_sphere.w;
        let star_attenuation = clamp(node_rad_sq / (dist_sq + 1.0), 0.0, 3.5);
        return node.light_mass.xyz * star_attenuation;
    }
    return vec3f(0.0);
}

// =========================================================================
// PIPELINE 1: KINEMATICS POSITION UPDATE (Pass 1 of the Symplectic Split)
// =========================================================================
@compute @workgroup_size(64)
fn position_update_pass(@builtin(global_invocation_id) global_id: vec3u) {
    let id = global_id.x;
    if (id >= params.num_particles) { return; }

    var p = particles[id];
    // Position Update: r(t + dt) = r(t) + v(t)*dt + 0.5 * a(t)*dt^2
    p.pos = p.pos + p.vel * params.dt + 0.5 * p.acc * params.dt * params.dt;
    
    particles[id] = p;
}

// =========================================================================
// PIPELINE 2: SEQUENTIAL STACK-BASED DYNAMICS (Each thread processes one particle)
// =========================================================================
@compute @workgroup_size(64)
fn sequential_dynamics_pass(@builtin(global_invocation_id) global_id: vec3u) {
    let id = global_id.x;
    if (id >= params.num_particles) { return; }

    var p = particles[id];
    var total_force = vec3f(0.0);
    var total_light = vec3f(0.0);

    var stack: array<u32, 24>;
    var stack_ptr = 0u;
    
    stack[stack_ptr] = 0u; // Push root
    stack_ptr = stack_ptr + 1u;

    while (stack_ptr > 0u) {
        stack_ptr = stack_ptr - 1u;
        let node_idx = stack[stack_ptr];
        let node = octree[node_idx];

        let r_vec = node.cga_sphere.xyz - p.pos;
        let dist = length(r_vec);
        let ratio = node.cga_sphere.w / select(1.0, dist, dist > 1e-4);

        if (node.is_leaf > 0.5 || ratio < params.theta_cutoff) {
            total_force = total_force + evaluate_node_gravity(p.pos, node);
            total_light = total_light + evaluate_node_light(p.pos, node);
        } else {
            let children_start = u32(node.children_ptr);
            if (children_start > 0u) {
                for (var i = 0u; i < 8u; i = i + 1u) {
                    if (stack_ptr < 24u) {
                        stack[stack_ptr] = children_start + i;
                        stack_ptr = stack_ptr + 1u;
                    }
                }
            }
        }
    }

    // Solve the implicit velocity damping equation algebraically (Preserves Symplectic consistency)
    let damping_factor = 1.0 / (1.0 + 0.5 * params.gamma * params.dt);
    p.vel = (p.vel + 0.5 * (p.acc + total_force) * params.dt) * damping_factor;
    p.acc = total_force;
    
    // Encode particle color dynamically using integrated light field
    p.color = clamp(total_light * 0.12 + vec3f(0.3, 0.45, 0.95), vec3f(0.1), vec3f(1.0));
    
    particles[id] = p;
}

// =========================================================================
// PIPELINE 3: COOPERATIVE WORKGROUP DYNAMICS (Workgroup processes one particle)
// =========================================================================
const WG_SIZE = 64u;
const QUEUE_CAP = 32u;

var<workgroup> wg_queue: array<u32, QUEUE_CAP>;
var<workgroup> wg_queue_size: u32;
var<workgroup> wg_next_queue: array<u32, QUEUE_CAP>;
var<workgroup> wg_next_queue_size: atomic<u32>;

var<workgroup> shared_force: array<vec3f, WG_SIZE>;
var<workgroup> shared_light: array<vec3f, WG_SIZE>;

@compute @workgroup_size(WG_SIZE)
fn cooperative_dynamics_pass(
    @builtin(local_invocation_id) local_id: vec3u,
    @builtin(workgroup_id) group_id: vec3u
) {
    let thread_idx = local_id.x;
    let particle_idx = group_id.x;
    
    if (particle_idx >= params.num_particles) { return; }
    
    var p = particles[particle_idx];
    var accum_force = vec3f(0.0);
    var accum_light = vec3f(0.0);

    // Initialize queues on Thread 0
    if (thread_idx == 0u) {
        wg_queue[0] = 0u; // Root index
        wg_queue_size = 1u;
        atomicStore(&wg_next_queue_size, 0u);
    }
    workgroupBarrier();

    for (var steps = 0u; steps < 12u; steps = steps + 1u) {
        let current_queue_size = wg_queue_size;
        if (thread_idx == 0u) {
            atomicStore(&wg_next_queue_size, 0u);
        }
        workgroupBarrier();

        if (current_queue_size > 0u && thread_idx < current_queue_size) {
            let node_idx = wg_queue[thread_idx];
            let node = octree[node_idx];

            let dist = distance(p.pos, node.cga_sphere.xyz);
            let ratio = node.cga_sphere.w / select(1.0, dist, dist > 1e-4);

            if (node.is_leaf > 0.5 || ratio < params.theta_cutoff) {
                accum_force = accum_force + evaluate_node_gravity(p.pos, node);
                accum_light = accum_light + evaluate_node_light(p.pos, node);
            } else {
                let child_start = u32(node.children_ptr);
                if (child_start > 0u) {
                    let write_slot = atomicAdd(&wg_next_queue_size, 8u);
                    for (var c = 0u; c < 8u; c = c + 1u) {
                        if (write_slot + c < QUEUE_CAP) {
                            wg_next_queue[write_slot + c] = child_start + c;
                        }
                    }
                }
            }
        }
        workgroupBarrier();

        if (thread_idx == 0u) {
            let limit_size = atomicLoad(&wg_next_queue_size);
            wg_queue_size = min(limit_size, QUEUE_CAP);
            for (var qi = 0u; qi < wg_queue_size; qi = qi + 1u) {
                wg_queue[qi] = wg_next_queue[qi];
            }
        }
        workgroupBarrier();
    }

    // Logarithmic Reduction
    shared_force[thread_idx] = accum_force;
    shared_light[thread_idx] = accum_light;
    workgroupBarrier();

    for (var stride = WG_SIZE / 2u; stride > 0u; stride = stride / 2u) {
        if (thread_idx < stride) {
            shared_force[thread_idx] = shared_force[thread_idx] + shared_force[thread_idx + stride];
            shared_light[thread_idx] = shared_light[thread_idx] + shared_light[thread_idx + stride];
        }
        workgroupBarrier();
    }

    if (thread_idx == 0u) {
        let total_force = shared_force[0];
        let total_light = shared_light[0];

        let damping_factor = 1.0 / (1.0 + 0.5 * params.gamma * params.dt);
        p.vel = (p.vel + 0.5 * (p.acc + total_force) * params.dt) * damping_factor;
        p.acc = total_force;
        p.color = clamp(total_light * 0.12 + vec3f(0.3, 0.45, 0.95), vec3f(0.1), vec3f(1.0));
        
        particles[particle_idx] = p;
    }
}

// =========================================================================
// PIPELINE 4: EXHAUSTIVE DIRECT DYNAMICS (Direct N*M accumulation over leaf nodes)
// =========================================================================
@compute @workgroup_size(64)
fn direct_dynamics_pass(@builtin(global_invocation_id) global_id: vec3u) {
    let id = global_id.x;
    if (id >= params.num_particles) { return; }

    var p = particles[id];
    var total_force = vec3f(0.0);
    var total_light = vec3f(0.0);

    for (var i = 0u; i < params.num_octree_nodes; i = i + 1u) {
        let node = octree[i];
        if (node.is_leaf > 0.5 && node.light_mass.w > 0.0) {
            total_force = total_force + evaluate_node_gravity(p.pos, node);
            total_light = total_light + evaluate_node_light(p.pos, node);
        }
    }

    let damping_factor = 1.0 / (1.0 + 0.5 * params.gamma * params.dt);
    p.vel = (p.vel + 0.5 * (p.acc + total_force) * params.dt) * damping_factor;
    p.acc = total_force;
    p.color = clamp(total_light * 0.12 + vec3f(0.3, 0.45, 0.95), vec3f(0.1), vec3f(1.0));
    
    particles[id] = p;
}
`;
}
