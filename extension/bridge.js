// Links the CA+ page to the robot: the app sends its address + robot code once, then "run" on each click.
const V = chrome.runtime.getManifest().version;
document.documentElement.dataset.caplusRobot = V;
window.postMessage({ source: "caplus-robot", type: "ready", version: V }, location.origin);
window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.source !== "caplus-app") return;
  const m = e.data;
  if (m.type === "ping") window.postMessage({ source: "caplus-robot", type: "ready", version: V }, location.origin);
  if (m.type === "connect") chrome.storage.local.set({ base: location.origin, token: m.token }, () =>
    window.postMessage({ source: "caplus-robot", type: "connected" }, location.origin));
  if (m.type === "run") chrome.storage.local.set(m.token ? { base: location.origin, token: m.token } : {}, () => chrome.runtime.sendMessage({ type: "run", url: m.url }, (r) =>
    window.postMessage({ source: "caplus-robot", type: "done", log: r?.log || "Terminé" }, location.origin)));
});
