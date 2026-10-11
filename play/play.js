// The tester page: plays the levels in levels/pack.json.

import { $, el, playPrompt, playStatus, renderSnapshot, attachPlayInput, setText } from "../editor/board.js";
import * as bridge from "../editor/bridge.js";
import { initGrain } from "../editor/grain.js";

const PACK_PATH = "../levels/pack.json";
const SOLVED_KEY = "cardgame.tester.solved";
const LAST_KEY = "cardgame.tester.last";

let pack = [];
let packError = null;
let solved = new Set();
let tab = "levels";
let index = null;
let page = null;
let snap = null;
let playError = null;

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function callBridge(call) {
  try {
    playError = null;
    return call();
  } catch (error) {
    playError = String(error.message ?? error);
    return null;
  }
}

// pack names repeat across folders, so progress is keyed by folder and name
const levelKey = (entry) => (entry.folder ? `${entry.folder}/${entry.name}` : entry.name);
// levels are shown by their place on their page, not their editor name
function levelTitle(entry) {
  const number = pack.filter((other) => (other.folder ?? "") === (entry.folder ?? "")).indexOf(entry) + 1;
  return entry.folder ? `${entry.folder} · ${number}` : String(number);
}

function startLevel(next) {
  index = next;
  playError = null;
  page = pack[index].folder ?? "";
  writeStorage(LAST_KEY, levelKey(pack[index]));
  snap = callBridge(() => bridge.start(pack[index].level));
}

function tap(call) {
  if (!snap) return;
  snap = callBridge(call);
  if (snap?.won && !solved.has(levelKey(pack[index]))) {
    solved.add(levelKey(pack[index]));
    writeStorage(SOLVED_KEY, [...solved]);
  }
  render();
}

function peek(i) {
  try {
    return bridge.peek(i);
  } catch {
    return null;
  }
}

function render() {
  document.documentElement.style.setProperty("--top-h", `${document.querySelector(".top").offsetHeight}px`);
  for (const button of document.querySelectorAll(".tab")) button.classList.toggle("active", button.dataset.tab === tab);
  for (const screen of document.querySelectorAll(".screen")) screen.classList.toggle("active", screen.id === tab);
  $("current-name").textContent = index === null ? "" : levelTitle(pack[index]);
  if (tab === "levels") renderLevels();
  else renderPlay();
}

// each folder in the pack is a page of levels, shown as a 3-wide grid numbered in pack order
function renderLevels() {
  $("pack-error").hidden = !packError;
  $("pack-error").textContent = packError ?? "";
  const container = $("level-list");
  container.replaceChildren();
  if (!packError && pack.length === 0) container.append(el("p", { class: "empty", textContent: "No levels to test yet." }));
  const folders = [...new Set(pack.map((entry) => entry.folder ?? ""))];
  if (folders.length === 0) return;
  if (!folders.includes(page)) page = folders[0];
  const levels = pack.map((entry, i) => ({ entry, i })).filter(({ entry }) => (entry.folder ?? "") === page);
  const done = levels.filter(({ entry }) => solved.has(levelKey(entry))).length;
  container.append(
    el(
      "nav",
      { class: "segmented pages" },
      folders.map((folder, n) =>
        el("button", {
          class: folder === page ? "active" : "",
          textContent: String(n + 1),
          title: folder,
          onclick: () => ((page = folder), render()),
        }),
      ),
    ),
    el("h2", { class: "page-title" }, [page || "Levels", el("span", { class: "page-count", textContent: `${done}/${levels.length}` })]),
    el(
      "div",
      { class: "level-grid" },
      levels.map(({ entry, i }, n) =>
        el(
          "button",
          {
            class: "level-square" + (i === index ? " is-current" : "") + (solved.has(levelKey(entry)) ? " solved" : ""),
            title: entry.name,
            onclick: () => {
              startLevel(i);
              tab = "play";
              render();
              window.scrollTo(0, 0);
            },
          },
          [el("span", { class: "number", textContent: String(n + 1) }), solved.has(levelKey(entry)) ? el("span", { class: "done", textContent: "✓" }) : null],
        ),
      ),
    ),
  );
}

function renderPlay() {
  const board = $("play-board");
  const hand = $("play-hand");
  const status = $("play-status");
  $("play-empty").hidden = index !== null;
  if (index !== null && !snap && !playError) startLevel(index);
  $("play-error").hidden = !playError;
  $("play-error").textContent = playError ?? "";
  $("play-undo").disabled = !snap?.can_undo;
  $("play-redo").disabled = !snap?.can_redo;
  $("play-reset").disabled = !snap;
  $("play-next").hidden = !(snap?.won && index + 1 < pack.length);
  $("play-cancel").hidden = !(snap && snap.selected !== null);
  setText($("play-prompt"), snap ? playPrompt(snap) : "");
  const { text, className } = snap ? playStatus(snap, pack[index].level.budget) : { text: "", className: "" };
  setText(status, text, className);
  if (!snap) {
    board.replaceChildren();
    hand.replaceChildren();
    return;
  }
  renderSnapshot(snap, board, hand, {
    onTile: (row, col) => tap(() => bridge.tapTile(row, col)),
    onCard: (i) => tap(() => bridge.tapCard(i)),
  });
}

async function loadPack() {
  try {
    const response = await fetch(PACK_PATH, { cache: "no-cache" });
    if (!response.ok) throw new Error(`couldn't fetch ${PACK_PATH} (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("the level pack should be a list");
    pack = data.filter((entry) => entry && typeof entry.name === "string" && entry.level);
  } catch (error) {
    packError = "Couldn't load the levels: " + (error.message ?? error);
  }
  const last = readStorage(LAST_KEY, null);
  const found = pack.findIndex((entry) => levelKey(entry) === last);
  if (found !== -1) {
    index = found;
    page = pack[found].folder ?? "";
  }
  render();
}

function init() {
  initGrain();
  solved = new Set(readStorage(SOLVED_KEY, []));
  for (const button of document.querySelectorAll(".tab")) {
    button.addEventListener("click", () => {
      tab = button.dataset.tab;
      render();
      window.scrollTo(0, 0);
    });
  }
  $("play-undo").addEventListener("click", (e) => (e.stopPropagation(), tap(() => bridge.undo())));
  $("play-redo").addEventListener("click", (e) => (e.stopPropagation(), tap(() => bridge.redo())));
  $("play-reset").addEventListener("click", (e) => {
    e.stopPropagation();
    startLevel(index);
    render();
  });
  $("play-next").addEventListener("click", (e) => {
    e.stopPropagation();
    startLevel(index + 1);
    render();
    window.scrollTo(0, 0);
  });
  $("play-cancel").addEventListener("click", (e) => (e.stopPropagation(), tap(() => bridge.tapNothing())));
  $("play").addEventListener("click", (e) => {
    if (e.target.closest("button, .cell")) return;
    tap(() => bridge.tapNothing());
  });
  attachPlayInput($("play-board"), $("play-hand"), {
    snap: () => snap,
    card: (i) => tap(() => bridge.tapCard(i)),
    tile: (row, col) => tap(() => bridge.tapTile(row, col)),
    nothing: () => tap(() => bridge.tapNothing()),
    peek: (i) => peek(i),
    render,
  });
  window.addEventListener("resize", render);
  render();
  $("loading").hidden = true;
  loadPack();
}

init();
