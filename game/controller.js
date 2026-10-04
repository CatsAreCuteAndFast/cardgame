// Turns taps into moves. A game is {state, phase, move}; handle() returns a new game.
// move is the last move played, set on the game a play produces.
// Phases: idle, targeting (a selected card and its picks so far), won, over.
// Intents: {tap: "card", index}, {tap: "tile", cell}, {tap: "nothing"}.

import { TARGETS } from "./targets.js";
import { EFFECTS, canModify } from "./effects.js";
import { newState, applyMove, canPick, canPlay, isWon } from "./state.js";

const IDLE = { kind: "idle" };

export const startGame = (level) => ({ state: newState(level), phase: IDLE });

const targeting = (index, picks = []) => ({ kind: "targeting", index, picks });

function play(state, move) {
  const next = applyMove(state, move);
  const phase = isWon(next) ? { kind: "won" } : canPlay(next) ? IDLE : { kind: "over" };
  return { state: next, phase, move };
}

function handleCardTarget(game, phase, intent) {
  if (intent.tap !== "card") return { ...game, phase: IDLE };
  const card = game.state.hand[phase.index];
  if (!canModify(card.effect, game.state.hand[intent.index].target)) return game;
  return play(game.state, { card: phase.index, target: intent.index });
}

function handleTileTarget(game, phase, intent) {
  const { state } = game;
  switch (intent.tap) {
    case "nothing":
      return { ...game, phase: IDLE };
    case "card":
      return { ...game, phase: intent.index === phase.index ? IDLE : targeting(intent.index) };
    case "tile": {
      if (!canPick(state, phase.index, phase.picks, intent.cell)) return game;
      const picks = [...phase.picks, intent.cell];
      const card = state.hand[phase.index];
      if (picks.length < TARGETS[card.target.kind].needs(card.target)) return { ...game, phase: targeting(phase.index, picks) };
      return play(state, { card: phase.index, cells: picks });
    }
    default:
      throw new Error(`unknown intent ${JSON.stringify(intent)}`);
  }
}

export function handle(game, intent) {
  const { state, phase } = game;
  switch (phase.kind) {
    case "won":
    case "over":
      return game;
    case "idle":
      if (!canPlay(state)) return { ...game, phase: { kind: "over" } };
      return intent.tap === "card" ? { ...game, phase: targeting(intent.index) } : game;
    case "targeting":
      return EFFECTS[state.hand[phase.index].effect].onTiles
        ? handleTileTarget(game, phase, intent)
        : handleCardTarget(game, phase, intent);
    default:
      throw new Error(`unknown phase ${JSON.stringify(phase)}`);
  }
}

// what the selected card (index) can pick next and what it would change with these picks
export function selection(state, index, picks) {
  const card = state.hand[index];
  const effect = EFFECTS[card.effect];
  const target = TARGETS[card.target.kind];
  const result = { candidateTiles: [], candidateCards: [], preview: [], blocked: [], needed: target.needs(card.target) };
  if (!effect.onTiles) {
    state.hand.forEach((other, i) => canModify(card.effect, other.target) && result.candidateCards.push(i));
    return result;
  }
  state.tiles.forEach((_, cell) => canPick(state, index, picks, cell) && result.candidateTiles.push(cell));
  const cells = card.target.kind === "fixed" ? target.resolve(card.target, picks, state.level.width) : picks;
  const { affected, blocked } = effect.plan(state, cells);
  return { ...result, preview: affected, blocked };
}
