// Supplier account in Pennylane for an invoice the app sent (Julien, 29/10/2026: « 401 + nom du fournisseur »).
// Reads the account of the invoice's supplier and, on request, renames it 401 + name through the supplier record:
// the account keeps its entries, only its number changes. Hackathon demo dossiers only.
// Tested on the demo dossier 276211 on 29/10/2026: 401100012 renamed 401AMAZON, same debits, credits and balance.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDemoCompany } from "@/lib/demo-dossiers";
import { compteFournisseur } from "@/lib/compte-fournisseur";
import { requireCabinetRole } from "@/lib/saisie.functions";

type FactureFournisseur = { thirdparty_id: number | null };
type Tiers = { supplier: { id: number; name: string; plan_item: { id: number; number: string } | null } };

export type CompteFournisseurPl = { fournisseur: string; actuel: string; propose: string; aRenommer: boolean };

export const compteFournisseurPennylane = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ saisieId: z.string().uuid(), renommer: z.boolean() }).parse(d))
  .handler(async ({ data, context }): Promise<CompteFournisseurPl> => {
    const db = context.supabase as any;
    await requireCabinetRole(db, context.userId);
    const { data: s } = await db.from("saisies").select("dossier_id, pennylane_invoice_id").eq("id", data.saisieId).maybeSingle();
    if (!s?.pennylane_invoice_id) throw new Error("Cette facture n'est pas encore dans Pennylane.");
    const { data: d } = await db.from("dossiers").select("company_id").eq("id", s.dossier_id).maybeSingle();
    const companyId = String(d?.company_id ?? "");
    if (!isDemoCompany(companyId)) throw new Error("Le compte fournisseur Pennylane ne se modifie que sur les dossiers démo du hackathon.");

    const { openMcp } = await import("@/lib/mcp.server");
    const m = await openMcp();
    const run = <T>(operation_id: string, intent: string, path: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
      m.call<T>("run_operations", { operation_id, path_params: { company_id: Number(companyId), ...path }, ...extra }, intent);
    try {
      const inv = await run<FactureFournisseur>("getCompanySupplierInvoice", "Finding the supplier of an invoice the firm sent.", { id: Number(s.pennylane_invoice_id) });
      if (!inv.thirdparty_id) throw new Error("Pennylane n'a pas encore rattaché cette facture à un fournisseur.");
      const { supplier } = await run<Tiers>("getCompanyThirdparty", "Reading the supplier account of an invoice the firm sent.", { id: inv.thirdparty_id });
      if (!supplier.plan_item) throw new Error("Ce fournisseur n'a pas encore de compte dans Pennylane.");
      const cf = compteFournisseur(supplier.name, supplier.plan_item.number);
      const etat = { fournisseur: supplier.name, actuel: supplier.plan_item.number, propose: cf.compte, aRenommer: cf.pennylane !== null };
      if (!data.renommer || !etat.aRenommer) return etat;

      const { plan_items } = await run<{ plan_items: { number: string }[] }>(
        "getListCompanyPlanItems", "Checking that the new supplier account number is free in the company.", {},
        { query_params: { page: 1, per_page: 20, filter: JSON.stringify([{ field: "number", operator: "eq", value: cf.compte }]) } },
      );
      if ((plan_items ?? []).some((p) => p.number === cf.compte))
        throw new Error(`Le compte ${cf.compte} existe déjà dans Pennylane : renommez ce fournisseur dans Pennylane.`);
      await run("putCompanyThirdparty", "Renaming a supplier's numbered account to 401 followed by its name, as the firm asked.", { id: supplier.id }, {
        request_body: { thirdparty: { id: supplier.id, plan_item_attributes: { id: supplier.plan_item.id, number: cf.compte, label: supplier.name } } },
      });
      return { ...etat, actuel: cf.compte, aRenommer: false };
    } finally {
      await m.close();
    }
  });
