import * as THREE from 'three';
import type { PickEvent } from '../shared/types.js';
/** Callback contract the owning `MapRenderer` supplies: `onDirty` flags a re-render, `pan`/`zoom` apply the camera transform, and the optional `pointerMove`/`click` forward resolved pick events. */
interface InputControllerOptions {
    onDirty: () => void;
    pan: (delta: THREE.Vector2) => void;
    zoom: (factor: number, ndcPoint: THREE.Vector2) => void;
    pointerMove?: (e: PickEvent) => void;
    click?: (e: PickEvent) => void;
}
/**
 * Owns every pointer/wheel listener on the canvas (main-thread, DOM consumer).
 * Middle-button drag pans, wheel zooms about the cursor, one-finger touch drag
 * pans, two-finger pinch zooms about the midpoint, and left-button drag
 * is tracked through a dead-zone state machine so a small press-release still
 * reads as a click while a real drag suppresses the synthesized click and
 * hover. Exposes the live gesture state (`isPanning`/`isLeftDragging`/
 * `leftHasDragged`) the renderer and pick pipeline read.
 */
export declare class InputController {
    private static readonly _DRAG_DEAD_ZONE_PX;
    private _isPanPressed;
    private _isPanning;
    private _panOrigin;
    private _lastPointerPos;
    private _isLeftPressed;
    private _isLeftDragActive;
    private _hasLeftDragged;
    private _leftDragOrigin;
    private readonly _touchPoints;
    private _isTouchPanning;
    private _touchOrigin;
    private _pinchDistance;
    private _pinchMid;
    private readonly _canvas;
    private readonly _onDirty;
    private readonly _panCb;
    private readonly _zoomCb;
    private readonly _boundPointerDown;
    private readonly _boundPointerMove;
    private readonly _boundPointerUp;
    private readonly _boundPointerCancel;
    private readonly _boundWheel;
    private readonly _boundClick;
    /** Wires all pointer/wheel listeners on `canvas` and captures the owner's `options` callbacks. The gesture state machines (pan dead-zone, left-drag detection) live in the bound-handler bodies built here. */
    constructor(canvas: HTMLCanvasElement, options: InputControllerOptions);
    /** Programmatically apply a pan delta (screen-space pixels). Also usable from tests. */
    onPan(delta: THREE.Vector2): void;
    /** Programmatically apply a zoom (factor + NDC cursor point). Also usable from tests. */
    onZoom(factor: number, ndcPoint: THREE.Vector2): void;
    get isPanning(): boolean;
    /** True once a left-button press has crossed the drag dead zone (a real drag, not a click). */
    get isLeftDragging(): boolean;
    /** True if the current/last left-button gesture ever became a drag — read to suppress the synthesized click that follows a drag. */
    get leftHasDragged(): boolean;
    private _measurePinch;
    private _touchDown;
    private _touchMove;
    private _touchUp;
    /** Removes every listener this controller added (symmetric with the constructor). Call on renderer teardown. */
    destroy(): void;
}
export {};
