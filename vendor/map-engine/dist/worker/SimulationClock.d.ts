/** Telemetry snapshot: lifetime tick count plus the most recent tick timestamps (ring of `TELEMETRY_RING_SIZE`). */
export interface TickTelemetry {
    tickCount: number;
    timestamps: number[];
}
/**
 * Worker-side fixed-tick simulation clock (B3.b). Self-schedules via
 * `setInterval` at the tick period; the accumulator absorbs the resulting
 * scheduling jitter the same way a Main-thread rAF-driven fixed-tick
 * accumulator does, including the same `MAX_TICKS_PER_INTERVAL` catch-up cap
 * (resetting the accumulator when hit, so an unyielded Worker stall can't
 * spiral into an unbounded catch-up loop).
 */
export declare class SimulationClock {
    private readonly _tickHz;
    private readonly _intervalSeconds;
    private _accumulator;
    private _lastTime;
    private _elapsed;
    private _timerId;
    private readonly _tickTimestamps;
    /** Fixes the tick rate and its per-tick interval; the clock stays stopped until `start()`. */
    constructor(tickHz: number);
    /** Starts the `setInterval` pump at the tick period; a no-op if already running. */
    start(): void;
    /** Stops the pump; a no-op if already stopped. Elapsed ticks and telemetry are retained. */
    stop(): void;
    /** Lifetime tick count. */
    get elapsed(): number;
    /** Snapshot of the lifetime tick count plus a copy of the recent tick timestamps. */
    getTelemetry(): TickTelemetry;
    /**
     * Per-interval accumulator step: converts elapsed wall time into fixed
     * ticks (recording each tick's timestamp into the telemetry ring), capped
     * at `MAX_TICKS_PER_INTERVAL` -- the accumulator is reset when the cap is
     * hit so a stall can't spiral into an unbounded catch-up loop.
     */
    private _pump;
}
