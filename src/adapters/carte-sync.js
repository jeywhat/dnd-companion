/**
 * Firebase RTDB sync for the Carte (Excalidraw) feature.
 * Uses REST + SSE (same pattern as firebase-sync.js).
 *
 * Structure:
 *   /rooms/{roomId}/carte/elements   → Excalidraw elements (keyed by id)
 *   /rooms/{roomId}/carte/meta       → { updatedBy, updatedAt }
 */

import { buildBase, PLAYER_ID } from "./firebase-sync.js";

let _eventSource = null;
let _onRemoteUpdate = null;
let _lastPublishId = null;

function buildCarteBase(firebaseUrl, roomId) {
  return `${buildBase(firebaseUrl, roomId)}/carte`;
}

// ─── SSE Listener ────────────────────────────────────────────────────────────

export function connectCarteSync({ firebaseUrl, roomId, onRemoteUpdate }) {
  disconnectCarteSync();
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  _onRemoteUpdate = onRemoteUpdate;
  const url = `${buildCarteBase(firebaseUrl, roomId)}/elements.json`;

  try {
    _eventSource = new EventSource(url);

    _eventSource.addEventListener("put", (e) => {
      try {
        const { path, data } = JSON.parse(e.data);
        if (!path) return;

        if (path === "/") {
          _onRemoteUpdate?.("snapshot", data);
          return;
        }

        const elementId = path.replace(/^\//, "");
        _onRemoteUpdate?.("put", { [elementId]: data });
      } catch { /* JSON parse error */ }
    });

    _eventSource.addEventListener("patch", (e) => {
      try {
        const { path, data } = JSON.parse(e.data);
        if (!data || typeof data !== "object") return;

        if (!path || path === "/") {
          _onRemoteUpdate?.("patch", data);
        } else {
          const elementId = path.replace(/^\//, "");
          _onRemoteUpdate?.("put", { [elementId]: data });
        }
      } catch { /* JSON parse error */ }
    });

    _eventSource.onerror = () => console.info("[CarteSync] Reconnexion…");
    console.info("[CarteSync] Connecté à", url);
  } catch (err) {
    console.warn("[CarteSync] Connexion SSE impossible :", err);
  }
}

export function disconnectCarteSync() {
  _eventSource?.close();
  _eventSource = null;
}

// ─── Publish ─────────────────────────────────────────────────────────────────

let _publishTimer = 0;
let _pendingElements = null;

function doPublish(firebaseUrl, roomId) {
  if (!_pendingElements) return;

  const elements = _pendingElements;
  _pendingElements = null;

  const base = buildCarteBase(firebaseUrl, roomId);
  const publishId = Date.now().toString(36);
  _lastPublishId = publishId;

  const payload = {};
  for (const el of elements) {
    payload[el.id] = { ...el, _publishedBy: PLAYER_ID, _publishId: publishId };
  }

  fetch(`${base}/elements.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => console.warn("[CarteSync publish]", err));
}

/**
 * Debounced publish of Excalidraw elements to Firebase.
 * Only publishes elements that changed (caller should filter).
 */
export function publishCarteElements({ firebaseUrl, roomId, elements, debounceMs = 300 }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  _pendingElements = elements;
  clearTimeout(_publishTimer);
  _publishTimer = setTimeout(() => doPublish(firebaseUrl, roomId), debounceMs);
}

/**
 * Delete elements from Firebase by their IDs.
 */
export async function deleteCarteElements({ firebaseUrl, roomId, elementIds }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;
  if (!elementIds?.length) return;

  const base = buildCarteBase(firebaseUrl, roomId);
  const payload = {};
  for (const id of elementIds) {
    payload[id] = null;
  }

  await fetch(`${base}/elements.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => console.warn("[CarteSync delete]", err));
}

/** Check if an incoming update was published by us (de-duplication). */
export function isOwnPublish(element) {
  return element?._publishedBy === PLAYER_ID;
}

export { PLAYER_ID };
