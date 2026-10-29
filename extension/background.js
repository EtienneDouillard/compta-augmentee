// CA+ Robot: opens each supplier billing page in YOUR Chrome (your own session, nothing leaves the browser
// except the invoice file), in a background tab, finds the missing invoices, sends them to CA+.
// Every page script runs in ALL frames: many billing pages (RapidAPI, Stripe portals…) show their table in an iframe.
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create("caplus", { periodInMinutes: 720 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create("caplus", { periodInMinutes: 720 }));
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === "caplus-teach-timeout") return teachEnd("🎓 Rien appris : pas de clic sur une facture (5 min).");
  const { lastMonth } = await chrome.storage.local.get("lastMonth");
  const m = new Date().toISOString().slice(0, 7);
  if (lastMonth !== m) run().catch(() => {});
});
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === "teach") { teachStart(msg.url, sender.tab?.id).then(() => reply({ started: true })).catch((e) => reply({ log: "❌ " + e.message })); return true; }
  if (msg.type === "run") { run(msg.url || null).then((log) => reply({ log })).catch((e) => reply({ log: "❌ " + e.message })); return true; }
  if (msg.type === "learned") { onLearned(msg, sender).catch((e) => teachEnd("❌ " + e.message)); return false; }
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function loaded(tabId) {
  for (let i = 0; i < 40; i++) { const t = await chrome.tabs.get(tabId).catch(() => null); if (!t || t.status === "complete") return; await wait(500); }
}

// ---------- Frame helpers ----------
async function inFrames(tabId, func, args = [], world) {
  return chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func, args, ...(world ? { world } : {}) }).catch(() => []);
}
async function inFrame(tabId, frameId, func, args = [], world) {
  const r = await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId || 0] }, func, args, ...(world ? { world } : {}) }).catch(() => null);
  return r?.[0]?.result ?? null;
}
async function scanAll(tabId, learned) {
  const res = await inFrames(tabId, scan, [learned || null]);
  return res.flatMap((r) => (r.result || []).map((x) => ({ ...x, frameId: r.frameId })));
}
async function scrollAll(tabId) {
  const res = await inFrames(tabId, scrollStep);
  return res.some((r) => r.result === "moved") ? "moved" : res.some((r) => r.result === "next") ? "next" : "end";
}

