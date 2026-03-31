/**
 * InfiniteCanvas — whiteboard VTT à zoom/pan infini.
 *
 * Coordonnées MONDE (unités virtuelles, pas pixels).
 * Camera = { zoom, offsetX, offsetY } en pixels écran.
 *
 * Transforms :
 *   screenX = worldX * zoom + offsetX
 *   worldX  = (screenX - offsetX) / zoom
 */

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const GRID_COLOR = "rgba(165, 180, 252, 0.12)";
const GRID_COLOR_MAJOR = "rgba(165, 180, 252, 0.25)";
const GRID_MAJOR_EVERY = 5;

export class InfiniteCanvas {
  /** @type {HTMLCanvasElement} */
  canvas = null;
  /** @type {CanvasRenderingContext2D} */
  ctx = null;

  camera = { zoom: 1, offsetX: 0, offsetY: 0 };
  gridSize = 50;
  snapToGrid = true;
  showGrid = true;

  // Items to draw
  tokens = [];
  maps = [];

  // Selection
  selectedTokenId = null;

  // Interaction state
  _isPanning = false;
  _lastMouse = { x: 0, y: 0 };
  _spaceHeld = false;
  _draggedToken = null;
  _dragOffset = { x: 0, y: 0 };
  _rafId = null;
  _dirty = true;

  // Touch pinch state
  _touchState = { lastDist: 0, lastCenter: null };

  // Callbacks
  /** @type {((token) => boolean)|null} Permission check — return false to block drag */
  canDragToken = null;
  onTokenMoved = null;
  onTokenSelected = null;
  onTokenDelete = null;
  onCameraChanged = null;
  onCursorMove = null;
  /** @type {((files: FileList, worldPos: {x:number,y:number}) => void)|null} */
  onFileDrop = null;

  // Mini-map & drop zone
  showMiniMap = true;
  _isFileDragging = false;

  constructor(canvasEl, options = {}) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d");
    this.gridSize = options.gridSize ?? 50;
    this.snapToGrid = options.snapToGrid ?? true;

