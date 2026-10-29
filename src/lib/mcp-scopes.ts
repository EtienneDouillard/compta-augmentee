// Scopes asked to Pennylane's MCP when connecting. The read scopes below are always asked. Pennylane does not
// publish the name of the scope that opens run_operations (used by the saisie augmentée on demo dossiers), so every
// scope its OAuth metadata lists (RFC 8414, scopes_supported) is asked too: a narrower guess on the name asked only
// the read scopes, and reconnecting never gave the operations. The demo-only rule stays enforced on every call
// (mcpCallAllowed), whatever the token allows.
export const MCP_READ_SCOPES = [
  "mcp:transaction:read",
  "mcp:ledger_entry:read",
  "mcp:ledger_entry_line:read",
  "mcp:supplier:read",
  "mcp:customer:read",
  "mcp:company:read", // get_context
  "mcp:companies:read", // list_companies (firm portfolio)
];

export function scopesDemandes(supported: readonly unknown[] | undefined) {
  const extra = (supported ?? []).filter((sc): sc is string => typeof sc === "string" && /^\S+$/.test(sc) && !MCP_READ_SCOPES.includes(sc));
  return [...MCP_READ_SCOPES, ...new Set(extra)].join(" ");
}
