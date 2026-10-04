// Card effects. Tile effects (onTiles) work out their result in plan(), and apply() carries
// out exactly that plan, so the preview can't drift from what a play does.
// Adding an effect means adding an entry here; the editor picks it up through catalog().

import { TILE_TYPES, canFlipAt } from "./types.js";

const swappable = (state, cell) => TILE_TYPES[state.tiles[cell].type].canSwap;

export const EFFECTS = {
  // flipping a linked tile flips its whole link group
  flip: {
    onTiles: true,
    accepts: (target) => target.kind !== "card",
    canPick: () => true,
    plan(state, cells) {
      const affected = new Set();
      for (const cell of cells) {
        if (!canFlipAt(state, cell)) continue;
        const link = state.tiles[cell].link;
        if (link === null) affected.add(cell);
        else state.tiles.forEach((tile, other) => tile.link === link && affected.add(other));
      }
      return {
        affected: [...affected].sort((a, b) => a - b),
        blocked: cells.filter((cell) => !canFlipAt(state, cell)),
      };
    },
    apply(state, cells) {
      const tiles = [...state.tiles];
      for (const cell of this.plan(state, cells).affected) tiles[cell] = { ...tiles[cell], flipped: !tiles[cell].flipped };
      return tiles;
    },
  },
  // makes a single-use copy of another card with fixed <-> from swapped
  retarget: {
    onTiles: false,
    accepts: (target) => target.kind === "card",
    canModify: (target) => target.kind === "fixed" || target.kind === "from",
    apply(card) {
      if (!this.canModify(card.target)) throw new Error(`can't retarget a ${card.target.kind} card`);
      const kind = card.target.kind === "fixed" ? "from" : "fixed";
      return { ...card, target: { kind, coords: card.target.coords }, single_use: true, copy: true };
    },
  },
  // substrates stay where they are
  swap: {
    onTiles: true,
    accepts: (target) => target.kind === "adjacent" && target.count === 2,
    canPick: swappable,
    plan(state, cells) {
      const ok = cells.length === 2 && cells.every((cell) => swappable(state, cell));
      return { affected: ok ? [...cells] : [], blocked: [] };
    },
    apply(state, cells) {
      if (cells.length !== 2) throw new Error(`swap expects 2 tiles, got ${cells.length}`);
      const tiles = [...state.tiles];
      const [a, b] = this.plan(state, cells).affected;
      if (a !== undefined) [tiles[a], tiles[b]] = [tiles[b], tiles[a]];
      return tiles;
    },
  },
};

export const canModify = (effect, target) => !EFFECTS[effect].onTiles && EFFECTS[effect].canModify(target);
