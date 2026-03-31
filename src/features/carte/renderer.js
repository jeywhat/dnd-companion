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
let _mounted = false;
let _remoteElements = {};
let _suppressOnChange = false;

// ─── Excalidraw API ref ──────────────────────────────────────────────────────

export function getExcalidrawAPI() {
  return _excalidrawAPI;
}

// ─── Permission helpers ──────────────────────────────────────────────────────

function isGM() {
  return state.room?.role === "gm";
}

function getPlayerOwnedIds() {
  if (!_excalidrawAPI) return new Set();
  const elements = _excalidrawAPI.getSceneElements();
  const ids = new Set();
  for (const el of elements) {
    if (el.customData?.ownerId === PLAYER_ID) {
      ids.add(el.id);
    }
  }
  return ids;
}

// ─── onChange handler ────────────────────────────────────────────────────────

function handleChange(elements, appState) {
  if (_suppressOnChange) return;
  if (!state.settings.firebaseUrl || !state.settings.syncRoom) return;

  const currentMap = new Map();
  for (const el of elements) currentMap.set(el.id, el);

  const changedElements = [];
  const deletedIds = [];

  for (const el of elements) {
    const remote = _remoteElements[el.id];
    if (el.isDeleted) {
      if (remote && !remote.isDeleted) {
        if (isGM()) {
          deletedIds.push(el.id);
        }
      }
      continue;
    }

    if (!remote || el.version > (remote.version || 0)) {
      if (isGM() || el.customData?.ownerId === PLAYER_ID) {
        changedElements.push(el);
      }
    }
  }

  // Detect remote elements removed locally (GM only)
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

// ─── Remote update handler ───────────────────────────────────────────────────

function handleRemoteUpdate(type, data) {
  if (!_excalidrawAPI || !data) return;

  if (type === "snapshot") {
    _remoteElements = data || {};
    const elements = Object.values(_remoteElements).filter((el) => el && !el.isDeleted);
    _suppressOnChange = true;
    _excalidrawAPI.updateScene({ elements });
    requestAnimationFrame(() => { _suppressOnChange = false; });
    return;
  }

  // "put" or "patch" — partial update
  const incoming = data;
  let needsUpdate = false;

  for (const [id, el] of Object.entries(incoming)) {
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
    _suppressOnChange = true;
    _excalidrawAPI.updateScene({ elements: merged });
    requestAnimationFrame(() => { _suppressOnChange = false; });
  }
}

/**
 * Merge local elements with remote state.
 * Remote wins for elements we don't own. Local wins for elements we own.
 */
function mergeElements(localElements, remoteMap) {
  const merged = new Map();
  const localMap = new Map();
  for (const el of localElements) localMap.set(el.id, el);

  // Add all remote elements
  for (const [id, el] of Object.entries(remoteMap)) {
    if (!el || el.isDeleted) continue;
    const local = localMap.get(id);
    if (local && (isGM() || local.customData?.ownerId === PLAYER_ID)) {
      // We own this element — keep our local version if it's newer
      if (local.version >= (el.version || 0)) {
        merged.set(id, local);
        continue;
      }
    }
    merged.set(id, el);
  }

  // Keep local-only elements that aren't in remote (newly created, GM only)
  for (const el of localElements) {
    if (!merged.has(el.id) && !el.isDeleted) {
      if (isGM() || el.customData?.ownerId === PLAYER_ID) {
        merged.set(el.id, el);
      }
    }
  }

  return Array.from(merged.values());
}

// ─── Mount Excalidraw ────────────────────────────────────────────────────────

async function mountExcalidraw() {
  const container = document.getElementById("excalidraw-container");
  if (!container || _mounted) return;

  const { Excalidraw } = await import("@excalidraw/excalidraw");

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
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function renderCarte() {
  const isCarteTab = state.ui.activeTab === "carte";
  if (isCarteTab && !_mounted) {
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
 * Add a player token at a given position.
 */
export function addPlayerToken({ name, color, x = 200, y = 200 }) {
  if (!_excalidrawAPI) return null;

  const tokenId = `token-${PLAYER_ID}-${Date.now()}`;
  const token = {
    id: tokenId,
    type: "ellipse",
    x,
    y,
    width: 60,
    height: 60,
    strokeColor: color || "#7c3aed",
    backgroundColor: color || "#7c3aed",
    fillStyle: "solid",
    roughness: 0,
    opacity: 100,
    locked: false,
    customData: {
      ownerId: PLAYER_ID,
      type: "player-token",
      label: name || t("carte.token.default"),
    },
  };

  const currentElements = _excalidrawAPI.getSceneElements();
  _excalidrawAPI.updateScene({
    elements: [...currentElements, token],
  });

  return tokenId;
}

/**
 * Add a map image element (GM only).
 */
export function addMapImage({ dataUrl, width, height, x = 0, y = 0 }) {
  if (!_excalidrawAPI || !isGM()) return;

  const fileId = `map-${Date.now()}`;

  _excalidrawAPI.addFiles([{
    id: fileId,
    dataURL: dataUrl,
    mimeType: "image/png",
    created: Date.now(),
  }]);

  const imageElement = {
    id: `img-${fileId}`,
    type: "image",
    x,
    y,
    width: width || 800,
    height: height || 600,
    fileId,
    locked: true,
    customData: { type: "map", ownerId: PLAYER_ID },
  };

  const currentElements = _excalidrawAPI.getSceneElements();
  _excalidrawAPI.updateScene({
    elements: [imageElement, ...currentElements],
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
  _remoteElements = {};
}
