import { siteDepuisPaiement } from "./logos";

/** Claude finds the supplier's official site (billing space first) from its name and bank labels. */
export async function guessSiteClaude(apiKey: string, model: string, supplier: string, labels: string[]): Promise<string | null> {
  const prompt = `Fournisseur vu sur un relevé bancaire français : « ${supplier} ». Libellés : ${labels.map((l) => `« ${l} »`).join(", ")}.
Donne l'adresse du site officiel où ce fournisseur met les factures à disposition de ses clients (espace client / compte), sinon son site officiel.
Réponds UNIQUEMENT par l'URL https complète, ou par NONE si tu ne sais pas avec certitude.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = json.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
  const m = text.match(/https:\/\/[^\s"'<>)]+/);
  if (!m) return null;
  try {
    const u = new URL(m[0]);
    const r = await fetch(u.origin, { method: "GET", redirect: "follow", headers: { "user-agent": "Mozilla/5.0 CA+ link check" }, signal: AbortSignal.timeout(6000) }).catch(() => null);
    return r && r.status < 500 ? u.href : u.origin;
  } catch { return null; }
}

/**
 * Once per supplier and dossier, as soon as a request exists: find its site (bank label first, else Claude)
 * and keep it in supplier_sites, so the setup screen is already pre-filled. Best effort, never blocks the sync.
 */
export async function prefillSupplierSites(dossierId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const [{ data: txs }, { data: known }, { data: sources }] = await Promise.all([
    db.from("transactions").select("supplier, label").eq("dossier_id", dossierId).eq("is_open", true).limit(2000),
    db.from("supplier_sites").select("supplier").eq("dossier_id", dossierId),
    db.from("invoice_sources").select("supplier").eq("dossier_id", dossierId),
  ]);
  const skip = new Set([...(known ?? []), ...(sources ?? [])].map((r) => r.supplier));
  const labels = new Map<string, string[]>();
  for (const t of txs ?? []) {
    if (!t.supplier || skip.has(t.supplier)) continue;
    const l = labels.get(t.supplier) ?? [];
    if (l.length < 5 && t.label) l.push(t.label);
    labels.set(t.supplier, l);
  }
  const todo = [...labels].slice(0, 20);
  if (!todo.length) return 0;
  const { claudeApiKey, claudeModel } = await import("./claude-config.server");
  const [apiKey, model] = await Promise.all([claudeApiKey(), claudeModel("cabinet")]);
  const rows: { dossier_id: string; supplier: string; url: string | null }[] = [];
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(todo.slice(i, i + 5).map(async ([supplier, ls]) => {
      let url = siteDepuisPaiement(supplier, ls);
      if (!url && apiKey) url = await guessSiteClaude(apiKey, model, supplier, ls).catch(() => null);
      rows.push({ dossier_id: dossierId, supplier, url });
    }));
  }
  await db.from("supplier_sites").upsert(rows);
  return rows.length;
}
