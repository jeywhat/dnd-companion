import { state } from "../../app/store.js";
import { calculateModifier } from "../../core/character.js";
import { t } from "../../shared/i18n.js";
import { escapeHtml } from "../../shared/dom.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSortedInitiatives() {
  return Object.values(state.combat.initiatives)
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
}

function hpBarClass(current, max) {
  const pct = max > 0 ? (current / max) * 100 : 0;
  if (pct <= 25) return "party-hp-bar--critical";
  if (pct <= 60) return "party-hp-bar--injured";
  return "party-hp-bar--full";
}

// ─── Fixed right panel (visible to all in-room when combat is active) ─────────

function renderCombatTrackerPanel() {
  const panel = document.querySelector("[data-combat-tracker-panel]");
  if (!panel) return;

  const inRoom = !!(state.room?.role && state.room?.code);
  const active = state.combat.state !== "idle";

  const isGm      = state.room.role === "gm";
  // Joueurs : respectent panelVisible ; le MJ voit toujours le panneau
  const shouldShow = isGm || state.combat.panelVisible;

  panel.hidden = !(inRoom && active && shouldShow);
  if (!inRoom || !active || !shouldShow) return;

  const sorted     = getSortedInitiatives();
  const { currentTurn, round } = state.combat;

  const itemsHtml = sorted.map((m, i) => {
    const isCurrent = state.combat.state === "active" && i === currentTurn;
    const isMonster = m.type === "monster";
    const showHp    = !isMonster || isGm;
    const hpPct     = m.hpMax > 0 ? Math.round((m.currentHp / m.hpMax) * 100) : 0;

    const avatarHtml = isMonster
      ? `<div class="ct-avatar ct-avatar--monster">🐉</div>`
      : (m.avatar
          ? `<img class="ct-avatar" src="${escapeHtml(m.avatar)}" alt="${escapeHtml(m.name || "")}" loading="lazy">`
          : `<div class="ct-avatar ct-avatar--initial" style="--pcolor:${escapeHtml(m.color || "#8b5cf6")}">${escapeHtml((m.name || "?").charAt(0).toUpperCase())}</div>`);

    const hpHtml = showHp
      ? `<div class="party-hp-track" style="height:3px;margin-top:2px">
           <div class="party-hp-bar ${hpBarClass(m.currentHp, m.hpMax)}" style="width:${hpPct}%"></div>
         </div>`
      : "";

    return `<li class="ct-entry${isCurrent ? " ct-entry--current" : ""}">
      ${isCurrent ? '<span class="ct-turn-arrow">▶</span>' : '<span class="ct-turn-spacer"></span>'}
      ${avatarHtml}
      <div class="ct-info">
        <span class="ct-name">${escapeHtml(m.name || "?")}</span>
        ${hpHtml}
      </div>
      <span class="ct-initiative">${m.initiative ?? "?"}</span>
    </li>`;
  }).join("");

  panel.innerHTML = `
    <div class="ct-header">
      <span class="ct-title">${t("combatTracker.panel.title")}</span>
      ${state.combat.state === "active"
        ? `<span class="ct-round">${t("combatTracker.panel.round", { n: round })}</span>`
        : ""}
    </div>
    <ul class="ct-list">
      ${sorted.length ? itemsHtml : `<li class="ct-empty">${t("combatTracker.panel.noInitiative")}</li>`}
    </ul>`;
}

// ─── Player initiative modal ──────────────────────────────────────────────────

