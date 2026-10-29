// CA+ Robot: opens each supplier billing page in YOUR Chrome (your own session, nothing leaves the browser
// except the invoice file), finds this month's and last month's invoices, sends them to CA+.
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create("caplus", { periodInMinutes: 720 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create("caplus", { periodInMinutes: 720 }));
chrome.alarms.onAlarm.addListener(async () => {
  const { lastMonth } = await chrome.storage.local.get("lastMonth");
  const m = new Date().toISOString().slice(0, 7);
  if (lastMonth !== m) run().catch(() => {});
});
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg.type === "run") { run().then((log) => reply({ log })).catch((e) => reply({ log: "❌ " + e.message })); return true; }
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function loaded(tabId) {
  for (let i = 0; i < 40; i++) { const t = await chrome.tabs.get(tabId); if (t.status === "complete") return; await wait(500); }
}

// Runs inside the supplier page: rows with an invoice link, plus their date.
function scan() {
  const RX = /invoice|facture|receipt|reçu|recu|statement|download|télécharger/i;
  const out = [];
  for (const a of document.querySelectorAll("a[href], button")) {
    const text = (a.textContent || "").trim() + " " + (a.getAttribute("aria-label") || "");
    if (!RX.test(text) || /summary|résumé/i.test(text)) continue;
    const row = a.closest("tr, li, [role=row]") || a.parentElement;
    const rowText = (row?.innerText || "").replace(/\s+/g, " ").slice(0, 300);
    const d = rowText.match(/(20\d\d)-(\d\d)-(\d\d)/) || rowText.match(/(\d\d)\/(\d\d)\/(20\d\d)/);
    const date = d ? (d[1].length === 4 ? `${d[1]}-${d[2]}-${d[3]}` : `${d[3]}-${d[2]}-${d[1]}`) : null;
    const zero = /[$€£]\s?0[.,]00\b|\b0[.,]00\s?[$€£]/.test(rowText) && !/[$€£]\s?[1-9]|[1-9][\d.,]*\s?[$€£]/.test(rowText);
    out.push({ href: a.href || null, date, rowText, zero });
  }
  return out;
}

// Runs inside the supplier page: downloads a link with the page's own session.
async function grab(href) {
  const r = await fetch(href, { credentials: "include" });
  const type = (r.headers.get("content-type") || "").split(";")[0];
  if (!/pdf|png|jpe?g/.test(type)) return { html: true };
  const buf = new Uint8Array(await r.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { mime: type.includes("pdf") ? "application/pdf" : type.includes("png") ? "image/png" : "image/jpeg", base64: btoa(s) };
}

async function run() {
  const { base, token, sent = {} } = await chrome.storage.local.get(["base", "token", "sent"]);
  if (!base || !token) throw new Error("Renseignez l'adresse CA+ et le code robot.");
  const H = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const res = await fetch(base + "/api/public/collector", { headers: H });
  if (!res.ok) throw new Error("Code robot refusé.");
  const { sources } = await res.json();
  const now = new Date(); const months = [now.toISOString().slice(0, 7), new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString().slice(0, 7)];
  const log = [];
  for (const src of sources) {
    const tab = await chrome.tabs.create({ url: src.url, active: true });
    try {
      await loaded(tab.id); await wait(3000);
      const [{ result: items }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scan });
      const todo = (items || []).filter((x) => x.href && !x.zero && (!x.date || months.includes(x.date.slice(0, 7))) && !sent[x.href]);
      if (!todo.length) { log.push(`• ${src.supplier} : rien de nouveau`); continue; }
      for (const it of todo.slice(0, 10)) {
        let [{ result: file }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: grab, args: [it.href] });
        if (file?.html) {
          // Invoice shown as a web page: open it and take a screenshot.
          const t2 = await chrome.tabs.create({ url: it.href, active: true });
          await loaded(t2.id); await wait(2500);
          const shot = await chrome.tabs.captureVisibleTab(t2.windowId, { format: "png" });
          await chrome.tabs.remove(t2.id);
          file = { mime: "image/png", base64: shot.split(",")[1] };
        }
        const ext = file.mime === "application/pdf" ? "pdf" : file.mime === "image/png" ? "png" : "jpg";
        const r = await fetch(base + "/api/public/collector", { method: "POST", headers: H, body: JSON.stringify({
          sourceId: src.id, fileName: `${src.supplier}-${it.date || "facture"}.${ext}`, mime: file.mime, base64: file.base64, invoiceDate: it.date, label: it.rowText,
        }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok) sent[it.href] = Date.now();
        log.push(`${j.envoye ? "✅" : j.attached ? "📥" : "⚠️"} ${src.supplier} ${it.date || ""} : ${j.message || j.error || ""}`);
      }
    } catch (e) { log.push(`❌ ${src.supplier} : ${e.message}`); }
    finally { chrome.tabs.remove(tab.id).catch(() => {}); }
  }
  const text = log.join("\n") || "Aucune source robot configurée.";
  await chrome.storage.local.set({ sent, lastMonth: now.toISOString().slice(0, 7), lastLog: text });
  return text;
}
