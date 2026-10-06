/** Signature of a Worker CALL handler: takes the CALL's params and returns the RESULT value (sync or async). */
export type CallHandler = (params: unknown) => unknown | Promise<unknown>;
/** Registered by later epics (2, 3, 5–8) — one entry per CALL method name. */
export declare function registerCallHandler(method: string, handler: CallHandler): void;
/** Looks up the handler registered for `method`, or `undefined` if none is registered. */
export declare function getCallHandler(method: string): CallHandler | undefined;
