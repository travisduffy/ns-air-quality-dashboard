import * as THREE from 'three';
import type { IThreeRenderBackend, ThreeRenderBackendInternalAccess } from './IThreeRenderBackend.js';
/**
 * Real WebGL2 `IThreeRenderBackend`: a GLSL3 `RawShaderMaterial`
 * fragment-LUT shader samples an R32UI index texture (one sector ID per
 * map pixel) and looks each fragment's color up in an RGBA8 palette
 * texture, so recolors are LUT writes — never a per-pixel CPU pass. Also
 * owns the managed border VBO (CA-6) and the context-loss recovery hooks
 * (F-3.3/F-4.10).
 */
export declare class ThreeRenderBackend implements IThreeRenderBackend, ThreeRenderBackendInternalAccess {
    /** The orthographic camera, framed to the constructor's frustum half-dimensions. */
    readonly camera: THREE.OrthographicCamera;
    /** The scene containing the map plane mesh. */
    readonly scene: THREE.Scene;
    /** The full-map plane mesh (`PlaneGeometry(mapWidth, mapHeight)` centered at the world origin) — the picking pipeline's raycast target. */
    readonly mesh: THREE.Mesh;
    /** The fragment-LUT `RawShaderMaterial` (exposed for shader-level tests). */
    readonly material: THREE.RawShaderMaterial;
    private readonly _renderer;
    private readonly _indexTextureWidth;
    private readonly _indexTextureHeight;
    private readonly _indexTexture;
    private readonly _paletteTexture;
    private readonly _paletteData;
    private readonly _sectorCount;
    /** Retained for the picking pipeline (Epic 3 Task 3.4). */
    private readonly _pixelIndicesSnapshot;
    /**
     * Managed GPU VBO for `BorderRenderer`'s `GLBufferAttribute` (CA-6, F-C.9).
     * Allocated at construction/first upload, sized to the fixed max capacity
     * (the caller's buffer length never changes across calls). Destroyed on
     * context loss (`webglcontextlost` nulls this out below) so the next
     * `uploadBorderEdges` reallocates via `gl.bufferData` (F-4.10) instead of
     * writing into a stale handle with `gl.bufferSubData`.
     */
    private _borderVBO;
    /**
     * Acquires the WebGL2 context (throws `WebGL2NotSupportedError` if
     * unavailable), snapshots `pixelIndices` to back the index texture and the
     * picking readback, builds the palette texture from `initialPalette`
     * (wrapping into a 2D layout when `sectorCount` exceeds
     * `MAX_TEXTURE_SIZE`, F-3.4), assembles the shader/mesh/scene/camera, and
     * wires the `webglcontextlost` VBO-drop listener.
     */
    constructor(canvas: HTMLCanvasElement, frustumHalfW: number, frustumHalfH: number, mapWidth: number, mapHeight: number, pixelIndices: Uint32Array, sectorCount: number, initialPalette: Uint32Array);
    /** O(1) — patches one LUT entry and flags the (small) palette texture dirty. */
    writePaletteEntry(numId: number, r: number, g: number, b: number): void;
    /** Applies a `{ palette: Uint32Array }` full-palette replace via `_writePaletteUniform`; ignores everything else. */
    updateUniforms(uniforms: Record<string, unknown>): void;
    /** Overwrites the index texture's CPU backing store from the Uint16Array mirror and flags it for re-upload (F-3.3 context-loss recovery). */
    reuploadIndexTexture(mirror: Uint16Array): void;
    /** The live R32UI index `DataTexture` (Epic 4 palette shader). */
    getIndexTexture(): THREE.Texture | null;
    /**
     * Copies `4*count` floats into the managed GPU VBO via `gl.bufferSubData`.
     * `buffer` is always the fixed-max-capacity pooled array (only the leading
     * `count*4` floats are meaningful — `BorderRenderer`'s draw range clips
     * the rest); the VBO is sized once to that same capacity so steady-state
     * uploads never need `gl.bufferData` again, except immediately after a
     * context loss (see the `webglcontextlost` listener above), which is
     * exactly when `_borderVBO` is `null` here.
     */
    uploadBorderEdges(buffer: Float32Array, count: number): void;
    /** The managed border `WebGLBuffer`; `null` before the first `uploadBorderEdges` call and immediately after a context loss. */
    getBorderVBO(): WebGLBuffer | null;
    /** Submits one render of `scene` through `camera` to the `WebGLRenderer`. */
    render(scene: THREE.Scene, camera: THREE.Camera): void;
    /** Resizes the drawing buffer to the given CSS-pixel dimensions (without touching the canvas's CSS size). */
    setSize(width: number, height: number): void;
    /** The backend's scene as a concrete `THREE.Scene`. */
    getThreeScene(): THREE.Scene;
    /** The live `THREE.WebGLRenderer`. */
    getThreeRenderer(): THREE.WebGLRenderer;
    /**
     * `x`/`y` are bitmap/texture pixel coordinates (0..width-1 / 0..height-1).
     * Sourced from the retained `pixelIndices` snapshot — cheaper than a GPU
     * framebuffer readback and equally authoritative (PR-3, Epic 3 Task 3.4).
     */
    readSectorIdAt(x: number, y: number): number;
    /** Releases the renderer, plane geometry, shader material, and both textures. */
    dispose(): void;
    /** Single write path for a full-palette replace (`registerMapMode`/`setMapMode`, Epic 4 CA-7): repacks each 24-bit RGB entry into the LUT backing store and flags the palette texture dirty. */
    private _writePaletteUniform;
}