    this._bindEvents();
    this._resize();
    this._loop();
    console.log("[InfiniteCanvas] ✅ Initialized", { gridSize: this.gridSize });
  }

  // ── Coordinate transforms ─────────────────────────────────────────────────

  worldToScreen(wx, wy) {
    return {
      x: wx * this.camera.zoom + this.camera.offsetX,
      y: wy * this.camera.zoom + this.camera.offsetY,
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.camera.offsetX) / this.camera.zoom,
      y: (sy - this.camera.offsetY) / this.camera.zoom,
    };
  }

  snapWorld(wx, wy) {
    if (!this.snapToGrid) return { x: wx, y: wy };
    return {
      x: Math.round(wx / this.gridSize) * this.gridSize,
      y: Math.round(wy / this.gridSize) * this.gridSize,
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setCamera(zoom, offsetX, offsetY) {
    this.camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    this.camera.offsetX = offsetX;
    this.camera.offsetY = offsetY;
    this._dirty = true;
  }

  resetView() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera = { zoom: 1, offsetX: w / 2, offsetY: h / 2 };
    this._dirty = true;
    this.onCameraChanged?.(this.camera);
    console.log("[InfiniteCanvas] 🏠 View reset");
  }

  zoomBy(factor, centerScreenX, centerScreenY) {
    const oldZoom = this.camera.zoom;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));

    // Keep the world point under the cursor fixed on screen
    this.camera.offsetX =
      centerScreenX - (centerScreenX - this.camera.offsetX) * (newZoom / oldZoom);
    this.camera.offsetY =
      centerScreenY - (centerScreenY - this.camera.offsetY) * (newZoom / oldZoom);
    this.camera.zoom = newZoom;
    this._dirty = true;
    this.onCameraChanged?.(this.camera);
  }

  requestRedraw() {
    this._dirty = true;
  }

  destroy() {
    this._unbindEvents();
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    console.log("[InfiniteCanvas] 🗑️ Destroyed");
  }

  // ── Render loop ───────────────────────────────────────────────────────────

  _loop() {
    if (this._dirty) {
      this._dirty = false;
      this._redraw();
    }
    this._rafId = requestAnimationFrame(() => this._loop());
  }

  _redraw() {
    const { ctx, canvas } = this;
    const dpr = globalThis.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.clearRect(0, 0, w, h);

    // Dark background
    ctx.fillStyle = "#0f1118";
    ctx.fillRect(0, 0, w, h);

    // Apply camera
    ctx.save();
    ctx.translate(this.camera.offsetX, this.camera.offsetY);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    if (this.showGrid) this._drawGrid(w, h);
    this._drawMaps();
    this._drawTokens();

    ctx.restore();

    // HUD (screen space)
    this._drawHUD(w, h);
    if (this.showMiniMap && (this.tokens.length > 0 || this.maps.length > 0)) {
      this._drawMiniMap(w, h);
    }
    if (this._isFileDragging) this._drawDropZone(w, h);
  }

  // ── Grid ──────────────────────────────────────────────────────────────────

  _drawGrid(viewW, viewH) {
    const { ctx, gridSize, camera } = this;
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(viewW, viewH);

    const startX = Math.floor(topLeft.x / gridSize) * gridSize;
    const startY = Math.floor(topLeft.y / gridSize) * gridSize;
    const endX = Math.ceil(bottomRight.x / gridSize) * gridSize;
    const endY = Math.ceil(bottomRight.y / gridSize) * gridSize;

    const lw = 1 / camera.zoom;

    // Minor lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      if (x % (gridSize * GRID_MAJOR_EVERY) === 0) continue;
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      if (y % (gridSize * GRID_MAJOR_EVERY) === 0) continue;
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // Major lines
    ctx.strokeStyle = GRID_COLOR_MAJOR;
    ctx.lineWidth = lw * 2;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      if (x % (gridSize * GRID_MAJOR_EVERY) !== 0) continue;
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      if (y % (gridSize * GRID_MAJOR_EVERY) !== 0) continue;
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // Origin axes
    ctx.strokeStyle = "rgba(139, 92, 246, 0.4)";
    ctx.lineWidth = lw * 2;
    ctx.beginPath();
    ctx.moveTo(0, startY);
    ctx.lineTo(0, endY);
    ctx.moveTo(startX, 0);
    ctx.lineTo(endX, 0);
    ctx.stroke();
  }

  // ── Maps (background images) ─────────────────────────────────────────────

  _drawMaps() {
    const { ctx } = this;
    for (const map of this.maps) {
      if (!map._img && map.url) this.loadMapImage(map);
      if (!map._img) continue;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(map._img, map.x, map.y, map.w, map.h);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Load an Image element from map.url and attach as map._img.
   * Triggers redraw on successful load.
   */
  loadMapImage(map) {
    if (map._img || map._loading) return;
    map._loading = true;
    const img = new Image();
    img.onload = () => {
      map._img = img;
      map._loading = false;
      if (!map.w) map.w = img.naturalWidth;
      if (!map.h) map.h = img.naturalHeight;
      this._dirty = true;
      console.log("[InfiniteCanvas] 🖼️ Map loaded:", map.id, img.naturalWidth, "×", img.naturalHeight);
    };
    img.onerror = () => {
      map._loading = false;
      console.warn("[InfiniteCanvas] ❌ Map load failed:", map.id);
    };
    img.src = map.url;
  }

  // ── Tokens ────────────────────────────────────────────────────────────────

  _drawTokens() {
    const { ctx, gridSize } = this;
    const halfGrid = gridSize / 2;
    const invZoom = 1 / this.camera.zoom;

    for (const token of this.tokens) {
      const isSelected = this.selectedTokenId === token.id;
      const isDragged = this._draggedToken?.id === token.id;
      const tokenSize = token.size || 40;
      const scale = isSelected ? 1.2 : 1;
      const r = (tokenSize / 2) * scale;

      const cx = token.x + halfGrid;
      const cy = token.y + halfGrid;
      const name = token.name || token.label || "";

      ctx.save();

      // Outer glow — green for players, red for monsters
      const glowColor =
        token.type === "monster"
          ? "rgba(239, 68, 68, 0.6)"
          : "rgba(0, 255, 136, 0.6)";
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = (isSelected ? 22 : 12) * invZoom;

      // Fill circle
      const fillColor = token.color || this._tokenColor(token.type);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Border (selected = bright white, dragged = cyan, default = subtle)
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = isSelected
        ? "rgba(255, 255, 255, 0.9)"
        : isDragged
          ? "rgba(56, 189, 248, 0.8)"
          : "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = (isSelected ? 3 : 1.5) * invZoom;
      ctx.stroke();

      // Initial letter inside circle
      if (name) {
        const fontSize = Math.max(10, (tokenSize / 2) * 1.1);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(name.charAt(0).toUpperCase(), cx, cy);
      }

      ctx.restore();

      // Name below circle (screen-readable, no glow)
      if (name) {
        ctx.save();
        const nameSize = Math.max(8, tokenSize * 0.3);
        ctx.font = `${nameSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(248, 250, 252, 0.8)";
        ctx.fillText(name, cx, cy + r + 3 * invZoom, gridSize * 1.5);
        ctx.restore();
      }
    }
  }

  _tokenColor(type) {
    switch (type) {
      case "player":
        return "rgba(34, 197, 94, 0.85)";
      case "monster":
        return "rgba(239, 68, 68, 0.85)";
      case "npc":
        return "rgba(56, 189, 248, 0.85)";
      default:
        return "rgba(168, 162, 158, 0.85)";
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  _drawHUD(w, h) {
    const { ctx, camera } = this;
    ctx.fillStyle = "rgba(248, 250, 252, 0.45)";
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`×${camera.zoom.toFixed(2)}`, 8, h - 8);
  }

  // ── Mini-map ──────────────────────────────────────────────────────────────

  _drawMiniMap(w, h) {
    const { ctx, camera } = this;
    const mmW = 160, mmH = 110;
    const mmX = w - mmW - 12;
    const mmY = h - mmH - 56; // above dock
    const pad = 8;

    const bounds = this._getWorldBounds();
    if (!bounds) return;

    const worldW = bounds.maxX - bounds.minX || 200;
    const worldH = bounds.maxY - bounds.minY || 200;
    const scale = Math.min((mmW - pad * 2) / worldW, (mmH - pad * 2) / worldH);

    // Background
    ctx.fillStyle = "rgba(4, 6, 14, 0.85)";
    ctx.strokeStyle = "rgba(165, 180, 252, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mmX, mmY, mmW, mmH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(mmX, mmY, mmW, mmH, 8);
    ctx.clip();

    const ox = mmX + mmW / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
    const oy = mmY + mmH / 2 - ((bounds.minY + bounds.maxY) / 2) * scale;

    // Draw maps as rectangles
    for (const map of this.maps) {
      ctx.fillStyle = "rgba(139, 92, 246, 0.25)";
      ctx.fillRect(ox + map.x * scale, oy + map.y * scale, map.w * scale, map.h * scale);
    }

    // Draw tokens as dots
    const halfGrid = this.gridSize / 2;
    for (const token of this.tokens) {
      const tx = ox + (token.x + halfGrid) * scale;
      const ty = oy + (token.y + halfGrid) * scale;
      ctx.fillStyle = this._tokenColor(token.type);
      ctx.beginPath();
      ctx.arc(tx, ty, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Viewport rectangle
    const vpTL = this.screenToWorld(0, 0);
    const vpBR = this.screenToWorld(w, h);
    const vpX = ox + vpTL.x * scale;
    const vpY = oy + vpTL.y * scale;
    const vpW = (vpBR.x - vpTL.x) * scale;
    const vpH = (vpBR.y - vpTL.y) * scale;
    ctx.strokeStyle = "rgba(248, 250, 252, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpX, vpY, vpW, vpH);

    ctx.restore();
  }

  _getWorldBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const halfGrid = this.gridSize / 2;

    for (const t of this.tokens) {
      const cx = t.x + halfGrid;
      const cy = t.y + halfGrid;
      minX = Math.min(minX, cx - 30);
      minY = Math.min(minY, cy - 30);
      maxX = Math.max(maxX, cx + 30);
      maxY = Math.max(maxY, cy + 30);
    }
    for (const m of this.maps) {
      minX = Math.min(minX, m.x);
      minY = Math.min(minY, m.y);
      maxX = Math.max(maxX, m.x + (m.w || 0));
      maxY = Math.max(maxY, m.y + (m.h || 0));
    }

    if (!isFinite(minX)) return null;
    // Add margin
    const mx = (maxX - minX) * 0.15 + 50;
    const my = (maxY - minY) * 0.15 + 50;
    return { minX: minX - mx, minY: minY - my, maxX: maxX + mx, maxY: maxY + my };
  }

  // ── Drop zone overlay ─────────────────────────────────────────────────────

  _drawDropZone(w, h) {
    const { ctx } = this;
    ctx.fillStyle = "rgba(139, 92, 246, 0.15)";
    ctx.fillRect(0, 0, w, h);

    // Dashed border
    ctx.setLineDash([12, 6]);
    ctx.strokeStyle = "rgba(139, 92, 246, 0.6)";
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.setLineDash([]);

    // Text
    ctx.fillStyle = "rgba(248, 250, 252, 0.8)";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("📤 Drop image here", w / 2, h / 2);
  }

  // ── Hit testing ───────────────────────────────────────────────────────────

  _hitToken(worldX, worldY) {
    const halfGrid = this.gridSize / 2;
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const t = this.tokens[i];
      const cx = t.x + halfGrid;
      const cy = t.y + halfGrid;
      const r = (t.size || 40) / 2;
      const dx = worldX - cx;
      const dy = worldY - cy;
      // Generous hit area (1.3× radius)
      if (dx * dx + dy * dy <= r * r * 1.7) return t;
    }
    return null;
  }

  // ── Mouse events ──────────────────────────────────────────────────────────

  _bindEvents() {
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onWheel = this._handleWheel.bind(this);
    this._onResize = () => this._resize();
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onContextMenu = (e) => e.preventDefault();
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);
    this._onDragOver = this._handleDragOver.bind(this);
    this._onDragLeave = this._handleDragLeave.bind(this);
    this._onDrop = this._handleDrop.bind(this);

    this.canvas.addEventListener("mousedown", this._onMouseDown);
    this.canvas.addEventListener("mousemove", this._onMouseMove);
    this.canvas.addEventListener("mouseup", this._onMouseUp);
    this.canvas.addEventListener("mouseleave", this._onMouseUp);
    this.canvas.addEventListener("wheel", this._onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this._onContextMenu);
    this.canvas.addEventListener("touchstart", this._onTouchStart, { passive: false });
    this.canvas.addEventListener("touchmove", this._onTouchMove, { passive: false });
    this.canvas.addEventListener("touchend", this._onTouchEnd);
    this.canvas.addEventListener("dragover", this._onDragOver);
    this.canvas.addEventListener("dragleave", this._onDragLeave);
    this.canvas.addEventListener("drop", this._onDrop);

    globalThis.addEventListener("resize", this._onResize);
    globalThis.addEventListener("keydown", this._onKeyDown);
    globalThis.addEventListener("keyup", this._onKeyUp);
  }

  _unbindEvents() {
    this.canvas.removeEventListener("mousedown", this._onMouseDown);
    this.canvas.removeEventListener("mousemove", this._onMouseMove);
    this.canvas.removeEventListener("mouseup", this._onMouseUp);
    this.canvas.removeEventListener("mouseleave", this._onMouseUp);
    this.canvas.removeEventListener("wheel", this._onWheel);
    this.canvas.removeEventListener("contextmenu", this._onContextMenu);
    this.canvas.removeEventListener("touchstart", this._onTouchStart);
    this.canvas.removeEventListener("touchmove", this._onTouchMove);
    this.canvas.removeEventListener("touchend", this._onTouchEnd);
    this.canvas.removeEventListener("dragover", this._onDragOver);
    this.canvas.removeEventListener("dragleave", this._onDragLeave);
    this.canvas.removeEventListener("drop", this._onDrop);
    globalThis.removeEventListener("resize", this._onResize);
    globalThis.removeEventListener("keydown", this._onKeyDown);
    globalThis.removeEventListener("keyup", this._onKeyUp);
  }

  _handleMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = this.screenToWorld(sx, sy);

    // Middle mouse or Space+Left → pan
    if (e.button === 1 || (e.button === 0 && this._spaceHeld)) {
      this._isPanning = true;
      this._lastMouse = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = "grabbing";
      e.preventDefault();
      return;
    }

    // Left click → select/drag token or pan
    if (e.button === 0) {
      const token = this._hitToken(world.x, world.y);
      if (token) {
        // Always select on click
        this.selectedTokenId = token.id;
        this.onTokenSelected?.(token);
        this._dirty = true;

        // Only drag if permission callback allows it
        const allowed = !this.canDragToken || this.canDragToken(token);
        if (allowed) {
          this._draggedToken = token;
          this._dragOffset = { x: world.x - token.x, y: world.y - token.y };
          this.canvas.style.cursor = "move";
          console.log("[InfiniteCanvas] 🎯 Token grabbed:", token.id);
        } else {
          console.log("[InfiniteCanvas] 🚫 No permission to drag:", token.id);
        }
      } else {
        // Click on empty → deselect + pan
        if (this.selectedTokenId) {
          this.selectedTokenId = null;
          this.onTokenSelected?.(null);
          this._dirty = true;
        }
        this._isPanning = true;
        this._lastMouse = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = "grabbing";
      }
    }
  }

  _handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = this.screenToWorld(sx, sy);

    this.onCursorMove?.(world);

    if (this._isPanning) {
      const dx = e.clientX - this._lastMouse.x;
      const dy = e.clientY - this._lastMouse.y;
      this.camera.offsetX += dx;
      this.camera.offsetY += dy;
      this._lastMouse = { x: e.clientX, y: e.clientY };
      this._dirty = true;
      return;
    }

    if (this._draggedToken) {
      let newX = world.x - this._dragOffset.x;
      let newY = world.y - this._dragOffset.y;
      if (this.snapToGrid) {
        const s = this.snapWorld(newX, newY);
        newX = s.x;
        newY = s.y;
      }
      this._draggedToken.x = newX;
      this._draggedToken.y = newY;
      this._dirty = true;
      return;
    }

    // Hover cursor
    const hit = this._hitToken(world.x, world.y);
    this.canvas.style.cursor = hit ? "pointer" : this._spaceHeld ? "grab" : "default";
  }

  _handleMouseUp() {
    if (this._isPanning) {
      this._isPanning = false;
      this.canvas.style.cursor = this._spaceHeld ? "grab" : "default";
      this.onCameraChanged?.(this.camera);
    }
    if (this._draggedToken) {
      console.log(
        "[InfiniteCanvas] 📍 Token dropped:",
        this._draggedToken.id,
        `(${this._draggedToken.x}, ${this._draggedToken.y})`
      );
      this.onTokenMoved?.(this._draggedToken);
      this._draggedToken = null;
      this.canvas.style.cursor = "default";
      this._dirty = true;
    }
  }

  _handleWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.zoomBy(factor, sx, sy);
  }

  _handleKeyDown(e) {
    if (e.code === "Space" && !this._spaceHeld) {
      this._spaceHeld = true;
      if (!this._isPanning && !this._draggedToken) {
        this.canvas.style.cursor = "grab";
      }
      e.preventDefault();
    }

    // Delete selected token
    if ((e.code === "Delete" || e.code === "Backspace") && this.selectedTokenId) {
      const token = this.tokens.find((t) => t.id === this.selectedTokenId);
      if (token && (!this.canDragToken || this.canDragToken(token))) {
        console.log("[InfiniteCanvas] 🗑️ Deleting token:", token.id);
        this.onTokenDelete?.(token);
        this.tokens = this.tokens.filter((t) => t.id !== this.selectedTokenId);
        this.selectedTokenId = null;
        this.onTokenSelected?.(null);
        this._dirty = true;
      }
      e.preventDefault();
    }
  }

  _handleKeyUp(e) {
    if (e.code === "Space") {
      this._spaceHeld = false;
      if (!this._isPanning) {
        this.canvas.style.cursor = "default";
      }
    }
  }

  // ── Touch events ──────────────────────────────────────────────────────────

  _handleTouchStart(e) {
    e.preventDefault();
    const touches = e.touches;

    if (touches.length === 1) {
      const rect = this.canvas.getBoundingClientRect();
      const sx = touches[0].clientX - rect.left;
      const sy = touches[0].clientY - rect.top;
      const world = this.screenToWorld(sx, sy);
      const token = this._hitToken(world.x, world.y);

      if (token) {
        this.selectedTokenId = token.id;
        this.onTokenSelected?.(token);
        const allowed = !this.canDragToken || this.canDragToken(token);
        if (allowed) {
          this._draggedToken = token;
          this._dragOffset = { x: world.x - token.x, y: world.y - token.y };
        }
        this._dirty = true;
      } else {
        this._isPanning = true;
        this._lastMouse = { x: touches[0].clientX, y: touches[0].clientY };
      }
    }

    if (touches.length === 2) {
      this._draggedToken = null;
      this._isPanning = false;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      this._touchState.lastDist = Math.hypot(dx, dy);
      this._touchState.lastCenter = {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
      };
    }
  }

  _handleTouchMove(e) {
    e.preventDefault();
    const touches = e.touches;

    if (touches.length === 1) {
      if (this._draggedToken) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = touches[0].clientX - rect.left;
        const sy = touches[0].clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        let newX = world.x - this._dragOffset.x;
        let newY = world.y - this._dragOffset.y;
        if (this.snapToGrid) {
          const s = this.snapWorld(newX, newY);
          newX = s.x;
          newY = s.y;
        }
        this._draggedToken.x = newX;
        this._draggedToken.y = newY;
        this._dirty = true;
      } else if (this._isPanning) {
        const dx = touches[0].clientX - this._lastMouse.x;
        const dy = touches[0].clientY - this._lastMouse.y;
        this.camera.offsetX += dx;
        this.camera.offsetY += dy;
        this._lastMouse = { x: touches[0].clientX, y: touches[0].clientY };
        this._dirty = true;
      }
    }

    if (touches.length === 2) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const center = {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
      };

      // Pinch zoom
      if (this._touchState.lastDist > 0) {
        const rect = this.canvas.getBoundingClientRect();
        const factor = dist / this._touchState.lastDist;
        this.zoomBy(factor, center.x - rect.left, center.y - rect.top);
      }

      // Two-finger pan
      if (this._touchState.lastCenter) {
        this.camera.offsetX += center.x - this._touchState.lastCenter.x;
        this.camera.offsetY += center.y - this._touchState.lastCenter.y;
        this._dirty = true;
      }

      this._touchState.lastDist = dist;
      this._touchState.lastCenter = center;
    }
  }

  _handleTouchEnd() {
    if (this._draggedToken) {
      this.onTokenMoved?.(this._draggedToken);
      this._draggedToken = null;
      this._dirty = true;
    }
    this._isPanning = false;
    this._touchState.lastDist = 0;
    this._touchState.lastCenter = null;
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  _resize() {
    const dpr = globalThis.devicePixelRatio || 1;
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._dirty = true;
    console.log("[InfiniteCanvas] 📐 Resized:", w, "×", h, "dpr:", dpr);
  }

  // ── File drag & drop ────────────────────────────────────────────────────

  _handleDragOver(e) {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!this._isFileDragging) {
      this._isFileDragging = true;
      this._dirty = true;
    }
  }

  _handleDragLeave(e) {
    // Only if leaving the canvas (not entering a child)
    if (e.relatedTarget && this.canvas.contains(e.relatedTarget)) return;
    this._isFileDragging = false;
    this._dirty = true;
  }

  _handleDrop(e) {
    e.preventDefault();
    this._isFileDragging = false;
    this._dirty = true;

    const files = e.dataTransfer?.files;
    if (!files?.length) return;

    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPos = this.screenToWorld(sx, sy);

    console.log("[InfiniteCanvas] 📂 Files dropped:", files.length, "at world", worldPos);
    this.onFileDrop?.(files, worldPos);
  }
}
