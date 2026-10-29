import { describe, expect, it } from "vitest";
import { demandeFournisseur, mailtoDemande } from "./demande-fournisseur";
import type { Tx } from "./session";

const tx = (date: string, amount: number) =>
  ({ id: date, date, amount, supplier: "ORANGE", label: "PRLV ORANGE" }) as unknown as Tx;

describe("e-mail au fournisseur", () => {
  it("liste les paiements, la référence client et l'adresse du dossier", () => {
    const d = demandeFournisseur({
      fournisseur: "ORANGE",
      client: "SARL Démo",
      referenceClient: "C-123",
      paiements: [tx("2026-09-05", -45.5), tx("2026-10-05", -45.5)],
      adresseDossier: "achats@suppliers.pennylane.com",
    });
    expect(d.subject).toBe("Demande de factures – SARL Démo");
    expect(d.body).toContain("Pourriez-vous s'il vous plaît");
    expect(d.body).toContain("05/09/2026");
    expect(d.body).toContain("Notre référence client : C-123");
    expect(d.body).toContain("achats@suppliers.pennylane.com");
    expect(d.body).not.toContain("merci de");
  });
  it("omet la référence vide et encode le lien", () => {
    const d = demandeFournisseur({
      fournisseur: "EDF",
      client: "",
      referenceClient: " ",
      paiements: [tx("2026-10-01", -10)],
    });
    expect(d.body).not.toContain("référence client");
    expect(d.subject).toBe("Demande de facture");
    expect(mailtoDemande("factures@edf.fr", d)).toMatch(
      /^mailto:factures%40edf\.fr\?subject=Demande%20de%20facture&body=/,
    );
  });
  it("rédigé par le cabinet pour le compte du client, avec les libellés bancaires", () => {
    const d = demandeFournisseur({
      fournisseur: "ORANGE",
      client: "SARL Démo",
      referenceClient: "C-9",
      paiements: [tx("2026-09-05", -45.5)],
      cabinet: "Cabinet Exemple",
    });
    expect(d.body).toContain("cabinet comptable de SARL Démo");
    expect(d.body).toContain("libellé bancaire : PRLV ORANGE");
    expect(d.body).toContain("Sa référence client : C-9");
    expect(d.body).toContain("Cabinet Exemple, pour le compte de SARL Démo");
  });
});
