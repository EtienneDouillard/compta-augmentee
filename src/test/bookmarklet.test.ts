import { describe, expect, it } from "vitest";
import { buildBookmarklet } from "@/lib/bookmarklet";

describe("bookmarklet robot CA+", () => {
  const href = buildBookmarklet(
    "caplus_abc123",
    "https://rapidapi.com/developer/billing/transaction-history",
    "https://app.example.com",
  );
  const code = decodeURIComponent(href.slice("javascript:".length));

  it("produit un favori javascript: qui embarque le jeton, la page et l'API", () => {
    expect(href.startsWith("javascript:")).toBe(true);
    expect(code).toContain("caplus_abc123");
    expect(code).toContain("https://rapidapi.com/developer/billing/transaction-history");
    expect(code).toContain("https://app.example.com/api/public/collector");
  });

  it("ouvre la page du fournisseur quand on n'y est pas encore (2e clic = collecte)", () => {
    expect(code).toContain("location.origin!==new URL(U).origin");
    expect(code).toContain('window.open(U,"_blank")');
  });

  it("n'envoie jamais les cookies du navigateur", () => {
    expect(code).not.toContain("document.cookie");
  });
});
