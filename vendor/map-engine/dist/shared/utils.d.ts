/**
 * Converts R, G, B channel values to a zero-padded 6-character lowercase hex key.
 * This is the single source of truth for hex key derivation throughout the library.
 *
 * @example toHexKey(0, 77, 153) === "004d99"
 */
export declare function toHexKey(r: number, g: number, b: number): string;
