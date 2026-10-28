CREATE TABLE public.dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  pennylane_company_id text,
  client_nom text,
  client_email text,
  client_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  numero text NOT NULL,
  fournisseur text NOT NULL,
  date date NOT NULL,
  total_ht numeric(12,2) NOT NULL,
  total_tva numeric(12,2) NOT NULL,
  total_ttc numeric(12,2) NOT NULL,
  libelle_generique text NOT NULL,
  libelle_ecriture text NOT NULL,
  regle_appliquee text,
  pennylane_invoice_id text,
  statut text NOT NULL DEFAULT 'a_valider',
  valide_par uuid,
  valide_le timestamptz,
  pennylane_reponse text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  compte text NOT NULL,
  compte_libelle text NOT NULL DEFAULT '',
  libelle text NOT NULL,
  ht numeric(12,2) NOT NULL,
  taux_tva numeric(5,4) NOT NULL DEFAULT 0.2,
  nature text,
  periode_mois int
);
CREATE TABLE public.pieces_manquantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  date date NOT NULL,
  libelle text NOT NULL,
  montant numeric(12,2) NOT NULL,
  action text NOT NULL,
  statut text NOT NULL DEFAULT 'en_attente',
  fichier_path text,
  commentaire_client text,
  recu_le timestamptz
);
CREATE TABLE public.journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  auteur text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dossiers, public.factures, public.lignes, public.pieces_manquantes, public.journal TO authenticated;
GRANT ALL ON public.dossiers, public.factures, public.lignes, public.pieces_manquantes, public.journal TO service_role;
ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pieces_manquantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cabinet dossiers" ON public.dossiers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cabinet factures" ON public.factures FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cabinet lignes" ON public.lignes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cabinet pieces" ON public.pieces_manquantes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cabinet journal" ON public.journal FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cabinet lit justificatifs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'justificatifs');

DO $$
DECLARE d uuid := gen_random_uuid(); f1 uuid := gen_random_uuid(); f2 uuid := gen_random_uuid(); f3 uuid := gen_random_uuid();
BEGIN
INSERT INTO public.dossiers(id, nom, client_nom, client_token) VALUES (d, 'Dossier Demo Hackathon - Comptabilité Augmentée 7', 'Étienne Douillard', 'demo-hackathon-7');
INSERT INTO public.factures(id,dossier_id,numero,fournisseur,date,total_ht,total_tva,total_ttc,libelle_generique,libelle_ecriture,regle_appliquee) VALUES
(f1,d,'F-2026-1042','Atelier Numérique','2026-02-12',2140,428,2568,'Facture Atelier Numérique - F-2026-1042','Équipement poste dev + licences + garantie 24 mois','Matrice Atelier Numérique'),
(f2,d,'F-2026-779','Pennylane Cabinet Démo','2026-02-28',850,170,1020,'Facture Pennylane Cabinet Démo - F-2026-779','Honoraires comptables février 2026','Matrice Pennylane Cabinet Démo'),
(f3,d,'LOY-2026-03','SCI Les Tilleuls (bailleur)','2026-03-01',1450,260,1710,'Facture SCI Les Tilleuls - LOY-2026-03','Loyer bureaux mars 2026 + charges + TEOM',NULL);
INSERT INTO public.lignes(facture_id,position,compte,compte_libelle,libelle,ht,taux_tva,nature,periode_mois) VALUES
(f1,1,'218300','Matériel informatique','MacBook Pro 14" M4',1690,0.2,'immobilisation',NULL),
(f1,2,'651000','Licences logiciels','Licences JetBrains 12 mois',210,0.2,'charge',NULL),
(f1,3,'486000','Charges constatées d''avance','Extension garantie 24 mois',180,0.2,'charge_etalee',24),
(f1,4,'606300','Petit équipement','Câbles et adaptateur USB-C',60,0.2,'charge',NULL),
(f2,1,'622600','Honoraires','Tenue comptable février 2026',600,0.2,NULL,NULL),
(f2,2,'622600','Honoraires','Établissement paie février 2026',150,0.2,NULL,NULL),
(f2,3,'651000','Licences logiciels','Abonnement logiciel Pennylane',100,0.2,NULL,NULL),
(f3,1,'613200','Locations immobilières','Loyer bureaux mars 2026',1200,0.2,NULL,NULL),
(f3,2,'614000','Charges locatives','Provision charges locatives mars',100,0.2,NULL,NULL),
(f3,3,'635120','Taxe ordures ménagères','TEOM refacturée',150,0,NULL,NULL);
INSERT INTO public.pieces_manquantes(dossier_id,date,libelle,montant,action) VALUES
(d,'2026-02-03','WEEZEVENT',25,'Déposer le billet d''événement'),
(d,'2026-02-09','OPENROUTER INC',186.51,'Déposer la facture OpenRouter'),
(d,'2026-02-15','ANTHROPIC PBC',90,'Déposer la facture Anthropic');
END $$;