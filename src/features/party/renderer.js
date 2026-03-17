import { state } from "../../app/store.js";
import { SESSION_ID } from "../../adapters/firebase-sync.js";
import { t } from "../../shared/i18n.js";
import { escapeHtml } from "../../shared/dom.js";

function hpBarClass(current, max) {
  const pct = max > 0 ? (current / max) * 100 : 0;
  if (pct <= 25) return "party-hp-bar--critical";
  if (pct <= 60) return "party-hp-bar--injured";
  return "party-hp-bar--full";
}

function buildMemberCard(member, isSelf) {
  const hpPct  = member.hpMax > 0 ? Math.round((member.currentHp / member.hpMax) * 100) : 0;
  const name   = member.name      || t("app.defaultCharName");
  const cls    = member.className || t("app.defaultClass");
  const color  = escapeHtml(member.diceColor || "#8b5cf6");
  const initial = escapeHtml(name.charAt(0).toUpperCase());

  const avatarHtml = member.avatar
    ? `<img class="party-avatar" src="${escapeHtml(member.avatar)}" alt="${escapeHtml(name)}" loading="lazy">`
    : `<div class="party-avatar party-avatar--initial" style="--pcolor:${color}">${initial}</div>`;

  return `<li class="party-card${isSelf ? " party-card--self" : ""}">
    ${avatarHtml}
    <div class="party-info">
      <span class="party-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      <span class="party-class">${escapeHtml(cls)} · ${member.level}</span>
      <div class="party-hp-track">
        <div class="party-hp-bar ${hpBarClass(member.currentHp, member.hpMax)}"
             style="width:${hpPct}%"
             aria-label="${t("party.hp", { current: member.currentHp, max: member.hpMax })}">
        </div>
      </div>
      <span class="party-hp-label">${member.currentHp}/${member.hpMax}</span>
    </div>
  </li>`;
}

export function renderParty() {
  const panel = document.getElementById("party-panel");
  if (!panel) return;

  const self = {
    sid      : SESSION_ID,
    name     : state.character.name,
    className: state.character.className,
    level    : state.character.level,
    currentHp: state.character.currentHp,
    hpMax    : state.character.hpMax,
    avatar   : state.character.avatar || "",
    diceColor: state.settings.diceColor,
  };

  const ownName = (state.character.name || "").trim();
  const others  = Object.values(state.party || {})
    .filter(m => !ownName || (m.name || "").trim() !== ownName);

  const list = panel.querySelector("[data-party-list]");
  if (!list) return;

  list.innerHTML = [
    buildMemberCard(self, true),
    ...others.map(m => buildMemberCard(m, false)),
  ].join("");
}
