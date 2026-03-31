import { appElement, state } from "../../app/store.js";
import { escapeHtml } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";
import { CELL_SIZE, CELL_GAP, canPlace, totalWeight } from "./grid.js";
import { getItemTemplates, getContainerPresets, moveItem, placeItemAt, CONTAINER_PRESETS } from "./handler.js";

let dragState = null;

export function renderInventory() {
  const container = appElement.querySelector("[data-inventory]");
  if (!container) return;

  const containers = state.inventory?.containers || [];
  const weight = totalWeight(containers);
  const templates = getItemTemplates();
  const presets = getContainerPresets();
  const totalItems = containers.reduce((s, c) => s + c.items.length, 0);

  container.innerHTML = `
    <article class="card">
      <div class="section-heading">
        <div>
          <h2>${t("inventory.title")}</h2>
          <p class="muted">${t("inventory.subtitle")}</p>
        </div>
        <div class="inv-header-pills">
          <span class="pill">${t("inventory.weight", { value: weight.toFixed(1) })}</span>
          <span class="pill">${t("inventory.itemCount", { count: totalItems })}</span>
        </div>
      </div>

      ${containers.length === 0 ? `
        <p class="empty-state">${t("inventory.empty")}</p>
      ` : ""}
    </article>

    ${containers.map((bag) => buildContainerCard(bag, templates)).join("")}

    <article class="card">
      <div class="section-heading">
        <div>
          <h2>${t("inventory.addContainer.title")}</h2>
          <p class="muted">${t("inventory.addContainer.subtitle")}</p>
        </div>
      </div>
      <div class="inv-container-presets">
        ${presets.map((p) => `
          <button type="button" class="inv-preset-btn" data-action="add-container" data-preset-key="${p.key}">
            <span class="inv-preset-emoji">${p.emoji}</span>
            <span class="inv-preset-name">${escapeHtml(p.name)}</span>
            <span class="inv-preset-size">${p.cols}×${p.rows}</span>
          </button>
        `).join("")}
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

  setupAllDragDrop(container);
}

function buildContainerCard(bag, templates) {
  const slotCount = bag.cols * bag.rows;
  const usedSlots = bag.items.reduce((s, item) => s + item.sizeX * item.sizeY, 0);

  return `
    <article class="card inv-container-card" data-container-id="${bag.id}">
      <div class="section-heading">
        <div>
          <h2>${bag.emoji} ${escapeHtml(bag.name)}</h2>
          <p class="muted">${bag.cols}×${bag.rows} — ${usedSlots}/${slotCount} ${t("inventory.slotsUsed")}</p>
        </div>
        <div class="inv-container-actions">
          <div class="inv-resize-dropdown">
            <button type="button" class="pill inv-resize-btn" title="${t("inventory.resize")}">↔</button>
            <div class="inv-resize-menu">
              ${CONTAINER_PRESETS.map((p) => `
                <button type="button" class="inv-resize-option${p.cols === bag.cols && p.rows === bag.rows ? " active" : ""}"
                  data-action="resize-container"
                  data-container-id="${bag.id}"
                  data-preset-key="${p.key}">
                  ${p.emoji} ${t(`inventory.container.${p.key}`)} <span class="muted">${p.cols}×${p.rows}</span>
                </button>
              `).join("")}
            </div>
          </div>
          <button type="button" class="pill danger-pill"
            data-action="remove-container"
            data-container-id="${bag.id}"
            title="${t("inventory.removeContainer")}">✕</button>
        </div>
      </div>

      <div class="inv-grid-wrapper">
        <div class="inv-grid" data-inv-grid="${bag.id}"
          style="grid-template-columns:repeat(${bag.cols},${CELL_SIZE}px);grid-template-rows:repeat(${bag.rows},${CELL_SIZE}px)">
          ${buildGridCells(bag.cols, bag.rows)}
          ${buildGridItems(bag.items)}
        </div>
      </div>

      <details class="inv-palette-details">
        <summary>${t("inventory.palette.title")}</summary>
        <div class="inv-palette" data-inv-palette="${bag.id}">
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

        <div class="inv-custom-form" data-custom-item-form>
          <p class="muted" style="margin:0.5rem 0 0.25rem;font-size:0.8rem">${t("inventory.custom.title")}</p>
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
                ${Array.from({ length: Math.min(bag.cols, 4) }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>${t("inventory.custom.height")}</span>
              <select data-field="sizeY">
                ${Array.from({ length: Math.min(bag.rows, 6) }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}
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
      </details>
    </article>
  `;
}

function buildGridCells(cols, rows) {
  let html = "";

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
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

function setupAllDragDrop(root) {
  for (const card of root.querySelectorAll("[data-container-id]")) {
    const containerId = card.dataset.containerId;
    const grid = card.querySelector(`[data-inv-grid="${containerId}"]`);
    const palette = card.querySelector(`[data-inv-palette="${containerId}"]`);
    if (!grid) continue;

    if (palette) {
      for (const paletteItem of palette.querySelectorAll(".inv-palette-item")) {
        paletteItem.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          startDragFromPalette(e, paletteItem, grid, containerId);
        });
      }
    }

    for (const gridItem of grid.querySelectorAll(".inv-item")) {
      gridItem.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest("[data-action]")) return;
        e.preventDefault();
        startDragFromGrid(e, gridItem, grid, containerId);
      });
    }
  }
}

function startDragFromPalette(e, paletteItem, grid, containerId) {
  const key = paletteItem.dataset.templateKey;
  const sizeX = parseInt(paletteItem.dataset.sizeX);
  const sizeY = parseInt(paletteItem.dataset.sizeY);

  dragState = {
    type: "palette",
    templateKey: key,
    containerId,
    sizeX,
    sizeY,
    ghost: createGhost(paletteItem, sizeX, sizeY, e),
    grid,
  };

  document.addEventListener("pointermove", onDragMove);
  document.addEventListener("pointerup", onDragEnd);
}

function startDragFromGrid(e, gridItem, grid, containerId) {
  const itemId = gridItem.dataset.invItem;
  const container = state.inventory.containers.find((c) => c.id === containerId);
  const item = container?.items.find((i) => i.id === itemId);
  if (!item) return;

  dragState = {
    type: "grid",
    itemId,
    containerId,
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
  const container = state.inventory.containers.find((c) => c.id === dragState.containerId);
  if (!container) return;

  const cell = getCellUnderPointer(e, dragState.grid, container.cols, container.rows);

  if (cell) {
    highlightCells(dragState.grid, container, cell.col, cell.row, dragState.sizeX, dragState.sizeY);
  }
}

function onDragEnd(e) {
  if (!dragState) return;

  document.removeEventListener("pointermove", onDragMove);
  document.removeEventListener("pointerup", onDragEnd);

  dragState.ghost.remove();
  clearHighlights(dragState.grid);

  const container = state.inventory.containers.find((c) => c.id === dragState.containerId);
  const cell = container
    ? getCellUnderPointer(e, dragState.grid, container.cols, container.rows)
    : null;
  const ds = dragState;
  dragState = null;

  if (cell) {
    if (ds.type === "palette") {
      placeItemAt(ds.containerId, ds.templateKey, cell.col, cell.row);
    } else if (ds.type === "grid") {
      moveItem(ds.containerId, ds.itemId, cell.col, cell.row);
    }
  } else if (ds.type === "grid") {
    const dragging = ds.grid.querySelector(`[data-inv-item="${ds.itemId}"]`);
    if (dragging) dragging.classList.remove("inv-item-dragging");
  }
}

function getCellUnderPointer(e, grid, cols, rows) {
  const rect = grid.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (x < 0 || y < 0) return null;

  const step = CELL_SIZE + CELL_GAP;
  const col = Math.floor(x / step);
  const row = Math.floor(y / step);

  if (col >= 0 && col < cols && row >= 0 && row < rows) {
    return { col, row };
  }

  return null;
}

function highlightCells(grid, container, col, row, sizeX, sizeY) {
  const excludeId = dragState?.type === "grid" ? dragState.itemId : null;
  const valid = canPlace(container.items, container.cols, container.rows, col, row, sizeX, sizeY, excludeId);
  const cls = valid ? "inv-cell-valid" : "inv-cell-invalid";

  for (let dy = 0; dy < sizeY; dy++) {
    for (let dx = 0; dx < sizeX; dx++) {
      const c = col + dx;
      const r = row + dy;

      if (c < container.cols && r < container.rows) {
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
