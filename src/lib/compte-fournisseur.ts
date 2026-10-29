// Supplier account shown in the purchase entry: « 401 + name of the supplier » (Julien, 29/10/2026: 401AMAZON
// rather than Pennylane's numbered 401100012). Display only: the account Pennylane books on is not changed here.
import { tiersKey } from "@/lib/regroupement";

// Words left out of the account name on top of legal forms: a subsidiary's area ("AMAZON EU SARL" → 401AMAZON).
const ZONES = new Set(["EU", "EUROPE", "FR", "FRANCE"]);
// Kept short so the account stays readable in the ledger (the demo dossier already holds 401BOULA, 401PLFRAIS).
const LONGUEUR_MAX = 15;

/** « 401 » + supplier name in capitals, without accents, spaces, legal form or area; "401" when no name is left. */
export function compteAuxiliaire(fournisseur: string): string {
  const mots = tiersKey(fournisseur).split(" ").filter((w) => w && !ZONES.has(w));
  return `401${mots.join("").slice(0, LONGUEUR_MAX)}`;
}

/**
 * Account shown for the supplier debt. A Pennylane account already named after the supplier (401BOULA) is kept as is;
 * a numbered one (401100012) is shown as 401 + name, with the Pennylane number given apart until it is renamed.
 */
export function compteFournisseur(fournisseur: string, comptePennylane?: string | null): { compte: string; pennylane: string | null } {
  const pl = comptePennylane?.trim() || null;
  if (pl && /^401\d*[A-Z]/i.test(pl)) return { compte: pl.toUpperCase(), pennylane: null };
  const compte = compteAuxiliaire(fournisseur);
  return { compte, pennylane: pl && pl !== compte ? pl : null };
}
