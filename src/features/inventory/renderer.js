import { appElement, state } from "../../app/store.js";
import { escapeHtml } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";
import { GRID_COLS, GRID_ROWS, CELL_SIZE, CELL_GAP, canPlace, totalWeight } from "./grid.js";
import { getItemTemplates, moveItem, placeItemAt } from "./handler.js";

let dragState = null;

export function renderInventory() {
  const container = appElement.querySelector("[data-inventory]");
  if (!container) return;

  const items = state.inventory?.items || [];
  const weight = totalWeight(items);
  const templates = getItemTemplates();

  container.innerHTML = `
    <article class="card">
      <div class="section-heading">
        <div>
          <h2>${t("inventory.title")}</h2>
          <p class="muted">${t("inventory.subtitle")}</p>
        </div>
        <span class="pill">${t("inventory.weight", { value: weight.toFixed(1) })}</span>
      </div>

      <div class="inv-grid-wrapper">
        <div class="inv-grid" data-inv-grid>
          ${buildGridCells()}
          ${buildGridItems(items)}
        </div>
      </div>
    </article>

    <article class="card">
      <div class="section-heading">
        <div>
          <h2>${t("inventory.palette.title")}</h2>
          <p class="muted">${t("inventory.palette.subtitle")}</p>
        </div>
      </div>
      <div class="inv-palette" data-inv-palette>
        ${templates.map((tmpl) => `
          <div class="inv-palette-item"
            data-template-key="${tmpl.key}"
            data-size-x="${tmpl.sizeX}"
            data-size-y="${tmpl.sizeY}">
            <span class="inv-palette-emoji">${tmpl.emoji}</span>
            <span class="inv-palette-name">${escapeHtml(tmpl.name)}</span>
            <span class="inv-palette-size">${tmpl.sizeX}×${tmpl.sizeY}</span>
          </div>
        `).join("")}
      </div>
    </article>

    <article class="card">
      <div class="section-heading">
        <div>
          <h2>${t("inventory.custom.title")}</h2>
          <p class="muted">${t("inventory.custom.subtitle")}</p>
        </div>
      </div>
      <div class="inv-custom-form" data-custom-item-form>
        <div class="inv-custom-row">
          <label class="field">
            <span>${t("inventory.custom.name")}</span>
            <input type="text" data-field="name" maxlength="50"
              placeholder="${t("inventory.custom.namePlaceholder")}">
          </label>
          <label class="field" style="max-width:5rem">
            <span>${t("inventory.custom.emoji")}</span>
            <input type="text" data-field="emoji" maxlength="4" placeholder="📦">
          </label>
        </div>
        <div class="inv-custom-row">
          <label class="field">
            <span>${t("inventory.custom.width")}</span>
            <select data-field="sizeX">
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
          <label class="field">
            <span>${t("inventory.custom.height")}</span>
            <select data-field="sizeY">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </label>
          <label class="field">
            <span>${t("inventory.custom.weight")}</span>
            <input type="number" data-field="weight" min="0" step="0.1" value="0.1">
          </label>
        </div>
        <button type="button" class="primary-action" data-action="add-custom-item">
          ${t("inventory.custom.addButton")}
        </button>
      </div>
    </article>

    <article class="card">
      <div class="inv-actions">
        <button type="button" class="export-btn" data-action="export-inventory">
          📤 ${t("inventory.actions.export")}
        </button>
        <button type="button" class="import-btn" data-action="import-inventory">
          📥 ${t("inventory.actions.import")}
        </button>
        <button type="button" class="danger-button" data-action="clear-inventory">
          🗑️ ${t("inventory.actions.clear")}
        </button>
      </div>
    </article>
  `;

  setupDragDrop(container);
}

function buildGridCells() {
  let html = "";

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      html += `<div class="inv-cell" data-inv-cell data-col="${col}" data-row="${row}"
        style="grid-column:${col + 1};grid-row:${row + 1}"></div>`;
    }
  }

  return html;
}

function buildGridItems(items) {
  return items.map((item) => `
    <div class="inv-item" data-inv-item="${item.id}"
      style="grid-column:${item.col + 1}/span ${item.sizeX};grid-row:${item.row + 1}/span ${item.sizeY}">
      <span class="inv-item-emoji">${item.emoji}</span>
      <span class="inv-item-name">${escapeHtml(item.name)}</span>
      <button type="button" class="inv-item-remove"
        data-action="remove-from-inventory"
        data-item-id="${item.id}"
        title="${t("inventory.removeItem")}">✕</button>
    </div>
  `).join("");
}

// ── Drag & Drop ─────────────────────────────────────────────────────────────

