CREATE TABLE public.invoice_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
 supplier text NOT NULL,
 source_url text NOT NULL,
 method text NOT NULL DEFAULT 'email' CHECK (method IN ('email','browser','api','mcp')),
 billing_path text NOT NULL DEFAULT '',
 evidence_url text,
 receipt_email text,
 state text NOT NULL DEFAULT 'needs_setup' CHECK (state IN ('needs_setup','awaiting_first_invoice','paused')),
 frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency = 'monthly'),
 auto_send_documents boolean NOT NULL DEFAULT false,
 created_by uuid NOT NULL DEFAULT auth.uid(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(dossier_id,supplier)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_sources TO authenticated;
GRANT ALL ON public.invoice_sources TO service_role;
ALTER TABLE public.invoice_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members and cabinet manage invoice sources" ON public.invoice_sources FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'cabinet') OR public.is_member(dossier_id)) WITH CHECK (public.has_role(auth.uid(), 'cabinet') OR public.is_member(dossier_id));
COMMENT ON TABLE public.invoice_sources IS 'Non-secret source setup only. No cookies, supplier passwords or API tokens. Awaiting first invoice is not verified receipt or automation.';