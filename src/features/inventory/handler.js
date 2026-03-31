import { state, commit, setStatus } from "../../app/store.js";
import { uniqueId } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";
import { canPlace, findFreeSlot, MAX_COLS, MAX_ROWS } from "./grid.js";

// ── Item templates ──────────────────────────────────────────────────────────

const ITEM_TEMPLATES = [
  { key: "potion",  sizeX: 1, sizeY: 1, emoji: "🧪", weight: 0.1  },
  { key: "staff",   sizeX: 1, sizeY: 4, emoji: "🪄", weight: 2.0  },
  { key: "relic",   sizeX: 2, sizeY: 2, emoji: "🔮", weight: 1.5  },
  { key: "sword",   sizeX: 2, sizeY: 1, emoji: "⚔️", weight: 3.0  },
  { key: "shield",  sizeX: 2, sizeY: 2, emoji: "🛡️", weight: 4.0  },
  { key: "scroll",  sizeX: 1, sizeY: 1, emoji: "📜", weight: 0.05 },
  { key: "torch",   sizeX: 1, sizeY: 2, emoji: "🔥", weight: 0.5  },
  { key: "ring",    sizeX: 1, sizeY: 1, emoji: "💍", weight: 0.01 },
  { key: "helmet",  sizeX: 2, sizeY: 1, emoji: "⛑️", weight: 2.5  },
  { key: "gem",     sizeX: 1, sizeY: 1, emoji: "💎", weight: 0.2  },
];

// ── Container presets ───────────────────────────────────────────────────────

export const CONTAINER_PRESETS = [
  { key: "pockets",    emoji: "🧥", cols: 3,  rows: 2 },
  { key: "pouch",      emoji: "👝", cols: 4,  rows: 3 },
  { key: "backpack",   emoji: "🎒", cols: 6,  rows: 4 },
  { key: "largeBag",   emoji: "💼", cols: 8,  rows: 4 },
  { key: "bagHolding", emoji: "✨", cols: 10, rows: 6 },
];

export function getItemTemplates() {
  return ITEM_TEMPLATES.map((tmpl) => ({
    ...tmpl,
    name: t(`inventory.item.${tmpl.key}`),
  }));
}

export function getContainerPresets() {
  return CONTAINER_PRESETS.map((p) => ({
    ...p,
    name: t(`inventory.container.${p.key}`),
  }));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getContainer(containerId) {
  return state.inventory.containers.find((c) => c.id === containerId);
}

export function placeItemAt(containerId, templateKey, col, row) {
  const container = getContainer(containerId);
  const tmpl = ITEM_TEMPLATES.find((tp) => tp.key === templateKey);
  if (!container || !tmpl) return false;

  if (!canPlace(container.items, container.cols, container.rows, col, row, tmpl.sizeX, tmpl.sizeY)) {
    return false;
  }

  container.items.push({
    id: uniqueId("inv"),
    name: t(`inventory.item.${tmpl.key}`),
    sizeX: tmpl.sizeX,
    sizeY: tmpl.sizeY,
    emoji: tmpl.emoji,
    weight: tmpl.weight,
    col,
    row,
  });

  setStatus("success", t("inventory.status.itemAdded"));
  commit(false);
  return true;
}

export function moveItem(containerId, itemId, newCol, newRow) {
  const container = getContainer(containerId);
  if (!container) return false;

  const item = container.items.find((i) => i.id === itemId);
  if (!item) return false;

  if (!canPlace(container.items, container.cols, container.rows, newCol, newRow, item.sizeX, item.sizeY, itemId)) {
    return false;
  }

  item.col = newCol;
  item.row = newRow;
  commit(false);
  return true;
}

export function removeItem(containerId, itemId) {
  const container = getContainer(containerId);
  if (!container) return false;

  const index = container.items.findIndex((i) => i.id === itemId);
  if (index === -1) return false;

  container.items.splice(index, 1);
  setStatus("info", t("inventory.status.itemRemoved"));
  commit(false);
  return true;
}

// ── Sanitization (for import) ───────────────────────────────────────────────

function sanitizeItems(rawItems, cols, rows) {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .filter((item) => item && typeof item === "object" && typeof item.name === "string" && item.name.trim())
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : uniqueId("inv"),
      name: String(item.name).trim().slice(0, 100),
      sizeX: Math.min(Math.max(parseInt(item.sizeX) || 1, 1), cols),
      sizeY: Math.min(Math.max(parseInt(item.sizeY) || 1, 1), rows),
      emoji: typeof item.emoji === "string" ? item.emoji.slice(0, 8) : "📦",
      weight: Math.max(parseFloat(item.weight) || 0, 0),
      col: Math.min(Math.max(parseInt(item.col) || 0, 0), cols - 1),
      row: Math.min(Math.max(parseInt(item.row) || 0, 0), rows - 1),
    }));
}

