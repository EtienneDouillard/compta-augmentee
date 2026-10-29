import { describe, expect, it } from "vitest";
import { faviconUrl, siteFournisseur } from "./logos";

describe("logos des fournisseurs", () => {
  it("prend d'abord le site de la source de factures", () => {
    expect(siteFournisseur("OPENROUTER", "https://openrouter.ai/settings/billing")).toBe(
      "openrouter.ai",
    );
  });
  it("reconnaît un fournisseur courant sur un mot entier", () => {
    expect(siteFournisseur("PRLV SEPA ORANGE SA")).toBe("orange.fr");
    expect(siteFournisseur("Amazon Payments Europe")).toBe("amazon.fr");
    expect(siteFournisseur("ORANGERIE DU PARC")).toBeNull();
  });
  it("refuse une source qui n'est pas en HTTPS", () => {
    expect(siteFournisseur("X", "http://exemple.fr")).toBeNull();
    expect(faviconUrl("edf.fr")).toBe("https://edf.fr/favicon.ico");
  });
});
