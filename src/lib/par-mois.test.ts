import { describe, expect, it } from "vitest";
import { parMois } from "@/lib/par-mois";

describe("parMois", () => {
  it("covers the 12 months of a single year and splits justified from to-justify", () => {
    const r = parMois([
      { date: "2026-03-04", amount: "-120.5", status: "depose" },
      { date: "2026-03-20", amount: -30, status: "a_faire" },
      { date: "2026-07-01", amount: 10, status: "sans_facture" },
    ]);
    expect(r).toHaveLength(12);
    expect(r[0]!.mois).toBe("2026-01");
    expect(r[2]).toEqual({ mois: "2026-03", justifie: 120.5, aJustifier: 30 });
    expect(r[6]).toEqual({ mois: "2026-07", justifie: 10, aJustifier: 0 });
  });

  it("spans several years from the first month to the last", () => {
    const r = parMois([
      { date: "2025-11-10", amount: 1, status: "a_faire" },
      { date: "2026-02-10", amount: 2, status: "a_faire" },
    ]);
    expect(r.map((m) => m.mois)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("returns nothing without lines", () => {
    expect(parMois([])).toEqual([]);
  });
});
