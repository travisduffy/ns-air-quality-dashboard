/**
 * Coalesces concurrent `recomputeBorders()` requests (CA-6) so at most one
 * Worker computation is in flight and at most one more is queued behind it
 * (<= 2 Worker computations regardless of caller count). Every caller that
 * arrives while a run is in flight shares the single queued Promise, so they
 * resolve together and reject together.
 *
 * The coalescer is dispatch-agnostic: it is handed a `dispatch` thunk that
 * fires one fresh Worker recompute CALL and an `isSessionValid` predicate that
 * reports whether the owning session is still live. The queued run consults
 * `isSessionValid` at the moment it is about to dispatch -- a `loadMap()`
 * reload or `dispose()` may have torn the session down while it waited -- and
 * rejects with `MapInvalidatedError` rather than dispatching against a
 * torn-down proxy.
 */
export declare class BorderCoalescer {
    private readonly _dispatch;
    private readonly _isSessionValid;
    /** In-flight `recomputeBorders()` Worker CALL (CA-6 coalescing). */
    private _inFlight;
    /** At most one coalesced call queued behind `_inFlight` -- every caller that
     * arrives while something is in flight shares this same Promise. */
    private _queued;
    /** Captures the `dispatch` thunk that fires one fresh recompute CALL and the `isSessionValid` predicate the queued run consults before dispatching. */
    constructor(dispatch: () => Promise<void>, isSessionValid: () => boolean);
    /**
     * Requests a border recompute, coalescing into the in-flight/queued run per
     * the class contract. Returns the Promise the caller should observe -- the
     * queued Promise when a run is already in flight, otherwise a freshly
     * dispatched run.
     *
     * Returns the shared Promise by identity (never re-wrapped in a new `async`
     * Promise), preserving the "coalesced callers share the exact same Promise"
     * property callers rely on.
     */
    request(): Promise<void>;
    /** Discards any in-flight/queued run reference without cancelling the underlying Worker CALL (session teardown/reload). */
    reset(): void;
    /** Dispatches one fresh Worker recompute and tracks it as in-flight until it settles. Returns the run Promise callers observe. */
    private _start;
}
