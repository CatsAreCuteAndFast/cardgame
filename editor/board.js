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

const FLIP_MS = 700;

// anim: { on, elapsed } plays the press-and-light (or reverse) animation, already elapsed ms in
export function renderCell(cell, { classes = [], order = null, onclick, anim = null }) {
  const tileType = catalog.tiles.find((tile) => tile.id === cell.type);
  const tileClasses = ["tile"];
  if (cell.flipped) tileClasses.push("flipped");
  if (tileType && !tileType.can_flip) tileClasses.push("nf");
  if (tileType && !tileType.can_swap) tileClasses.push("ns");
  if (anim) tileClasses.push(anim.on ? "anim-on" : "anim-off");
  const linkIndex = typeof cell.link === "string" ? Number(cell.link) : cell.link;
  return el(
    "div",
    {
      class: ["cell", ...classes].join(" "),
      style: cell.period > 0 ? `background:${SUBSTRATE_COLORS[cell.period] ?? "#555"}` : "",
      onclick,
    },
    el("div", { class: tileClasses.join(" "), title: cell.type, style: anim ? `--anim-delay:${-Math.round(anim.elapsed)}ms` : "" }, [
      el("div", { class: "base" }),
      el("div", { class: "face" }, [
        el("div", { class: "light" }, el("div", { class: "light-inner" })),
        cell.period > 0 ? el("span", { class: "counter", textContent: cell.counter }) : null,
        linkIndex !== null && linkIndex !== -1
          ? el("span", { class: "link", textContent: `L${linkIndex}`, style: `background:${LINK_COLORS[linkIndex % LINK_COLORS.length]}` })
          : null,
        order !== null ? el("span", { class: "order", textContent: order }) : null,
      ]),
    ]),
  );
}

// per board: last flipped state and when each tile last changed, so a flip animates across re-renders.
// only a one-play step (a play, undo or redo) in the same game animates; a new game (loading, reset, another level) just shows the result
const flipHistory = new WeakMap();

