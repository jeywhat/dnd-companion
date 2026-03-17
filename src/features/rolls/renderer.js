import { ABILITIES } from "../../data/constants.js";
import { calculateModifier, formatSignedNumber, getSkillBonus, getSaveBonus } from "../../core/character.js";
import { SKILLS } from "../../data/constants.js";
import { appElement, state } from "../../app/store.js";

const abilityMap = new Map(ABILITIES.map((ability) => [ability.key, ability]));

export function renderAbilityDashboard() {
  const container = appElement.querySelector("[data-ability-dashboard]");
  const character = state.character;

  if (!container) {
    return;
  }

  container.innerHTML = ABILITIES.map((ability) => {
    const modifier = calculateModifier(character.abilities[ability.key]);

    return `
      <article class="mini-card">
        <div>
          <p class="mini-card-kicker">${ability.short}</p>
          <h3>${ability.label}</h3>
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
          aria-label="Lancer ${ability.label} avec bonus ${formatSignedNumber(modifier)}"
        >
          Test ${ability.short}
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

    return `
      <button
        type="button"
        class="action-tile ${isProficient ? "action-tile-proficient" : ""}"
        data-action="roll-skill"
        data-roll-key="${skill.key}"
        aria-label="Lancer ${skill.label} avec bonus ${formatSignedNumber(bonus)}"
      >
        <span class="action-tile-title">${skill.label}</span>
        <span class="action-tile-meta">
          ${abilityMap.get(skill.ability)?.short ?? ""} • ${formatSignedNumber(bonus)}
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

    return `
      <button
        type="button"
        class="action-tile ${isProficient ? "action-tile-proficient" : ""}"
        data-action="roll-save"
        data-roll-key="${ability.key}"
        aria-label="Lancer la sauvegarde de ${ability.label} avec bonus ${formatSignedNumber(bonus)}"
      >
        <span class="action-tile-title">${ability.label}</span>
        <span class="action-tile-meta">
          ${ability.short} • ${formatSignedNumber(bonus)}
        </span>
      </button>
    `;
  }).join("");
}
