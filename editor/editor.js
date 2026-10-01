"use strict";

const STORAGE_KEY = "cardgame.levels";
const CURRENT_KEY = "cardgame.current";
const MIN_SIZE = 1;
const MAX_SIZE = 8;
const MAX_BUDGET = 9999;

const SUBSTRATE_COLORS = { 1: "#466e50", 2: "#786432", 3: "#5a4a7a", 4: "#7a4a5a" };
const LINK_COLORS = ["#c0392b", "#2e86c1", "#8e44ad", "#d68910", "#16a085", "#7f8c8d"];

// replaced by the real registries once Pyodide has loaded game/rules
let catalog = {
  tiles: [{ id: "basic", can_flip: true, can_swap: true }],
  substrates: [{ id: "plain", period: 0 }],
  effects: [{ id: "flip", kinds: ["fixed", "from", "any", "adjacent"] }],
};

let bridge = null;
let levels = [];
let currentId = null;
let tab = "levels";
let mode = "tiles";
let brush = { tiles: "basic", substrates: "plain", links: 0 };
let pickCard = null;
let playSnapshot = null;
let playLevelJson = null;
let playError = null;

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null && value !== false) node[key] = value;
  }
  for (const child of [].concat(children)) {
    if (child !== null && child !== undefined) node.append(child);
  }
  return node;
}

// ---------- storage ----------

function loadLevels() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    levels = Array.isArray(parsed) ? parsed : [];
    currentId = localStorage.getItem(CURRENT_KEY);
  } catch {
    levels = [];
    currentId = null;
  }
  if (!levels.some((level) => level.id === currentId)) currentId = levels[0]?.id ?? null;
}

function saveLevels() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
    if (currentId) localStorage.setItem(CURRENT_KEY, currentId);
  } catch {
    toast("Couldn't save: browser storage is blocked");
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function current() {
  return levels.find((level) => level.id === currentId) ?? null;
}

function blankLevel(width = 3, height = 3) {
  return {
    budget: 10,
    tiles: grid(width, height, () => catalog.tiles[0].id),
    substrates: grid(width, height, () => catalog.substrates[0].id),
    links: [],
    cards: [{ effect: "flip", target: { kind: "any", count: 1 } }],
  };
}

function grid(width, height, fill) {
  return Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, col) => fill(row, col)));
}

function addLevel(name, data) {
  const level = { id: newId(), name, updated: Date.now(), data };
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
  return (
    `{\n "budget": ${data.budget},\n` +
    ["tiles", "substrates", "links", "cards"].map((key) => block(key, data[key])).join(",\n") +
    "\n}\n"
  );
}

function normalizeLevel(raw) {
  if (!raw || !Array.isArray(raw.tiles) || !Array.isArray(raw.substrates)) {
    throw new Error("not a level: needs tiles and substrates");
  }
  return {
    budget: Number(raw.budget) || 1,
    tiles: raw.tiles,
    substrates: raw.substrates,
    links: Array.isArray(raw.links) ? raw.links : [],
    cards: Array.isArray(raw.cards) ? raw.cards : [],
  };
}

function validationError(data) {
  if (!bridge) return null;
  return bridge.validate(JSON.stringify(data)) ?? null;
}

// ---------- editing ----------

function resize(data, width, height) {
  width = clamp(width, MIN_SIZE, MAX_SIZE);
  height = clamp(height, MIN_SIZE, MAX_SIZE);
  data.tiles = grid(width, height, (r, c) => data.tiles[r]?.[c] ?? catalog.tiles[0].id);
  data.substrates = grid(width, height, (r, c) => data.substrates[r]?.[c] ?? catalog.substrates[0].id);
  const inside = ([r, c]) => r < height && c < width;
  data.links = data.links.map((group) => group.filter(inside)).filter((group) => group.length > 0);
  for (const card of data.cards) {
    if (card.target.coords) card.target.coords = card.target.coords.filter(inside);
  }
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, Math.round(Number(value) || low)));
}

