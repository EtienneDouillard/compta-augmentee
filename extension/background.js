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
  if (msg.type === "teach") { teach(msg.url).then((log) => reply({ log })).catch((e) => reply({ log: "❌ " + e.message })); return true; }
  if (msg.type === "run") { run(msg.url || null).then((log) => reply({ log })).catch((e) => reply({ log: "❌ " + e.message })); return true; }
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function loaded(tabId) {
  for (let i = 0; i < 40; i++) { const t = await chrome.tabs.get(tabId); if (t.status === "complete") return; await wait(500); }
}

// Runs inside the supplier page: invoice links/buttons with their row text and date.
function scan(learned) {
  document.querySelectorAll("[data-caplus]").forEach((e) => e.removeAttribute("data-caplus"));
  const RX = /invoice|facture|receipt|reçu|recu|statement|relevé|download|télécharger|pdf/i;
  const L = learned ? learned.toLowerCase() : null;
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
  // Real links/buttons, plus short clickable texts (SPA tables often use <span onClick>).
  const els = [...document.querySelectorAll("a, button, [role=button], [role=link], span, div, td")].filter((e) => {
    if (/^(A|BUTTON)$/.test(e.tagName) || e.getAttribute("role")) return true;
    const t = (e.textContent || "").trim();
    return t.length > 0 && t.length < 40 && e.children.length <= 1 && (getComputedStyle(e).cursor === "pointer" || e.onclick);
  }).filter((e, _i, all) => !all.some((o) => o !== e && o.contains(e) && /^(A|BUTTON)$/.test(o.tagName)));
  const seen = new Set();
  els.forEach((a, i) => {
    const text = ((a.textContent || "") + " " + (a.getAttribute("aria-label") || "") + " " + (a.getAttribute("title") || "")).trim();
    const href = a.href || "";
    const own = text.toLowerCase().trim();
    if (L ? own !== L && !own.startsWith(L) : (!RX.test(text) && !/\.pdf|invoice|facture/i.test(href))) return;
    if (a.parentElement?.closest("[data-caplus]")) return;
    if (/summary|résumé|history|historique|settings|help|aide/i.test(text) && !/invoice|facture/i.test(text)) return;
    let row = a.closest("tr, li, [role=row]");
    if (!row) { row = a.parentElement; for (let k = 0; k < 6 && row && !/20\d\d|[$€£]\s?\d/.test(row.innerText || ""); k++) row = row.parentElement; }
    const rowText = (row?.innerText || "").replace(/\s+/g, " ").slice(0, 300);
    if (seen.has(rowText + "|" + own)) return; seen.add(rowText + "|" + own);
    const zero = /[$€£]\s?0[.,]00\b|\b0[.,]00\s?[$€£]/.test(rowText) && !/[$€£]\s?[1-9]|[1-9][\d.,]*\s?[$€£]/.test(rowText);
    a.setAttribute("data-caplus", String(i));
    out.push({ idx: String(i), href: href.startsWith("http") ? href : null, date: dateOf(rowText), rowText, zero });
  });
  return out;
}

// Runs inside the supplier page: scrolls one screen (window + scrollable lists), or clicks "next/load more" at the bottom.
function scrollStep() {
  let moved = false;
  const boxes = [document.scrollingElement, ...[...document.querySelectorAll("*")].filter((e) => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY))];
  for (const b of boxes) { if (!b) continue; const before = b.scrollTop; b.scrollTop = before + Math.max(400, b.clientHeight * 0.8); if (b.scrollTop !== before) moved = true; }
  if (moved) return "moved";
  const next = [...document.querySelectorAll("button, a, [role=button]")].find((e) => /load more|show more|voir plus|afficher plus|next|suivant|›|»/i.test((e.textContent || e.getAttribute("aria-label") || "").trim()) && !e.disabled && e.getAttribute("aria-disabled") !== "true");
  if (next) { next.click(); return "next"; }
  return "end";
}

