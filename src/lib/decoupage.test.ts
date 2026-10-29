import { describe, expect, it } from "vitest";
import { controleDecoupage, estGroupe, lignesOperations } from "@/lib/decoupage";

const parent = {
  id: "p1",
  dossier_id: "d1",
  pennylane_id: "987",
  amount: -60,
  label: "FACTURE CARTE DU 30/09",
  direction: "out",
};

describe("découpage d'une ligne groupée", () => {
  it("reconnaît un débit carte différé ou un virement groupé", () => {
    expect(estGroupe("FACTURE CARTE DU 30/09/2026")).toBe(true);
    expect(estGroupe("Débit différé carte 4970")).toBe(true);
    expect(estGroupe("REMISE VIREMENTS 12 OPE")).toBe(true);
    expect(estGroupe("PRLV SEPA ORANGE")).toBe(false);
  });

  it("exige que les opérations retombent sur la ligne bancaire, au centime", () => {
    const ops = [
      { date: "2026-09-03", fournisseur: "Amazon", montant: 50 },
      { date: "2026-09-12", fournisseur: "Total", montant: 10 },
    ];
    expect(controleDecoupage(-60, ops)).toMatchObject({ ok: true, total: 60, ecart: 0 });
    const court = controleDecoupage(-70, ops);
    expect(court.ok).toBe(false);
    expect(court.ecart).toBe(10);
    expect(controleDecoupage(-50, [ops[0]!]).erreurs[0]).toContain("au moins 2");
  });

  it("crée des lignes « À valider » au signe de la ligne d'origine", () => {
    const rows = lignesOperations(
      parent,
      [
        { date: "2026-09-03", fournisseur: "AMAZON EU SARL", montant: 50 },
        { date: "2026-09-12", fournisseur: "Total", montant: -10 },
      ],
      new Map([["Total", "TotalEnergies"]]),
    );
    expect(rows.map((r) => r.pennylane_id)).toEqual(["987#1", "987#2"]);
    expect(rows.map((r) => r.amount)).toEqual([-50, -10]);
    expect(rows.every((r) => r.review_state === "pending" && r.parent_id === "p1")).toBe(true);
    expect(rows[1]!.supplier).toBe("TotalEnergies");
  });
});
