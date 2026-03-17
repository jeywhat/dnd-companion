import { ABILITIES } from "../data/constants.js";
import {
  buildRollModeTemplate,
  buildFreeDiceBuilderTemplate,
  buildSkillChecklistTemplate,
  buildSaveChecklistTemplate
} from "../features/rolls/templates.js";

export function getAppTemplate() {
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
                  ${ABILITIES.map(
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
                  ).join("")}
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
