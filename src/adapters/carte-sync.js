/**
 * Firebase Realtime Database sync for the Carte (map/whiteboard) feature.
 *
 * Structure :
 *   /rooms/{roomId}/carte/
 *     tokens/{tokenId}  — { id, owner, type, x, y, size, label, color, updatedAt, updatedBy }
 *     maps/{mapId}      — { id, url, x, y, w, h, updatedAt }
 *     camera/           — { zoom, offsetX, offsetY } (optional shared view)
 *
 * Uses Firebase REST API (PUT/DELETE) + SSE (EventSource) for real-time sync.
 */

import { buildBase, PLAYER_ID } from "./firebase-sync.js";

let _carteEventSource = null;
let _onCarteUpdate = null;
const _debounceTimers = new Map();

/** Create an AbortSignal that times out after `ms` milliseconds. */
function _timeoutSignal(ms = 8000) {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

function buildCarteBase(firebaseUrl, roomId) {
  return `${buildBase(firebaseUrl, roomId)}/carte`;
}

// ── SSE listener ────────────────────────────────────────────────────────────

/**
 * Connect to the carte SSE stream.
 * @param {{ firebaseUrl: string, roomId: string, onCarteUpdate: (data, path) => void }} opts
 */
export function connectCarteSync({ firebaseUrl, roomId, onCarteUpdate }) {
  disconnectCarteSync();
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  _onCarteUpdate = onCarteUpdate;
  const url = `${buildCarteBase(firebaseUrl, roomId)}.json`;

  try {
    _carteEventSource = new EventSource(url);

    _carteEventSource.addEventListener("put", (e) => {
      try {
        const { path, data } = JSON.parse(e.data);
        if (!path) return;
        console.info("[CarteSync] 📥 put", path);
        _onCarteUpdate?.(data, path);
      } catch { /* malformed JSON */ }
    });

    _carteEventSource.addEventListener("patch", (e) => {
      try {
        const { path, data } = JSON.parse(e.data);
        if (!path) return;
        console.info("[CarteSync] 📥 patch", path);
        _onCarteUpdate?.(data, path);
      } catch { /* malformed JSON */ }
    });

    _carteEventSource.onerror = () => console.info("[CarteSync] 🔄 Reconnecting…");

    console.info("[CarteSync] ✅ Connected to", url);
  } catch (err) {
    console.warn("[CarteSync] ❌ SSE connection failed:", err);
  }
}

export function disconnectCarteSync() {
  _carteEventSource?.close();
  _carteEventSource = null;
}

// ── Token CRUD ──────────────────────────────────────────────────────────────

export async function publishToken({ firebaseUrl, roomId, token }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  const url = `${buildCarteBase(firebaseUrl, roomId)}/tokens/${token.id}.json`;
  const body = JSON.stringify({ ...token, updatedAt: Date.now(), updatedBy: PLAYER_ID });

  console.info("[CarteSync] 📤 Publish token", token.id);

  try {
    const resp = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      signal: _timeoutSignal(8000),
    });
    if (!resp.ok) {
      console.warn("[CarteSync] ❌ Token publish HTTP", resp.status);
    }
  } catch (err) {
    console.warn("[CarteSync] ❌ Token publish failed:", err.name === "AbortError" ? "timeout" : err);
  }
}

/**
 * Debounced token publish — avoids flooding Firebase during drag.
 */
export function publishTokenDebounced({ firebaseUrl, roomId, token }, delay = 100) {
  const existing = _debounceTimers.get(token.id);
  if (existing) clearTimeout(existing);

  _debounceTimers.set(
    token.id,
    setTimeout(() => {
      _debounceTimers.delete(token.id);
      publishToken({ firebaseUrl, roomId, token });
    }, delay)
  );
}

/**
 * Debounced map publish — avoids flooding Firebase during drag.
 */
export function publishMapDebounced({ firebaseUrl, roomId, map }, delay = 100) {
  const key = `map-${map.id}`;
  const existing = _debounceTimers.get(key);
  if (existing) clearTimeout(existing);

  _debounceTimers.set(
    key,
    setTimeout(() => {
      _debounceTimers.delete(key);
      // Strip non-serializable _img before publish
      const { _img, _loading, ...syncMap } = map;
      publishMap({ firebaseUrl, roomId, map: syncMap });
    }, delay)
  );
}

export async function deleteToken({ firebaseUrl, roomId, tokenId }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  const url = `${buildCarteBase(firebaseUrl, roomId)}/tokens/${tokenId}.json`;
  console.info("[CarteSync] 🗑️ Delete token", tokenId);
  await fetch(url, { method: "DELETE" }).catch((err) =>
    console.warn("[CarteSync] delete token error:", err)
  );
}

// ── Map CRUD ────────────────────────────────────────────────────────────────

export async function publishMap({ firebaseUrl, roomId, map }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  const url = `${buildCarteBase(firebaseUrl, roomId)}/maps/${map.id}.json`;
  const body = JSON.stringify({ ...map, updatedAt: Date.now() });

  console.info("[CarteSync] 📤 Publish map", map.id);
  try {
    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      signal: _timeoutSignal(8000),
    });
  } catch (err) {
    console.warn("[CarteSync] ❌ Map publish failed:", err.name === "AbortError" ? "timeout" : err);
  }
}

export async function deleteMap({ firebaseUrl, roomId, mapId }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  const url = `${buildCarteBase(firebaseUrl, roomId)}/maps/${mapId}.json`;
  console.info("[CarteSync] 🗑️ Delete map", mapId);
  await fetch(url, { method: "DELETE" }).catch((err) =>
    console.warn("[CarteSync] delete map error:", err)
  );
}

// ── Board management ────────────────────────────────────────────────────────

export async function clearAllCarte({ firebaseUrl, roomId }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  const url = `${buildCarteBase(firebaseUrl, roomId)}.json`;
  console.info("[CarteSync] 🧹 Clear all carte data");
  await fetch(url, { method: "DELETE" }).catch((err) =>
    console.warn("[CarteSync] clear all error:", err)
  );
}
