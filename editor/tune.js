// Animation tuning: a collapsible panel under the editor's Play hand with sliders for the animations' CSS variables.

import { $, el } from "../editor/board.js";

const TUNE_KEY = "cardgame.tester.tune.v2";
const OPEN_KEY = "cardgame.editor.tune.open";
const GROUPS_KEY = "cardgame.editor.tune.groups";
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
    { name: "--press", label: "Press depth", unit: "%", min: 0, max: 15, step: 0.1 },
    { name: "--flip-stiffness", label: "Spring stiffness", unit: "", min: 50, max: 1200, step: 10 },
    { name: "--flip-damping", label: "Spring damping", unit: "", min: 0.1, max: 1.5, step: 0.05 },
    { name: "--flip-extra", label: "Pushed past rest", unit: "%", min: 0, max: 6, step: 0.1 },
    ms("--light-ms", "Light spreads for"), ease("--light-ease", "Light easing"),
    ms("--glow-ms", "Glow fades in for"),
  ]],
  ["Tile unflip", [
    { name: "--flip-extra-off", label: "Lifted past rest", unit: "%", min: 0, max: 6, step: 0.1 },
    ms("--light-ms-off", "Light shrinks for"), ease("--light-ease-off", "Light easing"),
    ms("--glow-ms-off", "Glow fades out for"),
  ]],
  ["Tile outline", [
    ms("--ring-ms", "Outline fades in for", 1000), ease("--ring-ease", "Fade-in easing"),
    { name: "--ring-scale", label: "Fade-in starts at ×", unit: "", min: 0.8, max: 1.3, step: 0.01 },
    ms("--ants-ms", "Dashes loop every", 8000),
    ms("--lock-ms", "Dashes fade for", 1000), ease("--lock-ease", "Dash fade easing"),
    ms("--lock-hold", "Lock stays after a play for", 2000),
    ms("--pop-ms", "Pick pops for", 1000), ease("--pop-ease", "Pop easing"),
    { name: "--pop-scale", label: "Pop starts at ×", unit: "", min: 1, max: 1.6, step: 0.01 },
  ]],
  ["Tile tap", [
    ms("--tap-ms", "Press lasts", 1000),
    { name: "--tap-depth", label: "Press depth", unit: "%", min: 0, max: 10, step: 0.1 },
    ms("--link-delay", "Linked tiles follow after", 600),
    ms("--shake-ms", "Shake lasts", 1000),
  ]],
  ["Tile swap", [
    ms("--swap-ms", "Slide lasts"), ease("--swap-ease", "Slide easing"),
    { name: "--swap-lift", label: "Top tile lifts to ×", unit: "", min: 1, max: 1.3, step: 0.01 },
    { name: "--swap-sink", label: "Bottom tile sinks to ×", unit: "", min: 0.7, max: 1, step: 0.01 },
  ]],
  ["Timers", [
    ms("--tick-start", "Tick starts", 1000), ms("--tick-ms", "Tick lasts", 1000), ease("--tick-ease", "Tick easing"),
    ms("--mark-ms", "Neighbour timer ring lasts", 3000),
  ]],
  ["Level won", [
    ms("--win-start", "Wash starts"), ms("--win-stagger", "Per tile of distance", 300), ms("--win-ms", "Each tile's sheen lasts"),
    { name: "--win-swell", label: "Tiles swell to ×", unit: "", min: 1, max: 1.15, step: 0.005 },
    { name: "--win-flash", label: "Sheen strength", unit: "", min: 0, max: 1, step: 0.05 },
    { name: "--wash-opacity", label: "Ring strength", unit: "", min: 0, max: 1, step: 0.05 },
    ms("--settle-start", "Hand settles after"), ms("--settle-ms", "Hand settles for"),
  ]],
  ["Cards", [
    ms("--card-ms", "Lift lasts", 1000), ease("--card-ease", "Lift easing"),
    { name: "--card-lift", label: "Lift height (− is up)", unit: "px", min: -20, max: 0, step: 1 },
    ms("--burn-ms", "Burn lasts", 2000), ease("--burn-ease", "Ember easing"),
    ms("--fly-ms", "Shrink into board lasts", 1000), ease("--fly-ease", "Shrink easing"),
    ms("--return-ms", "Ghost returns for", 1000),
  ]],
  ["New game", [
    ms("--intro-ms", "Tiles settle for", 1000), ease("--intro-ease", "Settle easing"),
    { name: "--intro-scale", label: "Tiles start at ×", unit: "", min: 0.5, max: 1, step: 0.01 },
    ms("--intro-stagger", "Per tile of distance", 300),
    ms("--deal-ms", "Each card deals for", 1000), ease("--deal-ease", "Deal easing"),
    ms("--deal-stagger", "Per card", 300),
    ms("--text-ms", "Buttons pop in for", 1000),
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

// a dropdown per animation; which ones are open is remembered
function group(title, settings) {
  let open = [];
  try {
    open = JSON.parse(localStorage.getItem(GROUPS_KEY)) ?? [];
  } catch {}
  const box = el("details", { class: "tune-group", open: open.includes(title) }, [el("summary", { textContent: title }), ...settings.map(control)]);
  box.addEventListener("toggle", () => {
    try {
      const now = (JSON.parse(localStorage.getItem(GROUPS_KEY)) ?? []).filter((t) => t !== title);
      localStorage.setItem(GROUPS_KEY, JSON.stringify(box.open ? [...now, title] : now));
    } catch {}
  });
  return box;
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
    ...GROUPS.map(([title, settings]) => group(title, settings)),
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
