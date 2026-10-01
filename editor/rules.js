"use strict";

// shared by the editor and the tester page (play/)

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

async function fetchText(path) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`couldn't fetch ${path} (${response.status})`);
  return response.text();
}

async function loadPyodideScript() {
  if (typeof loadPyodide === "function") return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PYODIDE_URL + "pyodide.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("couldn't load Pyodide"));
    document.head.append(script);
  });
}

// base is the path from the calling page to editor/
async function loadBridge(base = "") {
  await loadPyodideScript();
  const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  const modules = JSON.parse(await fetchText(base + "modules.json"));
  const sources = await Promise.all([...modules.map((path) => fetchText(base + "../" + path)), fetchText(base + "bridge.py")]);
  const home = "/home/pyodide/";
  modules.forEach((path, index) => {
    pyodide.FS.mkdirTree(home + path.slice(0, path.lastIndexOf("/")));
    pyodide.FS.writeFile(home + path, sources[index]);
  });
  pyodide.FS.writeFile(home + "bridge.py", sources[sources.length - 1]);
  pyodide.runPython(`import sys\nif "${home}" not in sys.path: sys.path.insert(0, "${home}")`);
  return pyodide.pyimport("bridge");
}
