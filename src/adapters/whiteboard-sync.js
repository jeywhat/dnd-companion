/**
 * Whiteboard sync — Firebase Realtime Database REST + SSE.
 *
 * Data lives at /rooms/{roomId}/whiteboard/
 *   background : { url, name }
 *   tokens/{tokenId} : { id, type, ownerId, ownerName, name, x, y, color, locked }
 */

import { buildBase, PLAYER_ID } from "./firebase-sync.js";

let _bgSource     = null;
let _tokensSource = null;
let _onBackground = null;
let _onTokens     = null;

function wbBase(firebaseUrl, roomId) {
  return `${buildBase(firebaseUrl, roomId)}/whiteboard`;
}

// ─── Background image ─────────────────────────────────────────────────────────

export async function publishBackground({ firebaseUrl, roomId, background }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;
  const url = `${wbBase(firebaseUrl, roomId)}/background.json`;
  await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(background),
  }).catch((err) => console.warn("[WhiteboardSync] bg publish error:", err));
}

export async function clearBackground({ firebaseUrl, roomId }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;
  const url = `${wbBase(firebaseUrl, roomId)}/background.json`;
  await fetch(url, { method: "DELETE" }).catch(() => {});
}

// ─── Tokens CRUD ──────────────────────────────────────────────────────────────

export async function publishToken({ firebaseUrl, roomId, token }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;
  const url = `${wbBase(firebaseUrl, roomId)}/tokens/${token.id}.json`;
  await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...token, updatedAt: Date.now() }),
  }).catch((err) => console.warn("[WhiteboardSync] token publish error:", err));
}

export async function updateTokenPosition({ firebaseUrl, roomId, tokenId, x, y }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;
  const url = `${wbBase(firebaseUrl, roomId)}/tokens/${tokenId}.json`;
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y, updatedAt: Date.now() }),
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

// ─── SSE listeners ────────────────────────────────────────────────────────────

export function connectWhiteboard({ firebaseUrl, roomId, onBackground, onTokens }) {
  disconnectWhiteboard();
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  _onBackground = onBackground;
  _onTokens = onTokens;

  // Listen to background changes
  const bgUrl = `${wbBase(firebaseUrl, roomId)}/background.json`;
  try {
    _bgSource = new EventSource(bgUrl);
    _bgSource.addEventListener("put", (e) => {
      try {
        const { data } = JSON.parse(e.data);
        _onBackground?.(data);
      } catch { /* malformed */ }
    });
    _bgSource.onerror = () => console.info("[WhiteboardSync] bg reconnecting…");
  } catch (err) {
    console.warn("[WhiteboardSync] bg SSE error:", err);
  }

  // Listen to token changes
  const tokensUrl = `${wbBase(firebaseUrl, roomId)}/tokens.json`;
  try {
    _tokensSource = new EventSource(tokensUrl);

    _tokensSource.addEventListener("put", (e) => {
      try {
        const { path, data } = JSON.parse(e.data);
        if (!path) return;
        if (path === "/") {
          // Full snapshot
          _onTokens?.("snapshot", data);
        } else {
          // Single token update: path = "/{tokenId}" or "/{tokenId}/x" etc.
          const parts = path.replace(/^\//, "").split("/");
          const tokenId = parts[0];
          if (parts.length === 1) {
            // Full token put/delete
            _onTokens?.(data === null ? "delete" : "put", data, tokenId);
          } else {
            // Partial field update (from PATCH) — re-fetch handled by patch event
            _onTokens?.("field", { [parts[1]]: data }, tokenId);
          }
        }
      } catch { /* malformed */ }
    });

    _tokensSource.addEventListener("patch", (e) => {
      try {
        const { path, data } = JSON.parse(e.data);
        if (!path || !data || typeof data !== "object") return;
        if (path === "/") {
          // Multiple tokens updated at root
          for (const [tokenId, tokenData] of Object.entries(data)) {
            _onTokens?.(tokenData === null ? "delete" : "put", tokenData, tokenId);
          }
        } else {
          // Fields patched on a single token: path = "/{tokenId}"
          const tokenId = path.replace(/^\//, "");
          _onTokens?.("patch", data, tokenId);
        }
      } catch { /* malformed */ }
    });

    _tokensSource.onerror = () => console.info("[WhiteboardSync] tokens reconnecting…");
    console.info("[WhiteboardSync] Connected to", wbBase(firebaseUrl, roomId));
  } catch (err) {
    console.warn("[WhiteboardSync] tokens SSE error:", err);
  }
}

export function disconnectWhiteboard() {
  _bgSource?.close();
  _tokensSource?.close();
  _bgSource = null;
  _tokensSource = null;
  _onBackground = null;
  _onTokens = null;
}

export function isConnected() {
  return _tokensSource !== null;
}

export { PLAYER_ID };
