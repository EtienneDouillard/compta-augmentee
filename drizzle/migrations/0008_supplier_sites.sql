CREATE TABLE public.supplier_sites (
  dossier_id uuid NOT NULL,
  supplier text NOT NULL,
  url text,
  found_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dossier_id, supplier)
);
GRANT SELECT ON public.supplier_sites TO authenticated;
GRANT ALL ON public.supplier_sites TO service_role;
ALTER TABLE public.supplier_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read supplier sites" ON public.supplier_sites FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'cabinet') OR public.is_member(dossier_id));