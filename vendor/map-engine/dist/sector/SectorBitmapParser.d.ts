/**
 * Decodes a sector bitmap (PNG URL or Blob) into a raw RGBA pixel buffer
 * plus dimensions, via `createImageBitmap` + an `OffscreenCanvas` 2D
 * readback. Worker-compatible: zero DOM access (`OffscreenCanvas`, never a
 * DOM canvas element).
 */
export declare class SectorBitmapParser {
    /**
     * Fetches `source` when it is a URL string (throwing on a non-OK
     * response) or uses the Blob directly, decodes it with
     * `createImageBitmap` (called without options — safe because the bitmap
     * guarantees alpha=255), and reads the pixels back through an
     * `OffscreenCanvas` 2D context.
     */
    parse(source: string | Blob): Promise<{
        buffer: Uint8ClampedArray;
        width: number;
        height: number;
    }>;
}