function flipAnimations(board, snap) {
  const now = performance.now();
  const prev = flipHistory.get(board);
  const step = prev && prev.game === snap.game_id;
  const animate = step && Math.abs(prev.plays - snap.plays) === 1;
  const changedAt = snap.cells.map((cell, i) => {
    if (!step) return -Infinity;
    if (cell.flipped === prev.flipped[i]) return prev.changedAt[i];
    return animate ? now : -Infinity;
  });
  flipHistory.set(board, { game: snap.game_id, plays: snap.plays, flipped: snap.cells.map((cell) => cell.flipped), changedAt });
  return snap.cells.map((cell, i) => (now - changedAt[i] < FLIP_MS ? { on: cell.flipped, elapsed: now - changedAt[i] } : null));
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

function renderCard(card, snap, { classes = [], badge = null, onclick } = {}) {
  const face = cardFace(card.effect, card.kind);
  const target = card.target ?? { kind: card.kind };
  const all = ["card", `effect-${card.effect}`, ...classes];
  if (card.single_use) all.push("single");
  if (card.copy) all.push("copy");
  return el(
    "button",
    { class: all.join(" "), style: `--effect:${face.color}`, title: card.label, onclick },
    [
      el("div", { class: "card-head" }, [el("span", { class: "card-icon", textContent: face.icon }), face.name]),
      el("div", { class: "card-art" }, cardArt(target, snap.width, snap.height)),
      card.copy ? el("span", { class: "copy-tag", textContent: "copy" }) : null,
      badge ? el("span", { class: "badge", textContent: badge }) : null,
    ],
  );
}

export function playStatus(snap, budget) {
  const used = budget - snap.plays;
  if (snap.won) return { text: `Solved in ${used} play${used === 1 ? "" : "s"}!`, className: "won" };
  if (snap.game_over) return { text: "Out of plays", className: "over" };
  return { text: `Plays left: ${snap.plays}`, className: "" };
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

function showPreview(board, preview, blocked, effect) {
  for (const cell of board.querySelectorAll(".cell")) cell.classList.remove("preview", "preview-outline", "blocked");
  const previewClass = effect === "flip" ? "preview" : "preview-outline";
  for (const coord of preview) findCell(board, coord)?.classList.add(previewClass);
  for (const coord of blocked) findCell(board, coord)?.classList.add("blocked");
}

export function renderSnapshot(snap, board, hand, { onTile, onCard }) {
  const scroll = [window.scrollX, window.scrollY, hand.scrollLeft];
  board.replaceChildren();
  hand.replaceChildren();
  const has = (list, row, col) => list.some((coord) => sameCoord(coord, [row, col]));
  const card = selectedCard(snap);
  const pickingTiles = snap.targeting && card?.kind !== "card";
  setBoardShape(board, snap.width, snap.height);
  board.classList.toggle("swipe", canSwipe(snap));
  const anims = flipAnimations(board, snap);
  snap.cells.forEach((cell, index) => {
    const row = Math.floor(index / snap.width);
    const col = index % snap.width;
    const classes = [];
    const candidate = has(snap.candidate_tiles, row, col);
    if (has(snap.picked, row, col)) classes.push("picked");
    else if (candidate) classes.push(snap.targeting ? "targeting" : "candidate");
    const node = renderCell(cell, {
      classes,
      anim: anims[index],
      onclick: (e) => {
        e.stopPropagation();
        if (pickingTiles && !candidate) shake(e.currentTarget);
        else onTile(row, col);
      },
    });
    node.dataset.row = row;
    node.dataset.col = col;
    board.append(node);
  });
  showPreview(board, snap.preview, snap.blocked, card?.effect);

  snap.hand.forEach((card, index) => {
    const classes = [];
    if (snap.selected === index) classes.push("selected");
    else if (snap.candidate_cards.includes(index)) classes.push("candidate");
    const badge = snap.selected === index && snap.needed > 1 ? `${snap.picked.length}/${snap.needed}` : null;
    const node = renderCard(card, snap, { classes, badge, onclick: (e) => (e.stopPropagation(), onCard(index)) });
    node.dataset.index = index;
    hand.append(node);
  });
  window.scrollTo(scroll[0], scroll[1]);
  hand.scrollLeft = scroll[2];
}

// a drag only acts on drop: a fixed card dropped on the board plays, other tile cards get selected,
// and retarget is dropped on the card to change; swiping picks neighbouring tiles.
// while a tile card is dragged, its options and changes fade in as it nears the board's centre (--drag 0..1).
// holding a card still shows the same at full strength until it is let go
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
      for (const i of peek.candidate_cards) hand.querySelector(`.card[data-index="${i}"]`)?.classList.add("candidate");
      return false;
    }
    for (const coord of peek.candidate_tiles) findCell(board, coord)?.classList.add("targeting");
    showPreview(board, peek.preview, peek.blocked, card.effect);
    return true;
  }

  function startCardDrag() {
    const source = hand.querySelector(`.card[data-index="${press.index}"]`);
    if (!source) return (press = null);
    press.ghost = source.cloneNode(true);
    press.ghost.classList.remove("selected", "candidate", "drop-target", "peeking");
    press.ghost.classList.add("drag-ghost");
    document.body.append(press.ghost);
    source.classList.remove("peeking");
    if (!showPeek(press.index)) return;
    board.classList.add("dragging");
    board.style.setProperty("--drag", 0);
  }

  function startLongPress() {
    if (!press || press.dragging) return;
    press.peeking = true;
    hand.querySelector(`.card[data-index="${press.index}"]`)?.classList.add("peeking");
    showPeek(press.index);
  }

  function dragStrength(e) {
    const rect = board.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const full = Math.min(rect.width, rect.height) * 0.15;
    const start = Math.hypot(press.x - cx, press.y - cy);
    const now = Math.hypot(e.clientX - cx, e.clientY - cy);
    return Math.min(1, Math.max(0, (start - now) / Math.max(1, start - full)));
  }

  function moveCardDrag(e) {
    press.ghost.style.left = `${e.clientX}px`;
    press.ghost.style.top = `${e.clientY}px`;
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

  function endCardDrag(e) {
    const snap = api.snap();
    const card = snap.hand[press.index];
    if (card.kind === "card") {
      const target = under(e, ".card[data-index]");
      const index = target ? Number(target.dataset.index) : null;
      if (index === null || index === press.index) return api.render();
      select(press.index);
      if (api.snap()?.candidate_cards.includes(index)) return api.card(index);
      api.nothing();
      return shake(hand.querySelector(`.card[data-index="${index}"]`));
    }
    if (!over(board, e)) return api.render();
    select(press.index);
    if (card.kind !== "fixed") return;
    const [target] = api.snap()?.candidate_tiles ?? [];
    if (target) api.tile(...target);
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
    press.ghost?.remove();
    clearDropTargets();
    board.classList.remove("dragging");
    board.style.removeProperty("--drag");
    suppressClickUntil = performance.now() + 50;
    try {
      if (cancelled) api.render();
      else if (press.kind === "card") endCardDrag(e);
      else endSwipe(e);
    } finally {
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
      if (press.kind === "card") startCardDrag();
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
