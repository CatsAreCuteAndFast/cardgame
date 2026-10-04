// Optional sync of levels and folders between devices through a secret GitHub gist.

import { $, toast } from "./board.js";
import { store, markSaved, normalizeLevels, writeLocal, setChangeListener } from "./store.js";
import { showTextDialog } from "./dialogs.js";

const SYNC_KEY = "cardgame.sync";
const GIST_FILE = "cardgame-levels.json";
const PUSH_DELAY = 2000;
const KEEPALIVE_LIMIT = 60000;

let sync = null;
let pushTimer = null;
let syncChain = Promise.resolve();
let onRemote = () => {};

function loadSync() {
  try {
    sync = JSON.parse(localStorage.getItem(SYNC_KEY));
  } catch {
    sync = null;
  }
  if (!sync?.token || !sync?.gistId) sync = null;
}

function saveSync() {
  try {
    if (sync) localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
    else localStorage.removeItem(SYNC_KEY);
  } catch {}
}

function setSyncStatus(text, bad = false) {
  const node = $("sync-status");
  node.textContent = text;
  node.hidden = !text;
  node.classList.toggle("bad", bad);
}

async function gistRequest(token, method, path, body) {
  const json = body === undefined ? undefined : JSON.stringify(body);
  const response = await fetch("https://api.github.com/gists" + path, {
    method,
    cache: "no-store",
    keepalive: json !== undefined && json.length < KEEPALIVE_LIMIT,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` },
    body: json,
  });
  if (response.status === 401) throw new Error("GitHub rejected the token");
  if (response.status === 404) throw new Error("gist not found (check the id, and that the token has gist access)");
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  return response.json();
}

async function fetchRemote() {
  const gist = await gistRequest(sync.token, "GET", "/" + sync.gistId);
  const file = gist.files?.[GIST_FILE];
  if (!file) throw new Error(`the gist has no ${GIST_FILE}`);
  const text = file.truncated ? await (await fetch(file.raw_url, { cache: "no-store" })).text() : file.content;
  const remote = JSON.parse(text);
  if (!Array.isArray(remote.levels) || !Array.isArray(remote.folders)) throw new Error(`${GIST_FILE} isn't a level list`);
  return remote;
}

function gistFiles(updated) {
  return { [GIST_FILE]: { content: JSON.stringify({ version: 1, updated, levels: store.levels, folders: store.folders }) } };
}

async function writeRemote() {
  const updated = Date.now();
  const edits = store.editCount;
  await gistRequest(sync.token, "PATCH", "/" + sync.gistId, { files: gistFiles(updated) });
  sync.remoteUpdated = updated;
  sync.dirty = store.editCount !== edits;
  saveSync();
}

function applyRemote(remote) {
  store.levels = remote.levels;
  store.folders = remote.folders;
  normalizeLevels();
  markSaved();
  sync.remoteUpdated = remote.updated;
  sync.dirty = false;
  saveSync();
  writeLocal();
  onRemote();
}

function takeRemoteOnConflict() {
  return confirm(
    "The synced levels and this device's levels have both changed since this device last synced.\n\n" +
      "OK: use the synced levels (this device's unsynced changes are lost).\n" +
      "Cancel: keep this device's levels and overwrite the synced ones.",
  );
}

async function syncNow() {
  setSyncStatus("Syncing…");
  const remote = await fetchRemote();
  if (remote.updated !== sync.remoteUpdated && (!sync.dirty || takeRemoteOnConflict())) applyRemote(remote);
  else if (sync.dirty) await writeRemote();
  setSyncStatus(sync.dirty ? "Unsynced changes" : "Synced");
  if (sync.dirty) schedulePush();
}

function queueSync() {
  clearTimeout(pushTimer);
  pushTimer = null;
  syncChain = syncChain
    .then(() => sync && syncNow())
    .catch((error) => {
      console.error(error);
      if (!sync) return;
      if (error instanceof TypeError) setSyncStatus("Offline, saved here", true);
      else {
        setSyncStatus("Sync error", true);
        toast("Sync failed: " + error.message);
      }
    });
  return syncChain;
}

function schedulePush() {
  setSyncStatus("Unsynced changes");
  clearTimeout(pushTimer);
  pushTimer = setTimeout(queueSync, PUSH_DELAY);
}

function markDirty() {
  if (!sync) return;
  sync.dirty = true;
  saveSync();
  schedulePush();
}

async function connectSync(token, gistId) {
  try {
    if (!gistId) {
      const gist = await gistRequest(token, "POST", "", {
        description: "cardgame level editor",
        public: false,
        files: gistFiles(Date.now()),
      });
      sync = { token, gistId: gist.id, remoteUpdated: null, dirty: false };
      saveSync();
      await queueSync();
      showTextDialog("Sync gist created", gist.id, "Enter this gist id with the same token on your other devices.");
      return;
    }
    sync = { token, gistId, remoteUpdated: null, dirty: store.levels.length > 0 };
    saveSync();
    await queueSync();
  } catch (error) {
    alert("Couldn't connect: " + error.message);
  }
}

function showSyncDialog() {
  const dialog = $("sync-dialog");
  $("sync-token").value = sync?.token ?? "";
  $("sync-gist").value = sync?.gistId ?? "";
  $("sync-disconnect").hidden = !sync;
  dialog.onclose = () => {
    if (dialog.returnValue === "disconnect") {
      sync = null;
      saveSync();
      clearTimeout(pushTimer);
      setSyncStatus("");
      toast("Sync turned off on this device");
    } else if (dialog.returnValue === "connect") {
      const token = $("sync-token").value.trim();
      const gistId = $("sync-gist").value.trim().split("/").pop();
      if (token) connectSync(token, gistId);
    }
  };
  dialog.returnValue = "";
  dialog.showModal();
}

// pulls on start and when the tab becomes visible, pushes shortly after each saved change;
// applied is called after remote levels replaced this device's
export function initSync(applied) {
  onRemote = applied;
  loadSync();
  setChangeListener(markDirty);
  $("sync").addEventListener("click", showSyncDialog);
  $("sync-status").addEventListener("click", showSyncDialog);
  document.addEventListener("visibilitychange", () => {
    if (sync && (document.visibilityState === "visible" || pushTimer)) queueSync();
  });
  if (sync) queueSync();
}
