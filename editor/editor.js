"use strict";

const STORAGE_KEY = "cardgame.levels";
const CURRENT_KEY = "cardgame.current";
const FOLDERS_KEY = "cardgame.folders";
const MIN_SIZE = 1;
const MAX_SIZE = 8;
const MAX_BUDGET = 9999;

let bridge = null;
let levels = [];
let folders = [];
let currentId = null;
let tab = "levels";
let mode = "tiles";
let brush = { tiles: "basic", substrates: "plain", links: 0 };
let pickCard = null;
let playSnapshot = null;
let playLevelJson = null;
let playError = null;

// ---------- storage ----------

function loadLevels() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    levels = Array.isArray(parsed) ? parsed : [];
    const parsedFolders = JSON.parse(localStorage.getItem(FOLDERS_KEY) || "[]");
    folders = Array.isArray(parsedFolders) ? parsedFolders : [];
    currentId = localStorage.getItem(CURRENT_KEY);
  } catch {
    levels = [];
    folders = [];
    currentId = null;
  }
  normalizeLevels();
  savedData = dataJson();
}

function normalizeLevels() {
  for (const level of levels) {
    if (!folders.some((folder) => folder.id === level.folder)) level.folder = null;
    if (!Array.isArray(level.data.flipped)) level.data.flipped = [];
    if (!Array.isArray(level.data.counters)) level.data.counters = [];
    if (bridge) level.data = upgradeData(level.data);
  }
  if (!levels.some((level) => level.id === currentId)) currentId = levels[0]?.id ?? null;
}

function writeLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    if (currentId) localStorage.setItem(CURRENT_KEY, currentId);
  } catch {
    toast("Couldn't save: browser storage is blocked");
  }
}

function saveLevels() {
  writeLocal();
  const data = dataJson();
  if (data === savedData) return;
  savedData = data;
  editCount++;
  if (!sync) return;
  sync.dirty = true;
  saveSync();
  schedulePush();
}

const dataJson = () => JSON.stringify({ levels, folders });

// ---------- sync ----------

const SYNC_KEY = "cardgame.sync";
const GIST_FILE = "cardgame-levels.json";
const PUSH_DELAY = 2000;
const KEEPALIVE_LIMIT = 60000;

let sync = null;
let savedData = null;
let editCount = 0;
let pushTimer = null;
let syncChain = Promise.resolve();

function loadSync() {
  try {
    sync = JSON.parse(localStorage.getItem(SYNC_KEY));
  } catch {
    sync = null;
  }
  if (!sync?.token || !sync?.gistId) sync = null;
}

function saveSync() {
  try {
    if (sync) localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
    else localStorage.removeItem(SYNC_KEY);
  } catch {}
}

function setSyncStatus(text, bad = false) {
  const node = $("sync-status");
  node.textContent = text;
  node.hidden = !text;
  node.classList.toggle("bad", bad);
}

