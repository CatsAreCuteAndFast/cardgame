// The Play tab: playtesting the open level with the real rules, and saving a solution.

import { $, toast, playPrompt, playStatus, renderSnapshot, attachPlayInput } from "./board.js";
import * as bridge from "./bridge.js";
import { current, saveLevels } from "./store.js";
import { render } from "./editor.js";

let snapshot = null;
let levelJson = null;
let error = null;

// (re)starts when nothing is running or the level was edited since
function startPlay() {
  const level = current();
  snapshot = null;
  error = null;
  levelJson = level ? JSON.stringify(level.data) : null;
  if (!level) error = "Pick or create a level first.";
  else {
    error = bridge.validate(level.data);
    if (!error) snapshot = callBridge(() => bridge.start(level.data));
  }
}

function callBridge(call) {
  try {
    return call();
  } catch (failure) {
    error = String(failure.message ?? failure);
    return null;
  }
}

export function renderPlay() {
  const level = current();
  if (!snapshot || levelJson !== (level ? JSON.stringify(level.data) : null)) startPlay();
  const errorBox = $("play-error");
  errorBox.hidden = !error;
  errorBox.textContent = error ?? "";
  const board = $("play-board");
  const hand = $("play-hand");
  const status = $("play-status");
  status.className = "";
  status.textContent = "";
  const snap = snapshot;
  $("play-undo").disabled = !snap?.can_undo;
  $("play-redo").disabled = !snap?.can_redo;
  $("play-cancel").hidden = !(snap && snap.selected !== null);
  $("play-save-solution").hidden = !snap?.won;
  $("play-prompt").textContent = snap ? playPrompt(snap) : "";
  if (!snap) {
    board.replaceChildren();
    hand.replaceChildren();
    return;
  }

  const { text, className } = playStatus(snap, level.data.budget);
  status.textContent = text;
  status.className = className;
  renderSnapshot(snap, board, hand, {
    onTile: (row, col) => playTap(() => bridge.tapTile(row, col)),
    onCard: (index) => playTap(() => bridge.tapCard(index)),
  });
}

function playTap(call) {
  if (!snapshot) return;
  snapshot = callBridge(call);
  render();
}

function saveSolution() {
  const level = current();
  if (!level || !snapshot?.won) return;
  level.solution = bridge.solution();
  level.updated = Date.now();
  saveLevels();
  toast(`Solution saved (${level.solution.length} play${level.solution.length === 1 ? "" : "s"})`);
  render();
}

export function initPlay() {
  const button = (id, action) =>
    $(id).addEventListener("click", (e) => {
      e.stopPropagation();
      action();
    });
  button("play-reset", () => {
    snapshot = null;
    render();
  });
  button("play-undo", () => playTap(() => bridge.undo()));
  button("play-redo", () => playTap(() => bridge.redo()));
  button("play-save-solution", saveSolution);
  button("play-cancel", () => playTap(() => bridge.tapNothing()));
  $("play").addEventListener("click", (e) => {
    if (e.target.closest("button, .cell")) return;
    playTap(() => bridge.tapNothing());
  });
  attachPlayInput($("play-board"), $("play-hand"), {
    snap: () => snapshot,
    card: (index) => playTap(() => bridge.tapCard(index)),
    tile: (row, col) => playTap(() => bridge.tapTile(row, col)),
    nothing: () => playTap(() => bridge.tapNothing()),
    peek: (index) => {
      try {
        return bridge.peek(index);
      } catch {
        return null;
      }
    },
    render,
  });
}
