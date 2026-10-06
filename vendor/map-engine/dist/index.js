import * as e from "three";
//#region src/shared/errors.ts
var t = class extends Error {
	constructor(e) {
		super(`SectorRegistry: sector count ${e} exceeds the hard limit of 65,534. Map cannot be loaded.`), this.name = "SectorLimitExceededError";
	}
}, n = class extends Error {
	constructor() {
		super("map-engine requires WebGL2; the provided canvas could not create a WebGL2 context."), this.name = "WebGL2NotSupportedError";
	}
}, r = class extends Error {
	constructor(e = "A parent mapping must be set before this operation.") {
		super(e), this.name = "MappingRequiredError";
	}
}, i = class extends Error {
	constructor(e, t) {
		super(`No path exists between sector ${e} and sector ${t}.`), this.name = "PathNotFoundError";
	}
}, a = class extends Error {
	constructor() {
		super("findPath: setTraversalCosts must resolve at least once before findPath is called."), this.name = "CostsRequiredError";
	}
}, o = class extends Error {
	constructor(e) {
		super(`${e}: cannot be called before loadMap() has resolved.`), this.name = "ModeNotReadyError";
	}
}, s = class extends Error {
	constructor(e = "This map instance has been invalidated (buffers transferred or disposed).") {
		super(e), this.name = "MapInvalidatedError";
	}
}, c = class extends Error {
	constructor(e) {
		super(`MapEngine: the worker failed before it acknowledged BOOTSTRAP (${e}). The worker chunk sits in dist/assets, and its URL is relative to dist/index.js. Serve dist/assets with dist/index.js.`), this.name = "WorkerStartError";
	}
}, l = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function u(e, t, n) {
	return l[e] + l[t] + l[n];
}
function d(e, t, n) {
	return e << 16 | t << 8 | n;
}
//#endregion
//#region src/sector/SectorBitmapParser.ts
var f = class {
	async parse(e) {
		if (typeof e != "string" && !(e instanceof Blob)) throw Error("SectorBitmapParser.parse: source must be a string URL or Blob");
		let t;
		if (typeof e == "string") {
			let n = await fetch(e);
			if (!n.ok) throw Error(`SectorBitmapParser: failed to load bitmap — HTTP ${n.status} ${n.statusText}`);
			t = await n.blob();
		} else t = e;
		let n = await createImageBitmap(t), { width: r, height: i } = n, a = new OffscreenCanvas(r, i).getContext("2d");
		return a.drawImage(n, 0, 0), {
			buffer: a.getImageData(0, 0, r, i).data,
			width: r,
			height: i
		};
	}
}, p = 65535, m = class {
	constructor(e, n, r, i, a = /* @__PURE__ */ new Set()) {
		if (e.length !== n * r * 4) throw Error(`SectorRegistry: buffer length ${e.length} does not match ${n}×${r}×4 = ${n * r * 4}`);
		this.width = n, this.height = r, this.sourceBuffer = e;
		let o = Object.entries(i), s = o.length;
		if (s > 65534) throw new t(s);
		let c = /* @__PURE__ */ new Map(), l = [], f = [];
		for (let [e, t] of o) c.set(e, l.length), l.push(e), f.push(t);
		let m = new Uint32Array(n * r).fill(p), h = new Int16Array(s * 4);
		for (let e = 0; e < s; e++) h[e * 4] = 32767, h[e * 4 + 1] = 32767, h[e * 4 + 2] = -32768, h[e * 4 + 3] = -32768;
		let g = new Float64Array(s), _ = new Float64Array(s), v = new Uint32Array(s), y = /* @__PURE__ */ new Set(), b = [], x = new Uint32Array(s), S = /* @__PURE__ */ new Set(), C = 0, w = /* @__PURE__ */ new Map();
		for (let [e, t] of c) /^[0-9a-f]{6}$/.test(e) && w.set(parseInt(e, 16), t);
		for (let t = 0; t < r; t++) for (let r = 0; r < n; r++) {
			let i = t * n + r, a = i * 4, o = d(e[a], e[a + 1], e[a + 2]), s = w.get(o) ?? p;
			if (m[i] = s, s !== p) {
				let e = s * 4;
				r < h[e] && (h[e] = r), t < h[e + 1] && (h[e + 1] = t), r > h[e + 2] && (h[e + 2] = r), t > h[e + 3] && (h[e + 3] = t), g[s] += r, _[s] += t, v[s]++;
			} else S.add(o);
		}
		for (let e = 0; e < r; e++) for (let t = 0; t < n; t++) {
			let i = e * n + t, a = m[i];
			if (t < n - 1) {
				let n = m[i + 1];
				if (n !== a && (b.push(t + 1, e, t + 1, e + 1, a, n), C++, a !== p && x[a]++, n !== p && x[n]++, a !== p && n !== p)) {
					let e = a < n ? a : n, t = a < n ? n : a;
					y.add(e << 16 | t);
				}
			}
			if (e < r - 1) {
				let r = m[i + n];
				if (r !== a && (b.push(t, e + 1, t + 1, e + 1, a, r), C++, a !== p && x[a]++, r !== p && x[r]++, a !== p && r !== p)) {
					let e = a < r ? a : r, t = a < r ? r : a;
					y.add(e << 16 | t);
				}
			}
		}
		let T = new Int16Array(s * 2);
		for (let e = 0; e < s; e++) v[e] > 0 && (T[e * 2] = Math.round(g[e] / v[e]), T[e * 2 + 1] = Math.round(_[e] / v[e]));
		this.sourceBuffer = null;
		let E = new Uint16Array(n * r);
		for (let e = 0, t = n * r; e < t; e++) E[e] = m[e] & 65535;
		let D = [];
		for (let e = 0; e < s; e++) {
			let t = l[e], n = parseInt(t.slice(0, 2), 16), r = parseInt(t.slice(2, 4), 16), i = parseInt(t.slice(4, 6), 16);
			D.push([d(n, r, i), e]);
		}
		D.sort((e, t) => e[0] - t[0]);
		let O = new Uint32Array(s), k = new Uint16Array(s), A = new Uint32Array(s);
		for (let e = 0; e < s; e++) O[e] = D[e][0], k[e] = D[e][1], A[D[e][1]] = D[e][0];
		let j = new Uint32Array(y.size), M = 0;
		for (let e of y) j[M++] = e;
		j.sort();
		let N = new Uint32Array(s);
		for (let e = 0; e < j.length; e++) {
			let t = j[e] >>> 16, n = j[e] & 65535;
			N[t]++, N[n]++;
		}
		let P = new Uint32Array(s + 1);
		for (let e = 0; e < s; e++) P[e + 1] = P[e] + N[e];
		let F = new Uint16Array(P[s]), I = new Uint32Array(s);
		for (let e = 0; e < j.length; e++) {
			let t = j[e] >>> 16, n = j[e] & 65535;
			F[P[t] + I[t]++] = n, F[P[n] + I[n]++] = t;
		}
		let L = new Uint32Array(s + 1);
		for (let e = 0; e < s; e++) L[e + 1] = L[e] + x[e];
		let R = L[s], z = new Int16Array(R * 4), B = new Uint32Array(s);
		for (let e = 0; e < b.length; e += 6) {
			let t = b[e], n = b[e + 1], r = b[e + 2], i = b[e + 3], a = b[e + 4], o = b[e + 5];
			if (a !== p) {
				let e = (L[a] + B[a]++) * 4;
				z[e] = t, z[e + 1] = n, z[e + 2] = r, z[e + 3] = i;
			}
			if (o !== p) {
				let e = (L[o] + B[o]++) * 4;
				z[e] = t, z[e + 1] = n, z[e + 2] = r, z[e + 3] = i;
			}
		}
		let V = new Float32Array(4 * C), H = new Uint32Array(1);
		this.bboxes = h, this.centroids = T, this.idToHex = l, this.pixelIndices = m, this.pixelIndicesMirror = E, this.hexColors = O, this.sectorIds = k, this.idToPackedRgb = A, this.adjacencyPointers = P, this.adjacencyNeighbors = F, this.contourPointers = L, this.contourPoints = z, this.borderEdges = V, this.borderEdgeCount = H, this._hexToId = c, this._sectorData = f, this._pixelCounts = v;
		for (let e = 0; e < s; e++) v[e] === 0 && console.warn(`[MapEngine] Sector '${l[e]}' is defined in sectors.json but has no pixels in the bitmap.`);
		for (let e of S) {
			let t = u(e >>> 16 & 255, e >>> 8 & 255, e & 255);
			a.has(t) || console.warn(`[MapEngine] Color '${t}' found in the bitmap has no corresponding entry in sectors.json.`);
		}
	}
	getSectorAt(e, t) {
		let n = Math.floor(e), r = Math.floor(t);
		if (n < 0 || n >= this.width || r < 0 || r >= this.height) throw Error("getSectorAt: coordinates out of bounds");
		let i = this.pixelIndicesMirror[r * this.width + n];
		return i === p ? "000000" : this.idToHex[i];
	}
	getSector(e) {
		let t = this._hexToId.get(e);
		return t === void 0 ? void 0 : this._sectorData[t] ?? void 0;
	}
	getSectorKeys() {
		return this.idToHex.slice();
	}
	hasSectorPixels(e) {
		let t = this._hexToId.get(e);
		return t !== void 0 && this._pixelCounts[t] > 0;
	}
	getNumericId(e) {
		return this._hexToId.get(e);
	}
	getBBox(e) {
		let t = typeof e == "string" ? this._hexToId.get(e) : e;
		if (t === void 0 || t < 0 || t >= this.idToHex.length) throw Error(`SectorRegistry: unknown sector '${e}'`);
		let n = t * 4;
		return [
			this.bboxes[n],
			this.bboxes[n + 1],
			this.bboxes[n + 2],
			this.bboxes[n + 3]
		];
	}
	getCentroid(e) {
		let t = typeof e == "string" ? this._hexToId.get(e) : e;
		if (t === void 0 || t < 0 || t >= this.idToHex.length) throw Error(`SectorRegistry: unknown sector '${e}'`);
		return [this.centroids[t * 2], this.centroids[t * 2 + 1]];
	}
	getNeighbors(e) {
		if (typeof e == "string") {
			let t = this._hexToId.get(e);
			if (t === void 0) return [];
			let n = this.adjacencyPointers[t], r = this.adjacencyPointers[t + 1], i = [];
			for (let e = n; e < r; e++) i.push(this.idToHex[this.adjacencyNeighbors[e]]);
			return i;
		} else {
			let t = this.adjacencyPointers[e], n = this.adjacencyPointers[e + 1], r = [];
			for (let e = t; e < n; e++) r.push(this.adjacencyNeighbors[e]);
			return r;
		}
	}
}, h = class t {
	static {
		this._DRAG_DEAD_ZONE_PX = 4;
	}
	constructor(n, r) {
		this._isPanPressed = !1, this._isPanning = !1, this._panOrigin = {
			x: 0,
			y: 0
		}, this._lastPointerPos = {
			x: 0,
			y: 0
		}, this._isLeftPressed = !1, this._isLeftDragActive = !1, this._hasLeftDragged = !1, this._leftDragOrigin = {
			x: 0,
			y: 0
		}, this._touchPoints = /* @__PURE__ */ new Map(), this._isTouchPanning = !1, this._touchOrigin = {
			x: 0,
			y: 0
		}, this._pinchDistance = 0, this._pinchMid = {
			x: 0,
			y: 0
		}, this._canvas = n, this._onDirty = r.onDirty, this._panCb = r.pan, this._zoomCb = r.zoom, this._boundPointerDown = (e) => {
			if (e.pointerType === "touch") {
				this._touchDown(e);
				return;
			}
			if (e.button === 1) {
				this._isPanPressed = !0, this._isPanning = !1, this._panOrigin = {
					x: e.clientX,
					y: e.clientY
				}, this._lastPointerPos = {
					x: e.clientX,
					y: e.clientY
				};
				try {
					n.setPointerCapture(e.pointerId);
				} catch {}
			} else e.button === 0 && (this._isLeftPressed = !0, this._isLeftDragActive = !1, this._hasLeftDragged = !1, this._leftDragOrigin = {
				x: e.clientX,
				y: e.clientY
			});
		}, this._boundPointerMove = (n) => {
			if (n.pointerType === "touch") {
				this._touchMove(n), r.pointerMove && r.pointerMove(n);
				return;
			}
			if (this._isLeftPressed && !(n.buttons & 1) && (this._isLeftPressed = !1, this._isLeftDragActive = !1), this._isPanPressed) {
				let r = n.clientX - this._lastPointerPos.x, i = n.clientY - this._lastPointerPos.y;
				this._lastPointerPos = {
					x: n.clientX,
					y: n.clientY
				}, this._isPanning || Math.hypot(n.clientX - this._panOrigin.x, n.clientY - this._panOrigin.y) > t._DRAG_DEAD_ZONE_PX && (this._isPanning = !0), this._isPanning && this.onPan(new e.Vector2(r, i));
			}
			this._isLeftPressed && !this._isLeftDragActive && Math.hypot(n.clientX - this._leftDragOrigin.x, n.clientY - this._leftDragOrigin.y) > t._DRAG_DEAD_ZONE_PX && (this._isLeftDragActive = !0, this._hasLeftDragged = !0), r.pointerMove && r.pointerMove(n);
		}, this._boundPointerUp = (e) => {
			if (e.pointerType === "touch") {
				this._touchUp(e);
				return;
			}
			e.button === 1 ? (this._isPanPressed = !1, this._isPanning = !1) : e.button === 0 && (this._isLeftPressed = !1, this._isLeftDragActive = !1);
		}, this._boundPointerCancel = (e) => {
			e.pointerType === "touch" && this._touchUp(e), this._isPanPressed = !1, this._isPanning = !1, this._isLeftPressed = !1, this._isLeftDragActive = !1;
		}, this._boundWheel = (t) => {
			t.preventDefault();
			let r = 1.1 ** (-t.deltaY / 100), i = n.getBoundingClientRect(), a = (t.clientX - i.left) / i.width * 2 - 1, o = -((t.clientY - i.top) / i.height * 2 - 1);
			this.onZoom(r, new e.Vector2(a, o));
		}, this._boundClick = r.click ?? null, n.addEventListener("pointerdown", this._boundPointerDown), n.addEventListener("pointermove", this._boundPointerMove), n.addEventListener("pointerup", this._boundPointerUp), n.addEventListener("pointercancel", this._boundPointerCancel), n.addEventListener("wheel", this._boundWheel, { passive: !1 }), this._boundClick && n.addEventListener("click", this._boundClick);
	}
	onPan(e) {
		this._panCb(e), this._onDirty();
	}
	onZoom(e, t) {
		this._zoomCb(e, t), this._onDirty();
	}
	get isPanning() {
		return this._isPanPressed || this._isTouchPanning || this._touchPoints.size >= 2;
	}
	get isLeftDragging() {
		return this._isLeftDragActive;
	}
	get leftHasDragged() {
		return this._hasLeftDragged;
	}
	_measurePinch() {
		let [e, t] = [...this._touchPoints.values()];
		return {
			distance: Math.hypot(t.x - e.x, t.y - e.y),
			mid: {
				x: (e.x + t.x) / 2,
				y: (e.y + t.y) / 2
			}
		};
	}
	_touchDown(e) {
		if (this._touchPoints.size >= 2) return;
		this._touchPoints.set(e.pointerId, {
			x: e.clientX,
			y: e.clientY
		});
		try {
			this._canvas.setPointerCapture(e.pointerId);
		} catch {}
		if (this._touchPoints.size === 1) {
			this._touchOrigin = {
				x: e.clientX,
				y: e.clientY
			}, this._hasLeftDragged = !1;
			return;
		}
		let { distance: t, mid: n } = this._measurePinch();
		this._pinchDistance = t, this._pinchMid = n, this._hasLeftDragged = !0;
	}
	_touchMove(n) {
		let r = this._touchPoints.get(n.pointerId);
		if (!r) return;
		if (this._touchPoints.set(n.pointerId, {
			x: n.clientX,
			y: n.clientY
		}), this._touchPoints.size === 1) {
			if (!this._isTouchPanning) {
				if (Math.hypot(n.clientX - this._touchOrigin.x, n.clientY - this._touchOrigin.y) <= t._DRAG_DEAD_ZONE_PX) return;
				this._isTouchPanning = !0, this._hasLeftDragged = !0;
			}
			this.onPan(new e.Vector2(n.clientX - r.x, n.clientY - r.y));
			return;
		}
		let { distance: i, mid: a } = this._measurePinch(), o = this._canvas.getBoundingClientRect(), s = (a.x - o.left) / o.width * 2 - 1, c = -((a.y - o.top) / o.height * 2 - 1);
		this._pinchDistance > 0 && i > 0 && this.onZoom(i / this._pinchDistance, new e.Vector2(s, c)), this.onPan(new e.Vector2(a.x - this._pinchMid.x, a.y - this._pinchMid.y)), this._pinchDistance = i, this._pinchMid = a;
	}
	_touchUp(e) {
		if (this._touchPoints.delete(e.pointerId)) {
			if (this._touchPoints.size === 1) {
				let [e] = [...this._touchPoints.values()];
				this._touchOrigin = { ...e }, this._isTouchPanning = !1;
				return;
			}
			this._isTouchPanning = !1, this._pinchDistance = 0;
		}
	}
	destroy() {
		this._canvas.removeEventListener("pointerdown", this._boundPointerDown), this._canvas.removeEventListener("pointermove", this._boundPointerMove), this._canvas.removeEventListener("pointerup", this._boundPointerUp), this._canvas.removeEventListener("pointercancel", this._boundPointerCancel), this._canvas.removeEventListener("wheel", this._boundWheel), this._boundClick && this._canvas.removeEventListener("click", this._boundClick), this._touchPoints.clear(), this._isTouchPanning = !1, this._pinchDistance = 0;
	}
}, g = class {
	constructor(t, n, r) {
		let i = t.getThreeRenderer().getContext(), a = t.getBorderVBO();
		if (!a) throw Error("BorderRenderer: backend has no border VBO -- uploadBorderEdges() must be called before constructing BorderRenderer");
		this._positionAttribute = new e.GLBufferAttribute(a, i.FLOAT, 2, 4, 0), this._geometry = new e.BufferGeometry(), this._geometry.setAttribute("position", this._positionAttribute), this._geometry.setDrawRange(0, 0), this._geometry.boundingSphere = new e.Sphere(new e.Vector3(0, 0, 0), Math.sqrt(n * n + r * r) / 2), this._material = new e.LineBasicMaterial({ color: 16777215 }), this.lineSegments = new e.LineSegments(this._geometry, this._material), this.lineSegments.frustumCulled = !1, this.lineSegments.scale.set(1, -1, 1), this.lineSegments.position.set(-n / 2, r / 2, .1);
	}
	setDrawCount(e) {
		this._geometry.setDrawRange(0, e * 2), this._positionAttribute.count = e * 2;
	}
	dispose() {
		this._geometry.dispose(), this._material.dispose();
	}
}, _ = 65535, v = "\nin vec3 position;\nin vec2 uv;\nuniform mat4 modelViewMatrix;\nuniform mat4 projectionMatrix;\nout vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}\n", y = `
precision highp float;
precision highp int;
precision highp usampler2D;
uniform usampler2D indexTex;
uniform sampler2D paletteTex;
uniform int sectorCount;
uniform int paletteWidth;
in vec2 vUv;
out vec4 fragColor;

void main() {
  ivec2 size = textureSize(indexTex, 0);
  int ix = int(vUv.x * float(size.x));
  int iy = int((1.0 - vUv.y) * float(size.y));
  ix = clamp(ix, 0, size.x - 1);
  iy = clamp(iy, 0, size.y - 1);
  uint id = texelFetch(indexTex, ivec2(ix, iy), 0).r;
  if (id == ${_}u || int(id) >= sectorCount) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  int px = int(id) % paletteWidth;
  int py = int(id) / paletteWidth;
  fragColor = texelFetch(paletteTex, ivec2(px, py), 0);
}
`, b = class {
	constructor(t, r, i, a, o, s, c, l) {
		this._borderVBO = null;
		let u = t.getContext("webgl2");
		if (!(u instanceof WebGL2RenderingContext)) throw new n();
		this._sectorCount = c, this._pixelIndicesSnapshot = s.slice(), this._renderer = new e.WebGLRenderer({
			canvas: t,
			context: u,
			antialias: !1
		}), this._renderer.setPixelRatio(window.devicePixelRatio), this._renderer.setSize(t.clientWidth, t.clientHeight, !1), this._indexTextureWidth = a, this._indexTextureHeight = o, this._indexTexture = new e.DataTexture(this._pixelIndicesSnapshot, a, o, e.RedIntegerFormat, e.UnsignedIntType), this._indexTexture.minFilter = e.NearestFilter, this._indexTexture.magFilter = e.NearestFilter, this._indexTexture.generateMipmaps = !1, this._indexTexture.flipY = !1, this._indexTexture.needsUpdate = !0, t.addEventListener("webglcontextlost", (e) => {
			e.preventDefault(), this._borderVBO = null;
		});
		let d = u.getParameter(u.MAX_TEXTURE_SIZE), f = Math.max(1, Math.min(c, d)), p = Math.max(1, Math.ceil(c / f)), m = new Uint8Array(f * p * 4);
		for (let e = 0; e < c; e++) {
			let t = l[e], n = e * 4;
			m[n] = t >>> 16 & 255, m[n + 1] = t >>> 8 & 255, m[n + 2] = t & 255, m[n + 3] = 255;
		}
		this._paletteData = m, this._paletteTexture = new e.DataTexture(m, f, p, e.RGBAFormat, e.UnsignedByteType), this._paletteTexture.minFilter = e.NearestFilter, this._paletteTexture.magFilter = e.NearestFilter, this._paletteTexture.generateMipmaps = !1, this._paletteTexture.flipY = !1, this._paletteTexture.needsUpdate = !0, this.scene = new e.Scene();
		let h = new e.PlaneGeometry(a, o);
		this.material = new e.RawShaderMaterial({
			glslVersion: e.GLSL3,
			uniforms: {
				indexTex: { value: this._indexTexture },
				paletteTex: { value: this._paletteTexture },
				sectorCount: { value: c },
				paletteWidth: { value: f }
			},
			vertexShader: v,
			fragmentShader: y,
			side: e.DoubleSide
		}), this.mesh = new e.Mesh(h, this.material), this.scene.add(this.mesh), this.camera = new e.OrthographicCamera(-r, r, i, -i, -1e3, 1e3), this.camera.position.set(0, 0, 1), this.camera.zoom = 1, this.camera.updateProjectionMatrix();
	}
	writePaletteEntry(e, t, n, r) {
		let i = e * 4;
		this._paletteData[i] = t, this._paletteData[i + 1] = n, this._paletteData[i + 2] = r, this._paletteData[i + 3] = 255, this._paletteTexture.needsUpdate = !0;
	}
	_setPaletteUniformDirect(e) {
		this._writePaletteUniform(e);
	}
	updateUniforms(e) {
		let t = e.palette;
		t instanceof Uint32Array && this._writePaletteUniform(t);
	}
	reuploadIndexTexture(e) {
		let t = this._indexTexture.image.data;
		for (let n = 0; n < e.length; n++) t[n] = e[n];
		this._indexTexture.needsUpdate = !0;
	}
	getIndexTexture() {
		return this._indexTexture;
	}
	uploadBorderEdges(e, t) {
		let n = this._renderer.getContext();
		this._borderVBO ? n.bindBuffer(n.ARRAY_BUFFER, this._borderVBO) : (this._borderVBO = n.createBuffer(), n.bindBuffer(n.ARRAY_BUFFER, this._borderVBO), n.bufferData(n.ARRAY_BUFFER, e.byteLength, n.DYNAMIC_DRAW));
		let r = t * 4;
		r > 0 && n.bufferSubData(n.ARRAY_BUFFER, 0, e.subarray(0, r));
	}
	getBorderVBO() {
		return this._borderVBO;
	}
	render(e, t) {
		this._renderer.render(e, t);
	}
	setSize(e, t) {
		this._renderer.setSize(e, t, !1);
	}
	getThreeScene() {
		return this.scene;
	}
	getThreeRenderer() {
		return this._renderer;
	}
	readSectorIdAt(e, t) {
		return e < 0 || t < 0 || e >= this._indexTextureWidth || t >= this._indexTextureHeight ? 65535 : this._pixelIndicesSnapshot[t * this._indexTextureWidth + e];
	}
	dispose() {
		this._renderer.dispose(), this.mesh.geometry.dispose(), this.material.dispose(), this._indexTexture.dispose(), this._paletteTexture.dispose();
	}
	_writePaletteUniform(e) {
		let t = Math.min(e.length, this._sectorCount);
		for (let n = 0; n < t; n++) {
			let t = e[n], r = n * 4;
			this._paletteData[r] = t >>> 16 & 255, this._paletteData[r + 1] = t >>> 8 & 255, this._paletteData[r + 2] = t & 255, this._paletteData[r + 3] = 255;
		}
		this._paletteTexture.needsUpdate = !0;
	}
}, x = new OffscreenCanvas(1, 1).getContext("2d");
function S(e) {
	x.clearRect(0, 0, 1, 1), x.fillStyle = "#000000", x.fillStyle = e, x.fillRect(0, 0, 1, 1);
	let t = x.getImageData(0, 0, 1, 1).data;
	return {
		r: t[0],
		g: t[1],
		b: t[2]
	};
}
//#endregion
//#region src/core/MapRenderer.ts
var C = class {
	constructor(e, t, n, r, i, a) {
		if (this._borderRenderer = null, this._borderRendererVBO = null, this._borderSegments = null, this._areBordersVisible = !0, this._isDirty = !0, this._isDestroyed = !1, this._postRenderHook = null, this._onViewChange = null, this._lastView = null, this._fitTarget = null, this._loop = () => {
			this._animFrameId = requestAnimationFrame(this._loop), this._preRenderHook && this._preRenderHook();
			let e = this._canvas.clientWidth, t = this._canvas.clientHeight;
			if (e !== this._currentW || t !== this._currentH) {
				this._currentW = e, this._currentH = t, this._backend.setSize(e, t);
				let n = e * this._worldUnitsPerPixel / 2, r = t * this._worldUnitsPerPixel / 2;
				if (this._frustumHalfW = n, this._frustumHalfH = r, this.camera.left = -n, this.camera.right = n, this.camera.top = r, this.camera.bottom = -r, this.camera.updateProjectionMatrix(), this.clampPan(), this._fitTarget) {
					let { bbox: e, padding: t, fit: n } = this._fitTarget;
					this._fitBounds(e, t, !0, n);
				}
				this._isDirty = !0;
			}
			if (this._isDirty) {
				let e = this._onViewChange ? this._getView() : null, t = this._lastView, n = !!e && (!t || e.centerX !== t.centerX || e.centerY !== t.centerY || e.zoom !== t.zoom);
				e && n && (this._lastView = { ...e }), this._backend.render(this.scene, this.camera), this._postRenderHook && this._postRenderHook(), this._isDirty = !1, e && n && this._onViewChange && this._onViewChange(e);
			}
		}, e.clientWidth === 0 || e.clientHeight === 0) throw Error("MapEngine: canvas has zero dimensions — ensure the canvas element is in the DOM and has non-zero CSS dimensions before calling loadMap()");
		this._canvas = e, this._registry = t, this._preRenderHook = n ?? null;
		let o = t.width, s = t.height, c = e.clientWidth / e.clientHeight, l = o / s, u, d;
		c >= l ? (d = s / 2, u = d * c) : (u = o / 2, d = u / c), this._frustumHalfW = u, this._frustumHalfH = d, this._worldUnitsPerPixel = u * 2 / e.clientWidth, this._currentW = e.clientWidth, this._currentH = e.clientHeight, this._backend = a ?? new b(e, u, d, o, s, t.pixelIndices, t.idToHex.length, t.idToPackedRgb), e.addEventListener("webglcontextrestored", () => {
			this._backend.reuploadIndexTexture(this._registry.pixelIndicesMirror), this._borderSegments && this._receiveBorderEdges(this._borderSegments, this._borderSegments.length / 4), this._isDirty = !0;
		}), this.scene = this._backend.scene, this.camera = this._backend.camera, this.mesh = this._backend.mesh, this._input = new h(e, {
			onDirty: () => {
				this._isDirty = !0;
			},
			pan: (e) => this._applyPan(e),
			zoom: (e, t) => this._applyZoom(e, t),
			pointerMove: r,
			click: i
		}), this._animFrameId = requestAnimationFrame(this._loop);
	}
	_pauseLoop() {
		cancelAnimationFrame(this._animFrameId);
	}
	_resumeLoop() {
		this._animFrameId = requestAnimationFrame(this._loop);
	}
	clampPan() {
		let e = this._registry.width / 2 + this._registry.width * .1, t = this._registry.height / 2 + this._registry.height * .1;
		this.camera.position.x = Math.max(-e, Math.min(e, this.camera.position.x)), this.camera.position.y = Math.max(-t, Math.min(t, this.camera.position.y));
	}
	_getView() {
		return {
			centerX: this.camera.position.x + this._registry.width / 2,
			centerY: this._registry.height / 2 - this.camera.position.y,
			zoom: this.camera.zoom
		};
	}
	_setView(e) {
		let t = {
			...this._getView(),
			...e
		};
		this.camera.position.x = t.centerX - this._registry.width / 2, this.camera.position.y = this._registry.height / 2 - t.centerY, this.camera.zoom = Math.max(.5, Math.min(20, t.zoom)), this.camera.updateProjectionMatrix(), this.clampPan(), this._isDirty = !0, this._fitTarget = null;
	}
	_fitBounds(e, t, n, r = "contain") {
		let [i, a, o, s] = e, c = Math.max(1, this._canvas.clientWidth - 2 * t), l = Math.max(1, this._canvas.clientHeight - 2 * t), u = r === "cover" ? Math.max : Math.min;
		this._setView({
			centerX: (i + o + 1) / 2,
			centerY: (a + s + 1) / 2,
			zoom: this._worldUnitsPerPixel * u(c / (o + 1 - i), l / (s + 1 - a))
		}), n && (this._fitTarget = {
			bbox: [
				i,
				a,
				o,
				s
			],
			padding: t,
			fit: r
		});
	}
	readSectorIdAt(e, t) {
		return this._backend.readSectorIdAt(e, t);
	}
	project(e, t) {
		let n = this._registry.width, r = this._registry.height, i = e + .5 - n / 2, a = r / 2 - (t + .5), o = (i - this.camera.position.x) * this.camera.zoom / this._frustumHalfW, s = (a - this.camera.position.y) * this.camera.zoom / this._frustumHalfH;
		return [(o + 1) / 2 * this._canvas.clientWidth, (1 - s) / 2 * this._canvas.clientHeight];
	}
	get isPanning() {
		return this._input.isPanning;
	}
	get isLeftDragging() {
		return this._input.isLeftDragging;
	}
	get leftHasDragged() {
		return this._input.leftHasDragged;
	}
	setSectorColor(e, t) {
		if (!this._registry.hasSectorPixels(e)) {
			console.warn("[MapEngine] setSectorColor: sector has no pixel data");
			return;
		}
		let n = this._registry.getNumericId(e), { r, g: i, b: a } = S(t);
		this._backend.writePaletteEntry(n, r, i, a), this._isDirty = !0;
	}
	resetSectorColor(e) {
		if (!this._registry.hasSectorPixels(e)) {
			console.warn("[MapEngine] resetSectorColor: sector has no pixel data");
			return;
		}
		let t = this._registry.getNumericId(e), n = this._registry.idToPackedRgb[t];
		this._backend.writePaletteEntry(t, n >>> 16 & 255, n >>> 8 & 255, n & 255), this._isDirty = !0;
	}
	setPalette(e) {
		this._backend.updateUniforms({ palette: e }), this._isDirty = !0;
	}
	_receiveBorderEdges(e, t) {
		this._backend.uploadBorderEdges(e, t), this._borderSegments = e.slice(0, t * 4);
		let n = this._backend.getBorderVBO();
		this._borderRenderer && this._borderRendererVBO !== n && (this.scene.remove(this._borderRenderer.lineSegments), this._borderRenderer.dispose(), this._borderRenderer = null), t > 0 && (this._borderRenderer || (this._borderRenderer = new g(this._backend, this._registry.width, this._registry.height), this._borderRendererVBO = n, this._borderRenderer.lineSegments.visible = this._areBordersVisible, this.scene.add(this._borderRenderer.lineSegments)), this._borderRenderer.setDrawCount(t)), this._isDirty = !0;
	}
	getBorderSegments() {
		return this._borderSegments;
	}
	setBordersVisible(e) {
		this._areBordersVisible = e, this._borderRenderer && (this._borderRenderer.lineSegments.visible = e, this._isDirty = !0);
	}
	destroy() {
		this._isDestroyed || (this._isDestroyed = !0, cancelAnimationFrame(this._animFrameId), this._preRenderHook = null, this._postRenderHook = null, this._input.destroy(), this._borderRenderer?.dispose(), this._borderRenderer = null, this._backend.dispose());
	}
	_applyPan(e) {
		this._fitTarget = null;
		let t = this._frustumHalfW * 2 / this._canvas.clientWidth, n = this._frustumHalfH * 2 / this._canvas.clientHeight;
		this.camera.position.x -= e.x * t / this.camera.zoom, this.camera.position.y += e.y * n / this.camera.zoom, this.clampPan();
	}
	_applyZoom(e, t) {
		this._fitTarget = null;
		let n = this.camera.zoom, r = Math.max(.5, Math.min(20, n * e));
		this.camera.zoom = r, this.camera.updateProjectionMatrix(), this.camera.position.x += t.x * this._frustumHalfW * (1 / n - 1 / r), this.camera.position.y += t.y * this._frustumHalfH * (1 / n - 1 / r), this.clampPan();
	}
}, w = {
	WebGL2NotSupportedError: n,
	MappingRequiredError: r,
	PathNotFoundError: i,
	CostsRequiredError: a,
	ModeNotReadyError: o,
	MapInvalidatedError: s,
	SectorLimitExceededError: t
};
function T(e, t) {
	let n = w[e], r = n ? Object.create(n.prototype) : Error(t);
	return r.message = t, r.name = e, r;
}
var E = class {
	constructor(e, t) {
		this._nextId = 1, this._pending = /* @__PURE__ */ new Map(), this._onMessage = (e) => {
			let t = e.data;
			if (t.type === "RESULT") {
				let e = this._pending.get(t.id);
				if (!e) return;
				this._pending.delete(t.id), t.snapshot !== void 0 && (this._snapshot = {
					...this._snapshot,
					...t.snapshot
				}), e.resolve(t.result);
			} else if (t.type === "ERROR") {
				let e = this._pending.get(t.id);
				if (!e) return;
				this._pending.delete(t.id), e.reject(T(t.errorName, t.message));
			}
		}, this._worker = e, this._snapshot = t, this._worker.addEventListener("message", this._onMessage);
	}
	call(e, t = null, n = []) {
		let r = this._nextId++;
		return new Promise((i, a) => {
			this._pending.set(r, {
				resolve: i,
				reject: a
			}), this._worker.postMessage({
				type: "CALL",
				id: r,
				method: e,
				params: t
			}, n);
		});
	}
	rejectAll(e) {
		for (let t of this._pending.values()) t.reject(e);
		this._pending.clear();
	}
	getBBoxByNumericId(e) {
		let t = e * 4, { bboxes: n } = this._snapshot;
		return [
			n[t],
			n[t + 1],
			n[t + 2],
			n[t + 3]
		];
	}
	getCentroidByNumericId(e) {
		let { centroids: t } = this._snapshot;
		return [t[e * 2], t[e * 2 + 1]];
	}
	getNeighborIdsByNumericId(e) {
		let { adjacencyPointers: t, adjacencyNeighbors: n } = this._snapshot, r = t[e], i = t[e + 1], a = [];
		for (let e = r; e < i; e++) a.push(n[e]);
		return a;
	}
	dispose() {
		this.rejectAll(new s()), this._worker.removeEventListener("message", this._onMessage);
	}
}, D = class {
	constructor(e, t) {
		this._maxGroups = null, this._current = null, this._pending = null, this.flushBounces = () => {
			if (!this._pending) return;
			let e = this._pending;
			this._pending = null, this._worker.postMessage({
				type: "returnGroupBBoxes",
				buffer: e
			}, [e.buffer]);
		}, this._onMessage = (e) => {
			let t = e.data;
			t.type === "INIT_GROUPS" ? (this._maxGroups = t.maxGroups, this._current = null, this._pending = null) : t.type === "groupBBoxes" && (this._pending = this._current, this._current = t.buffer, this._markDirty());
		}, this._worker = e, this._markDirty = t, this._worker.addEventListener("message", this._onMessage);
	}
	getGroupBBox(e) {
		if (!this._current) throw new r("getGroupBBox: aggregateGroups() must resolve at least once before getGroupBBox() is called.");
		if (!Number.isInteger(e) || e < 0 || e >= this._maxGroups) throw RangeError(`getGroupBBox: groupId must be an integer in [0, ${this._maxGroups}) — got ${e}`);
		let t = e * 4, n = this._current;
		return [
			n[t],
			n[t + 1],
			n[t + 2],
			n[t + 3]
		];
	}
	dispose() {
		this._worker.removeEventListener("message", this._onMessage), this._current = null, this._pending = null;
	}
}, O = class {
	constructor(e, t) {
		this._sectorCount = null, this._current = null, this._pending = null, this.flushBounces = () => {
			if (!this._pending) return;
			let e = this._pending;
			this._pending = null, this._worker.postMessage({
				type: "returnAnchors",
				buffer: e
			}, [e.buffer]);
		}, this._onMessage = (e) => {
			let t = e.data;
			t.type === "INIT_ANCHORS" ? (this._sectorCount = t.sectorCount, this._current = null, this._pending = null) : t.type === "anchors" && (this._pending = this._current, this._current = t.buffer, this._markDirty());
		}, this._worker = e, this._markDirty = t, this._worker.addEventListener("message", this._onMessage);
	}
	getAnchor(e) {
		if (!this._current) throw Error("getAnchor: computeAnchors() must resolve at least once before getAnchor() is called.");
		if (!Number.isInteger(e) || e < 0 || e >= this._sectorCount) throw RangeError(`getAnchor: sectorId must be an integer in [0, ${this._sectorCount}) — got ${e}`);
		let t = e * 2, n = this._current;
		return [n[t], n[t + 1]];
	}
	dispose() {
		this._worker.removeEventListener("message", this._onMessage), this._current = null, this._pending = null;
	}
}, k = class {
	constructor(e, t) {
		this._pendingEdges = null, this._pendingCount = null, this.flushBounces = () => {
			if (!this._pendingEdges || !this._pendingCount) return;
			let e = this._pendingEdges, t = this._pendingCount;
			this._pendingEdges = null, this._pendingCount = null, this._worker.postMessage({
				type: "returnBorderEdges",
				edges: e,
				count: t
			}, [e.buffer, t.buffer]);
		}, this._onMessage = (e) => {
			let t = e.data;
			t.type === "borderEdges" && (this._onEdges(t.edges, t.count[0]), this._pendingEdges = t.edges, this._pendingCount = t.count);
		}, this._worker = e, this._onEdges = t, this._worker.addEventListener("message", this._onMessage);
	}
	dispose() {
		this._worker.removeEventListener("message", this._onMessage), this._pendingEdges = null, this._pendingCount = null;
	}
}, A = class {
	constructor(e, t) {
		this._inFlight = null, this._queued = null, this._dispatch = e, this._isSessionValid = t;
	}
	request() {
		return this._inFlight ? (this._queued ||= this._inFlight.catch(() => {}).then(() => {
			if (this._queued = null, !this._isSessionValid()) throw new s();
			return this._start();
		}), this._queued) : this._start();
	}
	reset() {
		this._inFlight = null, this._queued = null;
	}
	_start() {
		let e = this._dispatch();
		return this._inFlight = e, e.finally(() => {
			this._inFlight === e && (this._inFlight = null);
		}).catch(() => {}), e;
	}
}, j = class {
	constructor() {
		this._handlers = /* @__PURE__ */ new Map();
	}
	on(e, t) {
		let n = this._handlers.get(e);
		n || (n = /* @__PURE__ */ new Set(), this._handlers.set(e, n)), n.add(t);
	}
	off(e, t) {
		this._handlers.get(e)?.delete(t);
	}
	emit(e, t) {
		let n = this._handlers.get(e);
		if (n) for (let e of n) e(t);
	}
	clear() {
		this._handlers.clear();
	}
}, M = class {
	constructor(t, n, r, i) {
		this._lastHexKey = null, this._renderer = t, this._registry = n, this._canvas = r, this._emit = i, this._raycaster = new e.Raycaster();
	}
	pick(e) {
		let t = this._resolvePixelCoords(e);
		return t ? this._resolveHexPick(t.pixelX, t.pixelY) : null;
	}
	handlePointer(e, t) {
		let n = this._resolvePixelCoords(e), r = n ? this._resolveHexPick(n.pixelX, n.pixelY) : null;
		if (r === null) {
			!t && this._lastHexKey !== null && (this._lastHexKey = null, this._emit("sectorHover", null));
			return;
		}
		if (t) {
			if (this._renderer.leftHasDragged) return;
			this._emit("sectorClick", r);
		} else {
			if (this._renderer.isPanning || this._renderer.isLeftDragging) return;
			r.hexKey !== this._lastHexKey && (this._lastHexKey = r.hexKey, this._emit("sectorHover", r));
		}
	}
	_resolvePixelCoords(t) {
		let n = this._canvas.getBoundingClientRect(), r = new e.Vector2((t.clientX - n.left) / n.width * 2 - 1, -((t.clientY - n.top) / n.height) * 2 + 1);
		this._raycaster.setFromCamera(r, this._renderer.camera);
		let i = this._raycaster.intersectObject(this._renderer.mesh);
		if (i.length === 0) return null;
		let a = i[0].uv, o = this._registry.width, s = this._registry.height;
		return {
			pixelX: Math.max(0, Math.min(o - 1, Math.floor(a.x * o))),
			pixelY: Math.max(0, Math.min(s - 1, Math.floor((1 - a.y) * s)))
		};
	}
	_resolveHexPick(e, t) {
		let n = this._renderer.readSectorIdAt(e, t);
		if (n >= this._registry.idToHex.length) return null;
		let r = this._registry.idToHex[n], i = this._registry.getSector(r);
		return i === void 0 ? null : {
			hexKey: r,
			sectorData: i,
			pixelX: e,
			pixelY: t
		};
	}
}, N = class {
	constructor() {
		this._lastFrameTime = -1, this._isInTick = !1;
	}
	get inTick() {
		return this._isInTick;
	}
	reset() {
		this._lastFrameTime = -1;
	}
	tick(e) {
		let t = performance.now(), n = this._lastFrameTime === -1 ? 0 : (t - this._lastFrameTime) / 1e3;
		this._lastFrameTime = t, this._isInTick = !0;
		try {
			for (let t of [...e]) try {
				t(n);
			} catch (e) {
				console.error("[map-engine] FrameCallback threw:", e);
			}
		} finally {
			this._isInTick = !1;
		}
	}
}, P = "MapEngine: loadMap() was cancelled by dispose().", F = (e, t, n) => {
	if (!Number.isFinite(n)) throw RangeError(`MapEngine.${e}: ${t} must be finite`);
}, I = (e = []) => {
	let t = /* @__PURE__ */ new Set();
	for (let n of e) {
		let e = n.toLowerCase();
		if (!/^[0-9a-f]{6}$/.test(e)) throw RangeError("MapEngine.loadMap: ignoredColors must be six hex digits");
		t.add(e);
	}
	return t;
}, L = class {
	constructor() {
		this._isLoaded = !1, this._isDestroyed = !1, this._isLoading = !1, this._pendingCamera = null, this._registry = null, this._renderer = null, this._picker = null, this._frameCallbacks = [], this._tickRate = 60, this._loadGeneration = 0, this._workerFailure = null, this._rejectAck = null, this._proxy = null, this._isRegistryInvalidated = !1, this._lastBootstrapAck = null, this._mapModes = /* @__PURE__ */ new Map(), this._currentMapMode = null, this._areCostsReady = !1, this._pool = null, this._anchorPool = null, this._borderPool = null, this._parser = new f(), this._events = new j(), this._renderClock = new N(), this._worker = this._spawnWorker(), this._borderCoalescer = new A(() => this._proxy.call("recomputeBorders"), () => !this._isDestroyed && this._isLoaded && !!this._proxy);
	}
	on(e, t) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		this._events.on(e, t);
	}
	off(e, t) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		this._events.off(e, t);
	}
	onFrame(e) {
		this._isDestroyed || this._frameCallbacks.push(e);
	}
	offFrame(e) {
		if (this._isDestroyed) return;
		let t = this._frameCallbacks.indexOf(e);
		t !== -1 && this._frameCallbacks.splice(t, 1);
	}
	async pick(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		return this._isLoaded ? this._picker.pick(e) : null;
	}
	setTickRate(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (this._isLoaded) throw Error("MapEngine: setTickRate() cannot be called after loadMap() has resolved");
		if (Number.isNaN(e) || e < 1 || e > 240) throw RangeError(`MapEngine: setTickRate(hz) requires 1 <= hz <= 240 (received ${e})`);
		this._tickRate = e;
	}
	get tickRate() {
		return this._tickRate;
	}
	async loadMap(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (this._isLoading) throw Error("MapEngine: loadMap() is already in progress");
		let t = I(e.ignoredColors);
		this._isLoaded && (this._proxy?.rejectAll(new s()), this._proxy = null, this._pool?.dispose(), this._pool = null, this._anchorPool?.dispose(), this._anchorPool = null, this._borderPool?.dispose(), this._borderPool = null, this._borderCoalescer.reset(), this._renderer?.destroy(), this._worker?.terminate(), this._worker = null, this._renderClock.reset(), this._registry = null, this._renderer = null, this._picker = null, this._isRegistryInvalidated = !1, this._isLoaded = !1, this._mapModes.clear(), this._currentMapMode = null, this._areCostsReady = !1), this._isLoading = !0;
		let n = this._loadGeneration, r = this._worker ??= this._spawnWorker(), i = null;
		try {
			if (this._workerFailure) throw this._workerFailure;
			let [{ buffer: a, width: o, height: s }, c] = await Promise.all([this._parser.parse(e.bitmapUrl), fetch(e.definitionUrl).then((e) => {
				if (!e.ok) throw Error(`Failed to load definition: HTTP ${e.status} ${e.statusText}`);
				return e.json();
			})]);
			this._throwIfCancelled(n);
			let l = new m(a, o, s, c, t), u;
			u = new C(e.canvas, l, () => {
				this._renderClock.tick(this._frameCallbacks);
			}, (e) => this._picker?.handlePointer(e, !1), (e) => this._picker?.handlePointer(e, !0)), i = u, u._pauseLoop();
			let d = {
				bboxes: l.bboxes.slice(),
				centroids: l.centroids.slice(),
				adjacencyPointers: l.adjacencyPointers.slice(),
				adjacencyNeighbors: l.adjacencyNeighbors.slice()
			}, f = l.idToHex.length, p = {
				pixelIndices: l.pixelIndices,
				bboxes: l.bboxes,
				centroids: l.centroids,
				adjacencyPointers: l.adjacencyPointers,
				adjacencyNeighbors: l.adjacencyNeighbors,
				contourPointers: l.contourPointers,
				contourPoints: l.contourPoints,
				borderEdges: l.borderEdges,
				borderEdgeCount: l.borderEdgeCount,
				width: l.width,
				height: l.height,
				sectorCount: f,
				tickHz: this._tickRate
			}, h = new Promise((e, t) => {
				this._rejectAck = t;
				let n = (t) => {
					t.data.type === "BOOTSTRAP_ACK" && (r.removeEventListener("message", n), this._rejectAck = null, e(t.data.payload));
				};
				r.addEventListener("message", n);
			});
			if (this._workerFailure) throw this._workerFailure;
			r.postMessage({
				type: "BOOTSTRAP",
				payload: p
			}, [
				p.pixelIndices.buffer,
				p.bboxes.buffer,
				p.centroids.buffer,
				p.adjacencyPointers.buffer,
				p.adjacencyNeighbors.buffer,
				p.contourPointers.buffer,
				p.contourPoints.buffer,
				p.borderEdges.buffer,
				p.borderEdgeCount.buffer
			]), this._isRegistryInvalidated = !0;
			let g = await h;
			this._throwIfCancelled(n), this._lastBootstrapAck = g, this._rejectAck = null, this._proxy = new E(r, d), this._pool = new D(r, () => {
				u._isDirty = !0;
			}), this._anchorPool = new O(r, () => {
				u._isDirty = !0;
			}), this._borderPool = new k(r, (e, t) => {
				u._receiveBorderEdges(e, t);
			}), u._postRenderHook = () => {
				this._pool.flushBounces(), this._anchorPool.flushBounces(), this._borderPool.flushBounces();
			}, u._onViewChange = (e) => this._events.emit("viewChange", e), this._applyPendingCamera(u), u._resumeLoop(), this._registry = l, this._renderer = u, this._picker = new M(u, l, e.canvas, (e, t) => this._events.emit(e, t)), this._isLoaded = !0, this._isLoading = !1, this._pendingCamera = null;
		} catch (e) {
			throw i && i !== this._renderer && i.destroy(), n === this._loadGeneration ? (this._rejectAck = null, e instanceof c && (r.terminate(), this._worker = this._spawnWorker()), this._isLoading = !1, e) : e;
		}
	}
	async dispose() {
		this._isDestroyed || (this._loadGeneration++, this._rejectAck?.(new s(P)), this._rejectAck = null, this._proxy?.rejectAll(new s()), this._proxy = null, this._pool?.dispose(), this._pool = null, this._anchorPool?.dispose(), this._anchorPool = null, this._borderPool?.dispose(), this._borderPool = null, this._borderCoalescer.reset(), this._mapModes.clear(), this._currentMapMode = null, this._pendingCamera = null, this._frameCallbacks = [], this._renderer && this._renderer.destroy(), this._events.clear(), this._registry = null, this._renderer = null, this._picker = null, this._isLoading = !1, this._worker?.terminate(), this._isLoaded ? this._isDestroyed = !0 : this._worker = null);
	}
	destroy() {
		this.dispose();
	}
	get lastBootstrapAck() {
		return this._lastBootstrapAck;
	}
	get renderer() {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		return this._renderer;
	}
	get registry() {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		if (this._isRegistryInvalidated) throw new s();
		return this._registry;
	}
	getSector(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		return this._registry.getSector(e);
	}
	getSectorKeys() {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		return this._registry.getSectorKeys();
	}
	getSectorId(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		return this._registry.getNumericId(e);
	}
	getSectorKey(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		return this._registry.idToHex[e];
	}
	setSectorColor(e, t) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		this._renderer.setSectorColor(e, t);
	}
	resetSectorColor(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		this._renderer.resetSectorColor(e);
	}
	registerMapMode(e, t) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw new o("registerMapMode");
		if (this._mapModes.has(e)) throw Error(`MapEngine: map mode '${e}' is already registered`);
		let n = this._registry.idToHex.length;
		if (t.length !== n) throw Error(`MapEngine: registerMapMode colors.length (${t.length}) !== sectorCount (${n})`);
		this._mapModes.set(e, t);
	}
	setMapMode(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw new o("setMapMode");
		let t = this._mapModes.get(e);
		if (!t) throw Error(`Unknown map mode: ${e}`);
		this._currentMapMode !== e && (this._currentMapMode = e, this._renderer.setPalette(t));
	}
	getNeighbors(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		if (typeof e == "number") return this._proxy.getNeighborIdsByNumericId(e);
		let t = this._registry.getNumericId(e);
		if (!(t === void 0 || this._registry.getSector(e) === void 0)) return this._proxy.getNeighborIdsByNumericId(t).map((e) => this._registry.idToHex[e]);
	}
	getBBox(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		let t = typeof e == "number" ? e : this._registry.getNumericId(e);
		if (t === void 0) throw Error(`MapEngine: unknown sector '${e}'`);
		return this._proxy.getBBoxByNumericId(t);
	}
	getCentroid(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		let t = typeof e == "number" ? e : this._registry.getNumericId(e);
		if (t === void 0) throw Error(`MapEngine: unknown sector '${e}'`);
		return this._proxy.getCentroidByNumericId(t);
	}
	async setTraversalCosts(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		if (e.byteOffset !== 0 || e.byteLength !== e.buffer.byteLength) throw Error("MapEngine.setTraversalCosts: costs must be a Uint8Array over the whole of its own ArrayBuffer (byteOffset 0, byteLength === buffer.byteLength) — pass a fresh allocation, not a sub-view.");
		await this._proxy.call("setTraversalCosts", e, [e.buffer]), this._areCostsReady = !0;
	}
	async findPath(e, t) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		if (!this._areCostsReady) throw new a();
		return this._proxy.call("findPath", {
			startId: e,
			endId: t
		});
	}
	async setParentMapping(e, t) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		if (e.byteOffset !== 0 || e.byteLength !== e.buffer.byteLength) throw Error("MapEngine.setParentMapping: mapping must be a Uint16Array over the whole of its own ArrayBuffer (byteOffset 0, byteLength === buffer.byteLength) — pass a fresh allocation, not a sub-view.");
		await this._proxy.call("setParentMapping", {
			mapping: e,
			maxGroups: t
		}, [e.buffer]);
	}
	async aggregateGroups() {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		await this._proxy.call("aggregateGroups");
	}
	getGroupBBox(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		return this._pool.getGroupBBox(e);
	}
	async computeAnchors() {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		await this._proxy.call("computeAnchors");
	}
	getAnchor(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		return this._anchorPool.getAnchor(e);
	}
	recomputeBorders() {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		return this._borderCoalescer.request();
	}
	getBorderSegments() {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		return this._renderer.getBorderSegments();
	}
	setBordersVisible(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		this._renderer.setBordersVisible(e);
	}
	project(e, t) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (!this._isLoaded) throw Error("MapEngine: not loaded — call loadMap() first");
		return this._renderer.project(e, t);
	}
	getView() {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		return this._isLoaded ? this._renderer._getView() : null;
	}
	setView(e) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		if (F("setView", "centerX", e.centerX ?? 0), F("setView", "centerY", e.centerY ?? 0), F("setView", "zoom", e.zoom ?? 1), !this._isLoaded) {
			this._pendingCamera = {
				kind: "view",
				view: { ...e }
			};
			return;
		}
		this._renderer._setView(e);
	}
	fitBounds(e, t = {}) {
		if (this._isDestroyed) throw Error("MapEngine: destroyed");
		let [n, r, i, a] = e;
		if (F("fitBounds", "minX", n), F("fitBounds", "minY", r), F("fitBounds", "maxX", i), F("fitBounds", "maxY", a), n > i || r > a) throw RangeError("MapEngine.fitBounds: bbox must have min <= max");
		let o = t.padding ?? 0;
		if (F("fitBounds", "padding", o), o < 0) throw RangeError("MapEngine.fitBounds: padding must be >= 0");
		let s = t.fit ?? "contain";
		if (s !== "contain" && s !== "cover") throw RangeError("MapEngine.fitBounds: fit must be \"contain\" or \"cover\"");
		if (!this._isLoaded) {
			this._pendingCamera = {
				kind: "fit",
				bbox: [
					n,
					r,
					i,
					a
				],
				options: { ...t }
			};
			return;
		}
		this._renderer._fitBounds(e, o, t.keepOnResize ?? !1, s);
	}
	_applyPendingCamera(e) {
		let t = this._pendingCamera;
		if (!t) return;
		if (t.kind === "view") {
			e._setView(t.view);
			return;
		}
		let { padding: n = 0, keepOnResize: r = !1, fit: i = "contain" } = t.options;
		e._fitBounds(t.bbox, n, r, i);
	}
	_throwIfCancelled(e) {
		if (e !== this._loadGeneration) throw new s(P);
	}
	_spawnWorker() {
		let e = this._createWorker(), t = (t) => {
			e !== this._worker || this._isLoaded || (this._workerFailure = new c(t), this._rejectAck?.(this._workerFailure));
		};
		return e.addEventListener("error", (e) => t(e.message || "the worker script did not load")), e.addEventListener("messageerror", () => t("a message could not be deserialized")), this._workerFailure = null, e;
	}
	_createWorker() {
		return new Worker(new URL(
			/* @vite-ignore */
			"" + new URL("assets/index-71McDCZ7.js", import.meta.url).href,
			"" + import.meta.url
		), { type: "module" });
	}
};
//#endregion
export { a as CostsRequiredError, L as MapEngine, L as default, s as MapInvalidatedError, C as MapRenderer, r as MappingRequiredError, o as ModeNotReadyError, i as PathNotFoundError, N as RenderClock, f as SectorBitmapParser, t as SectorLimitExceededError, m as SectorRegistry, n as WebGL2NotSupportedError, c as WorkerStartError, u as toHexKey };