function setupDragDrop(container) {
  const grid = container.querySelector("[data-inv-grid]");
  const palette = container.querySelector("[data-inv-palette]");
  if (!grid || !palette) return;

  for (const paletteItem of palette.querySelectorAll(".inv-palette-item")) {
    paletteItem.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startDragFromPalette(e, paletteItem, grid);
    });
  }

  for (const gridItem of grid.querySelectorAll(".inv-item")) {
    gridItem.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("[data-action]")) return;
      e.preventDefault();
      startDragFromGrid(e, gridItem, grid);
    });
  }
}

function startDragFromPalette(e, paletteItem, grid) {
  const key = paletteItem.dataset.templateKey;
  const sizeX = parseInt(paletteItem.dataset.sizeX);
  const sizeY = parseInt(paletteItem.dataset.sizeY);

  dragState = {
    type: "palette",
    templateKey: key,
    sizeX,
    sizeY,
    ghost: createGhost(paletteItem, sizeX, sizeY, e),
    grid,
  };

  document.addEventListener("pointermove", onDragMove);
  document.addEventListener("pointerup", onDragEnd);
}

function startDragFromGrid(e, gridItem, grid) {
  const itemId = gridItem.dataset.invItem;
  const item = state.inventory.items.find((i) => i.id === itemId);
  if (!item) return;

  dragState = {
    type: "grid",
    itemId,
    sizeX: item.sizeX,
    sizeY: item.sizeY,
    ghost: createGhost(gridItem, item.sizeX, item.sizeY, e),
    grid,
  };

  gridItem.classList.add("inv-item-dragging");

  document.addEventListener("pointermove", onDragMove);
  document.addEventListener("pointerup", onDragEnd);
}

function createGhost(el, sizeX, sizeY, e) {
  const ghost = document.createElement("div");
  ghost.className = "inv-drag-ghost";

  const w = sizeX * CELL_SIZE + (sizeX - 1) * CELL_GAP;
  const h = sizeY * CELL_SIZE + (sizeY - 1) * CELL_GAP;
  ghost.style.width = `${w}px`;
  ghost.style.height = `${h}px`;
  ghost.style.left = `${e.clientX - w / 2}px`;
  ghost.style.top = `${e.clientY - h / 2}px`;
  ghost.innerHTML = el.querySelector(".inv-palette-emoji, .inv-item-emoji")?.outerHTML || "";

  document.body.appendChild(ghost);
  return ghost;
}

function onDragMove(e) {
  if (!dragState) return;

  const ghost = dragState.ghost;
  ghost.style.left = `${e.clientX - ghost.offsetWidth / 2}px`;
  ghost.style.top = `${e.clientY - ghost.offsetHeight / 2}px`;

  clearHighlights(dragState.grid);
  const cell = getCellUnderPointer(e, dragState.grid);

  if (cell) {
    highlightCells(dragState.grid, cell.col, cell.row, dragState.sizeX, dragState.sizeY);
  }
}

function onDragEnd(e) {
  if (!dragState) return;

  document.removeEventListener("pointermove", onDragMove);
  document.removeEventListener("pointerup", onDragEnd);

  dragState.ghost.remove();
  clearHighlights(dragState.grid);

  const cell = getCellUnderPointer(e, dragState.grid);
  const ds = dragState;
  dragState = null;

  if (cell) {
    if (ds.type === "palette") {
      placeItemAt(ds.templateKey, cell.col, cell.row);
    } else if (ds.type === "grid") {
      moveItem(ds.itemId, cell.col, cell.row);
    }
  } else if (ds.type === "grid") {
    const dragging = ds.grid.querySelector(`[data-inv-item="${ds.itemId}"]`);
    if (dragging) dragging.classList.remove("inv-item-dragging");
  }
}

function getCellUnderPointer(e, grid) {
  const rect = grid.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (x < 0 || y < 0) return null;

  const step = CELL_SIZE + CELL_GAP;
  const col = Math.floor(x / step);
  const row = Math.floor(y / step);

  if (col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS) {
    return { col, row };
  }

  return null;
}

function highlightCells(grid, col, row, sizeX, sizeY) {
  const items = state.inventory?.items || [];
  const excludeId = dragState?.type === "grid" ? dragState.itemId : null;
  const valid = canPlace(items, col, row, sizeX, sizeY, excludeId);
  const cls = valid ? "inv-cell-valid" : "inv-cell-invalid";

  for (let dy = 0; dy < sizeY; dy++) {
    for (let dx = 0; dx < sizeX; dx++) {
      const c = col + dx;
      const r = row + dy;

      if (c < GRID_COLS && r < GRID_ROWS) {
        const cell = grid.querySelector(`[data-col="${c}"][data-row="${r}"]`);
        if (cell) cell.classList.add(cls);
      }
    }
  }
}

function clearHighlights(grid) {
  for (const cell of grid.querySelectorAll(".inv-cell-valid,.inv-cell-invalid")) {
    cell.classList.remove("inv-cell-valid", "inv-cell-invalid");
  }
}
