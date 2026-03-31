/**
 * Firebase RTDB sync for the Audio (YouTube) feature.
 * Uses REST + SSE (same pattern as firebase-sync.js).
 *
 * Structure:
 *   /rooms/{roomId}/audio/
 *     videoId    : string     — current YouTube video ID
 *     position   : number     — playback position in seconds
 *     isPlaying  : boolean    — play/pause state
 *     volume     : number     — 0..1
 *     updatedBy  : string     — PLAYER_ID of last controller
 *     updatedAt  : number     — timestamp
 *     sfx        : { id, timestamp }  — last triggered SFX
 */

import { buildBase, PLAYER_ID } from "./firebase-sync.js";

let _eventSource = null;
let _onRemoteUpdate = null;

function buildAudioBase(firebaseUrl, roomId) {
  return `${buildBase(firebaseUrl, roomId)}/audio`;
}

// ─── SSE Listener ────────────────────────────────────────────────────────────

export function connectAudioSync({ firebaseUrl, roomId, onRemoteUpdate }) {
  disconnectAudioSync();
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  _onRemoteUpdate = onRemoteUpdate;
  const url = `${buildAudioBase(firebaseUrl, roomId)}.json`;

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
        // Partial field update (e.g. path="/isPlaying")
        const field = path.replace(/^\//, "");
        _onRemoteUpdate?.("field", { [field]: data });
      } catch { /* JSON parse error */ }
    });

    _eventSource.addEventListener("patch", (e) => {
      try {
        const { data } = JSON.parse(e.data);
        if (data && typeof data === "object") {
          _onRemoteUpdate?.("patch", data);
        }
      } catch { /* JSON parse error */ }
    });

    _eventSource.onerror = () => console.info("[AudioSync] Reconnexion…");
    console.info("[AudioSync] Connecté à", url);
  } catch (err) {
    console.warn("[AudioSync] Connexion SSE impossible :", err);
  }
}

export function disconnectAudioSync() {
  _eventSource?.close();
  _eventSource = null;
}

// ─── Publish ─────────────────────────────────────────────────────────────────

export async function publishAudioState({ firebaseUrl, roomId, patch }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  const url = `${buildAudioBase(firebaseUrl, roomId)}.json`;
  const body = JSON.stringify({
    ...patch,
    updatedBy: PLAYER_ID,
    updatedAt: Date.now(),
  });

  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch((err) => console.warn("[AudioSync publish]", err));
}

export async function publishSfx({ firebaseUrl, roomId, videoId, label }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  const url = `${buildAudioBase(firebaseUrl, roomId)}/sfx.json`;
  const body = JSON.stringify({
    videoId,
    label,
    triggeredBy: PLAYER_ID,
    timestamp: Date.now(),
  });

  await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch((err) => console.warn("[AudioSync sfx]", err));
}

export { PLAYER_ID };
