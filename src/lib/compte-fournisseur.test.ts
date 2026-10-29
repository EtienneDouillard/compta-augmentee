import { describe, expect, it } from "vitest";
import { compteAuxiliaire, compteFournisseur } from "@/lib/compte-fournisseur";

describe("compteAuxiliaire", () => {
  it("builds 401 + supplier name without legal form or area", () => {
    expect(compteAuxiliaire("AMAZON EU SARL")).toBe("401AMAZON");
    expect(compteAuxiliaire("Maison Richoux")).toBe("401MAISONRICHOUX");
    expect(compteAuxiliaire("Société Générale")).toBe("401GENERALE");
    expect(compteAuxiliaire("B & B Hôtels")).toBe("401BBHOTELS");
  });

  it("caps the name and falls back to 401", () => {
    expect(compteAuxiliaire("Terra-Gaña Consulting International")).toBe("401TERRAGANACONSUL");
    expect(compteAuxiliaire("")).toBe("401");
  });
});

describe("compteFournisseur", () => {
  it("shows 401 + name and keeps Pennylane's numbered account apart", () => {
    expect(compteFournisseur("AMAZON EU SARL", "401100012")).toEqual({ compte: "401AMAZON", pennylane: "401100012" });
    expect(compteFournisseur("AMAZON EU SARL", null)).toEqual({ compte: "401AMAZON", pennylane: null });
  });

  it("keeps a Pennylane account already named after the supplier", () => {
    expect(compteFournisseur("Boulanger", "401BOULA")).toEqual({ compte: "401BOULA", pennylane: null });
    expect(compteFournisseur("Action", "401ACT2")).toEqual({ compte: "401ACT2", pennylane: null });
  });
});
