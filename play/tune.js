// Temporary: sliders under the hand for the tile flip animation's CSS variables, to find values that look right. Remove once they're settled.

import { $, el } from "../editor/board.js";

const TUNE_KEY = "cardgame.tester.tune.v2";
const EASES = [
  ["linear", "linear"],
  ["ease", "ease"],
  ["ease-in", "ease-in"],
  ["ease-out", "ease-out"],
  ["ease-in-out", "ease-in-out"],
  ["soft out", "cubic-bezier(.33, 1, .68, 1)"],
  ["strong out", "cubic-bezier(.16, 1, .3, 1)"],
  ["soft in", "cubic-bezier(.32, 0, .67, 0)"],
  ["strong in", "cubic-bezier(.7, 0, .84, 0)"],
  ["snap", "cubic-bezier(.3, 0, .2, 1)"],
  ["overshoot", "cubic-bezier(.3, 0, .2, 1.3)"],
  ["big overshoot", "cubic-bezier(.34, 1.56, .64, 1)"],
];
const ms = (name, label, max = 1500) => ({ name, label, unit: "ms", min: 0, max, step: 10 });
const ease = (name, label) => ({ name, label, ease: true });
const GROUPS = [
  ["Flip", [
    ms("--light-start", "Light starts"), ms("--light-ms", "Light spreads for"), ease("--light-ease", "Light easing"),
    ms("--glow-start", "Glow starts"), ms("--glow-ms", "Glow fades for"),
    ms("--press-start", "Press starts"), ms("--press-ms", "Press lasts"), ease("--press-ease", "Press easing"),
    ms("--bob-start", "Bob starts"), ms("--bob-ms", "Bob lasts"),
    { name: "--bob-amp", label: "Bob height", unit: "cqh", min: 0, max: 8, step: 0.1 },
  ]],
  ["Unflip", [
    ms("--light-start-off", "Light starts"), ms("--light-ms-off", "Light shrinks for"), ease("--light-ease-off", "Light easing"),
    ms("--glow-start-off", "Glow starts"), ms("--glow-ms-off", "Glow fades for"),
    ms("--press-start-off", "Release starts"), ms("--press-ms-off", "Release lasts"), ease("--press-ease-off", "Release easing"),
    ms("--bob-start-off", "Bob starts"), ms("--bob-ms-off", "Bob lasts"),
    { name: "--bob-amp-off", label: "Bob height", unit: "cqh", min: 0, max: 8, step: 0.1 },
  ]],
  ["Both", [
    { name: "--press", label: "Press depth", unit: "%", min: 0, max: 15, step: 0.1 },
    { name: "--bob-damp", label: "Each swing ×", unit: "", min: 0, max: 1, step: 0.05 },
    { name: "--bob-name", label: "Swings", unit: "", min: 1, max: 3, step: 1, prefix: "bob-" },
  ]],
];
const SETTINGS = GROUPS.flatMap(([, settings]) => settings);

const defaults = {};
let values = {};

function cssValue(setting, value) {
  return setting.ease ? value : `${setting.prefix ?? ""}${value}${setting.unit}`;
}

function read(setting) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(setting.name).trim();
  if (setting.ease) return raw;
  return parseFloat(setting.prefix ? raw.slice(setting.prefix.length) : raw);
}

function apply(setting, value) {
  values[setting.name] = value;
  document.documentElement.style.setProperty(setting.name, cssValue(setting, value));
}

function save() {
  try {
    localStorage.setItem(TUNE_KEY, JSON.stringify(values));
  } catch {}
}

function control(setting) {
  const name = el("span", { textContent: setting.label + (setting.unit ? ` (${setting.unit})` : "") });
  if (setting.ease) {
    const options = EASES.some(([, css]) => css === values[setting.name]) ? EASES : [...EASES, [values[setting.name], values[setting.name]]];
    const select = el("select", {}, options.map(([label, css]) => el("option", { value: css, textContent: label, selected: css === values[setting.name] })));
    select.addEventListener("change", () => (apply(setting, select.value), save()));
    return el("label", { class: "tune-row" }, [name, select]);
  }
  const output = el("output", { textContent: values[setting.name] });
  const input = el("input", { type: "range", min: setting.min, max: setting.max, step: setting.step, value: values[setting.name] });
  input.addEventListener("input", () => {
    apply(setting, Number(input.value));
    output.textContent = input.value;
    save();
  });
  return el("label", { class: "tune-row" }, [name, input, output]);
}

function build() {
  const copy = el("button", { class: "small", textContent: "Copy values" });
  copy.addEventListener("click", async () => {
    const text = SETTINGS.map((s) => `${s.name}: ${cssValue(s, values[s.name])};`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = "Copied";
    } catch {
      window.prompt("Copy these values:", text);
    }
  });
  const reset = el("button", { class: "small", textContent: "Defaults" });
  reset.addEventListener("click", () => {
    for (const setting of SETTINGS) apply(setting, defaults[setting.name]);
    save();
    $("tune").replaceChildren(...build());
  });
  return [
    ...GROUPS.map(([title, settings]) => el("fieldset", {}, [el("legend", { textContent: title }), ...settings.map(control)])),
    el("div", { class: "tune-buttons" }, [copy, reset]),
  ];
}

function init() {
  for (const setting of SETTINGS) defaults[setting.name] = read(setting);
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(TUNE_KEY)) ?? {};
  } catch {}
  for (const setting of SETTINGS) {
    const value = stored[setting.name];
    apply(setting, typeof value === (setting.ease ? "string" : "number") ? value : defaults[setting.name]);
  }
  const panel = el("div", { id: "tune" }, build());
  // the tester's play screen is a fixed-height column, so the panel goes after it; the editor's Play tab flows, so it goes after the hand
  if (document.querySelector("#play .board-area")) $("play").after(panel);
  else $("play-hand").after(panel);
  // taps in the panel aren't taps on empty space, which would cancel the selected card
  panel.addEventListener("click", (e) => e.stopPropagation());
}

init();
