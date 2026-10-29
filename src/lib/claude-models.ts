export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";

export const CLAUDE_MODELS = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (par défaut)" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (plus précis, plus cher)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (rapide, économique)" },
] as const;

export const isClaudeModel = (m: string) => /^claude-[a-z0-9.-]{3,60}$/.test(m);
