// The Levels screen: folders, levels, and copying or importing them as JSON.

import { $, el, toast } from "./board.js";
import * as bridge from "./bridge.js";
import { store, saveLevels, addLevel, folderById, folderByName, blankLevel, size, normalizeLevel } from "./store.js";
import { copyText, showTextDialog } from "./dialogs.js";
import { render, setTab } from "./editor.js";

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

export function renderLevels() {
  const container = $("level-list");
  container.replaceChildren();
  if (!store.levels.length && !store.folders.length) {
    container.append(el("p", { class: "empty", textContent: "No levels yet. Tap “New level” to start." }));
    return;
  }
  for (const folder of [...store.folders].sort(byName)) {
    const inside = store.levels.filter((level) => level.folder === folder.id);
    container.append(
      el("section", { class: "folder" }, [
        el("div", { class: "folder-head" }, [
          el("button", {
            class: "folder-toggle",
            textContent: `${folder.collapsed ? "▸" : "▾"} ${folder.name} (${inside.length})`,
            onclick: () => {
              folder.collapsed = !folder.collapsed;
              saveLevels();
              render();
            },
          }),
          el("div", { class: "actions" }, [
            el("button", { class: "small", textContent: "+ Level", onclick: () => newLevel(folder.id) }),
            el("button", { class: "small", textContent: "Rename", onclick: () => renameFolder(folder) }),
            el("button", { class: "small", textContent: "Copy", title: "Copy this folder's levels", onclick: () => copyLevels(inside, folder.name, true) }),
            el("button", { class: "small danger", textContent: "✕", title: "Delete folder", onclick: () => deleteFolder(folder) }),
          ]),
        ]),
        folder.collapsed ? null : renderLevelList(inside, "Empty folder. Use “+ Level” or move levels here."),
      ]),
    );
  }
  const ungrouped = store.levels.filter((level) => level.folder === null);
  if (ungrouped.length || !store.folders.length) {
    container.append(
      el("section", { class: "folder" }, [
        store.folders.length ? el("div", { class: "folder-head" }, el("h2", { textContent: `Ungrouped (${ungrouped.length})` })) : null,
        renderLevelList(ungrouped, ""),
      ]),
    );
  }
}

function renderLevelList(items, emptyText) {
  const list = el("ul", { class: "level-list" });
  if (!items.length && emptyText) list.append(el("li", { class: "empty", textContent: emptyText }));
  for (const level of [...items].sort(byName)) {
    const { width, height } = size(level.data);
    const open = () => {
      store.currentId = level.id;
      saveLevels();
      setTab("edit");
    };
    list.append(
      el("li", { class: "level-item" + (level.id === store.currentId ? " is-current" : "") }, [
        el("div", { class: "info", onclick: open }, [
          el("div", { class: "name", textContent: level.name }),
          el("div", {
            class: "meta",
            textContent: `${width}×${height} · ${level.data.cards.length} cards · ${new Date(level.updated).toLocaleString()}`,
          }),
        ]),
        el("div", { class: "actions" }, [
          el("button", { class: "small", textContent: "Rename", onclick: () => renameLevel(level) }),
          el("button", { class: "small", textContent: "Clone", title: "Duplicate", onclick: () => duplicateLevel(level) }),
          el("button", { class: "small", textContent: "Move", title: "Move to folder", onclick: () => moveLevel(level) }),
          el("button", { class: "small danger", textContent: "✕", title: "Delete", onclick: () => deleteLevel(level) }),
        ]),
      ]),
    );
  }
  return list;
}

function askFolderName(initial) {
  const name = prompt("Folder name", initial);
  if (name === null || !name.trim()) return null;
  return name.trim();
}

function newLevel(folderId = null) {
  const count = store.levels.filter((level) => level.folder === folderId).length;
  const name = prompt("Level name", `Level ${count + 1}`);
  if (name === null) return;
  addLevel(name.trim() || `Level ${count + 1}`, blankLevel(), folderId);
  setTab("edit");
}

function newFolder() {
  const name = askFolderName(`Folder ${store.folders.length + 1}`);
  if (name === null) return;
  if (store.folders.some((folder) => folder.name === name)) return alert(`A folder named “${name}” already exists.`);
  folderByName(name);
  saveLevels();
  render();
}

