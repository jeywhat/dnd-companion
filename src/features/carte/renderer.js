/**
 * Renderer for the Carte (map/whiteboard) feature tab.
 * Manages canvas lifecycle, Firebase sync, token dock, GM tools,
 * mini-map, camera persistence, and permissions.
 */

import { appElement, state } from "../../app/store.js";
import { t } from "../../shared/i18n.js";
import { PLAYER_ID } from "../../adapters/firebase-sync.js";
import { InfiniteCanvas } from "./canvas.js";
import { canInteract } from "./tokens.js";
import {
  connectCarteSync,
  disconnectCarteSync,
  publishTokenDebounced,
  publishMapDebounced,
  deleteToken as firebaseDeleteToken,
  deleteMap as firebaseDeleteMap,
} from "../../adapters/carte-sync.js";
import { processDroppedFiles, restoreCamera } from "./handler.js";
import "./carte.css";

/** @type {InfiniteCanvas|null} */
let _canvasInstance = null;
let _initialized = false;
let _syncConnected = false;

/** Expose canvas instance for handler.js */
export function getCanvasInstance() {
  return _canvasInstance;
}

/**
 * Main render entry point — called by app/renderer.js on every state change.
 * Only initializes the canvas when the carte tab becomes active.
 */
export function renderCarte() {
  const isActive = state.ui.activeTab === "carte";

  if (!isActive) return;

  const panel = appElement.querySelector("[data-panel='carte']");
  if (!panel) return;

  // First-time init
  if (!_initialized) {
    _initCarte(panel);
    _initialized = true;
  }

  // Update dock state
  _updateDock(panel);

  // Update GM tools visibility
  _updateGmTools(panel);

  // Connect Firebase sync if settings available
  const { firebaseUrl, syncRoom } = state.settings;
  if (firebaseUrl && syncRoom && !_syncConnected) {
    connectCarteSync({
      firebaseUrl,
      roomId: syncRoom,
      onCarteUpdate: _handleCarteUpdate,
    });
    _syncConnected = true;
    console.log("[Carte] 🔗 Firebase sync connected");
  } else if ((!firebaseUrl || !syncRoom) && _syncConnected) {
    disconnectCarteSync();
    _syncConnected = false;
  }

  _canvasInstance?.requestRedraw();
}

// ── Initialization ──────────────────────────────────────────────────────────

