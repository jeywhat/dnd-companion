import { state, getCharacterName, setStatus, addHistory, commit } from "../../app/store.js";
import { triggerDiceAnimation } from "../../adapters/dice-animation.js";
import { validateD20Result } from "../../core/dice.js";
import { sendRollWebhook, sendAlertWebhook } from "../../adapters/discord.js";
import { publishRoll } from "../../adapters/firebase-sync.js";
import { restoreLockedCharacter } from "../../core/character.js";
import { t } from "../../shared/i18n.js";

let integrityRestoring = false;

export async function reportIntegrityIssue(changes, source) {
  if (integrityRestoring) {
    return;
  }

  integrityRestoring = true;

  try {
    state.character = restoreLockedCharacter(state.character, state.sessionLock.baseline);
    addHistory(t("history.antiCheatAlert"), "alert");
    setStatus("error", t("status.integrityRestored"));
    commit(false);

    try {
      await sendAlertWebhook(state.settings, {
        characterName: getCharacterName(),
        changes,
        source
      });
      setStatus("error", t("status.integrityAlertSent"));
      commit(false);
    } catch (error) {
      setStatus("error", t("status.integrityAlertFailed", { error: error.message }));
      commit(false);
    }
  } finally {
    integrityRestoring = false;
  }
}

export async function performRoll({ label, bonus, note = "" }) {
  const mode = state.ui.rollMode;

  publishRoll({
    firebaseUrl: state.settings.firebaseUrl,
    roomId     : state.settings.syncRoom,
    roll: {
      type         : "d20",
      characterName: getCharacterName(),
      label,
      mode,
      diceMap      : { 20: mode === "normal" ? 1 : 2 },
      flat         : bonus,
      diceColor    : state.settings.diceColor,
    },
  });

  const { baseRoll, rolls } = await triggerDiceAnimation(20, mode, bonus, label, state.settings.diceColor);

  try {
    validateD20Result(baseRoll);
  } catch (error) {
    await reportIntegrityIssue(
      [{ label: t("integrity.d20Label"), from: t("integrity.d20Expected"), to: error.message }],
      "runtime"
    );
    throw error;
  }

  const total = baseRoll + bonus;
  const isCritical = baseRoll === 20;
  const isFumble = baseRoll === 1;
  const rollDetails = rolls.length === 2 ? `${rolls[0]} / ${rolls[1]}` : `${baseRoll}`;
  const breakdown = `${rollDetails}${bonus === 0 ? "" : ` ${bonus > 0 ? "+" : "-"} ${Math.abs(bonus)}`}`.trim();

  const result = { label, total, bonus, baseRoll, rolls, mode, isCritical, isFumble, breakdown };

  state.ui.lastRoll = { kind: "roll", ...result, note };

  addHistory(t("history.rollResult", { name: getCharacterName(), label, total, breakdown }), "roll");

  sendRollWebhook(state.settings, { ...result, label, bonus, characterName: getCharacterName() });

  publishRoll({
    firebaseUrl: state.settings.firebaseUrl,
    roomId     : state.settings.syncRoom,
    roll: {
      type         : "d20",
      characterName: getCharacterName(),
      label,
      mode,
      diceMap      : { 20: mode === "normal" ? 1 : 2 },
      rolls        : result.rolls.map((v) => ({ sides: 20, value: v })),
      flat         : bonus,
      total,
      diceColor    : state.settings.diceColor,
    },
  });

  const suffix = isCritical ? t("status.rollCriticalSuffix") : isFumble ? t("status.rollFumbleSuffix") : "";
  setStatus("success", t("status.rollResult", { label, total, suffix }));
  commit(false);
}
