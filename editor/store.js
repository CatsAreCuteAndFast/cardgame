// The editor's levels and folders, kept in this browser's localStorage, and helpers for level data.

import { catalog, toast } from "./board.js";
import { upgradeLevel } from "./bridge.js";

const STORAGE_KEY = "cardgame.levels";
const CURRENT_KEY = "cardgame.current";
const FOLDERS_KEY = "cardgame.folders";

// editCount counts saved changes, so a sync can tell whether more edits came in while it ran
export const store = { levels: [], folders: [], currentId: null, editCount: 0 };
let savedData = null;
let onChange = () => {};

export const setChangeListener = (listener) => (onChange = listener);
export const dataJson = () => JSON.stringify({ levels: store.levels, folders: store.folders });
export const markSaved = () => (savedData = dataJson());

export function loadLevels() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    store.levels = Array.isArray(parsed) ? parsed : [];
    const parsedFolders = JSON.parse(localStorage.getItem(FOLDERS_KEY) || "[]");
    store.folders = Array.isArray(parsedFolders) ? parsedFolders : [];
    store.currentId = localStorage.getItem(CURRENT_KEY);
  } catch {
    store.levels = [];
    store.folders = [];
    store.currentId = null;
  }
  normalizeLevels();
  // fixes and format upgrades are written here but not counted as edits, so they don't start a sync
  writeLocal();
  markSaved();
}

export function normalizeLevels() {
  for (const level of store.levels) {
    if (!store.folders.some((folder) => folder.id === level.folder)) level.folder = null;
    if (!Array.isArray(level.data.flipped)) level.data.flipped = [];
    if (!Array.isArray(level.data.counters)) level.data.counters = [];
    level.data = upgradeData(level.data);
  }
  if (!store.levels.some((level) => level.id === store.currentId)) store.currentId = store.levels[0]?.id ?? null;
}

export function writeLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.levels));
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(store.folders));
    if (store.currentId) localStorage.setItem(CURRENT_KEY, store.currentId);
  } catch {
    toast("Couldn't save: browser storage is blocked");
  }
}

export function saveLevels() {
  writeLocal();
  const data = dataJson();
  if (data === savedData) return;
  savedData = data;
  store.editCount++;
  onChange();
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function current() {
  return store.levels.find((level) => level.id === store.currentId) ?? null;
}

export function addLevel(name, data, folder = null) {
  const level = { id: newId(), name, folder, updated: Date.now(), data };
  store.levels.push(level);
  store.currentId = level.id;
  saveLevels();
  return level;
}

export function folderById(id) {
  return store.folders.find((folder) => folder.id === id) ?? null;
}

export function folderByName(name) {
  const existing = store.folders.find((folder) => folder.name === name);
  if (existing) return existing;
  const folder = { id: newId(), name, collapsed: false };
  store.folders.push(folder);
  return folder;
}

// ---------- level data ----------

export function blankLevel(width = 3, height = 3) {
  return {
    version: catalog.level_version,
    budget: 10,
    tiles: grid(width, height, () => catalog.tiles[0].id),
    substrates: grid(width, height, () => catalog.substrates[0].id),
    links: [],
    flipped: [],
    counters: [],
    cards: [{ effect: "flip", target: { kind: "any", count: 1 } }],
  };
}

export function grid(width, height, fill) {
  return Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, col) => fill(row, col)));
}

export function size(data) {
  return { width: data.tiles[0]?.length ?? 0, height: data.tiles.length };
}

// the compact layout of levels/demo.json
export function formatLevel(data) {
  const block = (key, items) =>
    items.length
      ? ` "${key}": [\n${items.map((item) => "  " + JSON.stringify(item).replaceAll(",", ", ").replaceAll(":", ": ")).join(",\n")}\n ]`
      : ` "${key}": []`;
  const inline = (key, items) => ` "${key}": [${items.map((item) => JSON.stringify(item).replaceAll(",", ", ")).join(", ")}]`;
  return (
    `{\n${data.version ? ` "version": ${data.version},\n` : ""} "budget": ${data.budget},\n` +
    [block("tiles", data.tiles), block("substrates", data.substrates), block("links", data.links), inline("flipped", data.flipped), inline("counters", data.counters), block("cards", data.cards)].join(",\n") +
    "\n}\n"
  );
}

// brings a level up to the current format; one from a newer game is left as it is for validation to report
function upgradeData(data) {
  try {
    return upgradeLevel(data);
  } catch {
    return data;
  }
}

export function normalizeLevel(raw) {
  if (!raw || !Array.isArray(raw.tiles) || !Array.isArray(raw.substrates)) {
    throw new Error("not a level: needs tiles and substrates");
  }
  raw = upgradeLevel(raw);
  return {
    version: raw.version,
    budget: Number(raw.budget) || 1,
    tiles: raw.tiles,
    substrates: raw.substrates,
    links: Array.isArray(raw.links) ? raw.links : [],
    flipped: Array.isArray(raw.flipped) ? raw.flipped : [],
    counters: Array.isArray(raw.counters) ? raw.counters : [],
    cards: Array.isArray(raw.cards) ? raw.cards : [],
  };
}