async function gistRequest(token, method, path, body) {
  const json = body === undefined ? undefined : JSON.stringify(body);
  const response = await fetch("https://api.github.com/gists" + path, {
    method,
    cache: "no-store",
    keepalive: json !== undefined && json.length < KEEPALIVE_LIMIT,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` },
    body: json,
  });
  if (response.status === 401) throw new Error("GitHub rejected the token");
  if (response.status === 404) throw new Error("gist not found (check the id, and that the token has gist access)");
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  return response.json();
}

async function fetchRemote() {
  const gist = await gistRequest(sync.token, "GET", "/" + sync.gistId);
  const file = gist.files?.[GIST_FILE];
  if (!file) throw new Error(`the gist has no ${GIST_FILE}`);
  const text = file.truncated ? await (await fetch(file.raw_url, { cache: "no-store" })).text() : file.content;
  const remote = JSON.parse(text);
  if (!Array.isArray(remote.levels) || !Array.isArray(remote.folders)) throw new Error(`${GIST_FILE} isn't a level list`);
  return remote;
}

function gistFiles(updated) {
  return { [GIST_FILE]: { content: JSON.stringify({ version: 1, updated, levels, folders }) } };
}

async function writeRemote() {
  const updated = Date.now();
  const edits = editCount;
  await gistRequest(sync.token, "PATCH", "/" + sync.gistId, { files: gistFiles(updated) });
  sync.remoteUpdated = updated;
  sync.dirty = editCount !== edits;
  saveSync();
}

function applyRemote(remote) {
  levels = remote.levels;
  folders = remote.folders;
  normalizeLevels();
  savedData = dataJson();
  sync.remoteUpdated = remote.updated;
  sync.dirty = false;
  saveSync();
  writeLocal();
  pickCard = null;
  render();
}

function takeRemoteOnConflict() {
  return confirm(
    "The synced levels and this device's levels have both changed since this device last synced.\n\n" +
      "OK: use the synced levels (this device's unsynced changes are lost).\n" +
      "Cancel: keep this device's levels and overwrite the synced ones.",
  );
}

async function syncNow() {
  setSyncStatus("Syncing…");
  const remote = await fetchRemote();
  if (remote.updated !== sync.remoteUpdated && (!sync.dirty || takeRemoteOnConflict())) applyRemote(remote);
  else if (sync.dirty) await writeRemote();
  setSyncStatus(sync.dirty ? "Unsynced changes" : "Synced");
  if (sync.dirty) schedulePush();
}

function queueSync() {
  clearTimeout(pushTimer);
  pushTimer = null;
  syncChain = syncChain
    .then(() => sync && syncNow())
    .catch((error) => {
      console.error(error);
      if (!sync) return;
      if (error instanceof TypeError) setSyncStatus("Offline, saved here", true);
      else {
        setSyncStatus("Sync error", true);
        toast("Sync failed: " + error.message);
      }
    });
  return syncChain;
}

function schedulePush() {
  setSyncStatus("Unsynced changes");
  clearTimeout(pushTimer);
  pushTimer = setTimeout(queueSync, PUSH_DELAY);
}

async function connectSync(token, gistId) {
  try {
    if (!gistId) {
      const gist = await gistRequest(token, "POST", "", {
        description: "cardgame level editor",
        public: false,
        files: gistFiles(Date.now()),
      });
      sync = { token, gistId: gist.id, remoteUpdated: null, dirty: false };
      saveSync();
      await queueSync();
      showTextDialog("Sync gist created", gist.id, "Enter this gist id with the same token on your other devices.");
      return;
    }
    sync = { token, gistId, remoteUpdated: null, dirty: levels.length > 0 };
    saveSync();
    await queueSync();
  } catch (error) {
    alert("Couldn't connect: " + error.message);
  }
}

function showSyncDialog() {
  const dialog = $("sync-dialog");
  $("sync-token").value = sync?.token ?? "";
  $("sync-gist").value = sync?.gistId ?? "";
  $("sync-disconnect").hidden = !sync;
  dialog.onclose = () => {
    if (dialog.returnValue === "disconnect") {
      sync = null;
      saveSync();
      clearTimeout(pushTimer);
      setSyncStatus("");
      toast("Sync turned off on this device");
    } else if (dialog.returnValue === "connect") {
      const token = $("sync-token").value.trim();
      const gistId = $("sync-gist").value.trim().split("/").pop();
      if (token) connectSync(token, gistId);
    }
  };
  dialog.returnValue = "";
  dialog.showModal();
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function current() {
  return levels.find((level) => level.id === currentId) ?? null;
}

function blankLevel(width = 3, height = 3) {
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

function grid(width, height, fill) {
  return Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, col) => fill(row, col)));
}

function addLevel(name, data, folder = null) {
  const level = { id: newId(), name, folder, updated: Date.now(), data };
  levels.push(level);
  currentId = level.id;
  saveLevels();
  return level;
}

function changed() {
  const level = current();
  if (!level) return;
  level.updated = Date.now();
  saveLevels();
  render();
}

// ---------- level json ----------

function size(data) {
  return { width: data.tiles[0]?.length ?? 0, height: data.tiles.length };
}

function formatLevel(data) {
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
    return bridge.upgradeLevel(data);
  } catch {
    return data;
  }
}

function normalizeLevel(raw) {
  if (!raw || !Array.isArray(raw.tiles) || !Array.isArray(raw.substrates)) {
    throw new Error("not a level: needs tiles and substrates");
  }
  if (bridge) raw = bridge.upgradeLevel(raw);
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

function validationError(data) {
  if (!bridge) return null;
  return bridge.validate(data);
}

// ---------- editing ----------

function resize(data, width, height) {
  width = clamp(width, MIN_SIZE, MAX_SIZE);
  height = clamp(height, MIN_SIZE, MAX_SIZE);
  data.tiles = grid(width, height, (r, c) => data.tiles[r]?.[c] ?? catalog.tiles[0].id);
  data.substrates = grid(width, height, (r, c) => data.substrates[r]?.[c] ?? catalog.substrates[0].id);
  const inside = ([r, c]) => r < height && c < width;
  data.links = data.links.map((group) => group.filter(inside)).filter((group) => group.length > 0);
  data.flipped = data.flipped.filter(inside);
  data.counters = data.counters.filter(inside);
  for (const card of data.cards) {
    if (card.target.coords) card.target.coords = card.target.coords.filter(inside);
  }
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, Math.round(Number(value) || low)));
}

