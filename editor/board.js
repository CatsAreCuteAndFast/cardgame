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

// which part of the grain (grain.js) tile or card number n shows, so neighbours don't share the same grain
function grainSpot(n) {
  const hash = Math.imul(n + 1, 2654435761) >>> 0;
  return `--gx:${hash % 100}%;--gy:${(hash >>> 8) % 100}%;`;
}

// the tile and board animations are started from here (Web Animations API) on tiles that live for the whole game, so a re-render never
// restarts or cuts one short. a node keeps its running animation per channel (the properties it moves); starting another on the same channel
// first commits the old one's current value and drops the new one's first keyframe, so an interrupted animation (a flip undone while it runs)
// carries on from where it is instead of jumping. the committed value is cleared when the animation ends, so the classes' values apply again.
// nothing runs when the user prefers reduced motion (a finished animation is returned, so callers can still wait on it)
const running = new WeakMap();

function animate(node, channel, keyframes, options) {
  let channels = running.get(node);
  if (!channels) running.set(node, (channels = new Map()));
  const old = channels.get(channel);
  const interrupted = old && old.playState !== "finished";
  if (old) {
    // a hidden node (a ring that isn't shown) has no current value to commit
    if (interrupted) try { old.commitStyles(); } catch {}
    old.cancel();
  }
  const frames = interrupted && keyframes.length > 1 ? keyframes.slice(1) : keyframes;
  const anim = node.animate(frames, { fill: "backwards", ...options, ...(reducedMotion() ? { duration: 0, delay: 0 } : {}) });
  channels.set(channel, anim);
  anim.finished.then(
    () => {
      if (channels.get(channel) !== anim) return;
      channels.delete(channel);
      for (const prop of channel.split(" ")) node.style.removeProperty(prop);
    },
    () => {},
  );
  return anim;
}

// waits for animations to end (an interrupted one counts as ended)
const settled = (anims) => Promise.all(anims.map((anim) => anim.finished.catch(() => {}))).then(() => {});

// a damped spring: the offset x0 from rest and speed v0 at time 0, omega the angular frequency (the square root of the stiffness) and
// zeta the damping ratio (under 1 bounces). returns the offset and speed at t seconds
function spring(x0, v0, omega, zeta) {
  const a = zeta * omega;
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const b = (v0 + a * x0) / wd;
    return (t) => {
      const decay = Math.exp(-a * t);
      const cos = Math.cos(wd * t);
      const sin = Math.sin(wd * t);
      return [decay * (x0 * cos + b * sin), decay * ((b * wd - a * x0) * cos - (x0 * wd + a * b) * sin)];
    };
  }
  const s = Math.sqrt(zeta * zeta - 1) * omega;
  if (s < 1e-6) {
    const b = v0 + omega * x0;
    return (t) => {
      const decay = Math.exp(-omega * t);
      return [decay * (x0 + b * t), decay * (b - omega * (x0 + b * t))];
    };
  }
  const r1 = -a + s;
  const r2 = -a - s;
  const c1 = (v0 - r2 * x0) / (r1 - r2);
  const c2 = x0 - c1;
  return (t) => [c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t), c1 * r1 * Math.exp(r1 * t) + c2 * r2 * Math.exp(r2 * t)];
}

const SPRING_STEP = 1 / 60;
const SPRING_MAX = 1.5;

// the face's travel on a flip, as a spring from where it is (x0 past the target) to its resting depth, pushed so that it first goes `extra`
// past the target in the travel's direction `dir`. returns the spring's evaluator and when it has settled and when it first
// reaches the target (the click), in seconds
function pressTravel(x0, dir, extra, omega, zeta, depth) {
  const overshoot = (push) => {
    const at = spring(x0, push, omega, zeta);
    let most = -Infinity;
    for (let t = 0; t <= SPRING_MAX; t += SPRING_STEP) most = Math.max(most, dir * at(t)[0]);
    return most;
  };
  // the push (a speed along dir, never against it) is found by bisection: the harder the push, the farther the first turn-around.
  // a soft spring's own bounce may already go farther than `extra`; then there is no push
  let low = 0;
  let high = overshoot(0) >= extra ? 0 : 60 * depth;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (overshoot(dir * mid) < extra) low = mid;
    else high = mid;
  }
  const at = spring(x0, dir * high, omega, zeta);
  let click = null;
  let settled = SPRING_MAX;
  for (let t = 0; t <= SPRING_MAX; t += SPRING_STEP) {
    const [x, v] = at(t);
    if (click === null && dir * x >= -0.05 * depth) click = t;
    if (Math.abs(x) < 0.015 * depth && Math.abs(v) * SPRING_STEP < 0.015 * depth) {
      settled = t;
      break;
    }
  }
  return { at, click: click ?? settled, settled };
}

