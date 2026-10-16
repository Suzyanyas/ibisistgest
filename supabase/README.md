# supabase/

Ordem e situação dos arquivos do banco. O banco de produção é a fonte da verdade; estes
arquivos documentam como ele chegou ao estado atual.

| Ordem | Arquivo | Situação |
|-------|---------|----------|
| 1 | `migrations/0001_init.sql` | **Desatualizado.** Schema de 2026-09-10; não reproduz o banco real. |
| 2 | `migrations/0001a_baseline_nota.md` | Nota (não é SQL): lista as alterações feitas manualmente no painel antes da 0002. Itens marcados "reconstruído, confirmar". |
| 3 | `migrations/0002_integridade_estoque.sql` | **Aplicada em 2026-10-11.** |
| 4 | `migrations/0003_remover_custos_insumos.sql` | **NÃO aplicada.** Só executar quando todo o código ler e gravar custos em `insumo_custos`; ver a lista no cabeçalho do arquivo. |
| — | `historico/` | Registros de correções de dados já feitas. **Não reexecutar.** |

## historico/

- `2026-10-11_correcao_dados.sql` — correção de dados aplicada junto da 0002 (produto
  duplicado, créditos de estoque, estornos de embalagem, unidades de fórmulas, limpeza de
  `embalagem_config`). Todo o conteúdo está comentado e o arquivo aborta se for executado.

## Regras

- Não editar migrações já aplicadas; mudanças novas entram como novos arquivos numerados.
- `types/supabase.ts` é gerado; regenerar depois de aplicar uma migração.