// ---------- Page-side functions (injected) ----------
// Invoice links/buttons with their row text and date.
function scan(learned) {
  document.querySelectorAll("[data-caplus]").forEach((e) => e.removeAttribute("data-caplus"));
  const RX = /invoice|facture|receipt|reçu|recu|statement|relevé|download|télécharger|pdf/i;
  const L = learned ? learned.toLowerCase() : null;
  const MONTHS = { jan: 1, feb: 2, fév: 2, fev: 2, mar: 3, apr: 4, avr: 4, may: 5, mai: 5, jun: 6, juin: 6, jul: 7, juil: 7, aug: 8, aoû: 8, aou: 8, sep: 9, oct: 10, nov: 11, dec: 12, déc: 12 };
  const pad = (n) => String(n).padStart(2, "0");
  const mo = (s) => MONTHS[s.slice(0, 4).toLowerCase()] || MONTHS[s.slice(0, 3).toLowerCase()];
  function dateOf(t) {
    let d = t.match(/(20\d\d)-(\d\d)-(\d\d)/); if (d) return `${d[1]}-${d[2]}-${d[3]}`;
    d = t.match(/(\d\d?)[/.](\d\d?)[/.](20\d\d)/); if (d) return `${d[3]}-${pad(d[2])}-${pad(d[1])}`;
    d = t.match(/([A-Za-zéû]{3,9})\.?\s+(\d\d?),?\s+(20\d\d)/); if (d && mo(d[1])) return `${d[3]}-${pad(mo(d[1]))}-${pad(d[2])}`;
    d = t.match(/(\d\d?)\s+([A-Za-zéû]{3,9})\.?\s+(20\d\d)/); if (d && mo(d[2])) return `${d[3]}-${pad(mo(d[2]))}-${pad(d[1])}`;
    d = t.match(/([A-Za-zéû]{3,9})\s+(20\d\d)/); if (d && mo(d[1])) return `${d[2]}-${pad(mo(d[1]))}-01`;
    return null;
  }
  const out = [];
  // Real links/buttons, plus short clickable texts (SPA tables often use <span onClick>).
  const els = [...document.querySelectorAll("a, button, [role=button], [role=link], span, div, td, p")].filter((e) => {
    if (/^(A|BUTTON)$/.test(e.tagName) || e.getAttribute("role")) return true;
    const t = (e.textContent || "").trim();
    return t.length > 0 && t.length < 40 && e.children.length <= 1 && (getComputedStyle(e).cursor === "pointer" || e.onclick);
  }).filter((e, _i, all) => !all.some((o) => o !== e && o.contains(e) && /^(A|BUTTON)$/.test(o.tagName)));
  const seen = new Set();
  els.forEach((a, i) => {
    const text = ((a.textContent || "") + " " + (a.getAttribute("aria-label") || "") + " " + (a.getAttribute("title") || "")).trim();
    const href = a.href || "";
    const own = (a.textContent || a.getAttribute("aria-label") || "").toLowerCase().trim();
    if (L ? own !== L && !own.startsWith(L) : (!RX.test(text) && !/\.pdf|invoice|facture/i.test(href))) return;
    if (a.parentElement?.closest("[data-caplus]")) return;
    if (/summary|résumé|history|historique|settings|help|aide/i.test(text) && !/invoice|facture/i.test(text)) return;
    let row = a.closest("tr, li, [role=row]");
    if (!row) { row = a.parentElement; for (let k = 0; k < 6 && row && !/20\d\d|[$€£]\s?\d/.test(row.innerText || ""); k++) row = row.parentElement; }
    const rowText = (row?.innerText || "").replace(/\s+/g, " ").slice(0, 300);
    if (seen.has(rowText + "|" + own)) return; seen.add(rowText + "|" + own);
    const zero = /[$€£]\s?0[.,]00\b|\b0[.,]00\s?[$€£]/.test(rowText) && !/[$€£]\s?[1-9]|[1-9][\d.,]*\s?[$€£]/.test(rowText);
    a.setAttribute("data-caplus", String(i));
    out.push({ idx: String(i), href: /^https?:/.test(href) ? href : null, date: dateOf(rowText), rowText, zero });
  });
  return out;
}

// Scrolls one screen (window + scrollable lists), or clicks "next/load more" at the bottom.
function scrollStep() {
  let moved = false;
  const boxes = [document.scrollingElement, ...[...document.querySelectorAll("*")].filter((e) => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY))];
  for (const b of boxes) { if (!b) continue; const before = b.scrollTop; b.scrollTop = before + Math.max(400, b.clientHeight * 0.8); if (b.scrollTop !== before) moved = true; }
  if (moved) return "moved";
  const next = [...document.querySelectorAll("button, a, [role=button]")].find((e) => /load more|show more|voir plus|afficher plus|next|suivant|›|»/i.test((e.textContent || e.getAttribute("aria-label") || "").trim()) && !e.disabled && e.getAttribute("aria-disabled") !== "true");
  if (next) { next.click(); return "next"; }
  return "end";
}

// Downloads a URL with the frame's own session. Errors (403, JSON message) are reported, not hidden.
async function grab(href) {
  let r;
  try { r = await fetch(href, { credentials: "include" }); } catch (e) { return { html: true, error: String(e.message || e) }; }
  const type = (r.headers.get("content-type") || "").split(";")[0];
  if (!r.ok || /json/.test(type)) return { html: true, error: `${r.status} ${(await r.text().catch(() => "")).slice(0, 160)}` };
  const buf = new Uint8Array(await r.arrayBuffer());
  const isPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
  if (!isPdf && !/pdf|png|jpe?g/.test(type)) return { html: true };
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { mime: isPdf ? "application/pdf" : /png/.test(type) ? "image/png" : "image/jpeg", base64: btoa(s) };
}

function clickIt(idx) { document.querySelector(`[data-caplus="${idx}"]`)?.click(); }

// Page JS world: background-tab clicks may not open popups, so window.open is caught and its URL kept.
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

