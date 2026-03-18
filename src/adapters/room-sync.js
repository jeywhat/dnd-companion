import { buildBase } from "./firebase-sync.js";

let _kicksSource = null;
let _metaSource  = null;

export function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function createRoom({ firebaseUrl, code, name, gmSid, gmName }) {
  const url = `${buildBase(firebaseUrl, code)}/_meta.json`;
  const res = await fetch(url, {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ name, gmSid, gmName, createdAt: Date.now() }),
  });
  if (!res.ok) throw new Error(`Firebase error ${res.status}`);
}

export async function fetchRoomMeta({ firebaseUrl, code }) {
  const url = `${buildBase(firebaseUrl, code)}/_meta.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Firebase error ${res.status}`);
  const data = await res.json();
  if (!data || typeof data !== "object" || !data.name) return null;
  return data;
}

export async function deleteRoomMeta({ firebaseUrl, code }) {
  const url = `${buildBase(firebaseUrl, code)}/_meta.json`;
  await fetch(url, { method: "DELETE" }).catch(() => {});
}

export async function kickMember({ firebaseUrl, code, sid }) {
  const url = `${buildBase(firebaseUrl, code)}/_kicks/${sid}.json`;
  await fetch(url, {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(Date.now()),
  });
}

export async function deleteKick({ firebaseUrl, code, sid }) {
  const url = `${buildBase(firebaseUrl, code)}/_kicks/${sid}.json`;
  await fetch(url, { method: "DELETE" }).catch(() => {});
}

export async function removePartyMember({ firebaseUrl, code, sid }) {
  const url = `${buildBase(firebaseUrl, code)}/party/${sid}.json`;
  await fetch(url, { method: "DELETE" }).catch(() => {});
}

export async function cleanupStalePartyMembers({ firebaseUrl, code, maxAgeMs = 300_000 }) {
  try {
    const url = `${buildBase(firebaseUrl, code)}/party.json`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || typeof data !== "object") return;
    const now = Date.now();
    const stale = Object.entries(data)
      .filter(([, m]) => !m?.updatedAt || (now - m.updatedAt) > maxAgeMs)
      .map(([sid]) => sid);
    if (stale.length === 0) return;
    await Promise.all(stale.map(sid => removePartyMember({ firebaseUrl, code, sid })));
    console.info(`[RoomSync] 🧹 ${stale.length} membre(s) périmé(s) supprimé(s)`);
  } catch (err) {
    console.warn("[RoomSync] Cleanup stale members error:", err);
  }
}

// ─── Kick listener (player only) ─────────────────────────────────────────────

export function listenForKick({ firebaseUrl, code, sid, onKick }) {
  stopKickListener();
  if (!firebaseUrl?.startsWith("https://") || !code?.trim() || !sid) return;

  const url = `${buildBase(firebaseUrl, code)}/_kicks/${sid}.json`;
  try {
    _kicksSource = new EventSource(url);
    _kicksSource.addEventListener("put", (e) => {
      try {
        const { path, data } = JSON.parse(e.data);
        if (path === "/" && data !== null) onKick();
      } catch { /* JSON malformé */ }
    });
  } catch (err) {
    console.warn("[RoomSync] Kick listener error:", err);
  }
}

export function stopKickListener() {
  _kicksSource?.close();
  _kicksSource = null;
}

// ─── Meta listener — détecte dissolution de salle (player only) ──────────────

export function listenRoomMeta({ firebaseUrl, code, onDissolve }) {
  stopMetaListener();
  if (!firebaseUrl?.startsWith("https://") || !code?.trim()) return;

  const url = `${buildBase(firebaseUrl, code)}/_meta.json`;
  try {
    _metaSource = new EventSource(url);
    let isFirst = true;
    _metaSource.addEventListener("put", (e) => {
      try {
        const { path, data } = JSON.parse(e.data);
        if (path === "/") {
          if (isFirst) { isFirst = false; return; }
          if (data === null) onDissolve();
        }
      } catch { /* JSON malformé */ }
    });
  } catch (err) {
    console.warn("[RoomSync] Meta listener error:", err);
  }
}

export function stopMetaListener() {
  _metaSource?.close();
  _metaSource = null;
}