// Runs inside the supplier page: downloads a URL with the page's own session.
async function grab(href) {
  let r;
  try { r = await fetch(href, { credentials: "include" }); } catch (e) { return { html: true, error: String(e.message || e) }; }
  const type = (r.headers.get("content-type") || "").split(";")[0];
  if (!r.ok || /json/.test(type)) return { html: true, error: `${r.status} ${(await r.text().catch(() => "")).slice(0, 120)}` };
  if (!/pdf|png|jpe?g|octet/.test(type)) return { html: true };
  const buf = new Uint8Array(await r.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { mime: /png/.test(type) ? "image/png" : /jpe?g/.test(type) ? "image/jpeg" : "application/pdf", base64: btoa(s) };
}

function clickIt(idx) { document.querySelector(`[data-caplus="${idx}"]`)?.click(); }

// Runs in the page's own JS world: background-tab clicks may not open popups, so window.open
// (and the "open blank then set location" trick) is caught and its URL kept for the robot.
function patchOpen() {
  if (window.__caplusPatched) return; window.__caplusPatched = true;
  const cap = (u) => { try { document.documentElement.dataset.caplusOpen = new URL(String(u), location.href).href; } catch {} };
  window.open = (u) => {
    if (u && String(u) !== "about:blank") cap(u);
    const loc = { assign: cap, replace: cap, set href(v) { cap(v); } };
    return { get location() { return loc; }, set location(v) { cap(v); }, close() {}, focus() {}, blur() {}, document: { write() {}, close() {} }, closed: false };
  };
}
function readOpen() { const u = document.documentElement.dataset.caplusOpen || null; delete document.documentElement.dataset.caplusOpen; return u; }

// Buttons without a link: click it, catch the download Chrome starts, keep its URL, cancel the save.
async function clickAndCatch(tabId, idx) {
  let url = null;
  const onCreated = (item) => { url = item.finalUrl || item.url; chrome.downloads.cancel(item.id).catch(() => {}); chrome.downloads.erase({ id: item.id }).catch(() => {}); };
  const before = new Set((await chrome.tabs.query({})).map((t) => t.id));
  chrome.downloads.onCreated.addListener(onCreated);
  await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: patchOpen }).catch(() => {});
  await chrome.scripting.executeScript({ target: { tabId }, func: clickIt, args: [idx] });
  let popup = null;
  for (let i = 0; i < 20 && !url; i++) {
    await wait(500);
    const tabs = await chrome.tabs.query({});
    popup = tabs.find((t) => !before.has(t.id)) || null;
    const pu = popup && (popup.url || popup.pendingUrl);
    if (pu && /^https?:/.test(pu)) { url = url || pu; break; }
    const [{ result: caught }] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: readOpen }).catch(() => [{}]);
    if (caught) { url = caught; break; }
  }
  chrome.downloads.onCreated.removeListener(onCreated);
  return { url, popupId: popup?.id ?? null };
}

