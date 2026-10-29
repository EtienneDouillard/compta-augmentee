// Clé et modèle Claude utilisés par l'app. Clé saisie dans les paramètres (chiffrée) sinon secret du projet ;
// modèle choisi par rôle : « cabinet » pour les actions du cabinet, « client » pour celles du dirigeant.
import { DEFAULT_CLAUDE_MODEL } from "./claude-models";

export type ClaudeRole = "cabinet" | "client";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

export async function roleOf(userId: string): Promise<ClaudeRole> {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: any) => r.role === "cabinet") ? "cabinet" : "client";
}

export async function claudeApiKey(): Promise<string | undefined> {
  const db = await admin();
  const { data } = await db.from("ai_key").select("secret_blob").eq("id", 1).maybeSingle();
  if (data?.secret_blob) {
    try {
      const { decrypt } = await import("./mcp.server");
      return (await decrypt<{ key: string }>(data.secret_blob)).key;
    } catch (e) {
      console.error("ai_key decrypt failed", e);
    }
  }
  return process.env["ANTHROPIC_API_KEY"];
}

export async function claudeModel(role: ClaudeRole): Promise<string> {
  const db = await admin();
  const { data } = await db.from("ai_settings").select("model_cabinet, model_client").eq("id", 1).maybeSingle();
  return (role === "cabinet" ? data?.model_cabinet : data?.model_client) || DEFAULT_CLAUDE_MODEL;
}

/** Clé + modèle pour l'utilisateur qui déclenche l'action. */
export async function claudeFor(userId: string, role?: ClaudeRole) {
  const r = role ?? (await roleOf(userId));
  const [apiKey, model] = await Promise.all([claudeApiKey(), claudeModel(r)]);
  return { apiKey, model };
}