// Buttons without a link: click it in its frame, catch the tab/download/window.open it starts.
async function clickAndCatch(tabId, frameId, idx) {
  let url = null;
  const onCreated = (item) => { url = item.finalUrl || item.url; chrome.downloads.cancel(item.id).catch(() => {}); chrome.downloads.erase({ id: item.id }).catch(() => {}); };
  const before = new Set((await chrome.tabs.query({})).map((t) => t.id));
  chrome.downloads.onCreated.addListener(onCreated);
  await inFrame(tabId, frameId, patchOpen, [], "MAIN");
  await inFrame(tabId, frameId, clickIt, [idx]);
  let popup = null;
  for (let i = 0; i < 20 && !url; i++) {
    await wait(500);
    const tabs = await chrome.tabs.query({});
    popup = tabs.find((t) => !before.has(t.id)) || null;
    const pu = popup && (popup.url || popup.pendingUrl);
    if (pu && /^https?:/.test(pu)) { url = url || pu; break; }
    const caught = await inFrame(tabId, frameId, readOpen, [], "MAIN");
    if (caught) { url = caught; break; }
  }
  chrome.downloads.onCreated.removeListener(onCreated);
  return { url, popupId: popup?.id ?? null };
}

// A file from any tab: the tab's own URL if it is the PDF, else a PDF link or "download" button in any frame.
async function fileFromTab(tabId) {
  await loaded(tabId); await wait(1500);
  const t = await chrome.tabs.get(tabId).catch(() => null);
  if (!t) return null;
  let f = /^https?:/.test(t.url || "") ? await inFrame(tabId, 0, grab, [t.url]) : null;
  if (f && !f.html) return f;
  let last = f;
  for (let k = 0; k < 6; k++) {
    const inner = await scanAll(tabId, null);
    const dl = inner.find((x) => /download|télécharger|pdf/i.test(x.rowText + (x.href || ""))) || inner[0];
    if (dl) {
      let href = dl.href;
      if (!href) ({ url: href } = await clickAndCatch(tabId, dl.frameId, dl.idx));
      if (href) { f = await inFrame(tabId, dl.frameId, grab, [href]); if (f && !f.html) return f; last = f; }
    }
    await wait(1000);
  }
  return last && last.error ? last : null;
}

