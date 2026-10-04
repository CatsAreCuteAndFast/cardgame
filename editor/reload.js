// The Reload button, as a plain script with no imports so it keeps working when the page's
// modules fail to load (for example a stale cached file mixed with a new one after a deploy).

// phones keep the page's own files cached; refetch them from the network so the reload picks up a new deploy
async function hardReload(button) {
  button.disabled = true;
  const urls = [location.href.split("#")[0]];
  for (const node of document.querySelectorAll("script[src], link[rel=stylesheet]")) urls.push(node.src || node.href);
  // includes the modules, which are imported rather than listed as script tags
  for (const entry of performance.getEntriesByType("resource")) urls.push(entry.name);
  const own = urls.filter((url) => new URL(url).origin === location.origin);
  await Promise.allSettled(own.map((url) => fetch(url, { cache: "reload" })));
  location.reload();
}

document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("reload");
  if (button) button.onclick = () => hardReload(button);
});

// each page hides the "Loading…" banner when its modules have run, which is before load fires
window.addEventListener("load", () => {
  const banner = document.getElementById("loading");
  if (banner && !banner.hidden && banner.textContent === "Loading…") banner.textContent = "Couldn't load the game. Press ↻ Reload.";
});
