/** Reclaims a bounced-back buffer (F-C.7). Called from the Worker entry's `returnGroupBBoxes` case. */
export declare function handleReturnGroupBBoxes(buffer: Int16Array): void;
/**
 * Read access to the current `parentMapping` for `borderHandlers.ts` (CA-6):
 * `mapping` is this module's own private state, not part of `getWorkerState()`,
 * so border extraction has no other way to reach it. Returns `null` if
 * `setParentMapping` has never resolved.
 */
export declare function getParentMapping(): Uint16Array | null;