async function run(onlyUrl) {
  const { base, token, sent = {}, learned = {} } = await chrome.storage.local.get(["base", "token", "sent", "learned"]);
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
  // Background tab in the user's window: never focused, the user keeps working.
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  const tabId = tab.id;
  await chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});
  try {
    for (const src of sources) {
      try {
        await chrome.tabs.update(tabId, { url: src.url });
        await loaded(tabId);
        let items = [];
        // Look through the whole page: scan, scroll down step by step (page and inner lists),
        // click "load more / next" at the bottom, until the missing invoice shows up.
        const num = (s) => s.replace(/[\s,]/g, "");
        const wantedAmts = (src.wanted || []).flatMap((w) => w.amounts.map(num));
        await wait(2000);
        for (let i = 0; i < 30; i++) {
          [{ result: items }] = await chrome.scripting.executeScript({ target: { tabId }, func: scan, args: [learned[src.url] || null] });
          items = items || [];
          if (items.length && (!wantedAmts.length || items.some((x) => wantedAmts.some((a) => num(x.rowText).includes(a))))) break;
          const [{ result: moved }] = await chrome.scripting.executeScript({ target: { tabId }, func: scrollStep });
          if (moved === "end" && i > 3) break;
          await wait(1200);
        }
        const t = await chrome.tabs.get(tabId);
        if (/login|signin|sign-in|connexion|auth/i.test(t.url || "")) { log.push(`🔑 ${src.supplier} : connecte-toi au site puis relance`); continue; }
        if (!items?.length) { log.push(`🎓 ${src.supplier} : aucun lien facture vu. Clique « Montrer au robot »`); continue; }
        let todo;
        const wanted = src.wanted || [];
        if (wanted.length) {
          // The payments still missing an invoice: same amount in the row (USD or EUR), else a date within 40 days.
          const num = (s) => s.replace(/[\s,]/g, "");
          const hit = (x, w) => w.amounts.some((a) => num(x.rowText).includes(num(a)));
          const near = (x, w) => x.date && Math.abs(new Date(x.date) - new Date(w.date)) < 40 * 864e5;
          todo = items.filter((x) => !x.zero && wanted.some((w) => hit(x, w)));
          if (!todo.length) todo = items.filter((x) => !x.zero && wanted.some((w) => near(x, w)));
          if (!todo.length) { log.push(`🔍 ${src.supplier} : ${items.length} factures vues, aucune à ${wanted.map((w) => w.amounts[0]).join(", ")}`); continue; }
        } else {
          todo = items.filter((x) => !x.zero && (!x.date || months.includes(x.date.slice(0, 7))));
          if (!todo.length) todo = [...items].filter((x) => !x.zero).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 1);
        }
        todo = todo.filter((x) => !sent[x.href || src.url + "#" + x.rowText]);
        if (!todo.length) { log.push(`• ${src.supplier} : déjà envoyé (${items.length} vues)`); continue; }
        for (const it of todo.slice(0, 3)) {
          let href = it.href, popupId = null;
          if (!href) ({ url: href, popupId } = await clickAndCatch(tabId, it.idx));
          if (!href) { log.push(`⚠️ ${src.supplier} ${it.date || ""} : bouton sans fichier`); continue; }
          let [{ result: file }] = await chrome.scripting.executeScript({ target: { tabId }, func: grab, args: [href] });
          if (file?.html) {
            // Invoice shown as a web page (e.g. Stripe): open it in the background and take its PDF link.
            const pid = popupId ?? (await chrome.tabs.create({ url: href, active: false })).id;
            if (popupId) await chrome.tabs.update(pid, { active: false }).catch(() => {});
            await loaded(pid); await wait(2500);
            let inner = [];
            for (let k = 0; k < 6 && !inner.some((x) => x.href); k++) { [{ result: inner }] = await chrome.scripting.executeScript({ target: { tabId: pid }, func: scan }); if (!inner.some((x) => x.href)) await wait(1000); }
            const pdf = inner.find((x) => x.href && /download|télécharger|pdf/i.test(x.rowText + x.href)) || inner.find((x) => x.href);
            file = pdf ? (await chrome.scripting.executeScript({ target: { tabId: pid }, func: grab, args: [pdf.href] }))[0].result : null;
            chrome.tabs.remove(pid).catch(() => {});
            popupId = null;
            if (!file || file.html) { log.push(`⚠️ ${src.supplier} ${it.date || ""} : facture en page web, pas de PDF trouvé`); continue; }
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
  } finally { chrome.tabs.remove(tabId).catch(() => {}); }
  const text = log.join("\n");
  await chrome.storage.local.set({ sent, lastMonth: now.toISOString().slice(0, 7), lastLog: text });
  return text;
}

// "Montrer au robot": the supplier page opens in front, the user clicks the invoice link once.
// The robot remembers that label for this page, follows the tab or download it opens,
// takes the PDF (clicking "download" on an invoice web page if needed) and sends it to CA+.
function listenClick() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("a, button, [role=button], [role=link]") || e.target;
    // A real link: the robot downloads it itself (one use: some invoice links are single-use).
    const href = el.tagName === "A" && /^https?:/.test(el.href) ? el.href : null;
    if (href) { e.preventDefault(); e.stopImmediatePropagation(); }
    const text = (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40);
    const row = el.closest("tr, li, [role=row]") || el.parentElement?.parentElement?.parentElement;
    if (text) chrome.runtime.sendMessage({ type: "learned", url: location.href.split("#")[0], text, href, rowText: (row?.innerText || "").replace(/\s+/g, " ").slice(0, 300) });
  }, { capture: true, once: true });
  const b = document.createElement("div");
  b.textContent = "🎓 CA+ : clique sur le lien de la facture";
  b.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1e3d36;color:#fff;padding:10px 16px;border-radius:10px;font:600 15px sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3)";
  document.body.appendChild(b);
}

// A file from any tab: the tab's own URL if it is the PDF, else a PDF link or "download" button inside it.
async function fileFromTab(tabId) {
  await loaded(tabId); await wait(1500);
  const t = await chrome.tabs.get(tabId);
  let [{ result: f }] = await chrome.scripting.executeScript({ target: { tabId }, func: grab, args: [t.url] }).catch(() => [{ result: null }]);
  if (f && !f.html) return f;
  for (let k = 0; k < 6; k++) {
    const [{ result: inner }] = await chrome.scripting.executeScript({ target: { tabId }, func: scan, args: [null] });
    const dl = (inner || []).find((x) => /download|télécharger|pdf/i.test(x.rowText + (x.href || ""))) || (inner || [])[0];
    if (dl) {
      let href = dl.href;
      if (!href) ({ url: href } = await clickAndCatch(tabId, dl.idx));
      if (href) { [{ result: f }] = await chrome.scripting.executeScript({ target: { tabId }, func: grab, args: [href] }); if (f && !f.html) return f; }
    }
    await wait(1000);
  }
  return null;
}

