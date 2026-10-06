import type { BootstrapPayload } from '../shared/types.js';
/**
 * Worker-side registry state constructed from the BOOTSTRAP transfer.
 * Populated once; later epics (2, 3, 5–8) read/extend this to implement
 * SimulationClock, SharedRegistryProxy methods, pathfinding, aggregation,
 * anchoring, and border extraction.
 */
export type WorkerState = BootstrapPayload;
/** Stores the BOOTSTRAP-transferred payload as the Worker's registry state. Called from the Worker entry's BOOTSTRAP case. */
export declare function setWorkerState(payload: BootstrapPayload): void;
/** The Worker-side registry state, or `null` before BOOTSTRAP. */
export declare function getWorkerState(): WorkerState | null;
