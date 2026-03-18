import { state, setStatus, triggerRender } from "../../app/store.js";
import { SESSION_ID } from "../../adapters/firebase-sync.js";
import {
  listenCombat,
  stopCombatListener,
  patchCombatRoot,
  putCombatRoot,
  setPanelVisible,
  putInitiative,
  deleteInitiative,
  deleteCombat,
} from "../../adapters/combat-sync.js";
import { calculateModifier } from "../../core/character.js";
import { performRoll } from "../rolls/engine.js";
import { t } from "../../shared/i18n.js";

// ─── SSE update handler ───────────────────────────────────────────────────────

function onCombatUpdate(path, data) {
  if (path === "/" || path === "") {
    if (data === null) {
      state.combat.state        = "idle";
      state.combat.currentTurn  = 0;
      state.combat.round        = 1;
      state.combat.initiatives  = {};
      state.combat.panelVisible = true;
      state.combat._modalRoll   = null;
    } else if (typeof data === "object") {
      state.combat.state        = data.state        ?? "idle";
      state.combat.currentTurn  = data.currentTurn  ?? 0;
      state.combat.round        = data.round        ?? 1;
      state.combat.initiatives  = data.initiatives  ?? {};
      state.combat.panelVisible = data.panelVisible !== false;
      if (data.state === "idle") state.combat._modalRoll = null;
    }
  } else if (path === "/state") {
    state.combat.state = data;
    if (data === "idle") {
      state.combat.initiatives = {};
      state.combat.currentTurn = 0;
      state.combat.round       = 1;
      state.combat._modalRoll  = null;
    }
  } else if (path === "/currentTurn") {
    state.combat.currentTurn = data ?? 0;
  } else if (path === "/round") {
    state.combat.round = data ?? 1;
  } else if (path === "/panelVisible") {
    state.combat.panelVisible = data !== false;
  } else if (path === "/initiatives" && typeof data === "object" && data !== null) {
    state.combat.initiatives = data;
  } else if (path.startsWith("/initiatives/")) {
    const name = decodeURIComponent(path.replace("/initiatives/", ""));
    if (data === null) {
      delete state.combat.initiatives[name];
    } else {
      state.combat.initiatives[name] = data;
    }
  }
  triggerRender(false);
}

// ─── Connect / disconnect ─────────────────────────────────────────────────────

export function connectCombat({ firebaseUrl, roomId }) {
  stopCombatListener();
  listenCombat({ firebaseUrl, code: roomId, onUpdate: onCombatUpdate });
}

export function disconnectCombat() {
  stopCombatListener();
  state.combat.state        = "idle";
  state.combat.currentTurn  = 0;
  state.combat.round        = 1;
  state.combat.initiatives  = {};
  state.combat.panelVisible = true;
  state.combat._modalRoll   = null;
  triggerRender(false);
}

// ─── Helper: sorted initiative list ──────────────────────────────────────────

export function getSortedInitiatives() {
  return Object.values(state.combat.initiatives)
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
}

// ─── Action handler ───────────────────────────────────────────────────────────

