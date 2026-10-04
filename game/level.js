// Turns level JSON into a checked level. Every check lives here; parseLevel throws an Error
// with a readable message when the level is invalid.

import { TILE_TYPES, SUBSTRATE_TYPES, toCell } from "./types.js";
import { TARGETS, parseTarget } from "./targets.js";
import { EFFECTS } from "./effects.js";

const has = (registry, id) => Object.hasOwn(registry, id);
const fmt = ([row, col]) => `(${row},${col})`;

function list(data, what) {
  if (!Array.isArray(data)) throw new Error(`${what} should be a list`);
  return data;
}

function grid(data, what, registry, width) {
  const rows = list(data, what);
  if (rows.length === 0) throw new Error(`level has no ${what}`);
  const w = width ?? (Array.isArray(rows[0]) ? rows[0].length : 0);
  if (w === 0) throw new Error(`level has no ${what}`);
  return rows.flatMap((row, r) => {
    if (!Array.isArray(row) || row.length !== w) throw new Error(`${what} row ${r} has ${row?.length ?? 0} entries instead of ${w}`);
    return row.map((id, c) => {
      if (!has(registry, id)) throw new Error(`unknown ${what.replace(/s$/, "")} type ${JSON.stringify(id)} at (${r},${c})`);
      return id;
    });
  });
}

function coord(data, width, height, what) {
  if (!Array.isArray(data) || data.length < 2 || !data.slice(0, 2).every(Number.isInteger)) {
    throw new Error(`${what} has a bad coord ${JSON.stringify(data)}`);
  }
  const [row, col] = data;
  if (!(row >= 0 && row < height && col >= 0 && col < width)) throw new Error(`${what} ${fmt(data)} is outside the ${width}x${height} board`);
  return toCell(width, data);
}

function card(data, index, width, height) {
  const what = `card ${index}`;
  if (typeof data !== "object" || data === null) throw new Error(`${what} is not an object`);
  if (!has(EFFECTS, data.effect)) throw new Error(`${what} has unknown effect ${JSON.stringify(data.effect)}`);
  const target = parseTarget(data.target, what);
  if (!EFFECTS[data.effect].accepts(target)) throw new Error(`${what}: ${data.effect} can't use target kind "${target.kind}"`);
  TARGETS[target.kind].check(target, width, height, what);
  return { effect: data.effect, target, single_use: Boolean(data.single_use), copy: false };
}

export function parseLevel(data) {
  if (typeof data !== "object" || data === null) throw new Error("level should be an object");
  if (!Number.isInteger(data.budget)) throw new Error("budget should be a whole number");
  const tiles = grid(data.tiles, "tiles", TILE_TYPES);
  const width = data.tiles[0].length;
  const height = data.tiles.length;
  if (!Array.isArray(data.substrates) || data.substrates.length !== height) {
    throw new Error(`substrate grid has ${data.substrates?.length ?? 0} rows, expected ${height}`);
  }
  const substrates = grid(data.substrates, "substrates", SUBSTRATE_TYPES, width);
  const cards = list(data.cards, "cards").map((entry, index) => card(entry, index, width, height));

  const links = Array(width * height).fill(null);
  list(data.links ?? [], "links").forEach((group, index) => {
    if (list(group, `link group ${index}`).length < 2) throw new Error(`link group ${index} has ${group.length} members, it needs at least 2`);
    for (const entry of group) {
      const cell = coord(entry, width, height, `link group ${index}`);
      if (links[cell] !== null) throw new Error(`${fmt(entry)} is in more than one link group`);
      links[cell] = String(index);
    }
  });

  const flipped = list(data.flipped ?? [], "flipped").map((entry) => coord(entry, width, height, "flipped tile"));
  if (new Set(flipped).size !== flipped.length) throw new Error("a tile is listed as flipped more than once");
  if (flipped.length === width * height) throw new Error("every tile starts flipped, so the level is already solved");

  const counters = substrates.map((id) => SUBSTRATE_TYPES[id].period);
  const seen = new Set();
  for (const entry of list(data.counters ?? [], "counters")) {
    const cell = coord(entry, width, height, "substrate counter");
    if (seen.has(cell)) throw new Error(`substrate counter for ${fmt(entry)} is listed more than once`);
    seen.add(cell);
    const period = SUBSTRATE_TYPES[substrates[cell]].period;
    if (!(Number.isInteger(entry[2]) && entry[2] >= 0 && entry[2] <= period)) {
      throw new Error(`substrate counter at ${fmt(entry)} is ${JSON.stringify(entry[2])}, it must be 0..${period}`);
    }
    counters[cell] = entry[2];
  }

  return { width, height, budget: data.budget, tiles, substrates, links, flipped, counters, cards };
}
