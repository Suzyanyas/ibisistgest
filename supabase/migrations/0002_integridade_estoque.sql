-- ============================================================
-- IBISIST — Migração 0002: Integridade de estoque e controle de acesso
-- ============================================================
-- Compatível com o código atual da aplicação: nenhuma coluna removida ou
-- renomeada, novas colunas com default, embalagem_config mantida.
-- As funções atômicas ficam disponíveis para a migração gradual das
-- server actions.
-- ============================================================


-- ------------------------------------------------------------
-- GUARDA — repete as pré-verificações e aborta se alguma falhar
-- ------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  select count(*) into v_n from (
    select 1 from produtos_acabados group by lower(trim(nome)) having count(*) > 1
  ) d;
  if v_n > 0 then
    raise exception 'Pré-verificação falhou: % nome(s) duplicado(s) em produtos_acabados.', v_n;
  end if;

  select count(*) into v_n from (
    select 1 from envases group by lote_id having count(*) > 1
  ) d;
  if v_n > 0 then
    raise exception 'Pré-verificação falhou: % lote(s) com mais de um registro em envases.', v_n;
  end if;

  select count(*) into v_n from insumos where estoque_atual < 0;
  if v_n > 0 then
    raise exception 'Pré-verificação falhou: % insumo(s) com estoque negativo.', v_n;
  end if;

  select count(*) into v_n from produtos_acabados
  where estoque_atual < 0 or estoque_1l < 0 or estoque_2l < 0
     or estoque_5l < 0 or estoque_20l < 0;
  if v_n > 0 then
    raise exception 'Pré-verificação falhou: % produto(s) acabado(s) com estoque negativo.', v_n;
  end if;

  select count(*) into v_n from produtos_acabados
  where estoque_atual is distinct from
        coalesce(estoque_1l, 0) + coalesce(estoque_2l, 0)
      + coalesce(estoque_5l, 0) + coalesce(estoque_20l, 0);
  if v_n > 0 then
    raise exception 'Pré-verificação falhou: % produto(s) acabado(s) com estoque_atual diferente da soma por tamanho.', v_n;
  end if;
end $$;


-- ============================================================
-- FASE 2 — Novos tamanhos 200ML e 500ML
-- ============================================================
alter table envases
  add column if not exists qtd_200ml integer not null default 0,
  add column if not exists qtd_500ml integer not null default 0;

alter table produtos_acabados
  add column if not exists estoque_200ml integer not null default 0,
  add column if not exists estoque_500ml integer not null default 0;

alter table produto_retiradas
  add column if not exists qtd_200ml integer not null default 0,
  add column if not exists qtd_500ml integer not null default 0;

-- Confirma que a constraint de categoria (criada fora das migrações)
-- aceita todas as categorias de embalagem. Cada inserção de teste é
-- desfeita pelo savepoint do bloco.
do $$
declare
  v_cat text;
begin
  foreach v_cat in array array[
    'garrafa_200ml', 'garrafa_500ml', 'garrafa_1l', 'garrafa_2l',
    'garrafa_5l', 'garrafa_20l', 'tampa', 'alca'
  ] loop
    begin
      insert into insumos (nome, unidade, tipo, categoria)
      values ('__verificacao_categoria__', 'UN', 'material', v_cat);
      raise exception using errcode = 'IB001', message = 'desfazer';
    exception
      when sqlstate 'IB001' then
        null;
      when check_violation then
        raise exception 'A constraint de categoria de insumos não aceita "%". Ajuste a constraint antes de aplicar esta migração.', v_cat;
    end;
  end loop;
end $$;


-- ============================================================
-- FASE 3 — Constraints
-- ============================================================
create unique index if not exists produtos_acabados_nome_unico
  on produtos_acabados (lower(trim(nome)));

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.conrelid = 'public.envases'::regclass
      and c.contype in ('u', 'p')
      and array_length(c.conkey, 1) = 1
      and a.attname = 'lote_id'
  ) then
    alter table envases add constraint envases_lote_id_key unique (lote_id);
  end if;
end $$;

alter table insumos drop constraint if exists insumos_estoque_atual_nao_negativo;
alter table insumos add constraint insumos_estoque_atual_nao_negativo
  check (estoque_atual >= 0);

alter table produtos_acabados drop constraint if exists produtos_acabados_estoque_atual_nao_negativo;
alter table produtos_acabados add constraint produtos_acabados_estoque_atual_nao_negativo
  check (estoque_atual >= 0);
alter table produtos_acabados drop constraint if exists produtos_acabados_estoque_200ml_nao_negativo;
alter table produtos_acabados add constraint produtos_acabados_estoque_200ml_nao_negativo
  check (estoque_200ml >= 0);
alter table produtos_acabados drop constraint if exists produtos_acabados_estoque_500ml_nao_negativo;
alter table produtos_acabados add constraint produtos_acabados_estoque_500ml_nao_negativo
  check (estoque_500ml >= 0);
alter table produtos_acabados drop constraint if exists produtos_acabados_estoque_1l_nao_negativo;
alter table produtos_acabados add constraint produtos_acabados_estoque_1l_nao_negativo
  check (estoque_1l >= 0);
alter table produtos_acabados drop constraint if exists produtos_acabados_estoque_2l_nao_negativo;
alter table produtos_acabados add constraint produtos_acabados_estoque_2l_nao_negativo
  check (estoque_2l >= 0);
alter table produtos_acabados drop constraint if exists produtos_acabados_estoque_5l_nao_negativo;
alter table produtos_acabados add constraint produtos_acabados_estoque_5l_nao_negativo
  check (estoque_5l >= 0);
alter table produtos_acabados drop constraint if exists produtos_acabados_estoque_20l_nao_negativo;
alter table produtos_acabados add constraint produtos_acabados_estoque_20l_nao_negativo
  check (estoque_20l >= 0);


-- ============================================================
-- FASE 4 — Novas colunas e dados
-- ============================================================
alter table insumos
  add column if not exists densidade numeric(10,4),            -- g/ml: converte KG/G <-> L/ML
  add column if not exists densidade_confirmada boolean not null default false,
  add column if not exists estoque_estimado boolean not null default false;

alter table insumos drop constraint if exists insumos_densidade_positiva;
alter table insumos add constraint insumos_densidade_positiva
  check (densidade is null or densidade > 0);

-- Quantidade que não pôde ser debitada por falta de estoque
alter table insumo_movimentos
  add column if not exists falta numeric(10,3);

alter table envases
  add column if not exists produto_acabado_id uuid
    references produtos_acabados(id) on delete set null;

create index if not exists envases_produto_acabado_id_idx on envases (produto_acabado_id);

-- Densidade provisória = 1 (densidade_confirmada continua false)
do $$
declare
  v_nome text;
  v_n integer;