function renameFolder(folder) {
  const name = askFolderName(folder.name);
  if (name === null) return;
  if (store.folders.some((other) => other !== folder && other.name === name)) return alert(`A folder named “${name}” already exists.`);
  folder.name = name;
  saveLevels();
  render();
}

function deleteFolder(folder) {
  const inside = store.levels.filter((level) => level.folder === folder.id);
  const note = inside.length ? `\nIts ${inside.length} level${inside.length === 1 ? "" : "s"} will move to Ungrouped.` : "";
  if (!confirm(`Delete folder “${folder.name}”?${note}`)) return;
  for (const level of inside) level.folder = null;
  store.folders = store.folders.filter((other) => other !== folder);
  saveLevels();
  render();
}

function moveLevel(level) {
  const dialog = $("move-dialog");
  const moveTo = (folderId) => {
    level.folder = folderId;
    saveLevels();
    dialog.close();
    render();
  };
  $("move-dialog-title").textContent = `Move “${level.name}” to`;
  const option = (label, folderId) =>
    el("button", { type: "button", textContent: label, disabled: level.folder === folderId, onclick: () => moveTo(folderId) });
  $("move-options").replaceChildren(
    ...[...store.folders].sort(byName).map((folder) => option(folder.name, folder.id)),
    option("Ungrouped", null),
    el("button", {
      type: "button",
      textContent: "+ New folder…",
      onclick: () => {
        const name = askFolderName("");
        if (name !== null) moveTo(folderByName(name).id);
      },
    }),
  );
  dialog.showModal();
}

// exports [{name, folder?, level, solution?}], the format of levels/pack.json.
// forPack warns about levels that would fail the tests in the pack: invalid, or without a working solution
function copyLevels(items, title, forPack = false) {
  if (!items.length) return toast("No levels to copy");
  const unready = forPack ? items.filter((level) => bridge.validate(level.data) || bridge.checkSolution(level.data, level.solution).error) : [];
  const names = unready.map((level) => `• ${level.name}`).join("\n");
  if (unready.length && !confirm(`These levels are invalid or have no working solution, so the tests would fail with them in levels/pack.json:\n${names}\n\nCopy anyway?`)) return;
  const entries = items.map((level) => {
    const folder = folderById(level.folder);
    return { name: level.name, ...(folder ? { folder: folder.name } : {}), level: level.data, ...(level.solution ? { solution: level.solution } : {}) };
  });
  copyText(JSON.stringify(entries), title);
}

function renameLevel(level) {
  const name = prompt("Level name", level.name);
  if (name === null || !name.trim()) return;
  level.name = name.trim();
  level.updated = Date.now();
  saveLevels();
  render();
}

function duplicateLevel(level) {
  const copy = addLevel(level.name + " copy", structuredClone(level.data), level.folder);
  if (level.solution) copy.solution = structuredClone(level.solution);
  saveLevels();
  render();
}

function deleteLevel(level) {
  if (!confirm(`Delete “${level.name}”? This can't be undone.`)) return;
  store.levels = store.levels.filter((other) => other.id !== level.id);
  if (store.currentId === level.id) store.currentId = store.levels[0]?.id ?? null;
  saveLevels();
  render();
}

// accepts the "Copy all" list (recreating folders by name) or a single level
function importText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    alert("That isn't valid JSON: " + error.message);
    return;
  }
  try {
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        const folder = entry.folder ? folderByName(String(entry.folder)) : null;
        const level = addLevel(String(entry.name ?? "Imported"), normalizeLevel(entry.level), folder?.id ?? null);
        if (Array.isArray(entry.solution)) level.solution = entry.solution;
      }
      saveLevels();
      toast(`Imported ${parsed.length} level${parsed.length === 1 ? "" : "s"}`);
    } else {
      const data = normalizeLevel(parsed);
      const name = prompt("Name for the imported level", "Imported") || "Imported";
      addLevel(name.trim(), data);
      setTab("edit");
    }
  } catch (error) {
    alert(error.message);
  }
  render();
}

export function initLevels() {
  $("new-level").addEventListener("click", () => newLevel(null));
  $("new-folder").addEventListener("click", newFolder);
  $("import-level").addEventListener("click", () =>
    showTextDialog("Import JSON", "", "Paste one level, or the text from “Copy all”.", importText),
  );
  $("copy-all").addEventListener("click", () => copyLevels(store.levels, "All levels"));
}
