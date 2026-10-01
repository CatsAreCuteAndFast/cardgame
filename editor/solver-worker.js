import "./rules.js";

let ready = null;
let job = 0;

// each message starts a new job, which stops the one before it between slices
onmessage = async ({ data }) => {
  const id = (job = data.id);
  if (data.level === null) return;
  try {
    const bridge = await (ready ??= loadBridge());
    if (id !== job) return;
    bridge.solve_start(data.level, data.maxStates);
    while (id === job) {
      const result = JSON.parse(bridge.solve_step(0.1));
      postMessage({ id, result });
      if (result.status !== "running") return;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } catch (error) {
    postMessage({ id, error: String(error.message ?? error) });
  }
};