// per face: the spring it is on, so a flip interrupting it carries on from the face's current position
const travels = new WeakMap();

// flips the look of a tile from lit level `from` to `to` (0, .5 for half or 1), after delay ms, like a button: the face travels on one spring
// (press depth --press, --flip-stiffness, --flip-damping) from where it is to its resting depth, pushed --flip-extra past it first on a flip
// and lifted --flip-extra-off past its rest on an unflip, and bounces back to settle. on a flip, the light disc grows from the centre when the
// face first reaches its resting depth (the click) while the base's orange edge fades in, and the glow fades in as the disc reaches the edges.
// on an unflip, the light shrinks and the glow fades as the face is let go. a step to or from half that isn't lit only grows or shrinks
// the light. returns when the flip ends
export function flipTile(tile, from, to, delay = 0) {
  const on = to > from;
  const off = on ? "" : "-off";
  const [face, light, glow, edge] = [".face", ".light", ".glow", ".edge"].map((selector) => tile.querySelector(selector));
  const lightMs = cssMs(`--light-ms${off}`);
  const lightEase = cssValue(`--light-ease${off}`);
  if (Math.max(from, to) < 1) {
    return settled([animate(light, "transform", [{ transform: `scale(${from})` }, { transform: `scale(${to})` }], { delay, duration: lightMs, easing: lightEase })]);
  }
  const depth = parseFloat(cssValue("--press")) || 0;
  const target = on ? depth : 0;
  const now = performance.now();
  // from rest, or from where a travel still running has got (a finished one says nothing: a swap may have moved another tile here)
  const prev = travels.get(face);
  const y = prev && now < prev.start + prev.settled * 1000 ? prev.target + prev.at(Math.max(0, (now - prev.start) / 1000))[0] : on ? 0 : depth;
  const x0 = y - target;
  const omega = Math.sqrt(parseFloat(cssValue("--flip-stiffness")) || 250);
  const zeta = parseFloat(cssValue("--flip-damping")) || 0.5;
  const extra = parseFloat(cssValue(`--flip-extra${off}`)) || 0;
  const travel = pressTravel(x0, on ? 1 : -1, extra, omega, zeta, depth);
  travels.set(face, { ...travel, start: now + delay, target });
  const frames = [];
  for (let t = 0; t < travel.settled; t += SPRING_STEP) frames.push({ transform: `translateY(${(target + travel.at(t)[0]).toFixed(3)}%)`, offset: t / travel.settled });
  frames.push({ transform: `translateY(${target}%)`, offset: 1 });
  const click = on ? delay + travel.click * 1000 : delay;
  const anims = [
    animate(face, "transform", frames, { delay, duration: travel.settled * 1000 }),
    animate(light, "transform", [{ transform: `scale(${from})` }, { transform: `scale(${to})` }], { delay: click, duration: lightMs, easing: lightEase }),
    animate(edge, "opacity", [{ opacity: on ? 0 : 1 }, { opacity: on ? 1 : 0 }], { delay: click, duration: lightMs }),
    animate(glow, "opacity", [{ opacity: on ? 0 : 1 }, { opacity: on ? 1 : 0 }], { delay: on ? click + 0.4 * lightMs : click, duration: cssMs(`--glow-ms${off}`) }),
  ];
  return settled(anims);
}

// a tapped tile presses in like a button and comes back (also a picked tile that a flip left unchanged)
function pressTile(tile) {
  const depth = cssValue("--tap-depth");
  animate(
    tile.querySelector(".face"),
    "translate",
    [{ translate: "0 0", easing: "cubic-bezier(.2, .6, .4, 1)" }, { translate: `0 ${depth}`, easing: "ease-in-out", offset: 0.4 }, { translate: "0 0" }],
    { duration: cssMs("--tap-ms") },
  );
}

// a newly picked tile: the lock ring pops in while the dashes fade out (lock-in keeps the dashes shown for the crossfade)
function lockIn(cell) {
  cell.classList.add("lock-in");
  const pop = [{ transform: `scale(${cssValue("--pop-scale")})`, opacity: 0 }, { transform: "none", opacity: 1 }];
  animate(cell.querySelector(".ring.lock"), "transform opacity", pop, { duration: cssMs("--pop-ms"), easing: cssValue("--pop-ease") });
  const fade = animate(cell.querySelector(".ring.valid"), "opacity", [{ opacity: 1 }, { opacity: 0 }], { duration: cssMs("--lock-ms"), easing: cssValue("--lock-ease") });
  settled([fade]).then(() => cell.classList.remove("lock-in"));
}