// ---------- Plan B when the site refuses its own PDF (e.g. RapidAPI: S3 "explicit deny" even by hand) ----------
// 1) other document links of the same row (summary, receipt, details) ; 2) the page is printed to PDF by Chrome
// itself (chrome.debugger Page.printToPDF works on a background tab). The result is the supplier's own page.
function rowLinks(rowText, skip) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const key = norm(rowText).slice(0, 60);
  const rows = [...document.querySelectorAll("tr, li, [role=row], div")].filter((r) => norm(r.innerText).startsWith(key) && norm(r.innerText).length < 400);
  const row = rows.sort((a, b) => norm(a.innerText).length - norm(b.innerText).length)[0];
  if (!row) return [];
  const RX = /summary|résumé|receipt|reçu|recu|détail|detail|view|voir|statement|relevé|print|imprimer/i;
  return [...row.querySelectorAll("a, button, [role=button], [role=link], span")].filter((e) => {
    const t = norm(e.textContent || e.getAttribute("aria-label"));
    return t && t.length < 40 && t.toLowerCase() !== (skip || "").toLowerCase() && RX.test(t);
  }).slice(0, 3).map((e, i) => { e.setAttribute("data-caplus", "alt" + i); return { idx: "alt" + i, text: norm(e.textContent), href: /^https?:/.test(e.href || "") ? e.href : null }; });
}
function pageIsError() {
  const t = (document.body?.innerText || "").trim();
  return t.length < 600 && /not authorized|access ?denied|forbidden|explicit deny|404|not found|error/i.test(t);
}
async function printTab(tabId) {
  const target = { tabId };
  try {
    await chrome.debugger.attach(target, "1.3");
    const { data } = await chrome.debugger.sendCommand(target, "Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
    return data ? { mime: "application/pdf", base64: data, printed: true } : null;
  } catch { return null; } finally { chrome.debugger.detach(target).catch(() => {}); }
}
async function planB(tabId, frameId, rowText, skipText) {
  const alts = (await inFrame(tabId, frameId, rowLinks, [rowText, skipText])) || [];
  for (const a of alts) {
    let href = a.href, popupId = null;
    if (!href) ({ url: href, popupId } = await clickAndCatch(tabId, frameId, a.idx));
    if (!href) continue;
    const f = await inFrame(tabId, frameId, grab, [href]);
    if (f && !f.html) { if (popupId) chrome.tabs.remove(popupId).catch(() => {}); return { ...f, via: a.text }; }
    const pid = popupId ?? (await chrome.tabs.create({ url: href, active: false })).id;
    await loaded(pid); await wait(2500);
    const bad = await inFrame(pid, 0, pageIsError);
    const p = bad ? null : await printTab(pid);
    chrome.tabs.remove(pid).catch(() => {});
    if (p) return { ...p, via: a.text };
  }
  // Last resort: the supplier's own billing page, printed with only this row visible (date, amount, paid).
  if (await inFrame(tabId, frameId, isolateRow, [rowText, true])) {
    const p = await printTab(tabId);
    await inFrame(tabId, frameId, isolateRow, [rowText, false]);
    if (p) return { ...p, via: "page de facturation" };
  }
  return null;
}
function isolateRow(rowText, on) {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  if (!on) { document.querySelectorAll("[data-caplus-hid]").forEach((e) => { e.style.display = ""; e.removeAttribute("data-caplus-hid"); }); return true; }
  const key = norm(rowText).slice(0, 60);
  const row = [...document.querySelectorAll("tr, li, [role=row]")].find((r) => norm(r.innerText).startsWith(key));
  if (!row) return false;
  [...row.parentElement.children].forEach((e) => { if (e !== row && !e.querySelector("th")) { e.setAttribute("data-caplus-hid", "1"); e.style.display = "none"; } });
  return true;
}

async function api() {
  const { base, token } = await chrome.storage.local.get(["base", "token"]);
  if (!base || !token) throw new Error("Robot pas encore relié : clique « Lancer le robot » dans CA+.");
  return { base, H: { Authorization: "Bearer " + token, "Content-Type": "application/json" } };
}
async function post(src, file, date, label) {
  const { base, H } = await api();
  const ext = file.mime === "application/pdf" ? "pdf" : file.mime === "image/png" ? "png" : "jpg";
  const r = await fetch(base + "/api/public/collector", { method: "POST", headers: H, body: JSON.stringify({
    sourceId: src.id, fileName: `${src.supplier}-${date || "facture"}.${ext}`, mime: file.mime, base64: file.base64, invoiceDate: date, label,
  }) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, ...j };
}
const siteError = (e) => /not authorized|accessdenied|explicit deny|403/i.test(e || "")
  ? "le site bloque son propre PDF (erreur chez lui, même à la main) et aucun récapitulatif trouvé sur la ligne. Dépose-la à la main."
  : `pas de PDF trouvé${e ? " (" + e.slice(0, 80) + ")" : ""}.`;

// ---------- "Lancer le robot" ----------
async function run(onlyUrl) {
  const { sent = {}, learned = {} } = await chrome.storage.local.get(["sent", "learned"]);
  const { base, H } = await api();
  const res = await fetch(base + "/api/public/collector", { headers: H });
  if (!res.ok) throw new Error("Code robot refusé.");
  let { sources } = await res.json();
  if (onlyUrl) sources = sources.filter((s) => s.url === onlyUrl);
  if (!sources.length) return "Aucune facture manquante pour cette source.";
  const now = new Date();
  const months = [0, 1, 2].map((k) => new Date(now.getFullYear(), now.getMonth() - k, 15).toISOString().slice(0, 7));
  const log = [];
  // Background tab in the user's window: never focused, the user keeps working.
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  const tabId = tab.id;
  await chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});
  const num = (s) => String(s).replace(/[\s,]/g, "");
  try {
    for (const src of sources) {
      try {
        await chrome.tabs.update(tabId, { url: src.url });
        await loaded(tabId);
        const wantedAmts = (src.wanted || []).flatMap((w) => w.amounts.map(num));
        await wait(2500);
        let items = [];
        // Scan every frame, scroll step by step (page and inner lists), "load more", until the missing invoice shows up.
        for (let i = 0; i < 30; i++) {
          items = await scanAll(tabId, learned[src.url]);
          if (!items.length && learned[src.url] && i > 4) items = await scanAll(tabId, null);
          if (items.length && (!wantedAmts.length || items.some((x) => wantedAmts.some((a) => num(x.rowText).includes(a))))) break;
          const moved = await scrollAll(tabId);
          if (moved === "end" && i > 5) break;
          await wait(1200);
        }
        const t = await chrome.tabs.get(tabId);
        const pwd = await inFrame(tabId, 0, () => !!document.querySelector("input[type=password]"));
        if (/login|signin|sign-in|connexion|auth|sso|2fa|mfa|verify/i.test(t.url || "") || (pwd && !items.length)) { await askLogin(src); log.push(`🔑 ${src.supplier} : connecte-toi (notification envoyée), le robot reprend tout seul`); continue; }
        if (!items.length) { log.push(`🎓 ${src.supplier} : aucun lien facture vu. Clique « Montrer au robot »`); continue; }
        let todo;
        const wanted = src.wanted || [];
        if (wanted.length) {
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
          if (!href) ({ url: href, popupId } = await clickAndCatch(tabId, it.frameId, it.idx));
          if (!href) { log.push(`⚠️ ${src.supplier} ${it.date || ""} : bouton sans fichier`); continue; }
          let file = await inFrame(tabId, it.frameId, grab, [href]);
          if (!file || file.html) {
            // Invoice shown as a web page (e.g. Stripe): open it in the background and take its PDF.
            const pid = popupId ?? (await chrome.tabs.create({ url: href, active: false })).id;
            const f2 = await fileFromTab(pid);
            chrome.tabs.remove(pid).catch(() => {});
            popupId = null;
            if (f2 && !f2.html) file = f2;
            else {
              const b = await planB(tabId, it.frameId, it.rowText, learned[src.url] || "invoice");
              if (b) { file = b; log.push(`🛟 ${src.supplier} : PDF refusé par le site, pris « ${b.via} » à la place`); }
              else { log.push(`⚠️ ${src.supplier} ${it.date || ""} : ${siteError(f2?.error || file?.error)}`); continue; }
            }
          }
          if (popupId) chrome.tabs.remove(popupId).catch(() => {});
          const j = await post(src, file, it.date, it.rowText);
          if (j.ok && j.attached) sent[it.href || src.url + "#" + it.rowText] = Date.now();
          log.push(`${j.envoye ? "✅" : j.attached ? "📥" : "⚠️"} ${src.supplier} ${it.date || ""} : ${j.message || j.error || ""}`);
        }
      } catch (e) { log.push(`❌ ${src.supplier} : ${e.message}`); }
    }
  } finally { chrome.tabs.remove(tabId).catch(() => {}); }
  const text = log.join("\n");
  await chrome.storage.local.set({ sent, lastMonth: now.toISOString().slice(0, 7), lastLog: text });
  return text;
}

