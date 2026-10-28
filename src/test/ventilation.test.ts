import { describe, expect, it } from "vitest";
import { alertes, controle, meriteEclatement, totaux } from "@/lib/ventilation";
import { factures } from "@/lib/demo-data";

describe("ventilation", () => {
  it("chaque facture de démo retombe sur ses totaux HT/TVA/TTC", () => {
    for (const f of factures) expect(controle(f).ok, f.numero).toBe(true);
  });

  it("détecte un écart de totaux", () => {
    const f = { ...factures[0], totalHt: factures[0].totalHt + 10 };
    expect(controle(f).ok).toBe(false);
    expect(controle(f).ecartHt).toBe(-10);
  });

  it("calcule la TVA ligne par ligne", () => {
    const t = totaux([
      { id: "a", compte: "6226", compteLibelle: "", libelle: "", ht: 100, tauxTva: 0.2 },
      { id: "b", compte: "6064", compteLibelle: "", libelle: "", ht: 50, tauxTva: 0.055 },
    ]);
    expect(t).toEqual({ ht: 150, tva: 22.75, ttc: 172.75 });
  });

  it("éclate dès 2 comptes différents, pas pour une ligne simple", () => {
    const l = { id: "a", compte: "6226", compteLibelle: "", libelle: "", ht: 100, tauxTva: 0.2 };
    expect(meriteEclatement([l])).toBe(false);
    expect(meriteEclatement([l, { ...l, id: "b", compte: "6156" }])).toBe(true);
  });

  it("alerte si un bien > 500 € HT est en charge", () => {
    const a = alertes([
      { id: "a", compte: "6063", compteLibelle: "", libelle: "Écran", ht: 600, tauxTva: 0.2, nature: "immobilisation" },
    ]);
    expect(a).toHaveLength(1);
    expect(
      alertes([{ id: "a", compte: "2183", compteLibelle: "", libelle: "Écran", ht: 600, tauxTva: 0.2, nature: "immobilisation" }]),
    ).toHaveLength(0);
  });
});
