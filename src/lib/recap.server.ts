// Client recap (src/lib/recap-client.ts). No mail service (Julien, 29/10/2026: free, nothing to set up): the firm
// sends it from its own mail app (mailto) and confirms, which starts the 12-hour rule. The columns
// recap_auto, recap_relance_jours and recap_envoye_at (dossiers) come from the migration in the PR description,
// not yet in the generated types, hence the untyped client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { recapClient, type LigneRecap, type Recap } from "./recap-client";

export type ReglageRecap = {
  auto: boolean;
  relanceJours: number | null;
  dernierEnvoi: string | null;
};

export async function lireReglage(db: SupabaseClient, dossierId: string): Promise<ReglageRecap> {
  const { data, error } = await db
    .from("dossiers")
    .select("recap_auto, recap_relance_jours, recap_envoye_at")
    .eq("id", dossierId)
    .single();
  if (error)
    throw new Error(
      "Récapitulatif indisponible : la migration « recap client » n'est pas encore appliquée.",
    );
  const d = data as {
    recap_auto: boolean | null;
    recap_relance_jours: number | null;
    recap_envoye_at: string | null;
  };
  return {
    auto: !!d.recap_auto,
    relanceJours: d.recap_relance_jours,
    dernierEnvoi: d.recap_envoye_at,
  };
}

/** The recap of one dossier and its recipients (the client accounts of the dossier). */
export async function preparerRecap(
  db: SupabaseClient,
  dossierId: string,
  lien: string,
): Promise<{ recap: Recap | null; to: string[]; lignes: LigneRecap[]; dossier: string }> {
  const [d, m, t, c] = await Promise.all([
    db.from("dossiers").select("name").eq("id", dossierId).single(),
    db.from("dossier_members").select("email").eq("dossier_id", dossierId),
    db
      .from("transactions")
      .select("supplier, direction, date, label, amount, status, review_state, is_open, updated_at")
      .eq("dossier_id", dossierId)
      .eq("is_open", true)
      .eq("review_state", "sent")
      .eq("status", "a_faire"),
    db.from("cabinet_settings").select("name").eq("id", 1).maybeSingle(),
  ]);
  if (d.error) throw d.error;
  if (t.error) throw t.error;
  const lignes = (t.data ?? []) as LigneRecap[];
  const dossier = (d.data as { name: string }).name;
  const saved = (c.data as { name?: string | null } | null)?.name?.trim();
  const cabinet = saved && saved !== "Votre cabinet" ? saved : "Cabinet CA+";
  const to = [
    ...new Set(((m.data ?? []) as { email: string }[]).map((x) => x.email).filter(Boolean)),
  ];
  return { recap: recapClient(lignes, { dossier, cabinet, lien }), to, lignes, dossier };
}

export async function marquerEnvoye(
  db: SupabaseClient,
  dossierId: string,
  quand: Date,
): Promise<void> {
  const { error } = await db
    .from("dossiers")
    .update({ recap_envoye_at: quand.toISOString() })
    .eq("id", dossierId);
  if (error) throw error;
}
