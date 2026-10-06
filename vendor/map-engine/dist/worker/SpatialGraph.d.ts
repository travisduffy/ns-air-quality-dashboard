/**
 * Worker-resident A* over the CSR adjacency graph (CA-4). Zero DOM/Three.js
 * imports -- constructible inside the Worker from BOOTSTRAP-transferred
 * buffers (`adjacencyPointers`/`adjacencyNeighbors`/`centroids`) plus
 * consumer-supplied `traversalCosts`.
 *
 * All per-search scratch (`gScore`/`cameFrom`/`visited`/the open-set heap)
 * is preallocated once at construction and reset in place on each
 * `findPath()` call -- zero per-node object allocation during expansion
 * (PR-3). The open set is a binary heap over two parallel typed arrays
 * (node ids + f-scores); since a plain binary heap has no O(log n)
 * decrease-key, an improved node is pushed again rather than updated in
 * place (lazy decrease-key) -- the heap is sized to the total directed edge
 * count plus one, an exact upper bound on the number of pushes a single
 * search can perform. Stale duplicate entries are skipped via the
 * `visited` (closed-set) check on pop.
 *
 * Tie-break (explicit, since raw heap ordering is not stable): lower node
 * id wins on equal f-score.
 *
 * Cost semantics (normative, shared with the `grid-10k.json` fixture
 * generator): the cost of traversing edge a -> b is `traversalCosts[b]`
 * (the cost of entering b); a path's total cost is the sum over every node
 * entered, the start node's own cost excluded.
 */
export declare class SpatialGraph {
    private readonly _adjacencyPointers;
    private readonly _adjacencyNeighbors;
    private readonly _traversalCosts;
    private readonly _centroids;
    private readonly _sectorCount;
    /** Heuristic multiplier: `minEdgeCost / maxAdjacentCentroidDistance`, computed once at build time (§ below). */
    private readonly _heuristicMultiplier;
    private readonly _gScore;
    private readonly _cameFrom;
    private readonly _visited;
    private readonly _heapNode;
    private readonly _heapScore;
    private _heapSize;
    /**
     * Preallocates all per-search scratch (gScore/cameFrom/visited/heap) sized
     * from the CSR buffers and computes the admissible heuristic multiplier
     * once -- no allocation happens during `findPath` afterwards.
     */
    constructor(adjacencyPointers: Uint32Array, adjacencyNeighbors: Uint16Array, traversalCosts: Uint8Array, centroids: Int16Array);
    /**
     * A* search from `start` to `end`, cost-optimal and yielding cooperatively
     * (`yieldIfNeeded`, <= 8 ms slices) during expansion. Resolves with an
     * ordered `Uint16Array` (`path[0] === start`, `path[path.length-1] ===
     * end`). Rejects with `PathNotFoundError` when the open set empties
     * before `end` is reached (graph-disconnected).
     */
    findPath(start: number, end: number): Promise<Uint16Array>;
    /**
     * `h(n) = euclideanDistance(centroid(n), centroid(goal)) * multiplier` --
     * multiply, never divide (dividing by cost would divide-by-zero if a 0
     * cost ever appeared). Admissibility (`h(n) <= true remaining cost`)
     * constrains the multiplier by distance, not just cost: on a real map,
     * adjacent centroids can be many pixels apart while edge costs stay near
     * 1, so a naive multiplier of 1 wildly overestimates. The multiplier
     * computed here -- `minEdgeCost / maxAdjacentCentroidDistance`, in one
     * O(E) pass -- keeps the heuristic admissible for any edge in the graph.
     * Clamped to 0 if the graph has no adjacent-centroid distance (empty
     * graph, or all-coincident centroids), preventing `Infinity`.
     */
    private _computeHeuristicMultiplier;
    /** Euclidean distance between the centroids of nodes `a` and `b`, in pixel space. */
    private _centroidDistance;
    /** Admissible A* heuristic: centroid distance from `node` to `goal` scaled by the precomputed multiplier. */
    private _heuristic;
    /** True when heap entry `i` orders before entry `j`: lower f-score first, ties broken by lower node id (explicit -- raw heap ordering is otherwise unstable). */
    private _isHeapLess;
    /** Swaps heap entries `i` and `j` across both parallel arrays (node id and f-score). */
    private _heapSwap;
    /** Pushes `node` with `score` onto the open set and sifts it up to restore the heap invariant. */
    private _heapPush;
    /** Pops and returns the minimum-score node, sifting the last entry down to restore the heap invariant. */
    private _heapPop;
    /** Walks `cameFrom` from `end` back to `start`, returning the forward-ordered path (`path[0] === start`). */
    private _reconstructPath;
}
