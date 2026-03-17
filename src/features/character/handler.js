import { state, setStatus, commit, queueHpNotify } from "../../app/store.js";
import { clamp, toInt } from "../../core/character.js";
import { uniqueId } from "../../shared/dom.js";
import { syncAbilityHints } from "./renderer.js";
import { renderAbilityDashboard, renderSkillDashboard, renderSaveDashboard } from "../rolls/renderer.js";
import { queueSave } from "../../app/store.js";
import { t } from "../../shared/i18n.js";

function applyNumericCharacterField(field, value) {
  if (value === "") return;

  if (field === "level") {
    state.character.level = clamp(toInt(value, state.character.level), 1, 20);
    return;
  }

  if (field === "hpMax") {
    state.character.hpMax = clamp(toInt(value, state.character.hpMax), 1, 999);
    state.character.currentHp = clamp(state.character.currentHp, 0, state.character.hpMax);
    return;
  }

  if (field === "armorClass") {
    state.character.armorClass = clamp(toInt(value, state.character.armorClass), 0, 40);
    return;
  }

  if (field === "currentHp") {
    state.character.currentHp = clamp(toInt(value, state.character.currentHp), 0, state.character.hpMax);
  }
}

/** Handle input events for the character feature. @returns {boolean} */
export function handleCharacterInput(target) {
  if (target.matches("[data-character-field]")) {
    const field = target.dataset.characterField;

    if (field === "name" || field === "className") {
      state.character[field] = target.value;
      setStatus("info", t("status.characterSaved"));
      commit(true);
      return true;
    }

    if (field === "currentHp") {
      const previousHp = state.character.currentHp;
      applyNumericCharacterField(field, target.value);
      queueHpNotify(previousHp);
    } else {
      applyNumericCharacterField(field, target.value);
    }

    setStatus("info", t("status.characterValueUpdated"));
    commit(true);
    return true;
  }

  if (target.matches("[data-ability-input]")) {
    if (target.value === "") return true;

    const key = target.dataset.abilityInput;
    state.character.abilities[key] = clamp(
      toInt(target.value, state.character.abilities[key]),
      1,
      30
    );

    syncAbilityHints();
    renderAbilityDashboard();
    renderSkillDashboard();
    renderSaveDashboard();
    queueSave();
    return true;
  }

  if (target.matches("[data-current-hp-input]")) {
    if (target.value === "") return true;

    const previousHp = state.character.currentHp;
    state.character.currentHp = clamp(
      toInt(target.value, state.character.currentHp),
      0,
      state.character.hpMax
    );
    setStatus("info", t("status.hpUpdated"));
    queueHpNotify(previousHp);
    commit(true);
    return true;
  }

  if (target.matches("#spell-level")) {
    const levelVal = clamp(toInt(target.value, 0), 0, 9);
    const slotCostInput = target.closest("form")?.querySelector("#spell-slot-cost");
    if (slotCostInput) slotCostInput.value = String(levelVal);
    return true;
  }

  return false;
}

/** Handle change events for character feature. @returns {boolean} */
export function handleCharacterChange(target) {
  if (target.matches("[data-skill-checkbox]")) {
    const key = target.dataset.skillCheckbox;
    state.character.skillProficiencies = target.checked
      ? [...state.character.skillProficiencies, key]
      : state.character.skillProficiencies.filter((k) => k !== key);
    state.character.skillProficiencies.sort();
    setStatus("info", t("status.skillsUpdated"));
    commit(true);
    return true;
  }

  if (target.matches("[data-save-checkbox]")) {
    const key = target.dataset.saveCheckbox;
    state.character.saveProficiencies = target.checked
      ? [...state.character.saveProficiencies, key]
      : state.character.saveProficiencies.filter((k) => k !== key);
    state.character.saveProficiencies.sort();
    setStatus("info", t("status.savesUpdated"));
    commit(true);
    return true;
  }

  if (target.matches("[data-ability-input]")) {
    const key = target.dataset.abilityInput;
    const clamped = clamp(toInt(target.value, state.character.abilities[key]), 1, 30);
    state.character.abilities[key] = clamped;
    target.value = clamped;
    setStatus("info", t("status.abilityUpdated"));
    commit(true);
    return true;
  }

  return false;
}

/** Handle form submit for character (data-form="attack"). @returns {boolean} */
export function handleCharacterSubmit(form) {
  if (form.dataset.form !== "attack") return false;

  const formData = new FormData(form);
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    setStatus("error", t("error.attackNameRequired"));
    commit(false);
    return true;
  }

  state.character.attacks = [
    ...state.character.attacks,
    {
      id: uniqueId("attack"),
      name,
      ability: String(formData.get("ability") ?? "strength"),
      proficient: Boolean(formData.get("proficient")),
      bonus: toInt(formData.get("bonus"), 0),
      damage: String(formData.get("damage") ?? "").trim()
    }
  ];

  form.reset();
  form.querySelector("input[name='proficient']").checked = true;
  form.querySelector("input[name='bonus']").value = "0";
  setStatus("success", t("status.attackAdded"));
  commit(true);
  return true;
}
