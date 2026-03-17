import { appElement, state } from "../../app/store.js";
import { escapeHtml } from "../../shared/dom.js";
import { clamp, toInt } from "../../core/character.js";
import { t } from "../../shared/i18n.js";

export function renderSpellSlots() {
  const container = appElement.querySelector("[data-spell-slots]");

  if (!container) {
    return;
  }

  const slots = state.character.spellSlots ?? {};

  const rows = Array.from({ length: 9 }, (_, i) => i + 1).map((level) => {
    const slot = slots[level] ?? { max: 0, used: 0 };
    const available = Math.max(0, slot.max - slot.used);

    const dots = slot.max > 0
      ? Array.from({ length: slot.max }, (_, i) =>
          `<span class="slot-dot slot-dot--${i < available ? "on" : "off"}"></span>`
        ).join("")
      : `<span class="muted" style="font-size:0.78rem">—</span>`;

    return `
      <div class="slot-row">
        <span class="slot-level">${t("grimoire.slots.levelPrefix")}&nbsp;${level}</span>
        <div class="slot-dots">${dots}</div>
        <span class="slot-fraction${available === 0 && slot.max > 0 ? " slot-fraction--empty" : ""}">${available}/${slot.max}</span>
        <div class="slot-controls">
          <button type="button" class="dice-stepper-btn" data-action="slot-adjust-max" data-slot-level="${level}" data-slot-delta="-1"
            ${slot.max <= 0 ? "disabled" : ""} aria-label="${t("grimoire.slots.reduceAriaLabel", { level })}">−</button>
          <button type="button" class="dice-stepper-btn" data-action="slot-adjust-max" data-slot-level="${level}" data-slot-delta="1"
            ${slot.max >= 9 ? "disabled" : ""} aria-label="${t("grimoire.slots.increaseAriaLabel", { level })}">+</button>
          <button type="button" class="ghost-button slot-restore-btn" data-action="slot-restore-level" data-slot-level="${level}"
            ${available >= slot.max ? "disabled" : ""} aria-label="${t("grimoire.slots.restoreAriaLabel", { level })}">↺</button>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="section-heading" style="margin-bottom:0.75rem">
      <div>
        <h2>${t("grimoire.slots.title")}</h2>
        <p class="muted">${t("grimoire.slots.subtitle")}</p>
      </div>
      <button type="button" class="ghost-button" data-action="slot-long-rest">${t("grimoire.slots.longRest")}</button>
    </div>
    <div class="slot-rows">${rows}</div>
  `;
}

export function renderSpells() {
  const container = appElement.querySelector("[data-spell-list]");

  if (!container) {
    return;
  }

  container.innerHTML = state.character.spells.length
    ? state.character.spells
        .map(
          (spell) => `
            <article class="list-card">
              <div>
                <h3>${escapeHtml(spell.name)}</h3>
                <p class="muted">
                  ${t("grimoire.spell.levelCost", { level: spell.level, cost: spell.slotCost })}
                  ${spell.damage ? ` • ⚔️ ${escapeHtml(spell.damage)}` : ""}
                  ${spell.note ? ` • ${escapeHtml(spell.note)}` : ""}
                </p>
              </div>
              <div class="list-card-actions">
                <button
                  type="button"
                  class="roll-button"
                  data-action="cast-spell"
                  data-spell-id="${spell.id}"
                >
                  ${t("grimoire.spell.castButton")}
                </button>
                <button
                  type="button"
                  class="ghost-button"
                  data-action="remove-spell"
                  data-spell-id="${spell.id}"
                >
                  ${t("grimoire.spell.deleteButton")}
                </button>
              </div>
            </article>
          `
        )
        .join("")
    : `<p class="empty-state">${t("grimoire.emptyState")}</p>`;
}
