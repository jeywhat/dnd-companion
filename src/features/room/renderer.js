import { state } from "../../app/store.js";
import { PLAYER_ID } from "../../adapters/firebase-sync.js";
import { t } from "../../shared/i18n.js";
import { escapeHtml } from "../../shared/dom.js";

const ONLINE_THRESHOLD_MS = 90_000;

function hpBarClass(current, max) {
  const pct = max > 0 ? (current / max) * 100 : 0;
  if (pct <= 25) return "party-hp-bar--critical";
  if (pct <= 60) return "party-hp-bar--injured";
  return "party-hp-bar--full";
}

function getPresence(member, isSelf) {
  if (isSelf) return "online";
  if (!member.updatedAt) return "unknown";
  return (Date.now() - member.updatedAt) < ONLINE_THRESHOLD_MS ? "online" : "offline";
}

function presenceDot(presence, isSelf) {
  if (isSelf) return "";
  const label = presence === "online" ? t("party.online") : t("party.offline");
  return `<span class="presence-dot presence-dot--${presence}" title="${escapeHtml(label)}"></span>`;
}

function buildGmCard(member, isSelf) {
  const name     = member.name || t("app.defaultCharName");
  const color    = escapeHtml(member.diceColor || "#fbbf24");
  const initial  = escapeHtml(name.charAt(0).toUpperCase());
  const presence = getPresence(member, isSelf);
  const offline  = !isSelf && presence === "offline";

  const avatarHtml = member.avatar
    ? `<img class="room-gm-avatar" src="${escapeHtml(member.avatar)}" alt="${escapeHtml(name)}" loading="lazy">`
    : `<div class="room-gm-avatar room-gm-avatar--initial" style="--pcolor:${color}">${initial}</div>`;

  const selfBadge = isSelf
    ? `<span class="room-badge room-badge--you">${t("room.active.youBadge")}</span>`
    : "";

  return `<div class="room-gm-card${offline ? " room-gm-card--offline" : ""}">
    <div class="room-gm-crown">👑</div>
    ${avatarHtml}
    <div class="room-gm-info">
      <span class="room-gm-role">${t("room.role.gm")}</span>
      <div style="display:flex;align-items:center;gap:0.35rem">
        <span class="room-gm-name">${escapeHtml(name)} ${selfBadge}</span>
        ${presenceDot(presence, isSelf)}
      </div>
    </div>
  </div>`;
}

function buildPlayerCard(member, { isSelf, canKick }) {
  const presence = getPresence(member, isSelf);
  const offline  = !isSelf && presence === "offline";
  const hpPct   = member.hpMax > 0 ? Math.round((member.currentHp / member.hpMax) * 100) : 0;
  const name    = member.name      || t("app.defaultCharName");
  const cls     = member.className || t("app.defaultClass");
  const color   = escapeHtml(member.diceColor || "#8b5cf6");
  const initial = escapeHtml(name.charAt(0).toUpperCase());

  const avatarHtml = member.avatar
    ? `<img class="room-member-avatar" src="${escapeHtml(member.avatar)}" alt="${escapeHtml(name)}" loading="lazy">`
    : `<div class="room-member-avatar room-member-avatar--initial" style="--pcolor:${color}">${initial}</div>`;

  const selfBadge = isSelf
    ? `<span class="room-badge room-badge--you">${t("room.active.youBadge")}</span>`
    : "";

  const actionBtns = canKick
    ? `<div class="room-member-actions">
         <button type="button" class="room-kick-btn" data-action="kick-member"
           data-sid="${escapeHtml(member.sid || "")}"
           data-name="${escapeHtml(name)}"
           title="${t("room.kick")}">👢</button>
         <button type="button" class="room-kick-btn room-ban-btn" data-action="ban-member"
           data-sid="${escapeHtml(member.sid || "")}"
           data-name="${escapeHtml(name)}"
           title="${t("room.ban")}">🔨</button>
       </div>`
    : "";

  return `<li class="room-member-card${offline ? " room-member-card--offline" : ""}">
    ${avatarHtml}
    <div class="room-member-info">
      <div class="room-member-name-row">
        <span class="room-member-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        ${selfBadge}
        ${presenceDot(presence, isSelf)}
      </div>
      <span class="room-member-class">${escapeHtml(cls)} · ${t("character.level.label")} ${member.level}</span>
      <div class="party-hp-track">
        <div class="party-hp-bar ${hpBarClass(member.currentHp, member.hpMax)}"
             style="width:${hpPct}%"></div>
      </div>
      <span class="party-hp-label">${member.currentHp}/${member.hpMax}</span>
    </div>
    ${actionBtns}
  </li>`;
}

// ─── Sub-renderers ────────────────────────────────────────────────────────────