begin
  foreach v_nome in array array[
    'Conservante', 'RENEX', 'BASE PARA AMACIANTE', 'ESSÊNCIA ACONCHEGO',
    'ESSÊNCIA IGUATEMI', 'ESSÊNCIA VINÓLIA', 'ESS PRIMAVERA TIX'
  ] loop
    update insumos set densidade = 1
    where lower(trim(nome)) = lower(trim(v_nome));
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise warning 'Densidade: "%" corresponde a % insumo(s) (esperado 1).', v_nome, v_n;
    end if;
  end loop;
end $$;

-- Estoque marcado como estimado até o próximo ajuste de inventário
do $$
declare
  v_nome text;
  v_n integer;
begin
  foreach v_nome in array array[
    'Barrilha', 'Soda Cáustica 99%', 'ALCOOL', 'Conservante',
    'Goma', 'Metassilicato', 'RENEX'
  ] loop
    update insumos set estoque_estimado = true
    where lower(trim(nome)) = lower(trim(v_nome));
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise warning 'Estoque estimado: "%" corresponde a % insumo(s) (esperado 1).', v_nome, v_n;
    end if;
  end loop;
end $$;

-- embalagem_config NÃO é removida nesta migração (ainda usada por app/actions/envase.ts).


-- ============================================================
-- FASE 4B — Papéis e custos (custos visíveis só para administradores)
-- ============================================================

-- Administrador = app_metadata.role = 'admin'.
-- Nunca usar user_metadata: o próprio usuário pode editá-lo.
create or replace function is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

create table if not exists insumo_custos (
  insumo_id uuid primary key references insumos(id) on delete cascade,
  custo_unitario numeric,
  custo_unidade text,
  updated_at timestamptz default now()
);

-- Copia os custos atuais. As colunas em insumos continuam (o código atual ainda as lê).
insert into insumo_custos (insumo_id, custo_unitario, custo_unidade)
select id, custo_unitario, custo_unidade
from insumos
where custo_unitario is not null or custo_unidade is not null
on conflict (insumo_id) do nothing;

alter table insumo_custos enable row level security;
drop policy if exists insumo_custos_admin on insumo_custos;
create policy insumo_custos_admin on insumo_custos
  for all to authenticated
  using (is_admin())
  with check (is_admin());
revoke all on table insumo_custos from anon;


-- ============================================================
-- FASE 5 — Triggers
-- ============================================================

-- Bypass transacional usado apenas pelas funções atômicas
create or replace function _bypass_lote_lock()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(current_setting('app.bypass_lote_lock', true), '') = 'on'
$$;

-- 20. estoque_atual sempre igual à soma dos tamanhos
create or replace function trg_produtos_acabados_estoque_total()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.estoque_atual :=
      coalesce(new.estoque_200ml, 0) + coalesce(new.estoque_500ml, 0)
    + coalesce(new.estoque_1l, 0)    + coalesce(new.estoque_2l, 0)
    + coalesce(new.estoque_5l, 0)    + coalesce(new.estoque_20l, 0);
  return new;
end $$;

drop trigger if exists produtos_acabados_estoque_total on produtos_acabados;
create trigger produtos_acabados_estoque_total
  before insert or update on produtos_acabados
  for each row execute function trg_produtos_acabados_estoque_total();

-- 21. Insumos do lote só podem mudar enquanto o lote está em produção
create or replace function trg_lote_insumos_bloqueio()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_numero text;
begin
  if _bypass_lote_lock() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select status, numero_lote into v_status, v_numero
    from lotes_producao where id = old.lote_id;
    if found and v_status <> 'producao' then
      raise exception 'Os insumos do lote % não podem ser alterados: o lote não está mais em produção (status: %).',
        v_numero, v_status;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select status, numero_lote into v_status, v_numero
    from lotes_producao where id = new.lote_id;
    if found and v_status <> 'producao' then
      raise exception 'Os insumos do lote % não podem ser alterados: o lote não está mais em produção (status: %).',
        v_numero, v_status;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists lote_insumos_bloqueio on lote_insumos;
create trigger lote_insumos_bloqueio
  before insert or update or delete on lote_insumos
  for each row execute function trg_lote_insumos_bloqueio();

-- 22. Só lotes em produção podem ser excluídos
create or replace function trg_lotes_producao_bloqueio_exclusao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'producao' then
    raise exception 'O lote % não pode ser excluído: apenas lotes em produção podem ser excluídos (status: %).',
      old.numero_lote, old.status;
  end if;
  return old;
end $$;

drop trigger if exists lotes_producao_bloqueio_exclusao on lotes_producao;
create trigger lotes_producao_bloqueio_exclusao
  before delete on lotes_producao
  for each row execute function trg_lotes_producao_bloqueio_exclusao();

-- 23. Envase de lote concluído é imutável
create or replace function trg_envases_bloqueio()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_numero text;
begin
  if _bypass_lote_lock() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Permite o ON DELETE SET NULL vindo de produtos_acabados
  if tg_op = 'UPDATE'
     and new.produto_acabado_id is null
     and old.produto_acabado_id is not null
     and (to_jsonb(new) - 'produto_acabado_id') = (to_jsonb(old) - 'produto_acabado_id') then
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select status, numero_lote into v_status, v_numero
    from lotes_producao where id = old.lote_id;
    if found and v_status = 'concluido' then
      raise exception 'O envase do lote % não pode ser alterado: o lote já está concluído.', v_numero;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select status, numero_lote into v_status, v_numero
    from lotes_producao where id = new.lote_id;
    if found and v_status = 'concluido' then
      raise exception 'O envase do lote % não pode ser alterado: o lote já está concluído.', v_numero;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists envases_bloqueio on envases;
create trigger envases_bloqueio
  before insert or update or delete on envases
  for each row execute function trg_envases_bloqueio();


-- Auditoria: no INSERT o usuário vem da sessão; no UPDATE user_id/user_email não mudam
create or replace function trg_auditoria_usuario()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.user_id := auth.uid();
      new.user_email := auth.jwt() ->> 'email';
    end if;
  else
    new.user_id := old.user_id;
    new.user_email := old.user_email;
  end if;
  return new;
end $$;

drop trigger if exists auditoria_usuario on insumo_movimentos;
create trigger auditoria_usuario
  before insert or update on insumo_movimentos
  for each row execute function trg_auditoria_usuario();

drop trigger if exists auditoria_usuario on log_atividades;
create trigger auditoria_usuario
  before insert or update on log_atividades
  for each row execute function trg_auditoria_usuario();

drop trigger if exists auditoria_usuario on produto_retiradas;
create trigger auditoria_usuario
  before insert or update on produto_retiradas
  for each row execute function trg_auditoria_usuario();

