import { ABILITIES } from "../data/constants.js";
import { t, getLocale } from "../shared/i18n.js";
import {
  buildRollModeTemplate,
  buildFreeDiceBuilderTemplate,
  buildSkillChecklistTemplate,
  buildSaveChecklistTemplate
} from "../features/rolls/templates.js";

export function getAppTemplate() {
  const locale = getLocale();
  return `
    <div class="app-shell">
      <header class="app-header card">
        <div>
          <p class="eyebrow">${t("header.brand")}</p>
          <h1 data-character-title>${t("app.defaultCharName")}</h1>
          <p class="muted" data-character-subtitle>${t("app.defaultClass")} • ${t("character.level.label")} 1</p>
        </div>
        <div class="header-actions">
          <div class="locale-switcher" role="group" aria-label="${t("lang.ariaLabel")}">
            <button type="button" class="locale-btn${locale === "fr" ? " active" : ""}" data-locale="fr" aria-label="Français" title="Français">
              <img src="https://hatscripts.github.io/circle-flags/flags/fr.svg" width="22" height="22" alt="FR" aria-hidden="true">
            </button>
            <button type="button" class="locale-btn${locale === "en" ? " active" : ""}" data-locale="en" aria-label="English" title="English">
              <img src="https://hatscripts.github.io/circle-flags/flags/gb.svg" width="22" height="22" alt="GB" aria-hidden="true">
            </button>
          </div>
          <button
            type="button"
            class="d20-lock-btn"
            data-action="toggle-lock"
            aria-pressed="false"
            aria-label="${t("header.lockSession")}"
            title="${t("header.lockSession")}"
          >
            <svg class="d20-btn-svg" viewBox="0 0 100 100" aria-hidden="true">
              <polygon class="d20-face" points="50,4 92,26 92,74 50,96 8,74 8,26"/>
              <line class="d20-ridge" x1="50" y1="4" x2="50" y2="50"/>
              <line class="d20-ridge" x1="92" y1="26" x2="50" y2="50"/>
              <line class="d20-ridge" x1="92" y1="74" x2="50" y2="50"/>
              <line class="d20-ridge" x1="50" y1="96" x2="50" y2="50"/>
              <line class="d20-ridge" x1="8" y1="74" x2="50" y2="50"/>
              <line class="d20-ridge" x1="8" y1="26" x2="50" y2="50"/>
              <text class="d20-label" x="50" y="52" text-anchor="middle" dominant-baseline="central">20</text>
            </svg>
          </button>
        </div>
      </header>
      
      <nav class="bottom-nav" aria-label="${t("nav.ariaLabel")}">
        <button type="button" class="nav-button" data-action="switch-tab" data-tab="dashboard">
          <span class="nav-icon" aria-hidden="true">⚔️</span>
          <span class="nav-label">${t("nav.combat")}</span>
        </button>
        <button type="button" class="nav-button" data-action="switch-tab" data-tab="jets">
          <span class="nav-icon" aria-hidden="true">🎲</span>
          <span class="nav-label">${t("nav.rolls")}</span>
        </button>
        <button type="button" class="nav-button" data-action="switch-tab" data-tab="grimoire">
          <span class="nav-icon" aria-hidden="true">✨</span>
          <span class="nav-label">${t("nav.spells")}</span>
        </button>
        <button type="button" class="nav-button" data-action="switch-tab" data-tab="character">
          <span class="nav-icon" aria-hidden="true">📜</span>
          <span class="nav-label">${t("nav.character")}</span>
        </button>
        <button type="button" class="nav-button" data-action="switch-tab" data-tab="room">
          <span class="nav-icon" aria-hidden="true">🏰</span>
          <span class="nav-label">${t("nav.room")}</span>
        </button>
        <button type="button" class="nav-button" data-action="switch-tab" data-tab="settings">
          <span class="nav-icon" aria-hidden="true">⚙️</span>
          <span class="nav-label">${t("nav.settings")}</span>
        </button>
      </nav>

      <main class="app-main">
        <section class="status-banner" data-status-banner role="status" aria-live="polite"></section>

        <div class="remote-roll-banner" id="remote-roll-banner" hidden aria-live="polite">
          <span id="remote-roll-banner-text"></span>
        </div>

        <section class="panel-stack">
          <section class="panel" data-panel="dashboard">
            <div class="hero-grid">
              <article class="card stat-card">
                <div class="card-header-inline">
                  <h2>${t("dashboard.hp.title")}</h2>
                  <span class="pill" data-hp-state>${t("dashboard.hp.state.full")}</span>
                </div>
                <div class="hp-value">
                  <span data-current-hp-display>10</span>
                  <small>/ <span data-max-hp-display>10</span></small>
                </div>
                <label class="field" for="current-hp">
                  <span>${t("dashboard.hp.currentLabel")}</span>
                  <input
                    id="current-hp"
                    type="number"
                    min="0"
                    inputmode="numeric"
                    data-current-hp-input
                    aria-label="${t("dashboard.hp.currentAriaLabel")}"
                  />
                </label>
                <div class="hp-track" aria-hidden="true">
                  <span class="hp-track-fill" data-hp-track></span>
                </div>
                <div class="quick-actions" role="group" aria-label="${t("dashboard.hp.adjustAriaLabel")}">
                  <button type="button" data-action="adjust-hp" data-delta="-5">-5</button>
                  <button type="button" data-action="adjust-hp" data-delta="-1">-1</button>
                  <button type="button" data-action="adjust-hp" data-delta="1">+1</button>
                  <button type="button" data-action="adjust-hp" data-delta="5">+5</button>
                </div>
              </article>

              <article class="card stat-card">
                <div class="card-header-inline">
                  <h2>${t("dashboard.ac.title")}</h2>
                  <span class="pill">${t("dashboard.ac.pill")}</span>
                </div>
                <div class="big-stat" data-armor-class-display>10</div>
                <p class="muted">${t("dashboard.ac.note")}</p>
              </article>

              <article class="card stat-card">
                <div class="card-header-inline">
                  <h2>${t("dashboard.proficiency.title")}</h2>
                  <span class="pill">${t("dashboard.proficiency.pill")}</span>
                </div>
                <div class="big-stat" data-proficiency-display>+2</div>
                <p class="muted">${t("dashboard.proficiency.passivePerception")} <strong data-passive-perception>10</strong></p>
              </article>
            </div>

            <article class="card initiative-card">
              <button
                type="button"
                class="initiative-btn"
                data-action="roll-initiative"
                aria-label="${t("dashboard.initiative.ariaLabel")}"
              >
                <span class="initiative-icon" aria-hidden="true">⚡</span>
                <span class="initiative-text">
                  <span class="initiative-label">${t("dashboard.initiative.label")}</span>
                  <span class="initiative-mod" data-initiative-mod>+0</span>
                </span>
              </button>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>${t("dashboard.attacks.title")}</h2>
                  <p class="muted">${t("dashboard.attacks.subtitle")}</p>
                </div>
              </div>
              <div class="stack-list" data-attacks-dashboard></div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>${t("dashboard.lastAction.title")}</h2>
                  <p class="muted">${t("dashboard.lastAction.subtitle")}</p>
                </div>
              </div>
              <div data-last-action></div>
              <ol class="history-list" data-history-list></ol>
            </article>
          </section>

          <section class="panel" data-panel="jets" hidden>
            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>${t("rolls.mode.title")}</h2>
                  <p class="muted">${t("rolls.mode.subtitle")}</p>
                </div>
              </div>
              <div class="mode-group" role="radiogroup" aria-label="${t("rolls.mode.ariaLabel")}">
                ${buildRollModeTemplate()}
              </div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>${t("rolls.free.title")}</h2>
                  <p class="muted">${t("rolls.free.subtitle")}</p>
                </div>
              </div>
              ${buildFreeDiceBuilderTemplate()}
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>${t("rolls.abilities.title")}</h2>
                  <p class="muted">${t("rolls.abilities.subtitle")}</p>
                </div>
              </div>
              <div class="ability-dashboard" data-ability-dashboard></div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>${t("rolls.skills.title")}</h2>
                  <p class="muted">${t("rolls.skills.subtitle")}</p>
                </div>
              </div>
              <div class="button-grid" data-skills-dashboard></div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>${t("rolls.saves.title")}</h2>
                  <p class="muted">${t("rolls.saves.subtitle")}</p>
                </div>
              </div>
              <div class="button-grid" data-saves-dashboard></div>
            </article>
          </section>

          <section class="panel" data-panel="character" hidden>
            <section class="stack-form" aria-label="${t("character.section.ariaLabel")}">
              <details class="card disclosure" open>
                <summary>${t("character.identity.title")}</summary>

                <div class="avatar-upload-wrapper">
                  <button
                    type="button"
                    class="avatar-upload"
                    data-action="upload-avatar"
                    aria-label="${t("character.avatar.ariaLabel")}"
                    title="${t("character.avatar.ariaLabel")}"
                  >
                    <img class="avatar-img" data-avatar-preview src="" alt="" hidden>
                    <span class="avatar-placeholder" data-avatar-placeholder>
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/>
                        <circle cx="12" cy="13" r="3"/>
                      </svg>
                      <span class="avatar-hint">${t("character.avatar.hint")}</span>
                    </span>
                  </button>
                  <input type="file" accept="image/*" id="avatar-file-input" style="display:none" aria-label="${t("character.avatar.label")}" tabindex="-1">
                </div>

                <div class="form-grid">
                  <label class="field" for="character-name">
                    <span>${t("character.name.label")}</span>
                    <input id="character-name" type="text" data-character-field="name" autocomplete="nickname" />
                  </label>
                  <label class="field" for="character-class">
                    <span>${t("character.class.label")}</span>
                    <input id="character-class" type="text" data-character-field="className" autocomplete="off" />
                  </label>
                  <label class="field" for="character-level">
                    <span>${t("character.level.label")}</span>
                    <input
                      id="character-level"
                      type="number"
                      min="1"
                      max="20"
                      inputmode="numeric"
                      data-character-field="level"
                      data-lock-sensitive="true"
                    />
                  </label>
                </div>
              </details>

              <details class="card disclosure" open>
                <summary>${t("character.abilities.title")}</summary>
                <div class="form-grid form-grid-abilities">
                  ${ABILITIES.map(
                    (ability) => `
                      <label class="field compact-field" for="ability-${ability.key}">
                        <span>${t("ability." + ability.key)} (${t("ability." + ability.key + ".short")})</span>
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
                        <span class="field-hint">${t("character.modLabel")} <strong data-ability-mod-hint="${ability.key}">+0</strong></span>
                      </label>
                    `
                  ).join("")}
                </div>
              </details>

              <details class="card disclosure" open>
                <summary>${t("character.defenses.title")}</summary>
                <div class="form-grid">
                  <label class="field" for="character-hp-max">
                    <span>${t("character.hpMax.label")}</span>
                    <input
                      id="character-hp-max"
                      type="number"
                      min="1"
                      inputmode="numeric"
                      data-character-field="hpMax"
                      data-lock-sensitive="true"
                    />
                  </label>
                  <label class="field" for="character-ac">
                    <span>${t("character.ac.label")}</span>
                    <input
                      id="character-ac"
                      type="number"
                      min="0"
                      max="40"
                      inputmode="numeric"
                      data-character-field="armorClass"
                      data-lock-sensitive="true"
                    />
                  </label>
                  <label class="field" for="character-current-hp">
                    <span>${t("character.currentHp.label")}</span>
                    <input
                      id="character-current-hp"
                      type="number"
                      min="0"
                      inputmode="numeric"
                      data-character-field="currentHp"
                    />
                  </label>
                </div>
              </details>

              <details class="card disclosure">
                <summary>${t("character.skills.title")}</summary>
                <div class="checklist-grid">
                  ${buildSkillChecklistTemplate()}
                </div>
              </details>

              <details class="card disclosure">
                <summary>${t("character.saves.title")}</summary>
                <div class="checklist-grid">
                  ${buildSaveChecklistTemplate()}
                </div>
              </details>

              <details class="card disclosure">
                <summary>${t("character.attacks.title")}</summary>
                <div class="stack-form">
                  <form class="sub-form" data-form="attack">
                    <div class="form-grid">
                      <label class="field" for="attack-name">
                        <span>${t("character.attacks.nameLabel")}</span>
                        <input id="attack-name" name="name" type="text" required />
                      </label>
                      <label class="field" for="attack-ability">
                        <span>${t("character.attacks.abilityLabel")}</span>
                        <select id="attack-ability" name="ability">
                          ${ABILITIES.map(
                            (ability) =>
                              `<option value="${ability.key}">${t("ability." + ability.key)} (${t("ability." + ability.key + ".short")})</option>`
                          ).join("")}
                        </select>
                      </label>
                      <label class="field" for="attack-bonus">
                        <span>${t("character.attacks.bonusLabel")}</span>
                        <input id="attack-bonus" name="bonus" type="number" value="0" />
                      </label>
                      <label class="field" for="attack-damage">
                        <span>${t("character.attacks.damageLabel")}</span>
                        <input id="attack-damage" name="damage" type="text" placeholder="${t("character.attacks.damagePlaceholder")}" />
                      </label>
                    </div>
                    <label class="switch-field">
                      <input type="checkbox" name="proficient" checked />
                      <span>${t("character.attacks.proficiencyLabel")}</span>
                    </label>
                    <button type="submit" class="primary-action">${t("character.attacks.addButton")}</button>
                  </form>
                  <div class="stack-list" data-attack-manager></div>
                </div>
              </details>
            </section>
          </section>

          <section class="panel" data-panel="grimoire" hidden>
            <article class="card">
              <div data-spell-slots></div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>${t("grimoire.title")}</h2>
                  <p class="muted">${t("grimoire.subtitle")}</p>
                </div>
              </div>
              <form class="stack-form" data-form="spell">
                <div class="form-grid">
                  <label class="field" for="spell-name">
                    <span>${t("grimoire.spell.nameLabel")}</span>
                    <input id="spell-name" name="name" type="text" required />
                  </label>
                  <label class="field" for="spell-level">
                    <span>${t("grimoire.spell.levelLabel")}</span>
                    <input id="spell-level" name="level" type="number" min="0" max="9" value="0" />
                  </label>
                  <label class="field" for="spell-slot-cost">
                    <span>${t("grimoire.spell.slotCostLabel")}</span>
                    <input id="spell-slot-cost" name="slotCost" type="number" min="0" max="9" value="0" />
                  </label>
                  <label class="field field-full" for="spell-damage">
                    <span>${t("grimoire.spell.damageLabel")}</span>
                    <input id="spell-damage" name="damage" type="text" placeholder="${t("grimoire.spell.damagePlaceholder")}" />
                  </label>
                  <label class="field field-full" for="spell-note">
                    <span>${t("grimoire.spell.noteLabel")}</span>
                    <input id="spell-note" name="note" type="text" placeholder="${t("grimoire.spell.notePlaceholder")}" />
                  </label>
                </div>
                <button type="submit" class="primary-action">${t("grimoire.spell.addButton")}</button>
              </form>
              <div class="stack-list" data-spell-list></div>
            </article>
          </section>

          <section class="panel" data-panel="room" hidden>
            <section class="stack-form" aria-label="${t("room.section.ariaLabel")}">
              <div data-room-panel></div>
            </section>
          </section>

          <section class="panel" data-panel="settings" hidden>
            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>${t("settings.discord.title")}</h2>
                  <p class="muted">${t("settings.discord.subtitle")}</p>
                </div>
              </div>
              <label class="field" for="webhook-url">
                <span>${t("settings.discord.urlLabel")}</span>
                <input
                  id="webhook-url"
                  type="url"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="${t("settings.discord.urlPlaceholder")}"
                  data-setting-field="webhookUrl"
                />
              </label>
              <p class="muted" style="font-size:0.8rem;margin-top:0.5rem">
                ${t("settings.discord.instructions")}
              </p>
              <div class="quick-actions" style="margin-top:0.75rem">
                <button type="button" class="primary-action" data-action="test-discord">
                  ${t("settings.discord.testButton")}
                </button>
                <button type="button" class="danger-button" data-action="reset-app">
                  ${t("settings.discord.resetButton")}
                </button>
              </div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>${t("settings.sync.title")}</h2>
                  <p class="muted">${t("settings.sync.subtitle")}</p>
                </div>
              </div>
              <label class="field" for="firebase-url">
                <span>${t("settings.sync.firebaseUrlLabel")}</span>
                <input
                  id="firebase-url"
                  type="url"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="${t("settings.sync.firebaseUrlPlaceholder")}"
                  data-setting-field="firebaseUrl"
                />
              </label>
              <label class="field" for="sync-room" style="margin-top:0.6rem">
                <span>${t("settings.sync.roomLabel")}</span>
                <input
                  id="sync-room"
                  type="text"
                  autocomplete="off"
                  placeholder="${t("settings.sync.roomPlaceholder")}"
                  data-setting-field="syncRoom"
                />
              </label>
              <label class="field" for="dice-color" style="margin-top:0.6rem">
                <span>${t("settings.sync.diceColorLabel")}</span>
                <div style="display:flex;align-items:center;gap:0.75rem">
                  <input
                    id="dice-color"
                    type="color"
                    data-setting-field="diceColor"
                    style="width:2.5rem;height:2.5rem;padding:0.2rem;border:none;background:none;cursor:pointer;border-radius:0.4rem"
                  />
                  <span class="muted" style="font-size:0.8rem">${t("settings.sync.diceColorNote")}</span>
                </div>
              </label>
              <p class="muted" style="font-size:0.8rem;margin-top:0.5rem">
                ${t("settings.sync.instructions")}
              </p>
              <div class="quick-actions" style="margin-top:0.75rem">
                <button type="button" class="primary-action" data-action="test-sync">
                  ${t("settings.sync.testButton")}
                </button>
              </div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>${t("settings.character.title")}</h2>
                  <p class="muted">${t("settings.character.subtitle")}</p>
                </div>
              </div>

              <div class="save-actions">
                <div class="save-action-item">
                  <div class="save-action-text">
                    <strong>${t("settings.character.exportLabel")}</strong>
                    <span class="muted">${t("settings.character.exportDesc")}</span>
                  </div>
                  <button type="button" class="export-btn" data-action="export-character">
                    ${t("settings.character.exportButton")}
                  </button>
                </div>

                <div class="save-action-item">
                  <div class="save-action-text">
                    <strong>${t("settings.character.importLabel")}</strong>
                    <span class="muted">${t("settings.character.importDesc")}</span>
                  </div>
                  <button type="button" class="import-btn" data-action="import-character">
                    ${t("settings.character.importButton")}
                  </button>
                </div>
              </div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>${t("settings.session.title")}</h2>
                  <p class="muted">${t("settings.session.subtitle")}</p>
                </div>
              </div>
              <div data-session-summary></div>
            </article>
          </section>
        </section>
      </main>
      <p class="sr-only" data-live-region aria-live="assertive"></p>
      <aside id="party-panel" class="party-panel" aria-label="${t("party.ariaLabel")}">
        <ul class="party-list" data-party-list aria-label="${t("party.title")}"></ul>
      </aside>
    </div>
  `;
}