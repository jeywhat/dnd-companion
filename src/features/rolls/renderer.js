import { ABILITIES } from "../../data/constants.js";
import { calculateModifier, formatSignedNumber, getSkillBonus, getSaveBonus } from "../../core/character.js";
import { SKILLS } from "../../data/constants.js";
import { appElement, state } from "../../app/store.js";
import { t } from "../../shared/i18n.js";

export function renderAbilityDashboard() {
  const container = appElement.querySelector("[data-ability-dashboard]");
  const character = state.character;

  if (!container) {
    return;
  }

  container.innerHTML = ABILITIES.map((ability) => {
    const modifier = calculateModifier(character.abilities[ability.key]);
    const label = t(`ability.${ability.key}`);
    const short = t(`ability.${ability.key}.short`);

    return `
      <article class="mini-card">
        <div>
          <p class="mini-card-kicker">${short}</p>
          <h3>${label}</h3>
        </div>
        <div class="mini-card-values">
          <strong>${character.abilities[ability.key]}</strong>
          <span>${formatSignedNumber(modifier)}</span>
        </div>
        <button
          type="button"
          class="roll-button"
          data-action="roll-ability"
          data-roll-key="${ability.key}"
          aria-label="${t("aria.rollAbility", { label, bonus: formatSignedNumber(modifier) })}"
        >
          ${t("aria.testAbility", { short })}
        </button>
      </article>
    `;
  }).join("");
}

export function renderSkillDashboard() {
  const container = appElement.querySelector("[data-skills-dashboard]");

  if (!container) {
    return;
  }

  container.innerHTML = SKILLS.map((skill) => {
    const bonus = getSkillBonus(state.character, skill.key);
    const isProficient = state.character.skillProficiencies.includes(skill.key);
    const skillLabel = t(`skill.${skill.key}`);
    const abilityShort = t(`ability.${skill.ability}.short`);

    return `
      <button
        type="button"
        class="action-tile ${isProficient ? "action-tile-proficient" : ""}"
        data-action="roll-skill"
        data-roll-key="${skill.key}"
        aria-label="${t("aria.rollSkill", { label: skillLabel, bonus: formatSignedNumber(bonus) })}"
      >
        <span class="action-tile-title">${skillLabel}</span>
        <span class="action-tile-meta">
          ${abilityShort} • ${formatSignedNumber(bonus)}
        </span>
      </button>
    `;
  }).join("");
}

export function renderSaveDashboard() {
  const container = appElement.querySelector("[data-saves-dashboard]");

  if (!container) {
    return;
  }

  container.innerHTML = ABILITIES.map((ability) => {
    const bonus = getSaveBonus(state.character, ability.key);
    const isProficient = state.character.saveProficiencies.includes(ability.key);
    const label = t(`ability.${ability.key}`);
    const short = t(`ability.${ability.key}.short`);

    return `
      <button
        type="button"
        class="action-tile ${isProficient ? "action-tile-proficient" : ""}"
        data-action="roll-save"
        data-roll-key="${ability.key}"
        aria-label="${t("aria.rollSave", { label, bonus: formatSignedNumber(bonus) })}"
      >
        <span class="action-tile-title">${label}</span>
        <span class="action-tile-meta">
          ${short} • ${formatSignedNumber(bonus)}
        </span>
      </button>
    `;
  }).join("");
}
