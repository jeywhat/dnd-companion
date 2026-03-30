/**
 * Whiteboard handler — VTT interactions.
 *
 * Manages: tool modes, zoom/pan, token drag, map drag (GM),
 * grid snapping, Firebase sync lifecycle, modals for token/map creation.
 */

import { state, setStatus, commit } from "../../app/store.js";
import { PLAYER_ID } from "../../adapters/firebase-sync.js";
import { t } from "../../shared/i18n.js";
import { uniqueId, escapeHtml } from "../../shared/dom.js";
import { wb, requestBoardRedraw } from "./renderer.js";
import {
  camera, GRID_SIZE, screenToWorld, snapToGridCenter,
  zoomAt, panBy, resetCamera, applyCamera, exportCamera,
  tools, setTool,
} from "./camera.js";
import {
  publishMap,
  updateMapPosition,
  deleteMap,
  clearAllMaps,
  publishToken,
  updateTokenPosition,
  deleteToken,
  clearAllTokens,
  publishCamera,
  clearCamera,
  connectWhiteboard,
  disconnectWhiteboard,
} from "../../adapters/whiteboard-sync.js";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

// ─── Interaction state ────────────────────────────────────────────────────────

let _dragging = null;    // { type: "token"|"map"|"pan", id?, startX, startY, startWX?, startWY? }
let _debounceTimer = 0;
let _spaceHeld = false;
let _listenersAttached = false;

/** Reset listener flag (called on locale switch when DOM is replaced). */
export function resetBoardListeners() {
  _listenersAttached = false;
  _dragging = null;
}

// ─── Room lifecycle ───────────────────────────────────────────────────────────

export function connectWhiteboardSync() {
  const { firebaseUrl, syncRoom } = state.settings;
  if (!firebaseUrl || !syncRoom) return;

  connectWhiteboard({
    firebaseUrl,
    roomId: syncRoom,
    onMaps: (event, data, mapId) => {
      switch (event) {
        case "snapshot":
          wb.maps = data && typeof data === "object" ? { ...data } : {};
          break;
        case "put":
          if (data && mapId) wb.maps[mapId] = data;
          break;
        case "delete":
          if (mapId) delete wb.maps[mapId];
          break;
        case "patch":
        case "field":
          if (mapId && wb.maps[mapId]) Object.assign(wb.maps[mapId], data);
          break;
      }
      requestBoardRedraw();
    },
    onTokens: (event, data, tokenId) => {
      switch (event) {
        case "snapshot":
          wb.tokens = data && typeof data === "object" ? { ...data } : {};
          break;
        case "put":
          if (data && tokenId) wb.tokens[tokenId] = data;
          break;
        case "delete":
          if (tokenId) delete wb.tokens[tokenId];
          break;
        case "patch":
        case "field":
          if (tokenId && wb.tokens[tokenId]) Object.assign(wb.tokens[tokenId], data);
          break;
      }
      requestBoardRedraw();
    },
    onCamera: (data) => {
      // Players follow GM camera when synced
      if (state.room?.role === "player" && data?.synced) {
        applyCamera(data);
        wb.cameraSynced = true;
        requestBoardRedraw();
      } else if (state.room?.role === "gm") {
        wb.cameraSynced = !!data?.synced;
      }
      commit(false);
    },
  });
}

export function disconnectWhiteboardSync() {
  disconnectWhiteboard();
  wb.maps = {};
  wb.tokens = {};
  wb.cameraSynced = false;
}

export function reconnectWhiteboardSync() {
  if (state.room?.code && state.settings?.firebaseUrl) {
    connectWhiteboardSync();
  }
}

// ─── Action handler ───────────────────────────────────────────────────────────

