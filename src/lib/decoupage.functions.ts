import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { costUsd } from "@/lib/analysis";
import {
  controleDecoupage,
  lignesOperations,
  MAX_OPERATIONS,
  type Operation,
} from "@/lib/decoupage";
import { MAX_FICHIER_OCTETS, RESERVE_LECTURE_USD, typeMedia } from "@/lib/saisie";
import { budget, requireCabinetRole } from "@/lib/saisie.functions";

// Découpage (Simon 7) : Claude lit le relevé de carte ou le détail du virement déposé sur la ligne, le cabinet
// corrige au besoin, puis la ligne est découpée en opérations « À valider ». Réservé au cabinet.
const UNAVAILABLE =
  "Découpage indisponible : la base de données n'est pas encore à jour (migration à appliquer).";

const SYSTEM_RELEVE = `Tu lis un relevé de carte bancaire (débit différé) ou le détail d'une remise de virements groupés, pour un cabinet comptable français.
Liste chaque opération, une par ligne du document, sans en regrouper ni en oublier :
- date : date de l'opération au format AAAA-MM-JJ ;
- fournisseur : nom du commerçant ou du bénéficiaire tel qu'imprimé ;
- montant : montant en euros, toujours positif.
N'inclus pas les lignes de total, de solde, de report ni les en-têtes. Inclus les frais ou cotisations de carte s'ils font partie du débit.
Si le document n'est pas un relevé de carte ni un détail de virements, renvoie une liste vide.`;

const OUTPUT_SCHEMA_RELEVE = {
  type: "object",
  properties: {
    operations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          fournisseur: { type: "string" },
          montant: { type: "number" },
        },
        required: ["date", "fournisseur", "montant"],
        additionalProperties: false,
      },
    },
  },
  required: ["operations"],
  additionalProperties: false,
};

export const lireReleve = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ uploadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    await requireCabinetRole(db, context.userId);
    const { data: u } = await db
      .from("uploads")
      .select("id, dossier_id, storage_path, file_name")
      .eq("id", data.uploadId)
      .maybeSingle();
    if (!u) throw new Error("Pièce introuvable.");
    const media = typeMedia(u.file_name);
    if (!media)
      throw new Error("Seuls les PDF et les images (PNG, JPEG, WebP, GIF) peuvent être lus.");
    const { cap, spent } = await budget(db);
    if (spent + RESERVE_LECTURE_USD > cap)
      throw new Error(
        `Plafond mensuel Claude atteint : ${spent.toFixed(2)} $ dépensés sur ${cap.toFixed(2)} $.`,
      );

    const { data: blob, error: e1 } = await db.storage.from("factures").download(u.storage_path);
    if (e1 || !blob) throw new Error("Pièce illisible dans le stockage.");
    if (blob.size > MAX_FICHIER_OCTETS)
      throw new Error("Pièce trop lourde (plus de 10 Mo) pour être lue.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const source = { type: "base64" as const, media_type: media, data: btoa(bin) };
    const piece =
      media === "application/pdf"
        ? { type: "document" as const, source }
        : { type: "image" as const, source };

    const { apiKey, model } = await (
      await import("./claude-config.server")
    ).claudeFor(context.userId);
    if (!apiKey)
      throw new Error("La lecture n'est pas encore configurée : la clé ANTHROPIC_API_KEY manque.");
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey, maxRetries: 1 });
    let final: any;
    try {
      final = await client.messages
        .stream({
          model,
          max_tokens: 16000,
          system: SYSTEM_RELEVE,
          messages: [
            {
              role: "user",
              content: [piece, { type: "text", text: "Liste les opérations de ce document." }],
            },
          ],
          output_config: {
            effort: "medium",
            format: { type: "json_schema", schema: OUTPUT_SCHEMA_RELEVE },
          },
        } as any)
        .finalMessage();
    } catch (err: any) {
      console.error("releve-lecture", err?.status, err?.message);
      throw new Error("Claude est momentanément indisponible. Réessayez plus tard.");
    }
    const cost = costUsd(final.usage);
    // Logged with the analyses so the monthly cap covers every Claude call.
    await db.from("ai_analysis_runs").insert({
      dossier_id: u.dossier_id,
      user_id: context.userId,
      model,
      kind: "releve",
      lines_analyzed: 0,
      input_tokens: final.usage.input_tokens,
      output_tokens: final.usage.output_tokens,
      cost_usd: Number(cost.toFixed(4)),
    });
    if (final.stop_reason === "max_tokens")
      throw new Error(
        "Relevé trop long : la lecture a été interrompue. Saisissez les opérations à la main.",
      );
    let operations: Operation[] = [];
    try {
      const text = final.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
      operations = (JSON.parse(text).operations ?? [])
        .filter((o: any) => o && typeof o.montant === "number")
        .map((o: any) => ({
          date: String(o.date ?? ""),
          fournisseur: String(o.fournisseur ?? "").trim(),
          montant: Math.abs(o.montant),
        }))
        .slice(0, MAX_OPERATIONS);
    } catch {
      operations = [];
    }
    if (!operations.length) throw new Error("Claude n'a pas trouvé d'opérations dans ce document.");
    return { operations, cost };
  });

const OperationInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fournisseur: z.string().trim().min(1).max(200),
  montant: z.number().finite(),
});

export const decouper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        transactionId: z.string().uuid(),
        operations: z.array(OperationInput).min(2).max(MAX_OPERATIONS),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    await requireCabinetRole(db, context.userId);
    const { data: p, error } = await db
      .from("transactions")
      .select("*")
      .eq("id", data.transactionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Ligne introuvable.");
    if (!("parent_id" in p)) throw new Error(UNAVAILABLE);
    if (p.parent_id) throw new Error("Cette ligne est déjà une opération issue d'un découpage.");
    if (p.decoupee) throw new Error("Cette ligne est déjà découpée.");
    const c = controleDecoupage(Number(p.amount), data.operations);
    if (!c.ok) throw new Error(c.erreurs.join(" "));

    const { data: aliases } = await db
      .from("supplier_aliases")
      .select("detected_name, display_name")
      .eq("dossier_id", p.dossier_id);
    const alias = new Map<string, string>(
      (aliases ?? []).map((a: any) => [a.detected_name, a.display_name]),
    );
    const rows = lignesOperations(p, data.operations, alias);
    const { data: created, error: e1 } = await db.from("transactions").insert(rows).select("id");
    if (e1) throw new Error(`Découpage impossible : ${e1.message}`);
    // The bank line leaves the client's view (only "sent" lines are shown): its operations replace it.
    const { error: e2 } = await db
      .from("transactions")
      .update({ decoupee: true, review_state: "dismissed" })
      .eq("id", p.id);
    if (e2) {
      await db
        .from("transactions")
        .delete()
        .in(
          "id",
          (created ?? []).map((r: any) => r.id),
        );
      throw new Error(`Découpage impossible : ${e2.message}`);
    }
    // Default "ne plus demander" rules apply to the new lines as to any synced line.
    const skipped = await (
      await import("@/lib/sync.server")
    )
      .applySkipRules(p.dossier_id)
      .catch(() => 0);
    return { created: created?.length ?? 0, skipped };
  });

export const annulerDecoupage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ transactionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    await requireCabinetRole(db, context.userId);
    const { data: ops, error } = await db
      .from("transactions")
      .select("id, review_state")
      .eq("parent_id", data.transactionId);
    if (error) throw new Error(UNAVAILABLE);
    if ((ops ?? []).some((o: any) => o.review_state === "sent"))
      throw new Error(
        "Des opérations sont déjà envoyées au client : retirez-les d'abord de son espace.",
      );
    const { error: e1 } = await db
      .from("transactions")
      .delete()
      .eq("parent_id", data.transactionId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await db
      .from("transactions")
      .update({ decoupee: false, review_state: "pending" })
      .eq("id", data.transactionId);
    if (e2) throw new Error(e2.message);
    return { removed: ops?.length ?? 0 };
  });
