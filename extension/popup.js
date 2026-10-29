const $ = (id) => document.getElementById(id);
chrome.storage.local.get(["base", "token", "lastLog"], (s) => {
  $("base").value = s.base || "https://clever-ledger-clone.lovable.app";
  $("token").value = s.token || "";
  $("log").textContent = s.lastLog || "";
});
$("save").onclick = () => chrome.storage.local.set({ base: $("base").value.trim().replace(/\/$/, ""), token: $("token").value.trim() }, () => { $("log").textContent = "✅ Enregistré"; });
$("run").onclick = () => { $("log").textContent = "⏳ Collecte en cours…"; chrome.runtime.sendMessage({ type: "run" }, (r) => { $("log").textContent = r?.log || "Terminé"; }); };
