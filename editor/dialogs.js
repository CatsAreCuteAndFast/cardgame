// The shared text dialog (copy fallback, import, gist id) and copying to the clipboard.

import { $, toast } from "./board.js";

export async function copyText(text, title) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard");
  } catch {
    showTextDialog(title, text, "Clipboard isn't available here. Select all and copy.", null);
  }
}

// onOk(text) makes the dialog editable with an OK button; without it the text is read-only
export function showTextDialog(title, text, note, onOk) {
  const dialog = $("text-dialog");
  $("text-dialog-title").textContent = title;
  $("text-dialog-text").value = text;
  $("text-dialog-text").readOnly = !onOk;
  $("text-dialog-note").textContent = note;
  $("text-dialog-ok").hidden = !onOk;
  dialog.onclose = () => {
    if (onOk && dialog.returnValue === "ok") onOk($("text-dialog-text").value);
  };
  dialog.returnValue = "";
  dialog.showModal();
  if (!onOk) $("text-dialog-text").select();
}
