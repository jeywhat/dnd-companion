/**
 * Carte (Map) feature – Excalidraw renderer.
 * Mounts Excalidraw via React.createElement (no JSX) inside the carte panel.
 * Lazy-initialised: Excalidraw only loads when the tab is first visited.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import { state } from "../../app/store.js";
import {
  connectCarteSync,
  disconnectCarteSync,
  publishCarteElements,
  deleteCarteElements,
  isOwnPublish,
  PLAYER_ID,
} from "../../adapters/carte-sync.js";
import { t } from "../../shared/i18n.js";

let _root = null;
let _excalidrawAPI = null;
let _mounting = false;
let _mounted = false;
let _remoteElements = {};
// Counter-based suppression: >0 means suppress. Avoids requestAnimationFrame races.
let _suppressDepth = 0;
let _CaptureUpdateAction = null;
let _convertToExcalidrawElements = null;

// ─── Excalidraw API ref ──────────────────────────────────────────────────────

export function getExcalidrawAPI() {
  return _excalidrawAPI;
}

// ─── Permission helpers ──────────────────────────────────────────────────────

function isGM() {
  return state.room?.role === "gm";
}

// ─── onChange handler ────────────────────────────────────────────────────────

function handleChange(elements, _appState, _files) {
  if (_suppressDepth > 0) return;
  if (!state.settings.firebaseUrl || !state.settings.syncRoom) return;

  const currentMap = new Map();
  for (const el of elements) currentMap.set(el.id, el);

  const changedElements = [];
  const deletedIds = [];

  for (const el of elements) {
    const remote = _remoteElements[el.id];
    if (el.isDeleted) {
      if (remote && !remote.isDeleted && isGM()) {
        deletedIds.push(el.id);
      }
      continue;
    }

    // Publish if element is new or changed vs. remote
    if (!remote || el.version > (remote.version || 0)) {
      // GM can publish anything; player can publish owned tokens
      if (isGM() || el.customData?.ownerId === PLAYER_ID) {
        changedElements.push(el);
      }
    }
  }

  if (isGM()) {
    for (const id of Object.keys(_remoteElements)) {
      if (!currentMap.has(id) && _remoteElements[id] && !_remoteElements[id].isDeleted) {
        deletedIds.push(id);
      }
    }
  }

  if (changedElements.length > 0) {
    publishCarteElements({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
      elements: changedElements,
    });
  }

  if (deletedIds.length > 0) {
    deleteCarteElements({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
      elementIds: deletedIds,
    });
  }
}

// ─── Suppressed updateScene wrapper ──────────────────────────────────────────

function updateSceneSuppressed(sceneData) {
  if (!_excalidrawAPI) return;
  _suppressDepth++;
  try {
    _excalidrawAPI.updateScene({
      ...sceneData,
      captureUpdate: _CaptureUpdateAction?.NEVER,
    });
  } finally {
    // Defer unsuppression so React 18 batched onChange callbacks are still caught
    Promise.resolve().then(() => { _suppressDepth--; });
  }
}

// ─── Remote update handler ───────────────────────────────────────────────────

function handleRemoteUpdate(type, data) {
  if (!_excalidrawAPI || !data) return;

  if (type === "snapshot") {
    _remoteElements = data || {};
    const elements = Object.values(_remoteElements).filter((el) => el && !el.isDeleted);
    updateSceneSuppressed({ elements });
    return;
  }

  // "put" or "patch" — incremental update
  let needsUpdate = false;

  for (const [id, el] of Object.entries(data)) {
    if (el === null) {
      delete _remoteElements[id];
      needsUpdate = true;
      continue;
    }
    if (isOwnPublish(el)) {
      _remoteElements[id] = el;
      continue;
    }
    _remoteElements[id] = el;
    needsUpdate = true;
  }

  if (needsUpdate) {
    const currentElements = _excalidrawAPI.getSceneElements();
    const merged = mergeElements(currentElements, _remoteElements);
    updateSceneSuppressed({ elements: merged });
  }
}

/**
 * Merge local elements with remote state.
 * Remote wins except for elements we own (newer local version kept).
 * ALL local-only elements are preserved (drawings in progress).
 */
function mergeElements(localElements, remoteMap) {
  const merged = new Map();

  // 1. Add all remote elements
  for (const [id, el] of Object.entries(remoteMap)) {
    if (!el || el.isDeleted) continue;
    merged.set(id, el);
  }

  // 2. Overlay local elements — keep local version when we own it or it's local-only
  for (const el of localElements) {
    if (el.isDeleted) continue;
    const remote = merged.get(el.id);

    if (!remote) {
      // Local-only element (drawing in progress, not yet synced) — always keep
      merged.set(el.id, el);
    } else if (isGM() || el.customData?.ownerId === PLAYER_ID) {
      // We own this element — keep local if same or newer version
      if (el.version >= (remote.version || 0)) {
        merged.set(el.id, el);
      }
    }
    // else: remote wins (someone else's element)
  }

  return Array.from(merged.values());
}

