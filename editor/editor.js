// The level editor's entry point: shared UI state, tabs and start-up.
// Levels screen in levels.js, Edit tab in edit.js, Play tab in playtest.js,
// storage in store.js, gist sync in sync.js.

import { $, catalog } from "./board.js";
import { store, current, loadLevels, saveLevels, folderById } from "./store.js";
import { initSync } from "./sync.js";
import { renderLevels, initLevels } from "./levels.js";
import { renderEdit, initEdit } from "./edit.js";
import { renderPlay, initPlay } from "./playtest.js";

// pickCard is the index of the card whose coords are being picked on the Edit board, or null
export const ui = {
  tab: "levels",
  mode: "tiles",
  brush: { tiles: catalog.tiles[0].id, substrates: catalog.substrates[0].id, links: 0 },
  pickCard: null,
};

export function render() {
  for (const button of document.querySelectorAll(".tab")) {
    button.classList.toggle("active", button.dataset.tab === ui.tab);
  }
  for (const screen of document.querySelectorAll(".screen")) {
    screen.classList.toggle("active", screen.id === ui.tab);
  }
  const level = current();
  const folder = level ? folderById(level.folder) : null;
  $("current-name").textContent = level ? (folder ? `${folder.name} / ${level.name}` : level.name) : "No level selected";
  if (ui.tab === "levels") renderLevels();
  if (ui.tab === "edit") renderEdit();
  if (ui.tab === "play") renderPlay();
}

export function setTab(name) {
  ui.tab = name;
  if (name !== "edit") ui.pickCard = null;
  render();
  window.scrollTo(0, 0);
}

// call after changing the open level's data
export function changed() {
  const level = current();
  if (!level) return;
  level.updated = Date.now();
  saveLevels();
  render();
}

function init() {
  loadLevels();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  for (const button of document.querySelectorAll(".tab")) {
    button.addEventListener("click", () => setTab(button.dataset.tab));
  }
  initLevels();
  initEdit();
  initPlay();
  initSync(() => {
    ui.pickCard = null;
    render();
  });
  ui.tab = store.currentId ? "edit" : "levels";
  $("loading").hidden = true;
  render();
}

init();
