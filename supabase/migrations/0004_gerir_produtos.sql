-- ============================================================
-- IBISIST — Migração 0004: Gestão de produtos acabados
-- ============================================================
--
-- Editar, associar fórmula, mesclar, arquivar e excluir produtos acabados
-- (somente administradores). Depende da 0002; independe da 0003.
--
-- Chaves estrangeiras que apontam para produtos_acabados (conforme as migrações):
--   produto_retiradas.produto_id   -> ON DELETE CASCADE  (excluir apaga as retiradas)
--   envases.produto_acabado_id     -> ON DELETE SET NULL (excluir só tira o destino)
-- Se o banco real tiver outras FKs criadas à mão no painel, confira antes de aplicar:
--   select conrelid::regclass, conname, confdeltype
--   from pg_constraint where confrelid = 'public.produtos_acabados'::regclass;
--
-- Funções novas: normalizar_nome, editar_produto_acabado, arquivar_produto_acabado,
--   excluir_produto_acabado, mesclar_produtos.
-- Funções recriadas (só duas mudanças em cada, marcadas com "0004"):
--   criar_produto_acabado, concluir_envase, registrar_retirada.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Coluna ativo (produto arquivado = false)
-- ------------------------------------------------------------
alter table produtos_acabados
  add column if not exists ativo boolean not null default true;

-- ------------------------------------------------------------
-- Nome normalizado: minúsculas, sem espaços nas pontas/duplicados, sem acentos.
-- Sem índice único: duplicatas que diferem só por acento já podem existir.
-- ------------------------------------------------------------
create or replace function normalizar_nome(p_nome text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p_nome, '')),
              'áàâãäéèêëíìîïóòôõöúùûüç',
              'aaaaaeeeeiiiiooooouuuuc'),
    '\s+', ' ', 'g'))
$$;