async function teach(url) {
  const { base, token, learned: before0 = {} } = await chrome.storage.local.get(["base", "token", "learned"]);
  if (!base || !token) throw new Error("Robot pas encore relié : clique « Lancer le robot » dans CA+.");
  const H = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  const { sources = [] } = await (await fetch(base + "/api/public/collector", { headers: H })).json();
  const src = sources.find((s) => s.url === url);
  if (!src) return "Rien à chercher : aucune facture manquante pour cette source.";

  const tab = await chrome.tabs.create({ url, active: true });
  await loaded(tab.id); await wait(1500);
  let clicked = null, newTab = null, dlUrl = null;
  const onMsg = (m) => { if (m.type === "learned") clicked = m; };
  const onTab = (t) => { if (t.openerTabId === tab.id || !newTab) newTab = t.id; };
  const onDl = (item) => { dlUrl = item.finalUrl || item.url; };
  chrome.runtime.onMessage.addListener(onMsg);
  chrome.tabs.onCreated.addListener(onTab);
  chrome.downloads.onCreated.addListener(onDl);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: listenClick });
    const start = Date.now();
    while (!clicked && Date.now() - start < 180000) { await wait(500); if (!(await chrome.tabs.get(tab.id).catch(() => null))) break; }
    if (!clicked) return "🎓 Rien appris (pas de clic).";
    const learned = { ...before0, [url]: clicked.text };
    await chrome.storage.local.set({ learned });
    for (let i = 0; i < 16 && !newTab && !dlUrl; i++) await wait(500); // the tab or download the click opens

    let file = null;
    if (clicked.href) {
      [{ result: file }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: grab, args: [clicked.href] });
      if (!file || file.html) {
        // Link refused (expired/used token): reload the page for fresh links and take the same row's one.
        await chrome.tabs.reload(tab.id); await loaded(tab.id); await wait(2500);
        for (let k = 0; k < 8 && (!file || file.html); k++) {
          const [{ result: items }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scan, args: [clicked.text] });
          const same = (items || []).find((x) => x.href && x.rowText === clicked.rowText) || (items || []).find((x) => x.href && clicked.rowText.includes((x.rowText.match(/20\d\d-\d\d-\d\d/) || ["§"])[0]));
          if (same) [{ result: file }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: grab, args: [same.href] });
          else { await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrollStep }); await wait(800); }
        }
      }
      if (!file || file.html) return `🎓 Appris : « ${clicked.text} », mais le site refuse le fichier${file?.error ? " (" + file.error.slice(0, 80) + ")" : ""}. Réessaie plus tard.`;
    }
    if (file && !file.html) { /* déjà récupéré */ }
    else if (newTab) file = await fileFromTab(newTab);
    else if (dlUrl) [{ result: file }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: grab, args: [dlUrl] });
    else file = await fileFromTab(tab.id); // same tab navigated to the invoice
    if (!file || file.html) return `🎓 Appris : « ${clicked.text} », mais pas de PDF trouvé derrière.`;

    const date = (clicked.rowText.match(/20\d\d-\d\d-\d\d/) || [null])[0];
    const ext = file.mime === "application/pdf" ? "pdf" : file.mime === "image/png" ? "png" : "jpg";
    const r = await fetch(base + "/api/public/collector", { method: "POST", headers: H, body: JSON.stringify({
      sourceId: src.id, fileName: `${src.supplier}-${date || "facture"}.${ext}`, mime: file.mime, base64: file.base64, invoiceDate: date, label: clicked.rowText,
    }) });
    const j = await r.json().catch(() => ({}));
    return `🎓 Appris : « ${clicked.text} »\n${j.envoye ? "✅" : j.attached ? "📥" : "⚠️"} ${src.supplier} ${date || ""} : ${j.message || j.error || ""}`;
  } finally {
    chrome.runtime.onMessage.removeListener(onMsg);
    chrome.tabs.onCreated.removeListener(onTab);
    chrome.downloads.onCreated.removeListener(onDl);
    if (newTab) chrome.tabs.remove(newTab).catch(() => {});
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}
