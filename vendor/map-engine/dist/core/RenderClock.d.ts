import type { FrameCallback } from '../shared/types.js';
/**
 * Main-thread raw per-frame dt dispatch (Epic 2, B3.b). Owns dt-tracking and
 * the in-tick flag; the frame-callback list itself stays on `MapEngine` so
 * `onFrame`/`offFrame` keep their existing pre-`loadMap()` registration
 * semantics.
 */
export declare class RenderClock {
    private _lastFrameTime;
    private _isInTick;
    /** True while `tick()` is mid-dispatch of its frame callbacks. Frozen public name (R10). */
    get inTick(): boolean;
    /**
     * Resets the dt baseline — used on `MapEngine.loadMap()` reload so the
     * first tick of the new session reports dt === 0 rather than a stale gap.
     */
    reset(): void;
    /**
     * Computes dt from `performance.now()` (0 on the first call) and
     * dispatches it to `callbacks` in order — over a snapshot copy, so a
     * callback that registers/unregisters mid-dispatch never perturbs this
     * tick, and a throwing callback is logged without aborting the rest.
     * Since Epic 4's LUT-based color pipeline writes are O(1) (no
     * bbox/dirty-rect batching needed), there is no longer a post-dispatch
     * flush step to couple here.
     */
    tick(callbacks: readonly FrameCallback[]): void;
}
