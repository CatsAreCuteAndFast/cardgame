import { parseLevel, upgradeLevel, LEVEL_VERSION } from "../game/level.js";
import { newState, applyMove, legalMoves, isWon, stateKey } from "../game/state.js";
import { startGame, handle, selection } from "../game/controller.js";
import { EFFECTS } from "../game/effects.js";
import { TARGETS } from "../game/targets.js";
import { toCell } from "../game/types.js";
import * as bridge from "../editor/bridge.js";

const fetchJson = async (path) => (await fetch(path, { cache: "no-store" })).json();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function rejects(level, message) {
  try {
    parseLevel(level);
  } catch {
    return;
  }
  throw new Error(message);
}

async function testLevels() {
  const demo = await fetchJson("../levels/demo.json");
  const level = parseLevel(demo);
  assert(level.width === 3 && level.height === 3 && level.cards.length === 5, "demo level shape");
  assert(level.links[toCell(3, [0, 1])] === "0" && level.links[toCell(3, [2, 0])] === "0", "demo link group");

  const flipped = parseLevel({ ...demo, flipped: [[0, 0], [1, 2]] });
  assert(same(newState(flipped).tiles.flatMap((tile, cell) => (tile.flipped ? [cell] : [])), [0, 5]), "flipped tiles start flipped");

  const timed = parseLevel({ ...demo, counters: [[1, 1, 0], [1, 2, 1]] });
  assert(same(timed.counters.slice(3, 6), [0, 0, 1]) && timed.counters[7] === 1, "starting counters");
  for (const bad of [[[1, 1, 2]], [[0, 0, 1]], [[1, 1, 0], [1, 1, 1]], [[5, 5, 0]]]) {
    rejects({ ...demo, counters: bad }, `counters ${JSON.stringify(bad)} should be rejected`);
  }
  rejects({ ...demo, flipped: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]] }, "an already solved level should be rejected");
  rejects({ ...demo, cards: [{ effect: "swap", target: { kind: "any", count: 2 } }] }, "swap only takes adjacent 2");
  rejects({ ...demo, budget: 0 }, "a budget below 1 should be rejected");
  rejects({ ...demo, flipped: [[0, 0, 7]] }, "a flipped coord with an extra number should be rejected");
  rejects({ ...demo, links: [[[0, 1, 0], [2, 0]]] }, "a link coord with an extra number should be rejected");
  rejects({ ...demo, counters: [[1, 1, 0, 0]] }, "a counter with an extra number should be rejected");
  rejects({ ...demo, cards: [{ effect: "flip", target: { kind: "toString" } }] }, "inherited object keys aren't target kinds");
  rejects({ ...demo, cards: [{ effect: "flip", target: { kind: "from", coords: [] } }] }, "a choose-from card needs tiles");
  rejects({ ...demo, cards: [{ effect: "flip", target: { kind: "fixed", coords: [] } }] }, "a fixed card needs tiles");

  const { version, ...unversioned } = demo;
  assert(version === LEVEL_VERSION, "levels/demo.json should be at the current level version");
  assert(upgradeLevel(unversioned).version === LEVEL_VERSION && parseLevel(unversioned).width === 3, "a level without a version is version 1");
  rejects({ ...demo, version: LEVEL_VERSION + 1 }, "a level from a newer game should be rejected");
  rejects({ ...demo, version: "1" }, "a non-integer version should be rejected");
}

async function testPack() {
  const pack = await fetchJson("../levels/pack.json");
  assert(Array.isArray(pack), "levels/pack.json should be a list");
  for (const entry of pack) {
    assert(typeof entry?.name === "string" && "level" in entry, `bad pack entry ${JSON.stringify(entry)}`);
    try {
      assert(entry.level.version === LEVEL_VERSION, "at the current level version");
      parseLevel(entry.level);
    } catch (error) {
      throw new Error(`pack level ${entry.name} is invalid: ${error.message}`);
    }
    const check = bridge.checkSolution(entry.level, entry.solution);
    assert(!check.error, `pack level ${entry.name}: ${entry.solution ? check.error : "no solution saved; win it in the editor's Play tab, Save solution, and copy the folder again"}`);
  }
}

// the preview (plan) must match what the play does, and plays must not change the old state
async function testMovesMatchPreview() {
  const pack = await fetchJson("../levels/pack.json");
  const levels = [await fetchJson("../levels/demo.json"), ...pack.map((entry) => entry.level)].map(parseLevel);
  for (const level of levels) {
    let frontier = [newState(level)];
    const seen = new Set();
    for (let depth = 0; depth < 3 && frontier.length; depth++) {
      const next = [];
      for (const state of frontier) {
        const before = JSON.stringify(state);
        for (const move of legalMoves(state)) {
          const after = applyMove(state, move);
          assert(JSON.stringify(state) === before, "applyMove changed its input");
          assert(after.plays === state.plays - 1, "a move uses one play");
          const card = state.hand[move.card];
          if (EFFECTS[card.effect].onTiles) {
            const cells = TARGETS[card.target.kind].resolve(card.target, move.cells, level.width);
            const { affected } = EFFECTS[card.effect].plan(state, cells);
            const changed = state.tiles.flatMap((tile, cell) => (same(tile, after.tiles[cell]) ? [] : [cell]));
            assert(changed.every((cell) => affected.includes(cell)), `move ${JSON.stringify(move)} changed tiles outside its preview`);
          }
          const key = stateKey(after);
          if (!seen.has(key) && after.plays > 0 && !isWon(after)) {
            seen.add(key);
            next.push(after);
          }
        }
      }
      frontier = next.slice(0, 200);
    }
  }
}

