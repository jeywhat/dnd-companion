import { state, setStatus, commit, getCharacterName } from "../../app/store.js";
import { saveState } from "../../adapters/storage.js";
import { SESSION_ID } from "../../adapters/firebase-sync.js";
import {
  generateRoomCode,
  createRoom,
  fetchRoomMeta,
  deleteRoomMeta,
  kickMember,
  deleteKick,
  removePartyMember,
  listenForKick,
  stopKickListener,
  listenRoomMeta,
  stopMetaListener,
} from "../../adapters/room-sync.js";
import { reconnectSync } from "../settings/handler.js";
import { connectCombat, disconnectCombat } from "../combat-tracker/handler.js";
import { t } from "../../shared/i18n.js";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function applyRoom({ role, name, code, gmSid }) {
  state.room.role  = role;
  state.room.name  = name;
  state.room.code  = code;
  state.room.gmSid = gmSid;
  state.settings.syncRoom = code;
  commit(true);
  reconnectSync();
  connectCombat({ firebaseUrl: state.settings.firebaseUrl, roomId: code });
}

export function clearRoom() {
  stopKickListener();
  stopMetaListener();
  disconnectCombat();

  // Supprimer notre entrée de party Firebase avant de vider l'état local
  const { firebaseUrl } = state.settings;
  const code = state.room.code;
  if (firebaseUrl && code) {
    removePartyMember({ firebaseUrl, code, sid: SESSION_ID }).catch(() => {});
  }

  state.room.role  = null;
  state.room.name  = "";
  state.room.code  = "";
  state.room.gmSid = "";
  state.settings.syncRoom = "";
  if (state.party) {
    for (const key of Object.keys(state.party)) delete state.party[key];
  }

  // Sauvegarde immédiate (pas debounced) pour vider le localStorage maintenant
  saveState(state);
  commit(true);
  reconnectSync();
}

function startListeners(role, code) {
  if (role !== "player") return;
  listenForKick({
    firebaseUrl: state.settings.firebaseUrl,
    code,
    sid : SESSION_ID,
    onKick: () => {
      setStatus("alert", t("status.roomKicked"));
      clearRoom();
    },
  });
  listenRoomMeta({
    firebaseUrl: state.settings.firebaseUrl,
    code,
    onDissolve: () => {
      setStatus("alert", t("status.roomDissolved"));
      clearRoom();
    },
  });
}

// ─── Reconnect on app startup (room already in persisted state) ───────────────

export function reconnectRoom() {
  if (!state.room?.role || !state.room?.code) return;
  startListeners(state.room.role, state.room.code);
  connectCombat({ firebaseUrl: state.settings.firebaseUrl, roomId: state.room.code });
}

// ─── Action handler ───────────────────────────────────────────────────────────

/** @returns {boolean} */
export async function handleRoomAction(button) {
  const { action } = button.dataset;

  if (action === "create-room") {
    const nameInput = document.getElementById("room-name-input");
    const name = nameInput?.value.trim();
    if (!name) {
      setStatus("error", t("error.roomNameRequired"));
      commit(false);
      return true;
    }
    const code = generateRoomCode();
    try {
      await createRoom({
        firebaseUrl: state.settings.firebaseUrl,
        code,
        name,
        gmSid : SESSION_ID,
        gmName: getCharacterName(),
      });
      applyRoom({ role: "gm", name, code, gmSid: SESSION_ID });
      setStatus("success", t("status.roomCreated", { name, code }));
      commit(false);
    } catch (err) {
      setStatus("error", err.message);
      commit(false);
    }
    return true;
  }

  if (action === "join-room") {
    const codeInput = document.getElementById("room-code-input");
    const code = codeInput?.value.trim().toUpperCase();
    if (!code) {
      setStatus("error", t("error.roomCodeRequired"));
      commit(false);
      return true;
    }
    try {
      const meta = await fetchRoomMeta({ firebaseUrl: state.settings.firebaseUrl, code });
      if (!meta) {
        setStatus("error", t("error.roomNotFound"));
        commit(false);
        return true;
      }
      applyRoom({ role: "player", name: meta.name, code, gmSid: meta.gmSid || "" });
      startListeners("player", code);
      setStatus("success", t("status.roomJoined", { name: meta.name }));
      commit(false);
    } catch {
      setStatus("error", t("error.roomNotFound"));
      commit(false);
    }
    return true;
  }

  if (action === "leave-room") {
    if (!window.confirm(t("confirm.leaveRoom", { name: state.room.name }))) return true;
    try {
      await removePartyMember({
        firebaseUrl: state.settings.firebaseUrl,
        code: state.room.code,
        sid : SESSION_ID,
      });
    } catch { /* best effort */ }
    setStatus("info", t("status.roomLeft"));
    clearRoom();
    return true;
  }

  if (action === "dissolve-room") {
    if (!window.confirm(t("confirm.dissolveRoom", { name: state.room.name }))) return true;
    try {
      await deleteRoomMeta({ firebaseUrl: state.settings.firebaseUrl, code: state.room.code });
      await removePartyMember({ firebaseUrl: state.settings.firebaseUrl, code: state.room.code, sid: SESSION_ID });
    } catch { /* best effort */ }
    setStatus("info", t("status.roomDissolved"));
    clearRoom();
    return true;
  }

  if (action === "kick-member") {
    const { sid, name } = button.dataset;
    if (!window.confirm(t("confirm.kickMember", { name }))) return true;
    try {
      // Supprimer l'entrée party immédiatement (visible par tous)
      await removePartyMember({ firebaseUrl: state.settings.firebaseUrl, code: state.room.code, sid });
      // Écrire le kick pour que le joueur reçoive le signal SSE
      await kickMember({ firebaseUrl: state.settings.firebaseUrl, code: state.room.code, sid });
      // Supprimer le kick après 5s → le joueur peut revenir avec le code
      window.setTimeout(() => {
        deleteKick({ firebaseUrl: state.settings.firebaseUrl, code: state.room.code, sid }).catch(() => {});
      }, 5000);
      setStatus("success", t("status.memberKicked", { name }));
      commit(false);
    } catch (err) {
      setStatus("error", err.message);
      commit(false);
    }
    return true;
  }

  if (action === "ban-member") {
    const { sid, name } = button.dataset;
    if (!window.confirm(t("confirm.banMember", { name }))) return true;
    try {
      await removePartyMember({ firebaseUrl: state.settings.firebaseUrl, code: state.room.code, sid });
      await kickMember({ firebaseUrl: state.settings.firebaseUrl, code: state.room.code, sid });
      // Pas de suppression du kick → entrée permanente → joueur banni
      setStatus("success", t("status.memberBanned", { name }));
      commit(false);
    } catch (err) {
      setStatus("error", err.message);
      commit(false);
    }
    return true;
  }

  if (action === "copy-room-code") {
    navigator.clipboard?.writeText(state.room.code).catch(() => {});
    setStatus("success", t("status.roomCodeCopied"));
    commit(false);
    return true;
  }

  return false;
}
