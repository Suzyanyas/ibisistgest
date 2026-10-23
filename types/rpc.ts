// Formatos dos resultados Json das funções RPC (supabase/migrations/0002_integridade_estoque.sql
// e 0004_gerir_produtos.sql)

// Item de "faltas" devolvido por mover_lote_para_envase e concluir_envase
export type FaltaItem = {
  insumo_id: string;
  nome: string;
  necessario: number;
  disponivel: number;
  unidade: string;
};

// Resultado de mover_lote_para_envase e concluir_envase
export type RpcResultadoFalta =
  | { ok: true }
  | { ok: false; faltas: FaltaItem[] };

// Resultados de editar_produto_acabado, arquivar_produto_acabado e excluir_produto_acabado
// (supabase/migrations/0004_gerir_produtos.sql)
export type RpcResultadoOk = { ok: true };

// Resultado de mesclar_produtos
export type RpcResultadoMesclar = {
  ok: true;
  modo: "somar" | "manter_destino";
  retiradas_movidas: number;
  envases_movidos: number;
  estoque_origem: Record<"200ML" | "500ML" | "1L" | "2L" | "5L" | "20L", number>;
};