function linkOf(data, row, col) {
  return data.links.findIndex((group) => group.some((coord) => sameCoord(coord, [row, col])));
}

function toggleLink(data, row, col, groupIndex) {
  const existing = linkOf(data, row, col);
  if (existing !== -1) {
    data.links[existing] = data.links[existing].filter((coord) => !sameCoord(coord, [row, col]));
  }
  if (existing !== groupIndex) {
    if (groupIndex >= data.links.length) data.links.push([]);
    data.links[groupIndex].push([row, col]);
  }
  const before = data.links.length;
  data.links = data.links.filter((group) => group.length > 0);
  if (data.links.length !== before && brush.links >= data.links.length) brush.links = data.links.length;
}

function periodAt(data, row, col) {
  return catalog.substrates.find((s) => s.id === data.substrates[row][col])?.period ?? 0;
}

function counterAt(data, row, col) {
  return data.counters.find(([r, c]) => r === row && c === col)?.[2] ?? periodAt(data, row, col);
}

function setCounter(data, row, col, counter) {
  data.counters = data.counters.filter(([r, c]) => !(r === row && c === col));
  if (counter !== periodAt(data, row, col)) data.counters.push([row, col, counter]);
}

function toggleCoord(card, row, col) {
  const coords = card.target.coords;
  const index = coords.findIndex((coord) => sameCoord(coord, [row, col]));
  if (index === -1) coords.push([row, col]);
  else coords.splice(index, 1);
}

function editTap(row, col) {
  const data = current().data;
  if (pickCard !== null) {
    toggleCoord(data.cards[pickCard], row, col);
  } else if (mode === "tiles") {
    data.tiles[row][col] = brush.tiles;
  } else if (mode === "substrates") {
    data.substrates[row][col] = brush.substrates;
    setCounter(data, row, col, periodAt(data, row, col));
  } else if (mode === "counters") {
    const period = periodAt(data, row, col);
    if (period === 0) return;
    const counter = counterAt(data, row, col);
    setCounter(data, row, col, counter === 0 ? period : counter - 1);
  } else if (mode === "links") {
    toggleLink(data, row, col, brush.links);
  } else if (mode === "flipped") {
    const index = data.flipped.findIndex((coord) => sameCoord(coord, [row, col]));
    if (index === -1) data.flipped.push([row, col]);
    else data.flipped.splice(index, 1);
  }
  changed();
}

function defaultTarget(kind, previous) {
  switch (kind) {
    case "fixed":
    case "from":
      return { kind, coords: previous?.coords ?? [] };
    case "any":
      return { kind, count: previous?.count ?? 1 };
    case "adjacent":
      return { kind, count: 2 };
    default:
      return { kind };
  }
}

function kindsFor(effectId) {
  return catalog.effects.find((effect) => effect.id === effectId)?.kinds ?? [];
}

const KIND_LABELS = { fixed: "fixed tiles", from: "choose 1 from", any: "any N", adjacent: "N adjacent", card: "a card" };

// ---------- rendering ----------

function render() {
  for (const button of document.querySelectorAll(".tab")) {
    button.classList.toggle("active", button.dataset.tab === tab);
  }
  for (const screen of document.querySelectorAll(".screen")) {
    screen.classList.toggle("active", screen.id === tab);
  }
  const level = current();
  const folder = level ? folderById(level.folder) : null;
  $("current-name").textContent = level ? (folder ? `${folder.name} / ${level.name}` : level.name) : "No level selected";
  if (tab === "levels") renderLevels();
  if (tab === "edit") renderEdit();
  if (tab === "play") renderPlay();
}

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

