import { state, setStatus, addHistory, commit, getCharacterName, queueHpNotify } from "../../app/store.js";
import { calculateModifier, getAttackBonus, clamp, toInt } from "../../core/character.js";
import { triggerMultiDiceAnimation } from "../../adapters/dice-animation.js";
import { sendDamageWebhook } from "../../adapters/discord.js";
import { publishRoll } from "../../adapters/firebase-sync.js";
import { performRoll } from "../rolls/engine.js";
import { parseDamageString } from "../../shared/damage-parser.js";

/** @returns {boolean} true if handled */
export async function handleCombatAction(button) {
  const { action } = button.dataset;

  if (action === "roll-initiative") {
    const dexMod = calculateModifier(state.character.abilities.dexterity);
    await performRoll({ label: "Initiative", bonus: dexMod, note: "DEX" });
    return true;
  }

  if (action === "adjust-hp") {
    const previousHp = state.character.currentHp;
    state.character.currentHp = clamp(
      state.character.currentHp + toInt(button.dataset.delta, 0),
      0,
      state.character.hpMax
    );
    setStatus("info", `PV ajustés à ${state.character.currentHp}/${state.character.hpMax}.`);
    queueHpNotify(previousHp);
    commit(true);
    return true;
  }

  if (action === "roll-attack") {
    const attack = state.character.attacks.find((a) => a.id === button.dataset.attackId);

    if (!attack) {
      throw new Error("L'attaque demandée est introuvable.");
    }

    await performRoll({
      label: `Toucher — ${attack.name}`,
      bonus: getAttackBonus(state.character, attack),
      note: attack.damage ? `Dégâts : ${attack.damage}` : ""
    });
    return true;
  }

  if (action === "roll-damage") {
    const attack = state.character.attacks.find((a) => a.id === button.dataset.attackId);

    if (!attack) {
      throw new Error("L'attaque demandée est introuvable.");
    }

    const parsed = parseDamageString(attack.damage);

    if (!parsed) {
      setStatus("error", `Dégâts de "${attack.name}" non reconnus. Utilisez un format comme "1d8+3".`);
      return true;
    }

    publishRoll({
      firebaseUrl: state.settings.firebaseUrl,
      roomId     : state.settings.syncRoom,
      roll: {
        type         : "damage",
        characterName: getCharacterName(),
        label        : `Dégâts — ${attack.name}`,
        diceMap      : parsed.diceMap,
        flat         : parsed.flat,
        diceColor    : state.settings.diceColor,
      },
    });

    const { rolls, total } = await triggerMultiDiceAnimation(parsed.diceMap, parsed.flat, null, state.settings.diceColor);

    const diceLabel = rolls.map((r) => `${r.value} (d${r.sides})`).join(" + ");
    const flatPart = parsed.flat !== 0 ? ` ${parsed.flat > 0 ? "+" : ""}${parsed.flat}` : "";
    const localSummary = `${getCharacterName()} — Dégâts ${attack.name} : ${total}${rolls.length ? ` [${diceLabel}${flatPart}]` : ""}`;

    addHistory(localSummary, "roll");
    setStatus("info", `Dégâts ${attack.name} → ${total}`);

    await sendDamageWebhook(state.settings, {
      label: attack.name,
      characterName: getCharacterName(),
      diceMap: parsed.diceMap,
      flat: parsed.flat,
      total,
    });

    publishRoll({
      firebaseUrl: state.settings.firebaseUrl,
      roomId     : state.settings.syncRoom,
      roll: {
        type         : "damage",
        characterName: getCharacterName(),
        label        : `Dégâts — ${attack.name}`,
        diceMap      : parsed.diceMap,
        rolls,
        flat         : parsed.flat,
        total,
        diceColor    : state.settings.diceColor,
      },
    });

    commit(false);
    return true;
  }

  if (action === "remove-attack") {
    state.character.attacks = state.character.attacks.filter(
      (a) => a.id !== button.dataset.attackId
    );
    setStatus("info", "Attaque supprimée.");
    commit(false);
    return true;
  }

  return false;
}
