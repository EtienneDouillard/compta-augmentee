import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Upload, Check } from "lucide-react";
import { deposerPiece, getClientDossier } from "@/lib/client-portal.functions";
import { eur } from "@/lib/ventilation";

export const Route = createFileRoute("/client/$token")({
  loader: ({ params }) => getClientDossier({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Vos justificatifs — Comptabilité Augmentée" },
      { name: "description", content: "Déposez les pièces demandées par votre cabinet." },
      { property: "og:title", content: "Vos justificatifs" },
      { property: "og:description", content: "Déposez les pièces demandées par votre cabinet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientPage,
});

function ClientPage() {
  const initial = Route.useLoaderData();
  const { token } = Route.useParams();
  const [pieces, setPieces] = useState(initial?.pieces ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!initial) return <div className="p-10 text-center">Ce lien n'est pas valide.</div>;
  const reste = pieces.filter((p) => p.statut !== "recue");
  const courante = reste[0];

  const envoyer = async (file: File) => {
    if (!courante) return;
    setBusy(courante.id); setErr(null);
    const fd = new FormData();
    fd.set("token", token); fd.set("pieceId", courante.id); fd.set("file", file);
    try {
      await deposerPiece({ data: fd });
      setPieces((ps) => ps.map((p) => (p.id === courante.id ? { ...p, statut: "recue" } : p)));
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
    setBusy(null);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-xl space-y-4">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{initial.nom}</p>
        <h1 className="font-display text-3xl">Bonjour {initial.client_nom ?? ""}</h1>
        <div className="rounded-xl bg-muted p-4 text-sm">
          Il nous manque {pieces.length} justificatifs pour boucler le mois. On les traite un par un.
        </div>
        {courante ? (
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs text-muted-foreground">Pièce {pieces.length - reste.length + 1} / {pieces.length}</p>
            <p className="mt-1 font-medium">{courante.libelle} — {eur(Number(courante.montant))}</p>
            <p className="text-sm text-muted-foreground">Paiement du {new Date(courante.date).toLocaleDateString("fr-FR")} · {courante.action}</p>
            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
              <Upload className="h-4 w-4" /> {busy ? "Envoi…" : "Choisir le fichier (PDF, photo)"}
              <input type="file" accept="application/pdf,image/*" className="hidden" disabled={!!busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void envoyer(f); e.target.value = ""; }} />
            </label>
            {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-success/10 p-5 text-sm"><Check className="h-4 w-4" /> Merci ! Toutes les pièces sont reçues.</div>
        )}
      </div>
    </div>
  );
}
