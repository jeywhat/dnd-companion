import { state, setStatus, commit } from "../../app/store.js";
import { PLAYER_ID } from "../../adapters/firebase-sync.js";
import { t } from "../../shared/i18n.js";
import { uniqueId, escapeHtml } from "../../shared/dom.js";
import { wb } from "./renderer.js";
import {
  publishBackground,
  clearBackground,
  publishToken,
  updateTokenPosition,
  deleteToken,
  clearAllTokens,
  connectWhiteboard,
  disconnectWhiteboard,
} from "../../adapters/whiteboard-sync.js";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

// ─── Drag & drop state ────────────────────────────────────────────────────────

let _dragging = null; // { tokenId, startX, startY, offsetX, offsetY, el }
let _debounceTimer = 0;

// ─── Room lifecycle integration ───────────────────────────────────────────────

export function connectWhiteboardSync() {
  const { firebaseUrl, syncRoom } = state.settings;
  if (!firebaseUrl || !syncRoom) return;

  connectWhiteboard({
    firebaseUrl,
    roomId: syncRoom,
    onBackground: (data) => {
      wb.background = data;
      commit(false);
    },
    onTokens: (event, data, tokenId) => {
      switch (event) {
        case "snapshot":
          wb.tokens = data && typeof data === "object" ? { ...data } : {};
          break;
        case "put":
          if (data && tokenId) wb.tokens[tokenId] = data;
          break;
        case "delete":
          if (tokenId) delete wb.tokens[tokenId];
          break;
        case "patch":
          if (tokenId && wb.tokens[tokenId]) {
            Object.assign(wb.tokens[tokenId], data);
          }
          break;
        case "field":
          if (tokenId && wb.tokens[tokenId]) {
            Object.assign(wb.tokens[tokenId], data);
          }
          break;
      }
      commit(false);
    },
  });
}

export function disconnectWhiteboardSync() {
  disconnectWhiteboard();
  wb.background = null;
  wb.tokens = {};
}

export function reconnectWhiteboardSync() {
  if (state.room?.code && state.settings?.firebaseUrl) {
    connectWhiteboardSync();
  }
}

// ─── Action handler ───────────────────────────────────────────────────────────

/** @returns {boolean} */
export async function handleWhiteboardAction(button) {
  const { action } = button.dataset;

  // ── Import map from file ────────────────────────────────────────────────
  if (action === "wb-import-map") {
    if (!requireGm()) return true;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => handleFileUpload(input.files?.[0]));
    input.click();
    return true;
  }

  // ── Import map from URL ─────────────────────────────────────────────────
  if (action === "wb-import-url") {
    if (!requireGm()) return true;
    showUrlModal();
    return true;
  }

  if (action === "wb-url-submit") {
    const urlInput = document.getElementById("wb-url-input");
    const url = urlInput?.value.trim();
    if (url) {
      await publishBackground({
        firebaseUrl: state.settings.firebaseUrl,
        roomId: state.settings.syncRoom,
        background: { url, name: "URL" },
      });
      setStatus("success", t("whiteboard.status.mapLoaded", { name: "URL" }));
      commit(false);
    }
    closeModal();
    return true;
  }

  // ── Clear map ───────────────────────────────────────────────────────────
  if (action === "wb-clear-map") {
    if (!requireGm()) return true;
    if (!window.confirm(t("whiteboard.confirm.clearMap"))) return true;
    await clearBackground({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
    });
    setStatus("info", t("whiteboard.status.mapCleared"));
    commit(false);
    return true;
  }

  // ── Add token ───────────────────────────────────────────────────────────
  if (action === "wb-add-token") {
    if (!requireGm()) return true;
    showAddTokenModal();
    return true;
  }

  if (action === "wb-token-submit") {
    await handleTokenSubmit();
    closeModal();
    return true;
  }

  // ── Delete token ────────────────────────────────────────────────────────
  if (action === "wb-delete-token") {
    if (!requireGm()) return true;
    const tokenId = button.dataset.tokenId;
    if (tokenId) {
      await deleteToken({
        firebaseUrl: state.settings.firebaseUrl,
        roomId: state.settings.syncRoom,
        tokenId,
      });
      setStatus("info", t("whiteboard.status.tokenDeleted"));
      commit(false);
    }
    return true;
  }

  // ── Toggle lock ─────────────────────────────────────────────────────────
  if (action === "wb-toggle-lock") {
    if (!requireGm()) return true;
    const tokenId = button.dataset.tokenId;
    const token = wb.tokens[tokenId];
    if (token) {
      token.locked = !token.locked;
      await publishToken({
        firebaseUrl: state.settings.firebaseUrl,
        roomId: state.settings.syncRoom,
        token,
      });
      commit(false);
    }
    return true;
  }

  // ── Clear all tokens ────────────────────────────────────────────────────
  if (action === "wb-clear-tokens") {
    if (!requireGm()) return true;
    if (!window.confirm(t("whiteboard.confirm.clearTokens"))) return true;
    await clearAllTokens({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
    });
    setStatus("info", t("whiteboard.status.tokensCleared"));
    commit(false);
    return true;
  }

  // ── Modal cancel ────────────────────────────────────────────────────────
  if (action === "wb-modal-cancel") {
    closeModal();
    return true;
  }

  return false;
}

