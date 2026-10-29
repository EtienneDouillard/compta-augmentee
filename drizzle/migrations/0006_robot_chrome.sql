ALTER TABLE public.invoice_sources ADD COLUMN IF NOT EXISTS robot_url text, ADD COLUMN IF NOT EXISTS robot_last_run jsonb;

CREATE TABLE public.collector_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
GRANT SELECT, DELETE ON public.collector_tokens TO authenticated;
GRANT ALL ON public.collector_tokens TO service_role;
ALTER TABLE public.collector_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read collector tokens" ON public.collector_tokens FOR SELECT TO authenticated USING (public.is_member(dossier_id));
CREATE POLICY "members delete collector tokens" ON public.collector_tokens FOR DELETE TO authenticated USING (public.is_member(dossier_id));