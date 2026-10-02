"use strict";

// shared by the editor (editor.js) and the tester page (play/play.js)

const SUBSTRATE_COLORS = { 1: "#466e50", 2: "#786432", 3: "#5a4a7a", 4: "#7a4a5a" };
const LINK_COLORS = ["#c0392b", "#2e86c1", "#8e44ad", "#d68910", "#16a085", "#7f8c8d"];

// replaced by the real registries once Pyodide has loaded game/rules
let catalog = {
  tiles: [{ id: "basic", can_flip: true, can_swap: true }],
  substrates: [{ id: "plain", period: 0 }],
  effects: [{ id: "flip", kinds: ["fixed", "from", "any", "adjacent"] }],
};

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

function sameCoord(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function setBoardShape(board, width, height) {
  board.style.gridTemplateColumns = `repeat(${width}, 1fr)`;
  board.style.setProperty("--cols", width);
  board.style.setProperty("--rows", height);
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

function playStatus(snap, budget) {
  const used = budget - snap.plays;
  if (snap.won) return { text: `Solved in ${used} play${used === 1 ? "" : "s"}!`, className: "won" };
  if (snap.game_over) return { text: "Out of plays", className: "over" };
  return { text: `Plays left: ${snap.plays}`, className: "" };
}

function selectedCard(snap) {
  return snap.selected === null ? null : snap.hand[snap.selected];
}

function playPrompt(snap) {
  if (snap.won || snap.game_over) return "";
  const card = selectedCard(snap);
  if (!card) return "Tap a card, or drag it onto the board";
  const progress = snap.needed > 1 ? ` (${snap.picked.length}/${snap.needed})` : "";
  switch (card.kind) {
    case "fixed":
      return "Tap the card again, or drag it onto the board, to play it";
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

function renderSnapshot(snap, board, hand, { onTile, onCard }) {
  const has = (list, row, col) => list.some((coord) => sameCoord(coord, [row, col]));
  const card = selectedCard(snap);
  const pickingTiles = snap.targeting && card?.kind !== "card";
  setBoardShape(board, snap.width, snap.height);
  board.classList.toggle("swipe", canSwipe(snap));
  snap.cells.forEach((cell, index) => {
    const row = Math.floor(index / snap.width);
    const col = index % snap.width;
    const classes = [];
    const candidate = has(snap.candidate_tiles, row, col);
    if (has(snap.picked, row, col)) classes.push("picked");
    else if (candidate) classes.push(snap.targeting ? "targeting" : "candidate");
    const node = renderCell(cell, {
      classes,
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
    const classes = ["card"];
    if (card.single_use) classes.push("single");
    if (snap.selected === index) classes.push("selected");
    else if (snap.candidate_cards.includes(index)) classes.push("candidate");
    const badge = snap.selected === index && snap.needed > 1 ? `${snap.picked.length}/${snap.needed}` : null;
    hand.append(
      el(
        "button",
        {
          class: classes.join(" "),
          dataset: { index },
          textContent: card.label + (card.single_use ? "\n(single use)" : ""),
          onclick: (e) => (e.stopPropagation(), onCard(index)),
        },
        badge ? el("span", { class: "badge", textContent: badge }) : null,
      ),
    );
  });
}

// drag a card onto the board (or onto a card, for retarget) and swipe between tiles;
// every gesture ends as the same bridge calls that taps make
// api: { snap(), card(i), tile(row, col), nothing(), hover(i, row, col), render() }
function attachPlayInput(board, hand, api) {
  const DRAG_START = 10;
  let press = null;
  let suppressClickUntil = 0;

  const under = (e, selector) => document.elementFromPoint(e.clientX, e.clientY)?.closest(selector) ?? null;
  const overBoard = (e) => {
    const rect = board.getBoundingClientRect();
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

  function startCardDrag() {
    press.selectedByDrag = select(press.index);
    const card = api.snap()?.hand[press.index];
    if (!card) return (press = null);
    press.ghost = el("div", { class: "card drag-ghost" + (card.single_use ? " single" : ""), textContent: card.label });
    document.body.append(press.ghost);
  }

  function moveCardDrag(e) {
    press.ghost.style.left = `${e.clientX}px`;
    press.ghost.style.top = `${e.clientY}px`;
    const snap = api.snap();
    const card = snap.hand[press.index];
    clearDropTargets();
    if (card.kind === "card") {
      const target = under(e, ".card[data-index]");
      if (target && snap.candidate_cards.includes(Number(target.dataset.index))) target.classList.add("drop-target");
      return;
    }
    const cell = under(e, ".cell[data-row]");
    const key = cell ? cell.dataset.row + "," + cell.dataset.col : null;
    if (card.kind === "fixed" && overBoard(e)) board.classList.add("drop-target");
    if (cell && card.kind !== "fixed" && cell.classList.contains("targeting")) cell.classList.add("drop-target");
    if (key === press.hoverKey) return;
    press.hoverKey = key;
    if (!cell) return showPreview(board, snap.preview, snap.blocked, card.effect);
    const [row, col] = cellCoord(cell);
    const hover = api.hover(press.index, row, col);
    if (hover) showPreview(board, hover.preview, hover.blocked, card.effect);
  }

  function cancelCardDrag() {
    if (press.selectedByDrag) api.nothing();
    else api.render();
  }

  function endCardDrag(e) {
    const snap = api.snap();
    const card = snap.hand[press.index];
    if (card.kind === "card") {
      const target = under(e, ".card[data-index]");
      const index = target ? Number(target.dataset.index) : null;
      if (index === null || index === press.index) return cancelCardDrag();
      if (snap.candidate_cards.includes(index)) return api.card(index);
      api.render();
      return shake(hand.querySelector(`.card[data-index="${index}"]`));
    }
    if (!overBoard(e)) return cancelCardDrag();
    if (card.kind === "fixed") return api.card(press.index);
    const cell = under(e, ".cell[data-row]");
    if (!cell) return api.render();
    const [row, col] = cellCoord(cell);
    if (snap.candidate_tiles.some((coord) => sameCoord(coord, [row, col]))) return api.tile(row, col);
    api.render();
    shake(findCell(board, [row, col]));
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
    if (!press?.dragging) return (press = null);
    press.ghost?.remove();
    clearDropTargets();
    suppressClickUntil = performance.now() + 50;
    try {
      if (cancelled) press.kind === "card" ? cancelCardDrag() : api.render();
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
  });
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
