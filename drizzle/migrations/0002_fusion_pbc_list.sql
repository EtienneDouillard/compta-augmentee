create type public.app_role as enum ('cabinet','client');
create type public.tx_status as enum ('a_faire','depose','email','sans_facture');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own roles or cabinet" on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(),'cabinet'));

alter table public.dossiers alter column nom drop not null;
alter table public.dossiers add column if not exists name text;
alter table public.dossiers add column if not exists company_id text;
alter table public.dossiers add column if not exists collect_email text;
alter table public.dossiers add column if not exists last_sync_at timestamptz;
alter table public.dossiers add column if not exists last_sync_error text;
update public.dossiers set name = coalesce(name, nom), company_id = coalesce(company_id, pennylane_company_id, '276211');
alter table public.dossiers alter column name set not null;
alter table public.dossiers alter column company_id set not null;
alter table public.dossiers alter column nom set default '';
grant select, insert, update, delete on public.dossiers to authenticated;
grant all on public.dossiers to service_role;
alter table public.dossiers enable row level security;

create table public.dossier_members (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  user_id uuid not null,
  email text not null,
  created_at timestamptz not null default now(),
  unique (dossier_id, user_id)
);
grant select, insert, update, delete on public.dossier_members to authenticated;
grant all on public.dossier_members to service_role;
alter table public.dossier_members enable row level security;

create or replace function public.is_member(_dossier_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dossier_members where dossier_id = _dossier_id and user_id = auth.uid())
$$;

create policy "cabinet all dossiers" on public.dossiers for all to authenticated
using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));
create policy "client reads own dossier" on public.dossiers for select to authenticated
using (public.is_member(id));

create policy "cabinet all members" on public.dossier_members for all to authenticated
using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));
create policy "client reads own membership" on public.dossier_members for select to authenticated
using (user_id = auth.uid());

create table public.supplier_aliases (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  detected_name text not null,
  display_name text not null,
  unique (dossier_id, detected_name)
);
grant select, insert, update, delete on public.supplier_aliases to authenticated;
grant all on public.supplier_aliases to service_role;
alter table public.supplier_aliases enable row level security;
create policy "cabinet all aliases" on public.supplier_aliases for all to authenticated
using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  pennylane_id text not null,
  date date not null,
  amount numeric(14,2) not null,
  label text not null,
  supplier_detected text not null,
  supplier text not null,
  status public.tx_status not null default 'a_faire',
  comment text,
  is_open boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (dossier_id, pennylane_id)
);
create index on public.transactions (dossier_id, is_open);
grant select, insert, update, delete on public.transactions to authenticated;
grant all on public.transactions to service_role;
alter table public.transactions enable row level security;
create policy "cabinet all tx" on public.transactions for all to authenticated
using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
grant select, insert on public.uploads to authenticated;
grant all on public.uploads to service_role;
alter table public.uploads enable row level security;
create policy "cabinet reads uploads" on public.uploads for select to authenticated
using (public.has_role(auth.uid(),'cabinet'));
create policy "client reads own uploads" on public.uploads for select to authenticated
using (public.is_member(dossier_id));
create policy "client inserts own uploads" on public.uploads for insert to authenticated
with check (public.is_member(dossier_id) and uploaded_by = auth.uid()
  and exists (select 1 from public.transactions t where t.id = transaction_id and t.dossier_id = uploads.dossier_id));

create policy "factures cabinet read" on storage.objects for select to authenticated
using (bucket_id = 'factures' and public.has_role(auth.uid(),'cabinet'));
create policy "factures client read" on storage.objects for select to authenticated
using (bucket_id = 'factures' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "factures client insert" on storage.objects for insert to authenticated
with check (bucket_id = 'factures' and public.is_member(((storage.foldername(name))[1])::uuid));

alter table public.transactions add column review_state text not null default 'sent'
  check (review_state in ('pending','sent','dismissed'));
create index on public.transactions (dossier_id, review_state);
create policy "client reads own sent tx" on public.transactions for select to authenticated
using (public.is_member(dossier_id) and review_state = 'sent');
create policy "client updates own sent tx" on public.transactions for update to authenticated
using (public.is_member(dossier_id) and review_state = 'sent')
with check (public.is_member(dossier_id) and review_state = 'sent');

alter table public.transactions add column counterpart_accounts text;
alter table public.transactions add column direction text not null default 'out' check (direction in ('out','in'));
alter table public.dossiers add column collect_email_customers text;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index on public.chat_messages (user_id, created_at);
grant select, insert on public.chat_messages to authenticated;
grant all on public.chat_messages to service_role;
alter table public.chat_messages enable row level security;
create policy "own chat read" on public.chat_messages for select to authenticated using (user_id = auth.uid());
create policy "own chat insert" on public.chat_messages for insert to authenticated
with check (user_id = auth.uid() and public.is_member(dossier_id));

create table public.cabinet_questions (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  user_email text,
  question text not null,
  context text,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.cabinet_questions to authenticated;
grant all on public.cabinet_questions to service_role;
alter table public.cabinet_questions enable row level security;
create policy "cabinet all questions" on public.cabinet_questions for all to authenticated
using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));
create policy "client inserts own question" on public.cabinet_questions for insert to authenticated
with check (user_id = auth.uid() and public.is_member(dossier_id));
create policy "client reads own questions" on public.cabinet_questions for select to authenticated
using (user_id = auth.uid());

ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS detect_prefixes text NOT NULL DEFAULT '401, 411, 471';

