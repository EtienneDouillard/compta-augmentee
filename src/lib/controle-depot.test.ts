import { describe, expect, it } from "vitest";
import { bilanDepot, memeFournisseur } from "./controle-depot";

describe("fournisseur de la facture", () => {
  it("reconnaît le même fournisseur malgré la forme juridique et la casse", () => {
    expect(memeFournisseur("Orange SA", "ORANGE")).toBe(true);
    expect(memeFournisseur("Amazon EU S.à r.l.", "AMAZON PAYMENTS")).toBe(true);
    expect(memeFournisseur("Orange Business", "ORANGEBUSINESS")).toBe(true);
  });
  it("signale un autre fournisseur", () => {
    expect(memeFournisseur("EDF", "TOTALENERGIES")).toBe(false);
  });
  it("ne conclut pas sans nom lisible", () => {
    expect(memeFournisseur("", "ORANGE")).toBeNull();
    expect(memeFournisseur("SAS", "ORANGE")).toBeNull();
  });
});

describe("bilan du dépôt", () => {
  it("dit ce qu'il reste à justifier (2 factures de 25 € pour 60 €)", () => {
    const b = bilanDepot(-60, "REVIEW", [
      { fournisseur: "Review", totalTtc: 25 },
      { fournisseur: "Review", totalTtc: 25 },
    ]);
    expect(b).toMatchObject({ etat: "partiel", totalLu: 50, reste: 10, fournisseursDouteux: [] });
  });
  it("valide un dépôt qui couvre le paiement", () => {
    expect(bilanDepot(-120, "REVIEW", [{ fournisseur: "REVIEW", totalTtc: 120 }]).etat).toBe(
      "complet",
    );
  });
  it("signale des factures au-delà du paiement (2 × 50 € pour 60 €)", () => {
    const b = bilanDepot(-60, "REVIEW", [
      { fournisseur: "REVIEW", totalTtc: 50 },
      { fournisseur: "REVIEW", totalTtc: 50 },
    ]);
    expect(b).toMatchObject({ etat: "excedent", reste: -40 });
  });
  it("garde le nom d'un fournisseur douteux", () => {
    expect(
      bilanDepot(-60, "ORANGE", [{ fournisseur: "EDF", totalTtc: 60 }]).fournisseursDouteux,
    ).toEqual(["EDF"]);
  });
  it("reste à vérifier quand une pièce n'a pas pu être lue", () => {
    expect(bilanDepot(-60, "ORANGE", [], 1).etat).toBe("a_verifier");
    expect(bilanDepot(-60, "ORANGE", [{ fournisseur: "ORANGE", totalTtc: 60 }], 1).etat).toBe(
      "a_verifier",
    );
    expect(bilanDepot(-60, "ORANGE", []).etat).toBe("aucune");
  });
});
