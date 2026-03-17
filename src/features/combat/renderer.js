import { appElement, state } from "../../app/store.js";
import { formatSignedNumber, getAttackBonus } from "../../core/character.js";
import { getModeLabel } from "../../app/store.js";
import { escapeHtml } from "../../shared/dom.js";
import { parseDamageString } from "../../shared/damage-parser.js";
import { ABILITIES } from "../../data/constants.js";

const abilityMap = new Map(ABILITIES.map((a) => [a.key, a]));

export function buildAttackCard(attack, { showDelete = false } = {}) {
  const attackBonus = getAttackBonus(state.character, attack);
  const abilityShort = abilityMap.get(attack.ability)?.short ?? "";
  const parsed = attack.damage ? parseDamageString(attack.damage) : null;

  const hitBtn = `
    <button
      type="button"
      class="roll-button attack-hit-btn"
      data-action="roll-attack"
      data-attack-id="${attack.id}"
    >Toucher</button>
  `;

  const dmgBtn = parsed
    ? `<button
        type="button"
        class="roll-button attack-dmg-btn"
        data-action="roll-damage"
        data-attack-id="${attack.id}"
      >Dégâts</button>`
    : "";

  const deleteBtn = showDelete
    ? `<button
        type="button"
        class="ghost-button"
        data-action="remove-attack"
        data-attack-id="${attack.id}"
      >Supprimer</button>`
    : "";

  return `
    <article class="list-card attack-card">
      <div class="attack-card-info">
        <h3>${escapeHtml(attack.name)}</h3>
        <p class="muted">
          ${abilityShort} • ${formatSignedNumber(attackBonus)}
          ${attack.damage ? ` • ${escapeHtml(attack.damage)}` : ""}
        </p>
      </div>
      <div class="list-card-actions attack-card-actions">
        ${hitBtn}${dmgBtn}${deleteBtn}
      </div>
    </article>
  `;
}

export function renderAttacks() {
  const dashboardContainer = appElement.querySelector("[data-attacks-dashboard]");
  const managerContainer = appElement.querySelector("[data-attack-manager]");
  const emptyState = `<p class="empty-state">Aucune attaque. Ajoutez-en une depuis la fiche personnage.</p>`;

  if (dashboardContainer) {
    dashboardContainer.innerHTML = state.character.attacks.length
      ? state.character.attacks.map((a) => buildAttackCard(a)).join("")
      : emptyState;
  }

  if (managerContainer) {
    managerContainer.innerHTML = state.character.attacks.length
      ? state.character.attacks.map((a) => buildAttackCard(a, { showDelete: true })).join("")
      : emptyState;
  }
}

export function renderLastAction() {
  const lastActionContainer = appElement.querySelector("[data-last-action]");
  const historyContainer = appElement.querySelector("[data-history-list]");

  if (lastActionContainer) {
    if (!state.ui.lastRoll) {
      lastActionContainer.innerHTML = `<p class="empty-state">Aucune action récente.</p>`;
    } else if (state.ui.lastRoll.kind === "spell") {
      lastActionContainer.innerHTML = `
        <article class="last-action-card">
          <p class="eyebrow">Sort</p>
          <h3>${escapeHtml(state.ui.lastRoll.label)}</h3>
          <p>${escapeHtml(state.ui.lastRoll.description)}</p>
        </article>
      `;
    } else {
      lastActionContainer.innerHTML = `
        <article class="last-action-card">
          <div class="card-header-inline">
            <div>
              <p class="eyebrow">Jet</p>
              <h3>${escapeHtml(state.ui.lastRoll.label)}</h3>
            </div>
            <span class="result-badge ${
              state.ui.lastRoll.isCritical
                ? "badge-critical"
                : state.ui.lastRoll.isFumble
                  ? "badge-fumble"
                  : ""
            }">
              ${state.ui.lastRoll.total}
            </span>
          </div>
          <p class="muted">
            d20 : ${state.ui.lastRoll.rolls.join(" / ")} • Bonus ${formatSignedNumber(
              state.ui.lastRoll.bonus
            )} • ${getModeLabel(state.ui.lastRoll.mode)}
          </p>
          ${
            state.ui.lastRoll.note
              ? `<p class="muted">${escapeHtml(state.ui.lastRoll.note)}</p>`
              : ""
          }
        </article>
      `;
    }
  }

  if (historyContainer) {
    historyContainer.innerHTML = state.ui.history.length
      ? state.ui.history
          .map(
            (item) =>
              `<li class="history-item history-item-${item.kind}">${escapeHtml(item.text)}</li>`
          )
          .join("")
      : "";
  }
}
