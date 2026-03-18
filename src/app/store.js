import { loadState, saveState, resetState as clearStorage } from "../adapters/storage.js";
import { clamp, toInt } from "../core/character.js";
import { HISTORY_LIMIT, ROLL_MODES } from "../data/constants.js";
import { uniqueId } from "../shared/dom.js";
import { sendHpWebhook } from "../adapters/discord.js";
import { publishParty } from "../adapters/firebase-sync.js";
import { t } from "../shared/i18n.js";

export let appElement = null;
export let state = null;

let saveTimerId       = 0;
let hpNotifyTimerId   = 0;
let hpNotifyFromHp    = null;
let partySyncTimerId  = 0;

// Injected at startup by main.js to avoid circular dep with app/renderer.js
let _renderFn = () => {};

export function injectRender(fn) {
  _renderFn = fn;
}

export function initStore(container) {
  appElement = container;
  state = loadState();
  state.party = {}; // runtime-only, not persisted
}

export function getCharacterName() {
  return state.character.name || t("app.defaultCharName");
}

export function getCharacterSubtitle() {
  const className = state.character.className || t("app.defaultClass");
  return t("character.subtitle", { class: className, level: state.character.level });
}

export function getModeLabel(mode) {
  const key = `rollMode.${mode}`;
  return t(key) !== key ? t(key) : (ROLL_MODES.find((entry) => entry.key === mode)?.label ?? "Normal");
}

export function queueSave() {
  window.clearTimeout(saveTimerId);
  saveTimerId = window.setTimeout(() => saveState(state), 150);
}

export function queuePartySync() {
  window.clearTimeout(partySyncTimerId);
  partySyncTimerId = window.setTimeout(() => {
    publishParty({
      firebaseUrl: state.settings.firebaseUrl,
      roomId     : state.settings.syncRoom,
      member     : {
        name     : state.character.name,
        className: state.character.className,
        level    : state.character.level,
        currentHp: state.character.currentHp,
        hpMax    : state.character.hpMax,
        avatar   : state.character.avatar || "",
        diceColor: state.settings.diceColor,
        role     : state.room?.role || null,
      },
    });
  }, 600);
}

export function setStatus(tone, message) {
  state.ui.status = { tone, message };
  const liveRegion = appElement.querySelector("[data-live-region]");

  if (liveRegion) {
    liveRegion.textContent = "";
    window.requestAnimationFrame(() => {
      liveRegion.textContent = message;
    });
  }
}

export function addHistory(text, kind = "info") {
  state.ui.history = [
    { id: uniqueId("hist"), text, kind },
    ...state.ui.history
  ].slice(0, HISTORY_LIMIT);
}

export function queueHpNotify(previousHp) {
  if (hpNotifyFromHp === null) {
    hpNotifyFromHp = previousHp;
  }

  window.clearTimeout(hpNotifyTimerId);
  hpNotifyTimerId = window.setTimeout(async () => {
    const fromHp = hpNotifyFromHp;
    const toHp = state.character.currentHp;
    hpNotifyFromHp = null;

    if (fromHp !== toHp) {
      sendHpWebhook(state.settings, {
        characterName: getCharacterName(),
        from: fromHp,
        to: toHp,
        max: state.character.hpMax,
        delta: toHp - fromHp
      });
    }
  }, 4000);
}

function normaliseRuntimeState() {
  state.character.level = clamp(toInt(state.character.level, 1), 1, 20);
  state.character.hpMax = clamp(toInt(state.character.hpMax, 10), 1, 999);
  state.character.currentHp = clamp(
    toInt(state.character.currentHp, state.character.hpMax),
    0,
    state.character.hpMax
  );
  state.character.armorClass = clamp(toInt(state.character.armorClass, 10), 0, 40);
}

export function commit(syncInputs = true) {
  normaliseRuntimeState();
  queueSave();
  queuePartySync();
  _renderFn(syncInputs);
}

export function resetToDefault() {
  clearStorage();
  state = loadState();
  state.party = {};
}

export function getCleanupHandlers() {
  return {
    flush: () => {
      window.clearTimeout(saveTimerId);
      window.clearTimeout(hpNotifyTimerId);
      window.clearTimeout(partySyncTimerId);
      saveState(state);
    }
  };
}