// ---------- "Montrer au robot" ----------
// Event-driven (survives the MV3 worker sleeping): state in storage.session, click listener in EVERY frame
// (re-armed on each frame load), the click's tab/download caught by top-level listeners.
const S = chrome.storage.session;
const getT = async () => (await S.get("teach")).teach || null;
const setT = async (patch) => { const t = await getT(); if (t) await S.set({ teach: { ...t, ...patch } }); return t ? { ...t, ...patch } : null; };

function listenClick() {
  if (window.__caplusTeach) return; window.__caplusTeach = true;
  const handler = (e) => {
    if (window.__caplusDone) return;
    if (e.target.closest?.("#caplus-banner")) return;
    const el = e.target.closest("a, button, [role=button], [role=link]") || e.target;
    const text = (el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 40);
    if (!text) return;
    window.__caplusDone = true;
    const href = el.closest("a")?.href;
    let row = el.closest("tr, li, [role=row]");
    if (!row) { row = el.parentElement; for (let k = 0; k < 6 && row && !/20\d\d|[$€£]\s?\d/.test(row.innerText || ""); k++) row = row.parentElement; }
    chrome.runtime.sendMessage({ type: "learned", text, href: href && /^https?:/.test(href) ? href : null, rowText: (row?.innerText || "").replace(/\s+/g, " ").slice(0, 300) });
  };
  document.addEventListener("click", handler, true);
  document.addEventListener("auxclick", handler, true);
  if (window.top === window && !document.getElementById("caplus-banner")) {
    const b = document.createElement("div");
    b.id = "caplus-banner";
    b.textContent = "🎓 CA+ : clique sur le lien de la facture qui manque";
    b.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1e3d36;color:#fff;padding:10px 16px;border-radius:10px;font:600 15px sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);pointer-events:none";
    (document.body || document.documentElement).appendChild(b);
  }
}
function setBanner(text) { const b = document.getElementById("caplus-banner"); if (b) b.textContent = text; }