async function testCardPlay() {
  const level = parseLevel(await fetchJson("../levels/demo.json"));
  const cell = (row, col) => toCell(3, [row, col]);
  let game = startGame(level);
  const tap = (intent) => (game = handle(game, intent));

  const peek = selection(game.state, 0, []);
  assert(same(peek.preview, [cell(0, 1), cell(2, 0), cell(2, 2)]) && game.phase.kind === "idle", "peeking must not select");
  assert(same(selection(game.state, 3, []).candidateCards, [0, 1]), "retarget can change the fixed and choose-from cards");

  tap({ tap: "card", index: 0 });
  let sel = selection(game.state, 0, game.phase.picks);
  assert(same(sel.preview, [cell(0, 1), cell(2, 0), cell(2, 2)]) && sel.blocked.length === 0 && sel.needed === 1, "fixed flip preview");
  assert(same(sel.candidateTiles, [cell(0, 1), cell(2, 2)]), "a fixed card is played by picking one of its tiles");

  tap({ tap: "tile", cell: cell(0, 0) });
  assert(game.phase.kind === "targeting" && game.phase.index === 0, "a tile outside a fixed card is ignored");
  tap({ tap: "card", index: 0 });
  assert(game.phase.kind === "idle", "tapping the selected card again deselects it");

  tap({ tap: "card", index: 2 });
  tap({ tap: "tile", cell: cell(0, 2) });
  sel = selection(game.state, 2, game.phase.picks);
  assert(same(sel.blocked, [cell(0, 2)]) && sel.preview.length === 0, "notflippable should be blocked");

  tap({ tap: "card", index: 4 });
  tap({ tap: "tile", cell: cell(0, 0) });
  sel = selection(game.state, 4, game.phase.picks);
  assert(sel.needed === 2 && sel.preview.length === 0, "swap with one pick previews nothing");

  tap({ tap: "card", index: 0 });
  tap({ tap: "tile", cell: cell(2, 2) });
  assert(game.state.plays === 999 && game.state.tiles[cell(2, 0)].flipped, "fixed flip should play");
}

async function testBridgeUndo() {
  bridge.start(await fetchJson("../levels/demo.json"));
  bridge.tapCard(0);
  let snap = bridge.tapTile(2, 2);
  assert(snap.plays === 999 && snap.can_undo && !snap.can_redo, "one play recorded");
  bridge.tapCard(1);
  snap = bridge.undo();
  assert(snap.plays === 1000 && snap.selected === null && snap.can_redo, "undo drops the selection and the play");
  snap = bridge.redo();
  assert(snap.plays === 999 && snap.cells[6].flipped, "redo restores the play");
  assert(same(bridge.solution(), [{ card: 0, tiles: [[2, 2]] }]), "the bridge lists the moves played");
  const id = snap.game_id;
  assert(bridge.undo().game_id === id && bridge.start(await fetchJson("../levels/demo.json")).game_id === id + 1, "only start() begins a new game");
  bridge.start(await fetchJson("../levels/demo.json"));
  bridge.tapCard(0);
  bridge.tapTile(2, 2);
  const demo = await fetchJson("../levels/demo.json");
  assert(bridge.checkSolution(demo, bridge.solution()).error.includes("don't win"), "a solution must win");
  assert(bridge.checkSolution(demo, [{ card: 0, tiles: [[0, 0]] }]).error.includes("can't pick"), "a fixed card can't pick a tile it doesn't list");
  assert(bridge.checkSolution(demo, [{ card: 9, tiles: [] }]).error.includes("no card 10"), "a missing card is reported from 1");
  const two = { budget: 3, tiles: [["basic", "basic"]], substrates: [["plain", "plain"]], cards: [{ effect: "flip", target: { kind: "fixed", coords: [[0, 0], [0, 1]] } }, { effect: "swap", target: { kind: "adjacent", count: 2 } }] };
  assert(bridge.checkSolution(two, [{ card: 0, tiles: [[0, 0]] }]).plays === 1, "a one-move solution");
  assert(bridge.checkSolution(two, [{ card: 0, tiles: [[0, 0]] }, { card: 1, tiles: [[0, 0], [0, 1]] }]).error.includes("already won"), "no moves after the win");
  const retarget = { budget: 2, tiles: [["basic"]], substrates: [["plain"]], cards: [{ effect: "flip", target: { kind: "fixed", coords: [[0, 0]] } }, { effect: "retarget", target: { kind: "card" } }] };
  assert(bridge.checkSolution(retarget, [{ card: 1, target: "0" }, { card: 2, tiles: [[0, 0]] }]).error.includes("card index"), "a target must be a number");
}

export const TESTS = { testLevels, testPack, testMovesMatchPreview, testCardPlay, testBridgeUndo };
