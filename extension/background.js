// CA+ Robot: opens each supplier billing page in YOUR Chrome (your own session, nothing leaves the browser
// except the invoice file), in a small window on the side, finds recent invoices, sends them to CA+.
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create("caplus", { periodInMinutes: 720 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create("caplus", { periodInMinutes: 720 }));
chrome.alarms.onAlarm.addListener(async () => {
  const { lastMonth } = await chrome.storage.local.get("lastMonth");
  const m = new Date().toISOString().slice(0, 7);
  if (lastMonth !== m) run().catch(() => {});
});
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg.type === "run") { run(msg.url || null).then((log) => reply({ log })).catch((e) => reply({ log: "❌ " + e.message })); return true; }
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function loaded(tabId) {
  for (let i = 0; i < 40; i++) { const t = await chrome.tabs.get(tabId); if (t.status === "complete") return; await wait(500); }
}

// Runs inside the supplier page: invoice links/buttons with their row text and date.
function scan() {
  const RX = /invoice|facture|receipt|reçu|recu|statement|relevé|download|télécharger|pdf/i;
  const MONTHS = { jan: 1, feb: 2, fév: 2, fev: 2, mar: 3, apr: 4, avr: 4, may: 5, mai: 5, jun: 6, juin: 6, jul: 7, juil: 7, aug: 8, aoû: 8, aou: 8, sep: 9, oct: 10, nov: 11, dec: 12, déc: 12 };
  const pad = (n) => String(n).padStart(2, "0");
  function dateOf(t) {
    let d = t.match(/(20\d\d)-(\d\d)-(\d\d)/); if (d) return `${d[1]}-${d[2]}-${d[3]}`;
    d = t.match(/(\d\d?)[/.](\d\d?)[/.](20\d\d)/); if (d) return `${d[3]}-${pad(d[2])}-${pad(d[1])}`;
    d = t.match(/([A-Za-zéû]{3,9})\.?\s+(\d\d?),?\s+(20\d\d)/); if (d && MONTHS[d[1].slice(0, 3).toLowerCase()] ) return `${d[3]}-${pad(MONTHS[d[1].slice(0, 3).toLowerCase()])}-${pad(d[2])}`;
    d = t.match(/(\d\d?)\s+([A-Za-zéû]{3,9})\.?\s+(20\d\d)/); if (d && MONTHS[d[2].slice(0, 4).toLowerCase()] || d && MONTHS[d[2].slice(0, 3).toLowerCase()]) return `${d[3]}-${pad(MONTHS[d[2].slice(0, 4).toLowerCase()] || MONTHS[d[2].slice(0, 3).toLowerCase()])}-${pad(d[1])}`;
    d = t.match(/([A-Za-zéû]{3,9})\s+(20\d\d)/); if (d && MONTHS[d[1].slice(0, 3).toLowerCase()]) return `${d[2]}-${pad(MONTHS[d[1].slice(0, 3).toLowerCase()])}-01`;
    return null;
  }
  const out = [];
  const els = [...document.querySelectorAll("a, button, [role=button]")];
  els.forEach((a, i) => {
    const text = ((a.textContent || "") + " " + (a.getAttribute("aria-label") || "") + " " + (a.getAttribute("title") || "")).trim();
    const href = a.href || "";
    if (!RX.test(text) && !/\.pdf|invoice|facture/i.test(href)) return;
    if (/summary|résumé|history|historique|settings|help|aide/i.test(text) && !/invoice|facture/i.test(text)) return;
    const row = a.closest("tr, li, [role=row]") || a.parentElement?.parentElement || a.parentElement;
    const rowText = (row?.innerText || "").replace(/\s+/g, " ").slice(0, 300);
    const zero = /[$€£]\s?0[.,]00\b|\b0[.,]00\s?[$€£]/.test(rowText) && !/[$€£]\s?[1-9]|[1-9][\d.,]*\s?[$€£]/.test(rowText);
    a.setAttribute("data-caplus", String(i));
    out.push({ idx: String(i), href: href.startsWith("http") ? href : null, date: dateOf(rowText), rowText, zero });
  });
  return out;
}