function renderInitiativeModal() {
  const modal = document.querySelector("[data-initiative-modal]");
  if (!modal) return;

  // Auto-clear roll state when no longer in rolling phase
  if (state.combat.state !== "rolling") {
    state.combat._modalRoll = null;
  }

  const myName    = (state.character.name || "").trim();
  const shouldShow =
    state.combat.state === "rolling" &&
    state.room.role    === "player"  &&
    !!myName &&
    !state.combat.initiatives[myName];

  modal.hidden = !shouldShow;
  if (!shouldShow) { modal.innerHTML = ""; return; }

  const dexMod  = calculateModifier(state.character.abilities?.dexterity ?? 10);
  const modStr  = dexMod >= 0 ? `+${dexMod}` : `${dexMod}`;
  const rolled  = state.combat._modalRoll;

  if (rolled === null) {
    modal.innerHTML = `
      <div class="initiative-modal-backdrop">
        <div class="initiative-modal-card" role="dialog" aria-modal="true" aria-labelledby="init-modal-title">
          <h2 id="init-modal-title">${t("initiative.modal.title")}</h2>
          <p class="muted">${t("initiative.modal.desc")}</p>
          <p class="initiative-modal-dex">${t("initiative.modal.dexMod", { mod: modStr })}</p>
          <button type="button" class="primary-action" data-action="roll-initiative-dice">
            ${t("initiative.modal.rollBtn")}
          </button>
        </div>
      </div>`;
  } else {
    const { d20, total } = rolled;
    modal.innerHTML = `
      <div class="initiative-modal-backdrop">
        <div class="initiative-modal-card" role="dialog" aria-modal="true" aria-labelledby="init-modal-title">
          <h2 id="init-modal-title">${t("initiative.modal.title")}</h2>
          <div class="initiative-modal-result">${total}</div>
          <p class="initiative-modal-breakdown">${t("initiative.modal.result", { d20, mod: modStr, total })}</p>
          <button type="button" class="primary-action" data-action="submit-initiative" data-total="${total}">
            ${t("initiative.modal.confirmBtn")}
          </button>
        </div>
      </div>`;
  }
}

// ─── GM combat tab ────────────────────────────────────────────────────────────

