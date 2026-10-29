// Entry chosen by the firm for a bank payment the client answered « Je n'ai pas de facture » (Julien, 29/10/2026):
// saved on the transaction, then, on a hackathon demo dossier only, booked on the Pennylane bank transaction.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDemoCompany } from "@/lib/demo-dossiers";
import { CHOIX, corpsEcriture, erreurCompte, tvaPennylane, type ChoixId, type PlanItemPl } from "@/lib/sans-facture";

const UNAVAILABLE = "Choix d'écriture indisponible : la base de données n'est pas encore à jour.";
const ENVOI_DEMO_ONLY = "L'envoi vers Pennylane est réservé aux dossiers démo du hackathon.";
const COLUMNS = "id, dossier_id, pennylane_id, amount, status, direction, ecriture_compte, ecriture_envoyee_le";

async function requireCabinetRole(db: any, userId: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r: { role: string }) => r.role === "cabinet")) throw new Error("Réservé au cabinet.");
}

async function loadTx(db: any, id: string) {
  const { data: t, error } = await db.from("transactions").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(UNAVAILABLE);
  if (!t) throw new Error("Paiement introuvable.");
  if (t.status !== "sans_facture") throw new Error("Le client n'a pas répondu « pas de facture » pour ce paiement.");
  return t;
}

export const choisirEcriture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      choix: z.enum(CHOIX.map((c) => c.id) as [ChoixId, ...ChoixId[]]),
      compte: z.string().trim().min(3).max(12),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    await requireCabinetRole(db, context.userId);
    const t = await loadTx(db, data.id);
    if (t.ecriture_envoyee_le) throw new Error("Cette écriture est déjà dans Pennylane.");
    const choix = CHOIX.find((c) => c.id === data.choix)!;
    if (choix.sortieSeulement && t.direction !== "out") throw new Error("Ce choix ne vaut que pour un paiement sortant.");
    const erreur = erreurCompte(data.choix, data.compte);
    if (erreur) throw new Error(erreur);
    const { error } = await db.from("transactions").update({
      ecriture_choix: data.choix, ecriture_compte: data.compte.trim(), ecriture_par: context.userId, ecriture_le: new Date().toISOString(),
    }).eq("id", t.id);
    if (error) throw new Error(UNAVAILABLE);
    return { ok: true };
  });

// Books the chosen account on the Pennylane bank transaction (replaces its counterpart). Demo dossiers only.
export const envoyerEcriture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    await requireCabinetRole(db, context.userId);
    const t = await loadTx(db, data.id);
    if (!t.ecriture_compte) throw new Error("Choisissez d'abord l'écriture.");
    if (t.ecriture_envoyee_le) throw new Error("Cette écriture est déjà dans Pennylane.");
    const { data: d } = await db.from("dossiers").select("company_id").eq("id", t.dossier_id).maybeSingle();
    const companyId = String(d?.company_id ?? "");
    if (!isDemoCompany(companyId)) throw new Error(ENVOI_DEMO_ONLY);

    const { openMcp } = await import("@/lib/mcp.server");
    const s = await openMcp();
    const run = <T>(operation_id: string, intent: string, extra: Record<string, unknown> = {}, path: Record<string, unknown> = {}) =>
      s.call<T>("run_operations", { operation_id, path_params: { company_id: Number(companyId), ...path }, ...extra }, intent);
    try {
      const { plan_items } = await run<{ plan_items: PlanItemPl[] }>(
        "getListCompanyPlanItems", "Checking that the account chosen for a bank payment without invoice is open in the company.",
        { query_params: { page: 1, per_page: 20, filter: JSON.stringify([{ field: "number", operator: "eq", value: t.ecriture_compte }]) } },
      );
      const vat = tvaPennylane(plan_items ?? [], t.ecriture_compte);
      if (!vat) throw new Error(`Le compte ${t.ecriture_compte} n'est pas ouvert dans le dossier Pennylane : ouvrez-le d'abord.`);
      await run("postCreateLedgerEventsCompanyAccountantsTransaction", "Booking the account chosen by the firm on a bank payment the client has no invoice for.",
        { request_body: corpsEcriture(t.ecriture_compte, Number(t.amount), vat) }, { id: Number(t.pennylane_id) });
    } finally {
      await s.close();
    }
    const { error } = await db.from("transactions").update({ ecriture_envoyee_le: new Date().toISOString() }).eq("id", t.id);
    if (error) throw new Error("Écriture passée dans Pennylane, mais l'appli n'a pas pu l'enregistrer.");
    return { ok: true };
  });
