import { state, triggerRender } from "../../app/store.js";
import {
  connectPartySync as _connect,
  disconnectPartySync as _disconnect,
  SESSION_ID,
} from "../../adapters/firebase-sync.js";

function onPartyUpdate(sid, member) {
  if (sid === SESSION_ID) return;

  if (!member || typeof member !== "object") {
    for (const [key, val] of Object.entries(state.party)) {
      if (val.sid === sid) { delete state.party[key]; break; }
    }
  } else {
    const nameKey = (member.name || "").trim() || sid;
    for (const [key, val] of Object.entries(state.party)) {
      if (val.sid === sid && key !== nameKey) delete state.party[key];
    }
    state.party[nameKey] = { ...member, sid };
  }

  triggerRender(false);
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
  triggerRender(false);
}
