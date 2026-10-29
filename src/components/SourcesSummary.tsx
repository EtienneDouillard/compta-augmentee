import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const CONFIGURED_STATES = ["active", "awaiting_first_invoice"];

export function useInvoiceSources(dossierId: string | null | undefined) {
  return useQuery({
    queryKey: ["invoice-sources", dossierId],
    enabled: !!dossierId,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoice_sources").select("supplier, method, state, last_check_at").eq("dossier_id", dossierId!);
      if (error) throw error;
      return data;
    },
  });
}

/** Home-page card: how many suppliers already have automatic invoice collection, with a link to the catalogue. */
export function SourcesSummary({ dossierId, suppliers }: { dossierId: string; suppliers: string[] }) {
  const q = useInvoiceSources(dossierId);
  const configured = (q.data ?? []).filter((s) => CONFIGURED_STATES.includes(s.state)).length;
  const total = new Set([...suppliers, ...(q.data ?? []).map((s) => s.supplier)]).size;
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-2 font-semibold text-primary"><Zap className="h-4 w-4" /> Récupération automatique des factures</p>
      <p className="mt-1 text-sm">
        {q.isPending ? "Chargement…" : <><strong>{configured}</strong> source{configured > 1 ? "s" : ""} configurée{configured > 1 ? "s" : ""} sur <strong>{total}</strong> fournisseur{total > 1 ? "s" : ""}.</>}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">Configurez-les une fois pour toutes : ensuite les factures arrivent seules chaque mois.</p>
      <Button asChild size="sm" className="mt-3"><Link to="/espace/sources">Configurer maintenant <ArrowRight /></Link></Button>
    </section>
  );
}
