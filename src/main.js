import { ABILITIES, HISTORY_LIMIT, ROLL_MODES, SKILLS } from "./data/constants.js";
import { createSessionBaseline } from "./services/antiCheat.js";
import { buildRollSummary, rollDie, validateD20Result } from "./services/dice.js";
import { triggerDiceAnimation, triggerMultiDiceAnimation, preloadDiceBox, rollDiceValues } from "./services/diceAnimation.js";
import { connectSync, disconnectSync, publishRoll } from "./services/firebaseSync.js";
import {
  sendAlertWebhook,
  sendDamageWebhook,
  sendFreeDiceWebhook,
  sendHpWebhook,
  sendRollWebhook,
  sendSpellWebhook,
  sendTestWebhook
} from "./services/discord.js";
import {
  calculateModifier,
  calculateProficiencyBonus,
  clamp,
  formatSignedNumber,
  getAbilityLabel,
  getAttackBonus,
  getSaveBonus,
  getSkillBonus,
  restoreLockedCharacter,
  toInt
} from "./services/character.js";
import { loadState, resetState, sanitiseState, saveState } from "./services/storage.js";

const appElement = document.querySelector("#app");

if (!appElement) {
  throw new Error("Le conteneur principal de l'application est introuvable.");
}

let state = loadState();
let saveTimerId = 0;
let integrityRestoring = false;

const abilityMap = new Map(ABILITIES.map((ability) => [ability.key, ability]));
const skillMap = new Map(SKILLS.map((skill) => [skill.key, skill]));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function getCharacterName() {
  return state.character.name || "Aventurier";
}

function getCharacterSubtitle() {
  const className = state.character.className || "Classe libre";
  return `${className} • Niveau ${state.character.level}`;
}

function getModeLabel(mode) {
  return (
    ROLL_MODES.find((entry) => entry.key === mode)?.label ??
    ROLL_MODES.find((entry) => entry.key === "normal")?.label ??
    "Normal"
  );
}

function setStatus(tone, message) {
  state.ui.status = { tone, message };
  const liveRegion = appElement.querySelector("[data-live-region]");

  if (liveRegion) {
    liveRegion.textContent = "";
    window.requestAnimationFrame(() => {
      liveRegion.textContent = message;
    });
  }
}

function addHistory(text, kind = "info") {
  state.ui.history = [{ id: uniqueId("hist"), text, kind }, ...state.ui.history].slice(
    0,
    HISTORY_LIMIT
  );
}

// ─── Dice builder helpers ─────────────────────────────────────────────────────

function readFreeDiceMap() {
  const map = {};

  FREE_DICE.forEach((sides) => {
    const el = appElement.querySelector(`[data-die-qty="${sides}"]`);
    const qty = toInt(el?.textContent, 0);

    if (qty > 0) {
      map[sides] = qty;
    }
  });

  return map;
}

function updateFreeDiceNotation() {
  const map = readFreeDiceMap();
  const parts = Object.entries(map)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([sides, qty]) => `${qty}d${sides}`);

  const notationEl = appElement.querySelector("[data-dice-notation]");
  const rollBtn = appElement.querySelector("[data-action='dice-builder-roll']");

  if (notationEl) {
    notationEl.textContent = parts.length > 0 ? parts.join(" + ") : "Aucun dé sélectionné";
  }

  if (rollBtn) {
    rollBtn.disabled = parts.length === 0;
  }
}

function queueSave() {
  window.clearTimeout(saveTimerId);
  saveTimerId = window.setTimeout(() => {
    saveState(state);
  }, 150);
}

// ─── Debounce notification HP ─────────────────────────────────────────────────
// On attend 4 s sans changement avant d'envoyer afin d'éviter le spam Discord.

let hpNotifyTimerId = 0;
let hpNotifyFromHp = null;

function queueHpNotify(previousHp) {
  if (hpNotifyFromHp === null) {
    hpNotifyFromHp = previousHp;
  }

  window.clearTimeout(hpNotifyTimerId);
  hpNotifyTimerId = window.setTimeout(() => {
    const fromHp = hpNotifyFromHp;
    const toHp = state.character.currentHp;
    hpNotifyFromHp = null;

    if (fromHp !== toHp) {
      sendHpWebhook(state.settings, {
        characterName: getCharacterName(),
        from: fromHp,
        to: toHp,
        max: state.character.hpMax,
        delta: toHp - fromHp
      });
    }
  }, 4000);
}

function normaliseRuntimeState() {
  state.character.level = clamp(toInt(state.character.level, 1), 1, 20);
  state.character.hpMax = clamp(toInt(state.character.hpMax, 10), 1, 999);
  state.character.currentHp = clamp(
    toInt(state.character.currentHp, state.character.hpMax),
    0,
    state.character.hpMax
  );
  state.character.armorClass = clamp(toInt(state.character.armorClass, 10), 0, 40);
}

function commit(syncInputs = true) {
  normaliseRuntimeState();
  queueSave();
  render(syncInputs);
}

function updateFieldValue(selector, value) {
  const field = appElement.querySelector(selector);

  if (!field || field === document.activeElement) {
    return;
  }

  field.value = value;
}