/** @returns {boolean} */
export async function handleWhiteboardAction(button) {
  const { action } = button.dataset;

  // ── Tool selection ──────────────────────────────────────────────────────
  if (action === "wb-set-tool") {
    setTool(button.dataset.tool);
    commit(false);
    return true;
  }

  // ── Grid snap toggle ────────────────────────────────────────────────────
  if (action === "wb-toggle-snap") {
    wb.gridSnap = !wb.gridSnap;
    commit(false);
    return true;
  }

  // ── Reset view ──────────────────────────────────────────────────────────
  if (action === "wb-reset-view") {
    resetCamera();
    requestBoardRedraw();
    commit(false);
    return true;
  }

  // ── Add map from file ───────────────────────────────────────────────────
  if (action === "wb-add-map") {
    if (!requireGm()) return true;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      handleMapFileUpload(input.files?.[0]).finally(() => input.remove());
    });
    input.click();
    return true;
  }

  // ── Add map from URL ────────────────────────────────────────────────────
  if (action === "wb-add-map-url") {
    if (!requireGm()) return true;
    showMapUrlModal();
    return true;
  }

  if (action === "wb-map-url-submit") {
    const urlInput = document.getElementById("wb-map-url-input");
    const widthInput = document.getElementById("wb-map-width-input");
    const url = urlInput?.value.trim();
    const widthCells = parseInt(widthInput?.value, 10) || 10;
    if (url) {
      const map = {
        id: uniqueId("map"),
        url,
        name: "URL",
        x: Math.round(camera.offsetX / GRID_SIZE) * GRID_SIZE,
        y: Math.round(camera.offsetY / GRID_SIZE) * GRID_SIZE,
        width: widthCells,
        height: Math.round(widthCells * 0.75),
        zIndex: Object.keys(wb.maps).length,
      };
      await publishMap({ firebaseUrl: state.settings.firebaseUrl, roomId: state.settings.syncRoom, map });
      setStatus("success", t("whiteboard.status.mapAdded", { name: "URL" }));
      commit(false);
    }
    closeModal();
    return true;
  }

  // ── Clear maps ──────────────────────────────────────────────────────────
  if (action === "wb-clear-maps") {
    if (!requireGm()) return true;
    if (!window.confirm(t("whiteboard.confirm.clearMaps"))) return true;
    await clearAllMaps({ firebaseUrl: state.settings.firebaseUrl, roomId: state.settings.syncRoom });
    setStatus("info", t("whiteboard.status.mapsCleared"));
    commit(false);
    return true;
  }

  // ── Add token ───────────────────────────────────────────────────────────
  if (action === "wb-add-token") {
    if (!requireGm()) return true;
    showAddTokenModal();
    return true;
  }

  if (action === "wb-token-submit") {
    await handleTokenSubmit();
    closeModal();
    return true;
  }

  // ── Delete token ────────────────────────────────────────────────────────
  if (action === "wb-delete-token") {
    if (!requireGm()) return true;
    const tokenId = button.dataset.tokenId;
    if (tokenId) {
      await deleteToken({ firebaseUrl: state.settings.firebaseUrl, roomId: state.settings.syncRoom, tokenId });
      setStatus("info", t("whiteboard.status.tokenDeleted"));
      commit(false);
    }
    return true;
  }

  // ── Toggle lock ─────────────────────────────────────────────────────────
  if (action === "wb-toggle-lock") {
    if (!requireGm()) return true;
    const tokenId = button.dataset.tokenId;
    const token = wb.tokens[tokenId];
    if (token) {
      token.locked = !token.locked;
      await publishToken({ firebaseUrl: state.settings.firebaseUrl, roomId: state.settings.syncRoom, token });
      commit(false);
    }
    return true;
  }

  // ── Clear all tokens ────────────────────────────────────────────────────
  if (action === "wb-clear-tokens") {
    if (!requireGm()) return true;
    if (!window.confirm(t("whiteboard.confirm.clearTokens"))) return true;
    await clearAllTokens({ firebaseUrl: state.settings.firebaseUrl, roomId: state.settings.syncRoom });
    setStatus("info", t("whiteboard.status.tokensCleared"));
    commit(false);
    return true;
  }

  // ── Camera sync ─────────────────────────────────────────────────────────
  if (action === "wb-sync-camera") {
    if (!requireGm()) return true;
    if (wb.cameraSynced) {
      await clearCamera({ firebaseUrl: state.settings.firebaseUrl, roomId: state.settings.syncRoom });
      wb.cameraSynced = false;
      setStatus("info", t("whiteboard.status.cameraFreed"));
    } else {
      const cam = { ...exportCamera(), synced: true };
      await publishCamera({ firebaseUrl: state.settings.firebaseUrl, roomId: state.settings.syncRoom, cam });
      wb.cameraSynced = true;
      setStatus("success", t("whiteboard.status.cameraSynced"));
    }
    commit(false);
    return true;
  }

  // ── Delete single map (context) ─────────────────────────────────────────
  if (action === "wb-delete-map") {
    if (!requireGm()) return true;
    const mapId = button.dataset.mapId;
    if (mapId) {
      await deleteMap({ firebaseUrl: state.settings.firebaseUrl, roomId: state.settings.syncRoom, mapId });
      setStatus("info", t("whiteboard.status.mapDeleted"));
      commit(false);
    }
    return true;
  }

  // ── Modal cancel ────────────────────────────────────────────────────────
  if (action === "wb-modal-cancel") {
    closeModal();
    return true;
  }

  return false;
}

