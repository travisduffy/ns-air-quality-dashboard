import type { SectorRegistry } from '../sector/SectorRegistry.js';
import type { PickEvent, PickResult } from '../shared/types.js';
import type { MapRenderer } from './MapRenderer.js';
/**
 * Resolves a pointer event to the sector beneath it (Epic 3 picking pipeline):
 * NDC conversion -> raycast against the map mesh -> UV -> clamped, Y-inverted
 * bitmap pixel -> numeric sector id -> hex key. Constructed once per loaded map
 * with the live renderer/registry/canvas it reads; dropped when the session
 * tears down.
 *
 * Backs both the synchronous hover/click event pipeline (`handlePointer`) and
 * `MapEngine.pick()` (`pick`), emitting `sectorHover`/`sectorClick` through the
 * injected `emit` callback. Hover/click suppression during pan/drag lives here,
 * reading the renderer's live gesture flags.
 */
export declare class PointerPickResolver {
    private readonly _renderer;
    private readonly _registry;
    private readonly _canvas;
    private readonly _emit;
    private readonly _raycaster;
    /** Hex key last emitted as a hover, so `sectorHover` fires only on a change of sector. */
    private _lastHexKey;
    /** Captures the live renderer/registry/canvas the pick pipeline reads and the `emit` callback for `sectorHover`/`sectorClick`, and allocates the reusable raycaster. */
    constructor(renderer: MapRenderer, registry: SectorRegistry, canvas: HTMLCanvasElement, emit: (event: string, payload: unknown) => void);
    /**
     * Resolves the sector under `point` for `MapEngine.pick()`. Returns `null`
     * on a mesh-miss (ray missed the map plane) or a void/unknown pixel.
     */
    pick(point: PickEvent): PickResult | null;
    /**
     * Handles a hover (`isClick === false`) or click (`isClick === true`) pointer
     * event: resolves the sector and emits `sectorHover`/`sectorClick` as
     * warranted. Hover emits only on a change of sector and is suppressed during
     * middle-button pan or left-button drag; the synthesized click that follows a
     * left-button drag is suppressed.
     */
    handlePointer(event: PickEvent, isClick: boolean): void;
    /**
     * NDC conversion -> raycast -> UV -> clamped, Y-inverted bitmap pixel coords.
     * Returns `null` on a mesh-miss (ray did not hit the map plane).
     */
    private _resolvePixelCoords;
    /** Resolves a bitmap pixel + numeric id into a `PickResult`, or `null` on a void/unknown sector. */
    private _resolveHexPick;
}
