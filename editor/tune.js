// Animation tuning: a collapsible panel under the editor's Play hand with sliders for the animations' CSS variables.

import { $, el } from "../editor/board.js";

const TUNE_KEY = "cardgame.tester.tune.v2";
const OPEN_KEY = "cardgame.editor.tune.open";
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
  ["Tile flip", [
    ms("--light-start", "Light starts"), ms("--light-ms", "Light spreads for"), ease("--light-ease", "Light easing"),
    ms("--glow-start", "Glow starts"), ms("--glow-ms", "Glow fades for"),
    ms("--press-start", "Press starts"), ms("--press-ms", "Press lasts"), ease("--press-ease", "Press easing"),
    ms("--recoil-start", "Recoil starts"), ms("--recoil-ms", "Recoil lasts"),
    { name: "--recoil-depth", label: "Extra push", unit: "cqh", min: -4, max: 4, step: 0.1 },
  ]],
  ["Tile unflip", [
    ms("--light-start-off", "Light starts"), ms("--light-ms-off", "Light shrinks for"), ease("--light-ease-off", "Light easing"),
    ms("--glow-start-off", "Glow starts"), ms("--glow-ms-off", "Glow fades for"),
    ms("--press-start-off", "Release starts"), ms("--press-ms-off", "Release lasts"), ease("--press-ease-off", "Release easing"),
    ms("--recoil-start-off", "Recoil starts"), ms("--recoil-ms-off", "Recoil lasts"),
    { name: "--recoil-depth-off", label: "Extra push (− is up)", unit: "cqh", min: -4, max: 4, step: 0.1 },
  ]],
  ["Tile flip and unflip", [
    { name: "--press", label: "Press depth", unit: "%", min: 0, max: 15, step: 0.1 },
    { name: "--recoil-back", label: "Spring back ×", unit: "", min: 0, max: 1, step: 0.05 },
  ]],
];
const SETTINGS = GROUPS.flatMap(([, settings]) => settings);

const defaults = {};
let values = {};

function cssValue(setting, value) {
  return setting.ease ? value : `${value}${setting.unit}`;
}

function read(setting) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(setting.name).trim();
  if (setting.ease) return raw;
  return parseFloat(raw);
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

// one row per variable: its control and a button that puts back its default
function control(setting) {
  const name = el("span", { textContent: setting.label + (setting.unit ? ` (${setting.unit})` : "") });
  const reset = el("button", { class: "small tune-reset", textContent: "↺", title: "Reset to default" });
  const set = (value) => {
    apply(setting, value);
    save();
  };
  if (setting.ease) {
    const options = EASES.some(([, css]) => css === values[setting.name]) ? EASES : [...EASES, [values[setting.name], values[setting.name]]];
    const select = el("select", {}, options.map(([label, css]) => el("option", { value: css, textContent: label, selected: css === values[setting.name] })));
    select.addEventListener("change", () => set(select.value));
    reset.addEventListener("click", () => {
      set(defaults[setting.name]);
      select.value = defaults[setting.name];
    });
    return el("div", { class: "tune-row ease" }, [name, select, reset]);
  }
  const output = el("output", { textContent: values[setting.name] });
  const input = el("input", { type: "range", min: setting.min, max: setting.max, step: setting.step, value: values[setting.name] });
  input.addEventListener("input", () => {
    set(Number(input.value));
    output.textContent = input.value;
  });
  reset.addEventListener("click", () => {
    set(defaults[setting.name]);
    input.value = defaults[setting.name];
    output.textContent = defaults[setting.name];
  });
  return el("div", { class: "tune-row" }, [name, input, output, reset]);
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
    $("tune-body").replaceChildren(...build());
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
  const panel = el("details", { id: "tune" }, [el("summary", { textContent: "Animations" }), el("div", { id: "tune-body" }, build())]);
  try {
    panel.open = localStorage.getItem(OPEN_KEY) === "1";
  } catch {}
  panel.addEventListener("toggle", () => {
    try {
      localStorage.setItem(OPEN_KEY, panel.open ? "1" : "0");
    } catch {}
  });
  $("play-hand").after(panel);
  // taps in the panel aren't taps on empty space, which would cancel the selected card
  panel.addEventListener("click", (e) => e.stopPropagation());
}

init();
