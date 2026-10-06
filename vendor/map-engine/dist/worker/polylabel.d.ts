/**
 * Signed distance from (px,py) to the nearest of `segments` — positive if
 * inside (crossing-number/ray-cast test), negative if outside. Exported so
 * Task 7.3's fixture acceptance test can assert interiority/clearance using
 * the exact same rule `polylabel` itself converges against, rather than a
 * reimplementation that could subtly diverge (e.g. on a self-intersecting
 * ring).
 */
export declare function signedDistanceToSegments(segments: ArrayLike<number>, segCount: number, px: number, py: number): number;
/**
 * Computes the Pole of Inaccessibility for the shape bounded by `segments`.
 *
 * `extraCandidates` (e.g. a per-sector centroid) are evaluated as additional
 * seed cells alongside the mandatory bbox-center seed, which is always
 * evaluated first (mapbox behavior — this pins tie-degenerate shapes, such
 * as rectangles and symmetric multi-pole shapes, to a deterministic result).
 *
 * Yields cooperatively (`yieldIfNeeded`) between priority-queue pops so a
 * single large call can span multiple 8ms slices without blocking the
 * Worker thread — this is load-bearing for sectors with many boundary
 * segments (e.g. a single sector spanning an entire large bitmap).
 */
export declare function polylabel(segments: ArrayLike<number>, segCount: number, minX: number, minY: number, maxX: number, maxY: number, precision?: number, extraCandidates?: Array<[number, number]>, yieldState?: {
    lastYield: number;
}): Promise<Pole>;
