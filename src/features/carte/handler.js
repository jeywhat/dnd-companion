/**
 * Action handler for the Carte (map/whiteboard) feature tab.
 * Registered in app/events.js ACTION_HANDLERS.
 *
 * Permissions :
 *   GM   → drag/delete ALL tokens, add/remove maps, clear board
 *   Player → drag/delete only own tokens (owner === PLAYER_ID)
 */

import { state, commit, setStatus } from "../../app/store.js";
import { t } from "../../shared/i18n.js";
import { PLAYER_ID } from "../../adapters/firebase-sync.js";
import { createToken } from "./tokens.js";
import {
  publishToken,
  publishMap,
  deleteToken as firebaseDeleteToken,
  clearAllCarte,
} from "../../adapters/carte-sync.js";
import { getCanvasInstance } from "./renderer.js";

const CAMERA_STORAGE_KEY = "dnd-companion-carte-camera";
const MAX_IMAGE_DIM = 2000;

export async function handleCarteAction(button) {
  const { action } = button.dataset;
  const canvas = getCanvasInstance();

  // ── Add token (toolbar buttons) ───────────────────────────────────────────

  if (action === "carte-add-token") {
    const type = button.dataset.tokenType || "player";

    let x = 0, y = 0;
    if (canvas) {
      const center = canvas.screenToWorld(
        canvas.canvas.clientWidth / 2,
        canvas.canvas.clientHeight / 2
      );
      const snapped = canvas.snapWorld(center.x, center.y);
      x = snapped.x;
      y = snapped.y;
    }

    let name = "";
    if (type === "player") {
      name = state.character?.name || t("app.defaultCharName");
    }

    const token = createToken({ type, x, y, name });

    if (canvas) {
      canvas.tokens.push(token);
      canvas.selectedTokenId = token.id;
      canvas.onTokenSelected?.(token);
      canvas.requestRedraw();
    }

    const { firebaseUrl, syncRoom } = state.settings;
    if (firebaseUrl && syncRoom) {
      await publishToken({ firebaseUrl, roomId: syncRoom, token });
    }

    setStatus("info", t("carte.tokenAdded", { type: t(`carte.type.${type}`) }));
    commit(false);
    console.log("[Carte] ✅ Token added:", token.id, type, name);
    return true;
  }

  // ── Place "My token" from dock ────────────────────────────────────────────

  if (action === "carte-place-my-token") {
    if (!canvas) return true;

    const center = canvas.screenToWorld(
      canvas.canvas.clientWidth / 2,
      canvas.canvas.clientHeight / 2
    );
    const snapped = canvas.snapWorld(center.x, center.y);
    const name = state.character?.name || t("app.defaultCharName");

    const token = createToken({ type: "player", x: snapped.x, y: snapped.y, name });
    canvas.tokens.push(token);
    canvas.selectedTokenId = token.id;
    canvas.onTokenSelected?.(token);
    canvas.requestRedraw();

    const { firebaseUrl, syncRoom } = state.settings;
    if (firebaseUrl && syncRoom) {
      await publishToken({ firebaseUrl, roomId: syncRoom, token });
    }

    setStatus("info", t("carte.myTokenPlaced"));
    commit(false);
    console.log("[Carte] 🧙 My token placed:", token.id);
    return true;
  }

  // ── Center view on my token ───────────────────────────────────────────────

  if (action === "carte-center-my-token") {
    if (!canvas) return true;

    const myToken = canvas.tokens.find((tok) => tok.owner === PLAYER_ID && tok.type === "player");
    if (myToken) {
      const halfGrid = canvas.gridSize / 2;
      const screenW = canvas.canvas.clientWidth / 2;
      const screenH = canvas.canvas.clientHeight / 2;
      canvas.camera.offsetX = screenW - (myToken.x + halfGrid) * canvas.camera.zoom;
      canvas.camera.offsetY = screenH - (myToken.y + halfGrid) * canvas.camera.zoom;
      canvas.requestRedraw();
      canvas.onCameraChanged?.(canvas.camera);
    }
    return true;
  }

  // ── Delete selected token ─────────────────────────────────────────────────

  if (action === "carte-delete-selected") {
    if (!canvas || !canvas.selectedTokenId) return true;

    const token = canvas.tokens.find((tok) => tok.id === canvas.selectedTokenId);
    if (!token) return true;

    const isGm = state.room?.role === "gm";
    if (!isGm && token.owner !== PLAYER_ID) {
      setStatus("error", t("carte.noPermission"));
      commit(false);
      return true;
    }

    canvas.tokens = canvas.tokens.filter((tok) => tok.id !== token.id);
    canvas.selectedTokenId = null;
    canvas.onTokenSelected?.(null);
    canvas.requestRedraw();

    const { firebaseUrl, syncRoom } = state.settings;
    if (firebaseUrl && syncRoom) {
      await firebaseDeleteToken({ firebaseUrl, roomId: syncRoom, tokenId: token.id });
    }

    setStatus("info", t("carte.tokenDeleted", { name: token.name || token.id }));
    commit(false);
    return true;
  }

  // ── Clear board (GM only) ─────────────────────────────────────────────────

  if (action === "carte-clear-board") {
    if (state.room?.role !== "gm") return true;
    if (!confirm(t("carte.confirmClear"))) return true;

    if (canvas) {
      canvas.tokens = [];
      canvas.maps = [];
      canvas.selectedTokenId = null;
      canvas.onTokenSelected?.(null);
      canvas.requestRedraw();
    }

    const { firebaseUrl, syncRoom } = state.settings;
    if (firebaseUrl && syncRoom) {
      await clearAllCarte({ firebaseUrl, roomId: syncRoom });
    }

    setStatus("info", t("carte.boardCleared"));
    commit(false);
    console.log("[Carte] 🧹 Board cleared");
    return true;
  }

  // ── Save camera view ──────────────────────────────────────────────────────

  if (action === "carte-save-view") {
    if (canvas) {
      const cam = { zoom: canvas.camera.zoom, offsetX: canvas.camera.offsetX, offsetY: canvas.camera.offsetY };
      localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(cam));
      setStatus("info", t("carte.viewSaved"));
      commit(false);
      console.log("[Carte] 💾 View saved");
    }
    return true;
  }

  // ── Toggle mini-map ───────────────────────────────────────────────────────

  if (action === "carte-toggle-minimap") {
    if (canvas) {
      canvas.showMiniMap = !canvas.showMiniMap;
      canvas.requestRedraw();
    }
    return true;
  }

  // ── Toggle grid ───────────────────────────────────────────────────────────

  if (action === "carte-toggle-grid") {
    if (canvas) {
      canvas.showGrid = !canvas.showGrid;
      canvas.requestRedraw();
    }
    return true;
  }

  // ── Toggle snap ───────────────────────────────────────────────────────────

  if (action === "carte-toggle-snap") {
    if (canvas) {
      canvas.snapToGrid = !canvas.snapToGrid;
      const label = button.querySelector("[data-snap-label]");
      if (label) {
        label.textContent = canvas.snapToGrid ? t("carte.snapOn") : t("carte.snapOff");
      }
    }
    return true;
  }

  // ── Zoom controls ─────────────────────────────────────────────────────────

  if (action === "carte-zoom-in") {
    if (canvas) {
      canvas.zoomBy(1.3, canvas.canvas.clientWidth / 2, canvas.canvas.clientHeight / 2);
    }
    return true;
  }

  if (action === "carte-zoom-out") {
    if (canvas) {
      canvas.zoomBy(1 / 1.3, canvas.canvas.clientWidth / 2, canvas.canvas.clientHeight / 2);
    }
    return true;
  }

  if (action === "carte-reset-view") {
    canvas?.resetView();
    return true;
  }

  return false;
}

