import { appElement, state } from "../../app/store.js";
import { escapeHtml } from "../../shared/dom.js";
import { clamp, toInt } from "../../core/character.js";

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
        <span class="slot-level">Niv.&nbsp;${level}</span>
        <div class="slot-dots">${dots}</div>
        <span class="slot-fraction${available === 0 && slot.max > 0 ? " slot-fraction--empty" : ""}">${available}/${slot.max}</span>
        <div class="slot-controls">
          <button type="button" class="dice-stepper-btn" data-action="slot-adjust-max" data-slot-level="${level}" data-slot-delta="-1"
            ${slot.max <= 0 ? "disabled" : ""} aria-label="Réduire maximum niveau ${level}">−</button>
          <button type="button" class="dice-stepper-btn" data-action="slot-adjust-max" data-slot-level="${level}" data-slot-delta="1"
            ${slot.max >= 9 ? "disabled" : ""} aria-label="Augmenter maximum niveau ${level}">+</button>
          <button type="button" class="ghost-button slot-restore-btn" data-action="slot-restore-level" data-slot-level="${level}"
            ${available >= slot.max ? "disabled" : ""} aria-label="Restaurer niveau ${level}">↺</button>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="section-heading" style="margin-bottom:0.75rem">
      <div>
        <h2>Emplacements de sorts</h2>
        <p class="muted">Configurez et suivez vos emplacements par niveau. Automatiquement consommés à l'incantation.</p>
      </div>
      <button type="button" class="ghost-button" data-action="slot-long-rest">🌙 Repos long</button>
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
                  Niveau ${spell.level} • Coût ${spell.slotCost}
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
                  Lancer
                </button>
                <button
                  type="button"
                  class="ghost-button"
                  data-action="remove-spell"
                  data-spell-id="${spell.id}"
                >
                  Supprimer
                </button>
              </div>
            </article>
          `
        )
        .join("")
    : `<p class="empty-state">Le grimoire est vide pour l'instant.</p>`;
}
