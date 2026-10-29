import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
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
      className="flex h-full items-center gap-3 rounded-2xl border bg-card p-4 text-primary shadow-sm transition-shadow hover:shadow-md"
    >
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pale text-xl">🤖</span>
      <span className="min-w-0 flex-1 font-semibold">
        Automatisations :{" "}
        {q.isPending ? "…" : <><strong>{configured}</strong>/{total} fournisseur{total > 1 ? "s" : ""} automatisé{configured > 1 ? "s" : ""}</>}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
