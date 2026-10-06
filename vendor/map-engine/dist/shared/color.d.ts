/**
 * Parses any CSS color string to `{ r, g, b }` by painting a 1×1 scratch
 * canvas and reading the pixel back — the browser's own parser handles
 * every CSS color form. The fill style is reset to `#000000` first, so an
 * invalid color falls back to black rather than a stale previous value.
 * Main-thread only (`OffscreenCanvas` 2D context).
 */
export declare function parseColorToRgb(color: string): {
    r: number;
    g: number;
    b: number;
};