// after a play, the tiles it used keep the lock ring for --lock-hold (it pops in unless it was already showing) and then it fades
function holdLock(cell, popIn) {
  cell.classList.add("locked");
  const hold = cssMs("--lock-hold");
  const total = hold + cssMs("--lock-ms");
  const popEnd = Math.min(cssMs("--pop-ms"), hold) / total;
  const frames = popIn
    ? [{ transform: `scale(${cssValue("--pop-scale")})`, opacity: 0, easing: cssValue("--pop-ease") }, { transform: "none", opacity: 1, offset: popEnd }]
    : [{ transform: "none", opacity: 1 }];
  frames.push({ transform: "none", opacity: 1, offset: hold / total, easing: "ease-out" }, { transform: "none", opacity: 0 });
  const anim = animate(cell.querySelector(".ring.lock"), "transform opacity", frames, { duration: total, fill: "both" });
  settled([anim]).then(() => {
    cell.classList.remove("locked");
    anim.cancel();
  });
}

// swapped tiles slide into each other's cell: the tile now in this cell comes in from dx, dy cells away; the first pick (over) lifts over
// the other, which sinks a little. the slide starts a cell pitch away: the tile's own width is .86 of the cell (see .cell), plus the board's gap
function swapTile(cell, dx, dy, over, gap) {
  const tile = cell.querySelector(".tile");
  const zClass = over ? "swap-over" : "swap-under";
  cell.classList.add(zClass);
  const shift = (d) => `calc(${d} * (100% / .86 + ${gap}))`;
  const ms = cssMs("--swap-ms");
  const move = animate(tile, "transform", [{ transform: `translate(${shift(dx)}, ${shift(dy)})` }, { transform: "none" }], { duration: ms, easing: cssValue("--swap-ease") });
  animate(tile, "scale", [{ scale: 1 }, { scale: cssValue(over ? "--swap-lift" : "--swap-sink"), offset: 0.5 }, { scale: 1 }], { duration: ms, easing: "ease-in-out" });
  settled([move]).then(() => cell.classList.remove(zClass));
}

// a timer that changed pops its number in (bigger when it reaches 0 and the tile is ready); a neighbour timer also rings for a moment
function tickCounter(cell, ready) {
  const counter = cell.querySelector(".counter");
  if (!counter) return;
  const delay = cssMs("--tick-start");
  animate(counter, "scale opacity", [{ scale: ready ? 1.6 : 1.3, opacity: 0.3 }, { scale: 1, opacity: 1 }], { duration: cssMs("--tick-ms"), delay, easing: cssValue("--tick-ease") });
  const mark = counter.querySelector(".mark");
  if (mark) {
    animate(
      mark,
      "scale opacity",
      [{ scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, offset: 0.15 }, { scale: 1, opacity: 1, offset: 0.6 }, { scale: 1, opacity: 0 }],
      { duration: cssMs("--mark-ms"), delay, easing: "ease-out" },
    );
  }
}

// winning: as the wash passes a tile (later the farther it is from the middle) it swells a little and a white sheen passes over its face
function winTile(tile, distance) {
  const options = { duration: cssMs("--win-ms"), delay: cssMs("--win-start") + distance * cssMs("--win-stagger"), easing: "ease-in-out" };
  animate(tile, "scale", [{ scale: 1 }, { scale: cssValue("--win-swell"), offset: 0.4 }, { scale: 1 }], options);
  animate(tile.querySelector(".flash"), "opacity", [{ opacity: 0 }, { opacity: cssValue("--win-flash"), offset: 0.35 }, { opacity: 0 }], options);
}

// makes a tile's look match the cell: its type, lit state, link and timer. the tile's node stays, so its animations keep running
function syncTile(tile, cell) {
  const tileType = catalog.tiles.find((entry) => entry.id === cell.type);
  tile.title = cell.type;
  tile.classList.toggle("flipped", Boolean(cell.flipped));
  tile.classList.toggle("half", Boolean(cell.half));
  tile.classList.toggle("nf", Boolean(tileType && !tileType.can_flip));
  tile.classList.toggle("ns", Boolean(tileType && !tileType.can_swap));
  tile.classList.toggle("three", tileType?.states === 3);
  const face = tile.querySelector(".face");
  const pips = face.querySelector(".pips");
  if (tileType?.states === 3 && !pips) face.append(el("span", { class: "pips" }, [el("i"), el("i")]));
  else if (tileType?.states !== 3) pips?.remove();
  const counter = face.querySelector(".counter");
  if (counter) counter.firstChild.textContent = cell.counter;
  const linkIndex = typeof cell.link === "string" ? Number(cell.link) : cell.link;
  let link = face.querySelector(".link");
  if (linkIndex === null || linkIndex === undefined || linkIndex === -1) link?.remove();
  else {
    if (!link) face.append((link = el("span", { class: "link" })));
    link.textContent = `L${linkIndex}`;
    link.style.background = LINK_COLORS[linkIndex % LINK_COLORS.length];
  }
}

