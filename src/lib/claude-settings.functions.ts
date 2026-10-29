import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_CLAUDE_MODEL, isClaudeModel } from "./claude-models";

async function requireCabinet(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "cabinet" });
  if (!data) throw new Error("Réservé au cabinet.");
}

export const getClaudeSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireCabinet(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: s }, { data: k }] = await Promise.all([
      supabaseAdmin.from("ai_settings").select("model_cabinet, model_client").eq("id", 1).maybeSingle(),
      supabaseAdmin.from("ai_key").select("updated_at").eq("id", 1).maybeSingle(),
    ]);
    return {
      modelCabinet: s?.model_cabinet ?? DEFAULT_CLAUDE_MODEL,
      modelClient: s?.model_client ?? DEFAULT_CLAUDE_MODEL,
      keySource: k ? ("custom" as const) : process.env["ANTHROPIC_API_KEY"] ? ("default" as const) : ("none" as const),
      keyUpdatedAt: k?.updated_at ?? null,
    };
  });

const model = z.string().trim().refine(isClaudeModel, "Identifiant de modèle invalide.");

export const saveClaudeSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    modelCabinet: model, modelClient: model,
    apiKey: z.string().trim().min(20).max(400).regex(/^sk-ant-/, "La clé doit commencer par sk-ant-").optional(),
    resetKey: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireCabinet(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.apiKey) {
      const ok = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": data.apiKey, "anthropic-version": "2023-06-01" } });
      if (!ok.ok) throw new Error(`Clé refusée par Anthropic (${ok.status}).`);
    }
    const { error } = await supabaseAdmin.from("ai_settings").update({ model_cabinet: data.modelCabinet, model_client: data.modelClient, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error(error.message);
    if (data.resetKey) await supabaseAdmin.from("ai_key").delete().eq("id", 1);
    else if (data.apiKey) {
      const { encrypt } = await import("./mcp.server");
      const { error: e } = await supabaseAdmin.from("ai_key").upsert({ id: 1, secret_blob: await encrypt({ key: data.apiKey }), updated_by: context.userId, updated_at: new Date().toISOString() });
      if (e) throw new Error(e.message);
    }
    return { ok: true };
  });
