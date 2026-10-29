import { describe, expect, it } from "vitest";
import { initials, normalizeSupplier } from "./supplier";

describe("normalizeSupplier", () => {
  it("groups CB AMAZON and AMAZON PAYMENTS as Amazon", () => {
    expect(normalizeSupplier("CB AMAZON 12/10")).toBe("Amazon");
    expect(normalizeSupplier("AMAZON PAYMENTS EUROPE")).toBe("Amazon");
    expect(normalizeSupplier("AMZN MKTP FR*1A2B3")).toBe("Amazon");
  });
  it("strips bank noise for unknown suppliers", () => {
    expect(normalizeSupplier("PRLV SEPA BOULANGERIE DUPONT 123456")).toBe("Boulangerie Dupont");
  });
  // Labels of the hackathon demo dossier (Julien, 29/10/2026: « VIRT AMAZON, le fournisseur c'est Amazon »).
  it("puts the deposit and the balance of one purchase on the same supplier", () => {
    expect(normalizeSupplier("VIR MAISON RICHOUX ACOMPTE")).toBe(normalizeSupplier("VIR SEPA MAISON RICHOUX SOLDE"));
    expect(normalizeSupplier("PRLV ACOMPTE MAISON RICHOUX")).toBe("Maison Richoux");
  });
  it("drops bank prefixes so every payment mode lands on the same supplier", () => {
    expect(normalizeSupplier("VIRT AMAZON")).toBe("Amazon");
    expect(normalizeSupplier("PRLVT AMAZON")).toBe("Amazon");
    expect(normalizeSupplier("VIRT TECH ET CIE")).toBe("Tech et Cie");
    expect(normalizeSupplier("PRLVT TECH ET CIE")).toBe("Tech et Cie");
    expect(normalizeSupplier("PRLVMT FACEBK META IE9692928")).toBe("Meta");
    expect(normalizeSupplier("VIRT RED SFR - CONTRAT 99-1GWPT1")).toBe("SFR");
    expect(normalizeSupplier("CB BRASSERIE BILBON SACQUET")).toBe("Brasserie Bilbon");
    expect(normalizeSupplier("RBST LIXXBAIL ECHEANCE")).toBe("Lixxbail");
  });
});

describe("initials", () => {
  it("takes the first letters of the first two significant words", () => {
    expect(initials("Leroy Merlin")).toBe("LM");
    expect(initials("SARL Martin Rénovation")).toBe("MR");
    expect(initials("Votre cabinet")).toBe("VC");
  });
  it("takes two letters of a single word", () => {
    expect(initials("Amazon")).toBe("AM");
    expect(initials("OVHcloud")).toBe("OV");
  });
  it("never returns an empty monogram", () => {
    expect(initials("")).toBe("?");
  });
});