drop trigger if exists auditoria_usuario on lotes_producao;
create trigger auditoria_usuario
  before insert or update on lotes_producao
  for each row execute function trg_auditoria_usuario();

drop trigger if exists auditoria_usuario on envases;
create trigger auditoria_usuario
  before insert or update on envases
  for each row execute function trg_auditoria_usuario();


-- ============================================================
-- FASE 6 — Funções atômicas
-- ============================================================

-- 24. Conversão de unidades. Massa <-> volume somente com densidade (g/ml).
create or replace function converter_unidade(
  quantidade numeric,
  de_unidade text,
  para_unidade text,
  densidade numeric default null
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_de   text := upper(trim(de_unidade));
  v_para text := upper(trim(para_unidade));
  v_massa  constant jsonb := '{"KG": 1000, "G": 1}';   -- em gramas
  v_volume constant jsonb := '{"L": 1000, "ML": 1}';   -- em mililitros
begin
  if quantidade is null then
    raise exception 'Quantidade não informada para conversão.';
  end if;
  if v_de is null or v_de not in ('KG', 'G', 'L', 'ML', 'UN', 'PCT') then
    raise exception 'Unidade de origem inválida: %.', coalesce(de_unidade, '(vazia)');
  end if;
  if v_para is null or v_para not in ('KG', 'G', 'L', 'ML', 'UN', 'PCT') then
    raise exception 'Unidade de destino inválida: %.', coalesce(para_unidade, '(vazia)');
  end if;

  if v_de = v_para then
    return quantidade;
  end if;

  if v_massa ? v_de and v_massa ? v_para then
    return quantidade * (v_massa ->> v_de)::numeric / (v_massa ->> v_para)::numeric;
  end if;

  if v_volume ? v_de and v_volume ? v_para then
    return quantidade * (v_volume ->> v_de)::numeric / (v_volume ->> v_para)::numeric;
  end if;

  if (v_massa ? v_de and v_volume ? v_para) or (v_volume ? v_de and v_massa ? v_para) then
    if densidade is null or densidade <= 0 then
      raise exception 'Conversão de % para % exige a densidade do insumo (g/ml), que não está definida.', v_de, v_para;
    end if;
    if v_massa ? v_de then
      -- massa -> gramas -> ml (÷ densidade) -> unidade de volume
      return quantidade * (v_massa ->> v_de)::numeric / densidade / (v_volume ->> v_para)::numeric;
    end if;
    -- volume -> ml -> gramas (× densidade) -> unidade de massa
    return quantidade * (v_volume ->> v_de)::numeric * densidade / (v_massa ->> v_para)::numeric;
  end if;

  raise exception 'Unidades incompatíveis: não é possível converter % para %.', v_de, v_para;
end $$;

-- Interna: bloqueia os insumos de p_req ({insumo_id: quantidade}) e devolve as faltas
create or replace function _calcular_faltas(p_req jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_ids uuid[];
  v_encontrados integer;
  v_faltas jsonb;
begin
  if not _bypass_lote_lock() then
    raise exception 'Função interna: não pode ser chamada diretamente.';
  end if;

  select coalesce(array_agg(k::uuid order by k::uuid), '{}')
    into v_ids
  from jsonb_object_keys(coalesce(p_req, '{}'::jsonb)) as k;

  perform 1 from insumos where id = any(v_ids) order by id for update;

  select count(*) into v_encontrados from insumos where id = any(v_ids);
  if v_encontrados <> coalesce(array_length(v_ids, 1), 0) then
    raise exception 'Um ou mais insumos não foram encontrados.';
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'insumo_id',  i.id,
               'nome',       i.nome,
               'necessario', r.value::numeric,
               'disponivel', i.estoque_atual,
               'unidade',    i.unidade
             ) order by i.nome
           ),
           '[]'::jsonb)
    into v_faltas
  from jsonb_each_text(coalesce(p_req, '{}'::jsonb)) r
  join insumos i on i.id = r.key::uuid
  where r.value::numeric > i.estoque_atual;

  return v_faltas;
end $$;

-- Interna: debita p_req; o que faltar fica em insumo_movimentos.falta
create or replace function _debitar_insumos(
  p_req jsonb,
  p_obs text,
  p_user_id uuid,
  p_user_email text
)
returns void
language plpgsql
set search_path = public
as $$
-- Usuário obtido da sessão (auth.uid() / auth.jwt()); p_user_id e p_user_email são ignorados.
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  r record;
  v_estoque numeric;
  v_debito numeric;
begin
  if not _bypass_lote_lock() then
    raise exception 'Função interna: não pode ser chamada diretamente.';
  end if;

  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;

  for r in
    select key::uuid as insumo_id, value::numeric as qtd
    from jsonb_each_text(coalesce(p_req, '{}'::jsonb))
    order by key::uuid
  loop
    continue when r.qtd <= 0;

    select estoque_atual into v_estoque from insumos where id = r.insumo_id for update;
    if not found then
      raise exception 'Insumo não encontrado.';
    end if;

    v_debito := least(r.qtd, greatest(v_estoque, 0));

    update insumos set estoque_atual = estoque_atual - v_debito where id = r.insumo_id;

    insert into insumo_movimentos (insumo_id, tipo, quantidade, falta, data, obs, user_id, user_email)
    values (r.insumo_id, 'saida', v_debito, nullif(r.qtd - v_debito, 0),
            current_date, p_obs, v_user_id, v_user_email);
  end loop;
end $$;

