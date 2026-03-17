import { state, getCharacterName, setStatus, addHistory, commit } from "../../app/store.js";
import { triggerDiceAnimation } from "../../adapters/dice-animation.js";
import { validateD20Result } from "../../core/dice.js";
import { sendRollWebhook, sendAlertWebhook } from "../../adapters/discord.js";
import { publishRoll } from "../../adapters/firebase-sync.js";
import { restoreLockedCharacter } from "../../core/character.js";

let integrityRestoring = false;

export async function reportIntegrityIssue(changes, source) {
  if (integrityRestoring) {
    return;
  }

  integrityRestoring = true;

  try {
    state.character = restoreLockedCharacter(state.character, state.sessionLock.baseline);
    addHistory("Alerte anti-triche détectée et état restauré.", "alert");
    setStatus(
      "error",
      "Modification verrouillée détectée. Les valeurs surveillées ont été restaurées."
    );
    commit(false);

    try {
      await sendAlertWebhook(state.settings, {
        characterName: getCharacterName(),
        changes,
        source
      });
      setStatus("error", "Alerte anti-triche envoyée au MJ.");
      commit(false);
    } catch (error) {
      setStatus("error", `Alerte détectée, mais Discord a échoué : ${error.message}`);
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
      [{ label: "Intégrité du d20", from: "Valeur 1 à 20", to: error.message }],
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

  const localSummary = `${getCharacterName()} : ${label} → ${total} (${baseRoll} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)})`;
  addHistory(localSummary, "roll");

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

  setStatus("success", `${label} → **${total}**${isCritical ? " 💥 Critique !" : isFumble ? " 💀 Échec critique" : ""}`);
  commit(false);
}
