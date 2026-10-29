import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TOKEN_PREFIX, hashToken } from "./collector";

// Pairs the Robot Chrome with a dossier: the token is shown once, only its hash is kept.
export const createCollectorToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dossierId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: d } = await context.supabase.from("dossiers").select("id").eq("id", data.dossierId).maybeSingle();
    if (!d) throw new Error("Dossier inaccessible.");
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = TOKEN_PREFIX + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("collector_tokens").insert({
      dossier_id: data.dossierId, token_hash: await hashToken(token), created_by: context.userId,
    });
    if (error) throw new Error("Jeton impossible à créer.");
    return { token };
  });

// Marks a source as collected by the Robot Chrome, with the page the robot opens each month.
export const setRobotSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    dossierId: z.string().uuid(), supplier: z.string().min(1).max(200),
    sourceUrl: z.string().url().max(500), robotUrl: z.string().url().max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("invoice_sources").upsert({
      dossier_id: data.dossierId, supplier: data.supplier, source_url: data.sourceUrl, robot_url: data.robotUrl,
      method: "browser", state: "awaiting_first_invoice", auto_send_documents: true, updated_at: new Date().toISOString(),
    }, { onConflict: "dossier_id,supplier" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
