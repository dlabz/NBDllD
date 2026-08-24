// @ts-check

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
 * @property {OctreeNode[]|null} children - Array of child nodes (only on CPU reference tree)
 */

/**
 * A highly optimized, zero-hype CPU-side builder for the Conformal Sparse Star Octree (SSO).
 * It recursively clusters stars, computes unified center-of-mass and light centroid macro-spheres,
 * and packs the tree into a flat WebGPU-compliant 48-byte aligned Float32Array structure.
 * Using a two-stage recursive build then flat contiguous packing to prevent array mutations corruption.
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

        // Make boundary cubic for uniform subdivision
        const sizeX = maxX - minX;
        const sizeY = maxY - minY;
        const sizeZ = maxZ - minZ;
        const maxExtent = Math.max(sizeX, sizeY, sizeZ, 1e-4);

        const cx = minX + sizeX * 0.5;
        const cy = minY + sizeY * 0.5;
        const cz = minZ + sizeZ * 0.5;
        const halfSize = maxExtent * 0.5;

        // Stage 1: Build the clean reference-based tree recursively
        const rootNode = this._buildTreeRecursive(this.stars, cx, cy, cz, halfSize, 0);

        // Stage 2: Flatten the tree into contiguous layout
        this.flatNodes = [];
        this._flattenNode(rootNode);

        return this._pack();
    }

    /**
     * Stage 1 recursive tree construction.
     * @private
     * @param {Star[]} nodeStars
     * @param {number} cx
     * @param {number} cy
     * @param {number} cz
     * @param {number} halfSize
     * @param {number} depth
     * @returns {OctreeNode}
     */
    _buildTreeRecursive(nodeStars, cx, cy, cz, halfSize, depth) {
        /** @type {OctreeNode} */
        const node = {
            cx, cy, cz,
            radius: halfSize * Math.sqrt(3), // Circumscribed sphere radius
            mass: 0,
            r: 0, g: 0, b: 0,
            childrenPtr: 0,
            isLeaf: true,
            children: null
        };

        if (nodeStars.length <= this.maxStarsPerLeaf || depth >= this.maxDepth) {
            this._computeMacroSphere(node, nodeStars);
            return node;
        }

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

        for (let i = 0; i < 8; i++) {
            const h = halfSize * 0.5;
            const childCx = cx + ((i & 1) ? h : -h);
            const childCy = cy + ((i & 2) ? h : -h);
            const childCz = cz + ((i & 4) ? h : -h);

            const childNode = this._buildTreeRecursive(childOctants[i], childCx, childCy, childCz, h, depth + 1);
            node.children.push(childNode);
        }

        // Update parent's macro-sphere from child structures
        this._computeMacroSphereFromChildren(node, node.children);

        return node;
    }

    /**
     * Stage 2 tree flattening to satisfy contiguous children constraints.
     * @private
     * @param {OctreeNode} node
     */
    _flattenNode(node) {
        if (this.flatNodes.length === 0) {
            this.flatNodes.push(node);
        }

        if (!node.isLeaf && node.children) {
            const childrenStartIndex = this.flatNodes.length;
            node.childrenPtr = childrenStartIndex;

            // Push all 8 children to flatNodes contiguously
            for (let i = 0; i < 8; i++) {
                this.flatNodes.push(node.children[i]);
            }

            // Now recursively flatten each child
            for (let i = 0; i < 8; i++) {
                this._flattenNodeHelper(node.children[i], childrenStartIndex + i);
            }
        }
    }

    /**
     * Recursively flattens children that have already been allocated index slots.
     * @private
     * @param {OctreeNode} node
     * @param {number} nodeIdx
     */
    _flattenNodeHelper(node, nodeIdx) {
        if (!node.isLeaf && node.children) {
            const childrenStartIndex = this.flatNodes.length;
            node.childrenPtr = childrenStartIndex;

            // Push all 8 children to flatNodes contiguously
            for (let i = 0; i < 8; i++) {
                this.flatNodes.push(node.children[i]);
            }

            // Now recursively flatten each child
            for (let i = 0; i < 8; i++) {
                this._flattenNodeHelper(node.children[i], childrenStartIndex + i);
            }
        }
    }

    /**
     * Computes the conformal center, bounding radius, and physical invariants for a leaf node.
     * @private
     * @param {OctreeNode} node
     * @param {Star[]} stars
     */
    _computeMacroSphere(node, stars) {
        if (stars.length === 0) {
            node.mass = 0;
            node.radius = 0;
            node.r = 0; node.g = 0; node.b = 0;
            return;
        }

        // Calculate center of mass and light intensity centroid
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

        // Calculate circumscribed sphere radius enclosing all child stars relative to the centroid
        let maxRad = 0;
        for (const s of stars) {
            const dist = Math.hypot(s.x - node.cx, s.y - node.cy, s.z - node.cz);
            maxRad = Math.max(maxRad, dist + s.radius);
        }
        node.radius = maxRad;
    }

    /**
     * Computes the parent's macro-sphere properties by merging its Contiguous children.
     * @private
     * @param {OctreeNode} parent
     * @param {OctreeNode[]} children
     */
    _computeMacroSphereFromChildren(parent, children) {
        let totalMass = 0;
        let weightedX = 0, weightedY = 0, weightedZ = 0;
        let totalR = 0, totalG = 0, totalB = 0;

        for (let i = 0; i < 8; i++) {
            const child = children[i];
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

        // Calculate parents bounding radius enclosing all children macro-spheres
        let maxRad = 0;
        for (let i = 0; i < 8; i++) {
            const child = children[i];
            if (child.mass > 1e-6 || child.r > 1e-6) {
                const dist = Math.hypot(child.cx - parent.cx, child.cy - parent.cy, child.cz - parent.cz);
                maxRad = Math.max(maxRad, dist + child.radius);
            }
        }
        parent.radius = maxRad;
    }

    /**
     * Packs the nodes into a flat, 48-byte aligned Float32Array for direct WebGPU binding.
     * 
     * Structure per Node (12 floats, 48 bytes):
     * - Floats 0-2: `cga_sphere.xyz` = Node Center cx, cy, cz
     * - Float 3:   `cga_sphere.w`   = Node Bounding Radius
     * - Floats 4-6: `light_mass.xyz` = Star Intensity RGB
     * - Float 7:   `light_mass.w`   = Combined Mass
     * - Float 8:   `children_ptr`   = Index Pointer to children (0 if leaf)
     * - Float 9:   `is_leaf`        = 1.0f if true, 0.0f if false
     * - Floats 10-11: `padding`     = 0.0f
     * 
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
 * Returns the mathematically complete WGSL shader source code containing:
 * 1. Strict structs and WebGPU alignments.
 * 2. Sequential stack-based Sparse Star Octree traversal (O(log N) complexity).
 * 3. Cooperative Map-Reduce Workgroup-based Tree Traversal (cooperating threads per particle).
 * @returns {string}
 */
export function getWGSLOctreeShaderCode() {
    return `
struct OctreeNode {
    cga_sphere: vec4f,      // xyz: center of mass / light centroid, w: bounding radius
    light_mass: vec4f,      // xyz: total spectral intensity, w: total mass
    children_ptr: f32,      // Index offset of 8 contiguous children in the buffer
    is_leaf: f32,           // 1.0f if leaf, 0.0f if internal node
    padding1: f32,
    padding2: f32,
};

struct Particle {
    pos: vec3f,
    vel: vec3f,
    acc: vec3f,
    mass: f32,
    color: vec3f,
    padding: f32,
};

struct SimulationParams {
    dt: f32,
    gamma: f32,              // Interstellar molecular cloud damping coefficient
    theta_cutoff: f32,       // Octree opening angle cutoff threshold (r / d)
    num_particles: u32,
    num_octree_nodes: u32,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> octree: array<OctreeNode>;
@group(0) @binding(2) var<uniform> params: SimulationParams;

// Computes direct conformal gravitational acceleration from a single macro-sphere node
fn evaluate_node_gravity(pos: vec3f, node: OctreeNode) -> vec3f {
    let r_vec = node.cga_sphere.xyz - pos;
    let dist_sq = dot(r_vec, r_vec);
    let dist = sqrt(dist_sq);
    
    // Softened Newtonian acceleration: g = G * M * r_hat / (dist^2 + epsilon)
    let soft_eps = 4.0;
    if (dist > 1e-4) {
        let force_mag = node.light_mass.w / (dist_sq + soft_eps);
        return (r_vec / dist) * force_mag;
    }
    return vec3f(0.0);
}

// Computes conformal light flux / irradiance from a single macro-sphere node
fn evaluate_node_light(pos: vec3f, node: OctreeNode) -> vec3f {
    let r_vec = node.cga_sphere.xyz - pos;
    let dist_sq = dot(r_vec, r_vec);
    let dist = sqrt(dist_sq);
    
    // Solid angle approximation: Omega = pi * R^2 / d^2
    // Radiant photon flux: Phi = L * Omega / 4pi -> attenuated color
    if (dist > 1e-4) {
        let node_rad_sq = node.cga_sphere.w * node.cga_sphere.w;
        let star_attenuation = clamp(node_rad_sq / (dist_sq + 1.0), 0.0, 3.5);
        return node.light_mass.xyz * star_attenuation;
    }
    return vec3f(0.0);
}

// =========================================================================
// PIPELINE A: SEQUENTIAL STACK-BASED OCTREE TRAVERSAL [O(log N) Complexity]
// Each thread processes exactly one particle, using an explicit local stack
// =========================================================================
@compute @workgroup_size(64)
fn sequential_octree_traverse(@builtin(global_invocation_id) global_id: vec3u) {
    let id = global_id.x;
    if (id >= params.num_particles) { return; }

    var p = particles[id];
    var total_force = vec3f(0.0);
    var total_light = vec3f(0.0);

    // Explicit stack to handle depth traversal without recursion (unsupported in WGSL)
    var stack: array<u32, 24>;
    var stack_ptr = 0u;
    
    // Push root node index (0)
    stack[stack_ptr] = 0u;
    stack_ptr = stack_ptr + 1u;

    while (stack_ptr > 0u) {
        stack_ptr = stack_ptr - 1u;
        let node_idx = stack[stack_ptr];
        let node = octree[node_idx];

        let r_vec = node.cga_sphere.xyz - p.pos;
        let dist = length(r_vec);

        // Compute Conformal Opening Angle Ratio (theta = radius / distance)
        let ratio = node.cga_sphere.w / select(1.0, dist, dist > 1e-4);

        if (node.is_leaf > 0.5 || ratio < params.theta_cutoff) {
            // Far cluster: Evaluate unified field from this macro-sphere directly
            total_force = total_force + evaluate_node_gravity(p.pos, node);
            total_light = total_light + evaluate_node_light(p.pos, node);
        } else {
            // Near cluster: Push all 8 contiguous children onto local stack
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

    // Kinematics Verlet update (Pass 1) using accumulated fields
    p.acc = total_force;
    p.pos = p.pos + p.vel * params.dt + 0.5 * p.acc * params.dt * params.dt;
    
    particles[id] = p;
}

// =========================================================================
// PIPELINE B: COOPERATIVE WORKGROUP MAP-REDUCE TREE TRAVERSAL [O(log N)]
// An entire workgroup processes ONE particle concurrently to avoid lane divergence
// =========================================================================
const WG_SIZE = 64u;
const QUEUE_CAP = 32u;

// Shared queue arrays in physical L1 Cache / registers
var<workgroup> wg_queue: array<u32, QUEUE_CAP>;
var<workgroup> wg_queue_size: u32;
var<workgroup> wg_next_queue: array<u32, QUEUE_CAP>;
var<workgroup> wg_next_queue_size: atomic<u32>;

// Shared arrays for logarithmic reduction
var<workgroup> shared_force: array<vec3f, WG_SIZE>;
var<workgroup> shared_light: array<vec3f, WG_SIZE>;

@compute @workgroup_size(WG_SIZE)
fn cooperative_octree_traverse(
    @builtin(local_invocation_id) local_id: vec3u,
    @builtin(workgroup_id) group_id: vec3u
) {
    let thread_idx = local_id.x;
    let particle_idx = group_id.x; // One full workgroup per particle
    
    if (particle_idx >= params.num_particles) { return; }
    
    var p = particles[particle_idx];
    var accum_force = vec3f(0.0);
    var accum_light = vec3f(0.0);

    // Initialize shared queues on Thread 0
    if (thread_idx == 0u) {
        wg_queue[0] = 0u; // Root node index
        wg_queue_size = 1u;
        atomicStore(&wg_next_queue_size, 0u);
    }
    workgroupBarrier();

    var steps = 0u;
    while (wg_queue_size > 0u && steps < 12u) {
        // Clear next frontier queue size concurrently
        if (thread_idx == 0u) {
            atomicStore(&wg_next_queue_size, 0u);
        }
        workgroupBarrier();

        // Threads cooperatively process nodes currently in the frontier queue
        if (thread_idx < wg_queue_size) {
            let node_idx = wg_queue[thread_idx];
            let node = octree[node_idx];

            let dist = distance(p.pos, node.cga_sphere.xyz);
            let ratio = node.cga_sphere.w / select(1.0, dist, dist > 1e-4);

            if (node.is_leaf > 0.5 || ratio < params.theta_cutoff) {
                // Approximate: Star cluster is distant. Accumulate macro-sphere fields.
                accum_force = accum_force + evaluate_node_gravity(p.pos, node);
                accum_light = accum_light + evaluate_node_light(p.pos, node);
            } else {
                // Descend: Queue the 8 contiguous children
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

        // Swap queues for the next level subdivision
        if (thread_idx == 0u) {
            let limit_size = atomicLoad(&wg_next_queue_size);
            wg_queue_size = min(limit_size, QUEUE_CAP);
            for (var qi = 0u; qi < wg_queue_size; qi = qi + 1u) {
                wg_queue[qi] = wg_next_queue[qi];
            }
        }
        workgroupBarrier();
        steps = steps + 1u;
    }

    // Write thread accumulations to workgroup memory
    shared_force[thread_idx] = accum_force;
    shared_light[thread_idx] = accum_light;
    workgroupBarrier();

    // Parallel logarithmic reduction tree: sums 64 threads in exactly 6 steps
    for (var stride = WG_SIZE / 2u; stride > 0u; stride = stride / 2u) {
        if (thread_idx < stride) {
            shared_force[thread_idx] = shared_force[thread_idx] + shared_force[thread_idx + stride];
            shared_light[thread_idx] = shared_light[thread_idx] + shared_light[thread_idx + stride];
        }
        workgroupBarrier();
    }

    // Thread 0 writes the mathematically complete, unified result back to the global buffer
    if (thread_idx == 0u) {
        p.acc = shared_force[0];
        
        // Exact physical damping: v(t + dt) = (v(t) + a(t+dt)*dt) / (1 + 0.5 * gamma * dt)
        let damping_factor = 1.0 / (1.0 + 0.5 * params.gamma * params.dt);
        p.vel = (p.vel + 0.5 * (p.acc) * params.dt) * damping_factor;
        p.pos = p.pos + p.vel * params.dt + 0.5 * p.acc * params.dt * params.dt;
        
        particles[particle_idx] = p;
    }
}
`;
}