// ─── Mount Excalidraw ────────────────────────────────────────────────────────

async function mountExcalidraw() {
  const container = document.getElementById("excalidraw-container");
  if (!container || _mounting || _mounted) return;

  _mounting = true;

  try {
    const excalidrawModule = await import("@excalidraw/excalidraw");
    const { Excalidraw, CaptureUpdateAction, convertToExcalidrawElements } = excalidrawModule;
    _CaptureUpdateAction = CaptureUpdateAction;
    _convertToExcalidrawElements = convertToExcalidrawElements;

    // Guard against container being removed during async import
    if (!document.getElementById("excalidraw-container")) {
      _mounting = false;
      return;
    }

    _root = createRoot(container);

    const props = {
      excalidrawAPI: (api) => { _excalidrawAPI = api; },
      onChange: handleChange,
      theme: "dark",
      gridModeEnabled: true,
      zenModeEnabled: false,
      viewModeEnabled: false,
      UIOptions: {
        canvasActions: {
          loadScene: isGM(),
          clearCanvas: isGM(),
          export: { saveFileToDisk: true },
          saveAsImage: true,
        },
      },
      langCode: state.ui?.locale === "en" ? "en" : "fr-FR",
    };

    _root.render(React.createElement(Excalidraw, props));
    _mounted = true;

    // Connect Firebase sync
    if (state.settings.firebaseUrl && state.settings.syncRoom) {
      connectCarteSync({
        firebaseUrl: state.settings.firebaseUrl,
        roomId: state.settings.syncRoom,
        onRemoteUpdate: handleRemoteUpdate,
      });
    }

    console.info("[Carte] Excalidraw monté");
  } catch (err) {
    console.error("[Carte] Échec du montage Excalidraw :", err);
  } finally {
    _mounting = false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function renderCarte() {
  if (state.ui.activeTab === "carte" && !_mounted && !_mounting) {
    mountExcalidraw();
  }
}

export function reconnectCarteSync() {
  if (!state.settings.firebaseUrl || !state.settings.syncRoom) return;
  if (!_mounted) return;

  disconnectCarteSync();
  connectCarteSync({
    firebaseUrl: state.settings.firebaseUrl,
    roomId: state.settings.syncRoom,
    onRemoteUpdate: handleRemoteUpdate,
  });
}

/**
 * Add a player token at the center of the viewport.
 */
export function addPlayerToken({ name, color, x = 200, y = 200 }) {
  if (!_excalidrawAPI) return null;

  const label = name || t("carte.token.default");
  const fillColor = color || "#7c3aed";
  const tokenId = `token-${PLAYER_ID}-${Date.now()}`;

  const raw = [{
    id: tokenId,
    type: "ellipse",
    x,
    y,
    width: 60,
    height: 60,
    strokeColor: fillColor,
    backgroundColor: fillColor,
    fillStyle: "solid",
    roughness: 0,
    opacity: 100,
    locked: false,
    customData: {
      ownerId: PLAYER_ID,
      type: "player-token",
      label,
    },
  }];

  const elements = _convertToExcalidrawElements
    ? _convertToExcalidrawElements(raw)
    : raw;

  const currentElements = _excalidrawAPI.getSceneElements();
  _excalidrawAPI.updateScene({
    elements: [...currentElements, ...elements],
  });

  return tokenId;
}

/**
 * Add a map image element (GM only).
 */
export function addMapImage({ dataUrl, width, height, x = 0, y = 0 }) {
  if (!_excalidrawAPI || !isGM()) return;

  const fileId = `map-${Date.now()}`;

  // Register the file with Excalidraw's internal file store
  _excalidrawAPI.addFiles([{
    id: fileId,
    dataURL: dataUrl,
    mimeType: dataUrl.startsWith("data:image/png") ? "image/png"
            : dataUrl.startsWith("data:image/jpeg") ? "image/jpeg"
            : dataUrl.startsWith("data:image/webp") ? "image/webp"
            : "image/png",
    created: Date.now(),
  }]);

  const raw = [{
    id: `img-${fileId}`,
    type: "image",
    x,
    y,
    width: width || 800,
    height: height || 600,
    status: "saved",
    fileId,
    scale: [1, 1],
    locked: true,
    customData: { type: "map", ownerId: PLAYER_ID },
  }];

  const elements = _convertToExcalidrawElements
    ? _convertToExcalidrawElements(raw)
    : raw;

  const currentElements = _excalidrawAPI.getSceneElements();
  _excalidrawAPI.updateScene({
    elements: [...elements, ...currentElements],
  });
}

export function destroyCarte() {
  disconnectCarteSync();
  if (_root) {
    _root.unmount();
    _root = null;
  }
  _excalidrawAPI = null;
  _mounted = false;
  _mounting = false;
  _remoteElements = {};
}
