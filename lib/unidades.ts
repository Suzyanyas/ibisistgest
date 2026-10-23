// Unidades e conversões usadas no cliente. Espelha a função converter_unidade da base
// (supabase/migrations/0002); serve só para pré-visualizações e avisos, nunca como fonte de verdade.

export const INSUMO_UNIDADES = ["KG", "L", "G", "ML", "PCT", "UN"];

const MASSA: Record<string, number> = { KG: 1000, G: 1 }; // em gramas
const VOLUME: Record<string, number> = { L: 1000, ML: 1 }; // em ml

export function getUnidadesCompativeis(
  insumoUnidade: string,
  densidade?: number | null
): string[] {
  const u = insumoUnidade.toUpperCase();
  if (densidade != null && (u in MASSA || u in VOLUME)) return ["KG", "G", "L", "ML"];
  if (u === "KG" || u === "G") return ["KG", "G"];
  if (u === "L" || u === "ML") return ["L", "ML"];
  if (u === "UN") return ["UN"];
  if (u === "PCT") return ["PCT"];
  return INSUMO_UNIDADES;
}

// null quando a conversão é impossível
export function converterUnidade(
  quantidade: number,
  de: string,
  para: string,
  densidade?: number | null
): number | null {
  const d = de.trim().toUpperCase();
  const p = para.trim().toUpperCase();
  if (d === p) return quantidade;
  if (d in MASSA && p in MASSA) return (quantidade * MASSA[d]) / MASSA[p];
  if (d in VOLUME && p in VOLUME) return (quantidade * VOLUME[d]) / VOLUME[p];
  const massaParaVolume = d in MASSA && p in VOLUME;
  const volumeParaMassa = d in VOLUME && p in MASSA;
  if (massaParaVolume || volumeParaMassa) {
    if (densidade == null || densidade <= 0) return null;
    // gramas = ml x densidade
    if (massaParaVolume) return (quantidade * MASSA[d]) / densidade / VOLUME[p];
    return (quantidade * VOLUME[d] * densidade) / MASSA[p];
  }
  return null;
}

// A conversão exige densidade quando mistura massa (KG, G) e volume (L, ML)
export function exigeDensidade(de: string, para: string): boolean {
  const d = de.trim().toUpperCase();
  const p = para.trim().toUpperCase();
  return (d in MASSA && p in VOLUME) || (d in VOLUME && p in MASSA);
}

export type CustoLinha = {
  // Custo da linha; 0 quando não foi possível calcular (veja aviso)
  custo: number;
  // null quando o custo foi calculado; senão o motivo, para exibir na linha
  aviso: string | null;
};

// Custo de uma linha de fórmula: quantidade (na unidade da fórmula) convertida para a
// unidade em que o custo do insumo é informado, usando a mesma conversão do estoque
// (converterUnidade / converter_unidade da base). Ex.: 1 KG de insumo com custo por L e
// densidade 0,9 g/ml = 1000 g / 0,9 = 1,111 L; a 3,00/L custa 3,33.
export function calcularCustoLinha(
  quantidade: number,
  unidadeFormula: string,
  custoUnitario: number | null | undefined,
  custoUnidade: string | null | undefined,
  densidade?: number | null
): CustoLinha {
  if (!custoUnidade || custoUnitario == null || Number(custoUnitario) <= 0) {
    return { custo: 0, aviso: "custo não definido" };
  }
  const convertida = converterUnidade(quantidade, unidadeFormula, custoUnidade, densidade);
  if (convertida === null) {
    return {
      custo: 0,
      aviso: exigeDensidade(unidadeFormula, custoUnidade)
        ? "densidade necessária"
        : "unidade incompatível",
    };
  }
  return { custo: convertida * Number(custoUnitario), aviso: null };
}

export function unidadeIncompativel(
  unidade: string,
  unidadeBase: string,
  densidade?: number | null
): boolean {
  return (
    !getUnidadesCompativeis(unidadeBase, densidade).includes(unidade.toUpperCase()) ||
    converterUnidade(1, unidade, unidadeBase, densidade) === null
  );
}