// a cell with its tile and outlines. the substrate (colour and timer) is the cell's and never changes in a game; the tile's look comes from syncTile.
// tile: { style } goes on the .tile itself (the intro's distance from the middle)
export function renderCell(cell, { classes = [], order = null, onclick, grain = 0, tile: extra = {} }) {
  const substrate = catalog.substrates.find((entry) => entry.id === cell.substrate);
  const tile = el("div", { class: "tile", style: grainSpot(grain) + (extra.style ?? "") }, [
    el("div", { class: "base" }, [el("div", { class: "edge" })]),
    el("div", { class: "face" }, [
      el("div", { class: "light" }),
      el("div", { class: "grain" }),
      el("div", { class: "shade" }),
      el("div", { class: "glow" }),
      el("div", { class: "flash" }),
      cell.period > 0
        ? el("span", { class: "counter" + (substrate?.ticks === "neighbour" ? " near" : "") }, [document.createTextNode(""), substrate?.ticks === "neighbour" ? el("i", { class: "mark" }) : null])
        : null,
      order !== null ? el("span", { class: "order", textContent: order }) : null,
    ]),
  ]);
  syncTile(tile, cell);
  // the outlines mark the cell, not the tile, so they stay put when a swap slides the tiles across
  return el(
    "div",
    {
      class: ["cell", ...classes].join(" "),
      style: cell.period > 0 ? `background:${SUBSTRATE_COLORS[cell.substrate] ?? "#555"}` : "",
      onclick,
    },
    [tile, ring("valid"), ring("lock")],
  );
}

// a tile outline (art/outlines): a rounded rect 8/110 of the tile outside it, dashes measured on a 420-long path.
// drawn as a path, not a rect: Safari ignores pathLength on a rect, which left the dashes breaking at the top-left where the path starts
function ring(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", `ring ${kind}`);
  svg.setAttribute("viewBox", "0 0 126 126");
  svg.innerHTML = '<path d="M22.5 1.5H103.5A21 21 0 0 1 124.5 22.5V103.5A21 21 0 0 1 103.5 124.5H22.5A21 21 0 0 1 1.5 103.5V22.5A21 21 0 0 1 22.5 1.5Z" pathLength="420"/>';
  return svg;
}

// the board is updated in place, so the marching dashes keep running; starting a newly shown outline's at time 0 keeps every outline in step
function syncAnts(board) {
  for (const anim of board.getAnimations({ subtree: true })) if (anim.animationName === "ants") anim.startTime = 0;
}

// per board: the game and position last shown, so a render can tell a one-play step (a play, undo or redo: the plays left differ by 1
// in the same game) from a new game or a selection change. a step animates what changed between the two snapshots
const boardHistory = new WeakMap();

function trackBoard(board, snap) {
  const prev = boardHistory.get(board);
  const sameGame = Boolean(prev && prev.game === snap.game_id);
  const stepped = sameGame && Math.abs(prev.plays - snap.plays) === 1;
  boardHistory.set(board, { game: snap.game_id, plays: snap.plays, snap });
  return { sameGame, stepped, step: stepped ? snap.step : null, before: stepped ? prev.snap : null };
}

// how lit a tile is: 0 off, .5 half (three-state tiles), 1 lit
const lit = (cell) => (cell.flipped ? 1 : cell.half ? 0.5 : 0);

