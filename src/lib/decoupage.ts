// Découpage d'un débit carte mensuel ou d'un virement groupé (retour de Simon, point 7).
// La ligne bancaire ne dit pas ce qu'elle contient : le détail vient du relevé de carte (ou de la liste des
// virements de la remise). Chaque opération devient une ligne à part, avec son fournisseur et sa facture à
// fournir. Les opérations arrivent « À valider » : le cabinet les valide avant tout envoi au client.
import { normalizeSupplier } from "@/lib/supplier";
import { round2 } from "@/lib/ventilation";

export type Operation = { date: string; fournisseur: string; montant: number };
export const MAX_OPERATIONS = 200;

// Labels of a deferred card debit or of a grouped transfer: the client is offered to deposit the statement.
const GROUPE =
  /\b(FACTURE(S)? CARTE|FACT\.? ?CARTE|RELEVE (CB|CARTE)|DEBIT (DIFFERE|MENSUEL)|CARTE .*DIFFERE|PRLV CARTE|ARRETE CARTE|VIR(EMENT)?S? (GROUPES?|MULTIPLES?)|REMISE (DE )?VIR(EMENT)?S?)\b/;

export function estGroupe(label: string): boolean {
  const up = (label || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return GROUPE.test(up);
}

export type Controle = { total: number; ecart: number; ok: boolean; erreurs: string[] };

// The operations must add up to the bank line, to the cent: nothing is lost or counted twice.
export function controleDecoupage(montantLigne: number, ops: Operation[]): Controle {
  const erreurs: string[] = [];
  if (ops.length < 2) erreurs.push("Il faut au moins 2 opérations pour découper la ligne.");
  if (ops.length > MAX_OPERATIONS) erreurs.push(`${MAX_OPERATIONS} opérations au plus.`);
  ops.forEach((o, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) erreurs.push(`Opération ${i + 1} : date manquante.`);
    if (!o.fournisseur.trim()) erreurs.push(`Opération ${i + 1} : fournisseur manquant.`);
    if (!(Math.abs(o.montant) > 0)) erreurs.push(`Opération ${i + 1} : montant manquant.`);
  });
  const total = round2(ops.reduce((s, o) => s + Math.abs(o.montant), 0));
  const ecart = round2(Math.abs(montantLigne) - total);
  if (Math.abs(ecart) > 0.01)
    erreurs.push(`Le total des opérations diffère de la ligne bancaire de ${ecart.toFixed(2)} €.`);
  return { total, ecart, ok: erreurs.length === 0, erreurs };
}

type Parent = {
  id: string;
  dossier_id: string;
  pennylane_id: string;
  amount: number | string;
  label: string;
  direction: string;
  counterpart_accounts?: string | null;
};

// New rows for the operations: same dossier and direction as the bank line, sign of the bank line kept,
// "À valider" until the firm sends them. pennylane_id stays unique per dossier: "<ligne>#<n>".
export function lignesOperations(
  parent: Parent,
  ops: Operation[],
  alias: Map<string, string> = new Map(),
) {
  const signe = Number(parent.amount) < 0 ? -1 : 1;
  return ops.map((o, i) => {
    const detected = normalizeSupplier(o.fournisseur);
    return {
      dossier_id: parent.dossier_id,
      parent_id: parent.id,
      pennylane_id: `${parent.pennylane_id}#${i + 1}`,
      date: o.date,
      amount: signe * round2(Math.abs(o.montant)),
      label: `${o.fournisseur.trim()} (détail de « ${parent.label} »)`.slice(0, 500),
      supplier_detected: detected,
      supplier: alias.get(detected) ?? detected,
      review_state: "pending",
      direction: parent.direction,
      counterpart_accounts: parent.counterpart_accounts ?? null,
    };
  });
}
