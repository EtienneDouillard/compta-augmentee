import { describe, expect, it } from "vitest";
import { choixPour, corpsEcriture, ecritureSansFacture, erreurCompte, tvaPennylane } from "./sans-facture";

describe("écriture sans facture", () => {
  it("propose la charge et l'acompte seulement pour une sortie", () => {
    expect(choixPour("out").map((c) => c.id)).toEqual(["charge", "associe", "attente", "acompte", "autre"]);
    expect(choixPour("in").map((c) => c.id)).toEqual(["associe", "attente", "autre"]);
  });
  it("contrôle le compte dans le plan 2026", () => {
    expect(erreurCompte("attente", "471")).toBeNull();
    expect(erreurCompte("associe", "45511")).toBeNull();
    expect(erreurCompte("charge", "6257")).toBeNull();
    expect(erreurCompte("charge", "471")).toMatch(/60 à 67/);
    expect(erreurCompte("autre", "999")).toMatch(/plan de comptes 2026/);
    expect(erreurCompte("autre", "512")).toMatch(/banque/);
    expect(erreurCompte("autre", "47a")).toMatch(/numéro/);
  });
  it("débite le compte choisi et crédite la banque pour une sortie", () => {
    expect(ecritureSansFacture("471", -285, "Retrait")).toEqual([
      { compte: "471", libelle: "Comptes d'attente", debit: 285, credit: 0 },
      { compte: "512", libelle: "Banque", debit: 0, credit: 285 },
    ]);
    expect(ecritureSansFacture("4551", 100, "Apport")).toEqual([
      { compte: "512", libelle: "Banque", debit: 100, credit: 0 },
      { compte: "4551", libelle: "Principal", debit: 0, credit: 100 },
    ]);
  });
  it("envoie le montant signé comme la transaction, sans ligne de TVA", () => {
    expect(corpsEcriture("471", -285, "any")).toEqual({ transaction_lines: [{ plan_item_number: "471", vat_rate: "any", amount: "-285.00" }] });
    const items = [
      { number: "471", vat_rate: "FR_200", enabled: true },
      { number: "471", vat_rate: "any", enabled: true },
      { number: "6257", vat_rate: "exempt", enabled: true },
      { number: "4551", vat_rate: "any", enabled: false },
    ];
    expect(tvaPennylane(items, "471")).toBe("any");
    expect(tvaPennylane(items, "6257")).toBe("exempt");
    expect(tvaPennylane(items, "4551")).toBeNull();
  });
});
