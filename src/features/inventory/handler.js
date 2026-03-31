import { state, commit, setStatus } from "../../app/store.js";
import { uniqueId } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";
import { canPlace, findFreeSlot, GRID_COLS, GRID_ROWS } from "./grid.js";

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

export function getItemTemplates() {
  return ITEM_TEMPLATES.map((tmpl) => ({
    ...tmpl,
    name: t(`inventory.item.${tmpl.key}`),
  }));
}

export function placeItemAt(templateKey, col, row) {
  const tmpl = ITEM_TEMPLATES.find((tp) => tp.key === templateKey);
  if (!tmpl) return false;

  const items = state.inventory.items;
  if (!canPlace(items, col, row, tmpl.sizeX, tmpl.sizeY)) return false;

  items.push({
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

export function moveItem(itemId, newCol, newRow) {
  const items = state.inventory.items;
  const item = items.find((i) => i.id === itemId);
  if (!item) return false;

  if (!canPlace(items, newCol, newRow, item.sizeX, item.sizeY, itemId)) return false;

  item.col = newCol;
  item.row = newRow;
  commit(false);
  return true;
}

export function removeItem(itemId) {
  const items = state.inventory.items;
  const index = items.findIndex((i) => i.id === itemId);
  if (index === -1) return false;

  items.splice(index, 1);
  setStatus("info", t("inventory.status.itemRemoved"));
  commit(false);
  return true;
}

function sanitizeInventoryItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .filter((item) => item && typeof item === "object" && typeof item.name === "string" && item.name.trim())
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : uniqueId("inv"),
      name: String(item.name).trim().slice(0, 100),
      sizeX: Math.min(Math.max(parseInt(item.sizeX) || 1, 1), GRID_COLS),
      sizeY: Math.min(Math.max(parseInt(item.sizeY) || 1, 1), GRID_ROWS),
      emoji: typeof item.emoji === "string" ? item.emoji.slice(0, 8) : "📦",
      weight: Math.max(parseFloat(item.weight) || 0, 0),
      col: Math.min(Math.max(parseInt(item.col) || 0, 0), GRID_COLS - 1),
      row: Math.min(Math.max(parseInt(item.row) || 0, 0), GRID_ROWS - 1),
    }));
}

export async function handleInventoryAction(button) {
  const { action } = button.dataset;

  if (action === "add-to-inventory") {
    const key = button.dataset.templateKey;
    const tmpl = ITEM_TEMPLATES.find((tp) => tp.key === key);
    if (!tmpl) return false;

    const items = state.inventory.items;
    const slot = findFreeSlot(items, tmpl.sizeX, tmpl.sizeY);

    if (!slot) {
      setStatus("error", t("inventory.error.gridFull"));
      commit(false);
      return true;
    }

    items.push({
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

  if (action === "remove-from-inventory") {
    removeItem(button.dataset.itemId);
    return true;
  }

  if (action === "clear-inventory") {
    if (!state.inventory.items.length) return true;
    const confirmed = window.confirm(t("inventory.confirm.clear"));
    if (!confirmed) return true;

    state.inventory.items = [];
    setStatus("info", t("inventory.status.cleared"));
    commit(false);
    return true;
  }

  if (action === "export-inventory") {
    const payload = {
      _version: 1,
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

        const confirmed = window.confirm(
          t("inventory.confirm.import", { count: data.inventory.items?.length || 0 })
        );
        if (!confirmed) return;

        state.inventory.items = sanitizeInventoryItems(data.inventory.items || []);
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

  if (action === "add-custom-item") {
    const form = button.closest("[data-custom-item-form]");
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

    const items = state.inventory.items;
    const slot = findFreeSlot(items, sizeX, sizeY);

    if (!slot) {
      setStatus("error", t("inventory.error.gridFull"));
      commit(false);
      return true;
    }

    items.push({
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

  return false;
}
