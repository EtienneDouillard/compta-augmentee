/**
 * BÊTA — écriture de la ventilation validée dans Pennylane.
 *
 * ⚠ DÉSACTIVÉ VOLONTAIREMENT. Nous itérons encore sur les règles : aucune donnée Pennylane
 * ne doit être modifiée pour l'instant. Tant que PENNYLANE_ECRITURE_ACTIVE vaut false,
 * `envoyerVentilation` ne fait que construire et retourner la charge utile (aperçu).
 *
 * Pour activer plus tard : passer le drapeau à true, brancher `appelPennylane` sur une
 * fonction serveur disposant du jeton Pennylane, et faire valider par l'expert-comptable.
 */
import { ecriture, type Facture } from "@/lib/ventilation";

export const PENNYLANE_ECRITURE_ACTIVE = false;

export function chargeUtileVentilation(f: Facture & { pennylane_invoice_id?: string | null; compte_fournisseur?: string | null }) {
  const e = ecriture(f, f.compte_fournisseur ?? "401");
  return {
    supplier_invoice_id: f.pennylane_invoice_id,
    label: f.libelleEcriture,
    invoice_lines: f.lignes.map((l) => ({
      label: l.libelle,
      ledger_account_number: l.compte,
      amount: l.ht,
      vat_amount: l.tvaMontant ?? Math.round(l.ht * l.tauxTva * 100) / 100,
    })),
    ecriture_controle: e,
  };
}

export async function envoyerVentilation(f: Parameters<typeof chargeUtileVentilation>[0]) {
  const payload = chargeUtileVentilation(f);
  if (!PENNYLANE_ECRITURE_ACTIVE) {
    return { envoye: false as const, raison: "Écriture Pennylane désactivée (bêta)", payload };
  }
  // const res = await appelPennylane({ operation: "updateSupplierInvoiceLines", body: payload });
  // return { envoye: true as const, res, payload };
  return { envoye: false as const, raison: "Non branché", payload };
}
