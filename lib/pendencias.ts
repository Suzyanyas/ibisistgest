import type { PendenciaTipo } from "@/app/actions/dashboard";

export const PENDENCIA_TEXTOS: Record<PendenciaTipo, { titulo: string; explicacao: string }> = {
  densidade_a_confirmar: {
    titulo: "Densidade por confirmar",
    explicacao: "A densidade deste insumo foi estimada e ainda ninguém a confirmou.",
  },
  estoque_estimado: {
    titulo: "Estoque estimado",
    explicacao: "O estoque deste insumo é um valor estimado e precisa de contagem.",
  },
  faltas_registadas: {
    titulo: "Falta registrada",
    explicacao: "Faltou material numa produção e o estoque ainda não foi acertado.",
  },
  unidade_incompativel: {
    titulo: "Unidade que não bate",
    explicacao: "A fórmula usa uma unidade que não combina com a do estoque deste insumo.",
  },
  produto_sem_formula: {
    titulo: "Produto sem fórmula",
    explicacao: "Este produto não está ligado a nenhuma fórmula.",
  },
  categoria_em_falta: {
    titulo: "Embalagem sem categoria",
    explicacao: "Parece uma embalagem, mas falta indicar o tipo dela no estoque.",
  },
  tamanho_sem_garrafa: {
    titulo: "Embalagem não cadastrada",
    explicacao: "Falta cadastrar a garrafa ou a tampa deste tamanho no estoque.",
  },
};