// ─── Map file upload ──────────────────────────────────────────────────────────

async function handleMapFileUpload(file) {
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    setStatus("error", t("whiteboard.status.fileTooLarge"));
    commit(false);
    return;
  }
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const resized = await resizeImage(dataUrl, 1280, 720);
    // Guess dimensions: default 10 cells wide, aspect ratio preserved
    const dims = await getImageDimensions(resized);
    const widthCells = 10;
    const heightCells = Math.round(widthCells * (dims.h / dims.w));
    const map = {
      id: uniqueId("map"),
      url: resized,
      name: file.name,
      x: Math.round(camera.offsetX / GRID_SIZE) * GRID_SIZE,
      y: Math.round(camera.offsetY / GRID_SIZE) * GRID_SIZE,
      width: widthCells,
      height: heightCells || widthCells,
      zIndex: Object.keys(wb.maps).length,
    };
    await publishMap({ firebaseUrl: state.settings.firebaseUrl, roomId: state.settings.syncRoom, map });
    setStatus("success", t("whiteboard.status.mapAdded", { name: file.name }));
    commit(false);
  } catch (err) {
    setStatus("error", err.message);
    commit(false);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsDataURL(file);
  });
}

function resizeImage(dataUrl, maxW, maxH) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      // Always re-encode as JPEG for smaller payload
      const needsResize = width > maxW || height > maxH;
      if (needsResize) {
        const ratio = Math.min(maxW / width, maxH / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}

// ─── Token submit ─────────────────────────────────────────────────────────────

async function handleTokenSubmit() {
  const name = document.getElementById("wb-token-name")?.value.trim();
  const type = document.getElementById("wb-token-type")?.value || "monster";
  const color = document.getElementById("wb-token-color")?.value || "#7c3aed";
  const ownerId = document.getElementById("wb-token-owner")?.value || "";
  if (!name) return;

  // Place at center of current viewport
  const canvas = document.querySelector("[data-wb-canvas]");
  const cx = (canvas?.width ?? 800) / 2;
  const cy = (canvas?.height ?? 600) / 2;
  const world = screenToWorld(cx, cy);
  const snapped = snapToGridCenter(world.x, world.y);

  const token = {
    id: uniqueId("tk"),
    type,
    ownerId: ownerId || PLAYER_ID,
    ownerName: getOwnerName(ownerId),
    name,
    worldX: snapped.x,
    worldY: snapped.y,
    color,
    locked: false,
  };

  await publishToken({ firebaseUrl: state.settings.firebaseUrl, roomId: state.settings.syncRoom, token });
  setStatus("success", t("whiteboard.status.tokenAdded", { name }));
  commit(false);
}

function getOwnerName(ownerId) {
  if (!ownerId || ownerId === PLAYER_ID) return state.character.name || "GM";
  return state.party?.[ownerId]?.name || ownerId;
}

// ─── Board event listeners (zoom, pan, drag) ─────────────────────────────────

export function initBoardListeners() {
  if (_listenersAttached) return;

  const boardArea = document.querySelector("[data-wb-board]");
  if (!boardArea) return;
  _listenersAttached = true;

  // Zoom with mousewheel
  boardArea.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = boardArea.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? 1 : -1;
    zoomAt(delta, sx, sy);
    requestBoardRedraw();
    commit(false);
    // If GM has camera sync, push update
    pushCameraIfSynced();
  }, { passive: false });

  // Mousedown — route to token drag, map drag, or pan
  boardArea.addEventListener("mousedown", (e) => {
    // Ignore clicks on toolbar buttons
    if (e.target.closest("[data-action]")) return;
    const rect = boardArea.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Right-click or middle-click → always pan
    if (e.button === 1 || e.button === 2) {
      startPan(e.clientX, e.clientY);
      e.preventDefault();
      return;
    }

    // Left-click behavior depends on tool mode (or Space held)
    if (e.button === 0) {
      if (_spaceHeld || tools.active === "pan") {
        startPan(e.clientX, e.clientY);
        e.preventDefault();
        return;
      }

      if (tools.active === "map" && state.room?.role === "gm") {
        const mapId = hitTestMap(sx, sy);
        if (mapId) {
          startMapDrag(mapId, e.clientX, e.clientY);
          e.preventDefault();
          return;
        }
      }

      if (tools.active === "select") {
        const tokenEl = e.target.closest("[data-token-id]");
        if (tokenEl && !e.target.closest("[data-action]")) {
          startTokenDrag(tokenEl, e.clientX, e.clientY, boardArea);
          e.preventDefault();
          return;
        }
        // Clicked empty space in select mode — pan
        startPan(e.clientX, e.clientY);
        e.preventDefault();
      }
    }
  });

  // Touch support
  boardArea.addEventListener("touchstart", (e) => {
    if (e.target.closest("[data-action]")) return;
    const touch = e.touches[0];
    const rect = boardArea.getBoundingClientRect();
    const sx = touch.clientX - rect.left;
    const sy = touch.clientY - rect.top;

    if (tools.active === "select") {
      const tokenEl = e.target.closest("[data-token-id]");
      if (tokenEl && !e.target.closest("[data-action]")) {
        startTokenDrag(tokenEl, touch.clientX, touch.clientY, boardArea);
        e.preventDefault();
        return;
      }
    }
    startPan(touch.clientX, touch.clientY);
    e.preventDefault();
  }, { passive: false });

  // Prevent context menu on right-click pan
  boardArea.addEventListener("contextmenu", (e) => e.preventDefault());

  // Global move/up
  document.addEventListener("mousemove", onPointerMove);
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("mouseup", onPointerUp);
  document.addEventListener("touchend", onPointerUp);

  // Space key for temporary pan tool
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.target.closest("input, textarea, select")) {
      _spaceHeld = true;
      e.preventDefault();
    }
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") _spaceHeld = false;
  });

  // Resize observer
  const ro = new ResizeObserver(() => {
    const canvas = boardArea.querySelector("[data-wb-canvas]");
    if (canvas) {
      canvas.width = boardArea.clientWidth;
      canvas.height = boardArea.clientHeight;
      requestBoardRedraw();
    }
  });
  ro.observe(boardArea);
}

