import type { OrthographicCamera, Scene, Mesh } from 'three';
import type { IThreeRenderBackend, ThreeRenderBackendInternalAccess } from '../render/IThreeRenderBackend.js';
import type { SectorRegistry } from '../sector/SectorRegistry.js';
import type { MapView, PickEvent } from '../shared/types.js';
/**
 * Three.js scene orchestration for a loaded map: orthographic "contain"
 * camera framing, dirty-flag render gating inside the rAF loop, in-loop
 * canvas resize handling, and pan/zoom application. Delegates all GPU work
 * to the injected `IThreeRenderBackend` and all DOM event listeners to
 * `InputController`. Main-thread only.
 */
export declare class MapRenderer {
    /** The backend-owned `THREE.Scene` holding the map plane mesh (and, lazily, the border `LineSegments`). */
    readonly scene: Scene;
    /** The backend-owned orthographic camera; pan/zoom mutate its `position`/`zoom` directly. */
    readonly camera: OrthographicCamera;
    /** The backend-owned full-map plane mesh — the raycast target for the picking pipeline. */
    readonly mesh: Mesh;
    private readonly _backend;
    protected readonly _canvas: HTMLCanvasElement;
    protected readonly _registry: SectorRegistry;
    protected _frustumHalfW: number;
    protected _frustumHalfH: number;
    private _animFrameId;
    private readonly _worldUnitsPerPixel;
    private _currentW;
    private _currentH;
    private readonly _input;
    private _borderRenderer;
    /**
     * The `WebGLBuffer` `_borderRenderer`'s `GLBufferAttribute` currently
     * wraps. Context loss destroys the GPU buffer; `uploadBorderEdges`
     * reallocates a brand-new `WebGLBuffer` object on the next call after
     * restore (F-4.10), but an already-constructed `BorderRenderer`'s
     * attribute still references the old, now-invalid one. Comparing against
     * `_backend.getBorderVBO()` on every receipt is what detects this and
     * triggers a rebuild in `_receiveBorderEdges` below -- without it, three.js
     * throws deep inside its own shader/program binding path when it tries to
     * bind the stale buffer on the next render.
     */
    private _borderRendererVBO;
    /**
     * Retained Main-side private copy backing `getBorderSegments()` (CA-6) --
     * independent of the pooled buffer bounced back to the Worker after GPU
     * upload, and independent of `BorderRenderer`'s own (lazy, non-empty-only)
     * construction. Also the source for the context-restore re-upload below.
     * `null` before the first `recomputeBorders` resolution.
     */
    private _borderSegments;
    /**
     * Desired visibility, applied to `_borderRenderer.lineSegments.visible`.
     * Persisted independently of `_borderRenderer`'s own lifecycle (lazy
     * construction, rebuild-on-context-restore) so a hide/show choice made
     * before borders exist yet, or across a rebuild, isn't lost.
     */
    private _areBordersVisible;
    private _isDestroyed;
    _onViewChange: ((view: MapView) => void) | null;
    private _lastView;
    private _fitTarget;
    /**
     * Computes the "contain" camera framing, builds (or accepts an injected)
     * backend, wires `webglcontextrestored` recovery and the
     * `InputController`, and starts the rAF render loop. Throws if the canvas
     * has zero CSS dimensions (the framing math would divide by zero).
     */
    constructor(canvas: HTMLCanvasElement, registry: SectorRegistry, preRenderHook?: () => void, onPointerMove?: (e: PickEvent) => void, onClick?: (e: PickEvent) => void, _backend?: IThreeRenderBackend & ThreeRenderBackendInternalAccess);
    /** Clamps the camera position to the map extents plus a 10% margin on each axis. */
    clampPan(): void;
    _getView(): MapView;
    /**
     * Projects a bitmap pixel-space coordinate `(x, y)` (pixel center) to CSS
     * screen-space coordinates relative to the canvas's top-left corner,
     * honoring the live camera pan/zoom (CA-8). This is the exact inverse of
     * `MapEngine._resolvePixelCoords`'s screen→pixel raycast, expressed as a
     * closed-form transform since the camera is orthographic — 1 world unit
     * equals 1 bitmap pixel, and the map plane is centered at the world
     * origin (`ThreeRenderBackend`'s `PlaneGeometry(mapWidth, mapHeight)`).
     * All inputs are read live so panning/zooming/resizing between calls is
     * always reflected.
     */
    project(x: number, y: number): [number, number];
    /** True while the middle (pan) button is held down (delegates to `InputController`). */
    get isPanning(): boolean;
    /** True while a held left button has moved past the drag dead zone and the drag is still active (delegates to `InputController`). */
    get isLeftDragging(): boolean;
    /** True once the current/most recent left-button press has moved past the drag dead zone; reset on the next left press. Frozen public name (R10). */
    get leftHasDragged(): boolean;
    /**
     * O(1) LUT-entry patch (Epic 4 B2) — no bbox/dirty-rect batching needed;
     * the dirty flag is set directly at the point of mutation. Warns and
     * no-ops if the sector has no pixel data.
     */
    setSectorColor(hexKey: string, color: string): void;
    /** Restores a sector's palette LUT entry to its source-bitmap packed RGB. Warns and no-ops if the sector has no pixel data. */
    resetSectorColor(hexKey: string): void;
    /** Replaces the entire palette LUT (Epic 4 CA-7 `registerMapMode`/`setMapMode`). */
    setPalette(colors: Uint32Array): void;
    /**
     * Receives a `recomputeBorders` (CA-6) resolution -- called by
     * `MapEngine`'s `TransferableBorderPool` on every Worker handoff,
     * including the zero-edge sentinel, and re-invoked directly (with the
     * retained copy) on `webglcontextrestored` (F-4.10). Order matters here
     * (the receipt-flow contract): GPU upload, then retain the private copy,
     * then mark dirty. None of this depends on `BorderRenderer`'s own
     * construction, since the GPU VBO is backend-owned independent of the
     * scene object.
     */
    _receiveBorderEdges(edges: Float32Array, count: number): void;
    /** Sync read of the retained border-segment copy (CA-6); `null` before the first resolution. */
    getBorderSegments(): Float32Array | null;
    /**
     * Toggles border-line visibility without recomputing or re-uploading
     * anything -- a plain `Object3D.visible` flip on the already-built scene
     * object. Safe to call before any border has ever been computed (the
     * choice is remembered via `_areBordersVisible` and applied whenever
     * `BorderRenderer` is next lazily constructed or rebuilt).
     */
    setBordersVisible(isVisible: boolean): void;
    /** Idempotent teardown: cancels the rAF loop, clears both hooks, destroys the `InputController`, and disposes the `BorderRenderer` and backend. */
    destroy(): void;
    /**
     * Per-frame rAF callback: re-schedules itself, runs `_preRenderHook`
     * unconditionally, handles canvas resize — size is checked at the top of
     * every frame (the webgl2fundamentals pattern), rescaling the frustum by
     * `_worldUnitsPerPixel` — and renders only when `_isDirty`, firing
     * `_postRenderHook` after an actual render.
     */
    private readonly _loop;
    /** Converts a CSS-pixel pointer delta to world units (frustum-scaled, zoom-compensated), moves the camera, then clamps the pan. */
    private _applyPan;
    /** Applies a zoom factor clamped to [0.5, 20], anchored at `ndcPoint` (the world point under the cursor stays fixed), then clamps the pan. */
    private _applyZoom;
}