-- 25. Criar insumo (+ movimento de estoque inicial)
create or replace function criar_insumo(
  p_nome text,
  p_unidade text,
  p_tipo text,
  p_categoria text,
  p_densidade numeric,
  p_estoque_inicial numeric,
  p_estoque_seguranca numeric,
  p_custo_unitario numeric,
  p_custo_unidade text,
  p_user_id uuid,
  p_user_email text
)
returns uuid
language plpgsql
set search_path = public
as $$
-- Usuário obtido da sessão (auth.uid() / auth.jwt()); p_user_id e p_user_email são ignorados.
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_nome    text := nullif(trim(coalesce(p_nome, '')), '');
  v_unidade text := upper(trim(coalesce(p_unidade, '')));
  v_tipo    text := coalesce(nullif(trim(coalesce(p_tipo, '')), ''), 'producao');
  v_estoque numeric := coalesce(p_estoque_inicial, 0);
  v_custo_unitario numeric;
  v_custo_unidade  text;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;

  if v_nome is null then
    raise exception 'O nome do insumo é obrigatório.';
  end if;
  if v_unidade not in ('KG', 'G', 'L', 'ML', 'UN', 'PCT') then
    raise exception 'Unidade inválida: %. Use KG, G, L, ML, UN ou PCT.', coalesce(p_unidade, '(vazia)');
  end if;
  if v_tipo not in ('producao', 'material') then
    raise exception 'Tipo de insumo inválido: %. Use producao ou material.', v_tipo;
  end if;
  if p_densidade is not null and p_densidade <= 0 then
    raise exception 'A densidade deve ser maior que zero.';
  end if;
  if v_estoque < 0 then
    raise exception 'O estoque inicial não pode ser negativo.';
  end if;
  if coalesce(p_estoque_seguranca, 0) < 0 then
    raise exception 'O estoque de segurança não pode ser negativo.';
  end if;
  -- Custos só são aceitos de administradores; para os demais são ignorados
  if is_admin() then
    v_custo_unitario := p_custo_unitario;
    v_custo_unidade  := nullif(trim(coalesce(p_custo_unidade, '')), '');
  end if;
  if v_custo_unitario is not null and v_custo_unitario < 0 then
    raise exception 'O custo unitário não pode ser negativo.';
  end if;

  insert into insumos (nome, unidade, tipo, categoria, densidade, estoque_atual,
                       estoque_seguranca, custo_unitario, custo_unidade)
  values (v_nome, v_unidade, v_tipo, nullif(trim(coalesce(p_categoria, '')), ''),
          p_densidade, v_estoque, coalesce(p_estoque_seguranca, 0),
          v_custo_unitario, v_custo_unidade)
  returning id into v_id;

  if v_custo_unitario is not null or v_custo_unidade is not null then
    insert into insumo_custos (insumo_id, custo_unitario, custo_unidade, updated_at)
    values (v_id, v_custo_unitario, v_custo_unidade, now())
    on conflict (insumo_id) do update set
      custo_unitario = excluded.custo_unitario,
      custo_unidade  = excluded.custo_unidade,
      updated_at     = excluded.updated_at;
  end if;

  if v_estoque > 0 then
    insert into insumo_movimentos (insumo_id, tipo, quantidade, data, obs, user_id, user_email)
    values (v_id, 'ajuste', v_estoque, current_date, 'Estoque inicial', v_user_id, v_user_email);
  end if;

  insert into log_atividades (action, detail, user_id, user_email)
  values ('Novo insumo', v_nome, v_user_id, v_user_email);

  return v_id;
end $$;

-- 26. Criar lote com todos os insumos
create or replace function criar_lote(
  p_formula_id uuid,
  p_numero_lote text,
  p_data_producao date,
  p_fragancia text,
  p_insumos jsonb,
  p_user_id uuid,
  p_user_email text
)
returns uuid
language plpgsql
set search_path = public
as $$
-- Usuário obtido da sessão (auth.uid() / auth.jwt()); p_user_id e p_user_email são ignorados.
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_numero text := nullif(trim(coalesce(p_numero_lote, '')), '');
  v_insumos jsonb := coalesce(p_insumos, '[]'::jsonb);
  v_formula_nome text;
  v_lote_id uuid;
  v_el jsonb;
  v_insumo_id uuid;
  v_insumo_nome text;
  v_insumo_unidade text;
  v_qtd numeric;
  v_unidade text;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;

  if p_formula_id is null then
    raise exception 'A fórmula é obrigatória.';
  end if;
  select nome into v_formula_nome from formulas where id = p_formula_id;
  if not found then
    raise exception 'Fórmula não encontrada.';
  end if;
  if v_numero is null then
    raise exception 'O número do lote é obrigatório.';
  end if;
  if exists (select 1 from lotes_producao where numero_lote = v_numero) then
    raise exception 'Já existe um lote com o número %.', v_numero;
  end if;
  if jsonb_typeof(v_insumos) <> 'array' then
    raise exception 'Formato inválido dos insumos: esperado uma lista.';
  end if;

  insert into lotes_producao (formula_id, numero_lote, data_producao, status, fragancia, user_id, user_email)
  values (p_formula_id, v_numero, coalesce(p_data_producao, current_date), 'producao',
          nullif(trim(coalesce(p_fragancia, '')), ''), v_user_id, v_user_email)
  returning id into v_lote_id;

  perform set_config('app.bypass_lote_lock', 'on', true);

  if jsonb_array_length(v_insumos) = 0 then
    if exists (select 1 from formula_insumos where formula_id = p_formula_id and quantidade <= 0) then
      raise exception 'A fórmula % possui insumo com quantidade menor ou igual a zero.', v_formula_nome;
    end if;
    insert into lote_insumos (lote_id, insumo_id, quantidade, unidade)
    select v_lote_id, insumo_id, quantidade, unidade
    from formula_insumos
    where formula_id = p_formula_id;
  else
    for v_el in select e from jsonb_array_elements(v_insumos) as e loop
      v_insumo_id := nullif(v_el ->> 'insumo_id', '')::uuid;
      if v_insumo_id is null then
        raise exception 'Insumo não informado em um dos itens do lote.';
      end if;

      select nome, unidade into v_insumo_nome, v_insumo_unidade
      from insumos where id = v_insumo_id;
      if not found then
        raise exception 'Insumo não encontrado.';
      end if;

      v_qtd := (v_el ->> 'quantidade')::numeric;
      if v_qtd is null or v_qtd <= 0 then
        raise exception 'Quantidade inválida para o insumo "%": deve ser maior que zero.', v_insumo_nome;
      end if;

      v_unidade := upper(trim(coalesce(nullif(v_el ->> 'unidade', ''), v_insumo_unidade)));
      if v_unidade not in ('KG', 'G', 'L', 'ML', 'UN', 'PCT') then
        raise exception 'Unidade inválida para o insumo "%": %.', v_insumo_nome, v_unidade;
      end if;

      insert into lote_insumos (lote_id, insumo_id, quantidade, unidade)
      values (v_lote_id, v_insumo_id, v_qtd, v_unidade);
    end loop;
  end if;

  insert into log_atividades (action, detail, user_id, user_email)
  values ('Novo lote', format('%s — %s', v_numero, v_formula_nome), v_user_id, v_user_email);

  perform set_config('app.bypass_lote_lock', 'off', true);
  return v_lote_id;
end $$;