function sameCoord(a, b) {
  return a[0] === b[0] && a[1] === b[1];
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
  } else if (mode === "links") {
    toggleLink(data, row, col, brush.links);
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
  $("current-name").textContent = level ? level.name : "No level selected";
  if (tab === "levels") renderLevels();
  if (tab === "edit") renderEdit();
  if (tab === "play") renderPlay();
}

function renderLevels() {
  const list = $("level-list");
  list.replaceChildren();
  if (!levels.length) {
    list.append(el("li", { class: "empty", textContent: "No levels yet. Tap “New level” to start." }));
    return;
  }
  const sorted = [...levels].sort((a, b) => b.updated - a.updated);
  for (const level of sorted) {
    const { width, height } = size(level.data);
    const open = () => {
      currentId = level.id;
      saveLevels();
      setTab("edit");
    };
    list.append(
      el("li", { class: "level-item" + (level.id === currentId ? " current" : "") }, [
        el("div", { class: "info", onclick: open }, [
          el("div", { class: "name", textContent: level.name }),
          el("div", {
            class: "meta",
            textContent: `${width}×${height} · ${level.data.cards.length} cards · ${new Date(level.updated).toLocaleString()}`,
          }),
        ]),
        el("button", { class: "small", textContent: "Rename", onclick: () => renameLevel(level) }),
        el("button", { class: "small", textContent: "Clone", title: "Duplicate", onclick: () => duplicateLevel(level) }),
        el("button", { class: "small danger", textContent: "✕", title: "Delete", onclick: () => deleteLevel(level) }),
      ]),
    );
  }
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
  addLevel(level.name + " copy", structuredClone(level.data));
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
  board.style.gridTemplateColumns = `repeat(${width}, 1fr)`;
  const picked = pickCard !== null ? data.cards[pickCard].target.coords : [];
  board.replaceChildren();
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const order = picked.findIndex((coord) => sameCoord(coord, [row, col]));
      const substrate = catalog.substrates.find((s) => s.id === data.substrates[row][col]);
      board.append(
        renderCell(
          {
            type: data.tiles[row][col],
            flipped: false,
            link: linkOf(data, row, col),
            period: substrate?.period ?? 0,
            counter: substrate?.period ?? 0,
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

  renderCards(data, width, height);
}

function renderPalette(data) {
  const palette = $("palette");
  palette.replaceChildren();
  if (mode === "tiles") {
    for (const tile of catalog.tiles) {
      palette.append(
        el("button", { class: "chip" + (brush.tiles === tile.id ? " active" : ""), onclick: () => ((brush.tiles = tile.id), render()) }, [
          el("span", { class: "swatch", style: `background:var(--tile)${tile.can_flip ? "" : ";background-image:repeating-linear-gradient(45deg,#0000 0 3px,#0004 3px 6px)"}` }),
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

function renderCell(cell, { classes = [], order = null, onclick }) {
  const tileType = catalog.tiles.find((tile) => tile.id === cell.type);
  const tileClasses = ["tile"];
  if (cell.flipped) tileClasses.push("flipped");
  if (tileType && !tileType.can_flip) tileClasses.push("nf");
  if (tileType && !tileType.can_swap) tileClasses.push("ns");
  const linkIndex = typeof cell.link === "string" ? Number(cell.link) : cell.link;
  return el(
    "div",
    {
      class: ["cell", ...classes].join(" "),
      style: cell.period > 0 ? `background:${SUBSTRATE_COLORS[cell.period] ?? "#555"}` : "",
      onclick,
    },
    el("div", { class: tileClasses.join(" ") }, [
      cell.type,
      cell.period > 0 ? el("span", { class: "counter", textContent: cell.counter }) : null,
      linkIndex !== null && linkIndex !== -1
        ? el("span", { class: "link", textContent: `L${linkIndex}`, style: `background:${LINK_COLORS[linkIndex % LINK_COLORS.length]}` })
        : null,
      order !== null ? el("span", { class: "order", textContent: order }) : null,
    ]),
  );
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
    if (!playError) playSnapshot = callBridge(() => bridge.start(playLevelJson));
  }
}

function callBridge(call) {
  try {
    return JSON.parse(call());
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
  board.replaceChildren();
  hand.replaceChildren();
  status.className = "";
  status.textContent = "";
  const snap = playSnapshot;
  if (!snap) return;

  const used = level.data.budget - snap.plays;
  if (snap.won) {
    status.textContent = `Solved in ${used} play${used === 1 ? "" : "s"}!`;
    status.className = "won";
  } else if (snap.game_over) {
    status.textContent = "Out of plays";
    status.className = "over";
  } else if (snap.targeting) {
    status.textContent = `Plays left: ${snap.plays} · pick targets`;
  } else if (snap.selected !== null) {
    status.textContent = `Plays left: ${snap.plays} · tap the card again to use it`;
  } else {
    status.textContent = `Plays left: ${snap.plays}`;
  }

  const has = (list, row, col) => list.some((coord) => sameCoord(coord, [row, col]));
  board.style.gridTemplateColumns = `repeat(${snap.width}, 1fr)`;
  snap.cells.forEach((cell, index) => {
    const row = Math.floor(index / snap.width);
    const col = index % snap.width;
    const classes = [];
    if (has(snap.picked, row, col)) classes.push("picked");
    else if (has(snap.candidate_tiles, row, col)) classes.push(snap.targeting ? "targeting" : "candidate");
    board.append(renderCell(cell, { classes, onclick: (e) => (e.stopPropagation(), playTap(() => bridge.tap_tile(row, col))) }));
  });

  snap.hand.forEach((card, index) => {
    const classes = ["card"];
    if (card.single_use) classes.push("single");
    if (snap.selected === index) classes.push("selected");
    else if (snap.candidate_cards.includes(index)) classes.push("candidate");
    hand.append(
      el("button", {
        class: classes.join(" "),
        textContent: card.label + (card.single_use ? "\n(single use)" : ""),
        onclick: (e) => (e.stopPropagation(), playTap(() => bridge.tap_card(index))),
      }),
    );
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
      for (const entry of parsed) addLevel(String(entry.name ?? "Imported"), normalizeLevel(entry.level));
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
  toast("Loading game rules…", true);
  try {
    const pyodide = await loadPyodide();
    const fetchText = async (path) => {
      const response = await fetch(path, { cache: "no-cache" });
      if (!response.ok) throw new Error(`couldn't fetch ${path} (${response.status})`);
      return response.text();
    };
    const modules = JSON.parse(await fetchText("modules.json"));
    const sources = await Promise.all([...modules.map((path) => fetchText("../" + path)), fetchText("bridge.py")]);
    const home = "/home/pyodide/";
    modules.forEach((path, index) => {
      pyodide.FS.mkdirTree(home + path.slice(0, path.lastIndexOf("/")));
      pyodide.FS.writeFile(home + path, sources[index]);
    });
    pyodide.FS.writeFile(home + "bridge.py", sources[sources.length - 1]);
    pyodide.runPython(`import sys\nif "${home}" not in sys.path: sys.path.insert(0, "${home}")`);
    bridge = pyodide.pyimport("bridge");
    catalog = JSON.parse(bridge.catalog());
    brush.tiles = catalog.tiles[0].id;
    brush.substrates = catalog.substrates[0].id;
    toast("Rules loaded");
  } catch (error) {
    console.error(error);
    toast("Couldn't load rules: " + (error.message ?? error), true);
  }
  playSnapshot = null;
  render();
}

function init() {
  loadLevels();
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
  $("new-level").addEventListener("click", () => {
    const name = prompt("Level name", `Level ${levels.length + 1}`);
    if (name === null) return;
    addLevel(name.trim() || `Level ${levels.length + 1}`, blankLevel());
    setTab("edit");
  });
  $("import-level").addEventListener("click", () =>
    showTextDialog("Import JSON", "", "Paste one level, or the text from “Copy all”.", importText),
  );
  $("copy-all").addEventListener("click", () => {
    if (!levels.length) return toast("No levels to copy");
    copyText(JSON.stringify(levels.map((level) => ({ name: level.name, level: level.data }))), "All levels");
  });
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
  $("play").addEventListener("click", (e) => {
    if (e.target.closest("button, .cell")) return;
    playTap(() => bridge.tap_nothing());
  });

  tab = currentId ? "edit" : "levels";
  render();
  loadRules();
}

init();
