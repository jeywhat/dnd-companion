import { ABILITIES, SKILLS, ROLL_MODES } from "../../data/constants.js";

const abilityMap = new Map(ABILITIES.map((ability) => [ability.key, ability]));

export function buildAbilityFormTemplate() {
  return ABILITIES.map(
    (ability) => `
      <label class="field compact-field" for="ability-${ability.key}">
        <span>${ability.label} (${ability.short})</span>
        <input
          id="ability-${ability.key}"
          name="ability-${ability.key}"
          type="number"
          min="1"
          max="30"
          inputmode="numeric"
          data-ability-input="${ability.key}"
          data-lock-sensitive="true"
        />
        <span class="field-hint">Mod. <strong data-ability-mod-hint="${ability.key}">+0</strong></span>
      </label>
    `
  ).join("");
}

export function buildSkillChecklistTemplate() {
  return SKILLS.map(
    (skill) => `
      <label class="check-tile">
        <input type="checkbox" data-skill-checkbox="${skill.key}" data-lock-sensitive="true" />
        <span class="check-tile-body">
          <strong>${skill.label}</strong>
          <span>${abilityMap.get(skill.ability)?.short ?? ""}</span>
        </span>
      </label>
    `
  ).join("");
}

export function buildSaveChecklistTemplate() {
  return ABILITIES.map(
    (ability) => `
      <label class="check-tile">
        <input type="checkbox" data-save-checkbox="${ability.key}" data-lock-sensitive="true" />
        <span class="check-tile-body">
          <strong>${ability.label}</strong>
          <span>${ability.short}</span>
        </span>
      </label>
    `
  ).join("");
}

export function buildRollModeTemplate() {
  return ROLL_MODES.map(
    (mode) => `
      <label class="mode-option">
        <input type="radio" name="roll-mode" value="${mode.key}" data-roll-mode-control />
        <span>${mode.label}</span>
      </label>
    `
  ).join("");
}

export const FREE_DICE = [4, 6, 8, 10, 12, 20];

export function buildFreeDiceBuilderTemplate() {
  const rows = FREE_DICE.map(
    (sides) => `
      <div class="dice-builder-row">
        <span class="dice-builder-die-label">d${sides}</span>
        <div class="dice-builder-stepper">
          <button
            type="button"
            class="dice-stepper-btn"
            data-action="die-qty-dec"
            data-die-sides="${sides}"
            aria-label="Enlever un d${sides}"
          >−</button>
          <span class="dice-stepper-value" data-die-qty="${sides}">0</span>
          <button
            type="button"
            class="dice-stepper-btn"
            data-action="die-qty-inc"
            data-die-sides="${sides}"
            aria-label="Ajouter un d${sides}"
          >+</button>
        </div>
      </div>
    `
  ).join("");

  return `
    <div class="dice-builder">
      <div class="dice-builder-rows">${rows}</div>
      <div class="dice-builder-footer">
        <p class="dice-builder-notation" data-dice-notation>Aucun dé sélectionné</p>
        <div class="dice-builder-actions">
          <button type="button" class="dice-reset-btn" data-action="dice-builder-reset">
            Réinitialiser
          </button>
          <button type="button" class="dice-roll-btn" data-action="dice-builder-roll" disabled>
            🎲 Lancer
          </button>
        </div>
      </div>
    </div>
  `;
}
