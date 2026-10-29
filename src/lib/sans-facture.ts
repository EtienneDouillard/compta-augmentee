// Entry chosen by the firm for a bank payment the client says has no invoice (« Je n'ai pas de facture »).
// Pure helpers: the usual choices, the account check against the ANC chart at 1 January 2026, and the entry shown.
import { comptePcg, libellePcg } from "@/lib/pcg";

export type ChoixId = "charge" | "associe" | "attente" | "acompte" | "autre";

export type Choix = {
  id: ChoixId;
  label: string;
  // Account proposed; the firm can type a sub-account. Empty for "autre" and for "charge" (account to pick).
  compte: string;
  aide: string;
  // Only for a payment going out (purchase side).
  sortieSeulement?: boolean;
};

// Wording kept factual; the rule on VAT and expenses without an invoice is the one already shown to the client.
export const CHOIX: Choix[] = [
  {
    id: "charge",
    label: "Charge sans TVA déductible",
    compte: "",
    aide:
      "Montant payé passé en charge, TVA comprise : sans facture, la TVA n'est pas déductible (CGI art. 271, II ; BOI-TVA-DED-40-10-10 § 30) et la charge doit être justifiée autrement (BOI-BIC-CHG-10-20-20 § 1 et 10).",
    sortieSeulement: true,
  },
  { id: "associe", label: "Compte courant d'associé", compte: "4551", aide: "Dépense personnelle payée avec le compte de l'entreprise." },
  { id: "attente", label: "Compte d'attente", compte: "471", aide: "En attente d'information : à solder avant la clôture." },
  { id: "acompte", label: "Acompte fournisseur", compte: "4091", aide: "Avance versée avant la facture définitive.", sortieSeulement: true },
  { id: "autre", label: "Autre compte", compte: "", aide: "Compte du plan 2026 ou subdivision d'un de ses comptes." },
];

export const choixPour = (direction: "out" | "in") => CHOIX.filter((c) => direction === "out" || !c.sortieSeulement);

/** Why the account cannot be used for this choice; null when it can. */
export function erreurCompte(choix: ChoixId, compte: string): string | null {
  const n = compte.trim();
  if (!/^\d{3,12}$/.test(n)) return "Saisissez un numéro de compte (3 à 12 chiffres).";
  if (!comptePcg(n)) return `Le compte ${n} n'est pas dans le plan de comptes 2026 et n'en subdivise aucun compte.`;
  if (choix === "charge" && !/^6[0-7]/.test(n)) return "Une charge se passe dans un compte 60 à 67.";
  if (n.startsWith("512")) return "Le compte de banque est déjà la contrepartie de la transaction.";
  return null;
}

export type LigneEcriture = { compte: string; libelle: string; debit: number; credit: number };

/**
 * Entry against the bank account: a payment out debits the chosen account and credits the bank (512),
 * a payment in does the opposite. Amounts in euros, rounded to the cent.
 */
export function ecritureSansFacture(compte: string, montant: number, libelle: string): LigneEcriture[] {
  const m = Math.round(Math.abs(montant) * 100) / 100;
  const sortie = montant < 0;
  const choisi = { compte, libelle: libellePcg(compte) || libelle, debit: sortie ? m : 0, credit: sortie ? 0 : m };
  const banque = { compte: "512", libelle: "Banque", debit: sortie ? 0 : m, credit: sortie ? m : 0 };
  return sortie ? [choisi, banque] : [banque, choisi];
}

// Pennylane, tested on the demo dossier on 29/10/2026: the lines sent replace the transaction's counterpart, and
// the amount is signed like the bank transaction (a payment out is negative). With the opposite sign, Pennylane
// books the difference to its default suspense account.
export type PlanItemPl = { number: string; vat_rate: string; enabled: boolean };

/** VAT setting used in Pennylane for the account: no VAT line ("any"), else "exempt"; null when not open. */
export function tvaPennylane(items: PlanItemPl[], compte: string): "any" | "exempt" | null {
  const ouverts = items.filter((p) => p.enabled && p.number === compte);
  if (ouverts.some((p) => p.vat_rate === "any")) return "any";
  if (ouverts.some((p) => p.vat_rate === "exempt")) return "exempt";
  return null;
}

export function corpsEcriture(compte: string, montant: number, vat: "any" | "exempt") {
  return { transaction_lines: [{ plan_item_number: compte, vat_rate: vat, amount: (Math.round(montant * 100) / 100).toFixed(2) }] };
}