// ─── Pan ──────────────────────────────────────────────────────────────────────

function startPan(clientX, clientY) {
  _dragging = { type: "pan", startX: clientX, startY: clientY };
}

// ─── Token drag ───────────────────────────────────────────────────────────────

function startTokenDrag(tokenEl, clientX, clientY, boardArea) {
  const tokenId = tokenEl.dataset.tokenId;
  const token = wb.tokens[tokenId];
  if (!token) return;

  const isGm = state.room?.role === "gm";
  if (!isGm) {
    if (token.locked) return;
    if (token.ownerId !== PLAYER_ID) return;
  }

  _dragging = {
    type: "token",
    id: tokenId,
    el: tokenEl,
    startX: clientX,
    startY: clientY,
    startWX: token.worldX ?? token.x ?? 350,
    startWY: token.worldY ?? token.y ?? 350,
    boardArea,
  };
  tokenEl.classList.add("wb-dragging");
}

// ─── Map drag ─────────────────────────────────────────────────────────────────

function startMapDrag(mapId, clientX, clientY) {
  const map = wb.maps[mapId];
  if (!map) return;
  _dragging = {
    type: "map",
    id: mapId,
    startX: clientX,
    startY: clientY,
    startWX: map.x ?? 0,
    startWY: map.y ?? 0,
  };
}