CREATE TABLE public.mcp_connection (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  secret_blob text,
  status text NOT NULL DEFAULT 'disconnected',
  last_error text,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mcp_connection TO service_role;
REVOKE ALL ON public.mcp_connection FROM anon, authenticated;
ALTER TABLE public.mcp_connection ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.mcp_oauth_states (
  state text PRIMARY KEY,
  secret_blob text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mcp_oauth_states TO service_role;
REVOKE ALL ON public.mcp_oauth_states FROM anon, authenticated;
ALTER TABLE public.mcp_oauth_states ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS last_sync_source text;
ALTER TABLE public.dossiers ADD COLUMN IF NOT EXISTS last_mcp_error text;

create table public.cabinet_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  dossier_id uuid references public.dossiers(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index on public.cabinet_chat_messages (user_id, created_at);
grant select, insert on public.cabinet_chat_messages to authenticated;
grant all on public.cabinet_chat_messages to service_role;
alter table public.cabinet_chat_messages enable row level security;
create policy "cabinet own chat read" on public.cabinet_chat_messages for select to authenticated
using (user_id = auth.uid() and public.has_role(auth.uid(), 'cabinet'));
create policy "cabinet own chat insert" on public.cabinet_chat_messages for insert to authenticated
with check (user_id = auth.uid() and public.has_role(auth.uid(), 'cabinet'));

alter table public.transactions add column ai_analyzed_at timestamptz;

create table public.ai_settings (
  id int primary key default 1 check (id = 1),
  monthly_cap_usd numeric(10,2) not null default 10 check (monthly_cap_usd >= 0),
  updated_at timestamptz not null default now()
);
insert into public.ai_settings (id) values (1);
grant select, update on public.ai_settings to authenticated;
grant all on public.ai_settings to service_role;
alter table public.ai_settings enable row level security;
create policy "cabinet reads ai settings" on public.ai_settings for select to authenticated
using (public.has_role(auth.uid(),'cabinet'));
create policy "cabinet updates ai settings" on public.ai_settings for update to authenticated
using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));

create table public.ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  model text not null,
  lines_analyzed int not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10,4) not null default 0,
  kind text not null default 'analyse' check (kind in ('analyse','saisie')),
  created_at timestamptz not null default now()
);
create index on public.ai_analysis_runs (created_at);
create index on public.ai_analysis_runs (dossier_id, created_at);
grant select, insert on public.ai_analysis_runs to authenticated;
grant all on public.ai_analysis_runs to service_role;
alter table public.ai_analysis_runs enable row level security;
create policy "cabinet all ai runs" on public.ai_analysis_runs for all to authenticated
using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_analysis_runs(id) on delete cascade,
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  kind text not null check (kind in ('group','duplicate','personal','skip')),
  transaction_ids uuid[] not null,
  target_supplier text,
  reason text not null,
  state text not null default 'open' check (state in ('open','applied','rejected')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.ai_suggestions (dossier_id, state);
grant select, insert, update on public.ai_suggestions to authenticated;
grant all on public.ai_suggestions to service_role;
alter table public.ai_suggestions enable row level security;
create policy "cabinet all ai suggestions" on public.ai_suggestions for all to authenticated
using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));

create table public.skip_rules (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  kind text not null check (kind in ('label','supplier')),
  pattern text not null check (length(trim(pattern)) > 0),
  direction text check (direction in ('out','in')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.skip_rules (dossier_id);
grant select, insert, update, delete on public.skip_rules to authenticated;
grant all on public.skip_rules to service_role;
alter table public.skip_rules enable row level security;
create policy "cabinet all skip rules" on public.skip_rules for all to authenticated
  using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));

alter table public.transactions add column skip_rule_id uuid references public.skip_rules(id) on delete set null;

