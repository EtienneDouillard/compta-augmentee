import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Portail client public : l'accès est contrôlé par le jeton secret du dossier.
export const getClientDossier = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(8).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: dossier } = await supabaseAdmin
      .from("dossiers").select("id, nom, client_nom").eq("client_token", data.token).maybeSingle();
    if (!dossier) return null;
    const { data: pieces } = await supabaseAdmin
      .from("pieces_manquantes").select("id, date, libelle, montant, action, statut")
      .eq("dossier_id", dossier.id).order("date");
    return { nom: dossier.nom, client_nom: dossier.client_nom, pieces: pieces ?? [] };
  });

export const deposerPiece = createServerFn({ method: "POST" })
  .inputValidator((d) => {
    if (!(d instanceof FormData)) throw new Error("FormData attendu");
    const file = d.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 20 * 1024 * 1024) throw new Error("Fichier invalide (20 Mo max)");
    return {
      token: z.string().min(8).max(64).parse(d.get("token")),
      pieceId: z.string().uuid().parse(d.get("pieceId")),
      commentaire: z.string().max(500).optional().parse(d.get("commentaire") || undefined),
      file,
    };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: dossier } = await supabaseAdmin.from("dossiers").select("id").eq("client_token", data.token).maybeSingle();
    if (!dossier) throw new Error("Lien invalide");
    const { data: piece } = await supabaseAdmin.from("pieces_manquantes").select("id, libelle").eq("id", data.pieceId).eq("dossier_id", dossier.id).maybeSingle();
    if (!piece) throw new Error("Pièce introuvable");
    const safe = data.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${dossier.id}/${piece.id}/${Date.now()}-${safe}`;
    const { error } = await supabaseAdmin.storage.from("justificatifs").upload(path, data.file, { contentType: data.file.type || "application/octet-stream" });
    if (error) throw new Error("Échec de l'envoi : " + error.message);
    await supabaseAdmin.from("pieces_manquantes").update({ statut: "recue", fichier_path: path, commentaire_client: data.commentaire ?? null, recu_le: new Date().toISOString() }).eq("id", piece.id);
    await supabaseAdmin.from("journal").insert({ dossier_id: dossier.id, auteur: "Client", message: `Justificatif déposé pour ${piece.libelle} (${safe})` });
    return { ok: true };
  });