function hitTestMap(screenX, screenY) {
  const world = screenToWorld(screenX, screenY);
  // Check maps in reverse zIndex order (topmost first)
  const sorted = Object.values(wb.maps)
    .filter(Boolean)
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
  for (const map of sorted) {
    const mx = map.x ?? 0;
    const my = map.y ?? 0;
    const mw = (map.width ?? 10) * GRID_SIZE;
    const mh = (map.height ?? 10) * GRID_SIZE;
    if (world.x >= mx && world.x <= mx + mw && world.y >= my && world.y <= my + mh) {
      return map.id;
    }
  }
  return null;
}

// ─── Pointer move / up ────────────────────────────────────────────────────────

function onPointerMove(e) {
  if (!_dragging) return;
  handleMove(e.clientX, e.clientY);
}

function onTouchMove(e) {
  if (!_dragging) return;
  const touch = e.touches[0];
  handleMove(touch.clientX, touch.clientY);
  e.preventDefault();
}

function handleMove(clientX, clientY) {
  const dx = clientX - _dragging.startX;
  const dy = clientY - _dragging.startY;

  if (_dragging.type === "pan") {
    panBy(dx, dy);
    _dragging.startX = clientX;
    _dragging.startY = clientY;
    requestBoardRedraw();
    pushCameraIfSynced();
    return;
  }

  if (_dragging.type === "token") {
    const { el, id, startWX, startWY, boardArea } = _dragging;
    const rect = boardArea.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const world = screenToWorld(sx, sy);
    // Position the DOM element directly for responsive feel
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    // Debounced Firebase update
    window.clearTimeout(_debounceTimer);
    _debounceTimer = window.setTimeout(() => {
      const pos = wb.gridSnap ? snapToGridCenter(world.x, world.y) : { x: world.x, y: world.y };
      updateTokenPosition({
        firebaseUrl: state.settings.firebaseUrl,
        roomId: state.settings.syncRoom,
        tokenId: id,
        worldX: Math.round(pos.x),
        worldY: Math.round(pos.y),
      });
    }, 80);
    return;
  }

  if (_dragging.type === "map") {
    const { id, startWX, startWY } = _dragging;
    const newX = startWX + dx / camera.zoom;
    const newY = startWY + dy / camera.zoom;
    // Snap map to grid if snap enabled
    const pos = wb.gridSnap
      ? { x: Math.round(newX / GRID_SIZE) * GRID_SIZE, y: Math.round(newY / GRID_SIZE) * GRID_SIZE }
      : { x: newX, y: newY };
    if (wb.maps[id]) {
      wb.maps[id].x = pos.x;
      wb.maps[id].y = pos.y;
    }
    requestBoardRedraw();
    window.clearTimeout(_debounceTimer);
    _debounceTimer = window.setTimeout(() => {
      updateMapPosition({
        firebaseUrl: state.settings.firebaseUrl,
        roomId: state.settings.syncRoom,
        mapId: id,
        x: Math.round(pos.x),
        y: Math.round(pos.y),
      });
    }, 80);
  }
}

function onPointerUp() {
  if (!_dragging) return;

  if (_dragging.type === "token") {
    const { el, id, boardArea } = _dragging;
    el.classList.remove("wb-dragging");
    // Final snap + Firebase update
    const rect = boardArea.getBoundingClientRect();
    const sx = parseFloat(el.style.left) || 0;
    const sy = parseFloat(el.style.top) || 0;
    const world = screenToWorld(sx, sy);
    const pos = wb.gridSnap ? snapToGridCenter(world.x, world.y) : { x: world.x, y: world.y };
    window.clearTimeout(_debounceTimer);
    updateTokenPosition({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
      tokenId: id,
      worldX: Math.round(pos.x),
      worldY: Math.round(pos.y),
    });
    if (wb.tokens[id]) {
      wb.tokens[id].worldX = Math.round(pos.x);
      wb.tokens[id].worldY = Math.round(pos.y);
    }
    requestBoardRedraw();
  }

  if (_dragging.type === "map") {
    // Final Firebase update already debounced above
    const { id } = _dragging;
    window.clearTimeout(_debounceTimer);
    if (wb.maps[id]) {
      updateMapPosition({
        firebaseUrl: state.settings.firebaseUrl,
        roomId: state.settings.syncRoom,
        mapId: id,
        x: Math.round(wb.maps[id].x ?? 0),
        y: Math.round(wb.maps[id].y ?? 0),
      });
    }
  }

  _dragging = null;
}

