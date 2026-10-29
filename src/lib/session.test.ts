import { describe, expect, it } from "vitest";
import { groupBySupplier, nomGroupe, type Tx } from "./session";

const tx = (supplier: string, amount: number): Tx =>
  ({
    id: supplier + amount,
    dossier_id: "d",
    pennylane_id: "p",
    date: "2026-10-01",
    amount,
    label: supplier,
    supplier,
    supplier_detected: supplier,
    status: "a_faire",
    comment: null,
    direction: "out",
  }) as Tx;

describe("regroupement par fournisseur côté client", () => {
  it("met l'acompte et le solde d'un même achat chez le même fournisseur", () => {
    expect(nomGroupe("Maison Richoux Acompte")).toBe("Maison Richoux");
    expect(nomGroupe("Échéance Lixxbail")).toBe("Lixxbail");
    expect(nomGroupe("Solde")).toBe("Solde");
    const groups = groupBySupplier([
      tx("Maison Richoux Acompte", -800),
      tx("Maison Richoux Solde", -520),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      name: "Maison Richoux",
      key: "achat:Maison Richoux",
      total: 1320,
    });
  });
});
