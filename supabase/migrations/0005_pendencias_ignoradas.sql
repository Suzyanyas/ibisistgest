begin;

create table if not exists pendencias_ignoradas (
  chave text primary key,
  tipo text not null,
  ignorada_por uuid references auth.users(id) on delete set null,
  ignorada_em timestamptz default now()
);

alter table pendencias_ignoradas enable row level security;
drop policy if exists pendencias_ignoradas_admin on pendencias_ignoradas;
create policy pendencias_ignoradas_admin on pendencias_ignoradas
  for all to authenticated
  using (is_admin())
  with check (is_admin());
revoke all on table pendencias_ignoradas from anon;

commit;
