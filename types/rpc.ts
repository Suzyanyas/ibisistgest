// Formatos dos resultados Json das funções RPC (supabase/migrations/0002_integridade_estoque.sql)

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