create table public.cabinet_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'Votre cabinet',
  email text,
  phone text,
  logo_path text,
  updated_at timestamptz not null default now()
);
insert into public.cabinet_settings (id) values (1);
grant select on public.cabinet_settings to anon;
grant select, update on public.cabinet_settings to authenticated;
grant all on public.cabinet_settings to service_role;
alter table public.cabinet_settings enable row level security;
create policy "anyone reads cabinet settings" on public.cabinet_settings for select to anon, authenticated
  using (true);
create policy "cabinet updates cabinet settings" on public.cabinet_settings for update to authenticated
  using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));

create or replace function public.guard_tx_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if not public.has_role(auth.uid(),'cabinet') and auth.uid() is not null then
    if new.dossier_id <> old.dossier_id or new.pennylane_id <> old.pennylane_id or new.date <> old.date
       or new.amount <> old.amount or new.label <> old.label or new.supplier <> old.supplier
       or new.supplier_detected <> old.supplier_detected or new.is_open <> old.is_open
       or new.review_state <> old.review_state or new.direction <> old.direction
       or new.skip_rule_id is distinct from old.skip_rule_id then
      raise exception 'Modification non autorisée';
    end if;
  end if;
  return new;
end
$$;
create trigger trg_guard_tx before update on public.transactions for each row execute function public.guard_tx_update();

create policy "logos cabinet read" on storage.objects for select to authenticated
using (bucket_id = 'logos' and public.has_role(auth.uid(),'cabinet'));
create policy "logos cabinet insert" on storage.objects for insert to authenticated
with check (bucket_id = 'logos' and public.has_role(auth.uid(),'cabinet'));
create policy "logos cabinet update" on storage.objects for update to authenticated
using (bucket_id = 'logos' and public.has_role(auth.uid(),'cabinet'));
create policy "logos cabinet delete" on storage.objects for delete to authenticated
using (bucket_id = 'logos' and public.has_role(auth.uid(),'cabinet'));

create table public.saisies (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  upload_id uuid not null unique references public.uploads(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  tiers text not null,
  fournisseur text not null,
  numero text,
  date_facture date,
  total_ht numeric(14,2) not null default 0,
  total_tva numeric(14,2) not null default 0,
  total_ttc numeric(14,2) not null default 0,
  libelle_ecriture text,
  lignes jsonb not null default '[]'::jsonb,
  lecture jsonb,
  state text not null default 'proposee' check (state in ('proposee','validee','rejetee','echec')),
  model text,
  cost_usd numeric(10,4) not null default 0,
  lu_par uuid,
  lu_le timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  pennylane_invoice_id text,
  envoye_par uuid,
  envoye_le timestamptz,
  created_at timestamptz not null default now()
);
create index on public.saisies (dossier_id);
grant select, insert, update on public.saisies to authenticated;
grant all on public.saisies to service_role;
alter table public.saisies enable row level security;
create policy "cabinet all saisies" on public.saisies for all to authenticated
using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));

create table public.regles_fournisseur (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  tiers text not null,
  cle text not null,
  compte text not null,
  compte_libelle text not null default '',
  updated_at timestamptz not null default now(),
  unique (dossier_id, tiers, cle)
);
grant select, insert, update, delete on public.regles_fournisseur to authenticated;
grant all on public.regles_fournisseur to service_role;
alter table public.regles_fournisseur enable row level security;
create policy "cabinet all regles fournisseur" on public.regles_fournisseur for all to authenticated
using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));

drop policy if exists "cabinet dossiers" on public.dossiers;
drop policy if exists "cabinet factures" on public.factures;
drop policy if exists "cabinet lignes" on public.lignes;
drop policy if exists "cabinet pieces" on public.pieces_manquantes;
drop policy if exists "cabinet journal" on public.journal;
drop policy if exists "cabinet lit justificatifs" on storage.objects;
drop policy if exists staff_rw_justificatifs on storage.objects;
create policy "cabinet factures" on public.factures for all to authenticated using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));
create policy "cabinet lignes" on public.lignes for all to authenticated using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));
create policy "cabinet pieces" on public.pieces_manquantes for all to authenticated using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));
create policy "cabinet journal" on public.journal for all to authenticated using (public.has_role(auth.uid(),'cabinet')) with check (public.has_role(auth.uid(),'cabinet'));
create policy staff_rw_justificatifs on storage.objects for all to authenticated using (bucket_id='justificatifs' and public.has_role(auth.uid(),'cabinet')) with check (bucket_id='justificatifs' and public.has_role(auth.uid(),'cabinet'));