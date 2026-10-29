import { describe, expect, it } from "vitest";
import { siteDepuisPaiement } from "./logos";

describe("siteDepuisPaiement", () => {
  it("takes the domain written in the bank label", () => {
    expect(siteDepuisPaiement("Nokia", ["Card transaction of 486.52 USD issued by NOKIA OF AMERICA CORP NOKIA.COM"])).toBe("https://nokia.com");
  });
  it("handles www and .fr", () => {
    expect(siteDepuisPaiement("ZCF", ["PRLV SEPA www.zcf.fr facture"])).toBe("https://zcf.fr");
  });
  it("falls back to well-known suppliers", () => {
    expect(siteDepuisPaiement("Orange", ["PRLV ORANGE SA"])).toBe("https://orange.fr");
  });
  it("returns null when nothing is known", () => {
    expect(siteDepuisPaiement("Dupont Plomberie", ["VIR DUPONT 12.50"])).toBeNull();
  });
});
