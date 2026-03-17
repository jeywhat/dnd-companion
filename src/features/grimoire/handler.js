import { state, setStatus, addHistory, commit, getCharacterName } from "../../app/store.js";
import { triggerMultiDiceAnimation } from "../../adapters/dice-animation.js";
import { sendDamageWebhook, sendSpellWebhook } from "../../adapters/discord.js";
import { publishRoll } from "../../adapters/firebase-sync.js";
import { parseDamageString } from "../../shared/damage-parser.js";
import { clamp, toInt } from "../../core/character.js";
import { uniqueId as domUniqueId } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";

async function castSpell(spellId) {
  const spell = state.character.spells.find((s) => s.id === spellId);

  if (!spell) {
    throw new Error(t("error.spellNotFound"));
  }

  const isCantrip = spell.level === 0;
  const slotLevel = isCantrip ? 0 : spell.level;
  const slotCost  = isCantrip ? 0 : (spell.slotCost || 1);
  let slotsRemaining = null;

  if (slotLevel > 0 && slotCost > 0) {
    const slot = state.character.spellSlots?.[slotLevel];
    if (slot && slot.max > 0) {
      if (slot.used + slotCost > slot.max) {
        const avail = slot.max - slot.used;
        setStatus("error", t("error.notEnoughSlots", { level: slotLevel, available: avail, max: slot.max, cost: slotCost }));
        commit(false);
        return;
      }
      state.character.spellSlots[slotLevel].used += slotCost;
      slotsRemaining = slot.max - state.character.spellSlots[slotLevel].used;
    }
  }

  state.ui.lastRoll = {
    kind: "spell",
    label: spell.name,
    description: t("history.spellCast", { name: getCharacterName(), spell: spell.name, level: spell.level })
  };
  addHistory(t("history.spellCast", { name: getCharacterName(), spell: spell.name, level: spell.level }), "spell");

  sendSpellWebhook(state.settings, { spell, characterName: getCharacterName(), slotsRemaining });

  const slotMsg = slotsRemaining !== null
    ? t("status.slotMsg", { level: slotLevel, remaining: slotsRemaining })
    : "";
  setStatus("success", t("status.spellAnnounced", { name: spell.name, slotMsg }));
  commit(false);

  if (spell.damage?.trim()) {
    const parsed = parseDamageString(spell.damage.trim());
    if (parsed) {
      publishRoll({
        firebaseUrl: state.settings.firebaseUrl,
        roomId     : state.settings.syncRoom,
        roll: {
          type         : "damage",
          characterName: getCharacterName(),
          label        : `${spell.name} (${t("attack.damageButton")})`,
          diceMap      : parsed.diceMap,
          flat         : parsed.flat,
          diceColor    : state.settings.diceColor,
        },
      });

      const { rolls, total } = await triggerMultiDiceAnimation(parsed.diceMap, parsed.flat, null, state.settings.diceColor);
      const diceLabel = rolls.map((r) => `${r.value} (d${r.sides})`).join(" + ");
      const flatPart  = parsed.flat !== 0 ? ` ${parsed.flat > 0 ? "+" : ""}${parsed.flat}` : "";
      addHistory(t("history.damage", { spell: spell.name, total, breakdown: `${diceLabel}${flatPart}` }), "roll");

      await sendDamageWebhook(state.settings, {
        label: `${spell.name} (${t("attack.damageButton")})`,
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
          label        : `${spell.name} (${t("attack.damageButton")})`,
          diceMap      : parsed.diceMap,
          rolls,
          flat         : parsed.flat,
          total,
          diceColor    : state.settings.diceColor,
        },
      });
    }
  }
}

/** @returns {boolean} true if handled */
export async function handleGrimoireAction(button) {
  const { action } = button.dataset;

  if (action === "cast-spell") {
    await castSpell(button.dataset.spellId);
    return true;
  }

  if (action === "slot-adjust-max") {
    const level = toInt(button.dataset.slotLevel, 0);
    const delta = toInt(button.dataset.slotDelta, 0);
    if (level < 1 || level > 9) return true;
    const slot = state.character.spellSlots[level];
    slot.max = clamp(slot.max + delta, 0, 9);
    slot.used = Math.min(slot.used, slot.max);
    commit(true);
    return true;
  }

  if (action === "slot-restore-level") {
    const level = toInt(button.dataset.slotLevel, 0);
    if (level < 1 || level > 9) return true;
    state.character.spellSlots[level].used = 0;
    commit(true);
    return true;
  }

  if (action === "slot-long-rest") {
    for (let level = 1; level <= 9; level++) {
      state.character.spellSlots[level].used = 0;
    }
    setStatus("success", t("status.longRest"));
    commit(true);
    return true;
  }

  if (action === "remove-spell") {
    state.character.spells = state.character.spells.filter(
      (s) => s.id !== button.dataset.spellId
    );
    setStatus("info", t("status.spellRemoved"));
    commit(false);
    return true;
  }

  return false;
}

/** Handle form submit for grimoire (data-form="spell") */
export function handleGrimoireSubmit(form) {
  if (form.dataset.form !== "spell") return false;

  const formData = new FormData(form);
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    setStatus("error", t("error.spellNameRequired"));
    commit(false);
    return true;
  }

  state.character.spells = [
    ...state.character.spells,
    {
      id: domUniqueId("spell"),
      name,
      level: clamp(toInt(formData.get("level"), 0), 0, 9),
      slotCost: clamp(toInt(formData.get("slotCost"), 0), 0, 9),
      damage: String(formData.get("damage") ?? "").trim(),
      note: String(formData.get("note") ?? "").trim()
    }
  ];

  form.reset();
  form.querySelector("input[name='level']").value = "0";
  form.querySelector("input[name='slotCost']").value = "0";
  setStatus("success", t("status.spellAdded"));
  commit(true);
  return true;
}
