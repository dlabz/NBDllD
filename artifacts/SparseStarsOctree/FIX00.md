There are **three critical bugs** in the JS file and HTML script causing the zero calculations, flat-line performance metrics, and improper tree traversal:

### Bug 1: Octree Layout Array Mutation in JS (`_subdivide`)

During octree construction, popping array elements in the child iteration loop corrupts child indices and layout when child octants subdivide recursively.

```javascript
// BEFORE (BROKEN)
for (let i = 0; i < 8; i++) {
    const childIdx = this._subdivide(childOctants[i], childCx, childCy, childCz, h, depth + 1);
    this.flatNodes[childrenStartIndex + i] = this.flatNodes[childIdx];
    this.flatNodes.pop(); // <-- DELETES valid nodes generated in recursive subtree!
}

```

**Fix:** Return the contiguous child start offset directly instead of mutating `flatNodes` with `.pop()`.

```javascript
// FIXED
_subdivide(nodeStars, cx, cy, cz, halfSize, depth) {
    const nodeIdx = this.flatNodes.length;
    
    /** @type {OctreeNode} */
    const node = {
        cx, cy, cz,
        radius: halfSize * Math.sqrt(3),
        mass: 0, r: 0, g: 0, b: 0,
        childrenPtr: 0,
        isLeaf: true
    };
    this.flatNodes.push(node);

    if (nodeStars.length <= this.maxStarsPerLeaf || depth >= this.maxDepth) {
        this._computeMacroSphere(node, nodeStars);
        return nodeIdx;
    }

    node.isLeaf = false;
    /** @type {Star[][]} */
    const childOctants = Array.from({ length: 8 }, () => []);

    for (const s of nodeStars) {
        const ix = s.x >= cx ? 1 : 0;
        const iy = s.y >= cy ? 1 : 0;
        const iz = s.z >= cz ? 1 : 0;
        childOctants[ix | (iy << 1) | (iz << 2)].push(s);
    }

    // Allocate 8 contiguous slots for children
    const childrenStartIndex = this.flatNodes.length;
    node.childrenPtr = childrenStartIndex;

    for (let i = 0; i < 8; i++) {
        this.flatNodes.push(/** @type {any} */({}));
    }

    // Recursively build children in-place
    for (let i = 0; i < 8; i++) {
        const h = halfSize * 0.5;
        const childCx = cx + ((i & 1) ? h : -h);
        const childCy = cy + ((i & 2) ? h : -h);
        const childCz = cz + ((i & 4) ? h : -h);

        this._subdivideInPlace(childOctants[i], childCx, childCy, childCz, h, depth + 1, childrenStartIndex + i);
    }

    this._computeMacroSphereFromChildren(node, childrenStartIndex);
    return nodeIdx;
}

_subdivideInPlace(nodeStars, cx, cy, cz, halfSize, depth, slotIndex) {
    const node = {
        cx, cy, cz,
        radius: halfSize * Math.sqrt(3),
        mass: 0, r: 0, g: 0, b: 0,
        childrenPtr: 0,
        isLeaf: true
    };
    this.flatNodes[slotIndex] = node;

    if (nodeStars.length <= this.maxStarsPerLeaf || depth >= this.maxDepth) {
        this._computeMacroSphere(node, nodeStars);
        return;
    }

    node.isLeaf = false;
    const childOctants = Array.from({ length: 8 }, () => []);

    for (const s of nodeStars) {
        const ix = s.x >= cx ? 1 : 0;
        const iy = s.y >= cy ? 1 : 0;
        const iz = s.z >= cz ? 1 : 0;
        childOctants[ix | (iy << 1) | (iz << 2)].push(s);
    }

    const childrenStartIndex = this.flatNodes.length;
    node.childrenPtr = childrenStartIndex;

    for (let i = 0; i < 8; i++) {
        this.flatNodes.push(/** @type {any} */({}));
    }

    for (let i = 0; i < 8; i++) {
        const h = halfSize * 0.5;
        const childCx = cx + ((i & 1) ? h : -h);
        const childCy = cy + ((i & 2) ? h : -h);
        const childCz = cz + ((i & 4) ? h : -h);

        this._subdivideInPlace(childOctants[i], childCx, childCy, childCz, h, depth + 1, childrenStartIndex + i);
    }

    this._computeMacroSphereFromChildren(node, childrenStartIndex);
}

```

---

### Bug 2: Missing Initializer & Guard in Traversal Loop

In `fnAccumulateSSO`, `flatNodes` indexing throws an undefined access on empty leaf nodes, preventing completion.

```javascript
// FIXED
function fnAccumulateSSO(p, node, flatNodes) {
    if (!node) return;
    ssoCalcsCount++;
    
    const dx = node.cx - p.x;
    const dy = node.cy - p.y;
    const dz = node.cz - p.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    const dist = Math.sqrt(distSq);

    const ratio = node.radius / (dist > 1e-4 ? dist : 1.0);

    if (node.isLeaf || ratio < thetaCutoff) {
        if (node.mass > 0) {
            const soft_eps = 4.0;
            const denom = distSq + soft_eps;
            if (dist > 1e-4) {
                const force = node.mass / denom;
                p.ax += (dx / dist) * force;
                p.ay += (dy / dist) * force;
                p.az += (dz / dist) * force;
            }
        }
    } else {
        const basePtr = node.childrenPtr;
        for (let i = 0; i < 8; i++) {
            const child = flatNodes[basePtr + i];
            if (child && (child.mass > 0 || child.r > 0)) {
                fnAccumulateSSO(p, child, flatNodes);
            }
        }
    }
}

```

---

### Bug 3: Parity Drift Reference Calculations

In `tick()`, parity drift was calculated using an uninitialized reference force vector. Update the drift computation logic:

```javascript
// FIXED
if (flatNodes.length > 0 && particles.length > 0) {
    const sampleP = particles[0];
    let trueAx = 0, trueAy = 0, trueAz = 0;

    for (const s of stars) {
        const dx = s.x - sampleP.x;
        const dy = s.y - sampleP.y;
        const dz = s.z - sampleP.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const dist = Math.sqrt(distSq);
        if (dist > 1e-4) {
            const force = s.mass / (distSq + 4.0);
            trueAx += (dx / dist) * force;
            trueAy += (dy / dist) * force;
            trueAz += (dz / dist) * force;
        }
    }

    const diff = Math.hypot(sampleP.ax - trueAx, sampleP.ay - trueAy, sampleP.az - trueAz);
    const trueMag = Math.hypot(trueAx, trueAy, trueAz) + 1e-6;
    const drift = (diff / trueMag) * 100;
    
    document.getElementById('hud-field-drift').textContent = `${drift.toFixed(4)}%`;
}

```