function sanitizeContainers(rawContainers) {
  if (!Array.isArray(rawContainers)) return [];

  return rawContainers
    .filter((c) => c && typeof c === "object")
    .map((c) => {
      const cols = Math.min(Math.max(parseInt(c.cols) || 6, 1), MAX_COLS);
      const rows = Math.min(Math.max(parseInt(c.rows) || 4, 1), MAX_ROWS);

      return {
        id: typeof c.id === "string" && c.id ? c.id : uniqueId("bag"),
        name: typeof c.name === "string" ? c.name.trim().slice(0, 60) : "Sac",
        emoji: typeof c.emoji === "string" ? c.emoji.slice(0, 8) : "🎒",
        cols,
        rows,
        items: sanitizeItems(c.items, cols, rows),
      };
    });
}

// ── Action handler ──────────────────────────────────────────────────────────

export async function handleInventoryAction(button) {
  const { action } = button.dataset;

  // ── Add preset container ───────────────────────────────────────────────
  if (action === "add-container") {
    const presetKey = button.dataset.presetKey;
    const preset = CONTAINER_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return false;

    state.inventory.containers.push({
      id: uniqueId("bag"),
      name: t(`inventory.container.${preset.key}`),
      emoji: preset.emoji,
      cols: preset.cols,
      rows: preset.rows,
      items: [],
    });

    setStatus("success", t("inventory.status.containerAdded"));
    commit(false);
    return true;
  }

  // ── Remove container ───────────────────────────────────────────────────
  if (action === "remove-container") {
    const containerId = button.dataset.containerId;
    const container = getContainer(containerId);
    if (!container) return false;

    const msg = container.items.length
      ? t("inventory.confirm.removeContainerItems", { name: container.name, count: container.items.length })
      : t("inventory.confirm.removeContainer", { name: container.name });

    if (!window.confirm(msg)) return true;

    const idx = state.inventory.containers.findIndex((c) => c.id === containerId);
    if (idx !== -1) state.inventory.containers.splice(idx, 1);

    setStatus("info", t("inventory.status.containerRemoved"));
    commit(false);
    return true;
  }

  // ── Add item from palette to specific container ────────────────────────
  if (action === "add-to-inventory") {
    const key = button.dataset.templateKey;
    const containerId = button.closest("[data-container-id]")?.dataset.containerId;
    const tmpl = ITEM_TEMPLATES.find((tp) => tp.key === key);
    if (!tmpl) return false;

    const container = containerId ? getContainer(containerId) : state.inventory.containers[0];
    if (!container) {
      setStatus("error", t("inventory.error.noContainer"));
      commit(false);
      return true;
    }

    const slot = findFreeSlot(container.items, container.cols, container.rows, tmpl.sizeX, tmpl.sizeY);
    if (!slot) {
      setStatus("error", t("inventory.error.gridFull"));
      commit(false);
      return true;
    }

    container.items.push({
      id: uniqueId("inv"),
      name: t(`inventory.item.${tmpl.key}`),
      sizeX: tmpl.sizeX,
      sizeY: tmpl.sizeY,
      emoji: tmpl.emoji,
      weight: tmpl.weight,
      col: slot.col,
      row: slot.row,
    });

    setStatus("success", t("inventory.status.itemAdded"));
    commit(false);
    return true;
  }

  // ── Remove item ────────────────────────────────────────────────────────
  if (action === "remove-from-inventory") {
    const containerId = button.closest("[data-container-id]")?.dataset.containerId;
    if (containerId) {
      removeItem(containerId, button.dataset.itemId);
    }
    return true;
  }

  // ── Clear all containers ───────────────────────────────────────────────
  if (action === "clear-inventory") {
    const total = state.inventory.containers.reduce((s, c) => s + c.items.length, 0);
    if (!total && !state.inventory.containers.length) return true;

    if (!window.confirm(t("inventory.confirm.clear"))) return true;

    state.inventory.containers = [];
    setStatus("info", t("inventory.status.cleared"));
    commit(false);
    return true;
  }

  // ── Export ─────────────────────────────────────────────────────────────
  if (action === "export-inventory") {
    const payload = {
      _version: 2,
      _app: "Compagnon D&D",
      _type: "inventory",
      _exportedAt: new Date().toISOString(),
      inventory: state.inventory,
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventaire-dnd.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("success", t("inventory.status.exported"));
    commit(false);
    return true;
  }

  // ── Import ─────────────────────────────────────────────────────────────
  if (action === "import-inventory") {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (data._app !== "Compagnon D&D" || data._type !== "inventory" || !data.inventory) {
          throw new Error(t("inventory.error.invalidFile"));
        }

        // V1 migration: flat items[] → single container
        if (data._version === 1 && Array.isArray(data.inventory.items)) {
          const items = sanitizeItems(data.inventory.items, 8, 4);
          const count = items.length;

          if (!window.confirm(t("inventory.confirm.import", { count }))) return;

          state.inventory.containers = [{
            id: uniqueId("bag"),
            name: t("inventory.container.backpack"),
            emoji: "🎒",
            cols: 8,
            rows: 4,
            items,
          }];
        } else {
          const containers = sanitizeContainers(data.inventory.containers || []);
          const count = containers.reduce((s, c) => s + c.items.length, 0);

          if (!window.confirm(t("inventory.confirm.import", { count }))) return;

          state.inventory.containers = containers;
        }

        setStatus("success", t("inventory.status.imported"));
        commit(false);
      } catch (err) {
        setStatus("error", t("inventory.error.importFailed", { error: err.message }));
        commit(false);
      }
    });

    fileInput.click();
    return true;
  }

  // ── Add custom item ────────────────────────────────────────────────────
  if (action === "add-custom-item") {
    const form = button.closest("[data-custom-item-form]");
    const containerId = button.closest("[data-container-id]")?.dataset.containerId;
    if (!form) return false;

    const name = form.querySelector("[data-field='name']")?.value?.trim();
    const emoji = form.querySelector("[data-field='emoji']")?.value?.trim() || "📦";
    const sizeX = parseInt(form.querySelector("[data-field='sizeX']")?.value) || 1;
    const sizeY = parseInt(form.querySelector("[data-field='sizeY']")?.value) || 1;
    const weight = parseFloat(form.querySelector("[data-field='weight']")?.value) || 0;

    if (!name) {
      setStatus("error", t("inventory.error.nameRequired"));
      commit(false);
      return true;
    }

    const container = containerId ? getContainer(containerId) : state.inventory.containers[0];
    if (!container) {
      setStatus("error", t("inventory.error.noContainer"));
      commit(false);
      return true;
    }

    const slot = findFreeSlot(container.items, container.cols, container.rows, sizeX, sizeY);
    if (!slot) {
      setStatus("error", t("inventory.error.gridFull"));
      commit(false);
      return true;
    }

    container.items.push({
      id: uniqueId("inv"),
      name,
      sizeX,
      sizeY,
      emoji,
      weight,
      col: slot.col,
      row: slot.row,
    });

    form.querySelector("[data-field='name']").value = "";
    form.querySelector("[data-field='emoji']").value = "";
    setStatus("success", t("inventory.status.itemAdded"));
    commit(false);
    return true;
  }

  // ── Resize container ───────────────────────────────────────────────────
  if (action === "resize-container") {
    const containerId = button.dataset.containerId;
    const presetKey = button.dataset.presetKey;
    const preset = CONTAINER_PRESETS.find((p) => p.key === presetKey);
    const container = getContainer(containerId);
    if (!container || !preset) return false;

    const overflow = container.items.filter(
      (item) => item.col + item.sizeX > preset.cols || item.row + item.sizeY > preset.rows
    );

    if (overflow.length > 0) {
      if (!window.confirm(t("inventory.confirm.resizeLoseItems", { count: overflow.length }))) {
        return true;
      }

      container.items = container.items.filter((item) => !overflow.includes(item));
    }

    container.cols = preset.cols;
    container.rows = preset.rows;
    container.name = t(`inventory.container.${preset.key}`);
    container.emoji = preset.emoji;

    setStatus("success", t("inventory.status.resized", { name: container.name }));
    commit(false);
    return true;
  }

  return false;
}