function renderLevels() {
  const container = $("level-list");
  container.replaceChildren();
  if (!levels.length && !folders.length) {
    container.append(el("p", { class: "empty", textContent: "No levels yet. Tap “New level” to start." }));
    return;
  }
  for (const folder of [...folders].sort(byName)) {
    const inside = levels.filter((level) => level.folder === folder.id);
    container.append(
      el("section", { class: "folder" }, [
        el("div", { class: "folder-head" }, [
          el("button", {
            class: "folder-toggle",
            textContent: `${folder.collapsed ? "▸" : "▾"} ${folder.name} (${inside.length})`,
            onclick: () => {
              folder.collapsed = !folder.collapsed;
              saveLevels();
              render();
            },
          }),
          el("div", { class: "actions" }, [
            el("button", { class: "small", textContent: "+ Level", onclick: () => newLevel(folder.id) }),
            el("button", { class: "small", textContent: "Rename", onclick: () => renameFolder(folder) }),
            el("button", { class: "small", textContent: "Copy", title: "Copy this folder's levels", onclick: () => copyLevels(inside, folder.name) }),
            el("button", { class: "small danger", textContent: "✕", title: "Delete folder", onclick: () => deleteFolder(folder) }),
          ]),
        ]),
        folder.collapsed ? null : renderLevelList(inside, "Empty folder. Use “+ Level” or move levels here."),
      ]),
    );
  }
  const ungrouped = levels.filter((level) => level.folder === null);
  if (ungrouped.length || !folders.length) {
    container.append(
      el("section", { class: "folder" }, [
        folders.length ? el("div", { class: "folder-head" }, el("h2", { textContent: `Ungrouped (${ungrouped.length})` })) : null,
        renderLevelList(ungrouped, ""),
      ]),
    );
  }
}

function renderLevelList(items, emptyText) {
  const list = el("ul", { class: "level-list" });
  if (!items.length && emptyText) list.append(el("li", { class: "empty", textContent: emptyText }));
  for (const level of [...items].sort(byName)) {
    const { width, height } = size(level.data);
    const open = () => {
      currentId = level.id;
      saveLevels();
      setTab("edit");
    };
    list.append(
      el("li", { class: "level-item" + (level.id === currentId ? " is-current" : "") }, [
        el("div", { class: "info", onclick: open }, [
          el("div", { class: "name", textContent: level.name }),
          el("div", {
            class: "meta",
            textContent: `${width}×${height} · ${level.data.cards.length} cards · ${new Date(level.updated).toLocaleString()}`,
          }),
        ]),
        el("div", { class: "actions" }, [
          el("button", { class: "small", textContent: "Rename", onclick: () => renameLevel(level) }),
          el("button", { class: "small", textContent: "Clone", title: "Duplicate", onclick: () => duplicateLevel(level) }),
          el("button", { class: "small", textContent: "Move", title: "Move to folder", onclick: () => moveLevel(level) }),
          el("button", { class: "small danger", textContent: "✕", title: "Delete", onclick: () => deleteLevel(level) }),
        ]),
      ]),
    );
  }
  return list;
}

function folderById(id) {
  return folders.find((folder) => folder.id === id) ?? null;
}

function folderByName(name) {
  const existing = folders.find((folder) => folder.name === name);
  if (existing) return existing;
  const folder = { id: newId(), name, collapsed: false };
  folders.push(folder);
  return folder;
}

function askFolderName(initial) {
  const name = prompt("Folder name", initial);
  if (name === null || !name.trim()) return null;
  return name.trim();
}

function newLevel(folderId = null) {
  const count = levels.filter((level) => level.folder === folderId).length;
  const name = prompt("Level name", `Level ${count + 1}`);
  if (name === null) return;
  addLevel(name.trim() || `Level ${count + 1}`, blankLevel(), folderId);
  setTab("edit");
}

function renameFolder(folder) {
  const name = askFolderName(folder.name);
  if (name === null) return;
  if (folders.some((other) => other !== folder && other.name === name)) return alert(`A folder named “${name}” already exists.`);
  folder.name = name;
  saveLevels();
  render();
}

function deleteFolder(folder) {
  const inside = levels.filter((level) => level.folder === folder.id);
  const note = inside.length ? `\nIts ${inside.length} level${inside.length === 1 ? "" : "s"} will move to Ungrouped.` : "";
  if (!confirm(`Delete folder “${folder.name}”?${note}`)) return;
  for (const level of inside) level.folder = null;
  folders = folders.filter((other) => other !== folder);
  saveLevels();
  render();
}