function renderNotConfigured(container) {
  container.innerHTML = `
    <div class="room-empty-state">
      <p class="room-empty-icon">⚙️</p>
      <p class="room-empty-text">${t("room.noFirebase")}</p>
    </div>`;
}

function renderNoRoom(container) {
  container.innerHTML = `
    <div class="room-entry">
      <article class="card room-entry-card">
        <div class="section-heading">
          <div>
            <h2>${t("room.create.title")}</h2>
            <p class="muted">${t("room.create.subtitle")}</p>
          </div>
        </div>
        <label class="field" for="room-name-input">
          <span>${t("room.create.nameLabel")}</span>
          <input id="room-name-input" type="text" autocomplete="off"
            placeholder="${t("room.create.namePlaceholder")}" maxlength="40">
        </label>
        <button type="button" class="primary-action" data-action="create-room">
          ${t("room.create.button")}
        </button>
      </article>

      <div class="room-divider"><span>${t("room.divider")}</span></div>

      <article class="card room-entry-card">
        <div class="section-heading">
          <div>
            <h2>${t("room.join.title")}</h2>
            <p class="muted">${t("room.join.subtitle")}</p>
          </div>
        </div>
        <label class="field" for="room-code-input">
          <span>${t("room.join.codeLabel")}</span>
          <input id="room-code-input" type="text" autocomplete="off"
            placeholder="${t("room.join.codePlaceholder")}" maxlength="10"
            style="text-transform:uppercase;letter-spacing:0.12em">
        </label>
        <button type="button" class="primary-action" data-action="join-room">
          ${t("room.join.button")}
        </button>
      </article>
    </div>`;
}

function renderActiveRoom(container) {
  const isGm    = state.room.role === "gm";
  const ownName = (state.character.name || "").trim();

  const self = {
    sid      : PLAYER_ID,
    name     : state.character.name,
    className: state.character.className,
    level    : state.character.level,
    currentHp: state.character.currentHp,
    hpMax    : state.character.hpMax,
    avatar   : state.character.avatar || "",
    diceColor: state.settings.diceColor,
    role     : state.room.role,
  };

  const others = Object.values(state.party || {})
    .filter(m => !ownName || (m.name || "").trim() !== ownName);

  const allMembers = [self, ...others];

  // Séparer MJ et joueurs
  const gmMember      = allMembers.find(m => m.role === "gm" || m.sid === state.room.gmSid);
  const playerMembers = allMembers.filter(m => m !== gmMember);
  const playerCount   = playerMembers.length;

  const gmHtml = gmMember
    ? buildGmCard(gmMember, gmMember.sid === PLAYER_ID)
    : "";

  const playersHtml = playerMembers.map(m =>
    buildPlayerCard(m, {
      isSelf  : m.sid === PLAYER_ID,
      canKick : isGm && m.sid !== PLAYER_ID,
    })
  ).join("");

  const leaveAction = isGm ? "dissolve-room" : "leave-room";
  const leaveLabel  = isGm ? t("room.dissolve")    : t("room.active.leave");
  const roleLabel   = isGm ? t("room.role.gm")     : t("room.role.player");
  const roleCls     = isGm ? "room-role-badge--gm" : "room-role-badge--player";

  container.innerHTML = `
    <article class="card room-active-header">
      <div class="room-active-top">
        <div class="room-active-info">
          <h2 class="room-active-name">${escapeHtml(state.room.name)}</h2>
          <span class="room-role-badge ${roleCls}">${roleLabel}</span>
        </div>
        <button type="button" class="room-leave-btn" data-action="${leaveAction}">
          ${leaveLabel}
        </button>
      </div>
      <div class="room-code-row">
        <span class="room-code-label">${t("room.active.code")}</span>
        <code class="room-code-value">${escapeHtml(state.room.code)}</code>
        <button type="button" class="room-copy-btn" data-action="copy-room-code"
          title="${t("room.active.copyCode")}">📋</button>
      </div>
    </article>

    ${gmHtml ? `<section class="room-section">${gmHtml}</section>` : ""}

    <article class="card">
      <div class="section-heading">
        <h3 class="room-members-title">${t("room.active.members", { count: playerCount })}</h3>
      </div>
      ${playerMembers.length
        ? `<ul class="room-members-list">${playersHtml}</ul>`
        : `<p class="room-no-players">${t("room.noPlayers")}</p>`}
    </article>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function renderRoom() {
  const container = document.querySelector("[data-room-panel]");
  if (!container) return;

  const inRoom = !!(state.room?.role && state.room?.code);

  // Preserve form inputs when user is not on the Room tab and not in a room
  if (!inRoom && state.ui.activeTab !== "room") return;

  const firebaseOk = !!(state.settings.firebaseUrl?.trim());
  if (!firebaseOk) { renderNotConfigured(container); return; }
  if (!inRoom)     { renderNoRoom(container);         return; }

  renderActiveRoom(container);
}
