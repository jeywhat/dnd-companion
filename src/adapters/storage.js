import { ABILITIES, ROLL_MODES, STORAGE_KEY, createDefaultState } from "../data/constants.js";
import { clamp, normaliseSelection, toInt } from "../core/character.js";

function cloneFallback(value) {
  return JSON.parse(JSON.stringify(value));
}

export function deepClone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return cloneFallback(value);
}

function sanitiseArray(values) {
  return Array.isArray(values) ? values.filter(Boolean) : [];
}

function sanitiseAttacks(attacks) {
  return sanitiseArray(attacks).map((attack, index) => ({
    id: typeof attack.id === "string" && attack.id ? attack.id : `atk-${index}-${Date.now()}`,
    name: typeof attack.name === "string" ? attack.name.trim() : "",
    ability: ABILITIES.some((ability) => ability.key === attack.ability)
      ? attack.ability
      : "strength",
    proficient: Boolean(attack.proficient),
    bonus: toInt(attack.bonus, 0),
    damage: typeof attack.damage === "string" ? attack.damage.trim() : ""
  })).filter((attack) => attack.name);
}

function sanitiseSpells(spells) {
  return sanitiseArray(spells).map((spell, index) => ({
    id: typeof spell.id === "string" && spell.id ? spell.id : `spl-${index}-${Date.now()}`,
    name: typeof spell.name === "string" ? spell.name.trim() : "",
    level: clamp(toInt(spell.level, 0), 0, 9),
    slotCost: clamp(toInt(spell.slotCost, 0), 0, 9),
    damage: typeof spell.damage === "string" ? spell.damage.trim() : "",
    note: typeof spell.note === "string" ? spell.note.trim() : ""
  })).filter((spell) => spell.name);
}

function sanitiseSpellSlots(raw) {
  const result = {};
  for (let level = 1; level <= 9; level++) {
    const entry = raw?.[level] ?? {};
    const max = clamp(toInt(entry.max, 0), 0, 9);
    result[level] = { max, used: clamp(toInt(entry.used, 0), 0, max) };
  }
  return result;
}

export function sanitiseState(rawState) {
  const defaultState = createDefaultState();

  if (!rawState || typeof rawState !== "object") {
    return defaultState;
  }

  const nextState = deepClone(defaultState);
  const rawCharacter = rawState.character ?? {};
  const rawSettings = rawState.settings ?? {};
  const rawSessionLock = rawState.sessionLock ?? {};
  const rawUi = rawState.ui ?? {};

  nextState.character.name = typeof rawCharacter.name === "string" ? rawCharacter.name.trim() : "";
  nextState.character.className =
    typeof rawCharacter.className === "string" ? rawCharacter.className.trim() : "";
  nextState.character.avatar =
    typeof rawCharacter.avatar === "string" && rawCharacter.avatar.startsWith("data:image/")
      ? rawCharacter.avatar.slice(0, 200_000)
      : "";
  nextState.character.level = clamp(toInt(rawCharacter.level, 1), 1, 20);

  for (const ability of ABILITIES) {
    nextState.character.abilities[ability.key] = clamp(
      toInt(rawCharacter.abilities?.[ability.key], 10),
      1,
      30
    );
  }

  nextState.character.hpMax = clamp(toInt(rawCharacter.hpMax, 10), 1, 999);
  nextState.character.currentHp = clamp(
    toInt(rawCharacter.currentHp, nextState.character.hpMax),
    0,
    nextState.character.hpMax
  );
  nextState.character.armorClass = clamp(toInt(rawCharacter.armorClass, 10), 0, 40);
  nextState.character.skillProficiencies = normaliseSelection(sanitiseArray(rawCharacter.skillProficiencies));
  nextState.character.saveProficiencies = normaliseSelection(sanitiseArray(rawCharacter.saveProficiencies));
  nextState.character.attacks = sanitiseAttacks(rawCharacter.attacks);
  nextState.character.spells = sanitiseSpells(rawCharacter.spells);
  nextState.character.spellSlots = sanitiseSpellSlots(rawCharacter.spellSlots);

  nextState.settings = {
    webhookUrl : typeof rawSettings.webhookUrl  === "string" ? rawSettings.webhookUrl.trim()  : "",
    firebaseUrl: typeof rawSettings.firebaseUrl === "string" ? rawSettings.firebaseUrl.trim() : "",
    syncRoom   : typeof rawSettings.syncRoom    === "string" ? rawSettings.syncRoom.trim()    : "",
    diceColor  : typeof rawSettings.diceColor   === "string" && rawSettings.diceColor.startsWith("#")
      ? rawSettings.diceColor : "#7c3aed",
  };

  nextState.sessionLock.isLocked = Boolean(rawSessionLock.isLocked);
  nextState.sessionLock.baseline =
    rawSessionLock.baseline && typeof rawSessionLock.baseline === "object"
      ? rawSessionLock.baseline
      : null;

  nextState.ui.activeTab =
    typeof rawUi.activeTab === "string" ? rawUi.activeTab : defaultState.ui.activeTab;
  nextState.ui.rollMode = ROLL_MODES.some((mode) => mode.key === rawUi.rollMode)
    ? rawUi.rollMode
    : defaultState.ui.rollMode;
  nextState.ui.status =
    rawUi.status && typeof rawUi.status.message === "string"
      ? {
          tone: typeof rawUi.status.tone === "string" ? rawUi.status.tone : "info",
          message: rawUi.status.message
        }
      : defaultState.ui.status;
  nextState.ui.lastRoll =
    rawUi.lastRoll && typeof rawUi.lastRoll === "object" ? rawUi.lastRoll : null;
  nextState.ui.history = sanitiseArray(rawUi.history).slice(0, 8);

  return nextState;
}

export function loadState() {
  try {
    const rawState = window.localStorage.getItem(STORAGE_KEY);

    if (!rawState) {
      return createDefaultState();
    }

    return sanitiseState(JSON.parse(rawState));
  } catch (error) {
    console.error("Impossible de charger les données locales :", error);
    return createDefaultState();
  }
}

export function saveState(state) {
  const serialisableState = deepClone(state);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serialisableState));
}

export function resetState() {
  window.localStorage.removeItem(STORAGE_KEY);
}
