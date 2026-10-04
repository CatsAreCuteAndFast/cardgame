// Target kinds. A card's target is stored as its JSON form ({kind, coords} or {kind, count}).
// Adding a kind means adding an entry here; the editor's card UI (KIND_LABELS, defaultTarget) lists kinds too.

import { toCell, isAdjacent } from "./types.js";

function parseCoords(data, what) {
  if (!Array.isArray(data)) throw new Error(`${what} should be a list of [row, col]`);
  return data.map((coord) => {
    if (!Array.isArray(coord) || coord.length !== 2 || !coord.every(Number.isInteger)) {
      throw new Error(`${what} has a bad coord ${JSON.stringify(coord)}`);
    }
    return [coord[0], coord[1]];
  });
}

function parseCount(data, what) {
  if (!Number.isInteger(data)) throw new Error(`${what} should be a whole number`);
  return data;
}

function checkCoords(coords, width, height, what) {
  for (const [row, col] of coords) {
    if (!(row >= 0 && row < height && col >= 0 && col < width)) {
      throw new Error(`${what} targets (${row},${col}), outside the ${width}x${height} board`);
    }
  }
}

function checkCount(count, width, height, what) {
  if (!(count >= 1 && count <= width * height)) throw new Error(`${what} picks ${count} from a ${width * height}-tile board`);
}

const formatCoords = (coords) => coords.map(([row, col]) => `(${row},${col})`).join(",\n");
const listed = (target, cell, width) => target.coords.some((coord) => toCell(width, coord) === cell);

export const TARGETS = {
  // acts on all its coords; played by picking any one of them
  fixed: {
    onTiles: true,
    needs: () => 1,
    isCandidate: (target, picks, cell, width) => listed(target, cell, width),
    resolve: (target, picks, width) => target.coords.map((coord) => toCell(width, coord)),
    parse: (data, what) => ({ kind: "fixed", coords: parseCoords(data.coords, what) }),
    check: (target, width, height, what) => checkCoords(target.coords, width, height, what),
    describe: (target) => formatCoords(target.coords),
  },
  from: {
    onTiles: true,
    needs: () => 1,
    isCandidate: (target, picks, cell, width) => listed(target, cell, width),
    resolve: (target, picks) => picks,
    parse: (data, what) => ({ kind: "from", coords: parseCoords(data.coords, what) }),
    check: (target, width, height, what) => checkCoords(target.coords, width, height, what),
    describe: (target) => `one of\n${formatCoords(target.coords)}`,
  },
  any: {
    onTiles: true,
    needs: (target) => target.count,
    isCandidate: () => true,
    resolve: (target, picks) => picks,
    parse: (data, what) => ({ kind: "any", count: parseCount(data.count, what) }),
    check: (target, width, height, what) => checkCount(target.count, width, height, what),
    describe: (target) => `any ${target.count}`,
  },
  // each pick must be next to one already picked
  adjacent: {
    onTiles: true,
    needs: (target) => target.count,
    isCandidate: (target, picks, cell, width) => picks.length === 0 || picks.some((pick) => isAdjacent(width, pick, cell)),
    resolve: (target, picks) => picks,
    parse: (data, what) => ({ kind: "adjacent", count: parseCount(data.count, what) }),
    check: (target, width, height, what) => checkCount(target.count, width, height, what),
    describe: (target) => `any ${target.count}\nadjacent`,
  },
  card: {
    onTiles: false,
    needs: () => 1,
    isCandidate: () => false,
    resolve: () => [],
    parse: () => ({ kind: "card" }),
    check: () => {},
    describe: () => "modify\ncard",
  },
};

export function parseTarget(data, what) {
  if (typeof data !== "object" || data === null) throw new Error(`${what} has no target`);
  const kind = TARGETS[data.kind];
  if (!kind) throw new Error(`${what} has unknown target kind ${JSON.stringify(data.kind)}`);
  return kind.parse(data, what);
}

export function isCandidate(target, picks, cell, width) {
  return !picks.includes(cell) && TARGETS[target.kind].isCandidate(target, picks, cell, width);
}