async function teachStart(url, appTabId) {
  const { base, H } = await api();
  const { sources = [] } = await (await fetch(base + "/api/public/collector", { headers: H })).json();
  const src = sources.find((s) => s.url === url);
  if (!src) throw new Error("Rien à chercher : aucune facture manquante pour cette source.");
  const old = await getT();
  if (old) chrome.tabs.remove(old.tabId).catch(() => {});
  const tab = await chrome.tabs.create({ url, active: true });
  await S.set({ teach: { tabId: tab.id, url, src: { id: src.id, supplier: src.supplier }, appTabId, startedAt: Date.now(), clicked: null, newTab: null, dlUrl: null } });
  chrome.alarms.create("caplus-teach-timeout", { delayInMinutes: 5 });
  await loaded(tab.id);
  await inFrames(tab.id, listenClick);
  // Frames that appear later (SPA, lazy iframes) are armed by webNavigation; a few extra passes as a safety net.
  for (let i = 0; i < 10; i++) { await wait(2000); const t = await getT(); if (!t || t.clicked) break; await inFrames(tab.id, listenClick); }
}

chrome.webNavigation.onCompleted.addListener(async (d) => {
  const t = await getT();
  if (t && d.tabId === t.tabId && !t.clicked) chrome.scripting.executeScript({ target: { tabId: d.tabId, frameIds: [d.frameId] }, func: listenClick }).catch(() => {});
});
chrome.tabs.onCreated.addListener(async (tab) => {
  const t = await getT();
  if (t && tab.openerTabId === t.tabId && !t.newTab) await setT({ newTab: tab.id });
});
chrome.downloads.onCreated.addListener(async (item) => {
  const t = await getT();
  if (t && !t.dlUrl && Date.now() - t.startedAt < 6 * 60e3) await setT({ dlUrl: item.finalUrl || item.url });
});
chrome.tabs.onRemoved.addListener(async (id) => {
  const t = await getT();
  if (t && id === t.tabId && !t.clicked) teachEnd("🎓 Onglet fermé avant le clic : rien appris.");
});

async function onLearned(m, sender) {
  const t0 = await getT();
  if (!t0 || sender.tab?.id !== t0.tabId || t0.clicked) return;
  const clicked = { text: m.text, href: m.href, rowText: m.rowText, frameId: sender.frameId || 0 };
  const t = await setT({ clicked });
  chrome.alarms.clear("caplus-teach-timeout");
  const { learned = {} } = await chrome.storage.local.get("learned");
  await chrome.storage.local.set({ learned: { ...learned, [t.url]: m.text } });
  await inFrame(t.tabId, 0, setBanner, [`✅ Appris : « ${m.text} ». Je récupère la facture…`]);

  // The tab or download the click opens (or the link itself).
  let cur = t;
  for (let i = 0; i < 16 && !cur.newTab && !cur.dlUrl && !clicked.href; i++) { await wait(500); cur = (await getT()) || cur; }
  await wait(800); cur = (await getT()) || cur;
  let newUrl = null;
  if (cur.newTab) { await wait(1000); const nt = await chrome.tabs.get(cur.newTab).catch(() => null); newUrl = nt?.url || nt?.pendingUrl || null; }

  let file = null, err = null;
  for (const u of [...new Set([clicked.href, cur.dlUrl, newUrl].filter((x) => x && /^https?:/.test(x)))]) {
    file = await inFrame(t.tabId, clicked.frameId, grab, [u]);
    if (file && !file.html) break;
    err = file?.error || err;
    // Cross-origin file: try from the top frame too.
    if (clicked.frameId) { file = await inFrame(t.tabId, 0, grab, [u]); if (file && !file.html) break; err = file?.error || err; }
  }
  if ((!file || file.html) && cur.newTab) { const f = await fileFromTab(cur.newTab); if (f && !f.html) file = f; else err = f?.error || err; }
  if (!file || file.html) {
    const tab = await chrome.tabs.get(t.tabId).catch(() => null);
    if (tab && tab.url !== t.url) { const f = await fileFromTab(t.tabId); if (f && !f.html) file = f; else err = f?.error || err; }
  }
  let via = null;
  if (!file || file.html) {
    await inFrame(t.tabId, 0, setBanner, ["🛟 PDF refusé par le site, je prends le récapitulatif…"]);
    // Back to the list (the click may have navigated away) then try the row's other documents.
    const tab = await chrome.tabs.get(t.tabId).catch(() => null);
    if (tab && tab.url !== t.url) { await chrome.tabs.update(t.tabId, { url: t.url }); await loaded(t.tabId); await wait(3000); }
    const res = await inFrames(t.tabId, rowLinks, [m.rowText, m.text]);
    const fr = res.find((r) => r.result?.length);
    const b = fr ? await planB(t.tabId, fr.frameId, m.rowText, m.text) : null;
    if (b) { file = b; via = b.via; }
  }
  if (!file || file.html) return teachEnd(`🎓 Appris : « ${m.text} ». Mais ${siteError(err)}`);

  const date = (m.rowText.match(/20\d\d-\d\d-\d\d/) || [null])[0];
  const j = await post(t.src, file, date, m.rowText);
  if (j.ok && j.attached) {
    const { sent = {} } = await chrome.storage.local.get("sent");
    await chrome.storage.local.set({ sent: { ...sent, [clicked.href || t.url + "#" + m.rowText]: Date.now() } });
  }
  return teachEnd(`🎓 Appris : « ${m.text} »${via ? `\n🛟 PDF refusé par le site : « ${via} » envoyé à la place` : ""}\n${j.envoye ? "✅" : j.attached ? "📥" : "⚠️"} ${t.src.supplier} ${date || ""} : ${j.message || j.error || ""}`);
}