// ── Image processing (called from renderer on file drop) ────────────────────

/**
 * Process dropped image files: resize if needed, convert to data URL,
 * create map objects, publish to Firebase.
 */
export async function processDroppedFiles(files, worldPos) {
  const canvas = getCanvasInstance();
  if (!canvas) return;

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;

    console.log("[Carte] 📂 Processing image:", file.name, file.size, "bytes");

    try {
      const dataUrl = await _readAndResizeImage(file);
      const img = await _loadImage(dataUrl);

      const map = {
        id: `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        url: dataUrl,
        x: Math.round(worldPos.x),
        y: Math.round(worldPos.y),
        w: img.naturalWidth,
        h: img.naturalHeight,
        _img: img,
      };

      canvas.maps.push(map);
      canvas.requestRedraw();

      const { firebaseUrl, syncRoom } = state.settings;
      if (firebaseUrl && syncRoom) {
        // Publish without _img (non-serializable)
        const { _img, _loading, ...syncMap } = map;
        await publishMap({ firebaseUrl, roomId: syncRoom, map: syncMap });
      }

      setStatus("info", t("carte.mapAdded", { name: file.name }));
      commit(false);
      console.log("[Carte] 🖼️ Map added:", map.id, img.naturalWidth, "×", img.naturalHeight);
    } catch (err) {
      console.warn("[Carte] ❌ Image processing failed:", err);
      setStatus("error", t("carte.mapError"));
      commit(false);
    }
  }
}

function _readAndResizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;

        // Skip resize if small enough
        if (w <= MAX_IMAGE_DIM && h <= MAX_IMAGE_DIM) {
          resolve(reader.result);
          return;
        }

        // Downscale to fit within MAX_IMAGE_DIM
        const scale = Math.min(MAX_IMAGE_DIM / w, MAX_IMAGE_DIM / h);
        const nw = Math.round(w * scale);
        const nh = Math.round(h * scale);
        const offscreen = document.createElement("canvas");
        offscreen.width = nw;
        offscreen.height = nh;
        const octx = offscreen.getContext("2d");
        octx.drawImage(img, 0, 0, nw, nh);
        const resized = offscreen.toDataURL("image/jpeg", 0.85);
        console.log("[Carte] 📐 Resized:", w, "×", h, "→", nw, "×", nh);
        resolve(resized);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function _loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Restore saved camera from localStorage.
 */
export function restoreCamera() {
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    if (!raw) return null;
    const cam = JSON.parse(raw);
    if (typeof cam.zoom === "number") return cam;
  } catch { /* corrupted */ }
  return null;
}
