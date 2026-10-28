import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { LignePiece } from "./eclatement";

/** Lit les lignes détaillées d'une pièce PDF/image avec l'IA (lecture seule, rien n'est écrit dans Pennylane). */
export const lireLignesPiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ piecePath: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: blob, error } = await context.supabase.storage.from("justificatifs").download(data.piecePath);
    if (error || !blob) throw new Error("Pièce introuvable");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const mime = blob.type || (data.piecePath.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: "Tu lis des factures fournisseurs françaises. Extrais chaque ligne de désignation telle qu'imprimée (toutes les pages), sans regrouper. Pour une prestation sur une période, renseigne debut et fin (AAAA-MM-JJ)." },
          { role: "user", content: [{ type: "text", text: "Extrais les lignes de cette facture." }, { type: "image_url", image_url: { url: `data:${mime};base64,${btoa(bin)}` } }] },
        ],
        tools: [{ type: "function", function: { name: "lignes", parameters: { type: "object", required: ["lignes"], properties: { lignes: { type: "array", items: { type: "object", required: ["designation", "quantite", "prixUnitaireHt", "montantHt", "tauxTva"], properties: {
          designation: { type: "string" }, description: { type: "string" }, quantite: { type: "number" }, prixUnitaireHt: { type: "number" }, montantHt: { type: "number" },
          tauxTva: { type: "number", description: "0.2 pour 20 %" }, debut: { type: "string" }, fin: { type: "string" } } } } } } } }],
        tool_choice: { type: "function", function: { name: "lignes" } },
      }),
    });
    if (res.status === 429) throw new Error("Trop de demandes, réessayez dans un instant.");
    if (res.status === 402) throw new Error("Crédits IA épuisés.");
    if (!res.ok) throw new Error(`Lecture de la pièce impossible (${res.status})`);
    const j = await res.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const lignes = (args ? JSON.parse(args).lignes : []) as LignePiece[];
    return { lignes: lignes.map((l) => ({ ...l, tauxTva: l.tauxTva > 1 ? l.tauxTva / 100 : l.tauxTva })) };
  });
