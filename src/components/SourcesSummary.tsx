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
    <Link
      to="/espace/sources"
      title="Configurez vos sources une fois pour toutes : ensuite les factures arrivent seules chaque mois."
      className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm text-primary shadow-sm hover:bg-accent"
    >
      <Zap className="h-4 w-4" />
      <span>
        Récupération auto :{" "}
        {q.isPending ? "…" : <><strong>{configured}</strong>/{total} fournisseur{total > 1 ? "s" : ""}</>}
      </span>
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}