// ─── File upload ──────────────────────────────────────────────────────────────

async function handleFileUpload(file) {
  if (!file) return;

  if (file.size > MAX_FILE_SIZE) {
    setStatus("error", t("whiteboard.status.fileTooLarge"));
    commit(false);
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    // Resize if needed to keep Firebase payload small
    const resized = await resizeImage(dataUrl, 1920, 1080);
    await publishBackground({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
      background: { url: resized, name: file.name },
    });
    setStatus("success", t("whiteboard.status.mapLoaded", { name: file.name }));
    commit(false);
  } catch (err) {
    setStatus("error", err.message);
    commit(false);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsDataURL(file);
  });
}

function resizeImage(dataUrl, maxW, maxH) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxW && height <= maxH) {
        resolve(dataUrl);
        return;
      }
      const ratio = Math.min(maxW / width, maxH / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.src = dataUrl;
  });
}

// ─── Token submit ─────────────────────────────────────────────────────────────

async function handleTokenSubmit() {
  const name = document.getElementById("wb-token-name")?.value.trim();
  const type = document.getElementById("wb-token-type")?.value || "monster";
  const color = document.getElementById("wb-token-color")?.value || "#7c3aed";
  const ownerId = document.getElementById("wb-token-owner")?.value || "";

  if (!name) return;

  const token = {
    id: uniqueId("tk"),
    type,
    ownerId: ownerId || PLAYER_ID,
    ownerName: getOwnerName(ownerId),
    name,
    x: 50,
    y: 50,
    color,
    locked: false,
  };

  await publishToken({
    firebaseUrl: state.settings.firebaseUrl,
    roomId: state.settings.syncRoom,
    token,
  });
  setStatus("success", t("whiteboard.status.tokenAdded", { name }));
  commit(false);
}

function getOwnerName(ownerId) {
  if (!ownerId || ownerId === PLAYER_ID) return state.character.name || "GM";
  const member = state.party?.[ownerId];
  return member?.name || ownerId;
}

// ─── Drag & drop ──────────────────────────────────────────────────────────────

export function initDragListeners(panel) {
  if (!panel) return;

  const board = panel.querySelector("[data-wb-board-inner]");
  if (!board) return;

  board.addEventListener("mousedown", onMouseDown);
  board.addEventListener("touchstart", onTouchStart, { passive: false });
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("touchend", onMouseUp);
}

function onMouseDown(e) {
  const tokenEl = e.target.closest("[data-token-id]");
  if (!tokenEl) return;
  // Don't interfere with control buttons
  if (e.target.closest("[data-action]")) return;
  startDrag(tokenEl, e.clientX, e.clientY);
  e.preventDefault();
}

function onTouchStart(e) {
  const tokenEl = e.target.closest("[data-token-id]");
  if (!tokenEl || e.target.closest("[data-action]")) return;
  const touch = e.touches[0];
  startDrag(tokenEl, touch.clientX, touch.clientY);
  e.preventDefault();
}

function startDrag(tokenEl, clientX, clientY) {
  const tokenId = tokenEl.dataset.tokenId;
  const token = wb.tokens[tokenId];
  if (!token) return;

  // Permission check
  const isGm = state.room?.role === "gm";
  if (!isGm) {
    if (token.locked) return;
    if (token.ownerId !== PLAYER_ID) return;
  }

  const board = tokenEl.closest("[data-wb-board-inner]");
  if (!board) return;
  const rect = board.getBoundingClientRect();

  _dragging = {
    tokenId,
    el: tokenEl,
    boardRect: rect,
    offsetX: clientX - tokenEl.getBoundingClientRect().left - tokenEl.offsetWidth / 2,
    offsetY: clientY - tokenEl.getBoundingClientRect().top - tokenEl.offsetHeight / 2,
  };

  tokenEl.classList.add("wb-dragging");
}

function onMouseMove(e) {
  if (!_dragging) return;
  moveDrag(e.clientX, e.clientY);
}

function onTouchMove(e) {
  if (!_dragging) return;
  const touch = e.touches[0];
  moveDrag(touch.clientX, touch.clientY);
  e.preventDefault();
}

