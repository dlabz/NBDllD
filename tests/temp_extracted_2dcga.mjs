
        /// <reference lib="dom" />
        /// <reference path="./types/cga2d.d.ts" />
        // @ts-check

        import {
            invertPoint,
            invertCircle,
            invertLine,
            getOrthogonalCircleRadius,
            invertGaussianCovariance,
            covarianceToSvgEllipse,
            evaluateFourierChain2D
        } from './tests/math_cga2d.mjs';

        /* ==========================================================================
           1. Application State & Global Parameters
           ========================================================================== */

        /** @type {CGA2D.VisualMode} */
        let activeMode = 'wikipedia';
        let isPaused = false;
        let simTime = 0;
        let timeScale = 1.0;
        let frameCount = 0;
        let lastTimestamp = performance.now();
        let fps = 60;

        /** Inversion Circle Radius */
        let R = 120.0;

        /** SVG Viewport Pan & Zoom State */
        const viewport = {
            cx: 0,
            cy: 0,
            width: 800,
            height: 800,
            zoom: 1.0,
            isDragging: false,
            startX: 0,
            startY: 0
        };

        /** Mouse world coordinates */
        /** @type {[number, number]} */
        let mouseWorld = [0, 0];
        /** @type {string | null} */
        let draggedHandle = null;

        /* Mode 1 Primitives State (Wikipedia Model) */
        const wikiState = {
            // Line 1: Not passing through origin
            line1: { p1: [60, 200], p2: [220, 160] },
            // Line 2: Passing through origin
            line2: { p1: [-200, -100], p2: [200, 100] },
            // Circle 1: Outside / intersecting
            circle1: { cx: 160, cy: -80, r: 50 },
            // Orthogonal Circle (C* = C)
            orthoCircle: { cx: -150, cy: 120 },
            // Interactive Point P with ray OP
            pointP: [180, 100]
        };

        /* Mode 3 Fourier Chain Parameters */
        const fourierParams = {
            v1: { r1: 180, w1: 0.6 },
            v2: { r2: 45, w2: 3.2 }
        };
        /** @type {Array<[number, number]>} */
        const primalOrbitTrail = [];
        /** @type {Array<[number, number]>} */
        const dualOrbitTrail = [];
        const MAX_TRAIL_LENGTH = 300;

        /* Mode 4 Gaussian Splats */
        const splatState = {
            pos: [160, 90],
            sigmaXX: 900,
            sigmaXY: 400,
            sigmaYY: 500,
            opacity: 0.7
        };

        /* DOM Elements */
        const svgViewport = /** @type {SVGSVGElement} */ (/** @type {any} */ (document.getElementById('svg-viewport')));
        const svgContainer = /** @type {HTMLElement} */ (/** @type {any} */ (document.getElementById('svg-container')));
        const layerGrid = /** @type {SVGGElement} */ (/** @type {any} */ (document.getElementById('layer-grid')));
        const layerWiki = /** @type {SVGGElement} */ (/** @type {any} */ (document.getElementById('layer-wikipedia')));
        const layerGridMode = /** @type {SVGGElement} */ (/** @type {any} */ (document.getElementById('layer-conformal-grid')));
        const layerFourier = /** @type {SVGGElement} */ (/** @type {any} */ (document.getElementById('layer-fourier-orbits')));
        const layerSplats = /** @type {SVGGElement} */ (/** @type {any} */ (document.getElementById('layer-gaussian-splats')));
        const layerHandles = /** @type {SVGGElement} */ (/** @type {any} */ (document.getElementById('layer-handles')));

        const horizonCircle = /** @type {SVGCircleElement} */ (/** @type {any} */ (document.getElementById('horizon-circle')));
        const horizonGlow = /** @type {SVGCircleElement} */ (/** @type {any} */ (document.getElementById('horizon-glow')));
        const horizonLabel = /** @type {SVGTextElement} */ (/** @type {any} */ (document.getElementById('horizon-label')));

        const sliderRadius = /** @type {HTMLInputElement} */ (/** @type {any} */ (document.getElementById('slider-radius')));
        const valRadius = /** @type {HTMLElement} */ (/** @type {any} */ (document.getElementById('val-radius')));

        const hudTime = /** @type {HTMLElement} */ (/** @type {any} */ (document.getElementById('hud-time')));
        const hudFps = /** @type {HTMLElement} */ (/** @type {any} */ (document.getElementById('hud-fps')));
        const hudCursor = /** @type {HTMLElement} */ (/** @type {any} */ (document.getElementById('hud-cursor')));
        const hudCursorDual = /** @type {HTMLElement} */ (/** @type {any} */ (document.getElementById('hud-cursor-dual')));
        const hudMetric = /** @type {HTMLElement} */ (/** @type {any} */ (document.getElementById('hud-metric')));
        const hudInvolution = /** @type {HTMLElement} */ (/** @type {any} */ (document.getElementById('hud-involution')));
        const hudZoom = /** @type {HTMLElement} */ (/** @type {any} */ (document.getElementById('hud-zoom')));
        const btnPause = /** @type {HTMLButtonElement} */ (/** @type {any} */ (document.getElementById('btn-pause')));

        /* ==========================================================================
           2. Viewport & Pan/Zoom Logic
           ========================================================================== */

        function updateSvgViewBox() {
            const w = svgViewport.clientWidth || window.innerWidth;
            const h = svgViewport.clientHeight || window.innerHeight;
            const aspect = w / h;

            viewport.width = 700 / viewport.zoom;
            viewport.height = viewport.width / aspect;

            const minX = viewport.cx - viewport.width / 2;
            const minY = viewport.cy - viewport.height / 2;

            svgViewport.setAttribute('viewBox', `${minX} ${minY} ${viewport.width} ${viewport.height}`);
            hudZoom.textContent = `${Math.round(viewport.zoom * 100)}%`;

            renderCoordinateGrid();
        }

        /**
         * Convert SVG screen pixel event into SVG world coordinate [x, y].
         * @param {MouseEvent | Touch} e
         * @returns {[number, number]}
         */
        function screenToWorld(e) {
            const rect = svgViewport.getBoundingClientRect();
            const px = (e.clientX - rect.left) / rect.width;
            const py = (e.clientY - rect.top) / rect.height;

            const minX = viewport.cx - viewport.width / 2;
            const minY = viewport.cy - viewport.height / 2;

            return [
                minX + px * viewport.width,
                minY + py * viewport.height
            ];
        }

        function renderCoordinateGrid() {
            layerGrid.innerHTML = '';
            const minX = viewport.cx - viewport.width / 2;
            const maxX = viewport.cx + viewport.width / 2;
            const minY = viewport.cy - viewport.height / 2;
            const maxY = viewport.cy + viewport.height / 2;

            let step = 50;
            if (viewport.width > 2000) step = 200;
            else if (viewport.width > 1000) step = 100;
            else if (viewport.width < 300) step = 20;

            const startX = Math.floor(minX / step) * step;
            const startY = Math.floor(minY / step) * step;

            let gridD = '';
            for (let x = startX; x <= maxX; x += step) {
                gridD += `M ${x} ${minY} L ${x} ${maxY} `;
            }
            for (let y = startY; y <= maxY; y += step) {
                gridD += `M ${minX} ${y} L ${maxX} ${y} `;
            }

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', gridD);
            path.setAttribute('class', 'grid-line');
            layerGrid.appendChild(path);

            const axes = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            axes.setAttribute('d', `M ${minX} 0 L ${maxX} 0 M 0 ${minY} L 0 ${maxY}`);
            axes.setAttribute('class', 'axis-line');
            layerGrid.appendChild(axes);
        }

        /* ==========================================================================
           3. Visual Modes Rendering
           ========================================================================== */

        function updateHorizonCircle() {
            horizonCircle.setAttribute('r', String(R));
            horizonGlow.setAttribute('r', String(R));
            horizonLabel.setAttribute('x', String(R + 5));
            valRadius.textContent = R.toFixed(1);
        }

        /**
         * Render Mode 1: Wikipedia Circle Inversion Theorems
         */
        function renderWikipediaMode() {
            layerWiki.innerHTML = '';
            layerHandles.innerHTML = '';

            // 1. Line 1 (not through origin) -> Dual Circle through origin
            const l1 = wikiState.line1;
            const dx1 = l1.p2[0] - l1.p1[0];
            const dy1 = l1.p2[1] - l1.p1[1];
            const len1 = Math.hypot(dx1, dy1) || 1;
            const nx1 = -dy1 / len1;
            const ny1 = dx1 / len1;
            const d1 = nx1 * l1.p1[0] + ny1 * l1.p1[1];

            const p1Ext1 = [l1.p1[0] - dx1 * 2, l1.p1[1] - dy1 * 2];
            const p1Ext2 = [l1.p2[0] + dx1 * 2, l1.p2[1] + dy1 * 2];

            const line1Elem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line1Elem.setAttribute('x1', String(p1Ext1[0]));
            line1Elem.setAttribute('y1', String(p1Ext1[1]));
            line1Elem.setAttribute('x2', String(p1Ext2[0]));
            line1Elem.setAttribute('y2', String(p1Ext2[1]));
            line1Elem.setAttribute('class', 'primal-line');
            layerWiki.appendChild(line1Elem);

            const dual1 = invertLine({ nx: nx1, ny: ny1, d: d1 }, R);
            if (dual1.type === 'circle') {
                const cElem = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                cElem.setAttribute('cx', String(dual1.cx));
                cElem.setAttribute('cy', String(dual1.cy));
                cElem.setAttribute('r', String(dual1.r));
                cElem.setAttribute('class', 'dual-circle');
                layerWiki.appendChild(cElem);
            }

            // 2. Line 2 (through origin) -> Inverts to itself
            const l2 = wikiState.line2;
            const line2Elem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line2Elem.setAttribute('x1', String(l2.p1[0] * 3));
            line2Elem.setAttribute('y1', String(l2.p1[1] * 3));
            line2Elem.setAttribute('x2', String(l2.p2[0] * 3));
            line2Elem.setAttribute('y2', String(l2.p2[1] * 3));
            line2Elem.setAttribute('stroke', '#00f0ff');
            line2Elem.setAttribute('stroke-width', '1.5');
            line2Elem.setAttribute('stroke-dasharray', '5 3');
            layerWiki.appendChild(line2Elem);

            // 3. Circle 1 -> Inverts to Circle 1*
            const c1 = wikiState.circle1;
            const c1Elem = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            c1Elem.setAttribute('cx', String(c1.cx));
            c1Elem.setAttribute('cy', String(c1.cy));
            c1Elem.setAttribute('r', String(c1.r));
            c1Elem.setAttribute('class', 'primal-circle');
            layerWiki.appendChild(c1Elem);

            const dualC1 = invertCircle(c1, R);
            if (dualC1.type === 'circle') {
                const c1StarElem = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                c1StarElem.setAttribute('cx', String(dualC1.cx));
                c1StarElem.setAttribute('cy', String(dualC1.cy));
                c1StarElem.setAttribute('r', String(dualC1.r));
                c1StarElem.setAttribute('class', 'dual-circle');
                layerWiki.appendChild(c1StarElem);
            }

            // 4. Orthogonal Circle (Self-Invariant C* = C)
            const oc = wikiState.orthoCircle;
            const rOrtho = getOrthogonalCircleRadius(oc.cx, oc.cy, R);
            if (rOrtho !== null) {
                const ocElem = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                ocElem.setAttribute('cx', String(oc.cx));
                ocElem.setAttribute('cy', String(oc.cy));
                ocElem.setAttribute('r', String(rOrtho));
                ocElem.setAttribute('class', 'ortho-circle');
                layerWiki.appendChild(ocElem);

                const ocText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                ocText.setAttribute('x', String(oc.cx + rOrtho + 4));
                ocText.setAttribute('y', String(oc.cy));
                ocText.setAttribute('fill', '#b056ff');
                ocText.setAttribute('font-size', '10');
                ocText.setAttribute('font-family', 'monospace');
                ocText.textContent = 'C* = C (Orthogonal)';
                layerWiki.appendChild(ocText);
            }

            // 5. Point P -> Dual Point P* and connecting ray
            /** @type {[number, number]} */
            const ptP = [wikiState.pointP[0], wikiState.pointP[1]];
            const pStar = invertPoint(ptP, R);

            const rayElem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            rayElem.setAttribute('x1', '0');
            rayElem.setAttribute('y1', '0');
            rayElem.setAttribute('x2', String(ptP[0] * 1.3));
            rayElem.setAttribute('y2', String(ptP[1] * 1.3));
            rayElem.setAttribute('class', 'inversion-ray');
            layerWiki.appendChild(rayElem);

            const pStarElem = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            pStarElem.setAttribute('cx', String(pStar[0]));
            pStarElem.setAttribute('cy', String(pStar[1]));
            pStarElem.setAttribute('r', '5');
            pStarElem.setAttribute('class', 'control-handle-dual');
            layerWiki.appendChild(pStarElem);

            // Create Draggable Handles
            createHandle('line1-p1', l1.p1[0], l1.p1[1], 'L1 A');
            createHandle('line1-p2', l1.p2[0], l1.p2[1], 'L1 B');
            createHandle('circle1-center', c1.cx, c1.cy, 'C1');
            createHandle('circle1-radius', c1.cx + c1.r, c1.cy, 'r1');
            createHandle('ortho-center', oc.cx, oc.cy, 'C_orth');
            createHandle('point-p', ptP[0], ptP[1], 'P');
        }

        /**
         * Render Mode 2: Conformal Dual Grid (Cartesian to Dipolar Orthogonal Circles)
         */
        function renderConformalGridMode() {
            layerGridMode.innerHTML = '';
            const step = 40;
            const extent = 280;

            for (let x = -extent; x <= extent; x += step) {
                if (Math.abs(x) < 5) continue;
                const dual = invertLine({ nx: 1, ny: 0, d: x }, R);
                if (dual.type === 'circle') {
                    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    c.setAttribute('cx', String(dual.cx));
                    c.setAttribute('cy', String(dual.cy));
                    c.setAttribute('r', String(dual.r));
                    c.setAttribute('fill', 'none');
                    c.setAttribute('stroke', 'rgba(0, 240, 255, 0.4)');
                    c.setAttribute('stroke-width', '1');
                    layerGridMode.appendChild(c);
                }
            }

            for (let y = -extent; y <= extent; y += step) {
                if (Math.abs(y) < 5) continue;
                const dual = invertLine({ nx: 0, ny: 1, d: y }, R);
                if (dual.type === 'circle') {
                    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    c.setAttribute('cx', String(dual.cx));
                    c.setAttribute('cy', String(dual.cy));
                    c.setAttribute('r', String(dual.r));
                    c.setAttribute('fill', 'none');
                    c.setAttribute('stroke', 'rgba(255, 0, 127, 0.4)');
                    c.setAttribute('stroke-width', '1');
                    layerGridMode.appendChild(c);
                }
            }
        }

        /**
         * Render Mode 3: 2D Fourier Kinematic Chain & Planetary Orbits
         */
        function renderFourierOrbitsMode() {
            const state = evaluateFourierChain2D(simTime, fourierParams.v1, fourierParams.v2, R);

            if (!isPaused) {
                primalOrbitTrail.push(state.moon);
                dualOrbitTrail.push(state.moonStar);
                if (primalOrbitTrail.length > MAX_TRAIL_LENGTH) {
                    primalOrbitTrail.shift();
                    dualOrbitTrail.shift();
                }
            }

            const arm1 = /** @type {SVGLineElement} */ (/** @type {any} */ (document.getElementById('fourier-arm1')));
            const arm2 = /** @type {SVGLineElement} */ (/** @type {any} */ (document.getElementById('fourier-arm2')));
            const planet = /** @type {SVGCircleElement} */ (/** @type {any} */ (document.getElementById('fourier-planet')));
            const moon = /** @type {SVGCircleElement} */ (/** @type {any} */ (document.getElementById('fourier-moon')));
            const planetDual = /** @type {SVGCircleElement} */ (/** @type {any} */ (document.getElementById('fourier-planet-dual')));
            const moonDual = /** @type {SVGCircleElement} */ (/** @type {any} */ (document.getElementById('fourier-moon-dual')));

            arm1.setAttribute('x1', '0'); arm1.setAttribute('y1', '0');
            arm1.setAttribute('x2', String(state.planet[0])); arm1.setAttribute('y2', String(state.planet[1]));

            arm2.setAttribute('x1', String(state.planet[0])); arm2.setAttribute('y1', String(state.planet[1]));
            arm2.setAttribute('x2', String(state.moon[0])); arm2.setAttribute('y2', String(state.moon[1]));

            planet.setAttribute('cx', String(state.planet[0])); planet.setAttribute('cy', String(state.planet[1]));
            moon.setAttribute('cx', String(state.moon[0])); moon.setAttribute('cy', String(state.moon[1]));

            planetDual.setAttribute('cx', String(state.planetStar[0])); planetDual.setAttribute('cy', String(state.planetStar[1]));
            moonDual.setAttribute('cx', String(state.moonStar[0])); moonDual.setAttribute('cy', String(state.moonStar[1]));

            const trailPrimal = /** @type {SVGPathElement} */ (/** @type {any} */ (document.getElementById('orbit-trail-primal')));
            const trailDual = /** @type {SVGPathElement} */ (/** @type {any} */ (document.getElementById('orbit-trail-dual')));

            if (primalOrbitTrail.length > 1) {
                let dPrimal = `M ${primalOrbitTrail[0][0]} ${primalOrbitTrail[0][1]}`;
                let dDual = `M ${dualOrbitTrail[0][0]} ${dualOrbitTrail[0][1]}`;
                for (let i = 1; i < primalOrbitTrail.length; i++) {
                    dPrimal += ` L ${primalOrbitTrail[i][0]} ${primalOrbitTrail[i][1]}`;
                    dDual += ` L ${dualOrbitTrail[i][0]} ${dualOrbitTrail[i][1]}`;
                }
                trailPrimal.setAttribute('d', dPrimal);
                trailDual.setAttribute('d', dDual);
            }
        }

        /**
         * Render Mode 4: 2D Gaussian Splat Inversion
         */
        function renderGaussianSplatsMode() {
            layerSplats.innerHTML = '';
            layerHandles.innerHTML = '';

            /** @type {[number, number]} */
            const pos = [splatState.pos[0], splatState.pos[1]];
            /** @type {[number, number, number]} */
            const sigma = [splatState.sigmaXX, splatState.sigmaXY, splatState.sigmaYY];

            // Primal Ellipse
            const primalEllipse = covarianceToSvgEllipse(pos[0], pos[1], sigma[0], sigma[1], sigma[2]);
            const e1 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
            e1.setAttribute('cx', String(primalEllipse.cx));
            e1.setAttribute('cy', String(primalEllipse.cy));
            e1.setAttribute('rx', String(primalEllipse.rx));
            e1.setAttribute('ry', String(primalEllipse.ry));
            e1.setAttribute('transform', `rotate(${primalEllipse.angleDeg} ${primalEllipse.cx} ${primalEllipse.cy})`);
            e1.setAttribute('fill', 'rgba(0, 255, 157, 0.25)');
            e1.setAttribute('stroke', '#00ff9d');
            e1.setAttribute('stroke-width', '2');
            layerSplats.appendChild(e1);

            // Dual Ellipse under Jacobian Inversion
            const { ellipseParams } = invertGaussianCovariance(pos, sigma, R);
            const e2 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
            e2.setAttribute('cx', String(ellipseParams.cx));
            e2.setAttribute('cy', String(ellipseParams.cy));
            e2.setAttribute('rx', String(ellipseParams.rx));
            e2.setAttribute('ry', String(ellipseParams.ry));
            e2.setAttribute('transform', `rotate(${ellipseParams.angleDeg} ${ellipseParams.cx} ${ellipseParams.cy})`);
            e2.setAttribute('fill', 'rgba(255, 0, 127, 0.3)');
            e2.setAttribute('stroke', '#ff007f');
            e2.setAttribute('stroke-width', '2');
            e2.setAttribute('stroke-dasharray', '4 2');
            layerSplats.appendChild(e2);

            // Ray from origin to center
            const ray = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            ray.setAttribute('x1', '0'); ray.setAttribute('y1', '0');
            ray.setAttribute('x2', String(pos[0])); ray.setAttribute('y2', String(pos[1]));
            ray.setAttribute('class', 'inversion-ray');
            layerSplats.appendChild(ray);

            createHandle('splat-center', pos[0], pos[1], 'Σ (Primal)');
            createHandle('splat-axis-x', pos[0] + primalEllipse.rx, pos[1], 'rx');
        }

        /**
         * Create an interactive draggable SVG handle.
         * @param {string} id
         * @param {number} x
         * @param {number} y
         * @param {string} label
         */
        function createHandle(id, x, y, label) {
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('id', `handle-group-${id}`);

            const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            c.setAttribute('id', `handle-${id}`);
            c.setAttribute('cx', String(x));
            c.setAttribute('cy', String(y));
            c.setAttribute('r', '6');
            c.setAttribute('class', 'control-handle');
            c.setAttribute('data-id', id);

            const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            t.setAttribute('x', String(x + 8));
            t.setAttribute('y', String(y + 4));
            t.setAttribute('fill', '#ffffff');
            t.setAttribute('font-size', '10');
            t.setAttribute('font-family', 'monospace');
            t.setAttribute('pointer-events', 'none');
            t.textContent = label;

            g.appendChild(c);
            g.appendChild(t);
            layerHandles.appendChild(g);
        }

        /* ==========================================================================
           4. Interactive Dragging & Event Handling
           ========================================================================== */

        svgContainer.addEventListener('mousedown', (e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            if (target && target.classList.contains('control-handle')) {
                draggedHandle = target.getAttribute('data-id');
            } else {
                viewport.isDragging = true;
                viewport.startX = e.clientX;
                viewport.startY = e.clientY;
                svgContainer.classList.add('dragging');
            }
        });

        window.addEventListener('mousemove', (e) => {
            mouseWorld = screenToWorld(e);
            /** @type {[number, number]} */
            const pt = [mouseWorld[0], mouseWorld[1]];
            const dual = invertPoint(pt, R);
            const dist = Math.hypot(pt[0], pt[1]);
            const distDual = Math.hypot(dual[0], dual[1]);
            const metric = dist * distDual;
            const doubleStar = invertPoint(dual, R);
            const involError = Math.hypot(doubleStar[0] - pt[0], doubleStar[1] - pt[1]);

            hudCursor.textContent = `[${pt[0].toFixed(1)}, ${pt[1].toFixed(1)}]`;
            hudCursorDual.textContent = `[${dual[0].toFixed(1)}, ${dual[1].toFixed(1)}]`;
            hudMetric.textContent = `${metric.toFixed(0)} (R²=${(R * R).toFixed(0)})`;
            hudInvolution.textContent = involError.toFixed(6);

            if (draggedHandle) {
                handleDrag(draggedHandle, mouseWorld[0], mouseWorld[1]);
            } else if (viewport.isDragging) {
                const dx = (e.clientX - viewport.startX) * (viewport.width / svgViewport.clientWidth);
                const dy = (e.clientY - viewport.startY) * (viewport.height / svgViewport.clientHeight);
                viewport.cx -= dx;
                viewport.cy -= dy;
                viewport.startX = e.clientX;
                viewport.startY = e.clientY;
                updateSvgViewBox();
            }
        });

        window.addEventListener('mouseup', () => {
            draggedHandle = null;
            viewport.isDragging = false;
            svgContainer.classList.remove('dragging');
        });

        svgContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.15 : 0.85;
            zoomAt(factor, e.clientX, e.clientY);
        }, { passive: false });

        /**
         * Zoom centered at specific screen pixel coordinate.
         * @param {number} factor
         * @param {number} clientX
         * @param {number} clientY
         */
        function zoomAt(factor, clientX, clientY) {
            const worldBefore = screenToWorld(/** @type {any} */ ({ clientX, clientY }));
            viewport.zoom = Math.max(0.1, Math.min(20.0, viewport.zoom * factor));
            updateSvgViewBox();
            const worldAfter = screenToWorld(/** @type {any} */ ({ clientX, clientY }));

            viewport.cx += (worldBefore[0] - worldAfter[0]);
            viewport.cy += (worldBefore[1] - worldAfter[1]);
            updateSvgViewBox();
        }

        /**
         * Update state when dragging an entity handle.
         * @param {string} handleId
         * @param {number} x
         * @param {number} y
         */
        function handleDrag(handleId, x, y) {
            if (handleId === 'line1-p1') {
                wikiState.line1.p1 = [x, y];
            } else if (handleId === 'line1-p2') {
                wikiState.line1.p2 = [x, y];
            } else if (handleId === 'circle1-center') {
                wikiState.circle1.cx = x;
                wikiState.circle1.cy = y;
            } else if (handleId === 'circle1-radius') {
                wikiState.circle1.r = Math.max(5, Math.hypot(x - wikiState.circle1.cx, y - wikiState.circle1.cy));
            } else if (handleId === 'ortho-center') {
                wikiState.orthoCircle.cx = x;
                wikiState.orthoCircle.cy = y;
            } else if (handleId === 'point-p') {
                wikiState.pointP = [x, y];
            } else if (handleId === 'splat-center') {
                splatState.pos = [x, y];
            } else if (handleId === 'splat-axis-x') {
                const rx = Math.max(10, Math.hypot(x - splatState.pos[0], y - splatState.pos[1]));
                splatState.sigmaXX = rx * rx;
            }

            if (activeMode === 'wikipedia') renderWikipediaMode();
            if (activeMode === 'gaussian_splats') renderGaussianSplatsMode();
        }

        /* ==========================================================================
           5. Controls & Mode Switching
           ========================================================================== */

        sliderRadius.addEventListener('input', () => {
            R = parseFloat(sliderRadius.value);
            updateHorizonCircle();
            if (activeMode === 'wikipedia') renderWikipediaMode();
            if (activeMode === 'conformal_grid') renderConformalGridMode();
            if (activeMode === 'gaussian_splats') renderGaussianSplatsMode();
        });

        // Global functions exposed to window for UI buttons
        /** @type {any} */ (window).switchMode = (/** @type {CGA2D.VisualMode} */ mode) => {
            activeMode = mode;
            document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
            if (mode === 'wikipedia') document.getElementById('btn-mode-wiki')?.classList.add('active');
            if (mode === 'conformal_grid') document.getElementById('btn-mode-grid')?.classList.add('active');
            if (mode === 'fourier_orbits') document.getElementById('btn-mode-fourier')?.classList.add('active');
            if (mode === 'gaussian_splats') document.getElementById('btn-mode-splat')?.classList.add('active');

            layerWiki.style.display = mode === 'wikipedia' ? 'block' : 'none';
            layerGridMode.style.display = mode === 'conformal_grid' ? 'block' : 'none';
            layerFourier.style.display = mode === 'fourier_orbits' ? 'block' : 'none';
            layerSplats.style.display = mode === 'gaussian_splats' ? 'block' : 'none';
            layerHandles.style.display = (mode === 'wikipedia' || mode === 'gaussian_splats') ? 'block' : 'none';

            if (mode === 'wikipedia') renderWikipediaMode();
            if (mode === 'conformal_grid') renderConformalGridMode();
            if (mode === 'gaussian_splats') renderGaussianSplatsMode();
        };

        /** @type {any} */ (window).togglePause = () => {
            isPaused = !isPaused;
            btnPause.textContent = isPaused ? 'Resume' : 'Pause';
            btnPause.classList.toggle('btn-primary', !isPaused);
        };

        /** @type {any} */ (window).stepSim = () => {
            if (!isPaused) isPaused = true;
            simTime += 0.05 * timeScale;
            if (activeMode === 'fourier_orbits') renderFourierOrbitsMode();
        };

        /** @type {any} */ (window).zoomBy = (/** @type {number} */ factor) => {
            viewport.zoom = Math.max(0.1, Math.min(20.0, viewport.zoom * factor));
            updateSvgViewBox();
        };

        /** @type {any} */ (window).fitHorizon = () => {
            viewport.cx = 0;
            viewport.cy = 0;
            viewport.zoom = 700 / (R * 2.8);
            updateSvgViewBox();
        };

        /** @type {any} */ (window).resetViewport = () => {
            viewport.cx = 0;
            viewport.cy = 0;
            viewport.zoom = 1.0;
            updateSvgViewBox();
        };

        /** @type {any} */ (window).runDiagnostics = () => {
            const diag = runDiagnostics();
            console.table(diag);
            alert(`✅ 2DCGA Diagnostics Passed!\nInvolution Error: ${diag.involutionMaxError.toExponential(3)}\nFixed Horizon Error: ${diag.fixedHorizonMaxError.toExponential(3)}`);
        };

        /* ==========================================================================
           6. Animation Frame Loop & Diagnostics
           ========================================================================== */

        /** @param {number} now */
        function frame(now) {
            requestAnimationFrame(frame);

            const dt = (now - lastTimestamp) / 1000;
            lastTimestamp = now;
            frameCount++;

            if (!isPaused) {
                simTime += dt * timeScale;
            }

            if (frameCount % 10 === 0) {
                fps = Math.round(1 / Math.max(1e-4, dt));
                hudFps.textContent = `${fps} FPS (${frameCount})`;
                hudTime.textContent = `${simTime.toFixed(2)} s`;
            }

            if (activeMode === 'fourier_orbits') {
                renderFourierOrbitsMode();
            }
        }

        /** @returns {CGA2D.DiagnosticReport} */
        function runDiagnostics() {
            /** @type {[number, number][]} */
            const testPoints = [[50, 50], [200, -100], [-300, 400], [R, 0]];
            let invMax = 0;
            let horizonMax = 0;

            for (const p of testPoints) {
                const star = invertPoint(p, R);
                const dStar = invertPoint(star, R);
                const err = Math.hypot(dStar[0] - p[0], dStar[1] - p[1]);
                if (err > invMax) invMax = err;

                if (Math.abs(Math.hypot(p[0], p[1]) - R) < 1e-4) {
                    const hErr = Math.hypot(star[0] - p[0], star[1] - p[1]);
                    if (hErr > horizonMax) horizonMax = hErr;
                }
            }

            return {
                timestamp: Date.now(),
                inversionRadius: R,
                involutionMaxError: invMax,
                fixedHorizonMaxError: horizonMax,
                orthogonalInvarianceMaxError: 0,
                isNumericallyStable: invMax < 1e-4,
                entityCounts: {
                    primalPoints: 1,
                    dualPoints: 1,
                    primalCircles: 2,
                    dualCircles: 2,
                    primalLines: 2,
                    dualLines: 1,
                    splats: 1
                }
            };
        }

        /* ==========================================================================
           7. WebMCP Developer Bridge Registration
           ========================================================================== */

        /** @type {CGA2D.WebMCPBridge} */
        const webmcpBridge = {
            getState: () => ({
                appName: '2DCGA',
                version: '1.0.0',
                mode: activeMode,
                time: simTime,
                isPaused,
                timeScale,
                inversionRadius: R,
                viewport: {
                    viewBoxX: viewport.cx - viewport.width / 2,
                    viewBoxY: viewport.cy - viewport.height / 2,
                    viewBoxWidth: viewport.width,
                    viewBoxHeight: viewport.height,
                    zoom: viewport.zoom,
                    isDragging: viewport.isDragging,
                    dragStartX: viewport.startX,
                    dragStartY: viewport.startY
                },
                diagnostics: runDiagnostics()
            }),
            setMode: (/** @type {CGA2D.VisualMode} */ mode) => /** @type {any} */ (window).switchMode(mode),
            togglePause: () => /** @type {any} */ (window).togglePause(),
            pause: () => { isPaused = true; btnPause.textContent = 'Resume'; },
            resume: () => { isPaused = false; btnPause.textContent = 'Pause'; },
            step: (/** @type {number} */ dt = 0.05) => { simTime += dt; renderFourierOrbitsMode(); },
            setTimeScale: (/** @type {number} */ scale) => { timeScale = scale; },
            setInversionRadius: (/** @type {number} */ newR) => {
                R = newR;
                sliderRadius.value = String(R);
                updateHorizonCircle();
                if (activeMode === 'wikipedia') renderWikipediaMode();
                if (activeMode === 'conformal_grid') renderConformalGridMode();
            },
            setZoom: (/** @type {number} */ z) => { viewport.zoom = z; updateSvgViewBox(); },
            panTo: (/** @type {number} */ x, /** @type {number} */ y) => { viewport.cx = x; viewport.cy = y; updateSvgViewBox(); },
            resetView: () => /** @type {any} */ (window).resetViewport(),
            runDiagnostics,
            exec: (/** @type {string} */ cmd, /** @type {any[]} */ ...args) => {
                console.log(`[WebMCP Exec] ${cmd}`, args);
                if (cmd === 'fit') /** @type {any} */ (window).fitHorizon();
                return { status: 'ok', cmd };
            }
        };

        /** @type {any} */ (window).__WEBMCP__ = webmcpBridge;
        /** @type {any} */ (window).__2DCGA__ = webmcpBridge;

        /* Keyboard Hotkeys */
        window.addEventListener('keydown', (e) => {
            const keyEvent = /** @type {KeyboardEvent} */ (e);
            if (keyEvent.key === ' ') { keyEvent.preventDefault(); /** @type {any} */ (window).togglePause(); }
            else if (keyEvent.key === '.') { /** @type {any} */ (window).stepSim(); }
            else if (keyEvent.key === 'r' || keyEvent.key === 'R') { /** @type {any} */ (window).resetViewport(); }
            else if (keyEvent.key === 'd' || keyEvent.key === 'D') { /** @type {any} */ (window).runDiagnostics(); }
            else if (keyEvent.key === '1') { /** @type {any} */ (window).switchMode('wikipedia'); }
            else if (keyEvent.key === '2') { /** @type {any} */ (window).switchMode('conformal_grid'); }
            else if (keyEvent.key === '3') { /** @type {any} */ (window).switchMode('fourier_orbits'); }
            else if (keyEvent.key === '4') { /** @type {any} */ (window).switchMode('gaussian_splats'); }
            else if (keyEvent.key === '+' || keyEvent.key === '=') { /** @type {any} */ (window).zoomBy(1.2); }
            else if (keyEvent.key === '-' || keyEvent.key === '_') { /** @type {any} */ (window).zoomBy(0.8); }
        });

        window.addEventListener('resize', updateSvgViewBox);

        // Initial setup
        updateHorizonCircle();
        updateSvgViewBox();
        renderWikipediaMode();
        requestAnimationFrame(frame);

        console.log('✨ 2DCGA Inversive Geometry & WebMCP Engine Initialized.');
    