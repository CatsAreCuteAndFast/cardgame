// Temporary: sliders for the tile flip animation's CSS variables, to find values that look right. Remove once they're settled.

import { $, el, renderCell, flipDuration } from "../editor/board.js";

const TUNE_KEY = "cardgame.tester.tune";
const SETTINGS = [
  { name: "--flip-ms", label: "Flip length", unit: "ms", min: 200, max: 1500, step: 10 },
  { name: "--press", label: "Press depth", unit: "%", min: 0, max: 15, step: 0.1 },
  { name: "--bob-start", label: "Bob starts at", unit: "ms", min: 0, max: 1500, step: 10 },
  { name: "--bob-ms", label: "Bob length", unit: "ms", min: 100, max: 1500, step: 10 },
  { name: "--bob-amp", label: "Bob height (flip)", unit: "cqh", min: 0, max: 8, step: 0.1 },
  { name: "--bob-amp-off", label: "Bob height (unflip)", unit: "cqh", min: 0, max: 8, step: 0.1 },
  { name: "--bob-damp", label: "Each swing ×", unit: "", min: 0, max: 1, step: 0.05 },
  { name: "--bob-name", label: "Swings", unit: "", min: 1, max: 3, step: 1, prefix: "bob-" },
];

const root = document.documentElement.style;
const defaults = {};
let values = {};
let flipped = false;

function read(setting) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(setting.name).trim();
  return parseFloat(setting.prefix ? raw.slice(setting.prefix.length) : raw);
}

function apply(setting, value) {
  values[setting.name] = value;
  root.setProperty(setting.name, `${setting.prefix ?? ""}${value}${setting.unit}`);
}

function save() {
  try {
    localStorage.setItem(TUNE_KEY, JSON.stringify(values));
  } catch {}
}

function cssText() {
  return SETTINGS.map((s) => `${s.name}: ${s.prefix ?? ""}${values[s.name]}${s.unit};`).join("\n");
}

function renderSample(animate) {
  const cell = { type: "basic", flipped, link: null, period: 0 };
  const node = renderCell(cell, { anim: animate ? { on: flipped, elapsed: 0, total: flipDuration() } : null });
  $("tune-sample").replaceChildren(node);
}

function build() {
  const rows = SETTINGS.map((setting) => {
    const output = el("output", { textContent: values[setting.name] });
    const input = el("input", { type: "range", min: setting.min, max: setting.max, step: setting.step, value: values[setting.name] });
    input.addEventListener("input", () => {
      apply(setting, Number(input.value));
      output.textContent = input.value;
      save();
    });
    return el("label", { class: "tune-row" }, [el("span", { textContent: setting.label + (setting.unit ? ` (${setting.unit})` : "") }), input, output]);
  });
  const sample = el("div", { id: "tune-sample", class: "board", title: "Tap to flip" });
  sample.addEventListener("click", () => {
    flipped = !flipped;
    renderSample(true);
  });
  const copy = el("button", { class: "small", textContent: "Copy values" });
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(cssText());
      copy.textContent = "Copied";
    } catch {
      window.prompt("Copy these values:", cssText());
    }
  });
  const reset = el("button", { class: "small", textContent: "Defaults" });
  reset.addEventListener("click", () => {
    for (const setting of SETTINGS) apply(setting, defaults[setting.name]);
    save();
    $("tune").replaceChildren(...build());
    renderSample(false);
  });
  return [el("div", { class: "tune-top" }, [sample, el("span", { class: "tune-hint", textContent: "Tap the tile to flip it, or play a level." })]), ...rows, el("div", { class: "tune-buttons" }, [copy, reset])];
}

function init() {
  for (const setting of SETTINGS) defaults[setting.name] = read(setting);
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(TUNE_KEY)) ?? {};
  } catch {}
  for (const setting of SETTINGS) apply(setting, typeof stored[setting.name] === "number" ? stored[setting.name] : defaults[setting.name]);
  const panel = el("aside", { id: "tune", hidden: true });
  document.body.append(panel);
  panel.append(...build());
  renderSample(false);
  $("tune-toggle").addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    panel.style.top = `${document.querySelector(".top").offsetHeight}px`;
  });
}

init();
