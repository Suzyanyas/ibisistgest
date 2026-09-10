-- ============================================================
-- IBISIST — Migração 0001: Schema inicial
-- ============================================================

-- INSUMOS (matérias-primas)
create table insumos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade text not null default 'KG', -- KG, L, G, ML, PCT, UN
  estoque_atual numeric(10,3) not null default 0,
  estoque_seguranca numeric(10,3) not null default 0,
  created_at timestamptz default now()
);

-- MOVIMENTOS DE INSUMO (entradas, saídas, ajustes)
create table insumo_movimentos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references insumos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste')),
  quantidade numeric(10,3) not null,
  data date not null default current_date,
  obs text,
  created_at timestamptz default now()
);

-- FÓRMULAS
create table formulas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sigla text not null unique,
  rendimento numeric(10,3) not null,
  rendimento_unidade text not null default 'L',
  obs text,
  created_at timestamptz default now()
);

-- INSUMOS DA FÓRMULA
create table formula_insumos (
  id uuid primary key default gen_random_uuid(),
  formula_id uuid not null references formulas(id) on delete cascade,
  insumo_id uuid not null references insumos(id) on delete restrict,
  quantidade numeric(10,3) not null,
  unidade text not null
);

-- LOTES DE PRODUÇÃO
create table lotes_producao (
  id uuid primary key default gen_random_uuid(),
  formula_id uuid not null references formulas(id) on delete restrict,
  numero_lote text not null unique,
  data_producao date not null default current_date,
  status text not null default 'producao' check (status in ('producao', 'envase', 'concluido')),
  created_at timestamptz default now()
);

-- INSUMOS USADOS NO LOTE
create table lote_insumos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes_producao(id) on delete cascade,
  insumo_id uuid not null references insumos(id) on delete restrict,
  quantidade numeric(10,3) not null,
  unidade text not null
);

-- ENVASES
create table envases (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes_producao(id) on delete cascade,
  qtd_1l integer not null default 0,
  qtd_2l integer not null default 0,
  qtd_5l integer not null default 0,
  qtd_20l integer not null default 0,
  data_envase date not null default current_date,
  created_at timestamptz default now()
);

-- PRODUTOS ACABADOS
create table produtos_acabados (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  lote_id uuid references lotes_producao(id) on delete set null,
  estoque_atual integer not null default 0,
  estoque_seguranca integer not null default 0,
  created_at timestamptz default now()
);

-- RETIRADAS DE PRODUTO ACABADO
create table produto_retiradas (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos_acabados(id) on delete cascade,
  quantidade integer not null,
  data_retirada date not null default current_date,
  obs text,
  created_at timestamptz default now()
);

-- AGENDA DE PRODUÇÃO
create table agenda_producao (
  id uuid primary key default gen_random_uuid(),
  formula_id uuid not null references formulas(id) on delete cascade,
  data_agenda date not null default current_date,
  concluido boolean not null default false,
  created_at timestamptz default now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
create index on insumo_movimentos(insumo_id);
create index on insumo_movimentos(data);
create index on formula_insumos(formula_id);
create index on lote_insumos(lote_id);
create index on lotes_producao(status);
create index on lotes_producao(data_producao);
create index on produto_retiradas(produto_id);
create index on produto_retiradas(data_retirada);
create index on agenda_producao(data_agenda);
create index on agenda_producao(concluido);

-- ============================================================
-- SEED — Insumos iniciais (baseado nos mockups da Pamella)
-- ============================================================
insert into insumos (nome, unidade, estoque_atual, estoque_seguranca) values
  ('Lauril Pasta', 'KG', 25, 5),
  ('Soda Cáustica 99%', 'KG', 25, 10),
  ('Metassilicato', 'KG', 9, 5),
  ('Tripolifosfato', 'KG', 0, 5),
  ('Lincap 4010', 'KG', 60, 10),
  ('Ácido Sulfônico', 'KG', 170, 50),
  ('Hipoclorito de Sódio', 'L', 15, 5),
  ('Barrilha', 'KG', 21, 5),
  ('Corante Metanil', 'KG', 15, 25),
  ('Goma', 'KG', 12, 5),
  ('Sal', 'KG', 0, 5),
  ('Corante', 'G', 0, 100),
  ('Conservante', 'ML', 0, 500),
  ('Essência', 'ML', 0, 500);

-- ============================================================
-- SEED — Fórmula Limpa Baú (exemplo)
-- ============================================================
with f as (
  insert into formulas (nome, sigla, rendimento, rendimento_unidade)
  values ('Limpa Baú', 'LPB', 170, 'L')
  returning id
),
i_acido as (select id from insumos where nome = 'Ácido Sulfônico'),
i_lincap as (select id from insumos where nome = 'Lincap 4010'),
i_goma as (select id from insumos where nome = 'Goma'),
i_sal as (select id from insumos where nome = 'Sal'),
i_corante as (select id from insumos where nome = 'Corante'),
i_conservante as (select id from insumos where nome = 'Conservante')
insert into formula_insumos (formula_id, insumo_id, quantidade, unidade)
select f.id, i_acido.id, 6.5, 'KG' from f, i_acido union all
select f.id, i_lincap.id, 6.5, 'KG' from f, i_lincap union all
select f.id, i_goma.id, 800, 'G' from f, i_goma union all
select f.id, i_sal.id, 2, 'KG' from f, i_sal union all
select f.id, i_corante.id, 50, 'G' from f, i_corante union all
select f.id, i_conservante.id, 75, 'ML' from f, i_conservante;