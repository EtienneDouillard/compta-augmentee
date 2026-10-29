import { describe, expect, it } from "vitest";
import { prochainEnvoiPossible, recapClient, recapDu, type LigneRecap } from "./recap-client";

const l = (o: Partial<LigneRecap> = {}): LigneRecap => ({
  supplier: "ORANGE",
  direction: "out",
  date: "2026-09-12",
  label: "PRLV SEPA ORANGE",
  amount: -40,
  status: "a_faire",
  review_state: "sent",
  is_open: true,
  updated_at: "2026-10-29T08:00:00Z",
  ...o,
});
const now = new Date("2026-10-29T20:00:00Z");
const auto = { dernierEnvoi: null, auto: true, relanceJours: null };

describe("récapitulatif client : un e-mail au plus toutes les 12 h", () => {
  it("envoie le premier récap dès qu'il y a une demande", () => {
    expect(recapDu([l()], auto, now)).toBe(true);
  });
  it("n'envoie rien sans demande à faire (non envoyée, répondue ou close)", () => {
    const lignes = [l({ review_state: "pending" }), l({ status: "depose" }), l({ is_open: false })];
    expect(recapDu(lignes, auto, now)).toBe(false);
    expect(recapClient(lignes, { dossier: "D", cabinet: "C", lien: "x" })).toBeNull();
  });
  it("attend 12 h après le dernier envoi, même pour de nouvelles demandes", () => {
    const ligne = l({ updated_at: "2026-10-29T15:00:00Z" });
    expect(recapDu([ligne], { ...auto, dernierEnvoi: "2026-10-29T09:00:00Z" }, now)).toBe(false);
    expect(recapDu([ligne], { ...auto, dernierEnvoi: "2026-10-29T08:00:00Z" }, now)).toBe(true);
    expect(prochainEnvoiPossible("2026-10-29T09:00:00Z", now)?.toISOString()).toBe(
      "2026-10-29T21:00:00.000Z",
    );
    expect(prochainEnvoiPossible("2026-10-29T08:00:00Z", now)).toBeNull();
  });
  it("ne renvoie pas la même liste sans nouveauté, sauf relance programmée échue", () => {
    const vieux = [l({ updated_at: "2026-10-20T10:00:00Z" })];
    const reglage = { dernierEnvoi: "2026-10-27T12:00:00Z", auto: true, relanceJours: null };
    expect(recapDu(vieux, reglage, now)).toBe(false);
    expect(recapDu(vieux, { ...reglage, relanceJours: 3 }, now)).toBe(false);
    expect(recapDu(vieux, { ...reglage, relanceJours: 2 }, now)).toBe(true);
  });
  it("sans option ni relance, le job n'envoie rien (envoi manuel seulement)", () => {
    expect(recapDu([l()], { dernierEnvoi: null, auto: false, relanceJours: null }, now)).toBe(
      false,
    );
  });
});

describe("contenu détaillé du récapitulatif", () => {
  const r = recapClient(
    [
      l(),
      l({ supplier: "EDF", amount: -300, date: "2026-08-03", label: "PRLV EDF" }),
      l({ amount: -10, date: "2026-09-01" }),
      l({ supplier: "CLIENT SA", direction: "in", amount: 1200, label: "VIR CLIENT SA" }),
    ],
    { dossier: "Boulangerie", cabinet: "Cabinet X", lien: "https://exemple.fr/" },
  )!;
  it("donne le nombre de factures et le cabinet dans l'objet", () => {
    expect(r.subject).toBe("Boulangerie : 4 factures à transmettre à Cabinet X");
    expect(r.nbFactures).toBe(4);
  });
  it("détaille chaque paiement : date, montant, libellé, et le reste à justifier", () => {
    expect(r.text).toMatch(
      /ORANGE \(achat : facture du fournisseur\) – 2 factures, 50,00\s€ à justifier/,
    );
    expect(r.text).toMatch(/payé le 03\/08\/2026 : 300,00\s€ – « PRLV EDF »/);
    expect(r.text).toMatch(/encaissé le 12\/09\/2026 : 1\s?200,00\s€ – « VIR CLIENT SA »/);
  });
  it("classe par montant et met un lien direct par fournisseur", () => {
    expect(r.text.indexOf("CLIENT SA")).toBeLessThan(r.text.indexOf("EDF"));
    expect(r.text).toContain("https://exemple.fr/espace/achat%3AORANGE");
    expect(r.text).toContain("https://exemple.fr/espace\n");
  });
  it("reste poli", () => {
    expect(r.text).toMatch(/Pourriez-vous s'il vous plaît/);
    expect(r.text).not.toMatch(/merci de/i);
  });
});
