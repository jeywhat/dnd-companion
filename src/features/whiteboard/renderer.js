import { state, appElement } from "../../app/store.js";
import { escapeHtml } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";
import { PLAYER_ID } from "../../adapters/firebase-sync.js";

/**
 * Runtime whiteboard state — not persisted, populated by SSE events.
 * Exported so handler.js can read/write tokens and background.
 */
export const wb = {
  background: null,   // { url, name } | null
  tokens: {},         // { [tokenId]: { id, type, ownerId, ownerName, name, x, y, color, locked } }
};

export function renderWhiteboard() {
  const panel = appElement.querySelector("[data-panel='whiteboard']");
  if (!panel) return;

  const boardContainer = panel.querySelector("[data-wb-board]");
  const toolbar = panel.querySelector("[data-wb-toolbar]");
  const playerBar = panel.querySelector("[data-wb-player-bar]");
  if (!boardContainer) return;

  const isGm = state.room?.role === "gm";
  const inRoom = !!(state.room?.code && state.settings?.firebaseUrl);

  // ── Toolbar visibility (GM only) ──────────────────────────────────────────
  if (toolbar) {
    toolbar.hidden = !isGm || !inRoom;
  }

  // ── Board background ──────────────────────────────────────────────────────
  const boardInner = boardContainer.querySelector("[data-wb-board-inner]");
  if (!boardInner) return;

  if (!inRoom) {
    boardInner.innerHTML = `<div class="wb-empty"><p>${t("whiteboard.status.noRoom")}</p></div>`;
    boardInner.style.backgroundImage = "";
    if (playerBar) playerBar.hidden = true;
    return;
  }

  if (wb.background?.url) {
    boardInner.style.backgroundImage = `url('${wb.background.url}')`;
    boardInner.classList.remove("wb-no-map");
  } else {
    boardInner.style.backgroundImage = "";
    boardInner.classList.add("wb-no-map");
    // Show empty state inside the board (tokens can still be rendered)
    const emptyEl = boardInner.querySelector(".wb-empty");
    if (!emptyEl && Object.keys(wb.tokens).length === 0) {
      const div = document.createElement("div");
      div.className = "wb-empty";
      div.innerHTML = `<p>${isGm ? t("whiteboard.empty") : t("whiteboard.emptyPlayer")}</p>`;
      boardInner.appendChild(div);
    }
  }
  // Remove empty state if there's a background
  if (wb.background?.url) {
    const emptyEl = boardInner.querySelector(".wb-empty");
    if (emptyEl) emptyEl.remove();
  }

  // ── Render tokens ─────────────────────────────────────────────────────────
  renderTokensOnBoard(boardInner, isGm);

  // ── Player bar (bottom) ───────────────────────────────────────────────────
  if (playerBar) {
    renderPlayerBar(playerBar, isGm, inRoom);
  }
}

function renderTokensOnBoard(boardInner, isGm) {
  const existingIds = new Set();

  for (const [tokenId, token] of Object.entries(wb.tokens)) {
    if (token == null) continue;
    existingIds.add(tokenId);

    let el = boardInner.querySelector(`[data-token-id="${tokenId}"]`);
    if (!el) {
      el = createTokenElement(token, isGm);
      boardInner.appendChild(el);
    }

    // Update position (skip if being dragged)
    if (!el.classList.contains("wb-dragging")) {
      el.style.left = `${token.x ?? 50}%`;
      el.style.top = `${token.y ?? 50}%`;
    }

    // Update visual state
    el.classList.toggle("wb-locked", !!token.locked);
    const label = el.querySelector(".wb-token-label");
    if (label) label.textContent = token.name || "?";

    // Update color
    const circle = el.querySelector(".wb-token-circle");
    if (circle) circle.style.backgroundColor = token.color || "#7c3aed";

    // Update initials
    const initials = el.querySelector(".wb-token-initials");
    if (initials) initials.textContent = getInitials(token.name);

    // GM controls visibility
    const controls = el.querySelector(".wb-token-controls");
    if (controls) controls.hidden = !isGm;
  }

  // Remove tokens that no longer exist
  boardInner.querySelectorAll("[data-token-id]").forEach((el) => {
    if (!existingIds.has(el.dataset.tokenId)) el.remove();
  });
}

function createTokenElement(token, isGm) {
  const el = document.createElement("div");
  el.className = `wb-token wb-token-${token.type || "monster"}`;
  el.dataset.tokenId = token.id;
  el.dataset.ownerId = token.ownerId || "";

  const typeBadge = token.type === "player"
    ? `<span class="wb-token-badge wb-token-badge-player">${t("whiteboard.token.player")}</span>`
    : `<span class="wb-token-badge wb-token-badge-monster">${t("whiteboard.token.monster")}</span>`;

  el.innerHTML = `
    <div class="wb-token-circle" style="background-color:${escapeHtml(token.color || "#7c3aed")}">
      <span class="wb-token-initials">${escapeHtml(getInitials(token.name))}</span>
    </div>
    <span class="wb-token-label">${escapeHtml(token.name || "?")}</span>
    ${typeBadge}
    <div class="wb-token-controls" ${isGm ? "" : "hidden"}>
      <button type="button" class="wb-ctrl-btn" data-action="wb-delete-token" data-token-id="${escapeHtml(token.id)}" title="${t("whiteboard.token.delete")}">✕</button>
      <button type="button" class="wb-ctrl-btn" data-action="wb-toggle-lock" data-token-id="${escapeHtml(token.id)}" title="${token.locked ? t("whiteboard.token.unlock") : t("whiteboard.token.lock")}">${token.locked ? "🔓" : "🔒"}</button>
    </div>
  `;

  return el;
}

function renderPlayerBar(bar, isGm, inRoom) {
  if (!inRoom || isGm) {
    bar.hidden = true;
    return;
  }

  // Find the player's own token
  const myToken = Object.values(wb.tokens).find(
    (tk) => tk && tk.type === "player" && tk.ownerId === PLAYER_ID
  );

  if (!myToken) {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;

  // Only re-render if token changed
  const existing = bar.querySelector("[data-my-token]");
  if (existing && existing.dataset.tokenId === myToken.id) return;

  bar.innerHTML = `
    <div class="wb-player-bar-inner">
      <span class="wb-player-bar-label">${t("whiteboard.myToken")} :</span>
      <div class="wb-player-token" data-my-token data-token-id="${escapeHtml(myToken.id)}">
        <div class="wb-token-circle wb-token-circle-small" style="background-color:${escapeHtml(myToken.color || "#7c3aed")}">
          <span class="wb-token-initials">${escapeHtml(getInitials(myToken.name))}</span>
        </div>
        <span>${escapeHtml(myToken.name)}</span>
      </div>
      <span class="muted" style="font-size:0.75rem">${t("whiteboard.dragHint")}</span>
    </div>
  `;
}

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}
