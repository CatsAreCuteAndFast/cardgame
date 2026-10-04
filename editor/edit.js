// The Edit tab: board size and budget, painting the board, and the card list.

import { $, el, catalog, sameCoord, setBoardShape, renderCell, SUBSTRATE_COLORS, LINK_COLORS } from "./board.js";
import * as bridge from "./bridge.js";
import { current, grid, size, formatLevel } from "./store.js";
import { copyText } from "./dialogs.js";
import { ui, render, changed } from "./editor.js";

const MIN_SIZE = 1;
const MAX_SIZE = 8;
const MAX_BUDGET = 9999;
const KIND_LABELS = { fixed: "fixed tiles", from: "choose 1 from", any: "any N", adjacent: "N adjacent", card: "a card" };

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
  if (data.links.length !== before && ui.brush.links >= data.links.length) ui.brush.links = data.links.length;
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
  const { mode, brush } = ui;
  if (ui.pickCard !== null) {
    toggleCoord(data.cards[ui.pickCard], row, col);
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

export function renderEdit() {
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
    button.classList.toggle("active", ui.pickCard === null && button.dataset.mode === ui.mode);
  }
  renderPalette(data);

  const banner = $("pick-banner");
  banner.hidden = ui.pickCard === null;
  if (ui.pickCard !== null) {
    banner.replaceChildren(
      el("span", { textContent: `Tap tiles to pick coords for card ${ui.pickCard + 1}` }),
      el("button", { class: "small primary", textContent: "Done", onclick: () => ((ui.pickCard = null), render()) }),
    );
  }

  const board = $("edit-board");
  setBoardShape(board, width, height);
  const picked = ui.pickCard !== null ? data.cards[ui.pickCard].target.coords : [];
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
            grain: row * width + col,
            onclick: () => editTap(row, col),
          },
        ),
      );
    }
  }

  const error = bridge.validate(data);
  const validation = $("validation");
  validation.className = "validation " + (error ? "bad" : "good");
  validation.textContent = error ?? "Valid level";
  renderSolution(level, error);

  renderCards(data, width, height);
}

// solutions are stored on the level record (not in its data) and checked against the level as it is now
function renderSolution(level, error) {
  const box = $("solution");
  box.hidden = !!error;
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

function renderPalette(data) {
  const palette = $("palette");
  const { brush } = ui;
  palette.replaceChildren();
  if (ui.mode === "tiles") {
    for (const tile of catalog.tiles) {
      palette.append(
        el("button", { class: "chip" + (brush.tiles === tile.id ? " active" : ""), onclick: () => ((brush.tiles = tile.id), render()) }, [
          el("span", { class: "swatch", style: `background:${tile.can_flip ? "var(--tile)" : "#3b3447"}${tile.can_swap ? "" : ";background-image:repeating-linear-gradient(45deg,#fff3 0 3px,#0000 3px 6px)"}` }),
          tile.id,
        ]),
      );
    }
  } else if (ui.mode === "substrates") {
    for (const substrate of catalog.substrates) {
      palette.append(
        el(
          "button",
          { class: "chip" + (brush.substrates === substrate.id ? " active" : ""), onclick: () => ((brush.substrates = substrate.id), render()) },
          [el("span", { class: "swatch", style: `background:${SUBSTRATE_COLORS[substrate.period] ?? "var(--panel)"}` }), `${substrate.id} (${substrate.period})`],
        ),
      );
    }
  } else if (ui.mode === "counters") {
    palette.append(el("span", { class: "hint", textContent: "Tap a timed substrate to change how many turns it starts with (0 = ready)" }));
  } else if (ui.mode === "flipped") {
    palette.append(el("span", { class: "hint", textContent: `Tap tiles to set which start flipped (${data.flipped.length} flipped)` }));
  } else if (ui.mode === "links") {
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
          if (ui.pickCard === index && !card.target.coords) ui.pickCard = null;
          changed();
        },
      },
      kindOptions.map((kind) => el("option", { value: kind, textContent: KIND_LABELS[kind] ?? kind, selected: kind === card.target.kind })),
    );

    const details = [];
    if (card.target.coords) {
      const picking = ui.pickCard === index;
      details.push(
        el("span", { class: "coords", textContent: card.target.coords.length ? card.target.coords.map(([r, c]) => `(${r},${c})`).join(" ") : "no tiles picked" }),
        el("button", {
          class: "small" + (picking ? " primary" : ""),
          textContent: picking ? "Done" : "Pick tiles",
          onclick: () => {
            ui.pickCard = picking ? null : index;
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
      if (ui.pickCard === index) ui.pickCard = target;
      else if (ui.pickCard === target) ui.pickCard = index;
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
              if (ui.pickCard === index) ui.pickCard = null;
              else if (ui.pickCard !== null && ui.pickCard > index) ui.pickCard--;
              changed();
            },
          }),
        ]),
      ]),
    );
  });
}

export function initEdit() {
  for (const button of document.querySelectorAll("#paint-modes button")) {
    button.addEventListener("click", () => {
      ui.mode = button.dataset.mode;
      ui.pickCard = null;
      render();
    });
  }
  $("add-card").addEventListener("click", () => {
    current().data.cards.push({ effect: catalog.effects[0].id, target: defaultTarget(catalog.effects[0].kinds[0]) });
    changed();
  });
  $("copy-json").addEventListener("click", () => {
    const level = current();
    const error = bridge.validate(level.data);
    if (error && !confirm(`This level isn't valid yet:\n${error}\n\nCopy anyway?`)) return;
    copyText(formatLevel(level.data), level.name);
  });
}