function renderCombatGmTab() {
  const panel = document.querySelector("[data-panel='combat-gm']");
  if (!panel) return;

  const isGm   = state.room.role === "gm";
  const inRoom = !!(state.room?.role && state.room?.code);

  // Control nav button and grid column count
  const gmNavBtn = document.querySelector('[data-tab="combat-gm"]');
  if (gmNavBtn) {
    gmNavBtn.style.display = isGm ? "" : "none";
    const nav = document.querySelector(".bottom-nav");
    if (nav) nav.dataset.gmActive = isGm ? "1" : "";
  }

  if (!isGm) {
    panel.hidden = true;
    // Redirect if somehow on this tab without GM role
    return;
  }

  if (state.ui.activeTab !== "combat-gm") {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const { state: combatState, currentTurn, round } = state.combat;
  const sorted  = getSortedInitiatives();
  const players = Object.values(state.party);

  // ── Add monster form (shown during rolling & active) ──────────────────────
  const monstersHtml = sorted
    .filter(m => m.type === "monster")
    .map(m => `
      <li class="ct-gm-monster-item">
        <span class="ct-gm-monster-icon">🐉</span>
        <span class="ct-gm-monster-name">${escapeHtml(m.name)}</span>
        <span class="ct-gm-monster-init">Init: ${m.initiative}</span>
        <span class="ct-gm-monster-hp">${m.currentHp}/${m.hpMax} PV</span>
        <button type="button" class="room-kick-btn"
          data-action="remove-monster" data-name="${escapeHtml(m.name)}"
          title="${t("combatTracker.removeMonster")}">✕</button>
      </li>`).join("");

  const addMonsterHtml = combatState !== "idle" ? `
    <article class="card" style="margin-top:0.75rem">
      <div class="section-heading"><h3>${t("combatTracker.addMonster")}</h3></div>
      <div class="ct-monster-form">
        <input id="monster-name-input" type="text" class="field-input"
          placeholder="${t("combatTracker.monsterNamePlaceholder")}"
          autocomplete="off" maxlength="30" style="flex:1;min-width:0">
        <input id="monster-init-input" type="number" class="field-input"
          placeholder="${t("combatTracker.monsterInitiative")}" min="-10" max="30"
          style="width:4.5rem">
        <input id="monster-hp-input" type="number" class="field-input"
          placeholder="${t("combatTracker.monsterHp")}" min="1" max="999"
          style="width:4.5rem">
        <button type="button" class="primary-action" data-action="add-monster">
          ${t("combatTracker.addMonsterBtn")}
        </button>
      </div>
      ${monstersHtml ? `<ul class="ct-gm-monster-list">${monstersHtml}</ul>` : ""}
    </article>` : "";

  // ── States ────────────────────────────────────────────────────────────────
  let mainHtml = "";

  if (combatState === "idle") {
    mainHtml = `
      <article class="card">
        <div class="section-heading">
          <div>
            <h2>${t("combatTracker.idle.title")}</h2>
            <p class="muted">${t("combatTracker.idle.desc")}</p>
          </div>
        </div>
        <button type="button" class="primary-action" data-action="trigger-initiative"
          ${!inRoom ? "disabled" : ""}>
          ${t("combatTracker.trigger")}
        </button>
      </article>`;

  } else if (combatState === "rolling") {
    const rolledCount  = sorted.filter(m => m.type === "player").length;
    const totalPlayers = players.length;

    const playerStatusHtml = players.map(p => {
      const hasRolled = !!(state.combat.initiatives[(p.name || "").trim()]);
      const init = state.combat.initiatives[(p.name || "").trim()]?.initiative;
      return `<li class="ct-gm-player-status">
        <span>${hasRolled ? "✅" : "⏳"}</span>
        <span>${escapeHtml(p.name || t("app.defaultCharName"))}</span>
        ${hasRolled ? `<span class="ct-gm-player-init">${init}</span>` : ""}
      </li>`;
    }).join("") || `<li class="ct-empty muted">${t("room.noPlayers")}</li>`;

    mainHtml = `
      <article class="card">
        <div class="section-heading">
          <div>
            <h2>${t("combatTracker.rolling.title")}</h2>
            <p class="muted">${t("combatTracker.rolled", { count: rolledCount, total: totalPlayers })}</p>
          </div>
        </div>
        <ul class="ct-gm-player-list">${playerStatusHtml}</ul>
        <button type="button" class="primary-action" data-action="start-combat" style="margin-top:1rem">
          ${t("combatTracker.startCombat")}
        </button>
      </article>`;

  } else { // active
    const timelineHtml = sorted.map((m, i) => {
      const isCurrent = i === currentTurn;
      return `<li class="ct-gm-timeline-item${isCurrent ? " ct-gm-timeline-item--current" : ""}">
        <span class="ct-gm-timeline-arrow">${isCurrent ? "▶" : "·"}</span>
        <span class="ct-gm-timeline-name">${escapeHtml(m.name)}</span>
        <span class="ct-gm-timeline-init">${m.initiative}</span>
        <span class="ct-gm-timeline-hp">${m.currentHp ?? "?"}/${m.hpMax ?? "?"}</span>
        ${m.type === "monster"
          ? `<button type="button" class="room-kick-btn"
               data-action="remove-monster" data-name="${escapeHtml(m.name)}"
               title="${t("combatTracker.removeMonster")}">✕</button>`
          : `<span></span>`}
      </li>`;
    }).join("");

    mainHtml = `
      <article class="card">
        <div class="section-heading">
          <div>
            <h2>${t("combatTracker.round", { n: round })}</h2>
            <p class="muted">${t("combatTracker.turn", { name: sorted[currentTurn]?.name ?? "?" })}</p>
          </div>
        </div>
        <ul class="ct-gm-timeline">${timelineHtml || '<li class="ct-empty">—</li>'}</ul>
        <div class="quick-actions" style="margin-top:0.75rem">
          <button type="button" class="primary-action" data-action="next-turn">
            ${t("combatTracker.nextTurn")}
          </button>
          <button type="button" class="danger-button" data-action="end-combat">
            ${t("combatTracker.endCombat")}
          </button>
        </div>
      </article>`;
  }

  panel.innerHTML = `
    <section class="panel-content" aria-label="${t("combatTracker.section.ariaLabel")}">
      ${mainHtml}
      ${addMonsterHtml}
      ${combatState !== "idle" ? `
      <article class="card" style="margin-top:0.75rem">
        <div class="section-heading">
          <h3 style="font-size:0.85rem">${t("combatTracker.panelVisibility")}</h3>
        </div>
        <button type="button"
          class="${state.combat.panelVisible ? "primary-action" : "danger-button"}"
          data-action="toggle-panel-visibility"
          style="width:100%;margin-top:0.4rem">
          ${state.combat.panelVisible ? t("combatTracker.hidePanel") : t("combatTracker.showPanel")}
        </button>
      </article>` : ""}
    </section>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function renderCombatTracker() {
  renderInitiativeModal();
  renderCombatTrackerPanel();
  renderCombatGmTab();
}
