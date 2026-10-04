// The only interface between the pages (editor Play tab, tester page) and the rules.
// Results are plain objects in the shape board.js renders.

import { TILE_TYPES, SUBSTRATE_TYPES, toCell, toCoord } from "../game/types.js";
import { TARGETS } from "../game/targets.js";
import { EFFECTS } from "../game/effects.js";
import { parseLevel, upgradeLevel, LEVEL_VERSION } from "../game/level.js";
import { startGame, handle, selection } from "../game/controller.js";

export { upgradeLevel };

const SAMPLE_TARGETS = { fixed: { kind: "fixed", coords: [] }, from: { kind: "from", coords: [] }, any: { kind: "any", count: 1 }, adjacent: { kind: "adjacent", count: 2 }, card: { kind: "card" } };

// games after each completed play; the last is where the current game started its play
let history = [];
let redoStack = [];
let game = null;

export function catalog() {
  return {
    level_version: LEVEL_VERSION,
    tiles: Object.entries(TILE_TYPES).map(([id, type]) => ({ id, can_flip: type.canFlip, can_swap: type.canSwap })),
    substrates: Object.entries(SUBSTRATE_TYPES).map(([id, type]) => ({ id, period: type.period })),
    effects: Object.entries(EFFECTS).map(([id, effect]) => ({ id, kinds: Object.keys(TARGETS).filter((kind) => effect.accepts(SAMPLE_TARGETS[kind])) })),
  };
}

export function validate(level) {
  try {
    parseLevel(level);
    return null;
  } catch (error) {
    return error.message;
  }
}

export function start(level) {
  game = startGame(parseLevel(level));
  history = [game];
  redoStack = [];
  return snapshot();
}

function requireGame() {
  if (!game) throw new Error("no game started");
}

function tap(intent) {
  requireGame();
  const next = handle(game, intent);
  if (next.state.plays !== game.state.plays) {
    history.push(next);
    redoStack = [];
  }
  game = next;
  return snapshot();
}

export const tapTile = (row, col) => tap({ tap: "tile", cell: toCell(game?.state.level.width ?? 0, [row, col]) });
export const tapCard = (index) => tap({ tap: "card", index });
export const tapNothing = () => tap({ tap: "nothing" });

// both drop a half-made selection
export function undo() {
  requireGame();
  if (history.length > 1) redoStack.push(history.pop());
  game = history.at(-1);
  return snapshot();
}

export function redo() {
  requireGame();
  if (redoStack.length) history.push(redoStack.pop());
  game = history.at(-1);
  return snapshot();
}

const coords = (cells) => cells.map((cell) => toCoord(game.state.level.width, cell));

function view(sel) {
  return { candidate_tiles: coords(sel.candidateTiles), candidate_cards: sel.candidateCards, preview: coords(sel.preview), blocked: coords(sel.blocked) };
}

// what card index would offer and change if it were selected, without selecting it
export function peek(index) {
  requireGame();
  return view(selection(game.state, index, []));
}

export function snapshot() {
  requireGame();
  const { state, phase } = game;
  const { level } = state;
  const targetingCard = phase.kind === "targeting";
  const sel = targetingCard ? selection(state, phase.index, phase.picks) : null;
  return {
    width: level.width,
    height: level.height,
    cells: state.tiles.map((tile, cell) => ({
      type: tile.type,
      flipped: tile.flipped,
      link: tile.link,
      substrate: level.substrates[cell],
      period: SUBSTRATE_TYPES[level.substrates[cell]].period,
      counter: state.counters[cell],
    })),
    hand: state.hand.map((card) => ({
      label: `${card.effect}\n${TARGETS[card.target.kind].describe(card.target)}`,
      single_use: card.single_use,
      copy: card.copy,
      effect: card.effect,
      kind: card.target.kind,
      target: card.target,
    })),
    plays: state.plays,
    picked: targetingCard ? coords(phase.picks) : [],
    ...(sel ? view(sel) : { candidate_tiles: [], candidate_cards: [], preview: [], blocked: [] }),
    needed: sel ? sel.needed : 0,
    selected: targetingCard ? phase.index : null,
    targeting: targetingCard,
    game_over: phase.kind === "over",
    won: phase.kind === "won",
    can_undo: history.length > 1,
    can_redo: redoStack.length > 0,
  };
}
