// The pure game core. A state is never changed in place: applyMove returns a new one.
// A move is {card, cells} for a tile card (cells are the picks) or {card, target} for a card
// that changes another card.

import { SUBSTRATE_TYPES } from "./types.js";
import { TARGETS, isCandidate } from "./targets.js";
import { EFFECTS, canModify } from "./effects.js";

export function newState(level) {
  return {
    level,
    tiles: level.tiles.map((type, cell) => ({ type, flipped: level.flipped.includes(cell), link: level.links[cell] })),
    counters: level.counters,
    hand: level.cards,
    plays: level.budget,
  };
}

export const isWon = (state) => state.tiles.every((tile) => tile.flipped);
export const canPlay = (state) => state.plays > 0;

// timed substrates count down and restart at their period after reaching 0
function tick(level, counters) {
  return counters.map((counter, cell) => {
    const period = SUBSTRATE_TYPES[level.substrates[cell]].period;
    return period === 0 ? counter : counter === 0 ? period : counter - 1;
  });
}

export function canPick(state, index, picks, cell) {
  const card = state.hand[index];
  return isCandidate(card.target, picks, cell, state.level.width) && EFFECTS[card.effect].canPick(state, cell);
}

export function applyMove(state, move) {
  if (!canPlay(state)) throw new Error("no plays left");
  const card = state.hand[move.card];
  const effect = EFFECTS[card.effect];
  let { tiles, hand } = state;
  if (effect.onTiles) {
    tiles = effect.apply(state, TARGETS[card.target.kind].resolve(card.target, move.cells, state.level.width));
  } else {
    hand = [...hand, effect.apply(hand[move.target])];
  }
  if (card.single_use) hand = hand.filter((_, index) => index !== move.card);
  return { ...state, tiles, hand, counters: tick(state.level, state.counters), plays: state.plays - 1 };
}

// every distinct move; picks that act the same (same set of tiles) are listed once
export function legalMoves(state) {
  const moves = [];
  state.hand.forEach((card, index) => {
    if (!EFFECTS[card.effect].onTiles) {
      state.hand.forEach((other, target) => canModify(card.effect, other.target) && moves.push({ card: index, target }));
      return;
    }
    const needed = TARGETS[card.target.kind].needs(card.target);
    const seen = new Set();
    const extend = (picks) => {
      if (picks.length === needed) {
        const key = card.target.kind === "fixed" ? "" : [...picks].sort((a, b) => a - b).join(",");
        if (!seen.has(key)) {
          seen.add(key);
          moves.push({ card: index, cells: picks });
        }
        return;
      }
      state.tiles.forEach((_, cell) => canPick(state, index, picks, cell) && extend([...picks, cell]));
    };
    extend([]);
  });
  return moves;
}

// identifies a position for searching (the plays left are not part of it)
export function stateKey(state) {
  const tiles = state.tiles.map((tile) => `${tile.type}${tile.flipped ? "+" : "-"}${tile.link ?? ""}`).join(" ");
  const hand = state.hand.map((card) => JSON.stringify([card.effect, card.target, card.single_use])).join(" ");
  return `${tiles}|${state.counters.join("")}|${hand}`;
}
