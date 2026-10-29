// Contrôle des dépôts (retour de Simon, point 5, et de Julien) : quand le client dépose une facture, Claude en lit
// le fournisseur et le montant TTC ; l'appli compare avec le paiement et dit ce qu'il reste à justifier.
import { normalizeText } from "@/lib/skip-rules";
import { TYPE_NON_VALABLE, type TypeDocument } from "@/lib/type-document";
import { round2 } from "@/lib/ventilation";

// Words that say nothing about who the supplier is.
const GENERIQUES = new Set([
  "SA",
  "SAS",
  "SASU",
  "SARL",
  "EURL",
  "SNC",
  "SCI",
  "SCP",
  "SELARL",
  "STE",
  "SOCIETE",
  "ETS",
  "ETABLISSEMENTS",
  "FRANCE",
  "FR",
  "GROUPE",
  "GROUP",
  "INTERNATIONAL",
  "SERVICES",
  "SERVICE",
  "THE",
  "LES",
  "DES",
  "DU",
  "DE",
  "LA",
  "LE",
  "ET",
  "CB",
  "PRLV",
  "SEPA",
  "VIR",
  "CARTE",
  "PAIEMENT",
  "FACTURE",
]);

const mots = (s: string) =>
  normalizeText(s)
    .split(" ")
    .filter((m) => m.length >= 3 && !GENERIQUES.has(m) && !/^\d+$/.test(m));

// true / false, or null when the invoice gave no usable name (no warning then).
export function memeFournisseur(lu: string, attendu: string): boolean | null {
  const a = mots(lu);
  if (!a.length) return null;
  const b = mots(attendu);
  if (!b.length) return null;
  if (a.some((m) => b.includes(m))) return true;
  // "ORANGEBUSINESS" against "ORANGE BUSINESS", or a bank label that glues words together.
  const ja = a.join(""),
    jb = b.join("");
  return ja.includes(jb) || jb.includes(ja);
}

export type PieceLue = { fournisseur: string; totalTtc: number; typeDocument?: TypeDocument };
export type Bilan = {
  lues: number;
  nonLues: number;
  totalLu: number;
  /** Paiement moins factures lues : > 0 reste à justifier, < 0 factures au-delà du paiement. */
  reste: number;
  fournisseursDouteux: string[];
  /** Pièces lues qui ne sont pas des factures (proforma, devis, bon de commande) : jamais comptées. */
  nonValables: string[];
  etat: "aucune" | "complet" | "partiel" | "excedent" | "a_verifier" | "non_valable";
};

// pieces: what Claude read; nonLues: files deposited but not read (photo of a pump, reading failed, cap reached).
export function bilanDepot(
  montantPaiement: number,
  fournisseur: string,
  pieces: PieceLue[],
  nonLues = 0,
): Bilan {
  const nonValables = pieces.flatMap((p) =>
    p.typeDocument && TYPE_NON_VALABLE[p.typeDocument] ? [TYPE_NON_VALABLE[p.typeDocument]!] : [],
  );
  const valables = pieces.filter((p) => !(p.typeDocument && TYPE_NON_VALABLE[p.typeDocument]));
  const totalLu = round2(valables.reduce((s, p) => s + Math.abs(p.totalTtc), 0));
  const reste = round2(Math.abs(montantPaiement) - totalLu);
  const fournisseursDouteux = [
    ...new Set(
      pieces
        .filter((p) => memeFournisseur(p.fournisseur, fournisseur) === false)
        .map((p) => p.fournisseur),
    ),
  ];
  const etat: Bilan["etat"] = !valables.length
    ? nonValables.length
      ? "non_valable"
      : nonLues
        ? "a_verifier"
        : "aucune"
    : nonLues
      ? "a_verifier"
      : Math.abs(reste) <= 0.01
        ? "complet"
        : reste > 0
          ? "partiel"
          : "excedent";
  return {
    lues: pieces.length,
    nonLues,
    totalLu,
    reste,
    fournisseursDouteux,
    nonValables: [...new Set(nonValables)],
    etat,
  };
}

// Payments the client must still answer: partly covered, or only a proforma / quote deposited.
export const resteAFaire = (b: Bilan | null) => b?.etat === "partiel" || b?.etat === "non_valable";
