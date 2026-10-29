import { describe, expect, it } from "vitest";
import { AIDE_CHOIX, AIDE_DEMANDE, APRES_TERMINE, SOUS_TITRES, VISITE } from "./aide-client";

describe("textes d'aide du client", () => {
  it("explique chaque choix : quand le prendre et ce qui se passe ensuite", () => {
    expect(Object.keys(AIDE_CHOIX).sort()).toEqual([
      "cabinet",
      "email",
      "none",
      "source",
      "upload",
    ]);
    for (const a of Object.values(AIDE_CHOIX)) {
      expect(a.quand.length).toBeGreaterThan(20);
      expect(a.apres.length).toBeGreaterThan(20);
    }
  });
  it("propose une visite guidée en 3 étapes", () => {
    expect(VISITE).toHaveLength(3);
    for (const e of VISITE) expect(e.titre && e.texte).toBeTruthy();
  });
  it("donne un sous-titre à chaque écran et la suite une fois terminé", () => {
    for (const t of Object.values(SOUS_TITRES)) expect(t.length).toBeGreaterThan(20);
    expect(APRES_TERMINE.length).toBeGreaterThan(0);
  });
  it("reste sans jargon : ni compte, ni écriture, ni pièce comptable", () => {
    const tout = [
      ...Object.values(AIDE_CHOIX).flatMap((a) => [a.quand, a.apres]),
      ...VISITE.flatMap((e) => [e.titre, e.texte]),
      ...Object.values(SOUS_TITRES),
      ...APRES_TERMINE,
      AIDE_DEMANDE,
    ].join(" ");
    expect(tout).not.toMatch(/\b(lettrage|écriture|imputation|pièce comptable|rapprochement)\b/i);
  });
  it("ne promet aucun envoi fait par l'application au fournisseur", () => {
    expect(AIDE_DEMANDE).toMatch(/rien n'est envoyé sans vous/);
  });
});
