-- ============================================================
-- IBISIST — Migração 0003: Remove os custos da tabela insumos
-- ============================================================
--
--   ███  NÃO EXECUTAR AINDA  ███
--
-- Só execute quando TODO o código abaixo já ler e gravar custos em
-- insumo_custos (e não mais em insumos.custo_unitario / custo_unidade):
--
--   app/actions/insumos.ts
--     - InsumoWithFlag (tipo declara custo_unitario)
--     - createInsumo        -> chamar criar_insumo
--     - updateCustoInsumo   -> gravar em insumo_custos
--     - updateInsumo        -> parar de gravar custo em insumos
--   app/actions/formulas.ts
--     - FormulaInsumoRow / getFormulaWithInsumos  (select insumos(custo_unitario, custo_unidade))
--     - getFormulaCusto                            (select insumos(custo_unitario))
--   app/(app)/estoque-insumos/EstoqueInsumosClient.tsx  (exibe e edita custo)
--   app/(app)/formulas/FormulasClient.tsx               (custo da fórmula e edição inline)
--   types/supabase.ts                                   (regenerar)
--
-- Enquanto updateCustoInsumo e updateInsumo gravarem só em insumos, os
-- valores divergem de insumo_custos e a verificação abaixo aborta.
--
-- Esta migração também recria criar_insumo: a versão da 0002 grava
-- custo_unitario/custo_unidade em insumos e falharia sem essas colunas.
-- ============================================================


-- (a) Todo custo em insumos precisa existir, com o mesmo valor, em insumo_custos
do $$
declare
  v_n integer;
  v_nomes text;
begin
  select count(*), string_agg(i.nome, ', ' order by i.nome)
    into v_n, v_nomes
  from insumos i
  left join insumo_custos c on c.insumo_id = i.id
  where (i.custo_unitario is not null or i.custo_unidade is not null)
    and (c.insumo_id is null
         or c.custo_unitario is distinct from i.custo_unitario
         or c.custo_unidade  is distinct from i.custo_unidade);
  if v_n > 0 then
    raise exception '0003 abortada: % insumo(s) com custo em insumos sem correspondência em insumo_custos: %.',
      v_n, v_nomes;
  end if;
end $$;


-- (b) Remove as colunas de custo de insumos
alter table insumos drop column if exists custo_unitario;
alter table insumos drop column if exists custo_unidade;


-- criar_insumo sem as colunas de custo em insumos (custos só em insumo_custos)
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
                       estoque_seguranca)
  values (v_nome, v_unidade, v_tipo, nullif(trim(coalesce(p_categoria, '')), ''),
          p_densidade, v_estoque, coalesce(p_estoque_seguranca, 0))
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
