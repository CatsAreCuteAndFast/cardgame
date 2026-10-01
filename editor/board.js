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
  if (snap.targeting) return { text: `Plays left: ${snap.plays} · pick targets`, className: "" };
  if (snap.selected !== null) return { text: `Plays left: ${snap.plays} · tap the card again to play it`, className: "" };
  return { text: `Plays left: ${snap.plays}`, className: "" };
}

function renderSnapshot(snap, board, hand, { onTile, onCard }) {
  const has = (list, row, col) => list.some((coord) => sameCoord(coord, [row, col]));
  setBoardShape(board, snap.width, snap.height);
  snap.cells.forEach((cell, index) => {
    const row = Math.floor(index / snap.width);
    const col = index % snap.width;
    const classes = [];
    if (has(snap.picked, row, col)) classes.push("picked");
    else if (has(snap.candidate_tiles, row, col)) classes.push(snap.targeting ? "targeting" : "candidate");
    board.append(renderCell(cell, { classes, onclick: (e) => (e.stopPropagation(), onTile(row, col)) }));
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
        onclick: (e) => (e.stopPropagation(), onCard(index)),
      }),
    );
  });
}
