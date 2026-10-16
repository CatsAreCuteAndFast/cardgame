// shared by the editor (editor/*.js) and the tester page (play/play.js)

import * as bridge from "./bridge.js";

export const SUBSTRATE_COLORS = { oneturn: "#466e50", twoturn: "#786432", oneneighbour: "#3d6b80", twoneighbour: "#5a4a7a" };
export const LINK_COLORS = ["#c0392b", "#2e86c1", "#8e44ad", "#d68910", "#16a085", "#7f8c8d"];

// tile, substrate and effect ids and the target kinds each effect takes, from the rules
export const catalog = bridge.catalog();

export const $ = (id) => document.getElementById(id);

export function el(tag, props = {}, children = []) {
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

export function sameCoord(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

export function setBoardShape(board, width, height) {
  board.style.gridTemplateColumns = `repeat(${width}, 1fr)`;
  board.style.setProperty("--cols", width);
  board.style.setProperty("--rows", height);
}

// a value from the animation variables on :root (editor.css): a time in ms, or the raw text (easing curves)
export function cssMs(name) {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
}
export function cssValue(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// how long a flip runs in ms: the longest part (press, light, glow, recoil) of flipping or unflipping, from the CSS variables in editor.css
export function flipDuration() {
  const ends = [];
  for (const part of ["press", "light", "glow", "recoil"]) {
    for (const off of ["", "-off"]) ends.push(cssMs(`--${part}-start${off}`) + cssMs(`--${part}-ms${off}`));
  }
  return Math.max(...ends);
}

// which part of the grain (grain.js) tile or card number n shows, so neighbours don't share the same grain
function grainSpot(n) {
  const hash = Math.imul(n + 1, 2654435761) >>> 0;
  return `--gx:${hash % 100}%;--gy:${(hash >>> 8) % 100}%;`;
}

// anim: { on, elapsed, total, from?, to? } plays the press-and-light (or reverse) animation, already elapsed ms in (negative waits);
// from/to are how lit the tile is before and after (0, .5 for half or 1), and a step to or from half without lit only grows or shrinks the light.
// the animation classes come off when it ends, so the browser drops the layers it made for it.
// tile: { classes, style, tick } go on the .tile itself, for the one-shot step animations (swap, dud, win, intro) and the timer's tick
export function renderCell(cell, { classes = [], order = null, onclick, anim = null, grain = 0, tile: extra = {} }) {
  const tileType = catalog.tiles.find((tile) => tile.id === cell.type);
  const tileClasses = ["tile", ...(extra.classes ?? [])];
  if (cell.flipped) tileClasses.push("flipped");
  if (cell.half) tileClasses.push("half");
  if (tileType && !tileType.can_flip) tileClasses.push("nf");
  if (tileType && !tileType.can_swap) tileClasses.push("ns");
  if (tileType?.states === 3) tileClasses.push("three");
  const from = anim?.from ?? (anim?.on ? 0 : 1);
  const to = anim?.to ?? (anim?.on ? 1 : 0);
  if (anim) tileClasses.push(Math.max(from, to) < 1 ? "anim-half" : anim.on ? "anim-on" : "anim-off");
  const linkIndex = typeof cell.link === "string" ? Number(cell.link) : cell.link;
  const style =
    grainSpot(grain) + (anim ? `--anim-delay:${-Math.round(anim.elapsed)}ms;--l-from:${from};--l-to:${to};` : "") + (extra.style ?? "");
  const substrate = catalog.substrates.find((entry) => entry.id === cell.substrate);
  const counterClass = "counter" + (substrate?.ticks === "neighbour" ? " near" : "") + (extra.tick ? (cell.counter === 0 ? " tick ready" : " tick") : "");
  const tile = el("div", { class: tileClasses.join(" "), title: cell.type, style }, [
    el("div", { class: "base" }),
    el("div", { class: "face" }, [
      el("div", { class: "light" }),
      el("div", { class: "grain" }),
      el("div", { class: "shade" }),
      el("div", { class: "glow" }),
      el("div", { class: "flash" }),
      tileType?.states === 3 ? el("span", { class: "pips" }, [el("i"), el("i")]) : null,
      cell.period > 0 ? el("span", { class: counterClass, textContent: cell.counter }) : null,
      linkIndex !== null && linkIndex !== -1
        ? el("span", { class: "link", textContent: `L${linkIndex}`, style: `background:${LINK_COLORS[linkIndex % LINK_COLORS.length]}` })
        : null,
      order !== null ? el("span", { class: "order", textContent: order }) : null,
    ]),
    ring("valid"),
    ring("lock"),
  ]);
  if (anim) setTimeout(() => tile.classList.remove("anim-on", "anim-off", "anim-half"), anim.total - anim.elapsed);
  return el(
    "div",
    {
      class: ["cell", ...classes].join(" "),
      style: cell.period > 0 ? `background:${SUBSTRATE_COLORS[cell.substrate] ?? "#555"}` : "",
      onclick,
    },
    tile,
  );
}

// a tile outline (art/outlines): a rounded rect 8/110 of the tile outside it, dashes measured on a 420-long path
function ring(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", `ring ${kind}`);
  svg.setAttribute("viewBox", "0 0 126 126");
  svg.innerHTML = '<rect x="1.5" y="1.5" width="123" height="123" rx="21" pathLength="420"/>';
  return svg;
}

// the board is rebuilt after every play, which restarts the marching dashes; starting them all at time 0 keeps every outline in step
function syncAnts(board) {
  for (const anim of board.getAnimations({ subtree: true })) if (anim.animationName === "ants") anim.startTime = 0;
}

// per board: the picked tiles last shown, so only a newly picked tile pops its outline in and presses;
// returns the keys ("row,col") that were picked last time
const pickHistory = new WeakMap();

function lastPicked(board, snap) {
  const prev = pickHistory.get(board);
  pickHistory.set(board, { game: snap.game_id, keys: snap.picked.map(([row, col]) => `${row},${col}`) });
  return prev && prev.game === snap.game_id ? prev.keys : [];
}

// per board: the last snapshot shown, when its last one-play step (a play, undo or redo) happened and which move it was,
// and when each tile last flipped, so the step's animations continue across re-renders.
// only a step in the same game animates; a new game (loading, reset, another level) gets the intro instead.
// a tile flipped through its link (not picked itself) starts --link-delay later than the picked one; swapped tiles slide instead of flipping
const boardHistory = new WeakMap();

function trackBoard(board, snap) {
  const now = performance.now();
  const prev = boardHistory.get(board);
  const sameGame = Boolean(prev && prev.game === snap.game_id);
  const stepped = sameGame && Math.abs(prev.plays - snap.plays) === 1;
  const step = stepped ? snap.step : null;
  const listed = (list, index) => list.some(([row, col]) => row * snap.width + col === index);
  const swapped = step?.effect === "swap" ? step.cells : [];
  const linkDelay = cssMs("--link-delay");
  const changed = snap.cells.map((cell, index) => stepped && lit(cell) !== lit(prev.snap.cells[index]) && !listed(swapped, index));
  const changedAt = snap.cells.map((cell, index) => {
    if (!sameGame) return -Infinity;
    if (!changed[index]) return prev.changedAt[index];
    return now + (listed(step.cells, index) ? 0 : linkDelay);
  });
  const changedFrom = snap.cells.map((cell, index) => (!sameGame ? 0 : changed[index] ? lit(prev.snap.cells[index]) : prev.changedFrom[index]));
  const entry = {
    game: snap.game_id,
    plays: snap.plays,
    snap,
    sameGame,
    stepped,
    changedAt,
    changedFrom,
    stepAt: stepped ? now : sameGame ? prev.stepAt : -Infinity,
    step: stepped ? step : sameGame ? prev.step : null,
    before: stepped ? prev.snap : sameGame ? prev.before : null,
  };
  boardHistory.set(board, entry);
  return entry;
}

// how lit a tile is: 0 off, .5 half (three-state tiles), 1 lit
const lit = (cell) => (cell.flipped ? 1 : cell.half ? 0.5 : 0);

function flipAnimations(track) {
  const now = performance.now();
  const total = flipDuration();
  return track.snap.cells.map((cell, index) => {
    const elapsed = now - track.changedAt[index];
    const to = lit(cell);
    const from = track.changedFrom[index];
    return elapsed < total ? { on: to > from, from, to, elapsed, total } : null;
  });
}

// the one-shot animations a step gives the tile at index: swapped tiles slide across (the first pick over the other), a picked tile that
// didn't change presses and comes back (dud), a timer that changed ticks, the tiles a play used show the lock ring for a moment (locked),
// and when the step won a wash runs out from the board's middle, swelling each tile a little with a sheen over its face
function stepExtras(track, index, centreRow, centreCol) {
  const { step, before, snap } = track;
  const elapsed = performance.now() - track.stepAt;
  const row = Math.floor(index / snap.width);
  const col = index % snap.width;
  const classes = [];
  const cellClasses = [];
  let style = `--step-delay:${-Math.round(elapsed)}ms;`;
  let tick = false;
  if (!step || !before) return { classes, cellClasses, style, tick };
  const cell = snap.cells[index];
  const old = before.cells[index];
  const picked = step.cells.findIndex((coord) => sameCoord(coord, [row, col]));
  if (picked !== -1 && !step.reverse && elapsed < cssMs("--lock-hold") + cssMs("--lock-ms")) cellClasses.push("locked");
  if (step.effect === "swap" && step.cells.length === 2 && picked !== -1 && elapsed < cssMs("--swap-ms")) {
    // the tile now in the second pick's cell is the one picked first: it travels over the other
    const other = step.cells[1 - picked];
    classes.push("swap", picked === 1 ? "over" : "under");
    cellClasses.push(picked === 1 ? "swap-over" : "swap-under");
    style += `--dx:${other[1] - col};--dy:${other[0] - row};`;
  } else if (step.effect === "flip" && picked !== -1 && lit(cell) === lit(old) && elapsed < cssMs("--tap-ms")) {
    classes.push("dud");
  }
  const tickFor = Math.max(cssMs("--tick-ms"), catalog.substrates.find((entry) => entry.id === cell.substrate)?.ticks === "neighbour" ? cssMs("--mark-ms") : 0);
  if (old.counter !== cell.counter && elapsed < cssMs("--tick-start") + tickFor) tick = true;
  if (snap.won && !before.won) {
    const distance = Math.hypot(row - centreRow, col - centreCol);
    if (elapsed < cssMs("--win-start") + distance * cssMs("--win-stagger") + cssMs("--win-ms")) {
      classes.push("win");
      style += `--win-d:${distance.toFixed(2)};`;
    }
  }
  return { classes, cellClasses, style, tick };
}

const CARD_FACES = {
  "flip:fixed": { icon: "↻", name: "Flip all", color: "#c4561a" },
  "flip:from": { icon: "↻", name: "Flip one", color: "#e8792f" },
  flip: { icon: "↻", name: "Flip", color: "#c4561a" },
  swap: { icon: "⇄", name: "Swap", color: "#8a74b8" },
  retarget: { icon: "✎", name: "Retarget", color: "#b0558a" },
};

function cardFace(effect, kind) {
  return CARD_FACES[`${effect}:${kind}`] ?? CARD_FACES[effect] ?? { icon: "?", name: effect, color: "#555" };
}

function cardArt(target, width, height) {
  if (target.kind === "card") {
    return el("div", { class: "retarget-art" }, [
      el("span", { class: "mini-card fixed" }),
      el("span", { class: "arrow", textContent: "⇄" }),
      el("span", { class: "mini-card from" }),
    ]);
  }
  const marks = target.kind === "fixed" ? "on" : target.kind === "from" ? "opt" : "any";
  const listed = target.coords ?? [];
  const cells = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const hit = target.coords ? listed.some((coord) => sameCoord(coord, [row, col])) : true;
      cells.push(el("span", { class: hit ? marks : "" }));
    }
  }
  const map = el("div", { class: "mini-map", style: `--cols:${width};--rows:${height}` }, cells);
  if (target.kind === "any") map.append(el("span", { class: "mini-count", textContent: `×${target.count}` }));
  if (target.kind === "adjacent") {
    const pair = Array.from({ length: target.count }, () => el("span"));
    map.append(el("span", { class: "mini-count pair" }, pair));
  }
  return map;
}

function cardClasses(card, extra = []) {
  const all = ["card", `effect-${card.effect}`, ...extra];
  if (card.single_use) all.push("single");
  if (card.copy) all.push("copy");
  return all;
}

function renderCard(card, snap, { classes = [], badge = null, grain = 0, style = "" } = {}) {
  const face = cardFace(card.effect, card.kind);
  const target = card.target ?? { kind: card.kind };
  return el("button", { class: cardClasses(card, classes).join(" "), style: `--effect:${face.color};${grainSpot(grain + 1000)}${style}`, title: card.label }, [
    el("div", { class: "card-head" }, [el("span", { class: "card-icon", textContent: face.icon }), face.name]),
    el("div", { class: "card-art" }, cardArt(target, snap.width, snap.height)),
    card.copy ? el("span", { class: "copy-tag", textContent: "copy" }) : null,
    badge ? el("span", { class: "badge", textContent: badge }) : null,
  ]);
}

function setBadge(node, badge) {
  let existing = node.querySelector(".badge");
  if (!badge) return existing?.remove();
  if (!existing) node.append((existing = el("span", { class: "badge" })));
  existing.textContent = badge;
}

export function playStatus(snap, budget) {
  const used = budget - snap.plays;
  if (snap.won) return { text: `Solved in ${used} play${used === 1 ? "" : "s"}!`, className: "won" };
  if (snap.game_over) return { text: "Out of plays", className: "over" };
  return { text: `Plays left: ${snap.plays}`, className: "" };
}

// sets a line's text and class, sliding the new text in when it changed
export function setText(node, text, className = "") {
  if (node.dataset.text === text && node.dataset.cls === className) return;
  node.dataset.text = text;
  node.dataset.cls = className;
  node.textContent = text;
  node.className = className;
  void node.offsetWidth;
  node.classList.add("text-in");
}

function selectedCard(snap) {
  return snap.selected === null ? null : snap.hand[snap.selected];
}

export function playPrompt(snap) {
  if (snap.won || snap.game_over) return "";
  const card = selectedCard(snap);
  if (!card) return "Tap a card, or drag it onto the board";
  const progress = snap.needed > 1 ? ` (${snap.picked.length}/${snap.needed})` : "";
  switch (card.kind) {
    case "fixed":
      return "Tap one of the highlighted tiles to play the card";
    case "from":
      return "Tap one of the highlighted tiles";
    case "any":
      return snap.needed === 1 ? "Tap any tile" : `Tap ${snap.needed} tiles${progress}`;
    case "adjacent":
      if (snap.picked.length === 0) return `Swipe across ${snap.needed === 2 ? "two neighbouring" : "neighbouring"} tiles, or tap them`;
      return `Tap a neighbouring tile${progress}`;
    case "card":
      return "Tap a highlighted card to change it";
    default:
      return "";
  }
}

function canSwipe(snap) {
  return Boolean(snap?.targeting && selectedCard(snap)?.kind === "adjacent" && snap.picked.length === 0);
}

function findCell(board, [row, col]) {
  return board.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}

function cellCoord(cell) {
  return [Number(cell.dataset.row), Number(cell.dataset.col)];
}

function shake(node) {
  if (!node) return;
  node.classList.remove("shake");
  void node.offsetWidth;
  node.classList.add("shake");
}

// marks what card would change
function showPreview(board, preview, blocked, card) {
  for (const cell of board.querySelectorAll(".cell")) cell.classList.remove("preview", "preview-outline", "blocked");
  // flip all doesn't say which of its tiles would change: working that out is the player's job, so it only shows its outlines
  if (!(card?.effect === "flip" && card.kind === "fixed")) {
    const previewClass = card?.effect === "flip" ? "preview" : "preview-outline";
    for (const coord of preview) findCell(board, coord)?.classList.add(previewClass);
    for (const coord of blocked) findCell(board, coord)?.classList.add("blocked");
  }
  syncAnts(board);
}

// the page's tap handlers, read by the one click listener each board and hand gets (so updating a cell or card in place can't leave a stale handler)
const handlers = new WeakMap();

function listen(board, hand, { onTile, onCard }) {
  handlers.set(board, { onTile, onCard });
  if (handlers.has(hand)) return;
  handlers.set(hand, true);
  board.addEventListener("click", (e) => {
    const cell = e.target.closest(".cell[data-row]");
    if (!cell) return;
    e.stopPropagation();
    if (board.classList.contains("picking") && !cell.classList.contains("targeting")) return shake(cell);
    handlers.get(board).onTile(...cellCoord(cell));
  });
  hand.addEventListener("click", (e) => {
    const card = e.target.closest(".card[data-index]");
    if (!card) return;
    e.stopPropagation();
    handlers.get(board).onCard(Number(card.dataset.index));
  });
}

// the centre of a node in viewport px
function centre(node) {
  const rect = node.getBoundingClientRect();
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

// set while a drop plays a card, so the hand doesn't also send a copy of the card flying: the drag ghost does that
let ghostPlays = false;

// a fixed-position copy of a card at rect, for a card leaving the hand
function cardClone(node, rect) {
  const clone = node.cloneNode(true);
  clone.className = node.className.replace(/\b(selected|candidate|peeking|drag-source|drop-target|played)\b/g, "") + " card-fly";
  Object.assign(clone.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  clone.removeAttribute("data-index");
  document.body.append(clone);
  return clone;
}

// a used-up card burns: an ember line climbs the card leaving char behind, then the husk fades (.burn in editor.css); the node is removed after
export function burn(node) {
  node.append(el("div", { class: "ember" }));
  node.classList.add("burn");
  setTimeout(() => node.remove(), cssMs("--burn-ms") + 100);
}

// adds an animation class to a card and takes it off when that animation ends, so a later clone (the drag ghost) doesn't replay it
function addAnim(node, name) {
  node.classList.add(name);
  const done = (e) => e.target === node && node.classList.remove(name);
  node.addEventListener("animationend", done, { once: true });
  node.addEventListener("animationcancel", done, { once: true });
}

// after a play rebuilt the hand: the played card stamps down, or burns in its slot when it was used up
function animateHand(hand, step, oldNodes, oldRects) {
  if (step.reverse) return;
  if (!step.used_up) {
    const node = hand.querySelectorAll(".card[data-index]")[step.card];
    if (node) addAnim(node, "played");
  } else if (oldNodes[step.card] && !ghostPlays && !reducedMotion()) burn(cardClone(oldNodes[step.card], oldRects[step.card]));
}

const STEP_CLASSES = new Set(["swap-over", "swap-under", "locked", "lock-in"]);

// takes a cell's press off once it has played, so it can't replay
function unpress(cell) {
  if (cell.classList.contains("press")) setTimeout(() => cell.classList.remove("press"), cssMs("--tap-ms"));
}
const STEP_KEEP_MS = 1200;

// the win's wash: a soft ring that grows out from the board's middle, timed to reach the farthest tile as its sheen starts
function wash(snap, centreRow, centreCol) {
  const farthest = Math.hypot(centreRow, centreCol);
  const ms = Math.round(cssMs("--win-start") + farthest * cssMs("--win-stagger") + cssMs("--win-ms") * 0.6);
  const node = el("div", { class: "wash", style: `--wash-ms:${ms}ms;` });
  setTimeout(() => node.remove(), cssMs("--win-start") + ms + 100);
  return node;
}

// renders a snapshot. between plays the board and hand are updated in place (classes and badges), so CSS transitions and
// the outline animations run only where something changed; a one-play step (or a new game) rebuilds them, with the step's animations
export function renderSnapshot(snap, board, hand, { onTile, onCard }) {
  const scroll = [window.scrollX, window.scrollY, hand.scrollLeft];
  listen(board, hand, { onTile, onCard });
  const track = trackBoard(board, snap);
  const has = (list, row, col) => list.some((coord) => sameCoord(coord, [row, col]));
  const card = selectedCard(snap);
  const pickingTiles = snap.targeting && card?.kind !== "card";
  setBoardShape(board, snap.width, snap.height);
  board.classList.toggle("swipe", canSwipe(snap));
  board.classList.toggle("picking", pickingTiles);
  board.classList.toggle("won", snap.won);
  board.classList.toggle("over", snap.game_over);
  const wasPicked = lastPicked(board, snap);
  // flipping: whether the tile is mid-flip, so a fresh pick's press (which would otherwise start when the flip's classes come off) is skipped
  const cellClasses = (row, col, flipping) => {
    const classes = [];
    const candidate = has(snap.candidate_tiles, row, col);
    if (has(snap.picked, row, col)) classes.push("picked", ...(wasPicked.includes(`${row},${col}`) ? [] : ["lock-in", ...(flipping ? [] : ["press"])]));
    else if (candidate) classes.push(snap.targeting ? "targeting" : "candidate");
    return classes;
  };
  const centreRow = (snap.height - 1) / 2;
  const centreCol = (snap.width - 1) / 2;

  const cells = board.querySelectorAll(".cell");
  const rebuild = !track.sameGame || track.stepped || cells.length !== snap.cells.length;
  if (rebuild) {
    board.replaceChildren();
    board.classList.toggle("intro", !track.sameGame);
    const anims = flipAnimations(track);
    snap.cells.forEach((cell, index) => {
      const row = Math.floor(index / snap.width);
      const col = index % snap.width;
      const extra = track.stepped ? stepExtras(track, index, centreRow, centreCol) : { classes: [], cellClasses: [], style: "", tick: false };
      if (!track.sameGame) extra.style += `--d:${Math.hypot(row - centreRow, col - centreCol).toFixed(2)};`;
      // a tile a play used shows the lock ring for a moment; it pops in unless it was already locked
      if (extra.cellClasses.includes("locked") && !wasPicked.includes(`${row},${col}`)) extra.cellClasses.push("lock-in");
      if (anims[index]) extra.classes = extra.classes.filter((name) => name !== "dud");
      const node = renderCell(cell, { classes: [...cellClasses(row, col, Boolean(anims[index])), ...extra.cellClasses], grain: index, anim: anims[index], tile: extra });
      node.dataset.row = row;
      node.dataset.col = col;
      board.append(node);
      unpress(node);
    });
    if (track.stepped && snap.won && track.before && !track.before.won) board.append(wash(snap, centreRow, centreCol));
  } else {
    // the step's classes stay while its animations run, so a tap mid-animation doesn't cut them short
    const running = performance.now() - track.stepAt < STEP_KEEP_MS;
    cells.forEach((node, index) => {
      const kept = running ? [...node.classList].filter((name) => STEP_CLASSES.has(name)) : [];
      const flipping = /\banim-(on|off)\b/.test(node.firstElementChild?.className ?? "");
      node.className = ["cell", ...cellClasses(Math.floor(index / snap.width), index % snap.width, flipping), ...kept].join(" ");
      unpress(node);
    });
  }
  showPreview(board, snap.preview, snap.blocked, card);

  hand.classList.toggle("done", snap.won || snap.game_over);
  const classesOf = (index) => (snap.selected === index ? ["selected"] : snap.candidate_cards.includes(index) ? ["candidate"] : []);
  const badgeOf = (index) => (snap.selected === index && snap.needed > 1 ? `${snap.picked.length}/${snap.needed}` : null);
  const oldNodes = [...hand.querySelectorAll(".card[data-index]")];
  if (!track.sameGame || track.stepped || oldNodes.length !== snap.hand.length) {
    const oldRects = track.stepped ? oldNodes.map((node) => node.getBoundingClientRect()) : [];
    hand.replaceChildren();
    hand.classList.toggle("intro", !track.sameGame);
    snap.hand.forEach((card, index) => {
      const node = renderCard(card, snap, { classes: classesOf(index), badge: badgeOf(index), grain: index, style: `--i:${index};` });
      node.dataset.index = index;
      hand.append(node);
    });
    window.scrollTo(scroll[0], scroll[1]);
    hand.scrollLeft = scroll[2];
    if (track.stepped && track.step) animateHand(hand, track.step, oldNodes, oldRects);
    return;
  }
  oldNodes.forEach((node, index) => {
    node.className = cardClasses(snap.hand[index], classesOf(index)).join(" ");
    setBadge(node, badgeOf(index));
  });
  window.scrollTo(scroll[0], scroll[1]);
  hand.scrollLeft = scroll[2];
}

// a drag only acts on drop: a fixed card dropped on the board plays, other tile cards get selected,
// and retarget is dropped on the card to change; swiping picks neighbouring tiles.
// while a tile card is dragged, its options and changes fade in as it nears the board's centre (--drag 0..1).
// holding a card still shows the same at full strength until it is let go.
// the ghost that follows the finger never just vanishes: it shrinks into the tile or card it was played on (or the board, for a tile card
// dropped there to pick its tiles), or flies back to its place in the hand.
// every gesture ends as the same bridge calls that taps make
// api: { snap(), card(i), tile(row, col), nothing(), peek(i), render() }
export function attachPlayInput(board, hand, api) {
  const DRAG_START = 10;
  const LONG_PRESS = 400;
  let press = null;
  let suppressClickUntil = 0;

  const under = (e, selector) => document.elementFromPoint(e.clientX, e.clientY)?.closest(selector) ?? null;
  const over = (node, e) => {
    const rect = node.getBoundingClientRect();
    return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
  };
  const cardNode = (index) => hand.querySelector(`.card[data-index="${index}"]`);
  const clearDropTargets = () => {
    for (const node of document.querySelectorAll(".drop-target")) node.classList.remove("drop-target");
  };

  function select(index) {
    const snap = api.snap();
    if (snap.selected === index) return false;
    if (selectedCard(snap)?.kind === "card") api.nothing();
    api.card(index);
    return true;
  }

  // shows what the card at index would do without selecting it; returns true if it acts on tiles
  function showPeek(index) {
    const card = api.snap()?.hand[index];
    const peek = card && api.peek(index);
    if (!peek) return false;
    for (const cell of board.querySelectorAll(".cell")) cell.classList.remove("candidate", "targeting", "picked");
    for (const node of hand.querySelectorAll(".card")) node.classList.remove("candidate");
    if (card.kind === "card") {
      for (const i of peek.candidate_cards) cardNode(i)?.classList.add("candidate");
      return false;
    }
    for (const coord of peek.candidate_tiles) findCell(board, coord)?.classList.add("targeting");
    showPreview(board, peek.preview, peek.blocked, card);
    return true;
  }

  const placeGhost = (x, y) => (press.ghost.style.translate = `${x}px ${y}px`);

  function startCardDrag(e) {
    const source = cardNode(press.index);
    if (!source) return (press = null);
    press.ghost = source.cloneNode(true);
    press.ghost.classList.remove("selected", "candidate", "drop-target", "peeking", "played");
    press.ghost.classList.add("drag-ghost");
    placeGhost(e.clientX, e.clientY);
    document.body.append(press.ghost);
    source.classList.remove("peeking");
    source.classList.add("drag-source");
    if (!showPeek(press.index)) return;
    board.classList.add("dragging");
    board.style.setProperty("--drag", 0);
  }

  function startLongPress() {
    if (!press || press.dragging) return;
    press.peeking = true;
    cardNode(press.index)?.classList.add("peeking");
    showPeek(press.index);
  }

  // measured only along the axis the card comes in on (the one it started further from the centre on)
  function dragStrength(e) {
    const rect = board.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const vertical = Math.abs(press.y - cy) >= Math.abs(press.x - cx);
    const full = (vertical ? rect.height : rect.width) * 0.15;
    const start = vertical ? Math.abs(press.y - cy) : Math.abs(press.x - cx);
    const now = vertical ? Math.abs(e.clientY - cy) : Math.abs(e.clientX - cx);
    return Math.min(1, Math.max(0, (start - now) / Math.max(1, start - full)));
  }

  function moveCardDrag(e) {
    placeGhost(e.clientX, e.clientY);
    const snap = api.snap();
    const card = snap.hand[press.index];
    clearDropTargets();
    if (card.kind !== "card") {
      board.style.setProperty("--drag", dragStrength(e).toFixed(3));
      return;
    }
    const target = under(e, ".card[data-index]");
    if (target && Number(target.dataset.index) !== press.index) target.classList.add("drop-target");
  }

  // acts on the drop and says where the ghost goes: { node, into } flies into node (a tile or card it was played on), else back to node (its card)
  function endCardDrag(e) {
    const snap = api.snap();
    const card = snap.hand[press.index];
    const index = press.index;
    const back = () => ({ node: cardNode(index), into: false });
    if (card.kind === "card") {
      const target = under(e, ".card[data-index]");
      const targetIndex = target ? Number(target.dataset.index) : null;
      if (targetIndex === null || targetIndex === index) return (api.render(), back());
      select(index);
      if (api.snap()?.candidate_cards.includes(targetIndex)) {
        playWithGhost(() => api.card(targetIndex));
        return { node: cardNode(targetIndex < index ? targetIndex : targetIndex - 1) ?? hand, into: true, burnt: card.single_use };
      }
      api.nothing();
      shake(cardNode(targetIndex));
      return back();
    }
    if (!over(board, e)) return (api.render(), back());
    select(index);
    // a card that still needs its tiles picked is selected; its ghost sinks into the board like a played one
    if (card.kind !== "fixed") return api.snap()?.selected === index ? { node: board, into: true } : back();
    const [target] = api.snap()?.candidate_tiles ?? [];
    if (!target) return back();
    playWithGhost(() => api.tile(...target));
    return { node: findCell(board, target) ?? board, into: true, burnt: card.single_use };
  }

  function playWithGhost(play) {
    ghostPlays = true;
    try {
      play();
    } finally {
      ghostPlays = false;
    }
  }

  // a used-up card burns where it was dropped; otherwise the ghost shrinks into the node it was played on,
  // or flies back to it (its card in the hand) and fades as it lands
  function flyGhost(ghost, { node, into, burnt }) {
    if (!ghost) return;
    if (!node || reducedMotion()) return ghost.remove();
    if (burnt) return burn(ghost);
    const [x, y] = centre(node);
    const ms = cssMs(into ? "--fly-ms" : "--return-ms");
    const from = { translate: ghost.style.translate, transform: "translate(-50%, -75%) rotate(-4deg) scale(1)" };
    const to = { translate: `${x}px ${y}px`, transform: `translate(-50%, -50%) rotate(0deg) scale(${into ? 0.3 : 1})` };
    ghost.animate([from, to], { duration: ms, easing: cssValue(into ? "--fly-ease" : "--card-ease"), fill: "forwards" });
    const fade = into
      ? ghost.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: ms, easing: "ease-in", fill: "forwards" })
      : ghost.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: ms * 0.45, delay: ms * 0.55, fill: "forwards" });
    fade.onfinish = fade.oncancel = () => ghost.remove();
    setTimeout(() => ghost.remove(), ms + 100);
  }

  // the neighbour under the finger shows as picked (its lock ring pops in) until the finger leaves it
  function moveSwipe(e) {
    const cell = under(e, ".cell.targeting[data-row]");
    if (cell === press.hover) return;
    press.hover?.classList.remove("picked", "lock-in", "press");
    press.hover = cell;
    cell?.classList.add("picked", "lock-in", "press");
    if (cell) unpress(cell);
  }

  function endSwipe(e) {
    const cell = under(e, ".cell[data-row]");
    const to = cell ? cellCoord(cell) : null;
    if (to && api.snap()?.candidate_tiles.some((coord) => sameCoord(coord, to))) return api.tile(...to);
    api.render();
  }

  function finish(e, cancelled) {
    clearTimeout(press?.timer);
    if (press?.peeking && !press.dragging) {
      press = null;
      suppressClickUntil = performance.now() + 50;
      return api.render();
    }
    if (press?.kind === "swipe") suppressClickUntil = performance.now() + 50;
    if (!press?.dragging) return (press = null);
    const { ghost, kind, index } = press;
    clearDropTargets();
    board.classList.remove("dragging");
    board.style.removeProperty("--drag");
    suppressClickUntil = performance.now() + 50;
    try {
      if (cancelled) {
        api.render();
        flyGhost(ghost, { node: cardNode(index), into: false });
      } else if (kind === "card") flyGhost(ghost, endCardDrag(e));
      else endSwipe(e);
    } finally {
      if (ghost?.isConnected && !ghost.getAnimations().length) ghost.remove();
      press = null;
    }
  }

  hand.addEventListener("pointerdown", (e) => {
    const card = e.target.closest(".card[data-index]");
    const snap = api.snap();
    if (!e.isPrimary || !card || !snap || snap.won || snap.game_over) return;
    press = { kind: "card", index: Number(card.dataset.index), x: e.clientX, y: e.clientY, dragging: false };
    press.timer = setTimeout(startLongPress, LONG_PRESS);
  });
  hand.addEventListener("contextmenu", (e) => e.target.closest(".card") && e.preventDefault());
  // a swipe picks its first tile as soon as it is touched (the click that follows is dropped), so the lock ring and the neighbours show at once
  board.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest(".cell[data-row]");
    if (!e.isPrimary || !cell || !canSwipe(api.snap()) || !cell.classList.contains("targeting")) return;
    press = { kind: "swipe", from: cellCoord(cell), x: e.clientX, y: e.clientY, dragging: false, hover: null };
    api.tile(...press.from);
  });
  document.addEventListener("pointermove", (e) => {
    if (!press || !e.isPrimary) return;
    if (!press.dragging) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_START) return;
      press.dragging = true;
      clearTimeout(press.timer);
      if (press.kind === "card") startCardDrag(e);
      if (!press) return;
    }
    if (press.kind === "card") moveCardDrag(e);
    else moveSwipe(e);
  });
  document.addEventListener("pointerup", (e) => e.isPrimary && finish(e, false));
  document.addEventListener("pointercancel", (e) => e.isPrimary && finish(e, true));
  document.addEventListener(
    "click",
    (e) => {
      if (performance.now() > suppressClickUntil) return;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
}

function isNeighbour([r1, c1], [r2, c2]) {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

let toastTimer = null;

// shows a short message in the banner at the bottom (sticky ones stay until the next message)
export function toast(message, sticky = false) {
  const node = $("loading");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => (node.hidden = true), 1800);
}
