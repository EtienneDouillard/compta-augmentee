import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { prochainEnvoiPossible, recapDu, RELANCES_JOURS } from "./recap-client";

// Firm only: the recap reads every request of the dossier and writes the last sending date.
async function dbCabinet(context: { supabase: SupabaseClient; userId: string }) {
  const { data: isCabinet } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "cabinet",
  });
  if (!isCabinet) throw new Error("Accès refusé");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

const heure = (d: Date) =>
  d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

export type RecapPret = {
  dossierId: string;
  dossier: string;
  statut: "pret" | "attente" | "rien" | "sans_compte" | "erreur";
  /** The reminder schedule (or new requests, if the firm asked to be told) says it is time to write. */
  relanceDue?: boolean;
  detail?: string;
  to?: string[];
  subject?: string;
  text?: string;
  nbFactures?: number;
};

/**
 * The recap of each dossier, ready to open in the firm's mail app. A dossier written to less than 12 hours ago
 * comes back "attente" with the time it may be written to again.
 */
export const preparerRecaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ dossierIds: z.array(z.string().uuid()).max(200), lien: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await dbCabinet(context as never);
    const { lireReglage, preparerRecap } = await import("./recap.server");
    const now = new Date();
    const out: RecapPret[] = [];
    for (const dossierId of data.dossierIds) {
      let dossier = "";
      try {
        const reglage = await lireReglage(db, dossierId);
        const p = await preparerRecap(db, dossierId, data.lien);
        dossier = p.dossier;
        const next = prochainEnvoiPossible(reglage.dernierEnvoi, now);
        if (!p.recap) out.push({ dossierId, dossier, statut: "rien" });
        else if (!p.to.length) out.push({ dossierId, dossier, statut: "sans_compte" });
        else if (next) out.push({ dossierId, dossier, statut: "attente", detail: heure(next) });
        else
          out.push({
            dossierId,
            dossier,
            statut: "pret",
            relanceDue: recapDu(p.lignes, reglage, now),
            to: p.to,
            subject: p.recap.subject,
            text: p.recap.text,
            nbFactures: p.recap.nbFactures,
          });
      } catch (e) {
        out.push({ dossierId, dossier, statut: "erreur", detail: (e as Error).message });
      }
    }
    return out;
  });

/** Recap panel of one dossier: its settings and the recap as it would leave now. */
export const etatRecap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ dossierId: z.string().uuid(), lien: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await dbCabinet(context as never);
    const { lireReglage, preparerRecap } = await import("./recap.server");
    const now = new Date();
    const reglage = await lireReglage(db, data.dossierId);
    const { recap, to, lignes } = await preparerRecap(db, data.dossierId, data.lien);
    const next = prochainEnvoiPossible(reglage.dernierEnvoi, now);
    return {
      reglage,
      recap,
      to,
      relanceDue: recapDu(lignes, reglage, now),
      prochainEnvoi: next ? heure(next) : null,
    };
  });

/** The firm sent the recap from its own mail app: the 12-hour rule and the reminder delay start now. */
export const confirmerRecapEnvoye = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dossierId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await dbCabinet(context as never);
    const { marquerEnvoye } = await import("./recap.server");
    await marquerEnvoye(db, data.dossierId, new Date());
    return { ok: true };
  });

/** Reminder schedule of a dossier: flag new requests (12 h apart) and/or a reminder every N days. */
export const reglerRecap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        dossierId: z.string().uuid(),
        auto: z.boolean(),
        relanceJours: z
          .number()
          .int()
          .refine((n) => (RELANCES_JOURS as readonly number[]).includes(n))
          .nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await dbCabinet(context as never);
    const { error } = await db
      .from("dossiers")
      .update({ recap_auto: data.auto, recap_relance_jours: data.relanceJours })
      .eq("id", data.dossierId);
    if (error)
      throw new Error(
        "Réglage impossible : la migration « recap client » n'est pas encore appliquée.",
      );
    return { ok: true };
  });
