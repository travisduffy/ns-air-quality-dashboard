import type { SectorData, SectorDefinitionFile, ISpatialRegistry } from '../shared/types.js';
/**
 * Two-pass spatial index over the sector bitmap: two O(W×H) passes over
 * the RGBA pixel buffer + JSON definition produces every SoA spatial buffer
 * (bboxes, centroids, CSR adjacency/contours, `pixelIndices`) plus the
 * pre-allocated border-edge buffer. Zero Three.js imports and zero DOM
 * access — constructible inside the Worker.
 */
export declare class SectorRegistry implements ISpatialRegistry {
    readonly width: number;
    readonly height: number;
    sourceBuffer: Uint8ClampedArray | null;
    readonly bboxes: Int16Array;
    readonly centroids: Int16Array;
    readonly idToHex: string[];
    readonly pixelIndices: Uint32Array;
    readonly pixelIndicesMirror: Uint16Array;
    readonly hexColors: Uint32Array;
    readonly sectorIds: Uint16Array;
    readonly idToPackedRgb: Uint32Array;
    readonly adjacencyPointers: Uint32Array;
    readonly adjacencyNeighbors: Uint16Array;
    readonly contourPointers: Uint32Array;
    readonly contourPoints: Int16Array;
    readonly borderEdges: Float32Array;
    readonly borderEdgeCount: Uint32Array;
    private readonly _hexToId;
    private readonly _sectorData;
    private readonly _pixelCounts;
    /**
     * Runs the two O(W×H) passes: assigns dense numeric IDs in definition
     * order, builds every SoA buffer in one pass plus post-scan finalization,
     * disposes `sourceBuffer` (PR-1), and warns on definition/bitmap
     * mismatches (zero-pixel sectors, bitmap-only colors).
     */
    constructor(buffer: Uint8ClampedArray, width: number, height: number, definition: SectorDefinitionFile, ignoredColors?: ReadonlySet<string>);
    /**
     * Returns the hex key of the sector at pixel (pixelX, pixelY), or '000000' for void pixels.
     * Reads `pixelIndicesMirror` (not `pixelIndices`) — the mirror is a lossless Uint16 downcast
     * (sector IDs never exceed 65534) that stays Main-resident after the Epic 1 bootstrap
     * transfer detaches `pixelIndices`'s backing buffer (F-3.3).
     */
    getSectorAt(pixelX: number, pixelY: number): string;
    /** Returns SectorData for the given hex key, or undefined if not in the definition. */
    getSector(hexKey: string): SectorData | undefined;
    /** Returns all hex keys from the definition (includes zero-pixel sectors). */
    getSectorKeys(): string[];
    /** Whether the given sector is in the definition and occupies at least one bitmap pixel. */
    hasSectorPixels(hexKey: string): boolean;
    /** Returns the dense numeric ID for a hex key, or undefined if not in the definition. */
    getNumericId(hexKey: string): number | undefined;
    /** Bounding box `[minX, minY, maxX, maxY]` (pixel space) for `id` (hex or numeric). Throws on an unknown sector. */
    getBBox(id: string): [number, number, number, number];
    getBBox(id: number): [number, number, number, number];
    /** Centroid `[x, y]` (rounded, pixel space) for `id` (hex or numeric). Throws on an unknown sector. */
    getCentroid(id: string): [number, number];
    getCentroid(id: number): [number, number];
    /** Adjacent sector ids for `id` — hex keys for a hex-string arg (empty array if unknown), numeric ids for a numeric arg. */
    getNeighbors(id: string): string[];
    getNeighbors(id: number): number[];
}