-- 27. Produção -> envase: debita os insumos convertidos para a unidade base
create or replace function mover_lote_para_envase(
  p_lote_id uuid,
  p_confirmar_falta boolean,
  p_user_id uuid,
  p_user_email text
)
returns jsonb
language plpgsql
set search_path = public
as $$
-- Usuário obtido da sessão (auth.uid() / auth.jwt()); p_user_id e p_user_email são ignorados.
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_lote lotes_producao%rowtype;
  v_req jsonb := '{}'::jsonb;
  v_faltas jsonb;
  v_qtd numeric;
  r record;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;

  select * into v_lote from lotes_producao where id = p_lote_id for update;
  if not found then
    raise exception 'Lote não encontrado.';
  end if;
  if v_lote.status <> 'producao' then
    raise exception 'O lote % não está em produção (status atual: %).', v_lote.numero_lote, v_lote.status;
  end if;

  perform 1 from insumos
  where id in (select insumo_id from lote_insumos where lote_id = p_lote_id)
  order by id
  for update;

  for r in
    select li.quantidade, li.unidade, i.id as insumo_id, i.nome,
           i.unidade as insumo_unidade, i.densidade
    from lote_insumos li
    join insumos i on i.id = li.insumo_id
    where li.lote_id = p_lote_id
  loop
    if r.quantidade <= 0 then
      raise exception 'Quantidade inválida para o insumo "%" no lote %.', r.nome, v_lote.numero_lote;
    end if;
    begin
      v_qtd := round(converter_unidade(r.quantidade, r.unidade, r.insumo_unidade, r.densidade), 3);
    exception when others then
      raise exception 'Insumo "%": %', r.nome, sqlerrm;
    end;
    v_req := v_req || jsonb_build_object(
      r.insumo_id::text,
      coalesce((v_req ->> r.insumo_id::text)::numeric, 0) + v_qtd
    );
  end loop;

  perform set_config('app.bypass_lote_lock', 'on', true);

  v_faltas := _calcular_faltas(v_req);
  if jsonb_array_length(v_faltas) > 0 and not coalesce(p_confirmar_falta, false) then
    perform set_config('app.bypass_lote_lock', 'off', true);
    return jsonb_build_object('ok', false, 'faltas', v_faltas);
  end if;

  perform _debitar_insumos(v_req, 'Produção lote ' || v_lote.numero_lote, v_user_id, v_user_email);

  insert into log_atividades (action, detail, user_id, user_email)
  values ('Lote para envase', v_lote.numero_lote, v_user_id, v_user_email);

  update lotes_producao set status = 'envase' where id = p_lote_id;

  perform set_config('app.bypass_lote_lock', 'off', true);
  return jsonb_build_object('ok', true);
end $$;

