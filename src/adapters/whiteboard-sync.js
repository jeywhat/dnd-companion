/**
 * Whiteboard sync — Firebase Realtime Database REST + SSE.
 *
 * Data layout at /rooms/{roomId}/whiteboard/:
 *   maps/{mapId}    : { id, url, name, x, y, width, height, zIndex }
 *   tokens/{tokenId}: { id, type, ownerId, name, worldX, worldY, color, locked }
 *   camera          : { zoom, offsetX, offsetY, synced }
 *
 * Backward compat: old "background" field is ignored; maps replace it.
 */

import { buildBase, PLAYER_ID } from "./firebase-sync.js";

let _mapsSource    = null;
let _tokensSource  = null;
let _cameraSource  = null;
let _onMaps        = null;
let _onTokens      = null;
let _onCamera      = null;

function wbBase(firebaseUrl, roomId) {
  return `${buildBase(firebaseUrl, roomId)}/whiteboard`;
}

// ─── Maps CRUD ────────────────────────────────────────────────────────────────

export async function publishMap({ firebaseUrl, roomId, map }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) {
    throw new Error("Firebase not configured");
  }
  const url = `${wbBase(firebaseUrl, roomId)}/maps/${map.id}.json`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...map, updatedAt: Date.now() }),
  });
  if (!res.ok) throw new Error(`Firebase write failed (${res.status})`);
}

export async function updateMapPosition({ firebaseUrl, roomId, mapId, x, y }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;
  const url = `${wbBase(firebaseUrl, roomId)}/maps/${mapId}.json`;
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y, updatedAt: Date.now() }),
  }).catch((err) => console.warn("[WhiteboardSync] map position error:", err));
}

export async function deleteMap({ firebaseUrl, roomId, mapId }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;
  const url = `${wbBase(firebaseUrl, roomId)}/maps/${mapId}.json`;
  await fetch(url, { method: "DELETE" }).catch(() => {});
}

export async function clearAllMaps({ firebaseUrl, roomId }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;
  const url = `${wbBase(firebaseUrl, roomId)}/maps.json`;
  await fetch(url, { method: "DELETE" }).catch(() => {});
}

// ─── Tokens CRUD ──────────────────────────────────────────────────────────────

export async function publishToken({ firebaseUrl, roomId, token }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) {
    throw new Error("Firebase not configured");
  }
  const url = `${wbBase(firebaseUrl, roomId)}/tokens/${token.id}.json`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...token, updatedAt: Date.now() }),
  });
  if (!res.ok) throw new Error(`Firebase write failed (${res.status})`);
}

export async function updateTokenPosition({ firebaseUrl, roomId, tokenId, worldX, worldY }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;
  const url = `${wbBase(firebaseUrl, roomId)}/tokens/${tokenId}.json`;
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worldX, worldY, updatedAt: Date.now() }),
  }).catch((err) => console.warn("[WhiteboardSync] position update error:", err));
}

export async function deleteToken({ firebaseUrl, roomId, tokenId }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;
  const url = `${wbBase(firebaseUrl, roomId)}/tokens/${tokenId}.json`;
  await fetch(url, { method: "DELETE" }).catch(() => {});
}

export async function clearAllTokens({ firebaseUrl, roomId }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;
  const url = `${wbBase(firebaseUrl, roomId)}/tokens.json`;
  await fetch(url, { method: "DELETE" }).catch(() => {});
}

// ─── Camera (shared view) ─────────────────────────────────────────────────────

export async function publishCamera({ firebaseUrl, roomId, cam }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;
  const url = `${wbBase(firebaseUrl, roomId)}/camera.json`;
  await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cam),
  }).catch((err) => console.warn("[WhiteboardSync] camera publish error:", err));
}

export async function clearCamera({ firebaseUrl, roomId }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;
  const url = `${wbBase(firebaseUrl, roomId)}/camera.json`;
  await fetch(url, { method: "DELETE" }).catch(() => {});
}

// ─── SSE listeners ────────────────────────────────────────────────────────────

function listenNode(url, callback) {
  const src = new EventSource(url);

  src.addEventListener("put", (e) => {
    try {
      const { path, data } = JSON.parse(e.data);
      if (!path) return;
      if (path === "/") {
        callback("snapshot", data);
      } else {
        const parts = path.replace(/^\//, "").split("/");
        const id = parts[0];
        if (parts.length === 1) {
          callback(data === null ? "delete" : "put", data, id);
        } else {
          callback("field", { [parts[1]]: data }, id);
        }
      }
    } catch { /* malformed */ }
  });

  src.addEventListener("patch", (e) => {
    try {
      const { path, data } = JSON.parse(e.data);
      if (!data || typeof data !== "object") return;
      if (!path || path === "/") {
        for (const [id, d] of Object.entries(data)) {
          callback(d === null ? "delete" : "put", d, id);
        }
      } else {
        callback("patch", data, path.replace(/^\//, ""));
      }
    } catch { /* malformed */ }
  });

  src.onerror = () => console.info("[WhiteboardSync] reconnecting…");
  return src;
}

export function connectWhiteboard({ firebaseUrl, roomId, onMaps, onTokens, onCamera }) {
  disconnectWhiteboard();
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  _onMaps = onMaps;
  _onTokens = onTokens;
  _onCamera = onCamera;

  const base = wbBase(firebaseUrl, roomId);

  // Maps SSE
  try {
    _mapsSource = listenNode(`${base}/maps.json`, (event, data, id) => {
      _onMaps?.(event, data, id);
    });
  } catch (err) {
    console.warn("[WhiteboardSync] maps SSE error:", err);
  }

  // Tokens SSE
  try {
    _tokensSource = listenNode(`${base}/tokens.json`, (event, data, id) => {
      _onTokens?.(event, data, id);
    });
  } catch (err) {
    console.warn("[WhiteboardSync] tokens SSE error:", err);
  }

  // Camera SSE
  try {
    _cameraSource = new EventSource(`${base}/camera.json`);
    _cameraSource.addEventListener("put", (e) => {
      try {
        const { data } = JSON.parse(e.data);
        _onCamera?.(data);
      } catch { /* malformed */ }
    });
    _cameraSource.onerror = () => {};
  } catch (err) {
    console.warn("[WhiteboardSync] camera SSE error:", err);
  }

  console.info("[WhiteboardSync] Connected to", base);
}

export function disconnectWhiteboard() {
  _mapsSource?.close();
  _tokensSource?.close();
  _cameraSource?.close();
  _mapsSource = null;
  _tokensSource = null;
  _cameraSource = null;
  _onMaps = null;
  _onTokens = null;
  _onCamera = null;
}

export function isConnected() {
  return _tokensSource !== null;
}

export { PLAYER_ID };
