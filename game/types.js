// Registries of tile and substrate types. Their order is the editor's palette order.

export const TILE_TYPES = {
  basic: { canFlip: true, canSwap: true },
  notflippable: { canFlip: false, canSwap: true },
  notswappable: { canFlip: true, canSwap: false },
};

export const SUBSTRATE_TYPES = {
  plain: { period: 0 },
  oneturn: { period: 1 },
  twoturn: { period: 2 },
};

// cells are flat indices (width * row + col); levels and the UI use [row, col]
export const toCell = (width, [row, col]) => width * row + col;
export const toCoord = (width, cell) => [Math.floor(cell / width), cell % width];

export function isAdjacent(width, a, b) {
  const [ar, ac] = toCoord(width, a);
  const [br, bc] = toCoord(width, b);
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

export function canFlipAt(state, cell) {
  return TILE_TYPES[state.tiles[cell].type].canFlip && state.counters[cell] === 0;
}
