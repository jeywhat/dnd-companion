import { state } from "../../app/store.js";
import {
  connectPartySync as _connect,
  disconnectPartySync as _disconnect,
  SESSION_ID,
} from "../../adapters/firebase-sync.js";
import { renderParty } from "./renderer.js";

function onPartyUpdate(sid, member) {
  if (sid === SESSION_ID) return;

  if (!member || typeof member !== "object") {
    // Suppression : chercher l'entrée dont le .sid correspond
    for (const [key, val] of Object.entries(state.party)) {
      if (val.sid === sid) { delete state.party[key]; break; }
    }
  } else {
    const nameKey = (member.name || "").trim() || sid;
    // Nettoyer une éventuelle entrée obsolète pour ce même sid sous un ancien nom
    for (const [key, val] of Object.entries(state.party)) {
      if (val.sid === sid && key !== nameKey) delete state.party[key];
    }
    state.party[nameKey] = { ...member, sid };
  }

  renderParty();
}

export function connectParty({ firebaseUrl, roomId }) {
  _disconnect();
  _connect({ firebaseUrl, roomId, onPartyUpdate });
}

export function disconnectParty() {
  _disconnect();
  if (state.party) {
    for (const key of Object.keys(state.party)) delete state.party[key];
  }
  renderParty();
}
