export const CELL_SIZE = 64;
export const CELL_GAP = 2;
export const MAX_COLS = 12;
export const MAX_ROWS = 8;

export function buildOccupancy(items, cols, rows) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));

  for (const item of items) {
    for (let dy = 0; dy < item.sizeY; dy++) {
      for (let dx = 0; dx < item.sizeX; dx++) {
        const r = item.row + dy;
        const c = item.col + dx;

        if (r < rows && c < cols) {
          grid[r][c] = item.id;
        }
      }
    }
  }

  return grid;
}

export function canPlace(items, cols, rows, col, row, sizeX, sizeY, excludeId = null) {
  if (col < 0 || row < 0 || col + sizeX > cols || row + sizeY > rows) {
    return false;
  }

  const filtered = excludeId ? items.filter((i) => i.id !== excludeId) : items;
  const grid = buildOccupancy(filtered, cols, rows);

  for (let dy = 0; dy < sizeY; dy++) {
    for (let dx = 0; dx < sizeX; dx++) {
      if (grid[row + dy][col + dx] !== null) return false;
    }
  }

  return true;
}

export function findFreeSlot(items, cols, rows, sizeX, sizeY) {
  for (let row = 0; row <= rows - sizeY; row++) {
    for (let col = 0; col <= cols - sizeX; col++) {
      if (canPlace(items, cols, rows, col, row, sizeX, sizeY)) {
        return { col, row };
      }
    }
  }

  return null;
}

export function totalWeight(containers) {
  let sum = 0;

  for (const container of containers) {
    for (const item of container.items) {
      sum += item.weight || 0;
    }
  }

  return sum;
}

export function itemsFitInGrid(items, cols, rows) {
  return items.every(
    (item) => item.col + item.sizeX <= cols && item.row + item.sizeY <= rows
  );
}
