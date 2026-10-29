import { describe, expect, it } from "vitest";
import { etatEnvoi, type PourEnvoi } from "./envoi-groupe";
import type { Facture } from "./ventilation";

const facture = (over: Partial<Facture> = {}): Facture => ({
  id: "s1",
  numero: "F-1",
  fournisseur: "REVIEW",
  date: "2026-10-08",
  totalHt: 100,
  totalTva: 20,
  totalTtc: 120,
  libelleGenerique: "",
  libelleEcriture: "Honoraires octobre 2026",
  lignes: [
    {
      id: "l1",
      compte: "6226",
      compteLibelle: "Honoraires",
      libelle: "Mission conseil",
      ht: 100,
      tauxTva: 0.2,
    },
  ],
  ...over,
});
const saisie = (over: Partial<PourEnvoi> = {}): PourEnvoi => ({
  state: "proposee",
  pennylaneInvoiceId: null,
  fileName: "facture.pdf",
  facture: facture(),
  ...over,
});

describe("envoi groupé", () => {
  it("valide puis envoie une proposition sans écart", () => {
    expect(etatEnvoi(saisie())).toEqual({ pret: true, aValider: true });
  });
  it("envoie sans revalider une saisie déjà validée", () => {
    expect(etatEnvoi(saisie({ state: "validee" }))).toEqual({ pret: true, aValider: false });
  });
  it("ne renvoie jamais une facture déjà dans Pennylane", () => {
    expect(etatEnvoi(saisie({ state: "validee", pennylaneInvoiceId: "123" }))).toMatchObject({
      pret: false,
      raison: "Déjà dans Pennylane.",
    });
  });
  it("écarte une pièce qui n'est pas un PDF", () => {
    expect(etatEnvoi(saisie({ fileName: "photo.jpg" })).pret).toBe(false);
  });
  it("écarte une proposition dont les totaux ne retombent pas", () => {
    expect(etatEnvoi(saisie({ facture: facture({ totalTtc: 130, totalHt: 110 }) }))).toMatchObject({
      pret: false,
    });
  });
  it("écarte une proposition avec un compte hors plan ANC 2026", () => {
    const f = facture({
      lignes: [
        { id: "l1", compte: "abc", compteLibelle: "", libelle: "Mission", ht: 100, tauxTva: 0.2 },
      ],
    });
    const e = etatEnvoi(saisie({ facture: f }));
    expect(e.pret).toBe(false);
    if (!e.pret) expect(e.raison).toContain("Mission");
  });
  it("écarte les propositions rejetées ou illisibles", () => {
    expect(etatEnvoi(saisie({ state: "rejetee" })).pret).toBe(false);
    expect(etatEnvoi(saisie({ state: "echec" })).pret).toBe(false);
  });
  it("écarte une facture sans date", () => {
    expect(etatEnvoi(saisie({ state: "validee", facture: facture({ date: "" }) })).pret).toBe(
      false,
    );
  });
  it("écarte une facture proforma ou un devis", () => {
    expect(etatEnvoi(saisie({ typeDocument: "proforma" })).pret).toBe(false);
    expect(etatEnvoi(saisie({ state: "validee", typeDocument: "devis" })).pret).toBe(false);
    expect(etatEnvoi(saisie({ typeDocument: "facture" })).pret).toBe(true);
  });
});