function moveLevel(level) {
  const dialog = $("move-dialog");
  const moveTo = (folderId) => {
    level.folder = folderId;
    saveLevels();
    dialog.close();
    render();
  };
  $("move-dialog-title").textContent = `Move “${level.name}” to`;
  const option = (label, folderId) =>
    el("button", { type: "button", textContent: label, disabled: level.folder === folderId, onclick: () => moveTo(folderId) });
  $("move-options").replaceChildren(
    ...[...folders].sort(byName).map((folder) => option(folder.name, folder.id)),
    option("Ungrouped", null),
    el("button", {
      type: "button",
      textContent: "+ New folder…",
      onclick: () => {
        const name = askFolderName("");
        if (name !== null) moveTo(folderByName(name).id);
      },
    }),
  );
  dialog.showModal();
}

function copyLevels(items, title) {
  if (!items.length) return toast("No levels to copy");
  const entries = items.map((level) => {
    const folder = folderById(level.folder);
    return { name: level.name, ...(folder ? { folder: folder.name } : {}), level: level.data, ...(level.solution ? { solution: level.solution } : {}) };
  });
  copyText(JSON.stringify(entries), title);
}

function renameLevel(level) {
  const name = prompt("Level name", level.name);
  if (name === null || !name.trim()) return;
  level.name = name.trim();
  level.updated = Date.now();
  saveLevels();
  render();
}

function duplicateLevel(level) {
  addLevel(level.name + " copy", structuredClone(level.data), level.folder);
  render();
}

function deleteLevel(level) {
  if (!confirm(`Delete “${level.name}”? This can't be undone.`)) return;
  levels = levels.filter((other) => other.id !== level.id);
  if (currentId === level.id) currentId = levels[0]?.id ?? null;
  saveLevels();
  render();
}

function stepper(value, min, max, onChange) {
  const input = el("input", {
    type: "number",
    inputMode: "numeric",
    value,
    min,
    max,
    style: `width:${String(max).length + 2.2}ch`,
    onchange: () => onChange(clamp(input.value, min, max)),
  });
  return [
    el("button", { class: "small", textContent: "−", disabled: value <= min, onclick: (e) => (e.preventDefault(), onChange(value - 1)) }),
    input,
    el("button", { class: "small", textContent: "+", disabled: value >= max, onclick: (e) => (e.preventDefault(), onChange(value + 1)) }),
  ];
}

function renderEdit() {
  const level = current();
  $("edit-empty").hidden = !!level;
  $("edit-body").hidden = !level;
  if (!level) return;
  const data = level.data;
  const { width, height } = size(data);

  const fields = {
    width: stepper(width, MIN_SIZE, MAX_SIZE, (v) => (resize(data, v, height), changed())),
    height: stepper(height, MIN_SIZE, MAX_SIZE, (v) => (resize(data, width, v), changed())),
    budget: stepper(data.budget, 1, MAX_BUDGET, (v) => ((data.budget = clamp(v, 1, MAX_BUDGET)), changed())),
  };
  for (const span of document.querySelectorAll("#edit .stepper")) {
    span.replaceChildren(...fields[span.dataset.field]);
  }

  for (const button of document.querySelectorAll("#paint-modes button")) {
    button.classList.toggle("active", pickCard === null && button.dataset.mode === mode);
  }
  renderPalette(data);

  const banner = $("pick-banner");
  banner.hidden = pickCard === null;
  if (pickCard !== null) {
    banner.replaceChildren(
      el("span", { textContent: `Tap tiles to pick coords for card ${pickCard + 1}` }),
      el("button", { class: "small primary", textContent: "Done", onclick: () => ((pickCard = null), render()) }),
    );
  }

  const board = $("edit-board");
  setBoardShape(board, width, height);
  const picked = pickCard !== null ? data.cards[pickCard].target.coords : [];
  board.replaceChildren();
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const order = picked.findIndex((coord) => sameCoord(coord, [row, col]));
      board.append(
        renderCell(
          {
            type: data.tiles[row][col],
            flipped: data.flipped.some((coord) => sameCoord(coord, [row, col])),
            link: linkOf(data, row, col),
            period: periodAt(data, row, col),
            counter: counterAt(data, row, col),
          },
          {
            classes: order !== -1 ? ["coord-on"] : [],
            order: order !== -1 ? order + 1 : null,
            onclick: () => editTap(row, col),
          },
        ),
      );
    }
  }

  const error = validationError(data);
  const validation = $("validation");
  validation.className = "validation " + (bridge ? (error ? "bad" : "good") : "");
  validation.textContent = !bridge ? "Rules are loading… validation will appear here." : error ? error : "Valid level";
  renderSolution(level, error);

  renderCards(data, width, height);
}