-- 28. Concluir envase: embalagens, produto acabado e status em uma transação
create or replace function concluir_envase(
  p_lote_id uuid,
  p_qtd_200ml integer,
  p_qtd_500ml integer,
  p_qtd_1l integer,
  p_qtd_2l integer,
  p_qtd_5l integer,
  p_qtd_20l integer,
  p_data_envase timestamptz,
  p_produto_acabado_id uuid,
  p_novo_produto_nome text,
  p_embalagens jsonb,
  p_confirmar_falta boolean,
  p_user_id uuid,
  p_user_email text
)
returns jsonb
language plpgsql
set search_path = public
as $$
-- Usuário obtido da sessão (auth.uid() / auth.jwt()); p_user_id e p_user_email são ignorados.
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_lote lotes_producao%rowtype;
  v_produto produtos_acabados%rowtype;
  v_q200 integer := coalesce(p_qtd_200ml, 0);
  v_q500 integer := coalesce(p_qtd_500ml, 0);
  v_q1   integer := coalesce(p_qtd_1l, 0);
  v_q2   integer := coalesce(p_qtd_2l, 0);
  v_q5   integer := coalesce(p_qtd_5l, 0);
  v_q20  integer := coalesce(p_qtd_20l, 0);
  v_total integer;
  v_rendimento numeric;
  v_nome_novo text := nullif(trim(coalesce(p_novo_produto_nome, '')), '');
  v_produto_id uuid;
  v_produto_nome text;
  v_embalagens jsonb := coalesce(p_embalagens, '[]'::jsonb);
  v_req jsonb := '{}'::jsonb;
  v_faltas jsonb;
  v_tam record;
  v_el jsonb;
  v_n integer;
  v_garrafa uuid;
  v_tampa uuid;
  v_alca uuid;
  v_cat text;
  v_nome_ins text;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;

  select * into v_lote from lotes_producao where id = p_lote_id for update;
  if not found then
    raise exception 'Lote não encontrado.';
  end if;
  if v_lote.status <> 'envase' then
    raise exception 'O lote % não está em envase (status atual: %).', v_lote.numero_lote, v_lote.status;
  end if;

  if v_q200 < 0 or v_q500 < 0 or v_q1 < 0 or v_q2 < 0 or v_q5 < 0 or v_q20 < 0 then
    raise exception 'As quantidades envasadas não podem ser negativas.';
  end if;
  v_total := v_q200 + v_q500 + v_q1 + v_q2 + v_q5 + v_q20;
  if v_total = 0 then
    raise exception 'Informe a quantidade envasada de pelo menos um tamanho.';
  end if;
  v_rendimento := v_q200 * 0.2 + v_q500 * 0.5 + v_q1 * 1 + v_q2 * 2 + v_q5 * 5 + v_q20 * 20;

  -- Produto de destino: exatamente um entre existente e novo
  if (p_produto_acabado_id is null) = (v_nome_novo is null) then
    raise exception 'Informe um produto acabado existente ou o nome de um novo produto (exatamente um dos dois).';
  end if;

  if p_produto_acabado_id is not null then
    select * into v_produto from produtos_acabados where id = p_produto_acabado_id for update;
    if not found then
      raise exception 'Produto acabado não encontrado.';
    end if;
    if v_produto.formula_id is not null and v_produto.formula_id <> v_lote.formula_id then
      raise exception 'O produto "%" pertence a outra fórmula e não pode receber o envase do lote %.',
        v_produto.nome, v_lote.numero_lote;
    end if;
    v_produto_nome := v_produto.nome;
  else
    if exists (select 1 from produtos_acabados where lower(trim(nome)) = lower(v_nome_novo)) then
      raise exception 'Já existe um produto com o nome "%". Selecione o produto existente ou escolha outro nome.', v_nome_novo;
    end if;
    v_produto_nome := v_nome_novo;
  end if;

  -- Embalagens
  if jsonb_typeof(v_embalagens) <> 'array' then
    raise exception 'Formato inválido das embalagens: esperado uma lista.';
  end if;
  select count(*) into v_n
  from jsonb_array_elements(v_embalagens) as e
  where upper(trim(coalesce(e ->> 'tamanho', ''))) not in ('200ML', '500ML', '1L', '2L', '5L', '20L');
  if v_n > 0 then
    raise exception 'Tamanho de embalagem inválido. Use 200ML, 500ML, 1L, 2L, 5L ou 20L.';
  end if;

  for v_tam in
    select s.tamanho, s.qtd, s.categoria
    from (values
      ('200ML', v_q200, 'garrafa_200ml'),
      ('500ML', v_q500, 'garrafa_500ml'),
      ('1L',    v_q1,   'garrafa_1l'),
      ('2L',    v_q2,   'garrafa_2l'),
      ('5L',    v_q5,   'garrafa_5l'),
      ('20L',   v_q20,  'garrafa_20l')
    ) as s(tamanho, qtd, categoria)
    where s.qtd > 0
  loop
    select count(*), (array_agg(e))[1] into v_n, v_el
    from jsonb_array_elements(v_embalagens) as e
    where upper(trim(e ->> 'tamanho')) = v_tam.tamanho;

    if v_n = 0 then
      raise exception 'Selecione a garrafa e a tampa para o tamanho %.', v_tam.tamanho;
    elsif v_n > 1 then
      raise exception 'O tamanho % foi informado mais de uma vez nas embalagens.', v_tam.tamanho;
    end if;

    v_garrafa := nullif(v_el ->> 'garrafa_id', '')::uuid;
    v_tampa   := nullif(v_el ->> 'tampa_id', '')::uuid;
    v_alca    := nullif(v_el ->> 'alca_id', '')::uuid;

    if v_garrafa is null then
      raise exception 'Selecione a garrafa para o tamanho %.', v_tam.tamanho;
    end if;
    if v_tampa is null then
      raise exception 'Selecione a tampa para o tamanho %.', v_tam.tamanho;
    end if;

    select categoria, nome into v_cat, v_nome_ins from insumos where id = v_garrafa;
    if not found then
      raise exception 'Garrafa selecionada para o tamanho % não encontrada.', v_tam.tamanho;
    end if;
    if v_cat is distinct from v_tam.categoria then
      raise exception 'O insumo "%" não é uma garrafa de % (categoria: %).',
        v_nome_ins, v_tam.tamanho, coalesce(v_cat, 'sem categoria');
    end if;

    select categoria, nome into v_cat, v_nome_ins from insumos where id = v_tampa;
    if not found then
      raise exception 'Tampa selecionada para o tamanho % não encontrada.', v_tam.tamanho;
    end if;
    if v_cat is distinct from 'tampa' then
      raise exception 'O insumo "%" não é uma tampa (categoria: %).', v_nome_ins, coalesce(v_cat, 'sem categoria');
    end if;

    if v_alca is not null then
      select categoria, nome into v_cat, v_nome_ins from insumos where id = v_alca;
      if not found then
        raise exception 'Alça selecionada para o tamanho % não encontrada.', v_tam.tamanho;
      end if;
      if v_cat is distinct from 'alca' then
        raise exception 'O insumo "%" não é uma alça (categoria: %).', v_nome_ins, coalesce(v_cat, 'sem categoria');
      end if;
    end if;

    -- Soma por insumo entre todos os tamanhos
    v_req := v_req || jsonb_build_object(
      v_garrafa::text, coalesce((v_req ->> v_garrafa::text)::numeric, 0) + v_tam.qtd);
    v_req := v_req || jsonb_build_object(
      v_tampa::text, coalesce((v_req ->> v_tampa::text)::numeric, 0) + v_tam.qtd);
    if v_alca is not null then
      v_req := v_req || jsonb_build_object(
        v_alca::text, coalesce((v_req ->> v_alca::text)::numeric, 0) + v_tam.qtd);
    end if;
  end loop;

  perform set_config('app.bypass_lote_lock', 'on', true);

  v_faltas := _calcular_faltas(v_req);
  if jsonb_array_length(v_faltas) > 0 and not coalesce(p_confirmar_falta, false) then
    perform set_config('app.bypass_lote_lock', 'off', true);
    return jsonb_build_object('ok', false, 'faltas', v_faltas);
  end if;

  -- A partir daqui, escritas

  if p_produto_acabado_id is null then
    insert into produtos_acabados (nome, formula_id, estoque_seguranca,
                                   estoque_200ml, estoque_500ml, estoque_1l,
                                   estoque_2l, estoque_5l, estoque_20l)
    values (v_nome_novo, v_lote.formula_id, 0, 0, 0, 0, 0, 0, 0)
    returning id into v_produto_id;

    insert into log_atividades (action, detail, user_id, user_email)
    values ('Novo produto acabado', v_nome_novo, v_user_id, v_user_email);
  else
    v_produto_id := p_produto_acabado_id;
  end if;

  update produtos_acabados set
    formula_id    = coalesce(formula_id, v_lote.formula_id),
    estoque_200ml = estoque_200ml + v_q200,
    estoque_500ml = estoque_500ml + v_q500,
    estoque_1l    = estoque_1l + v_q1,
    estoque_2l    = estoque_2l + v_q2,
    estoque_5l    = estoque_5l + v_q5,
    estoque_20l   = estoque_20l + v_q20
  where id = v_produto_id;

  insert into envases (lote_id, qtd_200ml, qtd_500ml, qtd_1l, qtd_2l, qtd_5l, qtd_20l,
                       data_envase, rendimento_real, produto_acabado_id, user_id, user_email)
  values (p_lote_id, v_q200, v_q500, v_q1, v_q2, v_q5, v_q20,
          coalesce(p_data_envase, now()), v_rendimento, v_produto_id, v_user_id, v_user_email)
  on conflict (lote_id) do update set
    qtd_200ml          = excluded.qtd_200ml,
    qtd_500ml          = excluded.qtd_500ml,
    qtd_1l             = excluded.qtd_1l,
    qtd_2l             = excluded.qtd_2l,
    qtd_5l             = excluded.qtd_5l,
    qtd_20l            = excluded.qtd_20l,
    data_envase        = excluded.data_envase,
    rendimento_real    = excluded.rendimento_real,
    produto_acabado_id = excluded.produto_acabado_id,
    user_id            = excluded.user_id,
    user_email         = excluded.user_email;

  perform _debitar_insumos(v_req, 'Embalagem envase lote ' || v_lote.numero_lote, v_user_id, v_user_email);

  insert into log_atividades (action, detail, user_id, user_email)
  values ('Envase concluído',
          format('%s — %s UND → %s', v_lote.numero_lote, v_total, v_produto_nome),
          v_user_id, v_user_email);

  update lotes_producao set status = 'concluido' where id = p_lote_id;

  perform set_config('app.bypass_lote_lock', 'off', true);
  return jsonb_build_object('ok', true);
end $$;

