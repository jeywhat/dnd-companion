/**
 * Whiteboard renderer — hybrid Canvas + DOM (always-visible background).
 *
 * Canvas layer: grid lines, map images (efficient redraw on zoom/pan).
 * DOM overlay:  tokens positioned via worldToScreen (keeps data-action delegation).
 *
 * Render pipeline: clearCanvas → applyTransform → drawGrid → drawMaps → positionTokens.
 */

import { state, appElement } from "../../app/store.js";
import { escapeHtml } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";
import { PLAYER_ID } from "../../adapters/firebase-sync.js";
import {
  camera, GRID_SIZE, worldToScreen, tools,
} from "./camera.js";

// ─── Runtime whiteboard state (populated by SSE) ─────────────────────────────

export const wb = {
  maps: {},       // { [mapId]: { id, url, name, x, y, width, height, zIndex } }
  tokens: {},     // { [tokenId]: { id, type, ownerId, name, worldX, worldY, color, locked } }
  cameraSynced: false,
  gridSnap: true,
};

// Image cache for canvas drawing (avoids re-creating Image objects every frame)
const _imageCache = new Map(); // url → { img: HTMLImageElement, loaded: boolean }

function getCachedImage(url) {
  if (!url) return null;
  if (_imageCache.has(url)) {
    const entry = _imageCache.get(url);
    return entry.loaded ? entry.img : null;
  }
  const img = new Image();
  if (url.startsWith("http")) img.crossOrigin = "anonymous";
  const entry = { img, loaded: false };
  _imageCache.set(url, entry);
  img.onload = () => { entry.loaded = true; requestBoardRedraw(); };
  img.onerror = () => { entry.loaded = false; };
  img.src = url;
  return null;
}

// ─── Redraw scheduling ────────────────────────────────────────────────────────

let _rafId = 0;

export function requestBoardRedraw() {
  if (_rafId) return;
  _rafId = requestAnimationFrame(() => {
    _rafId = 0;
    drawBoard();
    positionTokens();
  });
}

// ─── Main render entry point (called by app/renderer.js) ─────────────────────

export function renderWhiteboard() {
  // Whiteboard is always-visible background — render regardless of active tab
  const toolbar = appElement.querySelector("[data-wb-toolbar]");
  const playerBar = appElement.querySelector("[data-wb-player-bar]");
  const zoomLabel = appElement.querySelector("[data-wb-zoom]");

  const isGm = state.room?.role === "gm";
  const inRoom = !!(state.room?.code && state.settings?.firebaseUrl);

  // Floating toolbar visibility (GM + in room)
  if (toolbar) toolbar.hidden = !isGm || !inRoom;

  // Tool active state
  appElement.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.classList.toggle("wb-tool-active", btn.dataset.tool === tools.active);
  });

  // Grid snap toggle
  const snapBtn = appElement.querySelector("[data-action='wb-toggle-snap']");
  if (snapBtn) snapBtn.classList.toggle("wb-tool-active", wb.gridSnap);

  // Zoom display
  if (zoomLabel) zoomLabel.textContent = t("whiteboard.zoom", { pct: Math.round(camera.zoom * 100) });

  // Camera sync button
  const syncBtn = appElement.querySelector("[data-action='wb-sync-camera']");
  if (syncBtn) {
    syncBtn.textContent = wb.cameraSynced
      ? t("whiteboard.toolbar.unsyncCamera")
      : t("whiteboard.toolbar.syncCamera");
  }

  // Resize canvas
  resizeCanvas();

  // Redraw canvas + tokens
  requestBoardRedraw();

  // Player bar
  if (playerBar) renderPlayerBar(playerBar, isGm, inRoom);
}

// ─── Canvas sizing ────────────────────────────────────────────────────────────

function resizeCanvas() {
  const canvas = appElement.querySelector("[data-wb-canvas]");
  if (!canvas) return;
  const container = canvas.parentElement;
  if (!container) return;

  const w = container.clientWidth;
  const h = container.clientHeight;

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

// ─── Canvas drawing ───────────────────────────────────────────────────────────

function drawBoard() {
  const canvas = appElement.querySelector("[data-wb-canvas]");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  if (width === 0 || height === 0) return;

  ctx.clearRect(0, 0, width, height);
  ctx.save();

  // Apply camera transform: world → screen
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.offsetX, -camera.offsetY);

  drawMaps(ctx);
  drawGrid(ctx, width, height);

  ctx.restore();

  // Draw empty state hint if no maps and no tokens
  if (Object.keys(wb.maps).length === 0 && Object.keys(wb.tokens).length === 0) {
    drawEmptyState(ctx, width, height);
  }
}

