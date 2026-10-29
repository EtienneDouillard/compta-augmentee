import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { requireClient, groupBySupplier } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { SupplierAvatar } from "@/components/brand";
import { useClientTxs } from "./espace.index";
import { CONFIGURED_STATES, useInvoiceSources } from "@/components/SourcesSummary";
import { SOUS_TITRES } from "@/lib/aide-client";

export const Route = createFileRoute("/_authenticated/espace/sources")({
  beforeLoad: requireClient,
  head: () => ({
    meta: [
      { title: "Sources de factures — PBC List" },
      { name: "description", content: "Configurez une fois la récupération automatique des factures de chaque fournisseur." },
      { property: "og:title", content: "Sources de factures — PBC List" },
      { property: "og:description", content: "Configurez une fois la récupération automatique des factures de chaque fournisseur." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Sources,
});

const STATE: Record<string, string> = { active: "✓ Fonctionne", awaiting_first_invoice: "Configurée · première facture attendue", needs_setup: "À configurer", attention: "À vérifier", paused: "En pause" };

function Sources() {
  const { txs, dossierId } = useClientTxs();
  const sources = useInvoiceSources(dossierId);
  const groups = groupBySupplier(txs.data ?? []).filter((g) => g.direction === "out");
  const byName = new Map((sources.data ?? []).map((s) => [s.supplier, s]));
  const extra = (sources.data ?? []).filter((s) => !groups.some((g) => g.name === s.supplier));
  const configured = (sources.data ?? []).filter((s) => CONFIGURED_STATES.includes(s.state)).length;
  return (
    <div className="min-h-screen bg-background">
      <AppHeader space="client" />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <Link to="/espace" className="text-sm text-primary underline">← Retour à l'accueil</Link>
        <div>
          <h1 className="text-2xl font-bold text-primary">Sources de factures</h1>
          <p className="mt-1.5 text-muted-foreground">{SOUS_TITRES.sources}</p>
        </div>
        <p className="text-muted-foreground">{configured} source{configured > 1 ? "s" : ""} configurée{configured > 1 ? "s" : ""}. Choisissez un fournisseur : CA+ trouve la solution la plus simple et vous guide pas à pas.</p>
        {txs.isPending ? <p className="text-muted-foreground">Chargement…</p> : (
          <ul className="divide-y rounded-xl border bg-card">
            {groups.map((g) => {
              const s = byName.get(g.name);
              return (
                <li key={g.key}>
                  <Link to="/espace/$supplier" params={{ supplier: g.key }} hash="source" className="flex items-center gap-3 p-4 hover:bg-secondary/40">
                    <SupplierAvatar name={g.name} />
                    <span className="flex-1 font-semibold">{g.name}</span>
                    <span className={s && CONFIGURED_STATES.includes(s.state) ? "text-sm font-semibold text-primary" : "text-sm text-muted-foreground"}>{s ? STATE[s.state] ?? s.state : "À configurer"}</span>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </li>
              );
            })}
            {extra.map((s) => (
              <li key={s.supplier} className="flex items-center gap-3 p-4">
                <SupplierAvatar name={s.supplier} />
                <span className="flex-1 font-semibold">{s.supplier}</span>
                <span className="text-sm text-muted-foreground">{STATE[s.state] ?? s.state}</span>
              </li>
            ))}
            {groups.length + extra.length === 0 && <li className="p-4 text-muted-foreground">Aucun fournisseur pour l'instant.</li>}
          </ul>
        )}
      </main>
    </div>
  );
}
