# 0001a — Nota sobre o baseline (0001_init.sql está desatualizado)

`0001_init.sql` descreve só o schema de 2026-09-10 (commit `bee3dee`). Entre essa data e a
migração `0002_integridade_estoque.sql` (aplicada em 2026-10-11) o banco real recebeu várias
alterações feitas **manualmente no painel do Supabase**, sem arquivo de migração. Rodar o
`0001` sozinho NÃO reproduz o banco real, e o `0002` assume que essas alterações já existem
(por exemplo, referencia `produtos_acabados.estoque_1l` e `log_atividades`).

Este arquivo é só documentação. Não é SQL executável e não altera nenhuma migração existente.

## Como foi reconstruído

- Diferenças das colunas `Row` em `types/supabase.ts` entre os commits (o arquivo é UTF-16;
  decodificar antes de comparar).
- Código da aplicação (por exemplo, o SQL em comentário no topo de `app/actions/dashboard.ts`).
- Os tipos exatos, defaults, constraints, índices e políticas RLS **não** aparecem nos tipos
  gerados. Foram deduzidos e precisam ser conferidos no painel (Table Editor / SQL Editor).

Todos os itens abaixo estão marcados **reconstruído, confirmar**.

## Alterações manuais anteriores ao 0002

| # | Alteração | Origem (commit, data) | Situação |
|---|-----------|-----------------------|----------|
| 1 | `insumos.custo_unitario` (numérico, nulo) | `1034c9b`, 2026-09-20 | reconstruído, confirmar |
| 2 | `envases.rendimento_real` (numérico, nulo) | `4747452`, 2026-09-20 | reconstruído, confirmar |
| 3 | `lotes_producao.fragancia` (texto, nulo) | `064dd12`, 2026-09-27 | reconstruído, confirmar |
| 4 | `produto_retiradas.qtd_1l`, `qtd_2l`, `qtd_5l`, `qtd_20l` (inteiro, não nulo, provável default 0) | `064dd12`, 2026-09-27 | reconstruído, confirmar |
| 5 | `produtos_acabados.estoque_1l`, `estoque_2l`, `estoque_5l`, `estoque_20l` (inteiro, não nulo, provável default 0) | `064dd12`, 2026-09-27 | reconstruído, confirmar |
| 6 | Tabela `embalagem_config` (`id`, `tamanho`, `insumo_id` nulo, `created_at`) | `7892277`, 2026-10-02 | reconstruído, confirmar |
| 7 | `insumos.custo_unidade` (texto, nulo) | `7892277`, 2026-10-02 | reconstruído, confirmar |
| 8 | `insumos.tipo` (texto, não nulo; valores usados no código: `producao`, `material`) | `7892277`, 2026-10-02 | reconstruído, confirmar |
| 9 | `insumos.categoria` (texto, nulo; valores no código: `garrafa_200ml`, `garrafa_500ml`, `garrafa_1l`, `garrafa_2l`, `garrafa_5l`, `garrafa_20l`, `tampa`, `alca`) | `069077c`, 2026-10-04 | reconstruído, confirmar |
| 10 | Tabela `log_atividades` (`id`, `action`, `detail`, `user_id` → `auth.users` com `on delete set null`, `user_email`, `created_at`); RLS ativado com política `allow_all_log_atividades` | `069077c`, 2026-10-04; SQL em comentário no topo de `app/actions/dashboard.ts` | reconstruído, confirmar |
| 11 | `user_id` e `user_email` em `envases`, `insumo_movimentos`, `lotes_producao` e `produto_retiradas` (ambos nulos) | `069077c`, 2026-10-04 | reconstruído, confirmar |
| 12 | `produtos_acabados.formula_id` (uuid, nulo; referência provável a `formulas`) | `4895a9c`, 2026-10-07 | reconstruído, confirmar |

Observações:

- Os itens 1, 7 (colunas de custo em `insumos`) são os que a `0003_remover_custos_insumos.sql`
  remove depois que o código passar a usar `insumo_custos` (criada na 0002).
- O item 6 (`embalagem_config`) é mantido pela 0002; o código antigo que a usava foi removido
  da aplicação, e a correção de dados de 2026-10-11 apagou o conteúdo da tabela (ver
  `supabase/historico/2026-10-11_correcao_dados.sql`).
- Não estão aqui as colunas e tabelas criadas pela própria 0002 (`qtd_200ml`/`qtd_500ml`,
  `estoque_200ml`/`estoque_500ml`, `densidade`, `densidade_confirmada`, `estoque_estimado`,
  `insumo_movimentos.falta`, `envases.produto_acabado_id`, `insumo_custos` e as funções
  `rpc`). Elas aparecem em `types/supabase.ts` a partir do commit `60f3824`.

## O que fazer para fechar este baseline

1. Conferir cada item acima no painel do Supabase (tipo, default, not null, FK, RLS).
2. Se o projeto precisar ser recriado do zero, gerar um dump do schema real
   (`supabase db dump --schema public`) e usá-lo como novo baseline, em vez de depender do
   `0001`.
