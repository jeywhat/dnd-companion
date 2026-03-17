import { ABILITIES, SKILLS } from "../../data/constants.js";
import { appElement, state } from "../../app/store.js";
import { calculateModifier, calculateProficiencyBonus, formatSignedNumber, getSkillBonus } from "../../core/character.js";
import { updateFieldValue } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";

export function syncAbilityHints() {
  for (const ability of ABILITIES) {
    const hint = appElement.querySelector(`[data-ability-mod-hint='${ability.key}']`);

    if (hint) {
      hint.textContent = formatSignedNumber(
        calculateModifier(state.character.abilities[ability.key])
      );
    }
  }
}

export function renderFormValues(syncInputs = true) {
  const proficiencyBonus = calculateProficiencyBonus(state.character.level);

  if (syncInputs) {
    updateFieldValue(appElement, "[data-character-field='name']", state.character.name);
    updateFieldValue(appElement, "[data-character-field='className']", state.character.className);
    updateFieldValue(appElement, "[data-character-field='level']", state.character.level);
    updateFieldValue(appElement, "[data-character-field='hpMax']", state.character.hpMax);
    updateFieldValue(appElement, "[data-character-field='armorClass']", state.character.armorClass);
    updateFieldValue(appElement, "[data-character-field='currentHp']", state.character.currentHp);
    updateFieldValue(appElement, "[data-current-hp-input]", state.character.currentHp);
    updateFieldValue(appElement, "[data-setting-field='webhookUrl']", state.settings.webhookUrl ?? "");
    updateFieldValue(appElement, "[data-setting-field='firebaseUrl']", state.settings.firebaseUrl ?? "");
    updateFieldValue(appElement, "[data-setting-field='syncRoom']", state.settings.syncRoom ?? "");
    updateFieldValue(appElement, "[data-setting-field='diceColor']", state.settings.diceColor ?? "#7c3aed");

    for (const ability of ABILITIES) {
      updateFieldValue(appElement, `[data-ability-input='${ability.key}']`, state.character.abilities[ability.key]);
    }
  }

  appElement.querySelector("[data-character-title]").textContent = state.character.name || t("app.defaultCharName");
  appElement.querySelector("[data-character-subtitle]").textContent =
    t("character.subtitle", { class: state.character.className || t("app.defaultClass"), level: state.character.level });
  appElement.querySelector("[data-current-hp-display]").textContent = state.character.currentHp;
  appElement.querySelector("[data-max-hp-display]").textContent = state.character.hpMax;
  appElement.querySelector("[data-armor-class-display]").textContent = state.character.armorClass;
  appElement.querySelector("[data-proficiency-display]").textContent =
    formatSignedNumber(proficiencyBonus);

  appElement.querySelector("[data-passive-perception]").textContent =
    10 + getSkillBonus(state.character, "perception");

  const initiativeModEl = appElement.querySelector("[data-initiative-mod]");
  if (initiativeModEl) {
    initiativeModEl.textContent = formatSignedNumber(calculateModifier(state.character.abilities.dexterity));
  }

  const hpPercent = Math.round((state.character.currentHp / state.character.hpMax) * 100);
  appElement.querySelector("[data-hp-track]").style.width = `${hpPercent}%`;
  appElement.querySelector("[data-hp-state]").textContent =
    hpPercent <= 25 ? t("dashboard.hp.state.critical") : hpPercent <= 60 ? t("dashboard.hp.state.injured") : t("dashboard.hp.state.full");

  const lockButton = appElement.querySelector("[data-action='toggle-lock']");
  const lockLabel = state.sessionLock.isLocked ? t("header.unlockSession") : t("header.lockSession");
  lockButton.setAttribute("aria-label", lockLabel);
  lockButton.title = lockLabel;
  lockButton.setAttribute("aria-pressed", String(state.sessionLock.isLocked));
  lockButton.classList.toggle("d20-lock-btn--active", state.sessionLock.isLocked);

  const statusBanner = appElement.querySelector("[data-status-banner]");
  statusBanner.textContent = state.ui.status.message;
  statusBanner.className = `status-banner status-${state.ui.status.tone}`;

  for (const modeControl of appElement.querySelectorAll("[data-roll-mode-control]")) {
    modeControl.checked = modeControl.value === state.ui.rollMode;
  }

  for (const panel of appElement.querySelectorAll("[data-panel]")) {
    panel.hidden = panel.dataset.panel !== state.ui.activeTab;
  }

  for (const navButton of appElement.querySelectorAll("[data-action='switch-tab']")) {
    const isActive = navButton.dataset.tab === state.ui.activeTab;
    navButton.classList.toggle("nav-button-active", isActive);
    navButton.setAttribute("aria-current", isActive ? "page" : "false");
  }

  for (const skill of SKILLS) {
    const checkbox = appElement.querySelector(`[data-skill-checkbox='${skill.key}']`);

    if (checkbox) {
      checkbox.checked = state.character.skillProficiencies.includes(skill.key);
    }
  }

  for (const ability of ABILITIES) {
    const checkbox = appElement.querySelector(`[data-save-checkbox='${ability.key}']`);

    if (checkbox) {
      checkbox.checked = state.character.saveProficiencies.includes(ability.key);
    }

    const hint = appElement.querySelector(`[data-ability-mod-hint='${ability.key}']`);

    if (hint) {
      hint.textContent = formatSignedNumber(calculateModifier(state.character.abilities[ability.key]));
    }
  }

  for (const sensitiveField of appElement.querySelectorAll("[data-lock-sensitive='true']")) {
    sensitiveField.disabled = state.sessionLock.isLocked;
  }
}
