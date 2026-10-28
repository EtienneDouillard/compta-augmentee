import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import data from "@/data/pennylane-factures-2026.json";
import { eclater, PIECE_ATELIER_NUMERIQUE, type LignePiece } from "./eclatement";

const PIECES_LUES: Record<string, LignePiece[]> = { "32752481357824": PIECE_ATELIER_NUMERIQUE };

/**
 * Import des factures fournisseurs 2026 lues dans Pennylane (via le MCP Pennylane, lecture seule).
 * Les comptes viennent des écritures existantes ; libellés du plan comptable Pennylane du dossier,
 * PCG 2025 à défaut. Les lignes de charges sont les débits hors 401/4456/4457.
 */
type Src = (typeof data)[number];

export const NB_FACTURES_PENNYLANE = data.length;

export async function importerFacturesPennylane(dossierId: string) {
  // Les anciennes factures de démonstration (sans identifiant Pennylane) sont retirées.
  await supabase.from("factures").delete().eq("dossier_id", dossierId).is("pennylane_invoice_id", null);
  let n = 0;
  for (let i = 0; i < data.length; i += 50) {
    const lot = (data as Src[]).slice(i, i + 50);
    const { data: rows, error } = await supabase.from("factures").upsert(
      lot.map(({ lignes: _l, ...f }) => ({ ...f, dossier_id: dossierId })),
      { onConflict: "dossier_id,pennylane_invoice_id" },
    ).select("id, pennylane_invoice_id, statut");
    if (error) throw error;
    const aRemplacer = (rows ?? []).filter((r) => r.statut !== "validee");
    if (aRemplacer.length) {
      await supabase.from("lignes").delete().in("facture_id", aRemplacer.map((r) => r.id));
      const lignes: Database["public"]["Tables"]["lignes"]["Insert"][] = aRemplacer.flatMap((r): Database["public"]["Tables"]["lignes"]["Insert"][] => {
        const src = lot.find((x) => x.pennylane_invoice_id === r.pennylane_invoice_id);
        // Pièces déjà lues : on éclate depuis les lignes de la facture plutôt que l'écriture Pennylane.
        const piece = src && PIECES_LUES[src.pennylane_invoice_id];
        if (src && piece) return eclater(piece, src.date).map(({ id: _id, compteLibelle, tauxTva, tvaMontant, periodeMois, ...l }, position) => ({ ...l, compte_libelle: compteLibelle, taux_tva: tauxTva, tva_montant: tvaMontant, periode_mois: periodeMois ?? null, nature: l.nature ?? null, facture_id: r.id, position }));
        return (src?.lignes ?? []).map((l, position) => ({ ...l, facture_id: r.id, position }));
      });
      if (lignes.length) {
        const { error: e2 } = await supabase.from("lignes").insert(lignes);
        if (e2) throw e2;
      }
    }
    n += rows?.length ?? 0;
  }
  return n;
}