function buildAbilityFormTemplate() {
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

function buildSkillChecklistTemplate() {
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

function buildSaveChecklistTemplate() {
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

function buildRollModeTemplate() {
  return ROLL_MODES.map(
    (mode) => `
      <label class="mode-option">
        <input type="radio" name="roll-mode" value="${mode.key}" data-roll-mode-control />
        <span>${mode.label}</span>
      </label>
    `
  ).join("");
}

const FREE_DICE = [4, 6, 8, 10, 12, 20];

function buildFreeDiceBuilderTemplate() {
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

function getAppTemplate() {
  return `
    <div class="app-shell">
      <header class="app-header card">
        <div>
          <p class="eyebrow">Compagnon D&amp;D</p>
          <h1 data-character-title>Aventurier</h1>
          <p class="muted" data-character-subtitle>Classe libre • Niveau 1</p>
        </div>
        <div class="header-actions">
          <button
            type="button"
            class="d20-lock-btn"
            data-action="toggle-lock"
            aria-pressed="false"
            aria-label="Verrouiller la session"
            title="Verrouiller la session"
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
      
      <nav class="bottom-nav" aria-label="Navigation principale">
        <button type="button" class="nav-button" data-action="switch-tab" data-tab="dashboard">
          <span class="nav-icon" aria-hidden="true">⚔️</span>
          <span class="nav-label">Combat</span>
        </button>
        <button type="button" class="nav-button" data-action="switch-tab" data-tab="jets">
          <span class="nav-icon" aria-hidden="true">🎲</span>
          <span class="nav-label">Jets</span>
        </button>
        <button type="button" class="nav-button" data-action="switch-tab" data-tab="grimoire">
          <span class="nav-icon" aria-hidden="true">✨</span>
          <span class="nav-label">Sorts</span>
        </button>
        <button type="button" class="nav-button" data-action="switch-tab" data-tab="character">
          <span class="nav-icon" aria-hidden="true">📜</span>
          <span class="nav-label">Fiche</span>
        </button>
        <button type="button" class="nav-button" data-action="switch-tab" data-tab="settings">
          <span class="nav-icon" aria-hidden="true">⚙️</span>
          <span class="nav-label">Réglages</span>
        </button>
      </nav>

      <main class="app-main">
        <section class="status-banner" data-status-banner role="status" aria-live="polite"></section>

        <!-- Banner de jet distant affiché en overlay lors d'une animation multijoueur -->
        <div class="remote-roll-banner" id="remote-roll-banner" hidden aria-live="polite">
          <span id="remote-roll-banner-text"></span>
        </div>

        <section class="panel-stack">
          <section class="panel" data-panel="dashboard">
            <div class="hero-grid">
              <article class="card stat-card">
                <div class="card-header-inline">
                  <h2>Points de vie</h2>
                  <span class="pill" data-hp-state>Plein</span>
                </div>
                <div class="hp-value">
                  <span data-current-hp-display>10</span>
                  <small>/ <span data-max-hp-display>10</span></small>
                </div>
                <label class="field" for="current-hp">
                  <span>PV actuels</span>
                  <input
                    id="current-hp"
                    type="number"
                    min="0"
                    inputmode="numeric"
                    data-current-hp-input
                    aria-label="Points de vie actuels"
                  />
                </label>
                <div class="hp-track" aria-hidden="true">
                  <span class="hp-track-fill" data-hp-track></span>
                </div>
                <div class="quick-actions" role="group" aria-label="Ajuster les points de vie">
                  <button type="button" data-action="adjust-hp" data-delta="-5">-5</button>
                  <button type="button" data-action="adjust-hp" data-delta="-1">-1</button>
                  <button type="button" data-action="adjust-hp" data-delta="1">+1</button>
                  <button type="button" data-action="adjust-hp" data-delta="5">+5</button>
                </div>
              </article>

              <article class="card stat-card">
                <div class="card-header-inline">
                  <h2>Classe d'armure</h2>
                  <span class="pill">Défense</span>
                </div>
                <div class="big-stat" data-armor-class-display>10</div>
                <p class="muted">Valeur verrouillée pendant la session.</p>
              </article>

              <article class="card stat-card">
                <div class="card-header-inline">
                  <h2>Maîtrise</h2>
                  <span class="pill">Calculée</span>
                </div>
                <div class="big-stat" data-proficiency-display>+2</div>
                <p class="muted">Perception passive : <strong data-passive-perception>10</strong></p>
              </article>
            </div>

            <article class="card initiative-card">
              <button
                type="button"
                class="initiative-btn"
                data-action="roll-initiative"
                aria-label="Lancer le jet d'initiative (DEX)"
              >
                <span class="initiative-icon" aria-hidden="true">⚡</span>
                <span class="initiative-text">
                  <span class="initiative-label">Jet d'Initiative</span>
                  <span class="initiative-mod" data-initiative-mod>+0</span>
                </span>
              </button>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>Attaques</h2>
                  <p class="muted">Ajoutez vos attaques depuis la fiche personnage.</p>
                </div>
              </div>
              <div class="stack-list" data-attacks-dashboard></div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>Dernière action</h2>
                  <p class="muted">Historique local des derniers jets et sorts.</p>
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
                  <h2>Mode de jet</h2>
                  <p class="muted">Tous les boutons utilisent ce mode.</p>
                </div>
              </div>
              <div class="mode-group" role="radiogroup" aria-label="Mode de jet">
                ${buildRollModeTemplate()}
              </div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>Dés libres</h2>
                  <p class="muted">Choisissez votre combinaison et lancez.</p>
                </div>
              </div>
              ${buildFreeDiceBuilderTemplate()}
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>Caractéristiques</h2>
                  <p class="muted">Modificateurs calculés automatiquement.</p>
                </div>
              </div>
              <div class="ability-dashboard" data-ability-dashboard></div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>Compétences</h2>
                  <p class="muted">18 actions rapides prêtes pour la table.</p>
                </div>
              </div>
              <div class="button-grid" data-skills-dashboard></div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>Jets de sauvegarde</h2>
                  <p class="muted">Maîtrises appliquées automatiquement.</p>
                </div>
              </div>
              <div class="button-grid" data-saves-dashboard></div>
            </article>
          </section>

          <section class="panel" data-panel="character" hidden>
            <section class="stack-form" aria-label="Fiche du personnage">
              <details class="card disclosure" open>
                <summary>Identité du personnage</summary>
                <div class="form-grid">
                  <label class="field" for="character-name">
                    <span>Nom</span>
                    <input id="character-name" type="text" data-character-field="name" autocomplete="nickname" />
                  </label>
                  <label class="field" for="character-class">
                    <span>Classe</span>
                    <input id="character-class" type="text" data-character-field="className" autocomplete="off" />
                  </label>
                  <label class="field" for="character-level">
                    <span>Niveau</span>
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
                <summary>Caractéristiques</summary>
                <div class="form-grid form-grid-abilities">
                  ${buildAbilityFormTemplate()}
                </div>
              </details>

              <details class="card disclosure" open>
                <summary>Défenses et ressources</summary>
                <div class="form-grid">
                  <label class="field" for="character-hp-max">
                    <span>PV maximum</span>
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
                    <span>Classe d'armure</span>
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
                    <span>PV actuels</span>
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
                <summary>Compétences maîtrisées</summary>
                <div class="checklist-grid">
                  ${buildSkillChecklistTemplate()}
                </div>
              </details>

              <details class="card disclosure">
                <summary>Sauvegardes maîtrisées</summary>
                <div class="checklist-grid">
                  ${buildSaveChecklistTemplate()}
                </div>
              </details>

              <details class="card disclosure">
                <summary>Attaques</summary>
                <div class="stack-form">
                  <form class="sub-form" data-form="attack">
                    <div class="form-grid">
                      <label class="field" for="attack-name">
                        <span>Nom de l'attaque</span>
                        <input id="attack-name" name="name" type="text" required />
                      </label>
                      <label class="field" for="attack-ability">
                        <span>Caractéristique</span>
                        <select id="attack-ability" name="ability">
                          ${ABILITIES.map(
                            (ability) =>
                              `<option value="${ability.key}">${ability.label} (${ability.short})</option>`
                          ).join("")}
                        </select>
                      </label>
                      <label class="field" for="attack-bonus">
                        <span>Bonus fixe</span>
                        <input id="attack-bonus" name="bonus" type="number" value="0" />
                      </label>
                      <label class="field" for="attack-damage">
                        <span>Dégâts / note</span>
                        <input id="attack-damage" name="damage" type="text" placeholder="1d8 + 3 tranchants" />
                      </label>
                    </div>
                    <label class="switch-field">
                      <input type="checkbox" name="proficient" checked />
                      <span>Ajoute la maîtrise</span>
                    </label>
                    <button type="submit" class="primary-action">Ajouter l'attaque</button>
                  </form>
                  <div class="stack-list" data-attack-manager></div>
                </div>
              </details>
            </section>
          </section>

          <section class="panel" data-panel="grimoire" hidden>
            <article class="card">
              <div data-spell-slots>
                <!-- Rempli par renderSpellSlots() -->
              </div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>Grimoire</h2>
                  <p class="muted">Ajoutez vos sorts favoris puis lancez-les en un geste.</p>
                </div>
              </div>
              <form class="stack-form" data-form="spell">
                <div class="form-grid">
                  <label class="field" for="spell-name">
                    <span>Nom du sort</span>
                    <input id="spell-name" name="name" type="text" required />
                  </label>
                  <label class="field" for="spell-level">
                    <span>Niveau</span>
                    <input id="spell-level" name="level" type="number" min="0" max="9" value="0" />
                  </label>
                  <label class="field" for="spell-slot-cost">
                    <span>Coût en emplacement</span>
                    <input id="spell-slot-cost" name="slotCost" type="number" min="0" max="9" value="0" />
                  </label>
                  <label class="field field-full" for="spell-damage">
                    <span>Dégâts</span>
                    <input id="spell-damage" name="damage" type="text" placeholder="2d6 feu, 1d8 nécrotique…" />
                  </label>
                  <label class="field field-full" for="spell-note">
                    <span>Note / effet</span>
                    <input id="spell-note" name="note" type="text" placeholder="Zone de 6 m, jet de DEX, feu" />
                  </label>
                </div>
                <button type="submit" class="primary-action">Ajouter au grimoire</button>
              </form>
              <div class="stack-list" data-spell-list></div>
            </article>
          </section>

          <section class="panel" data-panel="settings" hidden>
            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>Webhook Discord</h2>
                  <p class="muted">Collez l'URL de votre webhook Discord pour recevoir les notifications de jet, PV et sorts directement dans votre salon.</p>
                </div>
              </div>
              <label class="field" for="webhook-url">
                <span>URL du webhook</span>
                <input
                  id="webhook-url"
                  type="url"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="https://discord.com/api/webhooks/…"
                  data-setting-field="webhookUrl"
                />
              </label>
              <p class="muted" style="font-size:0.8rem;margin-top:0.5rem">
                Dans Discord : Paramètres du salon → Intégrations → Webhooks → Nouveau webhook → Copier l'URL.
              </p>
              <div class="quick-actions" style="margin-top:0.75rem">
                <button type="button" class="primary-action" data-action="test-discord">
                  🔔 Tester le webhook
                </button>
                <button type="button" class="danger-button" data-action="reset-app">
                  Réinitialiser l'application
                </button>
              </div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>🎲 Synchronisation multijoueur</h2>
                  <p class="muted">Voir les lancers de dés de vos coéquipiers en temps réel sur votre écran.</p>
                </div>
              </div>
              <label class="field" for="firebase-url">
                <span>URL Firebase Realtime Database</span>
                <input
                  id="firebase-url"
                  type="url"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="https://mon-projet-rtdb.firebaseio.com"
                  data-setting-field="firebaseUrl"
                />
              </label>
              <label class="field" for="sync-room" style="margin-top:0.6rem">
                <span>Nom de la session (room)</span>
                <input
                  id="sync-room"
                  type="text"
                  autocomplete="off"
                  placeholder="campagne-de-thorin"
                  data-setting-field="syncRoom"
                />
              </label>
              <label class="field" for="dice-color" style="margin-top:0.6rem">
                <span>Couleur de vos dés</span>
                <div style="display:flex;align-items:center;gap:0.75rem">
                  <input
                    id="dice-color"
                    type="color"
                    data-setting-field="diceColor"
                    style="width:2.5rem;height:2.5rem;padding:0.2rem;border:none;background:none;cursor:pointer;border-radius:0.4rem"
                  />
                  <span class="muted" style="font-size:0.8rem">Visible par les autres joueurs sur leur écran</span>
                </div>
              </label>
              <p class="muted" style="font-size:0.8rem;margin-top:0.5rem">
                Créez un projet Firebase gratuit → Realtime Database → copiez l'URL.<br>
                Réglez les règles DB sur <code>".read": true, ".write": true</code>.<br>
                Tous les joueurs dans la même session voient les animations de dés en direct.
              </p>
              <div class="quick-actions" style="margin-top:0.75rem">
                <button type="button" class="primary-action" data-action="test-sync">
                  🔗 Tester la sync
                </button>
              </div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>Sauvegarde du personnage</h2>
                  <p class="muted">Exportez votre fiche pour ne jamais la perdre, même si le cache est effacé.</p>
                </div>
              </div>

              <div class="save-actions">
                <div class="save-action-item">
                  <div class="save-action-text">
                    <strong>Exporter</strong>
                    <span class="muted">Télécharge un fichier <code>.json</code> avec toute votre fiche.</span>
                  </div>
                  <button type="button" class="export-btn" data-action="export-character">
                    📥 Exporter
                  </button>
                </div>

                <div class="save-action-item">
                  <div class="save-action-text">
                    <strong>Importer</strong>
                    <span class="muted">Charge une fiche depuis un fichier <code>.json</code> exporté précédemment.</span>
                  </div>
                  <button type="button" class="import-btn" data-action="import-character">
                    📤 Importer
                  </button>
                </div>
              </div>
            </article>

            <article class="card">
              <div class="section-heading">
                <div>
                  <h2>Verrouillage de session</h2>
                  <p class="muted">Surveille les caractéristiques de base et l'intégrité des jets.</p>
                </div>
              </div>
              <div data-session-summary></div>
            </article>
          </section>
        </section>
      </main>
      <p class="sr-only" data-live-region aria-live="assertive"></p>
    </div>
  `;
}

function renderAbilityDashboard() {
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

function renderSkillDashboard() {
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

function renderSaveDashboard() {
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

/**
 * Parse une chaîne de dégâts (ex: "2d6 + 3 tranchants", "1d8+1d4-1") et retourne
 * un mapping de dés {faces: quantité} et un modificateur fixe.
 * Retourne null si aucun dé ni nombre exploitable n'est trouvé.
 */
function parseDamageString(damage) {
  if (!damage || typeof damage !== "string") {
    return null;
  }

  const diceMap = {};
  let hasDice = false;

  // Extraire tous les groupes NdM
  for (const [, qty, sides] of damage.matchAll(/(\d+)d(\d+)/gi)) {
    const s = parseInt(sides, 10);
    diceMap[s] = (diceMap[s] || 0) + parseInt(qty, 10);
    hasDice = true;
  }

  // Retirer les dés, puis additionner les nombres restants (avec leur signe)
  const stripped = damage.replace(/\d+d\d+/gi, "");
  let flat = 0;

  for (const m of stripped.matchAll(/([+-]?\s*\d+)/g)) {
    flat += parseInt(m[1].replace(/\s/g, ""), 10);
  }

  if (!hasDice && flat === 0) {
    return null;
  }

  return { diceMap, flat, hasDice };
}

function buildAttackCard(attack, { showDelete = false } = {}) {
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

function renderAttacks() {
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

function renderSpellSlots() {
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

function renderSpells() {
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

function renderLastAction() {
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

function renderSessionSummary() {
  const container = appElement.querySelector("[data-session-summary]");

  if (!container) {
    return;
  }

  if (!state.sessionLock.isLocked) {
    container.innerHTML = `
      <p class="empty-state">
        La session n'est pas encore verrouillée. Activez-la au début de la partie pour
        figer le niveau, les caractéristiques, les PV max, la CA et les maîtrises.
      </p>
    `;
    return;
  }

  container.innerHTML = `
    <div class="session-lock-card">
      <p><strong>Session verrouillée.</strong> Toute modification suspecte est restaurée puis signalée sur Discord.</p>
      <ul class="session-lock-list">
        <li>Niveau surveillé : ${state.character.level}</li>
        <li>PV max surveillés : ${state.character.hpMax}</li>
        <li>CA surveillée : ${state.character.armorClass}</li>
        <li>Compétences maîtrisées : ${state.character.skillProficiencies.length}</li>
        <li>Sauvegardes maîtrisées : ${state.character.saveProficiencies.length}</li>
      </ul>
    </div>
  `;
}

function renderFormValues(syncInputs = true) {
  const proficiencyBonus = calculateProficiencyBonus(state.character.level);

  if (syncInputs) {
    updateFieldValue("[data-character-field='name']", state.character.name);
    updateFieldValue("[data-character-field='className']", state.character.className);
    updateFieldValue("[data-character-field='level']", state.character.level);
    updateFieldValue("[data-character-field='hpMax']", state.character.hpMax);
    updateFieldValue("[data-character-field='armorClass']", state.character.armorClass);
    updateFieldValue("[data-character-field='currentHp']", state.character.currentHp);
    updateFieldValue("[data-current-hp-input]", state.character.currentHp);
    updateFieldValue("[data-setting-field='webhookUrl']", state.settings.webhookUrl ?? "");
    updateFieldValue("[data-setting-field='firebaseUrl']", state.settings.firebaseUrl ?? "");
    updateFieldValue("[data-setting-field='syncRoom']", state.settings.syncRoom ?? "");
    updateFieldValue("[data-setting-field='diceColor']", state.settings.diceColor ?? "#7c3aed");

    for (const ability of ABILITIES) {
      updateFieldValue(`[data-ability-input='${ability.key}']`, state.character.abilities[ability.key]);
    }
  }

  appElement.querySelector("[data-character-title]").textContent = getCharacterName();
  appElement.querySelector("[data-character-subtitle]").textContent = getCharacterSubtitle();
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
    hpPercent <= 25 ? "Critique" : hpPercent <= 60 ? "Blessé" : "Plein";

  const lockButton = appElement.querySelector("[data-action='toggle-lock']");
  const lockLabel = state.sessionLock.isLocked ? "Déverrouiller la session" : "Verrouiller la session";
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


/** Met à jour uniquement les hints de modificateur dans la fiche sans toucher aux inputs. */
function syncAbilityHints() {
  for (const ability of ABILITIES) {
    const hint = appElement.querySelector(`[data-ability-mod-hint='${ability.key}']`);

    if (hint) {
      hint.textContent = formatSignedNumber(
        calculateModifier(state.character.abilities[ability.key])
      );
    }
  }
}

function render(syncInputs = true) {
  renderAbilityDashboard();
  renderSkillDashboard();
  renderSaveDashboard();
  renderAttacks();
  renderSpells();
  renderSpellSlots();
  renderLastAction();
  renderSessionSummary();
  renderFormValues(syncInputs);
}

async function reportIntegrityIssue(changes, source) {
  if (integrityRestoring) {
    return;
  }

  integrityRestoring = true;

  try {
    state.character = restoreLockedCharacter(state.character, state.sessionLock.baseline);
    addHistory("Alerte anti-triche détectée et état restauré.", "alert");
    setStatus(
      "error",
      "Modification verrouillée détectée. Les valeurs surveillées ont été restaurées."
    );
    commit(false);

    try {
      await sendAlertWebhook(state.settings, {
        characterName: getCharacterName(),
        changes,
        source
      });
      setStatus("error", "Alerte anti-triche envoyée au MJ.");
      commit(false);
    } catch (error) {
      setStatus("error", `Alerte détectée, mais Discord a échoué : ${error.message}`);
      commit(false);
    }
  } finally {
    integrityRestoring = false;
  }
}

async function performRoll({ label, bonus, note = "" }) {
  const mode = state.ui.rollMode;

  // Signal de début → les autres joueurs voient le compteur CSS tourner
  publishRoll({
    firebaseUrl: state.settings.firebaseUrl,
    roomId     : state.settings.syncRoom,
    roll: {
      type         : "d20",
      characterName: getCharacterName(),
      label,
      mode,
      diceMap      : { 20: mode === "normal" ? 1 : 2 },
      flat         : bonus,
      diceColor    : state.settings.diceColor,
    },
  });

  // Animation locale — dice-box génère les vraies valeurs (faces = overlay)
  const { baseRoll, rolls } = await triggerDiceAnimation(20, mode, bonus, label, state.settings.diceColor);

  try {
    validateD20Result(baseRoll);
  } catch (error) {
    await reportIntegrityIssue(
      [{ label: "Intégrité du d20", from: "Valeur 1 à 20", to: error.message }],
      "runtime"
    );
    throw error;
  }

  const total = baseRoll + bonus;
  const isCritical = baseRoll === 20;
  const isFumble = baseRoll === 1;
  const rollDetails = rolls.length === 2 ? `${rolls[0]} / ${rolls[1]}` : `${baseRoll}`;
  const breakdown = `${rollDetails}${bonus === 0 ? "" : ` ${bonus > 0 ? "+" : "-"} ${Math.abs(bonus)}`}`.trim();

  const result = { label, total, bonus, baseRoll, rolls, mode, isCritical, isFumble, breakdown };

  state.ui.lastRoll = { kind: "roll", ...result, note };

  const localSummary = `${getCharacterName()} : ${label} → ${total} (${baseRoll} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)})`;
  addHistory(localSummary, "roll");

  sendRollWebhook(state.settings, { ...result, label, bonus, characterName: getCharacterName() });

  // Résultat réel → compteur CSS distant se stabilise sur les bonnes valeurs
  publishRoll({
    firebaseUrl: state.settings.firebaseUrl,
    roomId     : state.settings.syncRoom,
    roll: {
      type         : "d20",
      characterName: getCharacterName(),
      label,
      mode,
      diceMap      : { 20: mode === "normal" ? 1 : 2 },
      rolls        : result.rolls.map((v) => ({ sides: 20, value: v })),
      flat         : bonus,
      total,
      diceColor    : state.settings.diceColor,
    },
  });

  setStatus("success", `${label} → **${total}**${isCritical ? " 💥 Critique !" : isFumble ? " 💀 Échec critique" : ""}`);
  commit(false);
}

async function castSpell(spellId) {
  const spell = state.character.spells.find((entry) => entry.id === spellId);

  if (!spell) {
    throw new Error("Le sort demandé est introuvable.");
  }

  // Les sorts de niveau 0 (tours de magie) sont gratuits — jamais d'emplacement consommé
  const isCantrip = spell.level === 0;
  // slotLevel = quel niveau de slot consommer ; slotCost = combien en consommer
  const slotLevel = isCantrip ? 0 : spell.level;
  const slotCost  = isCantrip ? 0 : (spell.slotCost || 1);
  let slotsRemaining = null;

  if (slotLevel > 0 && slotCost > 0) {
    const slot = state.character.spellSlots?.[slotLevel];
    if (slot && slot.max > 0) {
      if (slot.used + slotCost > slot.max) {
        const avail = slot.max - slot.used;
        setStatus("error", `Plus assez d'emplacements niv. ${slotLevel} (disponibles : ${avail}/${slot.max}, coût : ${slotCost}).`);
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
    description: `${getCharacterName()} lance ${spell.name} (Niveau ${spell.level}, coût ${slotCost} empl. niv. ${slotLevel}).`
  };
  addHistory(`${getCharacterName()} lance ${spell.name} (Niveau ${spell.level}).`, "spell");

  // Notification Discord du sort
  sendSpellWebhook(state.settings, { spell, characterName: getCharacterName(), slotsRemaining });

  const slotMsg = slotsRemaining !== null
    ? ` — emplacements niv. ${slotLevel} restants : ${slotsRemaining}`
    : "";
  setStatus("success", `${spell.name} annoncé sur Discord.${slotMsg}`);
  commit(false);

  // Lance les dés de dégâts si le sort en a
  if (spell.damage?.trim()) {
    const parsed = parseDamageString(spell.damage.trim());
    if (parsed) {
      publishRoll({
        firebaseUrl: state.settings.firebaseUrl,
        roomId     : state.settings.syncRoom,
        roll: {
          type         : "damage",
          characterName: getCharacterName(),
          label        : `${spell.name} (dégâts)`,
          diceMap      : parsed.diceMap,
          flat         : parsed.flat,
          diceColor    : state.settings.diceColor,
        },
      });

      const { rolls, total } = await triggerMultiDiceAnimation(parsed.diceMap, parsed.flat, null, state.settings.diceColor);
      const diceLabel = rolls.map((r) => `${r.value} (d${r.sides})`).join(" + ");
      const flatPart  = parsed.flat !== 0 ? ` ${parsed.flat > 0 ? "+" : ""}${parsed.flat}` : "";
      addHistory(`Dégâts ${spell.name} : ${total} [${diceLabel}${flatPart}]`, "roll");
      await sendDamageWebhook(state.settings, {
        label: `${spell.name} (dégâts)`,
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
          label        : `${spell.name} (dégâts)`,
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

function applyNumericCharacterField(field, value) {
  if (value === "") {
    return;
  }

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

function switchTab(tab) {
  if (tab === state.ui.activeTab) {
    return;
  }

  state.ui.activeTab = tab;
  commit(false);

  const panel = appElement.querySelector(`[data-panel="${tab}"]`);

  if (panel) {
    panel.classList.add("panel-enter");
    panel.addEventListener("animationend", () => panel.classList.remove("panel-enter"), { once: true });
  }
}

async function handleAction(actionButton) {
  const { action } = actionButton.dataset;

  if (action === "switch-tab") {
    switchTab(actionButton.dataset.tab);
    return;
  }

  if (action === "toggle-lock") {
    if (state.sessionLock.isLocked) {
      state.sessionLock.isLocked = false;
      state.sessionLock.baseline = null;
      setStatus("info", "Verrouillage de session désactivé.");
    } else {
      state.sessionLock.isLocked = true;
      state.sessionLock.baseline = createSessionBaseline(state.character);
      setStatus("success", "Session verrouillée : les statistiques de base sont surveillées.");
    }

    commit(false);
    return;
  }

  if (action === "roll-initiative") {
    const dexMod = calculateModifier(state.character.abilities.dexterity);
    await performRoll({ label: "Initiative", bonus: dexMod, note: "DEX" });
    return;
  }

  if (action === "adjust-hp") {
    const previousHp = state.character.currentHp;
    state.character.currentHp = clamp(
      state.character.currentHp + toInt(actionButton.dataset.delta, 0),
      0,
      state.character.hpMax
    );
    setStatus("info", `PV ajustés à ${state.character.currentHp}/${state.character.hpMax}.`);
    queueHpNotify(previousHp);
    commit(true);
    return;
  }

  if (action === "test-discord") {
    try {
      await sendTestWebhook(state.settings, getCharacterName());
      setStatus("success", "🔔 Message de test envoyé sur Discord !");
      commit(false);
    } catch (error) {
      setStatus("error", `Connexion Discord échouée : ${error.message}`);
      commit(false);
    }
    return;
  }

  if (action === "test-sync") {
    if (!state.settings.firebaseUrl || !state.settings.syncRoom) {
      setStatus("error", "Configurez l'URL Firebase et le nom de la session d'abord.");
      return;
    }
    try {
      await publishRoll({
        firebaseUrl: state.settings.firebaseUrl,
        roomId     : state.settings.syncRoom,
        roll: {
          type         : "damage",
          characterName: getCharacterName() || "Test",
          label        : "Test de synchronisation",
          diceMap      : { 6: 2 },
          flat         : 0,
          total        : 7,
        },
      });
      setStatus("success", "🔗 Jet de test publié ! Les autres joueurs dans la même session devraient le voir.");
    } catch (err) {
      setStatus("error", `Échec de la sync : ${err.message}`);
    }
    return;
  }

  if (action === "export-character") {
    const payload = {
      _version: 1,
      _app: "Compagnon D&D",
      _exportedAt: new Date().toISOString(),
      character: state.character
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const charName = (state.character.name || "personnage").replace(/\s+/g, "-").toLowerCase();
    const a = document.createElement("a");
    a.href = url;
    a.download = `${charName}-dnd.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("success", "Fiche exportée avec succès.");
    return;
  }

  if (action === "import-character") {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];

      if (!file) {
        return;
      }

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (data._app !== "Compagnon D&D" || !data.character || typeof data.character !== "object") {
          throw new Error("Ce fichier n'est pas une fiche Compagnon D&D valide.");
        }

        const charName = data.character.name || "Inconnu";
        const charClass = data.character.className || "Classe inconnue";
        const charLevel = data.character.level ?? "?";

        const confirmed = window.confirm(
          `Importer le personnage :\n\n« ${charName} » — ${charClass} niveau ${charLevel}\n\nCela remplacera votre fiche actuelle. Vos réglages Discord seront conservés.`
        );

        if (!confirmed) {
          return;
        }

        // sanitiseState valide et complète toutes les valeurs manquantes
        const sanitised = sanitiseState({ character: data.character });
        state.character = sanitised.character;

        setStatus("success", `Personnage "${charName}" importé avec succès.`);
        commit(true);
      } catch (err) {
        setStatus("error", `Importation échouée : ${err.message}`);
        commit(false);
      }
    });

    fileInput.click();
    return;
  }

  if (action === "remove-attack") {
    state.character.attacks = state.character.attacks.filter(
      (attack) => attack.id !== actionButton.dataset.attackId
    );
    setStatus("info", "Attaque supprimée.");
    commit(false);
    return;
  }

  if (action === "remove-spell") {
    state.character.spells = state.character.spells.filter(
      (spell) => spell.id !== actionButton.dataset.spellId
    );
    setStatus("info", "Sort supprimé du grimoire.");
    commit(false);
    return;
  }

  if (action === "reset-app") {
    const confirmed = window.confirm(
      "Réinitialiser la fiche, les sorts, les attaques et les réglages locaux ?"
    );

    if (!confirmed) {
      return;
    }

    resetState();
    state = loadState();
    setStatus("info", "Application réinitialisée localement.");
    commit(true);
    return;
  }

  if (action === "roll-skill") {
    const skill = skillMap.get(actionButton.dataset.rollKey);

    if (!skill) {
      throw new Error("Cette compétence est introuvable.");
    }

    await performRoll({
      label: skill.label,
      bonus: getSkillBonus(state.character, skill.key)
    });
    return;
  }

  if (action === "roll-save") {
    const abilityKey = actionButton.dataset.rollKey;

    await performRoll({
      label: `Sauvegarde ${getAbilityLabel(abilityKey)}`,
      bonus: getSaveBonus(state.character, abilityKey)
    });
    return;
  }

  if (action === "roll-ability") {
    const abilityKey = actionButton.dataset.rollKey;

    await performRoll({
      label: `Test ${getAbilityLabel(abilityKey)}`,
      bonus: calculateModifier(state.character.abilities[abilityKey])
    });
    return;
  }

  if (action === "roll-attack") {
    const attack = state.character.attacks.find(
      (entry) => entry.id === actionButton.dataset.attackId
    );

    if (!attack) {
      throw new Error("L'attaque demandée est introuvable.");
    }

    await performRoll({
      label: `Toucher — ${attack.name}`,
      bonus: getAttackBonus(state.character, attack),
      note: attack.damage ? `Dégâts : ${attack.damage}` : ""
    });
    return;
  }

  if (action === "roll-damage") {
    const attack = state.character.attacks.find(
      (entry) => entry.id === actionButton.dataset.attackId
    );

    if (!attack) {
      throw new Error("L'attaque demandée est introuvable.");
    }

    const parsed = parseDamageString(attack.damage);

    if (!parsed) {
      setStatus("error", `Dégâts de "${attack.name}" non reconnus. Utilisez un format comme "1d8+3".`);
      return;
    }

    // Signal de début → compteur CSS distant se met en route
    publishRoll({
      firebaseUrl: state.settings.firebaseUrl,
      roomId     : state.settings.syncRoom,
      roll: {
        type         : "damage",
        characterName: getCharacterName(),
        label        : `Dégâts — ${attack.name}`,
        diceMap      : parsed.diceMap,
        flat         : parsed.flat,
        diceColor    : state.settings.diceColor,
      },
    });

    const { rolls, total } = await triggerMultiDiceAnimation(parsed.diceMap, parsed.flat, null, state.settings.diceColor);

    const diceLabel = rolls.map((r) => `${r.value} (d${r.sides})`).join(" + ");
    const flatPart = parsed.flat !== 0 ? ` ${parsed.flat > 0 ? "+" : ""}${parsed.flat}` : "";
    const localSummary = `${getCharacterName()} — Dégâts ${attack.name} : ${total}${rolls.length ? ` [${diceLabel}${flatPart}]` : ""}`;

    addHistory(localSummary, "roll");
    setStatus("info", `Dégâts ${attack.name} → ${total}`);
    await sendDamageWebhook(state.settings, {
      label: attack.name,
      characterName: getCharacterName(),
      diceMap: parsed.diceMap,
      flat: parsed.flat,
      total,
    });

    // Résultat réel → compteur CSS distant se stabilise sur les bonnes valeurs
    publishRoll({
      firebaseUrl: state.settings.firebaseUrl,
      roomId     : state.settings.syncRoom,
      roll: {
        type         : "damage",
        characterName: getCharacterName(),
        label        : `Dégâts — ${attack.name}`,
        diceMap      : parsed.diceMap,
        rolls,
        flat         : parsed.flat,
        total,
        diceColor    : state.settings.diceColor,
      },
    });
    commit(false);
    return;
  }

  if (action === "cast-spell") {
    await castSpell(actionButton.dataset.spellId);
    return;
  }

  if (action === "slot-adjust-max") {
    const level = toInt(actionButton.dataset.slotLevel, 0);
    const delta = toInt(actionButton.dataset.slotDelta, 0);
    if (level < 1 || level > 9) return;
    const slot = state.character.spellSlots[level];
    slot.max = clamp(slot.max + delta, 0, 9);
    slot.used = Math.min(slot.used, slot.max);
    commit(true);
    return;
  }

  if (action === "slot-restore-level") {
    const level = toInt(actionButton.dataset.slotLevel, 0);
    if (level < 1 || level > 9) return;
    state.character.spellSlots[level].used = 0;
    commit(true);
    return;
  }

  if (action === "slot-long-rest") {
    for (let level = 1; level <= 9; level++) {
      state.character.spellSlots[level].used = 0;
    }
    setStatus("success", "Repos long : tous les emplacements de sorts ont été restaurés.");
    commit(true);
    return;
  }

  if (action === "die-qty-inc" || action === "die-qty-dec") {
    const sides = toInt(actionButton.dataset.dieSides, 0);

    if (!sides) {
      return;
    }

    const qtyEl = appElement.querySelector(`[data-die-qty="${sides}"]`);

    if (!qtyEl) {
      return;
    }

    const current = toInt(qtyEl.textContent, 0);
    qtyEl.textContent = String(Math.max(0, Math.min(9, action === "die-qty-inc" ? current + 1 : current - 1)));
    updateFreeDiceNotation();
    return;
  }

  if (action === "dice-builder-reset") {
    FREE_DICE.forEach((sides) => {
      const el = appElement.querySelector(`[data-die-qty="${sides}"]`);

      if (el) {
        el.textContent = "0";
      }
    });

    updateFreeDiceNotation();
    return;
  }

  if (action === "dice-builder-roll") {
    const diceMap = readFreeDiceMap();

    if (Object.keys(diceMap).length === 0) {
      return;
    }

    publishRoll({
      firebaseUrl: state.settings.firebaseUrl,
      roomId     : state.settings.syncRoom,
      roll: {
        type         : "free",
        characterName: getCharacterName(),
        label        : Object.entries(diceMap).filter(([, q]) => q > 0).map(([s, q]) => `${q}d${s}`).join("+"),
        diceMap,
        flat         : 0,
        diceColor    : state.settings.diceColor,
      },
    });

    const { rolls, total, notation } = await triggerMultiDiceAnimation(diceMap, 0, null, state.settings.diceColor);

    const individualLabel = rolls.map((r) => `${r.value} (d${r.sides})`).join(", ");
    const localSummary = `${getCharacterName()} lance ${notation} : ${total} [${individualLabel}]`;

    state.ui.lastRoll = {
      kind: "roll",
      label: notation,
      total,
      bonus: 0,
      baseRoll: total,
      rolls: rolls.map((r) => r.value),
      mode: "normal",
      isCritical: false,
      isFumble: false,
      note: ""
    };

    addHistory(localSummary, "roll");
    setStatus("info", `${notation} → ${total}`);
    sendFreeDiceWebhook(state.settings, { characterName: getCharacterName(), diceMap, rolls, total, notation });

    publishRoll({
      firebaseUrl: state.settings.firebaseUrl,
      roomId     : state.settings.syncRoom,
      roll: {
        type         : "free",
        characterName: getCharacterName(),
        label        : notation,
        diceMap,
        rolls,
        flat         : 0,
        total,
        diceColor    : state.settings.diceColor,
      },
    });

    commit(false);
    return;
  }

  if (action === "roll-free-die") {
    const sides = toInt(actionButton.dataset.dieSides, 20);
    const label = `d${sides} libre`;
    const diceMap = { [sides]: 1 };

    publishRoll({
      firebaseUrl: state.settings.firebaseUrl,
      roomId     : state.settings.syncRoom,
      roll: {
        type         : "free",
        characterName: getCharacterName(),
        label,
        diceMap,
        flat         : 0,
        diceColor    : state.settings.diceColor,
      },
    });

    const { baseRoll } = await triggerDiceAnimation(sides, "normal", 0, label, state.settings.diceColor);

    state.ui.lastRoll = {
      kind: "roll",
      label,
      total: baseRoll,
      bonus: 0,
      baseRoll,
      rolls: [baseRoll],
      mode: "normal",
      isCritical: sides === 20 && baseRoll === 20,
      isFumble: sides === 20 && baseRoll === 1,
      note: ""
    };

    const localSummary = `${getCharacterName()} lance ${label} : ${baseRoll}`;
    addHistory(localSummary, "roll");
    setStatus("info", `${localSummary}.`);
    sendFreeDiceWebhook(state.settings, {
      characterName: getCharacterName(),
      diceMap,
      rolls: [{ sides, value: baseRoll }],
      total: baseRoll,
      notation: label
    });

    publishRoll({
      firebaseUrl: state.settings.firebaseUrl,
      roomId     : state.settings.syncRoom,
      roll: {
        type         : "free",
        characterName: getCharacterName(),
        label,
        diceMap,
        rolls        : [{ sides, value: baseRoll }],
        flat         : 0,
        total        : baseRoll,
        diceColor    : state.settings.diceColor,
      },
    });

    commit(false);
  }
}

function handleInput(event) {
  const target = event.target;

  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
    return;
  }

  if (target.matches("[data-character-field]")) {
    const field = target.dataset.characterField;

    if (field === "name" || field === "className") {
      state.character[field] = target.value;
      setStatus("info", "Fiche mise à jour et sauvegardée localement.");
      commit(true);
      return;
    }

    if (field === "currentHp") {
      const previousHp = state.character.currentHp;
      applyNumericCharacterField(field, target.value);
      queueHpNotify(previousHp);
    } else {
      applyNumericCharacterField(field, target.value);
    }

    setStatus("info", "Valeur du personnage mise à jour.");
    commit(true);
    return;
  }

  if (target.matches("[data-ability-input]")) {
    if (target.value === "") {
      return;
    }

    const key = target.dataset.abilityInput;
    state.character.abilities[key] = clamp(
      toInt(target.value, state.character.abilities[key]),
      1,
      30
    );

    // Mise à jour visuelle partielle : hints + mini-cards sans toucher aux inputs
    syncAbilityHints();
    renderAbilityDashboard();
    renderSkillDashboard();
    renderSaveDashboard();
    queueSave();
    return;
  }

  if (target.matches("[data-current-hp-input]")) {
    if (target.value === "") {
      return;
    }

    const previousHp = state.character.currentHp;
    state.character.currentHp = clamp(
      toInt(target.value, state.character.currentHp),
      0,
      state.character.hpMax
    );
    setStatus("info", "PV actuels mis à jour.");
    queueHpNotify(previousHp);
    commit(true);
    return;
  }

  if (target.matches("[data-setting-field]")) {
    state.settings[target.dataset.settingField] = target.value.trim();
    setStatus("info", "Paramètre sauvegardé localement.");
    commit(true);
    // Reconnecte Firebase si l'URL ou la room change
    if (target.dataset.settingField === "firebaseUrl" || target.dataset.settingField === "syncRoom") {
      reconnectSync();
    }
    return;
  }

  // Synchronisation automatique du coût d'emplacement avec le niveau du sort
  if (target.matches("#spell-level")) {
    const levelVal = clamp(toInt(target.value, 0), 0, 9);
    const slotCostInput = appElement.querySelector("#spell-slot-cost");
    if (slotCostInput) {
      slotCostInput.value = String(levelVal);
    }
  }
}

function handleChange(event) {
  const target = event.target;

  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  if (target.matches("[data-skill-checkbox]")) {
    const key = target.dataset.skillCheckbox;

    state.character.skillProficiencies = target.checked
      ? [...state.character.skillProficiencies, key]
      : state.character.skillProficiencies.filter((skillKey) => skillKey !== key);

    state.character.skillProficiencies.sort();
    setStatus("info", "Maîtrises de compétences mises à jour.");
    commit(true);
    return;
  }

  if (target.matches("[data-save-checkbox]")) {
    const key = target.dataset.saveCheckbox;

    state.character.saveProficiencies = target.checked
      ? [...state.character.saveProficiencies, key]
      : state.character.saveProficiencies.filter((abilityKey) => abilityKey !== key);

    state.character.saveProficiencies.sort();
    setStatus("info", "Maîtrises de sauvegardes mises à jour.");
    commit(true);
    return;
  }

  if (target.matches("[data-roll-mode-control]")) {
    state.ui.rollMode = target.value;
    setStatus("info", `Mode de jet : ${getModeLabel(state.ui.rollMode)}.`);
    commit(true);
    return;
  }

  if (target.matches("[data-ability-input]")) {
    const key = target.dataset.abilityInput;
    const clamped = clamp(toInt(target.value, state.character.abilities[key]), 1, 30);

    state.character.abilities[key] = clamped;
    target.value = clamped;

    setStatus("info", "Caractéristique mise à jour.");
    commit(true);
  }
}

function handleSubmit(event) {
  const form = event.target;

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  if (form.dataset.form === "attack") {
    event.preventDefault();
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();

    if (!name) {
      setStatus("error", "Le nom de l'attaque est obligatoire.");
      commit(false);
      return;
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
    setStatus("success", "Attaque ajoutée à la fiche.");
    commit(true);
    return;
  }

  if (form.dataset.form === "spell") {
    event.preventDefault();
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();

    if (!name) {
      setStatus("error", "Le nom du sort est obligatoire.");
      commit(false);
      return;
    }

    state.character.spells = [
      ...state.character.spells,
      {
        id: uniqueId("spell"),
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
    setStatus("success", "Sort ajouté au grimoire.");
    commit(true);
  }
}

function bindEvents() {
  appElement.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");

    if (!actionButton) {
      return;
    }

    void handleAction(actionButton).catch((error) => {
      setStatus("error", error.message);
      commit(false);
    });
  });

  appElement.addEventListener("input", handleInput);
  appElement.addEventListener("change", handleChange);
  appElement.addEventListener("submit", handleSubmit);
}

function startIntegrityWatch() {
  // Anti-triche temporairement désactivé
}

// ─── Firebase Sync ────────────────────────────────────────────────────────────

let _remoteBannerTimer = null;

function showRemoteBanner(text) {
  const banner = document.getElementById("remote-roll-banner");
  const textEl = document.getElementById("remote-roll-banner-text");
  if (!banner || !textEl) return;

  textEl.textContent = text;
  banner.hidden = false;
  banner.classList.add("remote-banner-in");

  window.clearTimeout(_remoteBannerTimer);
  _remoteBannerTimer = window.setTimeout(() => {
    banner.hidden = true;
    banner.classList.remove("remote-banner-in");
  }, 4000);
}

// ─── Popup dés distants (non-bloquante) ───────────────────────────────────────
// Map playerKey → { el, timer, interval, diceList }
const _remotePopups = new Map();

function _rpopStack() {
  let s = document.getElementById("rpop-stack");
  if (!s) { s = document.createElement("div"); s.id = "rpop-stack"; document.body.appendChild(s); }
  return s;
}

function _rpopDismissAfter(playerKey, ms) {
  const entry = _remotePopups.get(playerKey);
  if (!entry) return;
  window.clearTimeout(entry.timer);
  entry.timer = window.setTimeout(() => {
    const e = _remotePopups.get(playerKey);
    if (e?.el) {
      e.el.classList.add("rpop--exit");
      window.setTimeout(() => { e.el?.remove(); _remotePopups.delete(playerKey); }, 400);
    }
  }, ms);
}

// ─── Formes SVG des dés (viewBox 0 0 100 100) ────────────────────────────────
const _DIE_SHAPES = {
  4:  { e: "polygon", a: 'points="50,5 93,88 7,88"',                          ny: 61, ly: 79 },
  6:  { e: "rect",    a: 'x="8" y="8" width="84" height="84" rx="10"',         ny: 50, ly: 72 },
  8:  { e: "polygon", a: 'points="50,5 93,50 50,95 7,50"',                     ny: 50, ly: 73 },
  10: { e: "polygon", a: 'points="50,3 90,40 78,93 22,93 10,40"',              ny: 54, ly: 77 },
  12: { e: "polygon", a: 'points="50,5 93,63 76,87 24,87 7,63"',               ny: 52, ly: 76 },
  20: { e: "polygon", a: 'points="50,5 89,27 89,73 50,95 11,73 11,27"',        ny: 50, ly: 76 },
};

function _buildDieSVG(sides) {
  const s = _DIE_SHAPES[sides] || _DIE_SHAPES[6];
  const lbl = sides > 9 ? 11 : 13;
  return `<div class="rpop-slot" data-sides="${sides}">
    <svg class="rpop-die-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <${s.e} class="rpop-die-shape" ${s.a}/>
      <text class="rpop-die-val" x="50" y="${s.ny}" font-size="30" dominant-baseline="central" text-anchor="middle">?</text>
      <text class="rpop-die-lbl" x="50" y="${s.ly}" font-size="${lbl}" dominant-baseline="central" text-anchor="middle">d${sides}</text>
    </svg>
  </div>`;
}

function _buildResultContent(roll, isCritical = false, isFumble = false) {
  const rolls = roll.rolls ?? [];
  const flat  = roll.flat ?? 0;
  const chips = rolls.map((r) => `
    <div class="rpop-chip">
      <span class="rpop-chip-value">${r.value}</span>
      <span class="rpop-chip-sides">d${r.sides}</span>
    </div>`).join("");
  const flatChip = flat !== 0
    ? `<div class="rpop-chip rpop-chip--flat"><span class="rpop-chip-value">${flat > 0 ? "+" : ""}${flat}</span></div>`
    : "";
  const badge = isCritical
    ? `<div class="rpop-special rpop-special--crit"><span class="rpop-special-stars">✦</span> Critique Naturel <span class="rpop-special-stars">✦</span></div>`
    : isFumble
    ? `<div class="rpop-special rpop-special--fumble">💀 Échec Critique 💀</div>`
    : "";
  const totalClass = isCritical ? " rpop-total--crit" : isFumble ? " rpop-total--fumble" : "";
  return `
    <div class="rpop-meta">
      <span class="rpop-name">${roll.characterName || "Aventurier"}</span>
      <span class="rpop-label">${roll.label || "Jet"}</span>
    </div>
    ${badge}
    <div class="rpop-chips">${chips}${flatChip}</div>
    <div class="rpop-total${totalClass}">${roll.total ?? "?"}</div>`;
}

function handleRemoteRoll(roll) {
  const color   = roll.diceColor || "#7c3aed";
  const name    = roll.characterName || "Aventurier";
  const label   = roll.label || "Jet de dés";
  const diceMap = roll.diceMap || {};
  const pkey    = name; // une popup par joueur identifié par son nom

  if (!roll.rolls) {
    // ── Phase 1 : création/mise à jour du slot machine SVG ────────────────────
    showRemoteBanner(`🎲 ${name} — ${label}…`);

    // Nettoyer l'entrée existante pour ce joueur
    const existing = _remotePopups.get(pkey);
    if (existing) {
      window.clearTimeout(existing.timer);
      clearInterval(existing.interval);
      existing.el?.remove();
    }

    const diceList = Object.entries(diceMap)
      .filter(([, q]) => q > 0)
      .sort(([a], [b]) => Number(b) - Number(a))
      .flatMap(([s, q]) => Array.from({ length: q }, () => Number(s)));

    const flat = roll.flat ?? 0;
    const flatHTML = flat !== 0
      ? `<div class="rpop-slot rpop-slot--flat">
           <span class="rpop-slot-flat">${flat > 0 ? "+" : ""}${flat}</span>
         </div>`
      : "";

    const popup = document.createElement("div");
    popup.className = "rpop";
    popup.style.setProperty("--rpop-color", color);
    popup.innerHTML = `
      <div class="rpop-meta">
        <span class="rpop-name">${name}</span>
        <span class="rpop-label">${label}</span>
      </div>
      <div class="rpop-slots">${diceList.map(s => _buildDieSVG(s)).join("")}${flatHTML}</div>`;
    _rpopStack().appendChild(popup);

    let interval = null;
    if (diceList.length > 0) {
      const valEls = [...popup.querySelectorAll(".rpop-die-val")];
      interval = setInterval(() => {
        valEls.forEach((el, i) => {
          const v = Math.floor(Math.random() * diceList[i]) + 1;
          el.textContent = v;
          el.setAttribute("font-size", v >= 10 ? "24" : "30");
        });
      }, 75);
    }

    _remotePopups.set(pkey, { el: popup, timer: null, interval, diceList });

  } else {
    // ── Phase 2 : atterrissage des dés (SVG conservés) + critique/fumble ──────
    showRemoteBanner(`🎲 ${name} — ${label} → ${roll.total ?? "?"}`);

    const entry = _remotePopups.get(pkey);
    if (entry) { clearInterval(entry.interval); entry.interval = null; }

    const flat = roll.flat ?? 0;
    const baseRoll = (roll.total ?? 0) - flat;
    const isCritical = roll.type === "d20" && baseRoll === 20;
    const isFumble   = roll.type === "d20" && baseRoll === 1;
    const finalColor = isCritical ? "#fbbf24" : isFumble ? "#ef4444" : color;

    const overrideRolls = roll.rolls.map(r => ({ sides: Number(r.sides), value: Number(r.value) }));

    const popup = entry?.el ?? null;
    const valEls = popup ? [...popup.querySelectorAll(".rpop-die-val")] : [];

    const _finalizePopup = (p) => {
      p.style.setProperty("--rpop-color", finalColor);
      if (isCritical) p.classList.add("rpop--critical");
      else if (isFumble) p.classList.add("rpop--fumble");

      if (isCritical || isFumble) {
        const badge = document.createElement("div");
        badge.className = `rpop-special rpop-special--${isCritical ? "crit" : "fumble"}`;
        badge.innerHTML = isCritical
          ? `<span class="rpop-special-stars">✦</span> Critique Naturel <span class="rpop-special-stars">✦</span>`
          : `💀 Échec Critique 💀`;
        p.querySelector(".rpop-slots")?.before(badge);
      }

      // Délai supplémentaire pour révéler le total (effet dramatique sur critique)
      const totalDelay = isCritical || isFumble ? 500 : 0;
      window.setTimeout(() => {
        const totalEl = document.createElement("div");
        totalEl.className = `rpop-total${isCritical ? " rpop-total--crit" : isFumble ? " rpop-total--fumble" : ""}`;
        totalEl.textContent = roll.total ?? "?";
        p.appendChild(totalEl);
        _rpopDismissAfter(pkey, isCritical || isFumble ? 7000 : 5000);
      }, totalDelay);
    };

    if (popup && valEls.length > 0) {
      // Atterrissage décalé des dés
      overrideRolls.forEach((r, i) => {
        window.setTimeout(() => {
          const el = valEls[i];
          if (el) {
            el.textContent = r.value;
            el.setAttribute("font-size", r.value >= 10 ? "24" : "30");
            el.closest(".rpop-slot")?.classList.add("rpop-slot--locked");
          }
          if (i === overrideRolls.length - 1) {
            window.setTimeout(() => _finalizePopup(popup), 380);
          }
        }, i * 160);
      });

    } else if (popup) {
      // Pas de slots SVG (0 dés) → finalisation directe
      _finalizePopup(popup);

    } else {
      // Aucune popup existante → créer directement avec résultat
      const p = document.createElement("div");
      p.className = `rpop${isCritical ? " rpop--critical" : isFumble ? " rpop--fumble" : ""}`;
      p.style.setProperty("--rpop-color", finalColor);
      p.innerHTML = _buildResultContent(roll, isCritical, isFumble);
      _rpopStack().appendChild(p);
      _remotePopups.set(pkey, { el: p, timer: null, interval: null, diceList: [] });
      _rpopDismissAfter(pkey, isCritical || isFumble ? 7000 : 5000);
    }
  }
}

function reconnectSync() {
  disconnectSync();
  connectSync({
    firebaseUrl: state.settings.firebaseUrl,
    roomId     : state.settings.syncRoom,
    onRoll     : handleRemoteRoll,
  });
}

function applyWebhookFromUrl() {
  const params = new URLSearchParams(window.location.search);
  let anyChanged = false;
  const messages = [];

  // Webhook Discord
  const wh = params.get("wh");
  if (wh) {
    const decoded = decodeURIComponent(wh);
    if (decoded.startsWith("https://discord.com/api/webhooks/")) {
      state.settings.webhookUrl = decoded;
      messages.push("Webhook Discord");
      anyChanged = true;
    }
    params.delete("wh");
  }

  // URL Firebase Realtime Database
  const fb = params.get("fb");
  if (fb) {
    state.settings.firebaseUrl = decodeURIComponent(fb);
    messages.push("Firebase");
    anyChanged = true;
    params.delete("fb");
  }

  // Nom de la session / room
  const room = params.get("room");
  if (room) {
    state.settings.syncRoom = decodeURIComponent(room);
    messages.push(`Salon "${room}"`);
    anyChanged = true;
    params.delete("room");
  }

  if (anyChanged) {
    saveState(state);
    const clean = params.toString()
      ? `${window.location.pathname}?${params}`
      : window.location.pathname;
    history.replaceState(null, "", clean);
    // Afficher le statut après le premier rendu (render est appelé après)
    window.setTimeout(() => {
      setStatus("success", `✅ Configuré depuis l'URL : ${messages.join(", ")}`);
    }, 200);
  }
}

function initialise() {
  appElement.innerHTML = getAppTemplate();
  applyWebhookFromUrl();
  bindEvents();
  render(true);
  startIntegrityWatch();
  reconnectSync();
  preloadDiceBox();
}

window.addEventListener("beforeunload", () => {
  window.clearTimeout(saveTimerId);
  window.clearTimeout(hpNotifyTimerId);
  saveState(state);
});

initialise();
