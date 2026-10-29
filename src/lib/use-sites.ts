import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { siteFournisseur } from "@/lib/logos";

// Site of each supplier of the dossier (invoice source set by the client or the firm), for the logos.
export function useSupplierSites(dossierId: string | null | undefined) {
  const q = useQuery({
    queryKey: ["invoice-sources-sites", dossierId],
    enabled: !!dossierId,
    queryFn: async () => {
      const { data } = await supabase.from("invoice_sources").select("supplier, source_url").eq("dossier_id", dossierId!);
      return new Map((data ?? []).map((r) => [r.supplier, r.source_url]));
    },
  });
  return (name: string) => siteFournisseur(name, q.data?.get(name));
}
