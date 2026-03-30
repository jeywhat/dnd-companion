/**
 * Camera module — world coordinate system for the VTT whiteboard.
 *
 * All map images and tokens are positioned in "world space" (pixels at zoom 1.0).
 * The camera defines which portion of the world is visible on screen via
 * zoom level and an offset (top-left corner in world coords).
 *
 * Grid cells are GRID_SIZE × GRID_SIZE world-pixels (70 px = ~1 inch at 72 dpi,
 * matching Roll20's default grid).
 */

export const GRID_SIZE = 70;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;

export const camera = {
  zoom: 1.0,
  offsetX: 0,  // world-space X of the viewport top-left corner
  offsetY: 0,
};

// ─── Coordinate conversion ────────────────────────────────────────────────────

/** Convert world coords → screen (canvas) pixels. */
export function worldToScreen(wx, wy) {
  return {
    x: (wx - camera.offsetX) * camera.zoom,
    y: (wy - camera.offsetY) * camera.zoom,
  };
}

/** Convert screen (canvas) pixels → world coords. */
export function screenToWorld(sx, sy) {
  return {
    x: sx / camera.zoom + camera.offsetX,
    y: sy / camera.zoom + camera.offsetY,
  };
}

/** Snap world coords to the nearest grid intersection. */
export function snapToGrid(wx, wy) {
  return {
    x: Math.round(wx / GRID_SIZE) * GRID_SIZE,
    y: Math.round(wy / GRID_SIZE) * GRID_SIZE,
  };
}

/** Snap world coords to the nearest grid cell center. */
export function snapToGridCenter(wx, wy) {
  return {
    x: Math.floor(wx / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2,
    y: Math.floor(wy / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2,
  };
}

// ─── Zoom ─────────────────────────────────────────────────────────────────────

/**
 * Zoom centered on a screen position (e.g. cursor).
 * @param {number} delta - Positive = zoom in, negative = zoom out
 * @param {number} screenX - Cursor X in canvas pixels
 * @param {number} screenY - Cursor Y in canvas pixels
 */
export function zoomAt(delta, screenX, screenY) {
  const worldBefore = screenToWorld(screenX, screenY);
  camera.zoom = clampZoom(camera.zoom + delta * ZOOM_STEP);
  const worldAfter = screenToWorld(screenX, screenY);
  // Adjust offset so the world point under the cursor stays fixed
  camera.offsetX += worldBefore.x - worldAfter.x;
  camera.offsetY += worldBefore.y - worldAfter.y;
}

/** Set zoom to a specific level, centered on screen center. */
export function setZoom(level, screenW, screenH) {
  const cx = screenW / 2;
  const cy = screenH / 2;
  const worldBefore = screenToWorld(cx, cy);
  camera.zoom = clampZoom(level);
  const worldAfter = screenToWorld(cx, cy);
  camera.offsetX += worldBefore.x - worldAfter.x;
  camera.offsetY += worldBefore.y - worldAfter.y;
}

function clampZoom(z) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z * 100) / 100));
}

// ─── Pan ──────────────────────────────────────────────────────────────────────

/**
 * Pan by screen pixel deltas.
 * @param {number} dx - Screen pixels moved horizontally
 * @param {number} dy - Screen pixels moved vertically
 */
export function panBy(dx, dy) {
  camera.offsetX -= dx / camera.zoom;
  camera.offsetY -= dy / camera.zoom;
}

/** Reset camera to default position. */
export function resetCamera() {
  camera.zoom = 1.0;
  camera.offsetX = 0;
  camera.offsetY = 0;
}

/** Apply a full camera state (from Firebase sync). */
export function applyCamera(cam) {
  if (!cam || typeof cam !== "object") return;
  if (typeof cam.zoom === "number") camera.zoom = clampZoom(cam.zoom);
  if (typeof cam.offsetX === "number") camera.offsetX = cam.offsetX;
  if (typeof cam.offsetY === "number") camera.offsetY = cam.offsetY;
}

/** Export camera state for Firebase. */
export function exportCamera() {
  return {
    zoom: camera.zoom,
    offsetX: Math.round(camera.offsetX * 100) / 100,
    offsetY: Math.round(camera.offsetY * 100) / 100,
  };
}

// ─── Tool mode ────────────────────────────────────────────────────────────────

export const tools = {
  active: "select", // "select" | "pan" | "map"
};

export function setTool(name) {
  if (["select", "pan", "map"].includes(name)) {
    tools.active = name;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export { MIN_ZOOM, MAX_ZOOM };