/** @returns {boolean} */
export async function handleCombatTrackerAction(button) {
  const { action } = button.dataset;
  const { firebaseUrl } = state.settings;
  const code = state.room.code;

  if (action === "trigger-initiative") {
    if (!firebaseUrl || !code) { setStatus("error", t("error.notInRoom")); return true; }
    try {
      // PUT (full replace) pour garantir un reset propre des initiatives
      await putCombatRoot({ firebaseUrl, code, data: {
        state       : "rolling",
        currentTurn : 0,
        round       : 1,
        initiatives : {},
        panelVisible: true,
      }});
      setStatus("success", t("status.initiativeTriggered"));
    } catch (err) {
      setStatus("error", err.message);
    }
    return true;
  }

  if (action === "add-monster") {
    const nameEl = document.getElementById("monster-name-input");
    const initEl = document.getElementById("monster-init-input");
    const hpEl   = document.getElementById("monster-hp-input");
    const name   = nameEl?.value.trim();
    if (!name) { setStatus("error", t("error.monsterNameRequired")); return true; }
    const initiative = parseInt(initEl?.value, 10) || 10;
    const hpMax      = parseInt(hpEl?.value,   10) || 10;
    try {
      await putInitiative({ firebaseUrl, code, name, data: {
        name, initiative, type: "monster", currentHp: hpMax, hpMax, sid: null,
      }});
      if (nameEl) nameEl.value = "";
      if (initEl) initEl.value = "";
      if (hpEl)   hpEl.value   = "";
      setStatus("success", t("status.monsterAdded", { name }));
    } catch (err) {
      setStatus("error", err.message);
    }
    return true;
  }

  if (action === "remove-monster") {
    const { name } = button.dataset;
    try {
      await deleteInitiative({ firebaseUrl, code, name });
    } catch (err) {
      setStatus("error", err.message);
    }
    return true;
  }

  if (action === "start-combat") {
    try {
      await patchCombatRoot({ firebaseUrl, code, data: { state: "active", currentTurn: 0, round: 1 } });
      setStatus("success", t("status.combatStarted"));
    } catch (err) {
      setStatus("error", err.message);
    }
    return true;
  }

  if (action === "next-turn") {
    const sorted   = getSortedInitiatives();
    if (!sorted.length) return true;
    const nextTurn  = (state.combat.currentTurn + 1) % sorted.length;
    const nextRound = state.combat.round + (nextTurn === 0 ? 1 : 0);
    const nextName  = sorted[nextTurn]?.name ?? "";
    try {
      await patchCombatRoot({ firebaseUrl, code, data: { currentTurn: nextTurn, round: nextRound } });
      setStatus("info", t("status.nextTurn", { name: nextName, round: nextRound }));
    } catch (err) {
      setStatus("error", err.message);
    }
    return true;
  }

  if (action === "end-combat") {
    if (!window.confirm(t("confirm.endCombat"))) return true;
    try {
      await deleteCombat({ firebaseUrl, code });
      // Reset immédiat sans attendre le SSE
      state.combat.state        = "idle";
      state.combat.currentTurn  = 0;
      state.combat.round        = 1;
      state.combat.initiatives  = {};
      state.combat.panelVisible = true;
      state.combat._modalRoll   = null;
      setStatus("info", t("status.combatEnded"));
      triggerRender(false);
    } catch (err) {
      setStatus("error", err.message);
    }
    return true;
  }

  if (action === "toggle-panel-visibility") {
    const newVal = !state.combat.panelVisible;
    try {
      await setPanelVisible({ firebaseUrl, code, visible: newVal });
    } catch (err) {
      setStatus("error", err.message);
    }
    return true;
  }

  if (action === "roll-initiative-dice") {
    const dexMod = calculateModifier(state.character.abilities?.dexterity ?? 10);
    try {
      await performRoll({
        label: t("dashboard.initiative.label"),
        bonus: dexMod,
        note : t("ability.dexterity.short"),
      });
      // performRoll stocke le résultat dans state.ui.lastRoll
      state.combat._modalRoll = {
        d20  : state.ui.lastRoll.baseRoll,
        total: state.ui.lastRoll.total,
      };
      triggerRender(false);
    } catch { /* animation dismissée ou erreur */ }
    return true;
  }

  if (action === "submit-initiative") {
    const total    = parseInt(button.dataset.total, 10);
    if (isNaN(total)) return true;
    const charName = (state.character.name || "").trim();
    if (!charName) return true;
    try {
      await putInitiative({ firebaseUrl, code, name: charName, data: {
        name      : charName,
        initiative: total,
        type      : "player",
        sid       : SESSION_ID,
        avatar    : state.character.avatar || "",
        color     : state.settings.diceColor || "#8b5cf6",
        currentHp : state.character.currentHp,
        hpMax     : state.character.hpMax,
      }});
      state.combat._modalRoll = null;
      setStatus("success", t("status.initiativeSubmitted", { total }));
    } catch (err) {
      setStatus("error", err.message);
    }
    return true;
  }

  return false;
}