// ─── Camera sync helper ───────────────────────────────────────────────────────

let _cameraPushTimer = 0;

function pushCameraIfSynced() {
  if (!wb.cameraSynced || state.room?.role !== "gm") return;
  window.clearTimeout(_cameraPushTimer);
  _cameraPushTimer = window.setTimeout(() => {
    publishCamera({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
      cam: { ...exportCamera(), synced: true },
    });
  }, 200);
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function showMapUrlModal() {
  const container = document.querySelector("[data-wb-modal]");
  if (!container) return;
  container.hidden = false;
  container.innerHTML = `
    <div class="wb-modal-backdrop" data-action="wb-modal-cancel"></div>
    <div class="wb-modal-content card">
      <h3>${t("whiteboard.modal.addMapUrl.title")}</h3>
      <label class="field">
        <span>URL</span>
        <input id="wb-map-url-input" type="url" placeholder="${t("whiteboard.modal.addMapUrl.placeholder")}" autocomplete="off" />
      </label>
      <label class="field">
        <span>${t("whiteboard.modal.addMapUrl.widthLabel")}</span>
        <input id="wb-map-width-input" type="number" min="1" max="100" value="10" />
      </label>
      <div class="wb-modal-actions">
        <button type="button" class="primary-action" data-action="wb-map-url-submit">${t("whiteboard.modal.addMapUrl.submit")}</button>
        <button type="button" data-action="wb-modal-cancel">${t("whiteboard.modal.addMapUrl.cancel")}</button>
      </div>
    </div>
  `;
  document.getElementById("wb-map-url-input")?.focus();
}

function showAddTokenModal() {
  const container = document.querySelector("[data-wb-modal]");
  if (!container) return;
  const partyOptions = Object.entries(state.party || {})
    .filter(([, m]) => m?.name)
    .map(([sid, m]) => `<option value="${escapeHtml(sid)}">${escapeHtml(m.name)}</option>`)
    .join("");

  container.hidden = false;
  container.innerHTML = `
    <div class="wb-modal-backdrop" data-action="wb-modal-cancel"></div>
    <div class="wb-modal-content card">
      <h3>${t("whiteboard.modal.addToken.title")}</h3>
      <label class="field">
        <span>${t("whiteboard.modal.addToken.name")}</span>
        <input id="wb-token-name" type="text" placeholder="${t("whiteboard.modal.addToken.namePlaceholder")}" autocomplete="off" />
      </label>
      <label class="field">
        <span>${t("whiteboard.modal.addToken.type")}</span>
        <select id="wb-token-type">
          <option value="monster">${t("whiteboard.token.monster")}</option>
          <option value="player">${t("whiteboard.token.player")}</option>
        </select>
      </label>
      <label class="field">
        <span>${t("whiteboard.modal.addToken.color")}</span>
        <input id="wb-token-color" type="color" value="#7c3aed" />
      </label>
      <label class="field">
        <span>${t("whiteboard.modal.addToken.owner")}</span>
        <select id="wb-token-owner">
          <option value="">${t("whiteboard.modal.addToken.ownerNone")}</option>
          ${partyOptions}
        </select>
      </label>
      <div class="wb-modal-actions">
        <button type="button" class="primary-action" data-action="wb-token-submit">${t("whiteboard.modal.addToken.submit")}</button>
        <button type="button" data-action="wb-modal-cancel">${t("whiteboard.modal.addToken.cancel")}</button>
      </div>
    </div>
  `;
  document.getElementById("wb-token-name")?.focus();
}

function closeModal() {
  const container = document.querySelector("[data-wb-modal]");
  if (container) { container.hidden = true; container.innerHTML = ""; }
}

function requireGm() {
  if (state.room?.role !== "gm") {
    setStatus("error", t("whiteboard.status.notGm"));
    commit(false);
    return false;
  }
  return true;
}