// solutions are stored on the level record (not in its data) and checked against the level as it is now
function renderSolution(level, error) {
  const box = $("solution");
  box.hidden = !bridge || !!error;
  if (box.hidden) return;
  if (!level.solution) {
    box.className = "validation";
    box.textContent = "No solution saved. Win the level in Play and press Save solution.";
    return;
  }
  const check = bridge.checkSolution(level.data, level.solution);
  box.className = "validation " + (check.error ? "bad" : "good");
  box.textContent = check.error ? `The saved solution no longer works (${check.error}). Win the level in Play to save a new one.` : `Saved solution wins in ${check.plays} play${check.plays === 1 ? "" : "s"}`;
}

function saveSolution() {
  const level = current();
  if (!level || !playSnapshot?.won) return;
  level.solution = bridge.solution();
  level.updated = Date.now();
  saveLevels();
  toast(`Solution saved (${level.solution.length} play${level.solution.length === 1 ? "" : "s"})`);
  render();
}

function renderPalette(data) {
  const palette = $("palette");
  palette.replaceChildren();
  if (mode === "tiles") {
    for (const tile of catalog.tiles) {
      palette.append(
        el("button", { class: "chip" + (brush.tiles === tile.id ? " active" : ""), onclick: () => ((brush.tiles = tile.id), render()) }, [
          el("span", { class: "swatch", style: `background:${tile.can_flip ? "var(--tile)" : "#3b3447"}${tile.can_swap ? "" : ";background-image:repeating-linear-gradient(45deg,#fff3 0 3px,#0000 3px 6px)"}` }),
          tile.id,
        ]),
      );
    }
  } else if (mode === "substrates") {
    for (const substrate of catalog.substrates) {
      palette.append(
        el(
          "button",
          { class: "chip" + (brush.substrates === substrate.id ? " active" : ""), onclick: () => ((brush.substrates = substrate.id), render()) },
          [el("span", { class: "swatch", style: `background:${SUBSTRATE_COLORS[substrate.period] ?? "var(--panel)"}` }), `${substrate.id} (${substrate.period})`],
        ),
      );
    }
  } else if (mode === "counters") {
    palette.append(el("span", { class: "hint", textContent: "Tap a timed substrate to change how many turns it starts with (0 = ready)" }));
  } else if (mode === "flipped") {
    palette.append(el("span", { class: "hint", textContent: `Tap tiles to set which start flipped (${data.flipped.length} flipped)` }));
  } else if (mode === "links") {
    data.links.forEach((group, index) => {
      palette.append(
        el("button", { class: "chip" + (brush.links === index ? " active" : ""), onclick: () => ((brush.links = index), render()) }, [
          el("span", { class: "swatch", style: `background:${LINK_COLORS[index % LINK_COLORS.length]}` }),
          `Link ${index} (${group.length})`,
        ]),
      );
    });
    palette.append(
      el("button", {
        class: "chip" + (brush.links >= data.links.length ? " active" : ""),
        textContent: "+ New group",
        onclick: () => ((brush.links = data.links.length), render()),
      }),
    );
  }
}