// the step's animations: swapped tiles slide across (the first pick over the other), changed tiles flip (those flipped through a link
// start --link-delay after the picked ones), a picked tile that didn't change presses as a dud, timers that changed tick, the tiles a play
// used show the lock ring for a moment, and when the step won a wash runs out from the board's middle over the tiles.
// wasPicked says per cell whether its lock ring was already showing, so it doesn't pop in again
function animateStep(board, cells, { step, before }, snap, wasPicked) {
  if (!step || !before) return;
  const centreRow = (snap.height - 1) / 2;
  const centreCol = (snap.width - 1) / 2;
  const gap = getComputedStyle(board).getPropertyValue("--gap").trim() || "0px";
  const linkDelay = cssMs("--link-delay");
  snap.cells.forEach((cell, index) => {
    const node = cells[index];
    const tile = node.querySelector(".tile");
    const old = before.cells[index];
    const row = Math.floor(index / snap.width);
    const col = index % snap.width;
    const picked = step.cells.findIndex((coord) => sameCoord(coord, [row, col]));
    if (step.effect === "swap" && step.cells.length === 2 && picked !== -1) {
      // the tile now in the second pick's cell is the one picked first: it travels over the other
      const other = step.cells[1 - picked];
      swapTile(node, other[1] - col, other[0] - row, picked === 1, gap);
    } else if (lit(cell) !== lit(old)) flipTile(tile, lit(old), lit(cell), picked === -1 ? linkDelay : 0);
    else if (step.effect === "flip" && picked !== -1) pressTile(tile);
    if (old.counter !== cell.counter) tickCounter(node, cell.counter === 0);
    if (picked !== -1 && !step.reverse) holdLock(node, !wasPicked[index]);
    if (snap.won && !before.won) winTile(tile, Math.hypot(row - centreRow, col - centreCol));
  });
  if (snap.won && !before.won) board.append(wash(snap, centreRow, centreCol));
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

// sets a line's text and class; a win pops in
export function setText(node, text, className = "") {
  if (node.dataset.text === text && node.dataset.cls === className) return;
  node.dataset.text = text;
  node.dataset.cls = className;
  node.textContent = text;
  node.className = className;
  if (className !== "won") return;
  void node.offsetWidth;
  node.classList.add("pop");
}

function selectedCard(snap) {
  return snap.selected === null ? null : snap.hand[snap.selected];
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
  clone.className = node.className.replace(/\b(selected|candidate|peeking|drag-source|drop-target)\b/g, "") + " card-fly";
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

// after a play rebuilt the hand: a used-up card burns in its slot
function animateHand(step, oldNodes, oldRects) {
  if (!step.reverse && step.used_up && oldNodes[step.card] && !ghostPlays && !reducedMotion()) burn(cardClone(oldNodes[step.card], oldRects[step.card]));
}

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
  const centreRow = (snap.height - 1) / 2;
  const centreCol = (snap.width - 1) / 2;

  // the cells are built once per game (settling in from the middle outwards) and updated in place after that
  let cells = [...board.querySelectorAll(".cell")];
  const fresh = !track.sameGame || cells.length !== snap.cells.length;
  if (fresh) {
    board.replaceChildren();
    board.classList.toggle("intro", !track.sameGame);
    if (!track.sameGame) {
      // the intro's class comes off when the last tile has settled, so the finished animations don't stay on the tiles
      const intros = () => board.getAnimations({ subtree: true }).filter((anim) => anim.animationName === "intro");
      requestAnimationFrame(() => settled(intros()).then(() => board.classList.remove("intro")));
    }
    cells = snap.cells.map((cell, index) => {
      const row = Math.floor(index / snap.width);
      const col = index % snap.width;
      const node = renderCell(cell, { grain: index, tile: { style: `--d:${Math.hypot(row - centreRow, col - centreCol).toFixed(2)};` } });
      node.dataset.row = row;
      node.dataset.col = col;
      board.append(node);
      return node;
    });
  } else snap.cells.forEach((cell, index) => syncTile(cells[index].querySelector(".tile"), cell));
  // what the card can pick: a newly picked tile locks in and presses
  const wasPicked = cells.map((node) => node.classList.contains("picked") || node.classList.contains("locked"));
  cells.forEach((node, index) => {
    const row = Math.floor(index / snap.width);
    const col = index % snap.width;
    const picked = has(snap.picked, row, col);
    const candidate = !picked && has(snap.candidate_tiles, row, col);
    node.classList.toggle("picked", picked);
    node.classList.toggle("targeting", candidate && snap.targeting);
    node.classList.toggle("candidate", candidate && !snap.targeting);
    if (picked && !wasPicked[index] && !fresh) {
      lockIn(node);
      pressTile(node.querySelector(".tile"));
    }
  });
  if (track.stepped) animateStep(board, cells, track, snap, wasPicked);
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
    if (track.stepped && track.step) animateHand(track.step, oldNodes, oldRects);
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
    for (const cell of board.querySelectorAll(".cell")) cell.classList.remove("candidate", "targeting");
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
    press.hover?.classList.remove("picked", "lock-in");
    press.hover = cell;
    if (!cell) return;
    cell.classList.add("picked");
    lockIn(cell);
    pressTile(cell.querySelector(".tile"));
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