function _initCarte(panel) {
  console.log("[Carte] 🚀 Initializing carte panel…");

  const isGm = state.room?.role === "gm";

  panel.innerHTML = `
    <div class="carte-container">
      <div class="carte-toolbar">
        <div class="carte-toolbar-group">
          <button type="button" class="carte-btn" data-action="carte-add-token" data-token-type="player"
                  title="${t("carte.addPlayer")}">
            <span>🧙</span>
          </button>
          <button type="button" class="carte-btn" data-action="carte-add-token" data-token-type="monster"
                  title="${t("carte.addMonster")}">
            <span>👹</span>
          </button>
          <button type="button" class="carte-btn" data-action="carte-add-token" data-token-type="npc"
                  title="${t("carte.addNpc")}">
            <span>🧑</span>
          </button>
        </div>

        <div class="carte-toolbar-group">
          <button type="button" class="carte-btn" data-action="carte-toggle-grid"
                  title="${t("carte.toggleGrid")}">
            <span>#</span>
          </button>
          <button type="button" class="carte-btn" data-action="carte-toggle-snap"
                  title="${t("carte.toggleSnap")}">
            <span>🧲</span> <span data-snap-label>${t("carte.snapOn")}</span>
          </button>
          <button type="button" class="carte-btn" data-action="carte-toggle-minimap"
                  title="${t("carte.toggleMinimap")}">
            <span>🗺️</span>
          </button>
        </div>

        <div class="carte-toolbar-group">
          <button type="button" class="carte-btn" data-action="carte-zoom-in"
                  title="${t("carte.zoomIn")}">➕</button>
          <button type="button" class="carte-btn" data-action="carte-zoom-out"
                  title="${t("carte.zoomOut")}">➖</button>
          <button type="button" class="carte-btn" data-action="carte-reset-view"
                  title="${t("carte.resetView")}">🏠</button>
          <button type="button" class="carte-btn" data-action="carte-save-view"
                  title="${t("carte.saveView")}">💾</button>
        </div>

        <!-- GM-only tools -->
        <div class="carte-toolbar-group carte-gm-tools" data-carte-gm-tools ${isGm ? "" : "hidden"}>
          <button type="button" class="carte-btn carte-btn--danger" data-action="carte-clear-board"
                  title="${t("carte.clearBoard")}">
            🗑️ ${t("carte.clearBoard")}
          </button>
          <span class="carte-drop-hint" data-carte-drop-hint>📤 ${t("carte.dropHint")}</span>
        </div>

        <div class="carte-toolbar-info">
          <span class="carte-coords" data-carte-coords></span>
        </div>
      </div>

      <div class="carte-canvas-wrap">
        <canvas id="carte-canvas"></canvas>
      </div>

      <!-- Token dock (bottom overlay) -->
      <div class="carte-dock" data-carte-dock>
        <div class="carte-dock-my-token" data-dock-my-token></div>
        <div class="carte-dock-selection" data-dock-selection hidden></div>
      </div>
    </div>
  `;

  const canvasEl = panel.querySelector("#carte-canvas");
  _canvasInstance = new InfiniteCanvas(canvasEl);

  // Restore saved camera or center view
  const savedCam = restoreCamera();
  if (savedCam) {
    _canvasInstance.setCamera(savedCam.zoom, savedCam.offsetX, savedCam.offsetY);
    console.log("[Carte] 📷 Camera restored from localStorage");
  } else {
    requestAnimationFrame(() => _canvasInstance.resetView());
  }

  // ── Permission callback ─────────────────────────────────────────────────
  _canvasInstance.canDragToken = (token) => {
    const role = state.room?.role || "player";
    return canInteract(token, role);
  };

  _canvasInstance.canDragMap = () => {
    return state.room?.role === "gm";
  };

  // ── Token move → Firebase sync (debounced) ──────────────────────────────
  _canvasInstance.onTokenMoved = (token) => {
    const { firebaseUrl, syncRoom } = state.settings;
    if (firebaseUrl && syncRoom) {
      publishTokenDebounced({ firebaseUrl, roomId: syncRoom, token });
    }
  };

  // ── Map move → Firebase sync (debounced) ────────────────────────────────
  _canvasInstance.onMapMoved = (map) => {
    const { firebaseUrl, syncRoom } = state.settings;
    if (firebaseUrl && syncRoom) {
      const { _img, _loading, ...syncMap } = map;
      publishMapDebounced({ firebaseUrl, roomId: syncRoom, map: syncMap });
    }
  };

  // ── Token selected → update dock UI ─────────────────────────────────────
  _canvasInstance.onTokenSelected = (token) => {
    _updateSelectionDock(panel, token, null);
  };

  // ── Map selected → update dock UI ───────────────────────────────────────
  _canvasInstance.onMapSelected = (map) => {
    _updateSelectionDock(panel, null, map);
  };

  // ── Token deleted via keyboard → sync Firebase ──────────────────────────
  _canvasInstance.onTokenDelete = (token) => {
    const { firebaseUrl, syncRoom } = state.settings;
    if (firebaseUrl && syncRoom) {
      firebaseDeleteToken({ firebaseUrl, roomId: syncRoom, tokenId: token.id });
    }
  };

  // ── Map deleted via keyboard → sync Firebase ────────────────────────────
  _canvasInstance.onMapDelete = (map) => {
    const { firebaseUrl, syncRoom } = state.settings;
    if (firebaseUrl && syncRoom) {
      firebaseDeleteMap({ firebaseUrl, roomId: syncRoom, mapId: map.id });
    }
  };

  // ── File drop → image map upload (GM only) ──────────────────────────────
  _canvasInstance.onFileDrop = (files, worldPos) => {
    if (state.room?.role !== "gm") {
      console.log("[Carte] 🚫 File drop ignored — not GM");
      return;
    }
    processDroppedFiles(files, worldPos);
  };

  // ── Cursor coordinates display ──────────────────────────────────────────
  _canvasInstance.onCursorMove = (world) => {
    const el = panel.querySelector("[data-carte-coords]");
    if (el) el.textContent = `(${Math.round(world.x)}, ${Math.round(world.y)})`;
  };

  console.log("[Carte] ✅ Panel initialized");
}

// ── GM tools visibility ─────────────────────────────────────────────────────

function _updateGmTools(panel) {
  const gmTools = panel.querySelector("[data-carte-gm-tools]");
  if (gmTools) {
    gmTools.hidden = state.room?.role !== "gm";
  }
}

// ── Dock updates ────────────────────────────────────────────────────────────

function _updateDock(panel) {
  const dock = panel.querySelector("[data-dock-my-token]");
  if (!dock || !_canvasInstance) return;

  const myToken = _canvasInstance.tokens.find(
    (tok) => tok.owner === PLAYER_ID && tok.type === "player"
  );

  if (myToken) {
    dock.innerHTML = `
      <button type="button" class="carte-dock-btn carte-dock-btn--locate" data-action="carte-center-my-token"
              title="${t("carte.centerMyToken")}">
        🎯 ${t("carte.myToken")}: <strong>${myToken.name || "?"}</strong>
      </button>
    `;
  } else {
    dock.innerHTML = `
      <button type="button" class="carte-dock-btn carte-dock-btn--place" data-action="carte-place-my-token"
              title="${t("carte.placeMyToken")}">
        🧙 ${t("carte.placeMyToken")}
      </button>
    `;
  }
}

