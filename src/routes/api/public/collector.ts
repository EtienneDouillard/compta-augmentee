import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { hashToken, matchTransaction } from "@/lib/collector";

// Robot Chrome endpoint. Authorised only by the per-dossier token (hashed in collector_tokens).
// GET: sources the robot must visit. POST: one invoice file found by the robot.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

async function auth(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token || token.length > 200) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data } = await db.from("collector_tokens").select("id, dossier_id, created_by").eq("token_hash", await hashToken(token)).maybeSingle();
  if (!data) return null;
  await db.from("collector_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { db, dossierId: data.dossier_id as string, userId: data.created_by as string };
}

const Depot = z.object({
  sourceId: z.string().uuid(),
  fileName: z.string().min(1).max(200),
  mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  base64: z.string().min(10).max(14_000_000),
  invoiceDate: z.string().max(40).nullable().optional(),
  label: z.string().max(300).optional(),
});

export const Route = createFileRoute("/api/public/collector")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const a = await auth(request);
        if (!a) return json({ error: "Jeton invalide." }, 401);
        const { data: d } = await a.db.from("dossiers").select("name").eq("id", a.dossierId).maybeSingle();
        const { data: sources } = await a.db.from("invoice_sources").select("id, supplier, source_url, robot_url")
          .eq("dossier_id", a.dossierId).eq("method", "browser");
        // Only sources that still have a missing invoice: the robot never visits a supplier for nothing.
        const { data: open } = await a.db.from("transactions").select("supplier, date, amount, label")
          .eq("dossier_id", a.dossierId).eq("is_open", true).eq("status", "a_faire").eq("direction", "out");
        const missing = new Set((open ?? []).map((t: any) => t.supplier));
        const todo = (sources ?? []).filter((s: any) => missing.has(s.supplier));
        // Amounts the robot looks for in the invoice rows: bank amount in EUR and, for card payments
        // in another currency, the foreign amount written in the bank label ("486.52 USD").
        const wantedFor = (sup: string) => (open ?? []).filter((t: any) => t.supplier === sup).map((t: any) => {
          const eur = Math.abs(Number(t.amount)).toFixed(2);
          const fx = String(t.label ?? "").match(/(\d[\d\s.,]*[.,]\d\d)\s?(USD|GBP|CHF|CAD|\$|£)/i)?.[1];
          return { date: t.date, amounts: [fx, eur, eur.replace(".", ",")].filter(Boolean) };
        });
        return json({ dossier: d?.name ?? "", sources: todo.map((s: any) => ({ id: s.id, supplier: s.supplier, url: s.robot_url || s.source_url, wanted: wantedFor(s.supplier) })) });
      },
      POST: async ({ request }) => {
        const a = await auth(request);
        if (!a) return json({ error: "Jeton invalide." }, 401);
        const parsed = Depot.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Fichier invalide." }, 400);
        const p = parsed.data;
        const { data: src } = await a.db.from("invoice_sources").select("id, supplier, auto_send_documents")
          .eq("id", p.sourceId).eq("dossier_id", a.dossierId).maybeSingle();
        if (!src) return json({ error: "Source inconnue." }, 404);

        const { data: txs } = await a.db.from("transactions").select("id, date, amount")
          .eq("dossier_id", a.dossierId).eq("supplier", src.supplier).eq("is_open", true).eq("status", "a_faire").eq("direction", "out");
        const tx = matchTransaction(txs ?? [], p.invoiceDate ?? null);
        if (!tx) return json({ ok: true, attached: false, message: "Aucun paiement à justifier pour cette facture." });

        const bytes = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));
        const safe = p.fileName.replace(/[^\w.-]+/g, "_");
        const path = `${a.dossierId}/${tx.id}/${Date.now()}-robot-${safe}`;
        const up = await a.db.storage.from("factures").upload(path, bytes, { contentType: p.mime });
        if (up.error) return json({ error: "Stockage impossible." }, 500);
        const { data: ins, error } = await a.db.from("uploads").insert({
          dossier_id: a.dossierId, transaction_id: tx.id, storage_path: path, file_name: p.fileName, uploaded_by: a.userId,
        }).select("id").single();
        if (error) return json({ error: "Enregistrement impossible." }, 500);

        const { traiterDepotRobot } = await import("@/lib/saisie.functions");
        const r = await traiterDepotRobot(ins.id, a.userId, !!src.auto_send_documents);
        await a.db.from("transactions").update({ status: "depose", comment: "🤖 Récupérée par le robot CA+" }).eq("id", tx.id);
        await a.db.from("invoice_sources").update({
          state: "active", robot_last_run: { at: new Date().toISOString(), file: p.fileName, ...r },
        }).eq("id", src.id);
        return json({ ok: true, attached: true, ...r });
      },
    },
  },
});
