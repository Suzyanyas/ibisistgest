import type { PendenciaTipo } from "@/app/actions/dashboard";

export type PendenciaTexto = {
  titulo: string;
  explicacao: string;
  // "Como resolver": 2 a 3 linhas em linguagem simples, para quem não é da área técnica
  comoResolver: string[];
  // Linha extra, mostrada só quando o botão "Isso está certo" está disponível
  seEstaCerto?: string;
  // Texto do botão principal: diz exatamente o que vai acontecer
  botao: string;
};

export const PENDENCIA_TEXTOS: Record<PendenciaTipo, PendenciaTexto> = {
  densidade_a_confirmar: {
    titulo: "Densidade por confirmar",
    explicacao: "A densidade deste insumo foi estimada e ainda ninguém a confirmou.",
    comoResolver: [
      "Densidade é quanto pesa 1 litro do produto. Esse número costuma vir na embalagem ou com o fornecedor.",
      "Na tela que vai abrir, compare com o valor que está no sistema e corrija se for diferente.",
    ],
    seEstaCerto: "Se o valor atual já está correto, mantenha e aperte \"Isso está certo\".",
    botao: "Ir confirmar a densidade",
  },
  estoque_estimado: {
    titulo: "Estoque estimado",
    explicacao: "O estoque deste insumo é um valor estimado e precisa de contagem.",
    comoResolver: [
      "O número que está no sistema é um palpite, ainda não foi contado.",
      "Conte o que existe de verdade na fábrica e digite a quantidade real na tela que vai abrir.",
    ],
    seEstaCerto: "Se o número do sistema já é o real, aperte \"Isso está certo\".",
    botao: "Ir contar o estoque",
  },
  faltas_registadas: {
    titulo: "Falta registrada",
    explicacao: "Faltou material numa produção e o estoque ainda não foi acertado.",
    comoResolver: [
      "Durante uma produção, o sistema precisou de mais material do que tinha no estoque e anotou a diferença.",
      "Veja quanto existe de verdade na fábrica e digite a quantidade real para acertar o estoque.",
    ],
    botao: "Ir acertar o estoque",
  },
  unidade_incompativel: {
    titulo: "Unidade que não bate",
    explicacao: "A fórmula usa uma unidade que não combina com a do estoque deste insumo.",
    comoResolver: [
      "A fórmula mede este insumo de um jeito (por exemplo, em quilos) e o estoque mede de outro (por exemplo, em litros).",
      "Abra a fórmula e troque a unidade desta linha por uma que combine com o estoque.",
      "Se preferir manter as duas, informe a densidade do insumo no estoque para o sistema converter sozinho.",
    ],
    botao: "Ir corrigir a fórmula",
  },
  produto_sem_formula: {
    titulo: "Produto sem fórmula",
    explicacao: "Este produto não está ligado a nenhuma fórmula.",
    comoResolver: [
      "A fórmula é a receita do produto. Sem ela, o sistema não sabe como ele é feito.",
      "Na tela que vai abrir, escolha a fórmula deste produto.",
    ],
    seEstaCerto: "Se for produto de revenda ou de fora da fábrica, aperte \"Isso está certo\".",
    botao: "Ir escolher a fórmula",
  },
  categoria_em_falta: {
    titulo: "Embalagem sem categoria",
    explicacao: "Parece uma embalagem, mas falta indicar o tipo dela no estoque.",
    comoResolver: [
      "O nome lembra uma embalagem (garrafa, tampa ou alça), mas o sistema não sabe de qual tipo ela é.",
      "Na tela que vai abrir, escolha a categoria certa para este item.",
    ],
    seEstaCerto: "Se este item não é uma embalagem, aperte \"Isso está certo\".",
    botao: "Ir escolher a categoria",
  },
  tamanho_sem_garrafa: {
    titulo: "Embalagem não cadastrada",
    explicacao: "Falta cadastrar a garrafa ou a tampa deste tamanho no estoque.",
    comoResolver: [
      "Para dar baixa nas embalagens quando um lote é envasado, o sistema precisa ter esse item cadastrado.",
      "Na tela que vai abrir, cadastre o item. A categoria já vem escolhida para você.",
    ],
    seEstaCerto: "Se a fábrica não usa este tamanho, aperte \"Isso está certo\".",
    botao: "Ir cadastrar a garrafa",
  },
};

// A pendência de tamanho cobre garrafa e tampa; o botão diz qual das duas
export function textoBotao(tipo: PendenciaTipo, itemId: string): string {
  if (tipo === "tamanho_sem_garrafa" && itemId === "tampa") return "Ir cadastrar a tampa";
  return PENDENCIA_TEXTOS[tipo].botao;
}
