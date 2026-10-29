ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS model_cabinet text NOT NULL DEFAULT 'claude-sonnet-5-5';
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS model_client text NOT NULL DEFAULT 'claude-sonnet-5-5';
CREATE TABLE public.ai_key (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  secret_blob text NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_key TO service_role;
ALTER TABLE public.ai_key ENABLE ROW LEVEL SECURITY;