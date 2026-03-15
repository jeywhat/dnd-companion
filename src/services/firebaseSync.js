/**
 * Synchronisation multijoueur en temps réel via Firebase Realtime Database REST + SSE.
 * Aucune dépendance — utilise uniquement fetch() et EventSource.
 *
 * Architecture :
 *   PUT /rooms/{roomId}/{SESSION_ID}  →  écrase le dernier jet du joueur
 *
 * Firebase envoie un événement "put" (pas "patch") aux listeners SSE quand un
 * enfant est mis à jour via PUT. Le "put" initial (snapshot complet) a path="/".
 * Les puts suivants ont path="/{sessionId}" et data = le nouvel objet.
 */

export const SESSION_ID = Math.random().toString(36).slice(2, 10);

let _eventSource = null;
let _onRoll      = null;

function buildBase(firebaseUrl, roomId) {
  const base = firebaseUrl.replace(/\/$/, "");
  const room = encodeURIComponent(roomId.trim().toLowerCase().replace(/\s+/g, "-"));
  return `${base}/rooms/${room}`;
}

function processRoll(sid, roll) {
  if (sid === SESSION_ID) return;
  if (!roll || typeof roll !== "object") return;
  console.info("[FirebaseSync] ✅ Jet reçu de", sid, roll);
  _onRoll?.(roll);
}

export function connectSync({ firebaseUrl, roomId, onRoll }) {
  disconnectSync();
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  _onRoll = onRoll;
  const url = `${buildBase(firebaseUrl, roomId)}.json`;

  try {
    _eventSource = new EventSource(url);

    // "put" = remplacement complet. Deux cas :
    //   path="/"          → snapshot initial de toute la room → ignorer
    //   path="/{sid}"     → PUT d'un joueur → traiter
    _eventSource.addEventListener("put", (e) => {
      try {
        const { path, data } = JSON.parse(e.data);
        if (!path || !data) return;
        if (path === "/") return; // snapshot initial → ignorer
        const sid = path.replace(/^\//, "");
        processRoll(sid, data);
      } catch { /* JSON malformé */ }
    });

    // "patch" = mise à jour partielle (PATCH/UPDATE Firebase)
    _eventSource.addEventListener("patch", (e) => {
      try {
        const { path, data } = JSON.parse(e.data);
        if (!data || typeof data !== "object") return;
        if (!path || path === "/") {
          for (const [sid, roll] of Object.entries(data)) processRoll(sid, roll);
        } else {
          processRoll(path.replace(/^\//, ""), data);
        }
      } catch { /* JSON malformé */ }
    });

    _eventSource.onerror = () => console.info("[FirebaseSync] Reconnexion…");

    console.info("[FirebaseSync] Connecté à", url, "| SESSION_ID =", SESSION_ID);
  } catch (err) {
    console.warn("[FirebaseSync] Connexion SSE impossible :", err);
  }
}

export function disconnectSync() {
  _eventSource?.close();
  _eventSource = null;
}

export async function publishRoll({ firebaseUrl, roomId, roll }) {
  if (!firebaseUrl?.startsWith("https://") || !roomId?.trim()) return;

  const url = `${buildBase(firebaseUrl, roomId)}/${SESSION_ID}.json`;
  const body = JSON.stringify({ ...roll, sessionId: SESSION_ID, timestamp: Date.now() });

  console.info("[FirebaseSync] 📤 Publication vers", url, roll);

  await fetch(url, {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch((err) => console.warn("[FirebaseSync publish]", err));
}
