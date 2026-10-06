/** Pre-transfer `.slice()` snapshots surviving the BOOTSTRAP buffer detach (ROADMAP §12.4). */
export interface RegistrySnapshotBuffers {
    bboxes: Int16Array;
    centroids: Int16Array;
    adjacencyPointers: Uint32Array;
    adjacencyNeighbors: Uint16Array;
}
/**
 * Main-thread facade over the Worker-resident registry (B3.c): correlates
 * `CALL`/`RESULT`/`ERROR` round-trips by monotonic `id`, refreshes snapshot
 * caches from `RESULT.snapshot` before resolving, and serves synchronous
 * `getBBox`/`getNeighbors`/`getCentroid` reads from those caches.
 */
export declare class SharedRegistryProxy {
    private readonly _worker;
    private _nextId;
    private readonly _pending;
    private _snapshot;
    /** Wires the RESULT/ERROR listener onto `worker` and seeds the snapshot caches with the pre-transfer slices. */
    constructor(worker: Worker, snapshot: RegistrySnapshotBuffers);
    /** CALL/RESULT/ERROR round-trip, keyed by a monotonic id. */
    call<T = unknown>(method: string, params?: unknown, transfer?: Transferable[]): Promise<T>;
    /** Rejects every in-flight call (lifecycle invalidation, Task 3.3). */
    rejectAll(error: Error): void;
    /** Synchronous `[minX, minY, maxX, maxY]` read for `numId`, served from the snapshot cache. */
    getBBoxByNumericId(numId: number): [number, number, number, number];
    /** Synchronous `[x, y]` centroid read for `numId`, served from the snapshot cache. */
    getCentroidByNumericId(numId: number): [number, number];
    /** Synchronous CSR adjacency read: `numId`'s neighbor numeric ids, served from the snapshot cache. */
    getNeighborIdsByNumericId(numId: number): number[];
    /** Rejects every in-flight call with `MapInvalidatedError` and detaches the Worker listener. */
    dispose(): void;
    /**
     * RESULT/ERROR correlator (an arrow field so `removeEventListener` gets
     * the same reference): settles the matching pending call, refreshing the
     * snapshot caches from `RESULT.snapshot` before resolving.
     */
    private _onMessage;
}
