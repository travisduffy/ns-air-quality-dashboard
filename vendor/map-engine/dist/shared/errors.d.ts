/** Thrown when a map exceeds the hard sector limit of 65,534 (sentinel 0xFFFF reserved). */
export declare class SectorLimitExceededError extends Error {
    /** Builds the error naming the offending sector `count` against the 65,534 hard limit. */
    constructor(count: number);
}
/** Thrown at `ThreeRenderBackend` construction when the canvas cannot provide a WebGL2 context. */
export declare class WebGL2NotSupportedError extends Error {
    /** Builds the fixed WebGL2-unavailable message. */
    constructor();
}
/**
 * Thrown by group/mapping accessors invoked before their required precondition:
 * `aggregateGroups()` before `setParentMapping()` has resolved, or `getGroupBBox()`
 * before the first `aggregateGroups()` resolution.
 */
export declare class MappingRequiredError extends Error {
    /** Builds the error, defaulting to the "parent mapping must be set" message when none is supplied. */
    constructor(message?: string);
}
/** Thrown by `findPath` when the start and end sectors are not connected by traversable edges. */
export declare class PathNotFoundError extends Error {
    /** Builds the error naming the disconnected `startId` and `endId` sectors. */
    constructor(startId: number, endId: number);
}
/** Thrown by `findPath` when called before `setTraversalCosts` has resolved at least once. */
export declare class CostsRequiredError extends Error {
    /** Builds the fixed "setTraversalCosts must resolve first" message. */
    constructor();
}
/** Thrown by `registerMapMode`/`setMapMode` when called before `loadMap()` has resolved. */
export declare class ModeNotReadyError extends Error {
    /** Builds the error naming the `method` that was called before `loadMap()` resolved. */
    constructor(method: string);
}
/**
 * Thrown by buffer-backed registry methods (e.g. the deprecated `engine.registry` getter)
 * once the bootstrap transfer has detached their backing buffers, and used to reject
 * in-flight async Promises on `loadMap()`/`dispose()`.
 */
export declare class MapInvalidatedError extends Error {
    /** Builds the error, defaulting to the "buffers transferred or disposed" message when none is supplied. */
    constructor(message?: string);
}
export declare class WorkerStartError extends Error {
    constructor(detail: string);
}
