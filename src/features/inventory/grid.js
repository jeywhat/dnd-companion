export const GRID_COLS = 8;
export const GRID_ROWS = 4;
export const CELL_SIZE = 64;
export const CELL_GAP = 2;

export function buildOccupancy(items) {
  const grid = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));

  for (const item of items) {
    for (let dy = 0; dy < item.sizeY; dy++) {
      for (let dx = 0; dx < item.sizeX; dx++) {
        const r = item.row + dy;
        const c = item.col + dx;

        if (r < GRID_ROWS && c < GRID_COLS) {
          grid[r][c] = item.id;
        }
      }
    }
  }

  return grid;
}

export function canPlace(items, col, row, sizeX, sizeY, excludeId = null) {
  if (col < 0 || row < 0 || col + sizeX > GRID_COLS || row + sizeY > GRID_ROWS) {
    return false;
  }

  const filtered = excludeId ? items.filter((i) => i.id !== excludeId) : items;
  const grid = buildOccupancy(filtered);

  for (let dy = 0; dy < sizeY; dy++) {
    for (let dx = 0; dx < sizeX; dx++) {
      if (grid[row + dy][col + dx] !== null) return false;
    }
  }

  return true;
}

export function findFreeSlot(items, sizeX, sizeY) {
  for (let row = 0; row <= GRID_ROWS - sizeY; row++) {
    for (let col = 0; col <= GRID_COLS - sizeX; col++) {
      if (canPlace(items, col, row, sizeX, sizeY)) {
        return { col, row };
      }
    }
  }

  return null;
}

export function totalWeight(items) {
  return items.reduce((sum, item) => sum + (item.weight || 0), 0);
}
