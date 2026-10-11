// shared by the editor (editor/*.js) and the tester page (play/play.js)

import * as bridge from "./bridge.js";

export const SUBSTRATE_COLORS = { 1: "#466e50", 2: "#786432", 3: "#5a4a7a", 4: "#7a4a5a" };
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

// anim: { on, elapsed, total } plays the press-and-light (or reverse) animation, already elapsed ms in (negative waits).
// the animation classes come off when it ends, so the browser drops the layers it made for it.
// tile: { classes, style, tick } go on the .tile itself, for the one-shot step animations (swap, dud, win, intro) and the timer's tick
export function renderCell(cell, { classes = [], order = null, onclick, anim = null, grain = 0, tile: extra = {} }) {
  const tileType = catalog.tiles.find((tile) => tile.id === cell.type);
  const tileClasses = ["tile", ...(extra.classes ?? [])];
  if (cell.flipped) tileClasses.push("flipped");
  if (tileType && !tileType.can_flip) tileClasses.push("nf");
  if (tileType && !tileType.can_swap) tileClasses.push("ns");
  if (anim) tileClasses.push(anim.on ? "anim-on" : "anim-off");
  const linkIndex = typeof cell.link === "string" ? Number(cell.link) : cell.link;
  const style = grainSpot(grain) + (anim ? `--anim-delay:${-Math.round(anim.elapsed)}ms;` : "") + (extra.style ?? "");
  const tile = el("div", { class: tileClasses.join(" "), title: cell.type, style }, [
    el("div", { class: "base" }),
    el("div", { class: "face" }, [
      el("div", { class: "light" }),
      el("div", { class: "grain" }),
      el("div", { class: "shade" }),
      el("div", { class: "glow" }),
      el("div", { class: "flash" }),
      cell.period > 0 ? el("span", { class: "counter" + (extra.tick ? (cell.counter === 0 ? " tick ready" : " tick") : ""), textContent: cell.counter }) : null,
      linkIndex !== null && linkIndex !== -1
        ? el("span", { class: "link", textContent: `L${linkIndex}`, style: `background:${LINK_COLORS[linkIndex % LINK_COLORS.length]}` })
        : null,
      order !== null ? el("span", { class: "order", textContent: order }) : null,
    ]),
    ring("valid"),
    ring("lock"),
  ]);
  if (anim) setTimeout(() => tile.classList.remove("anim-on", "anim-off"), anim.total - anim.elapsed);
  return el(
    "div",
    {
      class: ["cell", ...classes].join(" "),
      style: cell.period > 0 ? `background:${SUBSTRATE_COLORS[cell.period] ?? "#555"}` : "",
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

// per board: the picked tiles last shown, so only a newly picked tile pops its outline in and presses
const pickHistory = new WeakMap();

function newlyPicked(board, snap) {
  const prev = pickHistory.get(board);
  const keys = snap.picked.map(([row, col]) => `${row},${col}`);
  pickHistory.set(board, { game: snap.game_id, keys });
  const old = prev && prev.game === snap.game_id ? prev.keys : [];
  return keys.filter((key) => !old.includes(key));
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
  const changedAt = snap.cells.map((cell, index) => {
    if (!sameGame) return -Infinity;
    if (!stepped || cell.flipped === prev.snap.cells[index].flipped || listed(swapped, index)) return prev.changedAt[index];
    return now + (listed(step.cells, index) ? 0 : linkDelay);
  });
  const entry = {
    game: snap.game_id,
    plays: snap.plays,
    snap,
    sameGame,
    stepped,
    changedAt,
    stepAt: stepped ? now : sameGame ? prev.stepAt : -Infinity,
    step: stepped ? step : sameGame ? prev.step : null,
    before: stepped ? prev.snap : sameGame ? prev.before : null,
  };
  boardHistory.set(board, entry);
  return entry;
}

function flipAnimations(track) {
  const now = performance.now();
  const total = flipDuration();
  return track.snap.cells.map((cell, index) => {
    const elapsed = now - track.changedAt[index];
    return elapsed < total ? { on: cell.flipped, elapsed, total } : null;
  });
}

// where the last step happened on the board, for the win wave's origin and where a used-up card flies to: the middle of the tiles that
// changed (or of the swapped tiles), else the board's middle; in cell units [row, col]
function stepOrigin(track) {
  const { snap, before, step } = track;
  const changed = [];
  snap.cells.forEach((cell, index) => {
    if (before && cell.flipped !== before.cells[index].flipped) changed.push([Math.floor(index / snap.width), index % snap.width]);
  });
  const points = changed.length ? changed : step?.cells?.length ? step.cells : [[(snap.height - 1) / 2, (snap.width - 1) / 2]];
  return [points.reduce((sum, [row]) => sum + row, 0) / points.length, points.reduce((sum, [, col]) => sum + col, 0) / points.length];
}

// the one-shot animations a step gives the tile at index: swapped tiles slide across (the first pick over the other), a picked tile that
// didn't change presses and comes back (dud), a timer that changed ticks, and when the step won every tile hops in a wave from the origin
function stepExtras(track, index, origin) {
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
  if (step.effect === "swap" && step.cells.length === 2 && picked !== -1 && elapsed < cssMs("--swap-ms")) {
    // the tile now in the second pick's cell is the one picked first: it travels over the other
    const other = step.cells[1 - picked];
    classes.push("swap", picked === 1 ? "over" : "under");
    cellClasses.push(picked === 1 ? "swap-over" : "swap-under");
    style += `--dx:${other[1] - col};--dy:${other[0] - row};`;
  } else if (step.effect === "flip" && picked !== -1 && cell.flipped === old.flipped && elapsed < cssMs("--tap-ms")) {
    classes.push("dud");
  }
  if (old.counter !== cell.counter && elapsed < cssMs("--tick-start") + cssMs("--tick-ms")) tick = true;
  if (snap.won && !before.won) {
    const distance = Math.hypot(row - origin[0], col - origin[1]);
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
  clone.className = node.className.replace(/\b(selected|candidate|peeking|drag-source|drop-target|played|deal-in)\b/g, "") + " card-fly";
  Object.assign(clone.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  clone.removeAttribute("data-index");
  document.body.append(clone);
  return clone;
}

// a card leaving the hand: flies to [x, y] shrinking (into the board or a card), or just shrinks away where it is
function flyAway(node, rect, to) {
  if (reducedMotion()) return;
  const clone = cardClone(node, rect);
  const frames = to
    ? [{ transform: "none", opacity: 1 }, { transform: `translate(${to[0] - rect.left - rect.width / 2}px, ${to[1] - rect.top - rect.height / 2}px) scale(.3)`, opacity: 0 }]
    : [{ transform: "none", opacity: 1 }, { transform: "scale(.8)", opacity: 0 }];
  const duration = cssMs(to ? "--fly-ms" : "--return-ms");
  const anim = clone.animate(frames, { duration, easing: cssValue(to ? "--fly-ease" : "--card-ease"), fill: "forwards" });
  anim.onfinish = anim.oncancel = () => clone.remove();
  setTimeout(() => clone.remove(), duration + 100);
}

// which hand position each card had before a step: pairs [old index, new index] for cards in both hands, old indices that are gone,
// new indices that are fresh. forward, the card at step.card leaves if it was single use and a retarget appends a copy; undo reverses that
function handMapping(step, oldCount, newCount) {
  const identity = { pairs: Array.from({ length: Math.min(oldCount, newCount) }, (_, i) => [i, i]), gone: [], fresh: [] };
  if (!step) return identity;
  const after = Array.from({ length: step.reverse ? newCount : oldCount }, (_, i) => i);
  if (step.added) after.push("new");
  if (step.used_up) after.splice(step.card, 1);
  if (after.length !== (step.reverse ? oldCount : newCount)) return identity;
  const copies = after.flatMap((j, p) => (j === "new" ? [p] : []));
  const pairs = after.flatMap((j, p) => (j === "new" ? [] : [step.reverse ? [p, j] : [j, p]]));
  return step.reverse
    ? { pairs, gone: copies, fresh: step.used_up ? [step.card] : [] }
    : { pairs, gone: step.used_up ? [step.card] : [], fresh: copies };
}

// after a step rebuilt the hand: cards that moved slide to their new place, a played card stamps down, a used-up card flies into the board
// (an undone one comes back from it), a retarget's copy comes out of the card it copies and an undone copy shrinks away
function animateHand(hand, board, track, map, oldNodes, oldRects) {
  const nodes = [...hand.querySelectorAll(".card[data-index]")];
  const { step } = track;
  const ms = cssMs("--deal-ms");
  const easing = cssValue("--deal-ease");
  const origin = stepOrigin(track);
  const focus = findCell(board, [Math.round(origin[0]), Math.round(origin[1])]) ?? board;
  for (const [o, n] of map.pairs) {
    const node = nodes[n];
    if (!node || !oldRects[o]) continue;
    const dx = oldRects[o].left - node.getBoundingClientRect().left;
    if (Math.abs(dx) > 1 && !reducedMotion()) node.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: ms, easing });
    if (!step.reverse && o === step.card) node.classList.add("played");
  }
  for (const n of map.fresh) {
    const node = nodes[n];
    if (!node) continue;
    const source = !step.reverse && step.effect === "retarget" ? oldRects[step.target] : null;
    if (source && !reducedMotion()) {
      const rect = node.getBoundingClientRect();
      node.animate(
        [{ transform: `translate(${source.left - rect.left}px, ${source.top - rect.top}px) scale(.9)`, opacity: 0.3 }, { transform: "none", opacity: 1 }],
        { duration: ms, easing },
      );
    } else {
      node.style.setProperty("--from-y", step.reverse ? "-24px" : "24px");
      node.classList.add("deal-in");
    }
  }
  for (const o of map.gone) {
    if (!oldNodes[o]) continue;
    if (step.reverse) flyAway(oldNodes[o], oldRects[o], null);
    else if (!ghostPlays) flyAway(oldNodes[o], oldRects[o], step.effect === "retarget" ? centre(nodes[step.target < step.card ? step.target : step.target - 1] ?? hand) : centre(focus));
  }
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
  const fresh = newlyPicked(board, snap);
  const cellClasses = (row, col) => {
    const classes = [];
    const candidate = has(snap.candidate_tiles, row, col);
    if (has(snap.picked, row, col)) classes.push("picked", ...(fresh.includes(`${row},${col}`) ? ["lock-in"] : []));
    else if (candidate) classes.push(snap.targeting ? "targeting" : "candidate");
    return classes;
  };

  const rebuild = !track.sameGame || track.stepped || board.children.length !== snap.cells.length;
  if (rebuild) {
    board.replaceChildren();
    board.classList.toggle("intro", !track.sameGame);
    const anims = flipAnimations(track);
    const origin = stepOrigin(track);
    const centreRow = (snap.height - 1) / 2;
    const centreCol = (snap.width - 1) / 2;
    snap.cells.forEach((cell, index) => {
      const row = Math.floor(index / snap.width);
      const col = index % snap.width;
      const extra = track.stepped ? stepExtras(track, index, origin) : { classes: [], cellClasses: [], style: "", tick: false };
      if (!track.sameGame) extra.style += `--d:${Math.hypot(row - centreRow, col - centreCol).toFixed(2)};`;
      const node = renderCell(cell, { classes: [...cellClasses(row, col), ...extra.cellClasses], grain: index, anim: anims[index], tile: extra });
      node.dataset.row = row;
      node.dataset.col = col;
      board.append(node);
    });
  } else {
    [...board.children].forEach((node, index) => {
      node.className = ["cell", ...cellClasses(Math.floor(index / snap.width), index % snap.width)].join(" ");
    });
  }
  showPreview(board, snap.preview, snap.blocked, card);

  hand.classList.toggle("done", snap.won || snap.game_over);
  const classesOf = (index) => (snap.selected === index ? ["selected"] : snap.candidate_cards.includes(index) ? ["candidate"] : []);
  const badgeOf = (index) => (snap.selected === index && snap.needed > 1 ? `${snap.picked.length}/${snap.needed}` : null);
  const oldNodes = [...hand.querySelectorAll(".card[data-index]")];
  if (!track.sameGame || track.stepped || oldNodes.length !== snap.hand.length) {
    const oldRects = track.stepped ? oldNodes.map((node) => node.getBoundingClientRect()) : [];
    const map = track.stepped ? handMapping(track.step, oldNodes.length, snap.hand.length) : null;
    hand.replaceChildren();
    hand.classList.toggle("intro", !track.sameGame);
    snap.hand.forEach((card, index) => {
      const node = renderCard(card, snap, { classes: classesOf(index), badge: badgeOf(index), grain: index, style: `--i:${index};` });
      node.dataset.index = index;
      hand.append(node);
    });
    window.scrollTo(scroll[0], scroll[1]);
    hand.scrollLeft = scroll[2];
    if (map) animateHand(hand, board, track, map, oldNodes, oldRects);
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
// the ghost that follows the finger never just vanishes: it shrinks into the tile or card it was played on, or flies back to its place in the hand.
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
    press.ghost.classList.remove("selected", "candidate", "drop-target", "peeking");
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
        return { node: cardNode(targetIndex < index ? targetIndex : targetIndex - 1) ?? hand, into: true };
      }
      api.nothing();
      shake(cardNode(targetIndex));
      return back();
    }
    if (!over(board, e)) return (api.render(), back());
    select(index);
    if (card.kind !== "fixed") return back();
    const [target] = api.snap()?.candidate_tiles ?? [];
    if (!target) return back();
    playWithGhost(() => api.tile(...target));
    return { node: findCell(board, target) ?? board, into: true };
  }

  function playWithGhost(play) {
    ghostPlays = true;
    try {
      play();
    } finally {
      ghostPlays = false;
    }
  }

  // the ghost shrinks into the node it was played on, or flies back to it (its card in the hand) and fades as it lands
  function flyGhost(ghost, { node, into }) {
    if (!ghost) return;
    if (!node || reducedMotion()) return ghost.remove();
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

  function moveSwipe(e) {
    const cell = under(e, ".cell[data-row]");
    const to = cell ? cellCoord(cell) : null;
    const coords = to && !sameCoord(to, press.from) && isNeighbour(press.from, to) ? [press.from, to] : [press.from];
    showPreview(board, coords, [], null);
  }

  function endSwipe(e) {
    const cell = under(e, ".cell[data-row]");
    const to = cell ? cellCoord(cell) : null;
    if (!to || !isNeighbour(press.from, to)) return api.render();
    api.tile(...press.from);
    const snap = api.snap();
    if (snap?.candidate_tiles.some((coord) => sameCoord(coord, to))) api.tile(...to);
    else shake(findCell(board, to));
  }

  function finish(e, cancelled) {
    clearTimeout(press?.timer);
    if (press?.peeking && !press.dragging) {
      press = null;
      suppressClickUntil = performance.now() + 50;
      return api.render();
    }
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
  board.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest(".cell[data-row]");
    if (!e.isPrimary || !cell || !canSwipe(api.snap()) || !cell.classList.contains("targeting")) return;
    press = { kind: "swipe", from: cellCoord(cell), x: e.clientX, y: e.clientY, dragging: false };
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