function moveDrag(clientX, clientY) {
  const { el, boardRect, tokenId } = _dragging;
  const x = ((clientX - boardRect.left) / boardRect.width) * 100;
  const y = ((clientY - boardRect.top) / boardRect.height) * 100;
  const clampedX = Math.max(0, Math.min(100, x));
  const clampedY = Math.max(0, Math.min(100, y));

  el.style.left = `${clampedX}%`;
  el.style.top = `${clampedY}%`;

  // Debounced Firebase update
  window.clearTimeout(_debounceTimer);
  _debounceTimer = window.setTimeout(() => {
    updateTokenPosition({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
      tokenId,
      x: Math.round(clampedX * 100) / 100,
      y: Math.round(clampedY * 100) / 100,
    });
  }, 80);
}

function onMouseUp() {
  if (!_dragging) return;
  const { el, tokenId, boardRect } = _dragging;

  el.classList.remove("wb-dragging");

  // Final position update
  const left = parseFloat(el.style.left) || 50;
  const top = parseFloat(el.style.top) || 50;
  window.clearTimeout(_debounceTimer);
  updateTokenPosition({
    firebaseUrl: state.settings.firebaseUrl,
    roomId: state.settings.syncRoom,
    tokenId,
    x: Math.round(left * 100) / 100,
    y: Math.round(top * 100) / 100,
  });

  // Update local state for immediate feedback
  if (wb.tokens[tokenId]) {
    wb.tokens[tokenId].x = Math.round(left * 100) / 100;
    wb.tokens[tokenId].y = Math.round(top * 100) / 100;
  }

  _dragging = null;
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function showUrlModal() {
  const container = document.querySelector("[data-wb-modal]");
  if (!container) return;
  container.hidden = false;
  container.innerHTML = `
    <div class="wb-modal-backdrop" data-action="wb-modal-cancel"></div>
    <div class="wb-modal-content card">
      <h3>${t("whiteboard.modal.importUrl.title")}</h3>
      <label class="field">
        <span>URL</span>
        <input id="wb-url-input" type="url" placeholder="${t("whiteboard.modal.importUrl.placeholder")}" autocomplete="off" />
      </label>
      <div class="wb-modal-actions">
        <button type="button" class="primary-action" data-action="wb-url-submit">${t("whiteboard.modal.importUrl.submit")}</button>
        <button type="button" data-action="wb-modal-cancel">${t("whiteboard.modal.importUrl.cancel")}</button>
      </div>
    </div>
  `;
  document.getElementById("wb-url-input")?.focus();
}

function showAddTokenModal() {
  const container = document.querySelector("[data-wb-modal]");
  if (!container) return;

  // Build party member options for owner dropdown
  const partyOptions = Object.entries(state.party || {})
    .filter(([, m]) => m?.name)
    .map(([sid, m]) => `<option value="${escapeHtml(sid)}">${escapeHtml(m.name)}</option>`)
    .join("");

  container.hidden = false;
  container.innerHTML = `
    <div class="wb-modal-backdrop" data-action="wb-modal-cancel"></div>
    <div class="wb-modal-content card">
      <h3>${t("whiteboard.modal.addToken.title")}</h3>
      <label class="field">
        <span>${t("whiteboard.modal.addToken.name")}</span>
        <input id="wb-token-name" type="text" placeholder="${t("whiteboard.modal.addToken.namePlaceholder")}" autocomplete="off" />
      </label>
      <label class="field">
        <span>${t("whiteboard.modal.addToken.type")}</span>
        <select id="wb-token-type">
          <option value="monster">${t("whiteboard.token.monster")}</option>
          <option value="player">${t("whiteboard.token.player")}</option>
        </select>
      </label>
      <label class="field">
        <span>${t("whiteboard.modal.addToken.color")}</span>
        <input id="wb-token-color" type="color" value="#7c3aed" />
      </label>
      <label class="field">
        <span>${t("whiteboard.modal.addToken.owner")}</span>
        <select id="wb-token-owner">
          <option value="">${t("whiteboard.modal.addToken.ownerNone")}</option>
          ${partyOptions}
        </select>
      </label>
      <div class="wb-modal-actions">
        <button type="button" class="primary-action" data-action="wb-token-submit">${t("whiteboard.modal.addToken.submit")}</button>
        <button type="button" data-action="wb-modal-cancel">${t("whiteboard.modal.addToken.cancel")}</button>
      </div>
    </div>
  `;
  document.getElementById("wb-token-name")?.focus();
}

function closeModal() {
  const container = document.querySelector("[data-wb-modal]");
  if (container) {
    container.hidden = true;
    container.innerHTML = "";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireGm() {
  if (state.room?.role !== "gm") {
    setStatus("error", t("whiteboard.status.notGm"));
    commit(false);
    return false;
  }
  return true;
}
