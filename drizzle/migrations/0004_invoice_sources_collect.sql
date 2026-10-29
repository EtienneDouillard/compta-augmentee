ALTER TABLE public.invoice_sources
  ADD COLUMN IF NOT EXISTS research jsonb,
  ADD COLUMN IF NOT EXISTS researched_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_check jsonb,
  ADD COLUMN IF NOT EXISTS last_check_at timestamptz;
ALTER TABLE public.invoice_sources DROP CONSTRAINT invoice_sources_state_check;
ALTER TABLE public.invoice_sources ADD CONSTRAINT invoice_sources_state_check CHECK (state = ANY (ARRAY['needs_setup','awaiting_first_invoice','paused','active','attention']));