function renderCards(data, width, height) {
  const list = $("card-list");
  list.replaceChildren();
  data.cards.forEach((card, index) => {
    const kinds = kindsFor(card.effect);
    const effectSelect = el(
      "select",
      {
        onchange: () => {
          card.effect = effectSelect.value;
          const allowed = kindsFor(card.effect);
          if (!allowed.includes(card.target.kind)) card.target = defaultTarget(allowed[0] ?? "any", card.target);
          if (card.target.kind === "adjacent") card.target.count = 2;
          changed();
        },
      },
      catalog.effects.map((effect) => el("option", { value: effect.id, textContent: effect.id, selected: effect.id === card.effect })),
    );
    if (!catalog.effects.some((effect) => effect.id === card.effect)) {
      effectSelect.prepend(el("option", { value: card.effect, textContent: card.effect + " (unknown)", selected: true }));
    }
    const kindOptions = kinds.includes(card.target.kind) ? kinds : [card.target.kind, ...kinds];
    const kindSelect = el(
      "select",
      {
        onchange: () => {
          card.target = defaultTarget(kindSelect.value, card.target);
          if (pickCard === index && !card.target.coords) pickCard = null;
          changed();
        },
      },
      kindOptions.map((kind) => el("option", { value: kind, textContent: KIND_LABELS[kind] ?? kind, selected: kind === card.target.kind })),
    );

    const details = [];
    if (card.target.coords) {
      const picking = pickCard === index;
      details.push(
        el("span", { class: "coords", textContent: card.target.coords.length ? card.target.coords.map(([r, c]) => `(${r},${c})`).join(" ") : "no tiles picked" }),
        el("button", {
          class: "small" + (picking ? " primary" : ""),
          textContent: picking ? "Done" : "Pick tiles",
          onclick: () => {
            pickCard = picking ? null : index;
            render();
            if (!picking) $("edit-board").scrollIntoView({ behavior: "smooth", block: "center" });
          },
        }),
      );
    } else if (card.target.count !== undefined) {
      const fixedCount = card.effect === "swap";
      details.push(
        el("span", { class: "check", textContent: "count" }),
        ...(fixedCount
          ? [el("span", { textContent: card.target.count })]
          : stepper(card.target.count, 1, width * height, (v) => ((card.target.count = v), changed()))),
      );
    }

    const move = (delta) => {
      const target = index + delta;
      if (target < 0 || target >= data.cards.length) return;
      [data.cards[index], data.cards[target]] = [data.cards[target], data.cards[index]];
      if (pickCard === index) pickCard = target;
      else if (pickCard === target) pickCard = index;
      changed();
    };
    const singleUse = el("input", {
      type: "checkbox",
      checked: !!card.single_use,
      onchange: () => {
        if (singleUse.checked) card.single_use = true;
        else delete card.single_use;
        changed();
      },
    });

    list.append(
      el("li", { class: "card-item" }, [
        el("div", { class: "row" }, [
          el("span", { class: "index", textContent: index + 1 }),
          effectSelect,
          kindSelect,
        ]),
        el("div", { class: "row wrap" }, details),
        el("div", { class: "row" }, [
          el("label", { class: "check" }, [singleUse, "single use"]),
          el("span", { style: "flex:1" }),
          el("button", { class: "small", textContent: "↑", disabled: index === 0, onclick: () => move(-1) }),
          el("button", { class: "small", textContent: "↓", disabled: index === data.cards.length - 1, onclick: () => move(1) }),
          el("button", {
            class: "small danger",
            textContent: "✕",
            onclick: () => {
              data.cards.splice(index, 1);
              if (pickCard === index) pickCard = null;
              else if (pickCard !== null && pickCard > index) pickCard--;
              changed();
            },
          }),
        ]),
      ]),
    );
  });
}

// ---------- playtest ----------

function startPlay() {
  const level = current();
  playSnapshot = null;
  playError = null;
  playLevelJson = level ? JSON.stringify(level.data) : null;
  if (!level) playError = "Pick or create a level first.";
  else if (!bridge) playError = "Rules are still loading…";
  else {
    playError = validationError(level.data);
    if (!playError) playSnapshot = callBridge(() => bridge.start(level.data));
  }
}

function callBridge(call) {
  try {
    return call();
  } catch (error) {
    playError = String(error.message ?? error);
    return null;
  }
}

function renderPlay() {
  const level = current();
  if (!playSnapshot || playLevelJson !== (level ? JSON.stringify(level.data) : null)) startPlay();
  const errorBox = $("play-error");
  errorBox.hidden = !playError;
  errorBox.textContent = playError ?? "";
  const board = $("play-board");
  const hand = $("play-hand");
  const status = $("play-status");
  status.className = "";
  status.textContent = "";
  const snap = playSnapshot;
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
  if (!playSnapshot) return;
  playSnapshot = callBridge(call);
  render();
}

// ---------- copy / import ----------

async function copyText(text, title) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard");
  } catch {
    showTextDialog(title, text, "Clipboard isn't available here. Select all and copy.", null);
  }
}

function showTextDialog(title, text, note, onOk) {
  const dialog = $("text-dialog");
  $("text-dialog-title").textContent = title;
  $("text-dialog-text").value = text;
  $("text-dialog-text").readOnly = !onOk;
  $("text-dialog-note").textContent = note;
  $("text-dialog-ok").hidden = !onOk;
  dialog.onclose = () => {
    if (onOk && dialog.returnValue === "ok") onOk($("text-dialog-text").value);
  };
  dialog.returnValue = "";
  dialog.showModal();
  if (!onOk) $("text-dialog-text").select();
}

