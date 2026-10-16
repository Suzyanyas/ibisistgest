-- ============================================================================
-- ███  NÃO EXECUTAR NOVAMENTE  /  DO NOT RE-RUN  ███
-- ============================================================================
-- REGISTRO HISTÓRICO da correção de dados aplicada em 2026-10-11 no banco de
-- produção (auditoria de 11/10), junto da migração 0002. Serve apenas para
-- consulta e auditoria.
--
-- * Todos os comandos abaixo estão COMENTADOS de propósito.
-- * Rodar de novo duplicaria créditos de estoque, movimentos e logs.
-- * Os itens 1 e 5 trazem o SQL exato executado. Nos itens 2, 3, 4 e 6 só há
--   a descrição do que foi feito: o texto SQL exato não foi registrado aqui.
-- ============================================================================

do $$
begin
  raise exception 'Arquivo histórico (2026-10-11_correcao_dados.sql): NÃO EXECUTAR.';
end $$;


-- ----------------------------------------------------------------------------
-- 0. Limpeza de embalagem_config
-- ----------------------------------------------------------------------------
-- delete from embalagem_config;


-- ----------------------------------------------------------------------------
-- 1. Unidades nas fórmulas
-- ----------------------------------------------------------------------------
-- update formula_insumos fi set unidade = 'G'
--   from formulas f, insumos i
--  where fi.formula_id = f.id and fi.insumo_id = i.id
--    and f.nome = 'XISPA SUJEIRA MARINE'
--    and i.nome in ('Barrilha','Metassilicato','Soda Cáustica 99%')
--    and upper(fi.unidade) = 'KG';
--
-- update formula_insumos fi set unidade = 'ML'
--   from formulas f, insumos i
--  where fi.formula_id = f.id and fi.insumo_id = i.id
--    and f.nome = 'ANTIBAC SEDUÇÃO'
--    and i.nome in ('ALCOOL','RENEX')
--    and upper(fi.unidade) in ('L','KG');


-- ----------------------------------------------------------------------------
-- 2. Unidades nos insumos dos lotes (lote_insumos)
-- ----------------------------------------------------------------------------
-- Corrigidas para G as linhas dos lotes XPM001 e XPM002 de Barrilha,
-- Metassilicato e Soda Cáustica 99% que estavam em KG.
-- Corrigidas para ML as linhas do lote AS001 de ALCOOL e RENEX que estavam
-- em L ou KG.


-- ----------------------------------------------------------------------------
-- 3. Estoques de insumos definidos (somente onde estoque_atual = 0)
-- ----------------------------------------------------------------------------
-- Barrilha            -> 4.215
-- Soda Cáustica 99%   -> 373.66
-- ALCOOL              -> 4.465
-- Conservante         -> 2.628
-- Goma                -> 18.298
-- Cada ajuste gerou um insumo_movimentos tipo 'ajuste' com obs
-- 'Correção auditoria 11/10: estimado, confirmar contagem'.


-- ----------------------------------------------------------------------------
-- 4. Estorno de embalagens
-- ----------------------------------------------------------------------------
-- GARRAFA 5L CRISTAL        +74
-- TAMPA GARRAFA CRISTAL 5L  +74
-- GARRAFA CRISTAL 2L        +2
-- TAMPA PET                 +2
-- Cada estorno gerou um insumo_movimentos tipo 'ajuste' com obs
-- 'Correção auditoria 11/10: estorno de débito repetido no lote OD001'.


-- ----------------------------------------------------------------------------
-- 5. Produtos acabados
-- ----------------------------------------------------------------------------
-- Duplicado ODORIZANTE STYLUS removido, apenas se não houvesse retiradas:
-- delete from produtos_acabados
--  where id = 'cd520c91-0160-4a6d-96b2-5029b48e2d24'
--    and not exists (
--      select 1 from produto_retiradas
--       where produto_id = 'cd520c91-0160-4a6d-96b2-5029b48e2d24'
--    );
--
-- Crédito de +37 UND de 5L e vínculo com a fórmula:
-- update produtos_acabados
--    set estoque_5l    = estoque_5l + 37,
--        estoque_atual = estoque_atual + 37,
--        formula_id    = '95591d00-811c-4626-9460-a732a074f5a6'
--  where id = 'f51e8f04-3988-4b1e-9a52-bb473da5028f';


-- ----------------------------------------------------------------------------
-- 6. Histórico
-- ----------------------------------------------------------------------------
-- Cinco linhas em log_atividades com action 'Correção auditoria'.