-- ------------------------------------------------------------
-- Editar produto (nome, estoque de segurança, fórmula). Quantidades NÃO mudam aqui.
-- ------------------------------------------------------------
create or replace function editar_produto_acabado(
  p_id uuid,
  p_nome text,
  p_estoque_seguranca integer,
  p_formula_id uuid,
  p_obs text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_seg integer := coalesce(p_estoque_seguranca, 0);
  v_p produtos_acabados%rowtype;
  v_n integer;
  v_formula_ant text;
  v_formula_nova text;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;
  if not is_admin() then
    raise exception 'Apenas administradores.';
  end if;

  if v_nome is null then
    raise exception 'O nome do produto é obrigatório.';
  end if;
  if v_seg < 0 then
    raise exception 'O estoque mínimo não pode ser negativo.';
  end if;

  select * into v_p from produtos_acabados where id = p_id for update;
  if not found then
    raise exception 'Produto acabado não encontrado.';
  end if;

  if exists (
    select 1 from produtos_acabados
    where id <> p_id and normalizar_nome(nome) = normalizar_nome(v_nome)
  ) then
    raise exception 'Já existe um produto com o nome "%". Escolha um nome diferente.', v_nome;
  end if;

  if p_formula_id is distinct from v_p.formula_id then
    if p_formula_id is null then
      select count(*) into v_n from envases where produto_acabado_id = p_id;
      if v_n > 0 then
        raise exception 'Não é possível remover a fórmula de "%": o produto tem % envase(s) registrado(s).',
          v_p.nome, v_n;
      end if;
    else
      if not exists (select 1 from formulas where id = p_formula_id) then
        raise exception 'Fórmula não encontrada.';
      end if;
      select count(*) into v_n
      from envases e
      join lotes_producao l on l.id = e.lote_id
      where e.produto_acabado_id = p_id
        and l.formula_id <> p_formula_id;
      if v_n > 0 then
        raise exception 'Não é possível usar esta fórmula em "%": % envase(s) do produto vêm de lotes de outra fórmula.',
          v_p.nome, v_n;
      end if;
    end if;
  end if;

  select nome into v_formula_ant from formulas where id = v_p.formula_id;
  select nome into v_formula_nova from formulas where id = p_formula_id;

  update produtos_acabados set
    nome              = v_nome,
    estoque_seguranca = v_seg,
    formula_id        = p_formula_id
  where id = p_id;

  insert into log_atividades (action, detail, user_id, user_email)
  values ('Edição de produto acabado',
          format('nome: "%s"→"%s"; estoque mínimo: %s→%s; fórmula: %s→%s%s',
                 v_p.nome, v_nome,
                 v_p.estoque_seguranca, v_seg,
                 coalesce(v_formula_ant, 'sem fórmula'),
                 coalesce(v_formula_nova, 'sem fórmula'),
                 coalesce(' — ' || nullif(btrim(p_obs), ''), '')),
          v_user_id, v_user_email);

  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- Arquivar / reativar (permitido com estoque; o histórico é mantido)
-- ------------------------------------------------------------
create or replace function arquivar_produto_acabado(
  p_id uuid,
  p_arquivar boolean,
  p_obs text
)
returns jsonb
language plpgsql
set search_path = public
as $$
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
  if p_arquivar is null then
    raise exception 'Informe se o produto deve ser arquivado ou reativado.';
  end if;

  select * into v_p from produtos_acabados where id = p_id for update;
  if not found then
    raise exception 'Produto acabado não encontrado.';
  end if;

  if v_p.ativo = (not p_arquivar) then
    if p_arquivar then
      raise exception 'O produto "%" já está arquivado.', v_p.nome;
    else
      raise exception 'O produto "%" já está ativo.', v_p.nome;
    end if;
  end if;

  update produtos_acabados set ativo = not p_arquivar where id = p_id;

  insert into log_atividades (action, detail, user_id, user_email)
  values (case when p_arquivar then 'Produto acabado arquivado' else 'Produto acabado reativado' end,
          format('%s — estoque: 200ML: %s, 500ML: %s, 1L: %s, 2L: %s, 5L: %s, 20L: %s%s',
                 v_p.nome,
                 v_p.estoque_200ml, v_p.estoque_500ml, v_p.estoque_1l,
                 v_p.estoque_2l, v_p.estoque_5l, v_p.estoque_20l,
                 coalesce(' — ' || nullif(btrim(p_obs), ''), '')),
          v_user_id, v_user_email);

  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- Excluir (permitido com estoque e histórico; o admin responde pela exclusão)
-- ------------------------------------------------------------
create or replace function excluir_produto_acabado(
  p_id uuid,
  p_obs text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_p produtos_acabados%rowtype;
  v_retiradas integer;
  v_envases integer;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;
  if not is_admin() then
    raise exception 'Apenas administradores.';
  end if;

  select * into v_p from produtos_acabados where id = p_id for update;
  if not found then
    raise exception 'Produto acabado não encontrado.';
  end if;

  select count(*) into v_retiradas from produto_retiradas where produto_id = p_id;
  select count(*) into v_envases from envases where produto_acabado_id = p_id;

  -- O registro é gravado ANTES da exclusão, na mesma transação
  insert into log_atividades (action, detail, user_id, user_email)
  values ('Exclusão de produto acabado',
          format('%s — estoque: 200ML: %s, 500ML: %s, 1L: %s, 2L: %s, 5L: %s, 20L: %s; retiradas apagadas: %s; envases que perderam o destino: %s%s',
                 v_p.nome,
                 v_p.estoque_200ml, v_p.estoque_500ml, v_p.estoque_1l,
                 v_p.estoque_2l, v_p.estoque_5l, v_p.estoque_20l,
                 v_retiradas, v_envases,
                 coalesce(' — ' || nullif(btrim(p_obs), ''), '')),
          v_user_id, v_user_email);

  perform set_config('app.bypass_lote_lock', 'on', true);

  -- retiradas: ON DELETE CASCADE; envases: ON DELETE SET NULL
  delete from produtos_acabados where id = p_id;

  perform set_config('app.bypass_lote_lock', 'off', true);
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------
-- Mesclar: p_origem_id desaparece, p_destino_id fica
-- ------------------------------------------------------------
create or replace function mesclar_produtos(
  p_origem_id uuid,
  p_destino_id uuid,
  p_modo text,
  p_obs text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_o produtos_acabados%rowtype;
  v_d produtos_acabados%rowtype;
  v_formula uuid;
  v_somar boolean;
  v_retiradas integer;
  v_envases integer;
  v_n integer;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.';
  end if;
  if not is_admin() then
    raise exception 'Apenas administradores.';
  end if;

  if p_origem_id is null or p_destino_id is null then
    raise exception 'Selecione o produto a remover e o produto que fica.';
  end if;
  if p_origem_id = p_destino_id then
    raise exception 'Escolha dois produtos diferentes para mesclar.';
  end if;
  if p_modo is null or p_modo not in ('somar', 'manter_destino') then
    raise exception 'Modo de mesclagem inválido. Use somar ou manter_destino.';
  end if;
  v_somar := p_modo = 'somar';

  -- Trava os dois produtos sempre na mesma ordem (evita deadlock entre mesclagens cruzadas)
  perform 1 from produtos_acabados
  where id in (p_origem_id, p_destino_id)
  order by id
  for update;

  select * into v_o from produtos_acabados where id = p_origem_id;
  if not found then
    raise exception 'Produto a remover não encontrado.';
  end if;
  select * into v_d from produtos_acabados where id = p_destino_id;
  if not found then
    raise exception 'Produto que fica não encontrado.';
  end if;

  if not v_d.ativo then
    raise exception 'O produto "%" está arquivado. Reative-o antes de mesclar para ele.', v_d.nome;
  end if;

  if v_o.formula_id is not null and v_d.formula_id is not null
     and v_o.formula_id <> v_d.formula_id then
    raise exception 'Os produtos "%" e "%" têm fórmulas diferentes e não podem ser mesclados.',
      v_o.nome, v_d.nome;
  end if;

  v_formula := coalesce(v_d.formula_id, v_o.formula_id);
  if v_formula is not null then
    select count(*) into v_n
    from envases e
    join lotes_producao l on l.id = e.lote_id
    where e.produto_acabado_id in (p_origem_id, p_destino_id)
      and l.formula_id <> v_formula;
    if v_n > 0 then
      raise exception 'Não é possível mesclar: % envase(s) vêm de lotes de outra fórmula.', v_n;
    end if;
  end if;

  select count(*) into v_retiradas from produto_retiradas where produto_id = p_origem_id;
  select count(*) into v_envases from envases where produto_acabado_id = p_origem_id;

  update produtos_acabados set
    estoque_200ml     = estoque_200ml + case when v_somar then v_o.estoque_200ml else 0 end,
    estoque_500ml     = estoque_500ml + case when v_somar then v_o.estoque_500ml else 0 end,
    estoque_1l        = estoque_1l    + case when v_somar then v_o.estoque_1l    else 0 end,
    estoque_2l        = estoque_2l    + case when v_somar then v_o.estoque_2l    else 0 end,
    estoque_5l        = estoque_5l    + case when v_somar then v_o.estoque_5l    else 0 end,
    estoque_20l       = estoque_20l   + case when v_somar then v_o.estoque_20l   else 0 end,
    formula_id        = v_formula,
    lote_id           = coalesce(v_d.lote_id, v_o.lote_id),
    estoque_seguranca = greatest(v_d.estoque_seguranca, v_o.estoque_seguranca)
  where id = p_destino_id;

  perform set_config('app.bypass_lote_lock', 'on', true);

  update produto_retiradas set produto_id = p_destino_id where produto_id = p_origem_id;
  update envases set produto_acabado_id = p_destino_id where produto_acabado_id = p_origem_id;

  -- O produto de origem fica por último, já sem dependentes
  delete from produtos_acabados where id = p_origem_id;

  perform set_config('app.bypass_lote_lock', 'off', true);

  insert into log_atividades (action, detail, user_id, user_email)
  values ('Mesclagem de produtos acabados',
          format('"%s" → "%s" | modo: %s | estoque do removido (%s): 200ML: %s, 500ML: %s, 1L: %s, 2L: %s, 5L: %s, 20L: %s | movidos: %s retirada(s), %s envase(s)%s',
                 v_o.nome, v_d.nome,
                 case when v_somar then 'somar os estoques' else 'manter só o estoque do destino' end,
                 case when v_somar then 'somado' else 'descartado' end,
                 v_o.estoque_200ml, v_o.estoque_500ml, v_o.estoque_1l,
                 v_o.estoque_2l, v_o.estoque_5l, v_o.estoque_20l,
                 v_retiradas, v_envases,
                 coalesce(' — ' || nullif(btrim(p_obs), ''), '')),
          v_user_id, v_user_email);

  return jsonb_build_object(
    'ok', true,
    'modo', p_modo,
    'retiradas_movidas', v_retiradas,
    'envases_movidos', v_envases,
    'estoque_origem', jsonb_build_object(
      '200ML', v_o.estoque_200ml, '500ML', v_o.estoque_500ml, '1L', v_o.estoque_1l,
      '2L', v_o.estoque_2l, '5L', v_o.estoque_5l, '20L', v_o.estoque_20l)
  );
end $$;


-- ------------------------------------------------------------
-- Funções recriadas. Cópia da definição atual (0002); mudanças marcadas com "0004".
-- ------------------------------------------------------------

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
  -- 0004: nome comparado sem acentos/maiúsculas
  if exists (select 1 from produtos_acabados where normalizar_nome(nome) = normalizar_nome(v_nome)) then
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
    -- 0004: produto arquivado não recebe envase
    if not v_produto.ativo then
      raise exception 'O produto "%" está arquivado e não pode receber envase. Reative o produto antes de continuar.',
        v_produto.nome;
    end if;
    if v_produto.formula_id is not null and v_produto.formula_id <> v_lote.formula_id then
      raise exception 'O produto "%" pertence a outra fórmula e não pode receber o envase do lote %.',
        v_produto.nome, v_lote.numero_lote;
    end if;
    v_produto_nome := v_produto.nome;
  else
    -- 0004: nome comparado sem acentos/maiúsculas
    if exists (select 1 from produtos_acabados where normalizar_nome(nome) = normalizar_nome(v_nome_novo)) then
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

  -- 0004: produto arquivado não permite retirada
  if not v_p.ativo then
    raise exception 'O produto "%" está arquivado e não permite retiradas. Reative o produto antes de continuar.',
      v_p.nome;
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


-- Permissões: somente authenticated (igual ao restante do schema)
revoke execute on function normalizar_nome(text) from public, anon;
revoke execute on function editar_produto_acabado(uuid, text, integer, uuid, text) from public, anon;
revoke execute on function arquivar_produto_acabado(uuid, boolean, text) from public, anon;
revoke execute on function excluir_produto_acabado(uuid, text) from public, anon;
revoke execute on function mesclar_produtos(uuid, uuid, text, text) from public, anon;
grant execute on function normalizar_nome(text) to authenticated;
grant execute on function editar_produto_acabado(uuid, text, integer, uuid, text) to authenticated;
grant execute on function arquivar_produto_acabado(uuid, boolean, text) to authenticated;
grant execute on function excluir_produto_acabado(uuid, text) to authenticated;
grant execute on function mesclar_produtos(uuid, uuid, text, text) to authenticated;

commit;
