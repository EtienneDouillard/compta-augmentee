// Envoi groupé (demande de Julien, 29/10/2026) : le cabinet valide et envoie dans Pennylane, en une seule
// confirmation, toutes les saisies prêtes d'un dossier démo. Une saisie qui demande un regard humain
// (écart, compte hors plan, pièce non PDF) n'est jamais envoyée d'office : elle est listée avec sa raison.
import { blocagesEnvoi } from "@/lib/pennylane-import";
import { LigneSaisie, typeMedia, type SaisieState } from "@/lib/saisie";
import { controle, type Facture } from "@/lib/ventilation";

export const MAX_ENVOI_GROUPE = 50;

export type PourEnvoi = {
  state: SaisieState;
  pennylaneInvoiceId: string | null;
  fileName: string;
  facture: Facture;
};
export type EtatEnvoi = { pret: true; aValider: boolean } | { pret: false; raison: string };

export function etatEnvoi(s: PourEnvoi): EtatEnvoi {
  if (s.pennylaneInvoiceId) return { pret: false, raison: "Déjà dans Pennylane." };
  if (s.state === "rejetee") return { pret: false, raison: "Proposition rejetée." };
  if (s.state === "echec")
    return { pret: false, raison: "Lecture impossible : à relire ou à saisir à la main." };
  if (typeMedia(s.fileName) !== "application/pdf")
    return { pret: false, raison: "Pennylane n'importe que les factures en PDF." };
  if (s.state === "proposee") {
    // Same checks as a validation by hand (validerSaisie), without the "valider malgré l'écart" escape.
    if (!controle(s.facture).ok)
      return {
        pret: false,
        raison: "Les totaux ne retombent pas sur le pied de facture : à ouvrir et corriger.",
      };
    const bad = s.facture.lignes.find((l) => !LigneSaisie.safeParse(l).success);
    if (bad)
      return {
        pret: false,
        raison: `Ligne « ${bad.libelle || "sans libellé"} » à corriger (compte ou libellé).`,
      };
    if (!s.facture.libelleEcriture.trim())
      return { pret: false, raison: "Libellé d'écriture manquant." };
  }
  const blocages = blocagesEnvoi(s.facture);
  if (blocages.length) return { pret: false, raison: blocages.join(" ") };
  return { pret: true, aValider: s.state === "proposee" };
}
