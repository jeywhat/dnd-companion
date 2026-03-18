import { buildBase } from "./firebase-sync.js";

let _combatSource = null;
let _onUpdate     = null;

function buildCombatBase(firebaseUrl, code) {
  return `${buildBase(firebaseUrl, code)}/_combat`;
}

export function listenCombat({ firebaseUrl, code, onUpdate }) {
  stopCombatListener();
  if (!firebaseUrl?.startsWith("https://") || !code?.trim()) return;

  _onUpdate = onUpdate;
  const url = `${buildCombatBase(firebaseUrl, code)}.json`;

  try {
    _combatSource = new EventSource(url);

    _combatSource.addEventListener("put", (e) => {
      try {
        const { path, data } = JSON.parse(e.data);
        _onUpdate?.(path ?? "/", data);
      } catch { /* JSON malformé */ }
    });

    _combatSource.addEventListener("patch", (e) => {
      try {
        const { path, data } = JSON.parse(e.data);
        if (!data || typeof data !== "object") return;
        // Flatten patch into individual path updates
        for (const [key, val] of Object.entries(data)) {
          _onUpdate?.(`${path === "/" ? "" : path}/${key}`, val);
        }
      } catch { /* JSON malformé */ }
    });

    _combatSource.onerror = () => console.info("[CombatSync] Reconnexion…");
    console.info("[CombatSync] Connecté à", url);
  } catch (err) {
    console.warn("[CombatSync] Connexion SSE impossible :", err);
  }
}

export function stopCombatListener() {
  _combatSource?.close();
  _combatSource = null;
  _onUpdate = null;
}

export async function patchCombatRoot({ firebaseUrl, code, data }) {
  const url = `${buildCombatBase(firebaseUrl, code)}.json`;
  const res = await fetch(url, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Firebase error ${res.status}`);
}

export async function putInitiative({ firebaseUrl, code, name, data }) {
  const safeName = encodeURIComponent(name);
  const url = `${buildCombatBase(firebaseUrl, code)}/initiatives/${safeName}.json`;
  const res = await fetch(url, {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Firebase error ${res.status}`);
}

export async function deleteInitiative({ firebaseUrl, code, name }) {
  const safeName = encodeURIComponent(name);
  const url = `${buildCombatBase(firebaseUrl, code)}/initiatives/${safeName}.json`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`Firebase error ${res.status}`);
}

export async function deleteCombat({ firebaseUrl, code }) {
  const url = `${buildCombatBase(firebaseUrl, code)}.json`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`Firebase error ${res.status}`);
}
