/**
 * Cooperative yield for Worker-side computation (B3.b). `state` is a
 * caller-owned `{ lastYield: number }` so every call site along a given
 * computation shares one yield clock. Yields via a `MessageChannel`
 * round-trip only when at least `YIELD_INTERVAL_MS` has elapsed since the
 * last yield; otherwise resolves immediately without a round-trip.
 */
export declare function yieldIfNeeded(state: {
    lastYield: number;
}): Promise<void>;
