import { describe, expect, it } from "vitest";
import { MCP_READ_SCOPES, scopesDemandes } from "./mcp-scopes";

describe("scopes demandés à Pennylane (MCP)", () => {
  it("sans métadonnées : lecture seule", () => {
    expect(scopesDemandes(undefined)).toBe(MCP_READ_SCOPES.join(" "));
  });
  it("ajoute tous les scopes proposés par Pennylane, même sans « operation » dans le nom", () => {
    const s = scopesDemandes(["mcp:transaction:read", "mcp:private_api:write", "mcp:run", "mcp:run"]).split(" ");
    expect(s).toContain("mcp:private_api:write");
    expect(s.filter((x) => x === "mcp:run")).toHaveLength(1);
    expect(s.filter((x) => x === "mcp:transaction:read")).toHaveLength(1);
  });
  it("ignore les valeurs invalides", () => {
    expect(scopesDemandes([42, "a b", ""])).toBe(MCP_READ_SCOPES.join(" "));
  });
});
