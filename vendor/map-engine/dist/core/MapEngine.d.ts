import { SectorRegistry } from '../sector/SectorRegistry.js';
import { MapRenderer } from './MapRenderer.js';
import type { BBox, FitBoundsOptions, MapConfig, MapView, PickEvent, SectorData, PickResult, FrameCallback, MapModeId } from '../shared/types.js';
export declare class MapEngine {
    private _isLoaded;
    private _isDestroyed;
    private _isLoading;
    private _pendingCamera;
    private _parser;
    private readonly _events;
    private _registry;
    private _renderer;
    private _picker;
    private _frameCallbacks;
    private readonly _renderClock;
    private _tickRate;
    private _worker;
    private _loadGeneration;
    private _workerFailure;
    private _rejectAck;
    private _proxy;
    private _isRegistryInvalidated;
    private _lastBootstrapAck;
    private _mapModes;
    private _currentMapMode;
    private _areCostsReady;
    private _pool;
    private _anchorPool;
    private _borderPool;
    private readonly _borderCoalescer;
    /** Constructs the facade and spins up the Worker eagerly (before any `loadMap()`), so the bootstrap round-trip can begin the moment a map is loaded. */
    constructor();
    /** Registers `handler` for a pick event (`sectorClick`/`sectorHover`). Throws once destroyed. */
    on(event: 'sectorClick', handler: (result: PickResult) => void): void;
    on(event: 'sectorHover', handler: (result: PickResult | null) => void): void;
    on(event: 'viewChange', handler: (view: MapView) => void): void;
    /** Removes a previously registered pick-event handler; a no-op if it was never registered. Throws once destroyed. */
    off(event: 'sectorClick' | 'sectorHover' | 'viewChange', handler: Function): void;
    /** Registers a per-frame callback invoked with the frame delta on every render tick; a no-op once destroyed. */
    onFrame(callback: FrameCallback): void;
    /** Unregisters a frame callback; a no-op once destroyed or if it was never registered. */
    offFrame(callback: FrameCallback): void;
    /**
     * Resolves the sector under `point` (async — the sole sanctioned public
     * API signature break, ROADMAP §12.4). Resolves `null` before a successful
     * `loadMap()`/`BOOTSTRAP_ACK`, on a mesh-miss, or on a void/unknown pixel.
     */
    pick(point: PickEvent): Promise<PickResult | null>;
    /**
     * Sets the simulation tick rate (1–240 Hz, default 60) to be handed to the
     * Worker at bootstrap. Must be called before `loadMap()` resolves.
     */
    setTickRate(hz: number): void;
    /**
     * Loads a map: parses the bitmap + definition, builds the `SectorRegistry`,
     * uploads the index texture, and bootstraps the Worker (transferring every
     * spatial buffer). Resolves once the Worker acknowledges the bootstrap.
     * Calling it again after a successful load reloads — the previous session
     * (Worker, renderer, proxy, pools, palette, costs) is torn down and rebuilt.
     * Throws if destroyed or if a load is already in progress.
     */
    loadMap(config: MapConfig): Promise<void>;
    /**
     * Rejects all in-flight proxy calls with `MapInvalidatedError`, tears down
     * the renderer/Worker, and resolves. `destroy()` is the sync teardown
     * entry point and delegates here fire-and-forget.
     */
    dispose(): Promise<void>;
    /** Synchronous teardown entry point; delegates to `dispose()` fire-and-forget (ROADMAP §8 B3.c). */
    destroy(): void;
    /** The live `MapRenderer` for the loaded map. Throws if destroyed or before `loadMap()` resolves. */
    get renderer(): MapRenderer;
    /**
     * @deprecated Throws `MapInvalidatedError` once the bootstrap transfer has
     * detached this registry's buffers. Use `getSector`/`getSectorKeys`/
     * `getBBox`/`getCentroid`/`getNeighbors` instead.
     */
    get registry(): SectorRegistry;
    /** Returns the `SectorData` for `hexKey`, or `undefined` if unknown. Throws if destroyed or not loaded. */
    getSector(hexKey: string): SectorData | undefined;
    /** Returns every known sector hex key. Throws if destroyed or not loaded. */
    getSectorKeys(): string[];
    getSectorId(hexKey: string): number | undefined;
    getSectorKey(id: number): string | undefined;
    /** Overrides a sector's fill color via the GPU palette LUT (O(1) write, no pixel iteration). Throws if destroyed or not loaded. */
    setSectorColor(hexKey: string, color: string): void;
    /** Restores a sector's fill color to its source-bitmap value. Throws if destroyed or not loaded. */
    resetSectorColor(hexKey: string): void;
    /**
     * Registers a named full-map palette (CA-7). `colors` is a packed-RGB
     * `Uint32Array` with one entry per sector, indexed by numeric sector ID.
     * Synchronous: throws on a duplicate `id`, a length mismatch, or before
     * `loadMap()` has resolved.
     */
    registerMapMode(id: MapModeId, colors: Uint32Array): void;
    /**
     * Activates a registered map mode (CA-7). Synchronous: throws on an
     * unknown `id` or before `loadMap()` has resolved; re-activating the
     * already-current mode is a no-op (zero uniform writes, zero submits).
     */
    setMapMode(id: MapModeId): void;
    /** Adjacent sector ids for `id` — hex keys for a hex-string arg (`undefined` if the key is unknown), numeric ids for a numeric arg. Served from the Worker proxy snapshot. Throws if destroyed or not loaded. */
    getNeighbors(id: string): string[] | undefined;
    getNeighbors(id: number): number[];
    /** Bounding box `[minX, minY, maxX, maxY]` (pixel space) for `id` (hex or numeric). Throws on an unknown sector, or if destroyed/not loaded. */
    getBBox(id: string): [number, number, number, number];
    getBBox(id: number): [number, number, number, number];
    /** Centroid `[x, y]` in bitmap pixel space for `id` (hex or numeric). Throws on an unknown sector, or if destroyed/not loaded. */
    getCentroid(id: string): [number, number];
    getCentroid(id: number): [number, number];
    /**
     * Uploads per-sector traversal costs for `findPath` (CA-4). Transfers
     * ownership of `costs.buffer` itself (the caller's actual `ArrayBuffer`,
     * never a copy) to the Worker — `costs.byteLength === 0` on Main once
     * this resolves. Replacing costs requires a fresh `Uint8Array`
     * allocation; a sub-view (non-zero `byteOffset`, or a `byteLength`
     * shorter than the backing buffer) is rejected up front so an unrelated
     * slice of the consumer's memory is never detached.
     */
    setTraversalCosts(costs: Uint8Array): Promise<void>;
    /**
     * Resolves the cost-optimal path between two sectors by numeric id
     * (CA-4), computed via A* over the CSR adjacency graph in the Worker.
     * Rejects with `CostsRequiredError` if `setTraversalCosts` has never
     * resolved, or `PathNotFoundError` if the sectors are not connected by
     * traversable edges.
     */
    findPath(startId: number, endId: number): Promise<Uint16Array>;
    /**
     * Uploads a consumer-defined sector→group mapping (CA-5). `mapping` is
     * indexed by numeric sector id; each entry is either `0xFFFF` (excluded
     * from every group) or a group id in `[0, maxGroups)`. Transfers ownership
     * of `mapping.buffer` itself (never a copy) to the Worker —
     * `mapping.byteLength === 0` on Main once this resolves. A change to
     * `maxGroups` reallocates the group-bbox ring pool.
     */
    setParentMapping(mapping: Uint16Array, maxGroups: number): Promise<void>;
    /**
     * Folds each group's member-sector bounding boxes into a single aggregate
     * bbox per group (CA-5), computed in the Worker and delivered to Main via
     * the Transferable ring pool. Rejects with `MappingRequiredError` if
     * `setParentMapping` has never resolved.
     */
    aggregateGroups(): Promise<void>;
    /**
     * Synchronous read of a group's aggregate bounding box (CA-5), served from
     * the ring pool's Main-current snapshot. Throws `MappingRequiredError` if
     * `aggregateGroups()` has never resolved, or `RangeError` if `groupId` is
     * out of range.
     */
    getGroupBBox(groupId: number): [number, number, number, number];
    /**
     * Computes a guaranteed-interior label anchor (Pole of Inaccessibility,
     * CA-8) for every sector, computed in the Worker from B1.e contour
     * segments and delivered to Main via the Transferable ring pool.
     */
    computeAnchors(): Promise<void>;
    /**
     * Synchronous read of a sector's anchor point (CA-8), served from the
     * ring pool's Main-current snapshot, in bitmap pixel-space coordinates.
     * Throws a plain `Error` if `computeAnchors()` has never resolved, or
     * `RangeError` if `sectorId` is out of range.
     */
    getAnchor(sectorId: number): [number, number];
    /**
     * Recomputes group-perimeter border segments (CA-6) from the current
     * `parentMapping`, computed in the Worker from B1.e contour segments and
     * delivered to Main via the Transferable ring pool + a managed GPU VBO.
     * Rejects with `MappingRequiredError` if `setParentMapping` has never
     * resolved. Does NOT require `aggregateGroups()` to have run.
     *
     * Concurrent calls coalesce: at most one computation is in flight and at
     * most one more is queued behind it (≤ 2 Worker computations regardless of
     * caller count); every caller coalesced into the same queued computation
     * shares its resolution (resolve together, reject together). The queued
     * computation is not given an explicit "invalidate and resnapshot" signal
     * — it doesn't need one, since it hasn't dispatched its Worker CALL yet,
     * so it naturally reads whatever `parentMapping` is current at the moment
     * it actually runs, picking up any `setParentMapping` calls made while it
     * waited. The already-in-flight computation keeps computing against the
     * mapping it captured when *it* started, per the Worker-side snapshot in
     * `borderHandlers.ts`.
     *
     * Deliberately NOT declared `async`: an `async` method always wraps its
     * return value in a *new* Promise per call, even when returning an
     * already-existing Promise — which would defeat the "coalesced callers
     * share the exact same Promise" property this method relies on. Delegating
     * to `BorderCoalescer.request()` from a plain method preserves that identity.
     */
    recomputeBorders(): Promise<void>;
    /**
     * Synchronous read of the last-resolved border segments (CA-6), as a flat
     * `[x1, y1, x2, y2, ...]` pixel-space array — a retained Main-side private
     * copy (independent of the pooled buffer bounced back to the Worker after
     * GPU upload). `null` before `recomputeBorders()` has ever resolved; a
     * zero-edge (sentinel) resolution returns `Float32Array(0)`, not `null`.
     */
    getBorderSegments(): Float32Array | null;
    /**
     * Toggles border-line visibility (CA-6) without recomputing or
     * re-uploading anything. Safe to call before `recomputeBorders()` has
     * ever resolved -- the choice is remembered and applied once borders
     * exist.
     */
    setBordersVisible(isVisible: boolean): void;
    /**
     * Projects a bitmap pixel-space coordinate to CSS screen-space coordinates
     * (canvas-relative, top-left origin), honoring the live camera pan/zoom.
     * A pure-number transform -- no Three.js type crosses this boundary (PR-4).
     */
    project(x: number, y: number): [number, number];
    getView(): MapView | null;
    setView(view: Partial<MapView>): void;
    fitBounds(bbox: BBox, options?: FitBoundsOptions): void;
    private _applyPendingCamera;
    private _throwIfCancelled;
    private _spawnWorker;
    /** Spins up the module Worker from the bundled worker entry. Called at construction and again on every `loadMap()` reload — a fresh Worker means a fresh, empty registry/graph. */
    private _createWorker;
}