-- 29. Criar produto acabado (sem lote)
create or replace function criar_produto_acabado(
  p_nome text,
  p_formula_id uuid,
  p_estoque_200ml integer,
  p_estoque_500ml integer,
  p_estoque_1l integer,
  p_estoque_2l integer,
  p_estoque_5l integer,
  p_estoque_20l integer,
  p_estoque_seguranca integer,
  p_user_id uuid,
  p_user_email text
)
returns uuid
language plpgsql
set search_path = public
as $$
-- Usuário obtido da sessão (auth.uid() / auth.jwt()); p_user_id e p_user_email são ignorados.
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_nome text := nullif(trim(coalesce(p_nome, '')), '');
  v_e200 integer := coalesce(p_estoque_200ml, 0);
  v_e500 integer := coalesce(p_estoque_500ml, 0);
  v_e1   integer := coalesce(p_estoque_1l, 0);
  v_e2   integer := coalesce(p_estoque_2l, 0);
  v_e5   integer := coalesce(p_estoque_5l, 0);
  v_e20  integer := coalesce(p_estoque_20l, 0);
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;

  if v_nome is null then
    raise exception 'O nome do produto é obrigatório.';
  end if;
  if p_formula_id is null then
    raise exception 'A fórmula do produto acabado é obrigatória.';
  end if;
  if not exists (select 1 from formulas where id = p_formula_id) then
    raise exception 'Fórmula não encontrada.';
  end if;
  if v_e200 < 0 or v_e500 < 0 or v_e1 < 0 or v_e2 < 0 or v_e5 < 0 or v_e20 < 0 then
    raise exception 'O estoque inicial não pode ser negativo.';
  end if;
  if coalesce(p_estoque_seguranca, 0) < 0 then
    raise exception 'O estoque de segurança não pode ser negativo.';
  end if;
  if exists (select 1 from produtos_acabados where lower(trim(nome)) = lower(v_nome)) then
    raise exception 'Já existe um produto com o nome "%". Escolha um nome diferente.', v_nome;
  end if;

  insert into produtos_acabados (nome, formula_id, estoque_seguranca,
                                 estoque_200ml, estoque_500ml, estoque_1l,
                                 estoque_2l, estoque_5l, estoque_20l)
  values (v_nome, p_formula_id, coalesce(p_estoque_seguranca, 0),
          v_e200, v_e500, v_e1, v_e2, v_e5, v_e20)
  returning id into v_id;

  insert into log_atividades (action, detail, user_id, user_email)
  values ('Novo produto acabado', v_nome, v_user_id, v_user_email);

  if v_e200 + v_e500 + v_e1 + v_e2 + v_e5 + v_e20 > 0 then
    insert into log_atividades (action, detail, user_id, user_email)
    values ('Estoque inicial',
            format('%s — 200ML: %s, 500ML: %s, 1L: %s, 2L: %s, 5L: %s, 20L: %s',
                   v_nome, v_e200, v_e500, v_e1, v_e2, v_e5, v_e20),
            v_user_id, v_user_email);
  end if;

  return v_id;
end $$;

-- 30. Ajuste de inventário do produto acabado (totais absolutos)
create or replace function ajustar_produto_acabado(
  p_produto_id uuid,
  p_estoque_200ml integer,
  p_estoque_500ml integer,
  p_estoque_1l integer,
  p_estoque_2l integer,
  p_estoque_5l integer,
  p_estoque_20l integer,
  p_obs text,
  p_user_id uuid,
  p_user_email text
)
returns void
language plpgsql
set search_path = public
as $$
-- Usuário obtido da sessão (auth.uid() / auth.jwt()); p_user_id e p_user_email são ignorados.
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_p produtos_acabados%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;
  if not is_admin() then
    raise exception 'Apenas administradores.';
  end if;

  if p_estoque_200ml is null or p_estoque_500ml is null or p_estoque_1l is null
     or p_estoque_2l is null or p_estoque_5l is null or p_estoque_20l is null then
    raise exception 'Informe o total de todos os tamanhos.';
  end if;
  if p_estoque_200ml < 0 or p_estoque_500ml < 0 or p_estoque_1l < 0
     or p_estoque_2l < 0 or p_estoque_5l < 0 or p_estoque_20l < 0 then
    raise exception 'O estoque não pode ser negativo.';
  end if;

  select * into v_p from produtos_acabados where id = p_produto_id for update;
  if not found then
    raise exception 'Produto acabado não encontrado.';
  end if;

  update produtos_acabados set
    estoque_200ml = p_estoque_200ml,
    estoque_500ml = p_estoque_500ml,
    estoque_1l    = p_estoque_1l,
    estoque_2l    = p_estoque_2l,
    estoque_5l    = p_estoque_5l,
    estoque_20l   = p_estoque_20l
  where id = p_produto_id;

  insert into log_atividades (action, detail, user_id, user_email)
  values ('Ajuste de produto acabado',
          format('%s — 200ML: %s→%s, 500ML: %s→%s, 1L: %s→%s, 2L: %s→%s, 5L: %s→%s, 20L: %s→%s%s',
                 v_p.nome,
                 v_p.estoque_200ml, p_estoque_200ml,
                 v_p.estoque_500ml, p_estoque_500ml,
                 v_p.estoque_1l,    p_estoque_1l,
                 v_p.estoque_2l,    p_estoque_2l,
                 v_p.estoque_5l,    p_estoque_5l,
                 v_p.estoque_20l,   p_estoque_20l,
                 coalesce(' — ' || nullif(trim(p_obs), ''), '')),
          v_user_id, v_user_email);
end $$;