function drawGrid(ctx, canvasW, canvasH) {
  // Determine visible world rectangle
  const topLeft = { x: camera.offsetX, y: camera.offsetY };
  const bottomRight = {
    x: camera.offsetX + canvasW / camera.zoom,
    y: camera.offsetY + canvasH / camera.zoom,
  };

  const startX = Math.floor(topLeft.x / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(topLeft.y / GRID_SIZE) * GRID_SIZE;
  const endX = Math.ceil(bottomRight.x / GRID_SIZE) * GRID_SIZE;
  const endY = Math.ceil(bottomRight.y / GRID_SIZE) * GRID_SIZE;

  ctx.strokeStyle = "rgba(139, 92, 246, 0.12)";
  ctx.lineWidth = 1 / camera.zoom; // 1 screen pixel regardless of zoom

  ctx.beginPath();
  for (let x = startX; x <= endX; x += GRID_SIZE) {
    ctx.moveTo(x, topLeft.y);
    ctx.lineTo(x, bottomRight.y);
  }
  for (let y = startY; y <= endY; y += GRID_SIZE) {
    ctx.moveTo(topLeft.x, y);
    ctx.lineTo(bottomRight.x, y);
  }
  ctx.stroke();
}

function drawMaps(ctx) {
  const sorted = Object.values(wb.maps)
    .filter(Boolean)
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  for (const map of sorted) {
    const img = getCachedImage(map.url);
    if (!img) continue;

    const w = (map.width ?? 10) * GRID_SIZE;
    const h = (map.height ?? 10) * GRID_SIZE;
    const mx = map.x ?? 0;
    const my = map.y ?? 0;

    ctx.drawImage(img, mx, my, w, h);

    // Highlight selected map in map-tool mode (GM)
    if (tools.active === "map" && state.room?.role === "gm") {
      ctx.strokeStyle = "rgba(139, 92, 246, 0.5)";
      ctx.lineWidth = 2 / camera.zoom;
      ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
      ctx.strokeRect(mx, my, w, h);
      ctx.setLineDash([]);
    }
  }
}

function drawEmptyState(ctx, w, h) {
  const isGm = state.room?.role === "gm";
  const text = isGm ? t("whiteboard.empty") : t("whiteboard.emptyPlayer");
  ctx.fillStyle = "rgba(203, 213, 225, 0.4)";
  ctx.font = "16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
}

// ─── Token DOM positioning ────────────────────────────────────────────────────

function positionTokens() {
  const overlay = appElement.querySelector("[data-wb-overlay]");
  if (!overlay) return;

  const isGm = state.room?.role === "gm";
  const existingIds = new Set();

  for (const [tokenId, token] of Object.entries(wb.tokens)) {
    if (token == null) continue;
    existingIds.add(tokenId);

    let el = overlay.querySelector(`[data-token-id="${tokenId}"]`);
    if (!el) {
      el = createTokenElement(token, isGm);
      overlay.appendChild(el);
    }

    // Convert world → screen for positioning (skip if being dragged)
    if (!el.classList.contains("wb-dragging")) {
      const wx = token.worldX ?? token.x ?? 350;
      const wy = token.worldY ?? token.y ?? 350;
      const screen = worldToScreen(wx, wy);
      el.style.left = `${screen.x}px`;
      el.style.top = `${screen.y}px`;
    }

    // Scale token size with zoom
    el.style.transform = `translate(-50%, -50%) scale(${camera.zoom})`;

    // Update visual state
    el.classList.toggle("wb-locked", !!token.locked);
    const label = el.querySelector(".wb-token-label");
    if (label) label.textContent = token.name || "?";
    const circle = el.querySelector(".wb-token-circle");
    if (circle) circle.style.backgroundColor = token.color || "#7c3aed";
    const initials = el.querySelector(".wb-token-initials");
    if (initials) initials.textContent = getInitials(token.name);
    const controls = el.querySelector(".wb-token-controls");
    if (controls) controls.hidden = !isGm;
  }

  // Remove orphan DOM elements
  overlay.querySelectorAll("[data-token-id]").forEach((el) => {
    if (!existingIds.has(el.dataset.tokenId)) el.remove();
  });
}

function createTokenElement(token, isGm) {
  const el = document.createElement("div");
  el.className = `wb-token wb-token-${token.type || "monster"}`;
  el.dataset.tokenId = token.id;
  el.dataset.ownerId = token.ownerId || "";

  const typeBadge = token.type === "player"
    ? `<span class="wb-token-badge wb-token-badge-player">${t("whiteboard.token.player")}</span>`
    : `<span class="wb-token-badge wb-token-badge-monster">${t("whiteboard.token.monster")}</span>`;

  el.innerHTML = `
    <div class="wb-token-circle" style="background-color:${escapeHtml(token.color || "#7c3aed")}">
      <span class="wb-token-initials">${escapeHtml(getInitials(token.name))}</span>
    </div>
    <span class="wb-token-label">${escapeHtml(token.name || "?")}</span>
    ${typeBadge}
    <div class="wb-token-controls" ${isGm ? "" : "hidden"}>
      <button type="button" class="wb-ctrl-btn" data-action="wb-delete-token" data-token-id="${escapeHtml(token.id)}" title="${t("whiteboard.token.delete")}">✕</button>
      <button type="button" class="wb-ctrl-btn" data-action="wb-toggle-lock" data-token-id="${escapeHtml(token.id)}" title="${token.locked ? t("whiteboard.token.unlock") : t("whiteboard.token.lock")}">${token.locked ? "🔓" : "🔒"}</button>
    </div>
  `;

  return el;
}

// ─── Player bar ───────────────────────────────────────────────────────────────

function renderPlayerBar(bar, isGm, inRoom) {
  if (!inRoom || isGm) {
    bar.hidden = true;
    return;
  }

  const myToken = Object.values(wb.tokens).find(
    (tk) => tk && tk.type === "player" && tk.ownerId === PLAYER_ID
  );

  if (!myToken) {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;

  const existing = bar.querySelector("[data-my-token]");
  if (existing && existing.dataset.tokenId === myToken.id) return;

  bar.innerHTML = `
    <div class="wb-player-bar-inner">
      <span class="wb-player-bar-label">${t("whiteboard.myToken")} :</span>
      <div class="wb-player-token" data-my-token data-token-id="${escapeHtml(myToken.id)}">
        <div class="wb-token-circle wb-token-circle-small" style="background-color:${escapeHtml(myToken.color || "#7c3aed")}">
          <span class="wb-token-initials">${escapeHtml(getInitials(myToken.name))}</span>
        </div>
        <span>${escapeHtml(myToken.name)}</span>
      </div>
      <span class="muted" style="font-size:0.75rem">${t("whiteboard.dragHint")}</span>
    </div>
  `;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