// Runs inside the supplier page: downloads a URL with the page's own session.
async function grab(href) {
  const r = await fetch(href, { credentials: "include" });
  const type = (r.headers.get("content-type") || "").split(";")[0];
  if (!/pdf|png|jpe?g|octet/.test(type)) return { html: true };
  const buf = new Uint8Array(await r.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { mime: /png/.test(type) ? "image/png" : /jpe?g/.test(type) ? "image/jpeg" : "application/pdf", base64: btoa(s) };
}

function clickIt(idx) { document.querySelector(`[data-caplus="${idx}"]`)?.click(); }

// Buttons without a link: click it, catch the download Chrome starts, keep its URL, cancel the save.
async function clickAndCatch(tabId, idx) {
  let url = null;
  const onCreated = (item) => { url = item.finalUrl || item.url; chrome.downloads.cancel(item.id).catch(() => {}); chrome.downloads.erase({ id: item.id }).catch(() => {}); };
  const before = new Set((await chrome.tabs.query({})).map((t) => t.id));
  chrome.downloads.onCreated.addListener(onCreated);
  await chrome.scripting.executeScript({ target: { tabId }, func: clickIt, args: [idx] });
  let popup = null;
  for (let i = 0; i < 20 && !url; i++) {
    await wait(500);
    const tabs = await chrome.tabs.query({});
    popup = tabs.find((t) => !before.has(t.id)) || null;
    if (popup && popup.url && /^https?:/.test(popup.url)) { url = url || popup.url; break; }
  }
  chrome.downloads.onCreated.removeListener(onCreated);
  return { url, popupId: popup?.id ?? null };
}

async function run(onlyUrl) {
  const { base, token, sent = {} } = await chrome.storage.local.get(["base", "token", "sent"]);
  if (!base || !token) throw new Error("Robot pas encore relié : clique « Lancer le robot » dans CA+.");
  const H = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const res = await fetch(base + "/api/public/collector", { headers: H });
  if (!res.ok) throw new Error("Code robot refusé.");
  let { sources } = await res.json();
  if (onlyUrl) sources = sources.filter((s) => s.url === onlyUrl);
  if (!sources.length) return "Aucune source robot pour cette page.";
  const now = new Date();
  const months = [0, 1, 2].map((k) => new Date(now.getFullYear(), now.getMonth() - k, 15).toISOString().slice(0, 7));
  const log = [];
  // Small window on the side, not focused: the user keeps working.
  const win = await chrome.windows.create({ url: "about:blank", focused: false, width: 520, height: 760, left: 0, top: 0 });
  const tabId = win.tabs[0].id;
  try {
    for (const src of sources) {
      try {
        await chrome.tabs.update(tabId, { url: src.url });
        await loaded(tabId);
        let items = [];
        for (let i = 0; i < 10; i++) { // pages that load their list late
          await wait(1500);
          [{ result: items }] = await chrome.scripting.executeScript({ target: { tabId }, func: scan });
          if ((items || []).length) break;
        }
        const t = await chrome.tabs.get(tabId);
        if (/login|signin|sign-in|connexion|auth/i.test(t.url || "")) { log.push(`🔑 ${src.supplier} : connecte-toi au site puis relance`); continue; }
        if (!items?.length) { log.push(`🔍 ${src.supplier} : aucune facture vue sur la page`); continue; }
        let todo = items.filter((x) => !x.zero && (!x.date || months.includes(x.date.slice(0, 7))));
        if (!todo.length) todo = [...items].filter((x) => !x.zero).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 1);
        todo = todo.filter((x) => !sent[x.href || src.url + "#" + x.rowText]);
        if (!todo.length) { log.push(`• ${src.supplier} : déjà envoyé (${items.length} vues)`); continue; }
        for (const it of todo.slice(0, 5)) {
          let href = it.href, popupId = null;
          if (!href) ({ url: href, popupId } = await clickAndCatch(tabId, it.idx));
          if (!href) { log.push(`⚠️ ${src.supplier} ${it.date || ""} : bouton sans fichier`); continue; }
          let [{ result: file }] = await chrome.scripting.executeScript({ target: { tabId }, func: grab, args: [href] });
          if (file?.html) {
            const pid = popupId ?? (await chrome.tabs.create({ windowId: win.id, url: href, active: true })).id;
            await chrome.tabs.update(pid, { active: true }); await loaded(pid); await wait(2500);
            const shot = await chrome.tabs.captureVisibleTab(win.id, { format: "png" });
            file = { mime: "image/png", base64: shot.split(",")[1] };
          }
          if (popupId) chrome.tabs.remove(popupId).catch(() => {});
          const ext = file.mime === "application/pdf" ? "pdf" : file.mime === "image/png" ? "png" : "jpg";
          const r = await fetch(base + "/api/public/collector", { method: "POST", headers: H, body: JSON.stringify({
            sourceId: src.id, fileName: `${src.supplier}-${it.date || "facture"}.${ext}`, mime: file.mime, base64: file.base64, invoiceDate: it.date, label: it.rowText,
          }) });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j.attached) sent[it.href || src.url + "#" + it.rowText] = Date.now();
          log.push(`${j.envoye ? "✅" : j.attached ? "📥" : "⚠️"} ${src.supplier} ${it.date || ""} : ${j.message || j.error || ""}`);
        }
      } catch (e) { log.push(`❌ ${src.supplier} : ${e.message}`); }
    }
  } finally { chrome.windows.remove(win.id).catch(() => {}); }
  const text = log.join("\n");
  await chrome.storage.local.set({ sent, lastMonth: now.toISOString().slice(0, 7), lastLog: text });
  return text;
}