-- 31. Retirada de produto acabado
create or replace function registrar_retirada(
  p_produto_id uuid,
  p_qtd_200ml integer,
  p_qtd_500ml integer,
  p_qtd_1l integer,
  p_qtd_2l integer,
  p_qtd_5l integer,
  p_qtd_20l integer,
  p_obs text,
  p_user_id uuid,
  p_user_email text
)
returns uuid
language plpgsql
set search_path = public
as $$
-- Usuário obtido da sessão (auth.uid() / auth.jwt()); p_user_id e p_user_email são ignorados.
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_p produtos_acabados%rowtype;
  v_q200 integer := coalesce(p_qtd_200ml, 0);
  v_q500 integer := coalesce(p_qtd_500ml, 0);
  v_q1   integer := coalesce(p_qtd_1l, 0);
  v_q2   integer := coalesce(p_qtd_2l, 0);
  v_q5   integer := coalesce(p_qtd_5l, 0);
  v_q20  integer := coalesce(p_qtd_20l, 0);
  v_total integer;
  v_id uuid;
  r record;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;

  if v_q200 < 0 or v_q500 < 0 or v_q1 < 0 or v_q2 < 0 or v_q5 < 0 or v_q20 < 0 then
    raise exception 'As quantidades retiradas não podem ser negativas.';
  end if;
  v_total := v_q200 + v_q500 + v_q1 + v_q2 + v_q5 + v_q20;
  if v_total = 0 then
    raise exception 'Informe a quantidade retirada de pelo menos um tamanho.';
  end if;

  select * into v_p from produtos_acabados where id = p_produto_id for update;
  if not found then
    raise exception 'Produto acabado não encontrado.';
  end if;

  for r in
    select * from (values
      ('200ML', v_q200, v_p.estoque_200ml),
      ('500ML', v_q500, v_p.estoque_500ml),
      ('1L',    v_q1,   v_p.estoque_1l),
      ('2L',    v_q2,   v_p.estoque_2l),
      ('5L',    v_q5,   v_p.estoque_5l),
      ('20L',   v_q20,  v_p.estoque_20l)
    ) as s(tamanho, qtd, estoque)
  loop
    if r.qtd > r.estoque then
      raise exception 'Estoque insuficiente de % para "%": disponível %, solicitado %.',
        r.tamanho, v_p.nome, r.estoque, r.qtd;
    end if;
  end loop;

  update produtos_acabados set
    estoque_200ml = estoque_200ml - v_q200,
    estoque_500ml = estoque_500ml - v_q500,
    estoque_1l    = estoque_1l - v_q1,
    estoque_2l    = estoque_2l - v_q2,
    estoque_5l    = estoque_5l - v_q5,
    estoque_20l   = estoque_20l - v_q20
  where id = p_produto_id;

  insert into produto_retiradas (produto_id, quantidade, qtd_200ml, qtd_500ml, qtd_1l, qtd_2l,
                                 qtd_5l, qtd_20l, data_retirada, obs, user_id, user_email)
  values (p_produto_id, v_total, v_q200, v_q500, v_q1, v_q2, v_q5, v_q20,
          current_date, nullif(trim(coalesce(p_obs, '')), ''), v_user_id, v_user_email)
  returning id into v_id;

  insert into log_atividades (action, detail, user_id, user_email)
  values ('Retirada de produto', format('%s — %s UND', v_p.nome, v_total), v_user_id, v_user_email);

  return v_id;
end $$;

-- 32. Entrada de insumo (convertida para a unidade base)
create or replace function registrar_entrada_insumo(
  p_insumo_id uuid,
  p_quantidade numeric,
  p_unidade text,
  p_data date,
  p_obs text,
  p_user_id uuid,
  p_user_email text
)
returns void
language plpgsql
set search_path = public
as $$
-- Usuário obtido da sessão (auth.uid() / auth.jwt()); p_user_id e p_user_email são ignorados.
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_i insumos%rowtype;
  v_unidade text;
  v_qtd numeric;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade da entrada deve ser maior que zero.';
  end if;

  select * into v_i from insumos where id = p_insumo_id for update;
  if not found then
    raise exception 'Insumo não encontrado.';
  end if;

  v_unidade := coalesce(nullif(trim(coalesce(p_unidade, '')), ''), v_i.unidade);
  v_qtd := round(converter_unidade(p_quantidade, v_unidade, v_i.unidade, v_i.densidade), 3);
  if v_qtd <= 0 then
    raise exception 'A quantidade convertida para % é zero. Verifique a unidade informada.', v_i.unidade;
  end if;

  update insumos set estoque_atual = estoque_atual + v_qtd where id = p_insumo_id;

  insert into insumo_movimentos (insumo_id, tipo, quantidade, data, obs, user_id, user_email)
  values (p_insumo_id, 'entrada', v_qtd, coalesce(p_data, current_date),
          nullif(trim(coalesce(p_obs, '')), ''), v_user_id, v_user_email);

  insert into log_atividades (action, detail, user_id, user_email)
  values ('Entrada de insumo',
          format('%s — %s %s', v_i.nome, p_quantidade, upper(trim(v_unidade))),
          v_user_id, v_user_email);
end $$;

-- 33. Ajuste de inventário do insumo (total absoluto)
create or replace function registrar_ajuste_insumo(
  p_insumo_id uuid,
  p_novo_total numeric,
  p_data date,
  p_obs text,
  p_user_id uuid,
  p_user_email text
)
returns void
language plpgsql
set search_path = public
as $$
-- Usuário obtido da sessão (auth.uid() / auth.jwt()); p_user_id e p_user_email são ignorados.
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_i insumos%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;

  if p_novo_total is null or p_novo_total < 0 then
    raise exception 'O novo total do insumo deve ser maior ou igual a zero.';
  end if;

  select * into v_i from insumos where id = p_insumo_id for update;
  if not found then
    raise exception 'Insumo não encontrado.';
  end if;

  update insumos
  set estoque_atual = p_novo_total,
      estoque_estimado = false
  where id = p_insumo_id;

  insert into insumo_movimentos (insumo_id, tipo, quantidade, data, obs, user_id, user_email)
  values (p_insumo_id, 'ajuste', p_novo_total, coalesce(p_data, current_date),
          nullif(trim(coalesce(p_obs, '')), ''), v_user_id, v_user_email);

  insert into log_atividades (action, detail, user_id, user_email)
  values ('Ajuste de insumo',
          format('%s — %s → %s %s', v_i.nome, v_i.estoque_atual, p_novo_total, v_i.unidade),
          v_user_id, v_user_email);
end $$;

-- 34. Confirmar densidade
create or replace function confirmar_densidade(
  p_insumo_id uuid,
  p_densidade numeric,
  p_user_id uuid,
  p_user_email text
)
returns void
language plpgsql
set search_path = public
as $$
-- Usuário obtido da sessão (auth.uid() / auth.jwt()); p_user_id e p_user_email são ignorados.
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_nome text;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;
  if not is_admin() then
    raise exception 'Apenas administradores.';
  end if;

  if p_densidade is null or p_densidade <= 0 then
    raise exception 'A densidade deve ser maior que zero.';
  end if;

  update insumos
  set densidade = p_densidade,
      densidade_confirmada = true
  where id = p_insumo_id
  returning nome into v_nome;
  if not found then
    raise exception 'Insumo não encontrado.';
  end if;

  insert into log_atividades (action, detail, user_id, user_email)
  values ('Densidade confirmada', format('%s — %s g/ml', v_nome, p_densidade), v_user_id, v_user_email);
end $$;


-- ============================================================
-- FASE 7 — Acesso
-- ============================================================

-- 35. Substitui todas as policies das tabelas públicas por acesso só a authenticated
do $$
declare
  t record;
  p record;
begin
  -- insumo_custos fica de fora: tem policy própria só para administradores
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'insumo_custos'
  loop
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t.tablename
    loop
      execute format('drop policy %I on public.%I', p.policyname, t.tablename);
    end loop;

    execute format('alter table public.%I enable row level security', t.tablename);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t.tablename || '_authenticated', t.tablename);
    execute format('revoke all on table public.%I from anon', t.tablename);
  end loop;
end $$;

revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- 36. Funções: somente authenticated
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public grant execute on functions to authenticated;
