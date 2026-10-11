// Registries of tile and substrate types. Their order is the editor's palette order.

// states: 2 is off/lit, 3 is off/half/lit (each flip moves one step, lit wraps to off)
export const TILE_TYPES = {
  basic: { canFlip: true, canSwap: true, states: 2 },
  notflippable: { canFlip: false, canSwap: true, states: 2 },
  notswappable: { canFlip: true, canSwap: false, states: 2 },
  double: { canFlip: true, canSwap: true, states: 3 },
};

// ticks: "play" timers count down on every play, "neighbour" timers once for each orthogonal neighbour that flips
export const SUBSTRATE_TYPES = {
  plain: { period: 0, ticks: "play" },
  oneturn: { period: 1, ticks: "play" },
  twoturn: { period: 2, ticks: "play" },
  oneneighbour: { period: 1, ticks: "neighbour" },
  twoneighbour: { period: 2, ticks: "neighbour" },
};

// cells are flat indices (width * row + col); levels and the UI use [row, col]
export const toCell = (width, [row, col]) => width * row + col;
export const toCoord = (width, cell) => [Math.floor(cell / width), cell % width];

export function isAdjacent(width, a, b) {
  const [ar, ac] = toCoord(width, a);
  const [br, bc] = toCoord(width, b);
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

// one flip: off -> lit -> off, or off -> half -> lit -> off for a three-state tile
export function flipTile(tile) {
  if (tile.flipped) return { ...tile, flipped: false, half: false };
  if (TILE_TYPES[tile.type].states === 3 && !tile.half) return { ...tile, half: true };
  return { ...tile, flipped: true, half: false };
}

export function canFlipAt(state, cell) {
  return TILE_TYPES[state.tiles[cell].type].canFlip && state.counters[cell] === 0;
}
