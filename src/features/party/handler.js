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
    delete state.party[sid];
  } else {
    state.party[sid] = { ...member, sid };
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