function _updateSelectionDock(panel, token, map) {
  const dock = panel.querySelector("[data-dock-selection]");
  if (!dock) return;

  // Token selection
  if (token) {
    const role = state.room?.role || "player";
    const canDelete = canInteract(token, role);
    const canEdit = canInteract(token, role);
    const typeLabel = t(`carte.type.${token.type}`) || token.type;

    const TOKEN_ICONS = ["🧙", "👹", "🧑", "🐉", "💀", "🧝", "🧛", "🧟", "👻", "🦊", "🐺", "🗡️"];

    dock.hidden = false;
    dock.innerHTML = `
      <span class="carte-dock-sel-info">
        <span class="carte-dock-sel-dot carte-dock-sel-dot--${token.type}"></span>
        <strong>${token.name || token.label || token.id}</strong>
        <span class="carte-dock-sel-type">${typeLabel}</span>
        <span class="carte-dock-sel-pos">(${Math.round(token.x)}, ${Math.round(token.y)})</span>
      </span>
      ${canEdit ? `
        <span class="carte-dock-icons" role="group" aria-label="${t("carte.changeIcon")}">
          ${TOKEN_ICONS.map((ic) => `
            <button type="button" class="carte-icon-btn${token.icon === ic ? " active" : ""}"
              data-action="carte-set-token-icon" data-icon="${ic}" title="${ic}">${ic}</button>
          `).join("")}
          <button type="button" class="carte-icon-btn carte-icon-btn--upload"
            data-action="carte-upload-token-icon" title="${t("carte.uploadIcon")}">📷</button>
        </span>
      ` : ""}
      ${canDelete ? `
        <button type="button" class="carte-dock-btn carte-dock-btn--delete" data-action="carte-delete-selected"
                title="${t("carte.deleteToken")}">
          🗑️
        </button>
      ` : ""}
    `;
    return;
  }

  // Map selection
  if (map) {
    const isGm = state.room?.role === "gm";

    dock.hidden = false;
    dock.innerHTML = `
      <span class="carte-dock-sel-info">
        <span class="carte-dock-sel-dot carte-dock-sel-dot--map"></span>
        <strong>${t("carte.mapImage")}</strong>
        <span class="carte-dock-sel-pos">(${Math.round(map.x)}, ${Math.round(map.y)}) ${map.w}×${map.h}</span>
      </span>
      ${isGm ? `
        <button type="button" class="carte-dock-btn carte-dock-btn--delete" data-action="carte-delete-selected-map"
                title="${t("carte.deleteMap")}">
          🗑️
        </button>
      ` : ""}
    `;
    return;
  }

  // No selection
  dock.hidden = true;
  dock.innerHTML = "";
}

// ── Firebase update handler ─────────────────────────────────────────────────

function _handleCarteUpdate(data, path) {
  const canvas = _canvasInstance;
  if (!canvas) return;

  // Full snapshot
  if (path === "/") {
    if (data?.tokens) {
      canvas.tokens = Object.values(data.tokens).filter(Boolean);
    } else {
      canvas.tokens = [];
    }
    if (data?.maps) {
      canvas.maps = Object.values(data.maps).filter(Boolean);
      // Trigger image loading for each map
      for (const map of canvas.maps) canvas.loadMapImage(map);
    } else {
      canvas.maps = [];
    }
    canvas.requestRedraw();
    console.log("[Carte] 📥 Full sync:", canvas.tokens.length, "tokens,", canvas.maps.length, "maps");
    const panel = appElement.querySelector("[data-panel='carte']");
    if (panel) _updateDock(panel);
    return;
  }

  // Single token update
  if (path.startsWith("/tokens/")) {
    const tokenId = path.split("/")[2];

    if (data === null) {
      canvas.tokens = canvas.tokens.filter((tok) => tok.id !== tokenId);
      if (canvas.selectedTokenId === tokenId) {
        canvas.selectedTokenId = null;
        canvas.onTokenSelected?.(null);
      }
      console.log("[Carte] 🗑️ Token removed:", tokenId);
    } else {
      if (canvas._draggedToken?.id === tokenId) return;

      const idx = canvas.tokens.findIndex((tok) => tok.id === tokenId);
      if (idx >= 0) {
        canvas.tokens[idx] = data;
      } else {
        canvas.tokens.push(data);
        console.log("[Carte] 📥 New remote token:", tokenId);
      }
    }
    canvas.requestRedraw();
    const panel = appElement.querySelector("[data-panel='carte']");
    if (panel) _updateDock(panel);
    return;
  }

  // Map updates
  if (path.startsWith("/maps/")) {
    const mapId = path.split("/")[2];

    if (data === null) {
      canvas.maps = canvas.maps.filter((m) => m.id !== mapId);
      if (canvas.selectedMapId === mapId) {
        canvas.selectedMapId = null;
        canvas.onMapSelected?.(null);
      }
      console.log("[Carte] 🗑️ Map removed:", mapId);
    } else {
      if (canvas._draggedMap?.id === mapId) return;

      const idx = canvas.maps.findIndex((m) => m.id === mapId);
      if (idx >= 0) {
        // Preserve local _img if URL didn't change
        const old = canvas.maps[idx];
        if (old._img && old.url === data.url) data._img = old._img;
        canvas.maps[idx] = data;
      } else {
        canvas.maps.push(data);
        console.log("[Carte] 📥 New remote map:", mapId);
      }
      canvas.loadMapImage(data);
    }
    canvas.requestRedraw();
    return;
  }
}