async function teachEnd(log) {
  const t = await getT();
  await S.remove("teach");
  chrome.alarms.clear("caplus-teach-timeout");
  await chrome.storage.local.set({ lastLog: log });
  if (!t) return;
  if (t.appTabId) {
    chrome.tabs.sendMessage(t.appTabId, { type: "caplus-done", log }).catch(() => {});
    chrome.tabs.update(t.appTabId, { active: true }).catch(() => {});
  }
  if (t.newTab) chrome.tabs.remove(t.newTab).catch(() => {});
  setTimeout(() => chrome.tabs.remove(t.tabId).catch(() => {}), 1500);
}


// ---------- Login needed (password, 2FA…): notify, open the site, resume by itself once logged in ----------
async function askLogin(src) {
  const tab = await chrome.tabs.create({ url: src.url, active: false });
  const { waitLogin = {} } = await chrome.storage.local.get("waitLogin");
  waitLogin[tab.id] = { url: src.url, supplier: src.supplier, at: Date.now() };
  await chrome.storage.local.set({ waitLogin });
  chrome.notifications.create("login-" + tab.id, { type: "basic", iconUrl: "icon.png", title: `🔑 ${src.supplier} : connecte-toi`,
    message: "Clique ici, connecte-toi (double authentification comprise). Le robot récupère la facture tout seul ensuite.", requireInteraction: true, priority: 2 });
}
chrome.notifications.onClicked.addListener(async (id) => {
  if (!id.startsWith("login-")) return;
  const tabId = Number(id.slice(6));
  const t = await chrome.tabs.get(tabId).catch(() => null);
  if (t) { await chrome.tabs.update(tabId, { active: true }); await chrome.windows.update(t.windowId, { focused: true }); }
  else { const { waitLogin = {} } = await chrome.storage.local.get("waitLogin"); const w = waitLogin[tabId]; if (w) chrome.tabs.create({ url: w.url, active: true }); }
  chrome.notifications.clear(id);
});
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete") return;
  const { waitLogin = {} } = await chrome.storage.local.get("waitLogin");
  const w = waitLogin[tabId];
  if (!w || Date.now() - w.at > 60 * 60e3) return;
  if (/login|signin|sign-in|connexion|auth|sso|2fa|mfa|verify/i.test(tab.url || "")) return;
  const pwd = await inFrame(tabId, 0, () => !!document.querySelector("input[type=password]"));
  if (pwd) return;
  delete waitLogin[tabId]; await chrome.storage.local.set({ waitLogin });
  chrome.notifications.clear("login-" + tabId);
  const log = await run(w.url).catch((e) => "❌ " + e.message);
  await chrome.storage.local.set({ lastLog: log });
  chrome.notifications.create("done-" + tabId, { type: "basic", iconUrl: "icon.png", title: `🤖 ${w.supplier}`, message: log.slice(0, 200) });
});
