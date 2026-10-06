import * as THREE from 'three';
import type { IThreeRenderBackend, ThreeRenderBackendInternalAccess } from './IThreeRenderBackend.js';
/**
 * No-op test double for logic tests that don't need a real GPU context.
 * Records palette writes for assertions, serves `readSectorIdAt` from an
 * optional CPU-side index copy, and stubs every GPU-touching method.
 */
export declare class NullRenderBackend implements IThreeRenderBackend, ThreeRenderBackendInternalAccess {
    /** A real (but never-rendered) orthographic camera, so pan/zoom logic under test behaves normally. */
    readonly camera: THREE.OrthographicCamera;
    /** A real (but never-rendered) scene, so scene add/remove logic under test behaves normally. */
    readonly scene: THREE.Scene;
    /** An empty placeholder mesh standing in for the map plane. */
    readonly mesh: THREE.Mesh;
    private readonly _pixelIndices;
    private readonly _indexWidth;
    private readonly _indexHeight;
    private _lastPalette;
    private readonly _entryColors;
    /**
     * Builds the placeholder camera/scene/mesh; an optional `pixelIndices`
     * copy (defensively sliced) plus dimensions back `readSectorIdAt` lookups.
     */
    constructor(pixelIndices?: Uint32Array, width?: number, height?: number);
    /** Records the per-entry patch in `_entryColors` (no GPU write). */
    writePaletteEntry(numId: number, r: number, g: number, b: number): void;
    /** Retains a copy of a `{ palette: Uint32Array }` full-palette replace; ignores everything else. */
    updateUniforms(uniforms: Record<string, unknown>): void;
    /** No-op — this backend has no GPU border VBO. */
    uploadBorderEdges(_buffer: Float32Array, _count: number): void;
    /** Always `null` — this backend has no GPU border VBO. */
    getBorderVBO(): WebGLBuffer | null;
    /** No-op — nothing is ever rendered. */
    render(_scene: THREE.Scene, _camera: THREE.Camera): void;
    /** No-op — there is no drawing buffer to resize. */
    setSize(_width: number, _height: number): void;
    /** Returns the placeholder scene. */
    getThreeScene(): THREE.Scene;
    /** Always throws — this backend has no `WebGLRenderer`. */
    getThreeRenderer(): THREE.WebGLRenderer;
    /** Serves the numeric sector ID from the CPU-side index copy; the `0xffff` void sentinel when out of bounds or no copy was supplied. */
    readSectorIdAt(x: number, y: number): number;
    /** No-op — this backend has no GPU index texture to recover. */
    reuploadIndexTexture(_mirror: Uint16Array): void;
    /** Always `null` — this backend has no GPU index texture. */
    getIndexTexture(): THREE.Texture | null;
    /** No-op — nothing GPU-resident to release. */
    dispose(): void;
}
