"use strict";

const PACK_PATH = "../levels/pack.json";
const SOLVED_KEY = "cardgame.tester.solved";
const LAST_KEY = "cardgame.tester.last";

let bridge = null;
let pack = [];
let packError = null;
let solved = new Set();
let tab = "levels";
let index = null;
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
    return JSON.parse(call());
  } catch (error) {
    playError = String(error.message ?? error);
    return null;
  }
}

function startLevel(next) {
  index = next;
  playError = null;
  writeStorage(LAST_KEY, pack[index].name);
  snap = bridge ? callBridge(() => bridge.start(JSON.stringify(pack[index].level))) : null;
}

function tap(call) {
  if (!snap) return;
  snap = callBridge(call);
  if (snap?.won && !solved.has(pack[index].name)) {
    solved.add(pack[index].name);
    writeStorage(SOLVED_KEY, [...solved]);
  }
  render();
}

function hover(i, row, col) {
  try {
    return JSON.parse(bridge.hover(i, row, col));
  } catch {
    return null;
  }
}

function render() {
  document.documentElement.style.setProperty("--top-h", `${document.querySelector(".top").offsetHeight}px`);
  for (const button of document.querySelectorAll(".tab")) button.classList.toggle("active", button.dataset.tab === tab);
  for (const screen of document.querySelectorAll(".screen")) screen.classList.toggle("active", screen.id === tab);
  $("current-name").textContent = index === null ? "" : `${index + 1}. ${pack[index].name}`;
  if (tab === "levels") renderLevels();
  else renderPlay();
}

function renderLevels() {
  $("pack-error").hidden = !packError;
  $("pack-error").textContent = packError ?? "";
  const list = $("level-list");
  list.replaceChildren();
  if (!packError && pack.length === 0) list.append(el("li", { class: "empty", textContent: "No levels to test yet." }));
  pack.forEach((entry, i) => {
    list.append(
      el(
        "li",
        {
          class: "level-item pack-item" + (i === index ? " is-current" : ""),
          onclick: () => {
            startLevel(i);
            tab = "play";
            render();
            window.scrollTo(0, 0);
          },
        },
        [
          el("span", { class: "number", textContent: `${i + 1}.` }),
          el("span", { class: "info" }, el("div", { class: "name", textContent: entry.name })),
          solved.has(entry.name) ? el("span", { class: "done", textContent: "✓ solved" }) : null,
        ],
      ),
    );
  });
}

function renderPlay() {
  const board = $("play-board");
  const hand = $("play-hand");
  const status = $("play-status");
  board.replaceChildren();
  hand.replaceChildren();
  $("play-empty").hidden = index !== null;
  if (index !== null && !snap && bridge && !playError) startLevel(index);
  $("play-error").hidden = !playError;
  $("play-error").textContent = playError ?? "";
  $("play-undo").disabled = !snap?.can_undo;
  $("play-redo").disabled = !snap?.can_redo;
  $("play-reset").disabled = !snap;
  $("play-next").hidden = !(snap?.won && index + 1 < pack.length);
  $("play-cancel").hidden = !(snap && snap.selected !== null);
  $("play-prompt").textContent = snap ? playPrompt(snap) : "";
  const { text, className } = snap ? playStatus(snap, pack[index].level.budget) : { text: "", className: "" };
  status.textContent = text;
  status.className = className;
  if (!snap) return;
  renderSnapshot(snap, board, hand, {
    onTile: (row, col) => tap(() => bridge.tap_tile(row, col)),
    onCard: (i) => tap(() => bridge.tap_card(i)),
  });
}

let toastTimer = null;

function toast(message, sticky = false) {
  const node = $("loading");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => (node.hidden = true), 1800);
}

async function loadPack() {
  try {
    const data = JSON.parse(await fetchText(PACK_PATH));
    if (!Array.isArray(data)) throw new Error("the level pack should be a list");
    pack = data.filter((entry) => entry && typeof entry.name === "string" && entry.level);
  } catch (error) {
    packError = "Couldn't load the levels: " + (error.message ?? error);
  }
  const last = readStorage(LAST_KEY, null);
  const found = pack.findIndex((entry) => entry.name === last);
  if (found !== -1) index = found;
  render();
}

async function loadRules() {
  toast("Loading game rules…", true);
  try {
    bridge = await loadBridge("../editor/");
    catalog = JSON.parse(bridge.catalog());
    toast("Rules loaded");
  } catch (error) {
    console.error(error);
    toast("Couldn't load rules: " + (error.message ?? error), true);
  }
  render();
}

function init() {
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
  $("play-cancel").addEventListener("click", (e) => (e.stopPropagation(), tap(() => bridge.tap_nothing())));
  $("play").addEventListener("click", (e) => {
    if (e.target.closest("button, .cell")) return;
    tap(() => bridge.tap_nothing());
  });
  attachPlayInput($("play-board"), $("play-hand"), {
    snap: () => snap,
    card: (i) => tap(() => bridge.tap_card(i)),
    tile: (row, col) => tap(() => bridge.tap_tile(row, col)),
    nothing: () => tap(() => bridge.tap_nothing()),
    hover: (i, row, col) => hover(i, row, col),
    render,
  });
  window.addEventListener("resize", render);
  render();
  loadPack();
  loadRules();
}

init();
