ALTER TABLE public.lignes ADD COLUMN IF NOT EXISTS tva_montant numeric(12,2);
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS compte_fournisseur text, ADD COLUMN IF NOT EXISTS pennylane_url text, ADD COLUMN IF NOT EXISTS devise text NOT NULL DEFAULT 'EUR', ADD COLUMN IF NOT EXISTS piece_path text, ADD COLUMN IF NOT EXISTS lignes_importees boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS factures_dossier_pl_uniq ON public.factures(dossier_id, pennylane_invoice_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND policyname='staff_rw_justificatifs') THEN
    CREATE POLICY staff_rw_justificatifs ON storage.objects FOR ALL TO authenticated USING (bucket_id='justificatifs') WITH CHECK (bucket_id='justificatifs');
  END IF; END $$;