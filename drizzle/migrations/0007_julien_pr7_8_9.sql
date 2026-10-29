alter table public.dossiers
  add column if not exists recap_auto boolean not null default false,
  add column if not exists recap_relance_jours integer
    check (recap_relance_jours is null or recap_relance_jours in (2, 3, 7, 14)),
  add column if not exists recap_envoye_at timestamptz;

alter table public.transactions
  add column if not exists parent_id uuid references public.transactions(id) on delete cascade,
  add column if not exists decoupee boolean not null default false,
  add column if not exists ecriture_choix text check (ecriture_choix in ('charge','associe','attente','acompte','autre')),
  add column if not exists ecriture_compte text,
  add column if not exists ecriture_par uuid,
  add column if not exists ecriture_le timestamptz,
  add column if not exists ecriture_envoyee_le timestamptz;

create index if not exists transactions_parent_id_idx on public.transactions (parent_id);

create or replace function public.guard_tx_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if not public.has_role(auth.uid(),'cabinet') and auth.uid() is not null then
    if new.dossier_id <> old.dossier_id or new.pennylane_id <> old.pennylane_id or new.date <> old.date
       or new.amount <> old.amount or new.label <> old.label or new.supplier <> old.supplier
       or new.supplier_detected <> old.supplier_detected or new.is_open <> old.is_open
       or new.review_state <> old.review_state or new.direction <> old.direction
       or new.skip_rule_id is distinct from old.skip_rule_id
       or new.parent_id is distinct from old.parent_id or new.decoupee <> old.decoupee
       or new.ecriture_choix is distinct from old.ecriture_choix
       or new.ecriture_compte is distinct from old.ecriture_compte
       or new.ecriture_par is distinct from old.ecriture_par
       or new.ecriture_le is distinct from old.ecriture_le
       or new.ecriture_envoyee_le is distinct from old.ecriture_envoyee_le then
      raise exception 'Modification non autorisée';
    end if;
  end if;
  return new;
end
$$;