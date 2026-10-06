import * as THREE from 'three';
import type { ThreeRenderBackendInternalAccess } from './IThreeRenderBackend.js';
/**
 * Renders group-perimeter border segments (CA-6) as a single
 * `THREE.LineSegments` bound to the backend's managed GPU VBO (F-C.9) via a
 * `GLBufferAttribute` -- never the Transferable's CPU array, which is
 * bounced back to the Worker after upload. Lazily constructed by
 * `MapRenderer._receiveBorderEdges` on the first non-empty `recomputeBorders`
 * resolution; disposed alongside `loadMap()`/`dispose()`.
 *
 * `borderEdges` segments are raw pixel coordinates (origin top-left,
 * Y-down); the map mesh is a `PlaneGeometry(mapWidth, mapHeight)` centered
 * at the world origin (Y-up). Scaling by `(1, -1, 1)` then translating by
 * `(-width/2, height/2)` reproduces the same pixel->world mapping as
 * `MapRenderer.project`'s closed-form inverse (`worldX = px - w/2`,
 * `worldY = h/2 - py`) -- three.js applies an `Object3D`'s scale before its
 * position, so this order matters. A small +Z offset keeps the lines from
 * z-fighting against the sector-color plane mesh, which sits at z=0.
 */
export declare class BorderRenderer {
    /** Renderable border geometry: a single `LineSegments` bound to the backend's managed GPU VBO. Add to a `THREE.Scene` to display group perimeters. */
    readonly lineSegments: THREE.LineSegments;
    private readonly _geometry;
    private readonly _material;
    private readonly _positionAttribute;
    /**
     * Builds the `LineSegments` over the backend's border VBO and positions it
     * in world space. Throws if the backend has no border VBO — call
     * `uploadBorderEdges()` before constructing.
     */
    constructor(backend: ThreeRenderBackendInternalAccess, mapWidth: number, mapHeight: number);
    /**
     * Updates the draw range to the latest resolved segment count (2 vertices
     * per segment). The `GLBufferAttribute`'s own `count` also gates
     * rendering in three.js -- kept in sync with the draw range here.
     */
    setDrawCount(count: number): void;
    /** Releases the geometry and material. Call when the owning renderer tears down (`loadMap()` / `dispose()`). */
    dispose(): void;
}
