import { describe, expect, it } from "vitest";
import { regrouper, sameTiers, tiersKey } from "./regroupement";

describe("tiersKey", () => {
  it("drops accents, punctuation and legal forms", () => {
    expect(tiersKey("SARL Martin-Rénovation")).toBe("MARTIN RENOVATION");
  });
});

describe("sameTiers", () => {
  it("merges a name followed by more words", () => {
    expect(sameTiers("Leroy Merlin", "Leroy Merlin Bricolage")).toBe(true);
    expect(sameTiers("Leroy", "Leroy Merlin")).toBe(true);
  });
  it("merges a typo", () => {
    expect(sameTiers("Urssaf", "Urssaff")).toBe(true);
    expect(sameTiers("Boulanger", "Boulenger")).toBe(true);
  });
  it("keeps different suppliers apart", () => {
    expect(sameTiers("Orange", "Free")).toBe(false);
    expect(sameTiers("SFR", "SNCF")).toBe(false);
    expect(sameTiers("Bar", "Bar Tabac")).toBe(false);
  });
});

describe("regrouper", () => {
  const l = (supplier: string) => ({ supplier });
  it("groups alike tiers under the most frequent name", () => {
    const groups = regrouper([
      l("Leroy Merlin"),
      l("Leroy Merlin Bricolage"),
      l("Leroy Merlin"),
      l("Orange"),
    ]);
    expect(groups).toHaveLength(2);
    const lm = groups.find((g) => g.name === "Leroy Merlin")!;
    expect(lm.lines).toHaveLength(3);
    expect(lm.names).toEqual(["Leroy Merlin", "Leroy Merlin Bricolage"]);
  });
  it("groups a tiers stored with a bank word with the clean name", () => {
    expect(regrouper([l("Virt Tech"), l("Tech"), l("Prlvmt Facebk")])).toHaveLength(2);
    expect(regrouper([l("Urssaf Ile"), l("Urssaf")])).toHaveLength(1);
  });
  it("never merges unidentified tiers", () => {
    expect(regrouper([l("Autre"), l("Autres")])).toHaveLength(2);
  });
});
