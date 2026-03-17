import { state, setStatus, addHistory, commit, getCharacterName, getModeLabel } from "../../app/store.js";
import { calculateModifier, getSkillBonus, getSaveBonus, getAbilityLabel, getSkillLabel, toInt } from "../../core/character.js";
import { triggerDiceAnimation, triggerMultiDiceAnimation } from "../../adapters/dice-animation.js";
import { sendFreeDiceWebhook } from "../../adapters/discord.js";
import { publishRoll } from "../../adapters/firebase-sync.js";
import { performRoll } from "./engine.js";
import { FREE_DICE } from "./templates.js";
import { appElement } from "../../app/store.js";
import { t } from "../../shared/i18n.js";

function readFreeDiceMap() {
  const map = {};

  FREE_DICE.forEach((sides) => {
    const el = appElement.querySelector(`[data-die-qty="${sides}"]`);
    const qty = toInt(el?.textContent, 0);

    if (qty > 0) {
      map[sides] = qty;
    }
  });

  return map;
}

function updateFreeDiceNotation() {
  const map = readFreeDiceMap();
  const parts = Object.entries(map)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([sides, qty]) => `${qty}d${sides}`);

  const notationEl = appElement.querySelector("[data-dice-notation]");
  const rollBtn = appElement.querySelector("[data-action='dice-builder-roll']");

  if (notationEl) {
    notationEl.textContent = parts.length > 0 ? parts.join(" + ") : t("dice.none");
  }

  if (rollBtn) {
    rollBtn.disabled = parts.length === 0;
  }
}

/** @returns {boolean} true if handled */
export async function handleRollsAction(button) {
  const { action } = button.dataset;

  if (action === "roll-ability") {
    const abilityKey = button.dataset.rollKey;
    await performRoll({
      label: t("roll.abilityLabel", { label: getAbilityLabel(abilityKey) }),
      bonus: calculateModifier(state.character.abilities[abilityKey])
    });
    return true;
  }

  if (action === "roll-skill") {
    const skillKey = button.dataset.rollKey;
    await performRoll({
      label: getSkillLabel(skillKey),
      bonus: getSkillBonus(state.character, skillKey)
    });
    return true;
  }

  if (action === "roll-save") {
    const abilityKey = button.dataset.rollKey;
    await performRoll({
      label: t("roll.saveLabel", { label: getAbilityLabel(abilityKey) }),
      bonus: getSaveBonus(state.character, abilityKey)
    });
    return true;
  }

  if (action === "die-qty-inc" || action === "die-qty-dec") {
    const sides = toInt(button.dataset.dieSides, 0);
    if (!sides) return true;

    const qtyEl = appElement.querySelector(`[data-die-qty="${sides}"]`);
    if (!qtyEl) return true;

    const current = toInt(qtyEl.textContent, 0);
    qtyEl.textContent = String(Math.max(0, Math.min(9, action === "die-qty-inc" ? current + 1 : current - 1)));
    updateFreeDiceNotation();
    return true;
  }

  if (action === "dice-builder-reset") {
    FREE_DICE.forEach((sides) => {
      const el = appElement.querySelector(`[data-die-qty="${sides}"]`);
      if (el) el.textContent = "0";
    });
    updateFreeDiceNotation();
    return true;
  }

  if (action === "dice-builder-roll") {
    const diceMap = readFreeDiceMap();
    if (Object.keys(diceMap).length === 0) return true;

    publishRoll({
      firebaseUrl: state.settings.firebaseUrl,
      roomId     : state.settings.syncRoom,
      roll: {
        type         : "free",
        characterName: getCharacterName(),
        label        : Object.entries(diceMap).filter(([, q]) => q > 0).map(([s, q]) => `${q}d${s}`).join("+"),
        diceMap,
        flat         : 0,
        diceColor    : state.settings.diceColor,
      },
    });

    const { rolls, total, notation } = await triggerMultiDiceAnimation(diceMap, 0, null, state.settings.diceColor);
    const individualLabel = rolls.map((r) => `${r.value} (d${r.sides})`).join(", ");

    state.ui.lastRoll = {
      kind: "roll",
      label: notation,
      total,
      bonus: 0,
      baseRoll: total,
      rolls: rolls.map((r) => r.value),
      mode: "normal",
      isCritical: false,
      isFumble: false,
      note: ""
    };

    addHistory(t("history.freeRoll", { name: getCharacterName(), notation, total, details: individualLabel }), "roll");
    setStatus("info", `${notation} → ${total}`);
    sendFreeDiceWebhook(state.settings, { characterName: getCharacterName(), diceMap, rolls, total, notation });

    publishRoll({
      firebaseUrl: state.settings.firebaseUrl,
      roomId     : state.settings.syncRoom,
      roll: {
        type         : "free",
        characterName: getCharacterName(),
        label        : notation,
        diceMap,
        rolls,
        flat         : 0,
        total,
        diceColor    : state.settings.diceColor,
      },
    });

    commit(false);
    return true;
  }

  if (action === "roll-free-die") {
    const sides = toInt(button.dataset.dieSides, 20);
    const label = t("dice.freeDie", { sides });
    const diceMap = { [sides]: 1 };

    publishRoll({
      firebaseUrl: state.settings.firebaseUrl,
      roomId     : state.settings.syncRoom,
      roll: {
        type         : "free",
        characterName: getCharacterName(),
        label,
        diceMap,
        flat         : 0,
        diceColor    : state.settings.diceColor,
      },
    });

    const { baseRoll } = await triggerDiceAnimation(sides, "normal", 0, label, state.settings.diceColor);

    state.ui.lastRoll = {
      kind: "roll",
      label,
      total: baseRoll,
      bonus: 0,
      baseRoll,
      rolls: [baseRoll],
      mode: "normal",
      isCritical: sides === 20 && baseRoll === 20,
      isFumble: sides === 20 && baseRoll === 1,
      note: ""
    };

    const historyText = t("history.singleDie", { name: getCharacterName(), label, result: baseRoll });
    addHistory(historyText, "roll");
    setStatus("info", `${historyText}.`);
    sendFreeDiceWebhook(state.settings, {
      characterName: getCharacterName(),
      diceMap,
      rolls: [{ sides, value: baseRoll }],
      total: baseRoll,
      notation: label
    });

    publishRoll({
      firebaseUrl: state.settings.firebaseUrl,
      roomId     : state.settings.syncRoom,
      roll: {
        type         : "free",
        characterName: getCharacterName(),
        label,
        diceMap,
        rolls        : [{ sides, value: baseRoll }],
        flat         : 0,
        total        : baseRoll,
        diceColor    : state.settings.diceColor,
      },
    });

    commit(false);
    return true;
  }

  return false;
}

/** Handle input events for the rolls feature */
export function handleRollsInput(target) {
  if (target.matches("[data-roll-mode-control]")) {
    // Handled by handleRollsChange
    return false;
  }
  return false;
}

/** Handle change events for the rolls feature */
export function handleRollsChange(target) {
  if (target.matches("[data-roll-mode-control]")) {
    state.ui.rollMode = target.value;
    setStatus("info", t("status.rollMode", { mode: getModeLabel(state.ui.rollMode) }));
    commit(true);
    return true;
  }
  return false;
}