function importText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    alert("That isn't valid JSON: " + error.message);
    return;
  }
  try {
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        const folder = entry.folder ? folderByName(String(entry.folder)) : null;
        const level = addLevel(String(entry.name ?? "Imported"), normalizeLevel(entry.level), folder?.id ?? null);
        if (Array.isArray(entry.solution)) level.solution = entry.solution;
      }
      saveLevels();
      toast(`Imported ${parsed.length} level${parsed.length === 1 ? "" : "s"}`);
    } else {
      const data = normalizeLevel(parsed);
      const name = prompt("Name for the imported level", "Imported") || "Imported";
      addLevel(name.trim(), data);
      setTab("edit");
    }
  } catch (error) {
    alert(error.message);
  }
  render();
}

// ---------- misc ----------

let toastTimer = null;

function toast(message, sticky = false) {
  const node = $("loading");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => (node.hidden = true), 1800);
}

function setTab(name) {
  tab = name;
  if (name !== "edit") pickCard = null;
  render();
  window.scrollTo(0, 0);
}

async function loadRules() {
  try {
    bridge = await import("./bridge.js");
    catalog = bridge.catalog();
    $("loading").hidden = true;
    brush.tiles = catalog.tiles[0].id;
    brush.substrates = catalog.substrates[0].id;
    normalizeLevels();
    saveLevels();
  } catch (error) {
    console.error(error);
    toast("Couldn't load rules: " + (error.message ?? error), true);
  }
  playSnapshot = null;
  render();
}

function init() {
  loadLevels();
  loadSync();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

  for (const button of document.querySelectorAll(".tab")) {
    button.addEventListener("click", () => setTab(button.dataset.tab));
  }
  for (const button of document.querySelectorAll("#paint-modes button")) {
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      pickCard = null;
      render();
    });
  }
  $("new-level").addEventListener("click", () => newLevel(null));
  $("new-folder").addEventListener("click", () => {
    const name = askFolderName(`Folder ${folders.length + 1}`);
    if (name === null) return;
    if (folders.some((folder) => folder.name === name)) return alert(`A folder named “${name}” already exists.`);
    folderByName(name);
    saveLevels();
    render();
  });
  $("import-level").addEventListener("click", () =>
    showTextDialog("Import JSON", "", "Paste one level, or the text from “Copy all”.", importText),
  );
  $("copy-all").addEventListener("click", () => copyLevels(levels, "All levels"));
  $("add-card").addEventListener("click", () => {
    current().data.cards.push({ effect: catalog.effects[0].id, target: defaultTarget(catalog.effects[0].kinds[0]) });
    changed();
  });
  $("copy-json").addEventListener("click", () => {
    const level = current();
    const error = validationError(level.data);
    if (error && !confirm(`This level isn't valid yet:\n${error}\n\nCopy anyway?`)) return;
    copyText(formatLevel(level.data), level.name);
  });
  $("play-reset").addEventListener("click", (e) => {
    e.stopPropagation();
    playSnapshot = null;
    render();
  });
  $("play-undo").addEventListener("click", (e) => {
    e.stopPropagation();
    playTap(() => bridge.undo());
  });
  $("play-redo").addEventListener("click", (e) => {
    e.stopPropagation();
    playTap(() => bridge.redo());
  });
  $("play-save-solution").addEventListener("click", (e) => {
    e.stopPropagation();
    saveSolution();
  });
  $("play-cancel").addEventListener("click", (e) => {
    e.stopPropagation();
    playTap(() => bridge.tapNothing());
  });
  $("play").addEventListener("click", (e) => {
    if (e.target.closest("button, .cell")) return;
    playTap(() => bridge.tapNothing());
  });
  attachPlayInput($("play-board"), $("play-hand"), {
    snap: () => playSnapshot,
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

  $("sync").addEventListener("click", showSyncDialog);
  $("sync-status").addEventListener("click", showSyncDialog);
  document.addEventListener("visibilitychange", () => {
    if (sync && (document.visibilityState === "visible" || pushTimer)) queueSync();
  });

  tab = currentId ? "edit" : "levels";
  render();
  if (sync) queueSync();
  loadRules();
}

init();
