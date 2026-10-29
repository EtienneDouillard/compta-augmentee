import { describe, expect, it } from "vitest";
import { hashToken, matchTransaction } from "./collector";

const txs = [
  { id: "a", date: "2026-09-19", amount: -423.65 },
  { id: "b", date: "2026-06-02", amount: -100 },
];

describe("robot Chrome", () => {
  it("rattache la facture au paiement le plus proche en date", () => {
    expect(matchTransaction(txs, "2026-09-21")?.id).toBe("a");
  });
  it("refuse au-delà de 45 jours d'écart", () => {
    expect(matchTransaction(txs, "2026-12-30")).toBeNull();
  });
  it("sans date, prend le paiement le plus récent", () => {
    expect(matchTransaction(txs, null)?.id).toBe("a");
  });
  it("ne stocke jamais le jeton en clair", async () => {
    const h = await hashToken("caplus_x");
    expect(h).toHaveLength(64);
    expect(h).not.toContain("caplus");
  });
});
