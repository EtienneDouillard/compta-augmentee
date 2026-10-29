import { describe, it, expect } from "vitest";
import { DEFAULT_CLAUDE_MODEL, isClaudeModel } from "./claude-models";
describe("modèles Claude", () => {
  it("Sonnet 5.5 par défaut", () => expect(DEFAULT_CLAUDE_MODEL).toBe("claude-sonnet-5-5"));
  it("refuse un identifiant qui n'est pas Claude", () => { expect(isClaudeModel("gpt-5")).toBe(false); expect(isClaudeModel("claude-opus-5-5")).toBe(true); });
});
